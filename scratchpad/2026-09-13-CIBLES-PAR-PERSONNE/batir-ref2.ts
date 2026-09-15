/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 §2.2 — LA RÉFÉRENCE N=2, BÂTIE CONTRE LE COULOIR **COMMUN**
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
 *     scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/batir-ref2.ts
 *
 * Le foyer : Max (62 kg, muscle_gain, 2 912 kcal/j, plancher 99 g de protéine
 * et 33 g par repas) et Lea (58 kg, fat_loss, VÉGANE + allergie déclarée,
 * 1 551 kcal/j, plancher 116 g). Deux besoins qui ne se confondent pas, une
 * contrainte individuelle, une préparation partagée.
 *
 * ⛔ CE QUE LE COULOIR COMMUN IMPOSE, et c'est la moitié du travail : une
 * recette partagée doit tomber dans l'INTERSECTION des deux bouches —
 * [112–172] au petit-déjeuner, [167–250] au déjeuner, [146–241] au dîner.
 * Mesuré par `mesurer-reference.ts`, qui appelle `slot_nutrition_contract.ts`.
 *
 * ⛔ ET LA PROTÉINE EST LA CONTRAINTE QUI MORD. Le plancher de Lea (116 g sur
 * 1 551 kcal) demande **30 % de l'énergie en protéines**, VÉGANE. Toute
 * recette de cette référence est donc bâtie autour du soja et des légumineuses,
 * et pas par goût : c'est la seule famille du référentiel qui tienne ce taux à
 * la densité demandée.
 */
import {
  indexDuReferentiel,
  ligne,
  type Ligne,
  mesurer,
  refusNonComposables,
} from "./composer-reference.ts";
import { foldPreparationsIntoDishes } from "../../supabase/functions/_shared/keel/meal_verdict.ts";
import { contratsDeLaDemande, couloirCommun } from "./mesurer-reference.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const index = await indexDuReferentiel();
const contrats = await contratsDeLaDemande(
  `${ROOT}scratchpad/2026-09-11-CLOTURE/fixtures/lot2-ref2-contrats.json`,
);
const tous = contrats.map((c) => c.memberId);

const preparations = [
  {
    id: "prep_tempeh",
    title: "Tempeh mariné à la sauce soja et légumes",
    servings_made: 2,
    ingredients: [
      ligne("tempeh", "tempeh", 700),
      ligne("courgette", "courgette", 140),
      ligne("huile d'olive", "olive_oil", 30),
      ligne("sauce soja", "soy_sauce", 24),
    ],
    method:
      "Couper le tempeh en cubes, le faire dorer à l'huile d'olive avec la courgette, " +
      "déglacer à la sauce soja. Laisser tiédir et répartir en deux portions au réfrigérateur.",
    active_minutes: 15,
    total_minutes: 30,
    cook_on: "mon",
  },
  {
    id: "prep_tofu_lentilles",
    title: "Tofu et lentilles mijotés",
    servings_made: 2,
    ingredients: [
      ligne("tofu", "tofu", 820),
      ligne("lentilles", "lentils_cooked", 300),
      ligne("oignon", "onion", 100),
      ligne("huile d'olive", "olive_oil", 20),
    ],
    method:
      "Faire revenir l'oignon, ajouter le tofu émietté puis les lentilles. " +
      "Laisser mijoter dix minutes, tiédir et répartir en deux portions.",
    active_minutes: 15,
    total_minutes: 30,
    cook_on: "mon",
  },
];

interface PlatBrut {
  name: string;
  title: string;
  day: string;
  slot: string;
  ingredients: Ligne[];
  method: string;
  why: string;
  uses: { preparation_id: string; servings: number; kept: string }[];
  same_day: { kind: string; minutes: number };
}

const dishes: PlatBrut[] = [];
for (const jour of ["mon", "tue"]) {
  dishes.push({
    name: `Brouillade de tofu ${jour}`,
    title: "Tofu brouillé, épinards et pain complet",
    day: jour,
    slot: "breakfast",
    ingredients: [
      ligne("tofu", "tofu", 300),
      ligne("épinards", "spinach", 120),
      ligne("pain complet", "wholemeal_bread", 26),
      ligne("huile d'olive", "olive_oil", 4),
    ],
    method:
      "Émietter le tofu dans une poêle huilée, le faire dorer avec les épinards, " +
      "servir avec le pain complet.",
    why: "Un petit-déjeuner salé qui porte la protéine du matin sans produit animal.",
    uses: [],
    same_day: { kind: "cook_fresh", minutes: 8 },
  });
  dishes.push({
    name: `Bol tempeh ${jour}`,
    title: "Tempeh, couscous complet, edamame et courgette",
    day: jour,
    slot: "lunch",
    ingredients: [
      ligne("couscous complet", "couscous_wholemeal", 40),
      ligne("edamame", "edamame", 90),
      ligne("graines de courge", "pumpkin_seeds", 30),
    ],
    method:
      "Verser de l'eau bouillante sur le couscous, laisser gonfler cinq minutes. " +
      "Ajouter la portion de tempeh, les edamame et parsemer de graines de courge.",
    why: "Le lot de tempeh porte le déjeuner sans nouvelle cuisson.",
    uses: [{ preparation_id: "prep_tempeh", servings: 1, kept: "fridge" }],
    same_day: { kind: "assemble", minutes: 6 },
  });
  dishes.push({
    name: `Tofu lentilles ${jour}`,
    title: "Tofu, lentilles et tomate",
    day: jour,
    slot: "dinner",
    ingredients: [
      ligne("tomate", "tomato", 80),
      ligne("graines de courge", "pumpkin_seeds", 24),
    ],
    method:
      "Réchauffer la portion de tofu et lentilles, ajouter la tomate coupée " +
      "et les graines de courge.",
    why: "Le mijoté du lundi donne deux dîners sans rallumer le feu.",
    uses: [{ preparation_id: "prep_tofu_lentilles", servings: 1, kept: "fridge" }],
    same_day: { kind: "reheat_only", minutes: 8 },
  });
}

const plies = foldPreparationsIntoDishes({
  dishes: dishes.map((d) => ({
    slot: d.slot,
    method: d.method,
    ingredients: d.ingredients as never,
    uses: d.uses.map((u) => ({ preparationId: u.preparation_id, servings: u.servings })),
  })),
  preparations: preparations.map((p) => ({
    id: p.id,
    servingsMade: p.servings_made,
    ingredients: p.ingredients as never,
  })),
});

// ⛔ LA PORTE DE COMPOSITION D'ABORD : un `ref` non composable rend le plat
// NON MESURABLE, donc sans portion, donc refusé. Mesuré sur `tamari_sans_gluten`.
const refuses = refusNonComposables(index, [
  ...preparations.flatMap((p) => p.ingredients),
  ...dishes.flatMap((d) => d.ingredients),
]);
if (refuses.length > 0) {
  console.error(
    `⛔ ${refuses.length} identifiant(s) NON COMPOSABLE(S) : ${refuses.join(", ")}\n` +
      `   Le contrat de sortie rendrait « ref_refused » et le plat n'aurait AUCUNE portion.`,
  );
  Deno.exit(2);
}
console.log("── LA RÉFÉRENCE N=2, MESURÉE CONTRE LE COULOIR COMMUN ────────────");
let toutBon = true;
const protParBoucheJour: Record<string, Record<string, number>> = {};
for (const [i, d] of dishes.entries()) {
  const m = mesurer(index, { method: d.method, ingredients: plies[i].ingredients as never });
  const k = couloirCommun(contrats, d.day, d.slot, tous);
  if (k === null) {
    console.log(`${d.day}/${d.slot} ⛔ INTERSECTION VIDE — il faut un plat dédié`);
    toutBon = false;
    continue;
  }
  const rhoOk = m.densite !== null && m.densite >= k.min && m.densite <= k.max;
  const pctProt = m.kcal && m.proteineG ? (m.proteineG * 4) / m.kcal : null;
  console.log(
    `${d.day}/${d.slot.padEnd(10)} ρ=${String(m.densite?.toFixed(1)).padStart(6)} ` +
      `commun [${k.min.toFixed(0)}–${k.max.toFixed(0)}] ${rhoOk ? "✅" : "❌"}   ` +
      `protéine ${((pctProt ?? 0) * 100).toFixed(1)} % de l'énergie`,
  );
  if (!rhoOk) toutBon = false;
  // Ce que chaque bouche reçoit une fois la recette dimensionnée à SA cible.
  for (const c of contrats) {
    const cas = c.cases.find((x) => x.jour === d.day && x.slot === d.slot);
    if (!cas || cas.cible === null || m.densite === null || m.kcal === null) continue;
    const g = (cas.cible / m.densite) * 100;
    const prot = (m.proteineG ?? 0) * (cas.cible / m.kcal);
    const masseOk = cas.gMin !== null && cas.gMax !== null && g >= cas.gMin && g <= cas.gMax;
    if (!masseOk) toutBon = false;
    protParBoucheJour[c.prenom] ??= {};
    protParBoucheJour[c.prenom][d.day] = (protParBoucheJour[c.prenom][d.day] ?? 0) + prot;
    console.log(
      `      · ${c.prenom.padEnd(5)} ${cas.cible.toFixed(0)} kcal → ${g.toFixed(0)} g ` +
        `[${cas.gMin}–${cas.gMax}] ${masseOk ? "✅" : "❌ masse"} · ${prot.toFixed(1)} g de protéine` +
        (c.plancherParRepasG !== null
          ? ` (plancher par repas ${c.plancherParRepasG} g ${prot >= c.plancherParRepasG ? "✅" : "❌"})`
          : ""),
    );
    if (c.plancherParRepasG !== null && prot < c.plancherParRepasG) toutBon = false;
  }
}
console.log("");
for (const c of contrats) {
  for (const [j, p] of Object.entries(protParBoucheJour[c.prenom] ?? {})) {
    const ok = c.plancherProteineG === null || p >= c.plancherProteineG;
    if (!ok) toutBon = false;
    console.log(
      `protéine ${c.prenom} ${j} : ${p.toFixed(1)} g · plancher ${c.plancherProteineG} g ${ok ? "✅" : "❌"}`,
    );
  }
}

const achats = new Map<string, { term: string; ref: string; g: number; aisle: string }>();
const RAYON: Record<string, string> = {
  tempeh: "protein",
  tofu: "protein",
  lentils_cooked: "pantry",
  couscous_wholemeal: "grains",
  wholemeal_bread: "grains",
  pumpkin_seeds: "grains",
  edamame: "frozen",
  olive_oil: "pantry",
  soy_sauce: "pantry",
  courgette: "produce",
  spinach: "produce",
  tomato: "produce",
  onion: "produce",
};
for (
  const l of [
    ...preparations.flatMap((p) => p.ingredients),
    ...dishes.flatMap((d) => d.ingredients),
  ]
) {
  const prev = achats.get(l.ref);
  achats.set(l.ref, {
    term: l.term,
    ref: l.ref,
    g: (prev?.g ?? 0) + l.amount,
    aisle: RAYON[l.ref] ?? "other",
  });
}

const plan = {
  dishes: dishes.map((d, i) => ({
    name: d.name,
    title: d.title,
    slot: d.slot,
    day: d.day,
    ingredients: d.ingredients,
    method: d.method,
    why: d.why,
    density_check: Math.round(
      mesurer(index, { method: d.method, ingredients: plies[i].ingredients as never }).densite ?? 0,
    ),
    uses: d.uses,
    same_day: d.same_day,
  })),
  preparations,
  cooking_sessions: [
    {
      day: "mon",
      preparation_ids: ["prep_tempeh", "prep_tofu_lentilles"],
      total_minutes: 55,
      run_through:
        "Faire dorer le tempeh et la courgette à la poêle, déglacer à la sauce soja, réserver. " +
        "Dans la même poêle, faire revenir l'oignon, émietter le tofu, ajouter les lentilles " +
        "et laisser mijoter dix minutes. Tiédir et ranger deux portions de chaque au réfrigérateur.",
    },
  ],
  shopping_list: [...achats.values()].map((a) => ({
    term: a.term,
    ref: a.ref,
    quantity: `${a.g} g`,
    amount: a.g,
    unit: "g",
    aisle: a.aisle,
  })),
  explanation: [
    "Toute la fenêtre est végétale : la casserole suit le régime le plus strict de la table, et une seule session du lundi porte les quatre repas chauds.",
  ],
};

const sortie = `${ROOT}scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/references/ref2.json`;
Deno.mkdirSync(sortie.replace(/\/[^/]+$/, ""), { recursive: true });
Deno.writeTextFileSync(sortie, JSON.stringify(plan, null, 2));
console.log(`\n${toutBon ? "✅" : "⛔"} écrit : ${sortie}`);
if (!toutBon) Deno.exit(1);
