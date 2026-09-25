#!/usr/bin/env python3
"""Tableaux de contrôle d'un brouillon: qui mange quoi, fenêtres de frigo, matériel, courses.
   python3 checks.py <draft_id>"""
import json, subprocess, sys, collections, re, datetime

D = sys.argv[1]


def psql(sql):
    p = subprocess.run(["docker", "exec", "-i", "supabase_db_Sophia_2", "psql", "-U", "postgres", "-d", "postgres",
                        "-tA"], input=sql, capture_output=True, text=True)
    return p.stdout.strip()


d = json.loads(psql(f"select response::text from student_meal_drafts where id='{D}'"))
win = d["window"]
start = datetime.date.fromisoformat(win["starts_on"])
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
dates = [start + datetime.timedelta(days=i) for i in range(win["duration_days"])]
day_index = {DAYS[x.weekday()]: i for i, x in enumerate(dates)}
names = {m["member_id"]: m.get("display_name") for m in d.get("member_portions", [])}
slots_of = {m["member_id"]: m.get("eating_slots") or [] for m in d.get("member_portions", [])}
preps = {p["id"]: p for p in d.get("preparations", [])}
ORDER = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner", "before_bed"]


def eaters(x):
    ids = set()
    for b in x.get("boxes") or []:
        ids.update(b.get("member_ids") or [])
    if x.get("member_id"):
        ids.add(x["member_id"])
    if not ids:
        ids = {m for m, s in slots_of.items() if x["slot"] in s}
    return ids


print("=== ① GRILLE: qui a quoi à chaque moment (· = rien servi ; les moments déclarés sont en MAJUSCULES)")
grid = collections.defaultdict(list)
for x in d.get("dishes", []):
    for m in eaters(x):
        grid[(m, x["day"], x["slot"])].append(x.get("title"))
for m, nmv in names.items():
    print(f"\n  {nmv} — moments {slots_of[m]}")
    for dt in dates:
        day = DAYS[dt.weekday()]
        cells = []
        for s in ORDER:
            t = grid.get((m, day, s))
            decl = s in slots_of[m]
            if t or decl:
                cells.append(f"{s.upper() if decl else s}: {' + '.join(t) if t else '·'}")
        print(f"    {day} {dt}: " + " | ".join(cells))

print("\n=== ② CE QUE CHAQUE BOUCHE AVALE (termes et refs, préparations dépliées, à-côtés compris)")
eat = collections.defaultdict(lambda: collections.defaultdict(set))
for x in d.get("dishes", []):
    for b in x.get("boxes") or []:
        for it in b.get("items", []):
            pid = it.get("preparation_id")
            for m in b.get("member_ids") or []:
                if pid and pid in preps:
                    for i in preps[pid]["ingredients"]:
                        eat[m][f"{i.get('term')} [{i.get('ref')}]"].add(f"{x['day']}-{x['slot']}")
                else:
                    eat[m][f"{it.get('term')} [{it.get('ref')}]"].add(f"{x['day']}-{x['slot']}")
    if not x.get("boxes"):
        for m in eaters(x):
            for i in x.get("ingredients") or []:
                eat[m][f"{i.get('term')} [{i.get('ref')}]"].add(f"{x['day']}-{x['slot']}")
            for u in x.get("uses") or []:
                for i in (preps.get(u.get("preparation_id")) or {}).get("ingredients", []):
                    eat[m][f"{i.get('term')} [{i.get('ref')}]"].add(f"{x['day']}-{x['slot']}")
    for sc in x.get("side_courses") or []:
        eat[sc.get("member_id")][f"{sc.get('term')} [{sc.get('ref')}] (à-côté {sc.get('kind')})"].add(f"{x['day']}-{x['slot']}")
for m, foods in eat.items():
    print(f"\n  {names.get(m, m)}:")
    for f in sorted(foods):
        print(f"    {f}  ← {', '.join(sorted(foods[f]))}")

print("\n=== ③ FENÊTRES DE FRIGO (jour de cuisson → jour mangé)")
for x in d.get("dishes", []):
    for u in x.get("uses") or []:
        p = preps.get(u.get("preparation_id"))
        if not p:
            print(f"  !! {x['day']} {x['slot']} utilise une prep absente {u.get('preparation_id')}")
            continue
        c, e = day_index.get(p.get("cook_on")), day_index.get(x["day"])
        groups = sorted({i.get("group") for i in p["ingredients"] if i.get("group") in (
            "fatty_fish", "white_fish", "shellfish", "poultry", "red_meat", "eggs", "grains", "starches") or
            (i.get("ref") or "").startswith(("rice", "white_rice", "brown_rice"))})
        gap = None if c is None or e is None else e - c
        flag = "  <<< MANGÉ AVANT CUISSON" if gap is not None and gap < 0 else ("  <<< > J+2" if gap is not None and gap > 2 else "")
        print(f"  {p['id']:28} cuit {p.get('cook_on')} → mangé {x['day']} {x['slot']:7} J+{gap} kept={u.get('kept')} {groups}{flag}")

print("\n=== ④ MATÉRIEL NOMMÉ DANS LES TEXTES")
kw = {"four": r"\bfour\b|enfourn|°C", "micro-ondes": r"micro-?ondes", "congél": r"cong[eé]l", "friteuse à air": r"friteuse|air ?fryer",
      "autocuiseur": r"autocuiseur|cocotte-minute|pression", "mixeur": r"mix(eur|e)|blender", "plaques": r"po[eê]le|casserole|feu (doux|moyen|vif)|faitout|wok"}
texts = [("prep " + p["id"], p.get("method") or "") for p in preps.values()] + \
        [("session " + s["day"], s.get("run_through") or "") for s in d.get("cooking_sessions", [])] + \
        [(f"plat {x['day']} {x['slot']}", x.get("method") or "") for x in d.get("dishes", [])]
for k, rx in kw.items():
    hits = [w for w, t in texts if re.search(rx, t, re.I)]
    print(f"  {k:16} {len(hits):3}  {hits[:12]}")

print("\n=== ⑤ COURSES CONTRE PRÉPARATIONS (somme des ingrédients par ref)")
need = collections.defaultdict(float)
unit = {}
for p in preps.values():
    for i in p["ingredients"]:
        if i.get("amount") is not None:
            need[i.get("ref")] += float(i["amount"]); unit[i.get("ref")] = i.get("unit")
for x in d.get("dishes", []):
    for i in x.get("ingredients") or []:
        if i.get("amount") is not None:
            need[i.get("ref")] += float(i["amount"]); unit[i.get("ref")] = i.get("unit")
    for sc in x.get("side_courses") or []:
        if sc.get("grams") is not None:
            need[sc.get("ref")] += float(sc["grams"]); unit.setdefault(sc.get("ref"), "g")
bought = collections.defaultdict(float)
bunit = {}
for s in d.get("shopping_list", []):
    if s.get("amount") is not None:
        bought[s.get("ref")] += float(s["amount"]); bunit[s.get("ref")] = s.get("unit")
for r in sorted(set(need) | set(bought), key=str):
    n, b = need.get(r, 0), bought.get(r, 0)
    flag = "" if r in bought and r in need else ("  <<< ACHETÉ, JAMAIS UTILISÉ" if r not in need else "  <<< UTILISÉ, JAMAIS ACHETÉ")
    ratio = "" if not n or not b else f" ×{b / n:.2f}"
    print(f"  {str(r):34} besoin {n:8.0f} {unit.get(r, '')}  acheté {b:8.0f} {bunit.get(r, '')}{ratio}{flag}")

print("\n=== ⑥ ACHAT AVANT CUISSON ?")
first_buy = {}
for s in d.get("shopping_list", []):
    first_buy.setdefault(s.get("ref"), []).append(s.get("buy_on"))
for p in preps.values():
    c = p.get("cook_on")
    cdate = dates[day_index[c]] if c in day_index else None
    for i in p["ingredients"]:
        bs = first_buy.get(i.get("ref"), [])
        if cdate and bs and all(str(b) > str(cdate) for b in bs if b):
            print(f"  <<< {p['id']} cuit {cdate} mais {i.get('term')} acheté {bs}")
print("  (fin)")
