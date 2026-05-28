# Bug 009: Workspace 素材上传过大与保存路径问题

## Summary

当前“导入到当前工作目录”存在两个问题：

- 前端将文件转成 base64 JSON 后 POST 到 `/api/workspaces/materials`，实际会先撞到 Fastify request body limit，用户看到的是 `Request body is too large`。
- 后端将上传文件保存到 workspace 根目录，不符合“系统管理素材应落到 `.daireel/materials/`”的设计方向。

该问题先进入 bugs backlog，等待下一批次与其他素材管理问题一起处理。

## Current Behavior

- 前端 `uploadWorkspaceMaterial` 将 `File` 转成 base64 后发送 JSON 请求到 `/api/workspaces/materials`。
- 后端 decoded 后按 50MB 做业务限制，并写入 `workspace.localPath/<filename>`。
- 素材清点扫描 workspace 根目录，过滤支持的图片、视频、文本文件。
- 前端 `accept="image/*,video/*,.txt,.md"` 只是浏览器文件选择器提示，不是最终校验。

## Bug

- base64 JSON 会放大请求体，真实可上传文件大小远小于 50MB。
- `Request body is too large` 是框架层错误，不是业务层可读错误。
- 上传素材与用户原始文件混在 workspace 根目录，后续删除、失效、鉴权边界不清晰。

## Target Solution

- `/api/workspaces/materials` 改为 multipart 上传。
- 单文件业务限制保持 50MB，以原始文件字节计算。
- 文件保存到 `<workspace>/.daireel/materials/<filename>`。
- `status`、`material-intake`、builder 输入、素材 URL serving 全部只读取 `.daireel/materials/`。
- 同名文件采用确定性去重命名，例如 `name-1.ext`、`name-2.ext`，避免静默覆盖。
- 不支持类型、超限、非法文件名返回明确业务错误。

## Test Plan

### Backend

- multipart 上传 `.txt`、图片、视频成功。
- 上传 50MB+1 文件返回明确业务错误。
- `.pdf`、隐藏文件、路径型文件名被拒绝。
- 同名文件去重保存，不覆盖旧文件。
- 素材清点只扫描 `.daireel/materials/`。

### Frontend

- 上传使用 `FormData`，不再 base64 JSON。
- 失败消息显示业务原因。
- 导入条保持紧凑，不渲染文件名列表。

## Assumptions

- V1 builder 只读 `.daireel/materials/`。
- workspace 根目录中的用户原始文件不自动进入素材链路。
- 视频归档仍使用 `.daireel/videos/`，不受本 bug 影响。
