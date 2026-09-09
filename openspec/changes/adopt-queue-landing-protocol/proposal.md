---
linear_story_id: a82c03a8-7364-4fcd-9b9a-1ce5fe78eb22
linear_story_identifier: CAM-65
linear_story_title: "Adopt the queue landing protocol"
linear_story_url: https://linear.app/cameronraysmith/issue/CAM-65/adopt-the-queue-landing-protocol
linear_story_state: Todo
linear_team: CAM
linear_project: nixbot-herculesci-cicd
last_synced_state: Todo
last_synced_at: 2026-09-09T18:09:11Z
review_round: 0
max_review_rounds: 3
attempt_log:
  - { at: "2026-09-09T18:09:11Z", transition: "Backlog->Todo", outcome: "posted", note: "Issue created in CAM and project 82a27ad740f7, moved to Todo, one comment posted; binding and state confirmed by read-only API" }
---

# Adopt the queue landing protocol

## Why

Agent-facing guidance still sends authors to `stack-land` or Mergify's server queue, while the revised landing ADR assigns landing to gitea-mq.
The new service is active but manages zero repositories because its App is deliberately not installed.
Updating and delivering the guidance before installation prevents agents from bypassing the queue or waiting on a retired path.
Authors can then authorize a change and resume other work while the queue tests and lands it.

## What Changes

### One authorization procedure

- From: workers return refs, orchestrators perform synchronous landing, and several skills describe Mergify's server queue as the terminal step.
- To: a first-party policy owner documents risk-based review timing, shape-specific authorization, cache warming, and asynchronous rejection; each caller points to that owner.
- Reason: ordinary PRs and registered stacks need different enqueue signals, and the signal itself authorizes a review-blind queue to merge.
- Impact: **BREAKING** for agents following the old terminal steps; stack-member auto-merge is prohibited, and approving-review rules are not described as enforcement of E1.

### Preserve authoring and source ownership

- From: first-party guidance delegates mechanism details to the upstream `mergify-stack` skill and preserves jj local-work contracts.
- To: that separation remains, with explicit first-party native-registration, branch-prefix, and landed-stack overrides; verified worker refs remain the handoff.
- Reason: the upstream skill cannot carry fleet-specific policy, and changing the landing verb does not require changing local history management.
- Impact: eleven first-party instruction or skill files change; upstream files remain untouched and generated outputs are rebuilt from sources.

### Coordinate retirement of the old landing paths

- From: `.github/mergify.yml` defines two server queues and `stack-land` can push the target branch.
- To: instructions and skills land before App installation; Mergify queue removal occurs in the installation window; `stack-land` remains available only for dry-run assertions.
- Reason: Mergify remains the working queue until cutover, and retaining a push fallback would bypass the adopted protocol.
- Impact: **BREAKING** for real `stack-land` invocations; unrelated Mergify assignment and review behavior remains.

### Audit architectural commitments

Audit all formal ADRs for commitments to Mergify's server queue or buildbot as the landing gate.
Record the count and every hit; any conflicting commitment requires explicit supersession.
The planning audit found no such commitment in 21 numbered ADRs plus their index.

## Capabilities

### New Capabilities

- `machine-interface` (stratum: `interface`): assertion-only `stack-land` and the staged Mergify queue-configuration transition.
  Trust boundary: command traces, exit status, configuration bytes, and recorded cutover evidence can be checked; they do not prove operator timing, forge enforcement, or successful landing.

### Modified Capabilities

- `first-party-skill-distribution` (stratum: `interface`): require source-owned queue-policy edits to reach the rebuilt corpus while keeping first-party and upstream skills distinct.
  Trust boundary: rebuilt output establishes available bytes, not which skill a harness loads or whether an author follows it.
- `skill-corpus-interface` (stratum: `interface`): replace the synchronous landing contract with one canonical authorization procedure and individual routes from every scoped caller, preserving local VCS and worker handoffs.
  Trust boundary: documents establish visible instructions and declared policy only; E1 review ordering, risk judgment, registration, and queue behavior remain external.
- `third-party-plugin-dependency` (stratum: `interface`): expose first-party overrides for native registration, branch naming, and landed-stack reuse without modifying upstream `mergify-stack`.
  Trust boundary: ownership and delivered override text can be checked; upstream correctness and GitHub bookkeeping cannot be established by composition.

## Impact

The authored paths are under `modules/home/ai/plugins/`, plus `.github/mergify.yml` and the existing `pkgs/by-name/stack-land/` package, script, and tests.
`tasks.md` identifies every document separately and verifies delivery through `pkgs/by-name/apm-skills-compose/`, `modules/home/ai/skills/`, and generated agent context.
Do not edit delivered `~/.claude/skills` symlinks or generated agent-context text directly.

This change carries ADR Appendix A R15/R16 and Appendix B.
Service, App, rulesets, database, and proxy work remain in `stand-up-gitea-mq-on-magnetite` (R11/R13/R14).
Source filtering and cache-warming implementation remain in `filter-check-sources-for-substitution` (R1/R2); only the existing author-facing invocation is routed here.
No new queue service, orchestration rollup, upstream patch, deployment, or source-filter implementation is included.
