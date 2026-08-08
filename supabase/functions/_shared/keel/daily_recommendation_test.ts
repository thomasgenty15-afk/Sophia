/**
 * FF-028 — LES ÉPREUVES DU MOTEUR DE RECOMMANDATION.
 *
 * Trois familles, et la première est celle qui compte:
 *
 *   1. LES GARANTIES PAR ÉNUMÉRATION. `RECOMMENDATION_ACTIONS` est un littéral
 *      gelé, donc « aucune sortie ne porte de chiffre » et « aucune sortie ne
 *      demande moins » se PROUVENT en énumérant tout l'espace, pas en
 *      échantillonnant. C'est le patron de `hunger_signal_test.ts`, et c'est ce
 *      qui distingue une règle d'une consigne.
 *
 *   2. L'ORDRE DES GATES. Chaque gate est éprouvée seule, ET contre celle qui
 *      la précède: un gate correct dans le mauvais ordre journalise le mauvais
 *      motif, et le motif est la seule chose qui distingue « ce moteur se tait
 *      correctement » de « ce moteur ne peut pas parler ».
 *
 *   3. LES DEUX LANGUES, PARTOUT (T9). La cicatrice
 *      `guard-tested-in-one-language-only`: une garde qui ne mord que dans une
 *      langue est une garde qui n'existe pas pour la moitié des gens.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildActionSpace,
  decideDailyRecommendation,
  doctrineSurfaceText,
  effectiveRhythm,
  filterActionsByDoctrine,
  pickRecommendation,
  planFingerprint,
  readRecommendationReply,
  RECOMMENDATION_ACTION_IDS,
  RECOMMENDATION_ACTIONS,
  RECOMMENDATION_COOLDOWN_DAYS,
  RECOMMENDATION_DECLINE_STREAK_MUTE,
  RECOMMENDATION_OPEN_FOR_DAYS,
  recommendationAction,
  recommendationButtonId,
  renderRecommendation,
  SATIETY_ADAPTATIONS_BEFORE_STRUCTURE,
  selectRecommendation,
  type RecommendationDecisionInput,
} from "./daily_recommendation.ts";
import type { CoachDoctrine } from "./doctrine.ts";
import type { EatingOccasionSlot } from "./meal_generation.ts";
import type { HungerWindowSignal } from "./hunger_signal.ts";

// ---------------------------------------------------------------------------
// Décors
// ---------------------------------------------------------------------------

function rhythm(...slots: string[]): EatingOccasionSlot[] {
  return slots.map((s) => ({ slot: s, size: null })) as EatingOccasionSlot[];
}

function hunger(recurrent: boolean, days = 3): HungerWindowSignal {
  return {
    days,
    recurrent,
    windowStart: "2026-08-02",
    windowEnd: "2026-08-08",
  };
}

function doctrine(patch: Partial<CoachDoctrine> = {}): CoachDoctrine {
  return {
    coachId: "coach-1",
    version: 1,
    coachDisplayName: "Coach",
    beliefs: [],
    forbidden: [],
    vocabulary: [],
    arbitrations: [],
    foods: { discouraged: [] },
    qa: [],
    voice: {},
    dailyPractices: [],
    contentLocale: "en-GB",
    ...patch,
  };
}

/** Un décor qui PROPOSE. Chaque test n'en change qu'une chose. */
function nominal(
  patch: Partial<RecommendationDecisionInput> = {},
): RecommendationDecisionInput {
  return {
    restrictionFlag: false,
    safetyBand: "none",
    optedOut: false,
    hasActivePlan: true,
    doctrineReadable: true,
    actionSpace: buildActionSpace(rhythm("lunch", "dinner")),
    declineStreak: 0,
    cooldownBlocked: [],
    dailyAskCount: 0,
    dailyAskBudget: 1,
    hasOpenProposal: false,
    alreadyProposedToday: false,
    hunger: hunger(true),
    satietyAdaptations: SATIETY_ADAPTATIONS_BEFORE_STRUCTURE,
    ...patch,
  };
}

// ---------------------------------------------------------------------------
// 1. LES GARANTIES PAR ÉNUMÉRATION — R6, et l'espace fermé
// ---------------------------------------------------------------------------

Deno.test("R6 — aucune sortie de l'espace d'action ne porte de chiffre", () => {
  for (const action of RECOMMENDATION_ACTIONS) {
    for (
      const text of [
        action.proposal,
        action.appliedAck,
        action.declinedAck,
        action.acceptLabel,
        action.declineLabel,
      ]
    ) {
      assert(
        !/\d/.test(text),
        `${action.id}: un chiffre est entré dans « ${text} »`,
      );
    }
  }
});

Deno.test("R6 — aucune sortie ne demande MOINS", () => {
  // Le vocabulaire de la réduction, dans les deux langues. Si l'un de ces mots
  // apparaît un jour dans un texte de ce module, c'est qu'une action
  // restrictive a été ajoutée — la direction que la fiche interdit en toutes
  // lettres (« Jamais "moins" »).
  const reduction = [
    "less",
    "fewer",
    "smaller",
    "reduce",
    "cut back",
    "cut down",
    "lighter",
    "skip",
    "drop",
    "remove",
    "moins",
    "reduire",
    "réduire",
    "supprimer",
    "enlever",
    "sauter",
    "alleger",
    "alléger",
  ];
  for (const action of RECOMMENDATION_ACTIONS) {
    const haystack =
      `${action.proposal} ${action.appliedAck} ${action.declinedAck}`
        .toLowerCase();
    for (const word of reduction) {
      assert(
        !haystack.includes(word),
        `${action.id}: « ${word} » dans un texte de proposition`,
      );
    }
  }
});

Deno.test("§9 — l'espace d'action ne contient QUE du plan alimentaire", () => {
  // Le coaching de vie qui revient (« veux-tu une routine de respiration ? »)
  // est hors périmètre ABSOLU. La seule façon de l'empêcher est qu'il n'y ait
  // rien d'autre dans la liste — donc on pinne la liste.
  assertEquals([...RECOMMENDATION_ACTION_IDS], [
    "add_breakfast",
    "add_afternoon_snack",
  ]);
  assertEquals(RECOMMENDATION_ACTIONS.length, 2);
  for (const a of RECOMMENDATION_ACTIONS) {
    assert(
      ["meal_rhythm", "snack_structure"].includes(a.family),
      `${a.id}: famille hors V1`,
    );
  }
});

Deno.test("§11 — les constantes de calibrage sont pinnées", () => {
  assertEquals(SATIETY_ADAPTATIONS_BEFORE_STRUCTURE, 2);
  assertEquals(RECOMMENDATION_COOLDOWN_DAYS, 30);
  assertEquals(RECOMMENDATION_DECLINE_STREAK_MUTE, 3);
  assertEquals(RECOMMENDATION_OPEN_FOR_DAYS, 14);
});

// ---------------------------------------------------------------------------
// 2. L'ESPACE D'ACTION — pré-calculé sur l'état RÉEL
// ---------------------------------------------------------------------------

Deno.test("l'espace exclut ce que l'élève a déjà", () => {
  assertEquals(
    buildActionSpace(rhythm("lunch", "dinner")).map((a) => a.id),
    ["add_breakfast", "add_afternoon_snack"],
  );
  assertEquals(
    buildActionSpace(rhythm("breakfast", "lunch", "dinner")).map((a) => a.id),
    ["add_afternoon_snack"],
  );
  assertEquals(
    buildActionSpace(rhythm("breakfast", "lunch", "snack_pm", "dinner")),
    [],
  );
});

Deno.test("un rythme non déclaré vaut le rythme PAR DÉFAUT, pas le vide", () => {
  // Le défaut du produit est petit-déj / déjeuner / dîner. Lire la colonne au
  // pied de la lettre ferait proposer un petit-déjeuner à quelqu'un qui en
  // reçoit déjà un — la plus visible des incohérences.
  const eff = effectiveRhythm([]);
  assertEquals(eff.map((r) => r.slot), ["breakfast", "lunch", "dinner"]);
  assertEquals(buildActionSpace(eff).map((a) => a.id), ["add_afternoon_snack"]);
});

Deno.test("R3 — un choix hors espace ne produit PAS de proposition", () => {
  const space = buildActionSpace(rhythm("breakfast", "lunch", "dinner"));
  assertEquals(selectRecommendation(space, "add_breakfast"), null);
  assertEquals(selectRecommendation(space, "breathing_routine"), null);
  assertEquals(selectRecommendation(space, ""), null);
  assertEquals(
    selectRecommendation(space, "add_afternoon_snack")?.id,
    "add_afternoon_snack",
  );
});

Deno.test("le sélecteur V1 préfère le levier structurel", () => {
  const both = buildActionSpace(rhythm("lunch", "dinner"));
  assertEquals(pickRecommendation(both)?.id, "add_breakfast");
  assertEquals(pickRecommendation([]), null);
});

// ---------------------------------------------------------------------------
// 3. R5 — LA DOCTRINE FILTRE, DANS LES DEUX LANGUES (T9)
// ---------------------------------------------------------------------------

Deno.test("R5 — un coach qui prescrit le jeûne du matin: pas de petit-déjeuner (EN)", () => {
  const d = doctrine({
    beliefs: [{
      key: "fasted_morning",
      claim: "We train fasted and the first meal of the day is lunch.",
      rationale: "The morning fasting window is where the work happens.",
      goalScope: [],
    }],
  });
  const out = filterActionsByDoctrine(
    buildActionSpace(rhythm("lunch", "dinner")),
    d,
  );
  assertEquals(out.kept.map((a) => a.id), ["add_afternoon_snack"]);
  assert(out.removed.some((r) => r.id === "add_breakfast"));
});

Deno.test("R5 — le même coach, en français", () => {
  const d = doctrine({
    beliefs: [{
      key: "jeune_du_matin",
      claim: "On s'entraîne à jeun le matin, le premier repas est le déjeuner.",
      rationale: "La fenêtre alimentaire commence à midi.",
      goalScope: [],
    }],
  });
  const out = filterActionsByDoctrine(
    buildActionSpace(rhythm("lunch", "dinner")),
    d,
  );
  assertEquals(out.kept.map((a) => a.id), ["add_afternoon_snack"]);
});

Deno.test("R5 — un coach anti-grignotage: pas de collation (EN et FR)", () => {
  const en = filterActionsByDoctrine(
    buildActionSpace(rhythm("breakfast", "lunch", "dinner")),
    doctrine({
      beliefs: [{
        key: "three_meals",
        claim: "Three meals a day, nothing between meals.",
        rationale: null,
        goalScope: [],
      }],
    }),
  );
  assertEquals(en.kept, []);

  const fr = filterActionsByDoctrine(
    buildActionSpace(rhythm("breakfast", "lunch", "dinner")),
    doctrine({
      beliefs: [{
        key: "pas_de_grignotage",
        claim: "Trois repas par jour, pas de grignotage entre les repas.",
        rationale: null,
        goalScope: [],
      }],
    }),
  );
  assertEquals(fr.kept, []);
});

Deno.test("R5 — le verrou d'interdits mord aussi, par ses formulations de surface", () => {
  const d = doctrine({
    forbidden: [{
      token: "morning_meal",
      surfaceForms: ["breakfast", "petit-déjeuner"],
      reason: "il casse le jeûne",
      instead: "un café noir et on attend midi",
    }],
  });
  const out = filterActionsByDoctrine(
    buildActionSpace(rhythm("lunch", "dinner")),
    d,
  );
  assertEquals(out.kept.map((a) => a.id), ["add_afternoon_snack"]);
  assert(
    out.removed.some((r) => r.reason.startsWith("forbidden:")),
    "le verrou d'interdits n'a pas mordu",
  );
});

Deno.test("R5 — un coach qui PARLE de petit-déjeuner sans l'interdire n'est pas taillé", () => {
  // La contre-indication est une EXCLUSION, pas le sujet. Un coach dont la
  // conviction est « le petit-déjeuner doit tenir jusqu'au déjeuner » serait
  // taillé par sa propre méthode si on matchait le mot.
  const d = doctrine({
    beliefs: [{
      key: "filling_breakfast",
      claim: "Breakfast should hold you until lunch.",
      rationale: "Protein first thing.",
      goalScope: [],
    }],
  });
  const out = filterActionsByDoctrine(
    buildActionSpace(rhythm("lunch", "dinner")),
    d,
  );
  assertEquals(out.kept.map((a) => a.id), [
    "add_breakfast",
    "add_afternoon_snack",
  ]);
});

Deno.test("aucune doctrine publiée ⇒ rien à contredire, rien de filtré", () => {
  const out = filterActionsByDoctrine(
    buildActionSpace(rhythm("lunch", "dinner")),
    null,
  );
  assertEquals(out.kept.length, 2);
  assertEquals(out.removed, []);
  assertEquals(doctrineSurfaceText(null), "");
});

Deno.test("la surface de doctrine ratisse TOUTES les sections", () => {
  const d = doctrine({
    arbitrations: [{
      situation: "il a faim le matin",
      coachAnswer: "On ne casse pas le jeûne, on avance le déjeuner.",
      goalScope: [],
    }],
    qa: [{ question: "café ?", answer: "Oui, pendant la fenêtre alimentaire." }],
  });
  const surface = doctrineSurfaceText(d);
  assert(surface.includes("fenetre alimentaire"), surface);
  const out = filterActionsByDoctrine(
    buildActionSpace(rhythm("lunch", "dinner")),
    d,
  );
  assertEquals(out.kept.map((a) => a.id), ["add_afternoon_snack"]);
});

// ---------------------------------------------------------------------------
// 4. LES GATES, ET LEUR ORDRE (§4)
// ---------------------------------------------------------------------------

Deno.test("le cas nominal propose, une fois, avec une action de l'espace", () => {
  const d = decideDailyRecommendation(nominal());
  assertEquals(d.decision, "propose");
  if (d.decision !== "propose") return;
  assertEquals(d.action.id, "add_breakfast");
});

Deno.test("R4 — sous plancher de restriction: MUET, et le motif le dit", () => {
  assertEquals(
    decideDailyRecommendation(nominal({ restrictionFlag: true })),
    { decision: "silent", reason: "restriction_flag" },
  );
});

Deno.test("R4 — le plancher passe AVANT tout le reste", () => {
  // Un élève sous plancher ET hors budget ET sans plan doit se lire
  // `restriction_flag`. Sinon le compte-rendu dirait qu'on s'est tu pour une
  // raison de cadence, et le jour où le plancher casserait, personne ne le
  // verrait.
  assertEquals(
    decideDailyRecommendation(nominal({
      restrictionFlag: true,
      hasActivePlan: false,
      dailyAskCount: 5,
      declineStreak: 9,
      hunger: hunger(false),
    })).decision === "silent" &&
      decideDailyRecommendation(nominal({
        restrictionFlag: true,
        hasActivePlan: false,
        dailyAskCount: 5,
        declineStreak: 9,
        hunger: hunger(false),
      })).reason,
    "restriction_flag",
  );
});

Deno.test("la bande de sécurité fait taire; `null` est permissif et déclaré", () => {
  for (const band of ["low", "medium", "high", "critical"] as const) {
    assertEquals(
      decideDailyRecommendation(nominal({ safetyBand: band })),
      { decision: "silent", reason: "safety_band" },
    );
  }
  assertEquals(
    decideDailyRecommendation(nominal({ safetyBand: null })).decision,
    "propose",
  );
});

Deno.test("mute, plan absent, doctrine illisible: trois silences nommés", () => {
  assertEquals(
    decideDailyRecommendation(nominal({ optedOut: true })).decision === "silent" &&
      decideDailyRecommendation(nominal({ optedOut: true })).reason,
    "opted_out",
  );
  assertEquals(
    decideDailyRecommendation(nominal({ hasActivePlan: false })).decision ===
        "silent" &&
      decideDailyRecommendation(nominal({ hasActivePlan: false })).reason,
    "no_active_plan",
  );
  assertEquals(
    decideDailyRecommendation(nominal({ doctrineReadable: false })).decision ===
        "silent" &&
      decideDailyRecommendation(nominal({ doctrineReadable: false })).reason,
    "doctrine_unreadable",
  );
});

Deno.test("§10 — trois refus consécutifs éteignent le moteur", () => {
  assertEquals(
    decideDailyRecommendation(nominal({ declineStreak: 2 })).decision,
    "propose",
  );
  assertEquals(
    decideDailyRecommendation(nominal({ declineStreak: 3 })),
    { decision: "silent", reason: "decline_streak_muted" },
  );
  assertEquals(
    decideDailyRecommendation(nominal({ declineStreak: 7 })),
    { decision: "silent", reason: "decline_streak_muted" },
  );
});

Deno.test("un espace vidé par la doctrine se lit `no_action_available`", () => {
  assertEquals(
    decideDailyRecommendation(nominal({ actionSpace: [] })),
    { decision: "silent", reason: "no_action_available" },
  );
});

Deno.test("T4 — le budget de demande PARTAGÉ fait attendre demain", () => {
  assertEquals(
    decideDailyRecommendation(nominal({ dailyAskCount: 1, dailyAskBudget: 1 })),
    { decision: "silent", reason: "daily_ask_budget" },
  );
  // Et le fail-closed du module de budget (lecture ratée ⇒ count = budget)
  // arrive donc ici comme un silence, pas comme une proposition.
  assertEquals(
    decideDailyRecommendation(nominal({ dailyAskCount: 99, dailyAskBudget: 1 }))
      .decision,
    "silent",
  );
});

Deno.test("T4 — le budget passe AVANT le cooldown (ordre de la fiche)", () => {
  const d = decideDailyRecommendation(nominal({
    dailyAskCount: 1,
    cooldownBlocked: ["add_breakfast", "add_afternoon_snack"],
  }));
  assertEquals(d, { decision: "silent", reason: "daily_ask_budget" });
});

Deno.test("R8 — le cooldown écarte l'action refusée, pas les autres", () => {
  const partial = decideDailyRecommendation(
    nominal({ cooldownBlocked: ["add_breakfast"] }),
  );
  assertEquals(partial.decision, "propose");
  if (partial.decision === "propose") {
    assertEquals(partial.action.id, "add_afternoon_snack");
  }
  assertEquals(
    decideDailyRecommendation(nominal({
      cooldownBlocked: ["add_breakfast", "add_afternoon_snack"],
    })),
    { decision: "silent", reason: "cooldown" },
  );
});

Deno.test("une proposition déjà partie aujourd'hui ne se double pas", () => {
  assertEquals(
    decideDailyRecommendation(nominal({ alreadyProposedToday: true })),
    { decision: "silent", reason: "already_proposed_today" },
  );
});

Deno.test("🔴 une proposition SANS RÉPONSE ne se re-pose pas le lendemain", () => {
  // Le défaut mesuré en run réel: trois soirs, trois bulles, la même question,
  // sur des données inchangées. « Le silence n'est pas une demande de rappel. »
  assertEquals(
    decideDailyRecommendation(nominal({ hasOpenProposal: true })),
    { decision: "silent", reason: "awaiting_response" },
  );
  // Et le motif est DISTINCT de `already_proposed_today`: une proposition
  // RÉPONDUE aujourd'hui ferme la journée sans être « en attente ».
  assertEquals(
    decideDailyRecommendation(
      nominal({ hasOpenProposal: false, alreadyProposedToday: true }),
    ),
    { decision: "silent", reason: "already_proposed_today" },
  );
});

Deno.test("R2 — « rien » est le cas nominal, et il faut LES DEUX conditions", () => {
  // Faim récurrente mais aucune adaptation tentée: la réponse de FF-027
  // (composer plus rassasiant) n'a même pas encore été essayée.
  assertEquals(
    decideDailyRecommendation(nominal({ satietyAdaptations: 0 })),
    { decision: "silent", reason: "nothing_significant" },
  );
  assertEquals(
    decideDailyRecommendation(nominal({ satietyAdaptations: 1 })),
    { decision: "silent", reason: "nothing_significant" },
  );
  // Deux adaptations mais plus de faim: il n'y a rien à réparer.
  assertEquals(
    decideDailyRecommendation(nominal({ hunger: hunger(false, 1) })),
    { decision: "silent", reason: "nothing_significant" },
  );
  // Les deux ⇒ proposition.
  assertEquals(
    decideDailyRecommendation(nominal({ satietyAdaptations: 2 })).decision,
    "propose",
  );
});

// ---------------------------------------------------------------------------
// 5. L'EMPREINTE DU PLAN (§5)
// ---------------------------------------------------------------------------

Deno.test("l'empreinte est stable à l'ordre près et sensible au rythme", () => {
  const a = planFingerprint({
    rhythm: rhythm("lunch", "dinner"),
    doctrineVersion: 3,
  });
  const b = planFingerprint({
    rhythm: rhythm("dinner", "lunch"),
    doctrineVersion: 3,
  });
  assertEquals(a, b, "l'ordre de saisie ne doit pas changer l'empreinte");

  const withBreakfast = planFingerprint({
    rhythm: rhythm("breakfast", "lunch", "dinner"),
    doctrineVersion: 3,
  });
  assert(withBreakfast !== a, "un rythme modifié doit changer l'empreinte");

  const newDoctrine = planFingerprint({
    rhythm: rhythm("lunch", "dinner"),
    doctrineVersion: 4,
  });
  assert(newDoctrine !== a, "une doctrine republiée doit changer l'empreinte");

  assertEquals(
    planFingerprint({ rhythm: rhythm("lunch"), doctrineVersion: null }),
    "rhythm=lunch|doctrine=none",
  );
});

// ---------------------------------------------------------------------------
// 6. LES BOUTONS — déterministes, et hostiles à ce qu'ils n'ont pas émis
// ---------------------------------------------------------------------------

const UUID = "0f1e2d3c-4b5a-6978-8765-43210fedcba9";

Deno.test("l'aller-retour du payload est exact", () => {
  assertEquals(
    readRecommendationReply(recommendationButtonId("accept", UUID)),
    { kind: "accept", proposalId: UUID },
  );
  assertEquals(
    readRecommendationReply(recommendationButtonId("decline", UUID)),
    { kind: "decline", proposalId: UUID },
  );
});

Deno.test("tout ce qui n'est pas un payload de recommandation rend `none`", () => {
  for (
    const payload of [
      null,
      undefined,
      "",
      "   ",
      "KEEL_PULSE_GOOD",
      "KEEL_PULSE_AXIS_HUNGER",
      "KEEL_RECO_",
      "KEEL_RECO_ACCEPT",
      "KEEL_RECO_ACCEPT_",
      // Un identifiant qui n'est pas un UUID ne doit pas atteindre la base.
      "KEEL_RECO_ACCEPT_1 or 1=1",
      "KEEL_RECO_ACCEPT_../../etc/passwd",
      `KEEL_RECO_MAYBE_${UUID}`,
      `KEEL_RECO_ACCEPT_${UUID}x`,
      "oui",
      "yes, add it",
    ]
  ) {
    assertEquals(
      readRecommendationReply(payload as string | null),
      { kind: "none" },
      `payload accepté à tort: ${JSON.stringify(payload)}`,
    );
  }
});

Deno.test("le rendu porte TOUJOURS deux boutons, jamais zéro", () => {
  for (const action of RECOMMENDATION_ACTIONS) {
    const msg = renderRecommendation(action, UUID);
    assertEquals(msg.buttons.length, 2);
    assertEquals(msg.body, action.proposal);
    assertEquals(
      readRecommendationReply(msg.buttons[0].payload),
      { kind: "accept", proposalId: UUID },
    );
    assertEquals(
      readRecommendationReply(msg.buttons[1].payload),
      { kind: "decline", proposalId: UUID },
    );
  }
});

Deno.test("une action inconnue venue de la base lève, elle n'est pas devinée", () => {
  let threw = false;
  try {
    // deno-lint-ignore no-explicit-any
    recommendationAction("add_midnight_feast" as any);
  } catch {
    threw = true;
  }
  assert(threw, "une action hors liste a été résolue en silence");
});
