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
  status
  stage
  progress
  payload
  trace
  errorMessage
  finalAssetId
  scriptId
  createdAt
  updatedAt

Script
  id
  jobId
  version
  narrative
  visualStyle
  rawJson
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
GenerationJob 1 -> 1 Script
Script 1 -> n StoryboardShot
GenerationJob 1 -> 1 Asset(type=final_video)
```
