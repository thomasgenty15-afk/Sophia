#!/usr/bin/env bash
# Lit un journal de tir et publie les cinq nombres qui décident du lot.
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 - "$@" <<'PY'
import re, json, sys
for p in sys.argv[1:]:
    s = open(p).read()
    ps = gate = bc = pb = None
    for m in re.finditer(r'\{"tag":"keel\.household_meal\.portion_sizing".*', s):
        try: ps = json.loads(m.group(0))
        except Exception: pass
    for m in re.finditer(r'\{"tag":"keel\.household_meal\.final_gate".*', s):
        try: gate = json.loads(m.group(0))
        except Exception: pass
    for m in re.finditer(r'\{"tag":"keel\.household_meal\.box_counts".*', s):
        try: bc = json.loads(m.group(0))
        except Exception: pass
    for m in re.finditer(r'\{"tag":"keel\.household_meal\.portion_boundary".*', s):
        try: pb = json.loads(m.group(0))
        except Exception: pass
    st = re.search(r'^   statut\s+(\d+)', s, re.M)
    print("══", p, "· statut", st.group(1) if st else "?")
    if ps:
        print("   apply        ", json.dumps(ps["apply"]))
        print("   verdicts     ", json.dumps(ps["verdicts"]), "lids", json.dumps(ps["lids"]))
        print("   no_target    ", json.dumps(ps.get("no_target")))
    if bc:
        b = bc["box_sizing"]
        print("   box mouths   ", json.dumps(b["mouths"]))
        print("   anchor       ", json.dumps(b["anchor"]), "applied", b["anchor_applied"])
        print("   pot_attrib   ", json.dumps(b["pot_attribution"]))
        print("   meals        ", json.dumps(bc["meals_delivered"]["by_cause"]),
              "fed", bc["meals_delivered"]["fed"], "/", bc["meals_delivered"]["expected"])
    if pb:
        print("   boundary     ", json.dumps({k: v for k, v in pb.items()
                                              if k not in ("tag", "user_id", "request_id")}))
    if gate:
        print("   final_gate   ", "ok", gate["ok"], "refus", gate["refusals"],
              "bloquants", gate["blocking"], gate["causes"])
        print("   causes       ", json.dumps({k: v for k, v in
              gate["counters"]["refusals_by_cause"].items() if v}))
PY
