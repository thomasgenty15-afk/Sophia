#!/bin/sh
# Lance un script Deno de la passe transverse avec l'environnement du runtime
# edge (clés de modèle incluses), INLINE — jamais exporté dans le shell de
# l'agent (règle 5 du chantier: `SUPABASE_*` exporté = 114 faux rouges).
set -e
cd "$(dirname "$0")/.."
GEMINI_API_KEY="$(docker exec supabase_edge_runtime_Sophia_2 printenv GEMINI_API_KEY)" \
OPENAI_API_KEY="$(docker exec supabase_edge_runtime_Sophia_2 printenv OPENAI_API_KEY)" \
OPENAI_BASE_URL="$(docker exec supabase_edge_runtime_Sophia_2 printenv OPENAI_BASE_URL)" \
INTERNAL_FUNCTION_SECRET="$(docker exec supabase_edge_runtime_Sophia_2 printenv INTERNAL_FUNCTION_SECRET)" \
SUPABASE_URL="http://127.0.0.1:54321" \
SUPABASE_ANON_KEY="$(supabase status -o env 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')" \
SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')" \
  deno run -A --no-check "$@"
