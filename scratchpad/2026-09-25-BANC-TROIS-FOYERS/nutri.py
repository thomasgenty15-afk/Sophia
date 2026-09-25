#!/usr/bin/env python3
"""Recompte indépendant: kcal et protéines par personne et par jour, coût des courses.
   Une préparation est répartie au prorata des grammes tirés dans les boîtes (l'eau ne compte donc pas).
   python3 nutri.py <draft_id>"""
import json, subprocess, sys, collections

D = sys.argv[1]


def psql(sql):
    p = subprocess.run(["docker", "exec", "-i", "supabase_db_Sophia_2", "psql", "-U", "postgres", "-d", "postgres",
                        "-tA"], input=sql, capture_output=True, text=True)
    return p.stdout.strip()


d = json.loads(psql(f"select response::text from student_meal_drafts where id='{D}'"))
refs = set()
for p in d.get("preparations", []):
    refs |= {i.get("ref") for i in p["ingredients"]}
for x in d.get("dishes", []):
    refs |= {i.get("ref") for i in x.get("ingredients") or []}
    refs |= {sc.get("ref") for sc in x.get("side_courses") or []}
    for b in x.get("boxes") or []:
        refs |= {it.get("ref") for it in b.get("items", [])}
refs |= {s.get("ref") for s in d.get("shopping_list", [])}
refs.discard(None)
rows = psql("select slug||'|'||coalesce(energy_kcal,0)||'|'||coalesce(protein_g,0)||'|'||coalesce(unit_grams::text,'')||'|'||coalesce(grams_per_ml::text,'')||'|'||coalesce(price_eur_per_100g_fr::text,'') from food_composition_refs where slug in ("
            + ",".join("'" + r.replace("'", "''") + "'" for r in refs) + ")")
F = {}
for r in rows.splitlines():
    s, k, pr, ug, gml, eur = r.split("|")
    F[s] = dict(kcal=float(k), prot=float(pr), ug=float(ug) if ug else None, gml=float(gml) if gml else None,
                eur=float(eur) if eur else None)


def grams(ref, amount, unit):
    if amount is None:
        return 0.0
    a = float(amount)
    f = F.get(ref) or {}
    if unit in ("g", None):
        return a
    if unit == "ml":
        return a * (f.get("gml") or 1.0)
    if unit in ("unit", "piece", "pièce"):
        return a * (f.get("ug") or 0.0)
    if unit == "kg":
        return a * 1000
    return a


def nut(ref, g):
    f = F.get(ref)
    if not f:
        return 0.0, 0.0, False
    return g * f["kcal"] / 100, g * f["prot"] / 100, True


preps = {p["id"]: p for p in d.get("preparations", [])}
ptot = {}
for pid, p in preps.items():
    k = pr = 0.0
    miss = []
    for i in p["ingredients"]:
        if i.get("ref") == "water":
            continue
        g = grams(i.get("ref"), i.get("amount"), i.get("unit"))
        a, b, ok = nut(i.get("ref"), g)
        k += a; pr += b
        if not ok:
            miss.append(i.get("term"))
    ptot[pid] = (k, pr, miss)
drawn = collections.defaultdict(float)
for x in d.get("dishes", []):
    for b in x.get("boxes") or []:
        for it in b.get("items", []):
            if it.get("preparation_id"):
                drawn[it["preparation_id"]] += float(it.get("grams") or 0) * max(1, len(b.get("member_ids") or []))

names = {m["member_id"]: m.get("display_name") for m in d.get("member_portions", [])}
day_k = collections.defaultdict(float)
day_p = collections.defaultdict(float)
slot_k = collections.defaultdict(float)
unknown = set()
for x in d.get("dishes", []):
    for b in x.get("boxes") or []:
        for m in b.get("member_ids") or []:
            for it in b.get("items", []):
                pid = it.get("preparation_id")
                if pid:
                    k, pr, miss = ptot.get(pid, (0, 0, []))
                    share = float(it.get("grams") or 0) / drawn[pid] if drawn[pid] else 0
                    a, c = k * share, pr * share
                    unknown |= set(miss)
                else:
                    g = float(it.get("grams") or 0) or float(it.get("ml") or 0)
                    a, c, ok = nut(it.get("ref"), g)
                    if not ok:
                        unknown.add(it.get("term"))
                day_k[(m, x["day"])] += a; day_p[(m, x["day"])] += c
                slot_k[(m, x["day"], x["slot"])] += a
    for sc in x.get("side_courses") or []:
        a, c, ok = nut(sc.get("ref"), float(sc.get("grams") or 0))
        if not ok:
            unknown.add(sc.get("term"))
        m = sc.get("member_id")
        day_k[(m, x["day"])] += a; day_p[(m, x["day"])] += c
        slot_k[(m, x["day"], x["slot"] + "+à-côtés")] += a

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
print("=== RECOMPTE INDÉPENDANT (kcal / protéines par jour, boîtes + à-côtés)")
for m, n in names.items():
    ds = sorted({dd for (mm, dd) in day_k if mm == m}, key=DAYS.index)
    print(f"  {n}: " + " | ".join(f"{dd} {day_k[(m, dd)]:.0f} kcal {day_p[(m, dd)]:.0f} g P" for dd in ds))
print("  termes sans valeur au référentiel:", sorted(t for t in unknown if t))
print("\n=== PAR MOMENT (kcal)")
for m, n in names.items():
    for dd in DAYS:
        cells = [(s, v) for (mm, d2, s), v in slot_k.items() if mm == m and d2 == dd]
        if cells:
            print(f"  {n} {dd}: " + ", ".join(f"{s} {v:.0f}" for s, v in cells))

print("\n=== COÛT ESTIMÉ DES COURSES (prix référentiel FR, au gramme, sans arrondi au paquet)")
tot = 0.0
nop = []
lines = []
for s in d.get("shopping_list", []):
    ref = s.get("ref")
    f = F.get(ref) or {}
    g = grams(ref, s.get("amount"), s.get("unit"))
    if s.get("unit") in ("unit",) and not f.get("ug"):
        nop.append(f"{s.get('term')} ({s.get('quantity')}, poids unitaire inconnu)")
        continue
    if f.get("eur") is None:
        nop.append(s.get("term"))
        continue
    c = g * f["eur"] / 100
    tot += c
    lines.append((c, s.get("term"), s.get("quantity")))
for c, t, q in sorted(lines, reverse=True)[:12]:
    print(f"   {c:6.2f} €  {t} ({q})")
print(f"  TOTAL ≈ {tot:.2f} € ; sans prix: {nop}")
