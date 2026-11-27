#!/usr/bin/env bash
# The gate before every commit: test file names, types, tests with coverage, the browser oracle (Chromium, from
# QUAD_CHROMIUM), a build that reproduces the committed dist/, and secret scans of history and staged changes.
set -euo pipefail
cd "$(dirname "$0")"

# Every test file lives directly in tests/ or differential/ and ends in lowercase .test.ts.
find . \( -name node_modules -o -name .git \) -prune -o -type f \
  \( -iname '*[._]test.*' -o -iname '*[._]spec.*' \) -print0 |
  (
    invalid=0
    while IFS= read -r -d '' path; do
      if [[ ! $path =~ ^\./(tests|differential)/[^/]+\.test\.ts$ ]]; then
        printf 'check.sh: invalid test file name: %s\n' "$path" >&2
        invalid=1
      fi
    done
    exit "$invalid"
  )

./node_modules/.bin/tsc -p tsconfig.typecheck.json
bun test --coverage
bun oracle/check.ts
bun run build
git diff --exit-code -- dist
if command -v gitleaks >/dev/null; then
  gitleaks_flags=(--redact --no-banner --log-level warn)
  gitleaks git . "${gitleaks_flags[@]}"
  gitleaks git . --pre-commit --staged "${gitleaks_flags[@]}"
else
  echo 'check.sh: gitleaks is left out without it'
fi
