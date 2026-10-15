#!/usr/bin/env bash
# Consumer smoke test. Packs the package the way npm publish would, installs the
# tarball into a clean consumer project, and type-checks a file that imports the
# public surface. Catches a package that ships raw .ts, a missing .d.ts, or an
# exports map that breaks the documented import.
#
# Usage: scripts/consumer-smoke.sh [react-major]    (18 or 19, default 18)
set -euo pipefail

REACT_MAJOR="${1:-18}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "consumer-smoke: pack"
TARBALL_NAME="$(cd "$ROOT" && npm pack --silent --pack-destination "$WORK" | tail -n 1)"
TARBALL="$WORK/$TARBALL_NAME"
if [ ! -f "$TARBALL" ]; then
  echo "consumer-smoke: npm pack produced no tarball" >&2
  exit 1
fi

CONSUMER="$WORK/consumer"
mkdir -p "$CONSUMER/src"
cd "$CONSUMER"

cat > package.json <<'JSON'
{ "name": "consumer-smoke", "private": true, "type": "module" }
JSON

cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "strict": true,
    "jsx": "react-jsx",
    "target": "ES2021",
    "lib": ["DOM", "ES2021"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
JSON

cat > src/index.tsx <<'TSX'
import { Chat, XmppProvider } from '@ethora/chat-component';

// Touch the public surface so the imports are not elided.
export const sdk = { Chat, XmppProvider };
TSX

echo "consumer-smoke: install tarball with react ${REACT_MAJOR}"
npm install --no-audit --no-fund --loglevel=error \
  "react@^${REACT_MAJOR}" "react-dom@^${REACT_MAJOR}" \
  "@types/react@^${REACT_MAJOR}" "@types/react-dom@^${REACT_MAJOR}" \
  "typescript@5.8.3" "$TARBALL"

echo "consumer-smoke: typecheck the public import"
npx tsc -p tsconfig.json
echo "consumer-smoke: ok (react ${REACT_MAJOR})"
