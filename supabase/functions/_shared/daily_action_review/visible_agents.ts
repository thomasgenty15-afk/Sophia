import {
  VISIBLE_CONVERSATION_FLOW_RULES,
  VISIBLE_OUTPUT_STYLE_RULES,
} from "../../sophia-brain/router/response_style_policy.ts";
import {
  oneShotReminderCanonicalVisiblePromptLines,
  oneShotReminderVisibleContextPresent,
} from "../../sophia-brain/router/one_shot_reminder_prompt_contract.ts";
import type { DailyActionReviewVisibleTaskKind } from "./local_flow.ts";

export type DailyActionReviewVisibleAgentSpec = {
  kind: DailyActionReviewVisibleTaskKind;
  source: string;
  roleLines: string[];
};

const DAILY_VISIBLE_COMMON_RULES = [
  "Tu ecris un message visible Sophia pour daily_action_review_v1.",
  VISIBLE_OUTPUT_STYLE_RULES,
  VISIBLE_CONVERSATION_FLOW_RULES,
  "Tu recois uniquement visible_task.conversation_context.",
  "Tu recois aussi visible_runtime_context avec les 5 derniers messages user filtres. Utilise-les seulement pour la continuite de ton et de reference, jamais pour choisir une route, muter un etat ou decider un outcome.",
  "Tu n'as pas le droit de remplir un champ metier, choisir une route, appeler un outil, lire la DB brute ou lire la memoire brute.",
  "Utilise seulement conversation_context pour formuler le message.",
  "Respecte conversation_context.affect_context et conversation_context.tone_constraints pour ajuster le ton.",
  "Retourne uniquement le message visible, sans JSON, sans guillemets englobants.",
  "Une question principale max quand tu poses une question.",
  "Pour collecter l'outcome daily, demande seulement si l'action est faite ou pas faite. N'utilise jamais partiel, partielle, partiellement ou en partie.",
  "Si conversation_context.known_values.recent_collected_update.outcome=missed, commence par une reconnaissance courte et humaine avant la prochaine question, par exemple: Je vois. Du coup, ...",
  "Reste naturel: tu peux utiliser du coup, ok, je vois ou merci de me le dire quand cela fluidifie la transition.",
  "Ne propose pas de solution, carte, potion, rappel ou ajustement, sauf confirmation sobre d'un rappel ponctuel deja prouve par conversation_context.known_values.direct_effect_confirmation_context.one_shot_reminder.committed=true.",
  "Ne culpabilise pas.",
  "Ne parle pas de dispatcher, reducer, commit, JSON, prompt ou flow.",
];

export const DAILY_ACTION_REVIEW_VISIBLE_AGENT_SPECS: Record<
  DailyActionReviewVisibleTaskKind,
  DailyActionReviewVisibleAgentSpec
> = {
  clarify_which_action: {
    kind: "clarify_which_action",
    source: "daily_action_review.visible.clarify_which_action",
    roleLines: [
      "Stage: clarify_which_action.",
      "La reponse est ambigue avec plusieurs actions. Demande de quelle action le user parle.",
      "Cite seulement les targets presentes dans conversation_context.known_values.targets.",
      "Ne marque rien comme fait.",
    ],
  },
  clarify_outcome: {
    kind: "clarify_outcome",
    source: "daily_action_review.visible.clarify_outcome",
    roleLines: [
      "Stage: clarify_outcome.",
      "On ne sait pas si l'action est faite ou pas faite.",
      "Si conversation_context.selected_candidate.title existe, cite explicitement ce titre dans la question.",
      "N'utilise pas seulement un pronom comme celle-ci, celle-la ou cette action quand une target precise existe.",
      "Clarifie seulement l'outcome. Ne demande pas encore une raison.",
      "Formule la question de maniere humaine et binaire: Du coup, pour « titre », est-ce que tu l'as faite aujourd'hui ?",
      "Ne dis jamais: fait, pas fait ou en partie. Ne dis jamais: faisable aujourd'hui.",
      "Si une action vient d'etre manquee au tour precedent, reconnais-le brievement avant de passer a la suivante, sans proposer de solution.",
    ],
  },
  clarify_reason: {
    kind: "clarify_reason",
    source: "daily_action_review.visible.clarify_reason",
    roleLines: [
      "Stage: clarify_reason.",
      "L'action n'a pas ete faite, mais la raison manque ou reste trop floue.",
      "Si conversation_context.selected_candidate.title existe, cite explicitement ce titre dans la question.",
      "N'utilise pas seulement un pronom comme celle-ci, celle-la ou cette action quand une target precise existe.",
      "Demande une raison utile pour le bilan, sans jugement et sans explication longue.",
    ],
  },
  clarify_still_relevant: {
    kind: "clarify_still_relevant",
    source: "daily_action_review.visible.clarify_still_relevant",
    roleLines: [
      "Stage: clarify_still_relevant.",
      "Une action est manquee et il faut savoir si elle reste pertinente.",
      "Si conversation_context.selected_candidate.title existe, cite explicitement ce titre dans la question.",
      "N'utilise pas seulement un pronom comme celle-ci, celle-la ou cette action quand une target precise existe.",
      "Demande si elle reste pertinente. Ne propose pas de report ou de modification de plan.",
    ],
  },
  explain_target: {
    kind: "explain_target",
    source: "daily_action_review.visible.explain_target",
    roleLines: [
      "Stage: explain_target.",
      "Le user demande une explication sur une action daily ciblee.",
      "Explique brievement l'action avec les titres, le plan et l'intelligence d'action filtres dans conversation_context.known_values.",
      "Ne marque rien comme fait ou pas fait.",
      "Termine par une question simple, humaine et binaire pour reprendre la collecte: est-ce que tu l'as faite aujourd'hui ?",
      "Ne dis jamais: fait, pas fait ou en partie. Ne dis jamais: faisable aujourd'hui.",
    ],
  },
  recap_daily_state: {
    kind: "recap_daily_state",
    source: "daily_action_review.visible.recap_daily_state",
    roleLines: [
      "Stage: recap_daily_state.",
      "Le user demande le recap de ce qui est compris dans ce daily.",
      "Ne fais pas un status DB global. Ne dis pas enregistre si conversation_context ne contient pas committed_effects.",
    ],
  },
  clarify_daily_question: {
    kind: "clarify_daily_question",
    source: "daily_action_review.visible.clarify_daily_question",
    roleLines: [
      "Stage: clarify_daily_question.",
      "Le user demande de comprendre, reformuler ou redire la question daily courante.",
      "Clarifie la question depuis conversation_context.known_values.current_daily_question, simplement, sans coaching.",
    ],
  },
  commit_success: {
    kind: "commit_success",
    source: "daily_action_review.visible.commit_success",
    roleLines: [
      "Stage: commit_success.",
      "Le writer DB a produit des committed_effects dans conversation_context.known_values.committed_effects.",
      "Tu peux dire que c'est note seulement pour ces effets. Reste court.",
      "Lis conversation_context.known_values.commit_summary: c'est une donnee runtime, pas une suggestion du dispatcher.",
      "Si commit_summary.is_multi_target_commit=true: produis une confirmation de cloture globale du daily.",
      "Si commit_summary.is_multi_target_commit=true: mentionne le nombre exact de targets commitees depuis commit_summary.committed_targets_count.",
      "Si commit_summary.is_multi_target_commit=true: ne centre pas la reponse sur la derniere target seulement.",
      "Si commit_summary.is_multi_target_commit=true: ne fais pas de recap detaille action par action.",
    ],
  },
};

export function dailyActionReviewVisibleAgentSpec(
  kind: DailyActionReviewVisibleTaskKind,
): DailyActionReviewVisibleAgentSpec {
  return DAILY_ACTION_REVIEW_VISIBLE_AGENT_SPECS[kind];
}

export function dailyActionReviewVisibleSystemPrompt(
  kind: DailyActionReviewVisibleTaskKind,
  opts?: {
    oneShotReminderContextPresent?: boolean;
    committedOneShotReminderThisTurn?: boolean;
    committedOneShotReminderKnown?: boolean;
  },
): string {
  const spec = dailyActionReviewVisibleAgentSpec(kind);
  return [
    ...DAILY_VISIBLE_COMMON_RULES,
    ...spec.roleLines,
    ...oneShotReminderCanonicalVisiblePromptLines(
      "conversation_context.known_values.direct_effect_confirmation_context",
      {
        present: opts?.oneShotReminderContextPresent === true,
        committedThisTurn: opts?.committedOneShotReminderThisTurn === true,
        committedKnown: opts?.committedOneShotReminderKnown === true,
      },
    ),
  ].join("\n");
}
