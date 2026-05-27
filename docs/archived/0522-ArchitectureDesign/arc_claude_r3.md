# 电商场景 AIGC 带货视频生成系统 — 推荐架构 (r3 / 收敛终版)

> 本文以 `arc_codex_r2.md` 为基线,叠加两个新事实做出最终判断:
>
> 1. **模型卡支持单次输出 12s 视频,比赛要求 <15s** → 一次调用即可出整片。
> 2. **"分镜"是两件事**:渲染单元 vs 剧本脚本。前者砍,后者留。
>
> 结论:`arc_codex_r2.md` 的方向全对,它第 8 节的"结构化分镜 + 单次成片"折中,
> 在 12s 这个事实下**不再是折中,而是干净的默认路径**。本文把仍然开放的渲染岔路彻底关闭,
> 并补三个它没写实的缺口(BGM、商品链接输入、多 beat 连贯性闸门)。

---

## 0. 相对 arc_codex_r2.md 的三处定稿

| 议题 | arc_codex_r2.md | 12s 事实下的 r3 定稿 |
| --- | --- | --- |
| 渲染岔路 | P0 单次出片,P1 升级为"每分镜单独生成 + ffmpeg concat" | **P0/P1 都单次出片,concat 降级为 P2 可选**;FFmpeg 彻底移出关键路径 |
| 分镜 | UI 展示分镜 + 生成压成单 prompt(折中) | **同意,且确认这是默认而非妥协**;并明确"分镜=剧本脚本,不是渲染单元" |
| 缺口 | 未提 BGM / 商品链接 / 多 beat 连贯性 | **补**:P0 加罐头 BGM;输入明确为图+文;Day-1 加 Gate 6 |

其余(领域命名、逻辑 worker 物理内嵌、5 张表、zod/trace/兜底模板、升级触发条件)**全部采纳 Codex r2,不改**。

---

## 1. 核心判断:砍"分镜级渲染",留"分镜级脚本"

整个项目最容易混淆、也最影响范围的一个词是"分镜"。它指两件不同的事:

```text
① 分镜 = 渲染单元   切成多段 → 每段单独调 Seedance → ffmpeg 拼接
② 分镜 = 剧本脚本   LLM 产出的 beat 计划:钩子→卖点→CTA，每个 beat 含画面/运镜/台词/字幕/时长
```

**12s 单次出片,只干掉 ①,不干掉 ②。**

- ① 砍掉:不切片、不 concat、不烧字幕到帧、不混音轨——P0/P1 全部不碰 FFmpeg 合成。
- ② 保留,因为它**便宜且三头受益**:
  - PRD 把"基础分镜"列为 **P0 必做**,"剧本生成"要求产出"分镜脚本";砍了直接丢分。
  - 它本来就是 LLM 的结构化输出,**也是你构造那一次 12s prompt 的脚手架**——不是额外负担。
  - P1 的"分镜级干预"因 12s 单次出片**变便宜**:改某个 beat → 重拼 prompt → 再出一条 12s 片,依然一次调用、依然不拼接。留着结构 = 白送一个出彩功能。

---

## 2. P0 一键成片链路(定稿)

```text
输入:商品主图(必填) + 标题/卖点/目标人群(文本)
      ⚠️ "商品链接"抓取属 P2/暂不做,P0 只接图+文(见 §7)

1. 建 GenerationJob
2. script processor 调 Seed → 结构化剧本 JSON
       { narrative, visualStyle, shots:[{画面描述,运镜,时长,台词,字幕}] }  ← 2~4 个 shot
       zod schema 强校验 + 失败重试 + 兜底模板
3. UI 展示这 2~4 个分镜(满足 P0 必做"基础分镜",让产品路径可见)
4. creation workflow 把多个 shot 压成一个完整视频 prompt
5. media processor 调 Seedance → 一次出 ≤12s 成片(无切片/无拼接)
       Seedance 仅 5 并发 → BullMQ concurrency=5 限流(单次出片 = 5 个 job 并行上限)
6. 罐头 BGM 叠轨(见 §6),避免交默片
7. 存为 Asset(type=final_video) → web 轮询完成后预览 → 导出
```

数据层仍保存 `StoryboardShot`,为 P1 的单分镜干预(重拼 prompt 再出片)留地基。

---

## 3. Day-1 Spike 闸门(在 Codex r2 基础上 +1)

正式铺目录前,第一天先打掉模型链路风险。无 DB、无队列、无完整 UI。

```text
Gate 1  Seed 能否稳定输出结构化剧本 JSON(zod 校验失败率可接受)
Gate 2  Seedance 能否基于商品图 + prompt 生成可播放视频
Gate 3  Seedance 单次 12s 的耗时、失败率、5 并发上限是否可控
Gate 4  生成结果能否在最小页面 0 登录播放
Gate 5  ★新增★ 单次 12s 调用能否体现"多 beat 叙事"(钩子→卖点→CTA)?
```

**Gate 5 的两种结果,都不阻塞,但决定"分镜"的呈现口径:**

- 体现了 → 分镜既是脚本又被忠实渲染,完美。
- 没体现(只是一段连续画面)→ **诚实地把 UI 分镜表述为"剧本分镜脚本 / 旁白与字幕的叙事结构"**(覆盖在连续画面上的节奏),而不是声称"每个分镜单独渲染"。12s 的长度让这种表述完全站得住。

> 注意:Gate 5 的失败**不会**把我们逼回 FFmpeg 拼接。最坏情况只是"分镜是脚本层结构"而非"渲染层结构"——而这正是 §1 的立场。

---

## 4. 总体架构与拓扑(采纳 Codex r2)

P0 只有两个可部署物,server 内部含清晰的 job 边界。

```text
                 ┌────────────────────────────────────────┐
   浏览器 ──────► │ apps/web (React + TS) 商家工作台          │
   (评委/商家)    │ 上传 → 剧本/分镜 → 一键成片 → 预览/导出    │
                 └───────────────────┬────────────────────┘
                                     │ REST + 轮询 job 状态
                 ┌───────────────────▼────────────────────┐
                 │ apps/server (Node + TS 模块化单体)        │
                 │  API modules:  material / script / creation│
                 │  Embedded processors: script-gen / media-gen│
                 └──────────┬──────────────────┬────────────┘
                            │                  │
              ┌─────────────▼────┐   ┌──────────▼───────────────┐
              │ packages/ai       │   │ Postgres + Redis + MinIO │
              │ provider/prompt/  │   │ Job/trace/asset 存储     │
              │ workflow/schema   │   │ (pgvector 仅 P1 用)      │
              └─────────────┬────┘   └──────────────────────────┘
                            │ 仅服务端调用,密钥走 env
              ┌─────────────▼────────────────────┐
              │ 火山方舟 OpenAPI                  │
              │ Doubao-Seed-2.0-pro     (文本)    │
              │ Doubao-Seedance-1.5-pro (≤12s 视频)│
              │ 火山 TTS (P1)                     │
              └───────────────────────────────────┘
```

**逻辑 worker 保留,物理内嵌**:`main.ts` 支持 `pnpm dev`(同进程)/ `dev:api` / `dev:worker`,
P0 简单、P1/P2 可按启动参数拆分。升级触发条件见 §9。

---

## 5. 仓库与后端结构(采纳 Codex r2,不改)

```text
ecommerce-aigc-video/
├── apps/
│   ├── web/                     # React + TS 商家工作台
│   └── server/                  # Node + TS：API + 内嵌 job processors
├── packages/
│   ├── shared/                  # 类型、DTO、zod schema、job payload、错误码
│   ├── ai/                      # server-only：provider / prompt / workflow / schema
│   └── config/                  # eslint / prettier / tsconfig / tailwind
├── infra/docker-compose.yml     # pg + redis + minio + app,一键起
├── docs/  mocks/  .github/workflows/ci.yml
├── pnpm-workspace.yaml  turbo.json  .env.example  README.md
```

```text
apps/server/src/
├── modules/{material,script,creation}/   # 各自 controller/service/repository/schema
├── jobs/{queue.ts, job.types.ts, processors/{script-generate, media-generate}}
├── common/{config,logger,errors,trace}.ts
├── db/{client.ts, schema/}
└── main.ts                                # HTTP + processors 同/分进程
```

`packages/ai` 关键原则(采纳):前端永不直连模型;密钥只走 env;LLM 输出过 zod;
失败重试,再失败用兜底模板;所有调用记 trace(provider/模型/耗时/输入摘要/状态/错误)。

不抽 `packages/video`(无拼接需求)、不抽 `packages/ui`(单前端)。

---

## 6. P0 加一条罐头 BGM(补 Codex r2 的缺口)

带货视频静音演示观感差,但 TTS/字幕属 P1。折中:

```text
P0:  一条预置 BGM 轨,在 web 播放器侧叠加(零渲染成本) 或 一次 audio overlay
P1:  TTS 配音 + 字幕(此时台词/字幕已在 StoryboardShot 里备好)
```

这样 P0 demo 不是默片,又不引入 P1 的音轨/字幕工作量。

---

## 7. 数据模型(5 张表,采纳 Codex r2)

```text
Product        id, title, sellingPoints, audience, mainImageAssetId, createdAt
Asset          id, type(product_image|generated_clip|final_video|audio|subtitle),
               url, source(upload|seedance|tts|mock), metadata, createdAt
GenerationJob  id, productId, status, stage, progress, payload, trace, errorMessage, ts
Script         id, jobId, version, narrative, visualStyle, rawJson, createdAt
StoryboardShot id, scriptId, index, durationSec, visualPrompt, cameraMotion,
               voiceover, subtitle, mediaAssetId, status
```

- `Asset` 必须带 `type/source/metadata`,否则沦为垃圾桶(Codex r2 的提醒,保留)。
- `StoryboardShot` **保留**——它是"剧本脚本"(§1 的 ②),P0 必做项 + P1 干预地基,不是渲染单元。
- P1 再补:`CreativeTemplate`、`ReferenceVideoAnalysis`、`MaterialEmbedding`、`ConversionMetric`、`ExperimentVariant`。

⚠️ **embedding 仍是 P1 待验证假设**:pgvector 只存不产向量;PRD 资源里没确认 embedding 模型。
P0 素材检索用标签/关键词兜底,确认有 embedding 模型后再上向量召回。

---

## 8. 任务状态机与前端

```text
P0:  queued → script_generating → media_generating → completed   (任意阶段 → failed)
P1:  queued → material_analyzing → script_generating → storyboard_generating
            → media_generating → tts_generating → subtitle_composing → completed
```

P0 前端**只做轮询** `GET /api/jobs/:jobId`(返回 status/stage/progress/currentMessage/partialResult/errorMessage);SSE/WebSocket 推迟。

```text
状态:React Query(服务端态/任务态) + Zustand(分镜编辑器本地态) + RHF + zod(表单/API 校验)
页面:/material(上传)  /script/:jobId(剧本+分镜查看/轻编辑)  /creation/:jobId(进度+预览+导出)  /dashboard(mock,P1)
```

P0 必须做好:一键开始、阶段+进度、失败原因、可重试、完成即预览、**预生成样例兜底**。

---

## 9. 分阶段交付(渲染相关已按 12s 重排)

```text
Phase 0  Day-1 Spike：商品图+卖点 → Seed 剧本 → 单次 Seedance 12s → 页面播放
                       不做:DB / 队列 / 完整 UI / FFmpeg / embedding / 看板
Phase 1  P0 Demo：上传 → 卖点 → 剧本 → 展示 2~4 分镜 → 一键成片(单次 12s) → 进度 → 预览 → 导出
                  + 罐头 BGM；技术:web/server/shared/ai + pg/redis/minio + 5 张表
Phase 2  P1：分镜级干预(重拼 prompt 再出 12s 片，仍无拼接) + TTS/字幕 + 失败重试
             + 生成 trace + 标签/关键词检索 + mock 数据看板
Phase 3  P2：embedding 检索 + 爆款拆解 + CreativeTemplate + A/B 出片 + 多因子归因
             + Agent 编排 + 合规流 + CI/CD + 可观测性
             + (可选)真正的"每分镜单独出片 + ffmpeg concat"——仅当需要分镜视觉上彼此独立时才做
```

> 注意 Phase 2 的"分镜级干预"不再需要拼接:改 beat → 重拼整段 prompt → 再出一条 12s 片。
> 多片段 + concat 被降到 **Phase 3 可选**,且大概率永远不需要。

---

## 10. 何时升级架构(采纳 Codex r2 §15)

- **拆 `apps/worker`**:HTTP 被生成任务拖慢 / 需独立扩容 worker / 需单独监控 Seedance 队列吞吐 / 部署平台支持多服务。拆法:`server/src/jobs/processors → apps/worker/src/processors`,payload schema 仍在 `packages/shared`。
- **抽 `packages/video`**:只有当真要做"每分镜单独出片 + concat / 转场 / 字幕烧录 / 混音"时才抽(即 Phase 3 可选项)。
- **引入向量库**:已确认 embedding 模型 + 素材量大到关键词不够 + 需视觉相似度召回,三者满足再上。P0 不为"架构完整"强行上向量。

---

## 11. Demo 与部署(可访问是评分第一原则)

```text
本地:   docker-compose up → pnpm install → pnpm dev
基础设施:Postgres(业务) + Redis(BullMQ) + MinIO/S3(图/视频)
给评委: 一个公开 URL，无登录或共享演示账号，预置 demo 商品，点开即播
现场兜底:mocks/{products,scripts,videos,metrics}/ 预生成 1~2 条成片
        实时生成展示技术链路，预生成样例保证答辩不翻车(Seedance 慢且仅 5 并发)
```

CI 最小但有信号:`install → typecheck → lint → build:web → build:server`。
Playwright/全面单测/自动部署/压测推迟 P2。`.env.example` 只写变量名,真实火山 EP/APIKEY 绝不入仓。

---

## 12. 三版关系与终版立场

| 维度 | arc_codex_r1 | arc_claude_r2 | arc_codex_r2 | **arc_claude_r3(终版)** |
| --- | --- | --- | --- | --- |
| 定位 | 完整工程蓝图 | 黑客松施工图 | 风险优先最小架构 | **收敛终版** |
| worker | 独立 | 内嵌 | 逻辑保留物理内嵌 | **采纳 r2** |
| 渲染 | 预留 video 包 | P0 不做,A/B/C 待定 | P0 不做,P1 concat | **P0/P1 单次 12s,concat 降 P2 可选** |
| 分镜 | 完整链路 | P0 可单片 | UI 分镜+单次出片 | **明确"砍渲染单元/留剧本脚本"** |
| 数据 | 6+ | 5 | 5(Asset 需类型) | **采纳 5 张** |
| Day-1 | 按模块 | 按风险 | spike 入流程 | **+Gate 5 多 beat 连贯性** |
| 缺口 | — | — | — | **补 BGM / 商品链接口径 / 限流** |

**一句话:** 12s 单次出片把"要不要拼接"这个悬而未决的问题一次性关掉了——
P0 到 P1 全程不碰 FFmpeg 合成;但"分镜"作为**剧本脚本**必须留(P0 必做 + prompt 脚手架 + P1 干预地基)。
Codex r2 的方向全对,r3 只是把它在新事实下定稿:**清晰、不重、能演示、先打模型风险、分镜留结构不留拼接。**
