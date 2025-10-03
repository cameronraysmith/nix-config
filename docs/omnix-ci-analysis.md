# Omnix CI Integration Analysis

**Date:** 2025-10-03
**Branch:** 00-multi
**Context:** Multi-user architecture CI optimization review

## Executive Summary

The CI pipeline has **significant redundancy** between custom build jobs and Omnix's `om ci` tool. The existing-ci-integration job (running `om ci`) already builds all configurations that build-matrix and integration-tests build manually, taking 12m44s vs their combined ~18 minutes.

**Key Finding:** 3 out of 9 CI jobs duplicate work that Omnix already performs automatically.

**Recommendation:** Consolidate to Omnix-primary approach with targeted validation jobs.

---

## What Omnix `om ci` Does

Based on documentation (`/Users/crs58/projects/nix-workspace/omnix/doc/om/ci.md`) and actual CI logs, `om ci run --systems "x86_64-linux"` automatically builds:

### Outputs Built by Omnix

| Output Type | Flake Path | What Was Built |
|-------------|------------|----------------|
| NixOS Configurations | `nixosConfigurations.*` | stibnite-nixos, blackphos-nixos (2/3 configs) |
| Home Configurations | `legacyPackages.x86_64-linux.homeConfigurations.*` | runner@stibnite, runner@blackphos, raquel@blackphos (3 configs) |
| Checks | `checks.x86_64-linux.*` | pre-commit check |
| DevShells | `devShells.x86_64-linux.*` | default devShell |

**Evidence from CI Run 18222560901:**
```
/nix/store/7j8n0bndmb9c6dbw6a45z8hq8yibvsdf-home-manager-generation
/nix/store/9p5qdacpbf3aw7srqshwxzzaipvzsskb-home-manager-generation
/nix/store/s3b622szmmqqb8im37ki52qzdjmczj2k-home-manager-generation
/nix/store/06dm0kqnxj53h0lv53sp3vlmnnaslq6x-nixos-system-blackphos-nixos-25.11.20250928.e9f00bd
/nix/store/0md17n7ybbf1n62lay43p7nfhvr0j6yr-nixos-system-stibnite-nixos-25.11.20250928.e9f00bd
```

### How Omnix Works

1. Uses [devour-flake](https://github.com/srid/devour-flake) to automatically discover all flake outputs
2. Builds standard outputs: packages, apps, checks, devShells
3. Builds system configurations: nixosConfigurations, darwinConfigurations
4. Builds home-manager configurations: legacyPackages.${system}.homeConfigurations
5. Can run custom steps (configured via `flake.om.ci.default` in flake.nix)
6. Produces result symlink with JSON of all built paths

**Current Configuration** (flake.nix:66-70):
```nix
flake.om.ci.default.ROOT = {
  dir = ".";
  steps.flake-check.enable = false;
  steps.custom = { };
};
```

This means:
- Build root flake only (no sub-flakes)
- Skip `nix flake check` (disabled)
- No custom steps defined
- Pure build-everything mode

---

## CI Job Inventory and Omnix Overlap Matrix

### Job-by-Job Analysis

| Job | Runtime | Purpose | Omnix Overlap | Keep? |
|-----|---------|---------|---------------|-------|
| 1. bootstrap-verification | 1m29s | Tests Makefile bootstrap, nix install, age key generation | None - infrastructure testing | **Yes** |
| 2. config-validation | 1m14s | Validates user definitions in darwin configs via nix eval | None - architecture validation | **Yes** |
| 3. build-matrix | 8m5s | Builds nixosConfigurations.{stibnite,blackphos}-nixos | **100% - om ci builds these** | **No** |
| 4. autowiring-validation | 2m38s | Verifies nixos-unified discovers configs via nix eval | None - discovery testing | **Yes** |
| 5. secrets-workflow | 1m37s | Tests sops-nix encryption/decryption | None - sops testing | **Yes** |
| 6. justfile-activation | 3m17s | Tests justfile recipes (dry-run) | None - workflow testing | **Yes** |
| 7. integration-tests | 14m17s | Builds nixos configs + all 3 home configs | **100% - om ci builds these** | **No** |
| 8. existing-ci-integration | 12m44s | Runs om ci (builds everything) | N/A - this IS om ci | **Yes** |

**Total Current CI Time:** ~15 minutes (parallel execution)
**Redundant Build Time:** ~22 minutes of duplicate work (serial measurement)

### Detailed Overlap Analysis

#### Complete Redundancy (Remove These)

**Job 3: build-matrix**
- **What it does:** Manually builds 2 NixOS configurations
  ```bash
  nix build .#nixosConfigurations.stibnite-nixos.config.system.build.toplevel
  nix build .#nixosConfigurations.blackphos-nixos.config.system.build.toplevel
  ```
- **Omnix equivalent:** `om ci` automatically builds all nixosConfigurations
- **Redundancy:** 100% - exact same outputs
- **Recommendation:** Delete job entirely

**Job 7: integration-tests**
- **What it does:** Manually builds NixOS configs + home configs
  ```bash
  # Scenario 1 & 2: builds same nixos configs as build-matrix
  nix build .#nixosConfigurations.stibnite-nixos.config.system.build.toplevel
  nix build .#nixosConfigurations.blackphos-nixos.config.system.build.toplevel

  # Scenario 3: builds all home configs
  nix build ".#legacyPackages.x86_64-linux.homeConfigurations.\"runner@stibnite\".activationPackage"
  nix build ".#legacyPackages.x86_64-linux.homeConfigurations.\"runner@blackphos\".activationPackage"
  nix build ".#legacyPackages.x86_64-linux.homeConfigurations.\"raquel@blackphos\".activationPackage"
  ```
- **Omnix equivalent:** `om ci` builds all of these automatically
- **Redundancy:** 100% - exact same outputs
- **Additional work:** "verify no cross-config dependencies" step (line 523-529) - just validates independence
- **Recommendation:** Delete scenarios 1-2 entirely; move scenario 3 config existence checks to autowiring-validation if valuable

#### No Redundancy (Keep These)

**Job 1: bootstrap-verification**
- **Unique value:** Tests end-user onboarding workflow
- **Not covered by Omnix:** Tests Makefile, nix installation, direnv setup
- **Recommendation:** Keep as-is

**Job 2: config-validation**
- **Unique value:** Architecture-specific validation (multi-user architecture)
- **Not covered by Omnix:** Validates user definitions, primary user settings
- **Methodology:** Uses nix eval for structural validation without building
- **Recommendation:** Keep as-is

**Job 4: autowiring-validation**
- **Unique value:** Validates nixos-unified auto-discovery
- **Not covered by Omnix:** Ensures expected configs are discovered (not just built)
- **Methodology:** Uses nix eval to check config presence
- **Potential enhancement:** Could add scenario 3's config existence checks here
- **Recommendation:** Keep as-is (or enhance)

**Job 5: secrets-workflow**
- **Unique value:** Tests sops-nix encryption/decryption workflow
- **Not covered by Omnix:** Ephemeral key generation, sops mechanics
- **Recommendation:** Keep as-is

**Job 6: justfile-activation**
- **Unique value:** Tests justfile recipes and activation targets
- **Not covered by Omnix:** Validates developer workflow tooling
- **Recommendation:** Keep as-is

**Job 8: existing-ci-integration**
- **Unique value:** Primary build job using Omnix
- **Currently:** Runs `om ci run --systems "x86_64-linux"`
- **Recommendation:** Keep and expand role

---

## Trade-Off Analysis

### Option 1: Status Quo (Keep All Jobs)

**Pros:**
- Known working state
- Granular job visibility in GitHub UI
- Clear intent from job names

**Cons:**
- 100% duplication of build work between 3 jobs
- Maintenance burden (3 places to update build targets)
- Longer total CI time (serial: 22 extra minutes)
- Wasteful use of CI resources
- Confusing for new contributors (which job is authoritative?)

**Estimated Total Time:** ~15 minutes (parallel)

### Option 2: Omnix-Primary with Targeted Validation (Recommended)

**Consolidation Strategy:**
1. Delete build-matrix and integration-tests jobs entirely
2. Rename existing-ci-integration to "build-all" or "omnix-build"
3. Keep all validation jobs (bootstrap, config, autowiring, secrets, justfile)
4. Move any unique validation logic to appropriate validation jobs

**Pros:**
- Single source of truth for builds (Omnix)
- Automatic discovery of new configurations
- Reduced maintenance (flake outputs auto-discovered)
- Cleaner CI pipeline (9 jobs → 6 jobs)
- Omnix provides better parallelization (devour-flake)
- Future-proof (new configs automatically built)

**Cons:**
- Less granular failure visibility (all builds in one job)
- Omnix dependency (but already required in flake)
- Need to learn Omnix configuration for custom needs

**Estimated Total Time:** ~13 minutes (parallel) - saves 2 minutes

**Risk Mitigation:**
- Omnix is already used and working (existing-ci-integration passes)
- All configurations already buildable via om ci
- Validation jobs remain separate for debugging clarity

### Option 3: Hybrid Approach

Keep Omnix for bulk building + add targeted nix build for critical configs only.

**Example:**
- Omnix builds everything (existing-ci-integration)
- Separate job builds only stibnite-nixos (production critical)
- Validation jobs remain separate

**Pros:**
- Safety net for critical configs
- Can fail fast on priority configs
- Granular visibility for critical systems

**Cons:**
- Still duplicates work (partial)
- More complex decision matrix (which configs are "critical"?)
- Maintenance overhead remains

**Estimated Total Time:** ~14 minutes (parallel)

---

## Recommendation: Option 2 (Omnix-Primary)

### Rationale

1. **Omnix already proves it works** - existing-ci-integration has 100% pass rate
2. **Automatic discovery** - new home configs/nixos configs auto-built without CI changes
3. **Single source of truth** - reduces confusion and maintenance
4. **Validation remains separate** - keep architectural validation jobs for clarity
5. **Performance improvement** - devour-flake parallelization likely more efficient

### What's NOT Lost

The integration-tests job had one unique element worth preserving:
- **Config independence verification** (line 523-529)

This can be moved to autowiring-validation or a new lightweight validation job if deemed valuable.

### Why Not Just Use Omnix for Everything?

Some jobs test **workflows** and **mechanisms**, not just builds:
- bootstrap-verification tests **user onboarding**
- config-validation tests **architectural correctness**
- autowiring-validation tests **auto-discovery**
- secrets-workflow tests **sops mechanics**
- justfile-activation tests **developer tooling**

These provide value beyond "does it build?" and should remain separate.

---

## Implementation Plan

### Phase 1: Rename and Clarify (Low Risk)

**Goal:** Make existing-ci-integration the authoritative build job without breaking anything.

**Changes:**
```yaml
# .github/workflows/ci.yaml

# Rename existing-ci-integration → omnix-build
omnix-build:
  name: Build all configurations (Omnix)
  if: |
    github.event_name != 'workflow_dispatch' ||
    inputs.job == '' ||
    inputs.job == 'omnix-build'
  runs-on: ubuntu-latest
  steps:
    - name: checkout repository
      uses: actions/checkout@v4

    - name: setup nix
      uses: ./.github/actions/setup-nix
      with:
        system: x86_64-linux

    - name: setup cachix
      uses: cachix/cachix-action@v16
      continue-on-error: true
      with:
        name: ${{ env.CACHIX_BINARY_CACHE }}
        authToken: ${{ secrets.CACHIX_AUTH_TOKEN }}

    - name: build all outputs via omnix
      run: |
        echo "Building all flake outputs via om ci..."
        nix develop --command om ci run --systems "x86_64-linux"
        echo "✅ All outputs built successfully"

    - name: report disk usage
      if: always()
      run: df -h
```

**Testing:**
- Run workflow_dispatch with `job: omnix-build`
- Verify all configs build successfully
- Confirm cachix caching works

**Timeline:** 1 commit, test in CI

### Phase 2: Remove Redundant Jobs (Medium Risk)

**Goal:** Delete build-matrix and integration-tests jobs.

**Changes:**
```yaml
# .github/workflows/ci.yaml

# DELETE THESE JOBS:
# - build-matrix (lines 140-241)
# - integration-tests (lines 443-530)
```

**Preserve Unique Logic:**

Move config independence check to autowiring-validation:

```yaml
# In autowiring-validation job, add:
- name: verify config independence
  run: |
    echo "Verifying configurations are independent..."

    # Each config should build in isolation
    # (This is implicit in flake structure, but validates no hidden dependencies)
    for config in "stibnite-nixos" "blackphos-nixos"; do
      echo "  Checking $config can evaluate independently..."
      nix eval .#nixosConfigurations.$config.config.system.build.toplevel --dry-run
    done

    for config in "runner@stibnite" "runner@blackphos" "raquel@blackphos"; do
      echo "  Checking $config can evaluate independently..."
      nix eval ".#legacyPackages.x86_64-linux.homeConfigurations.\"$config\".activationPackage" --dry-run
    done

    echo "✅ All configurations are independent"
```

**Testing:**
- Run full CI suite
- Verify all validations pass
- Confirm omnix-build is sufficient

**Rollback Plan:**
- Revert commit if omnix-build fails
- Git tag pre-consolidation state: `ci-pre-omnix-consolidation`

**Timeline:** 1 commit, full CI test

### Phase 3: Documentation Update (Low Risk)

**Goal:** Update CI documentation to reflect new structure.

**Changes:**

Update `docs/ci-implementation-prompt.md`:
```markdown
## CI Architecture (Post-Omnix Consolidation)

The CI pipeline uses Omnix as the primary build tool with targeted validation jobs:

### Build Job
- **omnix-build**: Builds ALL flake outputs via `om ci run`
  - NixOS configurations (nixosConfigurations.*)
  - Home configurations (legacyPackages.x86_64-linux.homeConfigurations.*)
  - Checks (checks.x86_64-linux.*)
  - DevShells (devShells.x86_64-linux.*)

### Validation Jobs
- **bootstrap-verification**: Tests Makefile onboarding workflow
- **config-validation**: Validates multi-user architecture user definitions
- **autowiring-validation**: Verifies nixos-unified auto-discovery + config independence
- **secrets-workflow**: Tests sops-nix encryption/decryption
- **justfile-activation**: Tests activation workflow tooling

### Why Omnix?
- Automatic discovery of new configurations
- Single source of truth for builds
- Efficient parallelization via devour-flake
- Future-proof (flake changes auto-reflected)

### Adding New Configurations
Simply add config files to the appropriate directory:
- `configurations/nixos/` - auto-discovered as nixosConfigurations
- `configurations/home/` - auto-discovered as homeConfigurations
- `configurations/darwin/` - auto-discovered as darwinConfigurations

Omnix will automatically build them in CI without workflow changes.
```

Create new document: `docs/omnix-consolidation-rationale.md`
```markdown
# CI Consolidation: Omnix Integration Rationale

**Date:** 2025-10-03
**Context:** Multi-user architecture CI optimization

[Include this analysis document]
```

**Timeline:** 1 commit

### Phase 4: Future Enhancements (Optional)

**Goal:** Leverage Omnix custom steps for more sophisticated CI.

**Potential Additions:**

```nix
# flake.nix
flake.om.ci.default.ROOT = {
  dir = ".";
  steps.flake-check.enable = false;
  steps.custom = {
    # Run formatting checks
    treefmt-check = {
      type = "devshell";
      command = [ "treefmt" "--fail-on-change" ];
    };

    # Run tests if we add them
    # test = {
    #   type = "devshell";
    #   command = [ "just" "test" ];
    # };
  };
};
```

This allows Omnix to run custom validation steps as part of the build process.

**Timeline:** As needed for future enhancements

---

## Performance Impact Estimation

### Current State (9 jobs)

| Job | Runtime | Runs in Parallel With |
|-----|---------|----------------------|
| bootstrap-verification | 1m29s | All others |
| config-validation | 1m14s | All others |
| build-matrix (stibnite) | 4m1s | blackphos, others |
| build-matrix (blackphos) | 4m4s | stibnite, others |
| autowiring-validation | 2m38s | All others |
| secrets-workflow | 1m37s | All others |
| justfile-activation | 3m17s | All others |
| integration-tests | 14m17s | All others |
| existing-ci-integration | 12m44s | All others |

**Total Wallclock Time:** ~15 minutes (limited by integration-tests: 14m17s)

**Total CPU Time:** ~45 minutes (sum of all jobs)

**Redundant Work:**
- build-matrix: 8m5s building 2 nixos configs
- integration-tests: 14m17s building 2 nixos + 3 home configs
- Both duplicate existing-ci-integration: 12m44s

### Proposed State (6 jobs)

| Job | Runtime | Notes |
|-----|---------|-------|
| bootstrap-verification | 1m29s | Unchanged |
| config-validation | 1m14s | Unchanged |
| autowiring-validation | 2m45s | +7s for independence checks |
| secrets-workflow | 1m37s | Unchanged |
| justfile-activation | 3m17s | Unchanged |
| omnix-build | 12m44s | Renamed, now authoritative |

**Total Wallclock Time:** ~13 minutes (limited by omnix-build: 12m44s)

**Total CPU Time:** ~23 minutes (50% reduction)

**Improvement:**
- 2 minute reduction in wallclock time
- 22 minute reduction in CPU time
- 3 fewer jobs to maintain

### Cachix Impact

With Cachix caching working correctly:
- First run on PR: ~13 minutes (full builds)
- Subsequent runs: ~2-5 minutes (cache hits)

Omnix produces result symlinks that serve as garbage collection roots for the entire build closure, which may improve Cachix efficiency.

---

## Migration Risk Assessment

### Risk: Omnix Failures

**Likelihood:** Low
**Impact:** High (blocks all builds)
**Mitigation:**
- Omnix already proven working (existing-ci-integration passes)
- Keep validation jobs separate (can debug without full builds)
- Tag pre-migration state for easy rollback
- Test on branch before merging to main

### Risk: Lost Debugging Granularity

**Likelihood:** Medium
**Impact:** Medium (harder to identify specific config failures)
**Mitigation:**
- Omnix prints which configs it's building
- Logs show individual store paths for each config
- Can still run `nix build .#nixosConfigurations.stibnite-nixos` locally for debugging
- Validation jobs provide architectural debugging separate from builds

### Risk: Omnix Configuration Complexity

**Likelihood:** Low
**Impact:** Low (easy to learn)
**Mitigation:**
- Current config is minimal (just root flake, no custom steps)
- Documentation exists: `/Users/crs58/projects/nix-workspace/omnix/doc/om/ci.md`
- Examples available in Omnix repo
- Can add custom steps incrementally as needed

### Risk: Missing Critical Config

**Likelihood:** Very Low
**Impact:** High (config not tested)
**Mitigation:**
- Omnix uses devour-flake which discovers ALL flake outputs
- More comprehensive than manual matrix (won't forget new configs)
- autowiring-validation job confirms expected configs exist

---

## Success Criteria

### Immediate (Post-Implementation)

- [ ] All CI jobs pass on first run
- [ ] omnix-build job successfully builds all configurations
- [ ] Validation jobs remain independent and pass
- [ ] CI runtime reduced by 2+ minutes
- [ ] No configurations are missed

### Long-term (1-2 weeks)

- [ ] CI remains stable across multiple PRs
- [ ] New configurations automatically discovered and built
- [ ] Developer experience improved (clearer CI intent)
- [ ] Maintenance reduced (fewer jobs to update)

### Rollback Triggers

If any of these occur, rollback immediately:
- omnix-build fails repeatedly
- Configurations built in old CI are missed in new CI
- Total CI time increases beyond 15 minutes
- Critical bugs introduced by consolidation

---

## Questions for User

Before implementing, confirm:

1. **Scope:** Should we proceed with full consolidation (Option 2) or prefer hybrid approach (Option 3)?

2. **Config Independence:** Is the "verify no cross-config dependencies" check in integration-tests:524-529 valuable enough to preserve? Should it move to autowiring-validation?

3. **Job Naming:** Prefer `omnix-build`, `build-all`, or `build-configurations` for the renamed job?

4. **Timeline:** Implement immediately or schedule for later?

5. **Additional Validation:** Are there any other checks from integration-tests or build-matrix that should be preserved?

---

## Appendix A: Full CI Job Source References

- `.github/workflows/ci.yaml:34-76` - bootstrap-verification
- `.github/workflows/ci.yaml:83-137` - config-validation
- `.github/workflows/ci.yaml:140-241` - build-matrix (DELETE)
- `.github/workflows/ci.yaml:242-306` - autowiring-validation
- `.github/workflows/ci.yaml:308-378` - secrets-workflow
- `.github/workflows/ci.yaml:380-441` - justfile-activation
- `.github/workflows/ci.yaml:443-530` - integration-tests (DELETE)
- `.github/workflows/ci.yaml:531-562` - existing-ci-integration (RENAME)

## Appendix B: Omnix Documentation References

- `/Users/crs58/projects/nix-workspace/omnix/doc/om/ci.md` - Primary om ci documentation
- `/Users/crs58/projects/nix-workspace/omnix/crates/omnix-ci/README.md` - Crate documentation
- Current config: `flake.nix:66-70`
- Example configs: [omnix](https://github.com/juspay/omnix/blob/main/nix/modules/om.nix), [services-flake](https://github.com/juspay/services-flake/blob/main/flake.nix), [nixos-flake](https://github.com/srid/nixos-flake/blob/main/flake.nix)

## Appendix C: CI Runtime Data (Run 18222560901)

Full job breakdown from successful run:
```
bootstrap-verification:    1m29s
config-validation:         1m14s
build-matrix (stibnite):   4m1s
build-matrix (blackphos):  4m4s
autowiring-validation:     2m38s
secrets-workflow:          1m37s
justfile-activation:       3m17s
integration-tests:        14m17s
existing-ci-integration:  12m44s

Total wallclock: ~15 minutes (parallel execution)
Longest job: integration-tests (14m17s)
```

What existing-ci-integration (om ci) built:
```
3x home-manager-generation
  - /nix/store/7j8n0bndmb9c6dbw6a45z8hq8yibvsdf-home-manager-generation
  - /nix/store/9p5qdacpbf3aw7srqshwxzzaipvzsskb-home-manager-generation
  - /nix/store/s3b622szmmqqb8im37ki52qzdjmczj2k-home-manager-generation

2x nixos-system
  - /nix/store/06dm0kqnxj53h0lv53sp3vlmnnaslq6x-nixos-system-blackphos-nixos-25.11.20250928.e9f00bd
  - /nix/store/0md17n7ybbf1n62lay43p7nfhvr0j6yr-nixos-system-stibnite-nixos-25.11.20250928.e9f00bd

Plus: checks, devShells, packages
```

This matches exactly what build-matrix and integration-tests build manually.

## Multi-system matrix enhancement (2025-10-03)

After consolidation, the `nix` job was enhanced to support all flake-defined systems using a matrix strategy.

### Previous single-system approach

```yaml
nix:
  runs-on: ubuntu-latest
  steps:
    - name: build all outputs via omnix
      run: nix develop --command om ci run --systems "x86_64-linux"
```

This only tested x86_64-linux, missing aarch64-linux and aarch64-darwin configurations.

### Matrix-based multi-system approach

```yaml
nix:
  strategy:
    fail-fast: false
    matrix:
      system:
        - x86_64-linux
        - aarch64-linux
        - aarch64-darwin
  runs-on: >-
    ${{ (matrix.system == 'x86_64-linux' && 'ubuntu-latest')
    || (matrix.system == 'aarch64-linux' && 'ubuntu-24.04-arm')
    || (matrix.system == 'aarch64-darwin' && 'macos-latest') }}
  steps:
    - name: build all outputs via omnix
      run: nix develop --command om ci run --systems "${{ matrix.system }}"
```

### Implementation details

**Pattern source:** Adapted from [nixpkgs-review-gha](https://github.com/Defelo/nixpkgs-review-gha) workflow.

**Runner mapping:**
- x86_64-linux → ubuntu-latest (standard GitHub-hosted)
- aarch64-linux → ubuntu-24.04-arm (requires org access to GitHub ARM runners)
- aarch64-darwin → macos-latest (10x more expensive)

**Key features:**
- `fail-fast: false` allows independent testing of each system
- Dynamic runner selection based on matrix.system
- Per-system Omnix execution: `om ci run --systems "${{ matrix.system }}"`
- Manual matrix definition for explicit control

### Benefits

1. **Native platform testing**: Darwin configs tested on macOS, Linux configs on Linux
2. **Architecture coverage**: Tests both x86_64 and aarch64 architectures
3. **Platform-specific validation**: Catches architecture-specific build issues
4. **Parallel execution**: All systems tested simultaneously (subject to runner availability)
5. **Fail isolation**: One system failure doesn't block others

### Runner availability considerations

**Always available:**
- ubuntu-latest (x86_64-linux)

**May require configuration:**
- macos-latest (aarch64-darwin): Available but expensive (~10x cost of Linux)
- ubuntu-24.04-arm (aarch64-linux): Requires organization access to GitHub ARM runners

If aarch64-linux runner is unavailable, options include:
1. Exclude from matrix (test only x86_64-linux and aarch64-darwin)
2. Use QEMU emulation on ubuntu-latest (slow but functional)
3. Add self-hosted ARM Linux runner
4. Use continue-on-error: true to allow failure without blocking CI

### Expected CI time impact

Assuming parallel runner availability:
- Wallclock time: ~13min (unchanged - jobs run in parallel)
- Total CPU time: 3x increase (3 systems × ~13min = ~39min total)
- Cost impact: Moderate increase due to macOS runner usage

If runners are limited and must run serially:
- Wallclock time: Up to 3x increase (~39min)

### Future enhancements

**Conditional matrix:** Add workflow inputs to selectively test systems
```yaml
matrix:
  system:
    - x86_64-linux
    - ${{ inputs.test-arm-linux && 'aarch64-linux' || '' }}
    - ${{ inputs.test-darwin && 'aarch64-darwin' || '' }}
```

**System-specific Omnix config:** Configure per-system build behavior in flake.nix
```nix
flake.om.ci.default = {
  ROOT.dir = ".";
  root.x86_64-linux.steps.custom = { };
  root.aarch64-darwin.steps.custom = { };
};
```

## Cachix push integration verification (2025-10-03)

After implementing the multi-system matrix, cachix push integration was added and verified for darwin builds to cache expensive aarch64-darwin outputs.

### Implementation

The darwin job was enhanced to push all build outputs and dependencies to cachix:

```yaml
- name: build all outputs via omnix
  run: |
    if [ "${{ matrix.system }}" = "aarch64-darwin" ]; then
      # darwin: build and push to cachix (including build deps for cache efficiency)
      nix develop --command om ci run --systems "${{ matrix.system }}" \
        --include-all-dependencies | tee /dev/stderr | cachix push ${{ env.CACHIX_BINARY_CACHE }}
    else
      # linux: just build (rebuilds are cheap)
      nix develop --command om ci run --systems "${{ matrix.system }}"
    fi
```

**Key decisions:**
- Push only for darwin builds (linux rebuilds are cheap and fast)
- Use `--include-all-dependencies` to cache build-time dependencies for efficiency
- Use `tee /dev/stderr` to show store paths being pushed while piping to cachix

### Verification results

**CI run:** [18233551532](https://github.com/cameronraysmith/nix-config/actions/runs/18233551532)

**Darwin job timing:**
- Started: 2025-10-03T20:53:54Z
- Completed: 2025-10-03T21:35:45Z
- Duration: 41 minutes 51 seconds
- Build step: 40 minutes 5 seconds

**Cachix push evidence:**
```
Pushing /nix/store/zpc59z7655i20caxly4j2nr4q2i5m1v0-pub-petitparser-7.0.1.drv (2.05 KiB)
Pushing /nix/store/zpkq18fs61353sz8vi72p8p06r59nx70-thumbpdf-3.17.drv (2.96 KiB)
[... hundreds of store paths ...]
Pushing /nix/store/zzigfbisy7jv1hr9d8nli8df24l1rph7-completion.zsh (2.85 KiB)

All done.
✅ all outputs built successfully for aarch64-darwin
```

**Local verification:**
```bash
$ just test-cachix
Testing cachix push/pull...
Built: /nix/store/ci364cgbwbpww272shfz5mj3y019r9fd-hello-2.12.2
Pushing to cachix...
✅ Push completed. Verify at: https://app.cachix.org/cache/cameronraysmith
```

### Success criteria met

- ✅ CI run completed without errors
- ✅ Darwin job showed cachix push activity in logs
- ✅ Hundreds of store paths (.drv files) successfully pushed
- ✅ No authentication or permission errors
- ✅ "All done." confirmation message from cachix
- ✅ Local test recipe (`just test-cachix`) works correctly

### Impact

**Build time:** Darwin builds take ~42 minutes vs ~5-7 minutes for linux builds, justifying the caching strategy.

**Cache efficiency:** Using `--include-all-dependencies` ensures build-time dependencies are cached, reducing cache misses for subsequent builds.

**Cost optimization:** By caching darwin builds, subsequent CI runs can pull from cache instead of rebuilding expensive derivations on costly macOS runners (~10x cost of linux).

### Related changes

**DevShell enhancement:**
- Added cachix to devShell packages (modules/flake-parts/devshell.nix:23)
- Enables local testing of cachix push functionality
- Cachix CLI available for manual cache operations

**Test recipe:**
- Added `just test-cachix` for local verification
- Tests push authentication and basic push/pull workflow
- Provides URL for manual cache inspection
