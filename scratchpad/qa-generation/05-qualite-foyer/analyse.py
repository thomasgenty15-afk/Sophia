#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LA LECTURE **PAR BOUCHE**, JAMAIS EN MOYENNE.

Ce dépôt a déjà payé la moyenne: « 2 plats dédiés sur 4 bouches » cachait
« une personne les prend tous les deux ». Toute sortie ici est indexée par
(bouche, jour, créneau).

  ./analyse.py plan-1 plan-2 ...
"""
import json
import os
import re
import sys

DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
SLOT_ORDER = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner", "before_bed"]

# ── LES MOTS QU'ON CHERCHE — DÉCLARÉS, JAMAIS DEVINÉS ──────────────────────
# ⚠️ Ce ne sont PAS des matchers d'aliment (« laitue » ≠ « lait », 12 faux
# positifs sur 12 mesurés dans ce dépôt). Ce sont des mots d'INSTRUCTION et
# d'INTERDIT de prompt, cherchés dans du texte anglais écrit par le modèle, et
# CHAQUE occurrence est rendue en clair pour être relue à l'œil.
OVEN_WORDS = ["oven", "roast", "roasted", "bake", "baked", "baking", "grill", "broil"]
FREEZER_WORDS = ["freeze", "frozen", "freezer"]
SIZE_WORDS = ["bigger", "smaller", "larger", "large portion", "small portion",
              "child-sized", "child sized", "kid-sized", "standard portion",
              "normal portion", "extra portion", "double portion", "half portion",
              "generous portion", "same as"]
# ⚠️ CORRIGÉ APRÈS UN FAUX POSITIF MESURÉ: « cal » appariait « medi-CAL list ».
# C'est exactement « jamais de matcher maison » — on ne garde que des mots
# entiers sans ambiguïté, et on relit chaque occurrence à l'œil.
CAL_WORDS = ["calorie", "kcal", "energy target", "macronutrient",
             "protein target", "grams of protein"]
BODY_WORDS = ["kg", "cm", "bmi", "weight", "weigh "]


def load(run):
    out = {"run": run}
    for name, key in [("plan-payload.json", "plan"), ("plan-written.json", "written"),
                      ("inputs.json", "inputs")]:
        p = os.path.join(run, name)
        try:
            out[key] = json.load(open(p))
        except Exception:
            out[key] = None
    mt = os.path.join(run, "model.txt")
    out["model_lines"] = open(mt).read().strip().splitlines() if os.path.exists(mt) else []
    st = os.path.join(run, "http-status.txt")
    out["http"] = open(st).read().strip() if os.path.exists(st) else "?"
    return out


def served_model(lines):
    """QUEL MODÈLE A RÉELLEMENT SERVI — la dernière ligne `success`."""
    for ln in lines:
        parts = [p.strip() for p in ln.split("|")]
        if len(parts) >= 3 and parts[2] == "success":
            return parts[1]
    return "?"


def names(inputs):
    r = {}
    for m in (inputs or {}).get("roster", []) or []:
        r[m["member_id"]] = m["first_name"]
    return r


def box_index(plan):
    """box_id -> (prep_id, prep_title, grams, member_ids)"""
    idx = {}
    for p in plan.get("preparations") or []:
        for b in p.get("boxes") or []:
            idx[b.get("id")] = (p.get("id"), p.get("title"), b.get("grams"),
                                b.get("member_ids") or [])
    return idx


def away_map(inputs):
    """(member_id, day, slot) marqués absents ou DEHORS — ils ne comptent pas."""
    out = set()
    for m in (inputs or {}).get("roster", []) or []:
        for e in m.get("away_days") or []:
            day = e.get("day")
            slots = e.get("slots") or SLOT_ORDER
            for s in slots:
                out.add((m["member_id"], day, s))
    return out


def plates(plan, roster, away=frozenset()):
    """(member_id, day, slot) -> liste de plats. LA question du lot."""
    out = {}
    dishes = plan.get("dishes") or []
    slots = sorted({(d.get("day"), d.get("slot")) for d in dishes},
                   key=lambda t: (DAY_ORDER.index(t[0]) if t[0] in DAY_ORDER else 9,
                                  SLOT_ORDER.index(t[1]) if t[1] in SLOT_ORDER else 9))
    for (day, slot) in slots:
        here = [d for d in dishes if d.get("day") == day and d.get("slot") == slot]
        own = {d.get("member_id"): d for d in here if d.get("member_id")}
        shared = [d for d in here if not d.get("member_id")]
        for mid in roster:
            if (mid, day, slot) in away:
                out[(mid, day, slot)] = "OUT"
                continue
            if mid in own:
                out[(mid, day, slot)] = [own[mid]]
            elif shared:
                out[(mid, day, slot)] = shared
            else:
                out[(mid, day, slot)] = []
    return out, slots


def scan(text, words):
    t = (text or "").lower()
    return sorted({w for w in words if w in t})


def all_text(plan):
    """TOUT le texte lu par un humain, avec sa provenance."""
    out = []
    for p in plan.get("preparations") or []:
        out.append(("preparations[].title", p.get("title") or ""))
        out.append(("preparations[].method", p.get("method") or ""))
    for d in plan.get("dishes") or []:
        for k in ("name", "title", "method", "why"):
            out.append((f"dishes[].{k}", d.get(k) or ""))
    for s in plan.get("cooking_sessions") or []:
        out.append(("cooking_sessions[].run_through", s.get("run_through") or ""))
    for mp in plan.get("member_portions") or []:
        out.append((f"member_portions[{mp.get('display_name')}].portion_note",
                    mp.get("portion_note") or ""))
        for sh in mp.get("preparation_shares") or []:
            out.append((f"member_portions[{mp.get('display_name')}].share.note",
                        sh.get("note") or ""))
    for it in plan.get("shopping_list") or []:
        out.append(("shopping_list[].term", it.get("term") or ""))
    return out


def report(run):
    d = load(run)
    print("=" * 78)
    print(f"### {run}   HTTP {d['http']}   modèle servi: {served_model(d['model_lines'])}")
    plan = d["plan"]
    if not plan or not plan.get("dishes"):
        print("  ⛔ AUCUN PLAN (voir http-response.json)")
        return
    roster = names(d["inputs"])
    h = (d["written"] or {}).get("household") or {}
    ck = h.get("cooking") or {}
    # ⚠️ GARDE DE POSTE: un run qui échoue laisse la requête « dernier plan du
    # foyer » rendre le plan du run PRÉCÉDENT. On imprime l'id: deux runs qui
    # portent le même `plan_id` ne sont pas deux mesures.
    print(f"  plan_id {plan.get('plan_id')}  écrit {plan.get('created_at')}")
    print(f"  fenêtre {plan.get('starts_on')} +{plan.get('duration_days')}j  scope={plan.get('scope')}  servings={plan.get('servings')}")
    print(f"  cooking: asked={ck.get('asked')} computed={ck.get('computed')} served={ck.get('served')} "
          f"capped={ck.get('capped')} unused={ck.get('unused')} diverging={len(ck.get('diverging') or [])}")
    for k in ("box_sizing", "regime_belt", "dish_owners", "boxes", "shares", "eating_out",
              "kitchen", "vague_portions", "portion_quantities"):
        if k in h:
            print(f"  {k}: {json.dumps(h[k], ensure_ascii=False)}")

    bidx = box_index(plan)
    away = away_map(d["inputs"])
    pl, slots = plates(plan, roster, away)

    print("\n  ── L'ASSIETTE, PAR BOUCHE ET PAR CRÉNEAU ──")
    for mid, nm in roster.items():
        print(f"\n   ▸ {nm}")
        titles = []
        preps = []
        for (day, slot) in slots:
            ds = pl.get((mid, day, slot)) or []
            if ds == "OUT":
                print(f"     {day}/{slot:9s} — mange DEHORS (rien composé, voulu)")
                continue
            if not ds:
                print(f"     {day}/{slot:9s} — ⛔ RIEN")
                continue
            for x in ds:
                grams = []
                for u in x.get("uses") or []:
                    b = bidx.get(u.get("box_id"))
                    if not b:
                        continue
                    if mid in b[3]:
                        grams.append(f"{b[1]} {b[2]} g")
                own = "PROPRE" if x.get("member_id") == mid else "table "
                print(f"     {day}/{slot:9s} {own} « {x.get('title')} »")
                if grams:
                    print(f"       {' · '.join(grams)}")
                else:
                    print("       ⛔ aucune boîte à son nom dans ce plat")
                titles.append(x.get("title"))
                preps.append(tuple(sorted(
                    bidx[u.get("box_id")][0] for u in (x.get("uses") or [])
                    if u.get("box_id") in bidx and mid in bidx[u.get("box_id")][3])))
        uniq = len(set(titles))
        # ⚠️ L'INTITULÉ MENT SUR LA MONOTONIE. « dahl aux épinards » et « dahl
        # aux tomates » sont DEUX titres et UNE seule casserole. On compte donc
        # aussi les ensembles de PRÉPARATIONS réellement mangés.
        uniqp = len(set(p for p in preps if p))
        print(f"     → {len(titles)} repas servis, {uniq} intitulé(s) distinct(s), "
              f"{uniqp} combinaison(s) de préparations distincte(s)")


    print("\n  ── ASSEZ DE NOURRITURE ? demande vs `servings_made` ──")
    # Une part = UNE BOUCHE À UN REPAS. Le modèle écrit `uses[].servings: 1` par
    # PLAT, pas par bouche: un plat de table mangé par 3 personnes coûte 3 parts.
    # ⚠️ Comptage DÉCLARATIF (on lit les boîtes citées), aucune devinette.
    demand = {}
    for (mid, day, slot), ds in pl.items():
        if ds == "OUT":
            continue
        for x in ds:
            for u in x.get("uses") or []:
                b = bidx.get(u.get("box_id"))
                if not b:
                    continue
                if mid in b[3]:
                    demand[b[0]] = demand.get(b[0], 0) + 1
    for p2 in plan.get("preparations") or []:
        made = p2.get("servings_made")
        need = demand.get(p2.get("id"), 0)
        flag = "⛔ MANQUE" if (isinstance(made, int) and need > made) else "ok"
        print(f"   {p2.get('id'):16s} demande={need:3d}  servings_made={made}  {flag}")

    print("\n  ── LES PHRASES LUES À TABLE ──")
    for mp in plan.get("member_portions") or []:
        print(f"   {mp.get('display_name')}: {mp.get('portion_note')}")

    print("\n  ── LES MOTS INTERDITS ET LES USTENSILES ──")
    kit = (h.get("kitchen") or {})
    missing = kit.get("missing") or []
    hits = {"oven": [], "freezer": [], "size": [], "cal": [], "body": []}
    for where, txt in all_text(plan):
        if "oven" in missing:
            for w in scan(txt, OVEN_WORDS):
                hits["oven"].append((where, w, txt[:150]))
        if "freezer" in missing:
            for w in scan(txt, FREEZER_WORDS):
                hits["freezer"].append((where, w, txt[:150]))
        for w in scan(txt, SIZE_WORDS):
            hits["size"].append((where, w, txt[:150]))
        for w in scan(txt, CAL_WORDS):
            hits["cal"].append((where, w, txt[:150]))
        # ⚠️ LE CORPS D'UN MINEUR NE S'ÉNONCE JAMAIS. On ne cherche pas un
        # aliment: on cherche des UNITÉS DE CORPS dans le texte lu par un
        # humain. « 200 g » est un aliment et n'est pas ici; « 23 kg » ou
        # « 122 cm » le seraient. Le tri final est fait à l'œil.
        if where.startswith("shopping_list"):
            continue
        for w in scan(txt, BODY_WORDS):
            hits["body"].append((where, w, txt[:150]))
    for k, v in hits.items():
        if v:
            print(f"   ⛔ {k}: {len(v)}")
            for where, w, t in v[:8]:
                print(f"      [{w}] {where} :: {t}")
        else:
            print(f"   ✅ {k}: 0")

    print("\n  ── LA COURSE ──")
    sl = plan.get("shopping_list") or []
    print(f"   {len(sl)} lignes")
    for it in sl:
        print(f"     {it.get('term')} — {it.get('quantity')} [{it.get('aisle')}]")

    print("\n  ── LES SESSIONS ──")
    for s in plan.get("cooking_sessions") or []:
        print(f"   {s.get('day')}: {s.get('total_minutes')} min — {len(s.get('preparation_ids') or [])} préparations")
        print(f"     {s.get('run_through')}")

    print("\n  ── CE QUE LA CASSEROLE PRODUIT ──")
    for p in plan.get("preparations") or []:
        boxes = p.get("boxes") or []
        tot = sum((b.get("grams") or 0) for b in boxes)
        print(f"   {p.get('id')} « {p.get('title')} » servings_made={p.get('servings_made')} "
              f"total={p.get('total_minutes')} min actif={p.get('active_minutes')} min")
        for b in boxes:
            who = ", ".join(roster.get(m, m[:8]) for m in (b.get("member_ids") or []))
            print(f"     box {b.get('id')}: {b.get('grams')} g → {who}")


if __name__ == "__main__":
    for run in sys.argv[1:]:
        report(run)
