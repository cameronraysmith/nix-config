## Context

The substitution-first rollup landing ADR (`docs/notes/development/version-control/adr-substitution-first-rollup-landing.md`) builds a stack tip once on `staging` and relies on nix substituting every derivation an author already built with `just check-fast push=on`.
The `check-fast` recipe in the `justfile` runs `nix-fast-build --skip-cached --flake .#checks.$system`, and `push=on` adds `--niks3-server https://niks3.scientistexperience.net`; nix-fast-build's `workers.py::run_evaluation` skips only jobs whose `cacheStatus` is exactly `"cached"` and builds everything else (`logs/adr-verify/nix-fast-build.md`, C1).
A derivation is `cached` only when its hash matches an output in the substituter, and its hash is a function of its transitive input closure.
A check whose closure contains the whole flake source therefore never matches across commits, and the author's upload is wasted for it.

The review memo (`adr-substitution-first-rollup-landing-review.md`, WRSPM table) assigns R5 to the machine: flake/repo stratum and this change owns it, together with the first automated Compliance item.
`modules/lib/mk-structural-check.nix` already documents the intended design for structural checks: JSON inputs through `passAsFile` so that invalidation tracks the assertion target rather than `inputs.self`.
The audit in brainstorm.md found 17 of 122 aarch64-darwin checks and 19 of 128 x86_64-linux checks outside that discipline, in three groups: direct `self` references in `modules/checks/`, treefmt-nix's `projectRoot` default, and transitive references carried into every system and home toplevel by sops-nix `sopsFile` strings and the openspec `assetsDir`.

Two boundaries recur in the decisions.
The first is source-versus-delivered: a check that reads `${self}/vars` is inspecting the delivered store copy of the source, and the fix changes which store path is delivered to it, not what it reads.
The second is vendored-versus-first-party: treefmt-nix, sops-nix, and nix itself are upstream, and every decision below changes only first-party configuration of them.

## Goals / Non-Goals

**Goals:**

- Every `checks.<system>.*` derivation outside a declared allow-list has a transitive input closure that excludes the flake source store path, on both aarch64-darwin and x86_64-linux.
- The allow-list is a single declared value with a stated reason per entry, holding only `gitleaks`.
- A flake check fails when a check derivation outside the allow-list directly references the flake source, and a negative control proves the classifier can fail.
- A repository probe reports the transitive property against the local store and exits nonzero on drift, and it is the tool that produced the audit.
- Behaviour of every existing check is unchanged; only their input closures shrink.

**Non-Goals:**

- gitea-mq, `landing.toml`, the landing protocol, nixbot configuration, `effects_branches`, and every Appendix A requirement other than R5.
- Measuring cache hit rates in nixbot or niks3; V4 and V5 of the ADR remain manual verification items of a later change.
- Restructuring `modules/checks/validation.nix`, which is 716 lines; the edits stay inside the five affected check bodies.
- Any change to the upstream projects, including the nixbot behaviour recorded under Discussion below.

## Decisions

### D1: The property is asserted at two boundaries, because nix permits neither alone to cover both

- **Boundary**: source-versus-delivered; the property is about which delivered store paths a derivation references.
- **Choice**: an evaluation-time flake check over direct references, plus a store-side script probe over the transitive closure.
- **Rationale**: three mechanisms were exercised in this working copy on 2026-09-07 and only this split is both truthful and pure-mode compatible.
- **Alternatives considered**: an evaluation-time transitive walk, rejected because pure evaluation forbids it; a build-time `exportReferencesGraph`, rejected because it needs every input source in the closure to be valid locally.

The evaluation-time transitive walk read each `.drv` file with `builtins.readFile` after `builtins.unsafeDiscardOutputDependency` and closed the graph with `builtins.genericClosure`.
Under `--impure` it reproduced the 17-check audit exactly and took 5m37s for all aarch64-darwin checks.
Under pure evaluation, which every flake evaluation and nix-eval-jobs run uses, `readFile` on a store path string without context fails with "access to absolute path ... is forbidden in pure evaluation mode", and `builtins.storePath` is refused outright; keeping the drv's own context on the string does not lift the restriction.

The build-time variant put `builtins.unsafeDiscardOutputDependency check.drvPath` into `exportReferencesGraph` of a `runCommand`.
It failed before building with "path '/nix/store/...-cargo-check-hook.sh' is not valid", because the closure computation queries every path in the graph and an input source that was never materialised locally (substituted builds do not bring input sources) is invalid.
A mechanism whose result depends on which sources happen to be valid in the builder's store is not an assertion.

What pure evaluation does permit is `builtins.getContext (builtins.toJSON drv.drvAttrs)`: the string context of a derivation's own attributes is exactly the set of store paths and input derivations it references directly.
Applied to every aarch64-darwin check it returns precisely the seven direct offenders and none of the toplevels.
Direct references are where a check author writes `src = self` or `${self}/...`, so this covers every regression that can be introduced in `modules/checks/`.
The transitive group is reachable only through the store, so the probe runs `nix-store -q --requisites` over the same derivation set outside evaluation.

### D2: The flake check is a structural check pair reading the whole per-system check set

- **Boundary**: first-party; the check is a `mkStructuralCheck` like its siblings in `modules/checks/structure/`.
- **Choice**: `modules/checks/structure/check-source-isolation.nix` computes `actual` as the sorted names of `self'.checks` whose direct references contain `builtins.unsafeDiscardStringContext self.outPath`, sets `expected` to the allow-list, and registers `structure-check-source-isolation`; a sibling `structure-check-source-isolation-neg` runs the same classifier over two fixtures, a `runCommand` with `src = self` and one with `src = lib.fileset.toSource { root = ../..; fileset = ../../flake.nix; }`, and expects `[ "self" ]`.
- **Rationale**: the pattern is the one `modules/checks/structure/mergify-release-alignment.nix` established for reading the fully composed per-system output, and the JSON diff names the offending check on failure.
- **Alternatives considered**: `assert` at evaluation time, rejected because a failing assertion poisons the whole `checks` attribute set under nix-eval-jobs rather than failing one attribute; a check that walks only `modules/checks/*.nix` text for the string `self`, rejected because it cannot see treefmt-nix's default and would flag the `self.lib.mkStructuralCheck` idiom.

The classifier excludes its own two attributes from the set it inspects to avoid evaluating itself.
Its evaluation forces `drvAttrs` of every other check, so the attribute costs as much to evaluate as the whole check set, about 1m30s on aarch64-darwin in this working copy; nix-eval-jobs evaluates the other attributes in parallel workers regardless, so the cost is one worker's time, not added wall clock across the set.
The derivation itself depends only on the two JSON strings, so it is substituted whenever the offender set is unchanged.

### D3: The allow-list holds `gitleaks` and nothing else

- **Boundary**: first-party.
- **Choice**: a list literal in `check-source-isolation.nix` with one entry and one reason: gitleaks scans every tracked file for credentials, and the check taxonomy accepts full-tree invalidation for a secrets scan because a false negative is severe.
- **Rationale**: `treefmt` was the other candidate, and D4 shows it can be filtered without loss.
- **Alternatives considered**: allow-listing the toplevel checks as too large to reason about, rejected because their reference is two known coercions each; a per-check `passthru.wholeTree = true` marker, rejected because it makes the allow-list discoverable only by grep.

### D4: treefmt's `projectRoot` is derived from the enabled formatters

- **Boundary**: vendored-versus-first-party; treefmt-nix's `flake-module.nix` exposes `treefmt.projectRoot` (default `self`) and this decision sets it from first-party configuration without patching the module.
- **Choice**: in `modules/formatting.nix`, `treefmt.projectRoot = lib.fileset.toSource { root = ../.; fileset = lib.fileset.unions [ ../flake.nix (lib.fileset.fileFilter matchesAnyInclude ../.) ]; }`, where `matchesAnyInclude` is built from `config.treefmt.settings.formatter.<name>.includes` and understands the `*.<ext>` shape, failing evaluation with the offending pattern when a formatter uses any other shape.
- **Rationale**: nixfmt's `includes` is `[ "*.nix" ]` (treefmt-nix `programs/nixfmt.nix`), so the filtered tree contains everything the check reads today, and deriving the filter from the same option that enables a formatter keeps them from drifting.
- **Alternatives considered**: a hand-written `*.nix` filter, rejected because enabling a second formatter would silently narrow the check; allow-listing treefmt, rejected because every docs-only change would then rebuild it.

`flake.nix` is included because treefmt-nix's `projectRootFile` is `flake.nix` and treefmt locates the root by it.
The fileset excludes nothing else on purpose; `settings.global.excludes` is applied by treefmt inside the derivation as before.

### D5: The five `validation.nix` checks read filesets of their own subtrees

- **Boundary**: source-versus-delivered; each check keeps reading the same directory names, delivered as its own store path.
- **Choice**: replace each `${self}/<subtree>` with `${lib.fileset.toSource { root = ../..; fileset = ../../<subtree>; }}/<subtree>`, factored through one local helper `srcOf = paths: lib.fileset.toSource { root = ../..; fileset = lib.fileset.unions paths; }` so each check names its subtrees once: `vars` for `vars-user-password-validation`; `vars` and `secrets` for `secrets-tier-separation` and `secrets-encryption-integrity`; `modules/machines/darwin` and `modules/machines/nixos` for `machine-registry-completeness`; `.sops.yaml` for `secrets-sops-roundtrip`.
- **Rationale**: `lib.fileset.toSource` is the pattern `pkgs/by-name/vanixiets-docs/package.nix` already uses, and the root-relative form keeps each check's dependency explicit at the call site.
- **Alternatives considered**: `builtins.path` with a filter function, rejected as the older idiom the repository has been replacing; moving the five checks onto `mkStructuralCheck`, rejected because they inspect file contents and encryption state rather than evaluated values.

The scripts test for directory existence and print `SKIP` when a directory is absent; with a fileset the directory is always present, so the `SKIP` branches become unreachable and are removed where they were only guarding the `${self}` path.

### D6: sops and openspec paths become module-relative path literals

- **Boundary**: source-versus-delivered; the home and system closures currently deliver the whole tree to reach one file each.
- **Choice**: `defaultSopsFile = ../../../../secrets/home-manager/users/<user>/secrets.yaml` in each of `modules/home/users/{christophersmith,crs58,janettesmith,raquel,tara,ubuntu}/default.nix`; `sopsFile = ../../secrets/bridge/${userCfg.sopsIdentity}-age-key.enc` in `modules/nixos/hm-sops-bridge.nix` (as `../../secrets/bridge + "/${...}"` so interpolation stays a path); `assetsDir = ./assets` in `modules/home/ai/openspec/default.nix`, with `defaultText` updated to match.
- **Rationale**: a path literal inside the flake tree is copied to the store as its own content-hashed path, so the manifest and home-files derivations reference `.../<hash>-secrets.yaml` and `.../<hash>-assets` instead of the whole tree; this is the same mechanism every `sopsFile = ./secrets.yaml` in nixpkgs-style configurations relies on.
- **Alternatives considered**: `lib.fileset.toSource` for a single file, rejected as heavier than a literal with no benefit; leaving the toplevels and allow-listing them, rejected in D3.

The `cameron` home check is an alias of `crs58` through `modules/home/users/aliases.nix`, so its closure follows the crs58 edit.

### D7: The probe is a script behind a `just` recipe

- **Boundary**: first-party.
- **Choice**: `scripts/check-source-audit.sh` takes a system argument, evaluates `nix eval --json .#checks.<system> --apply 'cs: builtins.mapAttrs (_: c: c.drvPath) cs'`, reads the flake source path from `nix flake metadata --json | jq -r .path`, tests `nix-store -q --requisites <drv> | grep -qx <source>` per check, prints a two-column table, and exits 1 when the offender set differs from the allow-list, which it reads from the same nix file through `nix eval .#lib.checkSourceAllowList` so the list is declared once.
  The `justfile` gains `check-source-audit system=""` in the `nix` group, defaulting to the native system as `check-fast` does.
- **Rationale**: this is the exact procedure that produced the audit, and the store query is the only observation of the transitive closure nix permits without building.
- **Alternatives considered**: a CI job running the probe, deferred to Open Questions because gating it means touching nixbot or workflow configuration; comparing `drvPath` before and after touching an unrelated file, kept as the documented manual cross-check because it needs two evaluations and a working-copy edit.

## Discussion point: nixbot cancel-on-merged-close

While reading nixbot's `service.py::CIService._submit_pr_closed` for the review memo, an improvement was considered: cancelling a PR's in-flight builds when it closes as merged whenever the merge commit's tree already has a build record.
It is recorded here as a discussion point only.
No upstream filing will be made anywhere in this work, per the maintainer's instruction, and this change does not depend on the behaviour either way.

## Risks / Trade-offs

- [Risk] A filtered fileset omits a file a check reads, so the check passes vacuously or fails for a missing path. → Mitigation: each of the five checks is built after its edit and its log is compared with the pre-change log for the same `OK` lines; the fileset names the directory the script names.
- [Risk] A second treefmt formatter with an `includes` pattern outside the `*.<ext>` shape is enabled later. → Mitigation: `matchesAnyInclude` fails evaluation naming the pattern, so the maintainer extends the translation or allow-lists treefmt deliberately.
- [Risk] The evaluation-time check sees only direct references, so a new `inputs.self + "/..."` coercion in a home or system module regresses the toplevels unnoticed by `nix flake check`. → Mitigation: the probe covers the transitive closure and is run in the tasks on both systems; the open question below asks where it runs recurrently.
- [Risk] `structure-check-source-isolation` forces `drvAttrs` of every check, so an evaluation failure in any check surfaces here as well. → Accepted: it surfaces in that check's own attribute first, and nix-eval-jobs reports both.
- [Trade-off] Toplevel hashes change once for every machine and home configuration. → Accepted: the change is to input paths only, and `nix build` of each toplevel confirms activation-equivalent output.
- [Trade-off] The allow-list is a literal in a check module rather than an option. → Accepted: one entry, one file, discoverable by the check name.

## Migration Plan

1. Add `check-source-isolation.nix` with the classifier, the allow-list containing the seven current direct offenders plus `gitleaks` as `expected`, and the negative control; build both.
   This makes the check green on the current tree and records the baseline; roll back by deleting the file.
2. Filter the five `validation.nix` checks, shrinking `expected` to `[ "gitleaks" "treefmt" ]`; build each check and the structural pair.
   Roll back by reverting the file.
3. Set treefmt's `projectRoot`, shrinking `expected` to `[ "gitleaks" ]`; build `treefmt` and the structural pair.
   Roll back by reverting `modules/formatting.nix`.
4. Replace the sops and openspec coercions; build one darwin toplevel and one home configuration, then run the probe on aarch64-darwin and x86_64-linux and require its offender set to equal `[ "gitleaks" ]`.
   Roll back by reverting the module files.
5. Add the script and recipe; run `just check-source-audit` on both systems.

Acceptance is the probe reporting exactly the allow-list on both systems, `nix build` of `structure-check-source-isolation` and its negative control succeeding, and `openspec validate --change filter-check-sources-for-substitution` exiting 0.
`nix flake check` over the full set belongs to pre-pull-request validation, not to each step.

## Open Questions

- Where does the transitive probe run recurrently? A nixbot or workflow job is outside this change's scope; the candidates are a step in `pr-check.yaml` or a nixbot effect, and the decision belongs to the change that configures CI for landing.
- Should the allow-list be exposed as a flake-parts option so other repositories built by the same App can declare their own? Deferred until a second repository needs it.
