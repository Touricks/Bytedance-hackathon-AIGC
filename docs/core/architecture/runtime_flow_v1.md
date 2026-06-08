# Runtime Flow V1

Status: Accepted
Owner: Backend + Frontend
Last Updated: 2026-06-08
Applies To: End-to-end V3 command flow, async jobs, and recovery behavior
Depends On: `domain_v1.md`, `../contracts/interface.md`, `../contracts/openapi.yaml`
Blocks: API orchestration, frontend recovery, and async job implementation
Decision State: Accepted with assigned open decisions

## 1. Executive Summary

The primary runtime is a review-driven pipeline. Each workspace module can
propose a待审创作产物, and only approve promotes it to downstream input.
Shot-level media generation starts only after an approved 分镜生成要求 is
explicitly applied into a 分镜链路实例. Async media workers and orchestrators
write durable job/candidate/selection facts so the frontend can recover by
polling workspace status and round endpoints.

## 2. Happy Path

```text
create/bind workspace
-> POST prompt-requirements/propose
-> POST prompt-requirements/approve
-> POST materials
-> POST material-intake/propose
-> POST material-intake/approve
-> POST product-brief/propose
-> POST product-brief/approve
-> POST storyboard/propose
-> POST storyboard/approve
-> POST shotprompt/propose
-> POST shotprompt/approve
-> POST shot-sets
-> for each shot: image-prompts/propose -> image batch worker -> image select
-> for each shot after all images selected: video-scripts/propose -> video worker -> video select
-> POST final-videos
-> optional campaign-publications
```

Independent orchestrators:

```text
素材解读 review draft
-> POST one-click-final-videos
-> approve material-intake draft
-> auto propose/approve downstream modules
-> apply shot set
-> auto generate/select one image and one video candidate per shot
-> final compose
```

```text
active shot set
-> POST shot-image-auto-selections
-> skip shots with selected image
-> generate image batch for each missing shot
-> select first SUCCEEDED candidate with stable URL
```

## 3. Prompt Subject Rule Enhancement

Workspace module prompt assembly still combines subject prompt, runtime context,
and schema contract. The subject prompts for material-intake, product-brief,
storyboard, and shotprompt now include richer category, visible-fact, narrative,
visual-style, shot-image, shot-video, and TTS guidance to improve generated
creative quality.

This is a prompt subject rule enhancement only. It does not change API routes,
artifact schemas, response formats, provider configuration, workflow ordering,
or persisted data contracts. Material-intake remains text-only in the current
service path; product-brief remains grounded in approved material-intake output
and merchant direction.

P0 storyboard and shotprompt contracts remain unchanged: total duration is 15
seconds, there are exactly 3 shots, purposes are strictly `hook -> proof -> cta`,
durations are strictly `4/7/4`, voiceover length remains capped by
`durationSec * 5`, and shotprompt must preserve storyboard shot count, order,
and index while separating providerPrompt, shotImage, and shotVideo layers.

## 4. State Machines

| State/fact | Next | Failure |
|---|---|---|
| module proposed | approve or overwrite with new proposed | provider/parse failure writes failed/error response and trace |
| module approved/current | downstream propose reads it | upstream change only marks `upstreamChanged` |
| shot set active | per-shot image/video operations | new apply archives old active set |
| image batch `PENDING/RUNNING` | `SUCCEEDED` candidates or failed batch | retry can create a new batch from active prompt |
| image candidate `SUCCEEDED` | image select | non-image refs filtered before provider request |
| video batch `PENDING/RUNNING` | candidate `PERSISTING` then `SUCCEEDED` | retry can create a new batch from active script |
| video candidate `PERSISTING` | stable asset saved then selectable | persist failure records candidate/job error |
| final video job `PENDING/RUNNING` | `SUCCEEDED` final asset | missing selected videos rejects compose |
| one-click job running | final compose or failure | same workspace running job is rejected |
| shot-image-auto-selection running | image selections or failure | same workspace running job is rejected |

## 5. Failure Matrix

| Failure | API behavior | UI behavior | Audit/log |
|---|---|---|---|
| Missing current upstream artifact | 400 `NO_CURRENT_APPROVED_ARTIFACT` or module-specific code | Show required previous review step | Request/trace error when applicable |
| Non-P0 storyboard before shotprompt/apply | 400 `UPSTREAM_STORYBOARD_NOT_P0` or invalid storyboard script | Keep current content, ask merchant to regenerate/approve valid 分镜脚本 | Service error; tests cover legacy non-P0 rejection |
| Provider output collapses shot count/indexes | Parse/validation failure; no approved artifact | Show generation failure; do not advance | `shotprompt.parse_failed` or workflow trace |
| Product-brief primary image unavailable | Provider call proceeds without image or service error depending storage failure | Show product-brief propose failure if storage read fails | Trace records request metadata without leaking signed/data URLs in provider-call audit |
| Upstream changes after downstream work | API returns `upstreamChanged`/`upstream` hints | Show 上游变更提示; keep old candidates/selections usable | Source fingerprint remains on artifact/round |
| Image/video provider missing config in real mode | Error from provider config resolution | Show provider configuration failure | Trace provider failure when logger exists |
| Video candidate only `PERSISTING` | Candidate not selectable/composable until stable | Allow preview only if `previewVideoUrl` exists | `asset_persist_*` trace events |
| Final compose missing selected video | Reject final-video request | Keep compose action disabled or show requirement | Job not created or failed with safe reason |
| Unsafe material ref delete | 400 `INVALID_MATERIAL_REF` | Show delete error; no file mutation | API test covers path traversal |

## 6. Frontend Recovery

- `GET /api/workspaces/:workspaceId/status` is the workspace recovery anchor.
- `shot-workflow-status`, `image-rounds`, and `video-rounds` provide per-shot
  round, current selection, and upstream status.
- Frontend should use business terms from `CONTEXT.md` and avoid primary UI
  labels such as raw Prompt, mock, artifact console, or system prompt.
- During `storyboard/voiceover/propose`, the UI must keep the current draft
  visible until the real proposed artifact returns.
- 一键成片进度 is frontend-derived from `OneClickFinalVideoJob.currentStage`,
  `stageState`, and active shot count. `OneClickProgress` renders an accessible
  progressbar in 素材解读 and 生成成片 panels but does not poll itself.
- `useWorkbenchViewModel` owns one-click polling: active
  `PENDING/RUNNING/WAITING` one-click summary or list jobs poll every 5 seconds;
  idle state polls every 15 seconds. Both `workspaceStatus.activeOneClickFinalVideo`
  and the one-click job list are considered so progress resumes after refresh.

## 7. Open Decisions

| Decision | Owner | Current recommendation |
|---|---|---|
| Resume UX for failed one-click jobs | Product + Frontend | Resume from durable job stage facts; do not silently restart from scratch. |
| Archived shot-set visibility | Product | Hide from V1 workbench; keep DB facts for audit only. |
