# Two-phase migration pattern

This reference documents the migration recipe from hand-crafted CI workflows to nix-native CI, using the ironstar repository migration as the canonical template.
The pattern is designed so that each phase independently delivers value and the repository remains fully functional between phases.
The buildbot/Mergify landing examples describe that legacy migration, outside the adopted queue-managed GitHub protocol.
For those managed repositories, external handoff follows `git-stacked-pr-integration` §Queue authorization, including its installation hold.
Vanixiets retains its working Mergify queues until the coordinated installation window; the migration examples below do not define its current checks or future queue gate.


## Canonical commits

Four commits from the ironstar migration demonstrate the complete pattern.
These commits are referenceable as concrete examples of each transformation step.

`1871bb3` is the phase 1 promotion commit.
It replaces the categorized CI matrix dispatch with a single nix-fast-build invocation.
The `ci-build-category.sh` script and its associated matrix strategy are removed.
A new workflow step invokes `nix-fast-build --flake ".#checks.$(nix eval --impure --raw --expr 'builtins.currentSystem')" --skip-cached --no-nom --result-format junit > results.xml`.
JUnit results are uploaded as a workflow artifact for CI dashboard rendering.

`6229dba` is the archival commit.
Deprecated CI artifacts (the old `ci-build-category.sh` script, the superseded workflow definitions, any helper scripts that existed solely for the categorized dispatch) are moved to `.github/deprecated/`.
This preserves git history for reference while removing the dead code from the active workflow directory.

`5d1a3e4` is the phase 2 transition commit.
In that historical migration, it adds `buildbot-nix.toml`, configures Mergify to gate on `buildbot/nix-eval` and `buildbot/nix-build`, and converts the GitHub Actions nix-check job to a buildbot-results passthrough.
The `build-with-buildbot` topic is added to the repository's GitHub settings.

`32bbb2a` is the final cleanup commit.
With buildbot-nix confirmed operational and merge gating validated, the passthrough nix-check job in GitHub Actions is removed entirely.
Only CD workflows and platform-specific checks remain.


## Phase 1 transformation details

The `ci-build-category.sh` script is the artifact that phase 1 eliminates.
This script partitions flake outputs into categories (packages, checks, devshells, home configurations, NixOS configurations by machine name) and produces a JSON matrix for GitHub Actions.
Each matrix entry becomes a separate GHA job that runs `nix build .#category.system.name`.

This hand-crafted build graph is exactly what nix-eval-jobs produces automatically from flake attribute paths.
nix-eval-jobs traverses the flake's output tree, discovers every derivation, and produces metadata that nix-fast-build uses to schedule parallel builds.
The category names, the system enumeration, and the per-attribute dispatch are all implicit in the flake structure.

The replacement is a single GitHub Actions job:

```yaml
- name: nix-fast-build
  run: |
    nix-fast-build \
      --flake ".#checks.$(nix eval --impure --raw --expr 'builtins.currentSystem')" \
      --skip-cached \
      --no-nom \
      --eval-workers 4 \
      --result-format junit > results.xml
- name: upload results
  uses: actions/upload-artifact@v4
  with:
    name: junit-results
    path: results.xml
```

The `--eval-workers 4` flag reduces SQLite eval-cache contention.
The system expression `$(nix eval --impure --raw --expr 'builtins.currentSystem')` resolves to the runner's architecture, which matches what the categorized script did implicitly.


## Phase 2 delegation details

Phase 2 requires a running buildbot-nix instance with access to the repository's forge (GitHub or Gitea).
The readiness gate is confirming that the repository appears in the buildbot project list after adding the `build-with-buildbot` topic.

The `buildbot-nix.toml` file scopes evaluation:

```toml
attribute = "checks.x86_64-linux"
```

For repositories that target only one system, this prevents evaluation failures from cross-system attributes that the worker cannot build.
Multi-system repositories may omit `attribute` or scope to multiple systems if workers for each system are available.

The legacy migration used the following Mergify gate on buildbot results.
It applies outside the adopted queue protocol; current authorization for queue-managed GitHub repositories follows `git-stacked-pr-integration` §Queue authorization.

```yaml
pull_request_rules:
  - name: merge when checks pass
    conditions:
      - check-success=buildbot/nix-eval
      - check-success=buildbot/nix-build
      - check-success=check-fast-forward
    actions:
      merge:
        method: merge
```

In that legacy configuration, remaining GitHub Actions checks were listed alongside buildbot checks in the Mergify conditions.


## What stays in GitHub Actions

Certain workflows remain in GitHub Actions regardless of buildbot-nix delegation because they are either platform-specific or not expressible as nix checks.

CD workflows (deploy, release, publish) use platform-native effects that interact with GitHub APIs, container registries, or external services.
These are discussed in the SKILL.md effect execution strategies section.

The historical fast-forward check verifies that a PR can land without a merge commit; it is not the adopted queue's landing gate.
This is a git operation, not a nix check.

Flake.lock update automation (renovate, dependabot, or custom workflows) creates update PRs on a schedule.
The update itself is a git operation; buildbot-nix validates the updated flake via its normal push-triggered evaluation.

Issue and PR labeling, triage automation, and notification workflows are CI platform features with no nix equivalent.

Container image workflows need build/push separation when migrating.
The *build* phase (constructing the OCI image as a nix derivation) becomes a flake check.
The *push* phase (uploading to a registry) remains a platform-native effect or becomes a nix-native effect depending on the effect strategy decision.


## Per-repo variation guidance

nix-darwin repositories may define `checks.aarch64-darwin` attributes that buildbot-nix workers (typically `x86_64-linux`) cannot build.
The `attribute` scoping in `buildbot-nix.toml` must account for this.
Options include: scoping to the buildable system, adding aarch64-darwin workers, or retaining a GitHub Actions job for darwin-specific checks alongside buildbot for linux checks.

Container image repositories need build/push separation.
The pure build (producing a store path containing the OCI image layers) is a check.
The impure push (authenticating to a registry and uploading layers) is an effect.
Phase 1 can migrate the build to nix-fast-build while leaving the push in GitHub Actions.
Phase 2 can optionally migrate the push to a nix-native effect.

Polyglot repositories (Rust+Python, TypeScript+Python) may have language-specific CI that migrates at different rates.
Rust checks often migrate cleanly because crane provides comprehensive nix integration.
Python checks using uv2nix migrate next.
Language-specific checks that depend on non-nix tooling (browser-based E2E with playwright, language server tests) may be the last to migrate or may remain in GitHub Actions permanently.


## Execution order across repositories

Start the migration with the most complex repository in the fleet.
The complex case exercises the full pattern: categorized dispatch replacement, multi-category check migration, effect separation, and cache strategy.
If the pattern works for the complex case, simpler repositories follow as straightforward applications.

The dogfooding consideration also favors starting with the infrastructure repository.
When the repository that defines the buildbot-nix configuration is itself built by buildbot-nix, the migration validates the entire pipeline end-to-end.

Template repositories and library repositories with simple check surfaces migrate last.
Their CI is typically a single `nix flake check` invocation that gains little from nix-fast-build parallelism, though the binary cache integration still provides value.
