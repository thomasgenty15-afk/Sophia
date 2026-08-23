#!/usr/bin/env bash
# LA MOITIÉ « PROMPT » DU LOT, RETIRÉE — POUR UN RUN RÉEL.
#
# ⛔ CE N'EST PAS UNE RÉPARATION, C'EST UNE MESURE. Les épreuves de mutation
# (§5) prouvent que la ceinture mord sur des octets fabriqués à la main. Ce
# script pose la question qu'un test unitaire ne peut pas poser: quand le modèle
# écrit LUI-MÊME une boîte de bœuf au nom de l'enfant végane — ce qu'il a fait
# cinq plans sur cinq avant ce lot — la ceinture la retire-t-elle EN RUN RÉEL ?
#
#   ./mutate-prompt.sh off   retire les 3 lignes d'exception, redémarre le runtime
#   ./mutate-prompt.sh on    les remet, redémarre le runtime
set -euo pipefail
F="/Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/household_diet.ts"
BAK="/private/tmp/claude-502/-Users-ahmedamara-Dev-Sophia-2/e6367a9a-a399-4157-9834-067e9ee0860c/scratchpad/household_diet.ts.bak"
case "${1:-}" in
  off)
    python3 - "$F" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
i = s.index('    if (held.length > 0) {\n      lines.push(\n        `${held.join(", ")} take no box')
j = s.index('\n    }\n', i) + len('\n    }\n')
open(p, "w").write(s[:i] + s[j:])
print("prompt: 3 lignes retirées")
PY
    ;;
  on)
    cp "$BAK" "$F"; echo "prompt: remis en état"
    ;;
  *) echo "usage: $0 on|off"; exit 2;;
esac
grep -c "take no box" "$F" || true
docker restart supabase_edge_runtime_Sophia_2 >/dev/null
echo "runtime redémarré"
