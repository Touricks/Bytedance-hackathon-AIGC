## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `Touricks/Bytedance-hackathon-AIGC`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the canonical triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain layout rooted at `CONTEXT.md`. See `docs/agents/domain.md`.

### Storage cleanup

Before a new-version test run, use `pnpm db:clear -- --yes` to clear Postgres business tables and avoid old job/script/workspace/artifact/trace rows affecting the run.

The cleanup script only clears Postgres. It does not delete workspace `.daireel/trace/events.jsonl`, deprecated repo-local `storage/trace`, `storage/uploads`, Redis, or MinIO content. If you reuse the same workspace directory and need trace isolation, create a fresh workspace or handle that workspace trace file explicitly.

### Release worktree hygiene

When a release commit is tagged and pushed from a Codex worktree, leave the worktree detached after the tag operation so the user can check out the same version in the project root under `/Users/carrick/ResearchWorkspace/Bytedancehack`.

Use `git worktree list` and `git branch -vv --all` to verify which worktree owns `main`. If a Codex worktree still owns `main` after tagging, detach that worktree at the release commit with `git switch --detach HEAD`. If the release commit was created from a detached worktree and should become local `main`, update the local branch ref with `git update-ref refs/heads/main HEAD`, then keep the Codex worktree detached.

Do not clean or reset another worktree's dirty files unless the user explicitly asks. Detaching a worktree should preserve its working tree changes.

### Root workspace cleanup

When `/Users/carrick/ResearchWorkspace/Bytedancehack` contains files that are not on the remote, distinguish them before deleting anything:

1. `git status --short --branch` shows tracked modifications plus non-ignored untracked files.
2. `git ls-files --others --exclude-standard` shows non-ignored untracked files. These are candidates for review before cleanup.
3. `git ls-files --others -i --exclude-standard` shows ignored local files such as `.env`, `node_modules/`, `dist/`, and `.turbo/`.
4. `git clean -nd` previews deletion of non-ignored untracked files.
5. `git clean -ndx` previews deletion of ignored and non-ignored files together. Treat this as diagnostic output, not an automatic cleanup command.

Never delete `.env`, credential files, keys, or local workspace data unless the user explicitly confirms. Prefer targeted cleanup, for example `git clean -fd -- apps/web/public/bgm apps/web/src/components`, instead of broad `git clean -fdx`.

## API related problems reference
- https://www.volcengine.com/docs/82379/1494384?lang=zh

# System

1. 服务运行: pnpm dev
2. 为了适配Seedance，所有prompt需要以中文构建
3. 当前测试目录：/Users/carrick/TestWorkspace/Project-AIGC/0526v1
4. 前端测试请使用playwright进自动化测试

## 临时prompt：视频生成提示词组装

**已确认的视频剧本 -> 成片任务 prompt，不应该再经过 LLM。**

原因很直接：

- 用户已经确认了视频剧本，再让 LLM 改写一次，会引入不可控漂移。
- 最终传给 Seedance 的 prompt 应该可复现、可审计。
- 调试时要能明确回答：“成片 prompt 里的每一句来自哪个 artifact 字段。”
- 少一次 LLM 调用也减少延迟、成本和失败面。

当前代码里要分两层看：

1. **storyboard -> shotprompt**
   - `MODEL_MODE=real` 时可能经过 Ark LLM。
   - 但产物是 `ShotPromptArtifact`，状态是 `proposed`，需要用户确认。
   - 这属于“LLM 帮忙起草视频剧本”。

2. **approved shotprompt -> Seedance 成片 prompt**
   - 当前应走 `buildSeedanceVideoExportPrompt(shotPrompt)`。
   - 这是确定性字符串组装。
   - 不应该调用 `generateTextWithArk()`。
   - `shots[].providerPrompt` 应原样进入最终 prompt 的“逐镜头时间线”。

我建议把原则写成：

> LLM 只能生成可编辑、可确认的中间 artifact；一旦 artifact 被 approve，后续 provider prompt 只能由确定性 compiler 组装，不允许再让文本模型改写。

如果要进一步加固，可以加两个测试/护栏：

- 成片任务测试断言 `job.payload.shotprompt` 优先于 legacy script，并且最终 prompt 包含每个 `shots[].providerPrompt`。
- provider boundary 测试断言 video export 阶段不会调用 Ark text provider，只会调用 Seedance video provider。
