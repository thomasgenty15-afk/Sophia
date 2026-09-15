#!/usr/bin/env python3
"""L7-B — rejeu INDEPENDANT. On ne demande pas « le fichier de test rougit-il »,
on demande « QUEL test rougit ». Un fichier qui rougit pour une raison
etrangere est un faux vert de garde."""
import hashlib, os, re, subprocess, sys

ROOT = "/Users/ahmedamara/Dev/Sophia 2"
TRUNK = "supabase/functions/_shared/keel/meal_generation.ts"
HOUSE = "supabase/functions/_shared/keel/household_meal_generation.ts"
T_TRUNK = "supabase/functions/_shared/keel/meal_generation_test.ts"
T_HOUSE = "supabase/functions/_shared/keel/household_meal_generation_test.ts"
T_BOXES = "supabase/functions/_shared/keel/meal_boxes_test.ts"

def read(p):
    return open(os.path.join(ROOT, p), encoding="utf-8").read()
def write(p, s):
    open(os.path.join(ROOT, p), "w", encoding="utf-8").write(s)
def sha(p):
    return hashlib.sha256(read(p).encode()).hexdigest()

def failing(tests):
    r = subprocess.run(["deno", "test", "--allow-all", "--no-check",
                        *[os.path.join(ROOT, t) for t in tests]],
                       cwd=ROOT, capture_output=True, text=True)
    out = re.sub(r"\x1b\[[0-9;]*m", "", r.stdout + r.stderr)
    names = []
    for ln in out.splitlines():
        m = re.search(r"^(.*?) => \./supabase", ln.strip())
        if m: names.append(m.group(1))
    return r.returncode, sorted(set(names))

MUT = {
 "M5":  (TRUNK, "      keptNameFacts.splice(sacrifice, 1);", "", [T_TRUNK]),
 "M12": (TRUNK, 'export const MEAL_PROMPT_VERSION = "meal.en.v12_a_dish_has_a_name";',
                'export const MEAL_PROMPT_VERSION = "meal.en.v11_weighed_or_counted";', [T_BOXES]),
 "M13": (HOUSE, "  const missing = missingKitchenTools(equipment);",
                "  const missing = KITCHEN_TOOLS.filter((t) => !(equipment ?? []).includes(t));", [T_HOUSE]),
 "M15": (HOUSE, '        gone.has("oven") ? "a pan" : "a pan or the oven"',
                '        "a pan or the oven"', [T_HOUSE]),
 "M19": (HOUSE, "    eatingOut.block,\n    // APRÈS LA PRÉSENCE, AVANT L'ENVIE (D6).",
                "    // APRÈS LA PRÉSENCE, AVANT L'ENVIE (D6).", [T_HOUSE]),
 "M20": (HOUSE, '    "Compose NOTHING there: no dish, no preparation, no line of shopping.",',
                '    "Compose NOTHING there, but aim for around 700 for that meal.",', [T_HOUSE]),
 "M22": (HOUSE, "  return { block, mouths: lines.length, cells };",
                "  return { block, mouths: eatingOut.length, cells };", [T_HOUSE]),
 "M23": (HOUSE, 'export const HOUSEHOLD_PROMPT_VERSION = "v16_this_kitchen_and_a_meal_out";',
                'export const HOUSEHOLD_PROMPT_VERSION = "v15_one_box_each_and_a_number";', [T_HOUSE]),
 # ⚠️ LE JUMEAU DU LOT 3C — c'est L7-A qui le soupconne, on le MESURE.
 "3C":  (TRUNK, "      keptOwnerFacts.splice(sacrifice, 1);", "", [T_TRUNK]),
}

def main():
    todo = sys.argv[1:] or list(MUT)
    for key in todo:
        path, old, new, tests = MUT[key]
        before, before_sha = read(path), sha(path)
        n = before.count(old)
        if n != 1:
            print(f"{key:5s} ANCRE INTROUVABLE ({n})"); continue
        try:
            write(path, before.replace(old, new))
            if "KITCHEN_TOOLS" in new:
                write(path, read(path).replace(
                    '  missingKitchenTools,\n} from "./kitchen_equipment.ts";',
                    '  KITCHEN_TOOLS,\n  missingKitchenTools,\n} from "./kitchen_equipment.ts";'))
            code, names = failing(tests)
            verdict = "MORD" if code != 0 else "⚠️  VERTE"
            print(f"{key:5s} {verdict:10s} {len(names)} test(s):")
            for nm in names: print(f"        · {nm}")
        finally:
            write(path, before)
            assert sha(path) == before_sha, path
    print("\nrestauration SHA256 verifiee pour chaque mutation.")

main()
