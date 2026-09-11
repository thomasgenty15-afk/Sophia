#!/usr/bin/env python3
"""Le tableau de la campagne — une ligne par cas."""
import json, subprocess, pathlib, statistics, sys
HERE = pathlib.Path(__file__).parent
CAS = json.loads((HERE / "cas.json").read_text())
def latest(pat):
    xs = sorted(HERE.glob(pat)); return xs[-1] if xs else None
def energie(name, lane):
    plan = latest(f"plan-{name}-*.json")
    if plan is None: return None
    cmd = ["deno","run","--allow-read",str(HERE/("31-energie-foyer.ts" if lane=="household" else "30-energie.ts")),
           str(HERE/"ref"), str(plan), str(HERE/(f"roster-{name}.json" if lane=="household" else f"body-{name}.json"))]
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
    return json.loads(p.stdout) if p.returncode == 0 else None
out = []
for name, cas in CAS.items():
    lane = cas["lane"]
    plan_f = latest(f"plan-{name}-*.json"); log_f = latest(f"log-{name}-*.json")
    if plan_f is None: continue
    plan = json.loads(plan_f.read_text())
    if not plan.get("dishes"): continue
    logs = json.loads(log_f.read_text()) if log_f else []
    tag = {}
    for r in logs: tag.setdefault(r["tag"], []).append(r)
    e = energie(name, lane)
    row = {"cas": name, "titre": cas["titre"], "lane": lane,
           "fenetre": f"{plan['window']['starts_on']}×{plan['window']['duration_days']}j"}
    if lane == "solo":
        env = (tag.get("keel.meal.envelope") or [{}])[-1]
        sc = (tag.get("keel.meal.portion_scaling") or [{}])[-1]
        plein = [d["kcal"] for d in e["days"] if d["complete"] and d["kcal"] is not None]
        row |= {"bande": f"{env.get('energy_low')}–{env.get('energy_high')}",
                "jours_complets": f"{len(plein)}/{len(e['days'])}",
                "servi": "·".join(str(k) for k in plein),
                "dans_bande": sum(1 for k in plein if env.get('energy_low') and env['energy_low'] <= k <= env['energy_high']),
                "rattrapage": f"{sc.get('applied')} p×{sc.get('protein_factor')} a×{sc.get('other_factor')}",
                "verdict": f"{sc.get('verdict_energy')}/{sc.get('verdict_protein')}",
                "inconnus": len(set(e["resolution"]["unresolved_terms"]))}
    else:
        row |= {"cibles": {c["name"]: c["target_kcal"] for c in e["cibles"]},
                "mesurables": {r["name"]: r["kcal"] for r in e["par_bouche"] if r["kcal"] is not None},
                "achete_kcal_bouche_jour": e["courses"]["kcal_par_bouche_par_jour"],
                "cible_moyenne": e["maison"]["cible_moyenne_par_bouche"]}
    row |= {"sessions": len(plan.get("cooking_sessions", [])),
            "preparations": len(plan.get("preparations", [])),
            "courses": len(plan.get("shopping_list") or []),
            "issues": len(plan.get("issues", []))}
    out.append(row)
print(json.dumps(out, indent=1, ensure_ascii=False))
