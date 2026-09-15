#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# LOT 1 — LA CLASSIFICATION DU RETOUR SUR PLAN, MESURÉE EN CONDITIONS RÉELLES
# ═══════════════════════════════════════════════════════════════════════════
#
# Autorité : ~/.claude/plans/indexed-jumping-biscuit.md, lot 1.
# Fixture   : scripts/2026-09-01-fixture-foyer-retours.ts (foyer NU, 3 bouches).
#
# ── CE QUE CE BANC MESURE, ET CE QU'IL NE MESURE PAS ──────────────────────
# Il envoie DIX phrases, une par génération réelle, sur la lane FOYER — la
# seule qui passe des `members` au classifieur, donc la seule où l'attribution
# à une bouche est atteignable (`members: []` en solo).
#
# ⛔ `intent: "draft"` NE CLASSE RIEN : il sort avant le classifieur, qui vit
# après l'écriture du plan. Chaque phrase coûte donc une VRAIE écriture, et
# `replace_current` doit nommer la ligne qu'il remplace.
#
# ⚠️ ON NE PURGE PAS ENTRE LES PHRASES. Le magasin s'accumule, et on attribue
# chaque ligne par DIFFÉRENCE avant/après. Purger mesurerait dix premières
# fois au lieu d'une semaine.
#
# ⚠️ La fenêtre ne peut pas dépasser dimanche (`window_beyond_this_week`) :
# toutes les phrases visent donc la même semaine, ce qui est aussi le vrai
# geste — « refais ce plan, mais… ».
#
# Usage :
#   scripts/2026-09-01-banc-retour-plan.sh <anon> [n° de phrase à rejouer]

set -uo pipefail
ANON="${1:-}"
ONLY="${2:-}"
[ -n "$ANON" ] || { echo "usage: $0 <clé anon> [n°]" >&2; exit 2; }

URL="http://127.0.0.1:54321"
EMAIL="qa-foyer-retours@keeltest.dev"
OUT="${BANC_OUT:-/tmp/banc-retour-plan}"
mkdir -p "$OUT"

USER_ID=$(docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
  "select id from auth.users where email='$EMAIL';" | tr -d ' ')
[ -n "$USER_ID" ] || { echo "fixture absente : lance d'abord le script de foyer" >&2; exit 1; }

login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"1234567\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])"
}

# ⚠️ L'ÉTAT COMPLET, PAS SEULEMENT `retained_next_plan`. Les quatre autres
# destinations sont le POINT du banc : une phrase peut être « bien classée »
# dans le magasin et n'avoir jamais atteint la table qui la ferait agir.
snapshot() {
  docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc "
    select json_build_object(
      'next_plan',  coalesce((select practical_constraints->'retained_next_plan' from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'durable',    coalesce((select practical_constraints->'retained_items'      from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'field_changes', coalesce((select practical_constraints->'field_changes'    from student_goals where user_id='$USER_ID'), '[]'::jsonb),
      'safety',     (select coalesce(json_agg(kind||'/'||coalesce(allergen_ref,diet_ref,condition_ref,'?')), '[]'::json) from student_safety_constraints where user_id='$USER_ID' and status='active'),
      'traditions', (select coalesce(json_agg(weekday||'/'||slot||'/'||label), '[]'::json) from household_traditions t where t.household_id = public.keel_household_of('$USER_ID')),
      'habits',     (select coalesce(json_agg(m.first_name||': '||coalesce(h.note,'?')), '[]'::json) from household_member_habits h join household_members m on m.member_id=h.member_id where m.household_id = public.keel_household_of('$USER_ID')),
      'diets',      (select coalesce(json_agg(first_name||'='||coalesce(diet,'∅')), '[]'::json) from household_members where household_id = public.keel_household_of('$USER_ID'))
    );" 2>/dev/null | tr -d '\n'
}

last_meal() {
  docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
    "select id from student_generated_meals where user_id='$USER_ID' order by created_at desc limit 1;" | tr -d ' '
}

# ── LES DIX PHRASES ────────────────────────────────────────────────────────
# Le n° et l'attendu viennent du plan. L'attendu est écrit ICI pour que le
# rapport confronte, au lieu de décrire.
PHRASES=(
"1|logistics.set|C'est beaucoup trop long à cuisiner, je n'ai pas ce temps-là le soir"
"2|logistics.set|Les recettes sont bien trop compliquées pour moi"
"3|food.exclude|Je n'aime pas le poulet"
"4|food.exclude+sujet=Tom|Mon fils n'aime pas le poisson"
"5|REFUS forbiddenKind|Les parts sont beaucoup trop grosses"
"6|REFUS forbiddenKind|Ma fille a danse le mardi soir, il lui faut un vrai repas ce soir-là"
"7|frontière habitude|L'après-midi elle mange toujours des compotes de pommes"
"8|REFUS sécurité|Je suis allergique aux arachides"
"9|REFUS sécurité (régime)|Mon fils est devenu végétarien"
"10|craving|J'ai très envie de fajitas cette semaine"
)

echo "════════ BANC · retour sur plan · foyer $USER_ID ════════"
JWT=$(login)

for entry in "${PHRASES[@]}"; do
  N="${entry%%|*}"; rest="${entry#*|}"
  EXPECT="${rest%%|*}"; TEXT="${rest#*|}"
  [ -n "$ONLY" ] && [ "$ONLY" != "$N" ] && continue

  BEFORE=$(snapshot)
  echo "$BEFORE" > "$OUT/$N.before.json"

  BODY_OF() {
    python3 -c "
import json,sys
print(json.dumps({'operation':'compose','mode':'to_shop','intent':'replace_current',
 'replaces':sys.argv[1],'window':{'kind':'days','count':2},'draft_note':sys.argv[2]}))" \
      "$1" "$2"
  }

  # ⛔ ON REPREND SUR 502, ET ON LE DIT. Le conteneur edge est recréé par son
  # superviseur pendant les lots longs : Kong rend alors « invalid response
  # from the upstream server », qui ressemble trait pour trait à une panne de
  # la fonction. Une phrase qui n'a pas été envoyée doit se relire « pas
  # envoyée », jamais « rien classé ».
  CODE=""; DT=0
  for try in 1 2 3; do
    # ⛔ `--since` AVEC UN INSTANT ABSOLU, jamais `-f` nu ni `--since 1s`.
    # `docker logs -f` REJOUE TOUT L'HISTORIQUE : le `tail -1` d'un compteur que
    # CETTE requête n'a pas produit rend alors la ligne de la requête d'AVANT.
    # Mesuré deux fois — #3 a porté le compteur de #2, puis #9 a porté la ligne
    # de sécurité de #8, qui parlait d'arachides dont #9 ne dit rien.
    SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    : > "$OUT/$N.log"
    docker logs --since "$SINCE" -f supabase_edge_runtime_Sophia_2 > "$OUT/$N.log" 2>&1 &
    LP=$!
    T0=$(date +%s)
    CODE=$(curl -s -o "$OUT/$N.out" -w "%{http_code}" -X POST "$URL/functions/v1/generate-household-meal-v1" \
      -H "apikey: $ANON" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
      -d "$(BODY_OF "$(last_meal)" "$TEXT")" --max-time 600)
    kill $LP 2>/dev/null; wait $LP 2>/dev/null
    DT=$(( $(date +%s) - T0 ))
    [ "$CODE" = "401" ] && { JWT=$(login); continue; }
    [ "$CODE" = "200" ] && break
    echo "     HTTP $CODE — conteneur recréé en vol, reprise ($try/3)"
    sleep 15
  done

  snapshot > "$OUT/$N.after.json"
  # ⛔ LE COMPTEUR NE SE LIT QUE SUR UN 200. Sur un 502, la ligne la plus
  # récente du journal est celle de la phrase PRÉCÉDENTE : on la lirait comme
  # le verdict de celle-ci. C'est arrivé — #3 a porté le compteur de #2 — et
  # c'est le pire défaut possible pour un banc, puisqu'il rend un nombre faux
  # au lieu de rien.
  : > "$OUT/$N.counter.json"; : > "$OUT/$N.safety.json"
  if [ "$CODE" = "200" ]; then
    grep -o '{"tag":"keel/draft_note_classify".*' "$OUT/$N.log" | tail -1 > "$OUT/$N.counter.json"
  # ⚠️ LE COMPTEUR DE REPLI DE SÉCURITÉ COUVRE AUSSI CETTE PORTE
  # (`surface: "retained_store"`), et son aveu est le point du cas n°8 : sur ce
  # chemin, un allergène rangé en préférence n'a AUCUN rattrapage — l'outil de
  # sécurité n'existe pas sur une note de brouillon.
    grep -o '{"tag":"keel/safety_fallback".*' "$OUT/$N.log" | tail -1 > "$OUT/$N.safety.json"
  fi
  echo "  #$N  HTTP $CODE en ${DT}s  — « ${TEXT:0:52} »"
done

echo
echo "════════ RAPPORT ════════"
python3 - "$OUT" <<'PY'
import json, os, sys
out = sys.argv[1]
EXPECT = {
 "1":"logistics.set","2":"logistics.set","3":"food.exclude","4":"food.exclude + sujet=Tom",
 "5":"REFUS forbiddenKind","6":"REFUS forbiddenKind","7":"frontière habitude",
 "8":"REFUS sécurité","9":"REFUS sécurité (régime)","10":"craving"}
for n in map(str, range(1, 11)):
    b, a = f"{out}/{n}.before.json", f"{out}/{n}.after.json"
    if not os.path.exists(a): continue
    B, A = json.load(open(b)), json.load(open(a))
    def key(w): return json.dumps(w.get("item", w), sort_keys=True, ensure_ascii=False)
    new = [w for w in A["next_plan"] if key(w) not in {key(x) for x in B["next_plan"]}]
    c = {}
    cf = f"{out}/{n}.counter.json"
    if os.path.getsize(cf) > 0:
        c = json.loads(open(cf).read().strip())
    print(f"\n── #{n} · attendu : {EXPECT[n]}")
    print(f"   compteur   proposé={c.get('proposed','?')} gardé={c.get('kept','?')} "
          f"refusé={c.get('refused','?')} (kind_interdit={c.get('refused_forbidden_kind','?')} "
          f"kind_inconnu={c.get('refused_unknown_kind','?')} membre_inconnu={c.get('refused_unknown_member','?')})")
    if not new:
        print("   écrit      RIEN")
    for w in new:
        it = w.get("item", w)
        print(f"   écrit      {it.get('kind')} · sujet={it.get('subject')} · scope={it.get('scope')}")
        print(f"              texte « {it.get('text')} »")
        print(f"              cause « {it.get('quote')} »")
    sf = f"{out}/{n}.safety.json"
    if os.path.exists(sf) and os.path.getsize(sf) > 0:
        d = json.loads(open(sf).read().strip())
        if d.get("shaped"):
            print(f"   ⛔ REPLI SÉCURITÉ  slugs={d.get('slugs')} fell_back={d.get('fell_back')} "
                  f"surface={d.get('surface')} — rangé en préférence, aucune ceinture en sortie")
    for label, k in (("sécurité","safety"),("traditions","traditions"),("habitudes","habits"),("régimes","diets")):
        if A.get(k) != B.get(k):
            print(f"   ⚑ {label} : {B.get(k)} → {A.get(k)}")
PY
