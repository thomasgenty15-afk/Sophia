#!/usr/bin/env bash
# Claude Code PreToolUse hook (matcher: Bash).
# Blocks risky, hard-to-reverse mutating commands so that an AI agent cannot run
# them on its own. Exit code 2 => Claude Code blocks the tool call and shows the
# message below to the agent.
#
# Covered: supabase secrets set/unset · db reset · db push · functions deploy ·
#          projects/branches delete · link · secret writes via the Management API.
set -uo pipefail

payload="$(cat)"

verdict="$(RISKY_HOOK_PAYLOAD="$payload" python3 <<'PY'
import os, sys, json, re
try:
    data = json.loads(os.environ.get("RISKY_HOOK_PAYLOAD", "") or "{}")
except Exception:
    print("ALLOW"); sys.exit(0)

cmd = (data.get("tool_input") or {}).get("command", "") or ""
c = cmd.lower()

risky = [
    r'\bsupabase\s+secrets\s+(set|unset)\b',
    r'\bsupabase\s+db\s+(reset|push)\b',
    r'\bsupabase\s+functions\s+deploy\b',
    r'\bsupabase\s+projects\s+delete\b',
    r'\bsupabase\s+branches\s+delete\b',
    r'\bsupabase\s+link\b',
]
for pat in risky:
    if re.search(pat, c):
        print("BLOCK"); sys.exit(0)

# Management API secret writes (POST/PUT/PATCH/DELETE to .../secrets). Reads (GET) stay allowed.
if 'api.supabase.com' in c and 'secrets' in c:
    if re.search(r'(-x|--request)\s*(post|put|patch|delete)', c) or re.search(r'(^|\s)(-d|--data(-\w+)?)\b', c):
        print("BLOCK"); sys.exit(0)

print("ALLOW")
PY
)"

if [ "$verdict" = "BLOCK" ]; then
  cat >&2 <<'MSG'
🚫 Commande à risque BLOQUÉE par la sécurité du projet (.claude/hooks/block-risky-commands.sh).

Catégorie : secrets set/unset · db reset · db push · functions deploy ·
projects/branches delete · link · écriture de secrets via la Management API.

Un agent IA ne peut PAS exécuter ce type de commande seul. Elle exige la
VALIDATION EXPLICITE de l'utilisateur humain, qui doit la lancer lui-même
dans son terminal.

À faire : ne réessaie pas de contourner. Donne à l'utilisateur la commande
exacte à copier-coller et laisse-le l'exécuter.
MSG
  exit 2
fi
exit 0
