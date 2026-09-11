#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# LES TROIS FIXTURES — UNE PAR PORTE QU'ON VEUT VOIR MORDRE
#
#   perte     fat_loss    + rythme 3 créneaux  → la boucle complète
#   maintien  maintenance + rythme 3 créneaux  → la PORTE (rien ne doit partir)
#   solo      fat_loss    + rythme, sans foyer → le plan personnel
#
# ⚠️ `student_goals` EST POSÉ PAR UN `insert`, ET C'EST LE MÊME CHEMIN QUE
# L'ÉCRAN. Vérifié avant d'écrire ce script: `api/onboarding.ts:2392` fait un
# `.from("student_goals").insert(...)` — il n'existe aucune RPC pour ça. Une
# fixture qui insère ne diverge donc pas du produit.
#
# ⚠️ LES HUIT COLONNES DE JETON D'`auth.users` DOIVENT ÊTRE '' ET JAMAIS NULL.
# GoTrue les scanne dans des `string` Go non-nullables: un NULL rend
# `HTTP 500 « Database error querying schema »` alors que le compte EXISTE et
# s'affiche. Cicatrice consignée en tête de `docs/keel/qa-fixtures/00-base.sql`.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
source "$(dirname "$0")/00-env.sh"

ensure_account() { # $1=email
  local existing
  existing="$(uid_of "$1" || true)"
  if [[ -z "$existing" ]]; then
    curl -s -X POST "$API_URL/auth/v1/signup" -H "apikey: $ANON" \
      -H 'content-type: application/json' \
      -d "{\"email\":\"$1\",\"password\":\"$FIX_PW\"}" >/dev/null
  fi
  # ⚠️ LA SORTIE DU `psql` EST JETÉE ICI. Un `UPDATE 1` renvoyé avec l'uid
  # produisait une chaîne de deux lignes que la requête suivante recevait comme
  # identifiant — et l'erreur était lisible, ce qui est la chance de ce banc.
  psqlq >/dev/null <<SQL
update auth.users set
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  email_change = coalesce(email_change, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
where email = '$1';
SQL
  uid_of "$1"
}

seed() { # $1=email  $2=goal  $3=rythme_json
  local uid; uid="$(ensure_account "$1")"
  [[ -n "$uid" ]] || { echo "⛔ pas d'uid pour $1" >&2; exit 1; }
  psqlq >/dev/null <<SQL
update public.profiles
   set keel_role = 'student',
       timezone  = '$FIX_TZ',
       locale    = 'fr-FR',
       proactive_muted_at = null,
       -- NULL, PAS false. NULL veut dire « personne n'a choisi », donc
       -- l'objectif décide. Un false ici ferait passer la fixture par la
       -- branche explicite, et la porte de l'objectif ne serait éprouvée par
       -- personne.
       slot_meal_ask_enabled = null
 where id = '$uid';

insert into public.student_goals (user_id, goal, content_locale, practical_constraints)
values ('$uid', '$2', 'en-GB', '$3'::jsonb)
on conflict (user_id) do update
   set goal = excluded.goal,
       practical_constraints = excluded.practical_constraints;
SQL
  echo "$1 → $uid ($2)"
}

# ⚠️ TROIS CRÉNEAUX AUX HEURES DÉCLARÉES, ET ELLES SONT LE CONTRAT DU TIR.
# C1 se décide sur `heure_locale >= at` et `< at + 2` (la grâce). Les tirs
# ci-dessous pinnent `now` pour tomber DANS cette fenêtre, jamais par hasard.
RYTHME='[{"slot":"breakfast","at":"08:00"},{"slot":"lunch","at":"12:30"},{"slot":"dinner","at":"19:30"}]'

seed "$PERTE_EMAIL"    fat_loss    "{\"eating_rhythm\": $RYTHME}"
seed "$MAINTIEN_EMAIL" maintenance "{\"eating_rhythm\": $RYTHME}"
seed "$SOLO_EMAIL"     fat_loss    "{\"eating_rhythm\": $RYTHME}"

echo
echo "── ce que la base porte maintenant ──"
psqlf -c "
select u.email, g.goal, p.timezone, p.slot_meal_ask_enabled,
       jsonb_array_length(g.practical_constraints->'eating_rhythm') as creneaux,
       (select count(*) from public.household_members hm where hm.user_id=u.id) as bouches
  from auth.users u
  join public.student_goals g on g.user_id=u.id
  join public.profiles p on p.id=u.id
 where u.email in ('$PERTE_EMAIL','$MAINTIEN_EMAIL','$SOLO_EMAIL')
 order by 1;"
