# ══════════════════════════════════════════════════════════════════════════
# SOCLE DU BANC FOYER — 2026-09-07 (phase 2, lots 9→15)
#
# Chantier: la méthode à plusieurs bouches. Le plan solo (lots 0–8) est livré;
# ici on étend à N mangeurs — cases, plats à part, un facteur par bouche.
#
# Patron: `scratchpad/2026-09-07-SOLO-BANC/00-env.sh`, lui-même copié de la
# campagne 9 POINTS. Les trois fixtures multi-bouches sont CELLES DE LA
# CAMPAGNE, jamais recréées ici: elles servent aussi de témoin d'identité aux
# lots solo, et deux fabriques du même foyer divergeraient.
#
# ⛔ LES CLÉS SE LISENT DANS `supabase/.env` ET NE SONT JAMAIS EXPORTÉES.
# Des `SUPABASE_*` exportés empoisonnent vitest — 114 faux rouges, mesuré.
# ══════════════════════════════════════════════════════════════════════════
REPO="/Users/ahmedamara/Dev/Sophia 2"
BANC_DIR="$REPO/scratchpad/2026-09-07-FOYER-BANC"
API_URL="$(grep -m1 '^SUPABASE_URL=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
ANON="$(grep -m1 '^SUPABASE_ANON_KEY=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
SRK="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
DB="supabase_db_Sophia_2"
FIX_PW="1234567"

# ── LES TROIS TABLES, PAR ORDRE DE DIFFICULTÉ ────────────────────────────
#   duo    — 2 adultes, aucun régime, aucun mineur. Le cas qui PASSE: la
#            grille doit rendre zéro plat à part, et le journal `box_sizing`
#            doit rester identique à la ligne de base.
#   quatre — un objectif de poids, un maintien, un MINEUR (Léo, 12 ans) et une
#            VÉGANE (Nora). C'est la table qui sépare la règle d'aujourd'hui
#            (« le plus strict gouverne, personne n'est dédié ») de la règle
#            décidée (« la minorité stricte a son plat »).
#   cinq   — deux objectifs pesés, trois mineurs, une végétarienne, deux
#            allergies. La table des couvercles: 2 boîtes propres + 1 bac.
foyer_email() {
  case "$1" in
    duo)    printf 'qa-9pts-duo@keeltest.dev' ;;
    quatre) printf 'qa-9pts-quatre@keeltest.dev' ;;
    cinq)   printf 'qa-9pts-cinq@keeltest.dev' ;;
    *) return 1 ;;
  esac
}

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

# ── LE FUSEAU QUI MET L'HORLOGE DU FOYER ENTRE 8 H ET 16 H ────────────────
#
# ⛔ CE N'EST PAS UNE COMMODITÉ, C'EST LA CONDITION DU TIR. `index.ts` lit
# l'horloge UNE fois, dans le fuseau de `profiles.timezone` du titulaire, et
# `plan_hours.ts::leadDayFor` en tire la veille de cuisine:
#
#     startsOn = today+1, hourNow < 18  →  leadDay = today   (day_before)
#     startsOn = today+1, hourNow ≥ 18  →  leadDay = null    (same_morning)
#
# Un tir lancé après 18 h locales retient les créneaux et rend une journée
# vide — on lirait un plan sans plats en croyant lire un défaut du moteur.
# `SHOPPING_CUTOFF_HOUR = 18` (`plan_hours.ts:54`) est la seule définition.
TZ_CANDIDATES="Europe/Paris America/Sao_Paulo America/New_York America/Los_Angeles Pacific/Honolulu Asia/Tokyo Australia/Sydney"
pick_tz() { # -> imprime un fuseau où il est entre 8 h et 16 h, ou vide
  local tz h
  for tz in $TZ_CANDIDATES; do
    h="$(TZ="$tz" date +%H)"
    h="${h#0}"
    if [ "${h:-0}" -ge 8 ] && [ "${h:-0}" -le 16 ]; then printf '%s' "$tz"; return 0; fi
  done
  return 1
}
