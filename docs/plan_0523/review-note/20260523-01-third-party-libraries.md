# Review note 2026-05-23: third-party libraries

## Question

当前代码版本安装了哪些第三方库，安装位置在哪里？

## Answer

Scope: this note treats packages declared in `package.json` as direct third-party libraries. Workspace packages such as `@aigc-video/shared` and `@aigc-video/ai` are internal code and are not counted as third-party libraries here.

Package manager: `pnpm@9.15.4`.

Install layout:

- Direct dependencies are linked from each workspace package's `node_modules`.
- The actual package contents live under the root pnpm virtual store: `node_modules/.pnpm/<package>@<version>/node_modules/<package>`.
- Root development tools are linked from root `node_modules`.
- `packages/config` declares no third-party dependency and has no local `node_modules`.
- Transitive dependencies also live under `node_modules/.pnpm/`; inspect them with `pnpm list -r --depth Infinity` or by reading `pnpm-lock.yaml`.

## Direct dependencies by package

### Root package: `package.json`

| Library | Kind | Declared | Installed | Link path | Real install path |
| --- | --- | --- | --- | --- | --- |
| `@eslint/js` | dev | `^9.18.0` | `9.39.4` | `node_modules/@eslint/js` | `node_modules/.pnpm/@eslint+js@9.39.4/node_modules/@eslint/js` |
| `eslint` | dev | `^9.18.0` | `9.39.4` | `node_modules/eslint` | `node_modules/.pnpm/eslint@9.39.4/node_modules/eslint` |
| `husky` | dev | `^9.1.7` | `9.1.7` | `node_modules/husky` | `node_modules/.pnpm/husky@9.1.7/node_modules/husky` |
| `lint-staged` | dev | `^15.2.11` | `15.5.2` | `node_modules/lint-staged` | `node_modules/.pnpm/lint-staged@15.5.2/node_modules/lint-staged` |
| `prettier` | dev | `^3.4.2` | `3.8.3` | `node_modules/prettier` | `node_modules/.pnpm/prettier@3.8.3/node_modules/prettier` |
| `turbo` | dev | `^2.3.3` | `2.9.14` | `node_modules/turbo` | `node_modules/.pnpm/turbo@2.9.14/node_modules/turbo` |
| `typescript` | dev | `^5.7.3` | `5.9.3` | `node_modules/typescript` | `node_modules/.pnpm/typescript@5.9.3/node_modules/typescript` |
| `typescript-eslint` | dev | `^8.20.0` | `8.59.4` | `node_modules/typescript-eslint` | `node_modules/.pnpm/typescript-eslint@8.59.4_eslint@9.39.4_typescript@5.9.3/node_modules/typescript-eslint` |

### Web app: `apps/web/package.json`

| Library | Kind | Declared | Installed | Link path | Real install path |
| --- | --- | --- | --- | --- | --- |
| `@tanstack/react-query` | runtime | `^5.64.2` | `5.100.11` | `apps/web/node_modules/@tanstack/react-query` | `node_modules/.pnpm/@tanstack+react-query@5.100.11_react@19.2.6/node_modules/@tanstack/react-query` |
| `@vitejs/plugin-react` | runtime | `^4.3.4` | `4.7.0` | `apps/web/node_modules/@vitejs/plugin-react` | `node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@6.4.2_@types+node@22.19.19_tsx@4.22.3_yaml@2.9.0_/node_modules/@vitejs/plugin-react` |
| `lucide-react` | runtime | `^0.469.0` | `0.469.0` | `apps/web/node_modules/lucide-react` | `node_modules/.pnpm/lucide-react@0.469.0_react@19.2.6/node_modules/lucide-react` |
| `react` | runtime | `^19.0.0` | `19.2.6` | `apps/web/node_modules/react` | `node_modules/.pnpm/react@19.2.6/node_modules/react` |
| `react-dom` | runtime | `^19.0.0` | `19.2.6` | `apps/web/node_modules/react-dom` | `node_modules/.pnpm/react-dom@19.2.6_react@19.2.6/node_modules/react-dom` |
| `react-hook-form` | runtime | `^7.54.2` | `7.76.0` | `apps/web/node_modules/react-hook-form` | `node_modules/.pnpm/react-hook-form@7.76.0_react@19.2.6/node_modules/react-hook-form` |
| `zod` | runtime | `^3.24.1` | `3.25.76` | `apps/web/node_modules/zod` | `node_modules/.pnpm/zod@3.25.76/node_modules/zod` |
| `zustand` | runtime | `^5.0.2` | `5.0.13` | `apps/web/node_modules/zustand` | `node_modules/.pnpm/zustand@5.0.13_@types+react@19.2.15_react@19.2.6/node_modules/zustand` |
| `@types/react` | dev | `^19.0.7` | `19.2.15` | `apps/web/node_modules/@types/react` | `node_modules/.pnpm/@types+react@19.2.15/node_modules/@types/react` |
| `@types/react-dom` | dev | `^19.0.3` | `19.2.3` | `apps/web/node_modules/@types/react-dom` | `node_modules/.pnpm/@types+react-dom@19.2.3_@types+react@19.2.15/node_modules/@types/react-dom` |
| `tsx` | dev | `^4.19.2` | `4.22.3` | `apps/web/node_modules/tsx` | `node_modules/.pnpm/tsx@4.22.3/node_modules/tsx` |
| `typescript` | dev | `^5.7.3` | `5.9.3` | `apps/web/node_modules/typescript` | `node_modules/.pnpm/typescript@5.9.3/node_modules/typescript` |
| `vite` | dev | `^6.0.7` | `6.4.2` | `apps/web/node_modules/vite` | `node_modules/.pnpm/vite@6.4.2_@types+node@22.19.19_tsx@4.22.3_yaml@2.9.0/node_modules/vite` |

### Server app: `apps/server/package.json`

| Library | Kind | Declared | Installed | Link path | Real install path |
| --- | --- | --- | --- | --- | --- |
| `@fastify/cors` | runtime | `^10.0.2` | `10.1.0` | `apps/server/node_modules/@fastify/cors` | `node_modules/.pnpm/@fastify+cors@10.1.0/node_modules/@fastify/cors` |
| `bullmq` | runtime | `^5.34.2` | `5.77.0` | `apps/server/node_modules/bullmq` | `node_modules/.pnpm/bullmq@5.77.0/node_modules/bullmq` |
| `fastify` | runtime | `^5.2.1` | `5.8.5` | `apps/server/node_modules/fastify` | `node_modules/.pnpm/fastify@5.8.5/node_modules/fastify` |
| `ioredis` | runtime | `^5.4.2` | `5.10.1` | `apps/server/node_modules/ioredis` | `node_modules/.pnpm/ioredis@5.10.1/node_modules/ioredis` |
| `nanoid` | runtime | `^5.0.9` | `5.1.11` | `apps/server/node_modules/nanoid` | `node_modules/.pnpm/nanoid@5.1.11/node_modules/nanoid` |
| `zod` | runtime | `^3.24.1` | `3.25.76` | `apps/server/node_modules/zod` | `node_modules/.pnpm/zod@3.25.76/node_modules/zod` |
| `@types/node` | dev | `^22.10.5` | `22.19.19` | `apps/server/node_modules/@types/node` | `node_modules/.pnpm/@types+node@22.19.19/node_modules/@types/node` |
| `tsx` | dev | `^4.19.2` | `4.22.3` | `apps/server/node_modules/tsx` | `node_modules/.pnpm/tsx@4.22.3/node_modules/tsx` |
| `typescript` | dev | `^5.7.3` | `5.9.3` | `apps/server/node_modules/typescript` | `node_modules/.pnpm/typescript@5.9.3/node_modules/typescript` |

### AI package: `packages/ai/package.json`

| Library | Kind | Declared | Installed | Link path | Real install path |
| --- | --- | --- | --- | --- | --- |
| `openai` | runtime | `^4.86.1` | `4.104.0` | `packages/ai/node_modules/openai` | `node_modules/.pnpm/openai@4.104.0_zod@3.25.76/node_modules/openai` |
| `zod` | runtime | `^3.24.1` | `3.25.76` | `packages/ai/node_modules/zod` | `node_modules/.pnpm/zod@3.25.76/node_modules/zod` |
| `@types/node` | dev | `^22.10.5` | `22.19.19` | `packages/ai/node_modules/@types/node` | `node_modules/.pnpm/@types+node@22.19.19/node_modules/@types/node` |
| `tsx` | dev | `^4.19.2` | `4.22.3` | `packages/ai/node_modules/tsx` | `node_modules/.pnpm/tsx@4.22.3/node_modules/tsx` |
| `typescript` | dev | `^5.7.3` | `5.9.3` | `packages/ai/node_modules/typescript` | `node_modules/.pnpm/typescript@5.9.3/node_modules/typescript` |

### Shared package: `packages/shared/package.json`

| Library | Kind | Declared | Installed | Link path | Real install path |
| --- | --- | --- | --- | --- | --- |
| `zod` | runtime | `^3.24.1` | `3.25.76` | `packages/shared/node_modules/zod` | `node_modules/.pnpm/zod@3.25.76/node_modules/zod` |
| `typescript` | dev | `^5.7.3` | `5.9.3` | `packages/shared/node_modules/typescript` | `node_modules/.pnpm/typescript@5.9.3/node_modules/typescript` |

## Review observations

- Most versions are declared with caret ranges, so installed versions are newer than the manifest minimums. This is expected with the current lockfile, but it is a useful bug-hunting surface if behavior differs across machines without the same lockfile.
- `@vitejs/plugin-react` is listed under `apps/web` runtime `dependencies`, although it is normally build-time tooling. That is not necessarily a functional bug, but it is a dependency hygiene issue worth checking.
- `zod` is duplicated as a direct dependency across web, server, ai, and shared, but pnpm resolves all of them to the same installed version `3.25.76`.

## Commands used

```bash
find . -name package.json -not -path './node_modules/*' -maxdepth 4 -print
find . -path '*/node_modules' -type d -maxdepth 4 | sort
ls -la apps/web/node_modules apps/server/node_modules packages/ai/node_modules packages/shared/node_modules packages/config/node_modules
node # script to map declared dependencies to symlink and real pnpm paths
```
