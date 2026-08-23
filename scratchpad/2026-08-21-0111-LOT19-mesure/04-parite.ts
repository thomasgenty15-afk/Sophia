/**
 * LOT 19 — L'ÉPREUVE DE PARITÉ.
 *
 * ⚠️ CES CHAÎNES FRANÇAISES SONT CONSTRUITES, PAS OBSERVÉES — et c'est dit en
 * tête du rapport. Le corpus vivant ne porte qu'UN plan français; il ne peut
 * pas répondre à la question. La construction est transparente et vérifiable:
 * pour chacun des 150 aliments que le corpus RÉEL atteint le plus souvent, on
 * écrit le nom que la cuisine française lui donne, et on le passe au VRAI
 * résolveur. L'anglais, lui, résout par construction — c'est le terme observé.
 *
 * L'écart entre les deux est le désavantage, et chaque échec est une
 * proposition d'alias dont la CIBLE est déjà connue (le slug que l'anglais
 * atteint), donc vérifiable ligne à ligne.
 */
import {
  buildCompositionIndex, type CompositionRef, resolveIngredient, type YieldClass,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import type { FoodGroupRef } from "../../supabase/functions/_shared/keel/tokens.ts";

const dir = Deno.args[0];
const read = (f: string) => JSON.parse(Deno.readTextFileSync(`${dir}/${f}`));
const refRows = read("refs.json") as Record<string, any>[];
const refs: CompositionRef[] = refRows.map((r) => ({
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

/** [slug attendu, terme anglais OBSERVÉ, ...formes françaises à éprouver] */
const PROBE: [string, string, ...string[]][] = [
  ["olive_oil","olive oil","huile d'olive","huile d’olive"],
  ["lemon","lemon","citron","citrons"],
  ["salt","salt","sel","sel fin"],
  ["tomato","tomatoes","tomate","tomates"],
  ["greek_yogurt","greek yogurt","yaourt grec","yaourt a la grecque"],
  ["garlic","garlic","ail","gousses d'ail"],
  ["cucumber","cucumber","concombre","concombres"],
  ["black_pepper","black pepper","poivre noir","poivre"],
  ["wholemeal_bread","wholemeal bread","pain complet","pain de ble complet"],
  ["chicken_thigh","chicken thighs","cuisses de poulet","hauts de cuisse de poulet"],
  ["whole_eggs","eggs","oeufs","œufs"],
  ["courgette","courgettes","courgette","courgettes"],
  ["lettuce","lettuce","laitue","salade verte"],
  ["bell_pepper","red peppers","poivron","poivrons rouges"],
  ["onion","onion","oignon","oignons"],
  ["oats","rolled oats","flocons d'avoine","avoine"],
  ["white_rice","rice","riz blanc","riz"],
  ["red_onion","red onion","oignon rouge","oignons rouges"],
  ["potato","new potatoes","pomme de terre","pommes de terre"],
  ["spinach","spinach","epinards","pousses d'epinard"],
  ["water","water","eau"],
  ["paprika","smoked paprika","paprika fume","paprika doux"],
  ["carrot","carrots","carotte","carottes"],
  ["herbs_parsley","parsley","persil","persil plat"],
  ["plain_yogurt","plain yogurt","yaourt nature"],
  ["honey","honey","miel"],
  ["couscous","couscous","semoule","semoule de couscous"],
  ["tuna_tinned","tuna","thon en conserve","thon au naturel"],
  ["green_beans","green beans","haricots verts"],
  ["mixed_berries","berries","fruits rouges","melange de fruits rouges"],
  ["butter","butter","beurre"],
  ["peach","peaches","peche","peches"],
  ["cumin","ground cumin","cumin moulu","cumin"],
  ["tinned_tomatoes","chopped tomatoes","tomates concassees","tomates pelees"],
  ["salmon","salmon fillets","filets de saumon","saumon"],
  ["turkey_mince","turkey mince","dinde hachee","viande hachee de dinde"],
  ["bread","bread","pain"],
  ["chickpeas_tinned","chickpeas","pois chiches","pois chiches en conserve"],
  ["cooked_rice","cooked rice","riz cuit"],
  ["white_pasta","pasta","pates","pates seches"],
  ["apple","apple","pomme","pommes"],
  ["soy_sauce","soy sauce","sauce soja","sauce de soja"],
  ["banana","banana","banane","bananes"],
  ["milk_semi","milk","lait demi ecreme","lait"],
  ["broccoli","broccoli","brocoli","brocolis"],
  ["feta","feta","feta"],
  ["white_beans","cannellini beans","haricots blancs"],
  ["peanut_butter","peanut butter","beurre de cacahuete","puree de cacahuete"],
  ["herbs_thyme","thyme","thym"],
  ["chicken_breast","chicken breast","blanc de poulet","filet de poulet"],
  ["lentils_dry","red lentils","lentilles corail","lentilles seches"],
  ["lime","lime","citron vert"],
  ["almonds","almonds","amandes"],
  ["mixed_vegetables","mixed vegetables","melange de legumes","legumes surgeles"],
  ["kidney_beans","kidney beans","haricots rouges"],
  ["spring_onion","spring onions","oignon nouveau","cebette"],
  ["avocado","avocado","avocat","avocats"],
  ["hummus","hummus","houmous"],
  ["cottage_cheese","cottage cheese","cottage cheese"],
  ["white_bread","white bread","pain de mie","pain blanc"],
  ["dried_herbs","dried oregano","herbes sechees","herbes de provence"],
  ["walnuts","walnuts","noix","cerneaux de noix"],
  ["passata","passata","coulis de tomate","coulis de tomates"],
  ["aubergine","aubergine","aubergine","aubergines"],
  ["granola","granola","granola"],
  ["chilli_powder","chilli powder","piment en poudre","piment moulu"],
  ["pumpkin_seeds","pumpkin seeds","graines de courge"],
  ["mayonnaise","mayonnaise","mayonnaise"],
  ["mustard","mustard","moutarde"],
  ["sweetcorn","sweetcorn","mais","mais doux"],
  ["skyr","skyr","skyr"],
  ["egg","egg","oeuf","œuf"],
  ["parmesan","parmesan","parmesan"],
  ["celery","celery","celeri","celeri branche"],
  ["herbs_basil","basil","basilic"],
  ["herbs_mint","mint","menthe","menthe fraiche"],
  ["vinegar","vinegar","vinaigre"],
  ["beef_mince","beef mince","boeuf hache","viande hachee de boeuf"],
  ["black_beans","black beans","haricots noirs"],
  ["cheddar","cheddar","cheddar"],
  ["stock_cube","stock cube","cube de bouillon"],
  ["cinnamon","cinnamon","cannelle"],
  ["rocket","rocket","roquette"],
  ["tortilla_wrap","tortillas","tortilla","galette de ble"],
  ["herbs_coriander","fresh coriander","coriandre","coriandre fraiche"],
  ["green_peas","peas","petits pois"],
  ["breadcrumbs","breadcrumbs","chapelure"],
  ["blueberries","blueberries","myrtilles"],
  ["corn_tortilla_wrap_be","corn tortillas","tortilla de mais","tortillas de mais"],
  ["mushroom","mushrooms","champignon","champignons"],
  ["chia_seeds","chia seeds","graines de chia"],
  ["sesame_oil","sesame oil","huile de sesame"],
  ["herbs_dill","dill","aneth"],
  ["plum","plums","prune","prunes"],
  ["vegetable_stock","vegetable stock","bouillon de legumes"],
  ["quinoa","quinoa","quinoa"],
  ["sunflower_seeds","sunflower seeds","graines de tournesol"],
  ["sweet_potato","sweet potato","patate douce","patates douces"],
  ["strawberries","strawberries","fraises"],
  ["pita_bread","pita bread","pain pita","pita"],
  ["lemon_wedge","lemon wedge","quartier de citron","quartiers de citron"],
  ["tomato_puree","tomato paste","concentre de tomate","concentre de tomates"],
  ["brown_rice","brown rice","riz complet","riz brun"],
  ["cod","cod fillets","cabillaud","filets de cabillaud"],
  ["wholewheat_pasta","wholewheat pasta","pates completes","pates au ble complet"],
  ["jam","blackcurrant jam","confiture","confiture de cassis"],
  ["tortilla_wholemeal","wholemeal tortillas","tortilla complete","tortillas completes"],
  ["herbs_bay_leaf","bay leaf","feuille de laurier","laurier"],
  ["beef_chuck","beef chuck","paleron de boeuf","paleron"],
  ["hot_sauce","hot sauce","sauce piquante"],
  ["pear","pear","poire","poires"],
  ["salsa","salsa","salsa"],
  ["lentils_cooked","cooked lentils","lentilles cuites"],
  ["pita_wholemeal","wholemeal pitta","pain pita complet","pita complet"],
  ["mixed_seeds","mixed seeds","graines melangees","melange de graines"],
  ["coconut_milk","coconut milk","lait de coco"],
  ["turkey_breast","turkey breast","blanc de dinde","escalope de dinde"],
  ["apricot_pitted","apricots","abricot","abricots"],
  ["herbs_chives","chives","ciboulette"],
  ["polenta","polenta","polenta"],
  ["noodles","noodles","nouilles"],
  ["curry_paste","curry paste","pate de curry"],
  ["corn_cake","corn cakes","galette de mais","galettes de mais"],
  ["mixed_nuts","mixed nuts","melange de fruits secs","fruits secs melanges"],
  ["raspberries","raspberries","framboises"],
  ["orange","orange","orange","oranges"],
  ["vinaigrette","vinaigrette","vinaigrette"],
  ["yoghurt","yoghurt","yaourt"],
  ["prawns","prawns","crevettes"],
  ["turmeric","turmeric","curcuma"],
  ["ginger","ginger","gingembre"],
  ["beef_steak","steak","steak de boeuf","bifteck"],
  ["coffee","black coffee","cafe noir","cafe"],
  ["mozzarella","mozzarella","mozzarella"],
  ["melon","melon","melon"],
  ["ham","ham","jambon","jambon blanc"],
  ["bulgur","bulgur","boulgour"],
  ["couscous_wholemeal","wholewheat couscous","semoule complete","couscous complet"],
  ["baked_beans","baked beans","haricots a la sauce tomate"],
  ["red_cabbage","red cabbage","chou rouge"],
  ["maple_syrup","maple syrup","sirop d'erable"],
  ["sausage","pork sausages","saucisse","saucisses"],
  ["radish","radishes","radis"],
  ["pork_chop","pork chops","cote de porc","cotes de porc"],
  ["goat_cheese","goat cheese","fromage de chevre","chevre"],
  ["creme_fraiche","soured cream","creme fraiche"],
  ["coconut_yogurt","coconut yoghurt","yaourt au lait de coco","yaourt de coco"],
  ["poppy_seeds","poppy seeds","graines de pavot"],
  ["tuna_tinned","tinned tuna","thon en boite"],
  ["mixed_berries","frozen berries","fruits rouges surgeles"],
  ["cauliflower","cauliflower","chou fleur","chou-fleur"],
  ["leek","leek","poireau","poireaux"],
];

let ok = 0, wrong = 0, miss = 0, total = 0;
const failures: string[] = [];
const wrongs: string[] = [];
for (const [slug, en, ...frs] of PROBE) {
  const target = bySlug.get(slug);
  if (!target) { console.log(`⚠️  slug inconnu: ${slug}`); continue; }
  const enRef = resolveIngredient(index, en);
  for (const fr of frs) {
    total++;
    const got = resolveIngredient(index, fr);
    if (!got) { miss++; failures.push(`${fr}\t→ RIEN\t(attendu ${slug} — ${target.label})\t[EN observé: "${en}" → ${enRef?.slug ?? "RIEN"}]`); }
    else if (got.slug === slug) ok++;
    else {
      wrong++;
      wrongs.push(`${fr}\t→ ${got.slug} (${got.label}, ${got.foodGroupRef}, ${got.energyKcal} kcal)\tATTENDU ${slug} (${target.label}, ${target.foodGroupRef}, ${target.energyKcal} kcal)`);
    }
  }
}
console.log("═══ ÉPREUVE DE PARITÉ — la forme française du même aliment ═══");
console.log(`aliments éprouvés          ${PROBE.length}`);
console.log(`formes françaises éprouvées ${total}`);
console.log(`  atteignent le BON aliment ${ok}  = ${(ok / total * 100).toFixed(1)} %`);
console.log(`  atteignent un AUTRE aliment ${wrong}  = ${(wrong / total * 100).toFixed(1)} %   <- le pire cas: un nombre faux`);
console.log(`  n'atteignent RIEN          ${miss}  = ${(miss / total * 100).toFixed(1)} %   <- une abstention`);
console.log(`\n── LES FORMES QUI ATTEIGNENT UN AUTRE ALIMENT (${wrongs.length}) ──`);
for (const w of wrongs) console.log("  " + w);
console.log(`\n── LES FORMES QUI N'ATTEIGNENT RIEN (${failures.length}) ──`);
for (const f of failures) console.log("  " + f);
