import { assert, assertEquals } from "jsr:@std/assert@1";

// ═══════════════════════════════════════════════════════════════════════════
// LE CÂBLAGE DE L'EXPLICATION — sur la SOURCE de la lane foyer
//
// ⛔ POURQUOI UN TEST DE SOURCE ICI, ET PAS UNE EXÉCUTION. Rien n'exécute
// `generate-household-meal-v1/index.ts` dans une suite: le fichier appelle
// `Deno.serve` au chargement. Les gardes de câblage de ce dépôt lisent donc la
// source — et elles asseoirent des ABSENCES et des ORDRES, jamais des lignes:
// épingler le texte d'un appel photographie le code au lieu de le vérifier.
//
// ⛔ ET SANS SES COMMENTAIRES. Ce fichier RACONTE ce qu'il fait dans des pavés
// entiers: un grep naïf y verrait le câblage qu'il cherche et resterait vert le
// jour où il part. Le patron vient de `spent_first_day_test.ts`.
// ═══════════════════════════════════════════════════════════════════════════

const LANE = "../../generate-household-meal-v1/index.ts";

async function laneSource(): Promise<string> {
  const src = await Deno.readTextFile(new URL(LANE, import.meta.url));
  return src
    .split("\n")
    .map((l) => (l.trimStart().startsWith("//") ? "" : l))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

Deno.test("câblage — la garde est appelée UNE fois, sur le texte du modèle", async () => {
  const code = await laneSource();
  const appels = [...code.matchAll(/gatePlanExplanation\(/g)];
  assertEquals(appels.length, 1, "une seule garde, ou deux verdicts divergents");
  // ⛔ `mealSourceText`, JAMAIS `result`. Une relance remplace `meal`; lire
  // `result` jugerait la réponse d'AVANT — la faute est déjà mesurée sur
  // `extractMemberPortions`, vingt lignes plus loin dans le même fichier.
  assert(
    code.includes("extractExplanation(mealSourceText)"),
    "la clé doit être lue sur `mealSourceText`",
  );
  assert(
    !code.includes("extractExplanation(result)"),
    "⛔ `result` est la réponse d'AVANT la relance",
  );
});

Deno.test("câblage — les trois sorties portent le bloc", async () => {
  const code = await laneSource();
  // Aperçu, réponse finale, et la LIGNE ÉCRITE. La troisième est celle qu'on
  // oublie: sans elle, l'explication disparaît au premier rafraîchissement.
  const sorties = [...code.matchAll(/explanation: \{/g)];
  assertEquals(sorties.length, 3, "aperçu + réponse + generated_from");
  assert(code.includes("declared: explanation.declared"), "le compteur `declared`");
});

Deno.test("câblage — le compteur sort MÊME à zéro, par le journal", async () => {
  const code = await laneSource();
  // ⛔ PAR LE JOURNAL ET PAS SEULEMENT `generated_from`: celui-ci ne sort pas en
  // `draft`, et toute vérification en situation réelle de ce lot se fait en
  // `draft`. Un nombre qu'on ne journalise pas est un nombre que personne ne
  // verra bouger.
  assert(
    code.includes('tag: "keel.household_meal.plan_explanation"'),
    "le journal doit porter le compteur",
  );
  assert(code.includes("asked: true"), "`asked` sépare « rien écrit » de « rien demandé »");
  assert(code.includes("plan_explanation_refused"), "le refus doit entrer dans `issues`");
});

Deno.test("câblage — les faits passés au prompt sont LUS, jamais recalculés", async () => {
  const code = await laneSource();
  const bloc = code.slice(code.indexOf("decided: {"));
  assert(bloc.length > 0, "`decided` doit être passé à `buildHouseholdPromptBlocks`");
  const tete = bloc.slice(0, bloc.indexOf("},"));
  // Chacun de ces cinq est la constante que la CONSIGNE et l'EXPLICATION
  // déterministe lisent déjà. Un second calcul ferait dire au modèle autre
  // chose que ce que le plan fait — la faute que ce fichier documente trois
  // fois (`usableCookDays`, `addedCookDays`, la veille).
  for (
    const lu of [
      "planTiming.kind",
      "spentFirstDay.dropped",
      "slotsDroppedToday",
      "rationaleCookDays",
      "outOfBatchReach",
      "strictestRegime",
    ]
  ) {
    assert(tete.includes(lu), `\`decided\` doit lire \`${lu}\``);
  }
});

Deno.test("⛔ UN SEUL APPEL à `daysOutOfBatchReach` — deux lecteurs, un calcul", async () => {
  const code = await laneSource();
  const appels = [...code.matchAll(/daysOutOfBatchReach\(\{/g)];
  assertEquals(
    appels.length,
    1,
    "le second appel nommerait d'autres jours que ceux servis au modèle",
  );
});

Deno.test("⛔ L'ORDRE — les faits sont calculés AVANT l'appel modèle", async () => {
  const code = await laneSource();
  const hisse = code.indexOf("const rationaleCookDays = [");
  const modele = code.indexOf("generateWithGemini(");
  assert(hisse > -1 && modele > -1, "les deux repères doivent exister");
  // Sans cet ordre, `decided` recevrait `undefined` et le bloc serait vide —
  // c'est-à-dire un lot désarmé qui ressemble trait pour trait à un lot qui
  // marche. Seul le compteur `asked` le dirait, et il dirait `true`.
  assert(hisse < modele, "les faits doivent être hissés au-dessus du modèle");
});

Deno.test("la langue est étendue au champ, sur CETTE lane seulement", async () => {
  const code = await laneSource();
  assert(
    code.includes('[...MEAL_TRANSLATABLE_FIELDS, "explanation[]"]'),
    "le champ doit être déclaré traduisible ici",
  );
  const trunk = await Deno.readTextFile(
    new URL("./meal_generation.ts", import.meta.url),
  );
  // ⛔ ET PAS DANS LE TRONC: la lane solo n'écrit pas cette clé, et lui demander
  // de la traduire serait une consigne sur du vide — plus un bump de
  // `MEAL_PROMPT_VERSION` sans population.
  const liste = trunk.slice(
    trunk.indexOf("export const MEAL_TRANSLATABLE_FIELDS"),
  ).slice(0, 900);
  assert(!liste.includes("explanation"), "le tronc ne doit pas la porter");
});
