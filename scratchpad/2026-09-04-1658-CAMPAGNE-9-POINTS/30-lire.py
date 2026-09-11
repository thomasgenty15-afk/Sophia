#!/usr/bin/env python3
"""
CE QUE LE PLAN DIT — lecture d'un tir de la campagne 9 points.

⛔ ON LIT LES COMPTEURS DU MOTEUR, on ne les recalcule pas. `generated_from.household`
(ou `household` sur un brouillon) porte les ceintures, l'invariant et les boîtes:
les recompter avec un instrument écrit pour le lot ne prouverait rien.

La SEULE chose recalculée est la violation VUE DEPUIS L'ASSIETTE — une bouche
nommée sur une boîte dont les items portent ce qu'elle évite. Elle ne découle
d'aucun compteur: la ceinture a pu retirer la bouche, et le dernier recours l'a
peut-être remise.
"""
import json, sys, re
from collections import defaultdict

path = sys.argv[1]
avoid = {}          # member_id -> [termes évités]
for a in sys.argv[2:]:
    mid, _, terms = a.partition("=")
    avoid[mid] = [t.strip().lower() for t in terms.split(",") if t.strip()]

d = json.load(open(path, encoding="utf-8"))
if not d.get("ok"):
    print(f"⛔ REFUS: {json.dumps({k: v for k, v in d.items() if k != 'meal'}, ensure_ascii=False)[:600]}")
    sys.exit(0)

hh = d.get("household") or (d.get("meal") or {}).get("generated_from", {}).get("household") or {}
dishes = d.get("dishes") or (d.get("meal") or {}).get("dishes") or []
preps = d.get("preparations") or (d.get("meal") or {}).get("preparations") or []
sessions = d.get("cooking_sessions") or (d.get("meal") or {}).get("cooking_sessions") or []
shop = d.get("shopping_list") or (d.get("meal") or {}).get("shopping_list") or []
portions = d.get("member_portions") or []

print("─── FENÊTRE ET TEMPS ───────────────────────────────────────────")
print("  window        ", json.dumps(d.get("window"), ensure_ascii=False))
print("  timing        ", json.dumps(d.get("timing"), ensure_ascii=False))
print("  suggested     ", json.dumps(d.get("suggested_window"), ensure_ascii=False))
days = sorted({x.get("day") for x in dishes if x.get("day")})
byday = defaultdict(list)
for x in dishes:
    byday[x.get("day")].append(x.get("slot"))
print("  jours servis  ", " · ".join(f"{k}:{','.join(sorted(set(v)))}" for k, v in
      sorted(byday.items(), key=lambda kv: days.index(kv[0]) if kv[0] in days else 99)))

print("\n─── CE QUE LA PERSONNE LIT ─────────────────────────────────────")
for key in ("rationale", "request_report", "explanation"):
    blk = d.get(key)
    if blk is None:
        print(f"  {key:15} ⛔ ABSENT DE LA RÉPONSE")
        continue
    lines = blk.get("lines") if isinstance(blk, dict) else blk
    ref = blk.get("refusal") if isinstance(blk, dict) else None
    print(f"  {key:15} {len(lines or [])} ligne(s){' · refus ' + str(ref) if ref else ''}")
    for l in (lines or []):
        print(f"      · {l}")

print("\n─── CUISINE ET COURSES ─────────────────────────────────────────")
print(f"  sessions      {len(sessions)} → " +
      " · ".join(f"{s.get('day')} {s.get('total_minutes')}min ({len(s.get('preparation_ids') or [])} prep)" for s in sessions))
waves = sorted({l.get("buy_on") for l in shop if l.get("buy_on")})
print(f"  courses       {len(shop)} lignes · {len(waves)} vague(s): {', '.join(waves) or '⛔ AUCUNE DATE'}")
undated = [l.get("term") for l in shop if not l.get("buy_on")]
if undated:
    print(f"     ⛔ {len(undated)} ligne(s) sans date: {', '.join(undated[:6])}")
frozen_flags = [l for l in shop if any(k in l for k in ("freeze_on_purchase", "to_freeze", "freeze"))]
print(f"  « à congeler » sur une ligne de courses: {len(frozen_flags)} "
      f"{'⛔ AUCUN CHAMP' if not frozen_flags else ''}")

kept = defaultdict(int)
for x in dishes:
    for u in (x.get("uses") or []):
        kept[u.get("kept") or "(absent)"] += 1
print(f"  uses[].kept   {dict(kept) or '(aucun lot)'}")

print("\n─── BARQUETTES ─────────────────────────────────────────────────")
b = hh.get("boxes") or {}
if b:
    print("  compteurs     " + json.dumps(b, ensure_ascii=False))
nb = sum(len(x.get("boxes") or []) for x in dishes)
solo_like = sum(1 for x in dishes for bx in (x.get("boxes") or []) if not (bx.get("member_ids") or []))
print(f"  boîtes rendues {nb} · dont sans nom {solo_like}")
frozen_boxes = 0
for x in dishes:
    fz = {u.get("preparation_id") for u in (x.get("uses") or []) if u.get("kept") == "freezer"}
    for bx in (x.get("boxes") or []):
        if any((it.get("preparation_id") in fz) for it in (bx.get("items") or [])):
            frozen_boxes += 1
print(f"  boîtes dont un item vient d'un lot CONGELÉ: {frozen_boxes}"
      f"{'  ← rien ne le marque dans le Boxing (point 4)' if frozen_boxes else ''}")

print("\n─── LES CEINTURES ET L'INVARIANT ───────────────────────────────")
for k in ("regime_belt", "exclusion_belt", "meals_delivered", "box_sizing", "work_lunch", "dish_owners"):
    if k in hh:
        v = hh[k]
        if k == "meals_delivered":
            v = {kk: vv for kk, vv in v.items() if kk != "rows"}
        print(f"  {k:16} {json.dumps(v, ensure_ascii=False)[:300]}")

# ── LA VIOLATION VUE DEPUIS L'ASSIETTE ──────────────────────────────────
if avoid:
    print("\n─── DEPUIS L'ASSIETTE (recalculé, seul calcul de ce lecteur) ───")
    prep_txt = {p.get("id"): (p.get("title", "") + " " + " ".join(
        str(i.get("term", "")) for i in (p.get("ingredients") or []))).lower() for p in preps}
    for mid, terms in avoid.items():
        hits = []
        for x in dishes:
            for bx in (x.get("boxes") or []):
                if mid not in (bx.get("member_ids") or []):
                    continue
                surface = " ".join(str(it.get("term", "")).lower() for it in (bx.get("items") or []))
                surface += " " + " ".join(prep_txt.get(it.get("preparation_id"), "")
                                          for it in (bx.get("items") or []))
                for t in terms:
                    if re.search(r"\b" + re.escape(t[:-1] if t.endswith("s") else t), surface):
                        hits.append(f"{x.get('day')}/{x.get('slot')} « {x.get('title')} » ({t})")
        print(f"  {mid[:8]}… évite {terms}: {len(hits)} violation(s)")
        for h in hits[:6]:
            print(f"      ⛔ {h}")

print("\n─── ISSUES ─────────────────────────────────────────────────────")
for i in (d.get("issues") or []):
    print("  ·", i)
