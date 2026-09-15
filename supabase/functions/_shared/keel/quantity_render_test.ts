/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE BANC DU LOT C — une quantité finale commune au calcul et à la cuisine.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CHAQUE BLOC PORTE UN CAS QUI MORD ET UN CAS QUI PASSE. Une garde qu'on
 * n'a vue que refuser ressemble exactement à une garde cassée qui refuse tout
 * (`guards-need-a-passing-case`), et une garde qu'on n'a vue qu'accepter ne
 * prouve rien du tout.
 *
 * Les nombres des fixtures viennent des deux plans archivés du lot 0
 * (`scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures/plans.json`), au
 * caractère: ce ne sont pas des exemples inventés pour ce banc.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  finalizePlanQuantities,
  finalizeQuantityProse,
  formatQuantityNumber,
  planQuantityLines,
  QUANTITY_READ_STATES,
  renderQuantity,
  roundQuantityLines,
} from "./quantity_render.ts";
import {
  LEADING_NUMBER_RE,
  methodQuantityForm,
  methodSpellsQuantities,
} from "./plan_proportion_units.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LA FIXTURE POULET — 458,66 g, jamais l'ancien 360
// ═══════════════════════════════════════════════════════════════════════════

// `prep_chicken` du plan PERTE `1f8a8988`, ligne 0, copiée telle quelle.
const POULET = {
  term: "cuisses de poulet désossées",
  quantity: "360 g de cuisses de poulet désossées",
  amount: 458.6625582082933,
  unit: "g",
};

Deno.test("① le poulet s'affiche à 458,66 g — et jamais à 360", () => {
  const r = renderQuantity(POULET, "fr");
  assertEquals(r.readState, "structured");
  assertEquals(r.text, "458,66 g de cuisses de poulet désossées");
  // ⛔ LE CAS QUI MORD, ÉCRIT COMME UNE INTERDICTION: l'ancien nombre ne doit
  // plus être lisible nulle part dans la phrase rendue. Un test qui se
  // contenterait de l'égalité ci-dessus passerait encore si quelqu'un
  // ajoutait « (initialement 360 g) » à la fin.
  assert(!r.text!.includes("360"));
  // La queue descriptive survit: « désossées » est une instruction de cuisine.
  assert(r.text!.includes("désossées"));
});

Deno.test("① … et la ligne SANS donnée structurée garde son texte, nommé", () => {
  // Le cas qui passe, et c'est la moitié qui distingue « réparé » de « écrasé ».
  const sel = { term: "sel", quantity: "une pincée de sel", amount: null, unit: null };
  const r = renderQuantity(sel, "fr");
  assertEquals(r.text, "une pincée de sel");
  assertEquals(r.readState, "historic_text");
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LA FIXTURE LENTILLES — le RAPPORT, pas seulement le nombre
// ═══════════════════════════════════════════════════════════════════════════

// `prep_lentils` du plan GAIN `1eada05b`. Les six lignes, au caractère.
const LENTILLES = () => [
  { term: "lentilles sèches", quantity: "60 g", amount: 60, unit: "g" },
  { term: "oignon", quantity: "40 g", amount: 40, unit: "g" },
  { term: "carotte", quantity: "25 g", amount: 25, unit: "g" },
  {
    term: "huile d’olive",
    quantity: "2 cuillères à soupe d’huile d’olive",
    amount: 0.7703703703703704,
    unit: "tbsp",
  },
  { term: "ail", quantity: "2 g", amount: 2, unit: "g" },
  { term: "cube de bouillon", quantity: "1 cube de bouillon", amount: 0.3851851851851852, unit: "unit" },
];

Deno.test("② les lentilles: 60 g ne restent pas accompagnés de 2 cuillères", () => {
  const lignes = LENTILLES();
  finalizeQuantityProse(lignes, "fr");
  assertEquals(lignes[0].quantity, "60 g");
  // ⛔ LE NOMBRE, L'UNITÉ, ET LE RAPPORT — les trois que le plan demande.
  assertEquals(lignes[3].quantity, "0,77 cuillère à soupe d’huile d’olive");
  assert(!lignes[3].quantity!.startsWith("2 "));
  // L'unité n'a pas glissé: ce n'est ni « 0,77 g » ni « 0,77 ml ».
  assert(lignes[3].quantity!.includes("cuillère à soupe"));
  // ⛔ LE RAPPORT LU CONTRE LE RAPPORT CALCULÉ. C'est la vraie mesure du
  // défaut: la revue a montré un rapport huile/lentilles affiché **2,6 fois**
  // celui du calcul. On relit les deux nombres DANS LES DEUX TEXTES rendus.
  const lu = (s: string) => Number(/^(\d+(?:[,.]\d+)?)/.exec(s)![1].replace(",", "."));
  const rapportAffiche = lu(lignes[3].quantity!) / lu(lignes[0].quantity!);
  const rapportCalcule = 0.7703703703703704 / 60;
  assert(
    Math.abs(rapportAffiche / rapportCalcule - 1) < 0.01,
    `rapport affiché ${rapportAffiche} vs calculé ${rapportCalcule}`,
  );
});

Deno.test("② … et le cas qui mord: l'ancien texte donnait 2,6×", () => {
  // La ligne AVANT la finalisation, telle qu'elle est en base aujourd'hui.
  const avant = LENTILLES();
  const lu = (s: string) => Number(/^(\d+(?:[,.]\d+)?)/.exec(s)![1].replace(",", "."));
  const rapportAffiche = lu(avant[3].quantity!) / lu(avant[0].quantity!);
  const rapportCalcule = 0.7703703703703704 / 60;
  // 2 / 60 contre 0,770 / 60 : le facteur 2,596 de la revue, reproduit.
  assert(
    Math.abs(rapportAffiche / rapportCalcule - 2.596) < 0.01,
    `le défaut d'origine ne se reproduit plus: ×${rapportAffiche / rapportCalcule}`,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LES UNITÉS — grammes, ml, cuillères, unité comptée
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ grammes · ml · cuillères · unité comptée, chacune dans SA forme", () => {
  const cas: [unknown, string][] = [
    [{ quantity: "300 g de riz", amount: 240, unit: "g" }, "240 g de riz"],
    [{ quantity: "200 ml de lait", amount: 250.5, unit: "ml" }, "250,5 ml de lait"],
    [{ quantity: "1 cuillère à café de cumin", amount: 2, unit: "tsp" }, "2 cuillères à café de cumin"],
    [{ quantity: "2 oignons", amount: 3, unit: "unit" }, "3 oignons"],
    // Une ligne écrite en anglais dans un plan français: l'unité rejoint la
    // langue du plan, la queue descriptive reste celle du modèle.
    [{ quantity: "2 tbsp olive oil", amount: 1, unit: "tbsp" }, "1 cuillère à soupe olive oil"],
  ];
  for (const [ligne, attendu] of cas) {
    assertEquals(renderQuantity(ligne as never, "fr").text, attendu);
  }
});

Deno.test("③ … le cas qui mord: aucune conversion entre ml, cuillères et grammes", () => {
  // ⛔ LA PHRASE DIT DES CUILLÈRES, LA DONNÉE DIT DES GRAMMES. Remplacer le
  // seul nombre écrirait « 11,56 cuillères à soupe » pour 11,56 GRAMMES — un
  // facteur 15. On s'abstient de la phrase et on rend la quantité nue.
  const r = renderQuantity(
    { quantity: "2 cuillères à soupe d'huile", amount: 11.5555, unit: "g" },
    "fr",
  );
  assertEquals(r.readState, "structured_bare");
  assertEquals(r.text, "11,56 g");
  assert(!r.text!.includes("cuillère"));

  // Et l'inverse: la donnée est en cuillères, la phrase en grammes.
  const inverse = renderQuantity(
    { quantity: "15 g d'huile", amount: 0.77, unit: "tbsp" },
    "fr",
  );
  assertEquals(inverse.readState, "structured_bare");
  assertEquals(inverse.text, "0,77 cuillère à soupe");

  // Une unité que le vocabulaire fermé ne connaît pas ne devient jamais une
  // unité par défaut: le texte historique reste, et il est NOMMÉ.
  const inconnue = renderQuantity(
    { quantity: "1 tasse de farine", amount: 1, unit: "cup" },
    "fr",
  );
  assertEquals(inconnue.readState, "historic_text");
  assertEquals(inconnue.text, "1 tasse de farine");
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ VIRGULE FR ET RENDU EN — le même nombre, deux conventions
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④ la virgule décimale suit la LANGUE DU PLAN, pas celle de la ligne", () => {
  assertEquals(formatQuantityNumber(458.6625582082933, "fr"), "458,66");
  assertEquals(formatQuantityNumber(458.6625582082933, "en"), "458.66");
  // ⛔ PAS DE SÉPARATEUR DE MILLIERS: « 1 200 g » avec une espace insécable
  // casserait tout rapprochement caractère-pour-caractère.
  assertEquals(formatQuantityNumber(1200, "fr"), "1200");
  assertEquals(formatQuantityNumber(1200, "en"), "1200");

  // ⛔ LE CAS QUI MORD, ET C'EST LE DÉFAUT NOMMÉ PAR `rewriteLeadingNumber`:
  // il suivait le séparateur de la LIGNE D'ORIGINE, donc « 2 cuillères »
  // devenait « 2.4 cuillères » dans un plan français. Ici la phrase source
  // n'a aucune virgule, et le rendu français en met une quand même.
  const fr = renderQuantity({ quantity: "2 cuillères à soupe", amount: 2.4, unit: "tbsp" }, "fr");
  assertEquals(fr.text, "2,4 cuillères à soupe");
  const en = renderQuantity({ quantity: "2 tbsp", amount: 2.4, unit: "tbsp" }, "en");
  assertEquals(en.text, "2.4 tbsp");

  // L'accord aussi est une règle de LANGUE, jamais `=== 1`: en français le
  // singulier tient sous deux, en anglais l'abréviation est invariable.
  assertEquals(
    renderQuantity({ quantity: "2 cuillères à soupe", amount: 1.5, unit: "tbsp" }, "fr").text,
    "1,5 cuillère à soupe",
  );
  assertEquals(
    renderQuantity({ quantity: "2 tbsp", amount: 1.5, unit: "tbsp" }, "en").text,
    "1.5 tbsp",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LOT PARTAGÉ vs PORTION INDIVIDUELLE — deux périmètres, deux nombres
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑤ une casserole affiche son LOT, une assiette la part de la personne", () => {
  // Une casserole de 3 parts: ses ingrédients sont ceux du lot entier — le
  // prompt le dit au modèle (`"quantity": "<for the WHOLE batch>"`). La boîte
  // d'un repas, elle, porte les grammes d'UNE personne.
  const casserole = {
    id: "prep_rice",
    servingsMade: 3,
    ingredients: [{ term: "riz", quantity: "300 g de riz", amount: 360, unit: "g" }],
  };
  const assiette = {
    day: "2026-09-12",
    ingredients: [{ term: "citron", quantity: "1 citron", amount: 1, unit: "unit" }],
    // ⚠️ LES ITEMS D'UN CONTENANT NE PASSENT PAS PAR CETTE FINALISATION, et
    // c'est voulu: ils portent des GRAMMES nus (`box.items[].grams`), pas une
    // prose. Le périmètre « portion » est déjà séparé par la structure.
    boxes: [{ id: "b1", memberIds: ["m1"], items: [{ term: "riz", grams: 120 }] }],
  };
  const lignes = planQuantityLines([assiette], [casserole]);
  assertEquals(lignes.length, 2);
  finalizeQuantityProse(lignes, "fr");
  // Le lot: 360 g pour trois parts.
  assertEquals(casserole.ingredients[0].quantity, "360 g de riz");
  // La part de la personne reste 120 g, et la finalisation n'y a pas touché.
  assertEquals(assiette.boxes[0].items[0].grams, 120);
  // ⛔ LE CAS QUI MORD: les deux nombres ne se confondent pas. Un lot affiché
  // à 120 g ferait cuisiner un tiers du riz pour trois repas.
  assert(casserole.ingredients[0].quantity !== "120 g de riz");
});

Deno.test("⑤ … et les DEUX ensembles sont finalisés, pas seulement les casseroles", () => {
  // La divergence mesurée touche les deux: `prep_chicken` est une casserole,
  // `sun/dinner · tahini` est le frais d'un PLAT (38,52 g contre « 100 g »).
  const plat = {
    ingredients: [{ term: "tahini", quantity: "100 g de tahini", amount: 38.52, unit: "g" }],
  };
  const prep = {
    ingredients: [{ term: "poulet", quantity: "360 g de poulet", amount: 458.66, unit: "g" }],
  };
  const counts = finalizeQuantityProse(planQuantityLines([plat], [prep]), "fr");
  assertEquals(counts.lines, 2);
  assertEquals(counts.rewritten, 2);
  assertEquals(plat.ingredients[0].quantity, "38,52 g de tahini");
  assertEquals(prep.ingredients[0].quantity, "458,66 g de poulet");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ L'ANCIENNE LIGNE TEXTUELLE — état de lecture explicite, pas de réécriture
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑥ une ligne d'un plan ANCIEN garde son texte, et l'état le dit", () => {
  // Un plan d'avant FF-038: ni `amount`, ni `unit`, ni `state` — juste la
  // prose du modèle. Les clés sont ABSENTES, pas à `null`, comme en base.
  const ancienne = { term: "riz", quantity: "300 g de riz basmati" };
  const r = renderQuantity(ancienne, "fr");
  assertEquals(r.text, "300 g de riz basmati");
  assertEquals(r.readState, "historic_text");

  const lignes = [{ ...ancienne, quantity: "300 g de riz basmati" }];
  const counts = finalizeQuantityProse(lignes, "fr");
  // ⛔ PAS DE RÉÉCRITURE, ET PAS DE DIVERGENCE COMPTÉE. Une ligne sans donnée
  // n'a rien qui puisse contredire son texte: la compter comme périmée
  // gonflerait le compteur du lot avec des pincées de sel.
  assertEquals(counts.rewritten, 0);
  assertEquals(counts.stale_before, 0);
  assertEquals(counts.historic, 1);
  assertEquals(lignes[0].quantity, "300 g de riz basmati");

  // Le cas qui passe, juste à côté: la MÊME ligne avec sa donnée structurée
  // est réécrite, et elle est comptée comme divergente.
  const neuve = [{ term: "riz", quantity: "300 g de riz basmati", amount: 240, unit: "g" }];
  const c2 = finalizeQuantityProse(neuve, "fr");
  assertEquals(c2.rewritten, 1);
  assertEquals(c2.stale_before, 1);
  assertEquals(neuve[0].quantity, "240 g de riz basmati");
});

Deno.test("⑥ … une ligne sans texte NI donnée ne fabrique rien", () => {
  const vide = [{ term: "eau", quantity: null }];
  const counts = finalizeQuantityProse(vide, "fr");
  assertEquals(counts.absent, 1);
  assertEquals(counts.rewritten, 0);
  assertEquals(vide[0].quantity, null);
  // ⛔ ZÉRO N'EST PAS UNE QUANTITÉ. Une ligne descendue à zéro est une ligne
  // RETIRÉE, et c'est l'ajusteur qui la retire — pas le rendu.
  assertEquals(
    renderQuantity({ quantity: "200 g", amount: 0, unit: "g" }, "fr").readState,
    "historic_text",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LES COMPTEURS — un lot débranché doit être discernable d'un lot qui marche
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑦ les compteurs séparent réparé, nu, historique, absent et dénombrable", () => {
  const lignes = [
    { term: "riz", quantity: "300 g de riz", amount: 240, unit: "g" },
    { term: "huile", quantity: "un filet d'huile", amount: 12, unit: "g" },
    { term: "sel", quantity: "une pincée", amount: null, unit: null },
    { term: "eau", quantity: null },
    { term: "cube", quantity: "1 cube de bouillon", amount: 0.385, unit: "unit" },
  ];
  const c = finalizeQuantityProse(lignes, "fr");
  assertEquals(c.lines, 5);
  assertEquals(c.historic, 1);
  assertEquals(c.absent, 1);
  assertEquals(c.bare, 1);
  assertEquals(c.counted_fractional, 1);
  assertEquals(c.stale_before, 3);
  assertEquals(c.rewritten, 3);
  assertEquals(lignes[1].quantity, "12 g");
  assertEquals(lignes[4].quantity, "0,39 cube de bouillon");

  // ⛔ LE CAS QUI MORD: une passe sur un plan DÉJÀ finalisé ne compte aucune
  // divergence. Sans cette moitié, un compteur qui remonterait sur un plan
  // propre ressemblerait à un lot qui travaille.
  const encore = finalizeQuantityProse(lignes, "fr");
  assertEquals(encore.stale_before, 0);
  assertEquals(encore.rewritten, 0);
  assertEquals(encore.lines, 5);
});

Deno.test("⑦ … et le vocabulaire des états est fermé", () => {
  assertEquals([...QUANTITY_READ_STATES], [
    "structured",
    "structured_bare",
    "historic_text",
    "absent",
  ]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LA MÉTHODE — fractions, nombres en lettres, rapports de cuisson
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑧ la méthode qui répète une quantité verrouille l'unité — quatre formes", () => {
  // ⛔ LES TROIS FORMES QUE LE PLAN NOMME, et que l'ancienne expression
  // laissait passer: « la regex actuelle ne couvre pas les fractions, nombres
  // en lettres et rapports de cuisson: elle ne constitue pas une preuve
  // suffisante. »
  assertEquals(methodQuantityForm("Verser les 300 g de riz dans l'eau."), "digits");
  assertEquals(methodQuantityForm("Verser ½ litre de bouillon."), "fraction");
  assertEquals(methodQuantityForm("Ajouter 1/2 verre d'eau."), "fraction");
  assertEquals(methodQuantityForm("Ajouter deux cuillères d'huile."), "spelled");
  assertEquals(methodQuantityForm("Add three tablespoons of oil."), "spelled");
  assertEquals(methodQuantityForm("Cuire dans un rapport 1:2."), "ratio");
  assertEquals(methodQuantityForm("Deux volumes d'eau pour un de riz."), "ratio");
  assertEquals(methodQuantityForm("Cook in twice its volume of water."), "ratio");
});

Deno.test("⑧ … et le cas qui passe: une méthode sans quantité reste ajustable", () => {
  // ⚠️ SANS CETTE MOITIÉ, UNE EXPRESSION QUI MORDRAIT TOUT RESSEMBLERAIT À UNE
  // GARDE QUI MARCHE — et elle verrouillerait toutes les recettes du produit.
  const libres = [
    "Faire revenir l'oignon, ajouter le riz, mouiller et couvrir.",
    "Préchauffer le four à 180°C et enfourner 25 minutes.",
    "Season the chicken, sear it, then roast until cooked through.",
    "Ajouter une pincée de sel et un filet d'huile.",
    "Add a pinch of salt.",
    "Laisser reposer 10 minutes hors du feu.",
  ];
  for (const m of libres) {
    assertEquals(methodQuantityForm(m), null, `mord à tort sur « ${m} »`);
    assertEquals(methodSpellsQuantities(m), false);
  }
  assertEquals(methodSpellsQuantities(null), false);
  assertEquals(methodSpellsQuantities(""), false);

  // ⚠️ « 180°C » ET « 25 minutes » NE SONT PAS DES QUANTITÉS D'ALIMENT, et
  // c'est la raison écrite dans le module: ils ne portent pas d'unité de masse.
  // Le vérifier ici empêche qu'un élargissement futur les emporte en silence.
  assertEquals(methodQuantityForm("Enfourner 25 minutes à 180°C."), null);
});

Deno.test("⑧ … l'expression du nombre de tête est la MÊME des deux côtés", () => {
  // ⚠️ `quantity_render.ts` recopie `LEADING_NUMBER_RE` plutôt que de
  // l'importer: ce module est chargé par le NAVIGATEUR, et
  // `plan_proportion_units.ts` traîne tout l'ajusteur derrière lui. La copie
  // est de neuf caractères; ce test est ce qui l'empêche de diverger.
  assertEquals(LEADING_NUMBER_RE.source, "^(\\s*)(\\d+(?:[.,]\\d+)?)");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ L'ALLER-RETOUR — le payload écrit, puis RELU
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑨ après sérialisation et relecture, le rendu ne bouge pas", () => {
  const prep = {
    id: "prep_chicken",
    ingredients: [
      { ...POULET },
      { term: "sel", quantity: "une pincée de sel", amount: null, unit: null },
    ],
  };
  finalizeQuantityProse(planQuantityLines([], [prep]), "fr");
  // La colonne est du `jsonb`: on fait exactement ce que la base fait.
  const relu = JSON.parse(JSON.stringify(prep)) as typeof prep;
  assertEquals(
    renderQuantity(relu.ingredients[0], "fr").text,
    "458,66 g de cuisses de poulet désossées",
  );
  assertEquals(renderQuantity(relu.ingredients[1], "fr").readState, "historic_text");
  // ⛔ LE CAS QUI MORD: un payload dont la donnée structurée a été PERDUE à la
  // sérialisation (le défaut que le lot A a fermé sur `ref`) retombe sur le
  // texte — et l'état de lecture le DIT, au lieu de faire passer une prose
  // pour une donnée.
  const ampute = { term: "x", quantity: relu.ingredients[0].quantity };
  assertEquals(renderQuantity(ampute, "fr").readState, "historic_text");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ C2 (2026-09-12) — LE BANC DE L'ARRONDI AU PLUS PROCHE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ MÊME DISCIPLINE QUE LES NEUF BLOCS DU DESSUS: un cas qui MORD et un cas
// qui PASSE. Les huit cas sont ceux que le plan de clôture nomme au § C2 —
// « œufs, viande en pièces, pita, huile en cuillères, citron écrit en lettres,
// petite quantité qui tomberait à zéro, repas juste au plafond de masse,
// casserole de plusieurs personnes ».
//
// ⛔ LES NOMBRES VIENNENT DES NEUF PLANS DU BANC, au caractère — mesurés le
// 2026-09-12 par `scratchpad/2026-09-11-CLOTURE/c2-compte-fractions.ts`:
// 326 lignes fractionnaires sur 365. Ce ne sont pas des exemples inventés.

/** Le référentiel de ce banc: le poids d'une pièce, par terme. */
const PIECE_G: Readonly<Record<string, number>> = {
  // Relevés le 2026-09-12 dans `food_composition_refs` (lecture seule).
  lemon: 60,
  stock_cube: 10,
  egg: 55,
  pita_wholemeal: 60,
  chicken_thigh: 90,
};
const poidsDUnePiece = (l: { ref?: string | null }): number | null =>
  typeof l.ref === "string" ? PIECE_G[l.ref] ?? null : null;
/** ⛔ LE RÉFÉRENTIEL MUET: aucune présentation plus fine connue. */
const aucunPoids = () => null;

// ── ⑩ LES PIÈCES: ŒUFS, VIANDE, PITA ───────────────────────────────────────

Deno.test("⑩ œufs · viande en pièces · pita: l'entier le plus proche", () => {
  const lignes = [
    { term: "œufs", ref: "egg", quantity: "3,76 œufs", amount: 3.76, unit: "unit" },
    {
      term: "hauts de cuisse de poulet",
      ref: "chicken_thigh",
      quantity: "2,13 hauts de cuisse de poulet",
      amount: 2.1276414718402226,
      unit: "unit",
    },
    {
      term: "pita complète",
      ref: "pita_wholemeal",
      quantity: "1,86 pain pita complet",
      amount: 1.86,
      unit: "unit",
    },
  ];
  const r = roundQuantityLines(lignes, poidsDUnePiece);
  assertEquals(lignes.map((l) => l.amount), [4, 2, 2]);
  assertEquals(lignes.map((l) => l.unit), ["unit", "unit", "unit"]);
  assertEquals(r.counts.rounded, 3);
  assertEquals(r.counts.zero_unresolved, 0);
  // La prose suit la donnée, et elle garde la queue descriptive.
  finalizeQuantityProse(lignes.map((l) => l as typeof l & { quantity: string }), "fr");
  assertEquals(lignes[1].quantity, "2 hauts de cuisse de poulet");
  assertEquals(lignes[2].quantity, "2 pain pita complet");
});

Deno.test("⑩ … le cas qui passe: une pièce déjà entière ne bouge pas", () => {
  const lignes = [
    { term: "œufs", ref: "egg", quantity: "2 œufs", amount: 2, unit: "unit" },
  ];
  const r = roundQuantityLines(lignes, poidsDUnePiece);
  assertEquals(lignes[0].amount, 2);
  assertEquals(r.counts.rounded, 0);
  assertEquals(r.counts.already_whole, 1);
});

Deno.test("⑩ … le cas qui mord: à mi-distance exacte, on monte", () => {
  // « Pour les quantités positives exactement à mi-distance, arrondir vers
  // l'entier supérieur. » 2,5 œufs → 3, et pas 2.
  const lignes = [
    { term: "œufs", ref: "egg", quantity: "2,5 œufs", amount: 2.5, unit: "unit" },
    { term: "riz", ref: null, quantity: "120,5 g", amount: 120.5, unit: "g" },
  ];
  roundQuantityLines(lignes, poidsDUnePiece);
  assertEquals(lignes.map((l) => l.amount), [3, 121]);
});

// ── ⑪ L'HUILE EN CUILLÈRES ─────────────────────────────────────────────────

Deno.test("⑪ huile: 0,77 cuillère devient 12 ml, JAMAIS 1 cuillère", () => {
  // Le plan: « ne pas arrondir aveuglément 0,77 cuillère à une cuillère:
  // utiliser une unité plus fine connue, puis appliquer la règle ».
  const lignes = [
    {
      term: "huile d'olive",
      ref: "olive_oil",
      quantity: "0,77 cuillère à soupe d'huile d'olive",
      amount: 0.77,
      unit: "tbsp",
    },
    {
      term: "huile d'olive",
      ref: "olive_oil",
      quantity: "1,36 cuillère à café",
      amount: 1.3611727416798731,
      unit: "tsp",
    },
  ];
  const r = roundQuantityLines(lignes, aucunPoids);
  // 0,77 × 15 = 11,55 → 12 ml.  1,36 × 5 = 6,81 → 7 ml.
  assertEquals(lignes.map((l) => l.amount), [12, 7]);
  assertEquals(lignes.map((l) => l.unit), ["ml", "ml"]);
  assertEquals(r.counts.spoon_to_ml, 2);
  // ⛔ LE CAS QUI MORD: arrondir la cuillère elle-même rendrait 1 — soit
  // **15 ml** au référentiel, c'est-à-dire 30 % de plus que la recette.
  assert(lignes[0].amount !== 1);
  // ⚠️ L'UI GARDE L'UNITÉ. « 12 ml », jamais « 12 » nu.
  finalizeQuantityProse(lignes.map((l) => l as typeof l & { quantity: string }), "fr");
  assertEquals(renderQuantity(lignes[0], "fr").text, "12 ml");
});

Deno.test("⑪ … le cas qui passe: une cuillère ENTIÈRE reste une cuillère", () => {
  // Arbitrage écrit dans le module: « 2 cuillères à soupe » et « 30 ml » sont
  // la MÊME quantité; convertir un nombre déjà entier ne change rien à ce
  // qu'on verse et retire au cuisinier le geste qu'il connaît.
  const lignes = [
    {
      term: "huile d'olive",
      ref: "olive_oil",
      quantity: "2 cuillères à soupe d'huile d'olive",
      amount: 2,
      unit: "tbsp",
    },
  ];
  const r = roundQuantityLines(lignes, aucunPoids);
  assertEquals(lignes[0].amount, 2);
  assertEquals(lignes[0].unit, "tbsp");
  assertEquals(r.counts.spoon_to_ml, 0);
  assertEquals(r.counts.already_whole, 1);
});

// ── ⑫ LE CITRON ÉCRIT EN LETTRES, ET LE ZÉRO ───────────────────────────────

Deno.test("⑫ « la moitié d'un citron » ne devient pas zéro: 28 g", () => {
  // ⛔ LE CAS LE PLUS FRÉQUENT DU BANC: 7 des 9 lignes qui tombaient à zéro
  // sont des citrons, et leur prose n'a AUCUN nombre de tête.
  const ligne = {
    term: "citron",
    ref: "lemon",
    quantity: "la moitié d’un citron",
    amount: 0.459927797833935,
    unit: "unit",
  };
  const r = roundQuantityLines([ligne], poidsDUnePiece);
  // 0,4599 × 60 g = 27,6 → 28 g. La masse est CONSERVÉE, pas inventée.
  assertEquals(ligne.amount, 28);
  assertEquals(ligne.unit, "g");
  assertEquals(r.counts.piece_to_grams, 1);
  assertEquals(r.counts.zero_unresolved, 0);
  assertEquals(r.zeroed, []);
  finalizeQuantityProse([ligne], "fr");
  // Pas de nombre de tête à remplacer: la quantité est rendue NUE, et le nom
  // de l'aliment vit dans `term`, à côté, sur les trois écrans.
  assertEquals(renderQuantity(ligne, "fr").text, "28 g");
});

Deno.test("⑫ … le cas qui mord: sans poids de pièce, la ligne est RENDUE, pas supprimée", () => {
  const ligne = {
    term: "cube de bouillon",
    ref: "bouillon_maison_inconnu",
    quantity: "1 cube de bouillon",
    amount: 0.3851851851851852,
    unit: "unit",
  };
  const r = roundQuantityLines([ligne], poidsDUnePiece);
  // ⛔ AUCUNE CONVERSION INVENTÉE, AUCUNE SUPPRESSION. La ligne est INTACTE.
  assertEquals(ligne.amount, 0.3851851851851852);
  assertEquals(ligne.unit, "unit");
  assertEquals(r.counts.zero_unresolved, 1);
  assertEquals(r.zeroed, [
    { term: "cube de bouillon", amount: 0.3851851851851852, unit: "unit" },
  ]);
  // … et le même cube, avec un référentiel qui le connaît, passe: 0,385 × 10 g.
  const connu = { ...ligne, ref: "stock_cube" };
  roundQuantityLines([connu], poidsDUnePiece);
  assertEquals(connu.amount, 4);
  assertEquals(connu.unit, "g");
});

Deno.test("⑫ … une PINCÉE n'est jamais transformée en zéro", () => {
  const lignes = [
    { term: "sel", quantity: "une pincée de sel", amount: null, unit: null },
    { term: "poivre", quantity: "poivre du moulin", amount: null, unit: null },
  ];
  const r = roundQuantityLines(lignes, poidsDUnePiece);
  assertEquals(r.counts.unquantified, 2);
  assertEquals(r.counts.quantified, 0);
  assertEquals(lignes.map((l) => l.amount), [null, null]);
  finalizeQuantityProse(lignes.map((l) => l as typeof l & { quantity: string }), "fr");
  assertEquals(lignes[0].quantity, "une pincée de sel");
  assertEquals(renderQuantity(lignes[0], "fr").readState, "historic_text");
});

// ── ⑬ LES CONVERSIONS SONT CELLES DU RÉFÉRENTIEL, PAS DES NOMBRES D'ICI ────

Deno.test("⑬ les cuillères valent ce que le RÉFÉRENTIEL dit qu'elles valent", async () => {
  const ref = await import("./food_composition.ts");
  // ⛔ LA COPIE EST ÉPINGLÉE. `quantity_render.ts` est importé par le
  // navigateur et ne peut pas tirer le référentiel derrière lui; il en recopie
  // les deux nombres, et cette égalité est ce qui empêche la copie de devenir
  // une seconde source.
  assertEquals(ref.TBSP_ML, 15);
  assertEquals(ref.TSP_ML, 5);
  const l = { term: "x", ref: null, quantity: "1,5 c.", amount: 1.5, unit: "tbsp" };
  roundQuantityLines([l], aucunPoids);
  assertEquals(l.amount, Math.round(1.5 * ref.TBSP_ML));
});

Deno.test("⑬ … et toute unité écrite par l'arrondi est dans COMPOSITION_UNITS", async () => {
  const { COMPOSITION_UNITS } = await import("./food_composition.ts");
  const lignes = [
    { term: "a", ref: "lemon", quantity: null, amount: 0.4, unit: "unit" },
    { term: "b", ref: null, quantity: null, amount: 0.77, unit: "tbsp" },
    { term: "c", ref: null, quantity: null, amount: 0.9, unit: "tsp" },
    { term: "d", ref: null, quantity: null, amount: 12.4, unit: "g" },
    { term: "e", ref: null, quantity: null, amount: 12.6, unit: "ml" },
    { term: "f", ref: "egg", quantity: null, amount: 3.2, unit: "unit" },
  ];
  roundQuantityLines(lignes, poidsDUnePiece);
  for (const l of lignes) {
    assert(
      (COMPOSITION_UNITS as readonly string[]).includes(String(l.unit)),
      `unité hors vocabulaire: ${l.unit}`,
    );
  }
  // ⛔ LE CAS QUI MORD: une unité INCONNUE n'est pas arrondie, elle est comptée.
  const inconnue = { term: "g", ref: null, quantity: null, amount: 2.4, unit: "cup" };
  const r = roundQuantityLines([inconnue], aucunPoids);
  assertEquals(inconnue.amount, 2.4);
  assertEquals(r.counts.unknown_unit, 1);
  assertEquals(r.counts.quantified, 0);
});

// ── ⑭ LE REPAS JUSTE AU PLAFOND DE MASSE ───────────────────────────────────

Deno.test("⑭ au plafond de masse: l'arrondi déplace ≤ 0,5 unité par ligne", () => {
  // ⛔ C'EST LA PHRASE « accepter les petits écarts dans les tolérances
  // existantes » RENDUE VÉRIFIABLE. Un plat exactement à 700 g — le plafond
  // qu'un samedi midi de la campagne dépassait à 727 g — monte d'AU PLUS un
  // demi-gramme par ligne, donc de 1,5 g sur trois lignes: très en dessous des
  // ±10 % par créneau. Ce n'est pas une promesse, c'est une borne.
  const lignes = [
    { term: "riz", ref: null, quantity: null, amount: 233.5, unit: "g" },
    { term: "poulet", ref: null, quantity: null, amount: 233.5, unit: "g" },
    { term: "courgette", ref: null, quantity: null, amount: 233, unit: "g" },
  ];
  const avant = lignes.map((l) => l.amount);
  roundQuantityLines(lignes, aucunPoids);
  assertEquals(lignes.map((l) => l.amount), [234, 234, 233]);
  for (const [i, l] of lignes.entries()) {
    assert(Math.abs(l.amount - avant[i]) <= 0.5, `ligne ${i} a bougé de trop`);
  }
  // Le total est passé de 700 à 701 g: 0,14 %. Il est au CUISINIER de le
  // mesurer ensuite (`finalPortionCheck`), pas à l'arrondi de le cacher.
  assertEquals(lignes.reduce((a, l) => a + l.amount, 0), 701);
});

Deno.test("⑭ … le cas qui mord: une pièce déplace la masse d'un DEMI-MORCEAU", () => {
  // ⛔ ET ON LE DIT. Un demi-haut de cuisse pèse 45 g; c'est la plus grosse
  // variation que l'arrondi puisse produire sur une seule ligne, et elle est
  // assumée par la décision du propriétaire. Le plan: « pas de recherche du
  // kcal exact au prix de fractions d'œufs ou de morceaux de viande ».
  const l = {
    term: "hauts de cuisse de poulet",
    ref: "chicken_thigh",
    quantity: null,
    amount: 2.49,
    unit: "unit",
  };
  roundQuantityLines([l], poidsDUnePiece);
  assertEquals(l.amount, 2);
  assertEquals(
    Math.round((2.49 - 2) * PIECE_G.chicken_thigh * 10) / 10,
    44.1,
  );
});

// ── ⑮ LA CASSEROLE DE PLUSIEURS PERSONNES ──────────────────────────────────

Deno.test("⑮ une casserole tirée par trois plats est arrondie UNE fois", () => {
  const prep = {
    id: "prep_chicken",
    ingredients: [
      {
        term: "hauts de cuisse de poulet",
        ref: "chicken_thigh",
        quantity: "2,13 hauts de cuisse de poulet",
        amount: 2.1276414718402226,
        unit: "unit",
      },
      {
        term: "huile d'olive",
        ref: "olive_oil",
        quantity: "3,62 cuillères à soupe d'huile d'olive",
        amount: 3.6169905021283784,
        unit: "tbsp",
      },
    ],
  };
  const dishes = [
    { day: "fri", slot: "dinner", uses: [{ preparationId: "prep_chicken" }], ingredients: [] },
    { day: "sat", slot: "lunch", uses: [{ preparationId: "prep_chicken" }], ingredients: [] },
    { day: "sun", slot: "lunch", uses: [{ preparationId: "prep_chicken" }], ingredients: [] },
  ];
  const lignes = planQuantityLines(dishes, [prep]);
  // ⛔ TROIS TIRAGES, DEUX LIGNES. `planQuantityLines` parcourt les
  // PRÉPARATIONS, pas les citations: le lot n'existe qu'une fois en mémoire.
  assertEquals(lignes.length, 2);
  const r = roundQuantityLines(lignes, poidsDUnePiece);
  assertEquals(r.counts.quantified, 2);
  assertEquals(prep.ingredients[0].amount, 2);
  assertEquals(prep.ingredients[1].amount, 54); // 3,617 × 15 = 54,25 → 54 ml
  assertEquals(prep.ingredients[1].unit, "ml");
});

Deno.test("⑮ … le cas qui mord: la MÊME ligne deux fois se voit au compteur", () => {
  // ⛔ « Ne pas arrondir séparément plusieurs copies du même lot. » L'arrondi
  // étant idempotent, une double passe ne change AUCUN nombre — c'est le
  // compteur, et lui seul, qui distingue « une fois » de « deux fois ».
  const ing = {
    term: "hauts de cuisse de poulet",
    ref: "chicken_thigh",
    quantity: null,
    amount: 2.1276414718402226,
    unit: "unit",
  };
  const r = roundQuantityLines([ing, ing, ing], poidsDUnePiece);
  assertEquals(ing.amount, 2);
  assertEquals(r.counts.quantified, 3);
  // La première passe arrondit, les deux suivantes constatent: 1 déplacée,
  // 2 déjà entières. Un lot compté trois fois serait donc VISIBLE.
  assertEquals(r.counts.rounded, 1);
  assertEquals(r.counts.already_whole, 2);
});

// ── ⑯ L'IDEMPOTENCE, ET LA GARDE « AUCUNE FRACTION AFFICHÉE » ──────────────

Deno.test("⑯ un second passage ne change rien", () => {
  const lignes = [
    { term: "citron", ref: "lemon", quantity: "la moitié d’un citron", amount: 0.46, unit: "unit" },
    { term: "huile", ref: null, quantity: "0,77 c. à s.", amount: 0.77, unit: "tbsp" },
    { term: "poulet", ref: "chicken_thigh", quantity: "2,13 hauts", amount: 2.13, unit: "unit" },
    { term: "yaourt", ref: null, quantity: "294,62 g de yaourt", amount: 294.62, unit: "g" },
    { term: "sel", ref: null, quantity: "une pincée", amount: null, unit: null },
    { term: "mystere", ref: null, quantity: "0,4 cube", amount: 0.4, unit: "unit" },
  ];
  finalizePlanQuantities(lignes, "fr", poidsDUnePiece);
  const apres1 = JSON.parse(JSON.stringify(lignes));
  const deux = finalizePlanQuantities(lignes, "fr", poidsDUnePiece);
  assertEquals(lignes, apres1);
  assertEquals(deux.rounding.rounded, 0);
  assertEquals(deux.prose.rewritten, 0);
  assertEquals(deux.prose.stale_before, 0);
  // ⛔ ET LE CAS NON RÉSOLU RESTE NON RÉSOLU, à l'identique — il ne « guérit »
  // pas au second passage et ne disparaît pas du rapport.
  assertEquals(deux.rounding.zero_unresolved, 1);
  assertEquals(deux.zeroed.map((z) => z.term), ["mystere"]);
});

Deno.test("⑯ … aucune ligne affichée ne porte de fraction, et aucune ne disparaît", () => {
  const lignes = [
    { term: "citron", ref: "lemon", quantity: "la moitié d’un citron", amount: 0.46, unit: "unit" },
    { term: "huile", ref: null, quantity: "0,77 c. à s. d'huile", amount: 0.77, unit: "tbsp" },
    { term: "poulet", ref: "chicken_thigh", quantity: "2,13 hauts", amount: 2.13, unit: "unit" },
    { term: "yaourt", ref: null, quantity: "294,62 g de yaourt", amount: 294.62, unit: "g" },
    { term: "sel", ref: null, quantity: "une pincée de sel", amount: null, unit: null },
  ];
  const avant = lignes.length;
  finalizePlanQuantities(lignes, "fr", poidsDUnePiece);
  assertEquals(lignes.length, avant, "aucune quantité manquante masquée");
  for (const l of lignes) {
    const texte = renderQuantity(l, "fr").text;
    if (texte === null) continue;
    // ⛔ LA GARDE DU PLAN, MOT POUR MOT: « aucune ligne quantitative nouvelle
    // affichée avec une fraction décimale ». On ne regarde QUE les lignes qui
    // portent une donnée structurée — « une pincée de sel » n'est pas une
    // ligne quantitative, et la compter ici rendrait la garde muette.
    if (typeof l.amount !== "number") continue;
    assert(
      !/\d[.,]\d/.test(texte),
      `fraction décimale affichée: « ${texte} »`,
    );
  }
  // ⛔ LE CAS QUI MORD: sans arrondi, la même garde tombe.
  const brut = { term: "poulet", ref: null, quantity: "2,13 hauts", amount: 2.13, unit: "unit" };
  assert(/\d[.,]\d/.test(String(renderQuantity(brut, "fr").text)));
});
