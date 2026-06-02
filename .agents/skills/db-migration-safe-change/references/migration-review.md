# Migration review prompts

Ask before merging database changes:

1. Can old code run against the new schema?
2. Can new code handle old rows?
3. Does the migration lock a large table?
4. Is a backfill needed? Is it idempotent?
5. Are indexes needed before new queries ship?
6. Is rollback safe? If not, what remediation exists?
7. Are fixtures, seed data, and generated clients updated?
