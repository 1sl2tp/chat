# Rust pilot — read-only bank review evidence

This crate is an **isolated Rust compatibility experiment** for the Chat
Agribank reconciliation screen. Its only output is a *review hint*, never
"received", "matched", "authorized", or a financial write.

## Scope

- The existing JavaScript/TypeScript + PostgreSQL implementation remains the
  **only production source of truth**. This crate is not imported by the app
  or the Supabase Edge Functions.
- No new web request, RPC, database table, polling task, deployment dependency,
  payment, customer notification, or ledger entry.
- A candidate requires one unlinked reviewable receipt and **exactly one**
  already-collected bank credit for the same customer, positive amount,
  and Vietnam business day. Ambiguous or contradictory data fails closed.
- The receipt's upload date is advisory, **not proof of the bank transfer
  timestamp or ownership**. Rust never automatically attaches a receipt.
- The crate has **zero third-party dependencies** and is tested separately
  from production workflows.

## Validation

```sh
cargo test --manifest-path rust/bank-review-guard/Cargo.toml --offline
```

CI: `.github/workflows/rust-bank-review.yml`. It runs on changes inside
this Rust pilot only; it does not alter the deployed JS/PWA or the banking
Edge Function.

## Rollback / adoption gate

Revert the Rust pilot commit to remove it. Production remains unchanged
either way. **Do not use this Rust result for financial collection.**
Before any actual integration, compare it with the canonical
`bank-report-dashboard.js` read-only helper on a comprehensive fixture set,
benchmark a real bottleneck, review the wasm/Edge build/runtime and resource
costs, and complete CI + PWA device acceptance.

Future phases must be separately scoped and must not rewrite authentication,
realtime, financial RPCs or the UI in one migration.

## Cross-language parity gate (2026-11-03)

The fixture set `fixtures/review_cases.tsv` is consumed by both Rust unit
Tests and `tests/test_rust_bank_review_parity_20261103.cjs`, which extracts
the exact production JavaScript helper for read-only comparison. Cases include
same-customer duplicate images even if one image has a contradicting account,
multiple bank credits, an already-linked other bill, short OCR account digits,
and manual collection without a ledger. The earlier pilot diverged on the
competing wrong-account bill; the shared fixture now locks fail-closed parity.
No financial writer uses this Rust crate. Production PWA unchanged.
