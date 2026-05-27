# 开发路线图

## 1. 目标

把 PRD 的 P0 必做能力落成一条可演示、可复核、可继续扩展的端到端链路：

```text
商品素材上传
  -> 剧本生成
  -> 基础分镜
  -> 一键成片
  -> 任务进度
  -> 预览导出
```

路线图以比赛交付确定性为第一原则：先跑通主路径，再把 Qdrant 检索、trace、数据看板作为增强能力接入。

## 2. Phase 0：Foundation + 模型链路 Spike

定位：打掉共享契约和模型链路风险。

产出：

- `packages/shared` 中的领域类型、DTO、Zod schema、job status/stage。
- `apps/server` 基础 config、logger、trace、db schema。
- `infra/docker-compose.yml` 中 Postgres、Redis 基础服务；本地上传目录作为 P0 存储入口。
- `packages/ai` 最小 Ark/OpenAI-compatible client。
- 一次最小真实模型链路验证：商品信息 + 商品图 -> 结构化 Script -> 保守三段式 whole-video prompt -> Seedance 12s 图生视频。

验收：

```text
pnpm typecheck
pnpm lint
pnpm build
给定 mock product 可以生成符合 schema 的 Script
可以通过真实 Seedance 图生视频得到可播放视频 URL；mock / 预生成视频只作为兜底
```

不做：

- 完整 UI。
- Qdrant 检索。
- FFmpeg。
- LangGraph。
- 多 Agent 编排。

## 3. Phase 1：P0 Demo 主路径

定位：完成比赛必做闭环。

产出：

- 商品信息表单和素材上传入口。
- 创作蓝图生成 API。
- 一键成片任务 API。
- BullMQ media processor。
- 结构化剧本展示。
- 基础分镜展示。
- 一键成片。
- 任务轮询和进度展示。
- 视频预览和导出。
- 预生成样例视频兜底。

验收：

```text
用户从空页面进入后，可以上传或选择商品，生成剧本，看到基础分镜，触发一键成片，看到进度，最终预览/导出视频。
```

V0 用户流程：

```text
上传素材与商品信息
  -> 同步生成剧本/基础分镜
  -> 用户只读预览
  -> 点击一键成片
  -> 任务进度
  -> 预览导出
```

范围边界：

```text
V0 只交付商品素材上传、剧本生成、基础分镜、一键成片、任务进度、预览导出。
检索、TTS、字幕合成、BGM 合成、数据看板、A/B 对比、复杂分镜编辑、移动端专项优化不进入 V0 主路径。
用户允许修改的内容通过商品标题、卖点、目标人群、风格偏好等结构化 UI 字段传入，不直接触碰图生视频 prompt。
```

工程验收：

```text
pnpm typecheck
pnpm lint
pnpm build
server /api/health 可用
POST /api/creative-blueprints 可生成创作蓝图
POST /api/creation/jobs 可基于 scriptId 创建成片任务
GET /api/jobs/:id 可查询状态
创作蓝图生成使用普通 loading；任务进度只用于成片任务
```

## 4. Phase 1.5：Qdrant + bge-m3 检索增强

定位：利用已有本地 embedding 模型与 Qdrant 做加分能力，不阻塞 P0。

产出：

- `apps/embedding` FastAPI sidecar。
- `models/README.md` 与 `BGE_M3_MODEL_PATH` 约定。
- Docker Compose 中 Qdrant 和 embedding service。
- `apps/server/src/modules/retrieval`。
- `material-index` job。
- Qdrant collection 初始化和 upsert/search。
- 搜索结果回 Postgres hydrate。

验收：

```text
embedding service 可以加载本地 bge-m3
素材入库后可以异步写入 Qdrant
search API 可以返回语义相似素材
Qdrant payload 不包含完整业务对象
Postgres 删除/更新后可重建索引
```

## 5. Phase 2：P1 产品增强

定位：让 Demo 更像真实商家产品。

产出：

- 分镜轻编辑：修改 shot -> 重拼 prompt -> 再生成整条 12s 视频。
- TTS / 字幕 / BGM 的轻量方案。
- 失败重试和清晰失败原因。
- 生成 trace 页面或 trace JSON 展示。
- Mock 数据看板。
- presigned upload。

验收：

```text
用户能理解系统每一步在做什么；
失败后能重试；
生成过程可解释；
检索和看板能说明项目不只是一次性生成脚本。
```

## 6. Phase 3：P2 加分与生产化

候选能力：

- A/B 自动出片。
- 多因子归因。
- 爆款视频结构化拆解。
- CreativeTemplate。
- Agent 编排。
- 合规审核流。
- 独立 `apps/worker`。
- 服务端 FFmpeg。
- 完整 CI/CD 与可观测性。

进入条件：

```text
P0 主链路稳定；
生成质量可展示；
团队还有时间；
新增能力不会破坏演示路径。
```

## 7. 风险与闸门

### 模型输出风险

闸门：

```text
Script 输出必须通过 Zod schema。
失败做一次 repair retry。
仍失败使用模板兜底。
```

### 视频生成风险

闸门：

```text
实时生成失败时必须能展示预生成样例。
任务失败必须有可读原因。
```

### 检索范围风险

闸门：

```text
Qdrant 不进入 P0 必经链路。
Qdrant 不作为事实源。
不同时维护 pgvector 和 Qdrant 两套向量主路径。
```

### 架构膨胀风险

闸门：

```text
P0 不抽 apps/worker。
P0 不抽 packages/video。
P0 不引入 LangGraph。
P0 不引入 FFmpeg composition。
```
