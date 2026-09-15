/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 §2.1 — LA RÉFÉRENCE N=1, BÂTIE CONTRE SES PROPRES CONTRATS
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
 *     scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/batir-ref1.ts
 *
 * Contrats visés (mesurés par `slot_nutrition_contract.ts` sur la demande figée
 * `lot2-ref1-contrats.json`, titulaire fat_loss 88 kg, apport fixe 200 g de
 * yaourt grec au petit-déjeuner, déjeuner marqué LÉGER) :
 *
 *   breakfast  495,8 kcal · masse 250–496 g · densité 100–198 kcal/100 g
 *   lunch      721,8 kcal · masse 250–700 g · densité 104–250
 *   dinner    1010,5 kcal · masse 250–700 g · densité 145–250
 *   plancher protéique du jour : 176 g (couvert : 176 × budget/cible)
 *
 * ⛔ LA DENSITÉ EST MESURÉE, JAMAIS DÉCLARÉE. Chaque plat est plié avec ses
 * casseroles (`foldPreparationsIntoDishes`) puis lu par `dishEnergy` +
 * `weighedReadyGrams` — les fonctions du moteur.
 */
import { indexDuReferentiel, ligne, type Ligne, mesurer } from "./composer-reference.ts";
import { foldPreparationsIntoDishes } from "../../supabase/functions/_shared/keel/meal_verdict.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const index = await indexDuReferentiel();

// ── LES CASSEROLES PARTAGÉES ──────────────────────────────────────────────
//
// ⚠️ UNE SEULE SESSION, LE PREMIER JOUR DE LA FENÊTRE. `cook_on` doit tomber
// dans la fenêtre servie, sinon la porte finale rend `cook_day_unplaced` —
// c'est exactement ce que le tir de provisionnement a montré (5 refus) quand
// la réponse en conserve cuisinait un vendredi hors fenêtre.
const preparations = [
  {
    id: "prep_poulet",
    title: "Poulet rôti au citron",
    servings_made: 2,
    ingredients: [
      ligne("blanc de poulet", "chicken_breast", 760),
      ligne("huile d'olive", "olive_oil", 24),
    ],
    method:
      "Chauffer le four à 200 °C. Poser les blancs de poulet sur une plaque, les huiler, " +
      "les rôtir 25 minutes. Laisser tiédir, puis répartir en deux portions au réfrigérateur.",
    active_minutes: 10,
    total_minutes: 35,
    cook_on: "mon",
  },
  {
    id: "prep_saumon",
    title: "Saumon rôti et pommes de terre",
    servings_made: 2,
    ingredients: [
      ligne("saumon", "salmon", 780),
      ligne("pomme de terre", "potato", 635),
      ligne("huile d'olive", "olive_oil", 24),
    ],
    method:
      "Sur la même plaque, rôtir les pommes de terre 20 minutes, ajouter les pavés de saumon " +
      "huilés et poursuivre 12 minutes. Laisser tiédir et répartir en deux portions.",
    active_minutes: 12,
    total_minutes: 40,
    cook_on: "mon",
  },
];

/** Un plat : ses ingrédients FRAIS, et ce qu'il tire des casseroles. */
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
    name: `Bol skyr ${jour}`,
    title: "Skyr, avoine, myrtilles et amandes",
    day: jour,
    slot: "breakfast",
    ingredients: [
      ligne("skyr", "skyr", 300),
      ligne("avoine", "oats", 55),
      ligne("myrtilles", "blueberries", 90),
      ligne("amandes", "almonds", 12),
    ],
    method: "Verser le skyr dans un bol, ajouter l'avoine, les myrtilles et les amandes concassées.",
    why: "Un petit-déjeuner froid, riche en protéines, qui se monte en trois minutes.",
    uses: [],
    same_day: { kind: "assemble", minutes: 3 },
  });
  dishes.push({
    name: `Assiette poulet ${jour}`,
    title: "Poulet, couscous complet, courgette et tomate",
    day: jour,
    slot: "lunch",
    ingredients: [
      ligne("couscous complet", "couscous_wholemeal", 95),
      ligne("courgette", "courgette", 180),
      ligne("tomate", "tomato", 90),
    ],
    method:
      "Verser de l'eau bouillante sur le couscous, laisser gonfler cinq minutes. " +
      "Ajouter la portion de poulet tiédie, la courgette poêlée et la tomate.",
    why: "Le poulet du lot devient un déjeuner complet sans nouvelle cuisson.",
    uses: [{ preparation_id: "prep_poulet", servings: 1, kept: "fridge" }],
    same_day: { kind: "assemble", minutes: 8 },
  });
  dishes.push({
    name: `Saumon ${jour}`,
    title: "Saumon, pommes de terre et haricots verts",
    day: jour,
    slot: "dinner",
    ingredients: [
      ligne("haricots verts", "green_beans", 150),
      ligne("huile d'olive", "olive_oil", 8),
    ],
    method:
      "Réchauffer la portion de saumon et de pommes de terre, " +
      "servir avec les haricots verts vapeur arrosés d'huile d'olive.",
    why: "Le lot du lundi donne deux dîners sans rallumer le four.",
    uses: [{ preparation_id: "prep_saumon", servings: 1, kept: "fridge" }],
    same_day: { kind: "reheat_only", minutes: 10 },
  });
}

// ── LA MESURE, PLIAGE COMPRIS ─────────────────────────────────────────────
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

const CIBLES: Record<string, { kcal: number; gMin: number; gMax: number; rMin: number; rMax: number }> = {
  breakfast: { kcal: 495.8, gMin: 250, gMax: 496, rMin: 100, rMax: 198 },
  lunch: { kcal: 721.8, gMin: 250, gMax: 700, rMin: 104, rMax: 250 },
  dinner: { kcal: 1010.5, gMin: 250, gMax: 700, rMin: 145, rMax: 250 },
};

console.log("── LA RÉFÉRENCE N=1, MESURÉE PAR LES LECTEURS DE PRODUCTION ──────");
console.log(
  "jour  moment      ρ mesurée   couloir     masse à la cible  bornes      protéine à la cible",
);
let protParJour: Record<string, number> = {};
let toutBon = true;
for (const [i, d] of dishes.entries()) {
  const m = mesurer(index, { method: d.method, ingredients: plies[i].ingredients as never });
  const c = CIBLES[d.slot];
  const masse = m.densite === null ? null : (c.kcal / m.densite) * 100;
  const prot = m.kcal === null || m.proteineG === null ? null : m.proteineG * (c.kcal / m.kcal);
  const rhoOk = m.densite !== null && m.densite >= c.rMin && m.densite <= c.rMax;
  const masseOk = masse !== null && masse >= c.gMin && masse <= c.gMax;
  if (!rhoOk || !masseOk) toutBon = false;
  protParJour[d.day] = (protParJour[d.day] ?? 0) + (prot ?? 0);
  console.log(
    `${d.day}   ${d.slot.padEnd(10)} ${String(m.densite?.toFixed(1) ?? "—").padStart(8)}   ` +
      `[${c.rMin}–${c.rMax}]`.padEnd(11) + ` ${String(masse?.toFixed(0) ?? "—").padStart(10)} g     ` +
      `[${c.gMin}–${c.gMax}]`.padEnd(11) + ` ${String(prot?.toFixed(1) ?? "—").padStart(6)} g   ` +
      `${rhoOk ? "✅" : "❌ densité"} ${masseOk ? "✅" : "❌ masse"}`,
  );
}
console.log("");
for (const [j, p] of Object.entries(protParJour)) {
  const couvert = 176 * (2228.1 / 2454);
  console.log(
    `protéine ${j} : ${p.toFixed(1)} g composés · plancher couvert ${couvert.toFixed(1)} g ` +
      `(176 g/jour × 2228,1/2454) ${p >= couvert ? "✅" : "❌ SOUS LE PLANCHER"}`,
  );
  if (p < couvert) toutBon = false;
}

// ── LE PLAN NU, ÉCRIT POUR `banc-lot-F.ts --reponse=` ─────────────────────
const achats = new Map<string, { term: string; ref: string; g: number; aisle: string }>();
const RAYON: Record<string, string> = {
  chicken_breast: "protein",
  salmon: "protein",
  skyr: "dairy",
  oats: "grains",
  couscous_wholemeal: "grains",
  blueberries: "produce",
  almonds: "grains",
  olive_oil: "pantry",
  potato: "produce",
  courgette: "produce",
  tomato: "produce",
  green_beans: "produce",
};
for (const l of [...preparations.flatMap((p) => p.ingredients), ...dishes.flatMap((d) => d.ingredients)]) {
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
      preparation_ids: ["prep_poulet", "prep_saumon"],
      total_minutes: 55,
      run_through:
        "Chauffer le four à 200 °C. Enfourner les pommes de terre, puis les blancs de poulet huilés " +
        "sur une seconde plaque. Ajouter le saumon aux pommes de terre pour les douze dernières minutes. " +
        "Laisser tiédir et ranger deux portions de chaque au réfrigérateur.",
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
  // ⚠️ UN TABLEAU DE PHRASES, ET PAS UNE CHAÎNE. Une chaîne rend
  // `plan_explanation_refused: unreadable` — mesuré au premier tir de cette
  // référence, et c'est un défaut de la FIXTURE, pas du moteur.
  explanation: [
    "Deux cuissons le lundi soir donnent les quatre repas chauds de la fenêtre ; les deux petits-déjeuners se montent au bol.",
  ],
};

const sortie = `${ROOT}scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/references/ref1.json`;
Deno.mkdirSync(sortie.replace(/\/[^/]+$/, ""), { recursive: true });
Deno.writeTextFileSync(sortie, JSON.stringify(plan, null, 2));
console.log(`\n${toutBon ? "✅" : "⛔"} écrit : ${sortie}`);
if (!toutBon) Deno.exit(1);
