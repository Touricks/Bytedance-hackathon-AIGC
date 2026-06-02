# Test Entry Points

Current real-provider smoke coverage is intentionally limited to the backend image/video chain:

- `pnpm --filter @aigc-video/server test:integration:smoke`
- Active files: `apps/server/test/integration/image-flow.integration.test.ts` and `apps/server/test/integration/video-flow.integration.test.ts`.
- Candidate counts are fixed to 1 image and 1 video.
- Multi-real-model package scripts such as `realitest`, `test:agent-chain`, `realitest:parallel`, `smoke:providers`, and `smoke:real-providers` have been removed and must not be restored as active automation without a new test policy decision.

The V2 Postman/Newman agent-chain assets remain under `docs/test/agent-chain/` for contract reference, but they are not an active automated real-provider test entry.

Legacy V1 Postman/OpenAPI files were removed from the active `docs/test/` tree because the V1 static workspace builder endpoints are intentionally no longer registered.
