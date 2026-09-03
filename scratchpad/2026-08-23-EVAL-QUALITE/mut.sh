#!/usr/bin/env bash
# Une mutation de fixture, journalisée. `bash mut.sh <étiquette> <<'SQL' ... SQL`
set -euo pipefail
source "$(dirname "$0")/00-env.sh"
LABEL="$1"
SQL="$(cat)"
{ echo "── $LABEL · $(date -u +%FT%TZ)"; echo "$SQL"; } >> "$EVAL_DIR/ECRITURES-FIXTURE.log"
psqlq <<<"$SQL"
