#!/usr/bin/env python3
"""Audit d'appelants, COMMENTAIRES RETIRÉS.

Un grep naïf compte des faux vivants: ce dépôt garde de longs pavés de
commentaires qui NOMMENT les concepts retirés (c'est même une règle: les
gardes survivantes expliquent ce qui est parti). Ce script retire d'abord
les commentaires TS/JS (`//`, `/* */`) et SQL (`--`, `/* */`), en tenant
compte des chaînes et des littéraux gabarits, puis grep.
"""
import os
import re
import sys

ROOTS = ["supabase", "frontend/src", "scripts", "docs"]
EXT_TS = {".ts", ".tsx", ".js", ".jsx", ".mjs"}
EXT_SQL = {".sql"}
SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".next", "coverage",
             "migrations_archive"}


def strip_ts(src: str) -> str:
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            j = n if j == -1 else j
            out.append(" " * (j - i))
            i = j
        elif c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            j = n if j == -1 else j + 2
            out.append("".join(ch if ch == "\n" else " " for ch in src[i:j]))
            i = j
        elif c in "\"'`":
            q = c
            j = i + 1
            while j < n:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == q:
                    j += 1
                    break
                if q != "`" and src[j] == "\n":
                    break
                j += 1
            out.append(src[i:j])
            i = j
        else:
            out.append(c)
            i += 1
    return "".join(out)


def strip_sql(src: str) -> str:
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == "-" and i + 1 < n and src[i + 1] == "-":
            j = src.find("\n", i)
            j = n if j == -1 else j
            out.append(" " * (j - i))
            i = j
        elif c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            j = n if j == -1 else j + 2
            out.append("".join(ch if ch == "\n" else " " for ch in src[i:j]))
            i = j
        elif c == "'":
            j = i + 1
            while j < n:
                if src[j] == "'":
                    if j + 1 < n and src[j + 1] == "'":
                        j += 2
                        continue
                    j += 1
                    break
                j += 1
            out.append(src[i:j])
            i = j
        else:
            out.append(c)
            i += 1
    return "".join(out)


def walk():
    for root in ROOTS:
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for f in filenames:
                yield os.path.join(dirpath, f)


def main():
    pattern = re.compile(sys.argv[1])
    hits = {}
    for path in walk():
        ext = os.path.splitext(path)[1]
        if ext in EXT_TS:
            stripper = strip_ts
        elif ext in EXT_SQL:
            stripper = strip_sql
        else:
            continue
        try:
            src = open(path, encoding="utf-8").read()
        except Exception:
            continue
        if not pattern.search(src):
            continue
        code = stripper(src)
        lines = [(i + 1, ln.strip()) for i, ln in enumerate(code.split("\n"))
                 if pattern.search(ln)]
        if lines:
            hits[path] = lines
    for path in sorted(hits):
        print(f"\n### {path}  ({len(hits[path])})")
        for no, ln in hits[path]:
            print(f"  {no}: {ln[:160]}")
    print(f"\n=== {len(hits)} fichiers avec au moins un HIT EXÉCUTABLE ===")


main()
