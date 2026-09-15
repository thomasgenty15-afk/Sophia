#!/usr/bin/env python3
"""LE JUGE DU BANC DES CLARIFICATIONS — il imprime l'attendu À CÔTÉ de l'obtenu.

⛔ IL NE REND JAMAIS « OK ». Il rend la LISTE des termes, chacun avec sa valeur
attendue et sa valeur obtenue, et un verdict par cas. Un banc qui rend « PASS »
sans montrer ce qu'il a comparé est un banc qu'on ne peut pas contredire — et
ce dépôt a déjà payé un « 0 boîtes » lu comme une exclusion réussie, sur un
chemin JSON qui n'existait pas.

Trois verdicts, et le troisième n'est JAMAIS un PASS déguisé:
  PASS         tous les termes tiennent
  FAIL         au moins un terme a cédé — il est nommé
  INCONCLUSIVE une PRÉCONDITION du banc manque (le plan n'a pas deux viandes,
               le classifieur n'a pas tourné). Le produit n'est pas en cause,
               et on ne peut rien en conclure.

Usage: juge.py <attendu.json> <obtenu.json>
"""
import json
import re
import sys


def flat(prefix, value, out):
    if isinstance(value, dict):
        for k, v in value.items():
            flat(f"{prefix}.{k}" if prefix else k, v, out)
    else:
        out[prefix] = value


def show(v):
    if isinstance(v, (list, dict)):
        return json.dumps(v, ensure_ascii=False, sort_keys=True)
    return str(v)


def compare(expected, obtained):
    """Rend (verdict, [(terme, attendu, obtenu, ok)])."""
    rows = []
    inconclusive = obtained.get("_inconclusive")

    for term, want in expected.items():
        if term.startswith("_"):
            continue
        got = obtained.get(term, "<absent>")

        # ── LES OPÉRATEURS, DÉCLARÉS ET PEU NOMBREUX ────────────────────
        # Un DSL riche est un DSL qu'on relit mal. Cinq formes suffisent.
        if isinstance(want, dict) and "set" in want:
            ok = sorted(map(str, got or [])) == sorted(map(str, want["set"]))
            want_show = {"ensemble": want["set"]}
        elif isinstance(want, dict) and "contains" in want:
            hay = show(got)
            ok = all(re.search(p, hay, re.I) for p in want["contains"])
            want_show = {"contient": want["contains"]}
        elif isinstance(want, dict) and "absent" in want:
            hay = show(got)
            ok = not any(re.search(p, hay, re.I) for p in want["absent"])
            want_show = {"sans": want["absent"]}
        elif isinstance(want, dict) and "atLeast" in want:
            ok = isinstance(got, int) and got >= want["atLeast"]
            want_show = {"≥": want["atLeast"]}
        else:
            ok = got == want
            want_show = want

        rows.append((term, show(want_show), show(got), ok))

    if inconclusive:
        return "INCONCLUSIVE", rows, inconclusive
    return ("PASS" if all(r[3] for r in rows) else "FAIL"), rows, None


def main():
    expected = json.load(open(sys.argv[1], encoding="utf-8"))
    raw = json.load(open(sys.argv[2], encoding="utf-8"))
    obtained = {}
    flat("", raw, obtained)
    obtained["_inconclusive"] = raw.get("_inconclusive")

    flat_expected = {}
    flat("", {k: v for k, v in expected.items() if not k.startswith("_")},
         flat_expected)
    # ⚠️ Un opérateur est un dict: `flat` l'aurait aplati en `terme.set`.
    # On rétablit les opérateurs tels quels.
    for k, v in expected.items():
        if isinstance(v, dict) and set(v) & {"set", "contains", "absent", "atLeast"}:
            for dead in [x for x in flat_expected if x.startswith(k + ".")]:
                del flat_expected[dead]
            flat_expected[k] = v

    verdict, rows, why = compare(flat_expected, obtained)
    width = max((len(r[0]) for r in rows), default=10)
    for term, want, got, ok in rows:
        mark = "  " if ok else "✗ "
        print(f"   {mark}{term.ljust(width)}  attendu {want}")
        if not ok or want != got:
            print(f"     {' '.ljust(width)}  obtenu  {got}")
    if why:
        print(f"   ⚠️ précondition manquante: {why}")
    print(f"   → {verdict}")
    sys.exit(0 if verdict == "PASS" else (2 if verdict == "INCONCLUSIVE" else 1))


if __name__ == "__main__":
    main()
