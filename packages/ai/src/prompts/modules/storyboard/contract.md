输出：
返回严格 JSON，匹配 Ark response_format.json_schema，不要包含 Markdown。
必须包含 narrative、totalDurationSec、shots 和 assumptions。
shots[] 每项必须包含 index、purpose、durationSec、scene、visualDirection、productAssetRef、voiceover 和 transition。
purpose 只能是 hook、benefit、proof、cta。
productAssetRef 必须是已确认素材清单中的非空 ref。
禁止输出占位符值，例如：字符串、string、TODO、N/A、示例、待补充。
