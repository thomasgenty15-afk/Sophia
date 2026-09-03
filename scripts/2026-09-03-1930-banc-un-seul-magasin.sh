#!/usr/bin/env bash
set -uo pipefail
# ═══════════════════════════════════════════════════════════════════════════
# LE BANC DU MAGASIN UNIQUE — LOT C (2026-09-03)
# ═══════════════════════════════════════════════════════════════════════════
#
# Autorité : chantier « la mémoire à trois destinations » §6.5.
#
# CE QU'IL MESURE, ET DANS CET ORDRE :
#   ① « saumon » est posé sur Tom PAR LA RPC QUE L'ÉCRAN APPELLE
#      (`keel_write_retained_items`, avec le JETON de Claire) — jamais par un
#      `insert`. Un banc qui écrit en SQL mesure la base, pas le produit.
#   ② une génération RÉELLE du foyer ;
#   ③ `exclusion_belt` : `mouths / checked / kept / refused`, lus dans les logs
#      du conteneur, `--since` ABSOLU (un `--since 5m` attrape le run d'avant) ;
#   ④ le saumon est absent des boîtes de Tom, et présent ailleurs si le plan en
#      sert — c'est la moitié qui distingue « exclu » de « jamais composé » ;
#   ⑤ la requête anti-doublon des deux magasins.
#
# ⛔ AUCUNE PURGE. L'état de la fixture s'accumule : c'est ce que vit une vraie
# personne, et le magasin porte déjà des lignes des lots A et B.
#
# Usage : scripts/2026-09-03-1930-banc-un-seul-magasin.sh <clé anon>
# ═══════════════════════════════════════════════════════════════════════════

ANON="${1:-}"
[ -n "$ANON" ] || { echo "usage: $0 <clé anon>" >&2; exit 2; }

URL="http://127.0.0.1:54321"
EMAIL="${BANC_EMAIL:-qa-3portes@keeltest.dev}"
OUT="${BANC_OUT:-/tmp/banc-lotc}"
mkdir -p "$OUT"

psql() { docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "$1" 2>/dev/null; }

USER_ID=$(psql "select id from auth.users where email='$EMAIL';" | tr -d ' ')
[ -n "$USER_ID" ] || { echo "fixture absente" >&2; exit 1; }
HH=$(psql "select public.keel_household_of('$USER_ID');" | tr -d ' ')
TOM=$(psql "select member_id from household_members where household_id='$HH' and first_name='Tom';" | tr -d ' ')
LEA=$(psql "select member_id from household_members where household_id='$HH' and first_name='Léa';" | tr -d ' ')
TODAY=$(date +%F)
echo "foyer=$HH  Tom=$TOM  Léa=$LEA"

TOK=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")
[ -n "$TOK" ] || { echo "login KO" >&2; exit 1; }

# ── ① L'ÉCRITURE, PAR LA PORTE DE L'ÉCRAN ─────────────────────────────────
# ⚠️ `p_expected` EST LE MAGASIN LU, TEL QUEL. C'est le témoin de concurrence
# de la RPC : lui donner autre chose (`[]`, par exemple) ferait refuser
# `stale_snapshot` sur une ligne qui n'a pas bougé.
psql "select coalesce(practical_constraints->'retained_items','null'::jsonb) from student_goals where user_id='$USER_ID'" > "$OUT/before.json"
python3 - "$OUT/before.json" "$TOM" "$TODAY" > "$OUT/write-args.json" <<'PY'
import json, sys
raw = open(sys.argv[1]).read().strip()
stored = json.loads(raw) if raw and raw != "null" else None
# ⚠️ LE BANC DÉDOUBLONNE COMME L'ÉCRAN, ET C'EST UN CORRECTIF DU BANC.
# La première version appendait sans regarder: trois passages ont laissé TROIS
# lignes « saumon » identiques sur Tom (mesuré). Le produit ne fait pas ça —
# `addWrittenFoodExclusions` compare `(kind, sujet, texte normalisé)` avant
# d'écrire — mais LA RPC, ELLE, N'EN SAIT RIEN: le dédoublonnage vit dans
# l'APPELANT, pas dans le port. Un banc qui écrit par la RPC doit donc rejouer
# la règle de l'appelant, sans quoi il mesure sa propre faute.
# ⏸ ET C'EST UN CONSTAT À REMONTER: un second écran qui écrirait par cette RPC
# sans rejouer la règle produirait les mêmes doublons.
def key(it):
    return (
        str(it.get("kind", "")).strip().lower(),
        str(it.get("subject", "")).strip().lower(),
        " ".join(str(it.get("text", "")).strip().lower().split()),
    )
items, seen = [], set()
for it in (stored or []):
    k = key(it)
    if k in seen:
        continue
    seen.add(k)
    items.append(it)
fresh = {
    "kind": "food.exclude",
    "scope": "durable",
    "subject": f"member:{sys.argv[2]}",
    "source": "written",
    "text": "saumon",
    "at": sys.argv[3],
    "item": "",
    "confidence": None,
    "quote": None,
    "value": None,
}
if key(fresh) not in seen:
    items.append(fresh)
print(json.dumps({
    "p_expected": stored,
    "p_items": items,
    "p_expected_next": None,
    "p_next": None,
    "p_expected_notes": None,
    "p_notes": None,
    "p_origins": None,
}, ensure_ascii=False))
PY
echo "── ① écriture par la RPC de l'écran"
curl -s -X POST "$URL/rest/v1/rpc/keel_write_retained_items" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" \
  --data-binary "@$OUT/write-args.json" | tee "$OUT/write.json"; echo

# ── ② LA GÉNÉRATION RÉELLE ────────────────────────────────────────────────
# ⚠️ L'HORODATAGE EST PRIS AVANT L'APPEL, en UTC, au format que `docker logs`
# comprend. « --since 5m » attraperait le run précédent et ferait lire ses
# compteurs comme ceux de celui-ci.
# ⛔ `replaces` EST OBLIGATOIRE DÈS QU'UN PLAN EXISTE. La fixture porte les
# plans des lots A et B; sans lui la fonction refuse `plan_overlaps_existing`
# (409) — mesuré au premier essai de ce banc. Le refus est correct: composer
# par-dessus un plan en cours sans le nommer ferait deux plans pour la même
# semaine.
# ⚠️ LU JUSTE AVANT L'APPEL, jamais en tête de script: une génération lancée
# plus tôt (même interrompue côté client) a pu retirer ce plan entre-temps, et
# la RPC refuse alors `plan_not_replaceable` — mesuré sur ce banc.
LAST=$(psql "select id from student_generated_meals where user_id='$USER_ID' and plan_kind='household' and retired_at is null order by created_at desc limit 1;" | tr -d ' ')
GEN=$(python3 -c "
import json,sys
last=sys.argv[1]
b={'operation':'compose','mode':'to_shop','window':{'kind':'days','count':2}}
if last: b['intent']='replace_current'; b['replaces']=last
else: b['intent']='prepare_next'
print(json.dumps(b))" "$LAST")
SINCE=$(date -u +%Y-%m-%dT%H:%M:%S)
echo "── ② génération (depuis $SINCE, remplace ${LAST:-aucun})"
curl -s -X POST "$URL/functions/v1/generate-household-meal-v1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" \
  -d "$GEN" --max-time 800 \
  -o "$OUT/plan.json" -w "HTTP %{http_code} en %{time_total}s\n"

# ── ③ LES COMPTEURS ───────────────────────────────────────────────────────
echo "── ③ ceinture et compteurs"
# ⚠️ `sed` ET PAS `grep -o`: les lignes du conteneur sont préfixées « [Info] »,
# et un `grep -o` sur une accolade rendait des fragments que `json.loads`
# refusait EN SILENCE (le banc affichait alors zéro compteur sur un run réussi).
docker logs supabase_edge_runtime_Sophia_2 --since "$SINCE" 2>&1 \
  | grep '"tag":"keel' | sed 's/.*{"tag"/{"tag"/' \
  | python3 -c "
import json, sys
want = {
  'keel.household_meal.exclusion_belt',
  'keel.household_meal.member_voices',
  'keel.household_meal.retained_items',
}
seen = []
for line in sys.stdin:
    try:
        d = json.loads(line.strip())
    except Exception:
        continue
    if d.get('tag') in want:
        seen.append(d)
# ⚠️ LA CEINTURE SE JOURNALISE PLUSIEURS FOIS PAR GÉNÉRATION (première passe,
# relance, passe finale). C'est LA DERNIÈRE qui décrit le plan ÉCRIT; lire la
# première ferait rendre les compteurs d'un plan qui n'existe pas.
for tag in sorted(want):
    lines = [d for d in seen if d.get('tag') == tag]
    if not lines:
        print(f'{tag}: AUCUNE LIGNE — la lane ne journalise plus, ou la fenêtre est fausse')
        continue
    last = lines[-1]
    keep = {k: v for k, v in last.items() if k not in ('user_id', 'household_id', 'tag')}
    print(f'{tag} ({len(lines)} passage(s), la DERNIÈRE):')
    print('   ' + json.dumps(keep, ensure_ascii=False, sort_keys=True)[:400])
" | tee "$OUT/counters.json"

# ── ④ LE SAUMON DANS LE PLAN ──────────────────────────────────────────────
echo "── ④ le saumon, par bouche"
# ⚠️ `plan["dishes"]`, À PLAT. La réponse ne porte PAS `meal.days[].dishes` —
# `meal` ne contient que l'`id`. La première rédaction lisait un chemin
# inexistant et rendait « 0 boîte » sur TOUS les plats: un zéro qui ressemblait
# à une exclusion réussie alors qu'il ne mesurait rien.
python3 - "$OUT/plan.json" "$TOM" <<'PY'
import json, sys
try:
    plan = json.load(open(sys.argv[1]))
except Exception as e:
    print("plan illisible:", e); raise SystemExit(0)
tom = sys.argv[2]
dishes = plan.get("dishes") or []
served, with_tom, without_tom = 0, [], []
for dish in dishes:
    txt = json.dumps(dish, ensure_ascii=False).lower()
    if "saumon" not in txt and "salmon" not in txt:
        continue
    served += 1
    boxes = dish.get("boxes") or []
    label = f"{dish.get('day')} · {str(dish.get('title'))[:40]}"
    if any(tom in (b.get("member_ids") or []) for b in boxes):
        with_tom.append(label)
    else:
        without_tom.append(label)
print(f"plats du plan          : {len(dishes)}")
print(f"plats servant du saumon: {served}")
print(f"  …dont une boîte pour Tom : {len(with_tom)} {with_tom[:3]}")
print(f"  …dont aucune pour Tom    : {len(without_tom)} {without_tom[:3]}")
if served == 0:
    print("⚠️ LE PLAN N'EN SERT À PERSONNE: ce cas ne PROUVE pas l'exclusion,")
    print("   il ne la contredit pas. La preuve du câblage est ailleurs — les")
    print("   jetons de la ceinture pour cette bouche (§ ⑥ ci-dessous).")
PY

# ── ⑥ LES JETONS DE LA CEINTURE, PAR BOUCHE ───────────────────────────────
# ⛔ LA MOITIÉ QUI PROUVE LE CÂBLAGE QUAND LE MODÈLE NE SERT PAS L'ALIMENT.
# `mouths=1 checked=N` dit qu'UNE bouche avait des jetons; il ne dit pas
# LESQUELS. On fait donc tourner la vraie fonction du socle sur les items
# VRAIMENT en base: si « saumon » n'y est pas, la ligne écrite par l'écran
# n'atteint pas la ceinture, quel que soit le plan rendu.
echo "── ⑥ jetons de la ceinture, sur les items réellement en base"
psql "select coalesce(practical_constraints->'retained_items','[]'::jsonb) from student_goals where user_id='$USER_ID'" > "$OUT/items.json"
cat > "$OUT/probe.ts" <<PROBE
import { exclusionTermsFor } from "$PWD/supabase/functions/_shared/keel/food_exclusion_belt.ts";
import { parseRetainedItems } from "$PWD/supabase/functions/_shared/keel/retained_item.ts";
const items = parseRetainedItems(JSON.parse(await Deno.readTextFile("$OUT/items.json")));
for (const [who, subject] of [["Tom", "member:$TOM"], ["Léa", "member:$LEA"], ["foyer", "household"]]) {
  const terms = exclusionTermsFor({ items, subject });
  const has = terms.some((t) => t.token === "saumon");
  console.log(\`\${who}: \${terms.length} jeton(s) — « saumon » présent: \${has}\`);
}
PROBE
(cd "$PWD" && deno run --allow-read "$OUT/probe.ts")

# ── ⑤ LA REQUÊTE ANTI-DOUBLON (§6.5) ──────────────────────────────────────
echo "── ⑤ anti-doublon: un même aliment pour une même bouche dans DEUX magasins"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "
with r as (select member_id, lower(label) f from household_food_restrictions),
     p as (select split_part(e->>'subject',':',2)::uuid member_id,
                  lower(e->>'text') f
           from student_goals g, jsonb_array_elements(g.practical_constraints->'retained_items') e
           where e->>'kind'='food.exclude' and e->>'subject' like 'member:%')
select * from r join p using (member_id, f);"

echo "── ⑤ bis: doublon DANS le magasin structuré (même bouche, même aliment)"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "
select subject, text, count(*)
from (select e->>'subject' subject, lower(trim(e->>'text')) text
      from student_goals g, jsonb_array_elements(g.practical_constraints->'retained_items') e
      where e->>'kind'='food.exclude') x
group by 1,2 having count(*) > 1;"
