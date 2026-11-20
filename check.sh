#!/usr/bin/env bash
# The gate before every commit: types, tests with coverage, the browser oracle (Chromium, from QUAD_CHROMIUM), a build
# that reproduces the committed dist/, no secret.
set -euo pipefail
cd "$(dirname "$0")"
./node_modules/.bin/tsc -p tsconfig.typecheck.json
bun test --coverage
bun oracle/check.ts
bun run build
git diff --exit-code -- dist
if command -v gitleaks >/dev/null; then
  gitleaks git . --redact --no-banner --log-level warn
else
  echo 'check.sh: gitleaks is left out without it'
fi
