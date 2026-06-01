输出：
返回严格 JSON，匹配 Ark response_format.json_schema，不要包含 Markdown。
必须包含 narrative、totalDurationSec、shots 和 assumptions。
shots[] 每项必须包含 index、purpose、durationSec、scene、visualDirection、productAssetRef、voiceover 和 transition。
字段值中的自然语言内容（narrative、scene、visualDirection、voiceover、assumptions 等）必须使用简体中文构建；schema 字段名、enum 仍用英文。
purpose 只能是 hook、benefit、proof、cta。
productAssetRef 必须是已确认素材清单中的非空 ref。
禁止输出占位符值，例如：字符串、string、TODO、N/A、示例、待补充。
