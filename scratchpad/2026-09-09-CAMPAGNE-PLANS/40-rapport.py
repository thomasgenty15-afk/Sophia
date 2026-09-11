#!/usr/bin/env python3
"""
LE RAPPORT D'UN CAS — assemble ce que le PRODUIT a journalisé, ce que le plan
CONTIENT, et ce que les modules de production MESURENT sur ce plan.

  python3 40-rapport.py S1 [S2 ...]

⛔ Aucun nombre n'est recalculé à la main ici: l'énergie vient de
`30-energie.ts` / `31-energie-foyer.ts` (modules de production importés),
l'enveloppe et le verdict viennent du JOURNAL de la fonction.
"""
import json, subprocess, sys, pathlib, datetime, statistics

HERE = pathlib.Path(__file__).parent
CAS = json.loads((HERE / "cas.json").read_text())
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def latest(pattern):
    xs = sorted(HERE.glob(pattern))
    return xs[-1] if xs else None


def energie(name, lane):
    plan = latest(f"plan-{name}-*.json")
    if lane == "household":
        cmd = ["deno", "run", "--allow-read", str(HERE / "31-energie-foyer.ts"), str(HERE / "ref"),
               str(plan), str(HERE / f"roster-{name}.json")]
    else:
        cmd = ["deno", "run", "--allow-read", str(HERE / "30-energie.ts"), str(HERE / "ref"),
               str(plan), str(HERE / f"body-{name}.json")]
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
    if p.returncode != 0:
        return {"__erreur__": p.stderr[-800:]}
    return json.loads(p.stdout)


def rapport(name):
    cas = CAS[name]
    lane = cas["lane"]
    plan_f = latest(f"plan-{name}-*.json")
    log_f = latest(f"log-{name}-*.json")
    draft_f = latest(f"draft-{name}-*.json")
    if plan_f is None:
        print(f"════ {name} — aucun plan")
        return
    plan = json.loads(plan_f.read_text())
    logs = json.loads(log_f.read_text()) if log_f else []
    draft = (json.loads(draft_f.read_text()) or [{}])[0] if draft_f else {}
    gf = draft.get("generated_from") or {}
    tag = {}
    for row in logs:
        tag.setdefault(row["tag"], []).append(row)

    out = {"cas": name, "titre": cas["titre"], "lane": lane}
    print(f"\n{'═' * 78}\n════ {name} · {cas['titre']}\n{'═' * 78}")
    if not plan.get("dishes"):
        print("⛔ PAS DE PLAN — réponse:", json.dumps(plan)[:300])
        print("   draft:", {k: draft.get(k) for k in ("status", "error_code", "error", "wall_ms")})
        return

    w = plan.get("window", {})
    print(f"fenêtre {w.get('starts_on')} × {w.get('duration_days')} j · "
          f"une seule session demandée={cas['one_cooking_session']} · "
          f"prompt {gf.get('prompt_version')} · mur {draft.get('wall_ms')} ms")

    # ── ① L'ENVELOPPE ET LE VERDICT, PAR LE JOURNAL DU PRODUIT ────────────
    env = (tag.get("keel.meal.envelope") or [{}])[-1]
    direc = (tag.get("keel.meal.envelope_direction") or [{}])[-1]
    scal = (tag.get("keel.meal.portion_scaling") or [{}])[-1]
    corr = (tag.get("keel.meal.composition_correction") or [{}])[-1]
    if env:
        print(f"\n① ENVELOPPE (journal du produit) : {env.get('energy_low')}–{env.get('energy_high')} kcal/j"
              f" · direction {direc.get('direction')} · écart/j {direc.get('daily_delta_kcal')}"
              f" · plancher {direc.get('energy_floor_kcal')} · cran réglé={direc.get('pace_set')}")
    if scal:
        print(f"   RATTRAPAGE (portion_scaling) : appliqué={scal.get('applied')} "
              f"abstention={scal.get('abstained')} protéine×{scal.get('protein_factor')} "
              f"autre×{scal.get('other_factor')} lignes={scal.get('lines_changed')} "
              f"plafonnées={scal.get('capped')} → verdict énergie={scal.get('verdict_energy')} "
              f"protéine={scal.get('verdict_protein')}")
    if corr:
        print(f"   CORRECTION de composition : {json.dumps(corr.get('tokens'))} "
              f"relancé={corr.get('retried')} couverture={corr.get('coverage_flag')}")

    # ── ② CE QUI EST SERVI, MESURÉ SUR L'INDEX VIVANT ─────────────────────
    e = energie(name, lane)
    out["energie"] = e
    if "__erreur__" in e:
        print("⛔ mesure impossible:", e["__erreur__"][:400])
    elif lane == "solo":
        kc = [d["kcal"] for d in e["days"] if d["kcal"] is not None]
        pr = [d["protein_g"] for d in e["days"] if d["protein_g"] is not None]
        lo, hi = env.get("energy_low"), env.get("energy_high")
        print(f"\n② SERVI (index vivant, après pliage) :")
        for d in e["days"]:
            verdict = ""
            if lo and d["kcal"] is not None:
                verdict = "dans la bande" if lo <= d["kcal"] <= hi else (
                    f"SOUS de {lo - d['kcal']}" if d["kcal"] < lo else f"AU-DESSUS de {d['kcal'] - hi}")
            print(f"   {d['day']} : {d['kcal']} kcal · {d['protein_g']} g protéine · "
                  f"{d['fibre_g']} g fibres · plats {d['counted']} · complet={d['complete']}  {verdict}")
        # ⛔ ON NE JUGE QUE LES JOURS COMPLETS. Un jour dont un plat ne résout
        # pas est SOUS-COMPTÉ, pas sous-nourri: le lire comme un manque
        # fabrique un défaut qui n'existe pas. C'est la même faute que
        # « comparer sur la moyenne de fenêtre » — un instrument qui a raison
        # d'une façon qui trompe.
        plein = [d["kcal"] for d in e["days"] if d["complete"] and d["kcal"] is not None]
        partiel = [d["day"] for d in e["days"] if not d["complete"]]
        if plein:
            moy = round(statistics.mean(plein))
            disp = round(100 * (max(plein) - min(plein)) / max(1, min(plein)))
            print(f"   JOURS COMPLETS ({len(plein)}/{len(e['days'])}) : moyenne {moy} kcal/j · "
                  f"dispersion {disp} %" + (f" · non mesurables: {partiel}" if partiel else ""))
            if lo:
                dans = sum(1 for k in plein if lo <= k <= hi)
                print(f"   → {dans}/{len(plein)} jours COMPLETS dans la bande · moyenne "
                      f"{'DANS' if lo <= moy <= hi else 'HORS'} la bande")
        if pr:
            wkg = json.loads((HERE / f'body-{name}.json').read_text())["weightKg"]
            print(f"   protéine {min(pr)}–{max(pr)} g/j = {round(min(pr)/wkg,1)}–{round(max(pr)/wkg,1)} g/kg")
        r = e["resolution"]
        print(f"   couverture : {r['resolved']} résolus · inconnus {r['unresolved_terms']} · "
              f"non pesés {r['unweighed_terms']}")
    else:
        print(f"\n② SERVI PAR BOUCHE (mouthDayEnergy) :")
        for c in e["cibles"]:
            print(f"   · {c['name']:8s} {str(c['age']):>3} ans {str(c['weight']):>5} kg "
                  f"{(c['goal'] or '—'):12s} {(c['diet'] or '—'):11s} "
                  f"cible {c['target_kcal']} kcal/j ({c['target_reason']})")
        par = {}
        for r in e["par_bouche"]:
            par.setdefault(r["name"], []).append(r)
        cible = {c["name"]: c["target_kcal"] for c in e["cibles"]}
        for nom, rows in par.items():
            for r in rows:
                t = cible.get(nom)
                pc = f"{round(100*r['kcal']/t)} %" if (t and r["kcal"] is not None) else "—"
                print(f"   {nom:8s} {r['day']:4s} {str(r['kcal']):>6} kcal ({pc:>5}) · "
                      f"plats {r['counted']} · moments {r['slots']} · {r['grams']} g · "
                      f"complet={r['complete']} manques={r['gaps']}")
        for t in ("keel.household_meal.box_sizing", "keel.household_meal.meals_delivered",
                  "keel.household_meal.cooking_shape", "keel.household_meal.dietary_regime",
                  "keel.household_meal.member_allergies", "keel.household_meal.composition"):
            for row in tag.get(t, []):
                print(f"   [{t.split('.')[-1]}] " + json.dumps(
                    {k: v for k, v in row.items()
                     if k not in ("tag", "user_id", "household_id", "request_id")})[:600])

    # ── ③ LA CUISINE, LE FROID, LES COURSES ───────────────────────────────
    preps = {p["id"]: p for p in plan.get("preparations", [])}
    sessions = plan.get("cooking_sessions", [])
    print(f"\n③ CUISINE : {len(sessions)} session(s) · "
          + " | ".join(f"{s.get('day')} {s.get('total_minutes')} min "
                       f"({len(s.get('preparation_ids', []))} prép.)" for s in sessions))
    kept = {}
    ecarts = []
    start = datetime.date.fromisoformat(w["starts_on"])
    dayidx = {}
    for i in range(int(w["duration_days"])):
        dayidx[DAYS[(start + datetime.timedelta(days=i)).weekday()]] = i
    for d in plan["dishes"]:
        for u in d.get("uses", []):
            k = u.get("kept")
            kept[k] = kept.get(k, 0) + 1
            p = preps.get(u.get("preparation_id"))
            if p and p.get("cook_on") in dayidx and d.get("day") in dayidx:
                ecarts.append((dayidx[d["day"]] - dayidx[p["cook_on"]], k, d.get("name")))
    print(f"   conservation : {len(kept) and kept} · "
          f"préparations {len(preps)} ({', '.join(str(p.get('servings_made')) + ' portions' for p in preps.values())})")
    if ecarts:
        froid = [x for x in ecarts if x[1] == "fridge"]
        cong = [x for x in ecarts if x[1] == "freezer"]
        print(f"   écart cuisson→repas : frigo max {max([x[0] for x in froid], default='—')} j "
              f"({len(froid)} reprises) · congélateur max {max([x[0] for x in cong], default='—')} j "
              f"({len(cong)} reprises)")
        trop = [x for x in froid if x[0] > 3]
        if trop:
            print(f"   ⛔ {len(trop)} reprise(s) au FRIGO au-delà de 3 jours : {trop}")
    sl = plan.get("shopping_list", []) or []
    vagues = {}
    for line in sl:
        vagues[line.get("buy_on")] = vagues.get(line.get("buy_on"), 0) + 1
    gel = sum(1 for line in sl if line.get("freeze_on_purchase"))
    print(f"   courses : {len(sl)} lignes · vagues {vagues} · à congeler à l'achat {gel}")
    titres = [d.get("title") or d.get("name") for d in plan["dishes"]]
    print(f"   répétition : {len(titres)} plats servis, {len(set(titres))} intitulés distincts")

    # ── ④ CE QUE LE PRODUIT DIT DE LUI-MÊME ───────────────────────────────
    print("\n④ CE QUE LE PLAN DIT :")
    for line in (plan.get("rationale") or {}).get("lines", []):
        print("   ·", line)
    for line in (plan.get("explanation") or {}).get("lines", []):
        print("   »", line)
    rr = (plan.get("request_report") or {}).get("lines", [])
    for line in rr:
        print("   ⤷", line)
    for i in plan.get("issues", []):
        print("   ⚠", i)
    return out


for n in sys.argv[1:]:
    rapport(n)
