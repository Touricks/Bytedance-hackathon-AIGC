# ArcReel 参考文件包（随 DaiReel 设计文档分发）

> 这些是从 ArcReel 仓库**复制**出来的核心 prompt 文件，供 DaiReel 在**原项目**里离线参考
> （原项目无法访问 ArcReel 仓库，除非从 GitHub 检索）。
> 仅作设计参考与片段借鉴，**非可运行模块**；落地时按 DaiReel 的 schema/builder/pacing 三层重写或移植。
> 配套：`../cli-prd.md`（PRD，含「附：ArcReel 参考文件索引」）、`../builder-templates/`（DaiReel 契约）。

## 三层解耦的真实出处

| 层 | 本包文件 | 看点 | DaiReel 对应 |
|---|---|---|---|
| **schema** | `lib/script_models.py` | Pydantic `response_schema` 强约束；`SkipJsonSchema` 隐藏运行时字段（`NarrationSegment`/`DramaScene`/`ImagePrompt`/`VideoPrompt`） | 各 artifact schema + `_meta` |
| **builder** | `lib/prompt_builders_script.py` | 设计哲学 docstring（不重复 schema 枚举、不写不可自检的字数限制）；`_SCENE_WRITING_GUIDE`/`_ACTION_WRITING_GUIDE`；`build_narration_prompt`/`build_drama_prompt` 正反例 | ①②③ builder 写法 |
| **pacing** | `lib/prompt_rules/episode_pacing.py` + `__init__.py` | 体裁因子独立成块、可插拔；`is_v2_enabled` 灰度闸 | 带货节奏因子（落 ②） |

## 约束 / 一致性 / 编排 周边

| 本包文件 | 看点 | DaiReel 对应 |
|---|---|---|
| `lib/prompt_builders.py` | `_NEGATIVE_TAIL_VIDEO` 反向尾巴、`_*_GUARD` 防崩、`append_video_negative_tail` | `must_preserve`/`constraints` + 反向尾巴 + ShotPromptCompiler |
| `lib/prompt_builders_reference.py` | `build_reference_video_prompt`：`@名称` 引用、**禁止描写外观**（由参考图承担一致性） | 商品图作真相源、prompt 不臆造 Logo/文字 |
| `lib/script_generator.py` | schema+builder 串调模型 + `_add_metadata` 注入隐藏真相源字段 | SeedproClient 生成编排 |

## "因子可复用 + 防漂移"的证据

| 本包文件 | 看点 |
|---|---|
| `agents/split-narration-segments.md` / `agents/normalize-drama-script.md` | pacing 文本被逐字镜像进 subagent 指令 |
| `skills/generate-script.SKILL.md` | skill 如何串起三层调用生成 |
| `tests/test_subagent_md_sync.py` | **防漂移**：builder/pacing 与 subagent .md 文本不一致即失败 |
| `tests/test_episode_pacing.py` / `tests/test_prompt_builders_script_v2.py` | 因子渲染 / builder 输出单测 |

## 目录结构
```
arcreel-reference/
├─ lib/        script_models.py / prompt_builders_script.py / prompt_builders.py
│              prompt_builders_reference.py / script_generator.py / prompt_rules/
├─ agents/     split-narration-segments.md / normalize-drama-script.md
├─ skills/     generate-script.SKILL.md
└─ tests/      test_subagent_md_sync.py / test_episode_pacing.py / test_prompt_builders_script_v2.py
```

> 来源仓库（如需对照最新版）：ArcReel（GitHub 检索）；本包复制时点见各文件内容。
