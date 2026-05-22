# 电商场景 AIGC 带货视频生成系统

本仓库按 `arc_codex_r3.md` 的最终推荐架构落地：

```text
apps/web       React + TypeScript 商家工作台
apps/server    Node.js + TypeScript 模块化单体，内嵌 job processors
packages/shared  共享类型、DTO、zod schema、job payload
packages/ai      server-only 模型 provider、prompt、workflow
packages/config  共享工程配置
```

P0/P1 的关键取舍：

- 分镜保留为“剧本脚本结构”，不是视频渲染切片。
- 使用一次 Seedance 12s 调用生成整片，不做 FFmpeg 拼接。
- worker 逻辑在 `apps/server/src/jobs`，物理上先内嵌 server。
- 当前模型调用走 mock fallback，真实火山调用集中替换 `packages/ai/src/providers/*`。

## 设计材料保存位置

根目录仍保留 6 份架构讨论稿和 `prd.pdf`。同时已归档到：

```text
docs/archive/arc_claude_r1.md
docs/archive/arc_claude_r2.md
docs/archive/arc_claude_r3.md
docs/archive/arc_codex_r1.md
docs/archive/arc_codex_r2.md
docs/archive/arc_codex_r3.md
docs/archive/prd.pdf
```

## 环境准备

本机如果没有 `pnpm`，先启用 Corepack：

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

安装依赖：

```bash
pnpm install
```

复制环境变量：

```bash
cp .env.example .env
```

## 本地启动

启动基础设施：

```bash
docker compose -f infra/docker-compose.yml up -d
```

启动 web 和 server：

```bash
pnpm dev
```

默认地址：

```text
web     http://localhost:5173
server  http://localhost:3000/api/health
```

## P0 主路径

1. 打开 web 工作台。
2. 使用预置商品信息和商品图 URL。
3. 点击“一键生成带货视频”。
4. server 创建 `GenerationJob`。
5. 内嵌 processor 生成结构化剧本和 2-4 个 `StoryboardShot`。
6. workflow 将分镜压缩为一个 12s 视频 prompt。
7. mock Seedance provider 返回兜底视频 URL。
8. 前端轮询任务状态并展示视频预览。

## 真实模型接入位置

```text
packages/ai/src/providers/seed-text.provider.ts
packages/ai/src/providers/seedance-video.provider.ts
packages/ai/src/providers/tts.provider.ts
```

环境变量只放在 `.env`，不要提交真实 API Key。

## 验证命令

```bash
pnpm typecheck
pnpm lint
pnpm build
```

当前目录还不是 git 仓库；如果需要提交，请先 `git init`。
