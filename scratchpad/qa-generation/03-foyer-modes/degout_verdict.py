#!/usr/bin/env python3
"""§C.3bis — LE VERDICT DU DELTA, calculé sur les runs `run-D1` s'ils existent.

Rend le paragraphe à coller dans RAPPORT.md. Il répond à UNE question :
`sweet potato` (le dégoût de Marceline après le delta) est-il retiré de TOUTE la
table, ou seulement de SON assiette ?
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
TERM = "sweet potato"
OUT = []


def terms_of(d):
    t = []
    for p in d.get("preparations") or []:
        t += [i.get("term", "") for i in p.get("ingredients") or []]
        t.append(p.get("title", ""))
    for x in d.get("dishes") or []:
        t += [i.get("term", "") for i in x.get("ingredients") or []]
        t.append(x.get("title", ""))
        t.append(x.get("method", "") or "")
    for s in d.get("shopping_list") or []:
        t.append(s.get("term", "") if isinstance(s, dict) else str(s))
    return t


found = False
for mode in ("one_dish", "one_session", "separate_sessions"):
    run = ROOT / mode / "run-D1"
    f = run / "http-response.json"
    if not f.exists():
        OUT.append(f"- `{mode}/run-D1` : **non abouti** (poste).")
        continue
    d = json.loads(f.read_text())
    if not d.get("ok"):
        OUT.append(f"- `{mode}/run-D1` : **{d.get('error')}** — pas de plan.")
        continue
    found = True
    blob = " ".join(terms_of(d)).lower()
    present = TERM in blob
    # à QUI la patate douce est-elle servie ?
    per_mouth = {}
    for p in d.get("preparations") or []:
        title = (p.get("title") or "").lower()
        ings = " ".join(i.get("term", "") for i in p.get("ingredients") or []).lower()
        if TERM not in title and TERM not in ings:
            continue
        for box in p.get("boxes") or []:
            for mid in box.get("member_ids") or []:
                per_mouth.setdefault(mid, []).append((p.get("title"), box.get("grams")))
    names = {}
    inp = run / "inputs.json"
    if inp.exists():
        names = {m["member_id"]: m["first_name"] for m in json.loads(inp.read_text())["roster"]}
    who = {names.get(k, k): v for k, v in per_mouth.items()}
    OUT.append(
        f"- `{mode}/run-D1` : `{TERM}` dans le plan → **{'OUI' if present else 'NON'}**"
        f" · dans une préparation servie à : "
        f"{', '.join(f'{n} ({len(v)} boîte(s))' for n, v in who.items()) or '**personne**'}"
    )
    notes = {p.get("display_name"): (p.get("portion_note") or "") for p in d.get("member_portions") or []}
    for n, note in notes.items():
        if TERM in note.lower():
            OUT.append(f"    - phrase de **{n}** : « {note[:180]} »")

print("\n".join(OUT))
if not found:
    print("\n(aucun run du delta n'a abouti — §C.3 reste NON CONCLUANT)", file=sys.stderr)
