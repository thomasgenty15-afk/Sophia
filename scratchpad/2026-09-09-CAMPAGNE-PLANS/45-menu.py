#!/usr/bin/env python3
"""Le menu tel qu'un utilisateur le lit — plat par plat, avec les grammages."""
import json, sys, pathlib, subprocess
HERE = pathlib.Path(__file__).parent
name = sys.argv[1]
lane = json.loads((HERE / "cas.json").read_text())[name]["lane"]
plan = json.loads(sorted(HERE.glob(f"plan-{name}-*.json"))[-1].read_text())
cmd = (["deno", "run", "--allow-read", str(HERE / "31-energie-foyer.ts"), str(HERE / "ref"),
        str(sorted(HERE.glob(f"plan-{name}-*.json"))[-1]), str(HERE / f"roster-{name}.json")]
       if lane == "household" else
       ["deno", "run", "--allow-read", str(HERE / "30-energie.ts"), str(HERE / "ref"),
        str(sorted(HERE.glob(f"plan-{name}-*.json"))[-1]), str(HERE / f"body-{name}.json")])
e = json.loads(subprocess.run(cmd, capture_output=True, text=True, cwd=HERE).stdout)
kcal = {}
for d in e.get("dish_kcal", []):
    kcal[(d["day"], d["slot"], d["name"])] = d["kcal"]
preps = {p["id"]: p for p in plan.get("preparations", [])}
for d in plan["dishes"]:
    k = kcal.get((d.get("day"), d.get("slot"), d.get("name")))
    print(f"\n{d.get('day')} · {d.get('slot'):9s} · {d.get('title') or d.get('name')}"
          + (f"  [{k} kcal]" if k is not None else ""))
    for i in d.get("ingredients", []):
        print(f"      {i.get('quantity')}")
    for u in d.get("uses", []):
        p = preps.get(u["preparation_id"], {})
        print(f"      ⟵ {p.get('title')} × {u.get('servings')} portion(s) · gardé au {u.get('kept')}"
              f" · cuisiné {p.get('cook_on')}")
    for b in d.get("boxes", []):
        who = ", ".join(b.get("member_ids", []))
        items = ", ".join(f"{it.get('term','')} {it.get('grams')} g" for it in b.get("items", []))
        print(f"      ▣ boîte [{who[:40]}] {items}")
    if d.get("portion_note"):
        print(f"      ✎ {d['portion_note']}")
print("\n── PRÉPARATIONS")
for p in plan.get("preparations", []):
    print(f"  {p['id']} · {p['title']} · {p.get('servings_made')} portions · cuisson {p.get('cook_on')}")
    for i in p.get("ingredients", []):
        print(f"      {i.get('quantity')}")
mp = plan.get("member_portions")
if mp:
    print("\n── PARTS PAR BOUCHE")
    print(json.dumps(mp, indent=1)[:3000])
