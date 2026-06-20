# Contract Examples

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: API examples and fixtures
Depends On: `docs/contracts/openapi.yaml`
Blocks: Example additions that drift from the machine contract
Decision State: Accepted

## 1. Current Examples

The primary examples are currently embedded in API tests and frontend client tests. Add standalone JSON examples here only when they are used by docs, Postman, or contract fixtures.

## 2. Example Rule

Examples must use current domain language and current four-factor schema:

```json
{
  "creativeFactors": {
    "productCategory": "consumer-electronics",
    "dealType": "search-standard",
    "audience": "youth",
    "strategy": "review-comparison"
  }
}
```
