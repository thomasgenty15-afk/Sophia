import type { WeeklyProgressReviewV2 } from "./weekly_progress_review.ts";
import type {
  WeeklyHabitVerdictStatus,
  WeeklyReviewDecision,
  WeeklyStrategyDecision,
} from "./weekly_review/contract.ts";
import { reduceWeeklyReview } from "./weekly_review/reducer.ts";
import { renderWeeklyReviewDecision } from "./weekly_review/renderer.ts";

export type { WeeklyHabitVerdictStatus } from "./weekly_review/contract.ts";

export type WeeklyAdaptiveDecision = Exclude<WeeklyStrategyDecision, "hold">;

export type WeeklyAdaptiveReview = {
  version: 1;
  status:
    | "ask_question"
    | "ready_for_confirmation"
    | "no_change"
    | "escalate_level_review";
  skill_decision: WeeklyReviewDecision;
  habit_verdict: {
    status: WeeklyHabitVerdictStatus;
    completion_rate: number;
    planned_count: number;
    done_points: number;
    reason: string;
  };
  human_signals: WeeklyReviewDecision["human_signals"];
  daily_evidence_summary: {
    source: "daily_action_review_v1";
    coverage: "complete" | "partial" | "low" | "none";
    covered_count: number;
    action_count: number;
    dominant_blockers: string[];
    rescheduled_open_count: number;
    not_answered_count: number;
    confidence: "high" | "medium" | "low";
  };
  week_strategy: {
    decision: WeeklyAdaptiveDecision;
    reason: string;
    preserve_level_objective: true;
    preserve_level_architecture: true;
  };
  question: {
    id: string;
    text: string;
    reason: string;
    blocks_decision: boolean;
  } | null;
  item_decisions: Array<{
    plan_item_id: string;
    occurrence_id: string;
    title: string;
    family: "habit" | "mission" | "clarification" | "other";
    current_week_status:
      | "done"
      | "partial"
      | "missed"
      | "rescheduled"
      | "not_answered"
      | "unknown";
    evidence_done: boolean;
    daily_evidence: {
      source: "daily_action_review_v1" | "conversation" | "dashboard" | "none";
      reason_category: string | null;
      reason_text: string | null;
      still_relevant: boolean | null;
      reschedule_decision: string | null;
      confidence: "high" | "medium" | "low" | "none";
    };
    decision:
      | "keep"
      | "mark_completed"
      | "carry_over"
      | "drop"
      | "repeat_with_week"
      | "bridge_with_week"
      | "split_or_replace"
      | "escalate_level_review";
    reason: string;
  }>;
  plan_patch: WeeklyReviewDecision["plan_patch"];
  effect_plan: WeeklyReviewDecision["effect_plan"];
  safety: {
    forbidden_operations: string[];
    warnings: string[];
  };
};

function legacyStatus(
  decision: WeeklyReviewDecision,
): WeeklyAdaptiveReview["status"] {
  if (decision.status === "escalate_level_review") {
    return "escalate_level_review";
  }
  if (decision.status === "no_change") return "no_change";
  if (decision.status === "ready_for_confirmation") {
    return "ready_for_confirmation";
  }
  return "ask_question";
}

function legacyStrategy(
  decision: WeeklyReviewDecision,
): WeeklyAdaptiveReview["week_strategy"] {
  const strategy = decision.week_strategy.decision === "hold"
    ? "repeat_week"
    : decision.week_strategy.decision;
  return {
    decision: strategy,
    reason: decision.week_strategy.reason,
    preserve_level_objective: true,
    preserve_level_architecture: true,
  };
}

export function buildWeeklyAdaptiveReview(
  review: WeeklyProgressReviewV2,
): WeeklyAdaptiveReview {
  const decision = reduceWeeklyReview(review);
  return {
    version: 1,
    status: legacyStatus(decision),
    skill_decision: decision,
    habit_verdict: decision.habit_verdict,
    human_signals: decision.human_signals,
    daily_evidence_summary: {
      source: "daily_action_review_v1",
      coverage: decision.evidence.daily_coverage,
      covered_count: decision.evidence.covered_count,
      action_count: decision.evidence.planned_count,
      dominant_blockers: decision.evidence.dominant_blockers,
      rescheduled_open_count: decision.evidence.rescheduled_count,
      not_answered_count: decision.evidence.unanswered_count,
      confidence: decision.evidence.confidence,
    },
    week_strategy: legacyStrategy(decision),
    question: decision.question
      ? {
        id: decision.question.id,
        text: decision.question.text,
        reason: decision.question.targets.join(", "),
        blocks_decision: decision.question.blocks_decision,
      }
      : null,
    item_decisions: decision.item_decisions.map((item) => ({
      plan_item_id: item.plan_item_id,
      occurrence_id: item.occurrence_id,
      title: item.title,
      family: item.family,
      current_week_status: item.current_week_status,
      evidence_done: item.evidence_done,
      daily_evidence: item.daily_evidence,
      decision: item.decision,
      reason: item.reason,
    })),
    plan_patch: decision.plan_patch,
    effect_plan: decision.effect_plan,
    safety: {
      forbidden_operations: [
        "modify_level_objective_from_weekly",
        "reschedule_completed_non_habit",
        "apply_without_user_confirmation",
        "include_support_items",
      ],
      warnings: decision.evidence.unanswered_count > 0
        ? ["Certaines actions restent sans reponse fiable."]
        : [],
    },
  };
}

function userFacingStrategyLabel(decision: WeeklyAdaptiveDecision): string {
  if (decision === "advance") return "passer a la suite";
  if (
    decision === "advance_with_caution" || decision === "advance_with_watch"
  ) {
    return "passer a la suite prudemment";
  }
  if (decision === "bridge_week") return "faire une semaine allegee";
  if (decision === "repeat_week") return "refaire la meme semaine";
  if (decision === "level_review") return "revoir la forme du niveau";
  return "ajuster la semaine prochaine";
}

export function buildWeeklyAdaptiveReviewMessage(
  adaptiveReview: WeeklyAdaptiveReview,
): string {
  return renderWeeklyReviewDecision(adaptiveReview.skill_decision);
}

export function buildWeeklyAdaptiveReviewInstruction(
  adaptiveReview: WeeklyAdaptiveReview,
): string {
  return [
    "Weekly adaptive review.",
    "Objectif: ouvrir un vrai point weekly: observation courte de l'etat de la semaine, check clair des actions, puis discussion sur l'organisation de la semaine prochaine.",
    "L'ouverture doit etre un message proactif envoye par Sophia, comme le daily: ce n'est pas le user qui doit ouvrir le point.",
    "L'ouverture doit toujours dire clairement que c'est le moment du bilan de la semaine ou du point de fin de semaine, pas commencer par une question nue.",
    "Dans l'ouverture, n'affiche jamais de chiffres de tableau de bord: pas de ratio, pas de pourcentage, pas de '5/6', pas de '83%'.",
    "Un petit compteur simple est autorise s'il clarifie l'etat sans noter le user, par exemple '6 actions prevues' ou '6 en attente'. Sinon, traduis en langage humain: la plupart, une partie, presque tout, peu de retours fiables, plusieurs points restes ouverts.",
    "Dans l'ouverture, reste leger et compatible WhatsApp: micro-synthese de la semaine, pas de recap jour par jour, pas de liste exhaustive des actions.",
    "Tu peux citer 1 ou 2 actions importantes maximum si cela clarifie le bilan, mais ne repete pas 'pas fait' ou 'sans retour fiable' pour chaque occurrence.",
    "Dans le message d'ouverture, pose une seule question large maximum: comment le user a vecu la semaine dans l'ensemble.",
    "Ne pose pas deux questions frontales du type progression ressentie + etat/energie dans l'ouverture. Ces informations doivent etre recuperees naturellement dans la discussion et remplies dans le JSON du skill.",
    "Points a remplir progressivement dans le JSON du skill: progression ressentie vers l'objectif, etat/energie de fin de semaine, cause dominante si elle bloque, pertinence des actions non faites, et accord explicite avant validation.",
    "Correction d'actions oubliees pendant le weekly: si le user dit qu'une action de la semaine a ete faite mais pas cochee/confirmée, ne lance pas un nouveau flow. Remplis les trous: action concernee, nombre de repetitions a ajouter, repere de semaine/date si donne. Quand ces infos sont completes, le runtime peut mettre a jour la DB en direct; sinon clarifie naturellement dans la discussion.",
    "Quand tu parles d'une proposition, parle de l'organisation concrete de la semaine prochaine. Ne transforme pas ca en 'regles' abstraites sur la fatigue.",
    "Si le user demande explicitement une organisation concrete ou refuse les regles/listes de regles, n'utilise pas le mot regle et ne donne pas de principe abstrait. Donne plutot les actions a garder, reporter, alleger, l'ordre ou la charge de la semaine.",
    "Si le user signale une fatigue forte, ne parle pas d'objectif 100%, de perfection ou de tout finir a tout prix. Propose plutot une charge tenable et la prochaine etape utile.",
    "Tant que le flow d'ajustement n'a pas ete lance et confirme, ne dis pas que tu verrouilles, appliques ou enregistres un plan precis. Dis que c'est une proposition concrete et demande s'il veut l'appliquer maintenant ou la garder comme discussion non confirmee.",
    "Pendant le weekly, evite le mot brouillon. Dis plutot proposition d'organisation, version proposee, ou rien n'est confirme.",
    "Vocabulaire simple obligatoire: ne dis jamais bridge, bridge_week, semaine pont, carry_over, mode advance, repeat_week, level_review, not_relevant, item_decision, plan_patch ou operation. Traduis toujours en mots utilisateur.",
    "Si le user emploie un de ces mots interdits, ne le repete pas, meme pour dire que tu ne vas pas l'utiliser; reformule directement en vocabulaire simple.",
    "Traductions: bridge_week = semaine allegee; advance = passer a la suite; repeat_week = refaire la meme semaine; level_review = revoir la forme du niveau; carry_over = reporter cette mission/action utile.",
    "Ne dis jamais que tu as applique un changement de plan: le JSON est une proposition qui demande confirmation.",
    "Les supports / fiches support sont hors scope du weekly: ne les propose pas dans l'organisation de la semaine prochaine et ne les reporte jamais.",
    "Si le user confirme une proposition applicable maintenant, applique seulement via le flow de modification autorise. S'il veut attendre demain/plus tard ou ne rien changer maintenant, dis qu'on reprendra plus tard et que rien n'est confirme; ne promets pas de garder une version en attente.",
    "Quand la discussion weekly est terminee, dis explicitement que la validation de la semaine prochaine est disponible. Cette validation signifie: confirmer l'organisation de la semaine suivante apres le point de fin de semaine, pas valider des occurrences passees.",
    "A la conclusion du weekly, n'affiche pas de mini-synthese pour le prochain weekly au user. Cette synthese est interne et doit etre stockee dans l'etat pour guider le prochain message d'ouverture.",
    "Si la discussion weekly revele une vraie demande de modification de l'organisation, Sophia peut passer ponctuellement par adjust_plan_item, puis revenir au weekly pour conclure et debloquer la validation.",
    `Habit verdict interne: ${adaptiveReview.habit_verdict.status}.`,
    `Decision a expliquer au user: ${
      userFacingStrategyLabel(adaptiveReview.week_strategy.decision)
    }.`,
    adaptiveReview.question
      ? `Question supplementaire si elle bloque la decision: ${adaptiveReview.question.text}`
      : "Demande une confirmation courte de la proposition.",
  ].join("\n");
}

export function buildWeeklyAdaptiveReviewGrounding(
  adaptiveReview: WeeklyAdaptiveReview,
): string {
  return JSON.stringify(adaptiveReview);
}
