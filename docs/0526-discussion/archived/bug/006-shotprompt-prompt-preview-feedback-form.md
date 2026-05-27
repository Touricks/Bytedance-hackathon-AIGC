# Bug 006: 视频剧本 / ShotPrompt 的 prompt 预览、动态表单与 feedback 修订

## 用户反馈

作为用户，希望在“生成视频剧本”后：

1. 看到本次用于生成 shotprompt 的 runtime prompt。
2. 看到最终会交给 Seedance 的 provider prompt。
3. 能编辑视频剧本中的 provider prompt、分镜时间、引用素材和旁白。
4. feedback 命中 shotprompt 时，应生成新的 proposed shotprompt，而不是只把旧 artifact 重新展示。

## 相关前置决策

Bug 003 已确认建立 pipeline contract registry。

Bug 004 已确认：

- runtime prompt 必须提供可渲染的 `RuntimePromptView`。
- artifact 的可编辑字段由 form metadata 驱动。

Bug 006 追加确认：

- V1 视频生成不做字幕。
- ShotPrompt 阶段不把 `onScreenText` 作为用户可编辑字段。
- ShotPrompt 阶段不把 `onScreenText` 作为 Seedance 视频生成输入。
- `shots[].voiceover` 是用户编辑的旁白源。
- `tts` 是旁白渲染计划/结果，不是第二份可编辑文案。
- `tts.voiceover` 如保留，只作为 derived/read-only preview。

## 当前代码事实

- `App.tsx` 中 `ShotPromptSummary` 展示 provider、ratio、duration、`artifact.prompt`、TTS 和 JSON。
- `compileWorkspaceShotPrompt()` 固定传 `aspectRatio: "9:16"`。
- 后端 `compileShotPrompt()`：
  - mock 模式走 `compileShotPromptArtifact(storyboard)` deterministic compiler。
  - real 模式走 `generateShotPromptWithArk()`。
- `buildShotPromptPrompt()` 当前返回拼接字符串。
- `shotPromptForm` 目前只是 `{ fields: string[] }`。
- feedback 路由到 shotprompt 时，当前只是把 artifact 状态回到 `shotprompt_proposed`，没有真正生成修订版本。

## 问题判断

ShotPrompt 是从 UGC 分镜进入 provider 执行的关键层。它既要让用户理解“最终视频模型将如何执行”，又不能把字幕能力承诺给用户。

目前 schema 中存在 `shots[].onScreenText`，但 Seedance 当前做字幕效果不好。若在视频剧本表单中继续展示该字段，会误导用户认为字幕是 V1 的生成目标。

TTS 的职责也需要清晰：旁白正文应来自 `shots[].voiceover`，TTS 负责把这些旁白渲染为音频计划或音频结果，而不是维护第二份可能与 shots 不一致的可编辑文案。

正确链路应是：

1. 用户确认 UGC 分镜。
2. 系统生成 ShotPrompt，并返回 prompt NL preview。
3. 系统展示最终 provider prompt preview。
4. 前端以表单编辑 ShotPrompt 的 provider prompt、分镜时间、引用素材和 voiceover。
5. TTS 区块展示从 `shots[].voiceover` 汇总出的只读预览和渲染状态。
6. feedback 如果路由到 shotprompt，应生成新的 proposed shotprompt，不覆盖旧视频 job。

## 已确认目标

### 1. 视频剧本返回 prompt 预览

`POST /api/workspaces/shotprompt/compile` 返回：

```ts
type WorkspaceShotPromptDetail = {
  workspace: CreativeWorkspace;
  artifact: WorkspaceArtifact<ShotPromptArtifact>;
  promptView: RuntimePromptView;
  form: ShotPromptFormContract;
  trace?: Record<string, unknown>;
};
```

前端在“视频剧本”格内展示：

- prompt version。
- NL sections，例如：
  - Role
  - Approved product brief
  - Approved material manifest
  - Approved storyboard
  - Provider constraints
  - Output contract
- 最终 provider prompt preview。
- TTS 只读汇总预览。

### 2. ShotPrompt JSON 字段结构

V1 文档契约应收敛为：

```json
{
  "targetProvider": "seedance",
  "durationSec": 12,
  "aspectRatio": "9:16 | 16:9 | 1:1",
  "prompt": "string",
  "negativePrompt": "string",
  "shots": [
    {
      "index": 0,
      "startSec": 0,
      "endSec": 3,
      "providerPrompt": "string",
      "referenceAssetRefs": ["string"],
      "voiceover": "string"
    }
  ],
  "tts": {
    "enabled": true,
    "source": "shots.voiceover",
    "voiceover": "string",
    "audioAssetRef": "string | undefined"
  },
  "assumptions": ["string"]
}
```

说明：

- `shots[].voiceover` 是用户编辑的旁白源。
- `tts.source` 固定为 `shots.voiceover`。
- `tts.voiceover` 是从 `shots[].voiceover` 汇总出来的只读预览。
- `tts.audioAssetRef` 是 TTS 生成后的音频资产引用，可为空。
- `onScreenText` 不进入 V1 ShotPrompt 文档契约。

### 3. ShotPrompt 动态表单 metadata

ShotPrompt contract 必须提供 form metadata：

```ts
type ShotPromptFormContract = {
  artifactType: "shotprompt";
  artifactSchemaVersion: "shotprompt-artifact.v1";
  fields: Array<{
    path: string;
    label: string;
    component:
      | "textarea"
      | "number"
      | "select"
      | "asset_ref_list"
      | "checkbox"
      | "readonly_textarea"
      | "shotprompt_repeater"
      | "string_list";
    required: boolean;
    readOnly?: boolean;
    source?: "material.assets" | "static" | "derived";
    options?: string[];
    helpText?: string;
  }>;
};
```

V1 shotprompt 表单字段：

```json
[
  {
    "path": "aspectRatio",
    "label": "画幅",
    "component": "select",
    "required": true,
    "source": "static",
    "options": ["9:16", "16:9", "1:1"]
  },
  {
    "path": "prompt",
    "label": "全局视频 Prompt",
    "component": "textarea",
    "required": true
  },
  {
    "path": "negativePrompt",
    "label": "Negative Prompt",
    "component": "textarea",
    "required": false
  },
  {
    "path": "shots",
    "label": "视频镜头",
    "component": "shotprompt_repeater",
    "required": true
  },
  {
    "path": "shots[].startSec",
    "label": "开始秒数",
    "component": "number",
    "required": true
  },
  {
    "path": "shots[].endSec",
    "label": "结束秒数",
    "component": "number",
    "required": true
  },
  {
    "path": "shots[].providerPrompt",
    "label": "镜头 Prompt",
    "component": "textarea",
    "required": true
  },
  {
    "path": "shots[].referenceAssetRefs",
    "label": "引用素材",
    "component": "asset_ref_list",
    "required": true,
    "source": "material.assets"
  },
  {
    "path": "shots[].voiceover",
    "label": "镜头旁白",
    "component": "textarea",
    "required": true
  },
  {
    "path": "tts.enabled",
    "label": "启用 TTS",
    "component": "checkbox",
    "required": true
  },
  {
    "path": "tts.source",
    "label": "TTS 文案来源",
    "component": "select",
    "required": true,
    "readOnly": true,
    "source": "static",
    "options": ["shots.voiceover"]
  },
  {
    "path": "tts.voiceover",
    "label": "TTS 文案预览",
    "component": "readonly_textarea",
    "required": true,
    "readOnly": true,
    "source": "derived"
  },
  {
    "path": "assumptions",
    "label": "模型假设",
    "component": "string_list",
    "required": false
  }
]
```

### 4. Feedback 修订行为

当 feedback route 判定 `targetArtifact = "shotprompt"` 时：

- 系统应创建新的 proposed shotprompt。
- 新 shotprompt 应是结构化 `ShotPromptArtifact`，不是旧 artifact 原样返回。
- route artifact 记录 `previousJobId`，确保旧视频仍可按 jobId 访问。
- 前端展示 route target、route reason 和新的 shotprompt 表单。

## API/Contract 调整建议

### ShotPrompt compile request

```ts
type ShotPromptCompileRequest = {
  workspaceId: string;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  userDirection?: string;
};
```

`userDirection` 是可选补充方向，不替代 approved storyboard。

### ShotPrompt feedback repair request

```ts
type ShotPromptFeedbackRepairInput = {
  currentShotPrompt: ShotPromptArtifact;
  approvedStoryboard: StoryboardArtifact;
  approvedBrief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  feedback: string;
  previousJobId?: string;
};
```

## 验收标准

- [ ] 生成视频剧本后展示 shotprompt runtime prompt 的 NL preview。
- [ ] 前端展示最终 provider prompt，并能编辑。
- [ ] 表单不展示 `onScreenText` 字段。
- [ ] 发送给 Seedance 的视频生成输入不依赖 `onScreenText`。
- [ ] TTS 文案预览从 `shots[].voiceover` 派生，用户不需要维护第二份文案。
- [ ] 用户确认时提交完整且符合 V1 ShotPrompt 文档契约的 JSON。
- [ ] feedback 命中 shotprompt 时，生成新的 proposed shotprompt。
- [ ] feedback 不覆盖旧视频 job，也不删除旧视频归档。

