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

The current Ark creative-blueprint model is multimodal Doubao-Seed-2.0-pro.
When Ark text config is present, uploaded product images are sent as structured
`image_url` content alongside the blueprint prompt. App-created local raster
uploads are converted server-side to `data:image/<format>;base64,...` before the
Ark Chat request.

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
    "imageUrl": "<public product image URL, data URL, or uploaded asset URL>"
  }'
```

Expected result:

- Response includes a stable `scriptId`.
- Response includes `creativeBlueprint` with `narrative`, `visualStyle`, `coreSellingPoint`, 2-4 `shots`, `renderBrief`, and `improvementHints`.
- Response includes sanitized `trace` metadata with `promptVersion`, `model`, `textProvider`, `imageReferenceMode`, parse status, repair attempts, and fallback status.
- For acceptance, `provider` should be `ark` and `trace.textProvider` should be `ark`.
- For uploaded raster images, `trace.imageReferenceMode` should be `data_url`. Public image URLs use `url`, and provider asset references use `provider_asset`.

If Ark text auth/config fails and fallback LLM variables are configured, the provider may return `provider=fallback` with `trace.textProvider=fallback-llm` and `trace.imageReferenceMode=text_only_fallback`. That is useful for recovery, but it does not satisfy real-provider acceptance.

## Ark-Backed Seedance Image-To-Video

The V0 成片任务 uses Ark video credentials to call the Seedance image-to-video capability.

Set primary Ark video variables before starting the server:

```bash
MODEL_MODE=real
ARK_API_KEY=<ark-api-key>
ARK_VIDEO_ENDPOINT_ID=<ark-video-endpoint-id>
```

For app-flow validation, upload a supported raster product image through the V0
UI/API. The server converts app-created local uploads to
`data:image/<format>;base64,...` before calling Seedance, so S3/TOS is not
required for local demo validation. For direct curl calls that bypass upload,
use a public product image URL or an explicit data URL.

Then create a 创作蓝图 and start a 成片任务:

```bash
SCRIPT_ID=$(curl -s -X POST http://localhost:3000/api/creative-blueprints \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Portable Mini Blender",
    "sellingPoints": "USB-C charging, easy cleaning, powerful smoothie blending",
    "audience": "busy office workers and fitness beginners",
    "stylePreference": "clean premium ecommerce",
    "imageUrl": "<public product image URL or uploaded asset URL>"
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
The smoke command is a dependency-interface health check, not a full video
generation acceptance test. It validates:

- Ark text chat completion works with `ARK_API_KEY` and `ARK_TEXT_ENDPOINT_ID`.
- OpenAI-compatible fallback chat completion works with `OPENAI_API_KEY` and `OPENAI_MODEL`.
- The command does not create or read a product image, and it does not call the Seedance video endpoint.

Set:

```bash
MODEL_MODE=real
ARK_API_KEY=<Ark API key>
ARK_TEXT_ENDPOINT_ID=<Ark text endpoint ID>
OPENAI_API_KEY=<OpenAI or OpenAI-compatible API key>
OPENAI_MODEL=<fallback model>
```

`OPENAI_BASE_URL` is optional and defaults to `https://api.openai.com/v1`.

Then run:

```bash
pnpm --filter @aigc-video/ai smoke:real-providers
```

The smoke command loads the repository root `.env` and preserves any variables already exported in the shell.

The command fails if either text provider cannot return a non-empty chat completion response because of config, auth, quota, or network failure. Output is sanitized and includes provider names, models, base URLs, latency, and a short response preview.

Full Seedance video validation remains a separate manual/demo readiness check. It can use local uploaded raster images through the app flow, while public product-image storage remains the production-oriented path.
