#!/usr/bin/env bash
# Ouvre une session locale pour vérifier un écran AU RENDU, sans taper de mot de
# passe dans un formulaire: on demande un jeton à l'API d'auth locale, et on le
# pose dans `localStorage` sous la clé que `supabase-js` lit.
#
#   usage: bash scratchpad/plateforme/qa-session.sh <persona>
#   personas: gate | house | solo | coach
#
# Colle ensuite la ligne imprimée dans `javascript_tool` sur ton onglet, puis
# navigue. La clé est `sb-127-auth-token` parce que `supabase-js` la dérive du
# premier label de l'hôte de `VITE_SUPABASE_URL` (`127.0.0.1` → `127`).
#
# ⚠️ Le profil du navigateur est PARTAGÉ entre sessions: ne vide pas
# `localStorage`, ne déconnecte personne, ne ferme pas les onglets des autres.
# Poser une clé est additif; `localStorage.clear()` casserait le travail d'autrui.
set -euo pipefail

cd "$(dirname "$0")/../.."

case "${1:-house}" in
  gate)  EMAIL="ff060_gate@example.com" ;;   # élève SANS student_goals → la garde d'entrée le renvoie sur /app/setup
  house) EMAIL="ff060_house@example.com" ;;  # élève AVEC objectif + foyer → /app/today, /app/plan, /app/household rendent
  solo)  EMAIL="ff060_solo@example.com" ;;   # élève avec objectif, sans foyer
  coach)
    EMAIL="$(docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -At \
      -c "select email from auth.users u join coaches c on c.user_id=u.id where c.status='active' order by u.created_at desc limit 1;")"
    ;;
  *) echo "persona inconnu: $1 (gate|house|solo|coach)" >&2; exit 2 ;;
esac

ANON="$(grep -hoE 'VITE_SUPABASE_ANON_KEY *= *[^ ]+' frontend/.env* 2>/dev/null | head -1 | sed 's/.*= *//')"
[ -n "$ANON" ] || { echo "VITE_SUPABASE_ANON_KEY introuvable dans frontend/.env*" >&2; exit 1; }

RESP="$(curl -s -m 10 -X POST \
  "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}")"

echo "$RESP" | node -e '
let raw=""; process.stdin.on("data",d=>raw+=d).on("end",()=>{
  const s=JSON.parse(raw);
  if(!s.access_token){console.error("échec d’auth: "+raw.slice(0,200));process.exit(1);}
  const u=s.user;
  const sess={access_token:s.access_token,token_type:s.token_type,expires_in:s.expires_in,
    expires_at:s.expires_at,refresh_token:s.refresh_token,
    user:{id:u.id,aud:u.aud,role:u.role,email:u.email,email_confirmed_at:u.email_confirmed_at,
      phone:"",confirmed_at:u.confirmed_at,last_sign_in_at:u.last_sign_in_at,
      app_metadata:u.app_metadata,user_metadata:u.user_metadata,identities:[],
      created_at:u.created_at,updated_at:u.updated_at,is_anonymous:false}};
  process.stderr.write("persona: "+u.email+"\n\nà coller dans javascript_tool:\n\n");
  console.log("localStorage.setItem(\"sb-127-auth-token\", "
    +JSON.stringify(JSON.stringify(sess))
    +"); \"ok:\"+JSON.parse(localStorage.getItem(\"sb-127-auth-token\")).user.email");
});'
