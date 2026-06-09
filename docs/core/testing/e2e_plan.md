# E2E Plan

Status: Draft
Owner: Project team
Last Updated: 2026-06-08
Applies To: Merchant workflow acceptance through the web UI and API
Depends On: `testing/test_strategy.md`, `contracts/interface.md`
Blocks: Claiming full workflow acceptance without journey evidence
Decision State: Accepted

## 1. Executive Summary

E2E acceptance should prove the business journey, not only provider reachability. Real provider probes are not a substitute for workspace state, queues, DB writes, asset persistence, selections, and final compose evidence.

## 2. Current Reality

The project has API/unit/integration tests and direct provider probes. A maintained browser E2E suite for the full V3 journey is not currently the official gate.

## 3. Target Journey

1. Create or reopen a workspace.
2. Save/approve 创作要求.
3. Upload workspace materials.
4. Propose/approve 素材解读.
5. Propose/approve 商品卖点.
6. Propose/approve 分镜脚本.
7. Propose/approve 分镜生成要求.
8. Apply 分镜链路实例.
9. Generate and select 分镜图.
10. Generate and select 分镜视频.
11. Compose 成片.
12. Import dashboard video and verify attribution.
13. Create publication and record metrics.

## 4. Contracts / Interfaces

- Use mock/local mode for deterministic regression unless the explicit goal is provider diagnosis.
- If real providers are used, record account limits, candidate counts, and provider errors separately from product journey defects.
- E2E should assert `upstreamChanged` warnings preserve existing downstream choices.

## 5. Implementation Slices

- API-level journey seed and progression.
- Browser journey through creative review desk.
- Dashboard import and analysis navigation.
- Failure/resume cases for one-click and provider persistence.

## 6. Acceptance Tests

Minimum evidence for full journey:

- API state after each module approval.
- Active shot set and shot count after apply.
- Candidate rows and selection rows after generation/selection.
- Final video job success and stable file URL.
- Dashboard artifact with 成片创作归因.

## 7. Open Decisions

- Choose Playwright browser suite ownership before making E2E mandatory in CI.

## 8. Related Docs

- `architecture/frontend.md`
- `architecture/backend.md`

