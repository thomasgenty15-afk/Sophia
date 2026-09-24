/**
 * ══════════════════════════════════════════════════════════════════════════
 * ÉTAPE C1 EST BRANCHÉE AU BON ENDROIT — épingles du 2026-09-12
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI DES ÉPINGLES DE POSITION, ET PAS SEULEMENT DES TESTS DE MODULE.
 * `checkOutputContract`, `fixedIntakeSlotKcal` et `proteinFloorAllocation` sont
 * purs et entièrement testés ailleurs; ça ne dit RIEN de l'endroit où ils
 * tournent. Or l'endroit EST le lot:
 *
 *   ① le contrat de sortie doit être vérifié AVANT `portionSizing` — « valider
 *      avant de dimensionner ». Une ligne qu'on ne sait pas peser ne devient pas
 *      pesable en la multipliant, et la constater après le dimensionnement,
 *      c'est la constater après le dernier point où une réparation existait.
 *   ② les apports fixes du CONTRAT doivent être lus par bouche (`perMouth`) et
 *      plus sur la liste à plat de la tablée. Le raccourci « à une bouche, la
 *      liste de la table EST la sienne » retranchait le shaker de Marc de la
 *      cible de Julie dès la deuxième bouche.
 *   ③ le plancher protéique doit recevoir le budget BRUT et les protéines
 *      RÉELLES. `fixedProteinG: null` en dur était une porte désarmée, et
 *      `coveredBudgetKcal` (net) faisait une seconde réduction pour le même pot.
 *
 * ⚠️ CHAQUE ÉPINGLE EST DOUBLÉE D'UNE COUPE. Sans elle, ces tests seraient des
 * `indexOf` sur des chaînes qui pourraient disparaître ensemble.
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT DE CHERCHER. « Un audit d'appelants
 * doit retirer les commentaires »: un grep naïf compte comme vivant le code
 * qu'un pavé explicatif cite pour dire qu'il est mort.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { sourceFamily } from "./source_family.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const REL = "generate-household-meal-v1/index.ts";
const SRC = stripComments(await sourceFamily(new URL(REL, FUNCTIONS_DIR)));

const CONTRAT = "checkOutputContract({";
const SIZING = "const portionSizing = await (async () => {";
const TAG = '"keel.household_meal.output_contract"';

// ---------------------------------------------------------------------------
// ① LE CONTRAT DE SORTIE, AVANT LE DIMENSIONNEMENT
// ---------------------------------------------------------------------------

Deno.test("C1 ① le contrat de sortie est vérifié AVANT de dimensionner", () => {
  const c = SRC.indexOf(CONTRAT);
  const s = SRC.indexOf(SIZING);
  assert(c > 0, "`checkOutputContract` est appelé dans le handler");
  assert(s > 0, "le bloc de dimensionnement existe");
  assert(
    c < s,
    "⛔ valider APRÈS le dimensionnement, c'est valider après le dernier point " +
      "où une réparation était possible",
  );
});

Deno.test("C1 ① il est appelé UNE FOIS — deux verdicts divergeraient", () => {
  assertEquals(SRC.split(CONTRAT).length - 1, 1);
});

Deno.test("C1 ① le journal sort dans TOUS les cas, avec son dénominateur", () => {
  // ⛔ Un tag qui n'apparaîtrait que sur un plan fautif ne permettrait pas de
  // distinguer « aucun défaut » de « le bloc n'est pas branché ».
  const t = SRC.indexOf(TAG);
  assert(t > 0, "le tag existe");
  const bloc = SRC.slice(SRC.indexOf(CONTRAT), SRC.indexOf(SIZING));
  assert(bloc.includes("lines: outputContract.lines"), "le dénominateur sort");
  assert(bloc.includes("defectsFromOutputContract("), "les défauts sont structurés");
  assert(bloc.includes("named:"), "les termes sont NOMMÉS, pas seulement comptés");
});

Deno.test("C1 ① les constats sont ARCHIVÉS, pas seulement journalisés", () => {
  // « Les `issues[]` textuelles seules ne suffisent pas pour la relecture
  // durable » — le plan de clôture, § C5 ③. La clé est écrite dans
  // `generated_from`, donc elle survit au rechargement.
  assert(SRC.includes("output_contract: outputContract === null ? null : {"));
  assert(SRC.includes("findings: outputContract.findings.map("));
});

// ---------------------------------------------------------------------------
// ② LES APPORTS FIXES DU CONTRAT, PAR BOUCHE
// ---------------------------------------------------------------------------

Deno.test("C1 ② le contrat lit les apports de CETTE bouche, pas ceux de la table", () => {
  // ⛔ LA LIGNE QUI A ÉTÉ REMPLACÉE: `intakes: fixedIntakeLoad.intakes` dans la
  // boucle qui construit les contrats. À deux bouches déclarant chacune un
  // shaker, chaque cible perdait les DEUX.
  const boucle = SRC.slice(
    SRC.indexOf("const contractsByKey = new Map"),
    SRC.indexOf("contractSets.set("),
  );
  assert(boucle.length > 0, "la boucle des contrats est localisée");
  assert(
    boucle.includes("intakes: fixedIntakeLoad.perMouth[m.memberId] ?? []"),
    "la liste lue est celle de CETTE bouche",
  );
  assert(
    !boucle.includes("intakes: fixedIntakeLoad.intakes"),
    "⛔ la liste à plat de la tablée ne doit plus décider d'une cible",
  );
});

Deno.test("C1 ② les protéines des apports sont calculées au MÊME passage", () => {
  const boucle = SRC.slice(
    SRC.indexOf("const contractsByKey = new Map"),
    SRC.indexOf("contractSets.set("),
  );
  assert(boucle.includes("fixedProteinByDay.set(day, r.proteinBySlot)"));
  assert(boucle.includes("fixedProteinByMouthDay.set(m.memberId, fixedProteinByDay)"));
  // ⛔ UNE SEULE RÉSOLUTION DU MÊME POT: `fixedIntakeSlotKcal` est appelée une
  // fois et rend les deux cartes. Une seconde résolution pour la protéine
  // divergerait au premier ajustement du référentiel.
  assertEquals(boucle.split("fixedIntakeSlotKcal({").length - 1, 1);
});

// ---------------------------------------------------------------------------
// ③ LE PLANCHER PROTÉIQUE — budget BRUT, soustraction UNE fois
// ---------------------------------------------------------------------------

Deno.test("C1 ③ le plancher protéique reçoit le budget BRUT", () => {
  const appel = SRC.slice(
    SRC.indexOf("proteinFloorAllocation({"),
    SRC.indexOf("proteinFloorAllocation({") + 900,
  );
  assert(
    appel.includes("coveredBudgetGrossKcal: dayContract?.coveredBudgetGrossKcal"),
    "⛔ le NET ferait une seconde réduction pour le même pot",
  );
});

Deno.test("C1 ③ `fixedProteinG` n'est plus `null` en dur", () => {
  const appel = SRC.slice(
    SRC.indexOf("proteinFloorAllocation({"),
    SRC.indexOf("proteinFloorAllocation({") + 900,
  );
  assert(
    !appel.includes("fixedProteinG: null"),
    "⛔ une porte à `null` en dur est une porte désarmée",
  );
  assert(appel.includes("fixedProteinG: fixedProteinOfDay"));
  // ET LA VALEUR VIENT DES MOMENTS RÉELLEMENT COUVERTS.
  assert(SRC.includes("for (const slot of dayContract.coveredSlots)"));
  assert(SRC.includes("return seen === 0 ? null : sum;"), "`null` quand rien n'est lu");
});

// ---------------------------------------------------------------------------
// LES COUPES — sans elles, les épingles seraient des `indexOf` sur du vide
// ---------------------------------------------------------------------------

Deno.test("COUPE — retirer l'appel du contrat de sortie fait rougir", () => {
  const mute = SRC.replace(CONTRAT, "uneAutreFonction({");
  assertEquals(mute.indexOf(CONTRAT), -1);
});

Deno.test("COUPE — remettre la liste à plat dans le contrat fait rougir", () => {
  const casse = SRC.replace(
    "intakes: fixedIntakeLoad.perMouth[m.memberId] ?? []",
    "intakes: fixedIntakeLoad.intakes",
  );
  const boucle = casse.slice(
    casse.indexOf("const contractsByKey = new Map"),
    casse.indexOf("contractSets.set("),
  );
  assert(boucle.includes("intakes: fixedIntakeLoad.intakes"));
  assert(!boucle.includes("perMouth[m.memberId]"));
});

Deno.test("COUPE — le tag du journal existe bien sous ce nom exact", () => {
  const mute = SRC.replace(TAG, '"keel.household_meal.autre_chose"');
  assertEquals(mute.indexOf(TAG), -1);
});
