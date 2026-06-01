输出：
返回严格 JSON，匹配 Ark response_format.json_schema，不要包含 Markdown。
必须包含 product、audience、coreSellingPoint、proof、offer、platform、brandTone、bannedExpressions、landingInfo 和 assumptions。
字段名、enum 和 schema key 必须严格使用机器契约中的英文值。
字段值中的自然语言内容（product、audience、coreSellingPoint、proof、brandTone、bannedExpressions、landingInfo、assumptions 等）必须使用简体中文构建。
禁止输出占位符值，例如：字符串、string、TODO、N/A、示例、待补充。
