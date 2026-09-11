# Source commun de la campagne du 2026-09-09 (dix plans, solo puis foyer).
# ⛔ LECTURE SEULE sur le dépôt. Les seules écritures sont des tables de FIXTURE.
REPO="/Users/ahmedamara/Dev/Sophia 2"
CAMP_DIR="$REPO/scratchpad/2026-09-09-CAMPAGNE-PLANS"
API_URL="$(grep -m1 '^SUPABASE_URL=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
ANON="$(grep -m1 '^SUPABASE_ANON_KEY=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
SRK="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
DB="supabase_db_Sophia_2"
EDGE="supabase_edge_runtime_Sophia_2"
FIX_PW="1234567"
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
login() {
  curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$FIX_PW\"}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("access_token",""))'
}
