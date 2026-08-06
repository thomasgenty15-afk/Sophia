// LE PLANCHER DE DÉCLARATION DE MALADIE — ce que ces tests protègent.
//
// Le défaut d'origine, mesuré en run réel le 2026-08-05: « je suis diabétique
// de type 2, je mange quoi ? » recevait un protocole nutritionnel prescriptif
// complet, renvoi clinicien FR 0/3 et EN 1/3, et `student_safety_constraints`
// restait vide. C'est le seul défaut de la campagne qui pouvait blesser
// quelqu'un.
//
// LES DEUX SENS SONT TESTÉS, et c'est le point. Une garde clinique qui mord
// partout se fait débrancher dans la semaine — et une garde débranchée ne
// protège personne. Chaque désarmement ci-dessous correspond à un faux positif
// qu'on peut nommer.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  CLINICAL_DEFERRAL_BLOCK,
  detectDeclaredMedicalCondition,
} from "./medical_condition_floor.ts";

// ---------------------------------------------------------------------------
// CE QUI DOIT MORDRE
// ---------------------------------------------------------------------------

Deno.test("la phrase EXACTE du défaut mesuré, dans les deux langues", () => {
  for (
    const message of [
      "je suis diabétique de type 2, je mange quoi ?",
      "I have type 2 diabetes, what should I eat?",
    ]
  ) {
    const hit = detectDeclaredMedicalCondition(message);
    assert(hit, `aucune détection sur: ${message}`);
    assertEquals(hit.condition_ref, "diabetes");
    // Les mots de l'élève, tels quels: la ligne doit porter SA formulation.
    assertEquals(hit.notes, message);
  }
});

Deno.test("les formes de déclaration courantes mordent, EN et FR", () => {
  const cases: Array<[string, string]> = [
    ["I'm diabetic", "diabetes"],
    ["I have been diagnosed with coeliac disease", "coeliac_disease"],
    ["I was diagnosed with Crohn's last year", "inflammatory_bowel_disease"],
    ["I have high blood pressure", "hypertension"],
    ["I'm pregnant", "pregnancy"],
    ["j'ai une insuffisance rénale", "chronic_kidney_disease"],
    ["je suis hypertendu", "hypertension"],
    ["on m'a diagnostiqué une hypothyroïdie", "thyroid_disorder"],
    ["j'ai la maladie de Crohn", "inflammatory_bowel_disease"],
    ["je suis enceinte", "pregnancy"],
  ];
  for (const [message, expected] of cases) {
    const hit = detectDeclaredMedicalCondition(message);
    assert(hit, `aucune détection sur: ${message}`);
    assertEquals(hit.condition_ref, expected, `mauvais jeton pour: ${message}`);
  }
});

Deno.test("le terme le PLUS LONG gagne", () => {
  // « gestational diabetes » ne doit pas se réduire à « diabetes »: le jeton
  // est le même ici, mais la règle de tri est ce qui empêchera « type 1 » et
  // « type 2 » de se confondre le jour où ils auront des jetons distincts.
  const hit = detectDeclaredMedicalCondition("I have gestational diabetes");
  assert(hit);
  assertEquals(hit.matched, "gestational diabetes");
});

// ---------------------------------------------------------------------------
// LES CONDITIONS DE DÉSARMEMENT — chacune nomme son faux positif
// ---------------------------------------------------------------------------

Deno.test("une QUESTION n'est pas une déclaration", () => {
  for (
    const message of [
      "what is type 2 diabetes?",
      "am I diabetic if I eat a lot of sugar?",
      "c'est quoi le diabète de type 2 ?",
      "est-ce que je suis diabétique si je mange du sucre ?",
    ]
  ) {
    assertEquals(
      detectDeclaredMedicalCondition(message),
      null,
      `a mordu à tort sur: ${message}`,
    );
  }
});

Deno.test("une NÉGATION n'est pas une déclaration", () => {
  for (
    const message of [
      "I'm not diabetic, I just want to eat better",
      "I don't have diabetes",
      "je ne suis pas diabétique",
      "je n'ai pas de diabète",
    ]
  ) {
    assertEquals(
      detectDeclaredMedicalCondition(message),
      null,
      `a mordu à tort sur: ${message}`,
    );
  }
});

Deno.test("la maladie de QUELQU'UN D'AUTRE n'est pas la sienne", () => {
  for (
    const message of [
      "my mother is diabetic, should I be worried?",
      "ma mère est diabétique",
      "my son has coeliac disease so I cook gluten free",
    ]
  ) {
    assertEquals(
      detectDeclaredMedicalCondition(message),
      null,
      `a mordu à tort sur: ${message}`,
    );
  }
});

Deno.test("une CRAINTE ou un RISQUE n'est pas un diagnostic", () => {
  // C'est le désarmement le plus important du lot: quelqu'un qui s'inquiète a
  // justement besoin qu'on lui parle, pas qu'on le défère.
  for (
    const message of [
      "I'm worried I have diabetes",
      "I think I might have diabetes",
      "I'm prediabetic",
      "j'ai peur de devenir diabétique",
      "je crois que j'ai du diabète",
    ]
  ) {
    assertEquals(
      detectDeclaredMedicalCondition(message),
      null,
      `a mordu à tort sur: ${message}`,
    );
  }
});

Deno.test("une maladie PASSÉE et résolue ne défère pas", () => {
  for (
    const message of [
      "I used to have gestational diabetes",
      "je n'ai plus de diabète",
    ]
  ) {
    assertEquals(
      detectDeclaredMedicalCondition(message),
      null,
      `a mordu à tort sur: ${message}`,
    );
  }
});

Deno.test("une maladie HORS LISTE ne défère pas — on ne rapproche jamais", () => {
  // R7: déférer sur un mot au hasard serait pire que de ne rien faire. Une
  // migraine ou une entorse n'empêchent pas de parler d'une assiette.
  for (
    const message of [
      "I have a migraine today",
      "j'ai une entorse à la cheville",
      "I have a cold",
    ]
  ) {
    assertEquals(
      detectDeclaredMedicalCondition(message),
      null,
      `a mordu à tort sur: ${message}`,
    );
  }
});

Deno.test("LE CAS NOMINAL DU PRODUIT reste intact", () => {
  // Si ce plancher mordait ici, il rendrait le produit inutilisable.
  for (
    const message of [
      "I had chicken and rice for lunch",
      "j'ai mangé du poulet et du riz ce midi",
      "what should I eat for lunch?",
      "je suis fatigué aujourd'hui",
      "I'm trying to lose fat",
      "je suis végétarien",
    ]
  ) {
    assertEquals(
      detectDeclaredMedicalCondition(message),
      null,
      `a mordu à tort sur: ${message}`,
    );
  }
});

Deno.test("un message vide ou illisible rend null, jamais une approximation", () => {
  assertEquals(detectDeclaredMedicalCondition(""), null);
  assertEquals(detectDeclaredMedicalCondition(null), null);
  assertEquals(detectDeclaredMedicalCondition("   "), null);
  assertEquals(detectDeclaredMedicalCondition(42), null);
});

// ---------------------------------------------------------------------------
// LE BLOC — ce qu'il promet, et ce qu'il refuse de promettre
// ---------------------------------------------------------------------------

Deno.test("le bloc interdit de prescrire ET interdit d'abandonner", () => {
  // Les deux moitiés comptent. Le lot A1 venait de retirer un bâillon; ce bloc
  // ne doit pas en réinstaller un sous un autre nom.
  assert(CLINICAL_DEFERRAL_BLOCK.includes("DO NOT PRESCRIBE FOR THE CONDITION"));
  assert(CLINICAL_DEFERRAL_BLOCK.includes("YOU MAY STILL BE USEFUL"));
  assert(CLINICAL_DEFERRAL_BLOCK.includes("Refusing everything is not caution"));
  // Il nomme qui décide, concrètement.
  assert(CLINICAL_DEFERRAL_BLOCK.includes("registered dietitian"));
  // Et il n'invente pas un canal qui n'existe pas — c'est le modèle produit.
  assert(CLINICAL_DEFERRAL_BLOCK.includes("NEVER send them to their coach"));
  // L'urgence garde sa porte.
  assert(CLINICAL_DEFERRAL_BLOCK.includes("seek urgent care now"));
});

Deno.test("le bloc n'est pas une phrase relisible à l'élève", () => {
  // Le lot A1 a mesuré qu'un en-tête RÉDIGÉ ressort verbatim dans la bouche de
  // l'agent (3/3). Celui-ci est une étiquette, comme les blocs de doctrine.
  assert(CLINICAL_DEFERRAL_BLOCK.startsWith("== HOW YOU ANSWER THIS TURN =="));
});
