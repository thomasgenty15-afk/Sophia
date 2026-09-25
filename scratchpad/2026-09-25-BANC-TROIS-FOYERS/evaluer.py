#!/usr/bin/env python3
"""Les seuils de la phase 4 (plan du 2026-09-25), lus sur un brouillon.   python3 evaluer.py <draft_id>

Affiche ce que le moteur a écrit (validation, repas livrés, énergie servie par bouche et par jour)
et les contrôles de texte du plan: réchauffage au petit-déjeuner, micro-ondes, riz, hygiène, café.
Le recompte indépendant reste `nutri.py`."""
import collections, json, subprocess, sys

D = sys.argv[1]


def psql(sql):
    p = subprocess.run(["docker", "exec", "-i", "supabase_db_Sophia_2", "psql", "-U", "postgres", "-d", "postgres",
                        "-tA"], input=sql, capture_output=True, text=True)
    return p.stdout.strip()


row = psql(f"select json_build_object('status', status, 'attempt', attempt, 'error_code', error_code, "
           f"'secs', extract(epoch from (coalesce(finished_at, now()) - created_at))::int, "
           f"'payload', write_payload, 'response', response)::text from student_meal_drafts where id='{D}'")
if not row:
    sys.exit(f"brouillon {D} introuvable")
r = json.loads(row)
print(f"statut {r['status']} · tentative {r['attempt']} · erreur {r['error_code']} · {r['secs']} s")
p = r.get("payload") or {}
g = (p.get("generated_from") or {})
h = g.get("household") or {}
if not p:
    sys.exit("aucun plan écrit")
print("version:", g.get("prompt_version"))

v = g.get("validation") or {}
print("\n=== VALIDATION:", v.get("state"), "·", json.dumps(v.get("repair"), ensure_ascii=False))
causes = collections.Counter(x.get("cause") for x in (v.get("defects") or []))
print("   écarts par cause:", dict(causes))

md = h.get("meals_delivered") or {}
print(f"\n=== REPAS: attendus {md.get('expected')} · servis {md.get('fed')} · manquants {md.get('missing')} · "
      f"cases sans plat {md.get('cells_without_dish')} · {json.dumps(md.get('by_cause'))}")

names = {m.get("member_id"): m.get("display_name") for m in (r.get("response") or {}).get("member_portions", [])}
fs = h.get("final_served") or {}
print("\n=== ÉNERGIE SERVIE (moteur), % de la cible par jour")
rows = fs.get("per_mouth") or []
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
by_bucket = collections.defaultdict(list)
for x in rows:
    by_bucket[x.get("eater_bucket")].append(x)
for bucket, xs in sorted(by_bucket.items(), key=lambda t: str(t[0])):
    xs = sorted(xs, key=lambda x: (DAYS.index(x.get("day")) if x.get("day") in DAYS else 9, x.get("n") or 0))
    cells = " | ".join(f"{x.get('day')} {x.get('pct')}%" for x in xs)
    low = min((x.get("pct") or 0) for x in xs)
    print(f"   {bucket}: {cells}   min {low}%")

print("\n=== HYGIÈNE:", json.dumps(h.get("cross_contact_block")))
print("=== GESTE DU JOUR PAR MOMENT:", json.dumps(g.get("same_day_kinds"), ensure_ascii=False))
print("=== RIZ (écarts comptés):", causes.get("rice_eaten_too_late", 0))
print("=== COURSES:", [i for i in (g.get("issues") or []) if str(i).startswith("shopping_runs")])

dishes = p.get("dishes") or []
print("\n=== PETITS-DÉJEUNERS: réchauffage et contenu")
for x in dishes:
    if x.get("slot") != "breakfast":
        continue
    method = str(x.get("method") or "")
    hot = any(w in method.lower() for w in ("réchauff", "reheat", "micro-ondes", "microwave", "poêle", "casserole"))
    who = names.get(x.get("member_id"), "table") if x.get("member_id") else "table"
    kind = (x.get("same_day") or {}).get("kind")
    print(f"   {x.get('day')} [{who}] {x.get('title')} · same_day={kind} · chaud={hot}")

micro = sum(1 for x in dishes if "micro-ondes" in str(x.get("method") or "").lower()
            or "microwave" in str(x.get("method") or "").lower())
pan = sum(1 for x in dishes if "casserole couverte" in str(x.get("method") or "").lower())
print(f"\n=== MÉTHODES: {micro} citent le micro-ondes, {pan} la « casserole couverte »")

print("\n=== ŒUFS DANS LES BOÎTES")
for x in dishes:
    for b in x.get("boxes") or []:
        for it in b.get("items") or []:
            t = str(it.get("term") or "").lower()
            if "œuf" in t or "oeuf" in t or "egg" in t:
                print(f"   {x.get('day')} {x.get('slot')} {it.get('term')} {it.get('grams')} g")
