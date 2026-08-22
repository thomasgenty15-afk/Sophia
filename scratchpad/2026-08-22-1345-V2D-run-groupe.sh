#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# V2-D — LE RUN GROUPÉ DE LA VAGUE 2
# Plan: scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md
# Fiches servies: L2-lang · L17-0 · L17 (seuil solo) · L18b · clôture de vague 2
# ══════════════════════════════════════════════════════════════════════════════
#
# ⛔ ONZE EXÉCUTIONS AU MAXIMUM. Le script les compte lui-même, run par run, et
#    il s'ARRÊTE tout seul. Le compteur est `llm_usage_events.source` SANS point
#    (§⑩, « la commande qui compte » — celle du plan était aveugle).
#
# ── CE QU'IL FAIT, DANS L'ORDRE ───────────────────────────────────────────────
#   ⓪ PRÉ-VOL, sans une seule génération:
#        · le runtime edge sert-il le code NEUF ? (mtime des sources contre
#          l'heure de démarrage du conteneur) — il REFUSE de démarrer sinon ;
#        · la fonction répond-elle ? (un POST vide ⇒ 400 nommé, zéro modèle) ;
#        · la fixture est-elle celle qu'on croit ? (foyer, 4 bouches, coach,
#          objectif, langue) ;
#        · l'état d'AVANT est archivé (plans vivants, durées, sas, compteur).
#   ① LE RUN DE FUMÉE — UN SEUL, lane FOYER, `fr-FR`.
#        Après lui, la requête `L17-0` est jouée sur le plan neuf. Si elle ne
#        rend pas `OK`, ⛔ LE LOT S'ARRÊTE: le runtime ne sert pas le code neuf,
#        et dépenser dix générations de plus ne mesurerait rien.
#   ② LES DIX — foyer `fr-FR` ×4 puis `en-GB` ×5, puis UN run SOLO.
#        (répartition: voir « ⛔ LA RÉPARTITION » ci-dessous — elle est
#         arbitrée, chiffrée, et le rapport la déclare)
#   ③ RESTAURATION, par `trap`, même sur abandon:
#        · le dernier plan du lot est retiré, `66de9046` est RENDU VIVANT
#          avec sa durée de 7 jours et ses plats intacts ;
#        · `profiles.locale` revient à `fr-FR` ;
#        · la ligne de régime temporaire (si posée) est supprimée.
#   ④ LE RAPPORT: compteur de générations, sas AVANT/APRÈS, verdict `L17-0` par
#      plan, journal de troncature (protocole `V0-C-quinquies`), et la commande
#      `L2-lang` littérale, avec son `--since` déjà rempli.
#
# ── ⛔ LA RÉPARTITION, ET POURQUOI ELLE N'EST PAS 5 FOYER + 5 SOLO ────────────
# `scripts/keel_l2lang_langue_20260822.ts` porte `MIN_PLANS_PAR_BRAS = 5` et
# rend son verdict PAR LANE (`foyer`, `solo`) en plus des deux réunies. Le
# verdict « les deux lanes » REFUSE toujours de conclure ici, parce que les deux
# lanes portent deux `prompt_version` DIFFÉRENTS:
#     solo   `meal.en.v18_one_box_per_group`
#     foyer  `meal.en.v18_one_box_per_group+household.v21_one_box_per_group`
# ⇒ Dix runs étalés sur deux lanes ne donnent 5 contre 5 à AUCUNE portée, et
#   `L2-lang` refuserait de conclure PARTOUT. Un verdict par lane sur les deux
#   lanes coûte VINGT générations, pas dix.
# ⇒ Arbitrage tenu ici: la fumée est un run FOYER `fr-FR` (elle compte dans le
#   bras `fr`), les neuf suivants complètent **foyer 5 `fr` + 5 `en`**, et la
#   ONZIÈME exécution est le **premier plan SOLO sous `v18`** — ce que §⑨ n° 50
#   réclame nommément, sans lequel les seuils solo de `L-1`, `L17` et `L18b`
#   restent « en attente » pour une vague de plus.
#
# ── ⛔ CE QU'IL NE FAIT PAS ───────────────────────────────────────────────────
#   · aucune commande interdite (`db reset/push`, `functions deploy`, `secrets`,
#     `config push`, `link`, `projects/branches delete`) ;
#   · aucune suppression de plan, aucun `delete` sur une ligne de sécurité
#     déclarée, aucune écriture sur `fruits_de_mer` ni sur une bouche mineure ;
#   · aucun réessai sur un timeout. ⛔ UN TIMEOUT NE SE RÉESSAIE PAS, IL SE
#     MESURE (§⑩): le script imprime la latence et S'ARRÊTE.
#
# ── LES HORLOGES EN VIGUEUR, MESURÉES LE 2026-08-22 ───────────────────────────
#   `PLAN_HTTP_TIMEOUT_MS = 300_000`  (generation_model.ts:107) — c'est ELLE qui
#      s'applique: les 5 sites d'appel des deux lanes la passent en
#      `meta.httpTimeoutMs` (`generate-meal-v1:1992,2123,2542`,
#      `generate-household-meal-v1:4471,4695`). Confirmé dans les logs du run
#      `V0-D`: `"timeout_ms":300000`.
#   `GEMINI_HTTP_TIMEOUT_MS`  défaut littéral **110 000** (gemini.ts:251) —
#      NON POSÉ dans `supabase/.env`, et NON APPLICABLE aux générateurs.
#   `curl --max-time` ici: 900 s, au-dessus des deux.
#   Latence réelle (llm_usage_events, 2026-08-22):
#      foyer `gpt-5.6-luna`  n=50  médiane  66 380 ms  max 210 365 ms
#      solo  `gpt-5.6-sol`   n=48  médiane 135 216 ms  max 202 174 ms
#      solo  `.composition_retry`  médiane 122 637 ms  max 186 183 ms
#   ⇒ rien à relever. Le geste n° 3 du §⑩ n'est PAS déclenché.
#
# ── USAGE ────────────────────────────────────────────────────────────────────
#   bash scratchpad/2026-08-22-1345-V2D-run-groupe.sh --dry-run   # zéro appel
#   bash scratchpad/2026-08-22-1345-V2D-run-groupe.sh             # LES 11 RUNS
#   bash scratchpad/2026-08-22-1345-V2D-run-groupe.sh --depuis=4  # reprise
#   bash scratchpad/2026-08-22-1345-V2D-run-groupe.sh --regime-solo
#        ⚠️ pose une ligne `student_safety_constraints` (kind=diet,
#        diet_ref=vegetarian) sur Camille JUSTE AVANT le run solo et la RETIRE
#        juste après. Sans elle, `declaredRegime = null` sur la lane solo ⇒
#        `FOOD_GROUP_DECLARATION_BLOCK` ne part pas ⇒ `L17-0` rend `NUL` sur ce
#        plan-là. Voir le rapport: c'est le seul trou connu de la lane solo.
# ══════════════════════════════════════════════════════════════════════════════

set -uo pipefail

REPO="/Users/ahmedamara/Dev/Sophia 2"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCH="${REPO}/scratchpad/2026-08-22-1345-V2D-sorties-${STAMP}"
JOURNAL="${ARCH}/00-journal.txt"
DB="${KEEL_DB_CONTAINER:-supabase_db_Sophia_2}"
EDGE="${KEEL_EDGE_CONTAINER:-supabase_edge_runtime_Sophia_2}"

MASTER_EMAIL="fixture.v0c.master@keeltest.dev"
MASTER_PASSWORD="1234567"
MASTER_UID="53fb05ba-333a-4bf5-9e19-502103581ef7"
HOUSEHOLD_ID="b1959752-92c8-4038-8c17-992a77d68d21"
# ⛔ LE PLAN DE RÉFÉRENCE DE LA FIN DE VAGUE 1. Il est RENDU INTACT.
PLAN_REF="66de9046-7b8e-48f9-958c-aa8086d65d66"
# Le plan de `V0-D`. On n'y touche pas non plus (il ne chevauche rien).
PLAN_V0D="3c781a71-da7c-4abe-8a99-4a6ed7445c99"

PLAFOND_EXECUTIONS=11
DRY=0
DEPUIS=1
REGIME_SOLO=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --depuis=*) DEPUIS="${a#--depuis=}" ;;
    --regime-solo) REGIME_SOLO=1 ;;
    *) echo "⛔ argument inconnu: $a"; exit 2 ;;
  esac
done

mkdir -p "${ARCH}"
dit() { printf '%s\n' "$*" | tee -a "${JOURNAL}"; }
psql_t() { docker exec -i "${DB}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA -c "$1"; }
psql_x() { docker exec -i "${DB}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$1"; }

dit "══════════════════════════════════════════════════════════════════════════"
dit "V2-D — RUN GROUPÉ DE LA VAGUE 2   ·   $(date '+%Y-%m-%d %H:%M:%S %Z')"
dit "archives → ${ARCH}"
dit "mode     → $([ "${DRY}" = 1 ] && echo 'DRY-RUN (aucun appel de modèle)' || echo 'RÉEL')"
dit "══════════════════════════════════════════════════════════════════════════"

# ═══ ⓪.a — LE RUNTIME SERT-IL LE CODE NEUF ? ═══════════════════════════════
# ⚠️ « Runtime edge: cache périmé des `_shared` » — un fichier MODIFIÉ n'est pas
# rechargé. La sonde est objective: aucune source de `supabase/functions` ne doit
# être plus récente que le démarrage du conteneur qui les sert.
dit ""
dit "── ⓪.a  LE RUNTIME SERT-IL LE CODE NEUF ? ────────────────────────────────"
EDGE_START_ISO="$(docker inspect -f '{{.State.StartedAt}}' "${EDGE}" 2>/dev/null)"
if [ -z "${EDGE_START_ISO}" ]; then
  dit "⛔ conteneur ${EDGE} introuvable. Le runtime edge est ÉTEINT."
  dit "   ⇒ lance, dans un autre terminal, depuis ${REPO} :"
  dit "        supabase functions serve --env-file supabase/.env"
  exit 1
fi
# Docker rend `2026-08-22T11:25:46.146637087Z`. On coupe les nanosecondes et
# on parse en UTC — `date -j -f` de BSD ne lit pas une fraction de seconde.
EDGE_START_SEC="${EDGE_START_ISO%%.*}"; EDGE_START_SEC="${EDGE_START_SEC%Z}"
EDGE_START_EPOCH="$(TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%S" "${EDGE_START_SEC}" +%s 2>/dev/null)"
if [ -z "${EDGE_START_EPOCH}" ]; then
  dit "⛔ heure de démarrage du runtime illisible: ${EDGE_START_ISO}"; exit 1
fi
dit "   conteneur ${EDGE} démarré à ${EDGE_START_ISO}  (epoch ${EDGE_START_EPOCH})"
PLUS_RECENTS="$(find "${REPO}/supabase/functions" -name '*.ts' -newermt "@${EDGE_START_EPOCH}" 2>/dev/null | sed "s|${REPO}/||")"
NB_RECENTS="$(printf '%s' "${PLUS_RECENTS}" | grep -c . || true)"
if [ "${NB_RECENTS}" -gt 0 ]; then
  dit "⛔ ${NB_RECENTS} fichier(s) source PLUS RÉCENTS que le runtime — il sert un CACHE PÉRIMÉ:"
  printf '%s\n' "${PLUS_RECENTS}" | sed 's/^/      /' | tee -a "${JOURNAL}"
  dit ""
  dit "   ⇒ ⛔ LE SCRIPT REFUSE DE DÉMARRER. Dans le terminal qui porte"
  dit "     « supabase functions serve »: Ctrl-C, puis, depuis ${REPO} :"
  dit ""
  dit "        supabase functions serve --env-file supabase/.env"
  dit ""
  dit "     Attends la ligne « Serving functions on … », puis relance ce script."
  if [ "${DRY}" = 1 ]; then
    dit "   ↷ DRY-RUN : on continue quand même pour valider le PLAN DE RUN."
    dit "     ⛔ EN RÉEL, CE POINT EST UN ARRÊT."
  else
    exit 1
  fi
else
  PLUS_RECENT_FIC="$(find "${REPO}/supabase/functions" -name '*.ts' -exec stat -f '%m %N' {} \; 2>/dev/null | sort -rn | head -1)"
  dit "   source la plus récente : $(TZ=UTC date -r "${PLUS_RECENT_FIC%% *}" '+%Y-%m-%dT%H:%M:%SZ') — ${PLUS_RECENT_FIC#* }"
  dit "   ✅ aucune source plus récente que le runtime (marge $(( EDGE_START_EPOCH - ${PLUS_RECENT_FIC%% *} )) s)."
  dit "   ⚠️ D'AUTRES SESSIONS ÉCRIVENT DANS CE DÉPÔT. Si une source bouge PENDANT"
  dit "      le lot, cette sonde ne le reverra pas: relance le lot, pas un run."
fi

# ═══ ⓪.b — LA FONCTION RÉPOND-ELLE ? (zéro génération) ═════════════════════
dit ""
dit "── ⓪.b  LA FONCTION RÉPOND-ELLE ? (un POST vide ⇒ 400 nommé) ─────────────"
API_URL="$(grep -m1 '^SUPABASE_URL=' "${REPO}/supabase/.env" | cut -d= -f2- | tr -d '"')"
ANON="$(grep -m1 '^SUPABASE_ANON_KEY=' "${REPO}/supabase/.env" | cut -d= -f2- | tr -d '"')"
dit "   API_URL = ${API_URL}"

dit ""
dit "── ⓪.c  CONNEXION DU MAÎTRE (mot de passe — jamais service_role) ─────────"
LOGIN="$(curl -s -X POST "${API_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON}" -H 'content-type: application/json' \
  -d "{\"email\":\"${MASTER_EMAIL}\",\"password\":\"${MASTER_PASSWORD}\"}")"
TOKEN="$(printf '%s' "${LOGIN}" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null)"
UID_="$(printf '%s' "${LOGIN}" | python3 -c 'import sys,json; print((json.load(sys.stdin).get("user") or {}).get("id",""))' 2>/dev/null)"
if [ -z "${TOKEN}" ]; then
  dit "⛔ pas de jeton — réponse GoTrue :"; printf '%s\n' "${LOGIN}" | tee -a "${JOURNAL}"
  dit "   ⚠️ un 401 « Invalid JWT » plus loin ⇒ ./scripts/check-local-jwt-alg.sh"
  exit 1
fi
if [ "${UID_}" != "${MASTER_UID}" ]; then
  dit "⛔ le compte connecté (${UID_}) n'est pas la fixture (${MASTER_UID})."; exit 1
fi
dit "   ✅ maître ${UID_}  (jeton ${#TOKEN} car.)"

SONDE="$(curl -s -o "${ARCH}/00-sonde-runtime.json" -w '%{http_code}' --max-time 60 \
  -X POST "${API_URL}/functions/v1/generate-household-meal-v1" \
  -H "apikey: ${ANON}" -H "authorization: Bearer ${TOKEN}" \
  -H 'content-type: application/json' -d '{}')"
dit "   POST {} → http=${SONDE}  ($(head -c 200 "${ARCH}/00-sonde-runtime.json"))"
case "${SONDE}" in
  4*) dit "   ✅ la fonction boote et refuse proprement (aucune génération dépensée)." ;;
  *)  dit "⛔ la fonction ne répond pas par un refus nommé (http=${SONDE})."
      dit "   500/503 ⇒ le runtime est cassé ou une source ne compile pas."
      dit "   401     ⇒ ./scripts/check-local-jwt-alg.sh puis docs/keel/JWT-HS256.md."
      exit 1 ;;
esac

# ═══ ⓪.d — LA FIXTURE ═════════════════════════════════════════════════════
dit ""
dit "── ⓪.d  LA FIXTURE, VÉRIFIÉE ────────────────────────────────────────────"
psql_x "
select h.id, h.name, h.free_until, (h.free_until >= current_date) as couverte
  from households h where h.id = '${HOUSEHOLD_ID}';
select m.first_name, m.role, (m.user_id is not null) as a_un_compte, m.birth_date,
       (date_part('year', age(m.birth_date)) < 18) as mineure, m.goal, m.diet
  from household_members m where m.household_id = '${HOUSEHOLD_ID}' order by m.joined_at;
select 'coach_clients' as porte, count(*) filter (where status='active') as ok
  from coach_clients where student_user_id = '${MASTER_UID}'
union all select 'student_goals', count(*) from student_goals where user_id = '${MASTER_UID}'
union all select 'safety_constraints_actives', count(*) from student_safety_constraints
  where user_id = '${MASTER_UID}' and status='active';
select id, locale, country, timezone from profiles where id = '${MASTER_UID}';
" 2>&1 | tee -a "${JOURNAL}"

COUVERTE="$(psql_t "select (free_until >= current_date)::text from households where id='${HOUSEHOLD_ID}'")"
NB_GOALS="$(psql_t "select count(*) from student_goals where user_id='${MASTER_UID}'")"
NB_COACH="$(psql_t "select count(*) from coach_clients where student_user_id='${MASTER_UID}' and status='active'")"
if [ "${COUVERTE}" != "true" ] || [ "${NB_GOALS}" != "1" ] || [ "${NB_COACH}" = "0" ]; then
  dit "⛔ précondition manquante — couverte=${COUVERTE} goals=${NB_GOALS} coach=${NB_COACH}"
  dit "   (household_frozen 402 · goal_required 409 · no_coach 409)"
  exit 1
fi
dit "   ✅ foyer couvert · objectif présent · coach actif."

# ═══ ⓪.e — L'ÉTAT D'AVANT ═════════════════════════════════════════════════
dit ""
dit "── ⓪.e  L'ÉTAT D'AVANT, ARCHIVÉ ──────────────────────────────────────────"
T0="$(psql_t "select to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS')||'Z'")"
dit "   HORODATAGE DE LANCEMENT (UTC) : ${T0}"
printf '%s' "${T0}" > "${ARCH}/00-horodatage-lancement.txt"

REF_RETIRED_AVANT="$(psql_t "select coalesce(retired_at::text,'NULL') from student_generated_meals where id='${PLAN_REF}'")"
REF_DUREE_AVANT="$(psql_t "select duration_days from student_generated_meals where id='${PLAN_REF}'")"
GEN_AVANT="$(psql_t "select count(*) from llm_usage_events where (source like 'generate-meal-v1%' or source like 'generate-household-meal-v1%') and source not like '%.%'")"
PENDING_AVANT="$(psql_t "select count(*) from food_composition_pending")"
LOCALE_AVANT="$(psql_t "select locale from profiles where id='${MASTER_UID}'")"

{
  echo "V2-D — ÉTAT D'AVANT · ${T0}"
  echo "plan de référence ${PLAN_REF} : retired_at=${REF_RETIRED_AVANT} duration_days=${REF_DUREE_AVANT}"
  echo "plan V0-D         ${PLAN_V0D} : $(psql_t "select 'retired_at='||coalesce(retired_at::text,'NULL')||' duration_days='||duration_days from student_generated_meals where id='${PLAN_V0D}'")"
  echo "générations déjà en base (source sans point) : ${GEN_AVANT}"
  echo "food_composition_pending : ${PENDING_AVANT}"
  echo "profiles.locale : ${LOCALE_AVANT}"
  echo ""
  echo "— plans VIVANTS de la fixture —"
} > "${ARCH}/01-avant.txt"
psql_x "
select id, plan_kind, starts_on, duration_days, retired_at, content_locale,
       generated_from->>'prompt_version' as pv
  from student_generated_meals where user_id='${MASTER_UID}' order by created_at;
" >> "${ARCH}/01-avant.txt" 2>&1
cat "${ARCH}/01-avant.txt" | tee -a "${JOURNAL}" > /dev/null
dit "   plan de référence ${PLAN_REF} : retired_at=${REF_RETIRED_AVANT} · durée=${REF_DUREE_AVANT} j"
dit "   sas food_composition_pending : ${PENDING_AVANT}   ⚠️ le seuil L18b « ≥ 3 » est DÉJÀ atteint AVANT le run"
dit "   compteur de générations (base entière) : ${GEN_AVANT}"
dit "   profiles.locale : ${LOCALE_AVANT}"
dit "   → archivé dans ${ARCH}/01-avant.txt"

if [ "${REF_RETIRED_AVANT}" != "NULL" ]; then
  dit "⛔ ${PLAN_REF} est DÉJÀ retiré. Le script ne sait pas dans quel état le rendre."
  exit 1
fi

# ═══ LA RESTAURATION — POSÉE AVANT LE PREMIER RUN, PAR `trap` ═════════════
DERNIER_FOYER=""
REGIME_POSE=0
restaurer() {
  local rc=$?
  dit ""
  dit "── ③  RESTAURATION ───────────────────────────────────────────────────────"
  if [ "${REGIME_POSE}" = "1" ]; then
    psql_t "delete from student_safety_constraints
              where user_id='${MASTER_UID}' and kind='diet' and diet_ref='vegetarian'
                and notes='V2-D temporaire — a supprimer'" >/dev/null 2>&1
    dit "   ligne de régime TEMPORAIRE supprimée."
  fi
  psql_t "update profiles set locale='${LOCALE_AVANT}' where id='${MASTER_UID}'" >/dev/null 2>&1
  dit "   profiles.locale rendu à « ${LOCALE_AVANT} »."
  if [ -n "${DERNIER_FOYER}" ]; then
    psql_t "update student_generated_meals set retired_at = now()
              where id='${DERNIER_FOYER}' and retired_at is null" >/dev/null 2>&1
    dit "   dernier plan du lot (${DERNIER_FOYER}) retiré — il libère la fenêtre."
  fi
  psql_t "update student_generated_meals set retired_at = null
            where id='${PLAN_REF}' and retired_at is not null" >/dev/null 2>&1
  local r d
  r="$(psql_t "select coalesce(retired_at::text,'NULL') from student_generated_meals where id='${PLAN_REF}'")"
  d="$(psql_t "select duration_days from student_generated_meals where id='${PLAN_REF}'")"
  if [ "${r}" = "NULL" ] && [ "${d}" = "${REF_DUREE_AVANT}" ]; then
    dit "   ✅ ${PLAN_REF} RENDU INTACT — retired_at=NULL · durée=${d} j (avant: ${REF_DUREE_AVANT} j)"
  else
    dit "   ⛔ ${PLAN_REF} N'EST PAS RENDU — retired_at=${r} · durée=${d} (attendu NULL / ${REF_DUREE_AVANT})"
    dit "      geste manuel :"
    dit "        update student_generated_meals set retired_at=null, duration_days=${REF_DUREE_AVANT} where id='${PLAN_REF}';"
  fi
  psql_x "select id, plan_kind, starts_on, duration_days, retired_at, content_locale
            from student_generated_meals where user_id='${MASTER_UID}' order by created_at;" \
    > "${ARCH}/99-apres-plans.txt" 2>&1
  dit "   état final des plans → ${ARCH}/99-apres-plans.txt"
  exit "${rc}"
}
trap restaurer EXIT

# ═══ LE PLAN DE RUN ═══════════════════════════════════════════════════════
# idx : lane : locale
RUNS=(
  "01:foyer:fr-FR"   # ← LA FUMÉE. Verdict L17-0 joué juste après; abandon si ≠ OK.
  "02:foyer:fr-FR"
  "03:foyer:fr-FR"
  "04:foyer:fr-FR"
  "05:foyer:fr-FR"
  "06:foyer:en-GB"
  "07:foyer:en-GB"
  "08:foyer:en-GB"
  "09:foyer:en-GB"
  "10:foyer:en-GB"
  "11:solo:fr-FR"    # ← LE PREMIER PLAN SOLO SOUS v18 (§⑨ n° 50)
)
dit ""
dit "── LE PLAN DE RUN — ${#RUNS[@]} exécutions (plafond ${PLAFOND_EXECUTIONS}) ──────────────────"
for r in "${RUNS[@]}"; do dit "     ${r}"; done
dit "     ⇒ foyer 5 fr-FR + 5 en-GB  (L2-lang conclut sur la portée « foyer »)"
dit "     ⇒ solo  1 fr-FR            (premier v18 solo — L17/L-1/L18b, PAS un verdict de langue)"

if [ "${#RUNS[@]}" -gt "${PLAFOND_EXECUTIONS}" ]; then
  dit "⛔ le plan de run dépasse le plafond."; exit 1
fi

VERDICTS_L17_0="${ARCH}/02-L17-0-verdicts.txt"
: > "${VERDICTS_L17_0}"
RECAP="${ARCH}/03-recap-runs.tsv"
printf 'idx\tlane\tlocale\tintent\treplaces\thttp\tsecondes\tplan_id\tgen_cumul\n' > "${RECAP}"

# ── LA REQUÊTE `L17-0`, SUR UN PLAN NOMMÉ ────────────────────────────────────
verdict_l17_0() {
  local plan="$1"
  docker exec -i "${DB}" psql -U postgres -d postgres -tA <<SQL
with cible as (
  select * from student_generated_meals where id = '${plan}'
), lignes as (
  select ing from cible m,
    lateral jsonb_array_elements(coalesce(m.dishes, '[]'::jsonb)) d,
    lateral jsonb_array_elements(coalesce(d->'ingredients', '[]'::jsonb)) ing
  union all
  select ing from cible m,
    lateral jsonb_array_elements(coalesce(m.preparations, '[]'::jsonb)) p,
    lateral jsonb_array_elements(coalesce(p->'ingredients', '[]'::jsonb)) ing
), lu as (
  select
    (c.generated_from->'food_groups'->>'declared')::int  as declared,
    (c.generated_from->'food_groups'->>'valid')::int     as valid,
    (c.generated_from->'food_groups'->>'refused')::int   as refused,
    (c.generated_from->'food_groups'->>'persisted')::int as persisted,
    (c.generated_from->'food_groups'->>'lines')::int     as lines_comptees,
    (select count(*) from lignes)                        as lignes_reelles,
    (select count(*) from lignes where ing->>'group' is not null) as lignes_avec_groupe
  from cible c
)
-- ⛔ `coalesce` SUR `declared` AUSSI: sans lui, un plan sans `food_groups`
-- rend NULL sur TOUTE la concaténation, et le verdict — le seul mot qui
-- compte — disparaîtrait au lieu de dire « ECHEC ».
select coalesce(declared::text,'NULL')||'|'||coalesce(valid::text,'-')||'|'||coalesce(refused::text,'-')||'|'
       ||coalesce(persisted::text,'-')||'|'||coalesce(lines_comptees::text,'-')||'|'
       ||lignes_reelles||'|'||lignes_avec_groupe||'|'||
  case
    when declared is null then 'ECHEC — le plan ne porte pas generated_from.food_groups (runtime PERIME)'
    when declared = 0     then 'NUL — le modele n a rien declare: la consigne n est pas partie'
    when lignes_avec_groupe < 1 then 'ECHEC — aucune ligne en base ne porte un groupe'
    when persisted <> valid then 'ECHEC — ecart declare/persiste non nul'
    when lignes_avec_groupe <> persisted then 'ECHEC — le compteur et la base ne disent pas la meme chose'
    else 'OK — seuil atteint'
  end
from lu;
SQL
}

compteur_generations() {
  psql_t "select count(*) from llm_usage_events
           where created_at > '${T0}'
             and (source like 'generate-meal-v1%' or source like 'generate-household-meal-v1%')
             and source not like '%.%'"
}

# ═══ ①② — LA BOUCLE ═══════════════════════════════════════════════════════
for entree in "${RUNS[@]}"; do
  IDX="${entree%%:*}"; reste="${entree#*:}"
  LANE="${reste%%:*}"; LOCALE="${reste##*:}"
  if [ "$((10#${IDX}))" -lt "$((10#${DEPUIS}))" ]; then
    dit "   ↷ run ${IDX} sauté (--depuis=${DEPUIS})"
    continue
  fi

  # ── LE PLAFOND, RELU AVANT CHAQUE RUN ────────────────────────────────────
  GEN_DEJA="$(compteur_generations)"
  if [ "${GEN_DEJA}" -ge "${PLAFOND_EXECUTIONS}" ]; then
    dit ""
    dit "⛔ PLAFOND ATTEINT — ${GEN_DEJA} générations dépensées depuis ${T0}."
    dit "   Le script s'arrête de lui-même AVANT le run ${IDX}."
    break
  fi

  dit ""
  dit "══ RUN ${IDX}/${#RUNS[@]}  ·  lane=${LANE}  ·  locale=${LOCALE}  ·  générations déjà dépensées: ${GEN_DEJA} ══"

  # ── LA LANGUE — elle vient de `profiles.locale`, et de NULLE PART AILLEURS ─
  # `generate-household-meal-v1:1263` et `generate-meal-v1:3062` appellent tous
  # deux `resolveArtifactLocale({studentProfile: profiles.locale})`.
  # ⚠️ `student_goals.content_locale` (ici `en-GB`) N'EST PAS l'axe: les deux
  # lanes le refusent en commentaire, et c'est bien `profiles.locale` qui écrit
  # `student_generated_meals.content_locale`.
  if [ "${DRY}" = 0 ]; then
    psql_t "update profiles set locale='${LOCALE}' where id='${MASTER_UID}'" >/dev/null
  fi
  dit "   profiles.locale ← ${LOCALE}$([ "${DRY}" = 1 ] && echo '  (DRY: NON appliqué)')   (retour à « ${LOCALE_AVANT} » garanti par le trap)"

  # ── LA LIGNE DE RÉGIME DE LA LANE SOLO ───────────────────────────────────
  if [ "${LANE}" = "solo" ] && [ "${REGIME_SOLO}" = "1" ] && [ "${REGIME_POSE}" = "0" ]; then
    if [ "${DRY}" = 0 ]; then
      psql_t "insert into student_safety_constraints
                (user_id, kind, diet_ref, severity, declared_by, content_locale, notes)
              values ('${MASTER_UID}','diet','vegetarian','strict','student','fr-FR',
                      'V2-D temporaire — a supprimer')
              on conflict do nothing" >/dev/null
      REGIME_POSE=1
    fi
    dit "   ⚠️ LIGNE DE RÉGIME TEMPORAIRE POSÉE sur la lane solo (kind=diet/vegetarian/strict)."
    dit "      sans elle: declaredRegime=null ⇒ dietBlock=\"\" ⇒ pas de FOOD_GROUP_DECLARATION_BLOCK."
    dit "      elle est SUPPRIMÉE par le trap. Rollback manuel:"
    dit "        delete from student_safety_constraints where user_id='${MASTER_UID}'"
    dit "          and kind='diet' and notes='V2-D temporaire — a supprimer';"
  fi

  # ── LA FENÊTRE, ET COMMENT LES ONZE RUNS NE SE MANGENT PAS ───────────────
  # ⛔ `student_generated_meals_live_windows_dont_overlap` porte sur
  #    (user_id, plan_kind, daterange(starts_on, starts_on+duration_days))
  #    WHERE retired_at is null. Aujourd'hui (SAMEDI), `lastNameableStart` =
  #    DIMANCHE: une fenêtre ne peut commencer que le 22 ou le 23 août
  #    (`window_beyond_this_week`, 400). Deux départs possibles, et le plan de
  #    référence les couvre tous les deux.
  # ⇒ CHAQUE RUN REMPLACE LE PRÉCÉDENT (`intent: replace_current`), ce qui
  #   RETIRE la ligne d'avant au lieu de la tronquer. Rien n'est perdu: la
  #   ligne retirée garde ses plats et son `generated_from`, et `L2-lang`,
  #   `L17` et le tableau de bord ne filtrent PAS sur `retired_at`.
  # ⇒ Le premier run foyer remplace `66de9046`; le trap le REND VIVANT à la fin.
  # ⇒ `3c781a71` [08-21, 08-22) ne chevauche jamais [08-22, 08-29): intouché.
  if [ "${LANE}" = "foyer" ]; then
    FN="generate-household-meal-v1"
    if [ -z "${DERNIER_FOYER}" ]; then REPL="${PLAN_REF}"; else REPL="${DERNIER_FOYER}"; fi
    INTENT="replace_current"
    BODY="{\"operation\":\"compose\",\"window\":{\"kind\":\"days\",\"count\":7},\"intent\":\"${INTENT}\",\"replaces\":\"${REPL}\",\"context\":null,\"cooking_shape\":null,\"preferences\":null}"
  else
    FN="generate-meal-v1"
    DERNIER_SOLO="$(psql_t "select coalesce(max(id::text),'') from student_generated_meals
                              where user_id='${MASTER_UID}' and plan_kind='personal' and retired_at is null")"
    if [ -n "${DERNIER_SOLO}" ]; then
      INTENT="replace_current"; REPL="${DERNIER_SOLO}"
      BODY="{\"mode\":\"to_shop\",\"window\":{\"kind\":\"days\",\"count\":7},\"intent\":\"${INTENT}\",\"replaces\":\"${REPL}\",\"meal_slot\":null,\"servings\":1,\"context\":null,\"preferences\":null,\"pantry\":[]}"
    else
      INTENT="prepare_next"; REPL="—"
      BODY="{\"mode\":\"to_shop\",\"window\":{\"kind\":\"days\",\"count\":7},\"intent\":\"${INTENT}\",\"replaces\":null,\"meal_slot\":null,\"servings\":1,\"context\":null,\"preferences\":null,\"pantry\":[]}"
    fi
  fi
  dit "   fonction : ${FN}"
  dit "   intent   : ${INTENT}   replaces: ${REPL}"
  dit "   corps    : ${BODY}"

  if [ "${DRY}" = 1 ]; then
    dit "   ↷ DRY-RUN — aucun appel."
    printf '%s\t%s\t%s\t%s\t%s\tDRY\t-\t-\t-\n' "${IDX}" "${LANE}" "${LOCALE}" "${INTENT}" "${REPL}" >> "${RECAP}"
    continue
  fi

  # ── LE JOURNAL DE TRONCATURE (protocole V0-C-quinquies) ──────────────────
  DUREES_AVANT="$(psql_t "select string_agg(left(id::text,8)||':'||duration_days, ' ' order by starts_on)
                            from student_generated_meals
                           where user_id='${MASTER_UID}' and retired_at is null")"

  OUT="${ARCH}/run-${IDX}-${LANE}-${LOCALE}.json"
  dit "   début : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  HT="$(curl -s -o "${OUT}" -w '%{http_code} %{time_total}' --max-time 900 \
    -X POST "${API_URL}/functions/v1/${FN}" \
    -H "apikey: ${ANON}" -H "authorization: Bearer ${TOKEN}" \
    -H 'content-type: application/json' -d "${BODY}")"
  RC=$?
  HTTP="${HT%% *}"; SECS="${HT##* }"
  dit "   fin   : $(date -u +%Y-%m-%dT%H:%M:%SZ)   curl rc=${RC} · http=${HTTP} · ${SECS} s"
  dit "   brut  → ${OUT}  ($(wc -c < "${OUT}" | tr -d ' ') octets)"

  DUREES_APRES="$(psql_t "select string_agg(left(id::text,8)||':'||duration_days, ' ' order by starts_on)
                            from student_generated_meals
                           where user_id='${MASTER_UID}' and retired_at is null")"
  dit "   durées des plans vivants — avant: [${DUREES_AVANT}]  après: [${DUREES_APRES}]"

  # ⛔ UN TIMEOUT NE SE RÉESSAIE PAS — IL SE MESURE.
  if [ "${RC}" != "0" ] || [ "${HTTP}" != "200" ]; then
    dit ""
    dit "⛔ RUN ${IDX} NON ABOUTI (rc=${RC}, http=${HTTP}, ${SECS} s)."
    head -c 600 "${OUT}" | tee -a "${JOURNAL}"; dit ""
    dit "   ⛔ LE SCRIPT NE RÉESSAIE PAS. Ordre imposé par le §⑩ :"
    dit "      ① mesurer la latence réelle :"
    dit "         select model, percentile_cont(0.5) within group (order by latency_ms), max(latency_ms), count(*)"
    dit "           from llm_usage_events where created_at > '${T0}' group by 1;"
    dit "         ⚠️ un appel qui EXPIRE n'écrit AUCUNE ligne — la latence des"
    dit "            expirations se lit dans les logs du runtime edge, pas ici."
    dit "      ② la comparer au timeout EN VIGUEUR : PLAN_HTTP_TIMEOUT_MS = 300 000 ms"
    dit "         (generation_model.ts:107, passé en meta.httpTimeoutMs par les 5 sites)"
    dit "      ③ ne le relever QUE si la médiane le dépasse, et l'écrire au §⑨"
    dit "      ④ seulement alors, relancer avec --depuis=${IDX}"
    exit 1
  fi

  PLAN_ID="$(python3 -c 'import sys,json;d=json.load(open(sys.argv[1]));print(((d.get("meal") or {}) or {}).get("id",""))' "${OUT}" 2>/dev/null)"
  if [ -z "${PLAN_ID}" ]; then
    dit "⛔ la réponse ne porte pas meal.id — rien n'a été écrit."
    head -c 600 "${OUT}" | tee -a "${JOURNAL}"; dit ""
    exit 1
  fi
  dit "   plan écrit : ${PLAN_ID}"
  [ "${LANE}" = "foyer" ] && DERNIER_FOYER="${PLAN_ID}"

  # ── LE VERDICT L17-0, PLAN PAR PLAN ──────────────────────────────────────
  V="$(verdict_l17_0 "${PLAN_ID}")"
  dit "   L17-0 : declared|valid|refused|persisted|lines|lignes_reelles|lignes_avec_groupe|verdict"
  dit "           ${V}"
  printf '%s\t%s\t%s\t%s\n' "${IDX}" "${LANE}" "${PLAN_ID}" "${V}" >> "${VERDICTS_L17_0}"

  GEN_APRES="$(compteur_generations)"
  dit "   compteur : ${GEN_APRES} génération(s) dépensée(s) sur ${PLAFOND_EXECUTIONS}"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "${IDX}" "${LANE}" "${LOCALE}" "${INTENT}" "${REPL}" "${HTTP}" "${SECS}" "${PLAN_ID}" "${GEN_APRES}" >> "${RECAP}"

  # ── ⛔ LA PORTE DE LA FUMÉE ──────────────────────────────────────────────
  if [ "${IDX}" = "01" ]; then
    case "${V}" in
      *"OK — seuil atteint"*)
        dit ""
        dit "   ✅ FUMÉE VERTE — le runtime sert le code neuf ET « group » atteint la base."
        dit "      Les dix suivantes peuvent partir." ;;
      *)
        dit ""
        dit "⛔ FUMÉE ROUGE — le lot S'ARRÊTE ICI, une seule génération dépensée."
        dit "   verdict : ${V}"
        dit "   · « ne porte pas generated_from.food_groups » ⇒ le runtime sert un"
        dit "     CACHE PÉRIMÉ malgré la sonde ⓪.a. Relance « supabase functions serve"
        dit "     --env-file supabase/.env » et rejoue avec --depuis=01."
        dit "   · « NUL » ⇒ la consigne n'est pas partie: la fixture ne porte pas de"
        dit "     régime déclaré sur cette lane."
        exit 1 ;;
    esac
  fi
done

# ═══ ④ — LE RAPPORT ═══════════════════════════════════════════════════════
dit ""
dit "── ④  LE RAPPORT ─────────────────────────────────────────────────────────"
dit ""
dit "  ⓐ LE BUDGET — GÉNÉRATIONS d'un côté, relances/secours de l'autre (§⑩)"
psql_x "
select case when source like '%.%' then 'relance / secours' else 'GÉNÉRATION' end as unite,
       source, model, count(*) as appels, sum(total_tokens) as tokens,
       round(percentile_cont(0.5) within group (order by latency_ms)) as mediane_ms,
       max(latency_ms) as max_ms
  from llm_usage_events
 where created_at > '${T0}'
   and (source like 'generate-meal-v1%' or source like 'generate-household-meal-v1%')
 group by 1,2,3 order by 1,2;
" 2>&1 | tee -a "${JOURNAL}" | tee "${ARCH}/04-budget.txt" > /dev/null
cat "${ARCH}/04-budget.txt"

dit ""
dit "  ⓑ LES PLANS NEUFS — deux langues, un millésime par lane, 5 et 5"
psql_x "
select split_part(replace(content_locale,'_','-'),'-',1) as langue, plan_kind,
       generated_from->>'prompt_version' as millesime, count(*)
  from student_generated_meals
 where created_at >= '${T0}'
 group by 1,2,3 order by 1,2,3;
" 2>&1 | tee -a "${JOURNAL}" | tee "${ARCH}/05-plans-neufs.txt" > /dev/null
cat "${ARCH}/05-plans-neufs.txt"

dit ""
dit "  ⓒ L18b — LE SAS. ⛔ LE SEUIL « pending ≥ 3 » ÉTAIT DÉJÀ ATTEINT AVANT LE RUN"
PENDING_APRES="$(psql_t "select count(*) from food_composition_pending")"
dit "      avant ${PENDING_AVANT}   après ${PENDING_APRES}   delta $((PENDING_APRES - PENDING_AVANT))"
dit "      ⇒ la seule lecture honnête est le DELTA et les termes NEUFS :"
psql_x "select term, sightings, status, first_seen_at from food_composition_pending
          where first_seen_at >= '${T0}' order by first_seen_at;" 2>&1 | tee -a "${JOURNAL}"

dit ""
dit "  ⓓ L17-0 — LE VERDICT, PLAN PAR PLAN"
cat "${VERDICTS_L17_0}" | tee -a "${JOURNAL}"

dit ""
dit "  ⓔ LE RÉCAPITULATIF DES RUNS  → ${RECAP}"
cat "${RECAP}" | tee -a "${JOURNAL}"

dit ""
dit "  ⓕ ⛔ LES TROIS COMMANDES DE MESURE — À LANCER MAINTENANT, ZÉRO GÉNÉRATION"
dit ""
dit "     ① L2-lang (le critère de fin de vague — verdict PAR LANE) :"
dit "        bash scripts/keel_l2lang_langue_20260822.sh --since='${T0}'"
dit "        ⚠️ SANS --prompt-version : les deux lanes portent deux millésimes"
dit "           différents, et le passer exclurait l'une des deux du banc."
dit "           La portée « les deux lanes » REFUSERA de conclure — c'est juste."
dit "           La portée « foyer » est celle qui porte le verdict."
dit ""
dit "     ② L17 — les deux seuils, les deux dénominateurs :"
dit "        bash scripts/keel_l17_bornes_20260822.sh"
dit ""
dit "     ③ V0-E′ — le tableau de bord de fin de vague :"
dit "        bash scripts/keel_v0e_tableau_de_bord_20260821.sh"
dit ""
dit "══════════════════════════════════════════════════════════════════════════"
dit "V2-D terminé · archives ${ARCH}"
dit "══════════════════════════════════════════════════════════════════════════"
