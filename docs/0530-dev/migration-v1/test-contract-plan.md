# Test And Contract Migration Plan

## OpenAPI 更新

更新 `docs/0530-dev/openapi.yaml`：

- `POST /api/workspaces` 改为 logical workspace create。
- 删除目标契约中的 `GET /api/workspaces/{workspaceId}/directory`。
- 新增：
  - `GET /api/workspaces/{workspaceId}/storage`
  - `POST /api/workspaces/{workspaceId}/storage/bind`
- `GET /api/workspaces` response 增加每个 workspace 的 `storage.bound/kind/localPath/s3` summary。
- `WorkspaceStatusResponse.nextAction` 增加 `BIND_STORAGE`。
- `POST /api/workspaces/materials` 标注需要 active storage binding。
- components 增加 `StorageBinding`, `StorageBindRequest`, `StorageConflictError`。

## Postman 更新

更新 `docs/0530-dev/bytedancehack-0530.postman_collection.json`：

1. `Create Workspace`
   - `POST /api/workspaces`
   - 保存 `workspaceId`。

2. `Bind Local Storage`
   - `POST /api/workspaces/{{workspaceId}}/storage/bind`
   - body 使用变量 `workspaceDirectory`。
   - 保存 `storageKind`、`storageLocalPath`。

3. `Get Storage`
   - 断言 `bound=true`。

4. `Workspace Status`
   - 绑定前 negative case 断言 `nextAction=BIND_STORAGE`。
   - 绑定后主流程继续 material/artifact/shot workflow。

5. Regression negative cases
   - 同 workspace 绑定不同 local path -> `WORKSPACE_STORAGE_ALREADY_BOUND`。
   - 不同 workspace 绑定同 local path -> `STORAGE_ALREADY_BOUND`。
   - 未绑定 workspace 上传素材 -> `STORAGE_NOT_BOUND`。

## Server Tests

新增或更新：

- `workspace.api.test.ts`
  - create logical workspace 不创建目录。
  - list workspaces 从 DB 返回。
  - bind local 成功和幂等。
  - duplicate binding 冲突。
  - unbound status 返回 `BIND_STORAGE`。

- `workspace-storage.unit.test.ts`
  - local path normalize。
  - S3 target validation。
  - active binding uniqueness。

- `shot.workflow.api.test.ts`
  - 未绑定 storage 时 image/video workflow blocked。
  - 绑定后现有 rounds/select 流程不回归。

- worker tests
  - image/video generated URL 转存使用 active binding。
  - missing binding 时 job failed with stable error。

## Validation Commands

```sh
pnpm --filter @aigc-video/server typecheck
pnpm --filter @aigc-video/server test
```

真实 provider 前置清理：

```sh
pnpm db:clear -- --yes
pnpm redis:clear -- --yes
```
