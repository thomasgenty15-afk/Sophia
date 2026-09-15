#!/usr/bin/env python3
"""L8-B — trois mutations que le harnais de L8-A ne porte pas.

M17  BOX_FACTOR_MIN revient a 0,75  -> l'assertion du minimum structurel
     doit MORDRE (c'est le defaut exact que L8-A dit avoir trouve).
M18  BOX_FACTOR_MIN descend a 0,10  -> la ceinture est desarmee: est-ce que
     QUELQUE CHOSE le voit ?
M15b le court-circuit de la porte, joue sur R6 SEUL, pour savoir si la
     propriete retournee mord vraiment (et pas seulement le banc du lot).
Restauration en `finally`, SHA256 reverifie.
"""
import hashlib, pathlib, re, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
HP = "supabase/functions/_shared/keel/household_portions.ts"
BENCH = "supabase/functions/_shared/keel/target_grams_test.ts"
R6 = "supabase/functions/sophia-brain/test_harness/keel_properties/no_calorie_to_student_property_test.ts"
GATE = ("  const gate = canSizeFromTarget({\n    safety: energySafetyGates({\n      restrictionFlag: args.restrictionFlag,\n      ageVerdict: mouthAgeVerdict(args.ageState),\n      coachCounting: args.coachCounting,\n    }),\n  });",
        "  const raw = energySafetyGates({\n    restrictionFlag: args.restrictionFlag,\n    ageVerdict: mouthAgeVerdict(args.ageState),\n    coachCounting: args.coachCounting,\n  });\n  const gate = { size: raw.open, reason: raw.reason };")
MUTATIONS = [
    ("M17", HP, "export const BOX_FACTOR_MIN = 0.70;", "export const BOX_FACTOR_MIN = 0.75;", [BENCH]),
    ("M18", HP, "export const BOX_FACTOR_MIN = 0.70;", "export const BOX_FACTOR_MIN = 0.10;", [BENCH]),
    ("M15b", HP, GATE[0], GATE[1], [R6]),
]
FAIL_RE = re.compile(r"^(.*?) \.\.\. .*FAILED", re.M)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def run(bench):
    proc = subprocess.run(["deno","test","--allow-all",bench], cwd=ROOT, capture_output=True, text=True, timeout=900)
    clean = re.sub(r"\x1b\[[0-9;]*m", "", proc.stdout+proc.stderr)
    return proc.returncode, [m.strip() for m in FAIL_RE.findall(clean)]
rows=[]
for mid, rel, old, new, benches in MUTATIONS:
    path = ROOT/rel
    before = path.read_text(encoding="utf-8"); before_sha = sha(path)
    if before.count(old) != 1:
        print(f"{mid:<5} ANCRE INTROUVABLE ({before.count(old)})"); continue
    try:
        path.write_text(before.replace(old,new), encoding="utf-8")
        bit=False; names=[]
        for b in benches:
            code, failed = run(b)
            if code != 0: bit=True; names.extend(failed or [f"<compilation: {b}>"])
        rows.append((mid,"MORD" if bit else "SURVIT",names))
    finally:
        path.write_text(before, encoding="utf-8")
        assert sha(path)==before_sha, f"{rel} non restaure"
    print(f"{rows[-1][0]:<5} {rows[-1][1]:<8} {' | '.join(rows[-1][2][:3])}")
