# CI/CD implementation agent handoff prompt

You are tasked with implementing a comprehensive CI/CD testing pipeline for a multi-user nix-config architecture. Your implementation will serve as an integration test baseline to validate the architecture design before local deployment.

## primary objective

Implement the CI/CD pipeline specified in `/Users/crs58/projects/nix-workspace/nix-config/docs/ci-implementation-prompt.md`, creating a nothing-but-nix GitHub Actions workflow that validates all 6 phases of the multi-user architecture migration plan.

## working context

**repository**: `/Users/crs58/projects/nix-workspace/nix-config`
**branch**: `00-multi` (experimental multi-user architecture)
**baseline branch**: `main` (current production config)

## required reading (in order)

### 1. primary specification (required)

Read `/Users/crs58/projects/nix-workspace/nix-config/docs/ci-implementation-prompt.md` completely. This document specifies:

- 8-job CI workflow structure
- nothing-but-nix setup pattern (from nixpkgs-review-gha reference)
- Testing requirements for each architecture phase
- Multi-user scenario validation
- Secrets workflow testing (with test keys)
- Bootstrap workflow verification
- gh CLI monitoring and debugging integration
- Performance requirements (< 15 min total)
- Complete justfile recipes for CI interaction

### 2. architecture context (secondary reference)

Skim `/Users/crs58/projects/nix-workspace/nix-config/docs/nix-config-architecture-analysis.md` section 4 (migration plan) to understand:

- The 6 phases being tested
- Why admin users use integrated home-manager
- Why non-admin users use standalone home-manager
- Configuration file structure expectations
- Autowiring via nixos-unified

### 3. reference implementation

Review `/Users/crs58/projects/nix-workspace/nixpkgs-review-gha/.github/actions/setup-nix/action.yml` to understand the nothing-but-nix pattern.

### 4. current baseline

Check `.github/workflows/ci.yaml` to understand what's being replaced.

## critical constraints

1. **implementation status**: the multi-user architecture is documented but NOT yet implemented
   - config.nix still treats users as aliases (not yet refactored)
   - standalone home-manager configs (configurations/home/user@host.nix) don't exist yet
   - CI should test the PLANNED architecture, not current state
   - Some jobs will fail until implementation catches up (this is expected)

2. **test-driven development**: write CI first, implementation follows
   - CI validates what SHOULD exist after implementation
   - Failures guide implementation work
   - Get CI working as integration test baseline ASAP

3. **no real secrets in CI**:
   - Use test age keys generated in CI
   - Test sops mechanics, not actual secret values
   - Never commit real secrets to repository

4. **performance target**: total CI runtime < 15 minutes with caching

5. **backward compatibility**: don't break existing om ci tooling

## implementation deliverables

### 1. .github/workflows/ci.yaml

Multi-job workflow with 8 jobs:
- bootstrap-verification
- config-validation
- build-matrix (darwin configs, home configs, nixos configs)
- autowiring-validation
- secrets-workflow
- justfile-activation
- integration-tests
- existing-ci-integration

Use nothing-but-nix pattern for setup. Reference the CI implementation prompt for complete job specifications.

### 2. justfile recipes

Add CI interaction recipes to `justfile`:
- test-ci-blocking: trigger and wait
- ci-status, ci-logs, ci-logs-failed: inspection
- ci-validate: comprehensive validation
- ci-debug-job: targeted debugging

Reference section 3 "monitoring and debugging workflow runs" in CI implementation prompt for complete recipe specifications.

### 3. scripts/ci/validate-run.sh

Automated CI validation script that:
- Checks all 8 required jobs passed
- Validates performance requirements
- Provides actionable error messages
- Exits non-zero on failure

Reference example 5 in CI implementation prompt for complete script.

### 4. .github/workflows/ci.yaml workflow_dispatch support

Enable manual workflow triggers with optional job selection for testing.

## implementation approach

### phase 1: understand and clarify (before writing code)

1. Read the CI implementation prompt completely
2. Review the architecture analysis migration plan (section 4)
3. Study the nixpkgs-review-gha reference pattern
4. Examine current CI and existing justfile
5. **Ask clarifying questions** about:
   - Any ambiguities in job specifications
   - Expected behavior when configs don't exist yet
   - Caching strategy preferences (cachix vs GitHub cache)
   - Darwin CI testing scope (expensive macOS runners)
   - Build matrix structure for configurations
   - Handling of missing configurations gracefully
   - Any other uncertainties before implementation

### phase 2: implement nothing-but-nix setup

Create the nix setup either as:
- Composite action in `.github/actions/setup-nix/action.yml`, OR
- Inline steps in workflow jobs

Use wimpysworld/nothing-but-nix for Linux, follow nixpkgs-review-gha pattern.

### phase 3: implement jobs incrementally

Start simple, add complexity:

1. **bootstrap-verification** (simplest, no nix configs needed)
2. **existing-ci-integration** (validates no regression)
3. **config-validation** (tests config.nix eval - will fail until refactored)
4. **autowiring-validation** (tests flake show output)
5. **build-matrix** (builds configs - may fail for missing configs)
6. **secrets-workflow** (test mechanics only)
7. **justfile-activation** (dry-run tests)
8. **integration-tests** (end-to-end scenarios)

### phase 4: add justfile recipes

Implement all recipes from section 3 of CI implementation prompt:
- test-ci-blocking
- ci-status, ci-logs, ci-logs-failed
- ci-validate
- ci-debug-job

### phase 5: create validation script

Implement `scripts/ci/validate-run.sh` per example 5 in CI implementation prompt.

### phase 6: test and iterate

1. Commit to 00-multi branch
2. Trigger workflow: `gh workflow run ci.yaml --ref 00-multi`
3. Monitor: `gh run watch --compact`
4. Debug failures: `gh run view <run-id> --log-failed`
5. Iterate until CI structure is solid (some job failures expected due to missing implementation)

## expected outcomes

### immediate (after implementation)

- CI workflow exists and runs
- Bootstrap and existing-ci jobs pass
- Other jobs may fail (missing configs, not yet refactored) - THIS IS OK
- CI serves as specification for what needs implementing
- Monitoring tools (justfile recipes) work

### after architecture implementation (future)

- All 8 jobs pass
- Multi-user scenarios validated
- Total runtime < 15 min
- CI catches configuration errors
- Serves as integration test baseline

## success criteria for THIS task

Your CI implementation is complete when:

1. ✅ `.github/workflows/ci.yaml` exists with 8 jobs
2. ✅ nothing-but-nix setup implemented
3. ✅ workflow_dispatch enabled for manual triggers
4. ✅ justfile recipes added and functional
5. ✅ scripts/ci/validate-run.sh created
6. ✅ CI can be triggered via `gh workflow run ci.yaml --ref 00-multi`
7. ✅ At minimum, bootstrap-verification and existing-ci-integration jobs pass
8. ✅ Other jobs run and report expected failures gracefully
9. ✅ Monitoring commands work: `gh run watch`, `just ci-status`, etc.
10. ✅ Changes committed to 00-multi branch with conventional commits

**Note**: It's OK if config-validation, build-matrix, autowiring-validation fail due to missing implementation. The CI is written test-driven style to guide future implementation.

## key files and paths

Reference files:
- `/Users/crs58/projects/nix-workspace/nix-config/docs/ci-implementation-prompt.md` - complete specification
- `/Users/crs58/projects/nix-workspace/nix-config/docs/nix-config-architecture-analysis.md` - architecture plan
- `/Users/crs58/projects/nix-workspace/nixpkgs-review-gha/.github/actions/setup-nix/action.yml` - nothing-but-nix reference

Current files:
- `.github/workflows/ci.yaml` - to be replaced
- `justfile` - to be enhanced with CI recipes
- `Makefile` - bootstrap targets (bootstrap, verify, setup-user)

Create:
- `.github/workflows/ci.yaml` - new multi-job workflow
- `scripts/ci/validate-run.sh` - validation script
- Optional: `.github/actions/setup-nix/action.yml` - if using composite action approach

## commands to get started

```bash
# navigate to repository
cd /Users/crs58/projects/nix-workspace/nix-config

# ensure on correct branch
git checkout 00-multi

# read primary specification
cat docs/ci-implementation-prompt.md

# read architecture context (section 4 specifically)
grep -A 100 "## 4\. migration plan" docs/nix-config-architecture-analysis.md

# review reference implementation
cat /Users/crs58/projects/nix-workspace/nixpkgs-review-gha/.github/actions/setup-nix/action.yml

# review current CI
cat .github/workflows/ci.yaml

# review current justfile for integration points
cat justfile | grep -A 5 "CI/CD"

# review Makefile bootstrap targets
cat Makefile | grep -A 3 "bootstrap:"
```

## clarifying questions guidance

Before implementation, consider asking about:

1. **Build matrix structure**: Should the build matrix be organized by config type (darwin/home/nixos) or as a flat list? How should missing configs be handled?

2. **Caching strategy**: Use cachix (requires CACHIX_AUTH_TOKEN secret) or GitHub Actions cache? Or both?

3. **Darwin testing**: Should darwin configs be built on linux (cross-platform validation) or skip darwin entirely due to expensive macOS runners?

4. **Failure handling**: Should jobs fail hard when configs don't exist yet, or gracefully skip with warnings?

5. **Job dependencies**: Should jobs run in parallel or have explicit dependencies (e.g., must autowiring-validation pass before build-matrix runs)?

6. **Composite action vs inline**: Preference for setup-nix as composite action (.github/actions/) or inline steps in each job?

7. **Test secrets location**: Should test secrets be in `test-secrets/` dir or inline in workflow?

8. **Validation script language**: Bash (as shown) or nix/just for consistency?

9. **Documentation**: Should `docs/ci-testing.md` be created now or deferred until CI is proven working?

10. **Workflow naming**: Should workflow be named "CI" or something more specific like "Multi-User Architecture CI"?

## execution instructions

1. **Read all required documentation** listed above
2. **Ask any clarifying questions** before starting implementation
3. **Implement incrementally** following the phase 1-6 approach
4. **Test early and often** using `gh workflow run` and monitoring commands
5. **Commit incrementally** with conventional commit messages
6. **Document any deviations** from the specification with rationale
7. **Report completion** with summary of what works and what's expected to fail

## final notes

- This CI is intentionally written test-driven style
- Some failures are expected and OK (they guide implementation)
- Focus on getting the CI structure right, not making everything pass
- The CI should clearly show what's missing in the architecture implementation
- Monitoring tools are as important as the tests themselves
- Performance matters: keep total runtime < 15 min

Good luck! Take your time to understand the specification completely before starting implementation. Ask clarifying questions. The better you understand the requirements, the smoother the implementation will be.
