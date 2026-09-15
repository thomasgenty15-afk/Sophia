#!/usr/bin/env python3
"""Lit un plan ÉCRIT (student_generated_meals) et rend, PAR PERSONNE ET PAR
CASE, les ingrédients FINAUX (après parseur), les contenants, et la protéine."""
import json, sys, urllib.request, os, re

COMPO = {}
def compo(refs):
    manque = [r for r in refs if r not in COMPO and r]
    if not manque: return
    svc = None
    for line in open("supabase/.env", encoding="utf-8"):
        if "SERVICE_ROLE" in line or "SUPABASE_SERVICE" in line:
            svc = line.split("=",1)[1].strip(); break
    url = ("http://127.0.0.1:54321/rest/v1/food_composition_refs?slug=in.(" +
           ",".join(manque) + ")&select=slug,food_group_ref,energy_kcal,protein_g")
    req = urllib.request.Request(url, headers={"apikey": svc, "authorization": "Bearer "+svc})
    for r in json.load(urllib.request.urlopen(req)):
        COMPO[r["slug"]] = r

plan = json.load(open(sys.argv[1], encoding="utf-8"))
if isinstance(plan, list): plan = plan[0]
noms = dict(p.split("=") for p in sys.argv[2].split(",")) if len(sys.argv) > 2 else {}
def nom(mid): return noms.get(mid, (mid or "TABLE")[:8])

dishes = plan["dishes"] or []
mp = plan.get("member_portions") or []
print(f"PLAN {plan['id'][:8]} · {plan['starts_on']} +{plan['duration_days']} j · "
      f"{len(dishes)} plat(s) · {len(mp)} ligne(s) member_portions")

refs = set()
for d in dishes:
    for g in d.get("ingredients", []) or []: refs.add(g.get("ref"))
for p in (plan.get("preparations") or []):
    for g in p.get("ingredients", []) or []: refs.add(g.get("ref"))
compo([r for r in refs if r])

print("\n── LES PLATS, ET À QUI ILS SONT ADRESSÉS ──────────────────────")
for i, d in enumerate(dishes):
    cible = d.get("member_id") or d.get("for_member_id")
    print(f"{i:2} {d.get('day'):4} {d.get('slot'):10} → {'TABLE' if not cible else nom(cible):8} "
          f"| {d.get('title')}")
    boxes = d.get("boxes") or []
    for b in boxes:
        qui = b.get("member_id") or b.get("for_member_id") or b.get("member_ids")
        items = b.get("items") or []
        tot = sum(int(x.get("grams") or 0) for x in items)
        prot = 0.0; kcal = 0.0
        detail = []
        for x in items:
            g = float(x.get("grams") or 0)
            r = x.get("ref") or x.get("food_ref")
            c = COMPO.get(r or "", {})
            prot += g * float(c.get("protein_g") or 0)/100
            kcal += g * float(c.get("energy_kcal") or 0)/100
            detail.append(f"{x.get('term')} {int(g)}g")
        etiq = qui if isinstance(qui, str) else json.dumps(qui, ensure_ascii=False)
        if isinstance(qui, str): etiq = nom(qui)
        print(f"      boîte → {etiq:10} {tot:5} g  ~{kcal:6.0f} kcal  ~{prot:5.1f} g prot"
              f"   [{', '.join(detail)}]")

print("\n── LES INGRÉDIENTS FINAUX DE CHAQUE PLAT (après parseur) ───────")
for i, d in enumerate(dishes):
    cible = d.get("member_id") or d.get("for_member_id")
    print(f"{i:2} {d.get('day')}/{d.get('slot')} {'TABLE' if not cible else nom(cible)} — {d.get('title')}")
    for g in d.get("ingredients", []) or []:
        c = COMPO.get(g.get("ref") or "", {})
        print(f"      {g.get('term'):24} {str(g.get('amount')):>6} {g.get('unit')}  "
              f"ref={g.get('ref') or '—'}  groupe={c.get('food_group_ref','?')}")
    for u in d.get("uses", []) or []:
        print(f"      ↳ tire de {u.get('preparation_id')} · {u.get('servings')} part(s)")

if plan.get("preparations"):
    print("\n── LES PRÉPARATIONS (la casserole commune) ────────────────────")
    for p in plan["preparations"]:
        tot = sum(float(g.get("amount") or 0) for g in p.get("ingredients", []) or [])
        print(f"  {p.get('id')} · {p.get('title')} · {p.get('servings_made')} part(s) · {tot:.0f} g crus")
        for g in p.get("ingredients", []) or []:
            c = COMPO.get(g.get("ref") or "", {})
            print(f"      {g.get('term'):24} {str(g.get('amount')):>6} {g.get('unit')}  "
                  f"groupe={c.get('food_group_ref','?')}")

if mp:
    print("\n── member_portions ────────────────────────────────────────────")
    for x in mp: print("   ", json.dumps(x, ensure_ascii=False)[:300])
