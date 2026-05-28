# Workspace Entry V1 Architecture

## Decision: hide managed workspace creation from the V1 UI

V1 keeps the server-side managed workspace creation API, but the user-facing UI should not expose a separate "new managed workspace" form.

The current service behavior is:

- `WORKSPACE_DIR` is optional.
- If `WORKSPACE_DIR` is not configured, the server resolves the managed workspace root as `UPLOAD_DIR/workspaces`.
- `POST /api/workspaces` can create a Fastify-managed workspace under that root.

The V1 product behavior is:

- The user starts from a local working directory.
- If the user needs a new working directory, they create or select it through the OS directory picker.
- The frontend then calls `/api/workspaces/init` to initialize or resume that directory.

## Rationale

The V1 mental model is "develop based on one working directory," not "choose between a local directory and a server-managed directory namespace."

Showing both `工作目录入口` and `工作目录名称` on the first screen makes users think both are required inputs. It also exposes `workspace root` implementation details that are only relevant to the backend and tests.

## UI Rule

Do not show these controls in the V1 user-facing workspace entry:

- `工作目录名称`
- `新建`
- Any input whose only purpose is to seed `POST /api/workspaces`

The UI may keep:

- recent/history workspace selector
- `选择工作目录`
- folded manual path fallback
- `刷新状态`

## API Rule

Keep `POST /api/workspaces` available for now.

Reasons:

- existing tests and internal tooling may depend on it
- future versions may reintroduce it as an advanced or empty-state helper
- hiding the UI solves the current product confusion without removing backend capability

## Documentation Rule

Future PRDs and issues should treat managed workspace creation as an internal/backoffice capability unless explicitly scoped otherwise.

When a document discusses the V1 workspace entry, the default path should be:

1. user selects or creates a local folder through the OS picker
2. frontend calls `/api/workspaces/init`
3. backend writes or validates `.daireel/workspace.json`
4. UI resumes workspace state from Postgres and local `.daireel`

