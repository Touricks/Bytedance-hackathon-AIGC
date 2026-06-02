#!/usr/bin/env python3
"""Validate the Codex agent/skill framework structure.

Checks:
- .codex/agents/*.toml parses and contains required custom-agent fields.
- .agents/skills/*/SKILL.md contains YAML-like frontmatter with name and description.
- .agent/ contains the framework-owned helper assets.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import tomllib  # Python 3.11+
except ModuleNotFoundError:  # pragma: no cover
    print("Python 3.11+ is required for tomllib. Install tomli or upgrade Python.", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[2]
FRAMEWORK_DIR = ROOT / ".agent"
REQUIRED_AGENT_FIELDS = {"name", "description", "developer_instructions"}
REQUIRED_FRAMEWORK_PATHS = [
    ROOT / "AGENTS.md",
    ROOT / ".codex" / "config.toml",
    ROOT / ".codex" / "agents",
    ROOT / ".agents" / "skills",
    FRAMEWORK_DIR / "docs",
    FRAMEWORK_DIR / "prompts",
    FRAMEWORK_DIR / "bin",
    FRAMEWORK_DIR / "notes" / "lessons" / "_template.md",
    FRAMEWORK_DIR / "notes" / "evals" / "_template.md",
]


def validate_required_paths() -> list[str]:
    errors: list[str] = []
    for path in REQUIRED_FRAMEWORK_PATHS:
        if not path.exists():
            errors.append(f"missing required path: {path}")
    return errors


def validate_agents() -> list[str]:
    errors: list[str] = []
    agent_dir = ROOT / ".codex" / "agents"
    if not agent_dir.exists():
        return [f"missing agent directory: {agent_dir}"]
    for path in sorted(agent_dir.glob("*.toml")):
        try:
            data = tomllib.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{path}: TOML parse error: {exc}")
            continue
        missing = REQUIRED_AGENT_FIELDS - set(data)
        if missing:
            errors.append(f"{path}: missing fields: {sorted(missing)}")
        if data.get("name") and path.stem != str(data["name"]):
            errors.append(f"{path}: filename stem should match name={data['name']!r}")
    return errors


def parse_frontmatter(text: str) -> dict[str, str] | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end == -1:
        return None
    raw = text[4:end]
    result: dict[str, str] = {}
    for line in raw.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def validate_skills() -> list[str]:
    errors: list[str] = []
    skills_dir = ROOT / ".agents" / "skills"
    if not skills_dir.exists():
        return [f"missing skills directory: {skills_dir}"]
    for path in sorted(skills_dir.glob("*/SKILL.md")):
        text = path.read_text(encoding="utf-8")
        fm = parse_frontmatter(text)
        if fm is None:
            errors.append(f"{path}: missing frontmatter")
            continue
        for field in ("name", "description"):
            if not fm.get(field):
                errors.append(f"{path}: missing frontmatter field {field!r}")
        expected_name = path.parent.name
        if fm.get("name") != expected_name:
            errors.append(f"{path}: skill name {fm.get('name')!r} should match folder {expected_name!r}")
        if fm.get("description") and len(fm["description"]) < 40:
            errors.append(f"{path}: description is probably too short for reliable triggering")
    return errors


def main() -> int:
    errors = validate_required_paths() + validate_agents() + validate_skills()
    if errors:
        print("Framework validation failed:\n")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Framework validation passed.")
    print(f"Agents: {len(list((ROOT / '.codex' / 'agents').glob('*.toml')))}")
    print(f"Skills: {len(list((ROOT / '.agents' / 'skills').glob('*/SKILL.md')))}")
    print("Auxiliary assets: .agent/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
