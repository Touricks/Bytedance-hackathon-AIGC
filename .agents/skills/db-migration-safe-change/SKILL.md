---
name: db-migration-safe-change
description: "Database migration / 数据库迁移: use when changing schemas, indexes, constraints, backfills, ORM models, seed data, fixtures, or data access patterns."
---

# Database migration safe change

## Goal

Make data changes safely with explicit compatibility, rollout, and rollback/remediation thinking.

## Correct path

1. Identify the data change:
   - table/model/entity
   - column/index/constraint
   - migration/backfill/seed/fixture
   - read/write paths and jobs
2. Classify risk:
   - additive and backward-compatible
   - destructive or irreversible
   - high-cardinality or long-running
   - dual-read/write or staged rollout required
3. Check application compatibility:
   - old code with new schema
   - new code with old data
   - nullable/default behavior
   - generated ORM/client/types
4. Add or update migration with clear ordering.
5. Add data access tests, migration tests, or fixture updates.
6. Include rollback or remediation notes.
7. Watch for performance implications: indexes, locks, scans, and query plans.

## Wrong-chain guards

| Failure mode | Detection | Required correction |
|---|---|---|
| Non-null column added without default/backfill | Migration fails on existing data | Stage migration or provide default/backfill |
| App assumes migrated data | No compatibility check | Add null/legacy handling until backfill complete |
| Missing index for new query | New filter/order on large table | Add index or justify absence |
| Destructive migration unreviewed | Drop/rename/delete without plan | Add migration/rollback/remediation plan |
| Fixtures stale | Tests fail due to seed mismatch | Update fixtures intentionally |

## Output contract

Return:

1. Schema/data changes.
2. Compatibility and rollout notes.
3. Rollback/remediation notes.
4. Tests/fixtures updated.
5. Commands run and results.
6. Performance risks.
