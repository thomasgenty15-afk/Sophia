/**
 * ══════════════════════════════════════════════════════════════════════════
 * §2.1 / §2.2 — LA RÉFÉRENCE N=4 OÙ **UN SEUL LOT** NOURRIT QUATRE BOUCHES
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
 *     scratchpad/2026-09-13-ISOLEMENT-ET-COMPLEMENT/batir-ref4-partage.ts \
 *     --contrats=scratchpad/2026-09-13-ISOLEMENT-ET-COMPLEMENT/lot-iso1-contrats.json \
 *     --sortie=scratchpad/2026-09-13-ISOLEMENT-ET-COMPLEMENT/ref4-partage-iso1.json
 *
 * ⛔ POURQUOI ELLE EXISTE, ALORS QUE `batir-ref4.ts` EXISTE DÉJÀ. Dans la
 * référence du lot 2, `prep_tofu_table` est tirée par QUATRE repas de la même
 * table et Lea a son propre lot. Le §2.1 demande autre chose, en toutes
 * lettres : « un lot utilisé par plusieurs PERSONNES sur plusieurs repas »,
 * puis « un besoin de variante pour UNE SEULE personne ». Sans une bouche à
 * plat DÉDIÉ qui puise dans le lot COMMUN, il n'y a rien à isoler : forker le
 * lot déplacerait un REPAS, pas une personne.
 *
 * ── CE QUI CHANGE, ET RIEN D'AUTRE ───────────────────────────────────────
 *   · `prep_tofu_table` fait SIX parts et elle est tirée six fois :
 *       table lundi midi · table lundi soir · table mardi midi ·
 *       table mardi soir · **Lea lundi midi** · **Lea mardi midi**
 *   · le déjeuner de Lea reste un plat DÉDIÉ (`for_member_id`) — c'est ce qui
 *     donne à son repas une unité à elle, donc une adresse qu'un patch peut
 *     repointer sans toucher à celles des autres ;
 *   · `prep_tempeh_lea` disparaît : un second lot rendrait l'isolement
 *     inutile, et la session ne cuisinerait plus ce qu'elle décrit.
 *
 * ⛔ CETTE RÉFÉRENCE EST CONSTRUITE, ET LE RAPPORT DOIT LE DIRE. Elle est
 * mesurée par les fonctions de PRODUCTION (`dishEnergy`, `weighedReadyGrams`,
 * `proteinOfUnit`, `foldPreparationsIntoDishes`) contre les contrats que
 * `slot_nutrition_contract.ts` calcule pour CE compte — mais elle ne dit rien
 * de la compétence générative du modèle.
 */
import {
  indexDuReferentiel,
  ligne,
  type Ligne,
  mesurer,
  refusNonComposables,
} from "../2026-09-13-CIBLES-PAR-PERSONNE/composer-reference.ts";
import { foldPreparationsIntoDishes } from "../../supabase/functions/_shared/keel/meal_verdict.ts";
import {
  contratsDeLaDemande,
  couloirCommun,
} from "../2026-09-13-CIBLES-PAR-PERSONNE/mesurer-reference.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const index = await indexDuReferentiel();
const CONTRATS = Deno.args.find((a) => a.startsWith("--contrats="))?.slice(11) ??
  "scratchpad/2026-09-13-ISOLEMENT-ET-COMPLEMENT/lot-iso1-contrats.json";
const SORTIE = Deno.args.find((a) => a.startsWith("--sortie="))?.slice(9) ??
  "scratchpad/2026-09-13-ISOLEMENT-ET-COMPLEMENT/ref4-partage-iso1.json";
const contrats = await contratsDeLaDemande(`${ROOT}${CONTRATS}`);
const idDe = (prenom: string) => contrats.find((c) => c.prenom === prenom)!.memberId;
const LEA = idDe("Lea");
const TABLE = contrats.map((c) => c.memberId).filter((id) => id !== LEA);
/** Le dîner est le SEUL repas que les quatre bouches partagent. */
const DINER_COMMUN = contrats.map((c) => c.memberId);

// ⛔ SIX PARTS POUR SIX PRÉLÈVEMENTS. `foldPreparationsIntoDishes` plie
// `servings ÷ servings_made` : un lot de quatre parts tiré six fois donnerait
// à chacun une part et demie, et la moitié du foyer sortirait de ses bornes
// pour une raison qui n'a rien à voir avec la recette.
const PARTS_DU_LOT = 6;
const preparations = [
  {
    id: "prep_tofu_table",
    title: "Tofu doré aux graines et courgette",
    servings_made: PARTS_DU_LOT,
    ingredients: [
      ligne("tofu", "tofu", 2700),
      ligne("graines de courge", "pumpkin_seeds", 682),
      ligne("courgette", "courgette", 180),
      ligne("huile d'olive", "olive_oil", 12),
      ligne("sauce soja", "soy_sauce", 75),
    ],
    method:
      "Couper le tofu en cubes, le faire dorer à l'huile d'olive avec la courgette, " +
      "déglacer à la sauce soja et parsemer de graines de courge. " +
      "Laisser tiédir et répartir en six portions au réfrigérateur.",
    active_minutes: 25,
    total_minutes: 40,
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
  for_member_id?: string;
  mangeurs: string[];
}

const dishes: PlatBrut[] = [];
for (const jour of ["mon", "tue"]) {
  // ── LES TROIS PLATS DE LA TABLE (Paul, Nils, Iris) ──────────────────────
  dishes.push({
    name: `Brouillade de tofu ${jour}`,
    title: "Tofu brouillé, edamame, graines de courge et pain complet",
    day: jour,
    slot: "breakfast",
    ingredients: [
      ligne("tofu", "tofu", 250),
      ligne("edamame", "edamame", 110),
      ligne("graines de courge", "pumpkin_seeds", 52),
      ligne("pain complet", "wholemeal_bread", 12),
      ligne("épinards", "spinach", 40),
      ligne("huile d'olive", "olive_oil", 3),
    ],
    method:
      "Émietter le tofu dans une poêle huilée, le faire dorer avec les épinards, " +
      "parsemer de graines de courge et servir avec le pain complet.",
    why: "Un petit-déjeuner salé qui porte la protéine du matin, végétal pour toute la table.",
    uses: [],
    same_day: { kind: "cook_fresh", minutes: 8 },
    mangeurs: TABLE,
  });
  dishes.push({
    name: `Bol tofu graines ${jour}`,
    title: "Tofu doré, graines de courge et couscous complet",
    day: jour,
    slot: "lunch",
    ingredients: [
      ligne("couscous complet", "couscous_wholemeal", 18),
      ligne("graines de courge", "pumpkin_seeds", 35),
    ],
    method:
      "Verser de l'eau bouillante sur le couscous, laisser gonfler cinq minutes, " +
      "ajouter la portion de tofu doré et les graines de courge.",
    why: "Le lot de tofu du lundi porte le déjeuner de la table sans nouvelle cuisson.",
    uses: [{ preparation_id: "prep_tofu_table", servings: 1, kept: "fridge" }],
    same_day: { kind: "assemble", minutes: 6 },
    mangeurs: TABLE,
  });
  dishes.push({
    name: `Assiette tofu ${jour}`,
    title: "Tofu doré, edamame et tomate",
    day: jour,
    slot: "dinner",
    ingredients: [
      ligne("edamame", "edamame", 120),
      ligne("tomate", "tomato", 30),
      ligne("graines de courge", "pumpkin_seeds", 25),
    ],
    method:
      "Réchauffer la portion de tofu doré, ajouter les edamame et la tomate coupée, " +
      "parsemer de graines de courge.",
    why: "Le même lot donne le dîner de la table, en changeant l'accompagnement.",
    uses: [{ preparation_id: "prep_tofu_table", servings: 1, kept: "fridge" }],
    same_day: { kind: "reheat_only", minutes: 8 },
    // ⛔ TOUT LE FOYER AU DÎNER, Y COMPRIS LA BOUCHE QUI A SES PROPRES PLATS
    // AILLEURS. C'est la seule configuration où un COMPLÉMENT est atteignable
    // (§2.2) : la personne doit être une PORTEUSE DE PLAT — sinon le parseur
    // jette son `for_member_id` — ET manger le plat de la TABLE à ce
    // moment-là — sinon la recherche du plat partagé rend `no_shared_dish`.
    // Les deux conditions ne se rencontrent qu'ici.
    mangeurs: DINER_COMMUN,
  });
  // ── LES TROIS PLATS DÉDIÉS DE LEA ───────────────────────────────────────
  dishes.push({
    name: `Bol de Lea ${jour} matin`,
    title: "Yaourt de soja, avoine et graines de courge",
    day: jour,
    slot: "breakfast",
    ingredients: [
      // ⛔ LE PETIT-DÉJEUNER PORTE LA PROTÉINE DE SA JOURNÉE, et le choix des
      // aliments l'est POUR CETTE RAISON : au dîner elle mange désormais la
      // part commune, moins riche que le plat qu'elle avait à elle. Ce qui
      // compte n'est pas la protéine au gramme mais la protéine PAR KILOCALORIE
      // — le moteur dimensionne à l'énergie, donc un aliment dense en protéine
      // ET en énergie (les graines) FAIT BAISSER la protéine servie.
      ligne("yaourt de soja", "soy_yogurt", 260),
      ligne("avoine", "oats", 8),
      ligne("graines de courge", "pumpkin_seeds", 26),
      ligne("edamame", "edamame", 450),
    ],
    method:
      "Mélanger le yaourt de soja, l'avoine et les graines de courge, " +
      "servir avec les edamame tièdes.",
    why: "Un bol du matin à elle, monté avant que la poêle de la table ne serve.",
    uses: [],
    same_day: { kind: "assemble", minutes: 4 },
    for_member_id: LEA,
    mangeurs: [LEA],
  });
  // ⛔ LE DÉJEUNER DE LEA TIRE LE **LOT COMMUN** — c'est la case du §2.1.
  // Il reste un plat DÉDIÉ : c'est ce qui lui donne une unité à elle, donc une
  // adresse qu'un patch peut repointer sans toucher à celle de la table.
  dishes.push({
    name: `Déjeuner de Lea ${jour}`,
    title: "Tofu doré du lot commun et graines de courge",
    day: jour,
    slot: "lunch",
    // ⛔ SA PART EST PRESQUE TOUT LE PLAT, ET C'EST VOULU. Un plat dédié dont
    // la garniture pèse plus que le lot aurait une densité à lui : le lot
    // commun ne serait plus ce qui décide de son assiette, et l'isoler ne
    // corrigerait rien. Ici la densité servie est celle du lot, à vingt grammes
    // de graines près.
    ingredients: [
      ligne("graines de courge", "pumpkin_seeds", 20),
    ],
    method:
      "Réchauffer sa portion du lot de tofu doré et parsemer de graines de courge.",
    why: "Elle mange le même lot que la table, dans une assiette montée pour elle.",
    uses: [{ preparation_id: "prep_tofu_table", servings: 1, kept: "fridge" }],
    same_day: { kind: "reheat_only", minutes: 7 },
    for_member_id: LEA,
    mangeurs: [LEA],
  });
}

// ⛔ LE NOMBRE DE PRÉLÈVEMENTS EST COMPTÉ, PAS SUPPOSÉ. Un lot qui produit
// moins de parts qu'on n'y puise divise la part de tout le monde en silence.
const tirages = dishes.flatMap((d) => d.uses)
  .filter((u) => u.preparation_id === "prep_tofu_table")
  .reduce((n, u) => n + u.servings, 0);
if (tirages !== PARTS_DU_LOT) {
  console.error(
    `⛔ prep_tofu_table fait ${PARTS_DU_LOT} part(s) et on y puise ${tirages} fois.`,
  );
  Deno.exit(2);
}

const refuses = refusNonComposables(index, [
  ...preparations.flatMap((p) => p.ingredients),
  ...dishes.flatMap((d) => d.ingredients),
]);
if (refuses.length > 0) {
  console.error(`⛔ identifiant(s) NON COMPOSABLE(S) : ${refuses.join(", ")}`);
  Deno.exit(2);
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

console.log("── LA RÉFÉRENCE N=4 À LOT COMMUN, MESURÉE CONTRE CHAQUE MANGEUR ──");
let toutBon = true;
const protParBoucheJour: Record<string, Record<string, number>> = {};
for (const [i, d] of dishes.entries()) {
  const m = mesurer(index, { method: d.method, ingredients: plies[i].ingredients as never });
  const k = couloirCommun(contrats, d.day, d.slot, d.mangeurs);
  const qui = d.mangeurs.map((id) => contrats.find((c) => c.memberId === id)!.prenom);
  if (k === null) {
    console.log(`${d.day}/${d.slot} (${qui.join("+")}) ⛔ INTERSECTION VIDE`);
    toutBon = false;
    continue;
  }
  const rhoOk = m.densite !== null && m.densite >= k.min && m.densite <= k.max;
  const pct = m.kcal && m.proteineG ? (m.proteineG * 4) / m.kcal : 0;
  if (!rhoOk) toutBon = false;
  console.log(
    `${d.day}/${d.slot.padEnd(10)} ${(d.for_member_id ? "DÉDIÉ  " : "partagé").padEnd(8)} ` +
      `ρ=${String(m.densite?.toFixed(1)).padStart(6)} [${k.min.toFixed(0)}–${k.max.toFixed(0)}] ` +
      `${rhoOk ? "✅" : "❌"}  protéine ${(pct * 100).toFixed(1)} %`,
  );
  for (const id of d.mangeurs) {
    const c = contrats.find((x) => x.memberId === id)!;
    const cas = c.cases.find((x) => x.jour === d.day && x.slot === d.slot);
    if (cas === undefined) {
      console.log(`      · ${c.prenom.padEnd(5)} ne mange pas à ce moment (rythme déclaré)`);
      continue;
    }
    if (cas.cible === null) {
      console.log(`      · ${c.prenom.padEnd(5)} SANS OBJET — aucune cible de case`);
      continue;
    }
    if (m.densite === null || m.kcal === null) continue;
    const g = (cas.cible / m.densite) * 100;
    const prot = (m.proteineG ?? 0) * (cas.cible / m.kcal);
    const masseOk = g >= (cas.gMin ?? 0) && g <= (cas.gMax ?? 0);
    const repasOk = c.plancherParRepasG === null || prot >= c.plancherParRepasG;
    if (!masseOk || !repasOk) toutBon = false;
    protParBoucheJour[c.prenom] ??= {};
    protParBoucheJour[c.prenom][d.day] = (protParBoucheJour[c.prenom][d.day] ?? 0) + prot;
    console.log(
      `      · ${c.prenom.padEnd(5)} ${cas.cible.toFixed(0)} kcal → ${g.toFixed(0)} g ` +
        `[${cas.gMin}–${cas.gMax}] ${masseOk ? "✅" : "❌ masse"} · ${prot.toFixed(1)} g` +
        (c.plancherParRepasG !== null ? ` (≥${c.plancherParRepasG} ${repasOk ? "✅" : "❌"})` : ""),
    );
  }
}
console.log("");
for (const c of contrats) {
  for (const [j, p] of Object.entries(protParBoucheJour[c.prenom] ?? {})) {
    const ok = c.plancherProteineG === null || p >= c.plancherProteineG;
    if (!ok) toutBon = false;
    console.log(
      `protéine ${c.prenom.padEnd(5)} ${j} : ${p.toFixed(1)} g · plancher ${c.plancherProteineG} g ${
        ok ? "✅" : "❌"
      }`,
    );
  }
}

const RAYON: Record<string, string> = {
  tofu: "protein",
  edamame: "frozen",
  soy_yogurt: "dairy",
  pumpkin_seeds: "grains",
  oats: "grains",
  couscous_wholemeal: "grains",
  wholemeal_bread: "grains",
  olive_oil: "pantry",
  soy_sauce: "pantry",
  courgette: "produce",
  spinach: "produce",
  tomato: "produce",
};
const achats = new Map<string, { term: string; ref: string; g: number; aisle: string }>();
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
    ...(d.for_member_id ? { for_member_id: d.for_member_id } : {}),
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
      preparation_ids: ["prep_tofu_table"],
      total_minutes: 45,
      run_through:
        "Couper le tofu et la courgette, faire dorer le tout à l'huile d'olive, " +
        "déglacer à la sauce soja, ajouter les graines de courge. Laisser tiédir " +
        "et répartir en six portions étiquetées, une cuillère de service pour le lot.",
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
    "Un seul lot de tofu doré porte les midis et les soirs de la semaine : la table y puise quatre fois, et Lea deux fois, dans une assiette montée pour elle.",
  ],
};

const sortie = `${ROOT}${SORTIE}`;
Deno.mkdirSync(sortie.replace(/\/[^/]+$/, ""), { recursive: true });
Deno.writeTextFileSync(sortie, JSON.stringify(plan, null, 2));
console.log(`\n${toutBon ? "✅" : "⛔"} écrit : ${sortie}`);
if (!toutBon) Deno.exit(1);
