#!/usr/bin/env bash
# Empreinte des mtimes sous supabase/functions/ — pour PROUVER (ou infirmer)
# que le `deno test` du gate touche quelque chose là-dessous. Mon carnet
# l'affirmait sans l'avoir mesuré ; deux tirs réels ont été perdus aujourd'hui
# sur des recréations de conteneur, donc la réponse vaut d'être exacte.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
find supabase/functions -type f \( -name '*.ts' -o -name '*.json' -o -name '*.toml' \) \
  -exec stat -f "%m %N" {} + | sort
