# 纵向任务切片

## 1. 说明

以下任务按 tracer-bullet 思路拆分：每个 slice 尽量覆盖 schema、API、业务逻辑、UI 或验证路径，完成后可以独立审阅或演示。

类型说明：

```text
AFK  可以由开发者/agent 独立实现
HITL 需要人工审阅、模型密钥、设计确认或现场决策
```

## 2. Slice 列表

| ID | 标题 | 类型 | 所属 worktree | 阻塞关系 | 验收摘要 |
|---|---|---|---|---|---|
| S01 | 稳定共享领域契约 | AFK | foundation-contracts | 无 | shared 导出 Product/Asset/GenerationJob/Script/StoryboardShot/CreativeBlueprint schema 和 DTO |
| S02 | 建立环境配置与基础设施边界 | AFK | foundation-contracts | 无 | `.env.example`、config、docker-compose 基础服务清晰可启动 |
| S03 | 建立任务状态机与错误码 | AFK | foundation-contracts | S01 | job status/stage/error code 前后端一致 |
| S04 | 跑通官方 openai SDK Ark-compatible client | HITL | ai-generation-pipeline | S01 | 必须真实调用 Ark 文本模型生成文本结果，mock 仅作兜底 |
| S05 | 实现同步创作蓝图生成与 repair retry | AFK | ai-generation-pipeline | S01, S04 | 结构化创作参数 -> valid CreativeBlueprint JSON，持久化后同步返回 scriptId，失败可 repair 或模板兜底 |
| S06 | 完成 Seedance 图生视频 whole-video prompt workflow | HITL | ai-generation-pipeline | S05 | 上传商品图 + StoryboardShot -> <=12s whole-video prompt，必须真实触发 Seedance 图生视频，mock 仅作兜底 |
| S07 | 接入成片任务 processors | AFK | ai-generation-pipeline | S03, S05, S06 | 成片任务从 queued 推进到 completed/failed，进度可查询 |
| S08 | 完成商品表单与素材上传入口 | AFK | web-creation-flow | S01 | 用户可输入商品信息并选择/上传素材 |
| S09 | 完成成片任务创建与进度轮询 | AFK | web-creation-flow | S03, S07 | 前端可在确认创作蓝图后创建成片任务并轮询 job 状态 |
| S10 | 完成创作蓝图展示与只读确认 | AFK | web-creation-flow | S05, S09 | 前端展示 Script、StoryboardShot、improvementHints，并通过结构化字段重新生成 |
| S11 | 完成视频预览与导出路径 | AFK | web-creation-flow | S06, S09 | 完成任务后可预览 final_video，失败时显示 mock fallback |
| S12 | OpenAI Agents SDK trace spike | HITL | ai-generation-pipeline | S04, S05 | 验证 Ark 调用是否能被 trace 或 custom span 捕捉 |
| S13 | bge-m3 embedding sidecar | HITL | retrieval-qdrant-bge | S02 | Docker 中可通过 `BGE_M3_MODEL_PATH` 加载本地模型并返回 embedding |
| S14 | Qdrant collection 与素材索引 job | AFK | retrieval-qdrant-bge | S01, S13 | 素材入库后异步 upsert Qdrant point |
| S15 | 检索 API 与 Postgres hydrate | AFK | retrieval-qdrant-bge | S14 | search API 返回语义命中并补全业务对象 |
| S16 | Demo 兜底与审阅材料 | HITL | web-creation-flow | S07, S11 | 预生成视频、README、演示路径和架构说明完整 |

## 3. 详细验收

### S01 稳定共享领域契约

构建内容：

- Product / Asset / GenerationJob / Script / StoryboardShot / CreativeBlueprint 类型。
- API request / response DTO。
- Zod schemas。
- 统一导出入口。

验收标准：

- [ ] `apps/web` 能 import DTO。
- [ ] `apps/server` 能 import schemas 做请求校验。
- [ ] `packages/ai` 能 import Script schema 做输出校验。
- [ ] 无重复定义的 job status / stage。

### S04 跑通官方 openai SDK Ark-compatible client

构建内容：

- `packages/ai` 内部 OpenAI-compatible client。
- baseURL / apiKey / model 配置。
- raw response trace。

验收标准：

- [ ] 可通过环境变量配置 Ark endpoint。
- [ ] 不把 SDK 泄漏到 `apps/server`。
- [ ] 能记录 request id / model / prompt version / raw output 摘要。
- [ ] 至少完成一次真实 Ark 文本模型调用。
- [ ] 若真实 endpoint 不可用，有 mock provider 兜底，但不得作为 P0 验收替代。

### S05 实现创作蓝图生成与 repair retry

构建内容：

- script prompt。
- JSON parse。
- Zod validation。
- one repair retry。
- fallback template。

验收标准：

- [ ] 结构化创作参数可以生成 CreativeBlueprint。
- [ ] CreativeBlueprint 包含 Script、2-4 个 StoryboardShot 和 improvementHints。
- [ ] API 同步返回创作蓝图和稳定 scriptId，前端只需要普通 loading。
- [ ] 返回前已持久化 Product / Script / StoryboardShot / improvementHints。
- [ ] validation 失败会进入 repair。
- [ ] repair 失败会返回模板剧本。
- [ ] raw output 与 parsed output 可进入 trace/debug 记录。

### S07 接入成片任务 processors

构建内容：

- generation queue。
- media-generate processor。
- progress update。
- failed/completed mirror 到 Postgres。

验收标准：

- [ ] `POST /api/creation/jobs` 接收 scriptId 创建成片任务。
- [ ] `GET /api/jobs/:id` 返回 status/stage/progress。
- [ ] processor 失败时有可读 errorMessage。
- [ ] Redis 不作为用户可见状态唯一来源。

### S13 bge-m3 embedding sidecar

构建内容：

- `apps/embedding`。
- Dockerfile。
- `/embed` endpoint。
- lazy model load。
- `models/README.md`。

验收标准：

- [ ] 本地模型不进入 git。
- [ ] Docker 只读挂载 `/models/bge-m3`。
- [ ] `POST /embed` 返回固定维度向量。
- [ ] 模型路径错误时错误信息可读。

## 4. 审阅重点

审阅时优先看：

- S04 必须真实调用 Ark endpoint，但开发时需要 mock provider 保持本地可跑。
- S12 是否值得进入 P0，还是保留为 P1 trace spike。
- S13-S15 是否作为 P0+ 加分项，还是推迟到 P1。
- S10 必须保持只读确认，不要滑向完整时间线编辑器。
- 创作蓝图生成不得引入第二套任务状态机；异步进度只用于成片任务。
- S16 的演示兜底是否完整。
