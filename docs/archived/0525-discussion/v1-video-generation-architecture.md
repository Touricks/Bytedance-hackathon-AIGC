# V1 Video Generation Architecture Discussion

> Date: 2026-05-25
> Status: discussion note
> Source context: `docs/0525-cli-design/cli-prd.md`, `docs/0525-cli-design/builder-templates/`, current V0 implementation, and the local `events.jsonl` trace sample.

## Scope

This note records the current direction for evolving the V0 commerce-video system into the V1 multi-workspace, editable artifact, trace-local workflow.

V1 is an evolution of the existing V0 system, not a separate rewrite. The core stack remains:

- React web app for merchant review and editing.
- Local Node/Fastify backend for orchestration and provider boundaries.
- Postgres as the business fact source.
- Docker-hosted Postgres in the current local setup.
- Local workspace files only for workspace manifest and trace.

## Current Agreement

### Workspace, Script, And Job Identity

- `workspaceId` identifies the local merchant project folder.
- `scriptId` identifies the current creative line / creative blueprint anchor. It may be preallocated before blueprint content exists.
- `jobId` identifies an asynchronous final-video generation attempt. It is important because final-video progress and result retrieval are anchored by `jobId`.
- V1 exposes one current creative line per workspace. It does not provide history browsing or multiple script switching.
- `workspaceId` and `scriptId` remain separate so a future single workspace can contain multiple scripts / creative lines without changing the identity model.

### Local Workspace Files

V1 does not use `.daireel/*.json` as the business fact source.

The minimum local manifest is:

```json
{
  "schemaVersion": 1,
  "workspaceId": "wk_...",
  "currentScriptId": "script_...",
  "currentJobId": "job_...",
  "traceFile": ".daireel/trace/events.jsonl"
}
```

The local manifest is a recovery pointer for agents and CLI flows. Postgres remains the source of truth.

### Trace

V1 trace should be workspace-local:

```text
.daireel/trace/events.jsonl
```

Each event should include `workspaceId`, `scriptId`, and optional `jobId`.

Trace keeps V0's `kind` field rather than introducing both `event` and `message`. Machine-readable events use `kind`; human-readable detail belongs in `meta` only when it adds information.

Rules:

- Model-related events must include `provider` and `model`.
- Local preparation events may omit `provider` and `model`.
- Mock mode should still write `provider: "mock"` and `model: "mock"` for model-related events.
- Sensitive payloads remain redacted: API keys, bearer tokens, and raw base64 image/audio/video payloads must not be written to trace.

## Builder Artifact Direction

The `builder-templates/` design remains valuable, but its file-based contract must be adapted to Postgres.

V1 should define one canonical JSON shape for each artifact:

- `assets`
- `brief`
- `storyboard`
- `shotprompt`
- `feedbackRoute`

Each shape should have:

- a Zod schema in shared code;
- an example JSON fixture;
- a Postgres read/write adapter;
- a web-form adapter that renders the stored JSON into editable form fields;
- trace events for model request / response / parse / validation / approval.

Business flow:

1. Backend receives model output.
2. Backend validates it against the artifact schema.
3. Backend writes the validated artifact into Postgres.
4. Frontend reads through the adapter.
5. Frontend renders the artifact as a concrete editable form.
6. User edits and approves the form.
7. Backend persists the approved artifact and advances the creative-line state.

Redis should not be the artifact fact store. It can be used for job queueing, transient progress, locks, or cache, but the accepted model output and user-approved artifact must be written to Postgres.

## V1 Creative Layers

V1 should use four creative layers before final-video generation:

0. Material intake: deterministic scan and validation plus optional multimodal tagging. See `docs/0525-cli-design/builder-templates/0-material-intake.md`.
1. Product brief.
2. UGC storyboard.
3. Video shotprompt.
4. Feedback router after a generated video exists.

Material intake is not optional in the architecture. It creates the asset list that downstream artifacts reference.

Because the backend runs on the local machine while Postgres is in Docker, local file access is simpler than a remote deployment. Even so, V1 should be explicit about which process scans files and which process stores assets:

- CLI or backend may scan local workspace files in V1.
- Postgres stores the accepted asset manifest and asset records.
- The final provider handoff should use assets that the backend can read and convert into the provider-accepted reference format.

## Video Generation Chain

The current V0 chain is:

```text
CreativeBlueprint
  -> buildTwelveSecondVideoPrompt
  -> resolveSeedanceImageInput
  -> generateVideoWithSeedance
  -> async task polling
  -> final_video Asset
```

V1 should become:

```text
approved assets
  -> approved brief
  -> approved storyboard
  -> approved shotprompt
  -> ShotPromptCompiler
  -> Seedance task
  -> GenerationJob polling
  -> final_video Asset
```

`ShotPromptCompiler` is required. It should be deterministic code, not another LLM step. It compiles the approved `shotprompt` into the final Seedance prompt and provider parameters.

The compiler should carry forward:

- `must_preserve`
- `constraints`
- selected primary product asset
- duration
- aspect ratio
- camera choice
- product moment
- demo action
- ending / CTA framing

## Seedance Input And TTS Questions

Current V0 code sends a text prompt plus one `image_url` as the first frame. It hardcodes duration and ratio in the provider request.

User view for V1:

- Seedance may accept video input.
- V1 should investigate whether Seedance can generate video and TTS / voiceover together.
- V1 does not need subtitle rendering.
- V1 does need TTS if feasible.

Current verification state:

- The Ark API documentation index includes video generation APIs and image generation APIs under the same API reference page.
- The accessible public Seedance documentation snippets found during discussion describe video generation as asynchronous and mention text-to-video / image-to-video.
- A public Seedance product page claims audio-video synchronization and voice/dialogue capabilities, but that is product marketing text, not yet a confirmed Ark API request contract.
- Volcengine has separate TTS / speech synthesis documentation.
- Therefore, "Seedance handles TTS together with video generation" is not confirmed as an implementation fact yet.

Implementation stance:

- Do not design V1 around subtitle rendering.
- Keep `voiceover` as approved script content.
- Add a provider spike for whether Seedance's Ark video task API accepts dialogue / audio / voice fields.
- If not supported, implement TTS as a separate provider step and keep audio mixing out of the first V1 slice unless absolutely required for demo.

Relevant docs to verify:

- `AGENTS.md` Volcengine reference: https://www.volcengine.com/docs/82379/1494384?lang=zh
- Ark video task creation: https://www.volcengine.com/docs/82379/1520757?lang=zh
- Ark video task query: https://www.volcengine.com/docs/82379/1521309?lang=zh
- Volcengine TTS product/docs entry: https://www.volcengine.com/product/tts

## Feedback Loop

Feedback does not require a history UI.

V1 rule:

- A new `jobId` creates a new video attempt.
- The previous `jobId` and its final video URL must not be overwritten.
- The workspace can still point to the current / latest `jobId`.
- Users can retrieve earlier videos by `jobId` even if the workspace current pointer moves forward.

This preserves generated video access without committing V1 to full artifact history browsing.

## Main Architecture Risks

1. File contract drift: `builder-templates/` still talks about `.daireel/*.json`, while V1 wants Postgres truth.
2. Artifact schema sprawl: without canonical examples and adapters, web forms and model outputs will drift.
3. Redis misuse: Redis can support async workflow, but cannot become the accepted artifact store.
4. Provider capability uncertainty: Seedance video input and integrated TTS must be proven with the real API contract or smoke tests.
5. ShotPromptCompiler absence: without this module, the approved `shotprompt` cannot reliably affect final generation.
6. Job/result overwrite risk: feedback regeneration must create a new `jobId` and preserve previous final-video assets.
7. Trace migration: V0 trace is batch-scoped; V1 needs workspace-local trace with consistent `provider/model`.

## Recommended Next Decisions

1. Define the canonical JSON examples for `assets`, `brief`, `storyboard`, `shotprompt`, and `feedbackRoute`.
2. Decide whether these artifacts initially live in `Script.rawJson.artifacts` or dedicated tables.
3. Add a Postgres artifact adapter interface before building the UI forms.
4. Add a real provider spike for Seedance video input and audio / TTS support.
5. Build `ShotPromptCompiler` as a pure, tested module before changing the video job processor.
