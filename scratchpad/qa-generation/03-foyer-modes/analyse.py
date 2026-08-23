#!/usr/bin/env python3
"""ÉTAPE ③ — la lecture PAR BOUCHE d'une sortie de foyer.

⚠️ JAMAIS DE MOYENNE. Une moyenne équilibrée cache une personne servie de
travers à chaque repas: tout ce qui suit est rendu bouche par bouche.

⚠️ AUCUN MATCHER MAISON SUR DU TEXTE ALIMENTAIRE au sens de « deviner un
aliment ». Les deux seuls termes cherchés (`sesame`, `fennel`) sont les
étiquettes EXACTES que la fixture a écrites en base, cherchées en sous-chaîne
sur le mot entier — et chaque occurrence est RENDUE pour être relue à l'œil,
jamais comptée en silence.

  ./analyse.py <dossier-de-run> [...]
"""
import json
import re
import sys
from pathlib import Path

ALLERGEN = "sesame"   # allergie MÉDICALE de Solveig (household_member_allergies)
DISLIKE = "fennel"    # dégoût de Marceline (household_food_restrictions)


def words(text):
    return set(re.findall(r"[a-z]+", str(text).lower()))


def scan(obj, path=""):
    """Rend (chemin, texte) pour toute feuille textuelle."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from scan(v, f"{path}/{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from scan(v, f"{path}[{i}]")
    elif isinstance(obj, str):
        yield path, obj


def analyse(folder):
    folder = Path(folder)
    resp = json.loads((folder / "http-response.json").read_text())
    inputs = json.loads((folder / "inputs.json").read_text())
    roster = {m["member_id"]: m for m in inputs["roster"]}
    names = {m["member_id"]: m["first_name"] for m in inputs["roster"]}

    out = {
        "run": str(folder),
        "request_id": (folder / "request-id.txt").read_text().strip()
        if (folder / "request-id.txt").exists() else None,
        "cooking_shape_asked": inputs["cooking_shape_asked"],
        "http_ok": resp.get("ok", False),
        "error": resp.get("error"),
        "lock": resp.get("lock"),
    }
    if not resp.get("ok"):
        out["issues"] = resp.get("issues")
        return out

    dishes = resp.get("dishes") or []
    preps = resp.get("preparations") or []
    portions = resp.get("member_portions") or []

    # ── ① CHAQUE BOUCHE EST-ELLE NOMMÉE ? (cicatrice F5) ───────────────────
    named = {}
    for p in portions:
        mid = p.get("member_id")
        named[mid] = {
            "display_name": p.get("display_name"),
            "display_name_empty": not str(p.get("display_name") or "").strip(),
            "portion_note_chars": len(str(p.get("portion_note") or "")),
            "portion_note": p.get("portion_note"),
            "shares": len(p.get("preparation_shares") or []),
        }

    # ── ② LES PLATS PROPRES, PAR BOUCHE ────────────────────────────────────
    own_dishes = {}
    table_dishes = []
    for d in dishes:
        mid = d.get("for_member_id") or d.get("member_id")
        cell = f"{d.get('day')}/{d.get('slot')}"
        if mid:
            own_dishes.setdefault(mid, []).append({"cell": cell, "title": d.get("title") or d.get("name")})
        else:
            table_dishes.append({"cell": cell, "title": d.get("title") or d.get("name")})

    # ── ③ LES GRAMMES, BOÎTE PAR BOÎTE, PAR BOUCHE ─────────────────────────
    grams = {}
    shared_boxes = 0
    for prep in preps:
        for box in prep.get("boxes") or []:
            mids = box.get("member_ids") or []
            if len(mids) > 1:
                shared_boxes += 1
            for mid in mids:
                grams.setdefault(mid, []).append({
                    "prep": prep.get("title"),
                    "g": box.get("grams"),
                    "shared_with": len(mids),
                })

    # ── ④ L'ALLERGÈNE ET LE DÉGOÛT, OÙ QU'ILS SOIENT ───────────────────────
    hits = {ALLERGEN: [], DISLIKE: []}
    for path, text in scan(resp):
        w = words(text)
        for term in hits:
            if term in w:
                hits[term].append({"path": path, "text": text[:220]})

    out["cooking_archive"] = None
    pw = folder / "plan-written.json"
    if pw.exists() and pw.read_text().strip():
        try:
            out["cooking_archive"] = json.loads(pw.read_text()).get("cooking")
        except Exception:
            pass

    out["model"] = [
        line.strip() for line in (folder / "model.txt").read_text().splitlines()
        if "success" in line or "timeout" in line
    ] if (folder / "model.txt").exists() else []

    out["counts"] = {
        "dishes_total": len(dishes),
        "dishes_of_the_table": len(table_dishes),
        "dishes_with_a_bearer": sum(len(v) for v in own_dishes.values()),
        "preparations": len(preps),
        "member_portions": len(portions),
        "boxes_shared_by_several": shared_boxes,
        "mouths_in_roster": len(roster),
    }
    out["table_dishes"] = table_dishes
    out["by_mouth"] = {}
    for mid, m in roster.items():
        out["by_mouth"][names[mid]] = {
            "member_id": mid,
            "goal": m["goal"],
            "diet": m["diet"],
            "age_state": m["age_state"],
            "body_kg": (m.get("body") or {}).get("weight_kg"),
            "allergies": m["allergies"],
            "dislikes": m["dislikes"],
            "named_in_member_portions": mid in named,
            "portion": named.get(mid),
            "own_dishes": own_dishes.get(mid, []),
            "own_dish_count": len(own_dishes.get(mid, [])),
            "boxes": grams.get(mid, []),
        }
    # bouches servies mais absentes du roster (le cas F5 inverse)
    out["portions_without_a_roster_line"] = [
        p.get("member_id") for p in portions if p.get("member_id") not in roster
    ]
    out["allergen_and_dislike"] = {
        ALLERGEN: {"occurrences": len(hits[ALLERGEN]), "where": hits[ALLERGEN]},
        DISLIKE: {"occurrences": len(hits[DISLIKE]), "where": hits[DISLIKE]},
    }
    return out


if __name__ == "__main__":
    for folder in sys.argv[1:]:
        print(json.dumps(analyse(folder), ensure_ascii=False, indent=1))
