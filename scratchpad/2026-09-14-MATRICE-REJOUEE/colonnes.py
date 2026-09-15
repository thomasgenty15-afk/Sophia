#!/usr/bin/env python3
import json, re, os, sys, glob
D = "scratchpad/2026-09-14-MATRICE-REJOUEE/journaux"
V = "scratchpad/2026-09-13-LOT3-CLOTURE/journaux"

def lire(p):
    return open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else ""

def tags(txt, tag):
    out = []
    for line in txt.splitlines():
        line = line.strip()
        if line.startswith('{"tag":"keel.household_meal.%s"' % tag):
            try: out.append(json.loads(line))
            except Exception: pass
    return out

def colonne(nom, dossier):
    t = lire(f"{dossier}/{nom}.log")
    if not t: return None
    r = {}
    m = re.search(r"statut\s+(\d+)", t);            r["statut"] = m.group(1) if m else "?"
    m = re.search(r"CASES ATTENDUES (\d+)", t);     r["cases"] = m.group(1) if m else "?"
    m = re.search(r'"error":"([a-z_]+)"', t);       r["erreur"] = m.group(1) if m else ""
    m = re.search(r"lignes AJOUTÉES\s+: (\d+)", t); r["ajout"] = m.group(1) if m else "?"
    m = re.search(r"plans avant (\d+) · après (\d+)", t)
    r["plans"] = f"{m.group(1)}→{m.group(2)}" if m else "—"
    m = re.search(r"plan : ([0-9a-f]{8})", t);      r["plan"] = m.group(1) if m else "aucun"
    passes = tags(t, "plan_repair_pass"); done = tags(t, "plan_repair_done")
    r["def_avant"] = passes[0]["defects"] if passes else 0
    r["def_apres"] = done[-1]["defects_at_delivery"] if done else (0 if not passes else "?")
    r["appels"] = done[-1]["calls_made"] if done else 0
    merges = tags(t, "plan_repair_merge")
    r["unites"] = ",".join(merges[-1]["units"]) if merges else "—"
    r["creees"] = ",".join(merges[-1]["created"]) if merges else "—"
    ctx = tags(t, "plan_repair_context")
    r["ctx"] = (f'demandées {ctx[-1]["scope"]["units"]} · à créer {ctx[-1]["units_to_create"]} · '
                f'compléments {ctx[-1]["units"]["complements"]} · réservées {ctx[-1]["units"]["reserved"]}') if ctx else "—"
    cs = tags(t, "cooking_shape")
    if cs:
        c = cs[0]
        r["diverging"] = len(c["diverging"]); r["bearing"] = len(c["dish_bearing"])
        r["taught"] = len(c["dish_bearers_taught"]); r["pnt"] = c["dish_bearing_promised_not_taught"]
        r["regime"] = c["strictest_regime"]
    bc = tags(t, "box_counts")
    if bc:
        b = bc[-1]["boxes"]; r["parts"] = f'boîtes {b["boxes"]} · repas {b["meals"]}'
        md = bc[-1]["meals_delivered"]; r["fed"] = f'{md["fed"]}/{md["expected"]}'
        r["sw"] = bc[-1]["swap"]["flagrant"]
    g = lire(f"{dossier}/{nom}.grille.txt")
    m = re.search(r"TOTAL\s+conformité CALORIQUE (\S+) · conformité COMPLÈTE (\S+) · contrôles INCOMPLETS (\d+)(?: · SANS OBJET (\d+))?", g)
    if m:
        r["cal"], r["comp"], r["incomp"], r["sansobjet"] = m.group(1), m.group(2), m.group(3), m.group(4) or "0"
    m = re.search(r"livraison : (\S+)", g); r["livraison"] = m.group(1) if m else "—"
    m = re.search(r'"delivery":"([a-z_]+)"', t); r["delivery"] = m.group(1) if m else "—"
    return r

CAS = sys.argv[1:] if len(sys.argv) > 1 else [
  "A1-ref-n1","A2-ref-n2","A4-ref-n4","B2-reponse-reelle-n2","B4-reponse-reelle-n4",
  "B4b-reponse-reelle-seule","C-n2-dense-candidat-commun","D-n4-isolement",
  "E1a-amorce","E1-variante-n2","E2a-amorce","E2-variante-n4",
  "F-n4-age-inconnu","G-n4-complement","G-rejoue-sans-remplace","H1-panne-de-controle",
  "H2-panne-de-journal","I1-candidat-dangereux","I2-deroule-dangereux-persistant"]
for nom in CAS:
    a = colonne(nom, V); b = colonne(nom, D)
    if b is None: continue
    print(f"══ {nom}")
    for etiq, r in (("AVANT(13)", a), ("APRÈS(14)", b)):
        if r is None: print(f"   {etiq}: (pas de tir)"); continue
        print(f"   {etiq}: HTTP {r['statut']}{' '+r['erreur'] if r['erreur'] else ''} · cases {r['cases']} · "
              f"défauts {r['def_avant']}→{r['def_apres']} · appels rép. {r['appels']} · "
              f"unités [{r['unites']}] créées [{r['creees']}] · {r['ctx']}")
        print(f"              diverg {r.get('diverging','—')} · porteurs {r.get('bearing','—')} · "
              f"enseignés {r.get('taught','—')} · promis-non-enseignés {r.get('pnt','—')} · "
              f"régime {r.get('regime','—')} · {r.get('parts','—')} · nourris {r.get('fed','—')} · "
              f"swap flagrant {r.get('sw','—')}")
        print(f"              grille {r.get('cal','—')} cal / {r.get('comp','—')} compl · incompl {r.get('incomp','—')} · "
              f"SANS OBJET {r.get('sansobjet','—')} · livraison {r.get('livraison','—')} · "
              f"delivery moteur {r['delivery']} · plans {r['plans']} · écrit {r['plan']}")
