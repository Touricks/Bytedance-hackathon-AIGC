# interface — V3 对外接口与业务逻辑

> 后端 HTTP 目标契约。机器可读契约见 [`openapi.yaml`](./openapi.yaml)，架构见 [`arc_v3.md`](./arc_v3.md)，数据模型见 [`erd.md`](./erd.md)。
>
> 本文描述迁移后的 V3 目标接口，不要求兼容旧工作区主链路。

---

## 通用约定

- 全部路由前缀 `/api`，URL 无版本号，全站无鉴权，按单租户开发环境处理。
- 请求校验使用 Zod 或等价 schema；错误统一映射为 `{ code, message, details? }`。
- 标 🔑 的 POST 必须携带 `Idempotency-Key`。
- 宽高比枚举固定为 `9:16 | 16:9 | 1:1`，默认 `9:16`。
- 工作区级模块统一采用 `propose -> approve -> downstream` 语义：
  - `propose` 生成待审创作产物，只写 `status=proposed`。
  - `approve` 将产物变为当前生效产物，只写 current 指针，不自动重置下游。
  - 下游 agent 只读取 `approved/current`。
- 下游查询返回 `upstreamChanged` 提示：它表示上游 current artifact 已变化，继续重生成会有较大差异；它不是 stale，不删除旧候选，不阻塞成片。
- 图像/视频选择是 UPSERT 当前 selection。未选候选持续可见，供用户之后重新选择。

---

## 0. 平台 / 系统

| 方法   | 路径                                         | 业务逻辑                                                                               | 响应                      |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------- |
| GET    | `/api/health`                                | 健康检查，返回当前 runtime。                                                           | `{ ok, runtime }`         |
| GET    | `/api/config/limits`                         | 返回图像/视频候选数量上限、worker/provider 并发、workspace storage kind 和宽高比枚举。 | `{ data }`                |
| GET    | `/api/pipeline/contracts`                    | 返回 agent 链路、prompt 模板、输入输出 schema 的契约元数据。                           | `{ data }`                |
| GET    | `/api/setup-templates/creative-requirements` | 返回启动时从 `@aigc-video/shared` 校验通过的内置创作要求模板。                         | `{ data: { templates } }` |
| DELETE | `/api/test-runs/:runId`                      | 测试清理专用；只在测试环境开启。                                                       | `{ data: { deleted } }`   |

---

## 1. 素材 Material

| 方法   | 路径                                          | 业务逻辑                                                                                                                                      | 请求                                    |
| ------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| POST   | `/api/materials`                              | 登记外部商品图为 `asset`。                                                                                                                    | `{ imageUrl }`                          |
| POST   | `/api/materials/product-image`                | 上传 base64 商品图，写入本地上传目录并登记 `asset`。                                                                                          | `{ filename, contentType, dataBase64 }` |
| POST   | `/api/workspaces/:workspaceId/materials`      | 上传工作区素材，写入 workspace storage 并登记 asset；`image/*` 超过 10MB 直接返回 `IMAGE_TOO_LARGE_FOR_MODEL`，非图片仍受通用 50MB 上限保护。 | multipart file 或 JSON base64           |
| DELETE | `/api/workspaces/:workspaceId/materials/:ref` | 删除工作区素材文件、对应 asset 记录和 shot asset refs；`ref` 只允许安全文件名，不允许路径穿越。删除不会自动重跑 material-intake 或下游链路。  | 无                                      |

---

## 2. Workspace 与 Storage

| 方法   | 路径                                        | 业务逻辑                                                                                                                                                                                                                                           | 请求                                                                                 |
| ------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| POST   | `/api/workspaces`                           | 新建逻辑工作区；`WORKSPACE_STORAGE_KIND=s3` 时自动绑定私有 S3-compatible bucket，prefix 固定为 `workspaces/{workspaceId}`；local 模式仍由本地目录入口创建可见草稿。                                                                                | `{ name? }`                                                                          |
| GET    | `/api/workspaces`                           | 列出 DB 已登记的 S3 工作区，以及 DB 已登记且有有效本地路径的 LOCAL 工作区（配置 `WORKSPACE_DISCOVERY_ROOTS` 时仅展示这些 roots 下的 LOCAL workspace）；并扫描 `WORKSPACE_DISCOVERY_ROOTS` 下的磁盘草稿，返回未登记到 DB 的工作区（`discovered`）。 | query 可选                                                                           |
| POST   | `/api/workspaces/directory/select`          | 打开本机目录选择器，返回用户选择的本地 workspace 目录；不创建 workspace，不写 storage binding。                                                                                                                                                    | `{}`                                                                                 |
| POST   | `/api/workspaces/init`                      | 按本地目录 find-or-create 工作区，绑定 LOCAL storage，写 `.daireel/workspace.json`。                                                                                                                                                               | `{ directory }`                                                                      |
| DELETE | `/api/workspaces/:workspaceId`              | 删除 DB 已登记工作区。LOCAL storage 只删除工作目录下的 `.daireel/` 创作数据；S3 storage 清理 `s3Prefix` 下对象；随后清理该 workspace 的业务记录。存在运行中生成/成片任务时返回 409。                                                               | 无                                                                                   |
| GET    | `/api/workspaces/:workspaceId/status`       | 返回 workspace、storage、active artifact 摘要、active shot set、active 一键成片任务摘要、下一步建议。                                                                                                                                              | 无                                                                                   |
| GET    | `/api/workspaces/:workspaceId/storage`      | 返回工作区存储绑定。                                                                                                                                                                                                                               | 无                                                                                   |
| POST   | `/api/workspaces/:workspaceId/storage/bind` | 绑定 LOCAL 或 S3 storage。已绑定 active storage 时返回 409。                                                                                                                                                                                       | `{ kind:"local", localPath }` 或 `{ kind:"s3", bucket, prefix, region?, endpoint? }` |

`GET /api/workspaces` 响应形如 `{ workspaces: [...], discovered: [{ localPath, workspaceId }] }`。`workspaces` 来自 DB；S3 active binding 的工作区即使 `localPath` 为空也应展示，LOCAL 则必须有可见本地路径。配置 `WORKSPACE_DISCOVERY_ROOTS` 后，列表只限制 LOCAL DB workspace 的可见 roots。`discovered` 是磁盘上存在 `.daireel/workspace.json` 但 DB 无对应行的工作区（例如 `reset:dev` 清空业务表后仍保留磁盘 `.daireel/`），按 `WORKSPACE_DISCOVERY_ROOTS`（逗号分隔的根目录，有界深度扫描）发现，已登记的路径会从 `discovered` 中去重剔除；云模式前端不展示本地目录和 discovered 入口。

`POST /api/workspaces/directory/select` 响应形如 `{ directory, cancelled, method }`，其中 `method` 为 `macos | windows | linux | unsupported`。取消选择时 `directory=null` 且 `cancelled=true`。

`POST /api/workspaces/init`：当目录在 DB 无对应行时，若磁盘 `.daireel/workspace.json` 仍存在且其 `workspaceId` 未被占用，则**复用该原始 `workspaceId`**（而不是新建一个），使被 reset 的草稿重新打开后接回原始工作区身份；否则新建 id。

`DELETE /api/workspaces/:workspaceId` 是同步 MVP，不提供跨 DB + storage 真事务。删除顺序为先检查运行中生成/成片任务，再做 storage cleanup（LOCAL 删除 `.daireel/`，S3 删除 active binding 的 prefix 下对象），随后在 DB transaction 内显式清理 workspace-owned rows，最后删除 `creative_workspace`。`.daireel/` 或 S3 prefix 已不存在视为 storage cleanup 成功，用户可重试同一个 workspaceId 来恢复 DB cleanup 失败的半完成场景。该接口只面向 `GET /api/workspaces` 返回的已登记工作区；`discovered` 未登记本地草稿暂不提供删除入口。

---

## 3. Prompt Requirements

Prompt requirements 是用户可编辑的结构化创作要求。用户可以分别约束图像、剧本、故事板、分镜图和分镜视频，但不能直接覆盖系统契约 prompt。

`GET /api/setup-templates/creative-requirements` 提供只读内置「创作要求模板」。模板内容来自 `packages/shared/src/setup_template/creative-requirements.ts`，服务端模块加载时用 shared Zod schema 校验，失败时服务启动失败。P0 模板不是一套新起的 7 项文案，而是 `商品/服务类型 + 适用人群 + 推销手法` 三主标签组合；`fields` 展开这三个主标签对 9 个可编辑细分字段的默认值，并声明每个细分字段会影响 7 项编译创作要求中的哪些字段。`values` 仅作为旧前端兼容缓存保留。前端点击模板只确定性回填首屏因子表单草稿，不 approve，也不触发素材解读；用户保存或提交后才写入 `prompt_requirements_artifacts` 的 proposed row。

```json
{
  "data": {
    "templates": [
      {
        "id": "consumable-youth-seeding",
        "name": "快消种草·青年",
        "summary": "自然种草质感，体验驱动，痛点到下单顺滑。",
        "version": "p0-2026-06",
        "productType": "consumable-good",
        "audiences": ["youth"],
        "strategy": "pain-solution",
        "creativeFactors": {
          "productType": "consumable-good",
          "audience": "youth",
          "strategy": "pain-solution"
        },
        "fields": {
          "factorGuidance.productType.subjectPresentation": {
            "label": "主体呈现",
            "value": "真实展示商品包装、质地、用量和使用瞬间。",
            "affects": ["image.style", "shotImage.global"]
          }
        },
        "values": {
          "imageStyle": "真实展示商品包装、质地、用量和使用瞬间。 保持真实拍摄质感和商品/服务身份可识别。",
          "imageComposition": "按开箱、展示、使用、效果感受和购买理由推进。 面向用户本人组织画面主体。",
          "imageAvoid": "虚假成分对比，夸大功效，违规功效承诺，避免制造身份、外貌、健康或收入焦虑。",
          "scriptTone": "直接、自然、有体验感，强调效率、颜值、实用和即时反馈。 用明确购买/报名/咨询路径收束。",
          "storyboardRhythm": "痛点进入、原因解释、解决方案、证据证明、行动引导。按开箱、展示、使用、效果感受和购买理由推进。",
          "shotImageGlobal": "真实展示商品包装、质地、用量和使用瞬间。 按开箱、展示、使用、效果感受和购买理由推进。",
          "shotVideoGlobal": "用痛点或反差场景开场,快速指出用户当下困扰。 按开箱、展示、使用、效果感受和购买理由推进。"
        }
      }
    ]
  }
}
```

| 方法 | 路径                                                       | 业务逻辑                                                                                                                                                                                        | 请求                                                      |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| GET  | `/api/workspaces/:workspaceId/prompt-requirements`         | 返回当前 proposed 和 approved/current requirements。                                                                                                                                            | 无                                                        |
| POST | `/api/workspaces/:workspaceId/prompt-requirements/propose` | 保存一份待审 requirements。通常不调用 provider。                                                                                                                                                | `{ data }`                                                |
| POST | `/api/workspaces/:workspaceId/prompt-requirements/approve` | 将指定或内联 requirements 置为 approved/current。                                                                                                                                               | `{ artifactId? , data? }`                                 |
| POST | `/api/workspaces/:workspaceId/reference-video/import`      | 从参考视频 URL 或上传文件分析结构并推荐三因子，由后端确定性编译并创建/覆盖 proposed prompt requirements artifact；不 approve、不进入素材库。仅在 current approved requirements 不存在时可调用。 | JSON `{ source:{ type:"url", url } }` 或 multipart `file` |

响应包含：

```json
{
  "data": {
    "artifact": {
      "id": "req_...",
      "status": "approved",
      "isCurrent": true,
      "data": {}
    }
  }
}
```

Reference video import 成功响应形如：

```json
{
  "data": {
    "source": {
      "type": "url",
      "url": "https://cdn.example.com/reference.mp4",
      "downloaded": true,
      "contentType": "video/mp4",
      "sizeBytes": 12345678
    },
    "analysis": {
      "summary": "参考视频采用快节奏卖点证明结构。",
      "confidence": "medium"
    },
    "creativeFactorsRecommendation": {
      "recommendedFactors": {
        "productType": "durable-good",
        "audience": "youth",
        "strategy": "scenario-demo"
      },
      "confidence": "medium",
      "reasons": ["参考视频以场景演示推进"]
    },
    "artifact": {
      "moduleId": "prompt-requirements",
      "status": "proposed",
      "isCurrent": false,
      "data": {
        "creativeFactors": {
          "productType": "durable-good",
          "audience": "youth",
          "strategy": "scenario-demo"
        }
      }
    }
  }
}
```

导入边界：

- 参考视频只用于分析剧本结构、节奏、镜头组织和表达风格。
- 导入结果会建议 `creativeFactors`，并通过 artifact service 创建或覆盖一条 proposed `prompt_requirements_artifacts`；用户 approve 后才成为下游 current input。
- 响应不再包含 `draft`；7 项全局提示词字段只从 `artifact.data` 中读取，且由 `creativeFactors + factorGuidance` 编译得到。
- 参考视频不写 `asset`，不参与 `material-intake.assets[]`。
- 如果 workspace 已有 current approved requirements，返回 `409 REQUIREMENTS_ALREADY_APPROVED`。
- URL 只支持可直接下载的视频资源；HTML/平台落地页返回 `REFERENCE_VIDEO_NOT_DIRECT_DOWNLOAD`。

`prompt_requirements_artifacts.data` 可携带 `creativeFactors`、`factorGuidance`、`scriptInfluence`、`compiledRequirementSourceMap` 与 `creativeRequirementTemplate`。其中 `creativeRequirementTemplate.status` 为 `applied | customized | detached`：分别表示原样套用模板、基于模板修改了细分字段、或基于模板后又更换了主因子。成片成功后，final video `compiledManifest.creativeTags` 会快照 `creativeFactors` 和 `creativeRequirementTemplate`；导入数据面板视频 artifact 或登记发布时，会分别复制到 `dashboard_video_artifacts.creative_tags/creative_factors` 与 `campaign_publications.creative_tags`。

---

## 4. 工作区级 Agent 模块

以下模块采用同一业务接口模式：

- `material-intake`
- `product-brief`
- `storyboard`
- `shotprompt`

### 4.1 通用接口

| 方法 | 路径                                            | 业务逻辑                                                                                                                         |
| ---- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GET  | `/api/workspaces/:workspaceId/{module}`         | 返回模块 proposed artifact、approved/current artifact、上游变更提示和 prompt assembly 摘要。                                     |
| POST | `/api/workspaces/:workspaceId/{module}/propose` | 读取上游 approved/current artifact 与当前 prompt requirements，装配主体 prompt + 契约 prompt，运行 agent，写 proposed artifact。 |
| POST | `/api/workspaces/:workspaceId/{module}/approve` | 批准指定 artifact 或请求体内联 artifact，置为 approved/current。不会重置下游。                                                   |

`storyboard` 另有局部重写接口：

| 方法 | 路径                                                        | 业务逻辑                                                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST | `/api/workspaces/:workspaceId/storyboard/voiceover/propose` | 读取请求中的 15 秒三镜 storyboard draft、current product brief 与 material intake，调用 storyboard agent 只重写 `shots[].voiceover`，写入新的 proposed storyboard artifact。不会修改 current，不会推进 shotprompt；用户仍需显式 approve。 |

`product-brief/propose` 支持商品卖点审核页的自然语言重生成：

| 字段             | 语义                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `userDirection`  | 商家本次调整要求，trim 后 1-1000 字。普通首次 propose 可省略；带 `draft` 或 `baseArtifactId` 时必填。                                 |
| `draft`          | 当前页面商品卖点表单草稿，服务端按 `ProductBriefArtifact` schema 校验；用于让模型基于商家已编辑内容改写。                             |
| `baseArtifactId` | 当前页面来源 product brief artifact id；若提供，服务端校验属于同一 workspace，并写入 `sourceFingerprint.baseProductBriefArtifactId`。 |

该接口只写入新的 proposed `product_brief_artifacts`，不修改 current，不自动 approve，也不推进 storyboard/shotprompt。只有用户批准新的商品卖点后，下游模块才会因 current product brief id 变化出现上游变化提示。

### 4.2 模块依赖

| 模块              | 上游                                                               | 输出                                                                                                        |
| ----------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `material-intake` | workspace materials + prompt requirements                          | 物料摘要、选用素材、图像输入描述                                                                            |
| `product-brief`   | material intake + prompt requirements                              | 产品卖点、受众、语气、约束                                                                                  |
| `storyboard`      | product brief + material intake + prompt requirements              | 视频结构、节奏、镜头目标                                                                                    |
| `shotprompt`      | storyboard + product brief + material intake + prompt requirements | 每个 shot 的时间段、图像要求 `shotImage`、视频要求 `shotVideo`，以及全片统一口播声音策略 `tts.voiceProfile` |

### 4.3 approve 语义

`approve` 只改变本模块 current 指针。特别地：

- `shotprompt approve` 不创建、不删除、不重建 `storyboard_shots`。
- 已存在 active shot set 时，批准新的 shotprompt 只会让 shot set 查询出现 `upstreamChanged=true`。
- 用户需要显式调用 `POST /api/workspaces/:workspaceId/shot-sets` 才会应用新的 shotprompt。
- `storyboard/voiceover/propose` 返回前，前端应保留当前口播和字数提示，只展示按钮 loading；返回 proposed artifact 后再渲染新口播，批准按钮才可恢复点击。
- `shotprompt propose`、`shotprompt approve` 与 `shot set apply` 都要求 current approved storyboard 满足 P0 15 秒三镜脚本规则；否则返回 `400 UPSTREAM_STORYBOARD_NOT_P0`，提示用户先批准三镜分镜脚本。
- `shotprompt propose` 的真实 provider 输出必须与 current approved storyboard 的 `shots[]` 数量、顺序和 index 完全一致，并且每条都包含 `shotImage` 与 `shotVideo` dict；否则解析失败，不生成 proposed artifact。
- `shot set apply` 会把 `storyboard_shots.order_index` 归一为 `shots[]` 数组位置（0-based 工作流顺序）。provider-facing `shots[].index` 只用于与 storyboard 校验，不直接作为 UI/流程顺序。

---

## 5. Shot Sets

Shot set 是一次分镜链路实例。它把某个 approved/current shotprompt 固化为一组可生成图像/视频的 shot。

| 方法 | 路径                                     | 业务逻辑                                                                           | 请求                        |
| ---- | ---------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------- |
| GET  | `/api/workspaces/:workspaceId/shot-sets` | 列出工作区当前 active shot set；归档实例不作为商家工作台可打开资源返回。           | 无                          |
| POST | `/api/workspaces/:workspaceId/shot-sets` | 将当前 approved shotprompt apply 为新的 active shot set；旧 active shot set 归档。 | `{ shotPromptArtifactId? }` |
| GET  | `/api/workspaces/:workspaceId/shots`     | 便捷接口：返回 active shot set 的 shots。                                          | 无                          |

`GET /api/workspaces/:workspaceId/shot-sets` 返回的分镜链路实例包含 `shotCount` 与 `upstream`。`shotCount` 表示该 active 实例下的分镜脚本数量；`upstream.upstreamChanged` 表示该实例是否仍来自当前生效的分镜生成要求。归档实例的 shots、候选图、候选视频和选择记录保留在数据库中，但不提供商家工作台读取或操作入口。

apply 行为：

1. 读取指定或当前 approved `shot_prompt_artifacts`。
2. 创建 `shot_sets(status='active')`。
3. 归档旧 active shot set。
4. 创建 `storyboard_shots`。
5. 为每个 shot 写 `shot_prompt_requirements.shot_image` 与 `shot_prompt_requirements.shot_video`。

### 5.1 Shot 素材引用

Shot 素材引用是 active shot set 内每个 shot 的可编辑素材提示。它服务于后续 image prompt / video script 的 prompt assembly，不自动触发重跑。

| 方法  | 路径                            | 业务逻辑                                                                                               | 请求                                     |
| ----- | ------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| GET   | `/api/shots/:shotId/asset-refs` | 列出 shot 当前素材引用，包含 `assetId`、`role`、`weight`、`position`，工作区素材应回填 `ref` / `url`。 | 无                                       |
| PATCH | `/api/shots/:shotId/asset-refs` | 用请求体顺序替换当前 active shot 的素材引用，`position` 由数组顺序决定；不重跑下游链路。               | `{ refs: [{ assetId, role, weight? }] }` |

`role` 固定为 `product_identity | reference_style | reference_scene | first_frame_hint | other`。服务端需要校验 shot 属于当前 active shot set，且 asset 属于同一 workspace 素材库或已存在 asset。历史 `shot set apply` 可继续读取 shotprompt 里的 `referenceAssetRefs` 初始化引用，但用户编辑后的行应按上述枚举归一。

---

## 6. 分镜图像链路

| 方法 | 路径                                                                  | 业务逻辑                                                                                                                                                                                                                                                                                                                                                                                                                           | 请求                                                                           |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| GET  | `/api/shots/:shotId`                                                  | 返回单个 shot、requirements、active prompt/script、当前选择、下一步建议。                                                                                                                                                                                                                                                                                                                                                          | 无                                                                             |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose`    | 后端确定性装配分镜图 prompt。第一块读取当前 shot 的 `providerPrompt` 作为“镜头目标”，第二块读取 `shotImage` 的场景、构图、光线、商品呈现、参考图使用和负向约束；不再调用二次创意 agent。写 ACTIVE `image_prompt_artifacts`、保存 deterministic assembly metadata，并创建图像 batch。候选数量由 `candidateCount` 或服务端默认值决定，宽高比由当前 shotprompt 决定。                                                                 | `{ userDirection?, candidateCount? }`                                          |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/image-prompts/regenerate` | 用户必须在最新 image round 的成功候选卡上填写文字反馈。服务端校验 `feedbackImageCandidateId` 属于当前 shot 最新轮成功候选，然后用 `baseArtifactId`、当前镜头目标、`shotImage` 和 `userDirection` 确定性装配新 prompt，写新的 ACTIVE `image_prompt_artifacts(created_by='user', base_artifact_id=...)` 和新的 image batch，不清空当前 `selected_image_id`。Seedream 图片输入顺序为：反馈候选图、本镜素材图、上一镜 selected image。 | `{ baseArtifactId, feedbackImageCandidateId, userDirection, candidateCount? }` |
| GET  | `/api/shots/:shotId/image-prompts`                                    | 列出该 shot 的图像 prompt artifacts。                                                                                                                                                                                                                                                                                                                                                                                              | 无                                                                             |
| GET  | `/api/workspaces/:workspaceId/shots/:shotId/image-rounds`             | 按 prompt artifact 聚合图像生成轮次、候选和当前选择；即使当前选择来自旧轮次，也会返回 current selection；每个 round 返回 `upstream`，提示该轮 prompt 是否基于旧上游。                                                                                                                                                                                                                                                              | 无                                                                             |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/image-candidates/select`  | 选择一张候选图。UPSERT `image_select_artifacts`，不 stale 其他候选。                                                                                                                                                                                                                                                                                                                                                               | `{ candidateId \| imageCandidateId, imageGenerationBatchId? }`                 |

图像 provider 请求只允许图片类参考输入。`shot_asset_refs` 中的视频素材仍可用于分镜语义、场景说明和后续视频脚本，但在没有关键帧/海报帧提取产物前，服务端必须过滤掉 `.mp4` 等非图片素材，不能把其字节作为 Seedream `image` 字段发送。

`candidateCount` 是本次生成/重生成的操作参数，不写入创作要求 artifact，也不推给数据看板；省略时使用 `DEFAULT_IMAGE_CANDIDATES`，超过 `MAX_IMAGE_CANDIDATES_PER_SHOT` 返回 `COUNT_EXCEEDS_LIMIT`。

图像选择校验：

- candidate 必须属于同一个 workspace/shot。
- candidate 必须 `SUCCEEDED`。
- 默认要求 candidate 来自该 shot 的可见候选轮次；前端可继续展示旧轮次候选并重新选择。

---

## 7. 分镜视频链路

| 方法 | 路径                                                                  | 业务逻辑                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 请求                                                                           |
| ---- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose`    | 后端确定性装配分镜视频 prompt。`providerPrompt` 只作为镜头目标上下文，执行约束来自 `shotVideo`、当前 selected image 首帧、下一镜 selected image 尾帧（末镜为空）、duration、voiceover 和 `tts.voiceProfile`；不再调用二次创意 agent。写 ACTIVE `video_script_artifacts` 后**异步**入队每候选一个 `generate_video_candidate` job，立即返回 PENDING batch + PENDING candidates，shot 进入 `VIDEO_GENERATING`；客户端轮询 `video-rounds` 直到 `VIDEO_CANDIDATES_READY`。Seedance 返回临时 mp4 后候选先进入 `PERSISTING`，可通过 `previewVideoUrl` 临时预览，但仍不可选择或成片。 | `{ userDirection?, candidateCount? }`                                          |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/video-scripts/regenerate` | 用户必须在最新 video round 的成功候选卡上填写文字反馈。服务端校验 `feedbackVideoCandidateId` 属于当前 shot 最新轮成功候选，然后用 `baseArtifactId`、当前镜头目标、`shotVideo`、首尾帧、duration、voiceover 和 voice profile 确定性装配新 video script artifact 与 video batch。反馈视频候选只记录为反馈对象和 trace，不作为 provider 视频输入；不清空当前 `selected_video_id`。                                                                                                                                                                                               | `{ baseArtifactId, feedbackVideoCandidateId, userDirection, candidateCount? }` |
| GET  | `/api/shots/:shotId/video-scripts`                                    | 列出该 shot 的视频脚本 artifacts。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 无                                                                             |
| GET  | `/api/workspaces/:workspaceId/shots/:shotId/video-rounds`             | 按 video script artifact 聚合视频生成轮次、候选和当前选择；每个 round 返回 `upstream`，提示该轮视频脚本是否基于旧上游或旧首尾帧。候选额外返回 `previewVideoUrl/providerTaskId/providerReadyAt/persistStatus`，其中 `PERSISTING` 表示 provider 已出片、正在保存素材，batch 仍未完成。                                                                                                                                                                                                                                                                                          | 无                                                                             |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/video-candidates/select`  | 选择一个候选视频。只接受 `SUCCEEDED` 且已有 stable `videoUrl/objectKey` 的候选；`PERSISTING` 的临时 provider URL 只用于预览，不能写选择或成片。UPSERT `video_select_artifacts`，不 stale 其他候选。                                                                                                                                                                                                                                                                                                                                                                           | `{ candidateId \| videoCandidateId, videoGenerationBatchId? }`                 |

视频脚本 propose 前置条件与一致性约束：

- 只读取当前 active shot set；archived shot set 的 selected images 不参与 `first_frame` / `last_frame`、next shot、完成度或批量视频前置检查。
- active shot set 内全部需要的视频锚点图已选择；否则返回 `IMAGE_SELECTION_INCOMPLETE`。
- Shot N 的 `first_frame` 来自 Shot N 的 current selected image；非最后一个 Shot N 的 `last_frame` 来自 Shot N+1 的 current selected image；最后一个 shot 的 `last_frame` 为 `null`。
- Seedance 单个候选视频时长必须在 4-12 秒范围内。server 会在创建 video script 时把 shot 默认时长夹到 provider 允许范围内，避免 3 秒 storyboard shot 直接传入 Seedance。
- 视频候选生命周期是候选级状态：`PENDING/RUNNING` 调用 provider；provider 返回临时 mp4 URL 后写 `PERSISTING`、`providerTaskId`、`providerReadyAt` 和 `previewVideoUrl`；本地 stable 保存完成后才写 `SUCCEEDED + videoUrl/objectKey`。
- video provider 同时在飞调用数 ≤ `VIDEO_PROVIDER_CONCURRENCY`（进程级信号量）。Seedance task-create 阶段命中账号 RPM 429（如 `EndpointAccountRpmRateLimitExceeded`）时不在 provider 内原地等待，立即抛给 `generate_video_candidate` 的队列重试，释放 video provider slot；task polling 阶段的 429/5xx/超时仍按 `Retry-After` / 指数退避重试。
- Seedance prompt 追加 approved shotprompt 的统一旁白 voice profile：同一说话人、`gender`、`tone`、`pitch`、`pace`、自然清晰普通话和电商短视频播报风格。每个 shot 只朗读本镜头 `voiceover`；旁白只进入音频，禁止将口播文案、旁白文字或其改写复制、叠加、渲染到视频画面内，也不要生成字幕样式、标题贴片或乱码文字。`video_script_artifacts.source_fingerprint` 记录 `firstFrameCandidateId`、`lastFrameCandidateId`、`voiceProfile`、`voiceProfileHash` 和本镜 `voiceover`。
- `candidateCount` 是本次生成/重生成的操作参数；省略时使用 `DEFAULT_VIDEO_CANDIDATES`，超过 `MAX_VIDEO_CANDIDATES_PER_SHOT` 返回 `COUNT_EXCEEDS_LIMIT`。

---

## 8. 重试与批次

| 方法    | 路径                                                | 业务逻辑                                                                                                                                                 | 请求                   |
| ------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------- |
| POST 🔑 | `/api/shots/:shotId/retry`                          | 对当前 active image prompt 或 video script 重新创建 batch。                                                                                              | `{ what: "image_batch" | "video_batch" }` |
| GET     | `/api/workspaces/:workspaceId/shot-workflow-status` | 返回当前 active shot set 的整体状态、每个 shot 的候选/选择状态、是否可合成；不会混入 archived shot set rows；尚未生成 active shot set 时返回空 `shots`。 | 无                     |

retry 使用调用方提供的 `Idempotency-Key`。普通 propose 路由内部创建 batch，可以由服务端生成幂等键。

`shot-workflow-status` 是首屏恢复/轮询接口。workspace 存在但尚未 apply active shot set 时，接口返回 `shots: []`、`canComposeFinalVideo: false`，不抛 `NO_ACTIVE_SHOT_SET`；真正的 shot 级操作仍要求 active shot set。每个 shot 行除 `selectedImageId` 外还返回 `selectedImageUrl`：当前 shot 已选分镜图候选的图片 URL，未选择时为 `null`。每个 shot 行也返回 `upstream`，表示该 shot 当前 active image prompt / video script 是否基于旧上游或旧首尾帧；它只提示 redo handoff，不自动删除候选、选择或成片链路。`videoUpstream` 只描述视频脚本/视频候选相对最新首尾帧、shotprompt、voice profile 等视频输入是否过期；前端批量生成分镜视频候选时应以 `videoUpstream.upstreamChanged` 判断旧视频是否需要更新，不能仅因存在旧 `selectedVideoId` / `activeVideoBatchId` 禁用入口。`activeVideoBatchStatus` 表示最新视频 batch 的状态，用于避免 `PENDING` / `RUNNING` 期间重复提交。前端分镜列表据此直接渲染已选缩略图，无需为每个 shot 单独调用 `image-rounds`。

---

## 9. 分镜图自动选择任务

| 方法    | 路径                                                      | 业务逻辑                                                                                                                                                                                                                              | 请求                  |
| ------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| POST 🔑 | `/api/workspaces/:workspaceId/shot-image-auto-selections` | 启动“批量生成并选择分镜图”任务。按当前 active shot set 顺序推进，已有 selected image 的镜头跳过；未选择的镜头生成 image batch，batch 完成后选择首个 `SUCCEEDED` 且已有 stable URL 的候选图。同一 workspace 同时只允许一个运行中任务。 | `{ candidateCount? }` |
| GET     | `/api/shot-image-auto-selections/:jobId`                  | 返回自动选图任务状态、当前阶段、阶段状态、候选数量、错误信息。                                                                                                                                                                        | 无                    |
| GET     | `/api/workspaces/:workspaceId/shot-image-auto-selections` | 列出最近自动选图任务，供刷新恢复运行中、失败或完成状态。                                                                                                                                                                              | 无                    |

自动选图任务只处理分镜图，不生成分镜视频，不触发 final compose，也不写创作要求 artifact。自动选择策略固定为 `first_success`：按 `providerResponse.candidateIndex` 和创建时间排序，选择首个成功且有稳定 `imageUrl` 的候选。若 batch `SUCCEEDED/PARTIAL/FAILED` 后仍没有可选成功候选，任务失败并保留此前已完成的选择。

---

## 10. 成片 Final Video

| 方法    | 路径                                                              | 业务逻辑                                                                                                                                                                                                                                                                                                                 | 请求                                                                                      |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| POST 🔑 | `/api/workspaces/:workspaceId/one-click-final-videos`             | 从素材解读审核页独立启动全自动一键成片。请求内 `materialIntake.data` 先被批准为 current，然后自动执行 product-brief propose/approve、storyboard propose/approve、shotprompt propose/approve、shot-set apply、逐分镜图生成/自动选择、分镜视频生成/自动选择和 final compose。同一 workspace 同时只允许一个运行中一键任务。 | `{ materialIntake:{ data }, outputAspectRatio?, autoSelectionStrategy?:"first_success" }` |
| GET     | `/api/one-click-final-videos/:jobId`                              | 返回一键成片任务状态、当前阶段、阶段状态、中间 artifact/shot set/final job id 和错误信息。                                                                                                                                                                                                                               | 无                                                                                        |
| GET     | `/api/workspaces/:workspaceId/one-click-final-videos`             | 列出最近一键成片任务，供刷新恢复运行中、失败或完成状态。                                                                                                                                                                                                                                                                 | 无                                                                                        |
| POST 🔑 | `/api/workspaces/:workspaceId/final-videos`                       | 基于 active shot set 的当前 `video_select_artifacts` 创建成片任务。缺选择返回 `MISSING_SELECTIONS`。                                                                                                                                                                                                                     | `{ outputAspectRatio? }`                                                                  |
| GET     | `/api/final-videos/:finalVideoJobId`                              | 返回成片作业状态。                                                                                                                                                                                                                                                                                                       | 无                                                                                        |
| GET     | `/api/workspaces/:workspaceId/final-videos`                       | 列出最近成片作业。                                                                                                                                                                                                                                                                                                       | 无                                                                                        |
| GET     | `/api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file` | 流式返回成片文件。未完成返回 `NOT_READY`。                                                                                                                                                                                                                                                                               | 无                                                                                        |

### 10.1 数据面板视频 Artifact

| 方法 | 路径                                                        | 业务逻辑                                                                                                                                                                                                           | 请求                        |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| POST | `/api/workspaces/:workspaceId/dashboard/videos`             | 将已完成成片导入数据面板视频 artifact。后端校验成片属于当前 workspace 且 `status=SUCCEEDED`、已有 `localUrl`，然后快照成片 URL、名称、导入时间、时长、宽高、`compiledManifest.creativeTags` 与 `creativeFactors`。 | `{ finalVideoJobId, name }` |
| GET  | `/api/workspaces/:workspaceId/dashboard/videos`             | 列出数据面板视频 artifact，供看板左侧“视频列表”渲染 metadata。                                                                                                                                                     | 无                          |
| GET  | `/api/workspaces/:workspaceId/dashboard/videos/:artifactId` | 获取单个数据面板视频 artifact。                                                                                                                                                                                    | 无                          |

当前后端不计算 CTR、3 秒留存、完播率、CVR、ROAS、GMV 或漏斗；这些投放效果指标不能从成片 artifact 推导。P0 看板的视频列表读取 `dashboard_video_artifacts`，诊断指标可以由前端样例 JSON 承载，后续接入真实投放数据时再由 campaign publication metrics 聚合。

一键成片与手动审核链路是两个独立入口：素材解读页的“批准素材解读并生成商品卖点”仍只批准素材解读并生成商品卖点草稿；右侧“全自动一键成片”调用一键成片 API，不复用前端手动链路 mutation。自动候选选择策略固定为首个 `SUCCEEDED` 且已有 stable URL 的候选；视频候选处于 `PERSISTING` 时继续等待，不写选择。自动选择写 `selected_by='system:auto-one-click'`。任务失败后保留已批准 artifact、候选、选择和成片作业事实，用户可回到对应步骤手动继续。

成片任务保存 `shotSetId`、有序 `sourceVideoCandidateIds` 和 `sourceVideoScriptArtifactIds`。上游之后变更不会改变已创建的成片任务。

---

## 11. Campaign

| 方法 | 路径                                                                        | 业务逻辑                 | 请求                                                                                    |
| ---- | --------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| POST | `/api/workspaces/:workspaceId/campaign-publications`                        | 登记一次成片发布。       | `{ finalVideoJobId?, platform, channelName, kolName?, publishUrl?, status?, notes? }`   |
| GET  | `/api/workspaces/:workspaceId/campaign-publications`                        | 列出发布记录和最新指标。 | 无                                                                                      |
| GET  | `/api/workspaces/:workspaceId/campaign-publications/:publicationId`         | 获取单条发布记录。       | 无                                                                                      |
| POST | `/api/workspaces/:workspaceId/campaign-publications/:publicationId/metrics` | 写入一条发布指标。       | `{ impressions?, clicks?, conversions?, spendCents?, capturedAt?, source?, metadata? }` |

---

## 12. Trace

| 方法 | 路径                                  | 业务逻辑                    | 请求                        |
| ---- | ------------------------------------- | --------------------------- | --------------------------- |
| GET  | `/api/workspaces/:workspaceId/traces` | 分页列工作区 trace events。 | query `{ limit?, cursor? }` |
| GET  | `/api/shots/:shotId/traces`           | 分页列 shot trace events。  | query `{ limit?, cursor? }` |

trace 必须能回答 agent 链路调试问题：

- 读了哪些 input artifacts。
- 使用了哪些 subject/contract prompt 模板及其 hash。
- 最终 assembled prompt 是什么。
- provider 请求/响应摘要是什么。
- batch/job 状态如何变化。

真实 provider 模式下，image/video worker 会把 provider call 审计写入 `trace_events(trace_type='provider_call')`，这是云端事实源。metadata 保存 job、batch、candidate、attempt、provider/model、`mediaType`、`status`、生成数量、延迟、错误、首尾帧/参考图数量、图片参考图来源分类 `referenceImageSources`、`promptHash` 和 URL 摘要（host/hash，不保存 signed URL 或 data URL 原文）。LOCAL workspace 额外镜像 `.daireel/trace/provider_call.jsonl` 用于本地调试；S3 workspace 不写 `events.jsonl/provider_call.jsonl`。持久化阶段另写 `asset_persist_started/completed/failed` trace event，记录 `candidateId/providerTaskId/bytes/latencyMs/stableUrl/error`。写入失败只记录 warn，不会让候选生成失败。mock 模式不创建 provider_call 审计。

---

## 13. 静态文件流

| 方法 | 路径                                       | 业务逻辑                                     |
| ---- | ------------------------------------------ | -------------------------------------------- |
| GET  | `/api/workspaces/:workspaceId/videos/*`    | 从 workspace video storage 流式返回文件。    |
| GET  | `/api/workspaces/:workspaceId/materials/*` | 从 workspace material storage 流式返回文件。 |
| GET  | `{UPLOAD_URL_PREFIX}/*`                    | legacy upload 文件流，仅本地开发开启。       |

---

## 14. 常见错误码

| HTTP | code                                     | 触发                                                                           |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| 400  | `IDEMPOTENCY_KEY_REQUIRED`               | 🔑 接口缺 `Idempotency-Key`                                                    |
| 400  | `NO_CURRENT_APPROVED_ARTIFACT`           | 下游模块缺少所需上游 current approved artifact                                 |
| 400  | `NO_ACTIVE_SHOT_SET`                     | shot 级操作前尚未 apply shot set                                               |
| 400  | `IMAGE_SELECTION_INCOMPLETE`             | 视频脚本或成片前仍有 shot 缺少 selected image                                  |
| 400  | `INVALID_PROVIDER_DURATION`              | 单个候选视频时长不满足 provider 限制                                           |
| 400  | `UPSTREAM_STORYBOARD_NOT_P0`             | 分镜生成要求或 shot set apply 前，current approved storyboard 不是 P0 三镜脚本 |
| 404  | `NOT_FOUND`                              | 工作区、artifact、shot、candidate 等不存在                                     |
| 404  | `NOT_READY`                              | 成片文件尚未生成                                                               |
| 400  | `INVALID_ASSET_REF`                      | shot 素材引用指向不存在或不属于当前 workspace 的 asset                         |
| 400  | `SHOT_NOT_IN_ACTIVE_SET`                 | 对 archived shot 或非 active shot set 的 shot 执行链路/素材引用操作            |
| 409  | `STORAGE_ALREADY_BOUND`                  | 工作区已有 active storage                                                      |
| 409  | `CANDIDATE_NOT_SELECTABLE`               | candidate 不属于当前 shot/workspace 或未成功                                   |
| 409  | `MISSING_SELECTIONS`                     | 成片时 active shot set 存在未选定视频                                          |
| 409  | `UPSTREAM_CHANGED_CONFIRMATION_REQUIRED` | 若接口选择强制二次确认，可在用户明确覆盖时使用；默认查询只返回提示，不报错     |
