#!/usr/bin/env bash
# Guard wrapper around the `supabase` CLI.
#
#   - AI agents / non-interactive shells: risky mutating subcommands are BLOCKED.
#   - Interactive humans: risky subcommands require typing exactly `yes`.
#
# Enable it by adding this line to your ~/.zshrc (done automatically by the
# assistant, look for the "Sophia risky-command guard" block):
#
#     supabase() { "/Users/ahmedamara/Dev/Sophia 2/scripts/safe-supabase.sh" "$@"; }
#
# Covered subcommands: secrets set/unset · db reset · db push · functions deploy ·
# config push · projects delete · branches delete · link.
set -uo pipefail

lc() { printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]'; }
g="$(lc "${1:-}")"
a="$(lc "${2:-}")"

is_risky=0
[ "$g" = "link" ] && is_risky=1
[ "$g" = "secrets" ] && { [ "$a" = "set" ] || [ "$a" = "unset" ]; } && is_risky=1
[ "$g" = "db" ] && { [ "$a" = "reset" ] || [ "$a" = "push" ]; } && is_risky=1
[ "$g" = "functions" ] && [ "$a" = "deploy" ] && is_risky=1
# `config push` ecrase la config du projet lie avec supabase/config.toml, qui
# porte des reglages voulus locaux (signing_keys_path -> docs/keel/JWT-HS256.md).
[ "$g" = "config" ] && [ "$a" = "push" ] && is_risky=1
[ "$g" = "projects" ] && [ "$a" = "delete" ] && is_risky=1
[ "$g" = "branches" ] && [ "$a" = "delete" ] && is_risky=1

# Resolve the real supabase binary (never this wrapper).
REAL=""
for c in /opt/homebrew/bin/supabase /usr/local/bin/supabase /usr/bin/supabase; do
  [ -x "$c" ] && REAL="$c" && break
done
[ -z "$REAL" ] && REAL="$(command -v supabase 2>/dev/null || true)"
[ -z "$REAL" ] && { echo "safe-supabase: real supabase CLI not found in PATH" >&2; exit 127; }

if [ "$is_risky" = "1" ]; then
  echo "⚠️  Commande Supabase à risque détectée : supabase $*" >&2
  if [ -n "${CLAUDECODE:-}" ] || [ -n "${CLAUDE_CODE:-}" ] || [ -n "${CODEX:-}" ] \
     || [ -n "${OPENAI_AGENT:-}" ] || [ -n "${AI_AGENT:-}" ] || [ -n "${CI:-}" ] || [ ! -t 0 ]; then
    echo "🚫 INTERDIT aux agents IA / exécution non-interactive." >&2
    echo "   secrets set · db reset · db push · functions deploy · config push exigent une validation humaine explicite." >&2
    echo "   → L'utilisateur doit taper la commande lui-même dans un terminal interactif." >&2
    exit 1
  fi
  printf "Tape exactement 'yes' pour confirmer (autre chose = annuler) : " >&2
  IFS= read -r ans || ans=""
  if [ "$ans" != "yes" ]; then
    echo "Annulé." >&2
    exit 1
  fi
fi

exec "$REAL" "$@"
