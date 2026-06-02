# API compatibility matrix

| Change | Usually compatible? | Required checks |
|---|---:|---|
| Add optional response field | Yes | Consumer tests, generated types |
| Add required request field | No | Version/deprecation/migration |
| Rename response field | No | Consumer migration |
| Change error status/code | Maybe | Client error handling tests |
| Tighten validation | Maybe | Existing data/client compatibility |
| Loosen validation | Maybe | Security and downstream assumptions |
| Add enum value | Maybe | Exhaustive switch/client handling |
