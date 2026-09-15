#!/usr/bin/env bash
# LE TUNNEL DE PAIEMENT DU FOYER, JOUÉ EN LOCAL — zéro appel modèle, zéro appel Stripe.
# Le frein de bêta (keel_generation_pause) est ARMÉ pendant tout le rejeu : un foyer
# admis rend 503 generation_paused (l'admission est passée, rien n'est composé) ;
# un foyer gelé rend 402 household_frozen AVANT le frein. Les deux statuts se lisent
# donc sans dépense. Les événements Stripe sont signés avec le secret LOCAL du webhook.
set -uo pipefail
cd "$(dirname "$0")/../.."
eval "$(supabase status -o env 2>/dev/null | sed 's/^/export /')"
API="http://127.0.0.1:54321"; SVC="$SERVICE_ROLE_KEY"; ANON="$ANON_KEY"
WHSEC=$(grep "^STRIPE_WEBHOOK_SECRET=" supabase/.env | cut -d= -f2)
PRICE=$(grep "^STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY=" supabase/.env | cut -d= -f2)
EMAIL="lotf.gain.n2preuve1@keeltest.dev"; USER="e571b3c5-d9e7-4714-ada3-9aa0c95c93e2"; HH="a16e036e-6f0b-4b22-89c4-12b98a76cb12"
H_SVC=(-H "apikey: $SVC" -H "authorization: Bearer $SVC" -H "content-type: application/json")
rest() { curl -s "${H_SVC[@]}" "$@"; }
rpc_covered() { rest -X POST "$API/rest/v1/rpc/keel_household_is_covered" -d "{\"p_household\":\"$HH\"}"; }
until [ "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$API/functions/v1/generate-household-meal-v1")" != "502" ]; do sleep 2; done
TOKEN=$(curl -s "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "content-type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")
[ -n "$TOKEN" ] || { echo "⛔ pas de jeton pour $EMAIL"; exit 2; }
gen() { curl -s -o /tmp/claude-502/tunnel-body.json -w '%{http_code}' -X POST "$API/functions/v1/generate-household-meal-v1" -H "authorization: Bearer $TOKEN" -H "apikey: $ANON" -H "content-type: application/json" -H "x-request-id: tunnel-$1-$(date +%s)" -d '{"intent":"prepare_next","window":{"kind":"days","count":3}}'; }
corps() { python3 -c "import json; d=json.load(open('/tmp/claude-502/tunnel-body.json')); print(d.get('error') or d.get('refusal') or list(d.keys())[:3])" 2>/dev/null; }
webhook() { # $1 = type, $2 = status, $3 = event id
  NOW=$(date +%s); RAW=$(python3 - "$1" "$2" "$3" "$USER" "$PRICE" "$NOW" <<'PY'
import sys,json
t,st,eid,user,price,now=sys.argv[1:7]; now=int(now)
print(json.dumps({"id":eid,"object":"event","type":t,"created":now,"data":{"object":{"id":"sub_tunnel_2026_09_15","object":"subscription","status":st,"cancel_at_period_end":False,"current_period_start":now,"current_period_end":now+30*86400,"customer":"cus_tunnel_2026_09_15","items":{"data":[{"price":{"id":price}}]},"metadata":{"supabase_user_id":user}}}},separators=(",",":")))
PY
)
  SIG=$(python3 -c "import hmac,hashlib,sys; s=sys.argv[1]; now=sys.argv[2]; raw=sys.stdin.read(); print('t=%s,v1=%s'%(now,hmac.new(s.encode(),(now+'.'+raw).encode(),hashlib.sha256).hexdigest()))" "$WHSEC" "$NOW" <<<"$RAW")
  # ⚠️ <<< ajoute un \n ; on signe et on envoie EXACTEMENT le même corps.
  printf '%s\n' "$RAW" > /tmp/claude-502/tunnel-evt.json
  curl -s -o /tmp/claude-502/tunnel-wh.json -w '%{http_code}' -X POST "$API/functions/v1/stripe-webhook" -H "content-type: application/json" -H "Stripe-Signature: $SIG" -H "apikey: $ANON" -H "authorization: Bearer $ANON" --data-binary @/tmp/claude-502/tunnel-evt.json
}
echo "── état initial"
PAUSE0=$(rest "$API/rest/v1/keel_generation_pause?select=paused,reason"); echo "   frein avant : $PAUSE0"
FREE0=$(rest "$API/rest/v1/households?id=eq.$HH&select=free_until" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d[0]['free_until']) if d else 'null')")
echo "   free_until avant : $FREE0"
echo "   abonnement avant : $(rest "$API/rest/v1/subscriptions?user_id=eq.$USER&select=status")"
rest -X PATCH "$API/rest/v1/keel_generation_pause?id=eq.true" -H "prefer: return=minimal" -d '{"paused":true,"reason":"Vérification du paiement en cours, réessayez dans quelques minutes."}' >/dev/null
echo "   frein ARMÉ : $(rest "$API/rest/v1/keel_generation_pause?select=paused")"
echo "── ① état de départ (essai posé à la création, J+7) → couvert, admis, frein"
echo "   couvert=$(rpc_covered) · génération → $(gen 1) $(corps)"
echo "── ② essai expiré hier → gelé"
rest -X PATCH "$API/rest/v1/households?id=eq.$HH" -H "prefer: return=minimal" -d "{\"free_until\":\"$(date -v-1d +%F)\"}" >/dev/null
echo "   couvert=$(rpc_covered) · génération → $(gen 2) $(corps)"
echo "── ③ webhook customer.subscription.created (active) → le maître paie → réadmis"
echo "   webhook → $(webhook customer.subscription.created active evt_tunnel_created_$(date +%s)) $(python3 -c "import json; print(json.load(open('/tmp/claude-502/tunnel-wh.json')))" 2>/dev/null | cut -c1-120)"
echo "   abonnement : $(rest "$API/rest/v1/subscriptions?user_id=eq.$USER&select=status,stripe_price_id,current_period_end")"
echo "   couvert=$(rpc_covered) · génération → $(gen 3) $(corps)"
echo "── ④ webhook customer.subscription.deleted (canceled) → gelé"
echo "   webhook → $(webhook customer.subscription.deleted canceled evt_tunnel_deleted_$(date +%s)) $(python3 -c "import json; print(json.load(open('/tmp/claude-502/tunnel-wh.json')))" 2>/dev/null | cut -c1-120)"
echo "   abonnement : $(rest "$API/rest/v1/subscriptions?user_id=eq.$USER&select=status")"
echo "   couvert=$(rpc_covered) · génération → $(gen 4) $(corps)"
echo "── ⑤ dernier jour d'essai INCLUS → couvert"
rest -X PATCH "$API/rest/v1/households?id=eq.$HH" -H "prefer: return=minimal" -d "{\"free_until\":\"$(date +%F)\"}" >/dev/null
echo "   couvert=$(rpc_covered) · génération → $(gen 5) $(corps)"
echo "── ⑥ écran : keel_household_my_coverage vu par le maître"
curl -s -X POST "$API/rest/v1/rpc/keel_household_my_coverage" -H "apikey: $ANON" -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{}' | cut -c1-200; echo
echo "── remise en état"
rest -X PATCH "$API/rest/v1/households?id=eq.$HH" -H "prefer: return=minimal" -d "{\"free_until\":$FREE0}" >/dev/null
rest -X DELETE "$API/rest/v1/subscriptions?user_id=eq.$USER&stripe_subscription_id=eq.sub_tunnel_2026_09_15" -H "prefer: return=minimal" >/dev/null
P=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(json.dumps({'paused':d[0]['paused'],'reason':d[0]['reason']}) if d else '{\"paused\":false}')" "$PAUSE0")
rest -X PATCH "$API/rest/v1/keel_generation_pause?id=eq.true" -H "prefer: return=minimal" -d "$P" >/dev/null
echo "   frein après : $(rest "$API/rest/v1/keel_generation_pause?select=paused,reason") · free_until : $(rest "$API/rest/v1/households?id=eq.$HH&select=free_until") · abonnement : $(rest "$API/rest/v1/subscriptions?user_id=eq.$USER&select=status")"
