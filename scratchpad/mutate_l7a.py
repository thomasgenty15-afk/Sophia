#!/usr/bin/env python3
"""Harnais de mutation L7-A. Chaque mutation restaure le fichier dans un finally."""
import hashlib
import subprocess
import sys
import os

ROOT = "/Users/ahmedamara/Dev/Sophia 2"
TRUNK = "supabase/functions/_shared/keel/meal_generation.ts"
HOUSE = "supabase/functions/_shared/keel/household_meal_generation.ts"
T_TRUNK = "supabase/functions/_shared/keel/meal_generation_test.ts"
T_HOUSE = "supabase/functions/_shared/keel/household_meal_generation_test.ts"
T_BOXES = "supabase/functions/_shared/keel/meal_boxes_test.ts"


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with open(os.path.join(ROOT, p), "w", encoding="utf-8") as f:
        f.write(s)


def sha(p):
    return hashlib.sha256(read(p).encode()).hexdigest()


def run(tests):
    r = subprocess.run(
        ["deno", "test", "--allow-all", "--no-check", *[os.path.join(ROOT, t) for t in tests]],
        cwd=ROOT, capture_output=True, text=True,
    )
    return r.returncode, (r.stdout + r.stderr)


MUTATIONS = [
    # ── ③ le nom d'usage ────────────────────────────────────────────────
    ("M1  refus « trop long » retiré", TRUNK,
     "      if (nameRaw.length > DISH_NAME_MAX_CHARS) {",
     "      if (false) {", [T_TRUNK]),
    ("M2  refus « identique au titre » retiré", TRUNK,
     "      } else if (\n        nameRaw.toLowerCase().replace(/\\s+/g, \" \") ===\n          title.toLowerCase().replace(/\\s+/g, \" \")\n      ) {",
     "      } else if (false) {", [T_TRUNK]),
    ("M3  `declared` ne compte que les gardés", TRUNK,
     "      declared: keptNameFacts.filter((f) => f.declared).length,",
     "      declared: keptNameFacts.filter((f) => f.declared && !f.refused).length,",
     [T_TRUNK]),
    ("M4  `refused` cloué à zéro", TRUNK,
     "      refused: keptNameFacts.filter((f) => f.refused).length,",
     "      refused: 0,", [T_TRUNK]),
    ("M5  le 7e tableau parallèle ne suit plus le splice", TRUNK,
     "      keptNameFacts.splice(sacrifice, 1);", "", [T_TRUNK]),
    ("M6  un bloc s'intercale entre la promesse et le schéma", TRUNK,
     'a "name" identical to the title is a line that says nothing.',
     'a "name" identical to the title is a line that says nothing.\n\n== A WEDGE ==\nnothing.',
     [T_TRUNK]),
    ("M7  le NOMBRE attendu disparaît de la consigne", TRUNK,
     "Write BOTH, on every single dish: as many names as you have dishes. Count them\nbefore you answer.",
     "Write BOTH on every dish.", [T_TRUNK]),
    ("M8  l'ÉCHAPPATOIRE n'est plus nommée", TRUNK,
     "Do NOT make the title pretty instead.", "Keep the title plain.", [T_TRUNK]),
    ("M9  le nom sort de la liste traduisible", TRUNK,
     '  "dishes[].name",\n  "dishes[].title",', '  "dishes[].title",', [T_TRUNK]),
    ("M10 le payload n'écrit le nom que s'il existe", TRUNK,
     "    name: d.name,\n    title: d.title,",
     "    ...(d.name ? { name: d.name } : {}),\n    title: d.title,", [T_TRUNK]),
    ("M11 un nom refusé JETTE le plat", TRUNK,
     "        nameRefused = true;\n        issues.push(\n          `dishes[${i}]: name is ${nameRaw.length} characters, over the ` +",
     "        nameRefused = true;\n        continue;\n        issues.push(\n          `dishes[${i}]: name is ${nameRaw.length} characters, over the ` +",
     [T_TRUNK]),
    ("M12 le TRONC ne bumpe pas", TRUNK,
     'export const MEAL_PROMPT_VERSION = "meal.en.v12_a_dish_has_a_name";',
     'export const MEAL_PROMPT_VERSION = "meal.en.v11_weighed_or_counted";',
     [T_BOXES]),
    # ── ① les moyens de cuisson ─────────────────────────────────────────
    ("M13 ⛔ LA FORME NATURELLE: `equipment ?? []` au lieu de missingKitchenTools", HOUSE,
     "  const missing = missingKitchenTools(equipment);",
     "  const missing = KITCHEN_TOOLS.filter((t) => !(equipment ?? []).includes(t));",
     [T_HOUSE]),
    ("M14 l'ordre suit la déclaration, pas la liste fermée", HOUSE,
     "    }.`,",
     "    }.`.replace(/an oven, a freezer/, \"a freezer, an oven\"),", [T_HOUSE]),
    ("M15 la ligne du micro-ondes nomme toujours le four", HOUSE,
     '        gone.has("oven") ? "a pan" : "a pan or the oven"',
     '        "a pan or the oven"', [T_HOUSE]),
    ("M16 la cuisine passe EN DERNIER, après les règles de maison", HOUSE,
     "    kitchen.block,\n    // ── R4/R5 · LE RÉGIME",
     "    // ── R4/R5 · LE RÉGIME", [T_HOUSE]),
    ("M17 `kitchenMissing` rendu vide (trace désarmée)", HOUSE,
     "    kitchenMissing: kitchen.missing,", "    kitchenMissing: [],", [T_HOUSE]),
    # ── ② le déjeuner dehors ────────────────────────────────────────────
    ("M18 « dehors » retombe sur l'absence: le bloc n'est jamais servi", HOUSE,
     "  const eatingOut = eatingOutBlock(input.members, input.presence.eatingOut);",
     "  const eatingOut = eatingOutBlock(input.members, []);", [T_HOUSE]),
    ("M19 le bloc « dehors » est séparé de la présence", HOUSE,
     "    eatingOut.block,\n    // APRÈS LA PRÉSENCE, AVANT L'ENVIE (D6).",
     "    // APRÈS LA PRÉSENCE, AVANT L'ENVIE (D6).", [T_HOUSE]),
    ("M20 ⛔ un CHIFFRE entre dans le bloc « dehors »", HOUSE,
     '    "Compose NOTHING there: no dish, no preparation, no line of shopping.",',
     '    "Compose NOTHING there, but aim for around 700 for that meal.",', [T_HOUSE]),
    ("M21 une bouche hors du prompt est nommée par son id", HOUSE,
     "    if (!name || entry.cells.length === 0) continue;",
     "    if (entry.cells.length === 0) continue;", [T_HOUSE]),
    ("M22 le compteur `eatingOut` compte la source, pas les lignes écrites", HOUSE,
     "  return { block, mouths: lines.length, cells };",
     "  return { block, mouths: eatingOut.length, cells };", [T_HOUSE]),
    ("M23 l'enveloppe FOYER ne bumpe pas", HOUSE,
     'export const HOUSEHOLD_PROMPT_VERSION = "v16_this_kitchen_and_a_meal_out";',
     'export const HOUSEHOLD_PROMPT_VERSION = "v15_one_box_each_and_a_number";',
     [T_HOUSE]),
]


def main():
    only = sys.argv[1:] or None
    results = []
    for label, path, old, new, tests in MUTATIONS:
        if only and not any(label.startswith(o) for o in only):
            continue
        before = read(path)
        before_sha = hashlib.sha256(before.encode()).hexdigest()
        if before.count(old) != 1:
            results.append((label, f"ANCRE INTROUVABLE ({before.count(old)})"))
            continue
        try:
            write(path, before.replace(old, new))
            # KITCHEN_TOOLS n'est pas importé: M13 a besoin de l'import.
            if "KITCHEN_TOOLS" in new:
                s = read(path).replace(
                    "  missingKitchenTools,\n} from \"./kitchen_equipment.ts\";",
                    "  KITCHEN_TOOLS,\n  missingKitchenTools,\n} from \"./kitchen_equipment.ts\";",
                )
                write(path, s)
            code, out = run(tests)
            if code != 0:
                failed = [
                    ln.strip() for ln in out.splitlines()
                    if " => ./supabase" in ln
                ]
                results.append((label, f"MORD ({len(set(failed))} test(s))"))
            else:
                results.append((label, "⚠️  VERTE"))
        finally:
            write(path, before)
            assert hashlib.sha256(read(path).encode()).hexdigest() == before_sha, path
    print()
    for label, verdict in results:
        print(f"{verdict:<28} {label}")
    print()
    print(f"{sum(1 for _, v in results if v.startswith('MORD'))}/{len(results)} mordent")


if __name__ == "__main__":
    main()
