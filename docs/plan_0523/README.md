# 0523 开发计划审阅入口

本目录用于承接 2026-05-23 关于项目架构、第三方库、检索方案、AI runtime 和 git worktree 开发方式的讨论，供下一轮审阅和任务分配使用。

## 文档索引

- `project-architecture-and-integrations.md`：架构与第三方库集成总览。
- `development-roadmap.md`：按阶段推进的开发路线图。
- `worktree-modules.md`：git worktree 并行开发模块划分。
- `implementation-slices.md`：可独立验收的纵向任务切片。
- `review-checklist.md`：审阅清单与待确认问题。

## 当前定稿口径

```text
P0/P1 不做分镜级渲染，不做 FFmpeg 拼接。
分镜是剧本结构，不是渲染切片。
一次 Seedance 12s 调用生成整片。
Postgres 是事实源，Qdrant 是可重建检索索引。
AI runtime 优先官方 openai SDK，Agents SDK 只做 trace spike。
Vercel AI SDK Core 暂不作为默认依赖。
```

## 建议审阅顺序

```text
1. project-architecture-and-integrations.md
2. development-roadmap.md
3. worktree-modules.md
4. implementation-slices.md
5. review-checklist.md
```

