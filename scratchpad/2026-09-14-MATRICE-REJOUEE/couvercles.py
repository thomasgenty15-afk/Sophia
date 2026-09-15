#!/usr/bin/env python3
"""PREUVE INDEPENDANTE: pour chaque bouche et chaque case, combien de plats la
nourrissent. Lu sur la LIGNE ECRITE, pas sur un compteur du handler."""
import json, sys, urllib.request, collections
svc=None
for line in open("supabase/.env", encoding="utf-8"):
    if line.startswith("SUPABASE_SERVICE_ROLE_KEY=") or line.startswith("SERVICE_ROLE_KEY="):
        svc=line.split("=",1)[1].strip(); break
if svc is None:
    for line in open("supabase/.env", encoding="utf-8"):
        if "SERVICE_ROLE" in line:
            svc=line.split("=",1)[1].strip(); break
plan_id=sys.argv[1]
url=f"http://127.0.0.1:54321/rest/v1/student_generated_meals?id=eq.{plan_id}&select=id,starts_on,duration_days,dishes,generated_from"
req=urllib.request.Request(url, headers={"apikey":svc,"authorization":"Bearer "+svc})
plan=json.load(urllib.request.urlopen(req))[0]
dishes=plan["dishes"] or []
gf=plan.get("generated_from") or {}
hh=gf.get("household") or {}
print("plan", plan["id"][:8], plan["starts_on"], "+%d j"%plan["duration_days"], len(dishes),"plats")
print("dish_owners :", hh.get("dish_owners"))
md=(gf.get("box_counts") or {}).get("meals_delivered") or (hh.get("box_counts") or {}).get("meals_delivered")
# les bouches: depuis les couvercles
mouths=set()
for d in dishes:
    for b in (d.get("boxes") or []):
        for m in (b.get("member_ids") or b.get("memberIds") or []): mouths.add(m)
    if d.get("member_id"): mouths.add(d["member_id"])
cells=sorted({(d.get("day"),d.get("slot")) for d in dishes})
print("bouches:",len(mouths)," cases:",len(cells))
print("\n  bouche            case              plats de table   couvercles a son nom   plat DEDIE")
bad=0
tally=collections.Counter()
for m in sorted(mouths):
    for (day,slot) in cells:
        here=[d for d in dishes if d.get("day")==day and d.get("slot")==slot]
        table=[d for d in here if not d.get("member_id")]
        mine=[d for d in here if d.get("member_id")==m]
        lids=sum(1 for d in table for b in (d.get("boxes") or [])
                 if m in (b.get("member_ids") or b.get("memberIds") or []))
        fed = 1 if mine else lids
        tally[fed]+=1
        flag="" if fed==1 else "   <<<< %d"%fed
        if fed!=1: bad+=1
        print(f"  {m[:8]}  {day}/{slot:10}  table={len(table)}  couvercles={lids}  dedie={len(mine)}{flag}")
print("\nREPARTITION nourri N fois :", dict(tally))
print("CASES OU UNE BOUCHE N'EST PAS NOURRIE EXACTEMENT UNE FOIS :", bad)
