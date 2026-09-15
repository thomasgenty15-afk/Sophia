import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.0";

import { buildMealPrompt } from "./meal_generation.ts";
import {
  KITCHEN_TOOLS,
  kitchenEquipmentPromptLines,
  readKitchenEquipment,
} from "./kitchen_equipment.ts";

/**
 * LES MOYENS DE CUISSON SUR LA LANE INDIVIDUELLE — le câblage, pas les jetons.
 *
 * ── LE DÉFAUT QUE CES TESTS ÉPINGLENT, MESURÉ ET PAS SUPPOSÉ ───────────────
 * Run réel `798c5cd6-acbf-43e3-8dcc-97128d3edd78` (QA 01-injection, 2026-08-18).
 * L'élève venait de cocher, à l'étape 3 de `/app/setup`, exactement trois
 * outils: plaque, micro-ondes, blender. Ni four, ni congélateur.
 *
 *   · `practical_constraints.kitchen_equipment` en base:
 *     `["stovetop","microwave","blender"]`   ← l'écran a bien écrit
 *   · le message utilisateur archivé de ce run: ZÉRO occurrence de `oven`,
 *     `freezer`, `microwave`                  ← la consigne n'a rien vu
 *   · le plan rendu: `cooking_sessions[0].run_through` commence par
 *     « Heat the oven and put the eggs on first », et le dîner du mercredi est
 *     « Harissa chickpeas, roast potatoes, courgette and peppers ».
 *
 * `kitchen_equipment.ts` existait, complet et testé, avec son lecteur à trois
 * valeurs. La lane FOYER l'appelait (deux sites). La lane INDIVIDUELLE ne
 * l'importait même pas. Un champ collecté sans lecteur ressemble exactement à
 * un champ ignoré — c'est la cicatrice centrale de ce dépôt, et elle était ici.
 *
 * ⚠️ FICHIER SÉPARÉ DE `kitchen_equipment_test.ts`, exprès et pour la même
 * raison que `dietary_regime_solo_lane_test.ts` l'est de `dietary_regime_test.ts`:
 * celui-là teste le MOTEUR (jetons, lecture à trois valeurs); celui-ci teste
 * que quelqu'un l'APPELLE, et à la bonne place.
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
// 1. LA PHRASE — ce qui manque, jamais ce qu'il a
// ---------------------------------------------------------------------------

Deno.test("jamais demandé (`null`) ⇒ AUCUNE ligne", () => {
  // La direction sûre, et celle qui protège tous les comptes d'avant ce lot:
  // sans réponse, il n'y a rien à interdire.
  assertEquals(kitchenEquipmentPromptLines(null), []);
});

Deno.test("tout déclaré ⇒ AUCUNE ligne non plus", () => {
  assertEquals(kitchenEquipmentPromptLines([...KITCHEN_TOOLS]), []);
});

Deno.test("ce qui manque est nommé, dans l'ordre de la liste fermée", () => {
  const lines = kitchenEquipmentPromptLines(["stovetop", "microwave", "blender"]);
  const body = lines.join("\n");
  // L'en-tête dit ce que c'est: une interdiction, pas un inventaire.
  assertStringIncludes(lines[0], "does NOT have");
  assertStringIncludes(body, "no oven");
  assertStringIncludes(body, "no freezer");
  assertStringIncludes(body, "no air fryer");
  assertStringIncludes(body, "no pressure cooker");
  // ⚠️ ON N'ÉCRIT PAS CE QU'IL A. « il a un micro-ondes » invite le modèle à
  // composer autour d'un inventaire; l'absence interdit un geste.
  assert(!body.includes("no microwave"));
  assert(!body.includes("no hob"));
  assert(!body.includes("no blender"));
  // L'ORDRE est celui de `KITCHEN_TOOLS`, pas celui des clics: deux
  // générations pour une même déclaration doivent rendre le même prompt.
  assert(body.indexOf("no oven") < body.indexOf("no freezer"));
  assert(body.indexOf("no freezer") < body.indexOf("no air fryer"));
});

// ---------------------------------------------------------------------------
// 2. LE PROMPT — la ligne arrive dans le bloc qui décide d'une session
// ---------------------------------------------------------------------------

Deno.test("la consigne atteint le message du modèle, sous « WHAT THEY CAN COOK »", () => {
  const { userMessage } = buildMealPrompt({
    ...PROMPT_BASE,
    kitchenEquipment: ["stovetop", "microwave", "blender"],
  });
  assertStringIncludes(userMessage, "-- WHAT THEY CAN COOK --");
  assertStringIncludes(userMessage, "no oven");
  // La place COMPTE: « il ne peut cuisiner que mardi » et « il n'a pas de
  // four » sont la même question, et le modèle décide de sa session en lisant
  // ce bloc-là. Sous le budget, la ligne arriverait après un arbitrage qui la
  // suppose connue.
  const canCook = userMessage.indexOf("-- WHAT THEY CAN COOK --");
  const oven = userMessage.indexOf("no oven");
  const thisTime = userMessage.indexOf("-- THIS TIME --");
  assert(canCook >= 0 && oven > canCook && oven < thisTime);
});

Deno.test("sans réponse, le message est CELUI D'AVANT, au caractère près", () => {
  // La garde qui rend le lot additif plutôt que régressif: tous les comptes
  // qui n'ont jamais vu la question de l'étape 3.
  const before = buildMealPrompt({ ...PROMPT_BASE }).userMessage;
  const withNull = buildMealPrompt({ ...PROMPT_BASE, kitchenEquipment: null })
    .userMessage;
  assertEquals(withNull, before);
  // Et une déclaration COMPLÈTE n'ajoute rien non plus.
  const withAll = buildMealPrompt({
    ...PROMPT_BASE,
    kitchenEquipment: [...KITCHEN_TOOLS],
  }).userMessage;
  assertEquals(withAll, before);
});

Deno.test("le jsonb de l'écran traverse jusqu'à la consigne", () => {
  // Le jsonb EXACT écrit par `/app/setup` sur le run `798c5cd6-…`. C'est le
  // bout de chaîne qui manquait: la base savait, le prompt non.
  const equipment = readKitchenEquipment({
    kitchen_equipment: ["stovetop", "microwave", "blender"],
  });
  const { userMessage } = buildMealPrompt({
    ...PROMPT_BASE,
    kitchenEquipment: equipment,
  });
  assertStringIncludes(userMessage, "no oven");
  assertStringIncludes(userMessage, "no freezer");
});

// ---------------------------------------------------------------------------
// 3. LA SOURCE — quelqu'un APPELLE, et au-dessus de la construction
// ---------------------------------------------------------------------------
//
// Même patron que `dietary_regime_solo_lane_test.ts` §3, et pour la même
// raison mesurée: une lecture qui redescend SOUS `buildMealPrompt` laisse la
// consigne partir vide, le plan sort quand même, et aucun test de composition
// ne rougit.

const soloSource = () =>
  Deno.readTextFile(new URL("../../generate-meal-v1/index.ts", import.meta.url));
const householdSource = () =>
  Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );

Deno.test("la lane solo PASSE l'équipement à `buildMealPrompt`", async () => {
  const src = await soloSource();
  assertStringIncludes(src, "const kitchenEquipment = readKitchenEquipment(");
  assertStringIncludes(src, "      kitchenEquipment,");
});

Deno.test("l'équipement est LU avant que le prompt soit construit", async () => {
  const src = await soloSource();
  const read = src.indexOf("const kitchenEquipment = readKitchenEquipment(");
  const built = src.indexOf("buildMealPrompt({");
  assert(read >= 0 && built >= 0, "test à réviser: les deux sites ont bougé");
  assert(
    read < built,
    "`kitchenEquipment` doit être hissé au-dessus de `buildMealPrompt`",
  );
  // Une seule lecture: deux sources de vérité, et c'est celle qu'on regarde le
  // moins qui garde l'ancien état.
  assertEquals(
    src.split("const kitchenEquipment = readKitchenEquipment(").length - 1,
    1,
  );
});

Deno.test("la lane FOYER garde SON bloc, ce lot ne lui ajoute rien", async () => {
  const src = await householdSource();
  // Elle lit déjà l'équipement — pour son ENVELOPPE (`kitchenBlock`,
  // `HOUSEHOLD_PROMPT_VERSION` v16), pas pour le tronc. Les deux lanes disent
  // donc la même chose par deux chemins, ce qui est le partage habituel ici:
  // le tronc porte ce qui vaut pour tout le monde, l'enveloppe ce qui ne vaut
  // que pour une table.
  // ⟳ 2026-09-01 — LA LECTURE A ÉTÉ HISSÉE, ET LA RAISON EST ÉCRITE ICI
  // PARCE QUE CE TEST L'A EXIGÉ. Elle était EN LIGNE au site de l'enveloppe;
  // le PARSEUR en a désormais besoin lui aussi (`kept: "freezer"` n'ouvre la
  // fenêtre de conservation que sur un congélateur DÉCLARÉ). Deux
  // `readKitchenEquipment(pc)` auraient été deux idées de ce que cette cuisine
  // possède — exactement ce que le test de la lane solo, juste au-dessus,
  // interdit chez elle. L'exigence n'a pas changé, elle s'est étendue: UNE
  // lecture, plusieurs lecteurs.
  assertEquals(
    src.split("const kitchenEquipment = readKitchenEquipment(").length - 1,
    1,
  );
  // Et l'enveloppe la lit toujours — par la constante, pas par un second appel.
  assertStringIncludes(src, "kitchenEquipment,");
  // ⚠️ ET ELLE NE LE PASSE PAS À `buildMealPrompt`: son prompt expire à 4 min,
  // chaque bloc ajouté s'y paie, et il ferait DOUBLON avec `kitchenBlock`.
  // Si quelqu'un l'y branche un jour, ce test tombe et il vient écrire ici
  // laquelle des deux consignes il a retirée.
  const built = src.indexOf("buildMealPrompt({");
  assert(built >= 0, "test à réviser: le site d'appel foyer a bougé");
  const args = src.slice(built, built + 4000);
  assert(
    !/\n\s*kitchenEquipment[,:]/.test(args),
    "l'équipement ne doit pas partir DEUX fois dans le prompt du foyer",
  );
});
