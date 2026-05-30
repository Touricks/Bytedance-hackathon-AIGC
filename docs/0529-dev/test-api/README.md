# Test API 文档

本目录给测试和联调使用。目标是说明如何用 Postman 和自动化测试验证接口主流程、异常场景和回归风险。

## 文件说明

| 文件 | 用途 |
|---|---|
| `bytedancehack-api.postman_collection.json` | Postman Collection |
| `postman-guide.md` | Postman 导入、变量配置和运行顺序 |
| `smoke-flow.md` | 最小冒烟流程 |
| `test-matrix.md` | 按模块组织的正常/异常测试矩阵 |
| `regression-cases.md` | 回归测试关注点 |
| `fixtures/` | 测试数据说明 |

## 测试关注点

- 主流程是否能从 workspace 创建走到 final video。
- 每个生成任务是否正确要求 `Idempotency-Key`。
- 关键前置条件缺失时是否返回预期错误。
- workspace directory lookup 是否存在成功和 404 场景。
- 当前已知未实现接口是否稳定返回 `501`。

