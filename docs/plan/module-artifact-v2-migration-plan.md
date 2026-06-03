# Module Artifact V2 迁移计划

更新时间：2026-06-02

本计划综合 `docs/plan/modules/` 的模块提案与 `prompt-assembly-standard-plan.md` 的 prompt assembly 方案，目标是把当前混合架构迁移为 module-owned artifact tables + prompt assembly V2。

本计划取代早期“复用 `workspace_artifact` 保存 prompt requirements / 在 `storyboard_shots` 直接放 requirements”的建议。

---

## 1. 目标

1. 更新 V2 架构：每个 prompt module 拥有独立 artifact 表，`workspace_artifact` 退出主链路。
2. 分离主体 prompt 与满足输入/输出 schema 的 contract prompt。
3. 引入创作要求，并在 prompt assembly 中受控注入。
4. 引入 shot sets，避免 shotprompt approve 级联删除下游链路。
5. 将 image/video select 迁移为 `image_select_artifacts` / `video_select_artifacts`。
6. 清除旧架构代码，包括集中式 workspace V1 builder 和 `seedShotsFromShotPrompt()` 的 delete/reseed 行为。
7. 新增 real-provider agent-chain Newman 验收，并由 pnpm script 驱动。

非目标：

- 不提供用户可见版本追踪和回滚。
- 不允许用户编辑 raw prompt 或 system prompt。
- 不建设 Prompt Studio / DB prompt CMS。
- 不追求向后兼容旧数据。

---

## 2. 已确认架构决策

| 决策 | 结论 |
|---|---|
| 用户编辑内容 | 用户编辑创作要求，不编辑最终 prompt。 |
| Prompt 模板 | 文件化分离为 `subject.md` 和 `contract.md`。 |
| Module artifact | 每个 module 独立表，物理 append，业务只暴露 current approved。 |
| Propose / approve | propose 产生待审创作产物；approve 后才成为生效创作产物。 |
| Approved 覆盖语义 | 业务覆盖，DB append + current 指针切换。 |
| 下游状态 | 上游变更不 reset 下游，只显示上游变更提示。 |
| Shotprompt apply | approve 不创建/删除 shots；独立 apply shot-set 接口创建新分镜链路实例。 |
| Select | 每 shot 一个 current selection，UPSERT 覆盖，不 stale 未选候选。 |
| Select 表名 | 使用 `image_select_artifacts` / `video_select_artifacts`。 |
| 测试 | 第一版 agent-chain 跑完整 real provider 链路；pnpm script 调用 Newman。 |

2026-06-02 P0 收敛：

- `/status.modules[].upstream` 与 `activeShotSet.upstream` 已接入 source fingerprint drift 比较。
- 当前工作流查询只读 active shot set；archived shot sets 只作为历史/调试事实保留，不进入 `shot-workflow-status`、next shot、选图/选视频完成度或视频首尾帧查询。
- workspace material 上传新增 `image/*` 10MB 模型输入上限，素材删除新增安全 `DELETE /api/workspaces/:workspaceId/materials/:ref`。
- image prompt 支持用户编辑后 `regenerate`，新建 user-edited artifact 和 image batch，保留当前 selected image。
- image/video prompt 边界已收紧：`shotImage` 只服务静态关键帧，`shotVideo` 只服务动态视频运动；Ark structured output agent 统一走 Responses API。
- Seedance 分镜视频 prompt 固定追加统一 narrator / voice profile，source fingerprint 记录 `voiceProfileHash`。

---

## 3. 目标数据模型

### 3.1 Workspace Module Tables

新增：

- `prompt_requirements_artifacts`
- `material_intake_artifacts`
- `product_brief_artifacts`
- `storyboard_artifacts`
- `shot_prompt_artifacts`

通用字段：

```sql
id text primary key,
workspace_id text not null references creative_workspace(id),
status text not null, -- proposed | approved | archived
is_current boolean not null default false,
data jsonb not null,
source_fingerprint jsonb not null default '{}'::jsonb,
prompt_assembly jsonb not null default '{}'::jsonb,
created_at timestamptz not null default now(),
approved_at timestamptz
```

约束：

```sql
-- 每张表各自建立 partial unique index
unique(workspace_id) where status = 'approved' and is_current = true
```

`approve` 事务规则：

1. 插入新的 approved row。
2. 把旧 `status='approved' and is_current=true` 更新为 `is_current=false`。
3. 把新 row 更新为 `is_current=true`。
4. 不删除旧 row。

### 3.2 Shot Prompt Data

`shot_prompt_artifacts.data.shots[]` 增加：

```ts
shotImage: {
  scene: string;
  composition: string;
  productVisibility: string;
  style: string;
  negative: string[];
};

shotVideo: {
  cameraMotion: string;
  subjectMotion: string;
  firstFrameIntent: string;
  lastFrameIntent: string | null;
  continuity: string;
  negative: string[];
};
```

### 3.3 Shot Sets

新增：

```sql
create table shot_sets (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  shot_prompt_artifact_id text not null references shot_prompt_artifacts(id),
  status text not null, -- active | archived
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
```

调整 `storyboard_shots`：

- 新增 `shot_set_id text not null references shot_sets(id)`。
- unique 从 `(workspace_id, order_index)` 改为 `(shot_set_id, order_index)`。
- 保留 `workspace_id` 方便查询和约束。

新增 per-shot requirements：

```sql
create table shot_prompt_requirements (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  shot_set_id text not null references shot_sets(id),
  shot_id text not null unique references storyboard_shots(id),
  shot_prompt_artifact_id text not null references shot_prompt_artifacts(id),
  shot_image jsonb not null,
  shot_video jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
```

### 3.4 Select Tables

迁移：

```text
selected_shot_images -> image_select_artifacts
selected_shot_videos -> video_select_artifacts
```

目标字段：

```sql
id text primary key,
workspace_id text not null references creative_workspace(id),
shot_set_id text not null references shot_sets(id),
shot_id text not null unique references storyboard_shots(id),
*_candidate_id text not null references *_candidates(id),
*_generation_batch_id text not null references *_generation_batches(id),
selected_by text,
selected_at timestamptz not null default now(),
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

规则：

- 每 shot 唯一一行。
- 重复 select UPSERT 覆盖。
- 未选 candidates 不删除、不 stale。

---

## 4. Prompt Assembly 迁移

目标目录：

```text
packages/ai/src/prompts/modules/
  material-intake/
    subject.md
    contract.md
    assembler.ts
  product-brief/
    subject.md
    contract.md
    assembler.ts
  storyboard/
    subject.md
    contract.md
    assembler.ts
  shotprompt/
    subject.md
    contract.md
    assembler.ts
  image-prompt/
    subject.md
    contract.md
    assembler.ts
  video-script/
    subject.md
    contract.md
    assembler.ts
```

新增公共类型：

```ts
type PromptAssemblyResult = {
  finalPrompt: string;
  preview: string;
  metadata: {
    moduleId: string;
    subjectPromptVersion: string;
    subjectPromptHash: string;
    contractPromptVersion: string;
    contractPromptHash: string;
    promptRequirementsHash: string;
    assemblySections: Array<{ id: string; locked: boolean }>;
  };
};
```

迁移规则：

- real provider 调用使用 `finalPrompt`。
- module artifact `prompt_assembly` 保存 metadata + preview。
- trace 保存完整 `finalPrompt`。
- `contract.md` 必须与 shared zod schema / OpenAPI 字段保持一致。
- `subject.md` 可以独立迭代，但不能覆盖 contract 规则。

---

## 5. API 迁移

### 5.1 Workspace Module APIs

每个 workspace module 采用一致语义：

```http
POST /api/workspaces/:workspaceId/<module>/propose
POST /api/workspaces/:workspaceId/<module>/approve
GET  /api/workspaces/:workspaceId/<module>
```

读模型：

- `GET` 默认返回 current approved + latest proposed + upstreamChanged。
- 下游 runtime 只读取 current approved。
- approve body 可以来自 latest proposed，也可以是前端编辑后的完整 artifact data。

### 5.2 Prompt Requirements APIs

```http
GET /api/workspaces/:workspaceId/prompt-requirements
POST /api/workspaces/:workspaceId/prompt-requirements/propose
POST /api/workspaces/:workspaceId/prompt-requirements/approve
```

创作要求也遵循 module artifact lifecycle：propose 产生待审创作要求，approve 后才成为当前生效创作要求。

### 5.3 Shot Set APIs

```http
GET  /api/workspaces/:workspaceId/shot-sets
POST /api/workspaces/:workspaceId/shot-sets
GET  /api/workspaces/:workspaceId/shot-sets/:shotSetId/shots
```

`POST /shot-sets`：

- 默认读取 current approved shot prompt。
- 创建新的 active shot set。
- archive 旧 active shot set。
- 创建 `storyboard_shots` 和 `shot_prompt_requirements`。
- 不删除旧 shot set 的 candidates/selections。

### 5.4 Shot Module APIs

现有路径可保留，但查询默认作用于 active shot set：

```http
POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose
POST /api/workspaces/:workspaceId/shots/:shotId/image-candidates/select
POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose
POST /api/workspaces/:workspaceId/shots/:shotId/video-candidates/select
```

响应增加：

```json
{
  "upstreamChanged": true,
  "changedUpstreamArtifacts": ["shotPrompt"],
  "sourceFingerprint": {}
}
```

---

## 6. Server 代码迁移

### Phase 1：Schema 与 DB Adapter

- 新增 module artifact tables。
- 新增 `shot_sets` 和 `shot_prompt_requirements`。
- 新增 `image_select_artifacts` / `video_select_artifacts`。
- 给 `storyboard_shots` 增加 `shot_set_id`。
- 更新 `apps/server/src/db/schema/schema.sql` 与 `schema.ts`。
- 更新 `apps/server/src/db/client.ts`：
  - 新增 module artifact repository。
  - 新增 current approved 查询。
  - 新增 latest proposed 查询。
  - 新增 source fingerprint helper。
  - 替换 selected_shot_images/videos 方法。

### Phase 2：Workspace Service 拆分

从 `workspace.service.ts` 拆出：

- `material-intake.service.ts`
- `product-brief.service.ts`
- `storyboard.service.ts`
- `shotprompt.service.ts`
- `prompt-requirements.service.ts`
- `shot-set.service.ts`

替换：

- `db.upsertWorkspaceArtifact`
- `db.getWorkspaceArtifact`
- `hydrateWorkspaceArtifacts`
- `seedShotsFromShotPrompt`

新规则：

- propose 插入 proposed row。
- approve 插入 approved row 并切 current。
- shotprompt approve 不创建 shots。
- `POST /shot-sets` 才创建 active shot set。

### Phase 3：Shot Service 迁移

- 所有 shot 查询限定 active shot set。
- image-prompt 读取：
  - current approved material/brief/storyboard/shotprompt。
  - active shot set。
  - `shot_prompt_requirements.shot_image`。
  - workspace current prompt requirements。
- video-script 读取：
  - current approved upstream。
  - active shot set。
  - `shot_prompt_requirements.shot_video`。
  - image_select_artifacts 当前选择。
- select 改写到 `image_select_artifacts` / `video_select_artifacts`。
- 移除 select 触发 stale 或删除下游选择的旧代码。

### Phase 4：Generation 与 Final Compose

- `createFinalCompose` 从 `video_select_artifacts` 读取当前选择。
- final job 保存 `shot_set_id`。
- source fingerprint 包含 active shot set 和 current approved upstream artifact ids。
- recovery/job payload 使用新表名和新 foreign keys。

---

## 7. AI Package 迁移

- 建立 `prompts/modules/*` 目录。
- 把现有 prompt builder 中的主体内容迁入 `subject.md`。
- 把 input/output schema 说明、JSON 约束、provider 限制迁入 `contract.md`。
- 新增 assembler 公共工具：
  - 读取 prompt files。
  - 计算 hash。
  - 注入创作要求。
  - 注入 runtime context。
  - 产出 final prompt + metadata。
- 更新 workflows：
  - material-intake
  - product-brief
  - storyboard
  - shotprompt
- shot-level prompt assembly now lives in the server deterministic assembler
- mock 模式也走 assembly，以便测试 prompt metadata。

---

## 8. 上游变更提示

实现：

- 每个 artifact 写 `source_fingerprint`。
- query 下游 artifact 时比较 current approved upstream。
- 如果不同，返回 `upstreamChanged=true`。

不做：

- 不自动 reset shot status。
- 不删除候选图/视频。
- 不清空 image/video selection。
- 不把 upstream changed 标成 STALE。

---

## 9. 前端迁移

- Workspace 设置区增加创作要求编辑。
- 各 module review 页面区分 latest proposed 与 current approved。
- approved 默认不可编辑；Edit 是前端把 approved data 带入编辑表单，然后提交 propose/approve。
- shotprompt approve 后提示“需要应用到新的分镜链路实例”。
- 增加 apply shot-set CTA。
- Focus UI 默认读取 active shot set。
- 候选图/视频未被选择时仍保持可见。
- 上游变更提示以 warning 展示，不禁用当前下游内容。

---

## 10. Agent Chain Real-Provider 测试

新增目录：

```text
docs/test/agent-chain/
├── agent-chain.postman.json
├── agent-chain.env.json
└── agent-chain.data.json
```

`agent-chain.postman.json` 是主测试定义，覆盖：

1. health/config。
2. create/init workspace。
3. upload/bind materials。
4. prompt requirements propose/approve。
5. material-intake propose/approve。
6. product-brief propose/approve。
7. storyboard propose/approve。
8. shotprompt propose/approve。
9. apply shot set。
10. image-prompt propose for each shot。
11. image-select for each shot。
12. video-script propose for each shot。
13. video-select for each shot。
14. final compose。
15. trace assertions。

`agent-chain.env.json`：

- `baseUrl`
- `workspaceName`
- `workspaceDirectory`
- runtime variables (`workspaceId`, `shotSetId`, `shotIds`, candidate ids)

Provider 密钥继续从 `.env` / process env / `docs/test/provider.env.json` 的既有机制读取，不把密钥复制进 collection。

新增 script：

```text
scripts/run-agent-chain-test.mjs
```

当前不新增 agent-chain package script；完整多真实模型联调入口已从 `package.json` 移除。

历史脚本职责：

- reset dev。
- 删除测试 workspace `.daireel/`。
- 启动 `pnpm dev`。
- 调用 `newman run docs/test/agent-chain/agent-chain.postman.json --environment docs/test/agent-chain/agent-chain.env.json --iteration-data docs/test/agent-chain/agent-chain.data.json`。

当前状态：完整 agent-chain 真实模型联调入口已关闭；现行真实 provider 自动 smoke 只保留 `pnpm --filter @aigc-video/server test:integration:smoke`。
- 读取 Newman 输出。
- 补充 DB 断言：
  - 每个 module 有 current approved artifact。
  - prompt assembly metadata 存在。
  - active shot set 存在。
  - image/video select artifacts 每 shot 一行。
  - final compose source count 等于 selected video count。
- 补充 trace 断言：
  - trace 中存在 full assembled prompt。
  - trace 中存在 prompt requirements hash。

断言策略：

- 断 schema、状态、数量、duration 4-12、source fingerprint、trace metadata。
- 不断具体文案内容。

---

## 11. 清旧代码清单

删除或退出主链路：

- `workspace_artifact` 的 material/brief/storyboard/shotprompt 主存储路径。
- `workspace.service.ts` 中集中式 builder 逻辑。
- `seedShotsFromShotPrompt()` 中 `delete from storyboard_shots`。
- `selected_shot_images` / `selected_shot_videos` 表和 adapter 方法。
- `shot.stale.ts` 中 select 后删除视频选择的逻辑。
- 旧 `compileShotPrompt` 确定性路径对主链路的强依赖；mock 可保留为测试 builder，但仍必须走 module table 和 assembly metadata。
- OpenAPI/interface/ERD 中 `workspace_artifact` 主链路描述。

保留：

- `script` / `creative_workspace` / `asset` / `product` 等共享基础表，除非后续单独迁移。
- `generation_jobs` 与 `generation_v2` 队列。
- 当前媒体落盘和 static file 路由。

---

## 12. 推荐实施顺序

1. 更新 `erd.md` / `openapi.yaml` / `interface.md` 到目标契约。
2. 落 DB schema 和 repository。
3. 新建 module service/controller，先跑 mock 单元测试。
4. 接入 prompt assembly。
5. 接入 shot sets。
6. 迁移 image/video select 表名与 service。
7. 迁移 final compose。
8. 更新前端最小闭环。
9. 新建 agent-chain Postman collection 和 pnpm Newman script。
10. 跑 `pnpm --filter @aigc-video/server test:integration:smoke`。
11. 删除旧 workspace artifact 主链路和 delete/reseed 逻辑。

---

## 13. 风险点

| 风险 | 缓解 |
|---|---|
| schema 迁移范围大 | 不兼容旧数据，先以 clean reset 验收。 |
| real provider 输出不稳定 | 断言 schema/状态/数量，不断文案。 |
| Seedance RPM/TPM 限流 | 默认 video candidate 数控制为 1，脚本退避重试。 |
| shot sets 让 UI 状态复杂 | 默认只展示 active shot set；archived 仅 debug。 |
| 上游变更提示被误解为 stale | UI 文案明确“当前内容仍可用，重新生成会变化”。 |
| prompt assembly 变成大而全工具 | 每个 module 保留自己的 assembler，公共层只提供 section/hash/merge 工具。 |
