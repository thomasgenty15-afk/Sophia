/**
 * LOT 19 — L'ÉPREUVE DU NOM NU, la seule comparaison FR/EN honnête.
 *
 * ── LA RÈGLE DE CONSTRUCTION, IDENTIQUE DES DEUX CÔTÉS ────────────────────
 * Pour chacun des 150 aliments que le corpus RÉEL atteint le plus souvent: le
 * nom NU — celui qu'on écrit sur une liste de courses — une fois en anglais,
 * une fois en français. Pas de qualificatif, pas de forme de rayon, pas de
 * synonyme rare. Les deux colonnes sont écrites en même temps, aliment par
 * aliment, pour qu'aucune des deux ne soit plus « gentille » que l'autre.
 *
 * La colonne `vu` dit si la forme anglaise est réellement présente dans le
 * corpus: c'est la part d'avantage de sélection qui resterait à l'anglais.
 */
import {
  buildCompositionIndex, type CompositionRef, normalizeTerm, resolveIngredient, type YieldClass,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import type { FoodGroupRef } from "../../supabase/functions/_shared/keel/tokens.ts";

const dir = Deno.args[0];
const read = (f: string) => JSON.parse(Deno.readTextFileSync(`${dir}/${f}`));
const refs: CompositionRef[] = (read("refs.json") as Record<string, any>[]).map((r) => ({
  slug: String(r.slug), foodGroupRef: String(r.food_group_ref) as FoodGroupRef, label: String(r.label),
  energyKcal: Number(r.energy_kcal),
  proteinG: r.protein_g === null ? null : Number(r.protein_g), carbsG: r.carbs_g === null ? null : Number(r.carbs_g),
  fatG: r.fat_g === null ? null : Number(r.fat_g), fiberG: r.fiber_g === null ? null : Number(r.fiber_g),
  omega3Marine: !!r.omega3_marine, ironSource: !!r.iron_source, calciumSource: !!r.calcium_source,
  iodineSource: !!r.iodine_source, zincSource: !!r.zinc_source, b12Source: !!r.b12_source, folateSource: !!r.folate_source,
  yieldClass: String(r.yield_class) as YieldClass, atwaterDiscount: Number(r.atwater_discount), energyDense: !!r.energy_dense,
  unitGrams: r.unit_grams === null ? null : Number(r.unit_grams),
  condimentGrams: r.condiment_grams === null ? null : Number(r.condiment_grams),
}));
const index = buildCompositionIndex(refs, read("aliases.json"));
const bySlug = new Map(refs.map((r) => [r.slug, r]));
const seen = new Set((JSON.parse(Deno.readTextFileSync(`${dir}/terms.json`)) as any[])
  .filter((r) => r.source === "dish" || r.source === "preparation").map((r) => r.norm));

/** [slug, nom nu EN, nom nu FR] */
const PAIRS: [string, string, string][] = [
  ["olive_oil","olive oil","huile d'olive"],["lemon","lemon","citron"],["salt","salt","sel"],
  ["tomato","tomato","tomate"],["greek_yogurt","greek yogurt","yaourt grec"],["garlic","garlic","ail"],
  ["cucumber","cucumber","concombre"],["black_pepper","black pepper","poivre noir"],
  ["wholemeal_bread","wholemeal bread","pain complet"],["chicken_thigh","chicken thigh","cuisse de poulet"],
  ["whole_eggs","eggs","oeufs"],["courgette","courgette","courgette"],["lettuce","lettuce","laitue"],
  ["bell_pepper","bell pepper","poivron"],["onion","onion","oignon"],["oats","oats","flocons d'avoine"],
  ["white_rice","white rice","riz blanc"],["red_onion","red onion","oignon rouge"],
  ["potato","potato","pomme de terre"],["spinach","spinach","epinards"],["water","water","eau"],
  ["paprika","paprika","paprika"],["carrot","carrot","carotte"],["herbs_parsley","parsley","persil"],
  ["plain_yogurt","plain yogurt","yaourt nature"],["honey","honey","miel"],["couscous","couscous","semoule"],
  ["tuna_tinned","tinned tuna","thon en conserve"],["green_beans","green beans","haricots verts"],
  ["mixed_berries","mixed berries","fruits rouges"],["butter","butter","beurre"],["peach","peach","peche"],
  ["cumin","cumin","cumin"],["tinned_tomatoes","tinned tomatoes","tomates en conserve"],
  ["salmon","salmon","saumon"],["turkey_mince","turkey mince","dinde hachee"],["bread","bread","pain"],
  ["chickpeas_tinned","chickpeas","pois chiches"],["cooked_rice","cooked rice","riz cuit"],
  ["white_pasta","pasta","pates"],["apple","apple","pomme"],["soy_sauce","soy sauce","sauce soja"],
  ["banana","banana","banane"],["milk_semi","milk","lait"],["broccoli","broccoli","brocoli"],
  ["feta","feta","feta"],["white_beans","white beans","haricots blancs"],
  ["peanut_butter","peanut butter","beurre de cacahuete"],["herbs_thyme","thyme","thym"],
  ["chicken_breast","chicken breast","blanc de poulet"],["lentils_dry","lentils","lentilles"],
  ["lime","lime","citron vert"],["almonds","almonds","amandes"],
  ["mixed_vegetables","mixed vegetables","melange de legumes"],["kidney_beans","kidney beans","haricots rouges"],
  ["spring_onion","spring onion","oignon nouveau"],["avocado","avocado","avocat"],["hummus","hummus","houmous"],
  ["cottage_cheese","cottage cheese","cottage cheese"],["white_bread","white bread","pain blanc"],
  ["dried_herbs","dried herbs","herbes sechees"],["walnuts","walnuts","noix"],
  ["passata","passata","coulis de tomate"],["aubergine","aubergine","aubergine"],["granola","granola","granola"],
  ["chilli_powder","chilli powder","piment en poudre"],["pumpkin_seeds","pumpkin seeds","graines de courge"],
  ["mayonnaise","mayonnaise","mayonnaise"],["mustard","mustard","moutarde"],["sweetcorn","sweetcorn","mais"],
  ["skyr","skyr","skyr"],["egg","egg","oeuf"],["parmesan","parmesan","parmesan"],["celery","celery","celeri"],
  ["herbs_basil","basil","basilic"],["herbs_mint","mint","menthe"],["vinegar","vinegar","vinaigre"],
  ["beef_mince","beef mince","boeuf hache"],["black_beans","black beans","haricots noirs"],
  ["cheddar","cheddar","cheddar"],["stock_cube","stock cube","cube de bouillon"],
  ["cinnamon","cinnamon","cannelle"],["rocket","rocket","roquette"],
  ["tortilla_wrap","tortilla wrap","tortilla de ble"],["herbs_coriander","coriander","coriandre"],
  ["green_peas","peas","petits pois"],["breadcrumbs","breadcrumbs","chapelure"],
  ["blueberries","blueberries","myrtilles"],["corn_tortilla_wrap_be","corn tortilla","tortilla de mais"],
  ["mushroom","mushrooms","champignons"],["chia_seeds","chia seeds","graines de chia"],
  ["sesame_oil","sesame oil","huile de sesame"],["herbs_dill","dill","aneth"],["plum","plum","prune"],
  ["vegetable_stock","vegetable stock","bouillon de legumes"],["quinoa","quinoa","quinoa"],
  ["sunflower_seeds","sunflower seeds","graines de tournesol"],["sweet_potato","sweet potato","patate douce"],
  ["strawberries","strawberries","fraises"],["pita_bread","pita bread","pain pita"],
  ["lemon_wedge","lemon wedge","quartier de citron"],["tomato_puree","tomato puree","concentre de tomate"],
  ["brown_rice","brown rice","riz complet"],["cod","cod","cabillaud"],
  ["wholewheat_pasta","wholewheat pasta","pates completes"],["jam","jam","confiture"],
  ["tortilla_wholemeal","wholemeal tortilla","tortilla complete"],["herbs_bay_leaf","bay leaf","feuille de laurier"],
  ["beef_chuck","beef chuck","paleron de boeuf"],["hot_sauce","hot sauce","sauce piquante"],
  ["pear","pear","poire"],["salsa","salsa","salsa"],["lentils_cooked","cooked lentils","lentilles cuites"],
  ["pita_wholemeal","wholemeal pita","pain pita complet"],["mixed_seeds","mixed seeds","graines melangees"],
  ["coconut_milk","coconut milk","lait de coco"],["turkey_breast","turkey breast","blanc de dinde"],
  ["apricot_pitted","apricot","abricot"],["herbs_chives","chives","ciboulette"],["polenta","polenta","polenta"],
  ["noodles","noodles","nouilles"],["curry_paste","curry paste","pate de curry"],
  ["corn_cake","corn cake","galette de mais"],["mixed_nuts","mixed nuts","melange de fruits secs"],
  ["raspberries","raspberries","framboises"],["orange","orange","orange"],
  ["vinaigrette","vinaigrette","vinaigrette"],["yoghurt","yoghurt","yaourt"],["prawns","prawns","crevettes"],
  ["turmeric","turmeric","curcuma"],["ginger","ginger","gingembre"],["beef_steak","beef steak","steak de boeuf"],
  ["coffee","coffee","cafe"],["mozzarella","mozzarella","mozzarella"],["melon","melon","melon"],
  ["ham","ham","jambon"],["bulgur","bulgur","boulgour"],
  ["couscous_wholemeal","wholemeal couscous","semoule complete"],
  ["baked_beans","baked beans","haricots a la sauce tomate"],["red_cabbage","red cabbage","chou rouge"],
  ["maple_syrup","maple syrup","sirop d'erable"],["sausage","sausage","saucisse"],["radish","radish","radis"],
  ["pork_chop","pork chop","cote de porc"],["goat_cheese","goat cheese","fromage de chevre"],
  ["creme_fraiche","soured cream","creme fraiche"],["coconut_yogurt","coconut yogurt","yaourt de coco"],
  ["poppy_seeds","poppy seeds","graines de pavot"],["cauliflower","cauliflower","chou fleur"],
  ["leek","leek","poireau"],
];

type Verdict = "bon" | "autre" | "rien";
const v = (term: string, slug: string): [Verdict, CompositionRef | null] => {
  const got = resolveIngredient(index, term);
  if (!got) return ["rien", null];
  return [got.slug === slug ? "bon" : "autre", got];
};

const tally = { en: { bon: 0, autre: 0, rien: 0 }, fr: { bon: 0, autre: 0, rien: 0 } };
const rows: string[] = [];
let enSeen = 0;
for (const [slug, en, fr] of PAIRS) {
  const target = bySlug.get(slug)!;
  const [ve, re] = v(en, slug);
  const [vf, rf] = v(fr, slug);
  tally.en[ve]++; tally.fr[vf]++;
  if (seen.has(normalizeTerm(en))) enSeen++;
  const mark = (x: Verdict, r: CompositionRef | null) => x === "bon" ? "✓" : x === "rien" ? "∅" : `≠${r!.slug}`;
  rows.push(`${slug}\t${en}\t${mark(ve, re)}\t${fr}\t${mark(vf, rf)}\t${seen.has(normalizeTerm(en)) ? "vu" : "—"}`);
}
const n = PAIRS.length;
const p = (x: number) => `${(x / n * 100).toFixed(1)} %`;
console.log("═══ ÉPREUVE DU NOM NU — même aliment, même règle, deux langues ═══");
console.log(`aliments : ${n}   (formes anglaises réellement observées dans le corpus : ${enSeen}/${n})\n`);
console.log("langue | bon aliment | AUTRE aliment | RIEN");
console.log(`EN     | ${String(tally.en.bon).padStart(3)} ${p(tally.en.bon).padStart(7)} | ${String(tally.en.autre).padStart(3)} ${p(tally.en.autre).padStart(7)} | ${String(tally.en.rien).padStart(3)} ${p(tally.en.rien).padStart(7)}`);
console.log(`FR     | ${String(tally.fr.bon).padStart(3)} ${p(tally.fr.bon).padStart(7)} | ${String(tally.fr.autre).padStart(3)} ${p(tally.fr.autre).padStart(7)} | ${String(tally.fr.rien).padStart(3)} ${p(tally.fr.rien).padStart(7)}`);
console.log(`\nÉCART sur « bon aliment » : ${(tally.en.bon - tally.fr.bon)} aliments, soit ${((tally.en.bon - tally.fr.bon) / n * 100).toFixed(1)} points`);
console.log("\nslug\tEN\t\tFR\t\tobservé");
for (const r of rows) console.log(r);
