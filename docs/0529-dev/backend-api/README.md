# Backend API 文档

本目录给后端维护者使用，目标是把“接口契约、实现位置、数据边界、测试责任”放在一起。后端文档不替代代码，但要让新增/修改接口时知道应该同步哪些地方。

## 文件说明

| 文件 | 用途 |
|---|---|
| `route-index.md` | route、controller、service、test 的索引 |
| `contract-boundaries.md` | 公开 API、内部实现、环境相关路由的边界 |
| `data-model-map.md` | API 到 DB table / artifact / job 的关系 |
| `implementation-notes.md` | 后端实现注意事项和设计意图 |
| `zod-contracts.md` | 请求/响应 schema 来源和维护规则 |

## 后端接口维护三件套

| 层 | 作用 | 示例 |
|---|---|---|
| 代码注释 | 解释为什么这么做 | 为什么 directory lookup 是只读轻量接口 |
| OpenAPI | 定义对外契约 | `GET /api/workspaces/{workspaceId}/directory` 返回结构 |
| 测试用例 | 证明契约真的成立 | workspace 存在返回目录，不存在返回 404 |

## 新增接口检查清单

- 在 controller 中注册 route。
- 在 service 中封装业务逻辑。
- 如果有请求体，优先补 Zod schema。
- 补 API 测试，至少覆盖成功和关键失败场景。
- 同步 `../frontend-api/openapi.yaml`。
- 如影响产品体验，同步 `../product-api/status-and-copy.md` 或 `../product-api/risks-and-gaps.md`。
- 如影响 prompt 输入输出，同步 `../prompt-api/`。
