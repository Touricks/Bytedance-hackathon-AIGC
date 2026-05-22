# Architecture

The current recommended architecture is documented in:

- root `arc_codex_r3.md`

Summary:

```text
apps/web      React + TypeScript merchant workspace
apps/server   Node.js + TypeScript modular monolith with embedded job processors
packages/shared  shared DTOs, schemas, job payloads, constants
packages/ai      server-only model providers, prompts, workflows, output schemas
packages/config  shared tooling config
```

P0/P1 uses one Seedance 12s generation for the final video. Storyboard shots are script structure, not render segments.
