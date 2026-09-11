#!/usr/bin/env python3
"""
LA MESURE D'UNE CAMPAGNE — acceptance du chantier densité/portions/Fast.

    python3 20-mesure.py            # lit runs.json, mesure chaque génération

⛔ AUCUN NOMBRE N'EST RECALCULÉ À LA MAIN. Trois sources, et elles ne se
recouvrent pas:
  · le PLAN rendu (ce que la personne recevrait);
  · le JOURNAL du produit (`keel.*`) et la ligne d'aperçu (`generated_from`) —
    c'est le produit qui dit ce qu'il a fait;
  · les MODULES DE PRODUCTION importés (`30-energie.ts`, `21-energie-foyer.ts`)
    sur un référentiel FIGÉ et identifié (`ref/EMPREINTE.txt`).

⛔ ET « LIVRÉ » N'EST PAS « CONFORME ». Chaque jour-bouche reçoit une classe:
  `conformant` · `residual_gap` · `unmeasurable` · `not_applicable`
et le taux de conformité ne se lit QUE sur les cas dimensionnables.
"""
import json, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).parent
REPO = HERE.parent.parent
CAMP = REPO / "scratchpad" / "2026-09-09-CAMPAGNE-PLANS"
REF = HERE / "ref"

# ── Les seuils du chantier, écrits UNE fois ───────────────────────────────
JOUR_TOLERANCE = 0.05          # ±5 % sur la journée couverte
BORNES_CIBLE = 0.80            # part d'assiettes dans les bornes (repère)
CONFORMITE_CIBLE = 0.90        # ≥ 90 % des cas dimensionnables


def deno(script: str, *args: str) -> dict:
    p = subprocess.run(["deno", "run", "--allow-read", str(script), *args],
                       capture_output=True, text=True, cwd=HERE)
    if p.returncode != 0:
        return {"__erreur__": p.stderr[-600:]}
    try:
        return json.loads(p.stdout)
    except Exception:  # noqa: BLE001
        return {"__erreur__": p.stdout[-600:]}


def load(path):
    try:
        return json.loads(pathlib.Path(path).read_text())
    except Exception:  # noqa: BLE001
        return None


def journal(log_path):
    rows = load(log_path) or []
    tags = {}
    for r in rows:
        tags.setdefault(r.get("tag"), []).append(r)
    return tags


def classe_jour(servi, cible, complete, jour_plein=True):
    """
    La classe d'un jour-bouche.

    ⛔ QUATRE CLASSES, ET ELLES NE SE CONFONDENT PAS:
      · `not_applicable`  — aucune cible (mineur, entretien sans direction,
        plancher TCA) OU journée INCOMPLÈTE. Un jour qui ne porte qu'un repas
        sur trois est **sous-compté, pas sous-nourri**: le juger en énergie
        fabrique un défaut qui n'existe pas. C'est la règle de la campagne du
        2026-09-09, et elle est reprise mot pour mot.
      · `unmeasurable`    — le référentiel ne sait pas peser cette journée.
      · `conformant` / `residual_gap` — la seule paire qui juge vraiment.
    """
    if cible is None or not (cible > 0):
        return "not_applicable", None, "sans_cible"
    if not jour_plein:
        return "not_applicable", None, "jour_incomplet"
    if servi is None or not complete:
        return "unmeasurable", None, "non_pesable"
    ecart = (servi - cible) / cible
    k = "conformant" if abs(ecart) <= JOUR_TOLERANCE else "residual_gap"
    return k, round(ecart * 100, 1), None


def mesure(run: dict) -> dict:
    name, gen, r = run["cas"], run["gen"], run["retenu"]
    out = {"cas": name, "gen": gen, "http": r["http"], "wall_s": r["wall_s"],
           "tentatives": len(run["tentatives"]),
           # ⛔ LE PALIER RÉELLEMENT OBTENU, PAS CELUI QU'ON CROIT AVOIR POSÉ.
           # « Un service dégradé ne doit pas être présenté comme un test Fast
           # réussi » — c'est la phrase du chantier, et c'est cette colonne.
           "appels": [{"source": c.get("source"), "model": c.get("model"),
                       "tier_sent": c.get("tier_sent"), "tier_source": c.get("tier_source"),
                       "tier_echoed": c.get("tier_echoed"),
                       "latency_ms": c.get("latency_ms"),
                       "tokens": c.get("total_tokens")}
                      for c in (r.get("appels") or [])],
           "refus_budget": r.get("refus_budget") or [],
           "shutdown": r.get("shutdown") or []}
    if r["http"] != 200 or not r["plan"]:
        out["etat"] = "sans_plan"
        return out
    lane = "household" if name.startswith("F") else "solo"
    plan = load(r["plan"]) or {}
    tags = journal(r["log"])
    draft = (load(r["draft"]) or [{}])
    gf = (draft[0] if draft else {}).get("generated_from") or {}

    out["budget"] = gf.get("plan_budget")
    out["densite"] = (gf.get("density") or {})
    eb = gf.get("exclusion_belt") or {}
    out["exclusions"] = {
        "final_bites": eb.get("final_bites"),
        "bites_after": eb.get("bites_after"),
    }

    ps_tag = "keel.household_meal.portion_sizing" if lane == "household" else None
    if ps_tag and tags.get(ps_tag):
        ps = tags[ps_tag][-1]
        out["verdicts"] = ps.get("verdicts")
        out["repairs"] = ps.get("repairs", {}).get("asked"), ps.get("repairs", {}).get("accepted")
        out["still_out"] = ps.get("still_out")
        out["skipped_stuck"] = ps.get("skipped_stuck")
        out["unmeasurable_by"] = ps.get("unmeasurable_by")
        v = ps.get("verdicts") or {}
        tot = sum(v.get(k, 0) for k in ("in_bounds", "over_max", "under_min", "unmeasurable"))
        out["bornes_pct"] = round(100 * v.get("in_bounds", 0) / tot, 1) if tot else None

    jours = []
    if lane == "solo":
        e = deno(CAMP / "30-energie.ts", str(REF), r["plan"], str(CAMP / f"body-{name}.json"))
        if "__erreur__" in e:
            out["etat"] = "mesure_impossible"
            out["erreur"] = e["__erreur__"]
            return e and out
        env = (tags.get("keel.meal.envelope") or [{}])[-1]
        low, high = env.get("energy_low"), env.get("energy_high")
        cible = None if low is None or high is None else (low + high) / 2
        out["enveloppe"] = {"low": low, "high": high}
        sc = (tags.get("keel.meal.portion_scaling") or [{}])[-1]
        out["verdict_produit"] = {"energie": sc.get("verdict_energy"),
                                  "proteine": sc.get("verdict_protein"),
                                  "applique": sc.get("applied")}
        # ⛔ COMBIEN DE MOMENTS CETTE PERSONNE A-T-ELLE DÉCLARÉS. Un jour qui en
        # porte moins est une journée INCOMPLÈTE (veille de cuisine, fenêtre qui
        # commence en cours de journée), pas une journée sous-nourrie.
        cas_def = json.loads((CAMP / "cas.json").read_text())[name]
        declares = len(((cas_def.get("pc") or {}).get("eating_rhythm") or [])) or 3
        par_jour = {}
        for d in (plan.get("dishes") or []):
            par_jour[d.get("day")] = par_jour.get(d.get("day"), 0) + 1
        out["moments_declares"] = declares
        for d in e.get("days", []):
            plats = par_jour.get(d.get("day"), 0)
            plein = plats >= declares
            k, c, motif = classe_jour(d.get("kcal"), cible, d.get("complete"), plein)
            jours.append({"qui": "solo", "day": d.get("day"), "servi": d.get("kcal"),
                          "cible": None if cible is None else round(cible),
                          "plats": plats, "jour_plein": plein,
                          "dans_bande": None if low is None or d.get("kcal") is None
                          else bool(low <= d["kcal"] <= high),
                          "ecart_pct": c, "classe": k, "motif": motif,
                          "proteine_g": d.get("protein_g"),
                          "counted": d.get("counted")})
        out["resolution"] = e.get("resolution")
    else:
        e = deno(HERE / "21-energie-foyer.ts", str(REF), r["plan"],
                 str(CAMP / f"roster-{name}.json"))
        if "__erreur__" in e:
            out["etat"] = "mesure_impossible"
            out["erreur"] = e["__erreur__"]
            return out
        cibles = {c["member_id"]: c for c in e.get("cibles", [])}
        par_nom = {c["name"]: c for c in e.get("cibles", [])}
        # ⛔ LE JOUR PLEIN D'UNE BOUCHE EST SON PROPRE MAXIMUM. Le roster ne porte
        # pas les moments déclarés par bouche; prendre le meilleur jour de CETTE
        # bouche dans CE plan est la seule référence qu'on ait sans en inventer
        # une. Elle est conservatrice: elle ne peut que déclarer « incomplet »
        # un jour réellement plus pauvre que les autres.
        plein_de = {}
        for x in e.get("par_bouche", []):
            n = len(x.get("slots") or [])
            plein_de[x.get("name")] = max(plein_de.get(x.get("name"), 0), n)
        for x in e.get("par_bouche", []):
            c = par_nom.get(x.get("name")) or {}
            plein = len(x.get("slots") or []) >= plein_de.get(x.get("name"), 0) > 0
            k, ec, motif = classe_jour(x.get("kcal"), c.get("target_kcal"),
                                       x.get("complete"), plein)
            jours.append({"qui": x.get("name"), "day": x.get("day"), "servi": x.get("kcal"),
                          "cible": c.get("target_kcal"), "motif_cible": c.get("target_reason"),
                          "slots": x.get("slots"), "n_slots": len(x.get("slots") or []),
                          "jour_plein": plein,
                          "ecart_pct": ec, "classe": k, "motif": motif,
                          "grams": x.get("grams"), "maxMealGrams": x.get("maxMealGrams"),
                          "counted": x.get("counted"), "gaps": x.get("gaps")})
        out["maison"] = e.get("maison")
        out["courses"] = e.get("courses")
    out["jours"] = jours
    n = {}
    for j in jours:
        n[j["classe"]] = n.get(j["classe"], 0) + 1
    out["classement"] = n
    dimensionnables = n.get("conformant", 0) + n.get("residual_gap", 0)
    out["conformite_pct"] = (round(100 * n.get("conformant", 0) / dimensionnables, 1)
                             if dimensionnables else None)
    out["etat"] = "mesure"
    return out


if __name__ == "__main__":
    runs = json.loads((HERE / "runs.json").read_text())
    res = []
    for run in runs:
        m = mesure(run)
        res.append(m)
        print(f"{m['cas']}·{m['gen']}  http={m['http']}  {m.get('etat')}  "
              f"bornes={m.get('bornes_pct')}%  conformité={m.get('conformite_pct')}%  "
              f"classes={m.get('classement')}")
        (HERE / "mesures.json").write_text(json.dumps(res, indent=1, default=str))
    print(f"\n→ {HERE / 'mesures.json'}")
