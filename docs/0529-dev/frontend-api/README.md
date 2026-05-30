# Frontend API 文档

本目录给前端使用，目标是把 OpenAPI 契约转化成可落地的页面接入说明。前端关心的不只是字段，还包括调用顺序、状态流转、轮询策略、错误提示和 Mock 数据。

## 文件说明

| 文件 | 用途 |
|---|---|
| `openapi.yaml` | 机器可读接口契约，用于生成类型、Mock 或查字段 |
| `workflow.md` | 端到端调用顺序，从 workspace 创建到最终视频合成 |
| `page-api-map.md` | 页面/组件到接口的映射 |
| `state-machine.md` | workspace 和 shot 状态流转 |
| `error-map.md` | 后端错误码到前端 UI 提示的映射 |
| `examples.md` | 常用接口请求/响应示例 |
| `fixtures/` | 前端本地 Mock 示例数据说明 |

## 前端接入时必须确认

- `workspaceId`、`shotId`、`batchId`、`finalVideoJobId` 分别从哪个接口获得。
- 哪些接口必须带 `Idempotency-Key`。
- 哪些接口需要轮询，以及轮询终止条件是什么。
- 哪些接口依赖前置状态，例如生成视频脚本前必须先选择图片。
- 哪些接口当前不可用或未完成，例如 batch 列表接口当前返回 `501`。

## 推荐接入顺序

1. 先按 `workflow.md` 串通主流程。
2. 再按 `page-api-map.md` 接入各页面/组件。
3. 用 `state-machine.md` 控制按钮可用性和下一步动作。
4. 用 `error-map.md` 做用户提示。
5. 用 `fixtures/` 补齐页面离线开发和异常态。

