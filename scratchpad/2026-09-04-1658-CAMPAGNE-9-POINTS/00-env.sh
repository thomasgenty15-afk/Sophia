# Socle commun de la CAMPAGNE 9 POINTS (2026-09-04).
# ⛔ Les clés se LISENT dans supabase/.env et ne sont JAMAIS exportées:
# des SUPABASE_* exportés empoisonnent vitest (114 faux rouges).
REPO="/Users/ahmedamara/Dev/Sophia 2"
CAMP_DIR="$REPO/scratchpad/2026-09-04-1658-CAMPAGNE-9-POINTS"
API_URL="$(grep -m1 '^SUPABASE_URL=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
ANON="$(grep -m1 '^SUPABASE_ANON_KEY=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
SRK="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
DB="supabase_db_Sophia_2"
FIX_PW="1234567"
HOUSE_COACH="00000000-0000-4000-8000-00000000d15c"

# Les quatre comptes de la campagne.
SOLO_EMAIL="qa-9pts-solo@keeltest.dev"
DUO_EMAIL="qa-9pts-duo@keeltest.dev"
QUATRE_EMAIL="qa-9pts-quatre@keeltest.dev"
CINQ_EMAIL="qa-9pts-cinq@keeltest.dev"

psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
login() {
  curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$FIX_PW\"}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("access_token",""))'
}
# L'EMPREINTE DU CODE MESURÉ — d'autres sessions écrivent sous supabase/functions.
codeprint() {
  find "$REPO/supabase/functions/_shared/keel" "$REPO/supabase/functions/$1" \
    -name '*.ts' ! -name '*_test.ts' -exec stat -f '%m %N' {} \; 2>/dev/null \
    | sort | md5 | cut -c1-12
}
