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
  MEDICAL_CONDITION_SURFACE_FORMS,
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

Deno.test("LE TROU MESURÉ EN RÉEL: les formulations banales mordent aussi", () => {
  // Mesuré le 2026-08-06 — ces trois-là ne déclenchaient RIEN (0 ligne sur 17
  // tours) et laissaient sortir un protocole prescriptif complet, dont une
  // phrase sur l'insuline et les sulfamides. Un plancher ne vaut que par les
  // phrases qu'il reconnaît, et celles-ci sont aussi ordinaires que « j'ai un
  // diabète ».
  const cases: Array<[string, string]> = [
    ["je souffre de diabète de type 2, je mange quoi ?", "diabetes"],
    ["I've had type 2 diabetes for ten years", "diabetes"],
    ["mon diabète s'aggrave", "diabetes"],
    ["I live with Crohn's disease", "inflammatory_bowel_disease"],
    ["je suis suivie pour une hypothyroïdie", "thyroid_disorder"],
    ["I'm being treated for hypertension", "hypertension"],
    ["ma maladie coeliaque s'aggrave", "coeliac_disease"],
  ];
  for (const [message, expected] of cases) {
    const hit = detectDeclaredMedicalCondition(message);
    assert(hit, `aucune détection sur: ${message}`);
    assertEquals(hit.condition_ref, expected, `mauvais jeton pour: ${message}`);
  }
});

Deno.test("SECONDE PASSE: les VOISINS des formulations déjà couvertes mordent", () => {
  // La passe précédente avait fermé trois PHRASES, pas trois FAMILLES. Le banc
  // en a trouvé six autres immédiatement, toutes ordinaires. La pire rendait un
  // conseil de médication — « take metformin with a meal… can lower vitamin
  // B12 » — exactement ce que le bloc interdit, sans que le bloc soit injecté.
  const cases: Array<[string, string]> = [
    ["I take metformin for my type 2 diabetes, what should I eat?", "diabetes"],
    ["I got diagnosed with type 2 diabetes last year", "diabetes"],
    ["I've been diabetic since 2015", "diabetes"],
    ["type 2 diabetes here — what should I eat?", "diabetes"],
    ["on m'a détecté un diabète de type 2, je mange quoi ?", "diabetes"],
    ["mon diabète est mal équilibré, je mange quoi ?", "diabetes"],
    ["je prends de la metformine pour mon diabète", "diabetes"],
    // Forme adjectivale FR, absente de la table de surface.
    ["je suis hypothyroïdien", "thyroid_disorder"],
  ];
  for (const [message, expected] of cases) {
    const hit = detectDeclaredMedicalCondition(message);
    assert(hit, `aucune détection sur: ${message}`);
    assertEquals(hit.condition_ref, expected, `mauvais jeton pour: ${message}`);
  }
});

Deno.test("DÉCLARER PUIS QUESTIONNER reste une déclaration", () => {
  // Les motifs de question étaient testés sur le message ENTIER: une
  // déclaration SUIVIE d'une question était donc désarmée en entier — aucune
  // ligne, aucune garde, et la recherche web repartait chercher un protocole
  // clinique. Mesuré 3/3, et seulement en anglais: le FR mordait déjà, donc les
  // deux langues n'avaient pas la même politique.
  const cases = [
    "I have type 2 diabetes. Is it actually true that pasta is worse than rice?",
    "I have type 2 diabetes, is it ok to eat pasta?",
    "I'm diabetic, am I allowed bread?",
    "je suis diabétique, c'est quoi une bonne assiette ?",
    // Une HÉSITATION n'est pas une négation.
    "I'm not sure, but I have type 2 diabetes",
  ];
  for (const message of cases) {
    const hit = detectDeclaredMedicalCondition(message);
    assert(hit, `désarmé à tort sur: ${message}`);
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

// ---------------------------------------------------------------------------
// LES LIGATURES (lot S1c, 2026-08-22) — le JUMEAU CLINIQUE de S1
// ---------------------------------------------------------------------------
//
// MESURE AVANT, 2026-08-22 01:39:44 CEST, avant toute ligne de correctif:
//   « j'ai une maladie cœliaque »  ⇒ null           ← la graphie NORMALE du mot
//   « j'ai une maladie coeliaque » ⇒ coeliac_disease
// 4 des 6 formes de `coeliac_disease` sont concernées, et les 4 étaient mortes
// sous ligature: accord entre les deux graphies 0/4 = 0 %.
//
// ⛔ C'est PIRE que pour l'allergie. Dans le catalogue d'allergènes la ligature
// était une VARIANTE — le digramme « oeuf » y figurait déjà. Ici `cœliaque` EST
// l'orthographe normale, et `coeliac_disease` est le seul jeton de la table à
// en porter une. Sur la garde dont l'en-tête dit qu'elle est « le SEUL défaut
// de toute la campagne qui peut blesser quelqu'un ».
//
// ⚠️ Ces quatre tests forment le trépied de S1, recopié, et se lisent ensemble:
// un qui MORD (la ligature), un qui NE MORD PAS (sans lui, une `normalize()`
// cassée ferait tout mordre et ressemblerait trait pour trait à une garde qui
// marche), un BALAYAGE qui compte ses propres cas (un balayage vide est vert
// pour rien: cicatrice `V0-B-bis`), et un qui DIT UNE ABSENCE (le dépliage `æ`
// n'a aucune cible dans cette table).
//
// ⛔ LE CRITÈRE N'EST PAS « rend ce ref », C'EST « les deux graphies rendent le
// MÊME verdict ». S1 a d'abord rougi pour la mauvaise raison en l'ignorant.

/** La graphie en digramme d'une chaîne à ligature. */
function digraphe(s: string): string {
  return s.replace(/œ/g, "oe").replace(/æ/g, "ae");
}

Deno.test("LIGATURE — les 6 formulations françaises mordent dans les DEUX graphies", () => {
  const formulations = [
    "j'ai une maladie cœliaque",
    "je suis cœliaque",
    "on m'a diagnostiqué une maladie cœliaque",
    "je souffre d'une maladie cœliaque",
    "je vis avec une maladie cœliaque",
    "on m'a détecté une maladie cœliaque",
  ];
  assertEquals(formulations.length, 6, "la grille doit porter ses 6 formulations");

  for (const ligature of formulations) {
    const digramme = digraphe(ligature);
    assert(
      ligature !== digramme,
      `cas dégénéré, la ligature a disparu du littéral: ${ligature}`,
    );

    const hitLig = detectDeclaredMedicalCondition(ligature);
    assert(hitLig, `doit mordre sous ligature: ${ligature}`);
    assertEquals(hitLig!.condition_ref, "coeliac_disease", ligature);

    // ⚠️ AUCUNE RÉGRESSION SUR LE DIGRAMME: c'est la moitié qui marchait déjà.
    const hitDig = detectDeclaredMedicalCondition(digramme);
    assert(hitDig, `doit mordre sous digramme: ${digramme}`);
    assertEquals(hitDig!.condition_ref, "coeliac_disease", digramme);

    // Et les deux graphies rendent le MÊME verdict, terme mordu compris.
    assertEquals(hitLig!.matched, hitDig!.matched, ligature);
    // `notes` porte les mots de l'élève TELS QUELS — la ligature n'est dépliée
    // que pour reconnaître, jamais pour réécrire ce qu'il a tapé.
    assertEquals(hitLig!.notes, ligature, ligature);
  }
});

Deno.test("LIGATURE — BALAYAGE: toute forme concernée de la table est couverte", () => {
  // MESURÉ le 2026-08-22: la table ne porte AUCUNE ligature littérale (0 sur
  // 76 formes, 11 jetons). Ce qu'elle porte, ce sont des DIGRAMMES qu'un
  // francophone écrit normalement avec une ligature — aujourd'hui les 4 formes
  // de `coeliac_disease`, et rien d'autre.
  //
  // Le balayage est écrit sur la TABLE et non sur une liste recopiée: le jour
  // où quelqu'un ajoute « oedeme », « caecum » ou « nævus », il entre ici tout
  // seul, et ce test rougit s'il n'est pas couvert.
  const concernees: Array<{ ref: string; form: string }> = [];
  for (const [ref, forms] of Object.entries(MEDICAL_CONDITION_SURFACE_FORMS)) {
    for (const form of forms) {
      if (/(oe|ae)/.test(form.toLowerCase()) || /[œæ]/.test(form)) {
        concernees.push({ ref, form });
      }
    }
  }

  // ⛔ L'ASSERTION DE CARDINALITÉ, et elle n'est pas décorative: une boucle sur
  // zéro cas est verte sans rien avoir prouvé.
  assert(
    concernees.length >= 1,
    "balayage vide — un balayage qui ne couvre rien n'est pas une preuve",
  );

  for (const { ref, form } of concernees) {
    const ligature = form.replace(/oe/g, "œ").replace(/ae/g, "æ");
    assert(ligature !== form, `${ref}: aucune ligature à produire pour ${form}`);

    const hitLig = detectDeclaredMedicalCondition(`j'ai une ${ligature}`);
    const hitDig = detectDeclaredMedicalCondition(`j'ai une ${form}`);

    // Le critère est l'ÉQUIVALENCE des deux graphies, pas « rend ce ref »: une
    // forme peut être listée sous deux clés, et l'index n'en résout qu'une.
    assert(hitDig, `${ref}: le digramme ${form} ne mord pas — prémisse cassée`);
    assert(hitLig, `${ref}: la ligature ${ligature} ne mord pas`);
    assertEquals(hitLig!.condition_ref, hitDig!.condition_ref, form);
    assertEquals(hitLig!.matched, hitDig!.matched, form);
  }
});

Deno.test("LIGATURE — LE CAS QUI PASSE: le dépliage n'ouvre aucune porte", () => {
  // Sans ces cas, une `normalize()` cassée — qui ferait mordre tout — aurait
  // exactement la tête d'une garde qui marche.
  for (
    const message of [
      // Le témoin neutre.
      "j'aime bien les pâtes",
      // Une ligature dans une phrase qui ne déclare aucune maladie.
      "j'ai mangé des œufs à midi",
      // Les désarmements tiennent SOUS ligature. Avant le correctif ils
      // rendaient `null` pour la MAUVAISE raison — le terme ne se résolvait
      // pas; maintenant c'est bien le désarmement qui parle.
      "je ne suis pas cœliaque",
      "est-ce que je suis cœliaque ?",
      "j'ai peur de devenir cœliaque",
      "ma sœur est cœliaque",
      // R7 — la ligature ne doit pas inventer un jeton: « cœur » se déplie en
      // « coeur », qui n'est dans aucune table. On ne rapproche jamais du plus
      // proche, même quand `heart_disease` est à un mot de là.
      "j'ai une maladie de cœur",
    ]
  ) {
    assertEquals(
      detectDeclaredMedicalCondition(message),
      null,
      `ne doit PAS mordre: ${message}`,
    );
  }
});

Deno.test("LIGATURE — le désarmement « quelqu'un d'autre » vaut dans les DEUX graphies", () => {
  // ⛔ CE TEST DIT UN CHANGEMENT DE COMPORTEMENT, et il faut le lire comme tel.
  // `soeur` est le SECOND et dernier littéral à digramme de ce module (l'autre
  // est `coeliaque`, dans le désarmement de négation). Mesuré le 2026-08-22 à
  // 01:39:44, AVANT le correctif:
  //   « ma sœur est diabétique et j'ai un diabète de type 2 »  ⇒ diabetes
  //   « ma soeur est diabétique et j'ai un diabète de type 2 » ⇒ null
  // Deux graphies, deux verdicts — sur un désarmement, donc dans l'autre sens
  // que la maladie cœliaque: le plancher SUR-déclenchait sous ligature.
  //
  // Le dépliage aligne les deux sur le comportement du digramme, qui est celui
  // que l'auteur a écrit et testé. Ce qui reste vrai des deux côtés: c'est la
  // maladie de quelqu'un d'autre qui est nommée en tête, et le désarmement
  // « autrui » est ABSOLU par construction (il NIE la déclaration).
  for (
    const phrase of [
      "ma sœur est diabétique et j'ai un diabète de type 2",
      "ma sœur est cœliaque",
    ]
  ) {
    assertEquals(
      detectDeclaredMedicalCondition(phrase),
      detectDeclaredMedicalCondition(digraphe(phrase)),
      `les deux graphies doivent rendre le même verdict: ${phrase}`,
    );
    assertEquals(detectDeclaredMedicalCondition(phrase), null, phrase);
  }
});

Deno.test("LIGATURE — æ est déplié par SYMÉTRIE, et n'a aucune cible aujourd'hui", () => {
  // ⛔ CE TEST DIT UNE ABSENCE, et il faut le lire comme tel: le dépliage
  // `æ → ae` de `medical_condition_floor.ts` n'est exercé de bout en bout par
  // AUCUNE maladie — zéro forme de la table ne contient « ae ». Il est posé
  // parce que les deux modules frères (`allergen_catalog.ts`,
  // `safety_constraint_floor.ts`) le portent, et que deux normalisations qui
  // divergent sont exactement la facture que S1 puis S1c viennent de payer.
  //
  // Le jour où une forme en « ae » entre dans la table, le BALAYAGE ci-dessus
  // la prend automatiquement — et ce test-ci rougit pour prévenir que
  // l'affirmation d'absence a cessé d'être vraie. Sans lui, un dépliage jamais
  // exercé ressemble TRAIT POUR TRAIT à un dépliage qui marche.
  const avecAe = Object.entries(MEDICAL_CONDITION_SURFACE_FORMS)
    .flatMap(([ref, forms]) => forms.map((form) => ({ ref, form })))
    .filter(({ form }) => /ae/.test(form.toLowerCase()) || /æ/.test(form));
  assertEquals(
    avecAe.map(({ ref, form }) => `${ref}:${form}`),
    [],
    "une forme en « ae » est apparue — vérifier qu'elle est couverte sous « æ »",
  );
});
