/**
 * FF-056 — LE SOUS-FLOW, ÉPROUVÉ HORS RÉSEAU.
 *
 * Quatre moitiés (le compte est encore faux):
 *   1. LES TRAPPES. Elles sont au sommet du reducer et elles sont REQUISES.
 *   2. LES NEUF CATÉGORIES, une par une, avec leur bonne fin.
 *   3. LES BORNES: reformulation unique, plafond de tours, plan changé.
 *   4. LE VALIDATEUR DE SORTIE, et les vingt-deux littéraux de repli qui
 *      doivent le passer. Une garde qui bloque tout ressemble à une garde qui
 *      marche (cicatrice `guards-need-a-passing-case`).
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  WEIGHT_DIVERGENCE_CATEGORIES,
  WEIGHT_DIVERGENCE_MAX_QUESTIONS,
  WEIGHT_DIVERGENCE_MAX_TURNS,
  WEIGHT_DIVERGENCE_OBSERVATION_DAYS,
  WEIGHT_DIVERGENCE_OPEN_FOR_DAYS,
  WEIGHT_DIVERGENCE_SLOTS,
  WEIGHT_DIVERGENCE_VISIBLE_TASKS,
  SLOT_TO_RECOMMENDATION_ACTION,
  type WeightDivergenceVisibleTask,
  type WeightDivergenceVisibleTaskKind,
} from "./contract.ts";
import {
  normalizeCategory,
  normalizeSlot,
  pickNamedSpotAction,
  reduceWeightDivergence,
  type WeightDivergenceReducerInput,
} from "./reducer.ts";
import {
  detectDeclineFloor,
  promptMentionsEveryCategory,
  promptMentionsEverySlot,
} from "./local_dispatcher.ts";
import {
  validateWeightDivergenceMessage,
  WEIGHT_DIVERGENCE_FALLBACK_PACKS,
  weightDivergenceDeterministicMessage,
} from "./visible_agent.ts";

// ---------------------------------------------------------------------------
// Les fixtures
// ---------------------------------------------------------------------------

function reducerInput(
  patch: Partial<WeightDivergenceReducerInput> = {},
): WeightDivergenceReducerInput {
  return {
    previousState: {},
    category: "other",
    namedSlot: "unspecified",
    userMessage: "hmm",
    // ⚠️ LES DEUX TRAPPES SONT REQUISES par le type. Une fixture qui les
    // omettrait ne compilerait pas — c'est la cicatrice
    // `optional-gate-params-are-disarmed-gates`, rendue impossible.
    restrictionFlagged: false,
    crisis: false,
    availableActionIds: ["add_breakfast", "add_afternoon_snack"],
    planChanged: false,
    ...patch,
  };
}

function task(
  kind: WeightDivergenceVisibleTaskKind,
  actionText: string | null = null,
): WeightDivergenceVisibleTask {
  return {
    kind,
    conversation_context: {
      phase: "closed",
      user_words: [],
      proposed_action_text: actionText,
      next_focus: "",
      tone_constraints: [],
      do_not_say: [],
      max_questions: WEIGHT_DIVERGENCE_MAX_QUESTIONS[kind],
    },
  };
}

// ---------------------------------------------------------------------------
// 1. LES TRAPPES
// ---------------------------------------------------------------------------

Deno.test("FF-056 · la CRISE rend la main sans un mot, et passe devant tout", () => {
  const out = reduceWeightDivergence(reducerInput({
    crisis: true,
    restrictionFlagged: true,
    category: "named_spot",
    namedSlot: "morning",
  }));
  assertEquals(out.kind, "hand_over");
  if (out.kind !== "hand_over") throw new Error("unreachable");
  // La crise passe devant le plancher TCA: un danger immédiat pour la vie n'est
  // pas un sujet de conversation clinique.
  assertEquals(out.handOver, "crisis");
  assertEquals(out.episodeState, "expired");
});

Deno.test("FF-056 · le PLANCHER TCA rend la main, quelle que soit la catégorie", () => {
  for (const category of WEIGHT_DIVERGENCE_CATEGORIES) {
    const out = reduceWeightDivergence(reducerInput({
      restrictionFlagged: true,
      category,
    }));
    assertEquals(out.kind, "hand_over", `catégorie ${category}`);
    if (out.kind !== "hand_over") throw new Error("unreachable");
    assertEquals(out.handOver, "restriction_floor");
    // ⚠️ L'ÉPISODE MEURT. Le laisser vivant ferait revenir la question au tour
    // suivant, chez quelqu'un dont le plancher TCA vient de se lever.
    assertEquals(out.episodeState, "expired");
  }
});

Deno.test("FF-056 · une trappe ne produit AUCUNE catégorie et AUCUNE action", () => {
  const out = reduceWeightDivergence(reducerInput({
    restrictionFlagged: true,
    category: "named_spot",
    namedSlot: "morning",
  }));
  if (out.kind !== "hand_over") throw new Error("attendu hand_over");
  // Rien d'exploitable ne sort d'une trappe: pas de `visibleTask`, pas de
  // `proposedActionId`. Le type lui-même l'interdit.
  assertEquals("visibleTask" in out, false);
  assertEquals("proposedActionId" in out, false);
});

// ---------------------------------------------------------------------------
// 2. LES NEUF CATÉGORIES
// ---------------------------------------------------------------------------

const EXPECTED: Record<string, {
  task: WeightDivergenceVisibleTaskKind;
  episodeState: string;
  status: "continue" | "exit";
}> = {
  named_spot: {
    task: "propose_named_spot_action",
    episodeState: "in_flow",
    status: "exit",
  },
  plan_mismatch: {
    task: "point_to_plan_fit",
    episodeState: "nothing_to_change",
    status: "exit",
  },
  activity_drop: {
    task: "acknowledge_activity_drop",
    episodeState: "nothing_to_change",
    status: "exit",
  },
  medical: {
    task: "acknowledge_medical",
    episodeState: "nothing_to_change",
    status: "exit",
  },
  life_factor: {
    task: "acknowledge_life_factor",
    episodeState: "nothing_to_change",
    status: "exit",
  },
  not_a_divergence: {
    task: "close_nothing_to_change",
    episodeState: "nothing_to_change",
    status: "exit",
  },
  unknown: {
    task: "offer_observation_window",
    episodeState: "in_flow",
    status: "exit",
  },
  declined: {
    task: "respect_decline",
    episodeState: "declined",
    status: "exit",
  },
  other: {
    task: "reformulate_once",
    episodeState: "in_flow",
    status: "continue",
  },
};

Deno.test("FF-056 · chaque catégorie a SA tâche et SA fin — les neuf, énumérées", () => {
  for (const category of WEIGHT_DIVERGENCE_CATEGORIES) {
    // `named_spot` a besoin de son MOMENT: sans lui il n'y a pas d'action, et
    // c'est justement la propriété que le lot suivant a dû ajouter.
    const out = reduceWeightDivergence(reducerInput({
      category,
      namedSlot: category === "named_spot" ? "morning" : "unspecified",
    }));
    if (out.kind !== "reduction") throw new Error(`hand_over inattendu: ${category}`);
    const expected = EXPECTED[category];
    assertEquals(out.visibleTask.kind, expected.task, `tâche de ${category}`);
    assertEquals(out.episodeState, expected.episodeState, `état de ${category}`);
    assertEquals(out.status, expected.status, `statut de ${category}`);
    assertEquals(out.episodeCategory, category);
  }
});

Deno.test("FF-056 · R5 — `not_a_divergence` conclut « rien à changer », et SORT", () => {
  const out = reduceWeightDivergence(reducerInput({
    category: "not_a_divergence",
    userMessage: "je me suis mis à la muscu",
  }));
  if (out.kind !== "reduction") throw new Error("unreachable");
  assertEquals(out.visibleTask.kind, "close_nothing_to_change");
  assertEquals(out.status, "exit");
  // ⚠️ AUCUNE QUESTION AUTORISÉE. « Mais garde un œil dessus ? » ré-ouvrirait
  // l'anxiété que cette branche existe pour fermer.
  assertEquals(out.visibleTask.conversation_context.max_questions, 0);
  assertEquals(out.proposedActionId, null);
});

Deno.test("FF-056 · `named_spot` propose une action de l'espace PRÉ-CALCULÉ", () => {
  const out = reduceWeightDivergence(reducerInput({
    category: "named_spot",
    namedSlot: "morning",
    userMessage: "le matin je grignote en me levant",
    availableActionIds: ["add_breakfast"],
  }));
  if (out.kind !== "reduction") throw new Error("unreachable");
  assertEquals(out.proposedActionId, "add_breakfast");
  // L'épisode n'est PAS `acted`: le tap est l'effet, jamais la classification.
  assertEquals(out.episodeState, "in_flow");
});

Deno.test("FF-056 · `named_spot` SANS action disponible ne bricole rien", () => {
  const out = reduceWeightDivergence(reducerInput({
    category: "named_spot",
    namedSlot: "morning",
    availableActionIds: [],
  }));
  if (out.kind !== "reduction") throw new Error("unreachable");
  assertEquals(out.visibleTask.kind, "acknowledge_named_spot_without_action");
  assertEquals(out.proposedActionId, null);
  assertEquals(out.episodeState, "nothing_to_change");
});

Deno.test("FF-056 · 🔴 LE DÉFAUT DU RUN RÉEL — on n'agit JAMAIS ailleurs qu'au moment nommé", () => {
  // Mesuré en run réel sur la job story de la fiche: « le matin je grignote »
  // chez quelqu'un qui a DÉJÀ un petit-déjeuner. `add_breakfast` n'est donc pas
  // dans l'espace, et la version précédente prenait « la première disponible »:
  // une collation l'après-midi. §1 nomme ce cas mot pour mot.
  assertEquals(
    pickNamedSpotAction(["add_afternoon_snack"], "morning"),
    null,
    "le matin ne doit JAMAIS produire une action de l'après-midi",
  );
  // Le cas qui passe: le moment nommé ET l'action disponible.
  assertEquals(pickNamedSpotAction(["add_breakfast"], "morning"), "add_breakfast");
  assertEquals(
    pickNamedSpotAction(["add_afternoon_snack", "add_breakfast"], "afternoon"),
    "add_afternoon_snack",
  );
  // Les moments SANS action: le plan ne sait pas encore les absorber, et le
  // flow le dit plutôt que d'agir à côté.
  for (const slot of ["midday", "evening", "night", "unspecified"] as const) {
    assertEquals(
      pickNamedSpotAction(["add_breakfast", "add_afternoon_snack"], slot),
      null,
      `le moment ${slot} n'a aucune action`,
    );
  }
  assertEquals(pickNamedSpotAction([], "morning"), null);
  // Un identifiant inventé ne peut pas entrer dans l'espace.
  assertEquals(pickNamedSpotAction(["add_midnight_feast"], "morning"), null);
});

Deno.test("FF-056 · le moment nommé est un ensemble FERMÉ, `unspecified` par défaut", () => {
  for (const value of [null, undefined, "", "matin", "MORNING", "brunch", 3, {}]) {
    assertEquals(normalizeSlot(value), "unspecified", JSON.stringify(value));
  }
  for (const slot of WEIGHT_DIVERGENCE_SLOTS) assertEquals(normalizeSlot(slot), slot);
  // La table moment → action ne connaît QUE des actions de l'espace FF-028.
  for (const target of Object.values(SLOT_TO_RECOMMENDATION_ACTION)) {
    if (target !== null) {
      assertEquals(
        ["add_breakfast", "add_afternoon_snack"].includes(target),
        true,
        `action inconnue de FF-028: ${target}`,
      );
    }
  }
});

Deno.test("FF-056 · un moment nommé sans action correspondante → on le DIT", () => {
  const out = reduceWeightDivergence(reducerInput({
    category: "named_spot",
    namedSlot: "evening",
    userMessage: "le soir je me ressers",
    availableActionIds: ["add_breakfast", "add_afternoon_snack"],
  }));
  if (out.kind !== "reduction") throw new Error("unreachable");
  assertEquals(out.visibleTask.kind, "acknowledge_named_spot_without_action");
  assertEquals(out.proposedActionId, null);
});

Deno.test("FF-056 · `unknown` ouvre la fenêtre d'observation, bornée", () => {
  const out = reduceWeightDivergence(reducerInput({
    category: "unknown",
    userMessage: "je ne sais pas",
  }));
  if (out.kind !== "reduction") throw new Error("unreachable");
  assertEquals(out.opensObservationWindow, true);
  assertEquals(WEIGHT_DIVERGENCE_OBSERVATION_DAYS, 3);
});

Deno.test("FF-056 · seule `unknown` ouvre la fenêtre — les huit autres, jamais", () => {
  for (const category of WEIGHT_DIVERGENCE_CATEGORIES) {
    const out = reduceWeightDivergence(reducerInput({ category }));
    if (out.kind !== "reduction") throw new Error("unreachable");
    assertEquals(
      out.opensObservationWindow,
      category === "unknown",
      `fenêtre sur ${category}`,
    );
  }
});

// ---------------------------------------------------------------------------
// R4 — L'ENSEMBLE EST FERMÉ
// ---------------------------------------------------------------------------

Deno.test("FF-056 · R4 — tout ce qui n'est pas une catégorie devient `other`", () => {
  for (
    const value of [
      null,
      undefined,
      "",
      "  ",
      "NAMED_SPOT",
      "he_is_lying",
      "binge",
      42,
      {},
      [],
      "constructor",
      "__proto__",
    ]
  ) {
    assertEquals(normalizeCategory(value), "other", `valeur ${JSON.stringify(value)}`);
  }
  // Et les neuf vraies passent telles quelles.
  for (const category of WEIGHT_DIVERGENCE_CATEGORIES) {
    assertEquals(normalizeCategory(category), category);
  }
});

Deno.test("FF-056 · le prompt du classifieur nomme LES NEUF catégories", () => {
  // Sans ce test, une catégorie ajoutée au type sans l'être au prompt serait
  // simplement inatteignable — un chemin mort qu'aucune erreur ne signale.
  assertEquals(promptMentionsEveryCategory(), true);
  // Idem pour les moments: un moment du type absent du prompt est un chemin
  // mort qu'aucune erreur ne signale.
  assertEquals(promptMentionsEverySlot(), true);
});

// ---------------------------------------------------------------------------
// LE PLANCHER DE REFUS — déterministe, bilingue
// ---------------------------------------------------------------------------

Deno.test("FF-056 · R10 — le refus est reconnu SANS modèle, FR et EN", () => {
  const refusals = [
    // --- FR ---
    "je n'ai pas envie d'en parler",
    "j'ai pas envie d'en parler",
    "je préfère ne pas en parler",
    "je ne veux pas en parler",
    "laisse tomber",
    "ça te regarde pas",
    "on parle d'autre chose",
    "passe à autre chose",
    // --- EN ---
    "I don't want to talk about it",
    "I do not want to talk about this",
    "I'd rather not talk about it",
    "none of your business",
    "drop it",
    "let's change the subject",
    "can we not",
  ];
  for (const phrase of refusals) {
    assertEquals(detectDeclineFloor(phrase), true, `refus manqué: ${phrase}`);
  }
});

Deno.test("FF-056 · le plancher de refus ne mord PAS sur une vraie réponse", () => {
  const answers = [
    // ⚠️ « ça va » N'EST PAS un refus sous ce flow: c'est une contestation
    // implicite du constat. Le lire comme un refus doublerait le cooldown de
    // quelqu'un qui venait de répondre.
    "ça va, je crois que c'est de l'eau",
    "I'm fine, it's probably water",
    "le matin je grignote",
    "I snack in the morning",
    "j'ai arrêté le sport",
    "je ne sais pas",
    "I don't know",
    "j'ai commencé un traitement",
    "I started a new medication",
    "je mange souvent au restaurant",
    "je dors mal en ce moment",
  ];
  for (const phrase of answers) {
    assertEquals(detectDeclineFloor(phrase), false, `faux refus: ${phrase}`);
  }
});

Deno.test("FF-056 · le plancher de refus mord malgré accents et ponctuation", () => {
  // `\b` ne mord pas après « é ». Le pliage est ce qui rend la garde vraie.
  assertEquals(detectDeclineFloor("Je PRÉFÈRE, ne pas en parler..."), true);
  assertEquals(detectDeclineFloor("LAISSE TOMBER !!!"), true);
});

// ---------------------------------------------------------------------------
// 3. LES BORNES
// ---------------------------------------------------------------------------

Deno.test("FF-056 · UNE seule reformulation par épisode", () => {
  const first = reduceWeightDivergence(reducerInput({ category: "other" }));
  if (first.kind !== "reduction") throw new Error("unreachable");
  assertEquals(first.visibleTask.kind, "reformulate_once");
  assertEquals(first.statePatch.reformulated, true);

  const second = reduceWeightDivergence(reducerInput({
    category: "other",
    previousState: { reformulated: true, turn_count: 1 },
  }));
  if (second.kind !== "reduction") throw new Error("unreachable");
  assertEquals(second.visibleTask.kind, "close_out");
  assertEquals(second.status, "exit");
  assertEquals(second.episodeState, "expired");
});

Deno.test("FF-056 · R6 — le plafond de tours sort, quoi que le modèle réponde", () => {
  const out = reduceWeightDivergence(reducerInput({
    category: "other",
    previousState: { turn_count: WEIGHT_DIVERGENCE_MAX_TURNS - 1 },
  }));
  if (out.kind !== "reduction") throw new Error("unreachable");
  assertEquals(out.visibleTask.kind, "close_out");
  assertEquals(out.status, "exit");
  assertEquals(WEIGHT_DIVERGENCE_MAX_TURNS, 3);
  assertEquals(WEIGHT_DIVERGENCE_OPEN_FOR_DAYS, 2);
});

Deno.test("FF-056 · §7 — un plan changé sous l'épisode n'applique RIEN", () => {
  const out = reduceWeightDivergence(reducerInput({
    category: "named_spot",
    namedSlot: "morning",
    planChanged: true,
  }));
  if (out.kind !== "reduction") throw new Error("unreachable");
  assertEquals(out.visibleTask.kind, "acknowledge_named_spot_without_action");
  assertEquals(out.proposedActionId, null);
  assertEquals(out.reasonCode, "weight_divergence.plan_changed_under_episode");
});

Deno.test("FF-056 · aucune tâche ne peut poser plus d'une question", () => {
  for (const kind of WEIGHT_DIVERGENCE_VISIBLE_TASKS) {
    const max = WEIGHT_DIVERGENCE_MAX_QUESTIONS[kind];
    assertEquals(max <= 1, true, `${kind} autorise ${max} questions`);
  }
  // Et les fins, aucune. Une fin qui pose une question n'est pas une fin.
  for (
    const kind of [
      "close_nothing_to_change",
      "respect_decline",
      "close_out",
    ] as const
  ) {
    assertEquals(WEIGHT_DIVERGENCE_MAX_QUESTIONS[kind], 0, kind);
  }
});

// ---------------------------------------------------------------------------
// 4. LE VALIDATEUR DE SORTIE
// ---------------------------------------------------------------------------

Deno.test("FF-056 · R11 — aucun chiffre, sous aucune forme", () => {
  for (
    const message of [
      "You are about 300 calories over.",
      "Il te manque environ 300 kcal.",
      "That's 2 kg in 3 weeks.",
      "Tu as pris 1,5 kg.",
    ]
  ) {
    const verdict = validateWeightDivergenceMessage(message, task("close_out"));
    assertEquals(verdict.ok, false, `laissé passer: ${message}`);
  }
});

Deno.test("FF-056 · l'énergie EN TOUTES LETTRES est bloquée, FR et EN", () => {
  // Le filtre de FF-018 a déjà été percé exactement comme ça: le chiffre était
  // interdit, le mot écrit ne l'était pas.
  for (
    const message of [
      "That's roughly three hundred calories more than planned.",
      "Ça fait environ trois cents calories de plus.",
      "Ton apport énergétique dépasse un peu.",
      "Your energy intake is a bit high.",
      "Il faudrait un déficit calorique un peu plus net.",
      "Let's look at your macros.",
    ]
  ) {
    const verdict = validateWeightDivergenceMessage(message, task("close_out"));
    assertEquals(verdict.ok, false, `laissé passer: ${message}`);
  }
});

Deno.test("FF-056 · le SOUPÇON est bloqué, y compris NIÉ", () => {
  for (
    const message of [
      "Tu es sûr de tout me dire ?",
      "Are you sure that's everything?",
      "Sois honnête avec moi.",
      "Be honest with me.",
      // ⚠️ NIÉ. « Je ne dis pas que tu triches » dit quand même « tu triches ».
      // C'est le seul appelant du dépôt qui demande le mode absolu du matcher.
      "Je ne dis pas que tu triches.",
      "I'm not saying you're lying.",
      "Pourtant tes coches disent autre chose.",
      "The numbers say something else.",
      "Ça ne colle pas avec ce que tu m'as dit.",
      "That doesn't add up.",
    ]
  ) {
    const verdict = validateWeightDivergenceMessage(message, task("close_out"));
    assertEquals(verdict.ok, false, `laissé passer: ${message}`);
  }
});

Deno.test("FF-056 · le REPROCHE est bloqué, FR et EN", () => {
  for (
    const message of [
      "Il faut un peu plus de discipline.",
      "It's a willpower thing.",
      "Tu aurais dû me le dire plus tôt.",
      "You should have told me.",
      "C'est un peu du laisser aller.",
    ]
  ) {
    const verdict = validateWeightDivergenceMessage(message, task("close_out"));
    assertEquals(verdict.ok, false, `laissé passer: ${message}`);
  }
});

Deno.test("FF-056 · §10 — rien ne lie la question à la PESÉE", () => {
  // Le RED majeur de la fiche: c'est cette phrase qui apprend à ne plus se
  // peser. On ne peut pas mesurer la fréquence de pesée en local; on peut
  // garantir qu'aucun texte ne fait le lien.
  for (
    const message of [
      "Puisque tu t'es pesé ce matin, parlons-en.",
      "Since you weighed yourself, let's talk.",
      "Ta pesée de cette semaine m'interpelle.",
      "Every time you weigh in, I see the same thing.",
      "Monte sur la balance demain matin et on en reparle.",
    ]
  ) {
    const verdict = validateWeightDivergenceMessage(message, task("close_out"));
    assertEquals(verdict.ok, false, `laissé passer: ${message}`);
  }
});

Deno.test("FF-056 · une tâche de proposition SANS son texte d'action est refusée", () => {
  const withoutText = validateWeightDivergenceMessage(
    "On l'ajoute à ton plan ?",
    task("propose_named_spot_action", null),
  );
  assertEquals(withoutText.ok, false);
  assertEquals(withoutText.reason, "proposal_task_without_action_text");
});

Deno.test("FF-056 · trop de questions est refusé", () => {
  const verdict = validateWeightDivergenceMessage(
    "C'est noté. Et sinon, ça va ?",
    task("acknowledge_life_factor"),
  );
  assertEquals(verdict.ok, false);
  assertEquals(verdict.reason, "too_many_questions");
});

Deno.test("FF-056 · LE CAS QUI PASSE — sinon ce ne serait pas une garde", () => {
  // `guards-need-a-passing-case`: une garde cassée bloque tout et ressemble à
  // une garde qui marche.
  for (
    const message of [
      "C'est noté, merci. Ça se tient.",
      "Understood — I'll leave it there.",
      "Alors c'est le plan qui doit bouger, pas toi.",
    ]
  ) {
    const verdict = validateWeightDivergenceMessage(message, task("close_out"));
    assertEquals(verdict.ok, true, `refusé à tort: ${message} (${verdict.reason})`);
  }
});

// ---------------------------------------------------------------------------
// LES REPLIS DÉTERMINISTES
// ---------------------------------------------------------------------------

Deno.test("FF-056 · LES VINGT-DEUX REPLIS PASSENT LEUR PROPRE VALIDATEUR", () => {
  // Un repli qu'on ne peut pas émettre est un repli qui n'existe pas — et le
  // repli est le filet de DERNIER recours, celui qui sert quand tout le reste
  // est tombé.
  let checked = 0;
  for (const [langue, pack] of Object.entries(WEIGHT_DIVERGENCE_FALLBACK_PACKS)) {
    for (const kind of WEIGHT_DIVERGENCE_VISIBLE_TASKS) {
      const text = (pack as Record<string, string>)[kind];
      assertEquals(typeof text, "string", `${langue}/${kind} manquant`);
      const actionText = kind === "propose_named_spot_action"
        ? "Want me to build a proper breakfast into your plan from here on?"
        : null;
      const verdict = validateWeightDivergenceMessage(
        actionText ? `${text}\n\n${actionText}` : text,
        task(kind, actionText),
      );
      assertEquals(
        verdict.ok,
        true,
        `repli ${langue}/${kind} refusé par son propre validateur: ${verdict.reason}`,
      );
      checked++;
    }
  }
  assertEquals(checked, WEIGHT_DIVERGENCE_VISIBLE_TASKS.length * 2);
});

Deno.test("FF-056 · le repli est BILINGUE — cicatrice T-19", () => {
  // `safety_crisis` porte 33 gabarits de repli MONOLINGUES FRANÇAIS: un élève
  // américain dont le modèle tombe reçoit du français, sur le chemin de
  // dernier recours. Celui-ci ne peut pas le faire.
  const fr = weightDivergenceDeterministicMessage("respect_decline", "fr-FR", null);
  const en = weightDivergenceDeterministicMessage("respect_decline", "en-US", null);
  assertEquals(fr === en, false);
  assertEquals(fr.includes("Entendu"), true);
  assertEquals(en.includes("Understood"), true);
  // Une locale inconnue retombe sur l'anglais, jamais sur du français.
  assertEquals(
    weightDivergenceDeterministicMessage("respect_decline", "de-DE", null),
    en,
  );
});

Deno.test("FF-056 · le repli de proposition PORTE le littéral gelé de FF-028", () => {
  const text = weightDivergenceDeterministicMessage(
    "propose_named_spot_action",
    "fr-FR",
    "TEXTE-FF028",
  );
  assertEquals(text.includes("TEXTE-FF028"), true);
});

Deno.test("FF-056 · aucun repli ne parle du foyer, du coach ni de la balance", () => {
  for (const pack of Object.values(WEIGHT_DIVERGENCE_FALLBACK_PACKS)) {
    for (const text of Object.values(pack as Record<string, string>)) {
      const folded = text.normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
      for (
        const word of [
          "coach",
          "foyer",
          "household",
          "balance",
          "scale",
          "pesee",
          "weigh",
          "poids",
          "weight",
        ]
      ) {
        assertEquals(folded.includes(word), false, `« ${word} » dans: ${text}`);
      }
    }
  }
});
