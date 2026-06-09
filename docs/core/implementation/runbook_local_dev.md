# Local Development Runbook

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: Local development and validation
Depends On: `README.md`, `testing/test_strategy.md`
Blocks: Local setup and reset ambiguity
Decision State: Accepted

## 1. Executive Summary

Local development uses pnpm workspace scripts, Postgres, Redis/BullMQ, `.daireel/` workspace files, and optional ffmpeg for final compose.

## 2. Current Reality

Default ports:

- API: `3000`
- Web: `5173`

Important shortcut:

```sh
pnpm reset:dev -- --yes
```

This clears dev ports, Postgres business tables, and BullMQ queues, then starts `pnpm dev`. It does not delete workspace files in test folders or `.daireel/trace/events.jsonl`.

## 3. Target State

### Setup

```sh
pnpm install
docker compose -f infra/docker-compose.yml up -d
cp .env.example .env
```

### Development

```sh
pnpm dev
pnpm dev:mock
pnpm dev:real
```

### Cleanup Without Restart

```sh
pnpm reset:dev -- --yes --no-dev
```

### Validation

```sh
pnpm contract:frontend-backend
pnpm --filter @aigc-video/server test
pnpm --filter @aigc-video/web test
pnpm --filter @aigc-video/ai test
```

## 4. Contracts / Interfaces

- New provider work should use explicit `TEXT_*`, `IMAGE_*`, and `VIDEO_*` env fields.
- Legacy `ARK_*` aliases may exist but should not be expanded in new docs/code.
- When a user asks to restart services, free API/web ports first and then start `pnpm dev`.

## 5. Implementation Slices

- Reset scripts.
- Dev server orchestration.
- Provider probes.
- Contract/test commands.

## 6. Acceptance Tests

Run the smallest relevant command set for the changed surface and report exact results.

## 7. Open Decisions

- Full real-provider workspace smoke remains intentionally outside package scripts.

## 8. Related Docs

- `testing/test_strategy.md`
- `architecture/backend.md`

