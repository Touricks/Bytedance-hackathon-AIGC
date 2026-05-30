# Contract Boundaries

本文定义哪些内容属于前后端稳定契约，哪些属于后端内部实现。

## 公开契约

以下内容变更需要同步前端和 OpenAPI：

- HTTP method 和 path。
- path/query/header/body 参数。
- 成功响应结构。
- 错误码和关键 HTTP status。
- 状态枚举，例如 `ShotStatus`、`NextAction`、workspace status。
- 幂等要求，例如 `Idempotency-Key`。

## 后端内部实现

以下内容通常不直接暴露给前端：

- DB 表结构和 SQL。
- Queue job payload 细节。
- provider 原始请求和响应。
- 文件系统内部布局，除非接口明确返回。
- trace metadata 的非稳定字段。

## 环境相关路由

`UPLOAD_URL_PREFIX` 下的 legacy static routes 由环境变量决定，不建议作为稳定前端契约。稳定读取路径优先使用：

- `GET /api/workspaces/:workspaceId/materials/*`
- `GET /api/workspaces/:workspaceId/videos/*`
- `GET /api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file`

