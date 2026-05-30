# Prompt API 文档

本目录给 Prompt 负责人使用，目标是说明每个 AI 模块“吃什么上下文、输出什么结构、会被谁消费、如何验收”。这里不按 HTTP route 写，而按 AI 模块写。

## 文件说明

| 文件 | 用途 |
|---|---|
| `module-context-map.md` | 每个 prompt 模块需要的上下文来源 |
| `prompt-input-output.md` | 每个模块的 Zod input/output 摘要 |
| `artifact-schemas.md` | 核心 artifact schema 的产品化解释 |
| `provider-contracts.md` | Ark / Seedance / deterministic provider 边界 |
| `evaluation-cases.md` | prompt 验收样例和质量标准 |
| `modules/` | 每个 prompt 模块的单独说明 |

## 模块列表

| 模块 | 文件 |
|---|---|
| Material Intake | `modules/material-intake.md` |
| Product Brief | `modules/product-brief.md` |
| Storyboard | `modules/storyboard.md` |
| Shot Prompt | `modules/shotprompt.md` |
| Image Prompt | `modules/image-prompt.md` |
| Video Script | `modules/video-script.md` |
| Feedback Route | `modules/feedback-route.md` |

## Prompt 文档固定格式

每个模块建议包含：

- 业务目标
- 触发接口
- 输入上下文
- Zod input
- Zod output
- 输出 artifact 或版本表
- 下游消费者
- 示例输入
- 示例输出
- 验收标准
- 常见失败和修复方式

