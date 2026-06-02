# Review prompt

```txt
Use $diff-review-before-merge.
Review the current diff against the task intent.

Spawn reviewer for correctness, regressions, and missing tests.
If auth/payment/PII/upload/webhook/tenant isolation is touched, spawn security_reviewer.
If query/render/cache/bundle/latency behavior is touched, spawn performance_reviewer.

Prioritize blocking findings. Ignore style-only comments unless they hide real bugs.
```
