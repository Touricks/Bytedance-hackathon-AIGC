# Postman Guide

## 导入

导入文件：

```text
docs/0529-dev/test-api/bytedancehack-api.postman_collection.json
```

## 关键变量

| 变量 | 含义 |
|---|---|
| `baseUrl` | 后端服务地址，默认 `http://localhost:3000` |
| `workspaceId` | 当前测试 workspace |
| `workspaceDirectory` | 本地工作目录 |
| `shotId` | 当前测试 shot |
| `imagePromptArtifactId` | 图片 prompt artifact |
| `imageBatchId` | 图片 batch |
| `imageCandidateId` | 图片候选 |
| `videoScriptArtifactId` | 视频脚本 artifact |
| `videoBatchId` | 视频 batch |
| `videoCandidateId` | 视频候选 |
| `finalVideoJobId` | 最终合成任务 |

## 推荐运行顺序

1. `System / Health`
2. `Workspace Pipeline / Create Managed Workspace`
3. `Workspace Pipeline / Get Workspace Directory`
4. `Workspace Pipeline / Upload Workspace Material`
5. `Workspace Pipeline / Run Material Intake`
6. 依次 propose / approve brief、storyboard、shotprompt
7. `Shot Workflow / List Shots`
8. 完成图片生成和选择
9. 完成视频生成和选择
10. `Final Video / Create Final Video`

## 注意

- 生成 batch 和 final video 的请求必须带 `Idempotency-Key`。
- 真实 provider 测试需要 `.env` 配好模型和 provider key。
- Collection 中部分变量会由 test script 自动回填。

