# Filter check sources for substitution implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `checks.<system>.*` derivation outside a one-entry allow-list independent of the whole flake source, and assert that property at evaluation time and through a store-side probe.

**Architecture:** Direct `self` references in `modules/checks/` and treefmt-nix's `projectRoot` default become `lib.fileset.toSource` inputs; the sops-nix and openspec coercions in home and nixos modules become path literals so the system and home toplevels stop carrying the tree.
A `mkStructuralCheck` pair classifies each check by the string context of its own derivation attributes against `lib.checkSourceAllowList`, and `scripts/check-source-audit.sh` behind `just check-source-audit` queries `nix-store -q --requisites` for the transitive property pure evaluation cannot observe.

**Tech Stack:** Nix (flake-parts, import-tree, `lib.fileset`, `builtins.getContext`), treefmt-nix, sops-nix, bash, just, OpenSpec.

**Spec:** `openspec/changes/filter-check-sources-for-substitution/specs/check-source-isolation/spec.md`, `specs/world-assumptions/spec.md`, and `design.md` in the same directory.

## Global Constraints

- The allow-list is declared once at `flake.lib.checkSourceAllowList` as a list of `{ name; reason; }` attrsets and ends this change holding exactly `gitleaks`.
- The classifier uses only `builtins.getContext`, `builtins.toJSON`, `builtins.unsafeDiscardStringContext`, and `drvAttrs`; it never calls `builtins.readFile` on a `.drv` path or `builtins.storePath`.
- No check's behaviour changes; each edited check prints the same `OK:` lines after its edit as before.
- Path literals are relative to the module file: `../../../../secrets/...` from `modules/home/users/<user>/default.nix`, `../../secrets/bridge` from `modules/nixos/hm-sops-bridge.nix`, `./assets` from `modules/home/ai/openspec/default.nix`, `../..` as the fileset root from `modules/checks/validation.nix`, `../.` from `modules/formatting.nix`.
- Verification of nix-managed outputs is by `nix eval` for evaluation-only edits and `nix build` for derivations, never by reading the source; each step below names which.
- No edit to gitea-mq, `landing.toml`, nixbot configuration, `.github/workflows/`, `apm.lock.yaml`, or any upstream project; no upstream filing.
- Every new file must be tracked by git before a flake evaluation can see it (`modules/README.md`); the orchestrator commits, and workers stage nothing.
- Logs captured with `tee` go under `logs/`, which is git-ignored; never leave an untracked, unignored file in the working copy.

## File Map

- Create `modules/checks/structure/check-source-isolation.nix`: allow-list, classifier, `structure-check-source-isolation`, `structure-check-source-isolation-neg`.
- Modify `modules/checks/validation.nix`: `srcOf` helper and five check bodies.
- Modify `modules/formatting.nix`: `treefmt.projectRoot` from the enabled formatters' `includes`.
- Modify `modules/home/users/{christophersmith,crs58,janettesmith,raquel,tara,ubuntu}/default.nix`: `defaultSopsFile` path literal.
- Modify `modules/nixos/hm-sops-bridge.nix`: `sopsFile` path literal.
- Modify `modules/home/ai/openspec/default.nix`: `assetsDir = ./assets` and `defaultText`.
- Create `scripts/check-source-audit.sh`; modify `justfile` with the `check-source-audit` recipe.

---

## Task 1: Baseline and the assertion pair

**Files:**

- Create: `modules/checks/structure/check-source-isolation.nix`
- Reference: `modules/checks/structure/mergify-release-alignment.nix`, `modules/lib/mk-structural-check.nix`

- [ ] **Step 1: Capture the baseline offender set on aarch64-darwin.**

Run:

```bash
SRC=$(nix flake metadata --json | jq -r .path)
nix eval --json .#checks.aarch64-darwin --apply 'cs: builtins.mapAttrs (_: c: c.drvPath) cs' \
  | jq -r 'to_entries[] | "\(.key)\t\(.value)"' \
  | while IFS=$'\t' read -r name drv; do
      if nix-store -q --requisites "$drv" | grep -qx "$SRC"; then echo -e "$name\twhole-tree"; else echo -e "$name\tisolated"; fi
    done 2>&1 | tee "logs/check-source-audit-baseline-$(date +%Y%m%d-%H%M%S).log"
```

Expected: 17 `whole-tree` rows, the list in tasks.md 1.1.
The flake source path changes whenever the shared working copy changes, so re-read `SRC` in the same shell as the evaluation.

- [ ] **Step 2: Write the failing structural check with an empty allow-list.**

Create `modules/checks/structure/check-source-isolation.nix`:

```nix
{ self, lib, ... }:
let
  allowList = [
    {
      name = "gitleaks";
      reason = "a credential scan must cover every tracked file";
    }
  ];
  sourcePath = builtins.unsafeDiscardStringContext self.outPath;
  referencesSource =
    drv: builtins.elem sourcePath (builtins.attrNames (builtins.getContext (builtins.toJSON drv.drvAttrs)));
  ownNames = [
    "structure-check-source-isolation"
    "structure-check-source-isolation-neg"
  ];
in
{
  flake.lib.checkSourceAllowList = allowList;

  perSystem =
    { pkgs, self', ... }:
    let
      mkCheck = self.lib.mkStructuralCheck pkgs;
      inspected = removeAttrs self'.checks ownNames;
    in
    {
      checks.structure-check-source-isolation = mkCheck {
        name = "check-source-isolation";
        actual = lib.sort lib.lessThan (lib.attrNames (lib.filterAttrs (_: referencesSource) inspected));
        expected = lib.sort lib.lessThan (map (e: e.name) allowList);
      };
    };
}
```

At the baseline the allow-list above is intentionally narrower than the tree, so the check fails; this is the red step.

- [ ] **Step 3: Run it and confirm it fails naming the six other direct offenders.**

Run: `nix build --option builders '' .#checks.aarch64-darwin.structure-check-source-isolation --no-link -L`.

Expected: nonzero exit, and the diff lists `machine-registry-completeness`, `secrets-encryption-integrity`, `secrets-sops-roundtrip`, `secrets-tier-separation`, `treefmt`, `vars-user-password-validation` as present in `actual` and absent in `expected`.
Also run `nix eval --raw .#checks.aarch64-darwin.structure-check-source-isolation.drvPath` to confirm pure evaluation succeeds.

- [ ] **Step 4: Seed the allow-list with the seven direct offenders so the baseline is green.**

Extend `allowList` with entries for the six checks above, each with reason `"baseline; filtered in a later task"`.

Run: `nix build --option builders '' .#checks.aarch64-darwin.structure-check-source-isolation --no-link`.

Expected: exit 0.

- [ ] **Step 5: Add the negative control.**

Inside `perSystem`, add:

```nix
checks.structure-check-source-isolation-neg =
  let
    fixtureSelf = pkgs.runCommand "fixture-self" { src = self; } "touch $out";
    fixtureFiltered = pkgs.runCommand "fixture-filtered" {
      src = lib.fileset.toSource {
        root = ../..;
        fileset = ../../flake.nix;
      };
    } "touch $out";
  in
  mkCheck {
    name = "check-source-isolation-neg";
    actual = {
      self = referencesSource fixtureSelf;
      filtered = referencesSource fixtureFiltered;
    };
    expected = {
      self = true;
      filtered = false;
    };
  };
```

Run: `nix build --option builders '' .#checks.aarch64-darwin.structure-check-source-isolation-neg --no-link`.

Expected: exit 0.

- [ ] **Step 6: Mutate the negative control to prove it can fail.**

Temporarily set `fixtureSelf`'s `src` to the filtered source, run the same build, expect a nonzero exit with a diff on `self`, then restore the fixture.

- [ ] **Step 7: Confirm the classifier reproduces the direct group.**

Run: `nix eval --raw .#checks.aarch64-darwin.structure-check-source-isolation.actualJson`.

Expected: exactly the seven names from tasks.md 1.4.

## Task 2: Filter the five validation checks

**Files:**

- Modify: `modules/checks/validation.nix`

- [ ] **Step 1: Record the pre-change logs of the five checks.**

Run: `nix build --option builders '' .#checks.aarch64-darwin.{vars-user-password-validation,secrets-tier-separation,secrets-encryption-integrity,machine-registry-completeness,secrets-sops-roundtrip} --no-link -L 2>&1 | tee logs/validation-before-$(date +%Y%m%d-%H%M%S).log`.

Expected: exit 0; the `OK:` lines are the comparison target.

- [ ] **Step 2: Add the `srcOf` helper.**

In the `perSystem` `let` block beside `mkCheck`:

```nix
srcOf =
  paths:
  lib.fileset.toSource {
    root = ../..;
    fileset = lib.fileset.unions paths;
  };
```

- [ ] **Step 3: Rewrite `vars-user-password-validation`.**

Replace `VARS_DIR="${self}/vars/shared/user-password-cameron"` with `VARS_DIR="${srcOf [ ../../vars ]}/vars/shared/user-password-cameron"`.

Run: `nix build --option builders '' .#checks.aarch64-darwin.vars-user-password-validation --no-link -L`.

Expected: exit 0, same `OK:` lines as the before-log.

- [ ] **Step 4: Rewrite `secrets-tier-separation` and `secrets-encryption-integrity`.**

Introduce `tree = srcOf [ ../../vars ../../secrets ];` in a `let` local to each check and replace `${self}/vars` and `${self}/secrets` with `${tree}/vars` and `${tree}/secrets`.
Remove the `else echo "SKIP: ... not found"` branches whose only purpose was tolerating a missing `${self}` directory; keep the content assertions.

Run: `nix build --option builders '' .#checks.aarch64-darwin.secrets-tier-separation .#checks.aarch64-darwin.secrets-encryption-integrity --no-link -L`.

Expected: exit 0, same `OK:` lines.

- [ ] **Step 5: Rewrite `machine-registry-completeness` and `secrets-sops-roundtrip`.**

`machine-registry-completeness`: `tree = srcOf [ ../../modules/machines/darwin ../../modules/machines/nixos ];`, `DARWIN_DIR="${tree}/modules/machines/darwin"`, `NIXOS_DIR="${tree}/modules/machines/nixos"`.
`secrets-sops-roundtrip`: replace `"${self}/.sops.yaml"` with `"${srcOf [ ../../.sops.yaml ]}/.sops.yaml"`.

Run: `nix build --option builders '' .#checks.aarch64-darwin.machine-registry-completeness .#checks.aarch64-darwin.secrets-sops-roundtrip --no-link -L`.

Expected: exit 0, same `OK:` lines.

- [ ] **Step 6: Shrink the allow-list and rebuild the pair.**

Remove the five baseline entries from `allowList`, leaving `gitleaks` and `treefmt`.

Run: `nix build --option builders '' .#checks.aarch64-darwin.structure-check-source-isolation .#checks.aarch64-darwin.structure-check-source-isolation-neg --no-link`.

Expected: exit 0.

- [ ] **Step 7: Show hash stability for one filtered check.**

Run `nix eval --raw .#checks.aarch64-darwin.secrets-tier-separation.drvPath`, append a blank line to `docs/notes/README.md`, run it again, revert the edit.

Expected: identical output both times.

## Task 3: Filter treefmt

**Files:**

- Modify: `modules/formatting.nix`
- Reference: treefmt-nix `flake-module.nix` (`treefmt.projectRoot`), `programs/nixfmt.nix` (`includes = [ "*.nix" ]`)

- [ ] **Step 1: Write the include translation and the projectRoot.**

In `modules/formatting.nix`, change the `perSystem` argument set to `{ pkgs, config, lib, ... }` and add inside `treefmt`:

```nix
projectRoot =
  let
    includes = lib.concatMap (f: f.includes or [ ]) (lib.attrValues config.treefmt.settings.formatter);
    extOf =
      pattern:
      let
        m = builtins.match "\\*\\.([A-Za-z0-9_-]+)" pattern;
      in
      if m == null then
        throw "treefmt projectRoot filter understands only '*.<ext>' include patterns; got '${pattern}'"
      else
        builtins.head m;
    exts = map extOf includes;
    matchesAnyInclude = file: lib.any file.hasExt exts;
  in
  lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../flake.nix
      (lib.fileset.fileFilter matchesAnyInclude ../.)
    ];
  };
```

- [ ] **Step 2: Evaluate and build treefmt.**

Run: `nix eval --raw .#checks.aarch64-darwin.treefmt.drvPath && nix build --option builders '' .#checks.aarch64-darwin.treefmt --no-link -L`.

Expected: both exit 0; the check output still runs `treefmt --no-cache` over the `.nix` files.

- [ ] **Step 3: Prove the guard fires.**

Temporarily add `settings.formatter.nixfmt.includes = lib.mkForce [ "nix/**" ];` under `treefmt`, run `nix eval .#checks.aarch64-darwin.treefmt.drvPath`, expect an error containing `nix/**`, then remove the line.

- [ ] **Step 4: Shrink the allow-list to `gitleaks`.**

Remove the `treefmt` entry from `allowList`.

Run: `nix build --option builders '' .#checks.aarch64-darwin.structure-check-source-isolation .#checks.aarch64-darwin.structure-check-source-isolation-neg --no-link && nix eval --json .#lib.checkSourceAllowList`.

Expected: build exit 0; the JSON is a one-element list naming `gitleaks`.

## Task 4: Replace the module-level coercions

**Files:**

- Modify: `modules/home/users/{christophersmith,crs58,janettesmith,raquel,tara,ubuntu}/default.nix`
- Modify: `modules/nixos/hm-sops-bridge.nix`
- Modify: `modules/home/ai/openspec/default.nix`

- [ ] **Step 1: Rewrite the six `defaultSopsFile` values.**

In each user module replace `flake.inputs.self + "/secrets/home-manager/users/<user>/secrets.yaml"` with `../../../../secrets/home-manager/users/<user>/secrets.yaml`.

Run: `nix eval --raw '.#homeConfigurations."crs58@aarch64-darwin".config.sops.defaultSopsFile'`.

Expected: a store path ending in `-secrets.yaml` with no `-source/` component.

- [ ] **Step 2: Rewrite the bridge `sopsFile`.**

In `modules/nixos/hm-sops-bridge.nix` replace `inputs.self + "/secrets/bridge/${userCfg.sopsIdentity}-age-key.enc"` with `../../secrets/bridge + "/${userCfg.sopsIdentity}-age-key.enc"`.

Run: `nix eval --json .#nixosConfigurations.magnetite.config.sops.secrets --apply 'ss: map (s: s.sopsFile) (builtins.attrValues ss)'`.

Expected: the age-key entry is a store path named `-crs58-age-key.enc`.

- [ ] **Step 3: Rewrite the openspec assets directory.**

In `modules/home/ai/openspec/default.nix` set `assetsDir = ./assets;` and change the `defaultText` to `lib.genAttrs [ ... ] (name: ./assets + "/schemas/''${name}")`.

Run: `nix eval --raw '.#homeConfigurations."crs58@aarch64-darwin".config.programs.openspec.package.superpowers-bridge-wrspm'`.

Expected: a store path ending in `-assets/schemas/superpowers-bridge-wrspm`.

- [ ] **Step 4: Build one home, one darwin, and one nixos toplevel.**

Run: `nix build --option builders '' .#checks.aarch64-darwin.home-manager-crs58 .#checks.aarch64-darwin.darwin-stibnite --no-link` and `nix build .#checks.x86_64-linux.nixos-magnetite --no-link`.

Expected: all exit 0.

- [ ] **Step 5: Re-run the Task 1 Step 1 probe.**

Expected: `gitleaks` is the only `whole-tree` row.

## Task 5: The probe script and recipe

**Files:**

- Create: `scripts/check-source-audit.sh`
- Modify: `justfile`

- [ ] **Step 1: Write the script.**

```bash
#!/usr/bin/env bash
# Report which checks.<system>.* derivations carry the whole flake source in their
# transitive input closure, and fail when that set differs from lib.checkSourceAllowList.
set -euo pipefail

system="${1:-$(nix eval --impure --raw --expr 'builtins.currentSystem')}"
src=$(nix flake metadata --json | jq -r .path)
expected=$(nix eval --json .#lib.checkSourceAllowList | jq -r '.[].name' | sort)

drvs=$(nix eval --json ".#checks.$system" --apply 'cs: builtins.mapAttrs (_: c: c.drvPath) cs')
actual=""
while IFS=$'\t' read -r name drv; do
  if nix-store -q --requisites "$drv" | grep -qx "$src"; then
    printf '%s\twhole-tree\n' "$name"
    actual+="$name"$'\n'
  else
    printf '%s\tisolated\n' "$name"
  fi
done < <(jq -r 'to_entries[] | "\(.key)\t\(.value)"' <<<"$drvs")

if [ "$(printf '%s' "$actual" | sort)" != "$expected" ]; then
  echo "check-source-audit: whole-tree set differs from lib.checkSourceAllowList" >&2
  diff <(printf '%s\n' "$expected") <(printf '%s' "$actual" | sort) >&2 || true
  exit 1
fi
```

Run: `shellcheck scripts/check-source-audit.sh && chmod +x scripts/check-source-audit.sh`.

Expected: shellcheck exit 0.

- [ ] **Step 2: Add the recipe.**

In the `justfile`, `nix` group, after `check-fast`:

```just
# Report which checks carry the whole flake source; exit 1 on drift from lib.checkSourceAllowList
[group('nix')]
check-source-audit system="":
  @./scripts/check-source-audit.sh {{system}}
```

Run: `just check-source-audit && just check-source-audit x86_64-linux`.

Expected: both exit 0; `gitleaks` is the only `whole-tree` row (122 rows on darwin, 128 on linux).

- [ ] **Step 3: Prove the probe fails on a regression.**

Temporarily add `src = self;` to the `home-configurations-exposed` `runCommand` attributes in `modules/checks/validation.nix`, run `just check-source-audit`, expect exit 1 with `home-configurations-exposed` marked `whole-tree`, then revert.

## Task 6: Integration verification

- [ ] **Step 1: Whole-set hash stability.**

Run the `drvPath` map evaluation to `logs/drvs-a.json`, append a line to `docs/notes/README.md`, run it to `logs/drvs-b.json`, revert, and `diff <(jq -S . logs/drvs-a.json) <(jq -S . logs/drvs-b.json)`.

Expected: `gitleaks` is the only differing key.

- [ ] **Step 2: Both systems agree.**

Run: `nix build .#checks.aarch64-darwin.structure-check-source-isolation .#checks.x86_64-linux.structure-check-source-isolation --no-link` and both `just check-source-audit` invocations.

Expected: all exit 0.

- [ ] **Step 3: Validate artifacts and scope.**

Run: `openspec validate --change filter-check-sources-for-substitution` and `git diff --name-only <base>..HEAD`.

Expected: validate exits 0; the path list matches tasks.md 6.3.
