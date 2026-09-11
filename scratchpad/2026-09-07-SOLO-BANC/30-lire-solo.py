#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════
# LIRE UN TIR SOLO — 2026-09-07
#
#   python3 30-lire-solo.py <plan.json> <log.txt> [prompt.json] [energie.json]
#
# Il lit `portion_sizing.rows[]` du journal quand il existe (lot 2 et suivants).
# Sinon il lit `energie.json`, produit par `31-energie-solo.ts`, qui IMPORTE
# l'arithmétique du moteur — et la colonne est étiquetée « recalculé ».
#
# ⛔ RIEN N'EST RECALCULÉ EN PYTHON. Voir l'en-tête de `31-energie-solo.ts`.
import json, sys, re
from collections import Counter

def load(p, default=None):
    try:
        with open(p, encoding="utf-8") as f: return json.load(f)
    except Exception: return default

plan_p = sys.argv[1]
log_p  = sys.argv[2] if len(sys.argv) > 2 else None
prm_p  = sys.argv[3] if len(sys.argv) > 3 else None
ene_p  = sys.argv[4] if len(sys.argv) > 4 else None

plan = load(plan_p) or {}
ene  = load(ene_p) if ene_p else None
prompts = load(prm_p, []) if prm_p else []
logs = []
if log_p:
    try:
        with open(log_p, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("{"):
                    try: logs.append(json.loads(line))
                    except Exception: pass
    except Exception: pass

def h(t): print("\n" + "═" * 74 + "\n  " + t + "\n" + "═" * 74)

# ── ① LA FENÊTRE, ET LA VEILLE DE CUISINE ────────────────────────────────
h("① FENÊTRE ET TIMING")
if plan.get("error"):
    print(f"  ⛔ ERREUR: {plan.get('error')} · {json.dumps(plan.get('lock') or plan.get('issues'), ensure_ascii=False)[:300]}")
w, t = plan.get("window") or {}, plan.get("timing") or {}
print(f"  fenêtre   starts_on={w.get('starts_on')} · duration_days={w.get('duration_days')}")
print(f"  timing    kind={t.get('kind')} · reason={t.get('reason')} · lead_day={t.get('lead_day')}")
# ⛔ LA GARDE DU BANC. Après 18 h locales `leadDayFor` rend `same_morning` et
# les créneaux sont retenus: on lirait une journée vide en croyant lire un
# défaut du moteur. Un tir sans veille n'est PAS lisible.
if t.get("lead_day"):
    print(f"  ✓ veille de cuisine = {t['lead_day']} (day_before) — le tir est lisible")
else:
    print("  ⛔ AUCUNE VEILLE DE CUISINE (`same_morning`). Le tir a été lancé après 18 h "
          "locales, ou sur un plan qui commence aujourd'hui. NE PAS LIRE LES CHIFFRES.")
if (w.get("duration_days") or 0) != 1:
    print(f"  ⚠️ fenêtre de {w.get('duration_days')} jours — le banc solo vise 1 jour")

dishes = plan.get("dishes") or []
preps  = plan.get("preparations") or []
days = Counter(d.get("day") for d in dishes)
print(f"  plats {len(dishes)} · casseroles {len(preps)} · jours {dict(days)}")
if len(days) > 1:
    print("  ⚠️ des plats sur plus d'un jour — la fenêtre demandée en portait un seul")

# ── ② LE DIMENSIONNEMENT ─────────────────────────────────────────────────
h("② DIMENSIONNEMENT DES PORTIONS")
ps = None
for e in logs:
    if e.get("tag") == "keel.household_meal.portion_sizing": ps = e
if ps is None:
    ps = ((plan.get("household") or {}).get("portion_sizing"))
if ps:
    print(f"  chemin={ps.get('sizing_path')} · motif={ps.get('reason')} · appliqué={ps.get('applied')}")
    for k in ("mouths","dishes","measured","unmeasurable_by","slots","verdicts","factor_band",
              "bounds_source","target","gap_closed","extras_floored","fixed_floored",
              "fixed_slot_kcal","yield_resolution","repairs","clamped","unmet_band","verification"):
        if k in ps: print(f"    {k:20} {json.dumps(ps[k], ensure_ascii=False)}")
else:
    print("  (aucun tag `portion_sizing` — normal au lot 0/1, le module n'est pas câblé)")

# ── ③ LES PLATS, UN PAR LIGNE ────────────────────────────────────────────
h("③ LES PLATS")
rows = (ps or {}).get("rows")
if rows:
    src = "journal `portion_sizing.rows`"
    print(f"  source: {src}")
    print(f"  {'jour':4} {'créneau':10} {'titre':28} {'std kcal':>8} {'cuit g':>7} {'dens':>6} "
          f"{'cible':>6} {'fact':>5} {'cru g':>6} {'part g':>6} {'verdict':12} {'manque':>7}")
    for r in rows:
        print(f"  {str(r.get('day'))[:4]:4} {str(r.get('slot'))[:10]:10} {str(r.get('title'))[:28]:28} "
              f"{str(r.get('standard_kcal')):>8} {str(r.get('standard_cooked_g')):>7} "
              f"{str(r.get('density')):>6} {str(r.get('target_kcal')):>6} {str(r.get('factor')):>5} "
              f"{str(r.get('person_raw_g')):>6} {str(r.get('person_cooked_g')):>6} "
              f"{str((r.get('bounds') or {}).get('verdict'))[:12]:12} {str(r.get('unmet_kcal')):>7}")
elif ene:
    print(f"  source: {ene.get('source')} — ⚠️ RECALCULÉ, le journal ne porte pas encore `rows`")
    print(f"    référentiel: {ene.get('refs')} fiches · {ene.get('aliases')} alias")
    if ene.get("pot_ingredients_without_amount"):
        print(f"    ⚠️ {ene['pot_ingredients_without_amount']} ingrédient(s) de casserole SANS `amount`: "
              "comptés ENTIERS dans chaque part (seul biais de ce recalcul)")
    print(f"  {'jour':4} {'créneau':10} {'titre':30} {'std kcal':>8} {'cuit g':>7} {'kcal/100g':>9} "
          f"{'boîtes':>6}  casseroles")
    for r in ene.get("rows", []):
        k = r.get("standard_kcal")
        k = ("—" if k is None else str(k)) + ("" if r.get("complete") else "*")
        print(f"  {str(r.get('day'))[:4]:4} {str(r.get('slot'))[:10]:10} {str(r.get('title'))[:30]:30} "
              f"{k:>8} {str(r.get('standard_cooked_g') or '—'):>7} "
              f"{str(r.get('density_kcal_per_100g') or '—'):>9} {r.get('boxes',0):>6}  "
              f"{', '.join(r.get('pots') or []) or '—'}")
    inc = [r for r in ene.get("rows", []) if not r.get("complete")]
    if inc:
        print(f"\n  * {len(inc)} plat(s) d'énergie INCOMPLÈTE — `dishEnergy` rend `null` plutôt "
              "qu'une somme amputée. Motifs:")
        g = Counter(gap.get("kind") if isinstance(gap, dict) else str(gap)
                    for r in inc for gap in (r.get("gaps") or []))
        for kk, vv in g.most_common(): print(f"      {kk}: {vv}")
else:
    print("  (ni `rows` au journal, ni recalcul — passe energie.json en 4e argument)")
    for d in dishes:
        print(f"  {str(d.get('day'))[:4]:4} {str(d.get('slot'))[:10]:10} {str(d.get('title'))[:40]:40} "
              f"boîtes={len(d.get('boxes') or [])}")

# ── ④ LES BOÎTES ET LE VERDICT LEGACY ────────────────────────────────────
h("④ BOÎTES, ET LE MOTEUR LEGACY EN MESURE PURE")
nb = sum(len(d.get("boxes") or []) for d in dishes)
solo_boxes = sum(1 for d in dishes for b in (d.get("boxes") or [])
                 if len(b.get("member_ids") or []) == 1)
print(f"  boîtes {nb} · dont à une seule bouche {solo_boxes} · plats sans boîte "
      f"{sum(1 for d in dishes if not (d.get('boxes') or []))}")
hh = plan.get("household") or {}
bs = hh.get("box_sizing")
if bs:
    print("  box_sizing (le legacy, qui MESURE et n'applique rien):")
    for k in ("boxes","sized","unchanged","would_resize","anchor","anchor_cap","anchor_applied",
              "pot_attribution","pot_growth","pot_shrink","unmet","unmet_band","densify","mouths"):
        if k in bs: print(f"    {k:18} {json.dumps(bs[k], ensure_ascii=False)}")
for k in ("meals_delivered","shares","portion_quantities","vague_portions"):
    if k in hh: print(f"  {k:18} {json.dumps(hh[k], ensure_ascii=False)[:200]}")

# ── ⑤ LES COURSES ────────────────────────────────────────────────────────
h("⑤ COURSES")
sl = plan.get("shopping_list") or []
print(f"  {len(sl)} ligne(s)")
for line in sl[:12]:
    print(f"    · {json.dumps(line, ensure_ascii=False)[:150]}")
if len(sl) > 12: print(f"    … et {len(sl)-12} de plus")

# ── ⑥ LES COMPTEURS DU JOURNAL ───────────────────────────────────────────
h("⑥ COMPTEURS DU JOURNAL")
print(f"  {len(logs)} ligne(s) `keel` pour ce compte")
for e in logs:
    tag = e.get("tag", "")
    if tag.endswith(("portion_sizing",)): continue
    body = {k: v for k, v in e.items() if k not in ("tag", "user_id", "request_id")}
    s = json.dumps(body, ensure_ascii=False)
    print(f"    {tag}: {s[:220]}{'…' if len(s) > 220 else ''}")

# ── ⑦ LE PROMPT ──────────────────────────────────────────────────────────
h("⑦ LE PROMPT ARCHIVÉ")
if not prompts:
    print("  (aucune archive)")
else:
    # ⚠️ PLUSIEURS LIGNES PAR TIR: la capture précède la réécriture en mode JSON,
    # et une archive courte de 25 caractères existe. On prend la PLUS LONGUE.
    best = max(prompts, key=lambda p: (p.get("user_message_chars") or 0))
    print(f"  {len(prompts)} archive(s) · retenue: {best.get('created_at')} · "
          f"statut={best.get('status')} http={best.get('http_status')} "
          f"model={best.get('model')} json_mode={best.get('json_mode')}")
    # ⛔ `prompt_version` N'EST PAS DANS L'ARCHIVE DU PROMPT. Il est écrit dans
    # `generated_from` (`index.ts:10243`), donc UNIQUEMENT sur un tir `--write`.
    # Un `draft` ne le porte nulle part: le lire ici rendrait toujours `None` et
    # ferait passer un lot non livré pour un lot livré.
    pv = best.get("prompt_version")
    print(f"  prompt_version = {pv if pv else '(non disponible sur un draft — il vit dans '
          'generated_from, écrit seulement par --write)'}")
    um = best.get("user_message") or ""
    sm = best.get("system_prompt") or ""
    print(f"  système {len(sm)} car. · utilisateur {len(um)} car.")
    # ⛔ LES DEUX MESSAGES, PAS SEULEMENT L'UTILISATEUR. Mesuré au tir BASE: le
    # bloc de schéma des boîtes n'est NI dans l'un NI dans l'autre à une bouche,
    # et un scan du seul message utilisateur aurait fait passer cette absence
    # pour la conformité que le lot 3 vise.
    both = sm + "\n" + um
    def has(pat, text, label, want):
        found = re.search(pat, text, re.I) is not None
        mark = "✓" if found == want else "⛔"
        where = ""
        if found:
            where = " [sys]" if re.search(pat, sm, re.I) else " [usr]"
        print(f"    {mark} {label:46} {'présent' if found else 'absent'}{where} (attendu: "
              f"{'présent' if want else 'absent'})")
    # Les contrôles de la NOUVELLE méthode. Au lot 0 ils décrivent le prompt
    # d'AUJOURD'HUI — donc les trois premiers doivent ÉCHOUER, et c'est la
    # ligne de base: le lot 3 les fait passer.
    print("  contrôles du lot 3 (au lot 0 les trois premiers DOIVENT être rouges):")
    has(r"ONE standard recipe", both, "« ONE standard recipe »", True)
    has(r"100\s*kcal per 100\s*g", both, "plancher de densité normal", True)
    has(r"\(light\)", both, "le créneau léger marqué (light)", True)
    # ⛔ LA SIGNATURE EXACTE DE `buildPortionBrief`, PAS DES MOTS. Mesuré au tir
    # BASE: `\bweight \b` attrapait trois phrases de PROSE du système
    # (« that weight moves to the protein food ») et faisait croire à une fuite
    # de corps là où il n'y en avait pas. La ligne réelle est
    # `… only [height 170 cm; age band 30 to 44; gender male; weight 70 kg, …]`.
    has(r"\[height \d+ cm|age band \d|weight \d+(?:[.,]\d+)? kg", both,
        "faits de corps (cm/kg/âge)", False)
    has(r"ONE BOX PER GROUP|THE MEMBER IDS", both, "consigne de boîtes par groupe", False)
    # ⛔ LA FUITE DE KCAL. Hors les deux planchers, aucun nombre de kcal ne doit
    # atteindre le modèle — c'est la garde du lot 3 et du plancher TCA.
    leaks = [m for m in re.findall(r"\d+\s*kcal", um, re.I)
             if not re.match(r"^(100|60)\s*kcal$", m.strip(), re.I)]
    print(f"    {'✓' if not leaks else '⚠️'} kcal hors planchers dans le message utilisateur: "
          f"{len(leaks)} {leaks[:8]}")
    # Le shaker doit être DIT au modèle (« ce qu'ils ont déjà »), pas deviné.
    for pat, label in ((r"shaker|already have|WHAT THEY ALREADY", "le shaker / « already have »"),
                       (r"snack_pm|afternoon snack", "le créneau du goûter")):
        print(f"    {'✓' if re.search(pat, um, re.I) else '·'} {label}")
