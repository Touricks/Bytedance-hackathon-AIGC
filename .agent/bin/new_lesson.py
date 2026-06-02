#!/usr/bin/env python3
"""Create a new lesson file from the template.

Usage:
  python .agent/bin/new_lesson.py "paid plan entitlement bug"
"""

from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FRAMEWORK_DIR = ROOT / ".agent"
TEMPLATE = FRAMEWORK_DIR / "notes" / "lessons" / "_template.md"
LESSONS = FRAMEWORK_DIR / "notes" / "lessons"


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9一-鿿]+", "-", title.strip()).strip("-").lower()
    return slug or "lesson"


def main(argv: list[str]) -> int:
    title = " ".join(argv).strip() if argv else "new lesson"
    today = date.today().isoformat()
    path = LESSONS / f"{today}-{slugify(title)}.md"
    if path.exists():
        print(f"Already exists: {path}")
        return 1
    text = TEMPLATE.read_text(encoding="utf-8")
    text = text.replace("# Lesson: <short title>", f"# Lesson: {title}")
    text = text.replace("Date: YYYY-MM-DD", f"Date: {today}")
    path.write_text(text, encoding="utf-8")
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
