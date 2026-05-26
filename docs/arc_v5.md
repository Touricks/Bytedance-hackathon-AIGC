# Daireel V1 Current Code Architecture

> Snapshot date: 2026-05-26
>
> This document records the current worktree structure and the responsibilities of each code directory. It complements `docs/architecture.md` and the archived r4 architecture doc; it focuses on the V1 workspace pipeline now present in code.

## 1. Repository Topology

```text
Bytedancehack/
├── apps/
│   ├── server/          Fastify API, persistence boundary, workspace orchestration, job processors
│   └── web/             React V1 workspace UI
├── packages/
│   ├── ai/              Provider clients, prompts, real/mock workflow builders, trace helpers
│   ├── shared/          Shared domain types, Zod schemas, DTOs, job types, deterministic compilers
│   └── config/          Shared ESLint, Prettier, TypeScript config packages
├── docs/                Architecture, PRDs, bug backlog, agent metadata, archived research
├── infra/               Local Docker dependencies
├── storage/             Local runtime artifacts: traces and uploads
├── CONTEXT.md           Domain language and glossary
└── AGENTS.md            Repo-specific agent instructions
```

The current implementation is a TypeScript monorepo managed by `pnpm` and Turbo. `apps/server` is a modular monolith; `packages/ai` and `packages/shared` are consumed by the server and tests. Postgres is the business fact source. Local workspace folders carry recovery manifests and local trace files, but they are not the database of record.

## 2. Runtime Flow

```text
apps/web
  -> apps/server Fastify REST API
  -> Postgres via apps/server/src/db/client.ts
  -> packages/ai workflows/providers for model calls
  -> local workspace .daireel metadata + trace files
  -> Seedance final video job/archive paths
```

V1 workspace flow:

```text
workspace selection/init
  -> material import / material intake
  -> product brief
  -> UGC storyboard
  -> video shotprompt
  -> Seedance video generation
  -> preview/export
  -> structured feedback routing back to brief/storyboard/shotprompt
```

The active server/web surface no longer exposes the V0 `creative-blueprint` or `POST /api/creation/jobs` flow. V0 `GeneratedScript` / `CreativeBlueprint` code remains only inside package-level legacy schemas, fixtures, and compatibility tests; it is not an active workspace prompt source.

## 3. apps/server

`apps/server` owns HTTP APIs, config loading, DB access, job state, workspace lifecycle, and final orchestration.

```text
apps/server/
├── src/
│   ├── app.ts
│   ├── main.ts
│   ├── common/
│   ├── db/
│   ├── jobs/
│   ├── modules/
│   │   ├── creation/
│   │   ├── material/
│   │   ├── pipeline/
│   │   ├── script/
│   │   └── workspace/
│   └── test/
└── package.json
```

### Entry And Configuration

- `src/main.ts`: server process entrypoint.
- `src/app.ts`: builds Fastify, registers CORS, static upload routes, API controllers, and DB lifecycle hooks.
- `src/common/config.ts`: loads `.env`, validates required runtime config, resolves upload/workspace paths.
- `src/common/errors.ts`: converts thrown errors into HTTP-facing errors.
- `src/common/image-validation.ts`: validates raster image bytes before provider use.
- `src/common/trace.ts` and `src/common/logger.ts`: server-side trace/log helpers.

### Persistence

- `src/db/client.ts`: Postgres client and repository-style DB methods. It persists products, assets, scripts, storyboard shots, generation jobs, workspaces, workspace artifacts, feedback, and video export records.
- `src/db/schema/schema.sql` and `schema.ts`: SQL schema source and TypeScript schema mirror.

Postgres is the fact source for IDs, statuses, artifacts, jobs, and workspace recognition. Local files are recovery and asset storage, not authority.

### Jobs

- `src/jobs/queue.ts`: queue abstraction; Redis/BullMQ is optional when enabled.
- `src/jobs/job-state.ts` and `job.types.ts`: generation job state helpers and types.
- `src/jobs/processors/media-generate.processor.ts`: final video generation processor; calls Seedance provider and records video output.
- `src/jobs/seedance-image-input.ts`: resolves image inputs for Seedance, including local upload conversion and validation.

### API Modules

- `modules/material`: direct product-image registration/upload API retained for provider smoke and compatibility.
- `modules/creation`: job detail hydration API; it exposes `GET /api/jobs/:jobId` only.
- `modules/script`: script read/write module for persisted blueprint/script entities.
- `modules/pipeline`: read-only contract registry API for V1 pipeline metadata.
- `modules/workspace`: V1 workspace API and orchestration.

### Workspace Module

`modules/workspace` is the main V1 surface.

- `workspace.controller.ts`: Fastify routes for workspace init/list/status, material upload, material intake, brief/storyboard/shotprompt propose and approve, video generation, feedback routing.
- `workspace.service.ts`: core V1 workflow orchestration. It resolves workspace identity, reads/writes `.daireel/workspace.json`, collects material candidates, calls AI workflows, persists workspace artifacts, computes next action, and starts video jobs.
- `workspace.schema.ts`: request and manifest schemas.
- `workdir-picker.ts`: local directory picker abstraction used by the desktop/dev flow.
- `*.api.test.ts`: API coverage for init, status, historical resume, real provider metadata, material filtering, prompt preview, approvals, and feedback routing.

Current prompt-routing constraints:

- Workspace material upload writes managed files under `.daireel/materials/`, with root-directory scanning retained as an import fallback.
- Ark text builders use strict `response_format` for material intake, product brief, storyboard, shotprompt, and feedback route.
- Video generation requires `job.payload.shotprompt`; the queue rejects V1 jobs that do not carry a valid approved `ShotPromptArtifact`.

## 4. apps/web

`apps/web` is the React frontend for the V1 workspace experience.

```text
apps/web/
├── public/
├── src/
│   ├── main.tsx
│   ├── styles.css
│   ├── routes/
│   ├── features/
│   │   └── creation/
│   └── lib/
│       ├── api/
│       ├── job/
│       └── ...
└── package.json
```

### Entry And App Shell

- `src/main.tsx`: React entrypoint.
- `src/routes/App.tsx`: current V1 workspace UI. It handles workspace selection/resume, material import, four builder cards, artifact forms, prompt preview, Seedance launch, feedback route display, and preview/export.
- `src/routes/App.render.test.ts`: render-level checks for the V1 shell, compact material strip, prompt preview, and progress metadata.
- `src/styles.css`: global app styling.

### Features

- `features/creation/JobProgress.tsx`: user-facing generation progress plus folded developer metadata such as workspaceId, scriptId, jobId, raw status, runtime mode, provider, and next endpoint.
- `features/creation/VideoPreview.tsx`: final video preview/export and feedback submission UI.

### Client Libraries

- `lib/api/client.ts`: typed fetch client for server APIs. It exposes the V1 workspace APIs and job detail hydration.
- `lib/job/useGenerationJob.ts`: polling hook for generation job details.

Users select or open a local work directory, then resume or advance the recognized workspace.

## 5. packages/ai

`packages/ai` is server-only model integration and pipeline logic. UI code should not import it.

```text
packages/ai/src/
├── contracts/
├── legacy/
├── probes/
├── prompts/
├── providers/
├── schemas/
├── smoke/
├── trace/
├── workflows/
├── env.ts
└── index.ts
```

### Contracts

- `contracts/pipeline.contracts.ts`: active pipeline step registry and versions for material intake, product brief, storyboard, shotprompt, feedback route, and video export.
- `contracts/response-formats.ts`: structured output response format definitions for Ark text builders.

### Providers

- `providers/ark-text.provider.ts`: OpenAI-compatible Ark text client boundary. This is where text provider request shape, trace events, and response parsing live.
- `providers/seedance-video.provider.ts`: Ark-backed Seedance video provider, task creation, polling, final URL handling, and trace events.
- `providers/provider-config.ts`: resolves Ark/OpenAI/Seedance provider config from environment.
- `provider-boundary.guard.test.ts`: guards against bypassing provider modules.

### Prompts

- `prompts/material-intake.prompt.ts`: material tagging and material prompt preview.
- `prompts/product-brief.prompt.ts`: product brief generation and repair prompts.
- `prompts/storyboard.prompt.ts`: UGC storyboard generation prompt.
- `prompts/shotprompt.prompt.ts`: Seedance-ready shotprompt builder prompt.
- `prompts/feedback-route.prompt.ts`: structured 成片反馈路由 prompt; it chooses the target artifact and does not rewrite artifacts directly.
- `prompts/video.prompt.ts`: final Seedance video prompt composition from approved `ShotPromptArtifact`; V0 `GeneratedScript` prompt composition is legacy-only.
- `prompts/creative-blueprint.prompt.ts`: legacy V0 creative blueprint prompt path retained for package compatibility only.

Repo instruction: Seedance-facing prompts should be built in Chinese.

### Workflows

- `workflows/material-intake.workflow.ts`: tags scanned workspace material and merges model tags back into material artifacts.
- `workflows/product-brief.workflow.ts`: generates product brief, includes repair behavior.
- `workflows/storyboard.workflow.ts`: generates storyboard and validates against shared artifact schema.
- `workflows/shotprompt.workflow.ts`: generates provider-ready shotprompt artifact.
- `workflows/feedback-route.workflow.ts`: calls Ark with `feedback_route_v1` response format and validates the route decision.
- `workflows/creative-blueprint.workflow.ts` and `regenerate-shot.workflow.ts`: V0/legacy blueprint and shot regeneration paths retained for package-level compatibility tests.

### Probes, Smoke, Trace

- `probes/*`: standalone provider probes for text/image/video boundaries.
- `smoke/real-providers.ts`: explicit real-provider smoke checks.
- `trace/trace-log.ts`: JSONL trace logger used by workflows and provider calls.

## 6. packages/shared

`packages/shared` contains code that can safely cross server/web/package boundaries.

```text
packages/shared/src/
├── constants/
├── dto/
├── jobs/
├── schemas/
├── shotprompt/
├── types/
└── index.ts
```

- `schemas/artifacts.ts`: V1 artifact schemas for material intake, product brief, storyboard, shotprompt, and feedback route.
- `schemas/creative-blueprint.ts` and `schemas/script.ts`: legacy V0 blueprint/script schemas.
- `types/domain.ts`: domain models including assets, scripts, jobs, and creative workspaces.
- `jobs/types.ts`: shared job payload/result types.
- `constants/stages.ts`: shared stage constants.
- `shotprompt/compiler.ts`: deterministic compiler from approved storyboard to shotprompt artifact.
- `index.ts`: public export surface.

Shared package rule: keep provider SDKs and server-only dependencies out of this package.

## 7. packages/config

`packages/config` centralizes tooling config:

- `eslint/index.js`
- `prettier/index.cjs`
- `typescript/base.json`

It is intended to be imported by workspace packages. If formatter commands fail, check whether root config points at this package correctly.

## 8. docs

`docs` contains active docs, archived design, agent metadata, and backlog notes.

```text
docs/
├── architecture.md
├── arc_v5.md
├── erd.md
├── agents/
├── 0525-cli-design/
├── 0526-discussion/
│   ├── arc/
│   ├── archived/
│   └── bugs/
├── archived/
├── deep_research/
└── reference/
```

- `architecture.md`: short architecture entrypoint.
- `arc_v5.md`: this current code-structure responsibility map.
- `erd.md`: persisted data model reference.
- `agents/`: issue tracker, triage labels, domain doc routing.
- `0525-cli-design/`: PRD and builder template source docs.
- `0526-discussion/arc/`: active discussion architecture notes.
- `0526-discussion/bugs/`: current bug backlog items that are not yet implemented.
- `archived/`: older architecture, discussion, and issue history.
- `reference/`: provider/API reference notes.

## 9. infra and storage

### infra

- `infra/docker-compose.yml`: local Postgres, Redis, and MinIO.
- Postgres is required for business facts.
- Redis is optional queue transport.
- MinIO exists for local object-storage experimentation; current V1 workspace material flow still uses local files.

### storage

`storage/` is local runtime data, not product source code. Repo-local `storage/trace` is deprecated for current product traces; the current system writes product traces to Postgres-backed workspace state plus the selected workspace's `.daireel/trace/events.jsonl`.

- `storage/trace/tests/*`: deprecated test trace JSONL output.
- `storage/trace/users/*`: deprecated user/session trace JSONL output.
- `storage/uploads`: local uploaded assets served by configured upload routes.

Local creative workspaces can also contain their own `.daireel/` directory outside repo storage:

```text
<workspace>/
├── .daireel/
│   ├── workspace.json
│   ├── trace/events.jsonl
│   └── videos/
└── user material files
```

Current backlog proposes moving system-managed workspace material into `.daireel/materials/`.

## 10. Boundaries and Ownership Rules

- Frontend calls `apps/server` APIs through `apps/web/src/lib/api/client.ts`; it does not call provider SDKs directly.
- Server modules call `packages/ai` workflows/providers; they should not construct model clients inline.
- `packages/ai` can depend on `packages/shared`; `packages/shared` should not depend on `packages/ai`.
- Postgres owns workspace/artifact/job facts; local workspace manifests support recognition and recovery.
- Provider trace belongs at provider/workflow boundaries, not in UI components.
- V1 exposes one current creative line per workspace; multi-script-per-directory remains future scope.
