# ═══════════════════════════════════════════════════════════════════════════
# BANC CHAT — LE SOCLE
#
# Chantier de réduction du chat (lots A, D, B). On mesure ce que le produit
# FAIT, pas ce que les tests disent qu'il fait.
#
# ⛔ LES CLÉS NE SONT JAMAIS EXPORTÉES. Un `SUPABASE_*` dans l'environnement
# fait basculer des dizaines de tests Deno vers une vraie pile: 114 faux rouges,
# après quoi on désarme le gate en croyant réparer un test.
# ═══════════════════════════════════════════════════════════════════════════
REPO="/Users/ahmedamara/Dev/Sophia 2"
BANC_DIR="$REPO/scratchpad/2026-09-08-BANC-CHAT"
API_URL="$(grep -m1 '^SUPABASE_URL=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
ANON="$(grep -m1 '^SUPABASE_ANON_KEY=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
SRK="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
DB="supabase_db_Sophia_2"
FIX_PW="1234567"

# Trois fixtures, une par PORTE qu'on veut voir mordre.
PERTE_EMAIL="qa-chat-perte@keeltest.dev"     # fat_loss  — la boucle complète
MAINTIEN_EMAIL="qa-chat-maintien@keeltest.dev" # maintenance — la porte
SOLO_EMAIL="qa-chat-solo@keeltest.dev"        # fat_loss, sans foyer

# ⚠️ LE FUSEAU EST ÉPINGLÉ, ET C'EST CE QUI REND LES TIRS REJOUABLES.
# Toute la décision de C1 se prend sur l'HEURE LOCALE de la personne. Un banc
# qui laisse le fuseau du poste décider mesure une chose différente à chaque
# heure de la journée — et « ça ne part pas » devient indiscernable de « c'est
# trop tôt ».
FIX_TZ="Europe/Paris"

psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
psqlf() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA -F'|' "$@"; }

login() {
  curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$FIX_PW\"}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("access_token",""))'
}

uid_of() { psqlq -c "select id from auth.users where email='$1'"; }

# L'empreinte du code SERVI. On l'encadre autour de chaque tir: si elle bouge,
# une autre session a édité pendant la mesure et le run est JETÉ.
codeprint() {
  find "$REPO/supabase/functions/_shared" "$REPO/supabase/functions/keel-proactive-v1" \
       "$REPO/supabase/functions/meal-photo-upload-v1" \
    -name '*.ts' ! -name '*_test.ts' -exec stat -f '%m %N' {} \; 2>/dev/null \
    | sort | md5 | cut -c1-12
}

# Le cron interne, avec son secret. `invoke` seul rend 403 — cicatrice connue.
cron() { "$REPO/scripts/local_trigger_internal_job.sh" "$1" "$2"; }

# Un tap de bouton, par le vrai chemin entrant.
tap() { # $1=jwt  $2=payload  $3=label  [$4=reply_to]
  local body
  body="$(python3 - "$2" "$3" "${4:-}" <<'PY'
import json,sys,uuid
p,l,r = sys.argv[1], sys.argv[2], sys.argv[3]
m = {"client_message_id": str(uuid.uuid4()), "kind": "button",
     "button_payload": p, "label": l}
if r: m["reply_to"] = r
print(json.dumps(m))
PY
)"
  curl -s -X POST "$API_URL/functions/v1/chat-inbound-v1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $1" \
    -H 'content-type: application/json' -d "$body"
}
