# Bug 013: 素材复制链路与最终 Seedance prompt trace 已修复

## Summary

该文档最初记录两个相关但不同的问题：

1. 素材导入/素材清点没有保证文件进入 `.daireel/materials/`，导致成片阶段找不到文件。
2. 需要确认分镜 / shotprompt 数据是否进入传给 Seedance 的最终 prompt，以及最终 prompt 应由哪个模块负责组装。

当前状态：

- **素材导入/复制问题已解决**：multipart 上传会写入 `.daireel/materials/`；对历史/旧工作目录，素材清点前会将用户显式选中的根目录素材复制到 `.daireel/materials/`。
- **最终 Seedance prompt 组装已修复**：最终视频 prompt 会把 approved `shotprompt.prompt` 放在最前面作为主创意约束，并继续保留 `shots[].providerPrompt` 作为 per-shot 分镜补充。
- **最终 prompt trace 已修复**：成片前会向当前 workspace 的 `.daireel/trace/events.jsonl` 写入 `video.prompt_prepared`，用于确认即将发送给 Seedance 的 promptView。

原始报错来自工作目录 `/Users/carrick/TestWorkspace/Project-AIGC/0526v1/`，成片阶段失败：

```text
ENOENT: no such file or directory, stat '/Users/carrick/TestWorkspace/Project-AIGC/0526v1/.daireel/materials/display_1.png'
```

该 workspace 的真实文件结构显示：

- 根目录存在 `display_1.png`。
- `.daireel/materials/` 不存在该文件。
- `.daireel/workspace.json` 指向 workspaceId `dTL94890XJi0F99oypDCj` 和 scriptId `eAntwr5QSEkedC7iYfxlW`。

## Diagnose Result

### 1. 分镜数据是否进入 Seedance 最终 prompt（已修复）

从 trace 看，当前请求尚未进入真正的视频生成阶段：

- trace 有 `shotprompt.request_prepared`、`provider.response_received`、`shotprompt.parsed`。
- trace 没有 `one_click_video` / `video.image_prepared` / Seedance video provider request 事件。

所以：**这份 trace 不能证明最终 Seedance provider request 已经发生**，因为成片在创建 job 之前就因素材文件缺失失败。

但从已完成的链路和代码可以确认当前设计的数据流：

- `shotprompt.request_prepared` 的 prompt 中包含完整 `Approved storyboard`。
- `shotprompt.provider.response_received` 输出了：
  - 全局 `prompt`
  - `shots[].providerPrompt`
  - `shots[].referenceAssetRefs`
  - `shots[].voiceover`
- `startVideoGeneration()` 会把 approved shotprompt 转成 `GeneratedScript`。
- `processMediaGeneration()` 调用 `buildTwelveSecondVideoPrompt(script)`。
- `buildTwelveSecondVideoPrompt()` 会把 `script.shots[].visualPrompt` 拼入最终 prompt 的 `Storyboard inspiration only` 段落。

因此：**分镜内容会以 shotprompt 编译后的 `providerPrompt / visualPrompt` 形式进入最终 Seedance prompt，不是以原始 storyboard JSON 形式进入。**

已修复后的边界：

- `shotprompt.prompt` 作为最终 Seedance prompt 的开头部分进入 provider request。
- `shots[].providerPrompt` 仍作为 `Storyboard inspiration only` 进入最终 prompt，帮助 Seedance 保留镜头顺序和局部画面意图。
- 成片前写入 `video.prompt_prepared` trace，包含 prompt 和 promptView。
- 对 workspace 链路，视频阶段 trace 写入当前工作目录 `.daireel/trace/events.jsonl`，而不是默认批次 trace 目录。

### 2. 成片失败原因（已修复）

当前 `createScriptBundleForShotPrompt()` 会读取：

```ts
path.join(workspaceMaterialsPath(localPath), primaryRef)
```

也就是：

```text
<workspace>/.daireel/materials/display_1.png
```

但该目录下没有文件。素材在根目录：

```text
<workspace>/display_1.png
```

这说明当时链路存在断层：**素材清点可以生成 artifact ref，但没有保证被选中的素材文件已经复制进系统管理目录 `.daireel/materials/`。**

已修复行为：

- 新上传素材通过 multipart 写入 `<workspace>/.daireel/materials/`。
- 运行素材清点时，如果用户显式选择了旧根目录素材，后端会在扫描前复制到 `<workspace>/.daireel/materials/`。
- 素材清点和后续 builder 仍只读取 `.daireel/materials/`，不会恢复到隐式扫描 workspace 根目录。

## Root Cause

Issue #83 之后，系统的目标设计变成：

- 所有 V1 builder 只读 `.daireel/materials/`。
- 上传素材会落到 `.daireel/materials/`。
- workspace 根目录不再自动作为系统素材库。

但“选择已有本地工作目录并运行素材清点”的路径当时还没有完成配套迁移：

- 历史 workspace / 本地目录里可能只有根目录素材。
- material intake artifact 里保存了 `ref: display_1.png`。
- 成片阶段按新规则去 `.daireel/materials/display_1.png` 查找，于是失败。

该 root cause 已通过“显式选中素材迁移到 managed directory”的兼容层修复。

## Target Solution

- [x] 在 material intake 前增加“导入/确认素材到系统管理目录”的步骤：
  - 当前工作目录候选文件仍可来自用户目录。
  - 用户选择要导入的文件后，系统复制到 `<workspace>/.daireel/materials/`。
  - material intake 只基于 `.daireel/materials/` 生成 artifact。

- [x] 对历史 workspace 做兼容修复：
  - 如果用户在素材清点请求中显式选择 `ref`，而 `.daireel/materials/<ref>` 不存在、`<workspace>/<ref>` 存在，后端会复制到 managed directory。
  - 成片阶段不静默 fallback 到根目录，避免重新模糊“系统管理素材目录”的边界。

- [x] Trace 改进：
  - 成片前记录 `video.prompt_prepared`，包含最终 Seedance prompt 的 promptView 摘要。
  - 这样即使 provider 调用失败，也能确认最终 prompt 是否包含 shotprompt / storyboard-derived 内容。

- [x] Prompt 组装改进：
  - video export 使用 `shotprompt.prompt` 作为主 prompt 的第一段。
  - `buildTwelveSecondVideoPrompt()` 继续补充产品一致性、不可读文字约束、通用时长结构和 `shots[].providerPrompt` 分镜灵感。

## Test Plan

- 使用只有根目录 `display_1.png` 的 workspace：
  - 运行素材导入后，应复制到 `.daireel/materials/display_1.png`。
  - material intake artifact 引用该 managed copy。
  - 成片不再在 `stat(.daireel/materials/display_1.png)` 处失败。

- 已覆盖的回归测试：
  - `copies selected legacy root material refs into the managed material directory before intake`
  - `runs material intake only for selected workspace material refs`
  - `rejects selected material refs that are not valid candidates`

- 已覆盖的 prompt/trace 回归测试：
  - 成片前 trace 出现 `video.prompt_prepared`。
  - `video.prompt_prepared` 中能看到最终传入 Seedance 的 prompt 摘要。
  - approved `shotprompt.prompt` 进入最终 provider request。

验证命令：

```bash
pnpm --filter @aigc-video/server test -- src/modules/workspace/workspace.api.test.ts
```

## Assumptions

- `.daireel/materials/` 是 V1 的唯一 builder 素材源。
- 成片阶段不应隐式读取 workspace 根目录。
- 旧 workspace 可以通过显式选择素材触发迁移，或通过重新导入素材进入新规则。
