#!/usr/bin/env python3
"""Ce que les deux plans disent de la fenêtre — témoin contre cas."""
import json, sys, glob, os
from datetime import date, timedelta
TOK = ["mon","tue","wed","thu","fri","sat","sun"]

def dernier(prefixe):
    f = sorted(glob.glob(f"plan-{prefixe}-*.json"))
    return f[-1] if f else None

def lire(f):
    d = json.load(open(f))
    w = d.get("window") or {}
    s, n = w.get("starts_on"), w.get("duration_days")
    meal = d.get("meal") or d
    dishes = meal.get("dishes") or []
    par_jour = {}
    for x in dishes:
        par_jour[x.get("day")] = par_jour.get(x.get("day"), 0) + 1
    fin = None
    if s and n:
        fin = (date.fromisoformat(s) + timedelta(days=n-1)).isoformat()
    return {
        "fichier": os.path.basename(f),
        "starts_on": s, "duration_days": n, "dernier_jour_servi": fin,
        "timing.kind": (d.get("timing") or {}).get("kind"),
        "timing.reason": (d.get("timing") or {}).get("reason"),
        "issues fenêtre": [i for i in (d.get("issues") or [])
                           if "spent_first_day" in str(i) or "cook_the_day" in str(i)],
        "plats": len(dishes), "plats/jour": par_jour,
    }

for nom, prefixe in (("① TÉMOIN", "WINDOWctl"), ("② CAS", "WINDOWcase")):
    f = dernier(prefixe)
    print("=" * 62)
    print(nom, "—", f or "AUCUN FICHIER")
    if not f: continue
    try:
        for k, v in lire(f).items():
            print(f"  {k:<22} {v}")
    except Exception as e:
        print("  illisible:", e, "·", open(f).read()[:200])
