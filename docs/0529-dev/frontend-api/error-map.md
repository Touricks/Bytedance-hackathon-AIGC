# Frontend Error Map

本文记录后端错误码和前端用户提示建议。后端错误结构通常是 `{ statusCode, message, code? }`。

| 错误码/状态 | 场景 | 建议 UI 提示 | 前端动作 |
|---|---|---|---|
| `IDEMPOTENCY_KEY_REQUIRED` | 创建 batch/final video/retry 未传幂等 key | 请求异常，请重试 | 重新生成 key 并重试 |
| `NO_SELECTED_IMAGE` | 未选择图片就生成视频脚本 | 请先选择一张图片 | 跳转到图片候选区 |
| `NO_SELECTED_VIDEO` | 查询已选视频但还未选择 | 请先选择一个视频候选 | 保持当前步骤 |
| `MISSING_SELECTIONS` | 最终合成前有 shot 未选择视频 | 请先完成所有镜头的视频选择 | 高亮未完成 shot |
| `STALE_BASE_VERSION` | 编辑视频脚本时版本过旧 | 内容已更新，请刷新后再编辑 | 重新拉取脚本 |
| `STALE_SCRIPT` | 用过期脚本创建视频 batch | 当前脚本已过期，请重新确认 | 拉取 active script |
| `NOT_READY` | 下载 final video 但文件未生成 | 视频仍在生成中 | 继续轮询 |
| `NOT_IMPLEMENTED` | 调用了未完成列表接口 | 该能力暂未开放 | 隐藏入口或 fallback |
| `DISABLED_IN_THIS_ENV` | 测试清理接口在当前环境关闭 | 当前环境不支持清理测试数据 | 不展示给普通用户 |
| `404` | workspace/shot/job 不存在 | 项目不存在或已被清理 | 返回列表页 |
| `400` | 参数校验失败 | 请检查输入后重试 | 标记表单字段 |
| `500` | 服务异常 | 服务暂时不可用，请稍后重试 | 允许重试 |

## 文案原则

- 用户文案不要暴露数据库、Zod、provider 等技术词。
- 可恢复错误要提供下一步，例如“请选择图片”。
- 不可恢复错误要提供退出路径，例如“返回项目列表”。

