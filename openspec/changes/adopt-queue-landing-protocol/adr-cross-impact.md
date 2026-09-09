# ADR cross-impact audit

This record is for the operator reviewing the queue-protocol instruction change.
The audit on 2026-09-09 covered `packages/docs/src/content/docs/development/architecture/adrs/` only.

## Inventory

`Path.glob('[0-9][0-9][0-9][0-9]-*.md')` enumerated 21 numbered ADRs; `Path.glob('index.md')` enumerated one index.
The complete file set, relative to that directory, was:

```text
0001-claude-code-multi-profile-system.md
0002-use-generic-just-recipes.md
0004-monorepo-structure.md
0005-semantic-versioning.md
0006-monorepo-tag-strategy.md
0007-bun-workspaces.md
0008-typescript-configuration.md
0009-nix-development-environment.md
0010-testing-architecture.md
0011-sops-secrets-management.md
0012-github-actions-pipeline.md
0013-cloudflare-workers-deployment.md
0014-design-principles.md
0016-per-job-content-addressed-caching.md
0017-deferred-module-composition-overlay-patterns.md
0018-deferred-module-composition-architecture.md
0019-clan-core-orchestration.md
0020-deferred-module-composition-clan-integration.md
0021-terranix-infrastructure-provisioning.md
0022-committed-per-repository-agent-context.md
0023-modular-agent-context-fragments.md
index.md
```

## Search and inspection

Both commands searched the complete directory, including the index, case-insensitively:

```sh
rg -i --no-line-number 'mergify|buildbot|queue|landing' packages/docs/src/content/docs/development/architecture/adrs/
rg -i --no-line-number 'stack-land|auto-merge|fast-forward|mergify|buildbot|queue|landing' packages/docs/src/content/docs/development/architecture/adrs/
```

Each command produced no output and exited 1 (no matches).
Matching files: 0; matching passages: 0; conflicting landing commitments found: 0.
There are no matching decision or consequence sections to list.

Inspection of `0012-github-actions-pipeline.md` §Decision and §Consequences found GitHub Actions workflow and artifact-reuse commitments.
Inspection of `0016-per-job-content-addressed-caching.md` §Decision and §Consequences found per-job caching through GitHub Checks API and subsequent caching evolution.
Neither commits to Mergify's server queue or buildbot as a landing gate.
No supersession proposal or operator decision is required by this scoped result.
This audit does not reconcile every historical CI choice or exclude implicit commitments that the search terms missed.
