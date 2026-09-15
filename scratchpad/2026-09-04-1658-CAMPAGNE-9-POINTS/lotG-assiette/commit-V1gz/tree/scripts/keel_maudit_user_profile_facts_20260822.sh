#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# M-audit — `user_profile_facts` · le pilote
# ══════════════════════════════════════════════════════════════════════════
#
# Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `M-audit`.
#
#     bash scripts/keel_maudit_user_profile_facts_20260822.sh
#     bash scripts/keel_maudit_user_profile_facts_20260822.sh > sortie.txt
#
# ── ⛔ CE SCRIPT NE FAIT QUE LIRE ──────────────────────────────────────────
# Aucune écriture, aucune suppression, aucun appel de modèle, aucune
# génération. `M-audit` est un AUDIT: il rend un chiffre et une question.
# ⛔ Si l'audit conclut qu'il faut supprimer des lignes, la commande s'ÉCRIT
# et ne se lance pas — la suppression de données appartient au propriétaire.
#
# ── ⚠️ AUCUNE VARIABLE `SUPABASE_*` N'EST EXPORTÉE ────────────────────────
# Le Deno lancé ici lit des FICHIERS, jamais le réseau (114 faux rouges déjà
# payés par ce dépôt quand un run a hérité d'un env de QA).
#
# ── ⛔ LA BASE PEUT ÊTRE INJOIGNABLE, ET ALORS LE SCRIPT LE DIT ───────────
# Les dumps sont écrits dans un répertoire temporaire. Si `psql` ne répond
# pas, les fichiers restent VIDES et le TS imprime « MESURE DB ABSENTE » puis
# sort en `rc=1`. ⛔ Il ne publie AUCUN zéro: « 0 ligne » et « je n'ai pas pu
# lire » sont deux mesures différentes.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
TS_FILE="${KEEL_MAUDIT_TS:-$ROOT/scripts/keel_maudit_user_profile_facts_20260822.ts}"
PSQL_TIMEOUT="${KEEL_PSQL_TIMEOUT:-40}"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/keel-maudit-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

psql_q() {
  # `timeout` parce qu'un démon Docker figé fait pendre `docker exec` sans
  # fin: mesuré le 2026-08-22, quatre `docker` zombies sur ce poste.
  timeout "$PSQL_TIMEOUT" docker exec -i "$DB_CONTAINER" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@" 2>/dev/null
}

printf '═══════════════════════════════════════════════════════════════════════════\n'
printf 'M-audit — user_profile_facts\n'
printf 'exécuté le %s · base %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$DB_CONTAINER"
printf '═══════════════════════════════════════════════════════════════════════════\n\n'

# ── ⛔ UNE SEULE SONDE, PUIS ON PASSE ─────────────────────────────────────
# Le 2026-08-22 le démon Docker était figé: chaque `docker exec` pendait
# jusqu'au timeout. Cinq requêtes × 40 s = 200 s pour cinq fichiers vides.
# Une sonde COURTE décide, et le reste est sauté. « Je n'ai pas pu lire » se
# constate en cinq secondes, pas en trois minutes.
PROBE_RC=0
timeout 8 docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -tAc \
  "select 1" > "$TMP/probe.out" 2>"$TMP/probe.err" || PROBE_RC=$?
if [ ! -s "$TMP/probe.out" ]; then
  printf '   ⛔ BASE INJOIGNABLE — sonde `select 1` : rc=%s, sortie vide.\n' "$PROBE_RC"
  printf '      Les cinq requêtes de mesure sont SAUTÉES (une tentative, pas une boucle).\n'
  printf '      ⛔ Aucun zéro ne sera publié: les dumps restent vides et le TS le DIT.\n\n'
  RC=0
  deno run --quiet --allow-read "$TS_FILE" "$TMP" "$ROOT" || RC=$?
  printf '\nFIN · rc=%s\n' "$RC"
  exit "$RC"
fi
printf '   sonde `select 1` : OK\n\n'

# ── La ventilation, agrégée EN SQL ────────────────────────────────────────
# ⛔ Agrégée, et pas ligne à ligne: le disque de ce poste était PLEIN une
# heure avant ce lot. Un instrument qui remplit le disque n'est pas rejouable.
psql_q -c "select row_to_json(t)::text from (
  select scope, key, status, source_type, count(*) as n,
         count(distinct user_id) as u
  from public.user_profile_facts
  group by 1,2,3,4
  order by 1,2,3,4
) t" > "$TMP/facts_agg.ndjson"

psql_q -c "select row_to_json(t)::text from (
  select user_id, count(*) as n
  from public.user_profile_facts
  group by 1
) t" > "$TMP/facts_users.ndjson"

psql_q -c "select row_to_json(t)::text from (
  select id, email, created_at from auth.users
) t" > "$TMP/users.ndjson"

# Les VALEURS distinctes par clé: c'est ce qui dit si une ligne a jamais été
# CHOISIE, ou si elle porte encore ce que la graine y a mis.
psql_q -c "select row_to_json(t)::text from (
  select key, value::text as value, count(*) as n
  from public.user_profile_facts
  group by 1,2
  order by 1, 3 desc
) t" > "$TMP/facts_values.ndjson"

# Les comptes qui ont AU MOINS UN tour de chat. Une ligne dont le porteur n'a
# jamais parlé n'est lue par personne, jamais.
psql_q -c "select row_to_json(t)::text from (
  select distinct user_id from public.chat_messages where user_id is not null
) t" > "$TMP/activity.ndjson"

for f in facts_agg facts_users users facts_values activity; do
  n=$(wc -l < "$TMP/$f.ndjson" 2>/dev/null | tr -d ' ')
  printf '   dump %-14s %6s lignes\n' "$f" "${n:-0}"
done
printf '\n'

RC=0
deno run --quiet --allow-read "$TS_FILE" "$TMP" "$ROOT" || RC=$?

printf '\nFIN · rc=%s\n' "$RC"
exit "$RC"
