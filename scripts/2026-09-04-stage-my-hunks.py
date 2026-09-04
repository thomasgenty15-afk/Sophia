#!/usr/bin/env python3
"""
⛔ METTRE EN INDEX MES SEULES LIGNES D'UN FICHIER PARTAGÉ.

`git add <fichier>` prend le fichier ENTIER, donc le travail non commité des
autres sessions qui l'éditent en même temps. `fr.ts` et `en.ts` sont écrits par
au moins deux sessions cette nuit; les emporter dans mon commit ferait
disparaître leur travail de leur vue sans qu'elles l'aient décidé.

`git add -p` est interactif, donc indisponible ici. Ce script fait le même geste
sans main: il ne garde du diff que les hunks dont le CORPS contient un marqueur,
et applique ce sous-diff à l'index seul (`--cached`) — l'arbre de travail n'est
jamais touché, donc rien de ce que les autres ont écrit ne bouge.

Usage: stage-my-hunks.py <marqueur> <fichier> [<fichier>...]
"""
import subprocess
import sys

marker = sys.argv[1]
files = sys.argv[2:]
staged = 0

for path in files:
    diff = subprocess.run(
        ["git", "diff", "-U3", "--", path],
        capture_output=True, text=True, check=True,
    ).stdout
    if not diff.strip():
        print(f"{path}: rien à mettre en index")
        continue

    lines = diff.split("\n")
    head, hunks, current = [], [], None
    for line in lines:
        if line.startswith("@@"):
            if current is not None:
                hunks.append(current)
            current = [line]
        elif current is None:
            head.append(line)
        else:
            current.append(line)
    if current is not None:
        hunks.append(current)

    mine = [h for h in hunks if any(marker in l for l in h[1:])]
    if not mine:
        print(f"{path}: aucun hunk ne porte « {marker} »")
        continue
    if len(mine) != 1:
        print(f"{path}: {len(mine)} hunks portent le marqueur — vérifie à la main")
        sys.exit(1)

    patch = "\n".join(head + [l for h in mine for l in h]) + "\n"
    subprocess.run(
        ["git", "apply", "--cached", "--unidiff-zero", "-"],
        input=patch, text=True, check=True,
    )
    print(f"{path}: 1 hunk sur {len(hunks)} mis en index")
    staged += 1

print(f"— {staged} fichier(s) partagé(s) mis en index par hunk")
