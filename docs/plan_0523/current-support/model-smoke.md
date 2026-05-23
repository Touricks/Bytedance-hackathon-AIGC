# Model Smoke Checks

## Ark Creative Blueprint

The V0 creative-blueprint provider uses an OpenAI-compatible Ark text endpoint through the official `openai` SDK.

Set environment variables before starting the server:

```bash
OPENAI_BASE_URL=<ark-openai-compatible-base-url>
OPENAI_API_KEY=<ark-api-key>
OPENAI_MODEL=<ark-text-endpoint-or-model>
```

Then run a creative-blueprint request:

```bash
curl -s -X POST http://localhost:3000/api/creative-blueprints \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Portable Mini Blender",
    "sellingPoints": "USB-C charging, easy cleaning, powerful smoothie blending",
    "audience": "busy office workers and fitness beginners",
    "stylePreference": "clean premium ecommerce",
    "imageUrl": "/mocks/products/demo-product.svg"
  }'
```

Expected result:

- Response includes a stable `scriptId`.
- Response includes `creativeBlueprint` with `narrative`, `visualStyle`, `coreSellingPoint`, 2-4 `shots`, `renderBrief`, and `improvementHints`.
- Response includes sanitized `trace` metadata with `promptVersion`, `model`, parse status, repair attempts, and fallback status.

If credentials are missing or the model output cannot be repaired, the provider returns a deterministic fallback blueprint and marks `trace.fallbackUsed` as true.

## Seedance Image-To-Video

The V0 成片任务 uses Seedance as an image-to-video provider when configured, and falls back to `MOCK_FINAL_VIDEO_URL` for local development.

Set environment variables before starting the server:

```bash
SEEDANCE_API_URL=<seedance-image-to-video-endpoint>
SEEDANCE_API_KEY=<seedance-api-key>
SEEDANCE_MODEL=<seedance-model-or-endpoint-id>
```

Then create a 创作蓝图 and start a 成片任务:

```bash
SCRIPT_ID=$(curl -s -X POST http://localhost:3000/api/creative-blueprints \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Portable Mini Blender",
    "sellingPoints": "USB-C charging, easy cleaning, powerful smoothie blending",
    "audience": "busy office workers and fitness beginners",
    "stylePreference": "clean premium ecommerce",
    "imageUrl": "/mocks/products/demo-product.svg"
  }' | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => console.log(JSON.parse(s).scriptId));')

curl -s -X POST http://localhost:3000/api/creation/jobs \
  -H 'Content-Type: application/json' \
  -d "{\"scriptId\":\"$SCRIPT_ID\"}"
```

Expected result:

- The GenerationJob starts at `queued`, moves through `media_generating`, then reaches `completed`.
- The final Asset has `type=final_video`.
- Asset metadata includes the internal conservative 12-second whole-video prompt and provider name.
- If Seedance credentials are not configured, the provider remains `mock` and returns `MOCK_FINAL_VIDEO_URL`.
## Real-provider acceptance mode

Local development may use fallback creative blueprints and the mock final video.
For acceptance, set:

```bash
MODEL_MODE=real
OPENAI_BASE_URL=<Ark OpenAI-compatible base URL>
OPENAI_API_KEY=<Ark API key>
OPENAI_MODEL=<Ark text endpoint ID>
SEEDANCE_API_URL=<Seedance image-to-video endpoint>
SEEDANCE_API_KEY=<Seedance API key>
SEEDANCE_MODEL=<Seedance model or endpoint ID>
SMOKE_PRODUCT_IMAGE_URL=<publicly reachable product image URL>
```

Then run:

```bash
pnpm --filter @aigc-video/ai smoke:real-providers
```

The smoke command loads the repository root `.env` and preserves any variables
already exported in the shell.

The command fails if creative blueprint generation does not return provider
`ark` or video generation does not return provider `seedance`.
