#!/usr/bin/env bash
set -euo pipefail

subject="$(command -v stack-land)"
scratch_parent="${TMPDIR:?}/stack-land-test"
mkdir -p "$scratch_parent"
scratch="$(mktemp -d "$scratch_parent/run.XXXXXX")"
trap 'chmod -R u+w "$scratch" 2>/dev/null || true; command rm -rf "$scratch"' EXIT

remote="$scratch/remote.git"
work="$scratch/work"
forge="$scratch/forge"
fake_bin="$scratch/bin"
mkdir -p "$forge/checks" "$fake_bin"

export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_ALLOW_PROTOCOL=file
git_trace="$scratch/git-trace"
forge_trace="$scratch/forge-trace"
failures=0

git init --quiet --bare --initial-branch=main "$remote"
git init --quiet --initial-branch=main "$work"
git -C "$work" config user.name "Stack Landing Test"
git -C "$work" config user.email "stack-landing@example.invalid"
git -C "$work" remote add origin "$remote"

commit_file() {
  local filename="$1"
  local content="$2"
  local subject_line="$3"
  local change_id="${4:-}"
  printf '%s\n' "$content" >"$work/$filename"
  git -C "$work" add "$filename"
  if [[ -n "$change_id" ]]; then
    git -C "$work" commit --quiet -m "$subject_line" -m "Change-Id: $change_id"
  else
    git -C "$work" commit --quiet -m "$subject_line"
  fi
}

commit_file base.txt base base
base_sha="$(git -C "$work" rev-parse HEAD)"
git -C "$work" push --quiet origin HEAD:main

git -C "$work" switch --quiet -c stack
commit_file lower.txt lower lower I1111111111111111111111111111111111111111
commit_file upper.txt upper upper I2222222222222222222222222222222222222222
tip_sha="$(git -C "$work" rev-parse HEAD)"

git -C "$work" switch --quiet -c missing-trailer "$base_sha"
commit_file missing.txt missing missing
missing_sha="$(git -C "$work" rev-parse HEAD)"

git -C "$work" switch --quiet -c duplicate-trailer "$base_sha"
printf '%s\n' duplicate >"$work/duplicate.txt"
git -C "$work" add duplicate.txt
git -C "$work" commit --quiet \
  -m duplicate \
  -m $'Change-Id: I3333333333333333333333333333333333333333\nChange-Id: I4444444444444444444444444444444444444444'
duplicate_sha="$(git -C "$work" rev-parse HEAD)"

git -C "$work" switch --quiet -c malformed-trailer "$base_sha"
commit_file malformed.txt malformed malformed Inot-a-forty-digit-hex-value
malformed_sha="$(git -C "$work" rev-parse HEAD)"

git -C "$work" switch --quiet -c competing "$base_sha"
commit_file competing.txt competing competing I5555555555555555555555555555555555555555
competing_sha="$(git -C "$work" rev-parse HEAD)"
git -C "$work" push --quiet origin competing:refs/heads/test-competing
git -C "$work" switch --quiet stack

{
  printf '#!%s\n' "$BASH"
  cat <<'EOF'
set -euo pipefail
printf 'gh' >>"$FAKE_FORGE_TRACE"
printf ' %q' "$@" >>"$FAKE_FORGE_TRACE"
printf '\n' >>"$FAKE_FORGE_TRACE"
if [[ "$1 $2" == "pr checks" ]]; then
  pr="$3"
  [[ "$4 $5" == "--json name,state" ]]
  cat "$FAKE_FORGE/checks/$pr.json"
  if [[ "${FAKE_ADVANCE_ON_PR:-}" == "$pr" ]]; then
    GIT_TRACE=0 git --git-dir="$FAKE_REMOTE" update-ref refs/heads/main "$FAKE_ADVANCE_SHA"
  fi
  jq -e 'length > 0 and all(.[]; .state == "SUCCESS")' \
    "$FAKE_FORGE/checks/$pr.json" >/dev/null
  exit
fi

printf 'unexpected forge invocation: %q ' "$@" >&2
printf '\n' >&2
exit 64
EOF
} >"$fake_bin/gh"
chmod +x "$fake_bin/gh"

printf '[{"name":"nixbot/nix-eval","state":"SUCCESS"},{"name":"nixbot/nix-build","state":"SUCCESS"}]\n' >"$forge/checks/101.json"
printf '[{"name":"nixbot/nix-eval","state":"SUCCESS"},{"name":"nixbot/nix-build","state":"CANCELLED"}]\n' >"$forge/checks/102.json"
printf '[]\n' >"$forge/checks/103.json"
printf '[{"name":"nixbot/nix-eval","state":"SUCCESS"},{"name":"nixbot/nix-build","state":"SUCCESS"}]\n' >"$forge/checks/104.json"

output="$scratch/output"
export FAKE_FORGE="$forge"
export FAKE_REMOTE="$remote"
export FAKE_FORGE_TRACE="$forge_trace"
export GH_BIN="$fake_bin/gh"

reset_main() {
  git --git-dir="$remote" update-ref refs/heads/main "$base_sha"
}

record_failure() {
  printf 'not ok - %s\n' "$*" >&2
  ((failures += 1))
}

run_subject() {
  local before after
  before="$(git --git-dir="$remote" rev-parse refs/heads/main)"
  : >"$git_trace"
  : >"$forge_trace"
  subject_status=0
  (cd "${subject_cwd:-$work}" &&
    PATH="${subject_path:-$PATH}" GIT_TRACE="$git_trace" "$subject" "$@") >"$output" 2>&1 || subject_status=$?
  after="$(git --git-dir="$remote" rev-parse refs/heads/main)"
  if [[ "$after" != "${FAKE_ADVANCE_SHA:-$before}" ]]; then
    record_failure 'fixture target changed during diagnostics'
  fi
  if grep -E 'built-in: git .*push|git-receive-pack|receive-pack' "$git_trace"; then
    record_failure 'remote-write command recorded in git trace'
  fi
  if grep -Ev '^gh pr checks [1-9][0-9]* --json name\\?,state$' "$forge_trace"; then
    record_failure 'forge mutation or merged-state query recorded in trace'
  fi
}

expect_failure() {
  local name="$1"
  local pattern="$2"
  shift 2
  run_subject "$@"
  if [[ "$subject_status" == 0 ]]; then
    record_failure "$name: command succeeded"
  elif ! grep -Eq "$pattern" "$output"; then
    record_failure "$name: expected /$pattern/ in:"
    sed 's/^/  /' "$output" >&2
  else
    printf 'ok - %s: %s\n' "$name" "$(tail -n 1 "$output")"
  fi
}

expect_success() {
  local name="$1"
  shift
  run_subject "$@"
  if [[ "$subject_status" != 0 ]]; then
    record_failure "$name: command failed:"
    sed 's/^/  /' "$output" >&2
  else
    printf 'ok - %s\n' "$name"
  fi
}

expect_no_operations() {
  if [[ -s "$git_trace" || -s "$forge_trace" ]]; then
    record_failure 'rejected invocation or help called git/gh'
    cat "$git_trace" "$forge_trace" >&2
  else
    printf 'ok - no git/gh operations\n'
  fi
}

expect_assertion_summary() {
  if ! grep -Fq 'dry run: assertions passed; no landing performed' "$output"; then
    record_failure 'dry run must report assertions only'
    tail -n 2 "$output" >&2
  else
    printf 'ok - dry run reports assertions only\n'
  fi
}

expect_check_state_failure() {
  local category="$1"
  local pr="$2"
  local state="$3"
  local check="synthetic-$state"

  printf '[{"name":"nixbot/nix-eval","state":"SUCCESS"},{"name":"%s","state":"%s"}]\n' \
    "$check" "$state" >"$forge/checks/$pr.json"
  reset_main
  expect_failure \
    "$category check state $state fails diagnostics" \
    "PR $pr checks are not all green: $check=$state" \
    --dry-run --tip "$tip_sha" "$pr"
}

git --git-dir="$remote" update-ref refs/heads/main "$competing_sha"
expect_failure \
  'ancestry rejects a divergent target base' \
  "target base .* is not an ancestor of stack tip $tip_sha" \
  --dry-run --tip "$tip_sha" 101

reset_main
expect_failure \
  'missing Change-Id names its commit' \
  "commit $missing_sha has 0 Change-Id trailers; expected exactly one" \
  --dry-run --tip "$missing_sha" 101

reset_main
expect_failure \
  'duplicate Change-Id names its commit' \
  "commit $duplicate_sha has 2 Change-Id trailers; expected exactly one" \
  --dry-run --tip "$duplicate_sha" 101

reset_main
expect_failure \
  'malformed Change-Id names its commit' \
  "commit $malformed_sha has invalid Change-Id trailer" \
  --dry-run --tip "$malformed_sha" 101

reset_main
expect_failure \
  'cancelled check is not green' \
  'PR 102 checks are not all green: nixbot/nix-build=CANCELLED' \
  --dry-run --tip "$tip_sha" 102

reset_main
expect_failure \
  'a head with no checks is not green' \
  'PR 103 has no checks' \
  --dry-run --tip "$tip_sha" 103

printf '[{"name":"nixbot/nix-eval","state":"SUCCESS"},{"name":"Mergify Merge Queue","state":"NEUTRAL"}]\n' \
  >"$forge/checks/105.json"
reset_main
expect_success \
  'a neutral check passes diagnostics' \
  --dry-run --tip "$tip_sha" 105

printf '[{"name":"nixbot/nix-eval","state":"SUCCESS"},{"name":"optional-check","state":"SKIPPED"}]\n' \
  >"$forge/checks/106.json"
reset_main
expect_success \
  'a skipped check passes diagnostics' \
  --dry-run --tip "$tip_sha" 106

pr=107
for state in FAILURE TIMED_OUT ACTION_REQUIRED ERROR; do
  expect_check_state_failure failing "$pr" "$state"
  ((pr += 1))
done

for state in PENDING IN_PROGRESS QUEUED REQUESTED WAITING EXPECTED STARTUP_FAILURE STALE; do
  expect_check_state_failure undecided "$pr" "$state"
  ((pr += 1))
done

expect_check_state_failure unrecognised "$pr" BANANA

reset_main
export FAKE_ADVANCE_ON_PR=101
export FAKE_ADVANCE_SHA="$competing_sha"
expect_failure \
  'ancestry is rechecked after forge checks' \
  "target base $competing_sha is not an ancestor of stack tip $tip_sha" \
  --dry-run --tip "$tip_sha" 101
unset FAKE_ADVANCE_ON_PR FAKE_ADVANCE_SHA

reset_main
subject_cwd="$scratch"
expect_success 'help works without --dry-run outside a repository' --help
expect_no_operations
unset subject_cwd
if ! grep -Fq 'assertion-only diagnostic' "$output"; then
  record_failure 'help must describe assertion-only diagnostics'
fi

reset_main
subject_path=/unusable
expect_success 'installed wrapper supplies runtime commands with an unusable PATH' \
  --dry-run --tip "$tip_sha" 101
unset subject_path
expect_assertion_summary

reset_main
expect_success 'dry run validates without writes or merged-state polling' \
  --dry-run --tip "$tip_sha" 101 104
expect_assertion_summary

reset_main
expect_failure 'legacy real invocation is rejected' \
  'assertion-only diagnostic; --dry-run is required' --tip "$tip_sha" 101
expect_no_operations

reset_main
subject_cwd="$scratch"
expect_failure 'rejection does not require a repository or forge' \
  'assertion-only diagnostic; --dry-run is required' --tip "$tip_sha" 101
expect_no_operations
expect_failure 'empty invocation requires explicit diagnostics' \
  'assertion-only diagnostic; --dry-run is required'
expect_no_operations
expect_success 'short help works outside a repository' -h
expect_no_operations
unset subject_cwd

if ((failures)); then
  printf 'FAIL: %s assertion-only contract violations\n' "$failures" >&2
  exit 1
fi
printf 'PASS: all stack-land diagnostics; no remote writes; fixture targets preserved\n'
