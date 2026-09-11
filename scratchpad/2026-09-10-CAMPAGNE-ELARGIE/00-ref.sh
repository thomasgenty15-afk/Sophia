#!/usr/bin/env bash
set -euo pipefail
# ── LE RÉFÉRENTIEL, FIGÉ ET IDENTIFIÉ ──────────────────────────────────────
#
# ⛔ « FIGÉ » NE SUFFIT PAS, IL FAUT « IDENTIFIÉ ». Deux campagnes mesurées sur
# deux extractions différentes ne se comparent pas, et rien dans un rapport ne
# le dit — sauf si l'extraction porte son empreinte. On écrit donc le compte de
# lignes ET le sha256 de chaque table à côté des données.
#
#   bash 00-ref.sh
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB=supabase_db_Sophia_2
for t in food_composition_refs food_composition_aliases; do
  docker exec -i "$DB" psql -U postgres -d postgres -tA \
    -c "select row_to_json(t)::text from public.$t t order by 1" \
    > "$HERE/ref/$t.ndjson"
done
{
  echo "# RÉFÉRENTIEL FIGÉ — extrait le $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for t in food_composition_refs food_composition_aliases; do
    printf '%s  lignes=%s  sha256=%s\n' "$t" \
      "$(wc -l < "$HERE/ref/$t.ndjson" | tr -d ' ')" \
      "$(shasum -a 256 "$HERE/ref/$t.ndjson" | cut -d' ' -f1)"
  done
} > "$HERE/ref/EMPREINTE.txt"
cat "$HERE/ref/EMPREINTE.txt"
