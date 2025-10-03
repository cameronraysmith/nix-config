# CI/CD implementation prompt

## objective

Implement comprehensive CI/CD testing for the multi-user nix-config architecture using the nothing-but-nix pattern from nixpkgs-review-gha. The CI pipeline should validate all six phases of the architecture migration plan and serve as an integration test suite to avoid repeated local rebuilds during development.

## Omnix consolidation (2025-10-03)

The CI pipeline was consolidated to use Omnix as the primary build tool, eliminating redundant manual build jobs.

**Changes:**
- Deleted `build-matrix` job (redundant - manually built 2 nixos configs)
- Deleted `integration-tests` job (redundant - manually built nixos + home configs)
- Renamed `existing-ci-integration` → `nix` (now primary build job)
- Kept all validation jobs: `bootstrap-verification`, `config-validation`, `autowiring-validation`, `secrets-workflow`, `justfile-activation`

**Rationale:**
The `nix` job (running `om ci run --systems "x86_64-linux"`) already builds ALL configurations automatically:
- nixosConfigurations.* (all nixos configs)
- legacyPackages.x86_64-linux.homeConfigurations.* (all home configs)
- checks.x86_64-linux.* (pre-commit, etc.)
- devShells.x86_64-linux.* (dev environments)

The deleted jobs duplicated this work, adding ~22 minutes of redundant CPU time.

**Current architecture (6 jobs):**
1. `bootstrap-verification` - tests Makefile onboarding workflow
2. `config-validation` - validates multi-user architecture user definitions
3. `autowiring-validation` - verifies nixos-unified auto-discovery
4. `secrets-workflow` - tests sops-nix encryption/decryption
5. `justfile-activation` - tests justfile recipes and activation targets
6. `nix` - builds all flake outputs via Omnix (single source of truth)

**Benefits:**
- Automatic discovery of new configurations (no CI changes needed)
- Single source of truth for builds (Omnix)
- Reduced CI time: ~15min → ~13min wallclock
- 50% reduction in total CPU time
- Simplified maintenance (fewer jobs to update)

See `docs/omnix-ci-analysis.md` for complete analysis and implementation details.

## context

### current CI limitations

The existing `.github/workflows/ci.yaml` has significant gaps:

1. Only tests `om ci run --systems "x86_64-linux"` in devShell
2. Uses older maximize-build-space + cachix/install-nix-action pattern
3. No testing of:
   - Bootstrap workflow (make bootstrap, make verify, make setup-user)
   - Multi-user scenarios (admin vs non-admin patterns)
   - Configuration builds (darwin, nixos, standalone home-manager)
   - Secrets management (sops-nix integration)
   - Autowiring detection (nixos-unified automatic config discovery)
   - User onboarding workflows

### desired CI pattern: nothing-but-nix

Reference: `/Users/crs58/projects/nix-workspace/nixpkgs-review-gha/.github/actions/setup-nix/action.yml`

**key characteristics**:
- Pure nix-based setup without external GitHub Actions dependencies
- For Linux: uses `wimpysworld/nothing-but-nix@main` with rampage protocol
- For macOS: custom space reclamation (disable mds, rm cached files)
- Faster, more reproducible builds
- Better caching strategy via nix store
- build-dir in /nix as workaround for space issues

**implementation details**:
```yaml
# linux
- name: reclaim space (linux)
  if: runner.os == 'Linux'
  uses: wimpysworld/nothing-but-nix@main
  with:
    hatchet-protocol: rampage

# install nix with build-dir config
- name: install nix
  uses: cachix/install-nix-action@v31
  with:
    extra_nix_config: |
      build-dir = /nix/build
      sandbox = ${{ inputs.sandbox }}
      system = ${{ inputs.system }}

- name: create build-dir
  shell: bash
  run: sudo mkdir -p /nix/build
```

### architecture migration plan phases

Reference: `docs/nix-config-architecture-analysis.md` section 4

The CI must validate each phase of the planned architecture:

#### phase 1: config.nix refactoring

**tests required**:
- Verify user definitions (crs58, cameron, runner, raquel)
- Validate backward compatibility (me = crs58)
- Check nix evaluation succeeds:
  ```bash
  nix eval .#flake.config.crs58.username  # "crs58"
  nix eval .#flake.config.cameron.username  # "cameron"
  nix eval .#flake.config.runner.username  # "runner"
  nix eval .#flake.config.raquel.username  # "raquel"
  nix eval .#flake.config.me.username  # "crs58" (backward compat)
  ```

#### phase 2: darwin configuration validation

**tests required**:
- Build darwin configs for both hosts:
  ```bash
  nix build .#darwinConfigurations.stibnite.system
  nix build .#darwinConfigurations.blackphos.system
  ```
- Verify single admin user per host:
  ```bash
  # check only crs58 in stibnite
  nix eval .#darwinConfigurations.stibnite.config.home-manager.users --apply builtins.attrNames

  # check only cameron in blackphos
  nix eval .#darwinConfigurations.blackphos.config.home-manager.users --apply builtins.attrNames
  ```

#### phase 3: home module structure

**tests required**:
- Verify module files exist:
  - `modules/home/darwin-only.nix`
  - `modules/home/standalone.nix`
  - `modules/home/default.nix`
- Test module imports evaluate correctly
- Validate shared configuration applies to all users

#### phase 4: standalone home-manager configs

**tests required**:
- Verify autowiring detects standalone configs:
  ```bash
  nix flake show | grep "runner@stibnite"
  nix flake show | grep "runner@blackphos"
  nix flake show | grep "raquel@blackphos"
  ```
- Build standalone home-manager configs:
  ```bash
  nix build .#homeConfigurations."runner@stibnite".activationPackage
  nix build .#homeConfigurations."runner@blackphos".activationPackage
  nix build .#homeConfigurations."raquel@blackphos".activationPackage
  ```
- Validate independence (no cross-user dependencies)

#### phase 5: activation workflow (justfile)

**tests required**:
- Verify justfile activate recipe exists
- Test auto-detection logic (parse current hostname/user)
- Validate explicit targets work:
  ```bash
  just -n activate stibnite
  just -n activate runner@stibnite
  ```
- Check sudo requirement detection (admin vs non-admin)

#### phase 6: nixos extension

**tests required**:
- Build nixos configurations (if present):
  ```bash
  nix build .#nixosConfigurations.orb-nixos.config.system.build.toplevel
  ```
- Validate nixos standalone home configs (if created)
- Ensure linux-only modules don't break darwin builds

### bootstrap workflow validation

**tests required**:

1. **makefile targets**:
   ```bash
   # test on ubuntu-latest (clean environment)
   make bootstrap  # install nix, direnv, essential tools
   make verify     # check installation succeeded
   make setup-user # generate age keys for sops-nix
   ```

2. **verification checks**:
   - Nix installed and in PATH
   - Direnv configured
   - Age keys generated at `~/.config/sops/age/keys.txt`
   - DevShell tools available (om, just, sops)

3. **environment validation**:
   ```bash
   nix develop --command which om
   nix develop --command which just
   nix develop --command which sops
   nix develop --command which age
   ```

### secrets management testing

**critical**: test sops-nix mechanics without exposing real secrets

**tests required**:

1. **age key generation**:
   ```bash
   age-keygen -o test-key.txt
   cat test-key.txt  # verify format
   ```

2. **.sops.yaml creation rules**:
   - Create test .sops.yaml with test keys
   - Verify creation_rules structure
   - Test key_groups definition

3. **encryption/decryption workflow**:
   ```bash
   # create test secret file
   echo "test: secret-value" > test-secret.yaml

   # encrypt with test age key
   sops -e --age $(age-keygen -y test-key.txt) test-secret.yaml > encrypted.yaml

   # verify can decrypt
   SOPS_AGE_KEY_FILE=test-key.txt sops -d encrypted.yaml
   ```

4. **content-based naming (just hash-encrypt)**:
   ```bash
   # create test file
   echo "sensitive data" > test-file.txt

   # test hash-encrypt logic (may need to mock/dry-run)
   just -n hash-encrypt test-file.txt
   ```

5. **secrets validation**:
   ```bash
   # validate all secrets decrypt (with test secrets)
   just validate-secrets
   ```

**important**: use test keys and test secrets only. Never commit real secrets to CI environment.

### multi-user scenario integration tests

Simulate end-to-end workflows for both admin and non-admin users.

#### scenario 1: admin user on darwin (crs58@stibnite)

```bash
# configuration should exist
ls configurations/darwin/stibnite.nix

# should build successfully
nix build .#darwinConfigurations.stibnite.system

# activation package available
nix build .#darwinConfigurations.stibnite.config.system.build.toplevel

# justfile can target it
just -n activate stibnite
```

#### scenario 2: non-admin user on darwin (runner@stibnite)

```bash
# configuration should exist
ls configurations/home/runner@stibnite.nix

# should build without sudo
nix build .#homeConfigurations."runner@stibnite".activationPackage

# justfile can target it
just -n activate runner@stibnite

# verify no system-level dependencies
# (home-manager config should be self-contained)
```

#### scenario 3: same user on multiple hosts (runner@stibnite, runner@blackphos)

```bash
# both configs exist
ls configurations/home/runner@stibnite.nix
ls configurations/home/runner@blackphos.nix

# both build independently
nix build .#homeConfigurations."runner@stibnite".activationPackage
nix build .#homeConfigurations."runner@blackphos".activationPackage

# verify configs are independent (different customizations allowed)
diff configurations/home/runner@{stibnite,blackphos}.nix || true
```

#### scenario 4: complete user onboarding workflow

Simulate a new user (raquel) being added to blackphos:

```bash
# 1. user generates age key (simulated in CI)
age-keygen -o raquel-key.txt

# 2. configuration exists
ls configurations/home/raquel@blackphos.nix

# 3. .sops.yaml includes user's age public key
grep -q "$(age-keygen -y raquel-key.txt)" .sops.yaml

# 4. user can build their config
nix build .#homeConfigurations."raquel@blackphos".activationPackage

# 5. activation works without sudo
just -n activate raquel@blackphos
```

## CI workflow structure

Recommended job organization for fast feedback and comprehensive coverage:

### job 1: bootstrap-verification

**purpose**: validate Makefile bootstrap workflow on clean system

**runner**: ubuntu-latest

**steps**:
1. Checkout repository
2. Run `make bootstrap`
3. Verify nix installed: `which nix`
4. Verify direnv configured
5. Run `make verify`
6. Run `make setup-user`
7. Verify age key generated

**success criteria**:
- All make targets succeed
- Environment ready for nix development
- Age keys present at expected location

### job 2: config-validation

**purpose**: test config.nix refactoring (phase 1)

**runner**: ubuntu-latest with nothing-but-nix setup

**steps**:
1. Setup nix (nothing-but-nix pattern)
2. Checkout repository
3. Enter devShell: `nix develop`
4. Run user definition validation:
   ```bash
   nix eval .#flake.config.crs58.username
   nix eval .#flake.config.cameron.username
   nix eval .#flake.config.runner.username
   nix eval .#flake.config.raquel.username
   nix eval .#flake.config.me.username  # backward compat
   ```

**success criteria**:
- All user definitions evaluate correctly
- Backward compatibility maintained (me = crs58)

### job 3: build-matrix

**purpose**: build all configurations (phases 2, 4)

**runner**: ubuntu-latest with nothing-but-nix setup

**strategy**:
```yaml
strategy:
  fail-fast: false
  matrix:
    config:
      # darwin configurations (admin users with integrated HM)
      - type: darwin
        name: stibnite
        target: darwinConfigurations.stibnite.system
      - type: darwin
        name: blackphos
        target: darwinConfigurations.blackphos.system

      # standalone home-manager configurations (non-admin users)
      - type: home
        name: runner@stibnite
        target: homeConfigurations."runner@stibnite".activationPackage
      - type: home
        name: runner@blackphos
        target: homeConfigurations."runner@blackphos".activationPackage
      - type: home
        name: raquel@blackphos
        target: homeConfigurations."raquel@blackphos".activationPackage

      # nixos configurations (if present)
      - type: nixos
        name: orb-nixos
        target: nixosConfigurations.orb-nixos.config.system.build.toplevel
```

**steps**:
1. Setup nix (nothing-but-nix pattern)
2. Checkout repository
3. Setup cachix (optional, for speed)
4. Build configuration: `nix build .#${{ matrix.config.target }}`
5. Report build size/time

**success criteria**:
- All configurations build successfully
- No evaluation errors
- Reasonable build times (< 10 min per config)

### job 4: autowiring-validation

**purpose**: verify nixos-unified automatic config discovery (phase 4)

**runner**: ubuntu-latest with nothing-but-nix setup

**steps**:
1. Setup nix
2. Checkout repository
3. Run `nix flake show`
4. Verify outputs detected:
   ```bash
   nix flake show | grep -q "darwinConfigurations.stibnite"
   nix flake show | grep -q "darwinConfigurations.blackphos"
   nix flake show | grep -q 'homeConfigurations."runner@stibnite"'
   nix flake show | grep -q 'homeConfigurations."runner@blackphos"'
   nix flake show | grep -q 'homeConfigurations."raquel@blackphos"'
   ```

**success criteria**:
- All expected configurations auto-discovered
- No unexpected configurations present
- Flake metadata is valid

### job 5: secrets-workflow

**purpose**: test sops-nix integration without real secrets (phase testing)

**runner**: ubuntu-latest with nothing-but-nix setup

**steps**:
1. Setup nix
2. Checkout repository
3. Generate test age key:
   ```bash
   age-keygen -o test-key.txt
   TEST_AGE_PUBLIC=$(age-keygen -y test-key.txt)
   ```
4. Create test .sops.yaml:
   ```yaml
   creation_rules:
     - path_regex: test-secrets/.*\.yaml$
       key_groups:
         - age:
           - $TEST_AGE_PUBLIC
   ```
5. Create and encrypt test secret:
   ```bash
   mkdir -p test-secrets
   echo "test: secret-value" > test-secrets/test.yaml
   SOPS_AGE_KEY_FILE=test-key.txt sops -e -i test-secrets/test.yaml
   ```
6. Verify decryption:
   ```bash
   SOPS_AGE_KEY_FILE=test-key.txt sops -d test-secrets/test.yaml | grep -q "test: secret-value"
   ```
7. Test hash-encrypt logic (dry-run if needed)
8. Validate existing secrets structure (without decrypting real secrets)

**success criteria**:
- Test encryption/decryption works
- Sops-nix mechanics validated
- No real secrets exposed

### job 6: justfile-activation

**purpose**: test activation workflow auto-detection (phase 5)

**runner**: ubuntu-latest with nothing-but-nix setup

**steps**:
1. Setup nix
2. Checkout repository
3. Enter devShell: `nix develop`
4. Test activation targets (dry-run):
   ```bash
   just -n activate stibnite
   just -n activate blackphos
   just -n activate runner@stibnite
   just -n activate runner@blackphos
   just -n activate raquel@blackphos
   ```
5. Verify auto-detection logic (if implemented)

**success criteria**:
- All explicit targets work
- Dry-run shows expected activation commands
- Auto-detection logic functions correctly

### job 7: integration-tests

**purpose**: end-to-end multi-user scenarios

**runner**: ubuntu-latest with nothing-but-nix setup

**steps**:
1. Setup nix
2. Checkout repository
3. Run scenario 1 (admin user - crs58@stibnite)
4. Run scenario 2 (non-admin user - runner@stibnite)
5. Run scenario 3 (same user different hosts - runner@*)
6. Run scenario 4 (new user onboarding - raquel@blackphos)
7. Verify no cross-user dependencies
8. Check documentation examples build

**success criteria**:
- All scenarios complete successfully
- Multi-user independence verified
- Documentation examples accurate

### job 8: existing-ci-integration

**purpose**: maintain existing om ci tooling

**runner**: ubuntu-latest with nothing-but-nix setup

**steps**:
1. Setup nix
2. Checkout repository
3. Run existing CI: `nix develop --command om ci run --systems "x86_64-linux"`

**success criteria**:
- Existing om ci checks pass
- No regression in current CI coverage

## performance requirements

- **total CI time**: target < 15 minutes for all jobs (with caching)
- **fail fast**: config-validation and bootstrap-verification should run first (< 3 min)
- **parallel execution**: build-matrix should run jobs in parallel
- **caching strategy**:
  - Use cachix for nix store caching (optional but recommended)
  - Cache age keys between jobs where safe
  - Cache devShell builds

## implementation requirements

1. **use nothing-but-nix pattern**:
   - Linux: `wimpysworld/nothing-but-nix@main` with rampage protocol
   - macOS: custom space reclamation (if darwin CI needed)
   - Pure nix setup, minimize external actions

2. **test on linux primarily**:
   - ubuntu-latest for all jobs
   - darwin testing optional (expensive GitHub macOS runners)
   - darwin configs can build on linux (cross-platform validation)

3. **comprehensive but fast**:
   - Prioritize fast feedback (validation jobs first)
   - Use build matrix for parallel config builds
   - Cache aggressively

4. **actionable errors**:
   - Clear job names indicating what failed
   - Specific error messages for each validation
   - Links to relevant documentation on failure

5. **secrets safety**:
   - Never use real secrets in CI
   - Test sops mechanics with test keys only
   - Validate .sops.yaml structure without decryption

6. **integrate with existing tooling**:
   - Preserve om ci integration where applicable
   - Support justfile commands in CI
   - Leverage Makefile targets for bootstrap

## deliverables

### 1. updated .github/workflows/ci.yaml

Replace current CI with multi-job workflow implementing all phases above.

**key sections**:
- setup-nix composite action (or inline steps) using nothing-but-nix
- 8 jobs as specified above
- build matrix for configurations
- proper caching strategy
- clear job dependencies and ordering

### 2. justfile CI integration recipe

Create a new justfile recipe for triggering CI workflows locally or remotely:

```just
# trigger CI workflow via GitHub API
test-ci workflow="ci.yaml":
    gh workflow run {{workflow}} --ref $(git branch --show-current)

# trigger specific CI job (if supported by workflow dispatch)
test-ci-job workflow="ci.yaml" job="build-matrix":
    gh workflow run {{workflow}} --ref $(git branch --show-current) -f job={{job}}

# watch CI workflow progress
watch-ci:
    gh run watch

# list recent CI runs
list-ci:
    gh run list --workflow=ci.yaml --limit 10
```

**requirements**:
- Use `gh workflow run` with all required parameters
- Support triggering from current branch
- Enable workflow_dispatch for manual triggers
- Provide commands for monitoring CI progress

### 3. monitoring and debugging workflow runs

Comprehensive guidance for using `gh` CLI to inspect workflow execution logs and identify issues.

#### triggering workflows

```bash
# trigger CI workflow on current branch
gh workflow run ci.yaml --ref $(git branch --show-current)

# trigger with specific inputs (if workflow supports workflow_dispatch inputs)
gh workflow run ci.yaml --ref 00-multi -f job=build-matrix

# trigger on specific branch
gh workflow run ci.yaml --ref main
```

#### monitoring runs in real-time

```bash
# watch the most recent run until completion
gh run watch

# watch specific run by ID
gh run watch 12345678

# watch in compact mode (only show relevant/failed steps)
gh run watch --compact

# watch with custom refresh interval (default: 3 seconds)
gh run watch --interval 5

# exit with non-zero status if run fails (useful for scripts)
gh run watch --exit-status

# chain commands to run after completion
gh run watch && notify-send "CI run completed!"
```

#### listing and finding runs

```bash
# list recent runs for ci.yaml workflow
gh run list --workflow=ci.yaml --limit 10

# list runs for current branch only
gh run list --branch $(git branch --show-current) --limit 20

# list runs by status
gh run list --status=failure --limit 10
gh run list --status=in_progress
gh run list --status=completed

# list runs by specific commit
gh run list --commit abc123def --limit 5

# list runs triggered by specific user
gh run list --user crs58

# list runs from specific event type
gh run list --event workflow_dispatch
gh run list --event push

# combine filters for precise queries
gh run list --workflow=ci.yaml --branch=00-multi --status=failure --limit 5
```

#### viewing run details and logs

```bash
# view summary of most recent run (interactive selection)
gh run view

# view specific run by ID
gh run view 12345678

# view with verbose output (show all job steps)
gh run view 12345678 --verbose

# view specific run attempt (for re-runs)
gh run view 12345678 --attempt 2

# open run in browser
gh run view 12345678 --web

# exit with non-zero if run failed (useful for validation)
gh run view 12345678 --exit-status && echo "Run passed!"
```

#### inspecting job logs

```bash
# view specific job within a run
gh run view 12345678 --job 987654321

# view full log for entire run
gh run view 12345678 --log

# view full log for specific job
gh run view 12345678 --job 987654321 --log

# view only failed steps' logs (critical for debugging)
gh run view 12345678 --log-failed

# view failed logs for specific job
gh run view 12345678 --job 987654321 --log-failed
```

#### json output for scripting

```bash
# get run details as JSON
gh run view 12345678 --json status,conclusion,jobs,url

# get all runs as JSON
gh run list --workflow=ci.yaml --json databaseId,status,conclusion,headBranch --limit 5

# filter JSON with jq
gh run view 12345678 --json jobs --jq '.jobs[] | select(.conclusion == "failure") | {name, conclusion}'

# list all failed jobs across recent runs
gh run list --workflow=ci.yaml --status=failure --limit 10 --json databaseId,conclusion,url \
  --jq '.[] | {id: .databaseId, status: .conclusion, url: .url}'

# check if specific job passed in latest run
gh run list --workflow=ci.yaml --limit 1 --json jobs \
  --jq '.[] | .jobs[] | select(.name == "build-matrix") | .conclusion'
```

#### downloading artifacts

```bash
# download all artifacts from a run
gh run download 12345678

# download specific artifact by name
gh run download 12345678 --name build-logs

# download multiple specific artifacts
gh run download 12345678 --name build-logs --name test-results

# download artifacts matching pattern
gh run download 12345678 --pattern "test-*"

# download to specific directory
gh run download 12345678 --dir ./ci-artifacts/
```

#### debugging CI failures workflow

When a CI run fails, use this systematic approach:

```bash
# 1. list recent failed runs
gh run list --workflow=ci.yaml --status=failure --limit 5

# 2. view summary of failed run
gh run view <run-id> --verbose

# 3. identify which job(s) failed
gh run view <run-id> --json jobs --jq '.jobs[] | select(.conclusion == "failure") | {name, conclusion, steps: [.steps[] | select(.conclusion == "failure") | .name]}'

# 4. view logs for failed steps only
gh run view <run-id> --log-failed

# 5. view full log for specific failed job
gh run view <run-id> --job <job-id> --log

# 6. download artifacts if available (for deeper inspection)
gh run download <run-id>

# 7. check if issue persists across multiple runs
gh run list --workflow=ci.yaml --status=failure --json databaseId,headBranch,conclusion --limit 10 \
  --jq '.[] | {run: .databaseId, branch: .headBranch, status: .conclusion}'
```

#### practical examples for multi-user CI

**example 1: debug build-matrix job failure**

```bash
# trigger run
gh workflow run ci.yaml --ref 00-multi

# watch it (will exit when done or failed)
gh run watch --exit-status

# if it failed, find the run ID
RUN_ID=$(gh run list --workflow=ci.yaml --limit 1 --json databaseId --jq '.[0].databaseId')

# view which matrix configuration failed
gh run view $RUN_ID --json jobs \
  --jq '.jobs[] | select(.name | contains("build-matrix")) | {name, conclusion, matrix: .strategy}'

# view logs for failed build-matrix job
gh run view $RUN_ID --log-failed | grep -A 20 "build-matrix"

# get specific job ID for detailed inspection
JOB_ID=$(gh run view $RUN_ID --json jobs \
  --jq '.jobs[] | select(.name | contains("build-matrix") and .conclusion == "failure") | .databaseId' \
  | head -1)

# view full log for that specific job
gh run view --job $JOB_ID --log
```

**example 2: validate all architecture phases passed**

```bash
# get latest run
RUN_ID=$(gh run list --workflow=ci.yaml --limit 1 --json databaseId --jq '.[0].databaseId')

# check all jobs succeeded
gh run view $RUN_ID --json jobs --jq '.jobs[] | {name, conclusion}' | grep -v success && echo "Some jobs failed!" || echo "All jobs passed!"

# verify specific phase jobs
for job in "bootstrap-verification" "config-validation" "build-matrix" "autowiring-validation" "secrets-workflow" "justfile-activation" "integration-tests" "existing-ci-integration"; do
  CONCLUSION=$(gh run view $RUN_ID --json jobs --jq ".jobs[] | select(.name == \"$job\") | .conclusion")
  echo "$job: $CONCLUSION"
done
```

**example 3: compare runs across branches**

```bash
# compare main vs 00-multi CI status
echo "main branch:"
gh run list --branch=main --workflow=ci.yaml --limit 1 --json status,conclusion,url

echo "00-multi branch:"
gh run list --branch=00-multi --workflow=ci.yaml --limit 1 --json status,conclusion,url

# identify differences in job outcomes
gh run list --branch=main --workflow=ci.yaml --limit 1 --json jobs \
  --jq '.[] | .jobs[] | {name, conclusion}' > /tmp/main-jobs.json

gh run list --branch=00-multi --workflow=ci.yaml --limit 1 --json jobs \
  --jq '.[] | .jobs[] | {name, conclusion}' > /tmp/00-multi-jobs.json

diff /tmp/main-jobs.json /tmp/00-multi-jobs.json
```

**example 4: track CI performance over time**

```bash
# get build times for recent runs
gh run list --workflow=ci.yaml --limit 10 --json databaseId,createdAt,updatedAt,conclusion \
  --jq '.[] | {run: .databaseId, duration: (.updatedAt | fromdateiso8601) - (.createdAt | fromdateiso8601), status: .conclusion}'

# find slowest job in latest run
RUN_ID=$(gh run list --workflow=ci.yaml --limit 1 --json databaseId --jq '.[0].databaseId')

gh run view $RUN_ID --json jobs \
  --jq '.jobs | sort_by(.completedAt - .startedAt) | reverse | .[] | {name, duration_seconds: (.completedAt | fromdateiso8601) - (.startedAt | fromdateiso8601)}'
```

**example 5: automated CI validation script**

```bash
#!/usr/bin/env bash
# scripts/ci/validate-run.sh
# Validate CI run completed successfully with all required jobs

set -euo pipefail

RUN_ID="${1:-$(gh run list --workflow=ci.yaml --limit 1 --json databaseId --jq '.[0].databaseId')}"

echo "Validating CI run: $RUN_ID"

# check overall status
STATUS=$(gh run view "$RUN_ID" --json status --jq '.status')
CONCLUSION=$(gh run view "$RUN_ID" --json conclusion --jq '.conclusion')

echo "Status: $STATUS"
echo "Conclusion: $CONCLUSION"

if [[ "$CONCLUSION" != "success" ]]; then
  echo "❌ Run failed or incomplete"

  # show failed jobs
  echo "Failed jobs:"
  gh run view "$RUN_ID" --json jobs \
    --jq '.jobs[] | select(.conclusion != "success") | {name, conclusion}'

  # show failed logs
  echo "Failed steps:"
  gh run view "$RUN_ID" --log-failed

  exit 1
fi

# verify all required jobs present and passed
REQUIRED_JOBS=(
  "bootstrap-verification"
  "config-validation"
  "build-matrix"
  "autowiring-validation"
  "secrets-workflow"
  "justfile-activation"
  "integration-tests"
  "existing-ci-integration"
)

MISSING_JOBS=()
FAILED_JOBS=()

for job in "${REQUIRED_JOBS[@]}"; do
  JOB_CONCLUSION=$(gh run view "$RUN_ID" --json jobs \
    --jq ".jobs[] | select(.name == \"$job\") | .conclusion" || echo "missing")

  if [[ "$JOB_CONCLUSION" == "missing" ]]; then
    MISSING_JOBS+=("$job")
  elif [[ "$JOB_CONCLUSION" != "success" ]]; then
    FAILED_JOBS+=("$job")
  fi
done

if [[ ${#MISSING_JOBS[@]} -gt 0 ]]; then
  echo "❌ Missing required jobs: ${MISSING_JOBS[*]}"
  exit 1
fi

if [[ ${#FAILED_JOBS[@]} -gt 0 ]]; then
  echo "❌ Failed required jobs: ${FAILED_JOBS[*]}"
  exit 1
fi

echo "✅ All required jobs passed successfully"

# check performance requirement (< 15 min)
CREATED=$(gh run view "$RUN_ID" --json createdAt --jq '.createdAt | fromdateiso8601')
UPDATED=$(gh run view "$RUN_ID" --json updatedAt --jq '.updatedAt | fromdateiso8601')
DURATION=$((UPDATED - CREATED))

echo "Total duration: $((DURATION / 60)) minutes $((DURATION % 60)) seconds"

if [[ $DURATION -gt 900 ]]; then  # 15 minutes
  echo "⚠️  Warning: Run exceeded 15-minute target ($((DURATION / 60))m)"
fi

echo "✅ CI validation complete"
```

#### integration with justfile

Add these enhanced recipes to the justfile:

```just
# trigger CI and wait for result
test-ci-blocking workflow="ci.yaml":
    #!/usr/bin/env bash
    set -euo pipefail

    echo "Triggering workflow: {{workflow}} on branch: $(git branch --show-current)"
    gh workflow run {{workflow}} --ref $(git branch --show-current)

    # wait a moment for run to start
    sleep 5

    # get the latest run ID
    RUN_ID=$(gh run list --workflow={{workflow}} --limit 1 --json databaseId --jq '.[0].databaseId')

    echo "Watching run: $RUN_ID"
    gh run watch "$RUN_ID" --exit-status

# view latest CI run details
ci-status workflow="ci.yaml":
    @gh run list --workflow={{workflow}} --limit 1 --json status,conclusion,url

# view latest CI run logs
ci-logs workflow="ci.yaml":
    @RUN_ID=$(gh run list --workflow={{workflow}} --limit 1 --json databaseId --jq '.[0].databaseId'); \
    gh run view "$RUN_ID" --log

# view only failed logs from latest run
ci-logs-failed workflow="ci.yaml":
    @RUN_ID=$(gh run list --workflow={{workflow}} --limit 1 --json databaseId --jq '.[0].databaseId'); \
    gh run view "$RUN_ID" --log-failed

# validate latest CI run comprehensively
ci-validate workflow="ci.yaml":
    @./scripts/ci/validate-run.sh $(gh run list --workflow={{workflow}} --limit 1 --json databaseId --jq '.[0].databaseId')

# debug specific failed job
ci-debug-job workflow="ci.yaml" job_name="build-matrix":
    @RUN_ID=$(gh run list --workflow={{workflow}} --limit 1 --json databaseId --jq '.[0].databaseId'); \
    JOB_ID=$(gh run view "$RUN_ID" --json jobs --jq ".jobs[] | select(.name == \"{{job_name}}\") | .databaseId"); \
    gh run view --job "$JOB_ID" --log
```

### 4. CI documentation

Create or update `docs/ci-testing.md` with:
- Overview of CI structure and jobs
- How to run CI locally (nix build commands)
- How to trigger CI remotely (gh workflow run)
- Troubleshooting common CI failures
- How to add new configurations to build matrix

### 4. validation scripts (optional)

Consider creating scripts in `scripts/ci/` for:
- validate-config.sh: run config.nix validation checks
- validate-secrets.sh: test sops workflow with test keys
- simulate-bootstrap.sh: test bootstrap workflow in container

These can be called by CI jobs and run locally for development.

## testing and validation

Before considering CI implementation complete:

1. **local validation**:
   - Run each CI job's commands locally
   - Verify all nix builds succeed
   - Test justfile CI triggers work

2. **CI validation**:
   - Trigger CI on test branch
   - Verify all jobs pass
   - Check total runtime meets performance requirements
   - Validate error messages are actionable

3. **integration validation**:
   - Test CI detects actual configuration errors
   - Verify secrets validation catches issues
   - Ensure bootstrap workflow validated correctly

4. **documentation validation**:
   - All CI examples in README work
   - Architecture doc examples tested by CI
   - Onboarding guide workflows validated

## success criteria

CI implementation is complete when:

1. All 8 jobs implemented and passing
2. Total CI runtime < 15 minutes (with caching)
3. justfile test-ci recipe works for triggering runs
4. CI validates all 6 architecture phases
5. Bootstrap workflow tested end-to-end
6. Multi-user scenarios validated
7. Secrets workflow mechanics tested (with test keys)
8. Documentation updated with CI usage
9. No regression in existing om ci coverage
10. CI serves as integration test baseline for implementation

## key files to reference

- **current CI**: `.github/workflows/ci.yaml`
- **reference pattern**: `/Users/crs58/projects/nix-workspace/nixpkgs-review-gha/.github/actions/setup-nix/action.yml`
- **architecture plan**: `docs/nix-config-architecture-analysis.md` (section 4: migration plan)
- **example configs**: all files in `configurations/{darwin,home,nixos}/`
- **bootstrap infrastructure**: `Makefile` (verify, setup-user, check-secrets targets)
- **activation workflow**: `justfile` (existing recipes + new CI triggers)
- **secrets setup**: `.sops.yaml`, `docs/sops-quick-reference.md`

## notes and constraints

1. **darwin CI**: testing darwin activation requires macOS runners (expensive). Focus on building darwin configs on linux (cross-platform validation sufficient for now).

2. **secrets in CI**: use test keys generated in CI, never commit real age keys or secrets to repository or CI environment.

3. **backward compatibility**: CI should pass on current main branch before merging 00-multi changes.

4. **incremental implementation**: consider implementing jobs incrementally:
   - Phase 1: bootstrap-verification, config-validation
   - Phase 2: build-matrix, autowiring-validation
   - Phase 3: secrets-workflow, justfile-activation
   - Phase 4: integration-tests, existing-ci-integration

5. **caching strategy**: use cachix if CACHIX_AUTH_TOKEN secret available, otherwise rely on GitHub Actions cache.

6. **workflow triggers**: support both automatic (push to main, PR) and manual (workflow_dispatch) triggers for flexibility.

## implementation workflow

Recommended approach for implementing this CI system:

1. **analyze nixpkgs-review-gha pattern**:
   - Study the nothing-but-nix setup
   - Understand space reclamation strategies
   - Extract reusable patterns

2. **design multi-phase CI workflow**:
   - Sketch job dependencies
   - Determine parallel vs sequential execution
   - Plan caching strategy

3. **implement nothing-but-nix setup**:
   - Create composite action or inline steps
   - Test nix installation and build-dir config
   - Validate space reclamation works

4. **implement jobs incrementally**:
   - Start with bootstrap-verification (simplest)
   - Add config-validation
   - Expand to build-matrix
   - Add remaining jobs

5. **create justfile CI triggers**:
   - Implement test-ci recipe
   - Test gh workflow run integration
   - Add monitoring commands

6. **comprehensive testing**:
   - Run all jobs on test branch
   - Validate performance requirements
   - Verify error messages actionable
   - Check documentation accuracy

7. **document and iterate**:
   - Write CI documentation
   - Update README with CI badges/status
   - Refine based on actual CI runs

## get started

To begin implementation:

```bash
# review reference implementation
cat /Users/crs58/projects/nix-workspace/nixpkgs-review-gha/.github/actions/setup-nix/action.yml

# review current CI
cat .github/workflows/ci.yaml

# study architecture plan
cat docs/nix-config-architecture-analysis.md

# review configurations to test
ls -R configurations/

# test bootstrap workflow locally
make bootstrap
make verify
make setup-user

# test configuration builds locally
nix build .#darwinConfigurations.stibnite.system
nix build .#homeConfigurations."runner@stibnite".activationPackage

# begin CI implementation
# start with .github/workflows/ci.yaml redesign
```

The CI system you build will be the integration test baseline, preventing the need to repeatedly rebuild local systems during multi-user architecture implementation. Get it working first, then use it to validate each phase of the migration plan.
