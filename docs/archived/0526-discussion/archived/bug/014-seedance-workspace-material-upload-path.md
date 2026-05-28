# Bug 014: Seedance job 提交时 workspace 素材路径被误判为非法上传路径

## Summary

用户在提交 Seedance 成片任务时，生成进度进入 `failed`，错误为：

```text
Invalid upload path for Seedance product image
```

该错误不是 provider 权限问题，也不是素材文件缺失，而是本地图片 handoff 的路径校验仍假设产品图一定来自 `UPLOAD_DIR`。V1 workspace 链路中，产品图实际来自：

```text
<workspace>/.daireel/materials/<ref>
```

而对外 URL 是：

```text
/uploads/workspace-materials/<workspaceId>/<ref>
```

两者都属于系统管理素材，但不在 `UPLOAD_DIR` 下，因此旧校验把它误判为非法上传路径。

## Root Cause

`resolveSeedanceImageInput()` 会把本地图片读取成 `data:image/...;base64,...` 再交给 Seedance。它原先只允许 `metadata.storagePath` 位于 `config.uploadDir` 内，用于防止普通上传路径穿越。

但 workspace 成片链路中，`createScriptBundleForShotPrompt()` 创建的 `product_image` asset 使用：

- `url`: `/uploads/workspace-materials/<workspaceId>/<ref>`
- `metadata.storagePath`: `<workspace>/.daireel/materials/<ref>`

该 `storagePath` 是合法的 workspace-managed material，但不属于 `UPLOAD_DIR`，所以在进入 Seedance provider 前失败。

## Fix

- `resolveSeedanceImageInput()` 继续保留普通上传目录的 `UPLOAD_DIR` 校验。
- 对 `/uploads/workspace-materials/<workspaceId>/<ref>` 增加受控例外：
  - `metadata.storagePath` 必须指向 `.daireel/materials/<ref>`。
  - `storagePath` basename 必须与 URL 中的 `<ref>` 一致。
  - hidden/path 型 ref 仍然拒绝。
  - 任意外部路径仍然返回 `Invalid upload path for Seedance product image`。

## Regression Tests

- `resolveSeedanceImageInput`
  - workspace-managed material outside `UPLOAD_DIR` 可以被转换为 data URL。
  - 伪造 workspace material URL 但 storagePath 指向外部目录时仍被拒绝。

- `workspace API`
  - 在 fake Seedance real-provider 配置下，`/api/workspaces/video/generate` 能将 `.daireel/materials` 中的产品图转换成 data URL 并提交给 Seedance provider。

## Follow-Up

- 该修复只解决路径校验问题。
- Bug 013 中关于最终 Seedance prompt 是否应直接使用 `shotprompt.prompt` 的问题仍需单独确认。
