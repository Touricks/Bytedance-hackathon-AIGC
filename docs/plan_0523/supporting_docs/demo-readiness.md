# V0 Demo Readiness

This page is the evaluator handoff for the V0 commerce video path. It keeps the demo route, setup modes, mock fallback, real-provider checks, and V0 boundary in one place.

## V0 demo route

Use the web app as the primary demo surface:

1. 上传素材: upload or select the public demo product image at `apps/web/public/mocks/products/demo-product.svg`.
2. 创作蓝图: submit merchant-facing structured fields for product title, selling points, audience, style preference, and image.
3. Read-only confirmation: review the returned 剧本, 基础分镜, rendering brief, and 改进提示.
4. 一键成片: click the button that creates a 成片任务 from the visible `scriptId`.
5. 任务进度: watch the asynchronous GenerationJob move through queued/media generation/completed states.
6. 预览导出: preview the final 成片 and use the export/open link from the video preview.

The API route behind the same path is:

```bash
POST /api/materials/product-image
POST /api/creative-blueprints
POST /api/creation/jobs
GET /api/jobs/:jobId
```

## Local setup

Install dependencies once per worktree:

```bash
pnpm install
```

Copy local environment configuration:

```bash
cp .env.example .env
```

Start required local services:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Start the app:

```bash
pnpm dev
```

Default local ports are `SERVER_PORT=3000` and `WEB_PORT=5173`. If another worktree is already running, change those ports in `.env` before starting.

## Provider modes

### Mock fallback mode

Mock mode requires no Ark or Seedance credentials. Leave the real-provider credential variables blank and keep:

```text
MOCK_FINAL_VIDEO_URL=/mocks/videos/fallback-flower.mp4
```

The repo ships both public demo assets:

- Product image: `apps/web/public/mocks/products/demo-product.svg`
- Fallback video: `apps/web/public/mocks/videos/fallback-flower.mp4`

The fallback video is for local development and 现场兜底 only. It does not replace P0 validation of the real model path.

### Ark creative-blueprint mode

Set these variables before starting the server:

```text
OPENAI_BASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_TOP_P=0.9
OPENAI_TEMPERATURE=0.7
```

The Ark text path must return a structured 创作蓝图. If parsing fails, the provider makes one repair attempt; if repair fails or credentials are missing, the system returns a deterministic fallback blueprint and marks `trace.fallbackUsed`.

### Seedance image-to-video mode

Set these variables before starting the server:

```text
SEEDANCE_API_URL=
SEEDANCE_API_KEY=
SEEDANCE_MODEL=
```

The Seedance path is one whole-video image-to-video call for a vertical <=12s 成片. The user-visible 分镜 remains planning structure; it is not rendered as separate clips in V0.

## Verification checklist

Run the automated checks before closing the issue:

```bash
pnpm --filter @aigc-video/web test
pnpm --filter @aigc-video/server test
pnpm --filter @aigc-video/ai test
pnpm typecheck
pnpm lint
pnpm build
```

Run the mocked end-to-end flow:

1. Start services and app with `MOCK_FINAL_VIDEO_URL=/mocks/videos/fallback-flower.mp4`.
2. Open the web app.
3. Upload `apps/web/public/mocks/products/demo-product.svg`.
4. Generate 创作蓝图.
5. Click 一键成片.
6. Confirm 任务进度 reaches completed.
7. Confirm 预览导出 shows `fallback-flower.mp4`.

Run real-provider smoke checks when credentials are available:

1. Use `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `OPENAI_MODEL` for Ark creative-blueprint generation.
2. Use `SEEDANCE_API_URL`, `SEEDANCE_API_KEY`, and `SEEDANCE_MODEL` for Seedance image-to-video generation.
3. Follow `docs/plan_0523/supporting_docs/model-smoke.md` for curl examples and expected trace/result fields.

## V0 out of scope

These stay outside the V0 main route: 检索, TTS, 字幕, BGM, 数据看板, A/B 对比, 复杂分镜编辑, mobile-specific optimization, object storage migration, and production analytics.
