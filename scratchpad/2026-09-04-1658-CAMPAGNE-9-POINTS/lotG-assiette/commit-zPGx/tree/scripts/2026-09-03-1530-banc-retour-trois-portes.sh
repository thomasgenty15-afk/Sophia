#!/usr/bin/env bash
set -uo pipefail
# ═══════════════════════════════════════════════════════════════════════════
# LE BANC DU RETOUR SUR BROUILLON — TROIS PORTES (lot A, 2026-09-03)
# ═══════════════════════════════════════════════════════════════════════════
#
# Autorité : `docs/keel/NOMENCLATURE-MEMOIRE.md` §8.1 — c'est LUI que ce banc
# teste, phrase par phrase. L'attendu est écrit ICI, et il est celui du doc.
#
# ── CE QUE CE BANC MESURE ─────────────────────────────────────────────────
# Il envoie DIX phrases, une par génération réelle, sur la lane FOYER, puis
# DEUX générations « nues » (sans note) : G4 après la phrase 4 (poisson de
# Tom → ceinture) et G6 après la phrase 6 (danse de Léa → note servie, boîte
# du mardi soir). Chaque phrase relit les CINQ magasins + la sécurité.
#
# ⛔ `intent: "draft"` NE CLASSE RIEN. Chaque phrase coûte une VRAIE écriture.
# ⚠️ ON NE PURGE PAS ENTRE LES PHRASES : l'état s'accumule, comme en vrai.
# ⛔ `--since` ABSOLU, compteur lu SEULEMENT sur un HTTP 200.
#
# Usage :
#   scripts/2026-09-03-1530-banc-retour-trois-portes.sh <anon> [n°|G4|G6]
# ═══════════════════════════════════════════════════════════════════════════

ANON="${1:-}"
ONLY="${2:-}"
[ -n "$ANON" ] || { echo "usage: $0 <clé anon> [n°|G4|G6]" >&2; exit 2; }

URL="http://127.0.0.1:54321"
EMAIL="${BANC_EMAIL:-qa-3portes@keeltest.dev}"
OUT="${BANC_OUT:-/tmp/banc-retour-trois-portes}"
mkdir -p "$OUT"

psql() { docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "$1" 2>/dev/null; }

USER_ID=$(psql "select id from auth.users where email='$EMAIL';" | tr -d ' ')
[ -n "$USER_ID" ] || { echo "fixture absente : lance d'abord le script de foyer" >&2; exit 1; }
HH=$(psql "select public.keel_household_of('$USER_ID');" | tr -d ' ')
LEA=$(psql "select member_id from household_members where household_id='$HH' and first_name='Léa';" | tr -d ' ')
TOM=$(psql "select member_id from household_members where household_id='$HH' and first_name='Tom';" | tr -d ' ')
CLAIRE=$(psql "select member_id from household_members where household_id='$HH' and first_name='Claire';" | tr -d ' ')
echo "foyer $HH · Claire=$CLAIRE · Léa=$LEA · Tom=$TOM"

login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])"
}

# ⚠️ L'ÉTAT COMPLET : les trois destinations, l'encart, la sécurité, les diètes.
snapshot() {
  psql "
    select json_build_object(
      'durable',   coalesce((select practical_constraints->'retained_items'     from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'memo',      coalesce((select practical_constraints->'memo'               from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'next_plan', coalesce((select practical_constraints->'retained_next_plan' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'fields',    (select jsonb_build_object('cooking_time_min', practical_constraints->'cooking_time_min', 'recipe_difficulty', practical_constraints->'recipe_difficulty', 'variety', practical_constraints->'variety') from student_goals where user_id='$USER_ID'),
      'safety',    (select coalesce(json_agg(kind||'/'||coalesce(allergen_ref,substance_ref,condition_ref,'?')), '[]'::json) from student_safety_constraints where user_id='$USER_ID' and status='active'),
      'allergies', (select coalesce(json_agg(m.first_name||': '||a.label), '[]'::json) from household_member_allergies a join household_members m on m.member_id=a.member_id where m.household_id='$HH'),
      'diets',     (select coalesce(json_agg(first_name||'='||coalesce(diet,'∅')), '[]'::json) from household_members where household_id='$HH')
    );" | tr -d '\n'
}

last_meal() {
  psql "select id from student_generated_meals where user_id='$USER_ID' and plan_kind='household' and retired_at is null order by created_at desc limit 1;" | tr -d ' '
}

# ── LES DIX PHRASES DU §8.1, ET LES DEUX GÉNÉRATIONS NUES ─────────────────
# n°|porte attendue|texte  — G4/G6 : pas de note, fenêtre de 7 jours.
STEPS=(
"1|rien (skipped_degree)|C'est beaucoup trop long à cuisiner, je n'ai pas ce temps-là le soir"
"2|rien (skipped_degree)|Les recettes sont bien trop compliquées pour moi"
"3|① exclude poulet · household|Je n'aime pas le poulet"
"4|① exclude poisson · member:Tom|Mon fils n'aime pas le poisson"
"G4|génération nue — ceinture : poisson absent des boîtes de Tom|"
"5|rien (skipped_degree)|Les parts sont beaucoup trop grosses"
"6|③ note Léa · when tue/dinner|Ma fille a danse le mardi soir, il lui faut un vrai repas ce soir-là"
"G6|génération nue — note de Léa servie, boîte du mardi soir > lundi|"
"7|③ note Léa · when snack_pm|L'après-midi elle mange toujours des compotes de pommes"
"8|sécurité (arachides) · 0 préférence|Je suis allergique aux arachides"
"9|sécurité (régime Tom) · 0 préférence|Mon fils est devenu végétarien"
"10|encart (fajitas) · household|J'ai très envie de fajitas cette semaine"
)

echo "════════ BANC · retour sur brouillon · trois portes · $EMAIL ════════"
JWT=$(login)

for entry in "${STEPS[@]}"; do
  N="${entry%%|*}"; rest="${entry#*|}"
  EXPECT="${rest%%|*}"; TEXT="${rest#*|}"
  [ -n "$ONLY" ] && [ "$ONLY" != "$N" ] && continue

  snapshot > "$OUT/$N.before.json"

  # ⚠️ LE PREMIER PLAN D'UN COMPTE NEUF N'A RIEN À REMPLACER: `prepare_next`.
  # Ensuite, `replace_current` nomme le plan vivant — c'est le geste du produit.
  BODY=$(python3 -c "
import json,sys
last, text, days = sys.argv[1], sys.argv[2], int(sys.argv[3])
b = {'operation':'compose','mode':'to_shop','window':{'kind':'days','count':days}}
if last: b['intent']='replace_current'; b['replaces']=last
else: b['intent']='prepare_next'
if text: b['draft_note']=text
print(json.dumps(b))" "$(last_meal)" "$TEXT" "$([ -z "$TEXT" ] && echo 7 || echo 2)")

  CODE=""; DT=0
  for try in 1 2 3; do
    SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    : > "$OUT/$N.log"
    docker logs --since "$SINCE" -f supabase_edge_runtime_Sophia_2 > "$OUT/$N.log" 2>&1 &
    LP=$!
    T0=$(date +%s)
    CODE=$(curl -s -o "$OUT/$N.out" -w "%{http_code}" -X POST "$URL/functions/v1/generate-household-meal-v1" \
      -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
      -d "$BODY" --max-time 800)
    sleep 2
    kill $LP 2>/dev/null; wait $LP 2>/dev/null
    DT=$(( $(date +%s) - T0 ))
    [ "$CODE" = "401" ] && { JWT=$(login); continue; }
    [ "$CODE" = "200" ] && break
    echo "     HTTP $CODE — reprise ($try/3)"
    sleep 15
  done

  snapshot > "$OUT/$N.after.json"
  : > "$OUT/$N.counter.json"; : > "$OUT/$N.safety.json"; : > "$OUT/$N.notes.json"; : > "$OUT/$N.belt.json"
  if [ "$CODE" = "200" ]; then
    grep -o '{"tag":"keel/draft_note_classify".*' "$OUT/$N.log" | tail -1 > "$OUT/$N.counter.json"
    grep -o '{"tag":"keel/draft_note_safety".*' "$OUT/$N.log" | tail -1 > "$OUT/$N.safety.json"
    grep -o '{"tag":"keel.household_meal.notes".*' "$OUT/$N.log" | tail -1 > "$OUT/$N.notes.json"
    grep -o '{"tag":"keel.household_meal.exclusion_belt".*' "$OUT/$N.log" | tail -1 > "$OUT/$N.belt.json"
    MEAL=$(last_meal)
    psql "select jsonb_pretty(coalesce(dishes,'[]'::jsonb)) from student_generated_meals where id='$MEAL';" > "$OUT/$N.dishes.json"
  fi
  echo "  #$N  HTTP $CODE en ${DT}s  — ${TEXT:-génération nue} "
done

echo
echo "════════ RAPPORT ════════"
python3 - "$OUT" "$LEA" "$TOM" "$CLAIRE" <<'PY'
import json, os, sys
out, LEA, TOM, CLAIRE = sys.argv[1:5]
NAMES = {LEA: "Léa", TOM: "Tom", CLAIRE: "Claire", "household": "table"}
EXPECT = {
 "1":"rien — skipped_degree","2":"rien — skipped_degree","3":"① food.exclude poulet · household",
 "4":"① food.exclude poisson · member:Tom","G4":"ceinture : poisson absent chez Tom",
 "5":"rien — skipped_degree","6":"③ note Léa · tue/dinner","G6":"note de Léa servie · boîte mardi soir > lundi",
 "7":"③ note Léa · snack_pm","8":"sécurité arachides · 0 préférence","9":"sécurité régime Tom · 0 préférence",
 "10":"encart fajitas · household"}
def load(path):
    if not os.path.exists(path) or os.path.getsize(path) == 0: return None
    try: return json.loads(open(path).read().strip())
    except Exception: return None
def subj(s):
    s = str(s or "")
    return NAMES.get(s.split(":")[-1], s)
for n in ["1","2","3","4","G4","5","6","G6","7","8","9","10"]:
    a, b = load(f"{out}/{n}.after.json"), load(f"{out}/{n}.before.json")
    if a is None: continue
    print(f"\n── #{n} · attendu : {EXPECT[n]}")
    c = load(f"{out}/{n}.counter.json")
    if c:
        print(f"   classif    event={c.get('event')} ① {c.get('pref_proposed','?')}/{c.get('pref_kept','?')}  ③ {c.get('notes_proposed','?')}/{c.get('notes_kept','?')}  encart {c.get('next_proposed','?')}/{c.get('next_kept','?')}  skipped degree={c.get('skipped_degree','?')} setting={c.get('skipped_setting','?')} story={c.get('skipped_meal_story','?')} other={c.get('skipped_other','?')}  refused={c.get('refused','?')} kinds={c.get('refused_forbidden_kinds','?')} member={c.get('refused_unknown_member','?')} when={c.get('refused_bad_when','?')} listes_manquantes={c.get('lists_missing','?')}")
        if "durable_written" in c:
            print(f"   écriture   durable={c.get('durable_written')} memo={c.get('memo_written')} encart={c.get('next_plan_written')} refus_port={c.get('write_refused')} (full={c.get('write_refused_memo_full')} dup={c.get('write_refused_memo_duplicate')} déjà={c.get('write_refused_already_stored')})")
    elif n[0] != "G":
        print("   classif    AUCUNE LIGNE keel/draft_note_classify — runtime périmé ou appel non fait")
    for key, label in (("durable","①"),("memo","③"),("next_plan","encart")):
        bef = {json.dumps(x, sort_keys=True) for x in (b or {}).get(key, [])}
        for x in a.get(key, []):
            if json.dumps(x, sort_keys=True) in bef: continue
            # ⚠️ un item DURABLE porte une clé `item` (uuid, souvent ""): l'enveloppe de l'encart, elle, porte un OBJET.
            it = x["item"] if isinstance(x.get("item"), dict) else x
            when = x.get("when")
            print(f"   +{label}  {it.get('kind','note')} · {subj(it.get('subject'))} · scope={it.get('scope','—')} · when={when} · « {it.get('text')} »")
            if it.get("quote"): print(f"          cause « {it.get('quote')} »")
    for key in ("safety","allergies","diets","fields"):
        if a.get(key) != (b or {}).get(key): print(f"   ⚑ {key} : {(b or {}).get(key)} → {a.get(key)}")
    notes = load(f"{out}/{n}.notes.json")
    if notes: print(f"   notes      lines={notes.get('lines')} (table={notes.get('household_lines')} bouches={notes.get('member_lines')}) served={notes.get('served')} block={notes.get('block_served')} autres_sujets={notes.get('other_subjects')}")
    belt = load(f"{out}/{n}.belt.json")
    if belt: print(f"   ceinture   {json.dumps({k:v for k,v in belt.items() if k not in ('tag','user_id','household_id')}, ensure_ascii=False)[:300]}")
    dishes = load(f"{out}/{n}.dishes.json")
    if dishes and n in ("G4","4","G6","6"):
        # Tom : poisson dans ses boîtes ? Léa : grammes mardi soir vs lundi soir.
        fishy = ("poisson","saumon","cabillaud","thon","truite","sardine","maquereau","colin","lieu","dorade","bar","merlu","crevette")
        tom_fish = []; lea = {}
        for d in dishes:
            for box in d.get("boxes") or []:
                ids = box.get("member_ids") or []
                grams = sum((i.get("grams") or 0) for i in (box.get("items") or []))
                terms = " ".join(str(i.get("term","")) for i in (box.get("items") or [])).lower()
                if TOM in ids and any(f in terms for f in fishy): tom_fish.append((d.get("day"), d.get("slot"), d.get("title")))
                if LEA in ids and d.get("slot") == "dinner":
                    lea.setdefault(d.get("day"), []).append((grams, len(ids), d.get("title")))
        if n in ("4","G4"): print(f"   Tom/poisson  boîtes de Tom qui servent du poisson : {tom_fish or 'AUCUNE'}")
        if n in ("6","G6"):
            for day in ("mon","tue","wed","thu","fri","sat","sun"):
                if day in lea: print(f"   Léa dîner {day}: " + " | ".join(f"{g} g (boîte à {k}) « {t[:40]} »" for g,k,t in lea[day]))
PY
