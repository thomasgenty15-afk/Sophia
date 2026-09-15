#!/usr/bin/env bash
# ============================================================================
# LA PILE LOCALE SIGNE-T-ELLE ET VÉRIFIE-T-ELLE SUR LE MÊME ALGORITHME ?
#
# Lancez ceci AVANT de croire à un bug d'écran, dès qu'une fonction edge rend
# 401 `Invalid JWT` alors que PostgREST répond normalement. C'est le symptôme
# exact du désalignement, et il a coûté plusieurs journées, plusieurs fois.
#
# Pourquoi ce script existe: voir docs/keel/JWT-HS256.md
# ============================================================================
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

CONFIG="supabase/config.toml"
PROJECT="${SUPABASE_PROJECT_ID:-Sophia_2}"
CONTAINER="supabase_auth_${PROJECT}"
KO=0
# `--static`: n'inspecte que le dépôt, jamais la pile qui tourne. C'est ce que
# le gate de commit appelle — l'état du Docker d'un poste ne doit pas décider
# si un commit passe.
STATIC_ONLY=0
[ "${1:-}" = "--static" ] && STATIC_ONLY=1

ok()   { printf '  ✅ %s\n' "$1"; }
bad()  { printf '  ❌ %s\n' "$1"; KO=$((KO+1)); }
skip() { printf '  ·  %s\n' "$1"; }

printf '\n── Contrôles statiques (le dépôt)\n'

# 1. La ligne doit être ACTIVE, pas commentée.
KEYS_PATH="$(grep -E '^[[:space:]]*signing_keys_path[[:space:]]*=' "$CONFIG" 2>/dev/null \
  | head -1 | sed -E 's/.*=[[:space:]]*"([^"]+)".*/\1/')"
if [ -z "$KEYS_PATH" ]; then
  bad "$CONFIG n'a AUCUN signing_keys_path actif — le CLI va fabriquer une clé EC
     à chaque \`supabase start\`, et toute fonction en verify_jwt = true rendra 401."
else
  ok "signing_keys_path actif → $KEYS_PATH"

  # 2. Le fichier pointé doit exister et être un tableau VIDE.
  FILE="supabase/${KEYS_PATH#./}"
  if [ ! -f "$FILE" ]; then
    bad "$FILE est introuvable — \`supabase start\` échouera."
  else
    CONTENT="$(tr -d '[:space:]' < "$FILE")"
    if [ "$CONTENT" = "[]" ]; then
      ok "$FILE est le jeu de clés vide attendu"
    else
      bad "$FILE n'est PAS vide. C'est le bug, pas la réparation: le CLI refuse
     les clés symétriques (« must be one of [RS256 ES256] »), et toute clé
     asymétrique fait signer GoTrue en ES256 que le gateway edge sait pas lire.
     Remettez exactement: []"
    fi
  fi
fi

if [ "$STATIC_ONLY" = "1" ]; then
  printf '\n'
  [ "$KO" -eq 0 ] && exit 0
  printf '❌ Alignement JWT rompu dans le dépôt — voir docs/keel/JWT-HS256.md\n\n'
  exit 1
fi

printf '\n── Contrôles à chaud (la pile qui tourne)\n'

if ! command -v docker >/dev/null 2>&1 || ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  skip "$CONTAINER absent — pile arrêtée, contrôles à chaud sautés."
else
  ENVKEYS="$(docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep '^GOTRUE_JWT_KEYS=' | cut -d= -f2-)"
  NORM="$(printf '%s' "$ENVKEYS" | tr -d '[:space:]')"
  if [ -z "$ENVKEYS" ] || [ "$NORM" = "[]" ]; then
    ok "GoTrue n'a aucune clé à préférer → il signe avec GOTRUE_JWT_SECRET (HS256)"
  else
    bad "GoTrue porte une clé de signature: $(printf '%s' "$ENVKEYS" | head -c 60)…
     Il signe donc en ES256 et le gateway edge refusera tous les jetons.
     Le conteneur est plus vieux que le correctif: relancez la pile
       supabase stop && supabase start"
  fi

  JWKS="$(curl -s --max-time 5 http://127.0.0.1:54321/auth/v1/.well-known/jwks.json 2>/dev/null | tr -d '[:space:]')"
  case "$JWKS" in
    '{"keys":[]}') ok "JWKS public vide — confirmé côté HTTP" ;;
    '')            skip "auth injoignable sur 54321 — sonde HTTP sautée" ;;
    *)             bad "JWKS public expose une clé: $(printf '%s' "$JWKS" | head -c 80)…" ;;
  esac
fi

printf '\n'
if [ "$KO" -eq 0 ]; then
  printf '✅ Alignement JWT correct — une seule clé, HS256, pour toute la pile.\n\n'
  exit 0
fi
cat <<'MSG'
❌ Désalignement JWT. Ce n'est PAS un bug de l'écran qui échoue.

   Symptôme: toute fonction edge en `verify_jwt = true` rend 401 `Invalid JWT`
   pendant que PostgREST continue de répondre — donc « le reste marche » et on
   cherche au mauvais endroit.

   NE RÉPAREZ PAS en passant des fonctions à `verify_jwt = false`: ça déplace un
   défaut de poste de dev dans un fichier qui part en production. Le gate de
   commit refuse d'ailleurs ce geste.

   Lisez docs/keel/JWT-HS256.md.
MSG
exit 1
