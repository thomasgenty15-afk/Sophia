#!/usr/bin/env python3
"""
GÉNÉRATEUR DE MIGRATION — l'import CIQUAL complet.

Sources: les tables ANSES CIQUAL 2020, versions FR et ENG, jointes sur
`alim_code`. La version anglaise donne les noms que le modèle écrit; la
française donne des alias gratuits pour les élèves en fr-FR.

── CE QUE CE SCRIPT DÉCIDE, ET POURQUOI ────────────────────────────────────
1. UN SLUG PAR ALIMENT, PAS PAR PRÉPARATION. CIQUAL a « Chicken, breast, raw »,
   « ... cooked », « ... grilled ». On retire les modificateurs de préparation
   pour obtenir `chicken_breast`, et les variantes deviennent des ALIAS. Le
   résolveur du produit fait déjà la même réduction: les deux bouts se
   rejoignent.

2. LA VARIANTE CRUE GAGNE. `yield_class` (grain_absorbs, meat_shrinks…) suppose
   des valeurs CRUES. Retenir une ligne « cooked » et la marquer
   `grain_absorbs` ferait un facteur 3 d'erreur sur du riz. Quand seule une
   variante cuite existe, on la garde mais en `neutral`.

3. LES SENTINELLES SUIVENT LA RÈGLE EUROPÉENNE « source de » — 15 % de la VNR
   pour 100 g. Pas une opinion: c'est le seuil réglementaire, et il est le même
   que celui qui a servi aux 222 entrées d'origine.

4. LES GROUPES SONT UNE TABLE FERMÉE, ÉCRITE À LA MAIN. Un sous-groupe CIQUAL
   absent de la table n'est pas importé — jamais deviné. C'est ce qui empêche
   « entrées et plats composés » (des plats, pas des ingrédients) de polluer le
   référentiel avec des faux appariements.

Usage: python3 build_ciqual_migration.py > supabase/migrations/<version>_ciqual_full.sql
"""
import re
import sys
import unicodedata

import xlrd

FR = "/tmp/ciqual.xls"
EN = "/tmp/ciqual_en.xls"

# ---------------------------------------------------------------------------
# LA TABLE DE GROUPES — fermée, écrite à la main.
# ---------------------------------------------------------------------------
# Clé: le sous-groupe CIQUAL anglais. Valeur: notre `food_group_ref`, ou None
# quand le sous-groupe n'a pas sa place au référentiel (plats composés,
# aliments infantiles, produits qu'aucun plan ne cite comme ingrédient).
#
# `None` est un choix, pas un oubli: importer « ready meals » créerait des
# appariements sur des plats entiers, et un « lasagne » résolu comme ingrédient
# fausserait tout le calcul du plat qui le cite.
SUBGROUP_MAP = {
    # viandes, œufs, poissons
    "raw meat": "red_meat",
    "cooked meat": "red_meat",
    "delicatessen meat and similar": "red_meat",
    "other meat products": "red_meat",
    "meat substitutes": "tofu_tempeh",
    "eggs": "eggs",
    "raw fish": None,          # arbitré par la teneur en gras, voir fish_group()
    "cooked fish": None,
    "fish and seafood products": None,
    "raw molluscs and crustaceans": "shellfish",
    "cooked molluscs and crustaceans": "shellfish",
    # fruits, légumes, légumineuses
    "fruits": None,            # arbitré par le nom, voir fruit_group()
    "nuts and oilseeds": "nuts_seeds",
    "vegetables": None,        # arbitré par le nom, voir veg_group()
    "pulses": "legumes",
    "potatoes and other tubers": "starchy_veg",
    # céréales
    "breads and similar": None,   # complet vs raffiné, voir grain_group()
    "pasta, rice and cereals": None,
    "appetizers": None,           # biscuits apéritifs: pas un ingrédient
    # laitiers
    "cheeses and similar": "dairy_cheese",
    "milks": "dairy_yogurt",
    "dairy products and similar": "dairy_yogurt",
    "creams and cream specialities": "other_added_fat",
    # matières grasses
    "butters": "other_added_fat",
    "margarines": "other_added_fat",
    "vegetable oils and fats": None,   # olive à part, voir oil_group()
    "fish oils": "other_added_fat",
    "other fats": "other_added_fat",
}

COOKED_MARKERS = re.compile(
    r"\b(cooked|boiled|grilled|fried|baked|roasted|steamed|poached|braised|"
    r"stewed|canned|prepared|reheated|pan[- ]fried|deep[- ]fried)\b", re.I
)
# Modificateurs à retirer du slug — même famille que `PREPARATION_MODIFIERS`
# du produit, écrite ici pour rester lisible sans importer du TypeScript.
SLUG_DROP = {
    "raw", "cooked", "boiled", "grilled", "fried", "baked", "roasted", "steamed",
    "poached", "braised", "stewed", "canned", "tinned", "frozen", "fresh",
    "dried", "dehydrated", "drained", "peeled", "unpeeled", "chopped", "sliced",
    "diced", "grated", "minced", "crushed", "whole", "half", "average", "prepared",
    "reheated", "unsalted", "salted", "sweetened", "unsweetened", "plain",
    "skinless", "boneless", "with", "without", "skin", "and", "or", "the", "of",
    "in", "from", "to", "a", "an", "for", "type", "generic", "commercial",
    "home", "made", "homemade", "industrial", "pre", "packed", "prepacked",
}

FATTY_FISH_MIN_FAT = 5.0     # g/100 g — la frontière usuelle gras/maigre
ENERGY_DENSE_MIN = 250.0     # kcal/100 g

# Règle « source de » = 15 % de la VNR pour 100 g (Règlement UE 1169/2011).
NRV_SOURCE = {
    "calcium": 800 * 0.15,   # mg
    "iron": 14 * 0.15,       # mg
    "iodine": 150 * 0.15,    # µg
    "zinc": 10 * 0.15,       # mg
    "b12": 2.5 * 0.15,       # µg
    "folate": 200 * 0.15,    # µg
}

COL = {
    "code": 6, "name": 7, "grp": 3, "sub": 4,
    "kcal": 10, "protein": 14, "carbs": 16, "fat": 17, "fiber": 26,
    "epa": 46, "dha": 47,
    "calcium": 50, "iron": 53, "iodine": 54, "zinc": 61,
    "folate": 74, "b12": 75,
}


def num(v):
    """CIQUAL note les traces « < 0,1 » et les absences « - »."""
    s = str(v).strip().replace(",", ".").replace("\xa0", "").replace(" ", "")
    if not s or s in ("-", "traces", "NA"):
        return None
    s = s.lstrip("<")
    try:
        return float(s)
    except ValueError:
        return None


def slugify(name: str) -> str:
    n = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    n = re.sub(r"\([^)]*\)", " ", n).lower()
    words = [w for w in re.split(r"[^a-z0-9]+", n) if w and w not in SLUG_DROP]
    return "_".join(words[:4])


def alias_of(name: str) -> str:
    n = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    n = re.sub(r"\([^)]*\)", " ", n).lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", n)).strip()


def fish_group(fat):
    return "fatty_fish" if (fat is not None and fat >= FATTY_FISH_MIN_FAT) else "white_fish"


LEAFY = re.compile(r"\b(lettuce|spinach|chard|kale|rocket|arugula|watercress|endive|"
                   r"lamb's lettuce|mesclun|salad)\b", re.I)
CRUCIFER = re.compile(r"\b(cabbage|broccoli|cauliflower|brussels|kohlrabi|turnip|radish|"
                      r"rutabaga|swede|bok choy|pak choi)\b", re.I)
BERRY = re.compile(r"\b(strawberr|raspberr|blueberr|blackberr|redcurrant|blackcurrant|"
                   r"cranberr|gooseberr|mulberr)\w*\b", re.I)
CITRUS = re.compile(r"\b(orange|lemon|lime|grapefruit|clementine|mandarin|tangerine|pomelo)\b", re.I)


def veg_group(name):
    if LEAFY.search(name):
        return "leafy_greens"
    if CRUCIFER.search(name):
        return "cruciferous_veg"
    return "non_starchy_veg"


def fruit_group(name):
    if BERRY.search(name):
        return "berries"
    if CITRUS.search(name):
        return "citrus"
    return "other_fruit"


def grain_group(name):
    return "whole_grain" if re.search(r"\b(wholemeal|wholegrain|whole ?wheat|bran|rye|"
                                      r"complete|integral)\b", name, re.I) else "refined_grain"


def oil_group(name):
    return "olive_oil" if re.search(r"\bolive\b", name, re.I) else "other_added_fat"


YIELD_BY_GROUP = {
    "whole_grain": "grain_absorbs", "refined_grain": "grain_absorbs",
    "legumes": "legume_absorbs",
    "red_meat": "meat_shrinks", "poultry": "meat_shrinks", "lean_protein": "meat_shrinks",
    "fatty_fish": "fish_shrinks", "white_fish": "fish_shrinks", "shellfish": "fish_shrinks",
    "non_starchy_veg": "veg_shrinks", "cruciferous_veg": "veg_shrinks",
    "leafy_greens": "veg_shrinks", "starchy_veg": "veg_shrinks",
}

POULTRY = re.compile(r"\b(chicken|turkey|duck|goose|guinea fowl|poultry|capon)\b", re.I)


def load(path):
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    rows = {}
    for r in range(1, sh.nrows):
        code = str(sh.cell_value(r, COL["code"])).strip()
        rows[code] = [sh.cell_value(r, c) for c in range(sh.ncols)]
    return rows


fr = load(FR)
en = load(EN)

candidates = {}   # slug -> (score, record)
aliases = {}      # alias -> slug

for code, row in en.items():
    name = str(row[COL["name"]]).strip()
    sub = str(row[COL["sub"]]).strip().lower()
    if not name or sub not in SUBGROUP_MAP:
        continue

    kcal = num(row[COL["kcal"]])
    fat = num(row[COL["fat"]])
    if kcal is None:
        continue

    group = SUBGROUP_MAP[sub]
    if group is None:
        if sub in ("raw fish", "cooked fish", "fish and seafood products"):
            group = fish_group(fat)
        elif sub == "fruits":
            group = fruit_group(name)
        elif sub == "vegetables":
            group = veg_group(name)
        elif sub in ("breads and similar", "pasta, rice and cereals"):
            group = grain_group(name)
        elif sub == "vegetable oils and fats":
            group = oil_group(name)
        else:
            continue
    if group == "red_meat" and POULTRY.search(name):
        group = "poultry"

    slug = slugify(name)
    if not slug or len(slug) < 3:
        continue

    cooked = bool(COOKED_MARKERS.search(name))
    # LA VARIANTE CRUE GAGNE (voir l'en-tête n°2), puis le nom le plus court:
    # « Chicken, breast, raw » l'emporte sur « Chicken, breast, raw, marinated ».
    score = (0 if not cooked else 1, len(name))

    rec = {
        "slug": slug, "group": group, "label": name[:78], "cooked": cooked,
        "kcal": kcal,
        "protein": num(row[COL["protein"]]), "carbs": num(row[COL["carbs"]]),
        "fat": fat, "fiber": num(row[COL["fiber"]]),
        "calcium": num(row[COL["calcium"]]), "iron": num(row[COL["iron"]]),
        "iodine": num(row[COL["iodine"]]), "zinc": num(row[COL["zinc"]]),
        "folate": num(row[COL["folate"]]), "b12": num(row[COL["b12"]]),
        "epa": num(row[COL["epa"]]), "dha": num(row[COL["dha"]]),
    }
    prev = candidates.get(slug)
    if prev is None or score < prev[0]:
        candidates[slug] = (score, rec)

    for a in (alias_of(name), alias_of(str(fr.get(code, [""] * 9)[COL["name"]]))):
        if a and len(a) > 2 and a not in aliases:
            aliases[a] = slug

# Un alias identique à son slug est inutile.
aliases = {a: s for a, s in aliases.items() if a.replace(" ", "_") != s}


def b(v):
    return "true" if v else "false"


def n(v):
    return "null" if v is None else f"{v:.4g}"


out = sys.stdout
out.write(f"""-- L'IMPORT CIQUAL COMPLET — le facteur limitant du moteur de composition.
--
-- ── LE DÉFAUT MESURÉ, SUR QUATRE CAMPAGNES DE SIX GÉNÉRATIONS ─────────────
-- Le référentiel comptait 222 aliments. Les plans réels se résolvaient entre
-- 69 % et 93 % selon la cuisine que le modèle choisissait ce jour-là. Or SOUS
-- 80 %, tout l'étage s'éteint d'un coup: le verdict s'abstient, la boucle de
-- correction ne part pas, la mise à l'échelle des portions non plus.
--
-- Mesuré: la mise à l'échelle amène un plan LISIBLE à 100 % de sa cible, et
-- ne s'applique qu'à deux plans sur six. Ce n'est plus le niveau des portions
-- qui limite le produit, c'est la capacité à LIRE une assiette.
--
-- ── POURQUOI COMBLER AU COUP PAR COUP NE MARCHE PAS ───────────────────────
-- Deux fois dans la même journée: +14 aliments et +49 alias, puis +4 et +17.
-- La résolution n'est pas montée durablement, parce que les termes changent à
-- chaque génération. Un plan méditerranéen se lit, un plan de plats composés
-- non. Il faut la table entière, pas des rustines.
--
-- ── LA SOURCE ─────────────────────────────────────────────────────────────
-- ANSES CIQUAL 2020, versions FR et ENG jointes sur `alim_code`. L'anglaise
-- donne les noms que le modèle écrit; la française donne des alias gratuits
-- pour les élèves en fr-FR (`profiles.locale` vaut fr-FR par défaut).
--
-- ── LES QUATRE DÉCISIONS DE L'IMPORT ──────────────────────────────────────
-- 1. UN SLUG PAR ALIMENT, PAS PAR PRÉPARATION. « Chicken, breast, raw » et
--    « ... cooked » donnent `chicken_breast`, et les variantes deviennent des
--    ALIAS. Le résolveur du produit fait déjà cette réduction: les deux bouts
--    se rejoignent.
-- 2. LA VARIANTE CRUE GAGNE. `yield_class` suppose des valeurs CRUES; retenir
--    une ligne « cooked » et la marquer `grain_absorbs` ferait un facteur 3
--    d'erreur sur du riz. Quand seule une variante cuite existe, elle est
--    gardée en `neutral`.
-- 3. LES SENTINELLES SUIVENT LA RÈGLE EUROPÉENNE « source de » — 15 % de la
--    VNR pour 100 g (Règlement UE 1169/2011). Pas une opinion: le seuil
--    réglementaire, le même que celui des 222 entrées d'origine.
-- 4. LES GROUPES VIENNENT D'UNE TABLE FERMÉE, écrite à la main. Un sous-groupe
--    CIQUAL absent de la table n'est PAS importé. C'est ce qui empêche
--    « entrées et plats composés » de polluer le référentiel: un « lasagne »
--    résolu comme ingrédient fausserait tout le plat qui le cite.
--
-- ── CE QUI NE BOUGE PAS ───────────────────────────────────────────────────
-- `on conflict do nothing` sur les deux tables: les 222 entrées d'origine et
-- leurs 805 alias sont prioritaires et intacts. Cette migration ne fait
-- qu'AJOUTER, et elle est ré-appliquable (`db reset` est interdit ici).
--
-- Généré par `scratchpad/build_ciqual_migration.py`.

begin;

insert into public.food_composition_refs
  (slug, food_group_ref, label, source, energy_kcal, protein_g, carbs_g, fat_g,
   fiber_g, omega3_marine, iron_source, calcium_source, iodine_source,
   zinc_source, b12_source, folate_source, yield_class, atwater_discount,
   energy_dense, unit_grams)
values
""")

lines = []
for slug, (_score, r) in sorted(candidates.items()):
    yc = "neutral" if r["cooked"] else YIELD_BY_GROUP.get(r["group"], "neutral")
    omega3 = (r["epa"] or 0) + (r["dha"] or 0) > 0.05
    label = r["label"].replace("'", "''")
    lines.append(
        f"  ('{slug}','{r['group']}','{label}','ciqual',{n(r['kcal'])},"
        f"{n(r['protein'])},{n(r['carbs'])},{n(r['fat'])},{n(r['fiber'])},"
        f"{b(omega3)},{b((r['iron'] or 0) >= NRV_SOURCE['iron'])},"
        f"{b((r['calcium'] or 0) >= NRV_SOURCE['calcium'])},"
        f"{b((r['iodine'] or 0) >= NRV_SOURCE['iodine'])},"
        f"{b((r['zinc'] or 0) >= NRV_SOURCE['zinc'])},"
        f"{b((r['b12'] or 0) >= NRV_SOURCE['b12'])},"
        f"{b((r['folate'] or 0) >= NRV_SOURCE['folate'])},"
        f"'{yc}',1,{b(r['kcal'] >= ENERGY_DENSE_MIN)},null)"
    )
out.write(",\n".join(lines))
out.write("\non conflict (slug) do nothing;\n\n")

out.write("insert into public.food_composition_aliases (alias, slug) values\n")
alines = [f"  ('{a.replace(chr(39), chr(39) * 2)}','{s}')"
          for a, s in sorted(aliases.items()) if s in candidates]
out.write(",\n".join(alines))
out.write("\non conflict (alias) do nothing;\n\n")

out.write("""-- ===========================================================================
-- LA PREUVE
-- ===========================================================================

do $$
declare
  n_refs int;
  orphans text;
begin
  select count(*) into n_refs from public.food_composition_refs;
  if n_refs < 1000 then
    raise exception 'import incomplet: % aliments seulement', n_refs;
  end if;

  -- Aucun alias ne pointe vers un slug absent: un alias orphelin est jeté en
  -- SILENCE à la construction de l'index, et la couverture ne monte pas.
  select string_agg(a.alias, ', ') into orphans
    from public.food_composition_aliases a
    left join public.food_composition_refs r on r.slug = a.slug
   where r.slug is null;
  if orphans is not null then
    raise exception 'alias orphelins: %', left(orphans, 300);
  end if;

  -- Les 222 entrées d'origine sont INTACTES: elles ont la priorité, et une
  -- valeur CIQUAL ne doit pas avoir écrasé une valeur curée à la main.
  if not exists (
    select 1 from public.food_composition_refs
    where slug = 'chicken_breast' and source <> 'ciqual'
  ) then
    raise exception 'une entrée curée a été écrasée par l''import';
  end if;
end;
$$;

commit;
""")
sys.stderr.write(f"{len(candidates)} aliments, {len(alines)} alias\n")
