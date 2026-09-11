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
  finalizeQuantityProse,
  formatQuantityNumber,
  planQuantityLines,
  QUANTITY_READ_STATES,
  renderQuantity,
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
