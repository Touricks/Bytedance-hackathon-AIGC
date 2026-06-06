# Workspace Data Dashboard PRD

> Status: Design pending. Do not start implementation until the frontend design稿 is approved.
>
> Related core docs: [`docs/core/factor_artifact.md`](../core/factor_artifact.md), [`docs/core/arc_v3.md`](../core/arc_v3.md), [`docs/core/interface.md`](../core/interface.md).

---

## 1. 背景

当前创作链路已经把 `creativeFactors` 从创作要求一路快照到成片，再复制到发布记录：

```text
prompt_requirements_artifacts.data.creativeFactors
  -> final_video_jobs.compiled_manifest.creativeTags
  -> campaign_publications.creative_tags
  -> campaign_publication_metrics
```

数据看板的目标不是编辑创作链路，而是帮助商家和运营在工作区内回答：

- 哪类商品/服务类型更容易带来曝光、点击和转化。
- 哪类适用人群和推销手法组合表现更好。
- 模板来源和自定义状态是否影响表现。
- 单条发布记录为什么被归到某个组合下。

---

## 2. 产品目标

P0 目标：

- 在单个 workspace 内提供一个只读数据看板。
- 以 `campaign_publications` 为聚合事实源，而不是读取 workspace current requirements。
- 用 `creativeTags.creativeFactors.productType / audience / strategy` 做主聚合维度。
- 展示发布记录明细、最新指标和标签归因。
- 支持用户识别“未归类”发布记录。

非目标：

- 不做跨 workspace 全局 BI。
- 不做实时流式指标。
- 不做复杂自定义报表、拖拽维度或多租户权限。
- 不在看板中编辑创作要求、成片或发布记录。
- 不新增独立 `apps/dashboard`。

---

## 3. 用户故事

1. 作为商家，我希望在当前工作区看到所有成片发布后的表现，以判断哪套创作因子更有效。
2. 作为运营，我希望按商品/服务类型、适用人群、推销手法查看曝光、点击、转化、CTR 和花费，快速找到高表现组合。
3. 作为运营，我希望看到每条发布记录携带的 `creativeTags`，确认看板归因不是读取了后续被修改的 current requirements。
4. 作为调试者，我希望看见 fallback 或未归类记录，知道哪些发布记录缺少可靠因子快照。

---

## 4. 信息架构

建议路由：

```text
/workspaces/:workspaceId/dashboard
```

页面区域：

1. **指标总览**：总曝光、总点击、总转化、CTR、转化率、花费。
2. **因子表现矩阵**：按三因子组合展示核心指标。
3. **维度筛选**：商品/服务类型、适用人群、推销手法、平台、时间范围。
4. **发布记录表**：展示发布平台、渠道、KOL、发布状态、最新指标、创作标签、fallback 状态。
5. **未归类提示**：统计缺少 `creativeFactors` 或未绑定成片的发布记录。

设计稿待确认项：

- 看板是否需要放进创作审核台侧边栏，还是工作区首页/顶部入口。
- P0 是否需要趋势图，还是先做指标卡 + 矩阵 + 表格。
- 因子矩阵优先用三维组合表，还是拆成三个单维榜单。

---

## 5. TypeScript 模块放置建议

### 5.1 后端

新增只读 dashboard 模块：

```text
apps/server/src/modules/dashboard/
  dashboard.controller.ts
  dashboard.schema.ts
  dashboard.service.ts
  dashboard.api.test.ts
```

边界：

- `campaign` 模块继续负责发布记录和指标写入。
- `dashboard` 模块只做 read-side 聚合，不写 `campaign_publications` 或 `campaign_publication_metrics`。
- SQL 聚合继续使用项目现有原生 `pg` 风格，不引入 ORM。
- 请求 query 用 Zod 校验。

建议接口：

```text
GET /api/workspaces/:workspaceId/dashboard/creative-factors
GET /api/workspaces/:workspaceId/dashboard/publications
```

`creative-factors` 返回聚合数据；`publications` 返回明细列表，供表格和调试使用。

### 5.2 前端

新增 feature module：

```text
apps/web/src/features/data-dashboard/
  DataDashboardPage.tsx
  useDataDashboardViewModel.ts
  dashboardModel.ts
  dashboardModel.test.ts
  components/
    MetricCards.tsx
    FactorMatrix.tsx
    FactorFilters.tsx
    PublicationTable.tsx
    EmptyDashboard.tsx
```

边界：

- 不放进 `features/creative-review`，因为看板不是审核链路步骤。
- 不新建 app，避免 P0 过重。
- API client 继续放在 `apps/web/src/lib/api/client.ts`，或在该文件变大后再拆 `lib/api/dashboard.ts`。
- server state 继续用 TanStack Query。
- UI 使用 MUI + 现有 CSS token；P0 不新增图表库。

### 5.3 Shared

新增或扩展 shared schema：

```text
packages/shared/src/schemas/dashboard.ts
```

保存：

- dashboard query enum。
- creative factor aggregate response。
- publication dashboard row response。
- metric rate calculation 的输入/输出契约。

---

## 6. 数据契约草案

### 6.1 Creative factor aggregate

```json
{
  "data": {
    "totals": {
      "publications": 12,
      "classifiedPublications": 10,
      "unclassifiedPublications": 2,
      "impressions": 120000,
      "clicks": 3600,
      "conversions": 240,
      "spendCents": 180000,
      "ctr": 0.03,
      "conversionRate": 0.0667
    },
    "groups": [
      {
        "creativeFactors": {
          "productType": "offline-experience-service",
          "audience": "youth",
          "strategy": "review-comparison"
        },
        "label": "线下体验服务 / 青年 / 测评对比",
        "metrics": {
          "publications": 3,
          "impressions": 48000,
          "clicks": 1800,
          "conversions": 150,
          "spendCents": 62000,
          "ctr": 0.0375,
          "conversionRate": 0.0833
        }
      }
    ]
  }
}
```

### 6.2 Publication dashboard row

```json
{
  "id": "publication_123",
  "finalVideoJobId": "final_123",
  "platform": "douyin",
  "channelName": "官方号",
  "kolName": null,
  "status": "published",
  "creativeTags": {
    "schemaVersion": "creative-tags.v1",
    "creativeFactors": {
      "productType": "offline-experience-service",
      "audience": "youth",
      "strategy": "review-comparison"
    },
    "fallback": false
  },
  "latestMetrics": {
    "impressions": 10000,
    "clicks": 300,
    "conversions": 20,
    "spendCents": 12000,
    "ctr": 0.03
  }
}
```

---

## 7. Validation 与错误处理

Query 参数：

- `dateFrom` / `dateTo`：可选 ISO date，按 `campaign_publication_metrics.captured_at` 过滤。
- `productType` / `audience` / `strategy`：可选，使用 shared enum。
- `platform`：可选 string。
- `includeUnclassified`：默认 true。

错误：

- workspace 不存在：沿用 `WORKSPACE_NOT_FOUND`。
- query enum 非法：返回 Zod validation error 的友好版本。
- 无发布记录：返回空 totals，不报错。
- 发布记录存在但无 metric：计入 publications，但指标按 0 处理。

---

## 8. Observability

P0 不需要新 trace event。建议保留普通 API 请求日志即可。

如果后续看板查询变慢，再增加：

- SQL latency log。
- 聚合行数、时间范围、workspace id。
- 慢查询阈值告警。

---

## 9. 测试计划

后端：

- `dashboard.api.test.ts` 覆盖空数据、按三因子聚合、未归类发布记录、fallback 标签、workspace 隔离。
- 测试指标计算：CTR、conversionRate、spendCents 汇总。
- 测试 query filter：三因子、平台、时间范围。

前端：

- `dashboardModel.test.ts` 覆盖标签中文文案、空态、未归类、指标格式化。
- API client test 覆盖 dashboard endpoints。
- 设计稿落地后用 Playwright 或截图检查核心布局。

---

## 10. Tracer-bullet issues draft

> These are issue-ready slices after the frontend design稿 is approved. Do not publish yet.

1. **Dashboard read API with factor aggregation**
   - Type: AFK
   - Blocked by: Frontend design approval
   - User stories covered: 1, 2, 4
   - Acceptance criteria:
     - `GET /dashboard/creative-factors` returns workspace-scoped totals and grouped factor metrics.
     - Unclassified and fallback records are represented explicitly.
     - API tests cover aggregation, filters and workspace isolation.

2. **Publication dashboard rows**
   - Type: AFK
   - Blocked by: Frontend design approval
   - User stories covered: 3, 4
   - Acceptance criteria:
     - `GET /dashboard/publications` returns publication rows with latest metrics and `creativeTags`.
     - Rows without final video tags are marked unclassified.
     - API tests cover no metrics, fallback tags and workspace scoping.

3. **Workspace dashboard shell**
   - Type: HITL
   - Blocked by: Frontend design approval
   - User stories covered: 1, 2
   - Acceptance criteria:
     - Workspace route exposes a dashboard entry without turning it into an审核步骤.
     - Page renders metric cards, factor area, filters and table placeholders.
     - Visual layout matches approved design稿.

4. **Factor matrix and filter interaction**
   - Type: AFK
   - Blocked by: Dashboard read API, Workspace dashboard shell
   - User stories covered: 2, 4
   - Acceptance criteria:
     - User can filter by productType, audience, strategy and platform.
     - Matrix/table updates from TanStack Query state.
     - Empty, loading and error states are covered.

5. **Publication table with tag provenance**
   - Type: AFK
   - Blocked by: Publication dashboard rows, Workspace dashboard shell
   - User stories covered: 3, 4
   - Acceptance criteria:
     - Table shows platform/channel/KOL/status/latest metrics/factor tags.
     - Fallback and unclassified states are visible.
     - Frontend model tests cover label formatting and missing tags.

6. **Design QA and dashboard acceptance**
   - Type: HITL
   - Blocked by: Factor matrix and filter interaction, Publication table with tag provenance
   - User stories covered: 1, 2, 3, 4
   - Acceptance criteria:
     - Browser verification passes on desktop target viewport.
     - Text does not overflow in metric cards, filters or table cells.
     - Product owner accepts design against approved design稿.

---

## 11. Open Questions For Design Review

1. 看板入口放在工作区顶部导航、工作区首页卡片，还是创作审核台侧边栏外的新入口？
2. P0 是否必须有趋势图？如果必须，需要确定图表库选择。
3. 因子表现优先展示“三因子组合排行”，还是三个单维度榜单？
4. 发布记录表是否需要支持手动补 tag，还是 P0 保持只读？
5. 数据看板是否只看 latest metrics，还是要支持按时间范围聚合多条 metrics history？
