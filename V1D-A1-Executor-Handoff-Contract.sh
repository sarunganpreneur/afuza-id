#!/usr/bin/env bash
set -euo pipefail

cd /home/afuzaid/apps/afuza-id

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="/home/afuzaid/backups/v1da1-$TS"

DOC="docs/ops/executor-handoff-contract-v1.md"
SRC="src/lib/ops/executor-handoff-contract.ts"
TEST="src/lib/ops/executor-handoff-contract.test.ts"

echo "=============================================="
echo " AFUZA V1D-A1 - EXECUTOR HANDOFF CONTRACT"
echo "=============================================="

mkdir -p "$BACKUP" docs/ops src/lib/ops

for F in "$DOC" "$SRC" "$TEST"; do
  [ ! -f "$F" ] || cp -a "$F" "$BACKUP/"
done

echo "[1/6] Backup: $BACKUP"


cat > "$DOC" <<'EOF'
# AFUZA Executor Handoff Contract V1

## Prinsip keselamatan

```text
APPROVED != EXECUTED
PREPARED != EXECUTING
OFFER_CREATED != OFFER_DELIVERED
OFFER_DELIVERED != CLAIM_ACCEPTED
CLAIM_REQUESTED != EXECUTING
LEASE_GRANTED = izin runtime executor untuk mulai bekerja
EXECUTING != COMPLETED
COMPLETED != SIDE_EFFECT_VERIFIED