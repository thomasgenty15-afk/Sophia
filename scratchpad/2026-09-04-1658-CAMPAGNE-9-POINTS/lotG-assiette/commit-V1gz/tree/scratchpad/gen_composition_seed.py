#!/usr/bin/env python3
"""FF-038 — le seed du référentiel de composition, extrait de Ciqual.

Source: ANSES-CIQUAL 2020 (XML), licence Etalab, via data.gouv.fr.
Le script est gardé dans scratchpad/ pour que la migration soit REJOUABLE:
un seed écrit à la main est un seed que personne ne sait régénérer.

Il ne devine rien. Un motif du catalogue qui ne matche aucun aliment Ciqual,
ou qui en matche un dont le nom ne ressemble pas à ce qu'on cherchait, sort en
clair dans le rapport — et se corrige dans `ciqual_catalogue.py`, pas ici.
"""
import io
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ciqual_catalogue import CATALOGUE, MANUAL  # noqa: E402

HERE = Path(__file__).parent
CIQUAL = HERE / "ciqual"

# Les constantes Ciqual dont on a besoin, et rien de plus.
C_ENERGY = "328"    # Energie, Règlement UE 1169/2011 (kcal/100 g)
C_PROTEIN = "25000"  # Protéines, N x facteur de Jones (g/100 g)
C_CARBS = "31000"   # Glucides (g/100 g)
C_FAT = "40000"     # Lipides (g/100 g)
C_FIBER = "34100"   # Fibres alimentaires (g/100 g)
C_CALCIUM = "10200"  # mg
C_IRON = "10260"    # mg
C_ZINC = "10300"    # mg
C_IODINE = "10530"  # µg
C_B12 = "56600"     # µg
C_FOLATE = "56700"  # µg
C_EPA = "42053"     # g
C_DHA = "42263"     # g

WANTED = {
    C_ENERGY, C_PROTEIN, C_CARBS, C_FAT, C_FIBER, C_CALCIUM, C_IRON,
    C_ZINC, C_IODINE, C_B12, C_FOLATE, C_EPA, C_DHA,
}

# ── LES SEUILS « SOURCE DE » ──────────────────────────────────────────────
# Règlement (CE) 1924/2006, annexe: « source de » = 15 % de la VNR pour 100 g.
# VNR: calcium 800 mg, fer 14 mg, zinc 10 mg, iode 150 µg, B12 2,5 µg,
# folates 200 µg. Les seuils ci-dessous en sont le produit, pas une opinion.
SOURCE_THRESHOLDS = {
    "calcium_source": (C_CALCIUM, 120.0),
    "iron_source": (C_IRON, 2.1),
    "zinc_source": (C_ZINC, 1.5),
    "iodine_source": (C_IODINE, 22.5),
    "b12_source": (C_B12, 0.375),
    "folate_source": (C_FOLATE, 30.0),
}
# EPA+DHA: pas de VNR réglementaire utilisable ici. 0,3 g/100 g est une
# constante OPÉRATIONNELLE, choisie pour que la sentinelle veuille dire
# « poisson gras » — le cabillaud (~0,2) n'en est pas un, le maquereau si.
OMEGA3_MARINE_G = 0.3


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def load_alims():
    raw = io.open(CIQUAL / "alim_2020_07_07.xml", encoding="cp1252").read()
    out = {}
    for m in re.finditer(
        r"<alim_code>\s*(\d+)\s*</alim_code>.*?<alim_nom_fr>(.*?)</alim_nom_fr>",
        raw, re.S,
    ):
        out[m.group(1)] = m.group(2).strip()
    return out


def load_compo():
    """Toutes les teneurs utiles, pour TOUS les aliments.

    Chargé en entier (et pas seulement pour les codes retenus) parce que le
    choix de l'aliment DÉPEND de la donnée: Ciqual 2020 laisse l'énergie vide
    sur beaucoup de formes crues (« Brocoli, cru » n'en a pas), et une
    sélection faite avant de regarder les teneurs retiendrait une ligne sans
    valeurs — c'est-à-dire un aliment absent du référentiel sans que personne
    ne l'ait décidé.
    """
    out = {}
    raw = io.open(CIQUAL / "compo_2020_07_07.xml", encoding="cp1252").read()
    for m in re.finditer(
        r"<COMPO>\s*<alim_code>\s*(\d+)\s*</alim_code>\s*"
        r"<const_code>\s*(\d+)\s*</const_code>\s*"
        r"<teneur>\s*([^<]*?)\s*</teneur>",
        raw, re.S,
    ):
        code, const, val = m.group(1), m.group(2), m.group(3)
        if const not in WANTED:
            continue
        # « traces », « - », « < 0,1 »: Ciqual dit ce qu'il ne sait pas. On lit
        # 0 pour « traces » et pour « < x » (la borne haute est un plafond de
        # bruit), et on IGNORE le reste — un `-` n'est pas un zéro.
        v = val.replace(",", ".").replace("\xa0", " ").strip()
        if v in ("-", ""):
            continue
        if v.lower().startswith("traces"):
            out.setdefault(code, {})[const] = 0.0
            continue
        v = v.lstrip("<").strip()
        try:
            out.setdefault(code, {})[const] = float(v)
        except ValueError:
            continue
    return out


def num(x, nd=1):
    if x is None:
        return None
    return round(x, nd)


def energy_of(t):
    """L'énergie pour 100 g, telle que le Règlement UE 1169/2011 la définit.

    Ciqual laisse le champ VIDE pour ~28 % de ses aliments (le miel en fait
    partie) tout en donnant les macronutriments qui servent à le calculer. La
    dérivation n'invente donc rien: c'est l'arithmétique que la constante 328
    porte dans son propre nom — 4 kcal/g pour les protéines et les glucides,
    9 pour les lipides, 2 pour les fibres.

    Les fibres absentes comptent pour zéro dans CE calcul seulement, et le
    champ `fiber` reste `null` en base: sous-estimer une énergie de quelques
    kcal est sans effet sur un verdict, prétendre connaître une teneur en
    fibres ne l'est pas.
    """
    if C_ENERGY in t:
        return t[C_ENERGY]
    if C_PROTEIN in t and C_CARBS in t and C_FAT in t:
        return (4 * t[C_PROTEIN] + 4 * t[C_CARBS] + 9 * t[C_FAT]
                + 2 * t.get(C_FIBER, 0.0))
    return None


def flags_from(t):
    epa_dha = t.get(C_EPA, 0.0) + t.get(C_DHA, 0.0)
    f = {"omega3_marine": epa_dha >= OMEGA3_MARINE_G}
    for flag, (const, threshold) in SOURCE_THRESHOLDS.items():
        f[flag] = t.get(const, 0.0) >= threshold
    return f


def main():
    alims = load_alims()
    compo = load_compo()

    rows, alias_rows, dropped, manual_used = [], [], [], []
    for slug, group, label, pattern, yc, dense, aliases in CATALOGUE:
        rx = re.compile(pattern, re.I)
        hits = [(code, name) for code, name in alims.items()
                if rx.search(strip_accents(name)) or rx.search(name)]
        # ── LA DONNÉE DÉCIDE, PAS LE NOM ────────────────────────────────
        # On ne garde que les candidats qui portent une énergie; parmi eux, le
        # nom le plus COURT, parce que dans Ciqual la forme générique porte le
        # nom le plus court et les préparations en dérivent (« Riz blanc, cru »
        # avant « Riz blanc étuvé, cuit, salé »).
        usable = [(c, n) for c, n in hits
                  if energy_of(compo.get(c, {})) is not None]
        entry = None
        if usable:
            code, name = min(usable, key=lambda h: (len(h[1]), h[0]))
            t = compo[code]
            entry = dict(
                source="ciqual", ciqual_code=code, ciqual_name=name,
                kcal=num(energy_of(t)), protein=num(t.get(C_PROTEIN)),
                carbs=num(t.get(C_CARBS)), fat=num(t.get(C_FAT)),
                fiber=num(t.get(C_FIBER)), **flags_from(t))
        elif slug in MANUAL:
            kcal, prot, carbs, fat, fiber, on = MANUAL[slug]
            flags = {k: False for k in SOURCE_THRESHOLDS}
            flags["omega3_marine"] = False
            for k in on:
                flags[k] = True
            entry = dict(source="manual", ciqual_code=None, ciqual_name=None,
                         kcal=float(kcal), protein=prot, carbs=carbs, fat=fat,
                         fiber=fiber, **flags)
            manual_used.append(slug)
        if entry is None:
            dropped.append((slug, pattern, len(hits)))
            continue
        entry.update(slug=slug, group=group, label=label, yield_class=yc,
                     dense=dense)
        rows.append(entry)
        for a in aliases:
            alias_rows.append((strip_accents(a).lower().strip(), slug))

    if dropped:
        print("=== ÉCARTÉS — ni Ciqual utilisable, ni valeur manuelle ===")
        for slug, pattern, n in dropped:
            print("  %-22s %-46s (%d noms matchés, 0 avec énergie)"
                  % (slug, pattern, n))
    print("=== %d entrées (%d ciqual, %d manuelles) ==="
          % (len(rows), len(rows) - len(manual_used), len(manual_used)))
    if manual_used:
        print("  manuelles: " + ", ".join(sorted(manual_used)))

    dupes = {}
    for a, s in alias_rows:
        dupes.setdefault(a, set()).add(s)
    conflicts = {a: v for a, v in dupes.items() if len(v) > 1}
    if conflicts:
        print("=== ALIAS EN CONFLIT (bloquant) ===")
        for a, v in sorted(conflicts.items()):
            print("  %-30s -> %s" % (a, ", ".join(sorted(v))))
        raise SystemExit(1)

    (HERE / "seed_rows.py").write_text(
        "ROWS = %r\nALIASES = %r\n" % (rows, sorted(set(alias_rows))),
        encoding="utf-8")
    print("=== %d alias -> seed_rows.py ===" % len(set(alias_rows)))
    print("=== CONTRÔLE À LA MAIN ===")
    for r in rows:
        if r["source"] != "ciqual":
            continue
        print("  %-20s %-50s %6s kcal %5s P %5s G %5s L"
              % (r["slug"], (r["ciqual_name"] or "")[:50], r["kcal"],
                 r["protein"], r["carbs"], r["fat"]))


if __name__ == "__main__":
    main()
