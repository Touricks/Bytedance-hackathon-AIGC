# Bug 007: 预览导出的 Seedance prompt 可见性、视频归档与 feedback 回环

## 用户反馈

作为用户，希望在成片生成和预览导出阶段：

1. 看到最终发送给 Seedance 的视频生成 prompt。
2. 看到当前视频对应的 `jobId`、生成时间、provider、视频地址和本地归档地址。
3. 看完视频后能提交 feedback。
4. feedback 不应覆盖已生成视频；旧 jobId 对应的视频必须继续可访问。
5. feedback 应路由回 brief / storyboard / shotprompt，并生成新的 proposed artifact。

## 相关前置决策

Bug 002 已确认：

- 生成视频应下载到 `.daireel/videos/`。
- 视频文件使用 `timestamp + jobId` 作为归档标识。
- 视频归档信息同步到 PostgreSQL。
- 删除素材会让 0-1-2-3-4 链路中的临时文件或中间决策失效，但已生成视频文件永久保存。

Bug 003 已确认：

- 视频导出也应纳入 0-1-2-3-导出 contract 视图。
- 开发者需要明确最终传给视频模型的 prompt 是否经过二次编译。

Bug 004 已确认：

- runtime prompt 必须提供可渲染的 `RuntimePromptView`。
- 前端默认只渲染 `nl.title` 与 `nl.sections`。

Bug 006 已确认：

- V1 视频生成不做字幕。
- TTS 以 `shots[].voiceover` 为源。

## 当前代码事实

- `VideoPreview` 只根据 `finalAsset.url` 展示 video 和“打开/导出成片”链接。
- `processMediaGeneration()` 使用 `buildTwelveSecondVideoPrompt(script)` 生成最终 Seedance prompt。
- final video asset metadata 当前保存 `prompt` 和 `provider`。
- `App.tsx` 当前没有 video preview feedback 输入框。
- `nextActionFor(video_ready)` 已暴露 `/api/workspaces/feedback/route`，但前端未接入。
- `routeFeedback()` 当前能生成 `feedbackRoute` artifact，但前端不会展示 route target 和 route reason。

## 问题判断

预览导出是用户判断“是否需要回改”的入口。当前 UI 只展示视频，不展示最终 Seedance prompt、jobId、归档信息，也没有反馈入口。

如果用户看完视频只能重新生成，系统就无法知道问题属于产品概述、UGC 分镜还是 ShotPrompt。正确行为应是让 feedback route 回到相应 artifact，并生成新的 proposed artifact，同时保留旧视频。

正确链路应是：

1. 用户确认 ShotPrompt。
2. 系统创建 video job。
3. 系统生成最终 Seedance prompt，并保存 promptView。
4. Seedance 返回视频后，系统下载并归档到 `.daireel/videos/`。
5. 前端展示视频、jobId、归档信息、最终 prompt preview。
6. 用户提交 feedback。
7. 系统记录 feedback route，并回到对应 artifact 的 proposed 状态。

## 已确认目标

### 1. 预览导出返回视频运行视图

视频完成后，前端应能获取：

```ts
type VideoExportRunView = {
  jobId: string;
  scriptId: string;
  workspaceId: string;
  status: "queued" | "running" | "completed" | "failed";
  provider: "seedance" | "mock";
  promptView: RuntimePromptView;
  finalVideo?: {
    assetId: string;
    jobId: string;
    localUrl?: string;
    providerUrl?: string;
    archivedAt?: string;
    createdAt: string;
  };
};
```

### 2. 视频导出 prompt preview

`buildTwelveSecondVideoPrompt(script)` 或其后续 contract 化版本必须产生可渲染 `RuntimePromptView`：

```ts
type VideoExportPromptView = RuntimePromptView & {
  contractId: "video_export";
  promptVersion: "seedance-video-export.v1";
  provider: "seedance" | "deterministic";
};
```

NL sections 至少包括：

- Role
- Source artifact
- Product consistency constraints
- Timeline
- Visual style
- TTS / audio note
- Output target

### 3. 视频归档 metadata

PostgreSQL 中的视频归档记录至少包括：

```ts
type WorkspaceVideoArchiveRecord = {
  id: string;
  workspaceId: string;
  scriptId: string;
  jobId: string;
  assetId: string;
  localPath: string;
  localUrl: string;
  providerUrl?: string;
  provider: "seedance" | "mock";
  promptVersion: string;
  createdAt: string;
  archivedAt: string;
};
```

前端预览导出模块默认展示：

- jobId
- provider
- createdAt / archivedAt
- localUrl
- providerUrl（可折叠）

### 4. Feedback 回环

预览导出模块提供 feedback 输入：

```ts
type VideoFeedbackRequest = {
  workspaceId: string;
  feedback: string;
  jobId?: string;
};
```

后端 route 输出继续兼容现有 `feedbackRouteArtifactSchema`：

```json
{
  "feedback": "string",
  "targetArtifact": "brief | storyboard | shotprompt",
  "previousJobId": "string",
  "reason": "string",
  "routedAt": "string"
}
```

前端提交 feedback 后：

- 显示 route target。
- 显示 route reason。
- 跳回对应 brief / storyboard / shotprompt 的 proposed 状态。
- 保留当前视频预览和历史 jobId 入口。

## API/Contract 调整建议

### Job detail

`GET /api/jobs/:jobId` 或 workspace status hydration 应返回：

```ts
type JobDetail = {
  job: GenerationJob;
  finalAsset?: Asset | null;
  videoExport?: VideoExportRunView;
};
```

### Workspace feedback route

```ts
type WorkspaceFeedbackRouteResponse = {
  workspace: CreativeWorkspace;
  routeArtifact: WorkspaceArtifact<FeedbackRouteArtifact>;
  artifact: WorkspaceArtifact<ProductBriefArtifact | StoryboardArtifact | ShotPromptArtifact>;
  route: {
    targetArtifact: "brief" | "storyboard" | "shotprompt";
    reason: string;
  };
};
```

## 前端行为

- 视频未完成：展示 job progress。
- 视频完成：展示 video、导出链接、jobId、归档信息、Seedance prompt preview。
- 用户提交 feedback 后：
  - 显示 route target 和 reason。
  - 对应阶段进入 proposed 状态。
  - 旧视频仍显示在预览导出模块或历史入口中。

## 验收标准

- [ ] 视频完成后，预览导出模块展示最终 Seedance prompt 的 NL preview。
- [ ] 展示 jobId、provider、生成时间、本地归档地址。
- [ ] 用户可以从预览导出模块提交 feedback。
- [ ] feedback 路由结果对用户可见。
- [ ] feedback 只生成新的 proposed artifact。
- [ ] 旧视频不会被新 feedback 覆盖或删除。
- [ ] 再次生成视频会创建新 jobId，历史视频仍可通过旧 jobId 访问。
