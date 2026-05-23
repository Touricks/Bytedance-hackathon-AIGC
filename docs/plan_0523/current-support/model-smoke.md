# Model Smoke Checks

This page documents the current V0 model-provider contract.

## Provider contract

```text
Primary text model: ARK_API_KEY + ARK_TEXT_ENDPOINT_ID
Primary video model: ARK_API_KEY + ARK_VIDEO_ENDPOINT_ID
Fallback LLM: OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL
```

`Seedance` is the video model capability name. It is not a separate active credential namespace in V0.

The fallback LLM under `OPENAI_BASE_URL` is only for 创作蓝图 recovery when the Ark text entry point is unavailable because of auth/config failure. It is not used for 成片 video generation.

## Ark Creative Blueprint

Set primary Ark text variables before starting the server:

```bash
MODEL_MODE=real
ARK_API_KEY=<ark-api-key>
ARK_TEXT_ENDPOINT_ID=<ark-text-endpoint-id>
```

Optional fallback LLM variables:

```bash
OPENAI_BASE_URL=<fallback-openai-compatible-base-url>
OPENAI_API_KEY=<fallback-api-key>
OPENAI_MODEL=<fallback-model>
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
- Response includes sanitized `trace` metadata with `promptVersion`, `model`, `textProvider`, parse status, repair attempts, and fallback status.
- For acceptance, `provider` should be `ark` and `trace.textProvider` should be `ark`.

If Ark text auth/config fails and fallback LLM variables are configured, the provider may return `provider=fallback` with `trace.textProvider=fallback-llm`. That is useful for recovery, but it does not satisfy real-provider acceptance.

## Ark-Backed Seedance Image-To-Video

The V0 成片任务 uses Ark video credentials to call the Seedance image-to-video capability.

Set primary Ark video variables before starting the server:

```bash
MODEL_MODE=real
ARK_API_KEY=<ark-api-key>
ARK_VIDEO_ENDPOINT_ID=<ark-video-endpoint-id>
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
- In local mock mode without Ark video config, the provider remains `mock` and returns `MOCK_FINAL_VIDEO_URL`.

## Real-Provider Smoke Mode

Local development may use fallback creative blueprints and the mock final video.
Before S3-backed public product images are available, the smoke command validates:

- Ark text provider returns provider `ark`.
- Ark-backed Seedance endpoint is reachable. A `400` response is accepted in default reachability mode because localhost or private image URLs cannot be fetched by Seedance.

Set:

```bash
MODEL_MODE=real
ARK_API_KEY=<Ark API key>
ARK_TEXT_ENDPOINT_ID=<Ark text endpoint ID>
ARK_VIDEO_ENDPOINT_ID=<Ark video endpoint ID>
```

Then run:

```bash
pnpm --filter @aigc-video/ai smoke:real-providers
```

The smoke command loads the repository root `.env` and preserves any variables already exported in the shell.

The command fails if creative blueprint generation does not return provider `ark`, or if the Seedance endpoint cannot be reached because of config/auth/network failure.

After S3/public asset URLs are available, enable full video generation:

```bash
SMOKE_FULL_VIDEO_GENERATION=true
SMOKE_PRODUCT_IMAGE_URL=<publicly reachable product image URL>
pnpm --filter @aigc-video/ai smoke:real-providers
```

In full mode, the command fails unless video generation returns provider `seedance` and a video URL.
