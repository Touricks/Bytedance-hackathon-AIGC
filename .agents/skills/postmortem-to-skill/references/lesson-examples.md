# Lesson examples

## Correct path example

```txt
Task: Add paid-plan limit messaging.
Correct path:
1. Map BillingPolicy as source of truth.
2. Check API entitlement route, webhook handler, and UI display.
3. Add contract test for old free-plan behavior and new paid-plan behavior.
4. Implement only the policy + API response + UI copy.
5. Run targeted billing and web tests.
Reusable rule:
Entitlement changes must grep BillingPolicy and webhook handlers before editing UI.
```

## Wrong path example

```txt
Symptom: UI test passed, webhook path failed.
Wrong assumption: account.plan displayed in UI is the entitlement source of truth.
Detection: repo_mapper found webhook handler using BillingPolicy while UI used account.plan directly.
Repair: route UI data through canonical entitlement response.
Prevention: add wrong-chain guard to fullstack-feature-slice.
```
