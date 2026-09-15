/**
 * FF-012 — PROPRIÉTÉ: SUR VINGT TOURS ORDINAIRES CONSÉCUTIFS, LE CHAT NE
 * RÉCLAME AUCUN FAIT ALIMENTAIRE.
 *
 * ── POURQUOI UN TEST DE PROPRIÉTÉ, ET PAS UNE RELECTURE DE PROMPT ──────────
 * R6 de la fiche le dit en une phrase: « un prompt sait redevenir bavard à la
 * prochaine retouche. Le dépôt a mesuré que les correctifs prompt-only
 * régressent en run réel. » Une relecture prouve l'état d'un fichier un jour
 * donné; ce fichier-ci échoue le jour où quelqu'un rebranche la sollicitation,
 * quel que soit l'endroit par lequel il la rebranche.
 *
 * ── CE QU'IL VÉRIFIE, ET SUR QUOI ──────────────────────────────────────────
 * Sur les surfaces DÉTERMINISTES, celles qui décident — pas sur une réponse de
 * modèle, qui ne prouverait qu'un tirage:
 *
 *   1. le gate de la question de précision, tour après tour, sur vingt tours
 *      ordinaires: zéro question armée;
 *   2. le plafond du jour: la première question passe, la seconde jamais;
 *   3. le compagnon: plus aucune consigne de POSER, dans les deux packs de
 *      langue — c'est le rythme d'engagement qui est retiré;
 *   4. le bloc KEEL: l'interdiction de réclamer un repas est bien là, et elle
 *      y est dans les deux états (avec et sans matière).
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  gateMealPrecisionQuestion,
  MEAL_PRECISION_DAILY_CAP,
  type MealPrecisionAssessment,
} from "../../../_shared/keel/meal_precision.ts";
import {
  decideAskCadence,
  decideDailyPulse,
  pulseContextBlock,
} from "../../../_shared/keel/daily_pulse.ts";
import { buildCompanionSystemPrompt } from "../../agents/companion.ts";

const TURNS = 20;

/** Une évaluation qui, laissée à elle-même, VOUDRAIT poser une question. */
function willingAssessment(): MealPrecisionAssessment {
  return {
    axes: ["slot"],
    primary: "slot",
    reason_code: "declaration_is_vague",
    slot_candidates: [],
  } as unknown as MealPrecisionAssessment;
}

// ---------------------------------------------------------------------------
// 1. VINGT TOURS ORDINAIRES — zéro demande
// ---------------------------------------------------------------------------

Deno.test("PROPRIÉTÉ — 20 tours ordinaires consécutifs, ZÉRO demande alimentaire", () => {
  // « Ordinaire » = l'élève n'a rien déclaré. `committedEventCount = 0` est la
  // définition exacte d'un tour sans fait à approfondir, et c'est le seul
  // état dans lequel une question serait une COLLECTE plutôt qu'un
  // approfondissement.
  let asked = 0;
  const reasons = new Set<string>();
  for (let turn = 0; turn < TURNS; turn++) {
    const result = gateMealPrecisionQuestion({
      assessment: willingAssessment(),
      locale: turn % 2 === 0 ? "fr-FR" : "en-GB",
      safetyBand: null,
      futureIntent: false,
      committedEventCount: 0,
      questionsAskedToday: 0,
      flowAlreadyOpen: false,
    });
    if (result.ask) asked++;
    reasons.add(result.reason_code);
  }
  assertEquals(asked, 0, `${asked} demande(s) sur ${TURNS} tours ordinaires`);
  assertEquals([...reasons], ["no_committed_fact"]);
});

Deno.test("PROPRIÉTÉ — 20 tours consécutifs APRÈS un fait: une seule question, jamais deux", () => {
  // Le cas le plus dur: l'élève déclare, donc une question serait légitime. Le
  // plafond du jour doit en laisser passer UNE et exactement une, quel que soit
  // le nombre de tours qui suivent.
  let asked = 0;
  for (let turn = 0; turn < TURNS; turn++) {
    const result = gateMealPrecisionQuestion({
      assessment: willingAssessment(),
      locale: "fr-FR",
      safetyBand: null,
      futureIntent: false,
      committedEventCount: 1,
      // Le compteur est PERSISTANT (`meal_precision_questions`), donc il
      // s'incrémente d'un tour à l'autre — c'est ce qui distingue un plafond
      // d'une intention.
      questionsAskedToday: asked,
      flowAlreadyOpen: false,
    });
    if (result.ask) asked++;
  }
  assertEquals(asked, 1, `${asked} question(s) posées dans la journée`);
  assertEquals(MEAL_PRECISION_DAILY_CAP, 1);
});

Deno.test("PROPRIÉTÉ — les refus existants ne sont pas perdus en chemin", () => {
  // R4 de la fiche: « à ne pas perdre ». Une bande de safety et une intention
  // future ferment toujours, sur les vingt tours.
  for (let turn = 0; turn < TURNS; turn++) {
    assertEquals(
      gateMealPrecisionQuestion({
        assessment: willingAssessment(),
        locale: "fr-FR",
        safetyBand: "amber",
        futureIntent: false,
        committedEventCount: 1,
        questionsAskedToday: 0,
        flowAlreadyOpen: false,
      }).reason_code,
      "safety_band",
    );
    assertEquals(
      gateMealPrecisionQuestion({
        assessment: willingAssessment(),
        locale: "en-GB",
        safetyBand: null,
        futureIntent: true,
        committedEventCount: 1,
        questionsAskedToday: 0,
        flowAlreadyOpen: false,
      }).reason_code,
      "future_intent",
    );
  }
});

// ---------------------------------------------------------------------------
// 2. LE RYTHME DE QUESTION NE SURVIT PAS (R5)
// ---------------------------------------------------------------------------

/**
 * L'état de rythme d'un élève qui n'a reçu AUCUNE question depuis longtemps —
 * exactement la situation où l'ancien mécanisme émettait `ask_now`.
 */
function silentRhythmState(turnsSince: number) {
  return {
    risk_level: 0,
    temp_memory: {
      companion_question_rhythm: {
        preference: "high",
        recent_turns: [0, 0, 0, 0, 0, 0],
        turns_since_last_question: turnsSince,
      },
    },
  };
}

Deno.test("PROPRIÉTÉ — après N tours sans question, le prompt n'en RÉCLAME jamais une", () => {
  // C'est le mécanisme que R5 retire: « poser une question parce qu'on n'en a
  // pas posé depuis six tours est la définition de la sollicitation ».
  for (const locale of ["fr-FR", "en-GB"]) {
    for (let turnsSince = 0; turnsSince <= TURNS; turnsSince++) {
      const prompt = buildCompanionSystemPrompt({
        responseLocale: locale,
        isWhatsApp: false,
        lastAssistantMessage: "ok",
        context: "",
        userState: silentRhythmState(turnsSince),
      });
      const where = `${locale} @ ${turnsSince} tours`;
      // Le jeton lui-même a disparu du vocabulaire.
      assertEquals(prompt.includes("ask_now"), false, `ask_now présent — ${where}`);
      // Et aucune formulation ne le remplace.
      assertEquals(
        /Ideally ask 1 useful question/i.test(prompt),
        false,
        `consigne de poser (EN) — ${where}`,
      );
      assertEquals(
        /Pose idealement 1 question/i.test(prompt),
        false,
        `consigne de poser (FR) — ${where}`,
      );
      // Aucune cible chiffrée: une cadence est un quota.
      assertEquals(
        /environ 1 question tous les|about 1 question every/i.test(prompt),
        false,
        `cible de cadence — ${where}`,
      );
    }
  }
});

Deno.test("...ET SA CONDITION DE DÉSARMEMENT: la RETENUE, elle, survit", () => {
  // Retirer le plafond en même temps que la poussée rendrait l'agent PLUS
  // libre de demander — l'inverse exact de la fiche. Le compteur ne dit plus
  // « il est temps de demander »; il dit « tu en as déjà assez demandé ».
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: false,
    lastAssistantMessage: "ok",
    context: "",
    userState: {
      risk_level: 0,
      temp_memory: {
        companion_question_rhythm: {
          preference: "normal",
          recent_turns: [1, 1, 1, 1, 1, 1],
          turns_since_last_question: 0,
        },
      },
    },
  });
  assert(prompt.includes("avoid_now"), "le plafond doit toujours pouvoir fermer");
  assert(prompt.includes("Aucun quota ni cadence"));
});

// ---------------------------------------------------------------------------
// 3. L'INTERDICTION EXPLICITE DE RÉCLAMER UN REPAS
// ---------------------------------------------------------------------------

Deno.test("PROPRIÉTÉ — l'interdiction de réclamer un repas est là dans les DEUX états", () => {
  // Avec matière comme sans: c'est justement quand l'agent ne sait rien qu'il
  // est le plus tenté de demander pour occuper le tour.
  for (
    const pulse of [
      { localDate: "2026-08-07", level: "hard" as const, axis: null, daysAgo: 1 },
      null,
    ]
  ) {
    for (const hasAxes of [true, false]) {
      const block = pulseContextBlock(pulse, hasAxes);
      assert(
        block.includes("NEVER ask what they ate"),
        "l'interdiction alimentaire doit être dans le bloc KEEL",
      );
      assert(block.includes("never collect"));
    }
  }
});

// ---------------------------------------------------------------------------
// 4. L'AUTRE DEMANDE NON SOLLICITÉE: « COMMENT TU TE SENS ? »
//
// Le filet du chantier nomme TROIS interdits, pas un: « ni "t'as mangé quoi ?",
// ni "comment tu te sens ?", ni relance d'une question restée sans réponse ».
// Les blocs 1 à 3 ne couvraient que le premier — l'état et la relance
// n'existaient que dans les tests d'unité de `daily_pulse`, donc rien ne les
// tenait ENSEMBLE, sur le même élève, tour après tour.
//
// La cadence elle-même (⌈7/3⌉ sur sept jours) est prouvée dans
// `daily_pulse_test.ts`, où vit la constante. Ici on prouve la propriété
// CONVERSATIONNELLE: quel que soit ce que l'élève a tapé ou pas, le contexte
// injecté à chaque tour INTERDIT la question d'état au lieu de l'inviter.
// ---------------------------------------------------------------------------

/** Les formulations que la fiche nomme, et leurs variantes adoucies. */
const STATE_ASK_PATTERNS: RegExp[] = [
  /how('s| is) your energy/i,
  /how are you sleeping/i,
  /how('s| has) your appetite/i,
  /how do you feel/i,
  /how are you feeling/i,
  /rate your/i,
  /comment tu te sens/i,
  /comment te sens-tu/i,
];

Deno.test("PROPRIÉTÉ — 20 tours consécutifs, le contexte n'invite JAMAIS la question d'état", () => {
  // On balaie les états qui existent réellement: aucun tap, un tap récent, un
  // tap ancien, avec et sans les six axes du dimanche. C'est le produit cartésien
  // des situations dans lesquelles un prompt bavard irait « prendre des
  // nouvelles » pour occuper le tour.
  for (let turn = 0; turn < TURNS; turn++) {
    const pulse = turn % 3 === 0 ? null : {
      localDate: "2026-08-07",
      level: (turn % 2 === 0 ? "hard" : "good") as "hard" | "good",
      axis: null,
      daysAgo: turn % 5,
    };
    for (const hasAxes of [true, false]) {
      const block = pulseContextBlock(pulse, hasAxes);
      const where = `tour ${turn}, axes=${hasAxes}`;

      // L'interdiction est LÀ, dans les deux états.
      assert(
        block.includes("NEVER ask about them"),
        `interdiction d'état absente — ${where}`,
      );
      assert(
        block.includes("NEVER ASK AGAIN"),
        `en-tête « déjà collecté » absent — ${where}`,
      );

      // Et aucune formulation de la question ne survit AILLEURS que dans la
      // liste des interdits. Le bloc les CITE pour les interdire, donc on
      // vérifie que chaque citation reste du côté « NEVER ».
      const banIndex = block.indexOf("NEVER ask about them");
      for (const pattern of STATE_ASK_PATTERNS) {
        const match = pattern.exec(block);
        if (!match) continue;
        assert(
          match.index > banIndex,
          `« ${match[0]} » apparaît AVANT l'interdiction — ${where}`,
        );
      }
    }
  }
});

Deno.test("PROPRIÉTÉ — le compte des collectes ne mentionne le dimanche que s'il existe", () => {
  // R4: les six notes du dimanche ne se collectent que là où un coach humain les
  // lit. Dire « every Sunday in six ratings » à un élève à qui on ne les demande
  // plus est un fait FAUX dans le seul bloc censé dire au modèle ce qu'il sait
  // déjà — et c'est ce genre de phrase qui autorise ensuite le modèle à réclamer
  // une donnée « manquante ».
  const withAxes = pulseContextBlock(null, true);
  assert(withAxes.includes("every Sunday in six ratings"));

  const withoutAxes = pulseContextBlock(null, false);
  assertEquals(withoutAxes.includes("six ratings"), false);
  assertEquals(withoutAxes.includes("every Sunday"), false);
  // L'interdiction, elle, est identique: elle ne dépend pas du nombre de
  // collectes mais du fait que personne ne consomme la réponse.
  assert(withoutAxes.includes("NEVER ask about them"));
  assert(withoutAxes.includes("nothing downstream reads the answer"));
});

// ---------------------------------------------------------------------------
// 5. LA RELANCE D'UNE QUESTION RESTÉE SANS RÉPONSE
//
// Troisième interdit du filet, et le plus facile à réintroduire par accident: un
// silence se lit très naturellement comme « il n'a pas vu, renvoie ». Deux
// chemins doivent tenir, et il faut LES DEUX — la garde du jour empêche le
// second tick de la même soirée (la fenêtre fait deux heures, le cron est
// horaire), le repli empêche le lendemain.
// ---------------------------------------------------------------------------

Deno.test("PROPRIÉTÉ — 20 soirs de silence: aucune relance, et le repli s'allonge", () => {
  // Le pire cas: un élève à qui on a envoyé le message et qui ne répond jamais.
  let sends = 0;
  let asks = 0;
  let daysSinceLastAsk: number | null = null;
  let unansweredStreak = 0;

  for (let day = 0; day < TURNS; day++) {
    const cadence = decideAskCadence({
      daysSinceLastAsk,
      lastAnsweredLevel: null,
      unansweredStreak,
    });

    // Deux ticks dans la fenêtre de deux heures, comme en production.
    let sentToday = false;
    for (const hour of [20, 21]) {
      const decision = decideDailyPulse({
        localHour: hour,
        answeredToday: false,
        sentToday,
        minutesSinceLastExchange: null,
        hasGround: true,
        askDue: cadence.ask,
        safetyBand: null,
        hasActivePlan: true,
      });
      if (decision.decision === "send") {
        sends++;
        sentToday = true;
        if (decision.ask) asks++;
      } else if (hour === 21) {
        // Le second tick doit être refusé POUR LA BONNE RAISON.
        assertEquals(decision.reason, "already_sent_today", `jour ${day}`);
      }
    }

    if (cadence.ask) {
      unansweredStreak++;
      daysSinceLastAsk = 1;
    } else if (daysSinceLastAsk !== null) {
      daysSinceLastAsk++;
    }
  }

  // Un message par soir au maximum: jamais deux dans la même fenêtre.
  assertEquals(sends, TURNS, `${sends} envois sur ${TURNS} soirs`);
  // Et sur vingt soirs de silence, une poignée de questions — pas vingt. Le
  // chiffre EN DUR: sans repli ce serait ~7, avec repli 4. Le pinner est ce qui
  // fait tomber le test si quelqu'un « répare » le silence en relançant.
  assertEquals(asks <= 4, true, `${asks} questions sur ${TURNS} soirs de silence`);
});

Deno.test("PROPRIÉTÉ — la question de précision N'EST PAS supprimée (hors périmètre)", () => {
  // La fiche est explicite: on la PLAFONNE, on ne la retire pas. Elle est
  // adossée à un fait déjà donné, ses gabarits sont fermés, et aucun ne
  // demande de quantité. Un test qui prouverait « zéro question jamais »
  // prouverait qu'on a supprimé la mauvaise chose.
  const result = gateMealPrecisionQuestion({
    assessment: willingAssessment(),
    locale: "fr-FR",
    safetyBand: null,
    futureIntent: false,
    committedEventCount: 1,
    questionsAskedToday: 0,
    flowAlreadyOpen: false,
  });
  assertEquals(result.ask, true);
  assert(result.question && result.question.length > 0);
});
