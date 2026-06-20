# Module Map

Status: Draft
Owner: Project team
Last Updated: 2026-06-20
Applies To: Product modules and runtime ownership
Depends On: `docs/README.md`, `docs/contracts/interface.md`
Blocks: Module additions without ownership and contract mapping
Decision State: Proposed

## Runtime Modules

| Product surface | Runtime modules | Notes |
|---|---|---|
| Workspace creation and local workdir | `workspace`, `workdir-picker`, storage adapters | Owns `.daireel` workspace identity and active storage binding. |
| Creative review artifacts | `prompt-requirements`, `material-intake`, `product-brief`, `storyboard`, `shotprompt` | Uses propose/approve lifecycle and current approved artifacts. |
| Shot set and per-shot workflow | `shot`, `generation` | Owns image/video prompts, batches, candidates, selections, and final compose prerequisites. |
| One-click and auto-selection orchestration | `generation` services/workers | Orchestrates existing modules instead of creating a parallel business model. |
| Dashboard registry and diagnosis | `dashboard`, `recommendation`, `campaign` | Dashboard videos are copied registry artifacts, not live workspace files. |
| Provider/prompt behavior | `packages/ai`, server deterministic assemblers | Provider calls and prompt contracts are separated from persistence facts. |
| Shared contracts | `packages/shared` | Owns reusable schemas, types, constants, and compiler helpers. |

## Dependency Direction

Runtime apps may import reusable packages. Reusable packages must not import runtime apps. Frontend code should use API adapters instead of reaching into backend modules or persistence assumptions.

## Module Addition Rule

Adding a module requires a docs update naming product purpose, runtime owner, API or event surface, durable facts, frontend projection, and validation command.
