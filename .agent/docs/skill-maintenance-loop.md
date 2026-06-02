# Skill maintenance loop

## What “correct chain” means

A correct chain is not private model reasoning. It is the observable engineering path that reliably got to a good result.

Format:

```txt
Task type -> entry point -> source of truth -> minimal change -> verification -> reusable rule
```

Example:

```txt
Entitlement feature -> API route -> BillingPolicy -> add policy case + contract test + UI copy -> run billing/web tests -> entitlement changes must check webhook handlers
```

## What “wrong chain” means

A wrong chain is the observable failure path that led to wasted work or a bug.

Format:

```txt
Symptom -> wrong assumption -> why it looked plausible -> how detected -> repair -> prevention
```

Example:

```txt
Webhook failed while UI passed -> assumed UI account.plan was source of truth -> existing UI code made it look canonical -> mapper found BillingPolicy in webhook -> route UI through canonical response -> skill guard: grep BillingPolicy + webhook handlers for entitlement changes
```

## Promotion rules

Promote a lesson into a skill only when it is:

1. Repeatable.
2. High-cost or frequent.
3. Triggerable from a future prompt or file pattern.
4. Verifiable by tests, commands, checklist, or review.

Do not promote:

- one-off quirks
- vague advice
- preferences not tied to quality or speed
- secrets or sensitive incident details

## Skill patch shape

Good patch:

```md
| Failure mode | Detection | Required correction |
|---|---|---|
| Entitlement rule only changed in UI | API/job/webhook paths still use old policy | Route through BillingPolicy and add webhook regression test |
```

Bad patch:

```md
Be more careful with billing code.
```

## Weekly pruning

Every 10-20 lessons:

1. Merge duplicate lessons.
2. Delete low-value rules.
3. Split oversized skills.
4. Move incident stories to `references/`.
5. Keep `SKILL.md` focused on trigger, path, guard, verification, and output.
