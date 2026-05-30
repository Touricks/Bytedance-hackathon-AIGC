# Provider Contracts

本文记录 prompt 和 provider 之间的边界。

## Runtime modes

| 模式 | 含义 |
|---|---|
| `mock` | 使用 deterministic/mock 输出，适合本地开发和测试 |
| `real` | 调用真实模型/provider，需要环境变量配置 |

## Providers

| Provider | 使用场景 | 输入重点 | 输出重点 |
|---|---|---|---|
| Ark text/vision | material intake、brief、storyboard、shotprompt、feedback route | 严格 JSON schema、素材上下文 | 可 parse 的 artifact JSON |
| Seedream / image provider | image batch | image prompt、reference assets、aspect ratio | image candidates |
| Seedance / video provider | video batch | video script provider prompt、selected image、duration | video candidates |
| deterministic | 测试和本地 fallback | 固定输入 | 稳定可预测输出 |

## Prompt 输出硬约束

- 必须返回 JSON，不要混入 markdown。
- 必须符合对应 Zod output schema。
- 不要编造不存在的 asset refs。
- `assumptions` 用来承载合理推断，不要把推断写成事实。

