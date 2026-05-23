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
