#!/usr/bin/env bash
# LOT attribution — un run réel, et LES TROIS FICHIERS.
#   ./run.sh <request-id> <dossier>
# Rend: request-body.json (entrée), dump/prompt-*.txt (prompt envoyé),
#       http-response.json + plan-written.json (sortie).
set -euo pipefail
ROOT="/Users/ahmedamara/Dev/Sophia 2"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
RID="$1"; OUT="$2"
EMAIL="qaatr.foyer@keeltest.dev"
FN="generate-household-meal-v1"
# ⚠️ FENÊTRE COURTE, ET C'EST UN CHOIX DE POSTE, PAS DE CAS. Le conteneur edge
# est recréé toutes les ~2 min 10 s par une session voisine; un run de 3 jours
# dure ~50 s et meurt en 502 une fois sur deux. Une fenêtre d'UN jour compose en
# ~25 s et passe. Le cas construit est INTACT: la collision vit dans les
# contraintes, l'habitude du petit-déjeuner et l'envie de la maison, pas dans le
# nombre de jours. `DAYS` reste réglable pour rejouer la fenêtre longue.
DAYS="${DAYS:-1}"
BODY="{\"window\":{\"kind\":\"exact\",\"starts_on\":\"2026-08-19\",\"duration_days\":$DAYS},\"intent\":\"prepare_next\",\"replaces\":null,\"context\":\"the oven door does not shut properly and the kitchen is being repainted on Thursday\",\"cooking_shape\":null}"
mkdir -p "$OUT"
# ── LA FENÊTRE EST LIBÉRÉE AVANT CHAQUE RUN ────────────────────────────────
# Un plan écrit par le run précédent rend `plan_overlaps_existing` (409) sur le
# suivant. On RETIRE le plan (le geste du produit), on ne touche jamais à son
# contenu: « on ne répare jamais un plan à la main ».
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -qtAc \
  "update public.student_generated_meals set retired_at = now()
     where household_id = (select household_id from public.household_members
                            where user_id = '1e000000-0000-4000-8000-000000000012')
       and retired_at is null;" >/dev/null
JWT=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
printf '%s' "$BODY" > "$OUT/request-body.json"
echo "== POST $FN  request_id=$RID =="
START=$(date +%s)
HTTP=$(curl -s -o "$OUT/http-response.json" -w '%{http_code}' -X POST \
  "http://127.0.0.1:54321/functions/v1/$FN" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -H "x-request-id: $RID" \
  --max-time 590 --data "$BODY")
echo "HTTP $HTTP en $(( $(date +%s) - START )) s"
head -c 300 "$OUT/http-response.json"; echo
# ⚠️ UN VIDAGE VIDE N'EST PAS UNE PREUVE D'ABSENCE: on prouve d'abord que la
# ligne de CE run existe, puis on vide. `--source` est OBLIGATOIRE ici (un
# request_id porte souvent deux appels sur cette lane).
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
  "select request_id||' | '||source||' | '||status||' | '||coalesce(system_prompt_chars::text,'-')||' | '||coalesce(user_message_chars::text,'-') from public.llm_raw_response_events where request_id='$RID';"
node "$ROOT/scripts/export_llm_prompt_dump.mjs" --request-id "$RID" \
  --source "$FN" --out "$OUT/dump" >/dev/null
ls "$OUT/dump"
