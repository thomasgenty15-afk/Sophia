/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 8 · LA FAMILLE « ALLOCATION » DU TABLEAU DES TESTS OBLIGATOIRES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Chantier : `docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md`, lot 8, ligne
 * « Allocation » — *1 à 6 créneaux selon contrat d'entrée ; repas léger,
 * appétits, apport fixe intermittent, E = 0, apport fixe excédentaire, repas
 * dehors, cases gelées, redistribution faisable/impossible.*
 *
 * ── CE QUI N'EST PAS ICI, ET OÙ IL EST ────────────────────────────────────
 * La redistribution (faisable, impossible, cases gelées, apport fixe, moment
 * léger plafonné, cascade de saturation) est éprouvée par
 * `redistribution_test.ts`, huit cas. Le partage d'une journée à quatre
 * moments, le dîner léger et l'apport fixe retranché une fois sont éprouvés
 * par `portion_sizing_test.ts` (bloc ②). Les ratios d'appétit sur un ADULTE
 * sont éprouvés par `one_target_per_person_test.ts` (⑤). Rien de tout cela
 * n'est réécrit ici : ce fichier ne porte que ce qu'aucun test ne portait.
 *
 * ⛔ LES NOMBRES SONT DÉRIVÉS À LA MAIN, JAMAIS RECOPIÉS DE LA SORTIE. Un test
 * qui affirme « le code rend ce que le code rend » reste vert le jour où la
 * formule change de sens. Chaque cas écrit sa dérivation au-dessus de son
 * assertion.
 *
 * ⛔ AUCUN APPEL MODÈLE, AUCUNE CAMPAGNE. § 10 du plan : les défauts
 * déterministes se démontrent sans dépenser une génération.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  dayTargetFor,
  densityCorridorFor,
  plateBoundsFor,
  redistributeDayBudget,
} from "./portion_sizing.ts";
import {
  // ⟳ 2026-09-11 · LOT B — `requiredDensityFor` A DÉMÉNAGÉ dans le module du
  // contrat, avec un paramètre de plus: `rhythmSlots`, le rythme alimentaire
  // COMPLET de la bouche. Elle déduisait ce rythme de la GRILLE, ce qui donnait
  // la journée entière au dernier repas restant (facteur 2,86 mesuré).
  requiredDensityFor,
} from "./slot_nutrition_contract.ts";
import {
  type AnchorMouth,
  slotPlanTargets,
  SLOT_DAY_WEIGHT,
} from "./mouth_anchor.ts";

/**
 * LE CORPS DU TIR DU 2026-09-07 — 187 cm, 72 kg, 28 ans, prise de masse.
 *
 * Il est repris de `portion_sizing_test.ts` parce que sa CIBLE est déjà
 * dérivée à la main et épinglée là-bas ; s'en servir ici évite d'écrire une
 * seconde dérivation de la même équation, qui divergerait au premier
 * ajustement.
 *
 *   BMR = 10×72 + 6,25×187 − 5×24 + 5 = 1 773,75   (bande 18_29, milieu 24)
 *   M   = 1 773,75 × 1,80 (`trains_some`) = 3 192,75 → 3 193
 *   écart exécuté = 0,35 kg/sem × 7 700 / 7 = 385 kcal/jour
 *   cible du jour = 3 193 + 385 = **3 578**
 */
const GRAND = {
  heightCm: 187,
  weightKg: 72,
  gender: "male" as const,
  ageYears: 28,
  activityLevel: "trains_some" as const,
  activityAxes: { day: null, sport: null, asked: false },
  appetite: null,
};
const QUATRE = ["breakfast", "lunch", "snack_pm", "dinner"];
/** Les six moments qui ont une heure connue, dans l'ordre de la journée. */
const SIX = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
];
const CIBLE_GRAND = 3578;

function bouche(over: Partial<AnchorMouth> = {}): AnchorMouth {
  return {
    memberId: "m-solo",
    ageState: "adult",
    restriction: "clear",
    body: GRAND,
    direction: "up",
    paceKgPerWeek: 0.35,
    declaredSlots: QUATRE,
    conditionRefs: [],
    ...over,
  } as AnchorMouth;
}

function densite(
  over: Partial<Parameters<typeof requiredDensityFor>[0]> = {},
) {
  return requiredDensityFor({
    mouth: bouche(),
    coachCounting: "no_position",
    slotsByDay: new Map([["mon", QUATRE]]),
    // ⟳ 2026-09-11 · LOT B — LE RYTHME COMPLET, distinct de la grille. Ici les
    // deux coïncident: ce décor compose tout ce que la bouche déclare.
    rhythmSlots: QUATRE,
    lightSlots: [],
    slotFixedKcalByDay: new Map(),
    ageYears: 28,
    floors: { normal: 100, light: 60 },
    ...over,
  });
}

/** La somme des parts, au centième — c'est le contrat, pas une élégance. */
function somme(m: ReadonlyMap<string, number>): number {
  return Math.round([...m.values()].reduce((a, b) => a + b, 0) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// ① DE 1 À 6 CRÉNEAUX — la grille d'entrée ne décide pas de la TAILLE du jour
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("ALLOCATION — de 1 à 6 créneaux, la somme des parts EST la cible", () => {
  // ⛔ LE DÉFAUT QUE CE CAS FERME : une renormalisation qui ne renormalise pas.
  // Les poids de `SLOT_DAY_WEIGHT` ne somment pas 1 (ils font 1,40 sur sept
  // jetons) — c'est écrit et voulu, parce que la part est un RAPPORT. Une
  // division par une constante au lieu de la somme des moments DÉCLARÉS ferait
  // donc manger 0,25 de sa journée à qui ne déclare qu'un petit-déjeuner.
  //
  // ⚠️ CE N'EST PAS CE QUE `portion_sizing_test.ts` MESURE. Là-bas, une seule
  // grille — quatre moments — est éprouvée. Le contrat d'entrée du lot 8 va de
  // 1 à 6, et c'est aux deux bouts que la division rate.
  for (let n = 1; n <= 6; n++) {
    const grille = SIX.slice(0, n);
    const r = slotPlanTargets({
      targetKcal: 2400,
      coveredSlots: grille,
      wholeSlots: grille,
      lightSlots: [],
      slotFixedKcal: null,
    });
    assertEquals(somme(r.bySlot), 2400, `${n} créneaux : la journée a changé de taille`);
    assertEquals(r.bySlot.size, n);
    assertEquals(r.fixedCovered.size, 0);
  }

  // ⛔ ET LES PARTS ELLES-MÊMES, DÉRIVÉES À LA MAIN. À cinq moments, la somme
  // des poids vaut 0,25 + 0,10 + 0,40 + 0,10 + 0,35 = 1,20 — un diviseur qui
  // tombe juste, donc cinq entiers qu'aucun arrondi ne cache :
  //
  //   petit-déjeuner  2400 × 0,25/1,20 = 500
  //   collation matin 2400 × 0,10/1,20 = 200
  //   déjeuner        2400 × 0,40/1,20 = 800
  //   goûter          2400 × 0,10/1,20 = 200
  //   dîner           2400 × 0,35/1,20 = 700
  //
  // ⚠️ AU CENTIÈME, ET C'EST L'IDIOME DU MODULE : `0,10/1,20` n'a pas
  // d'écriture binaire exacte, donc le goûter sort à 200,000000000000 03. Le
  // contrat est la part, pas le dernier bit d'un `double`.
  const cinq = slotPlanTargets({
    targetKcal: 2400,
    coveredSlots: SIX.slice(0, 5),
    wholeSlots: SIX.slice(0, 5),
    lightSlots: [],
    slotFixedKcal: null,
  });
  assertEquals(
    SIX.slice(0, 5).map((s) => [s, Math.round(cinq.bySlot.get(s)! * 100) / 100]),
    [
      ["breakfast", 500],
      ["snack_am", 200],
      ["lunch", 800],
      ["snack_pm", 200],
      ["dinner", 700],
    ],
  );

  // ⛔ ET À UN SEUL CRÉNEAU, IL PORTE LA JOURNÉE ENTIÈRE. C'est la moitié qui
  // surprend, et c'est la bonne : qui ne mange qu'une fois par jour doit
  // recevoir sa journée dans cette assiette-là. La conséquence en aval est
  // réelle — c'est ce moment-là qui atteint le plafond de demande de
  // 250 kcal/100 g (voir `lot8_densite_test.ts`), pas une erreur de calcul.
  const un = slotPlanTargets({
    targetKcal: 2400,
    coveredSlots: ["breakfast"],
    wholeSlots: ["breakfast"],
    lightSlots: [],
    slotFixedKcal: null,
  });
  assertEquals(un.bySlot.get("breakfast"), 2400);
});

Deno.test("ALLOCATION — un jeton de moment INCONNU pèse zéro et ne vole rien", () => {
  // ⛔ LE CONTRAT D'ENTRÉE EST UNE LISTE FERMÉE, et ce cas dit ce qu'il advient
  // de ce qui n'y est pas. Un `brunch` qui recevrait un poids par défaut
  // prendrait sa part à tout le monde ; un `brunch` qui ferait tomber le
  // calcul rendrait une journée vide pour un jeton mal orthographié.
  const avec = slotPlanTargets({
    targetKcal: 2400,
    coveredSlots: ["breakfast", "lunch", "brunch"],
    wholeSlots: ["breakfast", "lunch", "brunch"],
    lightSlots: [],
    slotFixedKcal: null,
  });
  const sans = slotPlanTargets({
    targetKcal: 2400,
    coveredSlots: ["breakfast", "lunch"],
    wholeSlots: ["breakfast", "lunch"],
    lightSlots: [],
    slotFixedKcal: null,
  });
  assertEquals(avec.bySlot.get("brunch"), 0);
  assertEquals(avec.bySlot.get("breakfast"), sans.bySlot.get("breakfast"));
  assertEquals(avec.bySlot.get("lunch"), sans.bySlot.get("lunch"));
  assertEquals(somme(avec.bySlot), 2400);

  // ⛔ ET UNE GRILLE ENTIÈREMENT INCONNUE NE REND PAS UNE JOURNÉE À ZÉRO
  // DÉGUISÉE EN CALCUL : `total: 0` et des tables VIDES. C'est l'appelant qui
  // décide ce que ça veut dire chez lui — un `0` posé sur chaque moment se
  // lirait « cette personne ne mange rien ».
  const rien = slotPlanTargets({
    targetKcal: 2400,
    coveredSlots: ["brunch"],
    wholeSlots: ["brunch"],
    lightSlots: [],
    slotFixedKcal: null,
  });
  assertEquals(rien.total, 0);
  assertEquals(rien.bySlot.size, 0);
  assertEquals(rien.fixedCovered.size, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② UN REPAS DEHORS — il reste au DÉNOMINATEUR, il sort du NUMÉRATEUR
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ ALLOCATION — un repas dehors ne redistribue PAS son énergie sur les autres", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LA RÈGLE DU CHANTIER, MOT POUR MOT : « Une génération partielle ne reçoit
  // pas toute l'énergie quotidienne. »
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Le déjeuner est pris au restaurant : le plan ne le compose pas, mais la
  // personne le MANGE. Son poids reste donc au dénominateur.
  //
  //   petit-déjeuner  2400 × 0,25/1,00 = 600
  //   dîner           2400 × 0,35/1,00 = 840
  //   total composé   1 440, et non 2 400
  const dehors = slotPlanTargets({
    targetKcal: 2400,
    coveredSlots: ["breakfast", "dinner"],
    wholeSlots: ["breakfast", "lunch", "dinner"],
    lightSlots: [],
    slotFixedKcal: null,
  });
  assertEquals(dehors.bySlot.get("breakfast"), 600);
  assertEquals(dehors.bySlot.get("dinner"), 840);
  assertEquals(somme(dehors.bySlot), 1440);
  assertEquals(dehors.bySlot.has("lunch"), false, "le repas dehors n'est pas à composer");

  // ⛔ LE PRIX EXACT DE L'ERREUR, ET C'EST POUR ÇA QUE CE CAS EXISTE. Passer la
  // même liste aux deux arguments — l'erreur naturelle, parce que les deux
  // listes se ressemblent — rend :
  //
  //   petit-déjeuner  2400 × 0,25/0,60 = 1 000   (+400)
  //   dîner           2400 × 0,35/0,60 = 1 400   (+560)
  //
  // soit 960 kcal composées PAR-DESSUS un déjeuner au restaurant, sur la
  // journée de quelqu'un qui suit un objectif.
  const faux = slotPlanTargets({
    targetKcal: 2400,
    coveredSlots: ["breakfast", "dinner"],
    wholeSlots: ["breakfast", "dinner"],
    lightSlots: [],
    slotFixedKcal: null,
  });
  assertEquals(faux.bySlot.get("breakfast"), 1000);
  assertEquals(faux.bySlot.get("dinner"), 1400);
  assertEquals(somme(faux.bySlot) - somme(dehors.bySlot), 960);
});

Deno.test("ALLOCATION — une case GELÉE se lit pareil des deux côtés", () => {
  // ⛔ DEUX FONCTIONS, UN SEUL NOMBRE. Une case gelée (consommée, éditée à la
  // main, ou déjà adoptée) est un fait : `slotPlanTargets` lui donne sa part
  // quand on la lui demande, et `redistributeDayBudget` la laisse EXACTEMENT
  // là. Si les deux lectures divergeaient, la journée changerait de taille
  // selon qui la regarde — le défaut que tout ce chantier ferme.
  //
  //   déjeuner gelé  2400 × 0,40/1,00 = 960
  const part = slotPlanTargets({
    targetKcal: 2400,
    coveredSlots: ["lunch"],
    wholeSlots: ["breakfast", "lunch", "dinner"],
    lightSlots: [],
    slotFixedKcal: null,
  }).bySlot.get("lunch")!;
  assertEquals(part, 960);

  const r = redistributeDayBudget([
    { slot: "breakfast", targetKcal: 600, maxGrams: 700, locked: false, light: false },
    { slot: "lunch", targetKcal: part, maxGrams: 700, locked: true, light: false },
    { slot: "dinner", targetKcal: 840, maxGrams: 700, locked: false, light: false },
  ]);
  assert(r.ok);
  assertEquals(r.bySlot.get("lunch"), 960, "la case gelée a bougé");
  // ⚠️ ET LA SOMME DE LA JOURNÉE RESTE LA CIBLE : le gelé y est, inchangé, et
  // les deux mobiles se partagent le reste sans en perdre.
  assertEquals(somme(r.bySlot), 2400);
  assertEquals(r.moved, 0, "rien ne débordait : personne n'avait à bouger");
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LES APPÉTITS — et le mineur, qui n'en a pas
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("ALLOCATION — l'appétit ouvre la bande de masse, et il se DIT", () => {
  // ⚠️ CE QUE `one_target_per_person_test.ts` (⑤) MESURE DÉJÀ : que les bornes
  // d'un adulte bougent de 0,90 et 1,10, et que l'ÉNERGIE ne bouge pas. Ce qui
  // n'était éprouvé nulle part, c'est le champ `appetiteFactor` lui-même —
  // celui que `plateBoundsFor` RÉPOND plutôt que de laisser redeviner.
  //
  //   500 kcal, déjeuner d'adulte :
  //     bmin = min(500/1,35 ; 250) = 250      bmax = min(500/1,0 ; 700) = 500
  //     petit   A = 0,90 ⇒ 225 – 450
  //     moyen   A = 1,00 ⇒ 250 – 500
  //     grand   A = 1,10 ⇒ 275 – 550
  const adulte = (appetite: "small" | "average" | "large" | null) =>
    plateBoundsFor({
      ageYears: 35,
      slot: "lunch",
      slotTargetKcal: 500,
      light: false,
      appetite,
    });
  assertEquals([adulte("small").min, adulte("small").max], [225, 450]);
  assertEquals([adulte("average").min, adulte("average").max], [250, 500]);
  assertEquals([adulte("large").min, adulte("large").max], [275, 550]);
  assertEquals(adulte("small").appetiteFactor, 0.9);
  assertEquals(adulte("large").appetiteFactor, 1.1);

  // ⛔ `null` EST UN NEUTRE VRAI, PAS UN TROU. « Personne n'a répondu » et « je
  // suis dans la moyenne » rendent le même nombre et ne sont pas le même état ;
  // ce qui compte ici, c'est qu'aucun des deux ne rétrécisse l'assiette.
  assertEquals(adulte(null).appetiteFactor, 1);
  assertEquals([adulte(null).min, adulte(null).max], [250, 500]);
});

Deno.test("⛔ ALLOCATION — PAS D'APPÉTIT SUR UN MINEUR, et ce n'est pas un oubli", () => {
  // ⛔ LA GARDE QUE PERSONNE N'ÉPROUVAIT. La table pédiatrique est une capacité
  // d'estomac d'enfant ; l'élargir de 10 % parce qu'il « mange bien » servirait
  // une assiette d'adulte à un corps qui n'en est pas un — et la rétrécir de
  // 10 % parce qu'il « chipote » retirerait de la nourriture à un enfant en
  // croissance. Les deux sens sont refusés, et par le même `Math.min`.
  //
  //   300 kcal, déjeuner d'un enfant de 9 ans (bande `child`, 150–450 g) :
  //     bmin = min(300/1,35 = 222,2 ; 150) = 150   bmax = min(300 ; 450) = 300
  //   quel que soit l'appétit déclaré.
  const enfant = (appetite: "small" | "average" | "large" | null) =>
    plateBoundsFor({
      ageYears: 9,
      slot: "lunch",
      slotTargetKcal: 300,
      light: false,
      appetite,
    });
  for (const a of ["small", "average", "large", null] as const) {
    assertEquals(enfant(a).appetiteFactor, 1, `l'appétit ${a} a mordu sur un enfant`);
    assertEquals([enfant(a).min, enfant(a).max], [150, 300], `bornes déplacées par ${a}`);
    assertEquals(enfant(a).band, "child");
  }

  // ⛔ ET LA CONTRE-ÉPREUVE : sur le MÊME appel, un adulte bouge. Sans elle,
  // une garde cassée — un `appetiteFactorOf` qui rendrait toujours 1 — aurait
  // exactement la même allure qu'une garde qui marche.
  assertEquals(
    plateBoundsFor({
      ageYears: 35,
      slot: "lunch",
      slotTargetKcal: 300,
      light: false,
      appetite: "large",
    }).appetiteFactor,
    1.1,
  );

  // ⚠️ L'ADOLESCENT EST UN MINEUR ICI AUSSI. `plateBoundsFor` range `teen` avec
  // `child` et `toddler` : la bande 12-17 a sa propre table, elle n'a pas
  // l'appétit en plus.
  assertEquals(
    plateBoundsFor({
      ageYears: 15,
      slot: "lunch",
      slotTargetKcal: 300,
      light: false,
      appetite: "large",
    }).appetiteFactor,
    1,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ E = 0 — aucune division, aucune portion minimale, et l'aval se TAIT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ ALLOCATION — E = 0 : l'AVAL ne fabrique ni bande ni couloir", () => {
  // ⚠️ CE QUE `portion_sizing_test.ts` MESURE DÉJÀ : que `slotPlanTargets`
  // rende `0` et NOMME le moment dans `fixedCovered`. Ce qui n'était éprouvé
  // nulle part, c'est ce que les deux fonctions d'aval en font — et c'est là
  // que « aucun dimensionnement par division » se joue, parce que `Dmin` et
  // `Dmax` sont des divisions par une masse dérivée de cette énergie-là.
  //
  // ⛔ `plateBoundsFor` NE DIVISE PAS : il retombe sur la table seule, et il
  // DIT que c'est la table (`no_target`). Une bande dérivée de 0 kcal vaudrait
  // 0–0, c'est-à-dire une assiette interdite.
  const b = plateBoundsFor({
    ageYears: 35,
    slot: "snack_pm",
    slotTargetKcal: 0,
    light: false,
    appetite: "large",
  });
  assertEquals(b.boundSource, "no_target");
  assertEquals([b.min, b.max], [80, 300], "la table de collation adulte, et rien d'autre");
  // ⛔ ET L'APPÉTIT NE S'APPLIQUE PAS NON PLUS : sans part kcal, il n'y a rien
  // à ouvrir. Un ×1,10 posé sur la table seule élargirait l'assiette de
  // quelqu'un dont on ne compose rien.
  assertEquals(b.appetiteFactor, 1);

  // ⛔ ET LE COULOIR RÉPOND `null`, PAS UN NOMBRE. `100 × 0 / Gmax` vaudrait 0,
  // c'est-à-dire « un plat de densité zéro » — une consigne intenable, et une
  // consigne intenable apprend au modèle que ces nombres-là sont décoratifs.
  assertEquals(densityCorridorFor({ targetKcal: 0, bounds: b }), null);
  assertEquals(densityCorridorFor({ targetKcal: null, bounds: b }), null);

  // ⚠️ ET LE CAS QUI PASSE, sur les MÊMES bornes : dès qu'il y a une part, le
  // couloir existe. Sans cette ligne, un `return null` inconditionnel aurait
  // l'air d'une garde qui marche.
  const vivant = densityCorridorFor({ targetKcal: 200, bounds: b });
  assert(vivant !== null && vivant.minPer100G > 0);
});

Deno.test("⛔ ALLOCATION — un apport fixe EXCÉDENTAIRE se compte, et ne devient pas « aucune cible »", () => {
  // ⛔ LE COMPTEUR EST TOUT L'OBJET DU CAS. Depuis le retrait du plancher de
  // 30 %, la part d'un moment PEUT tomber à zéro. Sans `fixed_covered`, « le
  // shaker mange le goûter de tout le monde » et « ce cas n'arrive jamais »
  // rendraient exactement le même objet.
  //
  //   cible du jour ............................. 3 578 (dérivée en tête)
  //   part du goûter  3578 × 0,10/1,10 = 325,27
  //   shaker déclaré ............................ 900
  //   il n'y a rien à composer, et l'excédent vaut 900 − 325,27 = 574,7
  assertEquals(dayTargetFor(bouche(), "no_position").kcal, CIBLE_GRAND);

  const part = slotPlanTargets({
    targetKcal: CIBLE_GRAND,
    coveredSlots: ["snack_pm"],
    wholeSlots: QUATRE,
    lightSlots: [],
    slotFixedKcal: null,
  }).bySlot.get("snack_pm")!;
  assertEquals(Math.round(part * 100) / 100, 325.27);

  const r = densite({
    slotFixedKcalByDay: new Map([["mon", new Map([["snack_pm", 900]])]]),
  });
  assertEquals(
    r.named.map((d) => d.slot),
    ["breakfast", "lunch", "dinner"],
    "le goûter couvert par le shaker ne reçoit PAS de consigne de densité",
  );
  assertEquals(r.counters.fixed_covered, 1);
  assertEquals(r.counters.slots, 4, "les quatre moments ont bien été examinés");

  // ⛔ ET LES TROIS AUTRES NE BOUGENT PAS D'UN KCAL. L'apport fixe est
  // retranché à SON moment ; le raboter ou l'étaler ferait composer un repas
  // par-dessus une boisson qu'on sait avalée, ou amputerait un moment innocent.
  const sans = densite();
  for (const slot of ["breakfast", "lunch", "dinner"]) {
    assertEquals(
      r.named.find((d) => d.slot === slot)!.minPer100G,
      sans.named.find((d) => d.slot === slot)!.minPer100G,
      `${slot} a bougé alors que le shaker est au goûter`,
    );
  }

  // ⚠️ ET L'EXCÉDENT EST CHIFFRÉ, pas seulement signalé : c'est ce qui permet
  // à l'appelant de dire « elle avale déjà 575 kcal de plus que la part de sa
  // journée qui tombe là ».
  const trop = slotPlanTargets({
    targetKcal: CIBLE_GRAND,
    coveredSlots: ["snack_pm"],
    wholeSlots: QUATRE,
    lightSlots: [],
    slotFixedKcal: new Map([["snack_pm", 900]]),
  });
  assertEquals(trop.bySlot.get("snack_pm"), 0);
  assertEquals(Math.round(trop.fixedCovered.get("snack_pm")! * 100) / 100, 574.73);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ UN APPORT FIXE INTERMITTENT — il ne déplace que le jour où il tombe
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("ALLOCATION — un shaker du LUNDI ne change pas le mardi", () => {
  // ⛔ LE DÉFAUT QUE CE CAS FERME : un apport fixe lu une fois et appliqué à
  // toute la fenêtre. `slot_fixed_kcal.ts` sait déjà qu'un apport a des JOURS ;
  // ce qui n'était éprouvé nulle part, c'est que `requiredDensityFor` garde
  // cette séparation jusqu'au couloir — il appelle `slotPlanTargets` une fois
  // PAR JOUR, avec la table de CE jour-là.
  //
  //   lundi   goûter : 325,27 kcal − 900 de shaker ⇒ rien à composer
  //   mardi   goûter : 325,27 kcal, intact
  //
  // ⚠️ LE GOÛTER FINIT DONC AVEC UNE SEULE OCCURRENCE là où les trois autres
  // en ont deux : c'est exactement la différence entre « ce moment n'existe
  // pas » et « ce moment n'était pas à composer lundi ».
  const r = densite({
    slotsByDay: new Map([["mon", QUATRE], ["tue", QUATRE]]),
    slotFixedKcalByDay: new Map([["mon", new Map([["snack_pm", 900]])]]),
  });
  const gouter = r.named.find((d) => d.slot === "snack_pm");
  assert(gouter !== undefined, "le goûter du mardi a disparu avec celui du lundi");
  assertEquals(gouter.occurrences, 1);
  for (const slot of ["breakfast", "lunch", "dinner"]) {
    assertEquals(
      r.named.find((d) => d.slot === slot)!.occurrences,
      2,
      `${slot} devrait compter ses deux jours`,
    );
  }
  assertEquals(r.counters.slots, 8, "quatre moments × deux jours");
  assertEquals(r.counters.fixed_covered, 1, "un seul moment-jour couvert par le shaker");

  // ⛔ ET SON COULOIR EST CELUI DU MARDI, SEUL. Il vaut exactement celui d'une
  // fenêtre d'un jour sans shaker : l'absence du lundi n'a ni élargi ni
  // rétréci la bande.
  //
  //   goûter 325,27 kcal, table de collation adulte (80 – 300 g) :
  //     Gmax = min(325,27 ; 300) = 300 ⇒ Dmin = 100 × 325,27/300 = 108,42 → 109
  //     Gmin = min(325,27/1,35 = 240,9 ; 80) = 80 ⇒ Dmax = 406,6, rabattu à 250
  const seul = densite().named.find((d) => d.slot === "snack_pm")!;
  assertEquals(gouter.minPer100G, 109);
  assertEquals([gouter.minPer100G, gouter.maxPer100G], [
    seul.minPer100G,
    seul.maxPer100G,
  ]);

  // ⚠️ ET LE CAS QUI MORD : un shaker TOUS LES JOURS, lui, doit faire taire le
  // goûter des deux jours. Sans cette moitié, un lecteur qui ignorerait
  // complètement `slotFixedKcalByDay` passerait le premier test.
  const partout = densite({
    slotsByDay: new Map([["mon", QUATRE], ["tue", QUATRE]]),
    slotFixedKcalByDay: new Map([
      ["mon", new Map([["snack_pm", 900]])],
      ["tue", new Map([["snack_pm", 900]])],
    ]),
  });
  assertEquals(partout.named.find((d) => d.slot === "snack_pm"), undefined);
  assertEquals(partout.counters.fixed_covered, 2);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LA REDISTRIBUTION EST CONSTRUITE — ET ELLE N'A AUCUN APPELANT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ Le grep naïf compte les mentions en COMMENTAIRE comme des appels vivants.
 * C'est la cicatrice `caller-audit-must-strip-comments` de ce dépôt.
 */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

Deno.test("⛔ DÉFAUT ÉPINGLÉ — `redistributeDayBudget` n'a AUCUN appelant de production", async () => {
  // ══════════════════════════════════════════════════════════════════════════
  // CE QUE LE CHANTIER DEMANDE (lot 4, dernier paragraphe) :
  //
  //   « Si le couloir est vide : tenter une redistribution de la même
  //     journée/personne sur les seuls créneaux déjà acceptés et modifiables […]
  //     Encapsuler la faisabilité dans une fonction pure utilisant les mêmes
  //     bornes ; ne pas ajouter une seconde arithmétique dans le handler. »
  //
  // La fonction pure EXISTE, elle est juste, et onze cas l'éprouvent. Ce qui
  // manque est la première moitié de la phrase : **rien ne l'appelle**. Le
  // couloir vide, lui, se produit — `lot8_densite_test.ts` en fabrique un par
  // la chaîne de production — et il ne déclenche aucune redistribution.
  //
  // ⚠️ CE TEST EST UN TEST DE CARACTÉRISATION, au sens de
  // `moteur_unique_contre_exemples_test.ts` : il fige l'état d'AUJOURD'HUI et
  // il rougira le jour où quelqu'un branchera la redistribution. C'est le
  // signal, pas l'accident : celui qui livre ce branchement vient ici retourner
  // l'assertion, et il ne peut pas ne pas la voir.
  // ══════════════════════════════════════════════════════════════════════════
  const fichiers = [
    "../../generate-household-meal-v1/index.ts",
    "./household_portions.ts",
    "./household_prompt_v34.ts",
    "./pot_demand.ts",
  ];
  for (const f of fichiers) {
    const src = sansCommentaires(
      await Deno.readTextFile(new URL(f, import.meta.url)),
    );
    assertEquals(
      src.includes("redistributeDayBudget"),
      false,
      `⟳ ${f} APPELLE la redistribution : le défaut est fermé, viens retourner ce test`,
    );
  }

  // ⛔ ET LA CONTRE-ÉPREUVE, SUR LE MÊME LECTEUR : le module qui la définit,
  // lui, la nomme. Sans elle, une lecture de fichier cassée — un mauvais
  // chemin, un `readTextFile` qui rendrait du vide — aurait exactement la même
  // allure qu'un audit qui conclut « aucun appelant ».
  const source = sansCommentaires(
    await Deno.readTextFile(new URL("./portion_sizing.ts", import.meta.url)),
  );
  assert(
    source.includes("export function redistributeDayBudget"),
    "le lecteur ne lit rien : l'audit ci-dessus ne prouve rien",
  );
});
