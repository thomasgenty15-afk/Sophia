import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import {
  DETERMINISTIC_BUTTON_PREFIXES,
} from "../chat/deterministic_buttons.ts";
import {
  dishTitlesOf,
  EMPTY_FEEDBACK_ROW,
  FEEDBACK_BUTTON_PREFIX,
  feedbackAnswerId,
  feedbackDishId,
  feedbackDismissId,
  feedbackSubjectId,
  type FeedbackRowState,
  MAX_DISH_BUTTONS,
  nextFeedbackStep,
  NONE_TOKEN,
  readFeedbackReply,
  renderFeedbackQuestion,
  renderPortionSubjectQuestion,
} from "./plan_feedback_chat.ts";
import { FEEDBACK_QUESTIONS, questionsFor } from "./plan_feedback.ts";

/**
 * FF-054 §3.2 — LE RETOUR DE FIN DE PLAN DANS LA CONVERSATION.
 *
 * Ce que ces épreuves tiennent, dans l'ordre de ce qui casserait le plus vite:
 *   · le vocabulaire est DISJOINT des cinq autres, et il est DÉCLARÉ (une
 *     famille absente de `DETERMINISTIC_BUTTON_PREFIXES` retombe au dispatcher,
 *     c'est-à-dire redevient interprétable par un modèle);
 *   · une charge forgée ne devient jamais une réponse;
 *   · l'état vient de `answered`, jamais des colonnes de plats — c'est LE
 *     défaut que la migration `20260901160000` existe pour fermer, et sans ce
 *     test il reviendrait au premier refactor;
 *   · le « pas maintenant » n'est offert qu'une fois;
 *   · les deux langues (T9).
 */

const MEAL = "11111111-1111-4111-8111-111111111111";

function row(over: Partial<FeedbackRowState> = {}): FeedbackRowState {
  return { ...EMPTY_FEEDBACK_ROW, ...over };
}

// ---------------------------------------------------------------------------
// LE VOCABULAIRE
// ---------------------------------------------------------------------------

Deno.test("la famille est DÉCLARÉE au routeur, sinon elle est muette", () => {
  assert(
    DETERMINISTIC_BUTTON_PREFIXES.includes(FEEDBACK_BUTTON_PREFIX),
    "une famille non listée retombe au dispatcher sur charge cassée",
  );
});

Deno.test("les six vocabulaires déterministes sont disjoints", () => {
  for (const a of DETERMINISTIC_BUTTON_PREFIXES) {
    for (const b of DETERMINISTIC_BUTTON_PREFIXES) {
      if (a === b) continue;
      assert(
        !a.startsWith(b) && !b.startsWith(a),
        `${a} et ${b} se recouvrent: l'ordre de lecture cesse d'être neutre`,
      );
    }
  }
});

Deno.test("readFeedbackReply relit ce que nous avons émis, et RIEN d'autre", () => {
  assertEquals(readFeedbackReply(feedbackAnswerId(MEAL, "cooked", "partly")), {
    kind: "answer",
    mealId: MEAL,
    question: "cooked",
    value: "partly",
  });
  assertEquals(readFeedbackReply(feedbackDishId(MEAL, "never_again", 2)), {
    kind: "dish",
    mealId: MEAL,
    question: "never_again",
    dishIndex: 2,
  });
  // ⚠️ « AUCUN » SE RELIT COMME UNE RÉPONSE DE PLAT SANS PLAT, pas comme une
  // option ordinaire — et c'est la bonne forme: l'appelant a UN seul cas à
  // traiter pour ces deux questions, au lieu de deux branches qui écrivent la
  // même chose. Une seconde branche « answer/none » serait inatteignable, et ce
  // dépôt appelle ça une valeur d'énumération sans branche nommée.
  assertEquals(
    readFeedbackReply(feedbackAnswerId(MEAL, "never_again", NONE_TOKEN)),
    { kind: "dish", mealId: MEAL, question: "never_again", dishIndex: null },
  );
  assertEquals(readFeedbackReply(feedbackSubjectId(MEAL, "household")), {
    kind: "subject",
    mealId: MEAL,
    subject: "household",
  });
  assertEquals(readFeedbackReply(feedbackDismissId(MEAL)), {
    kind: "dismiss",
    mealId: MEAL,
  });
});

Deno.test("une charge forgée ne devient jamais une réponse", () => {
  const forged = [
    "",
    "KEEL_STRIP_whatever",
    `${FEEDBACK_BUTTON_PREFIX}`,
    `${FEEDBACK_BUTTON_PREFIX}${MEAL}`,
    // Une valeur qui n'est pas dans l'énumération de SA question: elle
    // s'archiverait sous un CHECK plus permissif et le lecteur n'en tirerait
    // rien, en silence.
    `${FEEDBACK_BUTTON_PREFIX}${MEAL}|cooked|often`,
    `${FEEDBACK_BUTTON_PREFIX}${MEAL}|portions|yes`,
    // Une question qui n'existe pas.
    `${FEEDBACK_BUTTON_PREFIX}${MEAL}|weight|yes`,
    // Un index de plat non entier ou négatif.
    `${FEEDBACK_BUTTON_PREFIX}${MEAL}|never_again|#-1`,
    `${FEEDBACK_BUTTON_PREFIX}${MEAL}|never_again|#abc`,
    // Un sujet mal formé: il violerait le CHECK en base, et on n'y va pas.
    `${FEEDBACK_BUTTON_PREFIX}${MEAL}|portions_subject|member:marc`,
    `${FEEDBACK_BUTTON_PREFIX}${MEAL}|portions_subject|everyone`,
  ];
  for (const payload of forged) {
    assertEquals(
      readFeedbackReply(payload).kind,
      "none",
      `« ${payload} » a été relu comme une réponse`,
    );
  }
});

// ---------------------------------------------------------------------------
// L'ÉTAT — le défaut que le marqueur ferme
// ---------------------------------------------------------------------------

Deno.test("l'état vient de `answered`, PAS des colonnes de plats", () => {
  const questions = questionsFor(false);
  // Le cas exact du défaut: la ligne existe (premier tap sur `cooked`), donc
  // `never_again` vaut `[]` PAR DÉFAUT en base. Sans le marqueur, cette
  // question serait sautée — et `make_again` avec elle.
  const afterFirstTap = row({
    cooked: "partly",
    answered: ["cooked"],
    neverAgain: [],
    makeAgain: [],
  });
  assertEquals(
    nextFeedbackStep({ row: afterFirstTap, questions, subjectDue: false, foodSubjectDue: false }),
    { step: "question", question: "portions" },
  );

  const afterPortions = row({
    cooked: "partly",
    portions: "right",
    answered: ["cooked", "portions"],
  });
  assertEquals(
    nextFeedbackStep({ row: afterPortions, questions, subjectDue: false, foodSubjectDue: false }),
    // ⚠️ LOT B — `difficulty` VIENT AVANT LES PLATS, et elle n'est posée que
    // parce que `cooked` vaut `partly` (la garde `cookingQuestionsAreAsked`).
    { step: "question", question: "difficulty" },
  );

  // « Aucun » EST une réponse: le tableau reste vide, le jeton entre.
  const afterNoneTap = row({
    cooked: "partly",
    portions: "right",
    difficulty: "fine",
    speed: "fine",
    variety: "yes",
    answered: [
      "cooked",
      "portions",
      "difficulty",
      "speed",
      "enough_variety",
      "never_again",
    ],
  });
  assertEquals(
    nextFeedbackStep({ row: afterNoneTap, questions, subjectDue: false, foodSubjectDue: false }),
    { step: "question", question: "make_again" },
    "sans le marqueur, un `[]` par défaut ferait sauter cette question",
  );
});

Deno.test("la relance « pour qui ? » suit IMMÉDIATEMENT la portion", () => {
  const questions = questionsFor(false);
  const answered = row({
    cooked: "yes",
    portions: "too_much",
    answered: ["cooked", "portions"],
  });
  assertEquals(
    nextFeedbackStep({ row: answered, questions, subjectDue: true, foodSubjectDue: false }),
    { step: "portions_subject" },
    "une relance posée trois questions plus loin ne se rattache plus à rien",
  );
  // Répondue, on passe à la suite.
  assertEquals(
    nextFeedbackStep({
      row: { ...answered, portionsSubject: "household" },
      questions,
      subjectDue: true,
      foodSubjectDue: false,
    }),
    // ⚠️ LOT B — la suite est `difficulty`: `cooked: "yes"` ouvre la garde.
    { step: "question", question: "difficulty" },
  );
});

Deno.test("un refus ferme le questionnaire, définitivement", () => {
  assertEquals(
    nextFeedbackStep({
      row: row({ dismissedAt: "2026-09-01T20:10:00.000Z" }),
      questions: questionsFor(false),
      subjectDue: false, foodSubjectDue: false }),
    { step: "done" },
    "un « non merci » relancé est du harcèlement",
  );
});

Deno.test("sous plancher TCA, la liste courte est celle de `questionsFor`", () => {
  // ⛔ CE MODULE NE RE-DÉCIDE RIEN: il consomme la liste. Le test vérifie
  // qu'aucune question retirée par le plancher ne peut réapparaître ici.
  const restricted = questionsFor(true);
  // ⚠️ `portions` N'EST PAS DANS `restricted`, et c'est le point: même en
  // portant une réponse, elle ne peut pas être reposée ici — ce module
  // consomme la liste, il ne la re-décide pas.
  assertEquals(restricted.includes("portions"), false);
  const step = nextFeedbackStep({
    row: row({
      cooked: "yes",
      portions: "right",
      difficulty: "fine",
      speed: "fine",
      variety: "yes",
      answered: [
        "cooked",
        "difficulty",
        "speed",
        "enough_variety",
        "never_again",
        "make_again",
        "anything_else",
      ],
    }),
    questions: restricted,
    subjectDue: false,
    foodSubjectDue: false,
  });
  assertEquals(step, { step: "done" }, "une question retirée par le plancher a réapparu");
});

// ---------------------------------------------------------------------------
// LE RENDU — T9: les deux langues
// ---------------------------------------------------------------------------

const DISHES = [
  { title: "Poulet du lundi" },
  { title: "Poulet du lundi" }, // le moteur étend un plat en lot: dédoublonné
  { title: "Curry de lentilles" },
];

Deno.test("les titres sont dédoublonnés — un plat en lot ne fait pas quatre boutons", () => {
  assertEquals(dishTitlesOf(DISHES), ["Poulet du lundi", "Curry de lentilles"]);
  assertEquals(dishTitlesOf(null), []);
  assertEquals(dishTitlesOf([{ title: "  " }, { nope: 1 }]), []);
});

Deno.test("une question à options rend ses boutons, dans les deux langues", () => {
  for (const language of ["en", "fr"] as const) {
    const prompt = renderFeedbackQuestion({
      mealId: MEAL,
      question: "cooked",
      language,
      foodTerms: [],
      offerDismiss: true,
    });
    assert(prompt !== null);
    assert(prompt.body.length > 0, "la question EST le message");
    // 3 options + « pas maintenant »
    assertEquals(prompt.buttons.length, 4);
    assertEquals(
      prompt.buttons[3].id,
      feedbackDismissId(MEAL),
      "le refus est le dernier bouton",
    );
    for (const button of prompt.buttons) {
      assert(button.title.trim().length > 0, `libellé vide en ${language}`);
      assert(
        button.id.startsWith(FEEDBACK_BUTTON_PREFIX),
        "un identifiant hors famille ne reviendrait jamais ici",
      );
    }
  }
});

Deno.test("le « pas maintenant » n'est offert qu'une fois", () => {
  const later = renderFeedbackQuestion({
    mealId: MEAL,
    question: "portions",
    language: "fr",
    foodTerms: [],
    offerDismiss: false,
  });
  assert(later !== null);
  assert(
    !later.buttons.some((b) => b.id === feedbackDismissId(MEAL)),
    "un bouton de refus à chaque étape est une insistance qui s'excuse",
  );
});

Deno.test("une question de plat rend les plats PUIS « aucun »", () => {
  const prompt = renderFeedbackQuestion({
    mealId: MEAL,
    question: "never_again",
    language: "fr",
    foodTerms: dishTitlesOf(DISHES),
    offerDismiss: false,
  });
  assert(prompt !== null);
  assertEquals(prompt.buttons.length, 3, "2 plats + aucun");
  assertEquals(prompt.buttons[0].title, "Poulet du lundi");
  assertEquals(prompt.buttons[0].id, feedbackDishId(MEAL, "never_again", 0));
  assertEquals(prompt.buttons[2].title, "Aucun");
});

Deno.test("la liste de plats est plafonnée, et un plan sans titre ne pose pas la question", () => {
  const many = Array.from({ length: 20 }, (_, i) => `Plat ${i}`);
  const prompt = renderFeedbackQuestion({
    mealId: MEAL,
    question: "make_again",
    language: "en",
    foodTerms: many,
    offerDismiss: false,
  });
  assert(prompt !== null);
  assertEquals(prompt.buttons.length, MAX_DISH_BUTTONS + 1);

  // Un plan sans titre citable: trois boutons « #1 #2 #3 » ne demandent rien.
  assertEquals(
    renderFeedbackQuestion({
      mealId: MEAL,
      question: "make_again",
      language: "en",
      foodTerms: [],
      offerDismiss: false,
    }),
    null,
  );
});

Deno.test("la relance « pour qui ? » exige au moins une bouche nommable", () => {
  assertEquals(
    renderPortionSubjectQuestion({ mealId: MEAL, language: "fr", members: [] }),
    null,
  );
  // Une seule option (« tout le monde ») ne demande rien.
  assertEquals(
    renderPortionSubjectQuestion({
      mealId: MEAL,
      language: "fr",
      members: [{ memberId: "x", firstName: "" }],
    }),
    null,
  );
  const prompt = renderPortionSubjectQuestion({
    mealId: MEAL,
    language: "fr",
    members: [{
      memberId: "22222222-2222-4222-8222-222222222222",
      firstName: "Zoé",
    }],
  });
  assert(prompt !== null);
  assertEquals(prompt.buttons.length, 2);
  assertEquals(prompt.buttons[0].title, "Tout le monde");
  assertEquals(prompt.buttons[1].title, "Zoé");
  // ⛔ LE PRÉNOM EST UNE ÉTIQUETTE, JAMAIS UNE CHARGE. C'est l'identifiant qui
  // revient — un renommage ne casse donc rien, et aucun prénom n'a à être
  // rapproché d'un texte (« laitue » ≠ « lait », 12 faux positifs sur 12).
  assert(
    prompt.buttons[1].id.includes("member:22222222-2222-4222-8222-222222222222"),
  );
  assert(!prompt.buttons[1].id.includes("Zoé"));
});

Deno.test("toute question du vocabulaire sait se rendre — sinon elle est décorative", () => {
  // ⛔ `anything_else` EST L'EXCEPTION NOMMÉE, ET ELLE N'EST PAS POSÉE DANS LE
  // CHAT. Le flux du chat est à BOUTONS (FF-054 §3.2), et un champ libre y
  // demanderait à la personne de taper un message ordinaire — que le chemin
  // déterministe ne capte pas. Le renversement du 2026-09-03 est donc borné à
  // l'ÉCRAN: la règle « aucun champ libre » de §3.2 reste entière ICI.
  //
  // ⚠️ ET C'EST LE RENDU QUI LE TIENT: `renderFeedbackQuestion` rend `null`
  // pour elle (aucune option), et `loadChatFeedbackContext` la retire de la
  // liste. Deux gardes, parce qu'une seule laisserait une bulle vide sortir le
  // jour où quelqu'un construirait la liste ailleurs.
  const NOT_IN_CHAT: readonly string[] = ["anything_else"];
  for (const question of FEEDBACK_QUESTIONS) {
    if (NOT_IN_CHAT.includes(question)) {
      assertEquals(
        renderFeedbackQuestion({
          mealId: MEAL,
          question,
          language: "en",
          foodTerms: ["Un plat"],
          offerDismiss: false,
        }),
        null,
        `${question} se rend dans le chat alors qu'elle est à l'écran seulement`,
      );
      continue;
    }
    for (const language of ["en", "fr"] as const) {
      const prompt = renderFeedbackQuestion({
        mealId: MEAL,
        question,
        language,
        foodTerms: ["Un plat"],
        offerDismiss: false,
      });
      assert(
        prompt !== null && prompt.buttons.length > 0,
        `${question} (${language}) ne se rend pas`,
      );
    }
  }
});
