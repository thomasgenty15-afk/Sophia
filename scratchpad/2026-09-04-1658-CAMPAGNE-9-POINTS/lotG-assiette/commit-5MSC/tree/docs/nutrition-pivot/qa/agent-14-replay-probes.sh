#!/bin/zsh
# AGENT 14 — famille C : doublons & rejeu.
#   C7  même wamid rejoué 3x        -> un seul traitement partout
#   C8  statuts delivered/read      -> idempotents, sans side effect
#   C9  course d'écriture (2 réponses quasi simultanées) -> une ligne
set -u
BASE="http://127.0.0.1:54321/functions/v1"
ANON="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
PSQL="docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -At"
# Le webhook verifie X-Hub-Signature-256 (HMAC-SHA256 du corps BRUT) : on signe
# donc pour de vrai, plutot que de passer par le bypass loopback. Le test suit
# ainsi exactement le chemin de production.
APP_SECRET=$(docker exec supabase_edge_runtime_Sophia_2 printenv WHATSAPP_APP_SECRET)
[[ -z "$APP_SECRET" ]] && { echo "ABORT: WHATSAPP_APP_SECRET absent du runtime"; exit 1; }
sign() { printf '%s' "$1" | openssl dgst -sha256 -hmac "$APP_SECRET" -r | cut -d" " -f1; }
post_signed() { # $1=body  -> imprime le code HTTP, corps dans $2
  local body="$1" out="$2"
  curl -s -o "$out" -w "%{http_code}" -X POST "$BASE/whatsapp-webhook" \
    -H "content-type: application/json" -H "apikey: $ANON" -H "authorization: Bearer $ANON" \
    -H "x-hub-signature-256: sha256=$(sign "$body")" \
    --data-binary "$body" --max-time 120
}

PHONE="+81900000001"
WAMID="wamid.A14REPLAY$(date +%s)"

q() { eval "$PSQL -c \"$1\""; }

USER_ID=$(q "select id from public.profiles where phone_number='${PHONE}' limit 1;")
echo "eleve = ${USER_ID}  phone = ${PHONE}"
[[ -z "$USER_ID" ]] && { echo "ABORT: pas de profil pour ${PHONE}"; exit 1; }

LOCAL_DATE=$(q "select (now() at time zone 'Asia/Tokyo')::date;")
echo "local_date Tokyo = ${LOCAL_DATE}"

# état propre pour CE test uniquement (jamais fleet-wide — cf. incident de purge
# concurrente documenté dans la mémoire du dépôt)
q "delete from public.student_daily_checkins where user_id='${USER_ID}';" >/dev/null
q "delete from public.whatsapp_inbound_dedup where wamid_in like 'wamid.A14REPLAY%';" >/dev/null

payload() {
  cat <<JSON
{"object":"whatsapp_business_account","entry":[{"id":"A14","changes":[{"field":"messages","value":{
  "messaging_product":"whatsapp",
  "metadata":{"display_phone_number":"1555","phone_number_id":"A14PN"},
  "contacts":[{"profile":{"name":"A14 Fleet"},"wa_id":"81900000001"}],
  "messages":[{"from":"81900000001","id":"$1","timestamp":"$(date +%s)","type":"interactive",
    "interactive":{"type":"button_reply","button_reply":{"id":"KEEL_PULSE_HARD","title":"Rough"}}}]
}}]}]}
JSON
}

echo
echo "═══ C7 — MÊME wamid POSTÉ 3× (séquentiel) ═══"
for i in 1 2 3; do
  code=$(post_signed "$(payload "$WAMID")" /tmp/a14_wh_$i.json)
  echo "  post #$i -> HTTP $code  $(head -c 120 /tmp/a14_wh_$i.json)"
done

echo
echo "  --- comptes après 3 posts du même wamid ---"
echo "  whatsapp_inbound_dedup (wamid)  : $(q "select count(*) from public.whatsapp_inbound_dedup where wamid_in='${WAMID}';")"
echo "  student_daily_checkins (eleve)  : $(q "select count(*) from public.student_daily_checkins where user_id='${USER_ID}';")"
echo "  chat_messages inbound (wamid)   : $(q "select count(*) from public.chat_messages where user_id='${USER_ID}' and (metadata->>'wa_message_id')='${WAMID}';")"
echo "  chat_messages total (eleve)     : $(q "select count(*) from public.chat_messages where user_id='${USER_ID}';")"
echo "  checkin overall/axis            : $(q "select coalesce(overall,'-')||'/'||coalesce(axis,'-') from public.student_daily_checkins where user_id='${USER_ID}';")"

echo
echo "═══ C9 — COURSE D'ÉCRITURE : 3 wamid DIFFÉRENTS postés en PARALLÈLE ═══"
echo "  (même élève, même jour local : la clé unique (user_id, local_date) doit tenir)"
q "delete from public.student_daily_checkins where user_id='${USER_ID}';" >/dev/null
RACE="wamid.A14RACE$(date +%s)"
for i in 1 2 3; do
  post_signed "$(payload "${RACE}_$i")" /tmp/a14_race_$i.json >/dev/null &
done
wait
echo "  student_daily_checkins (eleve)  : $(q "select count(*) from public.student_daily_checkins where user_id='${USER_ID}';")"
echo "  dedup rows (3 wamid distincts)  : $(q "select count(*) from public.whatsapp_inbound_dedup where wamid_in like '${RACE}%';")"

echo
echo "═══ C8 — STATUTS delivered/read REJOUÉS ═══"
OUT_WAMID=$(q "select provider_message_id from public.whatsapp_outbound_messages where provider_message_id is not null order by created_at desc limit 1;")
if [[ -z "$OUT_WAMID" ]]; then
  OUT_WAMID="wamid.A14OUT$(date +%s)"
  echo "  (aucun sortant réel ; on rejoue sur un id inconnu : ${OUT_WAMID})"
else
  echo "  sortant réel ciblé : ${OUT_WAMID}"
fi

status_payload() {
  cat <<JSON
{"object":"whatsapp_business_account","entry":[{"id":"A14","changes":[{"field":"messages","value":{
  "messaging_product":"whatsapp",
  "metadata":{"display_phone_number":"1555","phone_number_id":"A14PN"},
  "statuses":[{"id":"$1","status":"$2","timestamp":"$3","recipient_id":"81900000001"}]
}}]}]}
JSON
}
TS=$(date +%s)
BEFORE_EV=$(q "select count(*) from public.whatsapp_outbound_status_events where provider_message_id='${OUT_WAMID}';" 2>/dev/null || echo "n/a")
for s in delivered read delivered read delivered read; do
  post_signed "$(status_payload "$OUT_WAMID" "$s" "$TS")" /dev/null >/dev/null
done
echo "  status_events avant / après     : ${BEFORE_EV} / $(q "select count(*) from public.whatsapp_outbound_status_events where provider_message_id='${OUT_WAMID}';" 2>/dev/null || echo 'n/a')"
echo "  (2 statuts x 3 rejeux = 6 posts ; attendu : 2 lignes max, clé (provider_message_id,status,status_timestamp))"
echo "  checkins de l'eleve (inchangé)  : $(q "select count(*) from public.student_daily_checkins where user_id='${USER_ID}';")"
echo "  chat_messages (inchangé)        : $(q "select count(*) from public.chat_messages where user_id='${USER_ID}';")"
