# Frontend Architecture

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: `apps/web` React/Vite frontend
Depends On: `contracts/interface.md`, `architecture/domain.md`
Blocks: Frontend migration or UI behavior changes
Decision State: Accepted

## 1. Executive Summary

The frontend target is `apps/web`. It renders the 创作审核台 and data dashboard using business language, not raw prompt/debug labels. API access is through typed client helpers under `apps/web/src/lib/api`.

## 2. Current Reality

- Main route shell: `apps/web/src/routes/App.tsx`.
- Creative review desk: `apps/web/src/features/creative-review/CreativeReviewDesk.tsx`.
- Workbench state: `apps/web/src/features/workbench/useWorkbenchViewModel.ts`.
- Data dashboard: `apps/web/src/features/data-dashboard`.
- API clients: `apps/web/src/lib/api/*`.

## 3. Target State

| UI area | Responsibility |
|---|---|
| Workspace list | Create/open/delete workspaces and discovered local drafts. |
| 创作审核台 | Review and approve module artifacts in business order. |
| 创作要求 form | Edit four-factor requirements and compiled global fields. |
| 素材解读 | Review material roles, primary product, and one-click entry. |
| 商品卖点 / 分镜脚本 / 分镜生成要求 | Review/edit proposed/current artifacts. |
| 分镜图选择 / 分镜视频选择 | Display active shot set candidates and selections. |
| 生成成片 | Show final compose state, preview, download, dashboard import. |
| 分析诊断 | Read dashboard video artifacts and sample/recorded metrics. |

## 4. Contracts / Interfaces

- Use `contracts/openapi.yaml` as path/method source.
- Do not expose raw provider prompt, system prompt, mock labels, or artifact console language as primary UI copy.
- Progress bars for one-click final video are derived from `currentStage/stageState` and active shot counts.
- Polling must respect active/idle states to avoid unnecessary backend pressure.

## 5. Implementation Slices

- Keep single `.ts/.tsx` files under the project preference of roughly 400 lines where possible.
- Keep API clients narrow and domain-specific.
- Prefer view-model derived state over duplicating backend business rules in UI components.

## 6. Acceptance Tests

- `pnpm --filter @aigc-video/web test`
- `pnpm contract:frontend-backend`
- Playwright/manual browser checks when layout or critical workflows change.

## 7. Open Decisions

- Real投放 metrics integration remains future work; current dashboard can combine imported videos and seeded/sample analytics.

## 8. Related Docs

- `contracts/contract_mapping.md`
- `testing/e2e_plan.md`

