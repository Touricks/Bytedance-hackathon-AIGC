# 投放策略推荐引擎 (Placement‑Strategy Recommendation Engine)

> Design & implementation report for the recommendation module added to the
> 数据面板 (dashboard) system.
>
> Code: `apps/server/src/modules/recommendation/`
> Mock data: `apps/server/scripts/fixtures/recommendation-seed.json`
> Preview / demo: `apps/server/scripts/recommendation-preview.ts`

---

## 1. Problem statement

Merchants publish AIGC commerce videos to external KOL channels and accumulate
投放 (placement) results. Each published video carries four **creative factors**:

| Factor | 业务术语 | Role |
|---|---|---|
| `productCategory` | 商品一级类目 | grouping dimension |
| `dealType` | 商品成交类型 | grouping dimension |
| `audience` | 适用人群 | **decision lever** |
| `strategy` | 推销手法 | **decision lever** |

The engine answers one question per **group** (`商品一级类目 × 商品成交类型`):

> Given this kind of product, which **适用人群** and **推销手法** should the next
> video use to maximise return — measured by **ROAS** (效率) and **GMV** (规模)?

This turns the dashboard from a passive metrics viewer into a prescriptive tool:
the same four factors the creative pipeline already consumes are the factors the
engine recommends, so a recommendation is directly actionable upstream.

---

## 2. Data foundation

The engine reuses the existing dashboard analytics chain — no new tables. One
**performance record** is produced per external‑KOL publication by joining:

```
dashboard_video_artifacts            -- creative_factors (the 4 factors), jsonb
   │  final_video_job_id  ───────────────┐
   ▼                                      ▼
external_kol_publications  ── job_id ── (same final video)
   │  id
   ▼
external_kol_metrics        -- cumulative daily snapshots
                               (latest snapshot = final totals)
```

`external_kol_metrics` rows are **cumulative**, so the snapshot with the greatest
`created_at` per publication holds the final `impressions / clicks / conversions /
spend_cents / gmv_cents`. The repository selects exactly that row with
`DISTINCT ON (publication_id) … ORDER BY publication_id, created_at DESC`
(`recommendation.repository.ts`). Ratios (ROAS, CTR, CVR) are **derived**, never
stored — consistent with the rest of the codebase.

Publications whose video is not in the dashboard registry (no resolved creative
factors) are excluded, since the four factors are required to group.

---

## 3. Method

### 3.1 Metrics per cell

A **cell** is one `(适用人群, 推销手法)` combination inside a group. For a cell (and
for any aggregate) the engine computes:

- **ROAS (spend‑weighted):** `Σgmv / Σspend`. Averaging a *ratio* by summing
  numerators and denominators is the financially correct "average ROAS" — a
  large, efficient video and a tiny one contribute in proportion to the money
  they actually moved. The naive per‑video mean is also exposed as `avgRoas` for
  reference.
- **GMV per video:** `Σgmv / videos`. Used as the scale axis. It is normalised
  per asset so a combination is not rewarded merely for having been produced more
  often.
- Supporting: total GMV/spend, CTR, CVR, CPA, sample count.

### 3.2 Two axes → one score

ROAS alone rewards a tiny‑but‑efficient niche; GMV alone rewards whatever
absorbed the most budget. The engine combines them:

1. **Shrinkage (empirical Bayes).** A cell with `n` videos keeps weight
   `n / (n + k)` on its own statistic and borrows the rest from the **group
   baseline** (`k = priorStrength`, default `2`):

   ```
   adjRoas = w·cellRoas + (1−w)·groupRoas ,   w = n / (n + k)
   ```

   This prevents a single lucky video from topping the chart. Same shrinkage is
   applied to GMV‑per‑video toward the group's GMV‑per‑video.

2. **Normalise within the group.** `adjRoas` and `adjGmv` are min‑max scaled to
   `[0,1]` across the group's cells.

3. **Composite score.**

   ```
   score = roasWeight·roasNorm + gmvWeight·gmvNorm     (weights normalised to sum 1)
   ```

   Default `roasWeight = 0.6`, `gmvWeight = 0.4` — efficiency‑leaning, because
   ROAS is the primary 投放 KPI, with GMV as a scale tiebreaker. Both are query
   knobs (see §6) so a merchant can switch to a scale‑first posture.

### 3.3 Headline, marginals, confidence

- **bestCombo** — the top `(适用人群 × 推销手法)` cell; the headline recommendation
  (`recommendedAudience` / `recommendedStrategy`).
- **audienceRanking / strategyRanking** — *marginal* views. All records sharing
  one factor value are aggregated and ranked, giving "which 适用人群 wins overall"
  and "which 推销手法 wins overall" independently. These have more samples each,
  so they're a robust fallback and a decomposition of the headline.
- **confidence** — `high ≥ 4`, `medium ≥ 2`, else `low` samples; surfaced on
  every cell, factor, and group so the UI can flag thin evidence.
- **headline** — a localized one‑liner naming the recommended factors with ROAS,
  per‑video GMV, lift vs the group baseline, sample count, and confidence.

### 3.4 Why shrinkage matters — worked example

The unit test `recommendation-engine.test.ts` encodes a group with three cells:
a well‑sampled balanced cell (ROAS 5, n=6), a one‑shot fluke (ROAS 9, n=1), and a
weak cell (ROAS 3, n=4).

- With shrinkage **off** (`priorStrength = 0`) the **fluke wins** — exactly the
  failure mode of a naive "sort by ROAS".
- With the default shrinkage the fluke is damped (adjRoas pulled from 9 toward
  the ~4.2 group baseline) and the **balanced, well‑sampled cell wins**.

---

## 4. Architecture

A thin, layered module; the scoring core is deliberately DB‑agnostic and
side‑effect free so it is unit‑testable without Postgres and reusable anywhere.

```
apps/server/src/modules/recommendation/
  recommendation-engine.ts        # PURE core: records → grouped recommendations
  recommendation-engine.test.ts   # 10 unit tests, no DB
  recommendation.repository.ts    # SQL: load latest-snapshot performance records
  recommendation.service.ts       # orchestrate repo + engine; query validation
  recommendation.controller.ts    # Fastify GET routes
  recommendation.api.test.ts      # DB-backed wiring + SQL coverage
```

Registered in `apps/server/src/app.ts` alongside the other dashboard routes. The
core entry point:

```ts
recommendFromRecords(records: PerformanceRecord[], options?): RecommendationResult
```

---

## 5. Mock data

`scripts/fixtures/recommendation-seed.json` extends the existing dashboard seeder
(non‑destructively — the original `dashboard-seed.json` is untouched). It defines
**21 videos / 49 publications** across **7 groups**, each with 3 competing
`(适用人群 × 推销手法)` combinations and 2–3 publications apiece. One group
(`服饰鞋包 × 品牌型高客单`) is intentionally built so ROAS and GMV **disagree**, to
exercise the weighting logic. The dashboard seeder also copies
`apps/static/placehold.mp4` into each mock dashboard artifact so seeded videos
stream from `/api/dashboard/videos/:id/file` during local validation.

Seed it and call the API:

```bash
# from apps/server
pnpm seed:dashboard -- --reset --fixture scripts/fixtures/recommendation-seed.json
```

Or preview the engine **without a database** (each publication's `finalTotals`
is one record — identical to what the repository loads):

```bash
node --import tsx scripts/recommendation-preview.ts
node --import tsx scripts/recommendation-preview.ts --roas 0.3 --gmv 0.7
node --import tsx scripts/recommendation-preview.ts --json
```

---

## 6. API

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/dashboard/recommendations` | Recommendations for every group with data. |
| GET | `/api/dashboard/recommendations/:productCategory/:dealType` | One group; `400` on invalid factor, `404` when no data. |

Query knobs (both routes): `roasWeight`, `gmvWeight` (0–1), `priorStrength`
(0–50). Contract is registered in `docs/core/contracts/openapi.yaml` and
`docs/core/contracts/interface.md`.

Representative response (`美妆个护 × 种草型非标品`, default weights, trimmed):

```json
{
  "schemaVersion": "recommendation.v1",
  "weights": { "roas": 0.6, "gmv": 0.4 },
  "priorStrength": 2,
  "group": {
    "productCategoryLabel": "美妆个护",
    "dealTypeLabel": "种草型非标品",
    "publicationCount": 7,
    "groupRoas": 4.5,
    "recommendedAudience": "youth",
    "recommendedStrategy": "scenario-demo",
    "confidence": "high",
    "bestCombo": { "audience": "youth", "strategy": "scenario-demo",
      "roas": 5.48, "gmvPerVideoCents": 3340000, "adjRoas": 5.09,
      "score": 1, "rank": 1, "confidence": "medium" },
    "strategyRanking": [
      { "value": "scenario-demo",  "roas": 5.48, "score": 1.00, "isRecommended": true },
      { "value": "emotional-story", "roas": 3.84, "score": 0.24, "isRecommended": false },
      { "value": "pain-solution",   "roas": 3.00, "score": 0.00, "isRecommended": false }
    ]
  }
}
```

---

## 7. Results on the mock data

**Default weights (ROAS 0.6 / GMV 0.4):**

| 商品一级类目 × 商品成交类型 | 推荐 适用人群 | 推荐 推销手法 | 组合 ROAS | 组基准 ROAS | n |
|---|---|---|---|---|---|
| 3C数码 × 搜索型标品 | 不限定 | 测评对比 | 7.13 | 6.08 | 7 |
| 食品饮料 × 冲动消费型爆款 | 不限定 | 好奇钩子 | 4.49 | 4.05 | 7 |
| 服饰鞋包 × 品牌型高客单 | 老年/银发 | 权威证明 | 5.04 | 3.51 | 7 |
| 母婴宠物 × 复购型消耗品 | 幼儿/新手家长 | 教程价值 | 5.98 | 5.08 | 7 |
| 美妆个护 × 种草型非标品 | 青年 | 场景演示 | 5.48 | 4.50 | 7 |

Each recommendation beats its group baseline, and the picks are
business‑plausible (测评对比 for standardized 3C search demand; 教程价值 for
trust‑driven repeat baby consumables; 好奇钩子 for impulse food).

**The weighting knob (`服饰鞋包 × 品牌型高客单`):** this group has a high‑ROAS niche
(`老年 + 权威证明`, ROAS 5.04, small GMV) competing with a high‑GMV mainstream
(`不限定 + 视觉叙事`, ROAS 3.21, ~3× the GMV).

| Weighting | Recommended 推销手法 | Rationale |
|---|---|---|
| ROAS‑first (0.6 / 0.4, default) | **权威证明** | maximise efficiency on a premium item |
| Scale‑first (0.3 / 0.7) | **视觉叙事** | maximise total GMV |

Same data, different business posture, different — and defensible — answer. This
is the core argument for a composite score with an explicit, tunable trade‑off
rather than a single hard‑coded metric.

---

## 8. Verification

| Check | Command | Result |
|---|---|---|
| Pure engine unit tests (no DB) | `node --import tsx --test src/modules/recommendation/recommendation-engine.test.ts` | **10/10 pass** |
| DB‑backed API + SQL tests | `node --import tsx --test src/modules/recommendation/recommendation.api.test.ts` | **4/4 pass** |
| Typecheck | `pnpm --filter @aigc-video/server typecheck` | clean |
| Lint | `eslint src/modules/recommendation` | clean |
| Live end‑to‑end | seed fixture → `GET /api/dashboard/recommendations*` | 200 / 400 / 404 verified; DB numbers identical to the no‑DB preview |

The unit tests cover: spend‑weighted vs mean ROAS, weight normalisation, the
shrinkage fluke‑vs‑balanced flip, marginal ranking + GMV‑share summing to 1,
group partitioning/ordering, zero‑spend division guards, and the localized
headline. The API test proves the latest‑snapshot SQL recovers final totals
(`Σgmv/Σspend = 4.0` from a two‑snapshot publication) and that routes
validate/aggregate correctly.

---

## 9. Dashboard integration (frontend)

The 数据面板 (`apps/web/src/features/data-dashboard/`) now consumes the engine
live instead of static seed JSON, and the UI makes the **provenance of every
panel explicit** so a viewer never mistakes demo content for computed results.

**Real (engine / data pipeline) — emphasized:**
- `适用人群 × 推销手法 · 效果矩阵` (`DashboardComboMatrix`) — renders `group.cells`.
  Promoted to the **first card** of the left column with an emerald `基于推荐引擎`
  badge and accent shell.
- `策略推荐` (`DashboardLiveRecommendation`) — the recommended 适用人群 + 推销手法,
  zh headline, confidence, ROAS bars, and a 效率优先/规模优先 weight toggle that
  re‑queries the engine. Tagged `基于推荐引擎` and moved **above** the demo diagnosis
  in the advisor.
- `当前因子组合` and the scope‑bar factor chips — the selected video's real
  attribution factors.

**Demo (frontend seed) — explicitly flagged `演示功能`:**
- `核心指标` KPI cards, `转化漏斗`, `多渠道对比`, `诊断结论`. These remain for visual
  completeness but carry a muted `演示功能` pill so they read as placeholder data.

**Removed:** the prototype‑only `可调杠杆` framing (advisor factor tag, scope‑bar
lever styling, and its seed diagnosis card) — it implied an engineering lever
rather than a business recommendation.

Data flow: selecting a dashboard video → its `productCategory × dealType` →
`GET /api/dashboard/recommendations/:productCategory/:dealType` (404 ⇒ empty
state, not error). The provenance treatment is the contract that keeps the demo
seed and the live engine visually separable.

---

## 10. Limitations & future work

- **Cross‑sectional, not causal.** Rankings are observational; they don't control
  for channel mix, spend level, or seasonality. A publication's platform/account
  is carried on each record but not yet used as a covariate.
- **Small samples remain noisy.** Shrinkage mitigates but cannot manufacture
  evidence; `confidence: low` cells should be treated as hypotheses. A natural
  next step is a confidence interval (e.g. bootstrap) per cell.
- **Static factor menu.** New audience/strategy enum values flow through
  automatically (the engine is data‑driven), but business weighting defaults are
  global, not per‑category. Per‑group default weights are a possible refinement.
- **Frontend demo panels remain.** The KPI cards, funnel, channel compare, and
  diagnosis are still frontend seed (flagged `演示功能`). Replacing them with real
  per‑video / per‑channel analytics is the next data‑pipeline increment.
- **Time windows.** Currently uses each publication's latest cumulative snapshot.
  A `since`/`window` parameter could compute deltas over a date range.

---

## 11. Files changed

**New (`apps/server/src/modules/recommendation/`)** — engine, repository, service,
controller, and two test files. **New scripts** — `recommendation-seed.json`
fixture and `recommendation-preview.ts`. **Edited (backend)** —
`apps/server/src/app.ts` (route registration), `docs/core/contracts/openapi.yaml`
+ `docs/core/contracts/interface.md` (API contract), `scripts/README.md`.

**Frontend (`apps/web/src/features/data-dashboard/` + `lib/api/`)** — new
`dashboardRecommendations.ts` client, `DashboardLiveRecommendation.tsx`,
`DashboardComboMatrix.tsx` (+ tests); the view model fetches the live engine;
`DashboardOverview`/`DashboardAdvisor`/`DashboardCard` carry the
`基于推荐引擎`/`演示功能` provenance treatment and the matrix‑first layout; the
prototype `可调杠杆` framing and the static strategy×channel matrix were removed.
