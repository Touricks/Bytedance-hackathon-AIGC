对于.env中的demo fallback，我记得当前版本的upload和trace已经全部迁移到工作目录下了，并且移除了mock_final_video_url的逻辑。
MOCK_FINAL_VIDEO_URL=/mocks/videos/fallback-flower.mp4
UPLOAD_DIR=storage/uploads
UPLOAD_URL_PREFIX=/uploads
TRACE_LOG_DIR=storage/trace

按当前代码看，这四个变量不是同一种状态：
`MOCK_FINAL_VIDEO_URL`
还在被 [seedance-video.provider.ts](/Users/carrick/.codex/worktrees/f2d7/Bytedancehack/packages/ai/src/providers/seedance-video.provider.ts:297) 消费：当没有 `ARK_API_KEY + ARK_VIDEO_ENDPOINT_ID`，且不是 `MODEL_MODE=real` 时，`generateVideoWithSeedance()` 会返回 mock video。即使删掉 env，它也有硬编码默认值 `/mocks/videos/fallback-flower.mp4`。所以“env 可删”，但“mock fallback 逻辑还没删”。

`UPLOAD_DIR`
还在被 [config.ts](/Users/carrick/.codex/worktrees/f2d7/Bytedancehack/apps/server/src/common/config.ts:116) 作为必填读取。它被用于：
- 旧/普通图片上传：写到 `config.uploadDir/product-images`，见 [material.service.ts](/Users/carrick/.codex/worktrees/f2d7/Bytedancehack/apps/server/src/modules/material/material.service.ts:37)
- 默认 `WORKSPACE_DIR = UPLOAD_DIR/workspaces`
- Seedance 本地图片 handoff 的路径安全校验，见 [seedance-image-input.ts](/Users/carrick/.codex/worktrees/f2d7/Bytedancehack/apps/server/src/jobs/seedance-image-input.ts:165)

`UPLOAD_URL_PREFIX`
也仍是必填。它现在不只是“旧 uploads”，还是本地 URL namespace：
- `/uploads/workspace-materials/:workspaceId/*`
- `/uploads/workspace-videos/:workspaceId/*`
- `/uploads/*`

对应注册在 [app.ts](/Users/carrick/.codex/worktrees/f2d7/Bytedancehack/apps/server/src/app.ts:50)。所以 workspace 素材/视频虽然落在 `.daireel/` 下，但 URL 暴露仍用这个 prefix。

`TRACE_LOG_DIR`
主 workspace 流程确实已经迁到 `.daireel/trace/events.jsonl`，见 [workspace.service.ts](/Users/carrick/.codex/worktrees/f2d7/Bytedancehack/apps/server/src/modules/workspace/workspace.service.ts:552) 和 [media-generate.processor.ts](/Users/carrick/.codex/worktrees/f2d7/Bytedancehack/apps/server/src/jobs/processors/media-generate.processor.ts:143)。

但 `TRACE_LOG_DIR` 仍被默认 file trace logger 消费：如果调用 `createFileTraceLogger({ traceId })` 且没有传 `traceFilePath`，就要求 `TRACE_LOG_DIR`，见 [trace-log.ts](/Users/carrick/.codex/worktrees/f2d7/Bytedancehack/packages/ai/src/trace/trace-log.ts:89)。主要影响 probe、测试、以及无 workspaceId 的 legacy/default trace 路径。

但是 `MOCK_FINAL_VIDEO_URL` 可以从 `.env.example` 删除或降为注释；`TRACE_LOG_DIR` 可以降为“legacy/probe optional”；`UPLOAD_DIR` 和 `UPLOAD_URL_PREFIX` 当前还不能删，除非同时改 server config 和本地静态文件/URL 适配层。

因此，这不是简单删 .env.example 的问题，而是 V1 架构里仍残留了 V0/demo fallback 的可执行路径。这些 fallback 会让缺配置、错路径、没进 real provider 的问题被“成功视频/成功 trace/成功 upload URL”掩盖。
我用 diagnose 跑了反馈 loop，当前代码仍证明这些旧行为存在：
generateVideoWithSeedance 无 Ark video 配置时仍返回 mock video。
server config 仍要求 UPLOAD_DIR / UPLOAD_URL_PREFIX。
默认 file trace logger 仍要求 TRACE_LOG_DIR。
workspace 主 trace 已迁到 .daireel/trace/events.jsonl，但非 workspace fallback trace 还存在。
Zoom-Out 模块地图
V1 主事实源：Postgres + workspace .daireel/
V1 素材：.daireel/materials/
V1 trace：.daireel/trace/events.jsonl
V1 成片归档：.daireel/videos/
残留 fallback 层：seedance-video.provider.ts (line 297)：无 Ark video 时返回 MOCK_FINAL_VIDEO_URL
config.ts (line 116)：强依赖 UPLOAD_DIR
app.ts (line 50)：用 UPLOAD_URL_PREFIX 暴露 workspace assets/videos
trace-log.ts (line 89)：默认 trace root 依赖 TRACE_LOG_DIR

需要做的修复
废弃 MOCK_FINAL_VIDEO_URL
删除 generateVideoWithSeedance() 的 mock video fallback。
没有 ARK_API_KEY + ARK_VIDEO_ENDPOINT_ID 时，成片阶段必须 fail loudly。
mock 视频只能留在测试 fixture，不能作为 runtime provider result。
更新 seedance-video.provider.test.ts、workspace video tests、README/demo readiness。

废弃 UPLOAD_DIR 作为 V1 主存储
V1 workspace material 必须只从 .daireel/materials/ 读取。
删除或隔离旧 /api/material/product-image 上传路径，避免继续写 storage/uploads/product-images。
resolveSeedanceImageInput() 不应再用 UPLOAD_DIR 判断 workspace-managed material 合法性，应基于 workspace localPath + .daireel/materials/ 校验。

废弃 UPLOAD_URL_PREFIX 作为 env
把 workspace material/video URL 改成固定 server route，例如 /api/workspaces/:workspaceId/materials/:ref、/api/workspaces/:workspaceId/videos/:filename。
URL prefix 不再由 .env 配置，避免本地路径和公共 URL 混在一起。
更新 workspaceMaterialUrl()、workspaceVideoUrl()、Fastify static handlers、前端/API tests。

废弃 runtime TRACE_LOG_DIR / TRACE_LOG_SCOPE
runtime workflow 必须传 traceFilePath，即 .daireel/trace/events.jsonl。
createFileTraceLogger({ traceId }) 这种无 workspace trace fallback 应在 V1 runtime 中禁止。
probes/tests 可以显式传 traceRoot，但不能靠 .env.example。
media-generate.processor 里无 workspaceId 时不要退回默认 trace root，应 fail loudly 或拒绝 V1 job。

收紧 .env.example
删除 MOCK_FINAL_VIDEO_URL、UPLOAD_DIR、UPLOAD_URL_PREFIX、TRACE_LOG_DIR、TRACE_LOG_SCOPE。
MODEL_MODE 默认不应是 mock；建议 .env.example 面向 V1 real demo，mock 另放 .env.mock.example 或测试脚本内显式设置。

回归测试要改成反向护栏
无 Ark video config 创建成片任务应失败，而不是返回 fallback video。
rg MOCK_FINAL_VIDEO_URL active source 应为 0。
server 在没有 UPLOAD_DIR/UPLOAD_URL_PREFIX/TRACE_LOG_DIR 时仍可启动 V1 workspace 主路径。
workspace 成片 trace 必须写入 .daireel/trace/events.jsonl。
workspace material/video URL 不依赖 env prefix。
这是一组架构同步修复，不是单纯清理 env。核心原则可以写进代码护栏：V1 runtime 不允许隐式 mock/fallback；mock 只能在显式测试或专门 mock mode fixture 中出现。