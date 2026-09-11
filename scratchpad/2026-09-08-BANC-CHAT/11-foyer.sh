#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# UN FOYER D'UNE BOUCHE POUR `perte` — POUR POUVOIR COMPOSER UN PLAN.
#
# Le cas `planned` (« tu as mangé le plat prévu ? ») ne peut pas se déclencher
# sans une ligne `student_generated_meals` qui COUVRE aujourd'hui. La composer
# demande un foyer.
#
# ⛔ CHAQUE CHAMP PAR LA MÊME RPC QUE L'ÉCRAN, jamais par un `insert` direct.
# « Une fixture qui diverge du produit mesure autre chose » — et ici la
# divergence serait invisible: le plan sortirait, mais composé sur un corps que
# le produit n'aurait jamais accepté.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
source "$(dirname "$0")/00-env.sh"
HOUSE_COACH="00000000-0000-4000-8000-00000000d15c"

TOK="$(login "$PERTE_EMAIL")"; [ -n "$TOK" ] || { echo "⛔ pas de jeton"; exit 1; }
U="$(uid_of "$PERTE_EMAIL")"

rpc() { curl -s -X POST "$API_URL/rest/v1/rpc/$1" -H "apikey: $ANON" \
  -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d "$2"; }
rpcx() {
  local out; out="$(rpc "$1" "$2")"
  case "$out" in *'"ok": false'*|*'"ok":false'*) echo "⛔ $1 → $out"; exit 1;; esac
  printf '%s' "$out"
}

# Le siège: sans lui, le générateur refuse avant tout appel modèle.
psqlq >/dev/null <<SQL
insert into coach_clients(coach_id, student_user_id, invited_email, status, consent_granted_at, seat_state, started_at)
select '$HOUSE_COACH','$U',(select email from auth.users where id='$U'),'active',now(),'trial',now()
where not exists (select 1 from coach_clients where student_user_id='$U');
SQL

N="$(rpc keel_household_roster '{}' | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"
[ "$N" = "0" ] && rpcx keel_household_create '{"p_name":"Foyer banc chat"}' >/dev/null
OWN="$(rpc keel_household_roster '{}' \
  | python3 -c 'import sys,json;r=json.load(sys.stdin);print(next((x["member_id"] for x in r if x.get("user_id")),r[0]["member_id"] if r else ""))')"
[ -n "$OWN" ] || { echo "⛔ pas de bouche titulaire"; exit 1; }

rpcx keel_household_set_member_birth_date "{\"p_member\":\"$OWN\",\"p_birth_date\":\"1990-03-15\"}" >/dev/null
rpcx keel_household_set_member_body "{\"p_member\":\"$OWN\",\"p_height_cm\":174,\"p_weight_kg\":78,\"p_gender\":\"male\",\"p_activity_level\":\"trains_some\",\"p_day_activity\":\"seated\",\"p_sport_frequency\":\"1_2\",\"p_activity_axes_asked\":true,\"p_takes_dessert\":null,\"p_takes_cheese\":null,\"p_takes_bread\":null,\"p_meal_structure_asked\":false,\"p_appetite\":\"average\",\"p_appetite_asked\":true}" >/dev/null

# ⚠️ LES TROIS CRÉNEAUX DU RYTHME, ET LES MÊMES. Le rythme de `student_goals`
# dit QUAND la personne mange; les habitudes disent CE QU'ELLE Y MET. Si les
# deux divergent, le plan compose un dîner pour quelqu'un dont C1 croit qu'il
# déjeune — et le cas `planned` ne se déclencherait jamais, sans qu'on sache
# si c'est le plan ou la question qui a tort.
rpcx keel_household_set_member_habits "{\"p_member\":\"$OWN\",\"p_slots\":[{\"slot\":\"breakfast\",\"kind\":\"household_dish\",\"usual\":\"\",\"extras\":[],\"light\":false},{\"slot\":\"lunch\",\"kind\":\"household_dish\",\"usual\":\"\",\"extras\":[],\"light\":false},{\"slot\":\"dinner\",\"kind\":\"household_dish\",\"usual\":\"\",\"extras\":[],\"light\":false}],\"p_note\":null}" >/dev/null

echo "bouche titulaire: $OWN"
psqlf -c "select 'roster', count(*) from household_members where user_id='$U'
 union all select 'habitudes', jsonb_array_length(slots) from household_member_habits where member_id='$OWN'
 union all select 'siege', count(*) from coach_clients where student_user_id='$U';"
