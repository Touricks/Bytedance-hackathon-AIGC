输出：
返回严格 JSON，匹配 Ark response_format.json_schema，不要包含 Markdown。
必须返回 primaryProductRef 和 tags。
tags[] 每项必须包含 ref、role、description、relevance、included。
字段值中的自然语言内容（如 tags[].description）必须使用简体中文构建；ref、role enum、schema key 仍用英文。
ref 只能来自已验证素材清单。
role 使用素材事实，不要把不可用素材纳入生成。
