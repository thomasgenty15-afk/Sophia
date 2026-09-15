#!/usr/bin/env bash
# ── LE RUN RÉEL DU LOT FENÊTRE — témoin + cas, en une exécution ───────────
#
# ⛔ POURQUOI UN SCRIPT ET PAS DEUX COMMANDES À LA MAIN. Chaque minute passée
# sous `supabase/functions/` en écriture par une autre session tue le run en
# vol (502, conteneur recréé). On réduit la fenêtre d'exposition en enchaînant.
#
# ⚠️ IL ÉCRIT DANS UNE FIXTURE ET RESTAURE. `profiles.timezone` du compte
# `eval0823.solo@keeltest.dev` passe à `America/Sao_Paulo` le temps du second
# run, puis revient à sa valeur d'origine — LUE avant, VÉRIFIÉE après.
# Ce n'est pas une horloge forcée: c'est un élève brésilien qui compose son plan
# à 22 h, cas produit ordinaire. Le dîner « passe » à 21 h (`SLOT_PASSED_HOUR`).
set -uo pipefail
source "$(dirname "$0")/00-env.sh"

TZ_CASE="America/Sao_Paulo"
UID_SOLO="$(psqlq -c "select p.id from profiles p join auth.users u on u.id=p.id where u.email='$SOLO_EMAIL';")"
TZ0="$(psqlq -c "select timezone from profiles where id='$UID_SOLO';")"
echo "════ fixture $SOLO_EMAIL · fuseau d'origine = $TZ0"
[ -z "$TZ0" ] && { echo "⛔ fuseau d'origine illisible — j'arrête plutôt que d'écrire à l'aveugle"; exit 1; }

restore() {
  psqlq -c "update profiles set timezone='$TZ0' where id='$UID_SOLO';" >/dev/null
  BACK="$(psqlq -c "select timezone from profiles where id='$UID_SOLO';")"
  echo "════ fuseau restauré = $BACK $([ "$BACK" = "$TZ0" ] && echo '✓' || echo '⛔ RESTAURATION RATÉE')"
}
trap restore EXIT INT TERM

heure() { psqlq -c "select to_char(now() at time zone '$1','HH24:MI');"; }

echo
echo "══════ ① TÉMOIN — $TZ0, il y est $(heure "$TZ0") ══════"
echo "   attendu: AUCUN retrait (les moments ne sont pas passés), fenêtre 3 jours"
bash "$EVAL_DIR/run.sh" WINDOWctl solo

echo
psqlq -c "update profiles set timezone='$TZ_CASE' where id='$UID_SOLO';" >/dev/null
echo "══════ ② CAS — $TZ_CASE, il y est $(heure "$TZ_CASE") ══════"
echo "   attendu: retrait — fenêtre 2 jours, départ demain, MÊME date de fin"
bash "$EVAL_DIR/run.sh" WINDOWcase solo
