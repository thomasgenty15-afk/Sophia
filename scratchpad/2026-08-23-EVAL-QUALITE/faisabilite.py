#!/usr/bin/env python3
"""L'ANGLE RÉALISTE — contrôles mécaniques sur un plan rendu.
⛔ LECTURE SEULE. ⚠️ Ce sont MES contrôles, pas ceux de la production :
aucun module du dépôt n'est importé ici, et un écart entre ce fichier et le
produit est un écart de MA lecture, pas une mesure du produit."""
import json, sys, re, unicodedata

DAYS = ["mon","tue","wed","thu","fri","sat","sun"]

def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def sing(w):
    # ⚠️ L'ORDRE COMPTE. « limes » → « lim » (règle `es` avant `s`) faisait
    # rater `lime` dans la liste de courses : un FAUX manquant.
    if len(w) <= 3: return w
    if w.endswith("ies") and len(w) > 5: return w[:-3] + "y"
    for suf in ("ches", "shes", "sses", "xes", "zes"):
        if w.endswith(suf) and len(w) > len(suf) + 2: return w[:-2]
    if w.endswith("s") and not w.endswith("ss"): return w[:-1]
    return w

def toks(s):
    return {sing(w) for w in norm(s).split() if len(w) > 2}

def main(path, ordered_days=None):
    d = json.load(open(path))
    dishes = d.get("dishes") or []
    preps = d.get("preparations") or []
    shop = d.get("shopping_list") or []
    sessions = d.get("cooking_sessions") or []
    out = {"file": path.split("/")[-1]}

    # ── ① couverture de la liste de courses ────────────────────────────
    shop_tok = [(s.get("term"), toks(s.get("term"))) for s in shop]
    def covered(term):
        t = toks(term)
        if not t: return True
        for _, st in shop_tok:
            if t <= st or st <= t: return True
        # recouvrement partiel fort (>=1 mot plein commun et >=50%)
        for _, st in shop_tok:
            inter = t & st
            if inter and len(inter) >= max(1, min(len(t), len(st)) - 1): return True
        return False
    missing = []
    for src, items in (("dish", dishes), ("prep", preps)):
        for it in items:
            for ing in it.get("ingredients") or []:
                if ing.get("in_pantry"): continue
                term = ing.get("term")
                if not covered(term):
                    missing.append(f"{src}:{it.get('name') or it.get('title') or it.get('id')} → {term}")
    out["courses_manquantes"] = sorted(set(missing))

    # ── ② conservation : jour de cuisson + 2 ──────────────────────────
    if ordered_days is None:
        seen = []
        for x in dishes:
            if x.get("day") and x["day"] not in seen: seen.append(x["day"])
        ordered_days = seen
    pos = {dd: i for i, dd in enumerate(ordered_days)}
    prep_by_id = {p.get("id"): p for p in preps}
    viol, uses_count = [], {}
    for x in dishes:
        for u in x.get("uses") or []:
            pid = u.get("preparation_id")
            uses_count[pid] = uses_count.get(pid, 0) + (u.get("servings") or 1)
            p = prep_by_id.get(pid)
            if not p: 
                viol.append(f"{x.get('day')}/{x.get('slot')} cite une préparation inconnue: {pid}")
                continue
            ck, dd = p.get("cook_on"), x.get("day")
            if ck in pos and dd in pos:
                gap = pos[dd] - pos[ck]
                if gap > 2 or gap < 0:
                    viol.append(f"{p.get('title')} cuit {ck} → mangé {dd} (J+{gap})")
    out["conservation_violations"] = viol

    # ── ③ restes : fait vs consommé ───────────────────────────────────
    out["restes"] = [
        {"prep": p.get("title"), "servings_made": p.get("servings_made"),
         "servings_used": uses_count.get(p.get("id"), 0)}
        for p in preps
        if (p.get("servings_made") or 1) != uses_count.get(p.get("id"), 0)
    ]

    # ── ④ sessions de cuisine ─────────────────────────────────────────
    out["sessions"] = [{"day": s.get("day"), "minutes": s.get("total_minutes"),
                        "preps": s.get("preparation_ids")} for s in sessions]

    # ── ⑤ quantités : absentes, ou hors bornes de plausibilité ────────
    ABS = {"olive oil": 40, "oil": 40, "butter": 60, "salt": 15, "sugar": 80,
           "eggs": 4, "egg": 4}
    nq, absurd = [], []
    for src, items in (("dish", dishes), ("prep", preps)):
        for it in items:
            label = it.get("name") or it.get("title") or it.get("id")
            made = it.get("servings_made") or 1
            for ing in it.get("ingredients") or []:
                g = ing.get("grams_raw")
                if g is None:
                    nq.append(f"{src}:{label} → {ing.get('term')} « {ing.get('quantity')} »")
                    continue
                per = g / made
                for k, cap in ABS.items():
                    if k in norm(ing.get("term") or "") and per > cap:
                        absurd.append(f"{src}:{label} → {ing.get('term')} {g} g pour {made} portion(s)")
                if per > 900:
                    absurd.append(f"{src}:{label} → {ing.get('term')} {g} g pour {made} portion(s)")
    out["sans_quantite"] = nq
    out["quantites_suspectes"] = sorted(set(absurd))

    # ── ⑥ variété ─────────────────────────────────────────────────────
    names = [x.get("name") for x in dishes]
    out["variete"] = {"plats": len(names), "distincts": len(set(names)),
                      "repetitions": sorted({n for n in names if names.count(n) > 1})}

    # ── ⑦ créneaux couverts ───────────────────────────────────────────
    out["creneaux"] = {}
    for x in dishes:
        out["creneaux"].setdefault(x.get("day"), []).append(x.get("slot"))

    # ── ⑧ ce que le plan dit du budget / des courses ─────────────────
    out["budget_mentionne"] = [l for l in (d.get("rationale") or {}).get("lines", [])
                               if re.search(r"[£$€]|budget|spend", l, re.I)]
    out["rationale"] = (d.get("rationale") or {}).get("lines", [])
    out["request_report"] = (d.get("request_report") or {}).get("lines", [])
    out["issues"] = d.get("issues") or []
    out["suggested_window"] = d.get("suggested_window")
    out["shopping_lines"] = len(shop)
    out["shopping_has_day"] = any("day" in s or "date" in s for s in shop)
    print(json.dumps(out, indent=1, ensure_ascii=False))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2].split(",") if len(sys.argv) > 2 else None)
