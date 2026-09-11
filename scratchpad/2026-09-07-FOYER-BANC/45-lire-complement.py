#!/usr/bin/env python3
"""Le complément d'un tir : verdicts, rabotage, entrée, journée. 2026-09-09.
   python3 45-lire-complement.py log-<cas>-<fixture>-<stamp>.txt"""
import json, sys
tags = []
for l in open(sys.argv[1]):
    i = l.find('{"tag"')
    if i < 0: continue
    try: tags.append(json.loads(l[i:].strip()))
    except Exception: pass
def one(suffix):
    return [t for t in tags if t.get("tag","").endswith(suffix)]
for t in one("dedicated_repair_parse") + one("dedicated_repair_append") + one("dedicated_repair_unsolvable") + one("complement_unsolvable") + one("dedicated_repair_refused") + one("dedicated_repair_partial"):
    print(t["tag"].split(".")[-1], json.dumps({k: v for k, v in t.items() if k not in ("tag", "user_id", "request_id")}, ensure_ascii=False)[:600])
for j in one("portion_sizing"):
    print("verdicts        ", json.dumps(j.get("verdicts")))
    print("clamped         ", json.dumps(j.get("clamped")), "· served_over_max", j.get("served_over_max"))
    r = j.get("repairs") or {}
    print("repairs         ", f"asked {r.get('asked')} · accepted {r.get('accepted')} · skipped_stuck {r.get('skipped_stuck')} · residual_stuck {r.get('residual_stuck')} · still_out {r.get('still_out')}")
    d = j.get("dedicated_repair") or {}
    print("dedicated       ", f"asked {d.get('asked')} · accepted {d.get('accepted')} · rejected {json.dumps(d.get('rejected'))} · missed_aim {d.get('missed_aim')} · shopping_added {d.get('shopping_added')} · still_out {d.get('still_out')}")
    print("complement      ", json.dumps(d.get("complement")))
    dk = j.get("day_kcal") or {}
    print("day_kcal        ", f"{dk.get('within_5pct')}/{dk.get('rows')} bouches-jours à ±5 %")
    for m in dk.get("per_mouth", []):
        print("   %-17s #%d  %-4s  %5d / %5d kcal  =  %5.1f %%" % (m["eater_bucket"], m["n"], m["day"], m["served"], m["target"], m["pct"]))
    for row in j.get("rows", []):
        print("   %-9s %-15s %-55s %5s kcal %5s g  ×%-6s %5s g  %s" % (row.get("slot"), row.get("eater_bucket"), (row.get("dish_title") or "")[:55], row.get("standard_kcal"), row.get("standard_cooked_g"), row.get("factor"), row.get("person_cooked_g"), row.get("verdict")))
