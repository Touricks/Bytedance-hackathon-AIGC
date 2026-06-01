输出：
返回一个严格 JSON object，匹配 Ark response_format.json_schema，不要包含 Markdown。
字段名、enum 和 schema key 必须严格使用机器契约中的英文值，例如 targetProvider、durationSec、aspectRatio、providerPrompt、shots.voiceover。
字段值中的自然语言内容必须使用中文构建。
prompt 是全局视频目标和叙事主线，不要重复承载所有逐镜头 providerPrompt。
negativePrompt 是中文负向约束；如没有额外负向要求，可以返回空字符串。
shots[].providerPrompt 是逐镜头中文 Seedance 画面指令，必须来自已确认分镜和素材绑定。
shots[].referenceAssetRefs 只能使用已确认素材清单里的 ref。
tts.voiceover 从 shots[].voiceover 汇总，不新增第二份脚本。
assumptions 只记录必要且可审计的中文假设。
禁止输出占位符值，例如：字符串、string、TODO、N/A、示例、待补充。
