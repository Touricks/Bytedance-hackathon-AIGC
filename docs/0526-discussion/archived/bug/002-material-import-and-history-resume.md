# Bug 002: 目录选择后的素材导入与历史恢复体验

## 用户反馈

点击“选择目录”后，下一步导入体验很丑：

1. render 输出信息过多，只需要保留文件夹下符合要求的文件：小于 50M 的图片、视频、文字。
2. 用户希望在前端选择要导入到系统的文件，并高亮展示，而不是全量导入。
3. 用户希望选择之前已经创建过线程的历史目录时，能够通过 `.daireel` 中的 id 反向索引数据库并恢复已经决策的内容。
4. 用户希望能够删除之前添加到系统的素材。
5. 删除已添加素材时，0-1-2-3-4 链路中的临时文件/中间产物应自动失效，但已生成的视频文件应永久保存。
6. 生成的视频应全部下载到 `.daireel`，使用 `jobId` 作为 tag，并把 `jobId` 与时间戳同步到 PostgreSQL。

## 当前代码事实

- `status()` 会调用 `collectWorkspaceMaterialLibrary(localPath)`，扫描目录下全部合规/拒绝素材并直接返回 `materialLibrary`。
- 前端 `MaterialLibraryPreview` 会展示 usable/rejected 计数，并把前 6 个 usable 文件和前 3 个 rejected 文件渲染为 chip。
- 当前导入动作仍是 `<input type="file" multiple>`，将用户选择的外部文件复制到当前 workspace 目录；没有“从当前目录扫描结果中勾选导入”的状态模型。
- 打开目录时会执行 `initializeWorkspace(directory)`，如果该路径已在 Postgres 中存在，会复用 workspace row 并写 `.daireel/workspace.json`。
- `status()` 目前只返回 workspace、manifest、nextAction、materialLibrary；不会返回已存在的 workspace artifacts，因此前端无法自动恢复已决策的 brief/storyboard/shotprompt。

## 问题判断

这里混在一起的是三个独立但相关的 bug：

1. 素材扫描结果和 UI 展示粒度不匹配：后端应该提供干净的候选素材列表，前端默认只展示符合要求的文件；拒绝项应折叠或仅在调试区域展示。
2. “扫描目录素材”和“导入到生成系统”缺少中间选择态：用户需要先看到候选素材，再决定哪些纳入本次 material intake。
3. 历史目录恢复只恢复了 workspace identity，没有 hydrate artifacts：`.daireel` 已经提供 workspaceId/scriptId，系统应据此从数据库取回已决策内容并填回四步骤 UI。
4. 素材进入系统后缺少生命周期操作：一旦复制到 `.daireel/materials/`，用户需要能从系统素材集中移除之前添加的素材。
5. 当前视频资产只以 `asset.url` + `generation_job.final_asset_id` 表示；真实 Seedance URL 目前会直接入库为 final video URL，没有形成 workspace-local 的 `.daireel` 视频归档。

## 推荐修复方向

### A. 素材候选清单

- `status()` 返回 `materialCandidates` 或复用 `materialLibrary.assets`，但前端默认只渲染合规文件。
- rejected 文件默认不展示在主路径，只显示一个“有 N 个文件被忽略”的折叠入口。
- 文件行只显示必要信息：文件名、类型、大小、是否已选择。

### B. 用户选择后再纳入系统

- 增加前端 `selectedMaterialRefs: string[]`。
- 目录扫描后默认可全选合规文件，但用户能取消选择。
- `material-intake` 请求需要携带 `selectedRefs`，后端只把这些 refs 编入 assets artifact。
- 高亮展示已选择文件，未选择文件保持候选态。

### C. 历史目录恢复

- `status()` 增加 `artifacts` 字段，按 workspaceId 返回已存在的 assets/brief/storyboard/shotprompt artifact。
- 前端 `refreshStatus()` 收到 artifacts 后填充 `material/brief/storyboard/shotPrompt` state。
- `.daireel/workspace.json` 中 workspaceId/scriptId 与 Postgres 不匹配时继续报 integrity error。

### D. 删除已添加素材

- 前端在“系统素材”列表中为每个已导入素材提供删除动作。
- 删除动作只作用于 `.daireel/materials/` 中的系统素材，不删除用户原始目录里的文件。
- 删除后需要更新 material intake artifact 或将其标记为 stale，避免后续 builder 继续引用已删除素材。
- 如果被删除素材已经被 brief/storyboard/shotprompt 引用，需要提示会影响后续已决策内容，并把相关 artifact 状态回退或标记 stale。
- 删除素材会让 0-1-2-3-4 链路中的临时文件和中间 artifacts 自动失效，但不删除已完成的视频归档。

### E. 视频永久归档

- 视频生成完成后，服务端下载 provider 返回的视频到 `.daireel/videos/`。
- 文件命名应包含 `jobId` 和时间戳，例如 `.daireel/videos/{timestamp}-{jobId}.mp4`。
- PostgreSQL 需要保存视频归档记录，至少包括 `workspaceId`、`scriptId`、`jobId`、本地归档路径、provider 原始 URL、createdAt。
- `generation_job.final_asset_id` 继续指向最终视频 asset，但该 asset 的 URL 应优先指向本地 Fastify 可服务的 `.daireel/videos` 路径。
- 删除素材或重跑 0-4 链路不得删除 `.daireel/videos/` 中的已完成视频。

## 已确认决策 1: 系统素材目录

“导入到系统”的语义采用：

V1 把用户选中的文件复制到 workspace 的系统管理目录 `.daireel/materials/`，之后所有 builder 只读取该目录。

理由：

- 可以把“用户的原始素材目录”与“本次生成链路使用的素材快照”分开。
- 用户移动、重命名、删除原始素材时，不会破坏已经进入系统的素材引用。
- `.daireel/materials/` 与 `.daireel/workspace.json`、trace、artifacts 位于同一管理域，更符合 workspace 作为可恢复项目目录的模型。

代价：

- 需要处理文件复制、重名、去重、删除/替换、容量增长和引用映射。
- 前端的“导入”语义要非常明确：导入不是扫描目录，而是把选中的候选素材复制进系统素材区。
- material intake 与后续 builders 必须只读 `.daireel/materials/`，不能混读原始目录。

## 已确认决策 2: 删除素材后的失效边界

用户删除已添加素材时，不自动修改用户已批准内容的 JSON；应把 0-1-2-3-4 链路中依赖该素材的临时文件和中间 artifacts 标记为 `stale` 或失效，并在前端提示需要重新运行对应步骤。

理由是自动改写 brief/storyboard/shotprompt 可能隐藏重要决策变化，而 stale 状态能保留历史决策，同时阻止后续 builder 使用不存在的素材。

已生成视频是例外：视频是用户已经获得的最终产物，应作为永久归档保留，不受素材删除或中间链路失效影响。

## 已确认决策 3: 视频归档表

视频归档记录需要单独建 `workspace_video_archive` 表，而不是只放在 `asset.metadata` 里。

`asset` 适合表达媒体资产本身，`generation_job` 适合表达一次异步任务；但 workspace 视频归档需要按 `workspaceId` 查询历史视频、按 `jobId` 定位本地文件、显示时间戳和保留 provider 原始 URL，单独建表会比把所有信息塞进 metadata 更可维护。

建议字段：

- `id`
- `workspace_id`
- `script_id`
- `job_id`
- `asset_id`
- `local_path`
- `public_url`
- `provider_url`
- `created_at`

行为约束：

- 视频生成完成后，服务端下载 provider 返回的视频到 `.daireel/videos/`。
- 文件名包含 `timestamp` 与 `jobId`。
- `generation_job.final_asset_id` 指向对应 final video asset。
- `asset.url` 优先使用本地 Fastify 可访问的 `.daireel/videos` URL。
- 删除素材、重跑素材清点、重跑 0-1-2-3-4 中间链路，不得删除 `workspace_video_archive` 记录或 `.daireel/videos/` 文件。
