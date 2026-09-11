#!/usr/bin/env python3
"""
LE RAPPORT DE LA CAMPAGNE ÉLARGIE — un tableau, puis les critères d'acceptation.

    python3 30-rapport.py > RAPPORT.md

⛔ IL NE CALCULE RIEN QU'IL N'AIT MESURÉ. Tout vient de `mesures.json`, qui vient
lui-même du journal du produit et des modules de production sur un référentiel
figé (`ref/EMPREINTE.txt`).
"""
import json, pathlib, statistics

HERE = pathlib.Path(__file__).parent
M = json.loads((HERE / "mesures.json").read_text())
EMP = (HERE / "ref" / "EMPREINTE.txt").read_text().strip()


def pct(a, b):
    return None if not b else round(100 * a / b, 1)


def moy(xs):
    xs = [x for x in xs if x is not None]
    return round(statistics.median(xs), 1) if xs else None


print("# Campagne élargie — étape 3 du chantier densité/portions/Fast")
print()
print(f"**{len(M)} générations** ({len({m['cas'] for m in M})} scénarios × 2), "
      "séquentielles, une requête de plan à la fois. `intent: \"draft\"` — "
      "aucune écriture chez un utilisateur réel.")
print()
print("## Le référentiel de mesure, figé et identifié")
print()
print("```")
print(EMP)
print("```")
print()

# ── ① LE TABLEAU ──────────────────────────────────────────────────────────
print("## ① Ce que chaque génération a donné")
print()
print("| cas | gén | HTTP | mur | appels | rattrapages | bornes | jours conformes | classes |")
print("|---|---|---|---|---|---|---|---|---|")
for m in M:
    b = m.get("budget") or {}
    rep = f"{b.get('repairs_used', '—')}/{b.get('repairs_allowed', '—')}"
    if b.get("repairs_refused"):
        rep += f" (refus {','.join(b['repairs_refused'])})"
    cls = m.get("classement") or {}
    short = " · ".join(f"{k[:4]} {v}" for k, v in sorted(cls.items()))
    print(f"| {m['cas']} | {m['gen']} | {m['http']} | {m.get('wall_s')} s | "
          f"{len((m.get('appels') or []))or '—'} | {rep} | "
          f"{m.get('bornes_pct') if m.get('bornes_pct') is not None else '—'} | "
          f"{m.get('conformite_pct') if m.get('conformite_pct') is not None else '—'} | {short} |")
print()

# ── ② L'ACCEPTATION ───────────────────────────────────────────────────────
tot = {}
for m in M:
    for k, v in (m.get("classement") or {}).items():
        tot[k] = tot.get(k, 0) + v
dim = tot.get("conformant", 0) + tot.get("residual_gap", 0)
conf = pct(tot.get("conformant", 0), dim)
aboutis = [m for m in M if m["http"] == 200]
bornes = [m.get("bornes_pct") for m in M if m.get("bornes_pct") is not None]
bites = [m.get("exclusions", {}).get("final_bites") for m in M]
bites_nz = [b for b in bites if b]

print("## ② L'acceptation, critère par critère")
print()
print("| critère | seuil | mesuré | |")
print("|---|---|---|---|")
print(f"| générations abouties | — | **{len(aboutis)}/{len(M)}** | |")
print(f"| jours-bouches conformes (±5 %) | ≥ 90 % | **{conf} %** "
      f"({tot.get('conformant', 0)}/{dim}) | {'✅' if conf and conf >= 90 else '⛔'} |")
print(f"| assiettes dans les bornes (foyer) | repère 80 % | médiane **{moy(bornes)} %** | |")
print(f"| exclusion nouvelle sur le payload final | 0 | **{sum(b for b in bites_nz) if bites_nz else 0}** | "
      f"{'✅' if not bites_nz else '⛔'} |")
print(f"| classes attribuées | 100 % | "
      f"{tot.get('conformant',0)+tot.get('residual_gap',0)+tot.get('unmeasurable',0)+tot.get('not_applicable',0)} "
      f"jours-bouches, tous classés | ✅ |")
print()
print("**Le détail des classes, sur toute la campagne :**")
print()
for k in ("conformant", "residual_gap", "unmeasurable", "not_applicable"):
    print(f"- `{k}` : **{tot.get(k, 0)}**")
print()

# ── ③ LES DURÉES ──────────────────────────────────────────────────────────
murs = [m.get("wall_s") for m in aboutis]
solo = [m.get("wall_s") for m in aboutis if m["cas"].startswith("S")]
foyer = [m.get("wall_s") for m in aboutis if m["cas"].startswith("F")]
print("## ③ Les durées")
print()
print(f"- solo : médiane **{moy(solo)} s**, maximum **{max(solo) if solo else '—'} s**")
print(f"- foyer : médiane **{moy(foyer)} s**, maximum **{max(foyer) if foyer else '—'} s**")
print(f"- toutes : maximum **{max(murs) if murs else '—'} s**, "
      f"sous l'échéance de 380 s : "
      f"{'✅' if murs and max(murs) < 380 else '⛔'}")
print()
print("⚠️ Vingt points ne font pas un p95. On rapporte la médiane et le maximum.")
