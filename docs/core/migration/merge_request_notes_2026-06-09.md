# DaiReel Studio UI + Workflow Polish 合并说明

建议分支名：`feature/daireel-ui-workflow-polish-0609`

目标基准分支：`dev_0606_dashboard_design`

## 合并目标

本次改动目标是在保留现有 Fastify + Postgres + Redis + BullMQ 后端、真实创作审核 API 与本地工作区逻辑的前提下，把前端界面进一步向 DaiReel Studio / Lovable 版本的 SaaS 风格靠拢，并修复 1-9 步审核链路中影响商家体验的关键交互问题。

## 核心改动

### 1. 启动与环境变量

- 修复 Web 端读取根目录 `.env` 的问题，避免前端缺失 `VITE_API_BASE_URL` / `SERVER_PORT` 后出现连接错误。
- Web dev server 改为由 Vite config 和 `.env` 控制端口，当前本地体验端口为 `5175`。
- `.env`、`.env.local`、API Key、数据库地址等敏感配置仍然被 `.gitignore` 排除，不应提交。

相关文件：

- `apps/web/vite.config.ts`
- `apps/web/package.json`

### 2. DaiReel Studio 视觉风格统一

- 调整全局色彩、按钮、卡片、阴影、边框、字体与间距，使页面更接近 Lovable 版本的浅色 SaaS 工作台风格。
- 登录页标题调整为两行展示：`电商带货视频，` / `从素材到成片 9 步搞定`，避免单字换行。
- 数据看板保留现有 mock 分析诊断能力，并统一了主色、背景和卡片视觉。

相关文件：

- `apps/web/src/styles.css`
- `apps/web/src/features/data-dashboard/dataDashboard.css`
- `apps/web/src/routes/App.tsx`

### 3. 首页 / 工作区入口

- 首页导航保留 DaiReel Studio 品牌入口，并加入“素材库”占位按钮，为后续产品化留入口。
- 保留并继续使用真实工作区逻辑：
  - `listWorkspaces`
  - `createWorkspace`
  - `deleteWorkspace`
  - `initializeWorkspace`
  - `selectWorkspaceDirectory`
  - `getConfigLimits`
- 首页工作区卡片继续展示 9 步进度、更新时间、状态与本地目录信息。

相关文件：

- `apps/web/src/routes/App.tsx`

### 4. 第一步：创作要求与上传素材

- “全局创作因子”默认不再预填，商家必须选择：
  - 商品一级类目
  - 商品成交类型
  - 适用人群
  - 推销手法
- 未选择完整创作因子时不能提交第一步。
- 未上传素材时不能提交第一步。
- 细分字段可以不修改，系统会使用默认字段。
- “全局创作要求（只读）”改为默认收起的折叠区，商家需要时可展开查看，降低第一步页面的视觉负担。
- 创作因子选择前的四个字段保持同一行展示；选择后的字段推导逻辑保持不变。

相关文件：

- `apps/web/src/features/creative-review/requirementsForm.ts`
- `apps/web/src/features/creative-review/components/RequirementsStart.tsx`
- `apps/web/src/features/creative-review/components/RequirementsStartHelpers.tsx`
- `apps/web/src/features/creative-review/components/RequirementsStart.test.ts`
- `apps/web/src/features/creative-review/referenceVideoImport.test.ts`

### 5. 第二步：素材解读操作区

- 将“进行下一步：生成商品卖点”和“直接一键成片”统一放在底部操作区。
- 商家在素材解读确认后可以清晰选择：
  - 按审核链路进入下一步
  - 直接一键成片自动推进到最终视频
- 移除页面中部重复的一键成片入口，减少操作分散。

相关文件：

- `apps/web/src/features/creative-review/components/MaterialIntakeReview.tsx`
- `apps/web/src/features/creative-review/components/MaterialIntakeReview.test.ts`

### 6. 右侧创作动态进度

- 右侧“创作动态”增加与整体风格一致的小进度展示。
- 普通模型调用阶段展示“处理中”的不确定进度，因为外部模型本身无法准确预测百分比。
- 分镜图 / 分镜视频阶段可以根据已选择镜头数量展示确定百分比。
- 用户选择“一键成片”时，中央大进度条保留，右侧不重复显示进度条。

相关文件：

- `apps/web/src/features/creative-review/reviewFlow.ts`
- `apps/web/src/features/creative-review/components/ReviewRails.tsx`
- `apps/web/src/features/creative-review/components/ReviewRails.test.ts`
- `apps/web/src/styles.css`

## 验证结果

已执行并通过：

```bash
pnpm --filter @aigc-video/web typecheck
node --import tsx --test src/features/creative-review/components/RequirementsStart.test.ts src/features/creative-review/referenceVideoImport.test.ts
node --import tsx --test src/features/creative-review/components/MaterialIntakeReview.test.ts
node --import tsx --test src/features/creative-review/components/ReviewRails.test.ts
```

本地服务连通性已验证：

```bash
curl http://127.0.0.1:3002/api/health
curl http://127.0.0.1:5175/workspaces
curl http://127.0.0.1:5175/dashboard
```

## 已知限制

- 当前本地目录不是 Git 仓库，因此本地无法直接创建并 push 分支；需要在 GitHub 仓库的 `dev_0606_dashboard_design` 基础上新建分支后提交这些文件。
- GitHub 连接器当前无法访问 `Touricks/Bytedance-hackathon-AIGC`，疑似私有仓库权限限制。
- 外部模型调用阶段无法提供真实百分比，只能展示不确定进度；分镜图 / 分镜视频这类可计数任务可以展示百分比。
- 不要提交 `.env`、`.env.local`、`node_modules`、`.turbo`、`dist`、`storage`、Lovable 原始导出备份等本地或敏感文件。

## 建议 PR 标题

`feat(web): polish DaiReel Studio UI and workflow review interactions`

## 建议 PR 描述

本 PR 保留现有真实后端 API 与本地工作区逻辑，对 DaiReel Studio 前端进行 UI 与创作审核体验优化。主要包含：统一 Lovable 风格视觉、修复 Vite 环境变量读取、优化登录页与工作区入口、强化第一步创作因子必填校验、将素材解读页的一键成片和进入下一步统一到底部操作区，并为右侧创作动态增加非重复的进度展示。

验证：Web typecheck 通过，创作要求、素材解读、右侧创作动态相关单测通过，本地前后端连通正常。
