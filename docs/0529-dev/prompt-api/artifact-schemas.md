# Artifact Schemas

本文用 prompt 负责人能读的语言解释核心 artifact。

## MaterialIntakeArtifact

作用：描述素材库中哪些文件可用、用途是什么、主商品素材是谁。

关键字段：

| 字段 | 含义 |
|---|---|
| `primaryProductRef` | 主商品素材 ref |
| `assets[]` | 可用素材列表 |
| `assets[].role` | 商品主图、包装、logo、demo video 等 |
| `assets[].usable` | 是否可用于生成 |
| `rejected[]` | 被排除的素材和原因 |

## ProductBriefArtifact

作用：把素材转成商业创意 brief。

关键字段：

| 字段 | 含义 |
|---|---|
| `product` | 商品名称、类目、事实、素材引用 |
| `audience` | 目标人群和痛点 |
| `coreSellingPoint` | 核心卖点 |
| `proof` | 支撑卖点的证据 |
| `brandTone` | 语气风格 |
| `assumptions` | 模型推断信息 |

## StoryboardArtifact

作用：生成可审阅的分镜。

关键字段：

| 字段 | 含义 |
|---|---|
| `narrative` | 整体叙事 |
| `totalDurationSec` | 总时长 |
| `shots[]` | 分镜列表 |
| `shots[].purpose` | hook / benefit / proof / cta |
| `shots[].visualDirection` | 画面方向 |
| `shots[].voiceover` | 口播 |

## ShotPromptArtifact

作用：把 storyboard 编译成 Seedance 可消费的 prompt 结构，并 seed shot workflow。

关键字段：

| 字段 | 含义 |
|---|---|
| `targetProvider` | 当前固定为 `seedance` |
| `aspectRatio` | 生成画幅 |
| `prompt` | 总 prompt |
| `negativePrompt` | 负向 prompt |
| `shots[]` | 每个镜头的 provider prompt |
| `tts` | 口播音频配置 |

