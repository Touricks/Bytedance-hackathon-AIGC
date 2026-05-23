# 2026-05-23 单轮讨论：bge-m3 + Qdrant + Postgres 双库检索架构

## 用户观点

用户对 `report_zh.md` 中“Postgres-first / pgvector 优先，Qdrant 靠后”的判断提出疑问：

- 本地已经下载了 `bge-m3` embedding model。
- 本地也已有 Qdrant 相关环境和 qdrant skill。
- 希望结合 Qdrant 搭建 Qdrant + Postgres 双库架构，先全部部署到 Docker 中。
- 需要判断本地 embedding 模型应该放在项目哪里。

## 本地事实

当前搜索到的本机资源：

```text
/Users/carrick/ResearchWorkspace/Project_GraphRAGMem/main/model/bge-m3
/Users/carrick/ResearchWorkspace/Project_GraphRAGMem/main/data/container/qdrant
/Users/carrick/.codex/skills/qdrant-deployment-options
/Users/carrick/.codex/skills/qdrant-clients-sdk
```

GraphRAGMem 项目已有 ADR 说明：本地 `BAAI/bge-m3` 存在 `main/model/bge-m3`，由脚本下载，并排除在 git 外。

qdrant deployment skill 的关键建议：

- 原型或真实本地 server 应使用 Docker。
- 不要用 Python local mode 做生产或 benchmark，因为 local mode 数据格式与 server 不兼容。
- 自托管 Docker Qdrant 需要自己负责备份、监控和升级。

qdrant client skill 的关键建议：

- TypeScript 可使用 `@qdrant/js-client-rest`。
- 原型阶段 REST API 足够，后续再考虑 gRPC。

## 修正后的判断

`report_zh.md` 的原判断在“还没有稳定 embedding 模型”时成立：优先 Postgres FTS / pg_trgm，避免过早上向量服务。

但现在前提改变了：本地已有 bge-m3 和 Qdrant。因此推荐修正为：

```text
Postgres-first as source of truth
Qdrant-first as vector retrieval index
```

也就是：

- Postgres 保存业务事实：Product、Asset、MaterialSlice、Script、StoryboardShot、GenerationJob。
- Qdrant 保存可重建的检索索引：embedding vectors + minimal payload + Postgres entity references。
- bge-m3 作为本地 embedding service，为素材、标签、描述、分镜脚本生成向量。
- 不建议再引入 pgvector 作为主向量路径，避免 Postgres + pgvector + Qdrant 三套检索形态并存。

## bge-m3 模型应该放在哪里

不建议把 bge-m3 权重提交进仓库，也不建议放进 `apps/embedding` 镜像构建上下文。

推荐采用“双路径”：

```text
开发者本机 canonical path:
  models/bge-m3/              # 项目内约定位置，但被 gitignore

Docker 容器内 canonical path:
  /models/bge-m3              # 只读 volume mount

环境变量:
  BGE_M3_MODEL_PATH=/absolute/path/to/bge-m3
```

当前用户已经有模型，因此本机 `.env` 可以直接指向：

```env
BGE_M3_MODEL_PATH=/Users/carrick/ResearchWorkspace/Project_GraphRAGMem/main/model/bge-m3
```

团队协作时，其他成员可以选择：

```env
BGE_M3_MODEL_PATH=./models/bge-m3
```

并通过下载脚本把模型放到该目录。`models/` 应加入 `.gitignore`，只保留 `models/README.md` 或 `.gitkeep`。

## 推荐目录调整

如果引入本地 embedding service，建议新增：

```text
apps/
├── embedding/
│   ├── Dockerfile
│   ├── app/
│   │   ├── main.py               # FastAPI /embed endpoint
│   │   └── embedding_model.py    # bge-m3 lazy loader
│   ├── requirements.txt
│   └── README.md

models/
├── README.md                     # 说明如何下载/挂载 bge-m3
└── .gitkeep

packages/shared/src/schemas/
└── retrieval.ts                  # search request/response schema

apps/server/src/modules/retrieval/
├── retrieval.controller.ts
├── retrieval.service.ts
├── retrieval.repository.ts       # Postgres hydration
├── retrieval.schema.ts
└── qdrant.repository.ts          # Qdrant upsert/search

apps/server/src/jobs/processors/
└── material-index.processor.ts   # 写入 Postgres 后异步 embed + upsert Qdrant
```

说明：

- `apps/embedding` 是一个独立 Docker service，因为本地 bge-m3 推理更适合 Python runtime。
- `apps/server` 不直接加载模型，只通过 HTTP 调用 embedding service。
- `packages/ai` 继续负责生成式模型；embedding 不放在 `packages/ai`，避免文本/视频生成 workflow 和检索基础设施混在一起。

## Docker Compose 建议

新增两个服务：

```text
qdrant:
  image: qdrant/qdrant
  ports:
    - "6333:6333"
  volumes:
    - qdrant-data:/qdrant/storage

embedding:
  build: ./apps/embedding
  environment:
    MODEL_PATH: /models/bge-m3
  volumes:
    - ${BGE_M3_MODEL_PATH}:/models/bge-m3:ro
  ports:
    - "8001:8000"
```

server 增加环境变量：

```env
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_MATERIALS=materials
EMBEDDING_SERVICE_URL=http://localhost:8001
BGE_M3_MODEL_PATH=/absolute/path/to/bge-m3
```

容器内部访问：

```env
QDRANT_URL=http://qdrant:6333
EMBEDDING_SERVICE_URL=http://embedding:8000
```

## 检索数据流

推荐数据流：

```text
1. 用户上传素材 / 创建商品 / 生成分镜
2. server 写 Postgres，生成业务实体 id
3. server enqueue material-index job
4. material-index processor 取待索引文本
5. processor 调 embedding service 得到 bge-m3 向量
6. processor upsert Qdrant point
7. point id 使用稳定业务 id，如 assetId 或 sliceId
8. Qdrant payload 只放轻量信息和 Postgres 引用
9. 搜索时先查 Qdrant，再回 Postgres hydrate 完整业务对象
```

Qdrant point payload 建议：

```json
{
  "entityType": "asset",
  "entityId": "asset_xxx",
  "productId": "product_xxx",
  "text": "portable blender usb-c easy cleaning",
  "tags": ["portable", "usb-c", "kitchen"],
  "source": "upload",
  "createdAt": "2026-05-23T00:00:00.000Z"
}
```

业务原则：

- Postgres 是事实源。
- Qdrant 是可重建索引。
- Qdrant payload 不存大文本、不存完整业务对象、不存敏感信息。
- 删除或更新 Postgres 实体时，通过 job 同步删除/更新 Qdrant point。

## 架构取舍

赞成引入 Qdrant 的原因：

- bge-m3 已经本地可用，原报告的最大前置风险消失。
- Qdrant Docker 部署适合原型和 demo。
- Qdrant 的 payload filtering 和向量检索能力比 pgvector 更适合后续素材召回、分镜匹配和多条件筛选。
- 检索链路能成为项目亮点：本地模型 + 本地向量库 + 业务数据回填。

需要控制的风险：

- 不要让 Qdrant 变成事实源。
- 不要把模型权重提交进仓库。
- 不要把 embedding service 放进 P0 必经链路；应作为 P1 或 P0+ 增强能力。
- 不要同时维护 pgvector 和 Qdrant 两套向量检索。
- Docker 里挂载模型路径必须写清楚，否则其他人无法复现。

## 当前轮建议

推荐采纳用户观点，但修改表述为：

```text
当前项目采用 Postgres + Qdrant 双库检索架构：
Postgres 负责业务事实和事务一致性；
Qdrant 负责基于 bge-m3 的素材/分镜向量召回；
bge-m3 作为本地只读模型资源，通过 embedding sidecar service 暴露 HTTP embedding API。
```

模型权重位置推荐：

```text
不要进 git；
不要复制进 Docker image；
项目内约定 models/bge-m3 作为默认本地路径；
实际路径通过 BGE_M3_MODEL_PATH 配置；
Docker 中统一挂载到 /models/bge-m3:ro。
```

## 一句话

有了本地 bge-m3 和 Qdrant，原先“pgvector 优先”的保守建议应该升级为“Postgres 做事实源，Qdrant 做向量索引”；模型权重应放在 gitignored 的 `models/bge-m3` 或外部绝对路径，通过 `BGE_M3_MODEL_PATH` 挂载进 embedding service，而不是进入仓库或镜像。
