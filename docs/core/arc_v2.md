# arc_v2 — V2 模块化架构目标

> 电商 AIGC 短视频生成系统（`ecommerce-aigc-video`）的 V2 目标架构。本文描述接下来要迁移到的模块化架构，而不是当前代码的混合态。
>
> 术语遵循 `CONTEXT.md`：创作工作目录、创作要求、待审创作产物、生效创作产物、上游变更提示、分镜链路实例、分镜图选择、分镜视频选择。

---

## 1. 一句话定位

商家上传商品素材 → 模块化 AI 链路生成并批准生效创作产物 → 显式应用 shot prompt 创建分镜链路实例 → 逐分镜生成候选图/候选视频并选择当前结果 → ffmpeg 拼接成片。

V2 的核心变化：

- 每个 prompt module 拥有自己的 artifact 表，`workspace_artifact` 退出主链路。
- 用户编辑的是结构化**创作要求**，不是 raw prompt 或 system prompt。
- prompt 模板分离为主体 prompt 与契约/schema prompt，并由 assembler 组装。
- module artifact 物理 append，业务上只暴露当前生效内容。
- 上游变更不自动 reset 下游，只产生**上游变更提示**。
- `shotprompt approve` 不再删除并重建 shots；必须显式创建新的**分镜链路实例**。

技术基座仍是 **Fastify 5 + Zod + BullMQ + 原生 `pg` + ffmpeg**，AI 调用走火山引擎 **Ark 文本 / Seedream 图像** 与 **Seedance 视频**。

---

## 2. 仓库拓扑

pnpm workspace + Turbo：

```
Bytedancehack/
├── apps/
│   ├── server/                # Fastify API + BullMQ worker + Postgres + 本地文件落盘
│   └── web/                   # React/Vite 前端
├── packages/
│   ├── ai/                    # provider、agent/workflow、prompt assembly
│   ├── shared/                # zod 契约、领域类型、job payload 类型
│   └── config/                # lint/format/tsconfig 预设
├── docs/
│   ├── core/                  # 架构、ERD、接口、OpenAPI
│   ├── plan/                  # 迁移计划
│   └── test/                  # Postman/Newman 测试数据
├── scripts/                   # reset/dev/test orchestration
└── CONTEXT.md                 # 领域语言
```

依赖方向：

```
shared  ──────────────► zod
ai      ──────────────► shared, @openai/agents, openai, zod
web     ──────────────► shared
server  ──────────────► shared, ai
```

---

## 3. Module Graph

V2 把链路显式拆成 prompt modules 与同步点 modules。

| 类型        | Module          | 输出                                                                          |
| ----------- | --------------- | ----------------------------------------------------------------------------- |
| LLM         | material-intake | 生效/待审素材解读 artifact                                                    |
| LLM         | product-brief   | 生效/待审商品 brief artifact                                                  |
| LLM         | storyboard      | 生效/待审 storyboard artifact                                                 |
| LLM         | shotprompt      | 生效/待审 shot prompt artifact，含每个 shot 的 `shotImage` / `shotVideo` dict |
| Apply       | shot-set        | 根据生效 shot prompt 创建分镜链路实例                                         |
| LLM + Media | image-prompt    | per-shot 图像 prompt artifact + image candidates                              |
| Sync        | image-select    | per-shot 当前分镜图选择                                                       |
| LLM + Media | video-script    | per-shot 视频脚本 artifact + video candidates                                 |
| Sync        | video-select    | per-shot 当前分镜视频选择                                                     |
| Media       | final-compose   | 按当前分镜视频选择拼接成片                                                    |

主流程：

```
material-intake
  -> product-brief
  -> storyboard
  -> shotprompt
  -> apply shot-set
  -> image-prompt -> image-select
  -> video-script -> video-select
  -> final-compose
```

---

## 4. Module-Owned Artifact Tables

V2 不再用 `workspace_artifact(type, data)` 承载主链路。每个 module 有自己的表和 schema。

| Module           | 目标表                                          | 保存策略                                                     |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| 创作要求         | `prompt_requirements_artifacts`                 | append；业务只读 current approved。                          |
| material-intake  | `material_intake_artifacts`                     | append；业务只读 current approved，UI 可读 latest proposed。 |
| product-brief    | `product_brief_artifacts`                       | append；业务只读 current approved，UI 可读 latest proposed。 |
| storyboard       | `storyboard_artifacts`                          | append；业务只读 current approved，UI 可读 latest proposed。 |
| shotprompt       | `shot_prompt_artifacts`                         | append；业务只读 current approved，UI 可读 latest proposed。 |
| shot-set         | `shot_sets` + `storyboard_shots`                | active/archived 分镜链路实例；不物理删除旧实例。             |
| image-prompt     | `image_prompt_artifacts`                        | per-shot propose round；保留生成事实。                       |
| image generation | `image_generation_batches` + `image_candidates` | per-round 候选事实。                                         |
| image-select     | `image_select_artifacts`                        | 每 shot current-only；UPSERT 覆盖当前选择。                  |
| video-script     | `video_script_artifacts`                        | per-shot propose round；保留生成事实。                       |
| video generation | `video_generation_batches` + `video_candidates` | per-round 候选事实。                                         |
| video-select     | `video_select_artifacts`                        | 每 shot current-only；UPSERT 覆盖当前选择。                  |
| final-compose    | `final_video_jobs`                              | 每次 compose 一条 job。                                      |

### 4.1 Workspace Module Artifact 通用字段

workspace 级 LLM module 表采用相同生命周期字段：

```text
id
workspace_id
status              proposed | approved | archived
is_current          boolean
data                jsonb
source_fingerprint  jsonb
prompt_assembly     jsonb
created_at
approved_at
```

约束：

- 只有 `status='approved'` 的 row 可以 `is_current=true`。
- 每个 workspace/module 最多一条 current approved row。
- `propose` 插入 `status='proposed'` row，不成为下游 current input。
- `approve` 插入新的 `status='approved', is_current=true` row，并把旧 current approved 置为 `is_current=false`。
- 业务/API 语义是“新 approved 覆盖旧 approved”；DB 物理上 append 保留事实，产品上不提供版本追踪和回滚。
- approved artifact 不原地编辑；前端 Edit 只是把当前生效内容带回表单，再由后端 `propose/approve` 产生新 row。

### 4.2 Prompt Assembly Metadata

主 artifact 表只保存 prompt assembly 元数据和预览，不保存完整 final prompt：

```json
{
  "moduleId": "product-brief",
  "assemblerVersion": "v2",
  "subjectTemplateId": "product-brief/subject.md",
  "contractTemplateId": "product-brief/contract.md",
  "subjectHash": "sha256...",
  "contractHash": "sha256...",
  "requirementArtifactId": "prompt_requirements_artifact_id",
  "preview": "短摘要"
}
```

完整 assembled prompt 写入 `trace_events.metadata.finalPrompt` 和工作区本地 trace jsonl，用于调试和真实 provider 追溯。

---

## 5. 主体 Prompt 与 Contract Prompt 分离

每个 LLM module 的 prompt 模板文件化管理：

```
packages/ai/src/prompts/modules/<module>/
├── subject.md       # 主体创作任务：模块要创作什么
└── contract.md      # 输入 artifact、输出 schema、JSON 格式、provider/safety 硬约束
```

当前集中式 assembler 位于 `packages/ai/src/prompts/module-prompt-assembler.ts`，负责读取对应 module 的 `subject.md` / `contract.md`，再拼入创作要求与运行时上下文。

边界：

- `subject.md` 描述创作目标、风格和业务策略，可由 prompt 设计同学迭代。
- `contract.md` 描述可见输入、必须输出的 schema、字段语义、JSON 格式、provider 限制，系统锁定，用户不可覆盖。
- `module-prompt-assembler.ts` 合并主体 prompt、契约 prompt、创作要求和运行时上下文，输出 `PromptAssemblyResult`。
- 用户的创作要求只进入可控 slot，不替换 system prompt，也不改 input/output schema。

### 5.1 Prompt 修改归属

业务或剧本同学要自定义“主体生成 prompt”时，只改对应 module 的 `subject.md`：

| 业务目标                            | 修改文件                                                     |
| ----------------------------------- | ------------------------------------------------------------ |
| 素材清点/标签策略                   | `packages/ai/src/prompts/modules/material-intake/subject.md` |
| 商品 brief 写法                     | `packages/ai/src/prompts/modules/product-brief/subject.md`   |
| 分镜叙事/节奏                       | `packages/ai/src/prompts/modules/storyboard/subject.md`      |
| 主剧本 / shotprompt 生成            | `packages/ai/src/prompts/modules/shotprompt/subject.md`      |
| 单个 shot 的分镜图 prompt           | `packages/ai/src/prompts/modules/image-prompt/subject.md`    |
| 单个 shot 的分镜视频脚本 / 运镜脚本 | `packages/ai/src/prompts/modules/video-script/subject.md`    |

`contract.md` 属于工程契约：只在输入 artifact、输出 schema、JSON 格式、provider 限制发生变化时由工程侧修改。业务自定义不应修改 `contract.md`，否则会改变 agent 可见输入和输出结构。

每次 subject/contract 内容变化都会反映到对应 artifact 的 `prompt_assembly.subjectHash` / `contractHash`，完整 assembled prompt 继续写入 trace，便于回放本次生成到底使用了哪个模板版本。

组装顺序：

1. module identity 和 prompt version。
2. locked input artifact guide。
3. locked output schema guide。
4. locked provider constraints。
5. subject prompt。
6. workspace 创作要求。
7. shot 级 `shotImage` / `shotVideo` 要求。
8. request inline `userDirection` / `customRequirements`。
9. runtime context。

---

## 6. 创作要求与 Shot Requirements

workspace 级创作要求保存在 `prompt_requirements_artifacts`，作为当前生效要求参与所有 module 的 prompt assembly。

建议结构：

```json
{
  "globalStyle": { "enabled": true, "instruction": "..." },
  "materialImage": { "enabled": true, "instruction": "..." },
  "briefScript": { "enabled": true, "instruction": "..." },
  "storyboard": { "enabled": true, "instruction": "..." },
  "shotprompt": { "enabled": true, "instruction": "..." },
  "shotImage": { "enabled": true, "instruction": "..." },
  "shotVideo": { "enabled": true, "instruction": "..." },
  "negativeRequirements": { "enabled": true, "instruction": "..." }
}
```

`shot_prompt_artifacts.data.shots[]` 必须包含每个 shot 的初始 dict：

```json
{
  "index": 0,
  "startSec": 0,
  "endSec": 4,
  "providerPrompt": "...",
  "referenceAssetRefs": ["..."],
  "voiceover": "...",
  "shotImage": {
    "scene": "...",
    "composition": "...",
    "productVisibility": "...",
    "style": "...",
    "negative": ["..."]
  },
  "shotVideo": {
    "cameraMotion": "...",
    "subjectMotion": "...",
    "firstFrameIntent": "...",
    "lastFrameIntent": "...",
    "continuity": "...",
    "negative": ["..."]
  }
}
```

`apply shot-set` 时把 `shotImage` / `shotVideo` 写入 `shot_prompt_requirements` 或等价 per-shot requirements 表，供 image/video module 读取。用户后续修改单个 shot 的图像/视频要求，只覆盖该 shot 的当前 requirements，不影响旧 candidates。

---

## 7. 分镜链路实例（Shot Sets）

`shotprompt approve` 与创建逐分镜链路必须解耦。

当前代码会在 `shotprompt/approve` 中删除并重建 `storyboard_shots`；V2 禁止这种级联 reset。

目标行为：

```text
shotprompt propose
  -> 插入待审 shot_prompt_artifact

shotprompt approve
  -> 插入新的生效 shot_prompt_artifact
  -> 不删除、不重建已有 shot_set
  -> 对当前 active shot_set 产生上游变更提示

POST /api/workspaces/:workspaceId/shot-sets
  -> 显式应用 current approved shotprompt
  -> 创建新的 shot_sets row
  -> 创建新的 storyboard_shots 和 shot_prompt_requirements
  -> 新 shot_set active，旧 active shot_set archived
  -> 旧 candidates/selections/final jobs 不物理删除
```

`storyboard_shots` 增加 `shot_set_id`。API 默认只返回 active shot set 的 shots；调试接口可按 archived shot set 查询旧事实。

---

## 8. 上游变更提示

上游变更不等于下游 stale。

下游 artifact 记录生成时的 source fingerprint：

```json
{
  "materialIntakeArtifactId": "...",
  "productBriefArtifactId": "...",
  "storyboardArtifactId": "...",
  "shotPromptArtifactId": "...",
  "promptRequirementsArtifactId": "...",
  "sourceHash": "..."
}
```

查询下游状态时，server 比较当前生效上游与下游保存的 fingerprint：

```json
{
  "upstreamChanged": true,
  "changedUpstreamArtifacts": ["productBrief", "shotPrompt"],
  "impactLevel": "major"
}
```

规则：

- 上游变更提示不删除候选，不清空选择，不重置 shot 状态。
- 用户可以继续使用当前下游内容。
- 用户重新生成时，新的 artifact/candidates 使用新的 current upstream。
- `STALE` 只保留给“同一 shot 重新 propose 新轮次，旧轮次不再是当前轮次”的技术状态，不表示上游变更。

---

## 9. Select Modules

`image-select` 与 `video-select` 是同步点 module，并使用 artifact 表命名：

```text
image_select_artifacts
video_select_artifacts
```

语义：

- 每个 shot 至多一个 current image selection。
- 每个 shot 至多一个 current video selection。
- 重复 select 使用 UPSERT 覆盖当前选择。
- select 不触发 stale。
- 未选候选仍持久化在 workspace 中，UI 可以继续展示并允许以后选择。

---

## 10. Runtime 与队列

运行时仍保留 `generation_v2` 队列：

| kind                       | 用途                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| `generate_image_candidate` | image-prompt 创建每个 image candidate job。                              |
| `generate_video_candidate` | video-script 创建每个 video candidate job（每 job 一次 Seedance 调用）。 |
| `generate_videos`          | 旧版 video 批任务，仅保留给历史 job 的 recovery；主线已不再使用。        |
| `compose_final_video`      | final compose。                                                          |

worker 并发：`generate_image_candidate` 与 `generate_video_candidate` 都是「每候选一个 job、每 job 一次 provider 调用」。`generation_v2` worker 的 `concurrency` 由 `GENERATION_WORKER_CONCURRENCY` 调控；它只决定队列执行池大小，不再承担候选数量或 provider 配额含义。

provider 走独立配额：text/image/video provider 调用分别由 `TEXT_PROVIDER_CONCURRENCY`、`IMAGE_PROVIDER_CONCURRENCY`、`VIDEO_PROVIDER_CONCURRENCY` 的进程级信号量限制（authoritative 上限，覆盖任何 caller），与 worker `concurrency` 无关。`video-script propose` 不再内联 `await runVideoGenerationBatch()`：它入队 `generate_video_candidate` 后立即返回 PENDING，由 worker 异步出片，客户端轮询 `video-rounds`。

真实 provider 限制：

- Seedance 单 clip `durationSec` 必须 4-12 秒。
- video 同时在飞调用数 ≤ `VIDEO_PROVIDER_CONCURRENCY`（进程级信号量）。多会话共享账号时实际可用名额可能更少，因此 Seedance 调用对 429/5xx/超时做指数退避重试（`ARK_MAX_RETRIES` / `ARK_RETRY_BASE_MS`，遵循 `Retry-After`），把瞬时限流转成等待而非候选失败。
- real-provider acceptance 应控制 video candidate 数量，避免把架构问题和 RPM/TPM 限流混在一起。
- image provider 同时在飞调用数 ≤ `IMAGE_PROVIDER_CONCURRENCY`；调高该值前需确认 image provider 的 TPM 余量。

---

## 11. Agent Chain Acceptance

V2 新增 real-provider agent-chain 验收：

```
docs/test/agent-chain/
├── agent-chain.postman.json
├── agent-chain.env.json
└── agent-chain.data.json
```

`pnpm` 脚本调用 Newman 执行 collection，并补 DB/trace/文件断言：

```text
pnpm agenttest:real
  -> reset dev
  -> start pnpm dev
  -> newman run docs/test/agent-chain/agent-chain.postman.json
  -> inspect Postgres module artifacts
  -> inspect trace finalPrompt / assembly metadata
  -> verify final compose source count
```

第一版运行完整 real agent 链路：material-intake → product-brief → storyboard → shotprompt → apply shot-set → image/video candidates → selections → final compose。

断言以 schema、状态、数量、source fingerprint、trace 和媒体文件为主，不断言具体文案。

---

## 12. 迁移边界

已清除或退出主链路的旧架构：

- `workspace_artifact` 作为 material/brief/storyboard/shotprompt 主存储。
- `workspace.service.ts` 中集中式 V1 builder 大模块。
- `shotprompt approve` 内的 `delete from storyboard_shots` 级联 reseed。
- `selected_shot_images` / `selected_shot_videos` 命名与主链路引用。
- 混在单个 prompt builder 中的主体 prompt 与 schema/contract prompt。

迁移允许不兼容旧数据；以新 schema、新接口、新测试链路为准。

---

## 13. 工作区身份与本地草稿发现

工作区身份有两层：**磁盘 manifest 是持久身份，DB row 是可丢弃的业务状态。**

- 每个创作工作目录下的 `.daireel/workspace.json` 保存该工作区的 `workspaceId`，是工作区的**持久身份**。
- DB `creative_workspace` 行承载业务状态（artifact、shot set、候选、选择等），可被 `reset:dev` 清空；磁盘 `.daireel/`（manifest、trace、媒体）不被 reset 删除。

因此 DB 被清后，磁盘上仍存在但「未登记」的工作区要能被重新发现并接回原始身份：

```text
GET /api/workspaces
  -> workspaces[]:  DB 已登记工作区 + active storage binding
  -> discovered[]:  扫描 WORKSPACE_DISCOVERY_ROOTS（逗号分隔根目录，有界深度）
                    下存在 .daireel/workspace.json 但 DB 无对应行的工作区
                    （已登记路径从 discovered 去重剔除）

POST /api/workspaces/init  { directory }
  -> DB 有行：find
  -> DB 无行但磁盘 manifest 存在且其 workspaceId 未被占用：
       复用该原始 workspaceId 重新登记（不新建、不覆盖 manifest）
  -> 否则：新建 workspaceId 并写 manifest
```

边界：

- `reset:dev` 清空业务表后，草稿通过 `discovered` 重新出现，点击经 `init` 以**原始 id** 重新打开。
- 复用的是身份，不是业务数据：被 reset 清掉的 DB 侧 artifact（brief/storyboard/shotprompt/选择等）不会自动恢复；磁盘媒体与 trace 仍在。
- 前端首页除 DB 工作区外，单列「本地草稿（未登记）」区呈现 `discovered`。
- `WORKSPACE_DISCOVERY_ROOTS` 是配置项（`.env`），未设置则不扫描磁盘草稿。
