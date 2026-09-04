#!/usr/bin/env python3
"""
CE QUE LA CAMPAGNE LIT APRÈS CHAQUE CYCLE — une ligne de courbe.

⛔ AUCUNE MESURE N'EST RECALCULÉE ICI QUAND LE MOTEUR LA REND DÉJÀ. Les
compteurs de ceinture, l'invariant et les contenants viennent de
`generated_from.household`, pas d'un second calcul — mesurer son propre lot
avec un instrument qu'on fabrique pour lui ne prouve rien.

La SEULE chose recalculée est la VIOLATION VUE DE L'ASSIETTE : une bouche
nommée sur un contenant dont les items portent ce qu'elle évite. C'est le fait
que la personne subit, et il ne se déduit d'aucun compteur — la ceinture peut
avoir retiré la bouche (donc `refused`), et le dernier recours l'avoir remise.
"""
import json
import subprocess
import sys

USER_ID, CYCLE = sys.argv[1], sys.argv[2]
DB = "supabase_db_Sophia_2"


def psql(q: str) -> str:
    return subprocess.run(
        ["docker", "exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-tAc", q],
        capture_output=True, text=True).stdout.strip()


names = {}
for line in psql(
    f"select member_id, first_name from household_members where household_id in "
    f"(select household_id from household_members where user_id='{USER_ID}');"
).split("\n"):
    if "|" in line:
        i, n = line.split("|", 1)
        names[i.strip()] = n.strip()

items = json.loads(psql(
    f"select coalesce(practical_constraints->'retained_items','[]')::text "
    f"from student_goals where user_id='{USER_ID}';") or "[]")
food = [i for i in items if str(i.get("kind", "")).startswith(("food.", "method."))]
excludes = [i for i in food if i.get("kind") == "food.exclude"]

row = psql(
    f"select json_build_object('id',id,'dishes',dishes,'gf',generated_from,"
    f"'days',duration_days,'starts',starts_on)::text "
    f"from student_generated_meals where user_id='{USER_ID}' and retired_at is null "
    f"order by created_at desc limit 1;")
plan = json.loads(row) if row else {}
gf = ((plan.get("gf") or {}).get("household") or {})
dishes = plan.get("dishes") or []


def terms_of(text: str):
    """Les mots cherchables d'une ligne, sans matcher maison: on retient les
    mots de plus de trois lettres, hors mots-outils. Le moteur a son matcher;
    ici on ne fait qu'OBSERVER, et une observation trop large sur-compte les
    violations plutôt que de les cacher."""
    stop = {"pas", "les", "des", "une", "mon", "mari", "aime", "plus", "que",
            "avec", "sans", "pour", "dans", "elle", "cette", "veut", "trop"}
    return [w.strip(".,;:!?'’").lower() for w in text.split()
            if len(w) > 3 and w.strip(".,;:!?'’").lower() not in stop]


violations = 0
for d in dishes:
    for b in (d.get("boxes") or []):
        content = " ".join((it.get("term") or "") for it in (b.get("items") or [])).lower()
        for m in (b.get("member_ids") or []):
            for ex in excludes:
                if str(ex.get("subject", "")) != f"member:{m}":
                    continue
                if any(t in content for t in terms_of(ex.get("text", ""))):
                    violations += 1

clar = psql(
    f"select coalesce(status,'-')||':'||count(*)::text from memory_clarifications "
    f"where user_id='{USER_ID}' group by status;").replace("\n", " ")
notices = psql(
    f"select count(*) from chat_messages where user_id='{USER_ID}' and role='assistant' "
    f"and metadata->>'purpose'='keel_memory_written';").strip()
questions = psql(
    f"select count(*) from chat_messages where user_id='{USER_ID}' and role='assistant' "
    f"and metadata->>'purpose'='keel_memory_clarification';").strip()
voir = psql(
    f"select count(*) from chat_messages where user_id='{USER_ID}' and role='assistant' "
    f"and metadata::text like '%KEEL_VIEW_ABOUT_YOU%';").strip()

rb = gf.get("regime_belt") or {}
eb = gf.get("exclusion_belt") or {}
md = gf.get("meals_delivered") or {}
bx = gf.get("boxes") or {}

print(json.dumps({
    "cycle": CYCLE,
    "plan": (plan.get("id") or "")[:8],
    "days": plan.get("days"),
    "starts": str(plan.get("starts") or ""),
    "memory_food_lines": len(food),
    "excludes": len(excludes),
    "violations_on_plate": violations,
    "exclusion_bites": eb.get("bites"),
    "exclusion_separated": eb.get("separated"),
    "exclusion_not_separated": eb.get("not_separated"),
    "exclusion_refused": eb.get("refused"),
    "regime_bites": rb.get("bites"),
    "regime_separated": rb.get("separated"),
    "regime_refused": rb.get("refused"),
    "unfed_missing": md.get("missing"),
    "unfed_retried": md.get("retried"),
    "unfed_restored": md.get("restored"),
    "mouths_unboxed": bx.get("mouths_unboxed"),
    "boxes": bx.get("boxes"),
    "chat_notices": int(notices or 0),
    "chat_questions": int(questions or 0),
    "chat_voir_buttons": int(voir or 0),
    "clarifications": clar,
}, ensure_ascii=False))
