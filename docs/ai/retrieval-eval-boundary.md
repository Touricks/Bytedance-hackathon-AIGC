# AI And Eval Boundary

Status: Draft
Owner: Project team
Last Updated: 2026-06-20
Applies To: Provider calls, prompt modules, deterministic assemblers, trace, and eval behavior
Depends On: `docs/data/persistence-boundary.md`, `docs/eval/demo-eval-plan.md`
Blocks: Prompt/provider changes without schema, trace, and validation alignment
Decision State: Proposed

## Boundary

The AI layer owns provider clients, prompt module text, response formats, and deterministic assembly inputs. Persistence of business facts remains in server modules and database tables.

## Rules

- Provider calls must use configured provider clients and concurrency boundaries.
- Prompt module contracts live with `packages/ai/src/prompts/modules/**/contract.md`.
- Runtime responses must validate through shared schemas or provider response formats before becoming durable artifacts.
- Trace output should capture enough provider evidence for debugging without exposing secrets.
- Real-provider probes diagnose provider availability; they do not replace workspace, queue, DB, selection, or final-compose acceptance tests.

## Code Evidence

- Provider clients: `packages/ai/src/providers/*`
- Prompt modules: `packages/ai/src/prompts/modules/**`
- Response formats: `packages/ai/src/contracts/response-formats.ts`
- Deterministic shot assembly: `apps/server/src/modules/shot/prompt-assembler.ts`
- Trace behavior: `packages/ai/src/trace/*`, `apps/server/src/modules/trace/*`
