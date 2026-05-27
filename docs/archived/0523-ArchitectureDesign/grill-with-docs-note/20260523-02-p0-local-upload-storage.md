# 2026-05-23 Grill Note：P0 素材上传与本地文件存储

## 审阅状态

已确认。

## 背景

PRD 将“商品素材上传”列为 P0 必做能力。当前代码里的素材入口仍偏 mock：前端填写商品主图 URL，后端注册 `imageUrl` 为 Asset。上一轮问题确认了 P0 不能只保留 URL 输入，但也不需要一步到位接入 S3/MinIO。

## 已确认决策：P0 使用本地文件目录作为上传存储入口

P0 的素材上传定义为：

```text
浏览器普通 file input
  -> server multipart endpoint
  -> 写入 server 本地文件目录
  -> 创建 Asset(type=product_image, source=upload)
  -> 返回可预览、可用于生成链路的 Asset URL
```

P0 不要求：

- Uppy。
- presigned upload。
- 直接上传 S3/MinIO。
- 多分辨率图片处理。
- 上传断点续传。

## 推荐实现口径

推荐把上传文件落在 server 运行时目录，例如：

```text
apps/server/tmp/uploads/
```

该目录必须进入 `.gitignore`，只提交 demo/mock 素材，不提交用户上传文件。

API 仍然使用 Asset 抽象，不把“本地文件路径”泄漏给前端业务层。后续如果要升级到 MinIO/S3，只替换存储 adapter 和 URL 生成逻辑，不改素材、剧本、创作主链路。

## 对依赖 baseline 的影响

foundation baseline 可以安装：

```text
apps/server:
  @fastify/multipart
```

暂不安装：

```text
apps/web:
  Uppy

apps/server:
  minio
  @aws-sdk/client-s3
```

## 对现有计划的影响

- `proposed_architecture.md` 中的 P0 存储口径从 “MinIO/S3 保存上传素材和生成视频” 调整为 “本地文件目录保存上传素材，MinIO/S3 推迟到对象存储升级”。
- `review-checklist.md` 中 “P0 是否必须实现真实上传到 MinIO，还是允许 mock asset URL” 标记为已确认。
- `web-creation-flow` 需要把 URL 输入升级为普通文件上传，同时可以保留 demo 商品快捷入口。

## 下一轮需要继续确认的问题

下一个问题建议讨论：

```text
Day-1 / P0 模型链路是否必须真实调用 Ark 文本模型和 Seedance，
还是允许先用 mock provider 完成端到端链路，再把真实 provider 作为可切换增强？
```

已确认答案：

```text
Day-1 / P0 必须真实调用 Ark 文本模型和 Seedance；
相关运行配置已在 .env 中实现；
P0 应保留 mock provider 开关作为开发与现场兜底；
演示主路径优先展示真实生成，失败时切换预生成样例。
```

原因：

- PRD 明确关注火山 OpenAPI 能力对接。
- 不真实验证 Seedance，12s whole-video 架构的最大假设没有被打掉。
- 但比赛现场不能依赖实时模型稳定性，mock/pre-generated fallback 必须存在。
