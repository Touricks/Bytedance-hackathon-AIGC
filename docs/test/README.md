# Test Entry Points

Current V2 contract tests live under `docs/test/agent-chain/`.

- `pnpm realitest` runs `scripts/run-agent-chain-test.mjs`.
- `pnpm test:agent-chain` runs the same V2 real-provider Newman flow.
- `pnpm realitest:parallel` runs `scripts/run-realitest-parallel.mjs` for 4-shot image/video/final compose acceptance.

Legacy V1 Postman/OpenAPI files were removed from the active `docs/test/` tree because the V1 static workspace builder endpoints are intentionally no longer registered.
