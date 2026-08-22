// ═══════════════════════════════════════════════════════════════════════════
// L0bis — LE BANC DE LA GROSSESSE.
//
// CE QU'IL PROTÈGE, DANS L'ORDRE DE CE QUE ÇA COÛTE QUAND ÇA CASSE:
//
//   * UN CAS QUI **MORD** — enceinte + une PERTE: l'ancre absolue s'abstient,
//     et elle porte le motif. Sans lui, la garde est une décoration.
//   * UN CAS QUI **PASSE** — un AUTRE `condition_ref` (`diabetes`,
//     `hypertension`, `coeliac_disease`, `gout`) rend une sortie
//     **BYTE-IDENTIQUE**. Sans lui, on ne sait pas si la garde mord trop large,
//     et le jour où elle mordra sur un diabétique personne ne le verra.
//   * LE COMPTEUR A **QUATRE** POPULATIONS ATTEIGNABLES. Deux compteurs de
//     cette campagne étaient **structurellement inatteignables**, et il a fallu
//     une mutation pour le voir. Ici la cardinalité est assertée.
//   * **LE JETON A UN ÉCRIVAIN.** Chaque ref de la liste fermée est produit par
//     le plancher de maladie sur une phrase réelle. Un lecteur sans écrivain
//     est un lot désarmé qui ressemble trait pour trait à un lot qui marche —
//     et ce dépôt en porte déjà plusieurs, nommés.
//   * LA GARDE NE MORD QUE **VERS LE BAS**. Un `muscle_gain` traverse intact:
//     rabattre un surplus retirerait de l'énergie à une femme enceinte qui en
//     demande, sous le nom d'une protection.
//
// ⚠️ LA MOITIÉ « GRAMMAGE » DE CE BANC VIT DANS UN SECOND FICHIER, ET C'EST UNE
// CONTRAINTE DE DÉPÔT, PAS UN CHOIX DE DÉCOUPAGE. `household_portions.ts` porte
// **+1 532/−188 lignes non commitées d'une autre session** (mesuré le
// 2026-08-22): la garde y est branchée dans l'arbre de travail, et son banc est
// `condition_energy_gate_portions_test.ts`, non commité lui aussi. Ce
// fichier-ci n'importe donc QUE des modules dont HEAD porte la version courante
// — sinon il ne compilerait pas depuis un `git clone`, ce que le lot `V0-A-bis`
// a déjà mesuré comme un défaut réel. §⑨ n° 15.
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  cancelsEnergyDeficit,
  CONDITION_GATE_POPULATIONS,
  type ConditionGatePopulation,
  conditionGatePopulationOf,
  conditionGateReason,
  DEFICIT_CANCELLING_CONDITION_REFS,
  evictsPregnancyFoods,
  goalUnderConditionGate,
  newConditionGateCounter,
  PREGNANCY_AVOIDED_FOOD_REFS,
  pregnancyFoodBlockFor,
} from "./condition_energy_gate.ts";
import { detectDeclaredMedicalCondition } from "./medical_condition_floor.ts";
import { mouthTargetKcal } from "./mouth_anchor.ts";
import type { MouthBody } from "./meal_envelope.ts";

// ---------------------------------------------------------------------------
// LES CORPS — celui de la mesure AVANT, repris au gramme près
// ---------------------------------------------------------------------------

/**
 * LE CORPS DE LA MESURE DU 2026-08-22 À 03:19:55 CEST. Femme, 31 ans, 165 cm,
 * 68 kg, sédentaire — entretien estimé 1 980 kcal/j. C'est sur lui que le
 * déficit ouvert a été mesuré: cible 1 480 kcal au cran 0,5 kg/semaine, soit
 * **500 kcal/j de moins**, et facteur de boîte **0,7475**.
 */
const HER: MouthBody = {
  appetite: null,
  heightCm: 165,
  weightKg: 68,
  gender: "female",
  ageYears: 31,
  activityLevel: "sedentary",
  activityAxes: { day: null, sport: null, asked: false },
};

const ANCHOR = (conditionRefs: readonly string[], direction: "down" | "up" | null) => ({
  memberId: "m-her",
  ageState: "adult" as const,
  restriction: "clear" as const,
  body: HER,
  direction,
  paceKgPerWeek: 0.5,
  declaredSlots: [] as readonly string[],
  structure: null,
  conditionRefs,
});

// ---------------------------------------------------------------------------
// ① LE CAS QUI MORD
// ---------------------------------------------------------------------------

Deno.test("⛔ LE CAS QUI MORD — enceinte + une PERTE: l'ancre absolue s'abstient", () => {
  // ⛔ L'ANCRE EST LE CHEMIN VIVANT DU DÉFICIT, et pas seulement l'un des deux:
  // quand elle tire, son facteur REMPLACE le relatif dans le générateur. Fermer
  // l'autre chaîne sans celle-ci n'aurait rien fermé du tout.
  //
  // LA PRÉMISSE D'ABORD. Sans elle, un test qui « passe » ne prouverait que
  // l'absence de tout ancrage — une garde cassée bloque tout et ressemble
  // trait pour trait à une garde qui marche.
  const ouvert = mouthTargetKcal(ANCHOR([], "down"), "no_position");
  assertEquals(ouvert.reason, "anchored", "prémisse: l'ancre doit tirer sans condition");
  // 1 480 kcal contre 1 980 d'entretien: **500 kcal/j de déficit**, mesurés le
  // 2026-08-22 à 03:19:55 CEST avant toute ligne de correctif.
  assertEquals(ouvert.kcal, 1480, "prémisse: la cible mesurée le 2026-08-22");

  for (const ref of DEFICIT_CANCELLING_CONDITION_REFS) {
    const out = mouthTargetKcal(ANCHOR([ref], "down"), "no_position");
    assertEquals(out.reason, ref, ref);
    // ⛔ `null`, ET PAS « la maintenance ». L'ancrer sur `estimatedMaintenance`
    // lui PRESCRIRAIT une journée de ~340 à 450 kcal sous son besoin réel —
    // le défaut même que ce lot ferme, portant le masque d'un correctif.
    assertEquals(out.kcal, null, ref);
  }
});

Deno.test("⛔ LA GARDE NE MORD QUE VERS LE BAS — un surplus traverse intact", () => {
  // Rabattre un surplus retirerait de l'énergie à une femme enceinte qui en
  // demande, sous le nom d'une protection. Ce module retire des déficits.
  const ancreNue = mouthTargetKcal(ANCHOR([], "up"), "no_position");
  assert(
    ancreNue.kcal !== null && ancreNue.kcal > 1980,
    `prémisse: ${ancreNue.kcal} n'est pas un surplus au-dessus de l'entretien`,
  );
  for (const ref of DEFICIT_CANCELLING_CONDITION_REFS) {
    const ancrePorteuse = mouthTargetKcal(ANCHOR([ref], "up"), "no_position");
    assertEquals(JSON.stringify(ancrePorteuse), JSON.stringify(ancreNue), ref);
  }

  // Et sans direction du tout: la maintenance ne change pas non plus.
  for (const ref of DEFICIT_CANCELLING_CONDITION_REFS) {
    assertEquals(
      JSON.stringify(mouthTargetKcal(ANCHOR([ref], null), "no_position")),
      JSON.stringify(mouthTargetKcal(ANCHOR([], null), "no_position")),
      ref,
    );
  }
});

// ---------------------------------------------------------------------------
// ② LE CAS QUI PASSE — un autre condition_ref ne bouge PAS d'un octet
// ---------------------------------------------------------------------------

Deno.test("⛔ LE CAS QUI PASSE — un AUTRE condition_ref rend une sortie BYTE-IDENTIQUE", () => {
  // ⛔ SANS CE TEST, ON NE SAIT PAS SI LA GARDE MORD TROP LARGE — et le jour où
  // elle retirera son déficit à un diabétique qui a le droit d'en avoir un,
  // personne ne le verra. Comparé par `JSON.stringify`, pas champ par champ: un
  // champ ajouté un jour au retour DOIT faire rougir ce test.
  const nu = JSON.stringify(mouthTargetKcal(ANCHOR([], "down"), "no_position"));

  // ⛔ LES QUATRE AUTRES JETONS DE LA LISTE FERMÉE DU PLANCHER DE MALADIE, ET
  // PAS UN SEUL: chacun de ces gens a le droit de viser une perte de poids, et
  // la leur retirer serait décider à leur place.
  for (const ref of ["diabetes", "hypertension", "coeliac_disease", "gout"]) {
    assertEquals(
      JSON.stringify(mouthTargetKcal(ANCHOR([ref], "down"), "no_position")),
      nu,
      `${ref}: la sortie a bougé`,
    );
  }
  // Un ref INCONNU passe aussi — la garde est une liste FERMÉE, jamais un
  // rapprochement. « pregnancy_test » n'est pas « pregnancy », et ce dépôt a
  // mesuré 12 faux positifs sur 12 le jour où il a essayé un matcher maison.
  assertEquals(
    JSON.stringify(mouthTargetKcal(ANCHOR(["pregnancy_test"], "down"), "no_position")),
    nu,
    "un ref inconnu ne doit pas mordre",
  );

  // ── ET LA PRÉMISSE: LA MÊME SORTIE **BOUGE** SOUS `pregnancy` ──────────
  // Sans elle, « byte-identique partout » serait vert sur une garde qui ne fait
  // rien du tout.
  const enceinte = JSON.stringify(mouthTargetKcal(ANCHOR(["pregnancy"], "down"), "no_position"));
  assert(enceinte !== nu, "prémisse: la garde ne change RIEN");
  // Les deux conditions rendent la même énergie; seul le MOTIF les distingue,
  // et c'est ce qui permet au journal de ne pas écrire un fait faux.
  const allaite = JSON.stringify(
    mouthTargetKcal(ANCHOR(["breastfeeding"], "down"), "no_position"),
  );
  assert(enceinte !== allaite, "les deux motifs doivent rester distincts");
  assertEquals(
    JSON.parse(enceinte).kcal,
    JSON.parse(allaite).kcal,
    "les deux conditions rendent la même énergie",
  );
});

// ---------------------------------------------------------------------------
// ③ LE COMPTEUR — quatre populations, toutes ATTEIGNABLES
// ---------------------------------------------------------------------------

Deno.test("⛔ LES QUATRE POPULATIONS SONT ATTEIGNABLES — cardinalité assertée", () => {
  const seen = new Set<ConditionGatePopulation>();
  const cases: Array<readonly (string | null)[]> = [
    [],
    [null, "", "   "],
    ["pregnancy"],
    ["breastfeeding"],
    ["diabetes"],
    ["diabetes", "pregnancy"],
    ["diabetes", "breastfeeding"],
    ["pregnancy", "breastfeeding"],
  ];
  for (const refs of cases) seen.add(conditionGatePopulationOf(refs));

  // ⛔ L'ASSERTION QUI A MANQUÉ DEUX FOIS DANS CETTE CAMPAGNE. Deux compteurs
  // livrés étaient STRUCTURELLEMENT inatteignables, et il a fallu une mutation
  // pour le voir. Une population de la liste fermée qu'aucune entrée ne produit
  // est une colonne qui restera à zéro pour toujours — c'est-à-dire un compteur
  // qu'on relira comme « rien ne s'est passé ».
  assertEquals(
    [...seen].sort(),
    CONDITION_GATE_POPULATIONS.slice().sort(),
    "une population de la liste fermée n'est produite par AUCUNE entrée",
  );
  assertEquals(seen.size, 4);

  // La grossesse gagne sur l'allaitement, et sur tout le reste: c'est elle qui
  // porte l'éviction alimentaire, et se tromper de côté la retirerait.
  assertEquals(conditionGatePopulationOf(["breastfeeding", "pregnancy"]), "pregnancy");
  assertEquals(conditionGatePopulationOf(["diabetes", "pregnancy"]), "pregnancy");
  // Un ref inconnu est `other`, JAMAIS `none`: un jeton qui disparaît du
  // compteur est exactement le silence qui rend un lot désarmé invisible.
  assertEquals(conditionGatePopulationOf(["something_new"]), "other");
  // La casse et les espaces ne changent pas un verdict clinique.
  assertEquals(conditionGatePopulationOf([" PREGNANCY "]), "pregnancy");
});

Deno.test("⛔ LE COMPTEUR NAÎT AVEC SES QUATRE CLÉS À ZÉRO", () => {
  // Un `Record` rempli à la volée ne porte que les populations rencontrées:
  // « zéro grossesse » et « la garde n'a pas tourné » y seraient la même
  // absence de clé.
  const counter = newConditionGateCounter();
  assertEquals(
    Object.keys(counter).sort(),
    CONDITION_GATE_POPULATIONS.slice().sort(),
  );
  for (const key of CONDITION_GATE_POPULATIONS) assertEquals(counter[key], 0, key);
});

Deno.test("chaque population a une réponse NOMMÉE, et le motif suit", () => {
  // R6 du contrat: pas de valeur d'énumération sans une branche d'évaluateur
  // nommée. Le `switch` est exhaustif; ce test le vérifie sur la table entière.
  const table: Record<
    ConditionGatePopulation,
    { cancels: boolean; reason: string | null; evicts: boolean }
  > = {
    // ⛔ `cancels` ET `evicts` DIVERGENT SUR UNE SEULE LIGNE, et c'est la ligne
    // qui justifie que les deux populations soient comptées séparément: la
    // listeria traverse le placenta, pas le lait.
    pregnancy: { cancels: true, reason: "pregnancy", evicts: true },
    breastfeeding: { cancels: true, reason: "breastfeeding", evicts: false },
    other: { cancels: false, reason: null, evicts: false },
    none: { cancels: false, reason: null, evicts: false },
  };
  for (const population of CONDITION_GATE_POPULATIONS) {
    assertEquals(cancelsEnergyDeficit(population), table[population].cancels, population);
    assertEquals(conditionGateReason(population), table[population].reason, population);
    assertEquals(evictsPregnancyFoods(population), table[population].evicts, population);
  }
  // La divergence est ASSERTÉE, pas seulement décrite: si les deux fonctions se
  // mettaient à répondre la même chose, ce test rougirait.
  assertEquals(
    CONDITION_GATE_POPULATIONS.filter((p) => cancelsEnergyDeficit(p) !== evictsPregnancyFoods(p)),
    ["breastfeeding"],
  );
  assertEquals(Object.keys(table).length, CONDITION_GATE_POPULATIONS.length);
});

// ---------------------------------------------------------------------------
// ④ LE JETON A UN ÉCRIVAIN — sinon c'est un lecteur mort
// ---------------------------------------------------------------------------

Deno.test("⛔ CHAQUE JETON DE LA LISTE FERMÉE EST PRODUIT PAR UNE VRAIE PHRASE", () => {
  // ⛔ CE TEST EXISTE PARCE QUE LE DÉPÔT PORTE DÉJÀ PLUSIEURS LECTEURS SANS
  // ÉCRIVAIN, tous nommés, tous découverts après coup. Le chat est le SEUL
  // écrivain de `student_safety_constraints.condition_ref`: si aucune phrase ne
  // produit un jeton, la branche qui le lit ne s'exécutera jamais en réel.
  //
  // ⚠️ ET C'EST CE TEST QUI A OUVERT LA SÉPARATION `pregnancy` /
  // `breastfeeding`. Avant le 2026-08-22, « I'm breastfeeding » écrivait
  // `pregnancy`: la population `breastfeeding` du compteur aurait été
  // STRUCTURELLEMENT à zéro.
  const phrases: Record<string, readonly string[]> = {
    pregnancy: ["je suis enceinte", "I'm pregnant", "j'ai une grossesse"],
    breastfeeding: ["I'm breastfeeding", "je suis en plein allaitement"],
  };
  for (const ref of DEFICIT_CANCELLING_CONDITION_REFS) {
    const cases = phrases[ref] ?? [];
    assert(
      cases.length > 0,
      `${ref}: aucune phrase ne le produit — un jeton sans écrivain`,
    );
    for (const phrase of cases) {
      const hit = detectDeclaredMedicalCondition(phrase);
      assert(hit, `${ref}: le plancher ne mord pas sur « ${phrase} »`);
      assertEquals(hit!.condition_ref, ref, phrase);
    }
  }
  assertEquals(
    Object.keys(phrases).sort(),
    DEFICIT_CANCELLING_CONDITION_REFS.slice().sort(),
  );
});

// ---------------------------------------------------------------------------
// ⑤ L'OBJECTIF COERCÉ — et ce qui ne l'est pas
// ---------------------------------------------------------------------------

Deno.test("goalUnderConditionGate ne coerce QUE fat_loss, et seulement sous la garde", () => {
  assertEquals(
    goalUnderConditionGate("fat_loss", "pregnancy"),
    { goal: "maintenance", cancelled: true },
  );
  assertEquals(
    goalUnderConditionGate("fat_loss", "breastfeeding"),
    { goal: "maintenance", cancelled: true },
  );
  // ⛔ LE SURPLUS RESTE ENTIER. Le rabattre serait retirer de l'énergie à
  // quelqu'un qui en demande — l'inverse du but de ce module.
  assertEquals(
    goalUnderConditionGate("muscle_gain", "pregnancy"),
    { goal: "muscle_gain", cancelled: false },
  );
  // Et les deux populations qui ne mordent pas laissent tout intact.
  for (const population of ["other", "none"] as const) {
    for (const goal of ["fat_loss", "maintenance", "muscle_gain"] as const) {
      assertEquals(
        goalUnderConditionGate(goal, population),
        { goal, cancelled: false },
        `${population}/${goal}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// ⑥ L'ÉVICTION — pour elle seule, et pas pour l'allaitement
// ---------------------------------------------------------------------------

Deno.test("⛔ L'ÉVICTION NOMME LA BOUCHE, ET ELLE NE SORT PAS SANS DESTINATAIRE", () => {
  assertEquals(pregnancyFoodBlockFor([]), null);
  assertEquals(pregnancyFoodBlockFor(["", "   "]), null);

  const block = pregnancyFoodBlockFor(["Awen"]);
  assert(block !== null);
  assert(block!.includes("Awen"), "le bloc doit nommer la bouche");
  // Les trois familles de la fiche, chacune reconnaissable dans le texte.
  for (const needle of ["cold-smoked", "charcuterie", "soft cheese"]) {
    assert(block!.toLowerCase().includes(needle), `famille manquante: ${needle}`);
  }
  assertEquals(PREGNANCY_AVOIDED_FOOD_REFS.length, 3);
  // ⛔ LA MOITIÉ QUI EMPÊCHE UNE RÈGLE D'UNE PERSONNE DE COÛTER À CINQ. Une
  // allergie gouverne la casserole; ceci gouverne UNE assiette, et le bloc doit
  // le dire au modèle en toutes lettres.
  assert(
    block!.includes("ONLY THEIRS") && block!.includes("Do NOT remove these dishes"),
    "le bloc doit dire qu'il ne retire rien à la table",
  );

  // Deux bouches enceintes: un seul bloc, les deux nommées, pas de doublon.
  const deux = pregnancyFoodBlockFor(["Awen", "Iku", "Awen"]);
  assert(deux !== null);
  assertEquals(deux!.split("Awen").length - 1, 1, "un prénom répété n'apparaît qu'une fois");
  assert(deux!.includes("Iku"));
});

Deno.test("le module est PUR: même entrée, même sortie, entrée intacte", () => {
  const refs = ["diabetes", "pregnancy"];
  const copy = [...refs];
  assertEquals(conditionGatePopulationOf(refs), conditionGatePopulationOf(refs));
  assertEquals(refs, copy, "l'entrée a été modifiée");
  const names = ["Awen"];
  assertEquals(pregnancyFoodBlockFor(names), pregnancyFoodBlockFor(names));
  assertEquals(names, ["Awen"]);
});
