set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: ${0##*/} <declared.yaml> <target.yaml>" >&2
  exit 2
fi

declared=$1
target=$2

mkdir -p "$(dirname "$target")"

if [ -s "$target" ]; then
  # A parse failure must not destroy the runner's persisted host identity.
  tag=$(yq eval 'tag' "$target" 2>/dev/null || true)
  if [ "$tag" != '!!map' ]; then
    echo "${0##*/}: $target is not a YAML mapping; refusing to overwrite it" >&2
    exit 1
  fi
  merged=$(yq eval-all 'select(fileIndex == 0) * select(fileIndex == 1)' "$target" "$declared")
else
  merged=$(yq eval '.' "$declared")
fi

tmp=$(mktemp "$target.XXXXXX")
trap 'rm -f "$tmp"' EXIT
printf '%s\n' "$merged" >"$tmp"
chmod 600 "$tmp"
mv -f "$tmp" "$target"
trap - EXIT
