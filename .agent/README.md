# Codex Agent / Skill Framework - dotagent packaging

这是一个以 **Codex** 为主要 coding agent 入口的 agent + skill 模板。

这个版本把框架自己的说明、prompt、脚本和复盘记录全部收纳到隐藏目录 `.agent/`，避免和业务项目已有的 `docs/`、`prompts/`、`scripts/` 冲突。

```txt
AGENTS.md          = Codex 自动读取的项目事实、约束、验收标准
.codex/agents/    = Codex custom agents，例如 mapper / reviewer / verifier
.agents/skills/   = Codex repo skills，例如 fullstack feature、bugfix、postmortem-to-skill
.agent/           = 框架辅助资产：docs、prompts、bin、notes、evals、templates
```

## 快速安装

把本目录内容复制到你的项目根目录。由于根目录只包含 `AGENTS.md` 和隐藏目录，默认不会污染你的业务 `docs/`、`prompts/`、`scripts/`。

```bash
cp -R codex-agent-skill-framework-dotagent/. /path/to/your/repo/
cd /path/to/your/repo
python .agent/bin/validate_framework.py
codex "Summarize active AGENTS.md guidance and available repo skills."
```

然后先改这几个地方：

1. `AGENTS.md`：替换真实安装、测试、lint、类型检查、目录结构。
2. `.codex/config.toml`：按机器和团队习惯调整 `agents.max_threads`。
3. `.agents/skills/*/SKILL.md`：删除不适用的框架假设，例如 React、REST、SQL。
4. `.agent/docs/spawn-patterns.md`：把常用 prompt 改成你的工作方式。

## 推荐使用方式

### 全栈功能

```txt
Use $fullstack-feature-slice.
Spawn repo_mapper to map the current behavior and tests.
Spawn feature_planner to propose a minimal vertical plan.
After I approve the plan, implement the smallest safe diff and run targeted verification.
```

### Bug 修复

```txt
Use $bugfix-root-cause-loop.
Spawn repo_mapper to trace the failing path and test coverage.
Do not edit until the failure mode and likely root cause are stated.
Then implement the smallest fix and ask test_verifier to validate.
```

### PR / diff 审查

```txt
Spawn reviewer and security_reviewer to review the current diff.
Prioritize correctness, behavior regressions, security/privacy, and missing tests.
Ignore style-only comments unless they hide a real bug.
```

### 任务结束后沉淀 skill

```txt
Use $postmortem-to-skill.
Spawn skill_curator.
Read the diff, test output, and any failure notes.
Create a lesson, then propose the smallest SKILL.md patch if the lesson is repeatable.
```

## 文件夹说明

```txt
.codex/config.toml                 # Codex 项目级多 agent 配置
.codex/agents/*.toml               # Codex custom agents
.agents/skills/*/SKILL.md          # Codex repo skills
.agent/notes/lessons/_template.md  # 复盘模板
.agent/notes/evals/_template.md    # skill / agent 评估样例模板
.agent/docs/                       # 框架说明与 spawn 模式
.agent/prompts/                    # 可直接复制给 Codex 的任务 prompt
.agent/bin/                        # 本地校验与 lesson 生成工具
```

## 设计原则

- **Codex 必须识别的入口保留标准路径**：`AGENTS.md`、`.codex/`、`.agents/skills/`。
- **框架辅助资产全部收进 `.agent/`**：不和业务项目目录抢名字。
- **少量 agent，多数知识放 skill**：agent 是执行隔离，skill 是流程资产。
- **正确链路 / 错误链路来自可观察工程轨迹**：记录文件、命令、错误、测试、diff、修复，不记录模型私有思维链。
- **只有可重复、可触发、可验证的经验才升级为 skill**。

## 常用命令

```bash
python .agent/bin/validate_framework.py
python .agent/bin/new_lesson.py "short task title"
```

可选：把 `.agent/gitignore-snippet.txt` 里的内容合并到你的项目 `.gitignore`。
