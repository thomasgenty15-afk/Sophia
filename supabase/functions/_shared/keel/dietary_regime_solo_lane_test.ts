import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";

import { buildMealPrompt } from "./meal_generation.ts";
import {
  dietaryRegimePromptLine,
  excludedSurfaceFormsFor,
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
  contentLocale: "en-US",
  budgetAmount: null,
  dietBlock: "",
  doctrineBlock: "== MARC'S METHOD ==",
  coachNoteBlock: null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  boxMemberIds: [],
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

Deno.test("FF-042 — la lane foyer ne double PAS la phrase de régime", async () => {
  const src = await householdSource();
  // Elle a déjà `householdDietBlock`, qui écrit la ligne du plus strict de la
  // table PUIS nomme qui diverge. Remplir `dietBlock` ici mettrait deux
  // consignes de régime dans le même prompt — et, l'union des membres n'étant
  // pas ordonnée par sévérité, potentiellement la moins stricte en premier.
  assertStringIncludes(src, 'dietBlock: ""');
  assertStringIncludes(src, "dietBlock: householdDietBlock({");
});
