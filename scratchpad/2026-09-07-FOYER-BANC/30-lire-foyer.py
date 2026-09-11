#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════
# LIRE UN TIR FOYER — 2026-09-07
#
#   python3 30-lire-foyer.py <log.txt> [plan.json]
#
# ⛔ ON LIT LES COMPTEURS, ON NE LES RECALCULE PAS. Un lecteur qui refait
# l'arithmétique du moteur mesure son propre instrument: c'est la cicatrice
# « un compteur qui nomme son arbitre le fige ». Tout ce qui est imprimé ici
# vient du journal du runtime, tel quel.
# ══════════════════════════════════════════════════════════════════════════
import json
import sys
from collections import OrderedDict


def tags(path):
    out = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def first(rows, tag):
    for r in rows:
        if r.get("tag") == tag:
            return r
    return None


def show(title, row, keys=None):
    print(f"\n── {title} " + "─" * max(0, 62 - len(title)))
    if row is None:
        print("   (absent du journal)")
        return
    for k, v in row.items():
        if k in ("tag", "user_id", "request_id"):
            continue
        if keys is not None and k not in keys:
            continue
        if isinstance(v, (dict, list)):
            v = json.dumps(v, ensure_ascii=False, sort_keys=True)
        print(f"   {k:28} {v}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    rows = tags(sys.argv[1])
    plan = None
    if len(sys.argv) > 2:
        try:
            plan = json.load(open(sys.argv[2], encoding="utf-8"))
        except Exception:
            plan = None

    print(f"══ {len(rows)} tags keel dans le journal")

    # ── LA GRILLE (lot 9) ────────────────────────────────────────────────
    cells = first(rows, "keel.household_meal.cells")
    show("LA GRILLE DES CASES", cells)
    if cells is not None:
        ded = cells.get("dedicated_by_reason") or {}
        print()
        print(f"   ⇒ {cells.get('non_empty', 0)} cases pleines, "
              f"{cells.get('empty', 0)} vides sur {cells.get('cells', 0)}")
        print(f"   ⇒ plats à part: {cells.get('dedicated_cells', 0)} cases, "
              f"{cells.get('dedicated_mouths', 0)} bouches "
              f"(régime {ded.get('regime', 0)}, repas à soi {ded.get('own_meal', 0)})")
        print(f"   ⇒ léger: {cells.get('light', 0)} cases; "
              f"demandé sans être obtenu: {cells.get('light_mixed', 0)}")
        delta = cells.get("dish_bearing_delta", 0)
        mark = "IDENTIQUE" if delta == 0 else "ÉCART"
        print(f"   ⇒ règle du plat à part vs celle d'aujourd'hui: {mark} ({delta})"
              f"  [grille seule {cells.get('dish_bearing_only_cells', 0)},"
              f" lane seule {cells.get('dish_bearing_only_current', 0)}]")

    # ── CE QUI DOIT RESTER IDENTIQUE À LA LIGNE DE BASE ──────────────────
    ps = first(rows, "keel.household_meal.portion_sizing")
    show("DIMENSIONNEMENT (témoin d'identité)", ps,
         keys={"sizing_path", "reason", "applied", "mouths", "dishes", "measured"})

    # ── L'APPLICATION (lots 12-13) ───────────────────────────────────────
    if isinstance(ps, dict) and ps.get("applied"):
        print("\n── LE MOTEUR A POSÉ LES GRAMMES " + "─" * 31)
        for k in ("mouths", "dishes", "measured"):
            print(f"   {k:28} {ps.get(k)}")
        for k in ("apply", "verdicts", "lids", "day_kcal", "bounds_source",
                  "eaters_by_dish", "repair_needs"):
            v = ps.get(k)
            if v:
                print(f"   {k:28} {json.dumps(v, ensure_ascii=False, sort_keys=True)}")
        verd = ps.get("verdicts") or {}
        tot = sum(verd.values()) or 1
        inb = verd.get("in_bounds", 0)
        dk = ps.get("day_kcal") or {}
        rn = ps.get("repair_needs") or {}
        print("\n   ── critères de bascule ──")
        def crit(label, ok, detail):
            print(f"   {'✓' if ok else '·'} {label:36} {detail}")
        crit("journée à ±5 %", dk.get("within_5pct", 0) == dk.get("rows", 0) and dk.get("rows", 0) > 0,
             f"{dk.get('within_5pct', 0)}/{dk.get('rows', 0)}")
        crit("assiettes dans les bornes ≥ 80 %", inb / tot >= 0.8, f"{inb}/{tot}")
        crit("aucun bac d'un seul nom", (ps.get("lids") or {}).get("tub_of_one", 1) == 0,
             str((ps.get("lids") or {}).get("tub_of_one")))
        crit("aucun mangeur non dimensionné", (ps.get("apply") or {}).get("eaters_unsized", 1) == 0,
             str((ps.get("apply") or {}).get("eaters_unsized")))
        crit("réparations qui seraient demandées", True,
             f"{rn.get('would_ask', 0)} — {json.dumps(rn.get('by_reason') or {}, ensure_ascii=False)}")

    # ── L'OMBRE (lot 10) ─────────────────────────────────────────────────
    sh = (ps or {}).get("shadow")
    print("\n── L'OMBRE : ce que le moteur SERVIRAIT " + "─" * 25)
    if not isinstance(sh, dict) or not sh.get("enabled"):
        print(f"   éteinte ({(sh or {}).get('reason', '?')})")
    else:
        for k in ("mouths", "dishes", "measured", "eater_rows", "pots"):
            print(f"   {k:28} {sh.get(k)}")
        for k in ("unmeasurable_by", "verdicts", "bounds_source", "no_target",
                  "lids", "day_kcal", "pot_factor_band", "eaters_by_dish"):
            v = sh.get(k)
            if v:
                print(f"   {k:28} {json.dumps(v, ensure_ascii=False, sort_keys=True)}")
        cmp_ = sh.get("lid_compare") or {}
        print(f"   lid_compare                  "
              f"{json.dumps(cmp_, ensure_ascii=False, sort_keys=True)}")

        # ── LES CRITÈRES DE BASCULE, LUS TELS QUELS ──────────────────────
        er, meas = sh.get("eater_rows", 0), sh.get("measured", 0)
        dishes, verd = sh.get("dishes", 0), sh.get("verdicts") or {}
        inb = verd.get("in_bounds", 0)
        tot_v = sum(verd.values()) or 1
        dk = sh.get("day_kcal") or {}
        dk_rows = dk.get("rows", 0) or 1
        print("\n   ── prêt à basculer ? ──")
        def crit(label, ok, detail):
            print(f"   {'✓' if ok else '·'} {label:34} {detail}")
        crit("plats mesurés ≥ 90 %", dishes and meas / dishes >= 0.9,
             f"{meas}/{dishes}")
        crit("verdicts dans les bornes ≥ 80 %", inb / tot_v >= 0.8,
             f"{inb}/{tot_v}")
        crit("journée à ±5 % ≥ 90 %", dk.get("within_5pct", 0) / dk_rows >= 0.9,
             f"{dk.get('within_5pct', 0)}/{dk.get('rows', 0)}")
        crit("aucun bac d'un seul nom", (sh.get("lids") or {}).get("tub_of_one", 1) == 0,
             str((sh.get("lids") or {}).get("tub_of_one")))
        over = (cmp_.get("own_delta_band") or {}).get("over_25", 0)
        comp = cmp_.get("own_compared", 0)
        crit("boîtes du modèle à > 25 % d'écart", True,
             f"{over}/{comp} (information, pas un critère)")
        crit("mineurs sous-servis par le modèle", True,
             f"{cmp_.get('minor_model_below_engine', 0)}/{cmp_.get('minor_rows', 0)}"
             f" · {cmp_.get('minor_in_tub', 0)} au bac, donc inattribuables")
        crit("couvercles groupés autrement", True,
             f"{cmp_.get('lid_shape_mismatch', 0)} — le modèle ne groupe pas"
             " comme le moteur (argument du lot 11)")
        # Les lignes, groupées par seau.
        by_bucket = {}
        for r in sh.get("rows") or []:
            b = by_bucket.setdefault(r.get("eater_bucket", "?"),
                                     {"n": 0, "g": [], "f": []})
            b["n"] += 1
            if r.get("person_cooked_g") is not None:
                b["g"].append(r["person_cooked_g"])
            b["f"].append(r.get("factor"))
        if by_bucket:
            print("\n   ── par seau de mangeur ──")
            for b, v in sorted(by_bucket.items()):
                gs = sorted(v["g"])
                fs = [f for f in v["f"] if isinstance(f, (int, float))]
                med = gs[len(gs) // 2] if gs else "—"
                print(f"   {b:24} {v['n']:3} lignes · grammes médians {med} · "
                      f"facteur {min(fs) if fs else '—'}…{max(fs) if fs else '—'}")
    show("BOÎTES (témoin d'identité)", first(rows, "keel.household_meal.box_sizing"),
         keys={"applied", "anchor", "anchor_applied", "would_resize", "unmet",
               "unmet_band", "pot_growth", "pot_shrink", "mouths"})
    show("LIVRAISON", first(rows, "keel.household_meal.meals_delivered"))

    # ── LE PLAN, EN SURFACE ─────────────────────────────────────────────
    if isinstance(plan, dict):
        dishes = plan.get("dishes") or []
        print(f"\n── LE PLAN " + "─" * 56)
        print(f"   timing        {json.dumps(plan.get('timing'), ensure_ascii=False)}")
        print(f"   plats         {len(dishes)}")
        by_cell = OrderedDict()
        for d in dishes:
            key = f"{d.get('day')}/{d.get('slot')}"
            by_cell.setdefault(key, []).append(d)
        for key, ds in by_cell.items():
            marks = []
            for d in ds:
                who = d.get("member_id")
                marks.append(f"{d.get('title', '?')[:34]}{' [pour ' + who[:8] + ']' if who else ''}")
            print(f"   {key:16} {' | '.join(marks)}")
        for issue in (plan.get("issues") or [])[:12]:
            print(f"   issue         {issue}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
