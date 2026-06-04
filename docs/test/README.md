# Test Entry Points

There is no active official real-provider smoke package script.

Manual provider probes live under `scripts/`:

- `node scripts/verify-provider-image.mjs --json`
- `node scripts/verify-provider-video.mjs --image-url <url> --json`

These probes call provider endpoints directly. They do not exercise workspace state, queues, DB writes, asset persistence, selection, or final compose.

Multi-real-model package scripts such as `realitest`, `test:agent-chain`, `realitest:parallel`, `smoke:providers`, `smoke:real-providers`, and chain-smoke entries have been removed and must not be restored as active automation without a new test policy decision.

The V2 Postman/Newman agent-chain assets remain under `docs/test/agent-chain/` for contract reference, but they are not an active automated real-provider test entry.

Legacy V1 Postman/OpenAPI files were removed from the active `docs/test/` tree because the V1 static workspace builder endpoints are intentionally no longer registered.
