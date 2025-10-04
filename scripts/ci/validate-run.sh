#!/usr/bin/env bash
# scripts/ci/validate-run.sh
# validate CI run completed successfully with all required jobs
#
# usage:
#   ./scripts/ci/validate-run.sh [run-id]
#
# if run-id is not provided, validates the latest CI run

set -euo pipefail

RUN_ID="${1:-$(gh run list --workflow=ci.yaml --limit 1 --json databaseId --jq '.[0].databaseId')}"

echo "validating CI run: $RUN_ID"
echo ""

# check overall status
STATUS=$(gh run view "$RUN_ID" --json status --jq '.status')
CONCLUSION=$(gh run view "$RUN_ID" --json conclusion --jq '.conclusion')

echo "status: $STATUS"
echo "conclusion: $CONCLUSION"
echo ""

if [[ "$CONCLUSION" != "success" ]]; then
  echo "run failed or incomplete"
  echo ""

  # show failed jobs
  echo "failed jobs:"
  gh run view "$RUN_ID" --json jobs \
    --jq '.jobs[] | select(.conclusion != "success") | {name, conclusion}'
  echo ""

  # show failed logs
  echo "failed steps:"
  gh run view "$RUN_ID" --log-failed
  echo ""

  exit 1
fi

# verify all required jobs present and passed
REQUIRED_JOBS=(
  "bootstrap-verification"
  "config-validation"
  "autowiring-validation"
  "secrets-workflow"
  "justfile-activation"
  "nix (x86_64-linux)"
  "nix (aarch64-linux)"
  "nix (aarch64-darwin)"
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
  echo "missing required jobs: ${MISSING_JOBS[*]}"
  exit 1
fi

if [[ ${#FAILED_JOBS[@]} -gt 0 ]]; then
  echo "failed required jobs: ${FAILED_JOBS[*]}"
  exit 1
fi

echo "all required jobs passed successfully"
echo ""

# check performance requirement (< 15 min)
CREATED=$(gh run view "$RUN_ID" --json createdAt --jq '.createdAt | fromdateiso8601')
UPDATED=$(gh run view "$RUN_ID" --json updatedAt --jq '.updatedAt | fromdateiso8601')
DURATION=$((UPDATED - CREATED))

echo "total duration: $((DURATION / 60)) minutes $((DURATION % 60)) seconds"

if [[ $DURATION -gt 900 ]]; then  # 15 minutes
  echo "warning: run exceeded 15-minute target ($((DURATION / 60))m)"
else
  echo "performance target met (< 15 minutes)"
fi

echo ""
echo "CI validation complete"
