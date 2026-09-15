/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 §2.4 — LA RÉFÉRENCE N=4 : UN LOT PARTAGÉ, UN PLAT DÉDIÉ
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
 *     scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/batir-ref4.ts
 *
 * Le foyer, quatre profils qui ne se confondent pas :
 *   Paul  88 kg · fat_loss     · 2 454 kcal/j · plancher 176 g de protéine
 *   Lea   58 kg · fat_loss     · 1 551 kcal/j · plancher 116 g · VÉGANE + allergie
 *   Nils  92 kg · muscle_gain  · 4 099 kcal/j · plancher 147 g · 49 g/repas
 *   Iris  64 kg · muscle_gain  · 2 734 kcal/j · plancher 102 g · 34 g/repas
 *
 * ── CE QUE LE MOTEUR ORDONNE, LU DANS SON PROPRE CALENDRIER ───────────────
 *   · la base partagée suit la ligne VÉGANE (la plus stricte de la table) ;
 *   · un PLAT DÉDIÉ est commandé pour Lea sur les six cases
 *     (`for_member_id`), donc 12 plats pour un plafond de 12 ;
 *   · bandes du plat partagé (Paul + Nils + Iris) :
 *       petit-déjeuner 147–245 · déjeuner 235–250 · dîner 205–250
 *   · bande du plat de Lea : 112–172 · 112–250 · 112–241
 *
 * ⛔ LE DÉJEUNER PARTAGÉ EST LA CASE QUI MORD : quinze points de densité de
 * marge (235–250) ET 28,7 % de l'énergie en protéines (le plancher de Paul),
 * le tout VÉGAN. C'est la seule case de tout ce lot où l'intersection est
 * presque vide, et c'est pour ça qu'elle est bâtie autour du tofu, du tempeh
 * et des graines — pas par goût.
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
// ⟳ 2026-09-13 · LOT 2 §3 — LA MÊME FORME SERT LA VARIANTE. `--contrats=` et
// `--sortie=` permettent de rebâtir cette référence contre une AUTRE demande
// figée (bouche protégée, présences différentes) sans recopier le fichier :
// deux copies divergeraient à la première recette ajustée.
const CONTRATS = Deno.args.find((a) => a.startsWith("--contrats="))?.slice(11) ??
  "scratchpad/2026-09-11-CLOTURE/fixtures/lot2-ref4-contrats.json";
const SORTIE = Deno.args.find((a) => a.startsWith("--sortie="))?.slice(9) ??
  "scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/references/ref4.json";
const contrats = await contratsDeLaDemande(`${ROOT}${CONTRATS}`);
const idDe = (prenom: string) => contrats.find((c) => c.prenom === prenom)!.memberId;
// ⛔ LA TABLE EST « TOUT LE MONDE SAUF LA BOUCHE QUI A SON PLAT », lue sur les
// contrats et pas écrite à la main : une variante qui retire une bouche du
// foyer ferait sinon nommer un identifiant absent, et le moteur jetterait le
// plat dédié (« for_member_id … is not a mouth that gets its own dish »).
const LEA = idDe("Lea");
const PARTAGE = contrats.map((c) => c.memberId).filter((id) => id !== LEA);

const preparations = [
  {
    id: "prep_tofu_table",
    title: "Tofu doré aux graines et courgette",
    servings_made: 4,
    ingredients: [
      ligne("tofu", "tofu", 1800),
      ligne("graines de courge", "pumpkin_seeds", 455),
      ligne("courgette", "courgette", 120),
      ligne("huile d'olive", "olive_oil", 8),
      ligne("sauce soja", "soy_sauce", 50),
    ],
    method:
      "Couper le tofu en cubes, le faire dorer à l'huile d'olive avec la courgette, " +
      "déglacer à la sauce soja et parsemer de graines de courge. " +
      "Laisser tiédir et répartir en quatre portions au réfrigérateur.",
    active_minutes: 20,
    total_minutes: 35,
    cook_on: "mon",
  },
  {
    id: "prep_tempeh_lea",
    title: "Tempeh et lentilles pour Lea",
    servings_made: 2,
    ingredients: [
      ligne("tempeh", "tempeh", 420),
      ligne("lentilles", "lentils_cooked", 260),
      ligne("oignon", "onion", 90),
      ligne("huile d'olive", "olive_oil", 14),
    ],
    method:
      "Dans une poêle lavée et une huile neuve, faire revenir l'oignon, ajouter le tempeh " +
      "émietté puis les lentilles. Laisser mijoter dix minutes et répartir en deux portions.",
    active_minutes: 15,
    total_minutes: 25,
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
    mangeurs: PARTAGE,
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
    mangeurs: PARTAGE,
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
    mangeurs: PARTAGE,
  });
  // ── LES TROIS PLATS DÉDIÉS DE LEA ───────────────────────────────────────
  dishes.push({
    name: `Bol de Lea ${jour} matin`,
    title: "Yaourt de soja, avoine et graines de courge",
    day: jour,
    slot: "breakfast",
    ingredients: [
      ligne("yaourt de soja", "soy_yogurt", 260),
      ligne("avoine", "oats", 30),
      ligne("graines de courge", "pumpkin_seeds", 26),
      ligne("edamame", "edamame", 90),
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
  dishes.push({
    name: `Déjeuner de Lea ${jour}`,
    title: "Tempeh, lentilles et courgette",
    day: jour,
    slot: "lunch",
    ingredients: [
      ligne("courgette", "courgette", 90),
      ligne("graines de courge", "pumpkin_seeds", 16),
    ],
    method:
      "Réchauffer sa portion de tempeh et lentilles dans sa propre poêle, " +
      "ajouter la courgette et les graines de courge.",
    why: "Son lot à elle, cuisiné et mis en boîte avant celui de la table.",
    uses: [{ preparation_id: "prep_tempeh_lea", servings: 1, kept: "fridge" }],
    same_day: { kind: "reheat_only", minutes: 7 },
    for_member_id: LEA,
    mangeurs: [LEA],
  });
  dishes.push({
    name: `Dîner de Lea ${jour}`,
    title: "Tofu, edamame et épinards",
    day: jour,
    slot: "dinner",
    ingredients: [
      ligne("tofu", "tofu", 200),
      ligne("edamame", "edamame", 110),
      ligne("épinards", "spinach", 80),
      ligne("graines de courge", "pumpkin_seeds", 12),
      ligne("huile d'olive", "olive_oil", 5),
    ],
    method:
      "Faire sauter le tofu et les edamame dans sa propre poêle avec les épinards, " +
      "parsemer de graines de courge.",
    why: "Un dîner à elle, cuit en premier dans une poêle lavée et une huile neuve.",
    uses: [],
    same_day: { kind: "cook_fresh", minutes: 12 },
    for_member_id: LEA,
    mangeurs: [LEA],
  });
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

console.log("── LA RÉFÉRENCE N=4, MESURÉE CONTRE CHAQUE MANGEUR ───────────────");
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
    // ⟳ LOT 2 §3 — DEUX SILENCES DIFFÉRENTS, ET ILS NE SE MÉLANGENT PAS :
    //   · `cas` absent  = cette bouche ne mange PAS à ce moment (rythme déclaré) ;
    //   · `cible` nulle = elle mange, mais aucun gramme ne la vise (âge inconnu,
    //     maintien) — « sans objet », jamais un échec.
    if (cas === undefined) {
      console.log(`      · ${c.prenom.padEnd(5)} ne mange pas à ce moment (rythme déclaré)`);
      continue;
    }
    if (cas.cible === null) {
      console.log(
        `      · ${c.prenom.padEnd(5)} SANS OBJET — aucune cible de case ` +
          `(bac commun : aucun gramme ne la vise)`,
      );
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
  tempeh: "protein",
  edamame: "frozen",
  soy_yogurt: "dairy",
  lentils_cooked: "pantry",
  pumpkin_seeds: "grains",
  oats: "grains",
  couscous_wholemeal: "grains",
  wholemeal_bread: "grains",
  olive_oil: "pantry",
  soy_sauce: "pantry",
  courgette: "produce",
  spinach: "produce",
  tomato: "produce",
  onion: "produce",
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
      // ⚠️ LE LOT DE LEA EST NOMMÉ EN PREMIER, ET LE DÉROULÉ LE DIT : la
      // consigne « THE SAME KITCHEN, TWO DISHES » demande que le plat de la
      // bouche à contrainte médicale soit cuit et mis en boîte AVANT l'autre,
      // planche et poêle lavées entre les deux.
      preparation_ids: ["prep_tempeh_lea", "prep_tofu_table"],
      total_minutes: 60,
      run_through:
        "Commencer par le lot de Lea : poêle propre, huile neuve, faire revenir l'oignon, " +
        "ajouter le tempeh émietté puis les lentilles, mijoter dix minutes, mettre en boîte " +
        "et fermer les boîtes. Laver la planche, le couteau et la poêle, changer l'huile. " +
        "Faire ensuite dorer le tofu et la courgette, déglacer à la sauce soja, ajouter les " +
        "graines de courge, tiédir et répartir en quatre portions. Une cuillère de service " +
        "par lot, jamais passée de l'un à l'autre.",
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
    "Toute la fenêtre est végétale : la base partagée suit la ligne la plus stricte de la table, et Lea a son propre lot, cuit et mis en boîte avant celui des autres.",
  ],
};

const sortie = `${ROOT}${SORTIE}`;
Deno.mkdirSync(sortie.replace(/\/[^/]+$/, ""), { recursive: true });
Deno.writeTextFileSync(sortie, JSON.stringify(plan, null, 2));
console.log(`\n${toutBon ? "✅" : "⛔"} écrit : ${sortie}`);
if (!toutBon) Deno.exit(1);
