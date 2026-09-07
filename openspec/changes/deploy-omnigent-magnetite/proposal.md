---
execution_mode: HIL
linear_story_id: "611390e3-ea60-4171-8c43-893070437f21"
linear_story_identifier: CAM-57
linear_story_title: Deploy Omnigent on magnetite
linear_story_url: https://linear.app/cameronraysmith/issue/CAM-57/deploy-omnigent-on-magnetite
linear_story_state: Todo
linear_team: CAM
linear_project: omnigent-magnetite
last_synced_state: Todo
last_synced_at: "2026-09-07T21:45:11Z"
review_round: 0
attempt_log:
  - at: "2026-09-07T21:45:11Z"
    transition: Backlog->Todo
    outcome: posted
    note: Created the requested project and story, seeded the business description, confirmed Todo by API readback, and posted the binding comment.
---

## Why

Omnigent needs a reproducible deployment on magnetite so the operator can use the existing Kanidm identity from a laptop and Android app and run an Atomic session on an always-on runner.
The existing research and deployment plan establish the approach, but the host environment, admission policy, and operational access instructions need the S0 corrections before packaging and deployment.

## What Changes

- S0, amend-plan: reconcile the deployment plan and Kanidm access runbook with the supplied corrections and bind this change to one CAM story in the new omnigent-magnetite project.
- S1, package: package the released Omnigent 0.12.0 wheel for Nix and verify the Linux CLI.
- S2, server: configure the server, shared PostgreSQL 16 database, confidential Kanidm sign-in, secret delivery, and HTTPS ingress while retaining existing services.
- S3, host-clan: configure one foreground runner and bind both server and host roles to magnetite through clan, with Atomic available beside Pi.
- S4, deploy and accept: after the controller's gates and operator confirmations, generate the two secrets, apply only the intended DNS addition, activate the pinned source, and collect live observations and human acceptance responses.

The endpoint is `https://omni.scientistexperience.net`.
Kanidm group `omnigent_users` gates admission; `OMNIGENT_OIDC_ALLOWED_DOMAINS` stays unset and the administrator roster names `cameron.ray.smith@gmail.com`.
The laptop and shipped mobile WebView clients use the same confidential client through the server's login flow.

## Capabilities

### New Capabilities

- `omnigent-deployment-interface` [interface]: the deployed package, configuration, authentication endpoints, foreground runner environment, pinned activation, and distinction between tool observations and human acceptance.

The trust boundary includes Nix evaluation and builds, the activated service configuration, HTTP responses, and recorded operator responses.
It does not establish the truth of a person's email independently of Kanidm administration, prove browser or passkey platform behavior, or provide an end-to-end isolation guarantee.
Native sessions initially run as `cameron` without sandbox enforcement; adding `/nix/store` to sandbox `read_paths` also weakens isolation.

### Modified Capabilities

None.

## Impact

S0 owns `docs/notes/development/omnigent/`, `packages/docs/src/content/docs/development/operations/identity/kanidm.md`, this change directory, and the additive project entry in `openspec/linear.yaml`.
S1 owns `pkgs/by-name/omnigent/`.
S2 owns `modules/nixos/omnigent.nix`, `modules/nixos/kanidm.nix`, and `modules/terranix/cloudflare.nix`.
S3 owns `modules/nixos/omnigent-host.nix`, `modules/clan/services/omnigent/`, and `modules/clan/inventory/services/omnigent.nix`.
S4 is controller-owned and additionally produces the two generator directories under `vars/per-machine/magnetite/`, DNS state, activation observations, and private operator state.
No new flake input, additional runner rollout, dedicated-user migration, backup system, monitoring system, or Buzz replacement is included.

## Contract and readiness

The current S0–S3 contracts are `slice-0.json` through `slice-3.json` under `.atomic/workflows/runs/deploy-omnigent/omnigent-magnetite/d0064db1-3756-4e49-ae30-e03f23ca0bd7/`.
This run reuses the existing CAM-57 binding recorded above; its timestamp records the earlier binding operation, not a fresh remote readback.
Those acceptance lists and deterministic gates remain unchanged; `tasks.md` is the HIL task ledger, not a replacement gate implementation.
The current S1–S3 gates use `__OMNIGENT_SOURCE__` instead of the previous run's working-copy source; the controller supplies that source, and this writer neither substitutes a guessed revision nor edits those gates.
S4 has no slice JSON in the supplied evidence.
Its sequence is recorded from the `input.deploy` branch in `.atomic/workflows/deploy-omnigent.ts`, the deployment helpers, and the `checklist` in `.atomic/workflows/omnigent/types.ts`.

The plan at commit `46be61b3e`, dated 2026-09-06, predates the supplied S0 corrections: its fork citations, unresolved admission values, and old inventory filename must not override the explicit slice contract.
The later research also examines development revisions rather than only the packaged release; release compatibility remains an implementation obligation, not a claim established by these tracking files.

This stage creates planning and tracking records only.
All tasks remain unchecked until the controller accepts their evidence; no implementation, remote operation, or deployment is authorized by file existence.
The selected schema is `superpowers-bridge-wrspm`.
Full fast-forward readiness additionally requires its brainstorm, design, and implementation-plan artifacts; this binding stage does not fabricate a raw brainstorming capture or human approval.
