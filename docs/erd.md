# P0 Data Model

Postgres is the required V0 business fact source. The runtime schema is initialized from `apps/server/src/db/schema/`.

```text
Product
  id
  title
  sellingPoints
  audience
  mainImageAssetId          # optional FK to Asset
  createdAt

Asset
  id
  type                      # product_image | generated_clip | final_video | audio | subtitle
  url
  source                    # upload | seedance | tts | mock
  metadata
  createdAt

Script
  id
  productId                 # FK to Product
  jobId                     # optional FK to GenerationJob
  parentScriptId            # optional FK to Script
  version
  narrative
  visualStyle
  frozen
  frozenAt
  rawJson                   # includes CreativeBlueprint, trace, and improvementHints in V0
  createdAt

StoryboardShot
  id
  scriptId                  # FK to Script
  index
  durationSec
  purpose                   # hook | benefit | cta
  visualPrompt
  cameraMotion
  voiceover
  subtitle
  mediaAssetId              # optional FK to Asset
  status                    # pending | ready | failed

GenerationJob
  id
  productId                 # FK to Product
  scriptId                  # optional FK-like reference to Script
  status                    # queued | running | completed | failed
  stage                     # queued | script_generating | media_generating | completed | failed
  progress
  payload
  trace
  errorMessage
  finalAssetId              # optional FK to Asset
  createdAt
  updatedAt
```

Relationships:

```text
Product.mainImageAssetId -> Asset.id
Product 1 -> n Script
Product 1 -> n GenerationJob
Script.parentScriptId -> Script.id
Script 1 -> n StoryboardShot
Script 1 -> n GenerationJob attempts
StoryboardShot.mediaAssetId -> Asset.id
GenerationJob.finalAssetId -> Asset.id
```

V0 invariants:

```text
A 草稿蓝图 is represented by a non-frozen Script.
A Script becomes frozen when a GenerationJob is created from its scriptId.
Editing a frozen Script creates a new Script with parentScriptId set.
One frozen Script can be used by multiple GenerationJob attempts.
StoryboardShot is a script beat, not an independently rendered clip.
```
