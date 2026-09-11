/**
 * LOT 2 · CE QUI NE SE PROUVE QUE PAR LA SOURCE.
 *
 * `generation_context_test.ts` éprouve la DÉCISION. Ici on éprouve qu'elle est
 * bien BRANCHÉE, et branchée AU BON ENDROIT — les deux moitiés du même travail.
 * Un résolveur juste qu'aucune porte n'appelle est une garde désarmée, et ce
 * dépôt en a déjà payé plusieurs.
 */
// ⟳ 2026-09-11 · LOT 7 — LES CAS QUI N'ÉPROUVAIENT QUE `generate-meal-v1`
// SONT PARTIS AVEC ELLE. Aucune assertion métier n'a été retirée pour faire
// taire un rouge: chacun avait son jumeau FOYER, qui reste. Le détail de
// l'audit est dans `scratchpad/2026-09-11-LOT7-SUPPRESSION/`.
import { assert, assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /(^|[^:])\/\/[^\n]*/g,
    "$1",
  );
}

async function source(rel: string): Promise<string> {
  return stripComments(await Deno.readTextFile(new URL(rel, FUNCTIONS_DIR)));
}

const FOYER = "generate-household-meal-v1/index.ts";
const SOLO = "generate-meal-v1/index.ts";

Deno.test("la lane foyer DÉLÈGUE son admission — elle ne la réécrit pas", async () => {
  const src = await source(FOYER);
  assert(
    src.includes("resolveGenerationAdmission("),
    `${FOYER} ne passe plus par le résolveur: la décision est revenue dans le ` +
      `générateur, et les quatre situations du chantier ne s'éprouvent plus ` +
      `sans base.`,
  );
  // ⛔ ET PLUS AUCUNE COMPARAISON DE RÔLE EN DUR. Deux endroits qui décident
  // « est-ce le maître » divergent au premier ajustement, et personne ne sait
  // lequel ment — la faute n° 1 de ce dépôt.
  assert(
    !/role\s*!==\s*"owner"/.test(src),
    `${FOYER} compare encore un rôle à la main. Le rôle se décide dans ` +
      `generation_context.ts, et là seulement.`,
  );
});

Deno.test("L'ADMISSION MORD AVANT TOUT APPEL MODÈLE", async () => {
  // ⚠️ EN HTTP UN REFUS TARDIF EST INDISCERNABLE D'UN REFUS PRÉCOCE. Un
  // secondaire refusé doit coûter des millisecondes, pas une génération.
  const src = await source(FOYER);
  const model = src.indexOf("generateWithGemini(");
  assert(model >= 0, "appel modèle introuvable — test à réviser");
  const at = src.indexOf("resolveGenerationAdmission(");
  assert(
    at >= 0 && at < model,
    "l'admission est APRÈS le premier appel modèle",
  );
});

Deno.test("`replaces` est vérifié AVANT le modèle, et sur le compte", async () => {
  // ⚠️ LA BASE REFUSAIT DÉJÀ (`plan_not_replaceable`), mais après la dépense.
  const src = await source(FOYER);
  const model = src.indexOf("generateWithGemini(");
  // ⚠️ ON ANCRE SUR `.eq("id", replaces)` ET PAS SUR LE NOM DE LA TABLE: le
  // générateur lit `student_generated_meals` à plusieurs endroits, et la
  // première occurrence n'est pas ce contrôle-ci.
  const at = src.indexOf('.eq("id", replaces)');
  assert(at >= 0, "le pré-contrôle de `replaces` a disparu — test à réviser");
  assert(at < model, "le pré-contrôle de `replaces` est APRÈS l'appel modèle");
  const bloc = src.slice(at - 200, at + 300);
  assert(
    bloc.includes('from("student_generated_meals")'),
    "le pré-contrôle ne lit pas la table des plans",
  );
  // Les deux moitiés du prédicat: à CE compte, et VIVANT.
  assert(
    bloc.includes('.eq("user_id", userId)'),
    "le pré-contrôle ne clé pas sur le compte",
  );
  assert(
    bloc.includes('.is("retired_at", null)'),
    "le pré-contrôle accepte un plan déjà retiré",
  );
});

Deno.test("le contrat écrit sur la ligne nomme la taille du foyer", async () => {
  // ⛔ C'EST CE QUI REND « UN SEUL MOTEUR » VÉRIFIABLE EN SQL. Sans cette clé,
  // un plan d'une bouche et un plan de cinq sont indiscernables sur la ligne.
  const src = await source(FOYER);
  const at = src.indexOf("generation_context: {");
  assert(at >= 0, "`generated_from.generation_context` a disparu");
  const bloc = src.slice(at, at + 500);
  for (
    const cle of [
      "household_size",
      "served_member_ids",
      "master_member_id",
      "plan_owner_user_id",
      "write_scope",
    ]
  ) {
    assert(
      bloc.includes(cle),
      `\`generation_context\` ne porte plus \`${cle}\``,
    );
  }
});

Deno.test("UNE SEULE PORTE POSE LE FOYER PERSONNEL, ET C'EST AVANT LE RÔLE", async () => {
  // Le rattrapage du lot 1: sans lui, les comptes d'avant liraient
  // `no_household` pour toujours — c'est-à-dire aucun plan.
  const src = await source(FOYER);
  const ensure = src.indexOf("keel_ensure_personal_household");
  const admission = src.indexOf("resolveGenerationAdmission(");
  assert(ensure >= 0, "le rattrapage du foyer personnel a disparu");
  assertEquals(
    ensure < admission,
    true,
    "le rattrapage passe APRÈS la décision d'admission: un compte sans foyer " +
      "serait refusé avant d'en recevoir un.",
  );
});

Deno.test("UNE FUSION RATÉE REND SON UNITÉ — les six sites, et le catch", async () => {
  // ⛔ LE DÉFAUT QUE CE TEST FERME AVAIT ÉTÉ ASSUMÉ EN AOÛT, faute d'un
  // décrément sûr: `meal_unparseable`, `empty_meal`, `house_rule_violated` et
  // leurs voisins mangeaient une fusion de la semaine sans rien rendre. Le
  // lot 2 renverse la décision; ce test est ce qui empêche l'oubli d'un site.
  const src = await source(FOYER);
  for (
    const motif of [
      "model_returned_tool_call",
      "meal_unparseable",
      "mouth_unfed",
      "empty_meal",
      "house_rule_violated",
      "plan_not_written",
      "edge_error",
    ]
  ) {
    assert(
      src.includes(`releaseMergeQuota("${motif}")`),
      `le refus \`${motif}\` ne rend plus l'unité de fusion réclamée.`,
    );
  }
  // ⚠️ ET L'UNITÉ EST MÉRITÉE DÈS QUE LE PLAN EXISTE. Sans cet effacement, le
  // `catch` extérieur rendrait une fusion qui a pourtant produit un plan.
  const write = src.indexOf("const writtenRow");
  const clear = src.indexOf("mergeQuotaHeld = null;", write);
  const modelCall = src.indexOf("generateWithGemini(");
  assert(
    write >= 0 && clear > write,
    "l'unité n'est pas acquittée à l'écriture",
  );
  assert(modelCall >= 0 && modelCall < write, "ordre du fichier inattendu");
  // ⛔ LA REMISE EST À USAGE UNIQUE. `mergeQuotaHeld` est effacé AVANT l'appel
  // RPC: un doublon offrirait une fusion gratuite, l'autre moitié exacte de
  // l'arbitrage d'août.
  const helper = src.indexOf("const releaseMergeQuota");
  assert(helper >= 0, "l'aide de remise a disparu");
  const corps = src.slice(helper, helper + 700);
  const efface = corps.indexOf("mergeQuotaHeld = null;");
  const appel = corps.indexOf("keel_household_release_merge_quota");
  assert(
    efface >= 0 && appel > efface,
    "la remise appelle la RPC avant de lâcher la prise: deux sorties " +
      "successives rendraient deux unités pour une seule réclamation.",
  );
});

Deno.test("LOT 3 — le moteur lit les faits RÉSOLUS, plus la fiche seule", async () => {
  // ⛔ LE DÉFAUT QUE CE TEST FERME: `lineBodies` servait au moteur le corps que
  // le maître avait tapé une fois, pendant que la série de pesées datées ne
  // servait que le brief. Une personne pesée mardi était dimensionnée sur le
  // chiffre de son inscription.
  const src = await source(FOYER);
  assert(
    src.includes("resolveMouth("),
    `${FOYER} ne résout plus les faits de bouche: la concurrence entre la ` +
      `fiche et les pesées est revenue.`,
  );
  // ⚠️ UNE SEULE LECTURE DE `lineBodies` DOIT SUBSISTER: celle qui alimente le
  // résolveur. Toutes les autres passent par `bodyOfMouth`.
  const lectures = src.split("lineBodies.get(").length - 1;
  assertEquals(
    lectures,
    1,
    `il reste ${lectures} lectures directes de \`lineBodies\` au lieu d'une ` +
      `(l'entrée du résolveur). Chaque lecture de plus est un calcul servi ` +
      `par la fiche pendant qu'une pesée plus fraîche existe.`,
  );
  // ⛔ ET LE SEUIL D'ADMISSION NE BOUGE PAS. Ce lot change d'où viennent les
  // nombres, pas qui est dimensionné: un demi-corps ne rentre toujours pas.
  const at = src.indexOf("const bodyOfMouth");
  assert(at >= 0, "`bodyOfMouth` a disparu — test à réviser");
  const corps = src.slice(at, at + 400);
  assert(
    corps.includes(
      "b.heightCm === null || b.weightKg === null || b.gender === null",
    ),
    "le seuil tout-ou-rien a été assoupli en passant: des bouches à demi " +
      "connues entrent maintenant dans le calcul, ce qui est une autre " +
      "décision que celle du lot 3.",
  );
});

Deno.test("LOT 3 — la provenance de chaque fait part sur la ligne écrite", async () => {
  const src = await source(FOYER);
  const at = src.indexOf("mouth_facts:");
  assert(at >= 0, "`generated_from.mouth_facts` a disparu");
  const modelCall = src.indexOf("generateWithGemini(");
  const tally = src.indexOf("mouthFactTally(");
  assert(
    tally >= 0 && tally < modelCall,
    "le décompte est calculé après le modèle",
  );
});

Deno.test("LOT 7 — la parité: le foyer lit garde-manger, mode et moment", async () => {
  // ⛔ CE QUE CE TEST EMPÊCHE, ET IL A UNE DATE DE PÉREMPTION: la lane
  // individuelle est supprimée par ce chantier. Trois fonctionnalités
  // n'existaient QUE chez elle parce que la lane foyer les écrivait en dur —
  // `mode: "to_shop"`, `pantry: []`, `slot: null`. Les supprimer avec la lane
  // serait retirer du produit trois choses que personne n'a décidé de retirer.
  const src = await source(FOYER);
  assert(
    src.includes("readPantry(body.pantry, issues)") &&
      src.includes("pantry: askedPantry"),
    `${FOYER} n'a plus de garde-manger: un foyer ne peut plus cuisiner ce ` +
      `qu'il a déjà, et \`from_pantry\` dirait « voici tes placards » ` +
      `au-dessus d'une liste vide.`,
  );
  assert(
    !/pantry:\s*\[\],/.test(src),
    `${FOYER} réécrit un garde-manger vide en dur`,
  );
  // ⛔ ET LES TROIS SITES LISENT LA MÊME RÉSOLUTION. « La consigne le dit, le
  // parseur le tient » est la règle du dépôt: un mode dit au modèle et tu au
  // parseur rendrait la liste de courses complète en `from_pantry`.
  assertEquals(
    src.split("askedMode").length - 1 >= 3,
    true,
    "le mode n'atteint plus les trois sites (consigne, parseur, ligne écrite)",
  );
  assert(
    !/mode:\s*"to_shop",/.test(src),
    `${FOYER} réécrit \`mode: "to_shop"\` en dur: le mode « pars de tes ` +
      `placards » n'atteint plus la consigne.`,
  );
  assert(
    src.includes("MEAL_MODES") && src.includes("MEAL_SLOTS"),
    `${FOYER} ne borne plus le mode et le moment à leur vocabulaire fermé`,
  );
  // ⚠️ ET `servings` NE VIENT TOUJOURS PAS DU CLIENT. Ce n'est pas un oubli de
  // parité: un client qui enverrait 2 pour un foyer de quatre ferait cuisiner
  // la moitié du dîner, sans erreur. Le chantier le dit aussi — « une liste de
  // membres reçue du client ne donne aucun droit ».
  assert(
    src.includes("servings: Math.min(12, Math.max(1, presence.servings))"),
    `${FOYER}: le nombre de parts a cessé de venir des présences lues`,
  );
});

Deno.test("§ 9 — Fast atteint AUSSI l'appel auxiliaire du plan", async () => {
  // ⛔ MESURÉ PAR LE BANC DU LOT 8: 19 transmissions sur 63 partaient sans
  // palier, toutes des remplissages de composition. Un plan ATTEND ce
  // remplissage; le laisser en file standard allonge le plan par son maillon
  // le moins prioritaire, pendant que tout le reste est prioritaire.
  const fill = await Deno.readTextFile(
    new URL("./composition_fill_io.ts", import.meta.url),
  );
  assert(
    fill.includes("serviceTier: PLAN_SERVICE_TIER"),
    "l'appel auxiliaire repart sans palier: la décision § 9 du chantier est " +
      "débranchée.",
  );
  // ⚠️ ET LE REPLI SANS PALIER EXISTE. Rien ici ne peut vérifier contre l'API
  // réelle que ce modèle-là accepte `service_tier` (§ 10: aucune campagne
  // payante); un refus ferait perdre le remplissage entier, donc l'énergie
  // d'un aliment inconnu.
  assert(
    fill.includes("appel(false)"),
    "le palier n'est plus lâchable: un refus du fournisseur coûterait le " +
      "remplissage entier.",
  );
});

Deno.test("LOT 6 — LA GARDE FINALE TOURNE SUR LA GÉNÉRATION", async () => {
  // ⛔ LE PLUS GROS TROU TROUVÉ LE 2026-09-10. `finalPlanGate` — 22 causes,
  // ~900 lignes, sa propre suite de tests — n'avait qu'UN appelant:
  // `draft_adopt.ts`. Or `adoptDraft` n'a AUCUN appelant vivant, et même
  // atteint il aurait rendu `context_unavailable`, parce qu'aucun générateur
  // n'écrit `adoption_context`. La garde était morte DEUX FOIS: elle n'a
  // jamais tourné sur un plan réel.
  const src = await source(FOYER);
  assert(
    src.includes("finalPlanGate(asGatePlan(writePayload)"),
    `${FOYER} n'appelle plus la garde finale sur la charge écrite: le dernier ` +
      `contrôle de sécurité du produit est de nouveau mort.`,
  );
  // ⛔ SUR `writePayload`, PAS SUR `meal`. « Contrôler le snapshot exact après
  // toutes les transformations » — un contrôle sur l'objet d'avant le
  // regrammage jugerait un plan que personne ne reçoit.
  const gate = src.indexOf("finalPlanGate(asGatePlan(writePayload)");
  const write = src.indexOf('"write_student_meal_plan"');
  assert(write >= 0 && gate < write, "la garde tourne APRÈS l'écriture");
  const payload = src.indexOf("const writePayload = {");
  assert(
    payload >= 0 && payload < gate,
    "la garde tourne AVANT la construction de la charge",
  );
});

Deno.test("LOT 6 — `asGatePlan` est PUBLIC, pour que la génération l'atteigne", async () => {
  // ⚠️ C'EST CE QUI RENDAIT LA GARDE INATTEIGNABLE: l'adaptateur était privé
  // dans `draft_adopt.ts`, donc le seul chemin vers la garde passait par
  // l'adoption — qui n'a pas d'appelant.
  const gateSrc = await Deno.readTextFile(
    new URL("_shared/keel/final_plan_gate.ts", FUNCTIONS_DIR),
  );
  assert(
    gateSrc.includes("export function asGatePlan("),
    "`asGatePlan` est redevenu privé: la génération ne peut plus atteindre la garde.",
  );
});

Deno.test("LOT 6 — LA PESÉE EST REMONTÉE AU-DESSUS DES RATTRAPAGES", async () => {
  // ⛔ LE DÉFAUT QUE CE TEST FERME. Jusqu'au 2026-09-11, `shadowSizing` — la
  // fonction qui pèse les plats — vivait ~1 700 lignes SOUS cinq des sept
  // rattrapages. Quand `protein_anchor_retry` demandait un des deux appels
  // modèle, personne n'avait pesé un seul plat: le budget gardait des slots à
  // l'aveugle, par une table de nombres accordés à la main sur l'ORDRE
  // D'EXÉCUTION du fichier.
  const src = await source(FOYER);
  const pesee = src.indexOf("const shadowSizing =");
  const premierRattrapage = src.indexOf(
    'planRepairGranted("protein_anchor_retry")',
  );
  assert(
    pesee >= 0 && premierRattrapage >= 0,
    "repères introuvables — test à réviser",
  );
  assert(
    pesee < premierRattrapage,
    "la pesée est redescendue sous le premier rattrapage: le budget réserve de " +
      "nouveau à l'aveugle.",
  );
  // ⛔ ET ELLE EST APPELÉE, pas seulement définie. Une fermeture hissée qui
  // n'est pas consultée ne mesure rien.
  const appel = src.indexOf('tag: "keel.household_meal.pre_repair_sizing"');
  assert(appel >= 0, "la pesée d'avant-rattrapage n'est plus appelée");
  assert(
    appel < premierRattrapage,
    "elle est appelée APRÈS le premier rattrapage",
  );
});

Deno.test("LOT 6 — LES TROIS DÉTECTEURS TOURNENT AVANT LE PREMIER RATTRAPAGE", async () => {
  // ⛔ LA PESÉE SEULE NE SUFFIT PAS, ET C'EST MESURÉ: avec le grammage seul
  // connu, la protéine volait le slot d'une allergie servie. Les trois natures
  // qui peuvent RÉSERVER — sécurité, livraison, grammage — doivent être
  // détectées avant que le premier rattrapage ne dépense un appel.
  const src = await source(FOYER);
  const premierRattrapage = src.indexOf(
    'planRepairGranted("protein_anchor_retry")',
  );
  for (
    const [quoi, marque] of [
      ["la sécurité", "const bitesOf ="],
      ["la livraison", "const mouthCells ="],
      ["la vue de livraison", "const deliveredViewOf ="],
      ["les interdits non ventilés", "const unallocatedTerms ="],
    ] as const
  ) {
    const at = src.indexOf(marque);
    assert(at >= 0, `${marque} introuvable — test à réviser`);
    assert(
      at < premierRattrapage,
      `${quoi} se détecte APRÈS le premier rattrapage: le budget ne peut pas ` +
        `lui garder de slot, et un défaut moins grave prendra sa place.`,
    );
  }
  // ⛔ ET L'ENSEMBLE EST BIEN CONSTRUIT, pas laissé à `null`. `null` veut dire
  // « pas pesé » et fait retomber le budget sur sa table.
  assert(
    src.includes("pendingDefectKinds = kinds;"),
    "l'ensemble n'est plus posé",
  );
  assert(
    src.includes('kinds.add("safety")') &&
      src.includes('kinds.add("missing_meal")') &&
      src.includes('kinds.add("sizing")'),
    "une des trois natures n'entre plus dans l'ensemble mesuré",
  );
  // ⛔ ET UNE NATURE SERVIE EN SORT. Sans ça, elle réserve pour elle-même après
  // avoir été traitée: sur trois défauts et deux slots, un seul partait.
  assert(
    src.includes("pendingDefectKinds.delete(repairKindOf(label))"),
    "une nature réparée reste dans l'ensemble et bloque la suivante",
  );
});

Deno.test("LOT 5 — LE PLAN EST REMESURÉ APRÈS LE REGRAMMAGE DES CASSEROLES", async () => {
  // ⛔ LE DÉFAUT QUE CE TEST FERME. La lane MESURE les plats, puis REGRAMME les
  // casseroles (croissance et rétrécissement d'identité), puis écrit la ligne.
  // Entre les deux, un ingrédient PLAFONNÉ casse la proportionnalité et une
  // casserole RETIRÉE emporte ce que des plats y puisaient: le verdict inscrit
  // sur la ligne décrivait un plan qui n'existe plus.
  const src = await source(FOYER);
  const regram = src.indexOf(
    "growth.regrammed += regramMeal(meal, composition)",
  );
  const remesure = src.indexOf('tag: "keel.household_meal.final_sizing"');
  const payload = src.indexOf("const writePayload = {");
  assert(
    regram >= 0,
    "le regrammage des casseroles a disparu — test à réviser",
  );
  assert(remesure >= 0, "le plan n'est plus remesuré après le regrammage");
  assert(
    remesure > regram,
    "la remesure tourne AVANT le regrammage: elle ne voit rien",
  );
  assert(remesure < payload, "la remesure tourne APRÈS la charge écrite");

  // ⛔ ET ELLE PART SUR LA LIGNE, pas seulement dans un journal. Un journal
  // s'efface; la ligne reste, et c'est elle que le banc relit.
  assert(
    src.includes("final: finalSizing,"),
    "la mesure finale n'entre plus dans `generated_from.portion_sizing`",
  );
  // ⚠️ LES DEUX MESURES COEXISTENT, ET ELLES SONT NOMMÉES. Celle d'AVANT a
  // décidé des grammes; celle d'APRÈS dit ce que le plan écrit pèse. Les
  // confondre est exactement ce qui rendait le verdict publié faux.
  assert(
    src.includes("...histogrammes,"),
    "la mesure d'avant le regrammage a disparu: on ne peut plus comparer",
  );
});

Deno.test("LOT 5 — LA MESURE FINALE PÈSE LES GRAMMES ÉCRITS, SANS EXCEPTION DE POPULATION", async () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 · LOT E — CE CAS CHANGE D'ATTENTE, ET VOICI POURQUOI
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ IL TENAIT L'ABSTENTION: `shadowSizing` ne mesure qu'à partir de DEUX
  // bouches, donc `finalSizing` devait NOMMER son silence plutôt que rendre des
  // zéros. La règle « un zéro ne doit pas ressembler à tout va bien » est
  // juste, et elle reste. Ce qui était faux, c'est qu'il n'y avait rien à
  // mesurer à une bouche.
  //
  // Mesuré sur le plan GAIN `a18f522e-41f9-469e-9c50-1d693d892ce6`, UNE bouche:
  // le samedi midi a été écrit à **727 g contre un plafond de 700**, dans un
  // contenant à un seul nom, et cette abstention l'a laissé passer sans un mot
  // (`ENQUETE-DEUX-DIRECTIONS-2026-09-11.md` §4).
  //
  // `finalPortionCheck` (lot B) relit les grammes RÉELLEMENT POSÉS par
  // `applySizing` dans chaque contenant, à une bouche comme à cinq. Ce cas
  // tient donc désormais: la mesure a lieu, elle porte son dénominateur, et ses
  // seules abstentions sont NOMMÉES par `reason` (`composition_unavailable`,
  // `no_box`).
  const src = await source(FOYER);
  const at = src.indexOf("const finalSizing = (() => {");
  assert(at >= 0, "`finalSizing` a disparu");
  const bloc = src.slice(at, at + 2600);
  assert(
    bloc.includes("finalPortionCheck({"),
    "la mesure finale ne repèse plus les grammes écrits",
  );
  assert(
    bloc.includes("measured: check.measured,") && bloc.includes("reason: check.reason,"),
    "la mesure ne dit plus si elle a eu lieu, ni pourquoi",
  );
  // ⛔ AUCUNE EXCEPTION DE POPULATION. `single_mouth` ici voudrait dire que le
  // contrôle s'abstient encore pour une bouche.
  assert(
    !bloc.includes("single_mouth"),
    "la mesure finale s'abstient encore pour une bouche",
  );
  // ⛔ LE DÉNOMINATEUR VOYAGE AVEC LE NUMÉRATEUR. Une part sans son total se
  // relit comme un taux, et un taux sur trois assiettes n'a pas le sens d'un
  // taux sur quinze — la faute exacte que le banc du lot 8 a trouvée.
  assert(bloc.includes("boxes: check.boxes,"), "le dénominateur ne part plus avec la part");
  assert(bloc.includes("judged: check.judged,"), "la part jugée ne sort plus");
  // ⛔ ET LES LIGNES NE SORTENT PAS: `check.rows` porte les `memberIds`.
  // Précédent `residualGaps`, retiré du journal pour en avoir porté un.
  assert(!bloc.includes("check.rows"), "les lignes nominatives partent au journal");
});
