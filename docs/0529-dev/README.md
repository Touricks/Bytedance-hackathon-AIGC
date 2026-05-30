# 0529 Dev API 文档包

这套文档按读者分工组织，同一批 API 不再塞进一份大文档里。需要查字段和接口契约时看 `frontend-api/openapi.yaml`；需要理解业务流程时看产品文档；需要维护实现时看后端文档；需要设计 AI prompt 输入输出时看 prompt 文档；需要跑验收时看测试文档。

## 文档分工

| 目录 | 读者 | 主要回答 |
|---|---|---|
| `frontend-api/` | 前端 | 页面什么时候调哪个接口、状态如何流转、错误如何展示 |
| `product-api/` | 产品经理 | 每个接口支撑什么用户动作、成功/失败体验是什么 |
| `backend-api/` | 后端 | 路由、service、DB、Zod 契约和测试如何维护 |
| `prompt-api/` | Prompt 负责人 | 每个 AI 模块需要什么上下文、输入输出 schema 是什么 |
| `test-api/` | 测试 | 如何用 Postman/自动化用例验证主流程和异常场景 |

## 当前核心参考源

| 文件 | 用途 |
|---|---|
| `frontend-api/openapi.yaml` | 前端生成类型、Mock、接口查阅 |
| `test-api/bytedancehack-api.postman_collection.json` | 测试和手动联调 |
| `api-business-logic-guide.md` | 当前完整业务 API 说明，可作为拆分后的参考源 |
| `erd.md` | 数据模型和表关系参考 |
| `arc_v6.md` | 当前后端架构参考 |

## 维护规则

- 新增或修改接口时，先同步 `frontend-api/openapi.yaml`。
- 涉及页面调用顺序时，同步 `frontend-api/workflow.md` 和 `frontend-api/page-api-map.md`。
- 涉及产品状态或用户提示时，同步 `product-api/status-and-copy.md`。
- 涉及后端实现边界时，同步 `backend-api/route-index.md` 和 `backend-api/zod-contracts.md`。
- 涉及 AI 输出结构时，同步 `prompt-api/prompt-input-output.md` 和对应 `prompt-api/modules/*.md`。
- 涉及验收或异常场景时，同步 `test-api/test-matrix.md`。

