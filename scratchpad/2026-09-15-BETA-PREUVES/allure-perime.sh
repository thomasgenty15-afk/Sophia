#!/usr/bin/env bash
# LOT 4 — R3 SUR LE CHEMIN RÉEL : une allure changée périme l'aperçu.
#
# ⛔ FIXTURE DE TEST UNIQUEMENT (`@keeltest.dev`), ET LA VALEUR EST REMISE.
# On pose une allure sur Lea entre la composition et le tap, puis on adopte:
# l'empreinte gelée avec le brouillon ne correspond plus, donc l'écriture est
# refusée. Aucun appel modèle: l'adoption n'en fait aucun.
set -euo pipefail
DRAFT="$1"; EMAIL="$2"; MEMBRE="$3"
C=${SUPABASE_DB_CONTAINER:-supabase_db_Sophia_2}
sql() { docker exec -i "$C" psql -U postgres -d postgres -X -At -v ON_ERROR_STOP=1 "$@"; }
API="http://127.0.0.1:54321"
TOK=$(curl -s -X POST "$API/auth/v1/token?grant_type=password" -H "apikey: $SUPABASE_ANON_KEY" \
  -H "content-type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
[ -n "$TOK" ] || { echo "⛔ connexion refusée"; exit 2; }

adopter() {
  curl -s -X POST "$API/functions/v1/generate-household-meal-v1" \
    -H "apikey: $SUPABASE_ANON_KEY" -H "authorization: Bearer $TOK" \
    -H "content-type: application/json" -H "x-request-id: $(uuidgen)" \
    -d "{\"operation\":\"compose\",\"intent\":\"prepare_next\",\"replaces\":null,\"window\":{\"kind\":\"days\",\"count\":3},\"context\":null,\"cooking_shape\":null,\"one_cooking_session\":false,\"preferences\":null,\"draft_id\":\"$DRAFT\",\"adopting_draft\":true}"
}

AVANT=$(sql -c "select count(*) from public.student_generated_meals;")
echo "plans avant : $AVANT · allure de Lea : $(sql -c "select coalesce(target_pace_kg_per_week::text,'NULL') from public.household_members where member_id='$MEMBRE';")"

echo; echo "① ON POSE UNE ALLURE (0,5 kg/semaine) ENTRE L'APERÇU ET LE TAP"
sql -c "update public.household_members set target_pace_kg_per_week = 0.5 where member_id='$MEMBRE';" >/dev/null
R1=$(adopter); echo "   réponse : $(echo "$R1" | head -c 220)"
APRES1=$(sql -c "select count(*) from public.student_generated_meals;")
echo "   plans : $AVANT → $APRES1"

echo; echo "② ON REMET L'ALLURE D'ORIGINE, ET ON ADOPTE"
sql -c "update public.household_members set target_pace_kg_per_week = null where member_id='$MEMBRE';" >/dev/null
R2=$(adopter); echo "   réponse : $(echo "$R2" | head -c 220)"
APRES2=$(sql -c "select count(*) from public.student_generated_meals;")
echo "   plans : $APRES1 → $APRES2"

echo; echo "── VERDICT ───────────────────────────────────────────────"
ROUGE=0
echo "$R1" | grep -q 'draft_stale' && echo "   ✅ l'allure changée périme l'aperçu (draft_stale)" || { echo "   ⛔ l'adoption n'a PAS été refusée"; ROUGE=1; }
[ "$APRES1" = "$AVANT" ] && echo "   ✅ rien n'a été écrit pendant le refus" || { echo "   ⛔ un plan a été écrit malgré le refus"; ROUGE=1; }
echo "$R2" | grep -q '"ok":true' && echo "   ✅ l'allure remise, l'adoption passe" || { echo "   ⛔ l'adoption échoue après retour à l'état d'origine"; ROUGE=1; }
[ "$APRES2" = "$((APRES1+1))" ] && echo "   ✅ exactement un plan écrit" || { echo "   ⛔ $APRES1 → $APRES2"; ROUGE=1; }
echo "   allure finale : $(sql -c "select coalesce(target_pace_kg_per_week::text,'NULL') from public.household_members where member_id='$MEMBRE';") (remise)"
[ "$ROUGE" = 0 ] && echo && echo "✅ R3 fermé sur le chemin réel" || { echo; echo "⛔ défaut"; exit 1; }
