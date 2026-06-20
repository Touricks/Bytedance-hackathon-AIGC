# Trace 可见性与 S3 迁移前置方案

Status: Proposed
Owner: Project team
Created: 2026-06-20
Applies To: Trace service, provider call trace, workspace storage, S3 migration
Blocks: Workspace/dashboard S3 migration that would hide trace evidence

## Summary

在继续推进 S3 存储前，需要先处理 trace 可见性。当前 trace 体系有两层：

- DB trace: `trace_events` 表，通过 `GET /api/workspaces/:workspaceId/traces` 和 `GET /api/shots/:shotId/traces` 可查询。
- workspace-local file trace: `<workspaceDirectory>/.daireel/trace/events.jsonl` 和 `provider_call.jsonl`，用于本地测试和故障修复。

问题在于文件 trace 强依赖 `appendFile`。当 workspace storage 切到 S3 后，当前实现没有本地 workspace path 可追加，因此部分工作流 trace logger 会变成 `undefined`，本地 JSONL 镜像也会被跳过。业务要求 trace 必须可见，用于测试、排障和 provider 问题定位，所以 S3 迁移不能把 trace 可见性作为副作用牺牲掉。

## Current Reality

关键现状：

- `packages/ai/src/trace/trace-log.ts` 暴露 `FileTraceLogger.append(event)`，底层使用文件追加写 JSONL。
- `apps/server/src/modules/workspace/workspace.service.ts` 的 `createWorkspaceTraceLoggerForWorkspace` 只在 active binding 是 `LOCAL` 时返回 logger；S3 binding 下返回 `undefined`。
- `apps/server/src/modules/trace/trace.service.ts` 会先写 `trace_events`，再 best-effort mirror 到 workspace-local `events.jsonl`；非 LOCAL binding 下直接跳过镜像。
- `apps/server/src/modules/trace/provider-call-trace.ts` 已经把 provider call 写入 DB，但只在 LOCAL binding 下追加 `provider_call.jsonl`。
- `scripts/README.md` 已记录当前存在 DB trace 和 workspace-local file trace 两种 store。

## Target State

目标不是让 S3 模拟文件 append，而是让 trace 写入抽象从“文件追加”升级为“append 风格接口 + 可替换 sink”：

- 调用方继续使用 `append(event)`，避免大面积改动 provider/workflow 代码。
- DB `trace_events` 成为产品和调试可见性的 source of truth。
- LOCAL workspace 继续 best-effort 写 `.daireel/trace/events.jsonl` 和 `provider_call.jsonl`，保留当前本地排障体验。
- S3 workspace 不写单个 append-only `events.jsonl` 对象；如果需要对象级归档，使用不可变 per-event object 或从 DB 导出的快照。
- Trace API 在 LOCAL 和 S3 binding 下都能看到同一类事件。

## Storage Decision

不要在 S3 上做“读整个 `events.jsonl` -> 追加一行 -> 覆盖写回”的伪 append。该方案会带来并发覆盖、读写放大、对象一致性和失败重试问题。

推荐分层：

| Layer | Role | Behavior |
|---|---|---|
| DB `trace_events` | 可见性 source of truth | 每个 trace event 写一行，API/UI 从这里查询。 |
| LOCAL JSONL mirror | 本地开发辅助 | LOCAL binding 下 best-effort append，不影响主流程。 |
| S3 trace archive | 可选归档 | 使用 per-event immutable object 或按需导出的 JSONL snapshot，不参与在线查询。 |

如果 S3 对象级 trace 是必须项，使用如下布局：

```text
workspaces/{workspaceId}/trace/events/{createdAt}-{traceEventId}.json
workspaces/{workspaceId}/trace/provider-calls/{createdAt}-{traceEventId}.json
```

列表、筛选和 UI 仍读取 DB。S3 对象仅用于离线审计或下载，不作为交互式查询索引。

## Proposed Trace Sink

新增一个服务端通用接口，替代 server 侧对 `FileTraceLogger` 的强依赖：

```ts
export interface TraceAppendLogger {
  append(event: TraceEventInput): Promise<void>;
}
```

服务端提供：

```ts
createWorkspaceTraceAppendLogger(workspace: CreativeWorkspace): TraceAppendLogger
```

该 logger 的 `append` 顺序：

1. 将 `TraceEventInput` 标准化为 `trace_events` row。
2. Redact data URLs, Bearer tokens, provider temporary URLs, and secrets.
3. 写入 DB。
4. LOCAL binding 下 best-effort mirror 到 JSONL。
5. S3 binding 下可选 best-effort 写 per-event object，失败只记录 warn，不阻断生成流程。

`packages/ai` 可保留 `createFileTraceLogger` 给脚本和 provider probe 使用；产品路径不再依赖文件 logger。

## Migration Plan

### Phase 0: Freeze Risky S3 Switches

- 暂停把 workspace 关键链路直接切到 S3 后就删除 local trace 依赖的做法。
- 明确 `docs/issues/in_process/006-010` 中的 dashboard/video S3 工作项必须排在 trace sink 后面验证。

### Phase 1: DB-Backed Append Logger

- 引入 `TraceAppendLogger` 类型，产品路径只依赖 `append(event)`。
- 修改 `createWorkspaceTraceLoggerForWorkspace` 或新增并迁移到 `createWorkspaceTraceAppendLogger`，让 S3 binding 下也返回 logger。
- workflow/provider 调用方不再因为 S3 binding 收到 `undefined` logger。
- `traceService.record` 和 append logger 共用一套 normalization/redaction 逻辑。

### Phase 2: Provider Call Trace Unification

- 保留 `recordProviderCallTrace` 现有 DB 写入。
- 将 provider call 的 LOCAL JSONL mirror 改成通用 mirror，不再把 LOCAL 当作是否记录 trace 的前置条件。
- 确认 provider call metadata 中包含排障所需字段：`jobId`, `shotId`, `batchId`, `candidateId`, `provider`, `model`, `status`, `attempt`, `latencyMs`, `promptHash`, `error`, URL summaries。

### Phase 3: S3 Archive Optional Layer

只有当测试和故障修复需要直接从对象存储取 trace 时，才启用 S3 archive。

- 新增配置，例如 `TRACE_S3_ARCHIVE_ENABLED=true`。
- 对每条 trace 写不可变 JSON object，而不是覆盖同一个 JSONL。
- 不要求前端或 API 从 S3 list 对象；API 继续查 DB。
- 可增加导出接口从 DB 流式导出 JSONL：

```text
GET /api/workspaces/:workspaceId/traces/export
```

### Phase 4: Backfill and Legacy Local File Import

现有 DB trace 已经可见，不需要强制回填。若历史详细 JSONL 只存在本地文件，可提供可重复运行的导入脚本：

```text
scripts/import-local-traces-to-db.mjs --workspace-id <id> --trace-file <path>
```

导入策略：

- 读取 `events.jsonl` 和 `provider_call.jsonl`。
- 计算 `event_hash = sha256(workspaceId + rawJsonLine)`。
- 已存在 hash 跳过，避免重复导入。
- 无法解析的行写入摘要，不中断整个导入。

如需长期支持该导入，建议 additive schema：

```sql
alter table trace_events add column if not exists event_hash text;
create unique index if not exists uniq_trace_events_workspace_event_hash
  on trace_events(workspace_id, event_hash)
  where event_hash is not null;
```

### Phase 5: Re-enable S3 Migration Work

完成以下验证后，再继续 dashboard/workspace S3 迁移：

- S3 binding 下 material intake/storyboard/shotprompt/image/video/final compose 关键 trace 都能通过 API 查到。
- real-provider provider call trace 在 S3 binding 下仍进入 DB。
- LOCAL binding 下 JSONL 文件仍可被本地测试和人工排障使用。
- S3 dashboard video migration 不再依赖 workspace-local trace 文件可写。

## Compatibility and Rollback

兼容性：

- Phase 1 可以不改 DB schema，先把新增 trace 字段放入 `metadata`。
- 如果后续增加 `event_hash` 或过滤列，应使用 nullable additive columns，旧代码可继续运行。
- 前端已有 trace API 不需要立即变化。

回滚：

- 如果 DB-backed append logger 出问题，可以临时回退到现有 LOCAL file logger；S3 workspace trace 可见性会恢复为 blocked 状态。
- S3 archive 是可选层，可通过配置关闭，不影响 DB trace。
- LOCAL JSONL mirror 是 best-effort，失败不应阻断生成任务。

## Tests

- Unit: S3 workspace binding 下 `createWorkspaceTraceAppendLogger` 返回 logger，并写入 `trace_events`。
- Unit: LOCAL binding 下 DB 写入和 JSONL mirror 都发生。
- Unit: S3 archive enabled 时写 per-event object，不覆盖同一个 key。
- Provider call: S3 binding 下 `recordProviderCallTrace` 写 DB 且 redaction 生效。
- API: `GET /api/workspaces/:workspaceId/traces` 在 LOCAL/S3 binding 下返回同类事件。
- Contract: `pnpm contract:frontend-backend` 覆盖 trace API path。
- Regression: `pnpm reset:dev -- --yes --no-dev` 仍说明不会删除 workspace `.daireel/trace/events.jsonl`。

## Docs To Update During Implementation

- `docs/core/architecture/backend.md`: Trace service 由 DB source of truth + optional mirrors 组成。
- `docs/core/architecture/security.md`: Trace redaction and S3 archive behavior.
- `docs/core/contracts/interface.md`: 如果新增 export API，需要补充 contract。
- `docs/core/contracts/openapi.yaml`: 如果新增 export API 或 response schema 字段，需要同步。
- `scripts/README.md`: 更新 trace locations，说明 S3 binding 下 DB API 是主要可见入口。

## Open Decisions

- 是否必须把 trace 归档到 S3 对象，还是 DB API 可见即可满足测试和故障修复。
- 是否在 P0 加 `event_hash` 去重列，还是只在 legacy import 脚本实现时再加。
- 是否需要前端 trace viewer 增强，以便测试人员不用直接调用 API。
