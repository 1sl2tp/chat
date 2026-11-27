# Isolated pilot — 2026-11-27
Candidate 6e092576eb3feae2c9f455c53542fce59a48d458: CI 4/4 success. Deployed separate Edge v1, all 7 files matched source, unauthenticated request 22465 returned 403.

| Case | Request | State | Exact | Locator | Crop | AI calls | ms |
|---|---|---|---|---|---|---:|---:|
| 677000 | 22466 | retry | false | true | true | 2 | 16970 |
| 10000000 | 22468 | verified | true | true | true | 2 | 5208 |

Both HTTP 200, no HTTP timeout, no receipt or ledger writes. Small bill read failed to produce accepted evidence; retry alone does not identify provider failure vs parse/transport/deadline. No further blind retry. New pilot endpoint closed after tests; production release blocked. SQL #284, ledger, receipt and collection link hashes unchanged. No 0v runtime or keyboard edits.

## H5 re-test — candidate 1b7495a
CI 4/4. Pilot v3, 7/7 source files match. Request 22473 unauthorized: 403. Request 22474: HTTP 200, verified/exact true, locator/crop true, 2 calls, total 12321 ms, prepare 1663 ms, read transport 9937 ms, parse and evidence accepted, no receipt/ledger write. No new call after this result. One success does not prove timeout change was necessary for this run (read took under 15s). Endpoint closed after test. Production release requires integration and SQL compatibility checks.
