"""
CE QUE LE TIR DIT — lecture d'un plan de la campagne de mesure (arbitrage 7).

⛔ ON LIT LES COMPTEURS DU MOTEUR (household.*), on ne les recalcule pas — sauf
trois choses qu'aucun compteur ne porte : la variété (titres distincts), les
courses orphelines (termes que ni plat ni casserole ne réclame), et l'explication
IA (présente, ≤ 8 lignes, qui nomme un arbitrage). Les EXPECT sont écrits ici
AVANT le tir ; un cas qui ne les tient pas est FAIL, un chemin JSON absent est
INCONCLUSIVE, jamais PASS par défaut.

  python3 lire.py <CAS> <plan.json>
"""
import json, re, sys
from collections import Counter, defaultdict

cas, path = sys.argv[1], sys.argv[2]
d = json.load(open(path, encoding="utf-8"))
verdicts = []
def fail(msg): verdicts.append(("FAIL", msg))
def warn(msg): verdicts.append(("WARN", msg))
def inc(msg): verdicts.append(("INCONCLUSIVE", msg))
def ok(msg): verdicts.append(("PASS", msg))

if not d.get("ok"):
    print(f"⛔ REFUS: {json.dumps({k: v for k, v in d.items() if k not in ('meal','dishes')}, ensure_ascii=False)[:500]}")
    print("VERDICT: FAIL refus")
    sys.exit(0)

root = d
meal = d.get("meal") if isinstance(d.get("meal"), dict) else {}
dishes = d.get("dishes") or meal.get("dishes") or []
preps = d.get("preparations") or meal.get("preparations") or []
sessions = d.get("cooking_sessions") or meal.get("cooking_sessions") or []
shop = d.get("shopping_list") or meal.get("shopping_list") or []
hh = d.get("household") or {}
solo = not hh
expl = (d.get("explanation") or {}).get("lines") or []
rat = (d.get("rationale") or {}).get("lines") or []
window = d.get("window") or {}
sugg = d.get("suggested_window") or {}
fixture_style = {"M01": "balanced", "M02": "minimal", "M03": "balanced", "M04": "minimal", "M05": "balanced",
                 "M06": "minimal", "M07": "keen", "M08": "minimal", "M09": "balanced", "M10": "keen",
                 "M11": "balanced", "M12": "balanced"}.get(cas, "?")
style_minutes = {"minimal": 30, "balanced": 60, "keen": 120}.get(fixture_style, 0)

# ── temps et fenêtre ──────────────────────────────────────────────────────
print(f"window {json.dumps(window, ensure_ascii=False)} · suggested {json.dumps(sugg, ensure_ascii=False)}")
print(f"timing {json.dumps(d.get('timing'), ensure_ascii=False)[:200]}")

# ── invariant et relances ─────────────────────────────────────────────────
md = hh.get("meals_delivered") or {}
if not solo:
    if "missing" not in md: inc("meals_delivered absent")
    else:
        print(f"meals_delivered missing={md.get('missing')} retry={md.get('retry_attempts')}/{md.get('retry_accepted')} merged={md.get('retry_merged_cells')} restored={md.get('restored')} by_cause={json.dumps(md.get('by_cause'))}")
        (ok if md.get("missing") == 0 else fail)(f"personne sans repas: missing={md.get('missing')}")
        # ⛔ UNE CASE SANS PLAT n'est pas un manque pour l'invariant (trou du plan, porté par
        # `emptySlots`) — mais un plan de 6 jours composé sur 2 (M10) est un défaut entier.
        cwd = md.get("cells_without_dish") or 0
        # Un plan du jour même laisse tomber les moments déjà passés (M11: petit-déjeuner et
        # déjeuner) — ces cases-là ne sont pas un trou.
        same_day = (d.get("timing") or {}).get("reason") == "starts_today"
        tol = 3 if same_day else 0
        (ok if cwd <= tol else fail)(f"cases sans plat (trou du plan): {cwd}" + (" (jour même: moments passés tolérés)" if same_day else ""))

if solo:
    es = [i for i in (d.get("issues") or []) if str(i).startswith("empty_slots")]
    (ok if not es else fail)("cases sans plat (solo): " + (es[0][:90] if es else "aucune"))

# ── ceintures et dénominateur ─────────────────────────────────────────────
rb = hh.get("regime_belt") or {}; eb = hh.get("exclusion_belt") or {}; sw = hh.get("swap") or {}
if not solo:
    print(f"regime_belt mouths={rb.get('mouths')} bites={rb.get('bites')} separated={rb.get('separated')}/{rb.get('not_separated')} refused={rb.get('refused')} repaired={rb.get('citation_repaired')}/{rb.get('item_repaired')}")
    print(f"exclusion_belt mouths={eb.get('mouths')} bites={eb.get('bites')} separated={eb.get('separated')}/{eb.get('not_separated')} refused={eb.get('refused')}")
    print(f"swap strictest={sw.get('strictest')} free={sw.get('free_mouths')} cells={sw.get('cells_carrying')}/{sw.get('cells_checked')} absent={sw.get('cells_swap_absent')} flagrant={sw.get('flagrant')} retry={sw.get('retry_attempts')}/{sw.get('retry_accepted')}")
    if rb.get("mouths", 0) > 0:
        # `refused` compte les retraits AVANT relance/fusion; le plan final se juge sur `missing`.
        (ok if rb.get("refused") == 0 else warn)(f"régime: refused={rb.get('refused')} retraits avant relance (plan final: missing={md.get('missing')})")
        if sw.get("cells_checked", 0) > 0:
            (fail if sw.get("flagrant") else ok)(f"table au régime de la minorité: flagrant={sw.get('flagrant')}")
            ratio = sw.get("cells_carrying", 0) / max(1, sw.get("cells_checked", 1))
            (ok if ratio >= 0.5 else warn)(f"composant carné pour les omnivores: {sw.get('cells_carrying')}/{sw.get('cells_checked')} déjeuners-dîners")
    if eb.get("mouths", 0) > 0:
        (ok if eb.get("refused") == 0 else warn)(f"dégoût: refused={eb.get('refused')} retraits avant relance (plan final: missing={md.get('missing')})")

# ── boîtes, énergie ───────────────────────────────────────────────────────
bs = hh.get("box_sizing") or {}
if not solo and bs:
    an = bs.get("anchor") or {}; ub = bs.get("unmet_band") or {}; dz = bs.get("densify") or {}; pg = bs.get("pot_growth") or {}
    print(f"anchor anchored={an.get('anchored')} clamped={an.get('clamped')} · unmet_band lt200={ub.get('lt_200')} gte200={ub.get('gte_200')} · densify moved={dz.get('moved_g')}g closed={dz.get('closed_kcal')} remaining_gte200={dz.get('remaining_gte_200')} stopped={json.dumps(dz.get('stopped'))} · pot_growth={json.dumps(pg)}")
    md_days = dz.get("mouth_days") or 0
    if md_days:
        rem = dz.get("remaining_gte_200", 0)
        (ok if rem == 0 else (warn if rem <= md_days / 3 else fail))(f"journées-bouche encore ≥200 kcal sous le besoin après densification: {rem}/{md_days}")
        (ok if (an.get("clamped") or 0) <= md_days / 2 else warn)(f"facteur d'ancrage plafonné: {an.get('clamped')}/{md_days}")
    bx = hh.get("boxes") or {}
    print(f"boxes {json.dumps(bx)[:200]}")

# ── variété ───────────────────────────────────────────────────────────────
mains = [x for x in dishes if x.get("slot") in ("lunch", "dinner")]
others = [x for x in dishes if x.get("slot") not in ("lunch", "dinner")]
mt = Counter(x.get("title", "") for x in mains); ot = Counter(x.get("title", "") for x in others)
top = mt.most_common(1)[0][1] if mt else 0
print(f"variété principaux {len(mains)} plats / {len(mt)} titres (max répétition {top}) · autres {len(others)} / {len(ot)} titres · casseroles {len(preps)} · sessions {[(s.get('day'), s.get('total_minutes')) for s in sessions]}")
if mains:
    cap = {"minimal": 99, "balanced": 3, "keen": 2}.get(fixture_style, 99)
    (ok if top <= cap else fail)(f"variété ({fixture_style}): un plat principal revient {top}× (plafond {cap})")
    if others:
        (ok if len(ot) >= max(3, len(others) // 3) else warn)(f"collations/petits-déjeuners: {len(ot)} titres pour {len(others)} plats")

# ── sessions vs style ─────────────────────────────────────────────────────
over = [s for s in sessions if (s.get("total_minutes") or 0) > style_minutes * 1.25] if style_minutes else []
so = d.get("session_overruns") or meal.get("session_overruns") or []
print(f"session_overruns={len(so)} · sessions au-delà de {style_minutes} min ×1,25: {len(over)}")
if style_minutes: (ok if not over else fail)(f"temps de session ({fixture_style} = {style_minutes} min): {len(over)} dépassement(s)")

# ── courses : orphelines et marques congélation ───────────────────────────
def norm(t): return re.sub(r"\s+", " ", str(t or "").strip().lower())
claimed = set()
for x in dishes:
    for i in x.get("ingredients") or []: claimed.add(norm(i.get("term")))
for q in preps:
    for i in q.get("ingredients") or []: claimed.add(norm(i.get("term")))
orphans = [l.get("term") for l in shop if norm(l.get("term")) and not any(norm(l.get("term")) in c or c in norm(l.get("term")) for c in claimed)]
keys = set()
for l in shop: keys |= set(l.keys())
frozen_marks = sum(1 for l in shop if any("freez" in k or "congel" in k for k in l.keys()) and any(l.get(k) for k in l.keys() if "freez" in k or "congel" in k))
print(f"courses {len(shop)} lignes · clés {sorted(keys)} · orphelines {len(orphans)} {orphans[:4]} · marques congélation {frozen_marks} · buy_on {Counter(l.get('buy_on') for l in shop)}")
(ok if len(orphans) <= 1 else warn)(f"lignes de courses réclamées par aucun plat/casserole: {len(orphans)}")

# ── explication IA ────────────────────────────────────────────────────────
print(f"explication ({len(expl)} lignes): " + " | ".join(str(x)[:120] for x in expl[:8]))
print(f"rationale ({len(rat)} lignes): " + " | ".join(str(x)[:90] for x in rat[:6]))
if not expl: fail("explication IA VIDE")
elif len(expl) > 8: fail(f"explication IA trop longue: {len(expl)} lignes")
else:
    txt = " ".join(expl).lower()
    # ⟳ 2026-09-06 — le modèle nomme ses choix sans le mot « plutôt » : « préparée jeudi puis
    # servie vendredi, afin de respecter… tout en gardant… », « privilégiés pour garder… ».
    # On lit la FORME du choix (ce qui est fait + ce qui est préservé), pas un lexique fermé.
    names = any(w in txt for w in ("plutôt", "remplac", "au lieu", "j'ai choisi", "compromis", "gardé", "évit", "instead", "rather", "traded", "chose",
                                   "afin de", "tout en", "privilégi", "conserv", "pour garder", "pour respecter", "sans répéter", "séparé"))
    (ok if names else warn)("l'explication nomme un choix/arbitrage" if names else "l'explication ne nomme aucun arbitrage")
    guilt = any(w in txt for w in ("malgré", "à cause de", "grâce à", "dommage", "malheureusement"))
    (fail if guilt else ok)("porte anti-culpabilisation: " + ("MORD" if guilt else "propre"))

# ── jour même ─────────────────────────────────────────────────────────────
if cas in ("M11", "M12"):
    today = (d.get("timing") or {}).get("today") or ""
    print(f"jour même: today={today} starts_on={window.get('starts_on')} shifted={sugg.get('shifted')}")
    r = " ".join(rat).lower()
    if cas == "M11":
        (ok if window.get("starts_on") == today or not today else fail)(f"M11: le plan démarre aujourd'hui (starts_on={window.get('starts_on')})")
        (ok if "aujourd" in r and ("course" in r or "entam" in r) else fail)("M11: la rationale explique les repas du jour sautés pour les courses")
    else:
        (ok if sugg.get("shifted") == "shopping_cutoff" else fail)(f"M12: décalé au lendemain pour les courses (shifted={sugg.get('shifted')})")
        (ok if "course" in r or "demain" in r else warn)("M12: la rationale dit pourquoi le plan démarre demain")

# ── verdict ───────────────────────────────────────────────────────────────
for lvl, msg in verdicts: print(f"  [{lvl}] {msg}")
levels = [l for l, _ in verdicts]
print("VERDICT:", "FAIL" if "FAIL" in levels else "INCONCLUSIVE" if "INCONCLUSIVE" in levels else "WARN" if "WARN" in levels else "PASS")
