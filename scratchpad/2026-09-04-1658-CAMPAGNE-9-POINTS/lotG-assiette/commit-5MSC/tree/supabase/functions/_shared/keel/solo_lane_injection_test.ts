import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.0";

import { buildMealPrompt } from "./meal_generation.ts";
import { mealBodyBlocks } from "./meal_body.ts";
import { mealBodyContextFrom } from "./student_body_io.ts";

/**
 * DEUX CHAMPS QUE L'ÉLÈVE SAISIT ET QUE LA LANE REPAS NE VOYAIT PAS.
 *
 * QA 01-injection (2026-08-18), run réel `798c5cd6-acbf-43e3-8dcc-97128d3edd78`.
 * Le message utilisateur archivé de ce run est la preuve des deux absences —
 * il ne porte NI le cran d'activité, NI l'aspiration, alors que les deux
 * venaient d'être saisis à l'écran quelques minutes plus tôt.
 *
 * ── ① LE CRAN D'ACTIVITÉ ───────────────────────────────────────────────────
 * Quatre tuiles à l'étape 2 de `/app/setup`, sous une phrase qui PROMET
 * l'usage: « It sizes every serving you get. Sitting eight hours and training
 * four times a week are about forty per cent apart. » Écrit dans
 * `profiles.activity_level`, LU par `generate-meal-v1` — et son seul
 * consommateur était `envelopeFor`, appelé APRÈS l'appel modèle. Le premier
 * plan de quelqu'un qui s'entraîne quatre fois par semaine était donc composé
 * par un modèle qui l'ignorait, puis éventuellement corrigé par une relance
 * dont les phrases sont des littéraux sans nombre.
 *
 * ── ② L'ASPIRATION ─────────────────────────────────────────────────────────
 * `student_goals.aspiration`, écrite par `/app/plan`, injectée depuis toujours
 * par `generate-week-plan-v1` — et la lane repas ne SÉLECTIONNAIT même pas la
 * colonne. Le bloc `-- WHAT THEY ARE AFTER --` d'un compte neuf n'avait donc
 * qu'une seule ligne utile (`goal:`), les deux autres étant un axe que plus
 * aucune dynamique ne lève et une `situation` qu'aucun écran ne sait écrire.
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
  protocolBlock: "",
  beliefKeys: [],
  goal: "muscle_gain" as const,
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

const BODY = {
  heightCm: 173,
  ageBand: "30_44" as const,
  gender: "female" as const,
  latestWeight: { weekStart: "2026-08-17", value: 68.4 },
  latestWaist: null,
  declaredWeightKg: null,
  restrictionFlag: false,
  activityLevel: "trains_hard" as const,
  activityAxes: { day: null, sport: null, asked: false },
};

// ---------------------------------------------------------------------------
// ① LE CRAN D'ACTIVITÉ
// ---------------------------------------------------------------------------

Deno.test("le cran d'activité entre dans « WHO THEY ARE »", () => {
  const { whoTheyAre } = mealBodyBlocks(BODY);
  const body = whoTheyAre.join("\n");
  assertStringIncludes(body, "how their days go:");
  assertStringIncludes(body, "training four times a week or more");
  // ⚠️ LE SLUG NE SORT JAMAIS. « trains_hard » dans une phrase se lit comme un
  // identifiant, et un identifiant finit recopié dans une justification.
  assert(!body.includes("trains_hard"));
});

Deno.test("le cran d'activité n'est PAS un chiffre, et la garde d'énergie le couvre", () => {
  const { whoTheyAre } = mealBodyBlocks(BODY);
  const body = whoTheyAre.join("\n");
  // Ni facteur, ni kcal, ni fourchette: le déterministe garde ses nombres.
  assert(!/\b1[.,]\d\b/.test(body), "aucun facteur multiplicatif");
  assert(!/kcal|calorie/i.test(body.replace(/no calorie figure/i, "")));
  // La ligne tombe SOUS les deux phrases de cadrage, comme la taille.
  const line = body.indexOf("how their days go:");
  const frame = body.indexOf("These are here for ONE thing");
  assert(line >= 0 && frame > line);
});

Deno.test("pas de réponse ⇒ aucune ligne d'activité", () => {
  const { whoTheyAre } = mealBodyBlocks({ ...BODY, activityLevel: null });
  assert(!whoTheyAre.join("\n").includes("how their days go"));
});

Deno.test("le PLANCHER TCA ne coupe PAS le cran d'activité", () => {
  // Même raison que l'âge et le sexe: on ne restreint pas pour changer combien
  // on bouge, donc aucune boucle ne se nourrit de cette ligne. Ce qu'il coupe,
  // lui, reste coupé.
  const { whoTheyAre, whereTheyAreNow } = mealBodyBlocks({
    ...BODY,
    restrictionFlag: true,
  });
  const body = whoTheyAre.join("\n");
  assertStringIncludes(body, "how their days go:");
  assert(!body.includes("height:"));
  assertEquals(whereTheyAreNow, []);
});

Deno.test("le cran d'activité traverse `mealBodyContextFrom`", () => {
  // ⚠️ LE TEST QUI TIENT LE CHAMP OPTIONNEL. `MealBodyContext.activityLevel`
  // est `?:` (24 fixtures, voir son pavé), donc rien au TYPE n'oblige le
  // producteur à le remplir. Il n'y a qu'un producteur en production, et le
  // voici, monté sur un instantané comme la base le rend.
  const body = mealBodyContextFrom({
    verdict: { status: "adult" as const, isoDate: "1989-03-14", age: 37 },
    timezone: "Europe/London",
    heightCm: 173,
    gender: "female",
    activityLevel: "trains_hard",
    weights: [{ weekStart: "2026-08-17", value: 68.4 }],
    waists: [],
  }, false);
  assertEquals(body.activityLevel, "trains_hard");
  assertStringIncludes(
    mealBodyBlocks(body).whoTheyAre.join("\n"),
    "how their days go: training four times",
  );
});

Deno.test("le cran d'activité atteint le message du modèle", () => {
  const { userMessage } = buildMealPrompt({ ...PROMPT_BASE, body: BODY });
  assertStringIncludes(userMessage, "how their days go: training four times");
});

// ---------------------------------------------------------------------------
// ② L'ASPIRATION
// ---------------------------------------------------------------------------

Deno.test("l'aspiration atteint le message, dans « WHAT THEY ARE AFTER »", () => {
  const { userMessage } = buildMealPrompt({
    ...PROMPT_BASE,
    aspiration: "Carry my own kayak down to the water by spring",
  });
  assertStringIncludes(userMessage, "-- WHAT THEY ARE AFTER --");
  assertStringIncludes(
    userMessage,
    "what they are actually after, in their words: Carry my own kayak",
  );
  // AVANT la situation: ce qu'il veut, puis ce qui l'empêche. Même ordre que
  // la lane semaine, et il n'est pas cosmétique.
  const after = userMessage.indexOf("what they are actually after");
  const situation = userMessage.indexOf("their situation");
  assert(after >= 0 && situation > after);
});

Deno.test("aspiration absente ou blanche ⇒ AUCUNE ligne, pas de « not stated »", () => {
  // Une ligne qui annonce une absence occupe le rang d'une contrainte, et
  // invite le modèle à la commenter. Posture de tout le bloc.
  const before = buildMealPrompt({ ...PROMPT_BASE }).userMessage;
  assertEquals(
    buildMealPrompt({ ...PROMPT_BASE, aspiration: null }).userMessage,
    before,
  );
  assertEquals(
    buildMealPrompt({ ...PROMPT_BASE, aspiration: "   " }).userMessage,
    before,
  );
  assert(!before.includes("what they are actually after"));
});

// ---------------------------------------------------------------------------
// ③ LA SOURCE — la lane solo lit vraiment les deux colonnes
// ---------------------------------------------------------------------------

const soloSource = () =>
  Deno.readTextFile(new URL("../../generate-meal-v1/index.ts", import.meta.url));

Deno.test("`aspiration` est SÉLECTIONNÉE, puis passée au constructeur", async () => {
  const src = await soloSource();
  // Le défaut n'était pas un oubli d'argument: la colonne n'était pas dans le
  // `select`. Un champ qu'un `select` oublie est indiscernable d'un champ que
  // personne ne remplit.
  assertStringIncludes(src, "goal, situation, aspiration, focus_axis");
  assertStringIncludes(src, "aspiration: goalRow.aspiration");
});
