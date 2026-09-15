#!/usr/bin/env python3
"""L8-A — le harnais de mutation du lot « la cible dimensionne les grammages ».

⚠️ COMMITÉ EXPRÈS. Les lots précédents laissaient leur harnais hors dépôt et
leurs vérificateurs ont dû le réécrire. `python3 scratchpad/mutate_l8a.py`
rejoue tout; `python3 scratchpad/mutate_l8a.py M2 M9` n'en rejoue que deux.

⚠️ IL NOMME LE TEST QUI ROUGIT, PAS SEULEMENT LE CODE DE SORTIE — réserve de
L7-B: une mutation qui casserait un test ÉTRANGER du même fichier compterait
« MORD » à tort.

Chaque mutation restaure le fichier dans un `finally`, avec SHA256 revérifié.
"""
import hashlib
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HP = "supabase/functions/_shared/keel/household_portions.ts"
WP = "supabase/functions/_shared/keel/weight_pace.ts"
PE = "supabase/functions/_shared/keel/plan_energy.ts"

BENCH = "supabase/functions/_shared/keel/target_grams_test.ts"
PE_BENCH = "supabase/functions/_shared/keel/plan_energy_test.ts"
R6 = "supabase/functions/sophia-brain/test_harness/keel_properties/no_calorie_to_student_property_test.ts"

# (id, fichier muté, ancien, nouveau, bancs à jouer)
MUTATIONS = [
    ("M1", HP,
     'if (args.ageState === "unknown") return noSizing("age_unknown");',
     '/* MUTANT */',
     [BENCH]),
    ("M2", HP,
     "ageVerdict: mouthAgeVerdict(args.ageState),",
     'ageVerdict: mouthAgeVerdict("adult"),',
     [BENCH]),
    ("M3", HP,
     "const factor = (executed.maintenanceKcal + sign * executed.dailyDeltaKcal) /\n    executed.maintenanceKcal;",
     "const factor = (executed.maintenanceKcal +\n    sign * ((pace * 7700) / 7)) / executed.maintenanceKcal;",
     [BENCH]),
    ("M4", HP,
     "if (!anySized) continue;",
     "if (false) continue;",
     [BENCH]),
    ("M5", HP,
     "      if (!uniform) {",
     "      if (false) {",
     [BENCH]),
    ("M6", HP,
     "    if (sum > ceiling && sum > 0) {",
     "    if (false) {",
     [BENCH]),
    ("M7", HP,
     "counts.unchanged = counts.boxes - counts.sized - counts.shared_mixed;",
     "counts.unchanged = counts.boxes - counts.sized;",
     [BENCH]),
    ("M8", HP,
     'if (args.mouthAgeState === "minor") return refuse("mouth_minor");',
     "/* MUTANT */",
     [BENCH]),
    ("M9", HP,
     "  if (!(KNOWN_PRESENCE_STATES as readonly string[]).includes(args.presenceState)) {\n    return refuse(\"unknown_state\");\n  }",
     "  // MUTANT: un jeton inconnu retombe sur « dehors »",
     [BENCH]),
    ("M10", HP,
     'if (!args.mouthIsReader) return refuse("other_mouth");',
     "/* MUTANT */",
     [BENCH]),
    ("M11", WP,
     '    ? { kcal: maintenance * MAX_SURPLUS_FRACTION, clamp: "surplus_band" }',
     '    ? { kcal: Number.POSITIVE_INFINITY, clamp: "surplus_band" }',
     [BENCH]),
    ("M12", WP,
     "  const cap: { kcal: number; clamp: ExecutedPaceClamp } = isMinor\n    ? {\n      kcal: maintenance * MINOR_MAX_DAILY_DELTA_FRACTION,\n      clamp: \"minor_fraction\",\n    }\n    : direction === \"up\"",
     "  const cap: { kcal: number; clamp: ExecutedPaceClamp } = direction === \"up\"\n    ? { kcal: maintenance * MAX_SURPLUS_FRACTION, clamp: \"surplus_band\" }\n    : isMinor\n    ? {\n      kcal: maintenance * MINOR_MAX_DAILY_DELTA_FRACTION,\n      clamp: \"minor_fraction\",\n    }\n    : direction === \"up\"",
     [BENCH]),
    ("M13", PE,
     'entry.subject = entry.mealsOut > 0 ? "what_the_plan_made" : "the_day";',
     'entry.subject = "the_day";',
     [PE_BENCH]),
    ("M14", HP,
     '    case "unknown":\n      return { status: "absent" };',
     '    case "unknown":\n      return {\n        status: "adult",\n        isoDate: MOUTH_AGE_SENTINEL_ISO,\n        age: KEEL_MINOR_AGE,\n      };',
     [BENCH]),
    ("M15", HP,
     "  const gate = canSizeFromTarget({\n    safety: energySafetyGates({\n      restrictionFlag: args.restrictionFlag,\n      ageVerdict: mouthAgeVerdict(args.ageState),\n      coachCounting: args.coachCounting,\n    }),\n  });",
     "  const raw = energySafetyGates({\n    restrictionFlag: args.restrictionFlag,\n    ageVerdict: mouthAgeVerdict(args.ageState),\n    coachCounting: args.coachCounting,\n  });\n  const gate = { size: raw.open, reason: raw.reason };",
     [R6, BENCH]),
    ("M16", HP,
     "        candidate.set(id, Math.max(BOX_MIN_SIZED_GRAMS, Math.round(g * shrink)));",
     "        candidate.set(id, Math.round(g * shrink));",
     [BENCH]),
]

FAIL_RE = re.compile(r"^(.*?) \.\.\. .*FAILED", re.M)


def sha(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def run(bench: str) -> tuple[int, list[str]]:
    proc = subprocess.run(
        ["deno", "test", "--allow-all", bench],
        cwd=ROOT, capture_output=True, text=True, timeout=900,
    )
    out = proc.stdout + proc.stderr
    clean = re.sub(r"\x1b\[[0-9;]*m", "", out)
    names = [m.strip() for m in FAIL_RE.findall(clean)]
    return proc.returncode, names


def main() -> int:
    wanted = set(sys.argv[1:])
    rows = []
    for mid, rel, old, new, benches in MUTATIONS:
        if wanted and mid not in wanted:
            continue
        path = ROOT / rel
        before = path.read_text(encoding="utf-8")
        before_sha = sha(path)
        if before.count(old) != 1:
            rows.append((mid, "ANCRE INTROUVABLE", []))
            continue
        try:
            path.write_text(before.replace(old, new), encoding="utf-8")
            bit = False
            names: list[str] = []
            for bench in benches:
                code, failed = run(bench)
                if code != 0:
                    bit = True
                    names.extend(failed or [f"<compilation: {bench}>"])
            rows.append((mid, "MORD" if bit else "SURVIT", names))
        finally:
            path.write_text(before, encoding="utf-8")
            assert sha(path) == before_sha, f"{rel} n'est pas restauré à l'octet"
        print(f"{rows[-1][0]:<4} {rows[-1][1]:<18} {' | '.join(rows[-1][2][:3])}")
    print("\n--- RÉCAPITULATIF ---")
    for mid, verdict, names in rows:
        print(f"{mid:<4} {verdict}")
    return 0 if all(v == "MORD" for _, v, _ in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
