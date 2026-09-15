#!/usr/bin/env python3
"""Le TABLEAU PAR BOUCHE ET PAR MODE — jamais une moyenne.

Rend, pour chaque run et chaque bouche: nommée ?, plat à elle ?, ce qu'elle
mange, les grammes de chaque boîte, et si l'allergène / le dégoût touchent sa
ligne. Une ligne par (mode, run, bouche).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
MODES = ["one_dish", "one_session", "separate_sessions"]
ORDER = ["Aurele", "Solveig", "Marceline", "Theodule"]
ALLERGEN, DISLIKE = "sesame", "fennel"


def words(t):
    return set(re.findall(r"[a-z]+", str(t).lower()))


def scan(o, p=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from scan(v, f"{p}/{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from scan(v, f"{p}[{i}]")
    elif isinstance(o, str):
        yield p, o


rows = []
meta = []
for mode in MODES:
    for run in sorted((ROOT / mode).glob("run-*")):
        resp_p = run / "http-response.json"
        if not resp_p.exists():
            continue
        resp = json.loads(resp_p.read_text())
        inputs = json.loads((run / "inputs.json").read_text())
        names = {m["member_id"]: m["first_name"] for m in inputs["roster"]}
        model = "?"
        if (run / "model.txt").exists():
            succ = [l for l in (run / "model.txt").read_text().splitlines() if "| success" in l]
            if succ:
                model = succ[-1].split("|")[1].strip()
        arch = {}
        pw = run / "plan-written.json"
        # ⚠️ UN RUN QUI N'A ÉCRIT AUCUN PLAN LIT LE PLAN DU RUN PRÉCÉDENT.
        # `plan-written.json` est la DERNIÈRE ligne du foyer: sur une réponse
        # en erreur elle appartient à quelqu'un d'autre. On la jette.
        if resp.get("ok") and pw.exists() and pw.read_text().strip():
            try:
                arch = json.loads(pw.read_text()).get("cooking") or {}
            except Exception:
                pass
        m = {
            "mode": mode, "run": run.name, "ok": resp.get("ok", False),
            "error": resp.get("error"), "model": model,
            "served": arch.get("served"), "capped": arch.get("capped"),
            "unused": arch.get("unused"), "computed": arch.get("computed"),
            "dish_bearing": len(arch.get("dish_bearing") or []),
            "issues": resp.get("issues") or [],
            "rationale": (resp.get("rationale") or {}).get("lines") or [],
            "cells": sorted({f"{d.get('day')}/{d.get('slot')}" for d in (resp.get("dishes") or [])}),
        }
        meta.append(m)
        if not resp.get("ok"):
            continue
        own = {}
        table_cells = []
        for d in resp.get("dishes") or []:
            mid = d.get("member_id") or d.get("for_member_id")
            cell = f"{d.get('day')}/{d.get('slot')}"
            if mid:
                own.setdefault(mid, []).append(cell)
            else:
                table_cells.append(cell)
        grams = {}
        for prep in resp.get("preparations") or []:
            for box in prep.get("boxes") or []:
                for mid in box.get("member_ids") or []:
                    grams.setdefault(mid, []).append((prep.get("title"), box.get("grams")))
        notes = {p.get("member_id"): p for p in resp.get("member_portions") or []}
        # occurrences par ligne de bouche
        touched = {ALLERGEN: set(), DISLIKE: set()}
        for path, text in scan(resp):
            w = words(text)
            for term in touched:
                if term in w:
                    for mid, nm in names.items():
                        if nm.lower() in str(text).lower():
                            touched[term].add(mid)
        for mid, nm in names.items():
            n = notes.get(mid)
            rows.append({
                "mode": mode, "run": run.name, "mouth": nm,
                "named": mid in notes,
                "display_name": (n or {}).get("display_name"),
                "own_dishes": own.get(mid, []),
                "table_cells": table_cells,
                "boxes": grams.get(mid, []),
                "note": (n or {}).get("portion_note"),
                "allergen_on_their_line": mid in touched[ALLERGEN],
                "dislike_on_their_line": mid in touched[DISLIKE],
            })

print("### META")
for m in meta:
    print(json.dumps(m, ensure_ascii=False))
print()
print("### PAR BOUCHE")
print("| mode | run | bouche | nommée | plat à elle | boîtes (g) |")
print("|---|---|---|---|---|---|")
for r in rows:
    g = " · ".join(f"{t} {v}" for t, v in r["boxes"]) or "—"
    print(f"| {r['mode']} | {r['run']} | {r['mouth']} | "
          f"{'✅' if r['named'] else '❌'} | "
          f"{', '.join(r['own_dishes']) or '—'} | {g} |")
print()
print("### NOTES LUES À TABLE")
for r in rows:
    print(f"- [{r['mode']}/{r['run']}] {r['mouth']}: {r['note']}")
