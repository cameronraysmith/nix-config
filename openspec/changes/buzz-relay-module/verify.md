# Verification Report

> This file is produced by the `openspec-verify-change` skill after apply completes, to confirm that the
> implementation is consistent with the specs / design / tasks. Any failed check must be returned to its
> corresponding artifact for correction before re-running verify.
>
> STUB: not yet filled. Complete this report post-implementation, after apply.

**Change**: `buzz-relay-module`
**Verified at**: `YYYY-MM-DD HH:mm`
**Verifier**: `<who / which agent>`

---

## 1. Structural Validation (`openspec validate --all --json`)

- [ ] All items report `"valid": true`

**Result**:

```text
<paste a summary of the openspec validate --all output>
```

If any items fail, list their id and issues:

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [ ] All `- [ ]` have been changed to `- [x]`

**Incomplete tasks** (if any):

| Task | Reason incomplete | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

For each delta spec file reported by the CLI
(`openspec status --change "buzz-relay-module" --json | jq -r '.artifactPaths.specs.existingOutputPaths[]'`),
compare against the corresponding main capability spec:

| Capability | Sync status | Notes |
|---|---|---|
| buzz-relay | synced / pending sync / N/A | — |

---

## 4. Design / Specs Coherence Spot Check

Spot-check whether the decisions in `design.md` are reflected in the Requirements and
Scenarios of `specs/*.md`:

| Sampled item | design description | specs correspondence | Gap |
|---|---|---|---|
| — | — | — | — |

**Drift warnings** (non-blocking):

- <if any, list them; if none, write "none">

---

## 5. Implementation Signal

- [ ] No unstaged files in the worktree
- [ ] All related commits have been pushed

**Commit range** (if known): `<from-sha>..<to-sha>`

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

Design output should not land in `docs/superpowers/specs/`.

Detect:

```bash
ls docs/superpowers/specs/*.md 2>/dev/null
```

- [ ] No files, or any existing files are legitimate residue from before schema installation

**Leak list** (if any):

| File | Content captured into change? | Recommended action |
|---|---|---|
| — | — | — |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

For each manual dogfood / smoke task in plan.md marked `[~]` deferred, list the
equivalent automated test coverage item by item.

| Deferred dogfood (plan §) | Equivalent automated test | Coverage assessment | Real gap? |
|---|---|---|---|
| — | — | — | — |

> When plan.md has no rows marked `[~]`, this section may be left blank (blank means PASS).

---

## Overall Decision

- [ ] (pass) PASS — may proceed to finishing-a-development-branch and archive
- [ ] (warn) PASS WITH WARNINGS — may proceed but note: `<explanation>`
- [ ] (fail) FAIL — return to the failed artifact, correct it, then re-run verify

**Next step**:

<describe the next action>
