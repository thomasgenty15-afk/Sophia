/**
 * LOT 19 — LE CONTRÔLE ANGLAIS.
 *
 * ⚠️ SANS LUI, LA COMPARAISON EST TRUQUÉE. Les termes anglais du corpus
 * résolvent à 95 % *parce qu'on les a observés*: un terme qui rate n'entre pas
 * dans la liste des aliments atteints. L'épreuve française, elle, porte sur des
 * formes CONSTRUITES. Comparer les deux reviendrait à comparer une sélection à
 * une construction.
 *
 * Ce fichier construit donc des formes ANGLAISES par la même règle: pour chacun
 * des mêmes aliments, une ou deux formes qu'une cuisine anglophone écrit
 * (variantes US/UK, synonymes de rayon) — SANS regarder si elles sont dans le
 * corpus. Le taux obtenu ici est le comparable honnête du taux français.
 */
import {
  buildCompositionIndex, type CompositionRef, resolveIngredient, type YieldClass,
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

const PROBE: [string, ...string[]][] = [
  ["olive_oil","extra-virgin olive oil","light olive oil"],
  ["lemon","fresh lemon","unwaxed lemon"],
  ["salt","sea salt","fine salt"],
  ["tomato","vine tomatoes","salad tomatoes"],
  ["greek_yogurt","greek-style yogurt","full fat greek yogurt"],
  ["garlic","garlic bulb","fresh garlic"],
  ["cucumber","salad cucumber"],
  ["black_pepper","freshly ground black pepper","cracked black pepper"],
  ["wholemeal_bread","whole wheat bread","brown bread"],
  ["chicken_thigh","chicken thigh fillets","skinless chicken thighs"],
  ["whole_eggs","free range eggs","medium eggs"],
  ["courgette","zucchini","summer squash"],
  ["lettuce","iceberg lettuce","romaine lettuce"],
  ["bell_pepper","sweet peppers","capsicum"],
  ["onion","brown onion","cooking onion"],
  ["oats","oatmeal","porridge oats"],
  ["white_rice","long-grain white rice","plain rice"],
  ["red_onion","red onions"],
  ["potato","white potatoes","salad potatoes"],
  ["spinach","baby leaf spinach","young spinach"],
  ["water","cold water","filtered water"],
  ["paprika","sweet paprika","ground paprika"],
  ["carrot","baby carrots","carrot sticks"],
  ["herbs_parsley","flat-leaf parsley","curly parsley"],
  ["plain_yogurt","natural yogurt","plain natural yoghurt"],
  ["honey","runny honey","clear honey"],
  ["couscous","dry couscous","couscous grains"],
  ["tuna_tinned","tuna in brine","canned tuna in water"],
  ["green_beans","french beans","fine green beans"],
  ["mixed_berries","summer berries","mixed frozen berries"],
  ["butter","unsalted butter","salted butter"],
  ["peach","fresh peaches","ripe peach"],
  ["cumin","cumin seeds","whole cumin"],
  ["tinned_tomatoes","canned plum tomatoes","tin of chopped tomatoes"],
  ["salmon","salmon steaks","fresh salmon"],
  ["turkey_mince","minced turkey","ground turkey breast"],
  ["bread","fresh bread","loaf of bread"],
  ["chickpeas_tinned","garbanzo beans","tin of chickpeas"],
  ["cooked_rice","leftover rice","pre-cooked rice"],
  ["white_pasta","penne","spaghetti pasta"],
  ["apple","eating apple","crisp apple"],
  ["soy_sauce","light soy sauce","dark soy sauce"],
  ["banana","ripe banana","medium banana"],
  ["milk_semi","semi skimmed milk","half fat milk"],
  ["broccoli","tenderstem broccoli","broccoli spears"],
  ["feta","feta cheese","greek feta"],
  ["white_beans","haricot beans","butter beans"],
  ["peanut_butter","smooth peanut butter","crunchy peanut butter"],
  ["herbs_thyme","fresh thyme sprigs","thyme leaves"],
  ["chicken_breast","chicken breast fillet","skinless chicken breast"],
  ["lentils_dry","split red lentils","dried lentils"],
  ["lime","fresh lime","lime wedges"],
  ["almonds","flaked almonds","whole almonds"],
  ["mixed_vegetables","frozen mixed vegetables","mixed veg"],
  ["kidney_beans","red kidney beans","tinned kidney beans"],
  ["spring_onion","scallions","salad onions"],
  ["avocado","ripe avocado","hass avocado"],
  ["hummus","houmous","hummous"],
  ["cottage_cheese","low fat cottage cheese"],
  ["white_bread","sliced white bread","white loaf"],
  ["dried_herbs","mixed dried herbs","italian dried herbs"],
  ["walnuts","walnut halves","chopped walnuts"],
  ["passata","sieved tomatoes","tomato passata"],
  ["aubergine","eggplant","baby aubergine"],
  ["granola","crunchy granola"],
  ["chilli_powder","ground chilli","cayenne pepper"],
  ["pumpkin_seeds","pepitas","toasted pumpkin seeds"],
  ["mayonnaise","full fat mayonnaise","real mayonnaise"],
  ["mustard","wholegrain mustard","english mustard"],
  ["sweetcorn","corn kernels","tinned sweetcorn"],
  ["skyr","icelandic skyr","natural skyr"],
  ["egg","one egg","raw egg"],
  ["parmesan","parmigiano reggiano","grated parmesan cheese"],
  ["celery","celery stick","celery ribs"],
  ["herbs_basil","fresh basil leaves","sweet basil"],
  ["herbs_mint","fresh mint leaves","garden mint"],
  ["vinegar","white wine vinegar","cider vinegar"],
  ["beef_mince","minced beef","ground beef 5%"],
  ["black_beans","tinned black beans","turtle beans"],
  ["cheddar","mature cheddar","cheddar cheese"],
  ["stock_cube","beef stock cube","bouillon cube"],
  ["cinnamon","ground cinnamon","cinnamon stick"],
  ["rocket","arugula","wild rocket"],
  ["tortilla_wrap","flour tortilla","soft tortilla wrap"],
  ["herbs_coriander","cilantro","fresh coriander leaves"],
  ["green_peas","garden peas","frozen peas"],
  ["breadcrumbs","panko breadcrumbs","dried breadcrumbs"],
  ["blueberries","fresh blueberries","frozen blueberries"],
  ["corn_tortilla_wrap_be","corn tortilla","maize tortillas"],
  ["mushroom","button mushrooms","chestnut mushrooms"],
  ["chia_seeds","black chia seeds"],
  ["sesame_oil","toasted sesame oil"],
  ["herbs_dill","fresh dill fronds","dill weed"],
  ["plum","fresh plums","ripe plum"],
  ["vegetable_stock","vegetable broth","veg stock"],
  ["quinoa","white quinoa","dry quinoa"],
  ["sunflower_seeds","toasted sunflower seeds"],
  ["sweet_potato","sweet potatoes","orange sweet potato"],
  ["strawberries","fresh strawberries","hulled strawberries"],
  ["pita_bread","pitta bread","pocket pitta"],
  ["lemon_wedge","wedge of lemon","lemon wedges"],
  ["tomato_puree","tomato concentrate","double concentrated tomato puree"],
  ["brown_rice","wholegrain rice","wholemeal rice"],
  ["cod","cod loin","fresh cod"],
  ["wholewheat_pasta","whole wheat pasta","wholemeal pasta"],
  ["jam","fruit jam","strawberry jam"],
  ["tortilla_wholemeal","wholewheat tortilla","whole wheat wrap"],
  ["herbs_bay_leaf","dried bay leaves","bay leaves"],
  ["beef_chuck","chuck steak","braising steak"],
  ["hot_sauce","chilli sauce","tabasco sauce"],
  ["pear","ripe pear","conference pear"],
  ["salsa","tomato salsa","fresh salsa"],
  ["lentils_cooked","tinned lentils","ready cooked lentils"],
  ["pita_wholemeal","wholemeal pitta bread","wholewheat pita"],
  ["mixed_seeds","seed mix","mixed seed blend"],
  ["coconut_milk","tinned coconut milk","full fat coconut milk"],
  ["turkey_breast","turkey breast fillet","sliced turkey breast"],
  ["apricot_pitted","fresh apricots","stoned apricots"],
  ["herbs_chives","fresh chives","snipped chives"],
  ["polenta","instant polenta","cornmeal polenta"],
  ["noodles","egg noodles","rice noodles"],
  ["curry_paste","thai curry paste","red curry paste"],
  ["corn_cake","puffed corn cakes","corn cake"],
  ["mixed_nuts","nut mix","unsalted mixed nuts"],
  ["raspberries","fresh raspberries","frozen raspberries"],
  ["orange","fresh orange","large orange"],
  ["vinaigrette","french dressing","salad dressing"],
  ["yoghurt","natural yoghurt","plain yoghurt"],
  ["prawns","shrimp","king prawns"],
  ["turmeric","ground turmeric","turmeric powder"],
  ["ginger","fresh ginger","root ginger"],
  ["beef_steak","sirloin steak","rump steak"],
  ["coffee","brewed coffee","filter coffee"],
  ["mozzarella","mozzarella cheese","buffalo mozzarella"],
  ["melon","cantaloupe melon","honeydew melon"],
  ["ham","cooked ham","sliced ham"],
  ["bulgur","bulgur wheat","cracked wheat"],
  ["couscous_wholemeal","wholewheat couscous","wholegrain couscous"],
  ["baked_beans","beans in tomato sauce","tin of baked beans"],
  ["red_cabbage","shredded red cabbage"],
  ["maple_syrup","pure maple syrup"],
  ["sausage","pork sausage","sausages"],
  ["radish","radishes","red radish"],
  ["pork_chop","pork loin chop","pork chops"],
  ["goat_cheese","soft goats cheese","goats cheese"],
  ["creme_fraiche","soured cream","sour cream"],
  ["coconut_yogurt","coconut yogurt","dairy free coconut yoghurt"],
  ["poppy_seeds","blue poppy seeds"],
  ["cauliflower","cauliflower florets","cauli"],
  ["leek","leeks","trimmed leeks"],
];

let ok = 0, wrong = 0, miss = 0, total = 0;
const wrongs: string[] = [], failures: string[] = [];
for (const [slug, ...forms] of PROBE) {
  const target = bySlug.get(slug);
  if (!target) { console.log(`⚠️  slug inconnu: ${slug}`); continue; }
  for (const f of forms) {
    total++;
    const got = resolveIngredient(index, f);
    if (!got) { miss++; failures.push(`${f}\t→ RIEN\t(attendu ${slug} — ${target.label})`); }
    else if (got.slug === slug) ok++;
    else { wrong++; wrongs.push(`${f}\t→ ${got.slug} (${got.label}, ${got.foodGroupRef}, ${got.energyKcal} kcal)\tATTENDU ${slug} (${target.label}, ${target.foodGroupRef}, ${target.energyKcal} kcal)`); }
  }
}
console.log("═══ CONTRÔLE ANGLAIS — formes CONSTRUITES par la même règle ═══");
console.log(`aliments éprouvés           ${PROBE.length}`);
console.log(`formes anglaises éprouvées  ${total}`);
console.log(`  bon aliment   ${ok} = ${(ok / total * 100).toFixed(1)} %`);
console.log(`  AUTRE aliment ${wrong} = ${(wrong / total * 100).toFixed(1)} %`);
console.log(`  RIEN          ${miss} = ${(miss / total * 100).toFixed(1)} %`);
console.log(`\n── AUTRE ALIMENT (${wrongs.length}) ──`);
for (const w of wrongs) console.log("  " + w);
console.log(`\n── RIEN (${failures.length}) ──`);
for (const f of failures) console.log("  " + f);
