---
linear_story_id: d0523c51-0b62-40bb-822d-079e49b5c6dc
linear_story_identifier: CAM-58
linear_story_title: "Filter flake check sources so rollup builds substitute authors' work"
linear_story_url: https://linear.app/cameronraysmith/issue/CAM-58/filter-flake-check-sources-so-rollup-builds-substitute-authors-work
linear_story_state: Todo
linear_team: CAM
linear_project: nixbot-herculesci-cicd
last_synced_state: Todo
last_synced_at: 2026-09-07T21:48:23Z
review_round: 0
max_review_rounds: 3
attempt_log:
  - { at: "2026-09-07T21:48:23Z", transition: "Backlog->Todo", outcome: "posted", note: "T1 bind; CAM-58 created in team CAM, project nixbot-herculesci-cicd, description seeded from this proposal, one bind comment posted" }
---

## Why

Seventeen of the 122 aarch64-darwin flake checks, and nineteen of the 128 x86_64-linux ones, carry the whole flake source in their derivation closure, so any tracked-file change rehashes them and nothing an author built and pushed with `just check-fast push=on` is substituted for them in CI.
The substitution-first rollup landing ADR depends on the opposite property (its R5) before gitea-mq and nixbot can reduce a rollup build to interaction derivations, and no check today asserts it, so the property would silently regress even once fixed.
Filtering each check to the files it reads, allow-listing the one whole-tree scan, and asserting the result gives every later landing change a stable foundation and cuts the CI work per rollup to what no author could have built alone.

## What Changes

**Check source isolation**

- From: `gitleaks` uses `src = self`; `treefmt` formats `self` through treefmt-nix's `projectRoot` default; five checks in `modules/checks/validation.nix` interpolate `${self}/vars`, `${self}/secrets`, `${self}/modules/machines/...`, and `${self}/.sops.yaml` into their scripts; and every `darwin-*`, `nixos-*`, and `home-manager-*` toplevel check carries the source through sops-nix `sopsFile` paths written as `inputs.self + "/secrets/..."` and the openspec `assetsDir` written as `flake.inputs.self + "/modules/home/ai/openspec/assets"`.
- To: each filterable check reads a `lib.fileset.toSource` over exactly the subtree it inspects; treefmt's `projectRoot` is a fileset derived from the enabled formatters' `includes`; the sops and openspec coercions become path literals relative to their module files; `gitleaks` remains whole-tree and is the sole entry in a declared allow-list.
- Reason: a derivation whose input closure contains the whole tree cannot be substituted across unrelated commits, which is the premise of substitution-first landing.
- Impact: derivation hashes of the affected checks change once; behaviour of every check is unchanged.
  Home and system toplevel hashes change once because the manifest and home-files derivations now reference single-file store paths.

**Assertion of the property**

- From: no check or probe observes which check derivations reference the flake source.
- To: a structural flake check, `structure-check-source-isolation`, fails evaluation-derived diff when the flake source path appears among the direct references of any `checks.<system>.*` derivation outside the allow-list, with a negative-control sibling; a script probe, `just check-source-audit`, performs the transitive closure audit through the local store and exits nonzero on drift from the same allow-list.
- Reason: pure evaluation cannot read derivation files, so the transitive property is observable only outside evaluation; direct references are observable inside it.
  The design states why each mechanism is needed and what each cannot see.
- Impact: additive; one new structural check pair and one recipe.

## Capabilities

### New Capabilities

- `check-source-isolation` (`interface`): which store paths a flake check's derivation may reference, the whole-tree allow-list, the evaluation-time assertion over direct references, and the store-side probe over transitive references.
  Trust boundary: the assertion establishes absence of direct whole-tree references at evaluation time and the probe establishes absence in the transitive closure of one local store at one revision; neither establishes that a filtered source contains every file its check reads, that a substituter holds the author's outputs, or that a build service classifies a derivation as cached.

### Modified Capabilities

- `world-assumptions` (`world`): add A22, that a nix derivation's identity is a function of its transitive input closure and that a store path whose content covers the whole tree changes whenever any tracked file changes, and A23, that a path literal or `lib.fileset.toSource` inside a flake produces a store path hashed from the selected content alone.
  Both are indicative facts about nix on which the `check-source-isolation` requirements rest, each with the violation scenario that voids it.

## Impact

- Modify `modules/checks/security.nix` only to mark `gitleaks` as the allow-listed whole-tree scan; its `src = self` stays.
- Modify `modules/formatting.nix` to set `treefmt.projectRoot` from the enabled formatters' `includes` globs.
- Modify `modules/checks/validation.nix` so `vars-user-password-validation`, `secrets-tier-separation`, `secrets-encryption-integrity`, `machine-registry-completeness`, and `secrets-sops-roundtrip` each read a `lib.fileset.toSource` over their own subtree.
- Modify `modules/home/users/{christophersmith,crs58,janettesmith,raquel,tara,ubuntu}/default.nix`, `modules/nixos/hm-sops-bridge.nix`, and `modules/home/ai/openspec/default.nix` to replace `inputs.self + "/..."` coercions with path literals.
- Add `modules/checks/structure/check-source-isolation.nix` registering `structure-check-source-isolation` and `structure-check-source-isolation-neg`, and holding the allow-list.
- Add `scripts/check-source-audit.sh` and a `check-source-audit` recipe in the `justfile`.
- Exclude gitea-mq, the landing protocol, nixbot configuration, `landing.toml`, every other Appendix A requirement of the ADR, and any upstream filing.
