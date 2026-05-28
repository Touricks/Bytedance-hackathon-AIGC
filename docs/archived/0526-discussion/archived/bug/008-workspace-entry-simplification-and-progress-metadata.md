# Bug 008: 工作目录入口简化与进度元信息归位

## 用户反馈

当前首屏仍然让用户困惑：

1. `工作目录入口`、`工作目录名称`、`工作目录素材库` 三个概念同时出现，用户不知道应该填哪一个。
2. V1 第一版不应该提供“新建托管工作目录”入口。用户可以在系统目录选择器里新建文件夹，再把该文件夹作为工作目录打开。
3. “工作目录素材库”区域不应该渲染支持文件的具体文件名和数量。它会压缩“导入素材”按钮，也让用户误以为素材清单展示就是导入动作。
4. `workspaceId`、`scriptId`、`status`、`next` 不应该在首屏入口区下方独立展示。它们是系统运行元信息，应移动到“生成进度”栏里，否则用户会误解为需要操作或填写的业务信息。

## 当前配置事实

当前 `.env` 没有配置 `WORKSPACE_DIR`：

```env
UPLOAD_DIR=storage/uploads
```

服务端配置逻辑是：

```ts
workspaceDir = WORKSPACE_DIR ?? path.join(UPLOAD_DIR, "workspaces")
```

因此当前 workspace root 解析为：

```text
/Users/carrick/.codex/worktrees/5a8c/Bytedancehack/storage/uploads/workspaces
```

现有 `工作目录名称 + 新建` 的行为是在这个 root 下创建 Fastify 托管目录。

## 问题判断

这里不是单个文案错误，而是三个信息层级混在了同一个首屏区域：

- **工作目录入口**：选择或恢复一个本地目录，是用户真正需要完成的第一步。
- **托管目录创建**：系统帮用户在默认 root 下创建空目录，是次要能力，不应成为 V1 主路径。
- **系统元信息**：`workspaceId/scriptId/status/next` 是后端状态，不是用户任务输入。
- **素材状态**：素材区应回答“当前目录是否可导入素材”，不应在入口附近铺开候选详情。

V1 产品模型是“基于一个工作目录进行开发”，所以首屏应该只引导用户完成一件事：打开当前工作目录。

## 已确认解决方案

### 1. 移除“新建托管工作目录”前端入口

V1 第一版从 UI 中移除：

- `工作目录名称` 输入框
- `新建` 按钮

用户如果要创建新目录，应通过系统目录选择器的新建文件夹能力完成：

1. 点击 `选择工作目录`
2. 在系统文件选择器中创建或选择文件夹
3. 前端调用 `/api/workspaces/init`
4. 服务端写入或恢复 `.daireel/workspace.json`

推荐实现范围：

- 前端不再展示 `createWorkspace(name)` 的入口。
- 后端 `/api/workspaces` 创建接口可以暂时保留，作为测试或内部能力，不在 V1 用户界面暴露。
- 前端 `listWorkspaces()` 仍可用于历史目录下拉，但不是“新建目录”的入口。

### 2. 首屏入口只保留“打开工作目录”

入口区建议收敛为：

```text
工作目录
[选择历史工作目录 v]
[当前未选择工作目录] [选择工作目录]
[手动输入路径]（折叠）
```

文案建议：

- `工作目录入口` 改为 `工作目录`
- `选择目录` 改为 `选择工作目录`
- `尚未选择工作目录` 保留为只读状态
- `手动输入路径` 保持折叠，只作为目录选择器不可用时的 fallback

用户不需要理解 workspace root，也不需要知道托管目录是如何创建的。

### 3. 素材区只表达“导入到当前工作目录”

`工作目录素材库` 改为：

```text
当前工作目录素材
未选择工作目录

导入素材
[选择文件]
```

主 UI 不展示：

- 支持文件的具体文件名 chip
- usable 数量
- rejected 数量
- 过长的本地路径

这些信息会压缩导入按钮，并且在导入前没有操作价值。

推荐实现：

- 未选择工作目录时，导入控件 disabled。
- 已选择工作目录后，只显示当前目录名称或短路径。
- 合规文件列表进入素材清点卡片或折叠详情，而不是入口素材区。
- rejected 文件只在“被忽略文件”折叠详情中展示。

### 4. `workspaceId/scriptId/status/next` 移到生成进度

当前独立的 status strip：

```text
workspace | script | status | next
```

应从入口区下方移除，移动到 `生成进度` panel 内。

生成进度 panel 建议结构：

```text
生成进度
当前阶段：material_intake / brief / storyboard / shotprompt / video / feedback
运行模式：mock / real
下一步：运行素材清点 / 确认产品概述 / ...

开发者信息（折叠）
workspaceId
scriptId
jobId
status
next endpoint
```

默认展示面向用户的阶段语言，不默认展示 id。

理由：

- `workspaceId` 和 `scriptId` 是系统身份，不是用户输入。
- `status` 和 `next` 是 agent/dev 调试信息，不应与工作目录入口并列。
- 生成进度本来就是承载状态机信息的位置。

### 5. Runtime badge 不应制造默认状态误解

未选择工作目录时，不显示 `MOCK fastify` 这类默认值。

建议显示：

```text
pending
select workspace
```

选择工作目录并获取 status 后再显示真实状态：

```text
mock
local builder
```

或 real 模式：

```text
real
ark / seedance
```

## 前端行为目标

### 初始空状态

用户进入页面后，只需要看到：

1. 一个清楚的工作目录选择入口。
2. 一个 disabled 的素材导入区域，提示先选择工作目录。
3. 四步骤面板处于 waiting。
4. 生成进度栏显示“等待选择工作目录”。

不应该看到：

- 工作目录名称输入框
- 新建按钮
- workspaceId/scriptId/status/next 横向信息条
- 大量素材文件 chip

### 选择目录后

用户选择工作目录后：

1. 当前目录名称/短路径显示在入口区。
2. 素材导入控件启用。
3. 生成进度栏显示 workspace 状态与下一步。
4. 如目录已有 `.daireel/workspace.json`，系统通过 workspaceId/scriptId 恢复历史 artifacts。

### 导入素材后

用户导入素材后：

1. 素材区只显示“已导入 N 个素材”或简短成功提示。
2. 具体素材列表进入素材清点卡片内，或折叠展示。
3. 不在首屏入口区渲染长文件名 chip。

## 建议实现拆分

### Issue A: 移除新建托管工作目录入口

- 删除或隐藏 `workspaceName` 输入框。
- 删除或隐藏 `新建` 按钮。
- 保留 `selectWorkspaceDirectory()` 和手动路径 fallback。
- `createWorkspace()` API client 可暂时保留，避免影响测试或内部调用。

### Issue B: 简化素材入口

- `material-library-strip` 只保留当前目录状态和导入控件。
- 移除入口区的 usable/rejected counters 和 asset chips。
- 将详细素材候选列表移动到素材清点 panel 内或折叠详情。

### Issue C: 移动状态元信息

- 删除独立 `status-strip`。
- 在 `JobProgress` 或新的 progress panel 内展示用户友好的 next action。
- 将 workspaceId/scriptId/jobId/status/endpoint 放进 `details` 折叠区。

### Issue D: 文案统一

推荐文案：

- `工作目录入口` -> `工作目录`
- `选择目录` -> `选择工作目录`
- `工作目录素材库` -> `当前工作目录素材`
- `导入素材` -> `导入到当前工作目录`
- `状态` 按钮 -> `刷新状态`，并移动到生成进度 panel 或入口右侧 secondary action。

## 待确认问题

### Q1: 后端托管目录创建接口是否继续保留？

推荐答案：保留后端接口，前端 V1 隐藏入口。

理由：

- 现有测试和内部流程可能依赖 `/api/workspaces`。
- 隐藏前端入口即可解决用户困惑。
- 后续如果要恢复“新建托管目录”，可以作为高级入口或空状态 helper，而不用重新做服务端能力。

### Q2: 历史工作目录下拉是否继续保留？

推荐答案：保留。

理由：

- 它不是“新建目录”，而是快速恢复已有 workspace。
- 与“选择工作目录”并不冲突。
- 但文案要明确为“最近工作目录”或“历史工作目录”，避免被理解为当前目录名称。

### Q3: 素材文件名是否完全不显示？

推荐答案：主入口不显示，素材清点卡片内可以折叠显示。

理由：

- 用户在入口阶段只需要知道能否导入。
- 文件级选择、删除、素材 role 等属于素材清点/素材管理阶段。
- 折叠展示能保留调试能力，不压缩导入控件。

