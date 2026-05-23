# 2026-05-23 Review Note: Uploaded Image Reference Gap In Script Generation

## Context

Current bug under diagnosis:

```text
用户填写表单并上传商品图后，AI 生成创作蓝图/剧本时无法参考上传图片。
图生视频链路目前已经跑通。
```

This note records what the working image-to-video path teaches us, and how that
experience should shape the script-generation fix discussion.

## Feedback Loop

Fast deterministic checks used in this diagnosis:

```bash
packages/ai/node_modules/.bin/tsx --eval '<buildCreativeBlueprintPrompt check>'
```

Observed signal:

```json
{
  "includesImageUrl": false,
  "includesImageInstruction": true
}
```

The creative-blueprint prompt tells the model that the uploaded product image is
the visual source of truth, but it does not include the concrete uploaded image
reference.

Known-good image-to-video checks:

```bash
AIGC_VIDEO_SKIP_ENV_FILE=true MODEL_MODE=mock \
ARK_API_KEY= ARK_TEXT_ENDPOINT_ID= ARK_VIDEO_ENDPOINT_ID= \
OPENAI_API_KEY= OPENAI_MODEL= \
node --import tsx --test src/providers/seedance-video.provider.test.ts
```

Result: 7 passing tests.

```bash
AIGC_VIDEO_SKIP_ENV_FILE=true \
DATABASE_URL=postgres://postgres:postgres@localhost:5432/aigc_video \
MODEL_MODE=mock ARK_API_KEY= ARK_TEXT_ENDPOINT_ID= ARK_VIDEO_ENDPOINT_ID= \
OPENAI_API_KEY= OPENAI_MODEL= \
node --import tsx --test src/jobs/seedance-image-input.test.ts
```

Result: 5 passing tests.

The first server-side run without `DATABASE_URL` failed before the pure-function
test body because r4 correctly requires Postgres configuration as the business
fact source.

## Confirmed Provider Fact

The current Ark text model is confirmed to be multimodal:

```text
Doubao-Seed-2.0-pro
```

Official reference pages checked:

- https://www.volcengine.com/docs/82379/1541594?lang=zh
- https://www.volcengine.com/docs/82379/1494384?lang=zh
- https://www.volcengine.com/docs/82379/1330626?lang=zh

Relevant contract from the Chat API docs:

- `POST https://ark.cn-beijing.volces.com/api/v3/chat/completions`
- `messages.content` can be a multimodal object array.
- image parts use `type: "image_url"` and `image_url.url`.
- `image_url.url` supports image links and Base64 image encoding.
- Doubao Seed 2.0 image pixel limits are documented under
  `image_pixel_limit`; max pixels can be set up to 9,031,680 for the Seed 2.0
  series, with minimum pixels from 1,764.

Therefore the script-generation bug is no longer blocked by provider capability.
It is an application/provider-adapter bug: the app currently calls the
multimodal model through a text-only contract.

## Current Script-Generation Path

The upload UI works at the material boundary:

- `MaterialForm` uploads a `File` through `uploadProductImage(file)`.
- The server stores bytes under the upload directory and creates an `Asset`.
- The form stores the returned local URL in `imageUrl`.
- `POST /api/creative-blueprints` receives only structured text fields plus
  `imageUrl`.

The image is then lost as model-visible information:

- `creativeBlueprintService.generateBlueprint(input)` passes only the original
  request object into `generateCreativeBlueprintWithArk(input)`.
- `buildCreativeBlueprintPrompt(input)` includes title, selling points,
  audience, and style preference.
- The prompt includes a generic instruction that the product image is the visual
  source of truth.
- The prompt does not include `input.imageUrl`.
- `TextModelCall` is typed as `(prompt: string) => Promise<string>`.
- `createOpenAITextModelCall()` sends `messages: [{ role: "user", content:
  prompt }]`.

So even when the user uploads a real image, the text model receives neither
image bytes nor a structured `image_url` content part. It cannot visually inspect
the product.

## Working Image-To-Video Experience

The image-to-video path succeeds because it treats image handoff as a first-class
provider contract:

1. Persisted `Asset` is the canonical image fact, not a loose string.
2. Local upload URLs are resolved server-side before provider calls.
3. `resolveSeedanceImageInput(asset)` converts supported local raster uploads to
   `data:image/<mime>;base64,...`.
4. Public URLs, existing data URLs, and Ark asset references can pass through.
5. Unsupported content types, missing files, path traversal, and oversize files
   fail before the provider call.
6. `generateVideoWithSeedance()` sends multimodal content:

```text
content = [
  { type: "text", text: prompt },
  { type: "image_url", image_url: { url: imageUrl }, role: "first_frame" }
]
```

7. Tests lock the boundary at three levels:
   provider payload shape, image input normalization, and creation API behavior.

The important lesson is not just "base64 works"; it is that the provider-facing
boundary has an explicit image input type, resolver, validation rules, and tests.

## Ranked Hypotheses

1. Highest confidence: creative-blueprint generation is text-only at the model
   boundary. If the model request accepts a structured image content part or
   data URL, uploaded images can start influencing generated shots.
2. High confidence: even a public image URL would currently be invisible because
   `buildCreativeBlueprintPrompt()` does not include the concrete `imageUrl`.
   Adding the URL to the prompt may help only if the model can fetch or interpret
   URLs, which should not be assumed.
3. High confidence: local `/uploads/...` URLs are not portable provider inputs.
   The server must resolve them to data URLs or provider asset IDs before a real
   model call, just as the Seedance path does.
4. Resolved: `ARK_TEXT_ENDPOINT_ID` is backed by the multimodal
   Doubao-Seed-2.0-pro model. The fix should send the uploaded product image as
   a structured `image_url` content part in the creative-blueprint Chat request.

## Borrowing Plan For Discussion

Recommended direction:

1. Make creative-blueprint generation consume the persisted `imageAsset`, not
   only `input.imageUrl`.
2. Add a provider-facing resolver similar to `resolveSeedanceImageInput()`, but
   named around the creative/vision use case, for example
   `resolveBlueprintImageInput(asset)`.
3. Extend the AI workflow contract from `TextModelCall(prompt: string)` to a
   message-level contract that can carry:

```text
text prompt + optional image_url content part
```

4. For Ark text, send a Chat Completions request whose user message content is
   an array:

```text
[
  { type: "text", text: creativeBlueprintPrompt },
  {
    type: "image_url",
    image_url: {
      url: resolvedImageReference,
      detail: "high"
    }
  }
]
```

5. Reuse the Seedance image handoff experience for local uploaded raster images:
   resolve `/uploads/...` to a data URL before the Ark Chat request.
6. Keep fallback LLM and deterministic fallback text-only unless the fallback is
   explicitly known to support vision.
7. Add regression tests before the fix:
   - prompt/model request includes the uploaded image as a structured image
     input when an uploaded raster asset exists;
   - local upload URLs are converted to data URLs before the creative model call;
   - unsupported image types fail or degrade before calling a real vision model;
   - text-only fallback remains auditable and marked in trace.
8. Add trace metadata such as `imageReferenceMode`:

```text
none | url | data_url | provider_asset | text_only_fallback
```

This keeps future reviewers from confusing "user uploaded an image" with "model
actually received an image".

## Implementation Checkpoint

Implemented on the current dirty `codex/fix-ai-provider-contract` branch:

- `packages/ai` creative-blueprint workflow now uses a message-level model
  request instead of a string-only prompt call.
- Ark text requests can include multimodal user content:

```text
[
  { type: "text", text: creativeBlueprintPrompt },
  { type: "image_url", image_url: { url: resolvedImageReference, detail: "high" } }
]
```

- Fallback LLM and deterministic fallback remain text-only and mark
  `trace.imageReferenceMode=text_only_fallback` when an image was available but
  not sent to that provider.
- Server-side creative-blueprint generation reuses the image handoff experience
  from the working Seedance path: app-created local raster uploads are converted
  to `data:image/<mime>;base64,...` before the Ark Chat request.
- API regression coverage now verifies that an uploaded PNG reaches Doubao as
  structured `image_url` content and does not leak a private `/uploads/...` path
  to the provider boundary.

Validation after implementation:

```bash
pnpm --filter @aigc-video/ai test
pnpm --filter @aigc-video/server test
```

Both passed locally.

## Open Discussion Questions

1. Should creative blueprint generation fail in `MODEL_MODE=real` when the image
   cannot be passed to the model, or should it degrade to text-only with explicit
   trace metadata?
2. Should SVG/mock images remain acceptable for local blueprint tests, while real
   vision acceptance requires uploaded raster images?
3. Should the same image resolver be shared by creative blueprint and Seedance
   video generation, or should we keep two small wrappers with a common lower
   level utility?
4. Should we use `detail: "high"` by default for product-image blueprint
   generation, or set explicit `image_pixel_limit` to control cost and latency?
