# Frontend API Examples

本文保留前端常用请求/响应示例。完整字段以 `openapi.yaml` 为准。

## 查询 workspace 工作目录

```http
GET /api/workspaces/{workspaceId}/directory
```

```json
{
  "data": {
    "workspaceId": "w_123",
    "directory": "/Users/example/workspaces/demo"
  }
}
```

## 创建图片 batch

```http
POST /api/shots/{shotId}/image-batches
Idempotency-Key: image-batch-shot-123-uuid
```

```json
{
  "imagePromptArtifactId": "img_prompt_123",
  "count": 3,
  "aspectRatio": "9:16"
}
```

```json
{
  "data": {
    "batchId": "imb_123",
    "jobId": "job_123",
    "status": "PENDING",
    "requestedCount": 3
  }
}
```

## 查询图片 batch

```http
GET /api/shots/{shotId}/image-batches/{batchId}
```

```json
{
  "data": {
    "id": "imb_123",
    "status": "SUCCEEDED",
    "requestedCount": 3,
    "succeededCount": 3,
    "failedCount": 0,
    "candidates": [
      {
        "id": "img_1",
        "imageUrl": "/api/workspaces/w_123/materials/generated.png",
        "status": "SUCCEEDED"
      }
    ]
  }
}
```

