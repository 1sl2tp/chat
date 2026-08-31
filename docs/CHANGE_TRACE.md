# Change Trace

Use this template for non-trivial fixes, refactors, or rollbacks so a future maintainer can recover the exact repair path without rereading the whole repository.

## Change record template

```text
CHANGE ID
<short stable id or release/task id>

REQUEST
<what the user observed or requested>

SURFACE
<CUSTOMER_CHAT | ADMIN | APP | future surface>

REGION ID
<one or more IDs from REGION_REGISTRY>

RUNTIME CONTEXT
platform: <iOS | Android | desktop | unknown>
display mode: <browser | standalone | unknown>
viewport state: <normal | keyboard-open | rotated | resumed | not-applicable>

CONCERN
<UI/geometry | interaction | Auth/session | identity | chat/message | backend/data | viewport/keyboard | PWA/lifecycle | media | ICE/TURN>

REPAIR ROOT
<canonical owner/module>

PARENT TRACE
<Owner/Parent -> Sibling -> Child/Leaf evidence>

FILES CHANGED
<exact paths>

FOCUSED TESTS
<exact commands/tests>

BROAD GATES
<check/build/device matrix used>

RISK
<what could regress>

ROLLBACK
<commit or smallest reversible change set>
```

## Commit subject convention

Prefer:

`type(owner): action REGION_ID`

Examples:

- `fix(viewport): keep CUSTOMER_CHAT/COMPOSER above iOS PWA keyboard`
- `fix(composer): prevent focus zoom CUSTOMER_CHAT/COMPOSER/INPUT`
- `fix(admin): restore ADMIN/INBOX selection lifecycle`
- `refactor(chat): centralize CUSTOMER_CHAT/MESSAGE_LIST subscription ownership`

The subject may omit a Region ID for changes with no visible region (for example a pure migration or CI change), but the body/checkpoint should still name the canonical owner and concern.

## Forward-change rule

Before changing code:

1. choose the visible Region ID if one exists;
2. classify the concern;
3. use `REPAIR_MAP` to find the canonical owner;
4. trace parent/sibling/child boundaries;
5. identify the smallest focused tests;
6. then edit.

## Rollback rule

When a regression is reported:

1. identify the same Region ID and concern;
2. search commit history by Region ID/owner;
3. compare only the relevant change set first;
4. revert the smallest proven cause;
5. re-run the same focused tests and broader gates recorded by the original change.

Do not use whole-release rollback as the first response to a local leaf regression.

## Region move/rename rule

- If implementation files/classes move but the semantic region is unchanged, keep the Region ID and update the registry locator/owner path.
- If the semantic region is replaced by a genuinely different region, retire the old ID in history and introduce a new ID; do not silently reuse an old ID for a different meaning.
- Runtime behavior must never depend on Region IDs; they are trace/diagnostic metadata.