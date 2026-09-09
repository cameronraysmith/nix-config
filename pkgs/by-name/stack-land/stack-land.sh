#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: stack-land --dry-run [--remote REMOTE] [--target BRANCH] --tip REV PR...

Inspect a stacked-PR tip with an assertion-only diagnostic.

Defaults:
  --remote origin
  --target main

Assertions:
  The live target base is an ancestor of the stack tip.
  Every commit in target-base..tip has exactly one Change-Id matching
  ^I[0-9a-f]{40}$.
  Every member PR has at least one check and every check state is SUCCESS,
  NEUTRAL, or SKIPPED.
  Target ancestry is fetched and checked again after inspecting PR checks.

These optional diagnostics do not authorize or perform landing and are not
the queue's selected-head check gate or a prerequisite for authorization.
--dry-run is required; target fetching may update local fetch state.
EOF
}

fail() {
  printf 'fatal: %s\n' "$*" >&2
  exit 1
}

dry_run=false
remote=origin
target=main
tip=
prs=()

while (($#)); do
  case "$1" in
    --dry-run)
      dry_run=true
      shift
      ;;
    --remote)
      (($# >= 2)) || fail '--remote requires a value'
      remote="$2"
      shift 2
      ;;
    --target)
      (($# >= 2)) || fail '--target requires a value'
      target="$2"
      shift 2
      ;;
    --tip)
      (($# >= 2)) || fail '--tip requires a value'
      tip="$2"
      shift 2
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    --)
      shift
      while (($#)); do
        prs+=("$1")
        shift
      done
      ;;
    -*)
      fail "unknown option: $1"
      ;;
    *)
      prs+=("$1")
      shift
      ;;
  esac
done

[[ "$dry_run" == true ]] || fail 'assertion-only diagnostic; --dry-run is required'
[[ -n "$tip" ]] || fail '--tip is required'
((${#prs[@]} > 0)) || fail 'at least one PR number is required'
[[ "$remote" != -* ]] || fail 'remote must not begin with a hyphen'
git check-ref-format --branch "$target" >/dev/null 2>&1 || fail "invalid target branch: $target"

for pr in "${prs[@]}"; do
  [[ "$pr" =~ ^[1-9][0-9]*$ ]] || fail "invalid PR number: $pr"
done

gh_bin="${GH_BIN:-gh}"
command -v "$gh_bin" >/dev/null 2>&1 || fail "GitHub CLI not found: $gh_bin"
command -v jq >/dev/null 2>&1 || fail 'jq is required'

tip_sha="$(git rev-parse --verify "$tip^{commit}" 2>/dev/null)" || fail "stack tip is not a commit: $tip"

fetch_target_base() {
  git fetch --quiet "$remote" "refs/heads/$target" ||
    fail "could not fetch target branch $remote/$target"
  git rev-parse --verify 'FETCH_HEAD^{commit}'
}

assert_ancestry() {
  local base_sha="$1"
  if ! git merge-base --is-ancestor "$base_sha" "$tip_sha"; then
    fail "target base $base_sha is not an ancestor of stack tip $tip_sha"
  fi
}

assert_change_ids() {
  local base_sha="$1"
  local commit_sha
  local trailer_count
  local trailer_values
  local change_id

  while IFS= read -r commit_sha; do
    [[ -n "$commit_sha" ]] || continue
    trailer_values="$(
      git show -s \
        --format='%(trailers:key=Change-Id,valueonly,separator=%x0A)' \
        "$commit_sha"
    )"
    trailer_count="$(printf '%s\n' "$trailer_values" | awk 'NF { count++ } END { print count + 0 }')"
    if [[ "$trailer_count" != 1 ]]; then
      fail "commit $commit_sha has $trailer_count Change-Id trailers; expected exactly one"
    fi
    change_id="$(printf '%s\n' "$trailer_values" | awk 'NF { print; exit }')"
    if [[ ! "$change_id" =~ ^I[0-9a-f]{40}$ ]]; then
      fail "commit $commit_sha has invalid Change-Id trailer: $change_id"
    fi
  done < <(git rev-list --reverse "$base_sha..$tip_sha")
}

checks_json_for() {
  local pr="$1"
  local checks_json
  local gh_status

  set +e
  checks_json="$("$gh_bin" pr checks "$pr" --json name,state)"
  gh_status=$?
  set -e

  if ! printf '%s\n' "$checks_json" | jq -e 'type == "array"' >/dev/null 2>&1; then
    fail "PR $pr check query did not return a JSON array (gh exit $gh_status)"
  fi
  printf '%s\n' "$checks_json"
}

assert_green_pr() {
  local pr="$1"
  local checks_json
  local failures

  checks_json="$(checks_json_for "$pr")"
  if [[ "$(printf '%s\n' "$checks_json" | jq 'length')" == 0 ]]; then
    fail "PR $pr has no checks"
  fi
  failures="$(
    printf '%s\n' "$checks_json" |
      jq -r '[.[] | select(.state != "SUCCESS" and .state != "NEUTRAL" and .state != "SKIPPED") | "\(.name)=\(.state)"] | join(", ")'
  )"
  if [[ -n "$failures" ]]; then
    fail "PR $pr checks are not all green: $failures"
  fi
}

base_sha="$(fetch_target_base)"
assert_ancestry "$base_sha"
printf 'assertion passed: target base %s is an ancestor of stack tip %s\n' \
  "$base_sha" "$tip_sha"

assert_change_ids "$base_sha"
printf 'assertion passed: every commit in %s..%s has exactly one valid Change-Id\n' \
  "$base_sha" "$tip_sha"

for pr in "${prs[@]}"; do
  assert_green_pr "$pr"
  printf 'assertion passed: PR %s checks are all green\n' "$pr"
done

base_sha="$(fetch_target_base)"
assert_ancestry "$base_sha"
printf 'assertion passed after PR checks: target base %s is an ancestor of stack tip %s\n' \
  "$base_sha" "$tip_sha"

printf 'dry run: assertions passed; no landing performed for %s at %s/%s\n' \
  "$tip_sha" "$remote" "$target"
