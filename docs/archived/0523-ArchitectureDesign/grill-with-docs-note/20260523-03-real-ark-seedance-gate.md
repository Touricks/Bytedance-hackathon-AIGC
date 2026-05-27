# 2026-05-23 Grill Note：真实 Ark 与 Seedance 模型链路闸门

## 审阅状态

已确认。

## 背景

当前架构依赖一个关键假设：`StoryboardShot` 可以被压缩成 whole-video prompt，并由 Seedance 单次生成不超过 12 秒的成片。如果只用 mock provider 跑通端到端，就无法验证这个假设，也无法证明 PRD 要求的火山 OpenAPI 对接能力。

## 已确认决策：P0 必须真实调用 Ark 文本模型和 Seedance

P0 模型链路定义为：

```text
商品信息 + 上传素材
  -> Ark 文本模型生成结构化 Script / StoryboardShot
  -> Zod validation
  -> repair retry 或 fallback template
  -> whole-video prompt
  -> Seedance 真实生成 <=12s 成片
```

mock provider 的定位：

- 本地开发兜底。
- 模型不可用时保留可跑链路。
- 现场演示失败时切换预生成样例。
- 不作为 P0 验收替代。

## 配置口径

相关配置已在 `.env` 中实现。文档和示例环境只记录变量名，不记录真实密钥或 endpoint secret。

`packages/ai` 是唯一允许直接接触模型 SDK 和模型密钥的 package；`apps/server` 只调用 `packages/ai` 暴露的 workflow；`apps/web` 不接触任何模型配置。

## 对依赖 baseline 的影响

foundation / ai baseline 需要把官方 `openai` SDK 作为 `packages/ai` 的 P0 必需依赖。

暂不因为该决策引入：

- Vercel AI SDK Core。
- LangGraph。
- OpenAI Agents SDK 主运行时。

OpenAI Agents SDK 仍只作为 trace spike 候选。

## 下一轮需要继续确认的问题

下一个问题建议讨论：

```text
Seedance 主路径应该固定为“图生视频：上传商品图 + prompt”，
还是允许“纯文本 prompt 生成视频”作为 P0 主路径？
```

已确认答案：

```text
P0 主路径固定为图生视频：上传商品图 / demo 商品图 + whole-video prompt。
纯文本视频生成只能作为兜底或实验路径。
```

原因：

- PRD 的素材模块强调商品真实外观、关键细节和使用方式，纯文本生成更容易丢失商品一致性。
- 你刚确认了 P0 要做真实素材上传，本地上传文件应该进入 Seedance 调用链路。
- 评委最容易理解的价值路径是“我给一张商品图，系统生成带货视频”。

## 下一轮需要继续确认的问题

下一个问题建议讨论：

```text
P0 的 Seedance prompt 是否采用一个“不会错”的保守三段式模板，
而不是直接把所有 StoryboardShot 原样拼进视频 prompt？
```

推荐答案：

```text
P0 v0 采用保守三段式模板：商品 hero -> 卖点/使用场景 -> CTA。
StoryboardShot 只提供叙事灵感，不承诺逐镜头还原。
```

原因：

- 图生视频最怕商品外观漂移，prompt 应优先保护商品一致性。
- 过度复杂的多镜头指令会降低稳定性，不利于 P0 演示。
- 字幕、旁白、BGM 不应在 v0 Seedance prompt 中强依赖，P0 先把它们作为剧本/前端展示信息，P1 再做合成。
