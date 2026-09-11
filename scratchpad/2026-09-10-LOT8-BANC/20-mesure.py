#!/usr/bin/env python3
"""
LE BANC CORRIGÉ — la mesure hors ligne des runs déjà archivés. Lot 8.

    python3 20-mesure.py                # les 20 générations de runs.json
    python3 20-mesure.py S2 F5          # un sous-ensemble

⛔ AUCUNE GÉNÉRATION, AUCUN APPEL MODÈLE. Ce script ne parle qu'aux archives
de `scratchpad/2026-09-10-CAMPAGNE-ELARGIE/runs.json` et aux fonctions de
production. Le § 10 du plan interdit une nouvelle campagne payante.

── LES NEUF DÉFAUTS D'INSTRUMENT QU'IL FERME, ET OÙ ─────────────────────────
 ① lignes de journal agrégées par proximité horaire ....... `banc.segment_de`
 ② valeur absente rendue comme zéro ....................... `banc.INCONNU`
 ③ couverture déduite des plats rendus .................... `21-mesure.ts` ⑤
 ④ journée partielle jugée « non applicable » ............. `classe_jour`
 ⑤ bouche sans boîte nominative sans mesure interne ....... `21-mesure.ts` ③
 ⑥ médiane de taux au lieu du compte des violations ....... `violations_grammes`
 ⑦ « zéro exclusion » dérivé d'un champ absent ............ `securite`
 ⑧ index du run remplacé par le sas d'aujourd'hui ......... `21-mesure.ts` ①
 ⑨ 546 compté comme un échec produit ...................... `banc.classe_http`
"""
import json
import pathlib
import subprocess
import sys
from datetime import datetime, timedelta

import banc
from banc import INCONNU, est_connu

HERE = pathlib.Path(__file__).parent
REPO = HERE.parent.parent
CAMP09 = REPO / "scratchpad" / "2026-09-09-CAMPAGNE-PLANS"
CAMP10 = REPO / "scratchpad" / "2026-09-10-CAMPAGNE-ELARGIE"
REF = HERE / "ref"
SAS = REF / "food_composition_pending_by_form.ndjson"
FIXTURES = HERE / "fixtures"
CAS = json.loads((CAMP09 / "cas.json").read_text())
LLM = [json.loads(l) for l in (HERE / "llm_usage_campagne.ndjson").read_text().splitlines() if l.strip()]

JOUR_TOLERANCE = 0.05          # ±5 % sur la journée COUVERTE (§ lot 8)
REPAS_TOLERANCE = 0.10         # ±10 % sur un repas


# ── L'EMPREINTE DU CODE MESURANT ──────────────────────────────────────────
# ⛔ TROIS SESSIONS TRAVAILLENT DANS CET ARBRE. `portion_sizing.ts` a été
# modifié à 20:56:34 PENDANT la première passe de ce banc: `plateBoundsFor` en
# vient, et deux mesures séparées par une édition comparent deux codes, pas
# deux plans. `20-run.py` s'en gardait déjà pour les générations; la MESURE en
# a autant besoin. L'empreinte est prise avant et après chaque fixture, et un
# écart est écrit sur la ligne — jamais tu.
KEEL = REPO / "supabase" / "functions" / "_shared" / "keel"


def empreinte_code():
    import hashlib
    h = hashlib.md5()
    for f in sorted(KEEL.rglob("*.ts")):
        if f.name.endswith("_test.ts"):
            continue
        h.update(f"{f.name}:{f.stat().st_mtime_ns}\n".encode())
    return h.hexdigest()[:12]


def horodatage(stamp: str):
    """L'heure locale du run, depuis l'estampille de son fichier de plan."""
    return datetime.strptime(stamp, "%Y%m%d-%H%M%S")


def bouches(nom, lane):
    """
    LES MANGEURS DE CE RUN, ET LEUR CORPS — depuis les fixtures archivées.

    ⛔ Un compte seul est un foyer d'une personne (lot 1 du chantier): la même
    structure sert les deux lanes, et la mesure lit la même équation des deux
    côtés.
    """
    cas = CAS[nom]
    if lane == "household":
        roster = json.loads((CAMP09 / f"roster-{nom}.json").read_text())
        out = []
        for i, r in enumerate(roster):
            out.append({
                "memberId": r["member_id"], "name": r["first_name"],
                "ageYears": r.get("age_years"), "weightKg": r.get("weight_kg"),
                "heightCm": r.get("height_cm"), "gender": r.get("gender"),
                "activityLevel": r.get("activity_level"),
                "dayActivity": r.get("day_activity"),
                "sportFrequency": r.get("sport_frequency"),
                "appetite": r.get("appetite"), "goal": r.get("goal"),
                # Le titulaire a un compte lu (`clear`); les autres bouches n'en
                # ont pas. Les deux rendent `restrictionFlag: false` — aucune
                # fixture de cette campagne ne déclare de condition.
                "restriction": "clear" if i == 0 else "no_account",
                "paceKgPerWeek": None,
                "targetKcalOverride": None,
            })
        return out
    body = json.loads((CAMP09 / f"body-{nom}.json").read_text())
    return [{
        "memberId": body["userId"], "name": cas["nom"],
        "ageYears": body.get("ageYears"), "weightKg": body.get("weightKg"),
        "heightCm": body.get("heightCm"), "gender": body.get("gender"),
        "activityLevel": body.get("activityLevel"),
        "dayActivity": None, "sportFrequency": None,
        "appetite": (cas.get("pc") or {}).get("appetite"),
        "goal": body.get("goal"), "restriction": "clear",
        "paceKgPerWeek": cas.get("pace"),
        "targetKcalOverride": None,
    }]


def deno(fixture_path):
    p = subprocess.run(
        ["deno", "run", "--allow-read", str(HERE / "21-mesure.ts"), str(fixture_path)],
        capture_output=True, text=True, cwd=HERE)
    if p.returncode != 0:
        return {"__erreur__": p.stderr[-1500:]}
    try:
        return json.loads(p.stdout)
    except Exception:  # noqa: BLE001
        return {"__erreur__": (p.stdout or p.stderr)[-1500:]}


# ── LA SÉCURITÉ, EN QUATRE ÉTATS ──────────────────────────────────────────
def etat_ceinture(mouths, checked, final):
    """
    ⛔ « `refused: 0` seul rend le même zéro pour "personne n'a rien exclu" et
    "rien n'a mordu". `mouths` et `checked` séparent les deux. » — c'est écrit
    dans `meal_generation.ts` au-dessus du type, et le banc doit le lire.

      `controle_absent`   — aucune trace. Rien ne permet de dire si le contrôle
                            a tourné. ⛔ CE N'EST PAS ZÉRO.
      `rien_a_controler`  — la ceinture a tourné avec ZÉRO bouche ou ZÉRO plat
                            examiné: personne n'avait déclaré de ligne. Un
                            « ✅ zéro exclusion » ici serait un compliment
                            adressé à un contrôle qui n'a rien regardé.
      `zero_verifie`      — la ceinture a examiné quelque chose et rend zéro.
      `morsures`          — n morsures finales, nommées.
    """
    if final is None:
        return "controle_absent"
    if not mouths or not checked:
        return "rien_a_controler"
    return "zero_verifie" if final == 0 else "morsures"


def securite(seg, lane):
    """
    LE RÉSULTAT DES CONTRÔLES FINAUX — jamais un zéro nu.

    ⛔ LE DÉFAUT QUE ÇA FERME, ET IL EST PUBLIÉ. `30-rapport.py` lisait
    `generated_from.exclusion_belt.final_bites`. Vérifié sur les 12 brouillons
    aboutis: `exclusion_belt` n'est dans `generated_from` sur AUCUNE des deux
    lanes, et la lane solo n'écrit `final_bites` nulle part. Le champ valait
    `None` douze fois sur douze; `[b for b in bites if b]` rendait `[]`; le
    tableau publiait « exclusion nouvelle sur le payload final : **0** ✅ ».

    ⚠️ ET LA CEINTURE DE RÉGIME EST LUE AUSSI. Sur `F5·1` elle a réellement
    mordu (`mouths: 1, bites: 4, separated: 4` — Maya, végétarienne) pendant
    que la ceinture d'EXCLUSION n'avait rien à regarder. Ne rendre que la
    seconde ferait dire « aucune sécurité n'a tourné » d'un run où une règle a
    tenu quatre fois.
    """
    vide = {"exclusion": {"etat": "controle_absent", "mouths": INCONNU,
                          "checked": INCONNU, "morsures_finales": INCONNU},
            "regime": {"etat": "controle_absent", "mouths": INCONNU,
                       "checked": INCONNU, "morsures": INCONNU}}
    if seg is None:
        return {**vide, "etat": "controle_absent", "morsures_finales": INCONNU,
                "raison": "requete_non_identifiee"}
    if lane == "household":
        bc = banc.tag_unique(seg, "keel.household_meal.box_counts")
        eb = (bc or {}).get("exclusion_belt") or {}
        rb = (bc or {}).get("regime_belt") or {}
        if bc is None:
            return {**vide, "etat": "controle_absent", "morsures_finales": INCONNU,
                    "raison": "box_counts_absent_du_segment_de_cette_requete"}
        ex = {"etat": etat_ceinture(eb.get("mouths"), eb.get("checked"), eb.get("final_bites")),
              "mouths": banc.nombre(eb.get("mouths")), "checked": banc.nombre(eb.get("checked")),
              "morsures_finales": banc.nombre(eb.get("final_bites"))}
        re_ = {"etat": etat_ceinture(rb.get("mouths"), rb.get("checked"), rb.get("bites")),
               "mouths": banc.nombre(rb.get("mouths")), "checked": banc.nombre(rb.get("checked")),
               "morsures": banc.nombre(rb.get("bites")),
               "separees": banc.nombre(rb.get("separated")),
               "non_separees": banc.nombre(rb.get("not_separated"))}
        return {"exclusion": ex, "regime": re_,
                "etat": ex["etat"], "morsures_finales": ex["morsures_finales"],
                "raison": "keel.household_meal.box_counts"}
    eb = banc.tag_unique(seg, "keel.meal.exclusion_belt")
    if eb is None:
        # `generate-meal-v1:3096` — la ceinture solo ne journalise QUE si un
        # terme est déclaré. Absence = « rien à contrôler » OU « la ceinture
        # n'a pas tourné », et rien dans les archives ne les distingue.
        return {**vide, "etat": "controle_absent", "morsures_finales": INCONNU,
                "raison": "aucune_trace_solo_absence_indistincte_de_rien_a_controler"}
    apres = banc.nombre(eb.get("bites_after"))
    ex = {"etat": etat_ceinture(1, eb.get("terms"), eb.get("bites_after")),
          "mouths": 1, "checked": banc.nombre(eb.get("terms")), "morsures_finales": apres}
    return {"exclusion": ex, "regime": vide["regime"],
            "etat": ex["etat"], "morsures_finales": apres,
            "raison": "keel.meal.exclusion_belt.bites_after"}


def classe_jour(servi, cible, complete, attendu_manquant):
    """
    LA CLASSE D'UN JOUR-BOUCHE, sur sa CIBLE COUVERTE.

    ⛔ CE QUI A CHANGÉ. L'ancienne version rendait `not_applicable` sur toute
    journée « incomplète », et déterminait l'incomplétude en comparant les
    plats rendus au meilleur jour du plan. Deux conséquences: un repas attendu
    manquant sortait de la mesure au lieu d'être un défaut, et une journée
    volontairement partielle (moments déjà passés, veille de cuisine) était
    jetée alors qu'elle est parfaitement jugeable contre son budget couvert.

    Ici: la journée est jugée contre `slotPlanTargets(moments couverts)`, et le
    manque de couverture est un AXE SÉPARÉ (`couverture`), pas une excuse.
    """
    if not est_connu(cible) or cible is None or not (cible > 0):
        return "sans_cible", INCONNU
    if servi is None or not complete:
        return "unmeasurable", INCONNU
    return ("conformant" if abs((servi - cible) / cible) <= JOUR_TOLERANCE
            else "residual_gap"), round(100 * (servi - cible) / cible, 1)


def mesure(run):
    nom, gen, ret = run["cas"], run["gen"], run["retenu"]
    lane = CAS[nom]["lane"]
    etat = banc.classe_http(ret["http"])
    rid = banc.requete_du_run(run)
    rows = banc.charger(ret.get("log")) or []
    seg = banc.segment_de(rows, rid)

    # ── LES QUATRE COMPTEURS QUI NE SE CONFONDENT PAS (§ lot 8) ───────────
    # `10-campagne.py` mélangeait tout: `appels` = toutes les lignes
    # `llm_usage_events` de la fenêtre horaire, `refus_budget` et `shutdown` =
    # tout le journal du conteneur sur DEUX HEURES (le `--since` sans `Z` est
    # lu en heure locale). Les refus de budget étaient donc cumulés: 1 sur F2·1,
    # 4 sur F5·2 — la même ligne recomptée à chaque run.
    transmissions = [c for c in LLM if c.get("request_id") == rid] if rid else []
    tentatives_http = len(run["tentatives"])
    refus = [r for r in rows
             if r.get("tag") == "keel.plan.repair_refused" and r.get("request_id") == rid]

    out = {
        "cas": nom, "gen": gen, "lane": lane, "http": ret["http"], "etat": etat,
        "request_id": rid,
        "wall_s": ret.get("wall_s"),
        "compteurs": {
            "generations_demandees": 1,
            "tentatives_http": tentatives_http,
            "transmissions_fournisseur": len(transmissions) if rid else INCONNU,
            "erreur_plateforme": etat == "non_teste",
        },
        "appels": [{"source": c.get("source"), "model": c.get("model"),
                    "kind": c.get("kind"), "status": c.get("status"),
                    "tier_sent": c.get("tier_sent"), "tier_echoed": c.get("tier_echoed"),
                    "latency_ms": c.get("latency_ms"), "tokens": c.get("total_tokens")}
                   for c in transmissions],
        "refus_budget": [{"label": r.get("label"), "reason": r.get("reason")} for r in refus],
        "securite": securite(seg, lane),
    }
    if etat != "mesure":
        # ⛔ 546 = NON TESTÉ. Aucun champ de mesure n'est rempli, et surtout pas
        # à zéro: un run qui n'a pas tourné ne dit rien sur le produit.
        out["classement"] = {}
        out["raison_non_teste"] = "WORKER_LIMIT (546) — limite CPU de l'isolat, § 10 hors périmètre"
        return out
    if seg is None:
        out["etat"] = "requete_non_identifiee"
        return out

    cas = CAS[nom]
    draft = (banc.charger(ret["draft"]) or [{}])[0]
    stamp = horodatage(ret["stamp"])
    declares = [s["slot"] for s in ((cas.get("pc") or {}).get("eating_rhythm") or [])]
    bs = bouches(nom, lane)

    # La cible du produit, quand il la journalise (lane solo seulement).
    dt = banc.tag_unique(seg, "keel.meal.day_target")
    if lane == "solo" and dt is not None and dt.get("kcal") is not None:
        bs[0]["targetKcalOverride"] = dt["kcal"]

    fixture = {
        "cas": nom, "gen": gen, "lane": lane,
        "plan": ret["plan"],
        "refDir": str(REF), "sasFile": str(SAS),
        # ⛔ LA COUPURE DU SAS EST LA **FIN** DE CE RUN-LÀ, pas son début.
        # Un run écrit lui-même dans le sas les valeurs qu'il vient d'obtenir
        # du modèle (`sas_written`), et il les A utilisées. Couper au début
        # retirerait de l'index les lignes que ce plan a payées: mesuré sur
        # S1·1, « capers » entre à 12:01:34 pour un run commencé à 12:00:42.
        # Une ligne écrite par un run POSTÉRIEUR reste, elle, exclue.
        "sasCutoff": (datetime.strptime(ret["since"], "%Y-%m-%dT%H:%M:%S")
                      + timedelta(seconds=float(ret.get("wall_s") or 0))
                      ).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "declaredSlots": declares, "lightSlots": [],
        "mouths": bs,
        "windowStartsOn": draft.get("starts_on"),
        "windowDurationDays": draft.get("duration_days"),
        "leadDays": draft.get("lead_days"),
        "todayLocalDate": stamp.strftime("%Y-%m-%d"),
        "hourNow": stamp.hour,
        "request_id": rid,
        # L'ARCHIVE EXIGÉE PAR LE § LOT 8, sur la fixture elle-même.
        "archive": {
            "requete": {"lane": lane, "window": cas["window"],
                        "one_cooking_session": cas.get("one_cooking_session"),
                        "cooking_shape": cas.get("cooking_shape"), "intent": "draft"},
            "empreinte_referentiel": (REF / "EMPREINTE.txt").read_text().strip(),
            "empreinte_code_keel": empreinte_code(),
            "empreinte_sas": f"food_composition_pending_by_form lignes={sum(1 for _ in SAS.open())}",
            "payload_final": ret["plan"],
            "brouillon": ret["draft"],
            "journal": ret["log"],
            "generated_from": draft.get("generated_from"),
            "composition_energy_sources": draft.get("composition_energy_sources"),
            "composition_unknowns": draft.get("composition_unknowns"),
        },
    }
    FIXTURES.mkdir(exist_ok=True)
    fp = FIXTURES / f"{nom}-{gen}.json"
    fp.write_text(json.dumps(fixture, indent=1, default=str))

    cp0 = empreinte_code()
    m = deno(fp)
    cp1 = empreinte_code()
    out["empreinte_code"] = {"avant": cp0, "apres": cp1, "stable": cp0 == cp1}
    if "__erreur__" in m:
        out["etat"] = "mesure_impossible"
        out["erreur"] = m["__erreur__"]
        return out

    # ── L'INDEX DU RUN, ET CE QU'IL RESTE D'IRRÉCUPÉRABLE ─────────────────
    src = draft.get("composition_energy_sources") or {}
    out["index"] = {
        **m["index"],
        "parts_declarees_par_le_produit": src or INCONNU,
        # ⛔ LA PART `group_bounds` N'EST PAS RESTAURABLE. `filledFromPendingRow`
        # refuse ces lignes: leur valeur venait des bornes du groupe, calculées
        # en vol sur l'index du moment. La part d'énergie concernée est nommée,
        # pas comblée.
        "part_non_restaurable_pct": (round(100 * float(src.get("group_bounds", 0)), 1)
                                     if src else INCONNU),
        "exact": bool(src) and float(src.get("group_bounds", 0)) == 0,
    }
    out["attribution_casseroles"] = m["attribution_casseroles"]
    out["couverture"] = m["couverture"]
    out["violations_grammes"] = m["violations_grammes"]
    out["bacs_communs"] = m["bacs_communs"]
    out["controles_grammes"] = {
        "total": len(m["controles_grammes"]),
        "in_bounds": sum(1 for c in m["controles_grammes"] if c["verdict"] == "in_bounds"),
        "over_max": sum(1 for c in m["controles_grammes"] if c["verdict"] == "over_max"),
        "under_min": sum(1 for c in m["controles_grammes"] if c["verdict"] == "under_min"),
        "unmeasurable": sum(1 for c in m["controles_grammes"] if c["verdict"] == "unmeasurable"),
    }
    out["cibles"] = m["cibles"]

    # ── LE JOUR-BOUCHE, SUR SA CIBLE COUVERTE ─────────────────────────────
    couverte = {(c["memberId"], c["day"]): c for c in m["cibles_couvertes"]}
    manque = {}
    for x in m["couverture"]["manquants"]:
        manque.setdefault((x["memberId"], x["day"]), []).append(x["slot"])

    jours = []
    if lane == "solo":
        mid = bs[0]["memberId"]
        for d in m["jours_plan"]:
            c = couverte.get((mid, d["day"]))
            cible = None if c is None else c.get("cible_couverte")
            k, ec = classe_jour(d["kcal"], cible, d["complete"],
                                manque.get((mid, d["day"])))
            jours.append({
                "qui": bs[0]["name"], "day": d["day"], "servi": d["kcal"],
                "cible_couverte": cible,
                "cible_jour": None if c is None else c.get("cible_jour"),
                "slots_couverts": None if c is None else c["slots_couverts"],
                "slots_attendus": None if c is None else c["slots_attendus"],
                "manquants": manque.get((mid, d["day"]), []),
                "plats": f"{d['dishesCounted']}/{d['dishesTotal']}",
                "ecart_pct": ec, "classe": k,
                "mesure": "journee_du_plan",
            })
    else:
        # ⛔ LA MESURE INTERNE PREND LE RELAIS DU COUVERCLE, ET ELLE EST NOMMÉE.
        # `mouthDayEnergy` s'abstient dès qu'un bac est servi: sur F1 cela
        # rendait 8 jours-bouches sur 8 illisibles alors que le service
        # collectif tombait au kcal près sur la somme des cibles. Le § lot 8
        # exige cette mesure; elle est marquée `service_collectif` et jamais
        # présentée comme la lecture d'une assiette.
        internes = {(j["memberId"], j["day"]): j for j in m["journees_internes"]}
        for x in m["par_bouche"]:
            c = couverte.get((x["memberId"], x["day"]))
            cible = None if c is None else c.get("cible_couverte")
            it = internes.get((x["memberId"], x["day"]))
            servi, complete, base = x["kcal"], x["complete"], "assiette_nominative"
            if servi is None and it is not None and it["kcal"] is not None:
                servi, complete, base = it["kcal"], it["complete"], it["base"]
            elif servi is None:
                base = "aucune"
            k, ec = classe_jour(servi, cible, complete,
                                manque.get((x["memberId"], x["day"])))
            jours.append({
                "qui": x["name"], "day": x["day"], "servi": servi,
                "base_de_mesure": base,
                "servi_assiette": x["kcal"],
                "servi_interne": None if it is None else it["kcal"],
                "cible_couverte": cible,
                "cible_jour": None if c is None else c.get("cible_jour"),
                "slots_couverts": x["slots"], "own_slots": x["ownSlots"],
                "slots_attendus": None if c is None else c["slots_attendus"],
                "manquants": manque.get((x["memberId"], x["day"]), []),
                "plats": f"{x['dishesCounted']}/{x['dishesTotal']}",
                "ecart_pct": ec, "classe": k,
                # ⛔ LA MESURE INTERNE EXISTE MÊME SANS COUVERCLE NOMINATIF.
                # `subject` dit de quoi le chiffre parle; `gaps` dit ce qui l'a
                # empêché. `common_pot` n'est PAS un trou du plan: c'est un bac
                # partagé, et le produit refuse d'en tirer une assiette.
                "mesure": x["subject"], "gaps": x["gaps"],
                "grams": x["grams"], "max_meal_grams": x["maxMealGrams"],
            })
    out["jours"] = jours
    cl = {}
    for j in jours:
        cl[j["classe"]] = cl.get(j["classe"], 0) + 1
    out["classement"] = cl
    dim = cl.get("conformant", 0) + cl.get("residual_gap", 0)
    out["conformite_pct"] = round(100 * cl.get("conformant", 0) / dim, 1) if dim else INCONNU

    # ── LES AXES, SÉPARÉS. `conformant` EXIGE TOUT CE QUI S'APPLIQUE ──────
    cov = m["couverture"]
    out["axes"] = {
        "calorique": ("conforme" if dim and cl.get("residual_gap", 0) == 0
                      else "non_conforme" if dim else INCONNU),
        "masse": ("conforme" if out["controles_grammes"]["over_max"] == 0
                  and out["controles_grammes"]["under_min"] == 0
                  and out["controles_grammes"]["total"] > 0 else
                  "non_conforme" if out["controles_grammes"]["over_max"]
                  or out["controles_grammes"]["under_min"] else INCONNU),
        "couverture": "conforme" if not cov["manquants"] else "non_conforme",
        # ⛔ `rien_a_controler` N'EST PAS « CONFORME ». Une ceinture qui n'a
        # regardé aucune bouche ne dit rien sur la sûreté du plan.
        "securite": {"zero_verifie": "conforme", "morsures": "non_conforme"}.get(
            out["securite"]["etat"], INCONNU),
        # ⛔ NON MESURÉS PAR CE BANC, ET DITS COMME TELS. La protéine par
        # personne et la densité par plat demandent des entrées que les
        # archives ne portent pas (objectifs protéiques résolus, couloir de
        # densité par recette). Un `conforme` par défaut serait un mensonge.
        "proteique": INCONNU,
        "densite": INCONNU,
    }
    applicables = [v for k, v in out["axes"].items() if est_connu(v)]
    out["conformant"] = bool(applicables) and all(v == "conforme" for v in applicables)
    return out


if __name__ == "__main__":
    runs = json.loads((CAMP10 / "runs.json").read_text())
    voulus = set(sys.argv[1:])
    res = []
    for run in runs:
        if voulus and run["cas"] not in voulus:
            continue
        x = mesure(run)
        res.append(x)
        s = x["securite"]
        print(f"{x['cas']}·{x['gen']}  http={x['http']}  {x['etat']:22s} "
              f"rid={str(x['request_id'])[:8]:8s} "
              f"classes={x.get('classement')}  "
              f"conf={x.get('conformite_pct')}  "
              f"manquants={len((x.get('couverture') or {}).get('manquants', []))}  "
              f"grammes={x.get('controles_grammes')}  "
              f"secu={s['etat']}({s['morsures_finales']})")
    (HERE / "mesures-lot8.json").write_text(json.dumps(res, indent=1, default=str))
    emp = {x.get("empreinte_code", {}).get("avant") for x in res if x.get("empreinte_code")}
    if len(emp) > 1:
        print(f"\n⛔ LE CODE A CHANGÉ SOUS LA MESURE — {len(emp)} empreintes: {sorted(emp)}")
    else:
        print(f"\n✅ empreinte de `_shared/keel` stable sur toute la passe: {emp}")
    print(f"→ {HERE / 'mesures-lot8.json'}")
