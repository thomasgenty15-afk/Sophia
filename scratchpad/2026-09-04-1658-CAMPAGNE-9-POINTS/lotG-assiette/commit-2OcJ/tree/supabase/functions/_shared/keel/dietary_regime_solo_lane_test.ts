import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";

import { buildMealPrompt, MEAL_SYSTEM_PROMPT } from "./meal_generation.ts";
import { buildWeekPlanPrompt } from "./week_plan_generation.ts";
import { UNKNOWN_BODY } from "./student_body.ts";
import {
  dietaryRegimePromptLine,
  excludedSurfaceFormsFor,
  scanDietaryRegime,
} from "./dietary_regime.ts";
import { findForbiddenMatches } from "./forbidden_matcher.ts";

/**
 * FF-042 — LE RÉGIME SUR LA LANE INDIVIDUELLE.
 *
 * ── LE DÉFAUT QUE CES TESTS ÉPINGLENT, mesuré le 2026-08-18 ────────────────
 *
 *     grep -c "regime" supabase/functions/_shared/keel/meal_generation.ts → 0
 *
 * `dietary_regime.ts` existait, complet et testé, depuis FF-042. La lane FOYER
 * le lisait (`household_diet.ts`). La lane INDIVIDUELLE n'en importait que
 * `uncoverableSentinelsFor` — le drapeau de carence. On disait donc à un végane
 * qu'il lui manquerait de la B12, dans un plan qui lui servait du poulet.
 *
 * ⚠️ ET LA RACINE ÉTAIT UNE POSITION, PAS UN OUBLI D'APPEL. `declaredRegime`
 * était calculé ~300 lignes SOUS `buildMealPrompt`. Même en le voulant, la
 * consigne ne pouvait pas partir: à l'endroit où on lisait le régime, le prompt
 * était déjà construit. C'est pour ça que le test §3 mesure un ORDRE de
 * caractères dans la source, et pas seulement une présence — une présence
 * resterait verte si quelqu'un redescendait la lecture demain.
 *
 * Fichier séparé de `dietary_regime_test.ts` (moteur pur) exprès: celui-ci
 * teste le CÂBLAGE des deux lanes, pas les jetons.
 */

const PROMPT_BASE = {
  firstDayCookable: true,
  hasFreezer: false,
  oneCookingSession: false,
  cookOnlyDay: null,
  soloBoxes: false,
  contentLocale: "en-US",
  budgetAmount: null,
  dietBlock: "",
  doctrineBlock: "== MARC'S METHOD ==",
  coachNoteBlock: null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  boxMemberIds: [],
  weighedMemberIds: [],
  kitchenEquipment: null,
  boxMemberDiets: [],
  boxMemberExclusions: [],
  protocolBlock: "",
  beliefKeys: [],
  goal: "health" as const,
  situation: null,
  context: null,
  mode: "to_shop" as const,
  scope: "day" as const,
  slot: null,
  servings: 1,
  pantry: [],
  safetyConstraints: null,
  safetyConstraintTable: null,
  body: null,
  focusAxis: null,
};

// ---------------------------------------------------------------------------
// 1. LA CONSIGNE ENTRE DANS LE PROMPT — ET AU-DESSUS DE LA DOCTRINE
// ---------------------------------------------------------------------------

Deno.test("FF-042 — la consigne de régime atteint le message du modèle", () => {
  const { userMessage } = buildMealPrompt({
    ...PROMPT_BASE,
    dietBlock: dietaryRegimePromptLine("vegan"),
  });
  assertStringIncludes(userMessage, "This student is VEGAN");
  // La phrase VIENT du moteur, elle n'est pas réécrite dans le constructeur:
  // une seconde formulation divergerait le jour où un 4e régime arrive.
  assertStringIncludes(userMessage, dietaryRegimePromptLine("vegan"));
});

Deno.test("FF-042 — le régime passe AVANT la doctrine du coach", () => {
  const { userMessage } = buildMealPrompt({
    ...PROMPT_BASE,
    dietBlock: dietaryRegimePromptLine("vegetarian"),
  });
  const diet = userMessage.indexOf("This student is VEGETARIAN");
  const doctrine = userMessage.indexOf("== MARC'S METHOD ==");
  assert(diet >= 0 && doctrine >= 0, "test à réviser: les deux blocs ont bougé");
  // Un coach dont la méthode construit sur le poulet ne l'a pas écrite pour un
  // végétarien. Et le budget de prompt tronque par la queue.
  assert(
    diet < doctrine,
    "le régime doit gagner sur la doctrine, comme l'allergène",
  );
});

Deno.test("FF-042 — sans régime déclaré, le prompt est INCHANGÉ", () => {
  // La garde d'absence de régression: un bloc vide ne doit pas laisser une
  // ligne, un en-tête ni même un saut de ligne. Un bloc vide dans un prompt est
  // du bruit qui coûte du cache.
  const withEmpty = buildMealPrompt({ ...PROMPT_BASE, dietBlock: "" }).userMessage;
  const withBlank = buildMealPrompt({ ...PROMPT_BASE, dietBlock: "   \n " })
    .userMessage;
  assertEquals(withEmpty, withBlank);
  assert(!withEmpty.includes("VEGAN"));
});

// ---------------------------------------------------------------------------
// 2. LA CEINTURE AVAL MESURE L'EXPANSION, JAMAIS LE JETON
// ---------------------------------------------------------------------------

/** Les aiguilles telles que la lane solo les construit. */
const veganTerms = () =>
  excludedSurfaceFormsFor("vegan").map((form) => ({
    ruleId: "diet:vegan",
    token: form,
  }));

Deno.test("FF-042 — un plat végane qui porte des lardons est vu", () => {
  const hits = findForbiddenMatches(
    "Risotto crémeux · réconfortant · lardons fumés, parmesan",
    veganTerms(),
  );
  assert(hits.length > 0, "la ceinture doit mordre sur l'expansion française");
});

Deno.test("FF-042 — la ceinture ne s'arme JAMAIS sur le nom du régime", () => {
  // La cicatrice: `allergen_ref='diabetes'` a fait remplacer un message
  // d'urgence par un refus poli, en run réel, le 2026-08-06. Armer sur
  // « vegan » ferait rejeter précisément les bonnes réponses — et seulement
  // pour les véganes.
  const hits = findForbiddenMatches(
    "A hearty vegan chili, entirely plant-based.",
    veganTerms(),
  );
  assertEquals(hits, [], `« vegan » ne doit pas mordre: ${JSON.stringify(hits)}`);
});

Deno.test("FF-042 — une mention niée ne compte pas", () => {
  // Même politique de négation que le prompt, qui AUTORISE explicitement de
  // nommer un aliment pour l'écarter. Les deux moitiés du verrou doivent avoir
  // la même, sinon le prompt produit un texte que la ceinture rejette.
  for (
    const text of [
      "Gratin de courge, sans lardons.",
      "Bacon-free gratin, entirely plant-based.",
    ]
  ) {
    assertEquals(
      findForbiddenMatches(text, veganTerms()),
      [],
      `une négation ne doit pas mordre: ${text}`,
    );
  }
});

Deno.test("FF-042 — LIMITE MESURÉE: « sans A ni B » ne désarme que A", () => {
  // ⚠️ CE TEST ÉPINGLE UN DÉFAUT, IL NE LE BÉNIT PAS.
  //
  // `NEGATION_BEFORE` est ancré (`$`): la négation doit toucher le terme. Dans
  // « sans lardons ni crème », « crème » est précédé de « ni », qui n'est pas
  // dans `NEGATION_WORD` — alors qu'en français « ni » n'existe QUE dans une
  // construction négative. La seconde moitié d'une énumération niée mord donc.
  //
  // Conséquence ici: un FAUX POSITIF, qui gonfle le compteur
  // `dietary_regime_breach` — c'est-à-dire qui abîme la mesure même pour
  // laquelle ce compteur existe.
  //
  // ⛔ NON CORRIGÉ DANS CE LOT, ET C'EST DÉLIBÉRÉ: `forbidden_matcher.ts` arme
  // aussi la ceinture ALLERGÈNE, qui elle REJETTE. Y ajouter « ni » élargit une
  // permission sur un chemin de sécurité, et ça se décide avec sa propre
  // preuve, pas en passant. La même phrase française chez un élève allergique
  // (« sans arachides ni sésame ») rend probablement le plan `unclean`
  // aujourd'hui — à vérifier séparément.
  const hits = findForbiddenMatches(
    "Gratin de courge, sans lardons ni crème.",
    veganTerms(),
  );
  assertEquals(
    hits.map((h) => h.token),
    ["creme"],
    "le jour où « ni » est traité, ce test doit rougir et être retiré",
  );
});

// ---------------------------------------------------------------------------
// 2bis. AGENT 2V — LE COMPTEUR QUI ACCUSAIT UN PLAN VÉGANE CORRECT
// ---------------------------------------------------------------------------
//
// Mesuré sur la lane solo: chez une végane, `dietary_regime_breach` mordait sur
// `yoghurt` dans « Soy yoghurt », `milk` dans « oat milk » et « coconut milk »,
// `butter` dans « peanut butter ». Le garde-manger végane courant.
//
// ⚠️ NI LE MOTEUR NI LA LISTE N'ÉTAIENT EN CAUSE — et c'est le point à retenir.
// `findForbiddenMatches` a des frontières de mot correctes (`yoghurt` EST un
// mot entier de « Soy yoghurt »: ce n'est pas « laitue ≠ lait »), et `milk`
// DOIT rester dans les formes exclues sinon un vrai laitage passe. Ce qui
// manquait était le LECTEUR de `isPlantAnalogue` — liste fermée, écrite à la
// main le 2026-08-11 pour ce défaut exact, et sans aucun appelant en
// production.

Deno.test("2V — les cinq faux positifs mesurés chez la végane sont à zéro", () => {
  // Les chaînes viennent du rapport de 2V, telles quelles.
  const cases: Array<[string[], string[]]> = [
    // [prose, termes]
    [["Soy yoghurt, gluten-free oats, cocoa and pumpkin seeds"], []],
    [[], ["plain unsweetened soy yoghurt"]],
    [[], ["oat milk"]],
    [[], ["coconut milk"]],
    [[], ["peanut butter"]],
  ];
  for (const [prose, terms] of cases) {
    const scan = scanDietaryRegime("vegan", { prose, terms });
    assertEquals(
      scan.breaches,
      [],
      `faux positif restant: ${JSON.stringify([...prose, ...terms])} → ${
        JSON.stringify(scan.breaches)
      }`,
    );
    // LA CONTRE-ÉPREUVE DU SILENCE: chaque cas doit avoir été DÉSAMORCÉ, pas
    // simplement jamais vu. Sans cette assertion, un lot qui casserait les
    // aiguilles passerait ce test en vert.
    assert(
      scan.silencedByPlantAnalogue.length > 0,
      `rien n'a été désamorcé — la garde ne mordait donc pas: ${
        JSON.stringify([...prose, ...terms])
      }`,
    );
  }
});

Deno.test("2V — le désamorçage ne blanchit QUE la morsure, jamais la phrase", () => {
  // LE PIÈGE DE LA CORRECTION, et il est pire que le défaut: blanchir la
  // chaîne entière parce qu'elle nomme un analogue quelque part avalerait un
  // vrai manquement au nom d'un faux positif.
  const scan = scanDietaryRegime("vegan", {
    prose: ["Soy yoghurt bowl with chicken stock"],
    terms: [],
  });
  assertEquals(
    scan.breaches.map((b) => b.token),
    ["chicken stock"],
    JSON.stringify(scan),
  );
  assertEquals(scan.silencedByPlantAnalogue.map((b) => b.token), ["yoghurt"]);
});

Deno.test("2V — un vrai laitage mord toujours, dans les deux langues", () => {
  // La contre-épreuve qui rend le lot falsifiable: si le désamorçage était
  // trop large, ces lignes sortiraient vides et la garde serait morte.
  for (
    const [prose, terms] of [
      [["Risotto crémeux"], ["lardons fumés", "parmesan"]],
      [["Honey and greek yogurt pot"], ["honey", "greek yogurt"]],
      [["Gratin dauphinois"], ["crème fraîche", "beurre"]],
    ] as Array<[string[], string[]]>
  ) {
    const scan = scanDietaryRegime("vegan", { prose, terms });
    assert(
      scan.breaches.length > 0,
      `la garde doit mordre: ${JSON.stringify([...prose, ...terms])}`,
    );
  }
});

Deno.test("2V — un marqueur SANS AMBIGUÏTÉ vaut pour un ingrédient, pas pour une prose", () => {
  // L'asymétrie est écrite et voulue. `isPlantAnalogue(term)` a pour contrat
  // UN aliment: « vegan sausage » est végétal en entier. Sur de la PROSE, le
  // même raisonnement blanchirait la phrase autour du marqueur — c'est le
  // défaut du test précédent, en plus large.
  const asTerm = scanDietaryRegime("vegan", { terms: ["vegan sausage"] });
  assertEquals(asTerm.breaches, [], JSON.stringify(asTerm));

  // ⚠️ CE TEST ÉPINGLE UNE LIMITE, IL NE LA BÉNIT PAS. Le même mot dans un
  // TITRE mord encore, et c'est un faux positif résiduel connu, laissé à un
  // humain (voir le rapport du lot). Le jour où il est traité, cette moitié
  // doit rougir et être réécrite.
  const asProse = scanDietaryRegime("vegan", {
    prose: ["Vegan sausage and bean stew"],
  });
  assertEquals(asProse.breaches.map((b) => b.token), ["sausage"]);
});

Deno.test("2V — la prose FRANÇAISE est couverte, apostrophe comprise", () => {
  // `content_locale` vaut `fr-FR` par défaut sur ce produit. Le lecteur de
  // prose travaille sur les OFFSETS, donc via `tokenPattern`, qui ne franchit
  // pas une apostrophe: sans les orthographes apostrophées dans la liste
  // fermée, « lait » mordait à l'intérieur de « lait d'avoine ».
  const scan = scanDietaryRegime("vegan", {
    prose: ["Porridge au lait d'avoine et purée d'amande"],
    terms: ["lait d'avoine"],
  });
  assertEquals(scan.breaches, [], JSON.stringify(scan));
  assert(scan.silencedByPlantAnalogue.length > 0);
});

Deno.test("2V — la lane solo APPELLE le lecteur, et n'a plus de haystack à plat", async () => {
  // Patron du dépôt: quand la garantie est « cet appelant appelle bien ça »,
  // c'est la SOURCE qui répond. Sans ce test, le moteur pourrait être parfait
  // et le compteur continuer d'appeler l'ancien chemin — c'est exactement
  // l'état dans lequel `isPlantAnalogue` a vécu.
  const src = await Deno.readTextFile(
    new URL("../../generate-meal-v1/index.ts", import.meta.url),
  );
  assertStringIncludes(src, "scanDietaryRegime(declaredRegime, {");
  // Le quatrième nombre: un désamorçage qui blanchirait tout afficherait
  // `breaches: 0`, soit l'image d'un régime parfaitement tenu.
  assertStringIncludes(src, "analogues_silenced: silenced");
  // Et l'ancien chemin est PARTI, pas seulement contourné. Le commentaire qui
  // nomme la fonction reste — d'où la recherche de l'APPEL, parenthèse
  // comprise (« un grep naïf compte un commentaire comme un appelant »).
  assertEquals(
    src.split("findForbiddenMatches(haystack").length - 1,
    0,
    "le haystack concaténé du compteur de régime doit avoir disparu",
  );
});

Deno.test("FF-042 — le pescétarien laisse passer le poisson, pas le poulet", () => {
  const terms = excludedSurfaceFormsFor("pescatarian").map((form) => ({
    ruleId: "diet:pescatarian",
    token: form,
  }));
  assertEquals(
    findForbiddenMatches("Pavé de saumon, riz vinaigré", terms),
    [],
    "le poisson est autorisé pour un pescétarien",
  );
  assert(
    findForbiddenMatches("Blanc de poulet rôti", terms).length > 0,
    "la volaille reste exclue",
  );
});

// ---------------------------------------------------------------------------
// 3. LE CÂBLAGE DES DEUX LANES — LU DANS LA SOURCE
// ---------------------------------------------------------------------------
//
// Patron du dépôt (`household_hand_test.ts`): quand la garantie est « cet
// appelant appelle bien ça, et dans cet ordre », c'est la SOURCE qui répond.
// Un test qui rejouerait la fonction edge entière demanderait une base.

const soloSource = () =>
  Deno.readTextFile(new URL("../../generate-meal-v1/index.ts", import.meta.url));
const householdSource = () =>
  Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );

Deno.test("FF-042 — la lane solo passe la consigne, depuis le moteur", async () => {
  const src = await soloSource();
  assertStringIncludes(
    src,
    "dietBlock: declaredRegime ? dietaryRegimePromptLine(declaredRegime) : \"\"",
  );
});

Deno.test("FF-042 — le régime est lu AVANT que le prompt soit construit", async () => {
  const src = await soloSource();
  const read = src.indexOf("const declaredRegime");
  const built = src.indexOf("buildMealPrompt({");
  assert(read >= 0 && built >= 0, "test à réviser: les deux sites ont bougé");
  // ⚠️ C'EST LE TEST QUI TIENT LE LOT. Redescendre la lecture sous la
  // construction rend le câblage inopérant SANS casser aucun autre test: la
  // consigne partirait vide, le plan sortirait, et rien ne rougirait.
  assert(
    read < built,
    "`declaredRegime` doit être hissé au-dessus de `buildMealPrompt`",
  );
  // Et une seule lecture: deux `const declaredRegime` signifieraient deux
  // sources de vérité, dont celle qu'on regarde le moins garde l'ancien état.
  assertEquals(
    src.split("const declaredRegime").length - 1,
    1,
    "une seule lecture du régime",
  );
});

// ---------------------------------------------------------------------------
// 4. LA LANE SEMAINE — ajoutée le 2026-08-18 (QA 01-injection)
// ---------------------------------------------------------------------------
//
// FF-042 avait fermé le trou sur la lane REPAS et `household_diet.ts` sur la
// lane FOYER. La lane SEMAINE ne l'a jamais eu: `buildWeekPlanPrompt` n'avait
// aucun paramètre de régime, et `grep -c "diet"` sur
// `generate-week-plan-v1/index.ts` rendait ZÉRO. Un pescatarien recevait une
// semaine écrite comme s'il mangeait de tout.

Deno.test("la consigne de régime entre dans le message de SEMAINE", () => {
  const base = {
    contentLocale: "en-US",
    principles: [],
    situation: {
      goal: "fat_loss" as const,
      situation: null,
      context: null,
      aspiration: null,
      focusAxis: null,
      practicalConstraints: {},
      body: UNKNOWN_BODY,
    },
    doctrineBlock: "== MARC'S METHOD ==",
    weekStart: "2026-08-17",
    safetyConstraints: null,
    safetyConstraintTable: null,
    coachNoteBlock: null,
    hungerSignalBlock: null,
  };
  const withDiet = buildWeekPlanPrompt({
    ...base,
    dietBlock: dietaryRegimePromptLine("pescatarian"),
  }).userMessage;
  assertStringIncludes(withDiet, "This student is PESCATARIAN");
  // La phrase VIENT du moteur, elle n'est pas réécrite dans le constructeur.
  assertStringIncludes(withDiet, dietaryRegimePromptLine("pescatarian"));
  // ET AVANT LA DOCTRINE: un coach dont la méthode construit sur le poulet ne
  // l'a pas écrite pour un végane.
  assert(
    withDiet.indexOf("This student is PESCATARIAN") <
      withDiet.indexOf("== MARC'S METHOD =="),
  );
  // Sans régime, le message est celui d'avant, au caractère près.
  assertEquals(
    buildWeekPlanPrompt({ ...base, dietBlock: "   " }).userMessage,
    buildWeekPlanPrompt({ ...base, dietBlock: "" }).userMessage,
  );
});

// ⚠️ LE TEST DE CÂBLAGE DE CETTE LANE EST PARTI AVEC ELLE, LE 2026-08-19.
// Il y avait ici « la lane semaine PASSE la consigne, depuis le moteur »: il
// lisait `generate-week-plan-v1/index.ts` et exigeait que `dietBlock` y soit
// rempli avec `declaredRegime` hissé au-dessus du prompt. La fonction edge a
// été retirée — elle n'avait aucun appelant vivant — donc il n'y a plus de
// câblage à garder.
//
// LE TEST DE MOTEUR CI-DESSUS RESTE, ET C'EST VOULU: `buildWeekPlanPrompt`
// vit dans `week_plan_generation.ts`, qui est TOUJOURS chargé (la lane repas
// lui prend `findNumericTarget`, `STUDENT_GOALS`, `focusFor`, `StudentGoal`).
// Le jour où quelqu'un rebranche un écrivain de semaine, le paramètre de
// régime est déjà là, déjà prouvé — c'est le câblage seul qui manquera.

Deno.test("FF-042 — la lane foyer ne double PAS la phrase de régime", async () => {
  const src = await householdSource();
  // Elle a déjà `householdDietBlock`, qui écrit la ligne du plus strict de la
  // table PUIS nomme qui diverge. Remplir `dietBlock` ici mettrait deux
  // consignes de régime dans le même prompt — et, l'union des membres n'étant
  // pas ordonnée par sévérité, potentiellement la moins stricte en premier.
  assertStringIncludes(src, 'dietBlock: ""');
  assertStringIncludes(src, "dietBlock: householdDietBlock({");
});

// ═══════════════════════════════════════════════════════════════════════════
// v16 (2026-08-19) — LA BYTE-IDENTITÉ DE LA POPULATION NON CONCERNÉE
// ═══════════════════════════════════════════════════════════════════════════
//
// `MEAL_PROMPT_VERSION` passe à v16 parce que le bloc de régime porte
// désormais la demande de GROUPE ALIMENTAIRE. La règle de versionnement de ce
// dépôt est « quelle population voit une consigne DIFFÉRENTE », et la réponse
// doit être: celle qui a déclaré un régime, et elle seule.
//
// ⛔ CE TEST EST LA MOITIÉ QUI PROUVE « ET ELLE SEULE ». Sans lui, on aurait
// pu poser la clé dans `MEAL_SYSTEM_PROMPT` — donc dans le prompt de CHAQUE
// composition, y compris les millions sans régime — et personne ne l'aurait vu
// avant la facture.

Deno.test("v16 — la demande de GROUPE n'existe QUE dans le bloc de régime", () => {
  // ① Le prompt système partagé ne la porte pas. C'est lui que reçoit toute la
  //    population, régime ou pas.
  assert(
    !MEAL_SYSTEM_PROMPT.includes('Add a "group" key'),
    "la demande de groupe est dans le SCHÉMA PARTAGÉ: toute la population la " +
      "reçoit, y compris ceux pour qui elle ne sert à rien",
  );
  assert(!MEAL_SYSTEM_PROMPT.includes("ONE EXTRA KEY ON EVERY INGREDIENT"));

  // ② Un élève SANS régime ne la voit nulle part — ni système, ni message.
  const sansRegime = buildMealPrompt({ ...PROMPT_BASE, dietBlock: "" });
  const entier = `${sansRegime.systemPrompt}\n${sansRegime.userMessage}`;
  assert(!entier.includes('Add a "group" key'));
  assert(!entier.includes("ONE EXTRA KEY ON EVERY INGREDIENT"));
  assert(!entier.includes("tofu_tempeh"));

  // ③ Un élève AVEC régime la voit, et par le seul chemin prévu.
  const avecRegime = buildMealPrompt({
    ...PROMPT_BASE,
    dietBlock: dietaryRegimePromptLine("vegan"),
  });
  assertStringIncludes(avecRegime.userMessage, 'Add a "group" key');
  assertStringIncludes(avecRegime.userMessage, "tofu_tempeh");
  // Et le prompt SYSTÈME des deux est le même objet: la consigne n'a pas
  // fuité vers le tronc en passant.
  assertEquals(avecRegime.systemPrompt, sansRegime.systemPrompt);
});

Deno.test("v16 — le mot « json » survit à l'ajout, sinon l'instrument ment", () => {
  // ⛔ LE PIÈGE DE L'INSTRUMENT, écrit dans le briefing du chantier: le mode
  // JSON RÉÉCRIT le prompt APRÈS la capture, et l'écart est nul aujourd'hui
  // UNIQUEMENT parce que le mot « json » figure déjà dans les trois prompts.
  // Rien ne le garde. Toute réécriture de prompt doit donc le revérifier —
  // sinon l'archive se met à différer de ce qui est envoyé, en silence.
  for (const dietBlock of ["", dietaryRegimePromptLine("vegan")]) {
    const built = buildMealPrompt({ ...PROMPT_BASE, dietBlock });
    assert(
      /json/i.test(`${built.systemPrompt}\n${built.userMessage}`),
      "le mot « json » a disparu du prompt: l'archive va diverger de l'envoi",
    );
  }
});
