#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LE TABLEAU CROISÉ — CE QUI EST SYSTÉMATIQUE vs CE QUI EST UN TIRAGE.

Une ligne par (run, bouche). Jamais une moyenne. Un défaut vu sur un seul run
est un tirage; vu sur tous, c'est le produit.

  ./tableau.py plan-1 plan-2 ...
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyse import (load, served_model, names, box_index, plates, away_map,
                     all_text, scan, OVEN_WORDS, FREEZER_WORDS, SIZE_WORDS,
                     CAL_WORDS, BODY_WORDS)

rows = []
seen_plan_ids = {}
print("run        | plan_id  | modèle                 | shape     | shared_mixed | dish_owners a/d/att | regime_belt m/c/k/ref | four | mots de taille | kcal")
print("-" * 150)
for run in sys.argv[1:]:
    d = load(run)
    plan, h = d["plan"], ((d["written"] or {}).get("household") or {})
    if not plan or not plan.get("dishes"):
        print(f"{run:10s} | ⛔ AUCUN PLAN (HTTP {d['http']})")
        continue
    pid = str(plan.get("plan_id"))
    if pid in seen_plan_ids:
        print(f"{run:10s} | ⛔ MÊME plan_id que {seen_plan_ids[pid]} — run non abouti, PAS une mesure")
        continue
    seen_plan_ids[pid] = run
    bs, rb, do = h.get("box_sizing") or {}, h.get("regime_belt") or {}, h.get("dish_owners") or {}
    ck = h.get("cooking") or {}
    kit = (h.get("kitchen") or {}).get("missing") or []
    oven = size = cal = 0
    for where, txt in all_text(plan):
        if "oven" in kit:
            oven += len(scan(txt, OVEN_WORDS))
        if not where.startswith("shopping_list"):
            size += len(scan(txt, SIZE_WORDS))
            cal += len(scan(txt, CAL_WORDS))
    print(f"{run:10s} | {pid[:8]} | {served_model(d['model_lines']):22s} | {str(ck.get('served')):9s} | "
          f"{str(bs.get('shared_mixed')):>12s} | "
          f"{do.get('asked')}/{do.get('declared')}/{do.get('attributed'):<14} | "
          f"{rb.get('mouths')}/{rb.get('checked')}/{rb.get('kept')}/{rb.get('refused'):<16} | "
          f"{oven:>4d} | {size:>14d} | {cal:>4d}")
    rows.append((run, d, plan, h))

print("\n\n== L'ASSIETTE, PAR BOUCHE ET PAR RUN ==")
print("run        | bouche | repas | combinaisons distinctes | grammes vus")
print("-" * 130)
for run, d, plan, h in rows:
    roster = names(d["inputs"])
    bidx = box_index(plan)
    away = away_map(d["inputs"])
    pl, slots = plates(plan, roster, away)
    for mid, nm in roster.items():
        preps, grams, meals, out = [], [], 0, 0
        for (day, slot) in slots:
            ds = pl.get((mid, day, slot))
            if ds == "OUT":
                out += 1
                continue
            for x in (ds or []):
                meals += 1
                got = tuple(sorted(bidx[u["box_id"]][0] for u in (x.get("uses") or [])
                                   if u.get("box_id") in bidx and mid in bidx[u["box_id"]][3]))
                preps.append(got)
                for u in (x.get("uses") or []):
                    b = bidx.get(u.get("box_id"))
                    if b and mid in b[3]:
                        grams.append(b[2])
        uniq = len({p for p in preps if p})
        print(f"{run:10s} | {nm:6s} | {meals:2d} (+{out} dehors) | {uniq:^23d} | {sorted(set(grams))}")

print("\n\n== LES BOÎTES PARTAGÉES NON DIMENSIONNÉES ==")
for run, d, plan, h in rows:
    roster = names(d["inputs"])
    for p in plan.get("preparations") or []:
        for b in p.get("boxes") or []:
            if len(b.get("member_ids") or []) > 1:
                who = ", ".join(roster.get(m, m[:8]) for m in b["member_ids"])
                print(f"{run:10s} | {p.get('id'):16s} | {b.get('grams')} g | {who}")


print("\n\n== LA PHRASE PROMET-ELLE UN PLAT QUE LE PLAN NE SERT PAS ? ==")
# `attachSizedQuantities` (household_portions.ts:3877-3918) recolle un gramme
# pour TOUTE boîte portant le nom de la bouche, sans jamais consulter `dishes[]`.
# Un plat jeté par le plafond laisse donc sa boîte — et son gramme dans la
# phrase lue à voix haute.
for run, d, plan, h in rows:
    roster = names(d["inputs"])
    bidx = box_index(plan)
    away = away_map(d["inputs"])
    pl, slots = plates(plan, roster, away)
    served = {m: set() for m in roster}
    for (mid, day, slot), ds in pl.items():
        if ds == "OUT":
            continue
        for x in (ds or []):
            for u in x.get("uses") or []:
                b = bidx.get(u.get("box_id"))
                if b:
                    served[mid].add(b[0])
    named = {m: set() for m in roster}
    for p in plan.get("preparations") or []:
        for b in p.get("boxes") or []:
            for m in b.get("member_ids") or []:
                if m in named:
                    named[m].add(p.get("id"))
    hit = False
    for m, nm in roster.items():
        ghost = named[m] - served[m]
        if ghost:
            hit = True
            print(f"{run:10s} | ⛔ {nm:7s} | la phrase nomme {sorted(ghost)} — aucun plat ne les lui sert")
    if not hit:
        print(f"{run:10s} | ✅ aucune promesse fantôme")
