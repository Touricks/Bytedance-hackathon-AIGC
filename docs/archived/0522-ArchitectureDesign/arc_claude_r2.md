# 电商场景 AIGC 带货视频生成系统 — 推荐架构 (r2)

> 本文是对 `architecture.md` 的修订版。核心调整：**把工程从"生产级"收到"黑客松级"，
> 在基础设施上做减法，在 AI/渲染链路上做加法**。
> 一句话原则：**便宜又高价值的骨架保留，重基础设施推迟，第一天先验证模型链路。**

---

## 0. 设计前提：这是一个 3 人 / 时间盒住的比赛

所有取舍都从这两个事实出发，而不是从"理想生产系统"出发：

- **评分看的是**：端到端能跑通（哪怕单条链路）、故事讲得清、代码结构清晰、demo 可 0 门槛访问、创新思路。PRD 明说**视频效果不是评审重点**。
- **真正的风险在模型链路**：商品图 + 卖点 → 一条连贯的 ≤15s 带货视频，用 `Doubao-Seed-2.0-pro`（文本）+ `Doubao-Seedance-1.5-pro`（图生视频，**仅 5 并发**）到底拼不拼得出来。目录结构不会让你翻车，模型链路会。

因此本架构刻意做到：**目录/队列/适配层一次写好（便宜），但把最危险的模型步骤放到第一天验证（贵）。**

---

## 1. 三个必须先拍板的决策（ADR-lite）

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| worker 是否独立部署？ | **否，与 server 同镜像/同进程跑**（保留队列接口，将来可拆） | 砍掉第三个部署物，省下部署+联调成本；异步语义靠 BullMQ 仍然成立 |
| 要不要本地 FFmpeg 渲染？ | **MVP 不做**，优先让 Seedance 直接出片；多分镜拼接/字幕/混音是 P1 | FFmpeg 合成是最坑的一环，且是否需要取决于 Seedance 输出形态——**Day 1 验证后再决定** |
| 用 Python 算法服务吗？ | **否，TS 全栈** | 团队小、一套语言最省心；P1 的 embedding 检索用 pgvector + 外部 embedding API |

> 这三件事不定，后面写多少代码都是赌博。第 6 节给出 Day-1 验证闸门。

---

## 2. 整体拓扑（右尺寸版）

```text
                 ┌─────────────────────────────────────────┐
   浏览器 ──────► │  apps/web (React + TS)                   │
   (评委/商家)    │  上传 → 卖点 → 剧本 → 分镜 → 一键成片 → 预览 │
                 └───────────────┬─────────────────────────┘
                                 │  REST + 轮询 job 状态
                 ┌───────────────▼─────────────────────────┐
                 │  apps/server (Node + TS)                 │
                 │  ┌─────────────┐   ┌──────────────────┐  │
                 │  │ API (域模块) │   │ 内嵌 worker      │  │
                 │  │ material     │   │ (BullMQ 消费)    │  │
                 │  │ script       │◄─►│ script-generate  │  │
                 │  │ creation     │   │ media-generate   │  │
                 │  └──────┬──────┘   └────────┬─────────┘  │
                 └─────────┼───────────────────┼────────────┘
                           │                   │
              ┌────────────▼──┐   ┌────────────▼─────────────┐
              │ packages/ai   │   │  Postgres │ Redis │ 对象存储 │
              │ Seed/Seedance │   │  (pgvector│(BullMQ)│(图/片段) │
              │ /TTS 适配+编排 │   │   P1 用)  │        │        │
              └───────┬───────┘   └──────────────────────────┘
                      │ 仅服务端调用，密钥走 env
              ┌───────▼────────────────────┐
              │ 火山方舟 OpenAPI            │
              │ Doubao-Seed-2.0-pro (文本)  │
              │ Doubao-Seedance-1.5-pro(视频)│
              └─────────────────────────────┘
```

**关键点**：MVP 只有 **2 个可部署物**（web + server），server 内部既是 API 又是队列消费者。
逻辑上 worker 是独立角色，物理上不单独部署。

---

## 3. 仓库结构（比 architecture.md 更精简）

```text
ecommerce-aigc-video/
├── apps/
│   ├── web/                   # React + TS 商家工作台
│   └── server/                # Node + TS：API + 内嵌队列消费
│
├── packages/
│   ├── shared/                # 类型、DTO、zod schema、job payload、错误码、枚举
│   ├── ai/                    # server-only：模型适配 + prompt + workflow 编排
│   └── config/                # eslint / prettier / tsconfig / tailwind 共享配置
│
├── infra/
│   └── docker-compose.yml     # 一条命令起 demo（pg + redis + minio + app）
├── docs/                      # PRD、本架构、ER 图、答辩材料
├── mocks/                     # mock 转化数据、样例素材、预生成成片（demo 兜底）
├── .github/workflows/ci.yml   # 最小 CI：typecheck + lint + build
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
└── README.md
```

相对 `architecture.md` 砍掉的：

- **`apps/worker`**（独立部署）→ 折叠进 `apps/server`，队列接口留着。
- **`packages/video`** → FFmpeg/时间轴逻辑先放 `apps/server` 或 `packages/ai`，出现复用再抽。
- **`packages/ui`** → 单前端阶段不抽，组件放 `apps/web/src/components`。
- **`scripts/`** → 用 `package.json` scripts + `infra/` 覆盖。

保留的（这些便宜又对上 PRD 评分）：monorepo、`packages/ai` 适配层收口密钥、`packages/shared` 防接口漂移、域模块化、最小 CI。

---

## 4. 后端域模块（"结构清晰"是评分项，这块照搬好设计）

```text
apps/server/src/
├── modules/
│   ├── material/      # 素材：上传、(P1)切片/多模态理解/向量检索
│   ├── script/        # 剧本：生成、结构化校验、剧本干预
│   ├── creation/      # 创作：建 job、分镜、(P1)拼接/导出、预览资源
│   └── agent/         # (P1) workflow 编排，调度上面三个域
├── jobs/
│   ├── queue.ts                 # BullMQ 队列定义 + 并发限流配置
│   └── processors/              # 与 server 同进程消费
│       ├── script-generate.processor.ts
│       └── media-generate.processor.ts
├── common/            # 鉴权、日志、错误处理、配置、trace
├── db/                # ORM client、repository、迁移
└── main.ts            # 同时启动 HTTP 与队列消费（可用 --worker 拆分）
```

每个 module 内部统一分层（评委一眼看懂同一张地图）：

```text
modules/script/
├── script.controller.ts   # HTTP
├── script.service.ts      # 用例编排
├── script.repository.ts   # 数据访问
├── script.dto.ts          # 请求/响应
├── script.schema.ts       # zod 校验
└── script.types.ts
```

前端用同名 `features/`（material / script / creation），前后端读同一套域名。

---

## 5. AI 链路设计（`architecture.md` 缺的就是这一节）

模型能力全部收口到 `packages/ai`，controller / 前端不直接碰 OpenAPI 与密钥。

```text
packages/ai/src/
├── providers/
│   ├── seed.text.provider.ts        # Doubao-Seed-2.0-pro（100 RPM / 50 WTPM）
│   ├── seedance.video.provider.ts   # Doubao-Seedance-1.5-pro（★ 5 并发限流★）
│   └── tts.provider.ts              # 火山 TTS（P1）
├── prompts/
│   ├── script.prompt.ts             # 商品信息 → 结构化剧本
│   └── storyboard.prompt.ts         # 分镜 → 图生视频提示词
├── schema/
│   └── script.schema.ts             # ★ 剧本/分镜的 zod 输出 schema ★
├── workflows/
│   └── one-click-video.workflow.ts  # 编排下面 6 步
└── index.ts
```

### 5.1 一键成片链路（核心）

```text
输入：商品主图(必填) + 卖点/标题/人群(文本)  ──（可选）商品链接

1. 素材准备     图入对象存储；MVP 直接用商家填的卖点，不做多模态理解
2. 剧本生成     Seed：商品信息 → 结构化剧本 JSON
                 { 叙事框架, 视觉风格, shots:[{画面描述,镜头运动,时长,台词,字幕,BGM提示}] }
                 ★ 用 zod schema 强约束输出 + 失败重试，否则下游无法消费 ★
                 ★ 总时长 ≤15s → 控制分镜数量(建议 2~4 个) ★
3. 分镜→媒体    Seedance：每个分镜(画面描述 + 商品图作参考) → 该分镜短片段
                 ★ 5 并发：用 BullMQ concurrency=5 / p-limit 限流，分批跑 ★
                 ★ 这是最慢、最不确定的一步，单分镜失败只重试该分镜 ★
4. 配音字幕     (P1) 台词 → TTS 音频 + 字幕时间轴
5. 合成         见下面 5.2 的渲染岔路
6. 预览/导出    多分辨率/画幅(9:16 / 16:9)导出
```

### 5.2 渲染岔路（必须 Day-1 实测后决定）

| 路径 | 触发条件 | 实现 | 阶段 |
| --- | --- | --- | --- |
| **A. 单片即成片** | MVP 第一版 | 1 个分镜 = 1 次 Seedance 调用 = 成片，**不做任何拼接** | P0（先跑通端到端） |
| **B. 轻拼接** | Seedance 出的片段干净、只需顺序拼 | `ffmpeg concat` + 可选烧字幕 | P1 |
| **C. 重渲染** | 需要复杂转场/混音/BGM | 完整 FFmpeg pipeline | P2（按需） |

> **推荐**：P0 直接走 A——PRD 明说"单条链路即可"。先证明"图→剧本→视频→可播放"通了，
> 再在 P1 升级到 B 的多分镜拼接。**不要一上来就建 FFmpeg 渲染管线。**

### 5.3 两个真实工程难点（答辩"关键难点与解决方案"直接用）

1. **LLM 结构化输出稳定性**：剧本必须是严格 JSON 才能驱动下游分镜生成。
   方案：zod schema 校验 + 输出失败自动重试 + 兜底默认模板。
2. **Seedance 5 并发 + 生成慢**：并发限流（BullMQ concurrency / p-limit），
   按分镜分批排队；前端轮询展示分阶段进度；**demo 兜底见第 9 节**。

---

## 6. Day-1 验证闸门（先过闸，再铺代码）

第一天不写架构，写一个**垂直切片 spike**，把风险打掉：

```text
□ 闸门 1  Seedance 出片形态：返回成片还是片段？单次耗时？5 并发实测吞吐？
          → 决定 5.2 走 A/B/C
□ 闸门 2  Seed 结构化剧本 JSON 在 zod 约束下是否稳定可用
□ 闸门 3  最小端到端：硬编码商品 → Seed 剧本 → Seedance 单片段 → 裸页面可播放
          （无 DB、无队列、无 UI 框架，纯验证模型链路）
□ 闸门 4  0 登录 demo 托管能不能在目标平台跑起来
```

四个闸门过了，再进入第 7 节的正式实现。**这是和 `architecture.md` 最大的区别：
先验证链路，而不是先铺目录树。**

---

## 7. 数据模型（P0 精简到 ~5 张表）

```text
Product          商品：标题、卖点、人群、主图引用
GenerationJob    任务：status、stage、progress、payload、trace、错误信息
Script           剧本：jobId、结构化 JSON、版本
StoryboardShot   分镜：scriptId、序号、画面描述、时长、台词、mediaUrl、status
Asset            统一资产：type(商品图/分镜片段/成片)、url、来源、元信息
```

P1 再补：`ConversionMetric`（**mock**）、`MaterialEmbedding`、`ReferenceVideoAnalysis`、`CreativeTemplate`。

> 比 `architecture.md` 的 11 实体瘦身：用一张 `Asset`（带 type 枚举）替代
> `MaterialAsset` / `RenderOutput` 等多表；分发/转化数据 PRD 允许全 mock。
>
> ⚠️ **P1 假设待验证**：pgvector 只*存*向量，产 embedding 需要模型。
> PRD 给的资源只有文本/视频生成模型，**没确认 embedding 模型**——
> P1 的素材检索要么接外部 embedding API，要么降级为关键词/标签检索，别默认成立。

---

## 8. 任务状态机与前端

### 状态机（精简版）

```text
queued → script_generating → media_generating → [P1: tts/subtitle → rendering] → completed
                                      │
                                      └──► failed（记录失败阶段+原因，单分镜可重试）
```

worker 持续写 stage / progress / partial result / trace，前端**轮询**获取（demo 用轮询足够，
不必上 SSE/WebSocket——挑一个，别两套都提）。

### 前端

```text
状态：React Query(服务端数据) + Zustand(编辑器本地态) + 轮询(任务进度)
表单：zod + React Hook Form(Prompt/导出配置)
UI：  Tailwind + Antd 或 shadcn
页面：/material  /script  /creation/:jobId  /dashboard(mock)
```

**先做一条主路径**：`上传商品图 → 输入卖点 → 生成剧本 → 生成分镜 → 一键成片 → 预览导出`。
长任务必须有进度、阶段文案、失败原因、重试入口（PRD 的"长任务体验"硬要求）。

---

## 9. 部署与 demo（评分第一原则是"可访问"）

- **本地一键起**：`docker-compose up` 拉起 pg + redis + minio + app，README 写清楚。
- **给评委**：web + server 部署在**一个 URL 后面，无登录**（或预置一个共享演示账号），
  预置一个 demo 商品，点开即用。
- **★ demo 兜底 ★**：Seedance 慢且仅 5 并发，现场实时生成可能卡。
  在 `mocks/` 预生成 1~2 条成片，提供"播放已生成样例"入口，
  既满足"端到端跑通"，又保证答辩不翻车。**这是黑客松的关键经验。**

---

## 10. 工程规范 / CI（按 PRD 权重，别超配）

PRD 把 CI/CD、可观测性放在 **P2 加分项**，所以：

```text
保留(便宜高信号)：TypeScript strict、ESLint、Prettier、Husky+lint-staged
最小 CI：        install → typecheck → lint → build(web + server)
推迟到 P2：       Playwright E2E、全面单测、完整 CI 矩阵、Docker 自动部署
```

`.env.example` 暴露变量名，**真实密钥（火山 EP/APIKEY）只走环境变量，绝不入仓**。

---

## 11. 分阶段交付（按"风险优先"重排，不是按模块）

```text
Phase 0  Day-1 spike（第 6 节四个闸门）—— 打掉模型链路风险
Phase 1  P0 必做：上传 + 剧本 + 基础分镜 + 一键成片(走 5.2-A) + 任务进度 + 预览导出
                  对应：material/script/creation 三模块 + 2 类 processor + 5 张表
Phase 2  P1 选做：多分镜拼接(5.2-B) + TTS/字幕 + 分镜级重生成 + 失败重试
                  + 生成 trace + 素材检索 + mock 数据看板
Phase 3  P2 加分：多因子归因 + A/B 对比 + Agent 编排 + CI/CD + 合规流
```

> 与 `architecture.md` 的分级一致，但**实现顺序按风险排**：先 spike 打通最难的模型链路，
> 再用正式架构包起来，最后才是锦上添花。

---

## 12. 与 architecture.md 的差异总结

| 维度 | architecture.md | 本文 (r2) |
| --- | --- | --- |
| 可部署物 | web + server + worker（3 个） | web + server（2 个，worker 内嵌） |
| 包数量 | shared/ai/video/config（4） | shared/ai/config（3） |
| 数据表(P0) | 6 | ~5（合并 Asset） |
| 渲染 | 默认建 FFmpeg 渲染管线 | P0 不渲染，按 Day-1 实测分 A/B/C |
| AI 链路 | 仅文件名占位 | 6 步链路 + 渲染岔路 + 2 个难点写清 |
| 测试/CI | Vitest+Playwright+7 步矩阵 | typecheck+lint+build；E2E 推迟 P2 |
| 实现顺序 | 按模块 | **按风险**：Day-1 spike 先行 |
| demo | 未提托管/兜底 | 0 登录托管 + 预生成成片兜底 |

**核心立场**：保留 `architecture.md` 所有对的判断（monorepo、队列、适配层、取舍），
但把它从"生产蓝图"收成"黑客松施工图"——少建一半基础设施，把省下的时间砸到
**模型链路验证**和**评委点开即用的 demo**上。
