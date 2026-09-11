#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# SERVIR LES FONCTIONS EN LOCAL — AVEC LE PLAFOND DE KONG RELEVÉ
# ═══════════════════════════════════════════════════════════════════════════
#
# Remplace :
#     supabase functions serve --env-file supabase/.env
#
# Ce que ça fait en plus : relever le `read_timeout` de Kong AVANT de servir.
#
# ── POURQUOI IL FAUT LE REFAIRE À CHAQUE FOIS ─────────────────────────────
#
# Le conteneur Kong n'a AUCUN VOLUME MONTÉ : son `kong.yml` est réécrit à
# chaque démarrage par son propre `entrypoint`, depuis un bloc de texte que la
# CLI Supabase fabrique au `supabase start`. Il n'existe donc aucun fichier de
# ce dépôt où poser la valeur de façon permanente — le patch vit dans le
# conteneur qui tourne, et tout redémarrage le ramène à 150 000 ms.
#
# ⚠️ ET C'EST AUSSI BIEN. 150 s est la valeur de l'HÉBERGÉ (la configuration
# locale porte le commentaire « to match hosted project »). Une pile locale
# durablement plus permissive que la production finit par mentir sur la
# production : une génération de 4 minutes passerait ici et serait coupée chez
# le client. Le relevé sert à CONNAÎTRE la durée, jamais à la PARDONNER — c'est
# pour ça que `lot8_integration_handler_test.ts` compare lui-même la durée
# mesurée à `HOSTED_GATEWAY_TIMEOUT_MS = 150_000` et rougit au-dessus.
#
# ── USAGE ────────────────────────────────────────────────────────────────
#
#     ./scripts/local_serve_functions.sh
#     TIMEOUT_MS=900000 ./scripts/local_serve_functions.sh
#     ENV_FILE=supabase/.env.autre ./scripts/local_serve_functions.sh
#
# Prérequis : `supabase start` doit déjà tourner (c'est lui qui monte Kong).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TIMEOUT_MS="${TIMEOUT_MS:-600000}"
ENV_FILE="${ENV_FILE:-supabase/.env}"
HOSTED_MS=150000

if [ ! -f "$ENV_FILE" ]; then
  printf '⛔ %s introuvable.\n' "$ENV_FILE" >&2
  exit 1
fi

# ── ① LE PLAFOND ─────────────────────────────────────────────────────────
# Un échec ici n'empêche PAS de servir : on veut travailler même sans le
# relevé. Mais on le DIT, parce qu'une limite silencieusement revenue à 150 s
# se lit ensuite comme « la génération plante », et c'est faux.
if TIMEOUT_MS="$TIMEOUT_MS" ./scripts/local_extend_kong_functions_timeout.sh >/dev/null 2>&1; then
  printf '✅ Kong relevé à %s ms (l’hébergé coupe à %s ms).\n' "$TIMEOUT_MS" "$HOSTED_MS"
  printf '   Au-delà de %s ms, une requête qui passe ICI est coupée EN PRODUCTION.\n' "$HOSTED_MS"
else
  printf '⚠️  Kong n’a PAS été relevé — il coupe donc à %s ms.\n' "$HOSTED_MS" >&2
  printf '   Cause la plus probable : la pile n’est pas démarrée (`supabase start`).\n' >&2
fi

# ── ② SERVIR ─────────────────────────────────────────────────────────────
# `exec` : ce script disparaît, Ctrl-C va droit à `functions serve`.
printf '▶️  supabase functions serve --env-file %s\n\n' "$ENV_FILE"
exec supabase functions serve --env-file "$ENV_FILE"
