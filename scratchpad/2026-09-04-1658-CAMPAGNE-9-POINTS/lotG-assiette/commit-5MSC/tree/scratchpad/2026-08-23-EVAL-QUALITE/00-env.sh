# Source commun de l'évaluation qualité du 2026-08-23.
# ⛔ LECTURE SEULE sur le dépôt. Les seules écritures sont des tables de FIXTURE.
REPO="/Users/ahmedamara/Dev/Sophia 2"
EVAL_DIR="$REPO/scratchpad/2026-08-23-EVAL-QUALITE"
API_URL="$(grep -m1 '^SUPABASE_URL=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
ANON="$(grep -m1 '^SUPABASE_ANON_KEY=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
SRK="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
DB="supabase_db_Sophia_2"
SOLO_EMAIL="eval0823.solo@keeltest.dev"
HH_EMAIL="eval0823.master@keeltest.dev"
FIX_PW="1234567"
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
login() { # $1=email -> prints token
  curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$FIX_PW\"}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("access_token",""))'
}
