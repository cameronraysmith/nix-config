# Brainstorm: filter check sources for substitution

## Classification

This request is architectural rather than bounded.
It adds a new invariant over every `checks.*` derivation, a mechanism to assert it, and edits in three module subtrees rather than one existing flow.
The decision chain below was settled from the ADR `docs/notes/development/version-control/adr-substitution-first-rollup-landing.md`, its review memo, and measurements taken in this working copy on 2026-09-07; the questions a live brainstorming dialogue would have asked are answered from those sources and the dispatching brief, and each answer names where it came from.

## Background

The ADR lands rollups by building a stack tip once on `staging` and letting nix substitute every derivation an author already built with `just check-fast push=on`.
That property holds only when each check's derivation hash depends on the files the check reads.
A check whose input closure contains the whole flake source rehashes on every commit, so nothing an author pushed to niks3 is ever reused for it.
The review memo's WRSPM table classifies R5 (every `checks.*` derivation depends only on its own filtered source) as machine: flake/repo, testable by derivation-hash stability, and this change owns R5 together with the first automated Compliance item in the ADR.
`modules/lib/mk-structural-check.nix` already states the architectural goal for structural checks: cache invalidation tracks the assertion target, not `inputs.self`.

## Q1: Which checks depend on the whole flake source today?

Measured, not assumed.
The probe evaluated every check's `drvPath` (`nix eval .#checks.<system> --apply 'cs: builtins.mapAttrs (_: c: c.drvPath) cs'`), then asked the local store for each derivation's transitive input closure (`nix-store -q --requisites <drv>`) and looked for the flake source store path (`nix flake metadata --json | jq -r .path`, the `-source` path that `self.outPath` names).
A derivation whose closure contains that path rehashes on any tracked-file change, because the source path's hash covers the whole tree.

On aarch64-darwin, 17 of 122 checks contain the source path; on x86_64-linux, 19 of 128.
They fall into three groups.

Direct references written in `modules/checks/`: `gitleaks` (`modules/checks/security.nix`, `src = self`); `treefmt` (treefmt-nix's `checks.treefmt` is `config.treefmt.build.check config.treefmt.projectRoot`, and `projectRoot` defaults to `self` in `flake-module.nix`); and five checks in `modules/checks/validation.nix` that interpolate `${self}` into their build scripts: `vars-user-password-validation` (`${self}/vars/shared/user-password-cameron`), `secrets-tier-separation` (`${self}/vars`, `${self}/secrets`), `secrets-encryption-integrity` (`${self}/vars`, `${self}/secrets`), `machine-registry-completeness` (`${self}/modules/machines/darwin`, `${self}/modules/machines/nixos`), and `secrets-sops-roundtrip` (`${self}/.sops.yaml`).

Transitive references through the system and home closures: `darwin-argentum`, `darwin-blackphos`, `darwin-rosegold`, `darwin-stibnite`, `nixos-cinnabar`, `nixos-electrum`, `nixos-galena`, `nixos-magnetite`, `nixos-pyrite`, and `home-manager-{cameron,christophersmith,crs58,janettesmith,raquel,tara,ubuntu}`.
Intersecting each closure with `nix-store -q --referrers <source>` found exactly two carrier derivations per configuration: the sops-nix `manifest.json`, whose `sopsFile` entries are `flake.inputs.self + "/secrets/home-manager/users/<user>/secrets.yaml"` in `modules/home/users/<user>/default.nix` and `inputs.self + "/secrets/bridge/..."` in `modules/nixos/hm-sops-bridge.nix`, and `home-manager-files`, which links `flake.inputs.self + "/modules/home/ai/openspec/assets"` from `modules/home/ai/openspec/default.nix`.
Adding a string to a flake input coerces the whole source to a store path and appends a suffix, so the resulting string carries the whole tree as its context.

No third group exists: the remaining 105 (darwin) and 109 (linux) checks are already isolated, most of them through `mkStructuralCheck`'s JSON-in-`passAsFile` design or through `pkgs/by-name` packages that use `lib.fileset.toSource` (`pkgs/by-name/vanixiets-docs/package.nix`).

## Q2: Which of these can be filtered, and which are legitimately whole-tree?

`gitleaks` scans every file for leaked credentials; the check taxonomy in `preferences-nix-checks-architecture` accepts its full-tree invalidation because a false negative is severe.
It stays on the whole tree and is the one allow-listed check.

`treefmt` reads only files an enabled formatter includes; today that is nixfmt over `*.nix`.
It can be filtered by setting `treefmt.projectRoot` to a `lib.fileset.toSource` of the files the enabled formatters' `includes` globs select, plus `flake.nix` as `projectRootFile`.
The coupling risk is a formatter enabled later without the filter following; the filter therefore derives from `config.treefmt.settings.formatter.<name>.includes` rather than from a hand-written list, and aborts evaluation on an include pattern it cannot translate.

The five `validation.nix` checks each read a named subtree; each gets its own `lib.fileset.toSource` over exactly that subtree, following the root-relative pattern already used in `pkgs/by-name/vanixiets-docs/package.nix`.

The sops and openspec-assets coercions become path literals relative to the module file (`../../../../secrets/home-manager/users/<user>/secrets.yaml`, `./assets`).
A path literal inside the flake tree is copied into the store as its own path, hashed by its own content, so the manifest and the home files stop carrying the whole tree.

## Q3: How is the property asserted, given what nix permits?

Three mechanisms were tried in this working copy.

An eval-time transitive walk (`builtins.readFile` on each `.drv` path, closed under `builtins.genericClosure`) reproduced the 17-check result exactly under `--impure` in 5m37s for all aarch64-darwin checks, but pure evaluation refuses `readFile` on a store path with no string context ("access to absolute path ... is forbidden in pure evaluation mode"), and `builtins.storePath` is likewise disallowed.
Flake evaluation is pure, so this mechanism cannot be a flake check.

A build-time `exportReferencesGraph` over `builtins.unsafeDiscardOutputDependency check.drvPath` failed with "path '/nix/store/...-cargo-check-hook.sh' is not valid": the closure computation requires every input source in the closure to be a valid local store path, which substituted builds do not guarantee.

An eval-time direct-reference check is pure-mode compatible: `builtins.getContext (builtins.toJSON drv.drvAttrs)` lists exactly the store paths a derivation's own attributes reference, and the whole-tree source path appears there for every direct offender.
It cannot see the transitive group.

The decision is a split with the boundary stated.
The flake check `structure-check-source-isolation` asserts, at evaluation time, that the flake source path appears among the direct references of no `checks.<system>.*` derivation outside the allow-list, with a negative-control sibling that proves the classifier distinguishes a `src = self` fixture from a filtered one.
A script probe, `scripts/check-source-audit.sh` behind `just check-source-audit`, performs the transitive `nix-store -q --requisites` audit against the same allow-list and exits nonzero on drift; it is the mechanism that produced the audit above and the only one that reaches the system and home closures.
The design records why neither mechanism alone is enough.

## Q4: What is out of scope?

gitea-mq deployment, the landing protocol, nixbot configuration, `landing.toml`, and every other Appendix A line are other changes.
A nixbot cancel-on-merged-close improvement was considered while reading `service.py::CIService._submit_pr_closed` and is recorded as a discussion point in the design only; no upstream filing will be made anywhere in this work, per the maintainer's instruction.

## Trust boundaries

The flake check establishes absence of direct whole-tree references in check derivations at the evaluation boundary.
The probe establishes absence in the transitive closure as recorded in one local store at one revision.
Neither establishes that a filtered source contains every file the check reads, that the substituter holds the author's outputs, or that nixbot's evaluation classifies a derivation as cached.
