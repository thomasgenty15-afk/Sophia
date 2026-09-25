#!/usr/bin/env python3
"""Met un brouillon à plat, lisible de bout en bout.   python3 render.py <draft_id> > plan.txt"""
import json, subprocess, sys, collections

D = sys.argv[1]


def psql(sql):
    p = subprocess.run(["docker", "exec", "-i", "supabase_db_Sophia_2", "psql", "-U", "postgres", "-d", "postgres",
                        "-tA"], input=sql, capture_output=True, text=True)
    return p.stdout.strip()


row = psql(f"select response::text from student_meal_drafts where id='{D}'")
d = json.loads(row)
meta = psql(f"select status||' | '||coalesce(error_code,'')||' | '||wall_ms||' ms | '||request_body::text from student_meal_drafts where id='{D}'")
print("BROUILLON", D, "|", meta)
J = lambda o: json.dumps(o, ensure_ascii=False)
names = {m["member_id"]: m.get("display_name") or m["member_id"][:6] for m in d.get("member_portions", [])}
nm = lambda mid: names.get(mid, (mid or "-")[:6])
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

print("\n=== FENÊTRE", J(d.get("window")), "TIMING", J(d.get("timing")), "SUGGÉRÉE", J(d.get("suggested_window")))
print("\n=== RATIONALE (texte montré)")
for l in (d.get("rationale") or {}).get("lines", []):
    print("  •", l)
print("=== EXPLANATION", J(d.get("explanation")))
print("=== REQUEST_REPORT", J(d.get("request_report")))
print("=== VALIDATION", J(d.get("validation")))
print("=== ISSUES")
for i in d.get("issues", []):
    print("  -", i)

print("\n=== BOUCHES")
for m in d.get("member_portions", []):
    print(" ", nm(m["member_id"]), "| moments", m.get("eating_slots"), "| note", m.get("portion_note"))
    for s in m.get("preparation_shares", []):
        print("     part", J(s))

preps = {p["id"]: p for p in d.get("preparations", [])}
print("\n=== SESSIONS")
for s in d.get("cooking_sessions", []):
    print(f"\n## {s['day']}  total {s.get('total_minutes')} min  preps {s.get('preparation_ids')}")
    print("   DÉROULÉ:", s.get("run_through"))
    for pid in s.get("preparation_ids", []):
        p = preps.get(pid)
        if not p:
            print("   !! prep absente", pid)
            continue
        print(f"   · {pid} « {p.get('title')} » cuit {p.get('cook_on')}")
        print("       méthode:", p.get("method"))
        for i in p.get("ingredients", []):
            print(f"       - {i.get('term')} [{i.get('ref')}/{i.get('group')}] {i.get('amount')} {i.get('unit')} ({i.get('state')}, part {i.get('part')})")
        extra = {k: v for k, v in p.items() if k not in ("id", "title", "method", "cook_on", "ingredients", "components")}
        if extra:
            print("       autres:", J(extra)[:600])
orph = [pid for pid in preps if not any(pid in s.get("preparation_ids", []) for s in d.get("cooking_sessions", []))]
print("\n   préparations hors session:", orph)

print("\n=== REPAS PAR JOUR")
dishes = d.get("dishes", [])
order = {k: i for i, k in enumerate(["breakfast", "snack_am", "lunch", "snack_pm", "dinner", "before_bed"])}
for day in DAYS:
    ds = sorted([x for x in dishes if x.get("day") == day], key=lambda x: order.get(x.get("slot"), 9))
    if not ds:
        continue
    print(f"\n######## {day.upper()}")
    for x in ds:
        who = nm(x.get("member_id")) if x.get("member_id") else "foyer"
        print(f"\n  [{x['slot']}] « {x.get('title')} » (nom: {x.get('name')}) pour {who} | principal {J(x.get('main_food'))}")
        print("     pourquoi:", x.get("why"))
        print("     méthode:", x.get("method"), "| same_day", J(x.get("same_day")))
        for u in x.get("uses", []) or []:
            print(f"     uses: {u.get('preparation_id')} ({(preps.get(u.get('preparation_id')) or {}).get('title')}) kept={u.get('kept')} servings={u.get('servings')}")
        for i in x.get("ingredients", []) or []:
            print(f"     frais: {i.get('term')} [{i.get('ref')}/{i.get('group')}] {i.get('amount')} {i.get('unit')} part={i.get('part')}")
        for b in x.get("boxes", []) or []:
            items = "; ".join(f"{it.get('term')} {it.get('grams')}g{'' if it.get('ml') is None else ' ' + str(it.get('ml')) + 'ml'}{' ←' + it['preparation_id'] if it.get('preparation_id') else ' (frais)'}" for it in b.get("items", []))
            print(f"     boîte {b.get('id')} → {', '.join(nm(m) for m in b.get('member_ids', []))}: {items}")
        for sc in x.get("side_courses", []) or []:
            print(f"     à côté: {nm(sc.get('member_id'))} {sc.get('kind')} {sc.get('term')} [{sc.get('ref')}] {sc.get('grams')} g units={sc.get('unit_count')} prep={sc.get('preparation_id')}")
        other = {k: v for k, v in x.items() if k not in ("day", "why", "name", "slot", "uses", "boxes", "title", "method", "same_day", "main_food", "member_id", "components", "ingredients", "side_courses", "honours_belief_keys", "complements_shared")}
        if other:
            print("     autres:", J(other)[:400])

print("\n=== COURSES")
by = collections.defaultdict(list)
for s in d.get("shopping_list", []):
    by[s.get("buy_on")].append(s)
for k in sorted(by, key=str):
    print(f"  -- achat {k}")
    for s in by[k]:
        flag = (" CONGELER" if s.get("freeze_on_purchase") else "") + ("" if s.get("purchasable", True) else " NON-ACHETABLE")
        print(f"     {s.get('term')} [{s.get('ref')}/{s.get('food_group')}] {s.get('quantity')} rayon={s.get('aisle')} {s.get('state')}{flag}")

h = d.get("household") or {}
print("\n=== ÉNERGIE SERVIE")
fs = h.get("final_served") or {}
for r in fs.get("per_mouth", []):
    print("  ", J(r))
print("\n=== CONTRÔLES DU FOYER")
for k in ("kitchen", "regime_belt", "exclusion_belt", "cross_contact_block", "meals_delivered", "retained_honoured",
          "side_courses", "work_lunch", "protein_brief", "portion_sizing", "box_sizing", "plate_bounds", "plate_load",
          "hard_ceiling_cells", "boxes", "traditions", "preference_split", "shared_table_relax", "swap", "dish_owners",
          "vague_portions", "unquantified_dish_ingredients", "portion_boundary", "engine_box_belt"):
    print(f"  {k}: {J(h.get(k))[:1500]}")
print("\n=== AUTRES", J({k: d.get(k) for k in ("food_groups", "names", "member_deltas", "merged_members", "retained_honoured")})[:1500])
