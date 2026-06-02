# Helper targets. Run from repository root with:
#   make -f .agent/Makefile validate

.PHONY: validate lesson

validate:
	python .agent/bin/validate_framework.py

lesson:
	python .agent/bin/new_lesson.py "$(TITLE)"
