# P0 Data Model

```text
Product
  id
  title
  sellingPoints
  audience
  mainImageAssetId
  createdAt

Asset
  id
  type
  url
  source
  metadata
  createdAt

GenerationJob
  id
  productId
  scriptId
  status
  stage
  progress
  payload
  trace
  errorMessage
  finalAssetId
  createdAt
  updatedAt

Script
  id
  productId
  version
  narrative
  visualStyle
  rawJson                  # includes CreativeBlueprint and improvementHints in V0
  createdAt

StoryboardShot
  id
  scriptId
  index
  durationSec
  visualPrompt
  cameraMotion
  voiceover
  subtitle
  mediaAssetId
  status
```

Relationships:

```text
Product 1 -> n GenerationJob
Product 1 -> n Asset
Product 1 -> n Script
Script 1 -> n StoryboardShot
Script 1 -> n GenerationJob
GenerationJob 1 -> 1 Asset(type=final_video)
```
