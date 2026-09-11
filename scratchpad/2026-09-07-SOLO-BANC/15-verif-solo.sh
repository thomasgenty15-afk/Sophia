#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# LA FIXTURE SOLO, RELUE PAR LES CLÉS QUE LE MOTEUR LIT — 2026-09-07
#
#   bash 15-verif-solo.sh
#
# ⛔ ELLE NE RELIT PAS CE QU'ELLE VIENT D'ÉCRIRE. Une vérification qui
# interroge la table où la fixture a posé sa valeur prouve que l'écriture a eu
# lieu, pas que le MOTEUR la trouvera. Chaque ligne ci-dessous passe par la
# porte du moteur: `keel_household_habits_for` et non `household_member_habits`,
# `keel_household_bodies_for` et non la table, les clés exactes de
# `practical_constraints` que `parseEatingRhythm` et `parseFixedIntakes` lisent.
#
# rc=0 ⇒ tout est vert. rc=1 ⇒ au moins une ligne manque, et elle est nommée.
set -uo pipefail
source "$(dirname "$0")/00-env.sh"

U="$(psqlq -c "select id from auth.users where email='$SOLO_EMAIL'")"
[ -z "$U" ] && { echo "⛔ pas de compte $SOLO_EMAIL — lance 10-fixture-solo.sh"; exit 1; }
FAIL=0
ok()  { printf '   ✓ %-38s %s\n' "$1" "$2"; }
bad() { printf '   ⛔ %-38s %s\n' "$1" "$2"; FAIL=1; }
chk() { # nom attendu obtenu
  [ "$2" = "$3" ] && ok "$1" "$3" || bad "$1" "attendu «$2», lu «$3»"
}
echo "══ VÉRIF SOLO · $SOLO_EMAIL · $U"

# ── ① LE ROSTER: UNE SEULE BOUCHE, ET ELLE PORTE LE COMPTE ───────────────
# C'est la borne du chemin armé: `PORTION_SIZING_MAX_MOUTHS = 1`. À deux
# bouches le moteur retombe en `legacy_measure` et le banc mesure autre chose.
# ⛔ `households` NE PORTE PAS DE COLONNE DE TITULAIRE. Le lien vit sur
# `household_members.user_id`, et la seule dérivation du produit est
# `keel_household_of(p_user)` — la même que toutes les RPC utilisent.
HID="$(psqlq -c "select public.keel_household_of('$U'::uuid)")"
[ -z "$HID" ] && bad "foyer" "keel_household_of rend NULL"
chk "roster · bouches"      "1" "$(psqlq -c "select count(*) from household_members where household_id='$HID'")"
chk "roster · titulaire lié" "1" "$(psqlq -c "select count(*) from household_members where household_id='$HID' and user_id='$U'")"
OWN="$(psqlq -c "select member_id from household_members where household_id='$HID' and user_id='$U'")"

# ── ② LE CORPS, PAR LA PORTE QUI NOURRIT `mouthTargetKcal` ───────────────
# ⛔ `keel_household_bodies_for(p_household)` — clavée sur `member_id`. C'est
# ELLE que `lineBodies` lit. `profiles` + `student_body_measures` ne servent que
# le brief du modèle et ne dimensionnent RIEN.
chk "corps · lignes (bodies_for)" "1" "$(psqlq -c "select count(*) from keel_household_bodies_for('$HID'::uuid)")"
psqlq -c "select '      corps: '||height_cm||' cm · '||weight_kg||' kg · '||gender||' · '||activity_level||' · appétit '||coalesce(appetite,'(nul)') from keel_household_bodies_for('$HID'::uuid);"
chk "corps · appétit renseigné" "average" "$(psqlq -c "select coalesce(appetite,'') from keel_household_bodies_for('$HID'::uuid)")"

# ── ③ LES HABITUDES, PAR `keel_household_habits_for` ─────────────────────
H="$(psqlq -c "select slots::text from keel_household_habits_for('$U'::uuid)")"
echo "      habitudes: $H"
case "$H" in *'"light": true'*) ok "habitudes · dîner léger" "light:true";; *) bad "habitudes · dîner léger" "clé `light` absente: $H";; esac
case "$H" in *'"bread"'*)       ok "habitudes · pain au dîner" "extras:[bread]";; *) bad "habitudes · pain au dîner" "absent";; esac

# ── ④ LE RYTHME ET LE SHAKER, AUX CLÉS EXACTES DES DEUX PARSEURS ─────────
chk "rythme · moments déclarés" "4" "$(psqlq -c "select jsonb_array_length(practical_constraints->'eating_rhythm') from student_goals where user_id='$U'")"
chk "rythme · snack_pm présent" "1" "$(psqlq -c "select count(*) from student_goals, jsonb_array_elements(practical_constraints->'eating_rhythm') e where user_id='$U' and e->>'slot'='snack_pm'")"
# ⛔ AUCUNE `size`. Une taille déclarée ferait compter « léger » deux fois.
chk "rythme · aucune taille"    "0" "$(psqlq -c "select count(*) from student_goals, jsonb_array_elements(practical_constraints->'eating_rhythm') e where user_id='$U' and e ? 'size'")"
chk "shaker · lignes"           "1" "$(psqlq -c "select jsonb_array_length(practical_constraints->'fixed_intakes') from student_goals where user_id='$U'")"
chk "shaker · créneau"    "snack_pm" "$(psqlq -c "select practical_constraints->'fixed_intakes'->0->>'slot' from student_goals where user_id='$U'")"
chk "shaker · kcal déclarées" "120" "$(psqlq -c "select practical_constraints->'fixed_intakes'->0->>'energy_kcal_per_serving' from student_goals where user_id='$U'")"
chk "shaker · nutrition"  "declared" "$(psqlq -c "select practical_constraints->'fixed_intakes'->0->>'nutrition' from student_goals where user_id='$U'")"
# `days: []` = tous les jours. Une clé absente se relirait pareil et ne se
# déboguerait pas pareil — c'est la discipline de `shakerIntakeJson`.
chk "shaker · days présent (vide)" "0" "$(psqlq -c "select jsonb_array_length(practical_constraints->'fixed_intakes'->0->'days') from student_goals where user_id='$U'")"

# ── ⑤ L'OBJECTIF ET LE COACH ─────────────────────────────────────────────
chk "objectif"           "maintenance" "$(psqlq -c "select goal from student_goals where user_id='$U'")"
chk "coach · siège actif"      "active" "$(psqlq -c "select status from coach_clients where student_user_id='$U'")"
chk "profil · fuseau posé"          "1" "$(psqlq -c "select count(*) from profiles where id='$U' and timezone is not null")"

# ── ⑥ LE RENDEMENT PAR ALIMENT (lot 1 — muet tant que la colonne n'existe pas) ──
if [ "$(psqlq -c "select count(*) from information_schema.columns where table_name='food_composition_refs' and column_name='yield_factor'")" = "1" ]; then
  echo "      rendement par aliment: $(psqlq -c "select count(*) from food_composition_refs where yield_factor is not null") ligne(s) renseignée(s)"
  chk "rendement · facteur sans source" "0" "$(psqlq -c "select count(*) from food_composition_refs where yield_factor is not null and yield_factor_source is null")"
  psqlq -c "select '      · '||slug||' = '||yield_factor||'  ('||yield_class||', '||yield_factor_source||')' from food_composition_refs where yield_factor is not null order by yield_class, slug;"
else
  echo "      rendement par aliment: colonne absente (lot 1 non livré) — non vérifié"
fi

echo
[ "$FAIL" = "0" ] && echo "✓ FIXTURE SOLO VERTE" || echo "⛔ FIXTURE SOLO INCOMPLÈTE"
exit "$FAIL"
