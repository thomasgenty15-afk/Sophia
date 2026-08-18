#!/usr/bin/env python3
"""AUDIT DE JOIGNABILITÉ — qui appelle réellement chaque mécanisme livré ?

    python3 scratchpad/liveness/audit_statique.py

── POURQUOI UN OUTIL PLUTÔT QU'UN GREP ────────────────────────────────────────
Ce dépôt a une cicatrice nommée : « un audit d'appelants doit retirer les
commentaires ». Ce code est massivement commenté, et les commentaires CITENT les
symboles qu'ils expliquent. Un `grep -l verdictFor` rend donc « vivant » un
module dont le seul lien avec `verdictFor` est un paragraphe qui raconte
pourquoi il ne l'appelle pas.

On retire donc, avant de chercher :
  * les commentaires de bloc et de ligne ;
  * les littéraux de chaîne et les gabarits (un nom de symbole dans un prompt
    n'est pas un appel).

Et on ne cherche pas le NOM, on cherche l'APPEL (`symbole(`) ou l'IMPORT.
La distinction compte : un symbole importé mais jamais appelé est un import mort,
et c'est exactement ce qu'on veut voir.
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# Ce qui compte comme PRODUCTION: ni test, ni fixture, ni harnais de mesure.
EXCLUDE_DIRS = {"node_modules", ".git", "scratchpad", "dist", "build", ".deno"}
EXCLUDE_SUFFIX = ("_test.ts", ".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")


def production_files():
    out = []
    for base in ("supabase/functions", "frontend/src"):
        for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, base)):
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
            for fn in filenames:
                if not fn.endswith((".ts", ".tsx")):
                    continue
                if fn.endswith(EXCLUDE_SUFFIX):
                    continue
                out.append(os.path.join(dirpath, fn))
    return sorted(out)


BLOCK = re.compile(r"/\*.*?\*/", re.S)
LINE = re.compile(r"//[^\n]*")
# Chaînes: simples, doubles, gabarits. Non gourmand, échappements tolérés.
STRINGS = re.compile(r"`(?:\\.|[^`\\])*`|\"(?:\\.|[^\"\\\n])*\"|'(?:\\.|[^'\\\n])*'", re.S)


def strip_noise(src: str) -> str:
    """Retire commentaires PUIS chaînes. L'ordre compte: une chaîne peut
    contenir `//`, et un commentaire peut contenir un guillemet non fermé."""
    src = BLOCK.sub(" ", src)
    src = LINE.sub(" ", src)
    src = STRINGS.sub('""', src)
    return src


def rel(p: str) -> str:
    return os.path.relpath(p, ROOT)


def main():
    with open(os.path.join(os.path.dirname(__file__), "mecanismes.json"), encoding="utf-8") as f:
        mechanisms = json.load(f)

    files = production_files()
    cleaned = {}
    for p in files:
        try:
            with open(p, encoding="utf-8") as f:
                cleaned[p] = strip_noise(f.read())
        except Exception:
            continue

    print(f"fichiers de production analysés: {len(cleaned)}\n")
    rows = []
    for m in mechanisms:
        sym = m["symbol"]
        home = m.get("home", "")
        call = re.compile(r"(?<![A-Za-z0-9_$])" + re.escape(sym) + r"\s*\(")
        imp = re.compile(r"(?<![A-Za-z0-9_$])" + re.escape(sym) + r"(?![A-Za-z0-9_$])")
        callers, importers = [], []
        for p, src in cleaned.items():
            r = rel(p)
            if home and r.endswith(home):
                continue  # sa propre définition ne le rend pas vivant
            if call.search(src):
                callers.append(r)
            elif imp.search(src):
                importers.append(r)
        rows.append({**m, "callers": sorted(callers), "importersOnly": sorted(importers)})

    dead = [r for r in rows if not r["callers"]]
    alive = [r for r in rows if r["callers"]]

    print(f"== APPELÉ EN PRODUCTION ({len(alive)}) ==")
    for r in alive:
        print(f"  {r['symbol']:34} ← {', '.join(r['callers'])}")
    print(f"\n== AUCUN APPELANT DE PRODUCTION ({len(dead)}) ==")
    for r in dead:
        extra = f"  (nommé sans être appelé dans: {', '.join(r['importersOnly'])})" if r["importersOnly"] else ""
        print(f"  {r['symbol']:34} — {r.get('what','')}{extra}")

    with open(os.path.join(os.path.dirname(__file__), "audit_statique.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    print(f"\nécrit: scratchpad/liveness/audit_statique.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
