#!/usr/bin/env bash
# ============================================================================
# CE SCRIPT N'A PLUS DE RAISON D'ÊTRE — et surtout, ne le ressuscitez pas.
#
# Il recréait le conteneur `auth` à la main, à chaque `supabase stop/start`,
# pour retirer la clé EC que le CLI y injectait. C'était un pansement qu'il
# fallait se rappeler d'appliquer — donc qu'on oubliait, donc le bug revenait.
#
# Depuis le 2026-08-11 la pile est alignée DÉCLARATIVEMENT, dans
# supabase/config.toml (`signing_keys_path`). Un simple `supabase start` suffit,
# il n'y a plus de geste à retenir.
#
#   Ce qu'il faut savoir:  docs/keel/JWT-HS256.md
#   Ce qu'il faut lancer:  ./scripts/check-local-jwt-alg.sh
# ============================================================================
set -uo pipefail

cat <<'MSG'
⚠️  scripts/local_auth_hs256.sh est retiré.

    La pile locale est désormais alignée sur HS256 par configuration, pas par
    un script à rejouer. Il n'y a plus rien à lancer après `supabase start`.

    Si vous êtes ici parce qu'une fonction edge rend 401 « Invalid JWT »,
    lancez le diagnostic ci-dessous — il vous dira si la faute est dans le
    dépôt ou dans la pile qui tourne.
MSG

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
if [ -x "$ROOT/scripts/check-local-jwt-alg.sh" ]; then
  echo
  exec "$ROOT/scripts/check-local-jwt-alg.sh"
fi
echo
echo "    ./scripts/check-local-jwt-alg.sh   (introuvable — voir docs/keel/JWT-HS256.md)"
exit 1
