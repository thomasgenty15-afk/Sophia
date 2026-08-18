#!/usr/bin/env python3
"""Émet le bloc de seed SQL de la migration FF-038, depuis seed_rows.py."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from seed_rows import ROWS, ALIASES

# ── LA DÉCOTE D'ATWATER ──────────────────────────────────────────────────
# Novotny 2012 (amandes) et les réplications sur noix et cacahuètes: l'énergie
# métabolisable d'un fruit à coque ENTIER est ~72 % de sa valeur Atwater, la
# matrice cellulaire retenant une partie des lipides. L'effet DISPARAÎT quand
# la structure est détruite: purées et beurres n'en portent pas, et les graines
# n'ont pas de donnée équivalente. La liste est donc courte et fermée exprès.
ATWATER_072 = {"almonds", "walnuts", "cashews", "hazelnuts", "peanuts", "mixed_nuts"}


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(round(float(v), 2))
    return "'" + str(v).replace("'", "''") + "'"


out = []
out.append("insert into public.food_composition_refs")
out.append("  (slug, food_group_ref, label, source, ciqual_code, ciqual_name,")
out.append("   energy_kcal, protein_g, carbs_g, fat_g, fiber_g,")
out.append("   omega3_marine, iron_source, calcium_source, iodine_source,")
out.append("   zinc_source, b12_source, folate_source,")
out.append("   yield_class, atwater_discount, energy_dense)")
out.append("values")
lines = []
for r in sorted(ROWS, key=lambda r: (r["group"], r["slug"])):
    lines.append(
        "  (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)" % (
            lit(r["slug"]), lit(r["group"]), lit(r["label"]), lit(r["source"]),
            lit(r["ciqual_code"]), lit(r["ciqual_name"]),
            lit(r["kcal"]), lit(r["protein"]), lit(r["carbs"]), lit(r["fat"]), lit(r["fiber"]),
            lit(r["omega3_marine"]), lit(r["iron_source"]), lit(r["calcium_source"]),
            lit(r["iodine_source"]), lit(r["zinc_source"]), lit(r["b12_source"]),
            lit(r["folate_source"]),
            lit(r["yield_class"]),
            lit(0.72 if r["slug"] in ATWATER_072 else 1.0),
            lit(bool(r["dense"]))))
out.append(",\n".join(lines))
out.append("""on conflict (slug) do update set
  food_group_ref = excluded.food_group_ref,
  label = excluded.label,
  source = excluded.source,
  ciqual_code = excluded.ciqual_code,
  ciqual_name = excluded.ciqual_name,
  energy_kcal = excluded.energy_kcal,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  omega3_marine = excluded.omega3_marine,
  iron_source = excluded.iron_source,
  calcium_source = excluded.calcium_source,
  iodine_source = excluded.iodine_source,
  zinc_source = excluded.zinc_source,
  b12_source = excluded.b12_source,
  folate_source = excluded.folate_source,
  yield_class = excluded.yield_class,
  atwater_discount = excluded.atwater_discount,
  energy_dense = excluded.energy_dense;
""")

out.append("insert into public.food_composition_aliases (alias, slug)")
out.append("values")
out.append(",\n".join("  (%s, %s)" % (lit(a), lit(s)) for a, s in ALIASES))
out.append("on conflict (alias) do update set slug = excluded.slug;")

Path("seed_block.sql").write_text("\n".join(out) + "\n", encoding="utf-8")
print("seed_block.sql:", len(ROWS), "refs,", len(ALIASES), "alias")
