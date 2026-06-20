# Postman / Newman Plan

Status: Draft
Owner: Project team
Last Updated: 2026-06-08
Applies To: Manual API validation assets
Depends On: `docs/contracts/openapi.yaml`, `docs/eval/demo-eval-plan.md`
Blocks: Claiming full Postman acceptance as active automation
Decision State: Accepted

## 1. Current Reality

There is no active official real-provider smoke package script. Current package scripts keep direct provider probes only:

```sh
node scripts/verify-provider-image.mjs --json
node scripts/verify-provider-video.mjs --image-url <url> --json
```

Postman assets can remain reference material, but the authoritative local contract gate is:

```sh
pnpm contract:frontend-backend
```

## 2. Recommended Manual Layers

- Contract layer: health, config, workspace init, module propose/approve, shot set apply.
- Regression layer: image/video prompt rounds, selections, upstream warnings, final compose.
- Provider diagnosis layer: direct provider probes only, separated from workspace state acceptance.
