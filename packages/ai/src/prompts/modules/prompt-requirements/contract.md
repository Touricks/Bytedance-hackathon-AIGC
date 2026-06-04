输出：
返回严格 JSON object，不要包含 Markdown。
允许保存 image、script、storyboard、shotImage、shotVideo 等分区要求。
每个分区可以包含自然语言方向、avoid 列表、style、composition、rhythm、global 等字段。
不要把创作要求写入 workspace_artifact；批准后只更新 prompt_requirements_artifacts 的 current approved 行。
