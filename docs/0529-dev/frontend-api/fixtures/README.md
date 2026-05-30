# Frontend Fixtures

这里放前端本地开发和 Storybook/MSW 使用的 Mock JSON。

建议文件：

| 文件 | 场景 |
|---|---|
| `workspace-status-draft.json` | 刚创建项目 |
| `workspace-status-shotprompt-approved.json` | 已进入 shot workflow |
| `shots.json` | shot 列表 |
| `image-batch-running.json` | 图片 batch 生成中 |
| `image-batch-succeeded.json` | 图片 batch 成功 |
| `video-batch-running.json` | 视频 batch 生成中 |
| `video-batch-succeeded.json` | 视频 batch 成功 |
| `final-video-running.json` | 最终合成中 |
| `final-video-succeeded.json` | 最终合成成功 |

维护规则：

- fixture 字段必须和 `openapi.yaml` 保持一致。
- 每个失败态至少保留一个 fixture，方便 UI 调试异常提示。
- fixture 不要包含真实本地路径、API key 或用户隐私数据。

