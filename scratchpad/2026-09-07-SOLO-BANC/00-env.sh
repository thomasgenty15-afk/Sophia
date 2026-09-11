# ══════════════════════════════════════════════════════════════════════════
# SOCLE DU BANC SOLO — 2026-09-07
#
# Chantier: `docs/keel/METHODE-GENERATION-DE-PLAN-SOLO.md`.
# Patron: `scratchpad/2026-09-04-1658-CAMPAGNE-9-POINTS/00-env.sh`.
#
# ⛔ LES CLÉS SE LISENT DANS `supabase/.env` ET NE SONT JAMAIS EXPORTÉES.
# Des `SUPABASE_*` exportés empoisonnent vitest — 114 faux rouges, mesuré.
# ══════════════════════════════════════════════════════════════════════════
REPO="/Users/ahmedamara/Dev/Sophia 2"
BANC_DIR="$REPO/scratchpad/2026-09-07-SOLO-BANC"
API_URL="$(grep -m1 '^SUPABASE_URL=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
ANON="$(grep -m1 '^SUPABASE_ANON_KEY=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
SRK="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' "$REPO/supabase/.env" | cut -d= -f2- | tr -d '"')"
DB="supabase_db_Sophia_2"
FIX_PW="1234567"
HOUSE_COACH="00000000-0000-4000-8000-00000000d15c"

# LE FOYER D'UNE BOUCHE. C'est le seul chemin que `PORTION_SIZING_MAX_MOUTHS`
# arme; les foyers à plusieurs bouches de la campagne 9 POINTS servent de
# témoin d'identité et NE SONT PAS recréés ici.
SOLO_EMAIL="qa-solo-hh@keeltest.dev"
# Le témoin multi-bouches, emprunté à la campagne du 2026-09-04.
DUO_EMAIL="qa-9pts-duo@keeltest.dev"

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
# ⛔ CE N'EST PAS UNE COMMODITÉ, C'EST LA CONDITION DU TIR. `index.ts:1488` lit
# l'horloge UNE fois, dans le fuseau de `profiles.timezone` du titulaire, et
# `plan_hours.ts::leadDayFor` en tire la veille de cuisine:
#
#     startsOn = today+1, hourNow < 18  →  leadDay = today   (day_before)
#     startsOn = today+1, hourNow ≥ 18  →  leadDay = null    (same_morning)
#
# Un tir lancé après 18 h locales retient donc les créneaux et rend une journée
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

# ══════════════════════════════════════════════════════════════════════════
# ⛔ PRÉ-VOL — LE BANC SOLO NE TIRE QUE SUR UNE FIXTURE À UNE BOUCHE
# ══════════════════════════════════════════════════════════════════════════
#
# ⚠️ CE PRÉ-VOL A D'ABORD ÉTÉ ÉCRIT DE TRAVERS, LE 2026-09-08, et le noter vaut
# mieux que le réécrire en silence. Il refusait de tirer tant que
# `PORTION_SIZING_MAX_MOUTHS` n'était pas à 1 — la valeur que le banc FOYER monte
# à 12 pendant ses propres tirs. C'était trop strict: la garde s'écrit
# `platedMouths > MAX`, donc à UNE bouche elle rend `portion_v1` pour toute
# valeur ≥ 1. Le chemin pris par une fixture solo est identique à 1 et à 12, et
# le banc s'est bloqué lui-même sur un risque qu'il ne courait pas.
#
# ⛔ CE QUI COMPTE EST LA FIXTURE, PAS LA CONSTANTE. À DEUX bouches et plus, une
# constante relevée arme `applySizing` pour la PREMIÈRE bouche sur toute la
# table: c'est ce cas-là qu'il faut refuser, et il se lit sur le compte de
# bouches du foyer visé — pas sur une ligne de source.
require_solo_lane() {
  local email="${1:-}"
  local f="$REPO/supabase/functions/_shared/keel/portion_sizing.ts"
  local max
  max="$(grep -m1 -o 'PORTION_SIZING_MAX_MOUTHS = [0-9]*' "$f" | grep -o '[0-9]*$')"
  if [ -z "$max" ] || [ "$max" -lt 1 ]; then
    echo "⛔ PRÉ-VOL: PORTION_SIZING_MAX_MOUTHS illisible ou < 1 — la lane solo est fermée." >&2
    return 1
  fi
  if [ -n "$email" ]; then
    local bouches
    bouches="$(psqlq -c "select count(*) from household_members m
      join auth.users u on keel_household_of(u.id) = m.household_id
      where u.email = '$email';")"
    if [ "${bouches:-0}" -ne 1 ]; then
      echo "⛔ PRÉ-VOL: $email porte $bouches bouches — le banc SOLO n'en juge qu'une." >&2
      return 1
    fi
    if [ "$max" -gt 1 ] && [ "${bouches:-0}" -gt 1 ]; then
      echo "⛔ PRÉ-VOL: MAX_MOUTHS=$max ET $bouches bouches: applySizing armerait" >&2
      echo "   le facteur de la PREMIÈRE bouche sur toute la table." >&2
      return 1
    fi
  fi
  if [ "$max" -ne 1 ]; then
    echo "⚠️  MAX_MOUTHS=$max (le banc foyer l'a montée). Sans effet à UNE bouche:"
    echo "    la garde est \`platedMouths > MAX\`, et 1 > $max est faux."
  fi
}
