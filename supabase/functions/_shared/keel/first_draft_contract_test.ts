// ═══════════════════════════════════════════════════════════════════════════
// LOT C · C3 à C7 — CE QUE LA CONSIGNE DIT, ET CE QU'ELLE NE DIT PLUS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE CES CAS PROUVENT, EN TOUTES LETTRES. Aucun appel modèle n'a été
// fait: le lot l'interdit, et deux consignes ne se comparent pas sans tir. Ils
// prouvent donc UNIQUEMENT que la consigne contient ce qu'elle doit contenir,
// qu'elle ne contient plus ce qu'elle ne doit plus contenir, et qu'elle est
// déterministe. Ils ne disent RIEN de son effet sur une densité rendue.
//
// ⛔ ET CE QU'ILS NE MESURENT PAS, L'ENQUÊTE LE DIT AUSSI: « leur contribution
// chiffrée aux écarts n'est pas démontrée ». On retire des consignes FAUSSES,
// pas des consignes dont on aurait mesuré le coût.

import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import { MEAL_SYSTEM_PROMPT } from "./meal_generation.ts";
import { STANDARD_RECIPE_BLOCK } from "./household_meal_generation.ts";
import {
  ANCHOR_DIVERGENCE_RATIO,
  cellDensityOf,
  cellDensitySentence,
  densityFragment,
  type SlotDensityWithAnchor,
} from "./household_portions.ts";
import {
  PLATE_MASS_BOUNDS_G,
  type RequiredDensity,
  type SlotDensity,
} from "./portion_sizing.ts";
import { buildHouseholdPromptBlocksV34 } from "./household_prompt_v34.ts";

// ---------------------------------------------------------------------------
// C5 — LES CONSIGNES CONCURRENTES DE GRAMMAGE
// ---------------------------------------------------------------------------

Deno.test("⛔ C5 — AUCUN POIDS D'ASSIETTE GÉNÉRIQUE DANS LE PROMPT SYSTÈME", () => {
  // ⛔ POURQUOI CETTE PHRASE ÉTAIT FAUSSE, ET PAS SEULEMENT ENCOMBRANTE.
  // « a full lunch or dinner for one adult is a plate of roughly 600 to 750 g »
  // est une MASSE D'ASSIETTE. Ce produit en a déjà une, calculée par bouche:
  // `PLATE_MASS_BOUNDS_G.adult.meal` vaut 250 à 700 g, l'ado 250-650, l'enfant
  // 150-450. La consigne générique avait donc son plancher au-dessus de
  // l'assiette moyenne du moteur et son plafond AU-DESSUS de son maximum — et
  // sur un plan de foyer, elle annonçait 600 g minimum pour la portion d'un
  // enfant que le moteur borne à 450.
  assertEquals(PLATE_MASS_BOUNDS_G.adult.meal.max, 700);
  assertEquals(PLATE_MASS_BOUNDS_G.child.meal.max, 450);
  for (const gone of [
    "600 to 750 g",
    "about 200 to 250 g of cooked grains",
    "about 120 to 180 g of the protein food",
    "Breakfast is about two thirds",
  ]) {
    assert(!MEAL_SYSTEM_PROMPT.includes(gone), `la consigne concurrente reste: ${gone}`);
  }
});

Deno.test("⚠️ C5 — CE QUE LA PHRASE PORTAIT DE VRAI RESTE, EN PARTS D'ASSIETTE", () => {
  // Le défaut mesuré (C03, quatre bouches: 3 192 kcal/jour servis pour 8 571
  // demandés; « une paume de poulet sur un lit de courgettes ») est un défaut
  // de FORME. Une forme s'écrit en parts, qui ne peuvent contredire aucune
  // borne par bouche puisqu'elles ne fixent aucune masse.
  assert(MEAL_SYSTEM_PROMPT.includes("roughly a third of"));
  assert(MEAL_SYSTEM_PROMPT.includes("roughly a quarter is the"));
  assert(MEAL_SYSTEM_PROMPT.includes("vegetables ON TOP of it, never instead of it"));
  assert(MEAL_SYSTEM_PROMPT.includes("it does not vanish"));
  // ⛔ LA SEULE BORNE GÉNÉRIQUE QUI RESTE EST CELLE-LÀ, ET ELLE N'EST PAS
  // CHIFFRÉE: le lot devait garder « une seule » borne générique, et une borne
  // qui ne porte aucun nombre ne peut en contredire aucun.
  const from = MEAL_SYSTEM_PROMPT.indexOf("== A PORTION IS ONE PERSON'S PLATE ==");
  const to = MEAL_SYSTEM_PROMPT.indexOf("== THE STRETCH STARTS TODAY ==");
  assert(from >= 0 && to > from, "sections déplacées");
  // ⚠️ L'EXEMPLE D'ÉCHEC EST RETIRÉ AVANT DE CHERCHER, ET C'EST UNE DISTINCTION
  // DE FOND, PAS UN CONFORT DE TEST. « "2 salmon fillets, 500 g potatoes"
  // written for ONE person » CITE une quantité FAUSSE pour la montrer du doigt;
  // elle ne prescrit rien et ne peut contredire aucune borne par bouche. Ce
  // qu'on interdit, c'est un nombre que le modèle pourrait VISER.
  const section = MEAL_SYSTEM_PROMPT.slice(from, to)
    .replace('"2 salmon\nfillets, 500 g potatoes"', "<exemple d'échec cité>");
  const restants = section.match(/\d+\s*(?:g|kg|kcal)\b/gi);
  assertEquals(restants, null, `un poids générique subsiste: ${restants?.join(", ")}`);
  // ⚠️ ET LA CONTRE-ÉPREUVE DU RETRAIT LUI-MÊME: si l'exemple d'échec
  // disparaissait du prompt, ce `replace` ne retirerait plus rien et la garde
  // continuerait de passer sans rien garder. On vérifie donc qu'il a mordu.
  assert(
    section.includes("<exemple d'échec cité>"),
    "l'exemple d'échec a changé de forme: la garde ne retire plus ce qu'elle croit retirer",
  );
});

Deno.test("⛔ C5 — LA CONSIGNE QUI GOUVERNE EST NOMMÉE PAR SON EN-TÊTE, pas par « ci-dessous »", () => {
  // ⛔ UN RENVOI NE TRAVERSE PAS LA FRONTIÈRE SYSTÈME↔UTILISATEUR: ce dépôt a
  // mesuré 0 % de conformité quand une promesse était séparée de sa matière, et
  // le bloc de recette standard vit, lui, dans le message UTILISATEUR. On cite
  // donc son en-tête mot pour mot — le même geste que `precedence_tail.ts`.
  assert(MEAL_SYSTEM_PROMPT.includes("WRITE ONE STANDARD RECIPE PER DISH"));
  assert(STANDARD_RECIPE_BLOCK[0].includes("WRITE ONE STANDARD RECIPE PER DISH"));
  // Et la contradiction est levée dans le bon sens: c'est le bloc qui gagne.
  assert(MEAL_SYSTEM_PROMPT.includes("that block\nis the one that governs"));
});

// ---------------------------------------------------------------------------
// C6 — L'AUTOCONTRÔLE QUI DIT SON PRORATA
// ---------------------------------------------------------------------------

Deno.test("⛔ C6 — LE NOMBRE DE TIRAGES EST ÉCRIT, ET IL PORTE SON NOM DE CLÉ", () => {
  // ⛔ L'ÉTAPE 1 DISAIT « chaque ingrédient de chaque préparation » SANS DIRE
  // COMBIEN ON EN PREND. L'enquête du 2026-09-11 le nomme: la réparation cite
  // des quantités de casseroles ENTIÈRES sans afficher le nombre de tirages ni
  // la contribution de chaque composant. Un modèle qui additionne la casserole
  // entière calcule une densité de CASSEROLE et la déclare comme une densité
  // d'ASSIETTE.
  const bloc = STANDARD_RECIPE_BLOCK.join("\n");
  assert(bloc.includes('divide BOTH by that pot\'s "servings_made"'), "le diviseur est nommé");
  assert(bloc.includes("its cooked\n     grams and its kcal"), "les deux grandeurs sont dites");
  assert(bloc.includes("never the whole pot"), "l'échappatoire est nommée");
  assert(bloc.includes("nothing divides them"), "le frais du jour n'est pas divisé");
  // La formule reste, à la lettre: elle est épinglée ailleurs aussi.
  assert(bloc.includes("density = (total kcal) ÷ (total cooked grams) × 100."));
});

Deno.test("⛔ C6 — `density_check` EST DIT AU MODÈLE POUR CE QU'IL EST: UNE DÉCLARATION", () => {
  // Mesuré (enquête §3): 141 déclarés contre 105,4 pesés; 159 contre 92,2.
  // Taire que le nombre est une déclaration laisse croire que l'écrire suffit.
  const bloc = STANDARD_RECIPE_BLOCK.join("\n");
  assert(bloc.includes("what you DECLARE, not what you prove"));
  assert(bloc.includes("weighs the"), "on dit qui repèse");
  // ⚠️ LA GARDE DE FUITE TIENT TOUJOURS: aucun kcal qui ne soit une densité.
  assertEquals(bloc.match(/\d+\s*kcal(?!\s*per\s*100\s*g)/gi), null);
  assertEquals(bloc.match(/\bkg\b/gi), null);
});

// ---------------------------------------------------------------------------
// C7 — LES QUANTITÉS SONT PORTÉES PAR LES DONNÉES, PAS PAR LA PROSE
// ---------------------------------------------------------------------------

Deno.test("⛔ C7 — LA PROSE NOMME L'ALIMENT, ELLE NE RECOPIE PAS SON POIDS", () => {
  // ⛔ CE DÉPÔT A LA CICATRICE EXACTEMENT LÀ, DEUX FOIS.
  //   · `portion-note-contradicts-the-lid` (2026-08-20): la phrase de table
  //     disait « la boîte partagée avec iku » sous un couvercle qui ne portait
  //     qu'un nom. Les deux ne peuvent pas être vraies, et c'est la PROSE qu'on
  //     croit — elle est dans la langue de la personne.
  //   · `a-note-moves-the-words-not-the-grams` (2026-09-03): une note change ce
  //     que le modèle ÉCRIT, jamais les grammes. La prose et les nombres ne
  //     bougent pas ensemble.
  // Le lot D va AJUSTER les quantités après la réponse. Un nombre resté dans
  // une phrase n'est pas ajusté avec elles: il reste en arrière et contredit la
  // liste, sur la page que la personne cuisine.
  assert(MEAL_SYSTEM_PROMPT.includes("== THE METHOD NAMES THE FOOD, IT DOES NOT REPEAT ITS WEIGHT =="));
  assert(MEAL_SYSTEM_PROMPT.includes('The list of ingredients is the only place a quantity lives.'));
  assert(MEAL_SYSTEM_PROMPT.includes("run_through"), "le déroulé de session est visé lui aussi");
  // ⚠️ ET LA CONSIGNE DONNE UN EXEMPLE DE CHAQUE CÔTÉ: sans le cas qui PASSE,
  // « ne répète pas les quantités » se satisfait en ne nommant plus rien.
  assert(MEAL_SYSTEM_PROMPT.includes("brown the\nchicken, add the rice and the stock"));
  assert(MEAL_SYSTEM_PROMPT.includes('not "add the 180 g of rice"'));
});

// ---------------------------------------------------------------------------
// C3 — LE COULOIR D'UNE CASE, ET SES CONSOMMATEURS
// ---------------------------------------------------------------------------

function slot(over: Partial<SlotDensity> & { slot: string }): SlotDensity {
  return {
    // ⟳ 2026-09-11 · LOT B — `[]` = « cette ligne ne dit pas ses jours », donc
    // elle vaut pour tous. C'est le comportement d'avant ce lot, et c'est ce
    // que `cellDensityOf` doit continuer de rendre à un décor sans calendrier.
    days: [],
    kcalPer100G: over.minPer100G ?? 100,
    minPer100G: 100,
    maxPer100G: 160,
    preferredPer100G: 110,
    neededMinPer100G: 100,
    redundantMin: false,
    occurrences: 1,
    incompatible: null,
    light: false,
    // ⟳ 2026-09-11 — LE TÉMOIN `100 × E / Gpréf` (arbitrage A15). Ce décor
    // n'en a pas besoin: `null` dit « pas de témoin », et le rédacteur ne
    // nomme alors qu'un seul nombre — ce qui est le cas nominal d'avant.
    targetAnchoredPer100G: null,
    ...over,
  };
}

Deno.test("⛔ C3 — LE COULOIR D'UNE CASSEROLE PARTAGÉE EST L'INTERSECTION, PAS LA MOYENNE", () => {
  // ⛔ MESURÉ AU TIR DENSITE (2026-09-08): les quatre cartes demandaient 105,
  // 122, 139 et 167 kcal/100 g au déjeuner, et le modèle a écrit 136 — la
  // moyenne. Une personne s'est retrouvée avec 724 g dans l'assiette. La
  // méthode lui demandait de faire cette intersection à la main, sur quatre
  // cartes: un calcul déterministe délégué au modèle se paie deux fois, en
  // jetons et en erreurs.
  const cell = cellDensityOf([
    { name: "Paul", slots: [slot({ slot: "lunch", minPer100G: 105, maxPer100G: 180, preferredPer100G: 115 })] },
    { name: "Léa", slots: [slot({ slot: "lunch", minPer100G: 167, maxPer100G: 200, preferredPer100G: 175 })] },
  ], "lunch", "mon")!;
  assertEquals(cell.minPer100G, 167, "le plancher est le PLUS HAUT des deux");
  assertEquals(cell.maxPer100G, 180, "le plafond est le PLUS BAS des deux");
  assertEquals(cell.aimPer100G, 175);
  assertEquals(cell.empty, false);
  assertEquals(cell.floorFrom, "Léa");
  assertEquals(cell.eatersWithCorridor, 2);
  assertEquals(cellDensitySentence(cell), " Shared dish 167-180, aim 175.");
});

Deno.test("⛔ C3 — UNE INTERSECTION VIDE EST DITE, ET ELLE NOMME LES DEUX PERSONNES", () => {
  // ⛔ « Conserver explicitement les conflits quand l'intersection est vide »
  // est la demande du chantier, et c'est la règle qu'`empty_intersection`
  // applique déjà entre deux JOURS d'un même moment. Une bande intenable
  // présentée comme tenable apprend au modèle que ces nombres-là sont
  // décoratifs — mesuré: 389 demandés au dîner, 126,7 rendus.
  const cell = cellDensityOf([
    { name: "Paul", slots: [slot({ slot: "dinner", minPer100G: 141, maxPer100G: 200 })] },
    { name: "Tom", slots: [slot({ slot: "dinner", minPer100G: 60, maxPer100G: 120 })] },
  ], "dinner", "mon")!;
  assertEquals(cell.empty, true);
  assertEquals(cell.aimPer100G, 141, "on vise le plancher le plus haut, pas un milieu inventé");
  const phrase = cellDensitySentence(cell);
  assert(phrase.includes("Paul needs at least 141"), phrase);
  assert(phrase.includes("Tom at most 120"), phrase);
  assert(phrase.includes("cook the other one apart"), phrase);
});

Deno.test("⛔ C3 — QUI A SON PROPRE PLAT NE RESSERRE PAS LA CASSEROLE COMMUNE", () => {
  // C'est tout l'intérêt d'un plat dédié: la casserole commune n'a plus à
  // servir cette bouche. La garder dans l'intersection resserrerait la bande au
  // nom de quelqu'un qui n'y puise pas — exactement le conflit que le plat
  // dédié existe pour dénouer. (Le retrait est fait par l'appelant, qui connaît
  // `cell.dedicated`; ce cas fixe le contrat de la fonction.)
  const avec = cellDensityOf([
    { name: "Paul", slots: [slot({ slot: "dinner", minPer100G: 100, maxPer100G: 200 })] },
    { name: "Tom", slots: [slot({ slot: "dinner", minPer100G: 60, maxPer100G: 110 })] },
  ], "dinner", "mon")!;
  const sans = cellDensityOf([
    { name: "Paul", slots: [slot({ slot: "dinner", minPer100G: 100, maxPer100G: 200 })] },
  ], "dinner", "mon")!;
  assertEquals(avec.maxPer100G, 110);
  assertEquals(sans.maxPer100G, 200);
});

Deno.test("aucun mangeur avec couloir ⇒ AUCUNE phrase, jamais un nombre inventé", () => {
  assertEquals(cellDensityOf([{ name: "Paul", slots: [] }], "dinner", "mon"), null);
  assertEquals(cellDensityOf([], "dinner", "mon"), null);
  // Un mangeur dont le couloir porte sur un AUTRE moment ne compte pas non plus.
  assertEquals(
    cellDensityOf([{ name: "Paul", slots: [slot({ slot: "lunch" })] }], "dinner", "mon"),
    null,
  );
});

// ---------------------------------------------------------------------------
// C4 — LES DEUX NOMBRES, QUAND ILS DIVERGENT
// ---------------------------------------------------------------------------

Deno.test("⛔ C4 — LA CONSIGNE NOMME LES DEUX NOMBRES QUAND ILS DIVERGENT", () => {
  // ⛔ LE CHANTIER DEMANDAIT `Dpréf = 100 × cible / grammage préféré`. Ce dépôt
  // a tranché l'INVERSE avec des mesures, sous le nom A15: cette formule rend
  // 236 kcal/100 g sur un déjeuner de 1 120 kcal, quand les plats réels vivent
  // entre 113 et 156 — et on a mesuré 389 demandés au dîner, 126,7 rendus.
  //
  // ⛔ CE QU'ON RETIENT DE LA DEMANDE, C'EST LE MOT « SILENCIEUSEMENT ». La
  // visée ne vient pas de la cible; la présenter seule la fait lire comme si
  // elle en venait. Quand les deux divergent, la ligne dit LES DEUX.
  const avec: SlotDensityWithAnchor[] = [
    { ...slot({ slot: "lunch", minPer100G: 123, maxPer100G: 160, preferredPer100G: 135 }), targetAnchoredPer100G: 236 },
  ];
  const ligne = densityFragment(avec);
  assert(ligne.includes("aim 135, not 236"), ligne);
  assert(ligne.includes("over an average plate"), ligne);
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 (fin de chantier) — L'EXPLICATION A QUITTÉ LE MOMENT
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ MESURÉ EN BRANCHANT LE TÉMOIN DU LOT B. L'écart entre la visée et
  // `100 × E / Gpréf` vaut à peu près `(Gmax / Gpréf) / 1,10`, donc ~1,34
  // PARTOUT: la clause est sortie sur **4 moments sur 4** au premier tir
  // branché. L'explication, identique, se répétait 4 fois dans une phrase — 16
  // fois sur une table de quatre bouches.
  //
  // La donnée (`not 236`) reste sur son moment; l'explication se dit **une
  // seule fois**, en queue de phrase. C'est l'objection déjà retenue au lot 4
  // pour la borne basse redondante: un brief qui répète cesse d'être lu.
  const deux: SlotDensityWithAnchor[] = [
    { ...slot({ slot: "lunch", minPer100G: 123, maxPer100G: 160, preferredPer100G: 135 }), targetAnchoredPer100G: 236 },
    { ...slot({ slot: "dinner", minPer100G: 130, maxPer100G: 170, preferredPer100G: 140 }), targetAnchoredPer100G: 240 },
  ];
  const deuxLigne = densityFragment(deux);
  assert(deuxLigne.includes("aim 135, not 236"), deuxLigne);
  assert(deuxLigne.includes("aim 140, not 240"), deuxLigne);
  assertEquals(
    (deuxLigne.match(/over an average plate/g) ?? []).length,
    1,
    `l'explication doit se dire UNE fois, pas une par moment: ${deuxLigne}`,
  );
  // ⚠️ ET LA CONTRE-ÉPREUVE: sous le seuil, rien ne s'ajoute — ni le nombre, ni
  // l'explication. Une clause servie à chaque moment de chaque carte coûterait
  // douze fois sur une table de quatre, pour une distinction que personne ne
  // peut agir.
  const proche: SlotDensityWithAnchor[] = [
    { ...slot({ slot: "lunch", minPer100G: 123, maxPer100G: 160, preferredPer100G: 135 }), targetAnchoredPer100G: 140 },
  ];
  assert(!densityFragment(proche).includes("not "), densityFragment(proche));
  assert(
    !densityFragment(proche).includes("over an average plate"),
    "sans divergence, l'explication n'a pas d'objet",
  );
  assert(140 / 135 < ANCHOR_DIVERGENCE_RATIO, "le cas proche doit être SOUS le seuil");
});

Deno.test("⚠️ C4 — SANS LE CHAMP DU LOT B, ON S'ABSTIENT — jamais un nombre supposé", () => {
  // `targetAnchoredPer100G` est ajouté à `SlotDensity` par le lot B. Tant qu'il
  // n'est pas là, `undefined` se lit « ce couloir ne dit rien de sa cible » et
  // la ligne est celle d'avant, au caractère près. Aucun `as` sur le type du
  // voisin: un `as` rendrait `undefined` indiscernable d'un nombre.
  const nu = [slot({ slot: "lunch", minPer100G: 123, maxPer100G: 160, preferredPer100G: 135 })];
  assertEquals(densityFragment(nu), " — dishes served here: 123 to 160 kcal per 100 g at lunch (aim 135)");
  // Et `null` explicite se comporte pareil.
  const nul: SlotDensityWithAnchor[] = [{ ...nu[0], targetAnchoredPer100G: null }];
  assertEquals(densityFragment(nul), densityFragment(nu));
});

Deno.test("⚠️ C4 — L'UNITÉ RESTE SUR LE PREMIER MOMENT SEULEMENT", () => {
  // ⚠️ CE N'EST PAS UN BUG, ET ÇA A DÉJÀ FAIT CONCLURE À TORT « une seule
  // consigne de densité sur trois créneaux ». `one(d, i === 0)`: « at least 182
  // kcal per 100 g at lunch, 159 at dinner » se lit d'un trait; répéter l'unité
  // quatre fois fait une ligne qu'on saute. La propriété est tenue ici pour que
  // personne ne la « répare ».
  const trois = [
    slot({ slot: "breakfast", minPer100G: 100, maxPer100G: 130, preferredPer100G: 110 }),
    slot({ slot: "lunch", minPer100G: 123, maxPer100G: 160, preferredPer100G: 135 }),
    slot({ slot: "dinner", minPer100G: 130, maxPer100G: 170, preferredPer100G: 140 }),
  ];
  const ligne = densityFragment(trois);
  assertEquals((ligne.match(/kcal per 100 g/g) ?? []).length, 1);
  assert(ligne.includes("at breakfast"));
  assert(ligne.includes("at lunch"));
  assert(ligne.includes("at dinner"));
});

// ---------------------------------------------------------------------------
// C3 — LE CÂBLAGE: le couloir de case atteint VRAIMENT le brief
// ---------------------------------------------------------------------------
//
// ⛔ UN MODULE TESTÉ MAIS NON APPELÉ NE CLÔT PAS UN LOT (chantier §5). Les cas
// ci-dessus prouvent l'arithmétique; celui-ci prouve qu'elle sort dans le
// message servi au modèle, et il rougirait si quelqu'un débranchait l'argument.

Deno.test("⛔ C3 CÂBLAGE — la ligne de case porte la bande commune, dans le calendrier", () => {
  const julie = {
    memberId: "m-a",
    displayName: "Julie",
    goal: null,
    ageState: "adult",
    body: null,
    lightSlots: [],
    eatingSlots: null,
    habits: [],
    habitNote: null,
    requiredDensity: null,
  };
  const marc = { ...julie, memberId: "m-b", displayName: "Marc" };
  const densityFor = (min: number, max: number, aim: number): RequiredDensity => ({
    named: [slot({ slot: "dinner", minPer100G: min, maxPer100G: max, preferredPer100G: aim })],
    floorOnly: [],
    reason: "measured",
    gapClosed: "none",
    // deno-lint-ignore no-explicit-any
  } as any);

  const { userSuffix } = buildHouseholdPromptBlocksV34({
    sizingPath: "portion_v1",
    // deno-lint-ignore no-explicit-any
    members: [julie, marc] as any,
    cells: [
      // deno-lint-ignore no-explicit-any
      { day: "mon", slot: "dinner", eaters: ["m-a", "m-b"], dedicated: [], character: null, empty: false } as any,
    ],
    cardFacts: {
      "m-a": { diet: null, requiredDensity: densityFor(105, 180, 115) },
      "m-b": { diet: null, requiredDensity: densityFor(167, 200, 175) },
    },
    ruleHolders: [],
    traditions: [],
    daysInWindow: ["mon"],
    envyLine: null,
    restrictions: [],
    // deno-lint-ignore no-explicit-any
    presence: { byMember: new Map(), windowDays: ["mon"] } as any,
    merge: null,
    unmerge: null,
    cooking: "one_dish",
    divergingCount: 0,
    weightGroups: 1,
    dishBearers: [],
    dedicatedDishesAsked: 0,
    medicalMouths: [],
    crossContactUnnamedMedical: 0,
    kitchenEquipment: null,
    dietBlock: "",
    notes: [],
    voices: [],
    // deno-lint-ignore no-explicit-any
  } as any);

  assert(
    userSuffix.includes("Shared dish 167-180, aim 175."),
    `la bande commune n'atteint pas le calendrier:\n${userSuffix.slice(0, 2000)}`,
  );
  // ⚠️ L'UNITÉ EST DITE UNE FOIS, EN TÊTE DU CALENDRIER, PAS SUR CHAQUE CASE.
  // Vingt et une cases × « kcal per 100 g » feraient une ligne qu'on saute.
  assert(userSuffix.includes("they are kcal per 100 g of that dish as"));
  // ⛔ ET LA GARDE DU BRIEF TIENT: aucun kcal qui ne soit une densité.
  assertEquals(userSuffix.match(/\d+\s*kcal(?!\s*per\s*100\s*g)/g), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · LOT B — UNE CASE PREND LE COULOIR DE SA DATE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — `cellDensityOf` prend le couloir du JOUR de la case", () => {
  // ⛔ LE DÉFAUT QUE CECI FERME. Depuis le lot B, un moment peut porter DEUX
  // couloirs — un par grappe de jours compatibles. `e.slots.find(d => d.slot
  // === slot)` rendait « le premier dîner trouvé », c'est-à-dire servait au
  // dimanche la bande du vendredi. C'est le défaut du lot B reproduit par son
  // propre lecteur.
  const paul = {
    name: "Paul",
    slots: [
      slot({ slot: "dinner", days: ["fri"], minPer100G: 250, maxPer100G: 250 }),
      slot({ slot: "dinner", days: ["sat", "sun"], minPer100G: 123, maxPer100G: 250 }),
    ],
  };
  // ── LE CAS QUI MORD ──────────────────────────────────────────────────
  const dimanche = cellDensityOf([paul], "dinner", "sun")!;
  assertEquals(dimanche.minPer100G, 123, "le dimanche a reçu la bande du vendredi");
  // ── LE CAS QUI PASSE ─────────────────────────────────────────────────
  const vendredi = cellDensityOf([paul], "dinner", "fri")!;
  assertEquals(vendredi.minPer100G, 250);
  // ⚠️ ET UN JOUR QUE PERSONNE NE PORTE NE RÉCUPÈRE PAS UNE BANDE VOISINE.
  assertEquals(cellDensityOf([paul], "dinner", "wed"), null);
});
