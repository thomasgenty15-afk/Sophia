/**
 * FF-056 — LE REDUCER. Pur, total, testable sans réseau.
 *
 * ── CE QU'IL DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ─────────────────────────────
 * Il décide: quelle tâche visible, quel état d'épisode, quelle catégorie
 * retenue, quand ça s'arrête. Il ne décide PAS: si le flow s'ouvre (c'est le
 * détecteur + les gates du moteur du soir), ni comment la réponse est classée
 * (c'est `local_dispatcher.ts`), ni ce qui sort en texte (c'est
 * `visible_agent.ts`).
 *
 * ── LES DEUX TRAPPES SONT AU SOMMET, ET ELLES N'ARRIVENT PAS PAR LE MODÈLE ─
 * `restrictionFlagged` et `crisis` sont des ENTRÉES REQUISES, calculées par le
 * runtime à chaque tour et passées par un canal dédié — jamais lues sur le
 * turn frame, qui est écrit par un LLM. Le patron est celui de
 * `disordered_eating_guard`: « l'entrée d'un flow de sécurité ne transite
 * jamais par un modèle ».
 *
 * ⚠️ ET ELLES SONT REQUISES, PAS OPTIONNELLES. Ce dépôt a la cicatrice exacte
 * (`optional-gate-params-are-disarmed-gates`: `safetyBand` n'était jamais
 * passé, la garde ne mordait jamais). Un `?` sur ces deux champs ferait de ce
 * flow le seul du produit à parler de poids sans ceinture.
 */

import {
  isWeightDivergenceCategory,
  WEIGHT_DIVERGENCE_MAX_QUESTIONS,
  WEIGHT_DIVERGENCE_MAX_TURNS,
  type WeightDivergenceCategory,
  type WeightDivergencePhase,
  type WeightDivergenceReduction,
  type WeightDivergenceVisibleTask,
  type WeightDivergenceVisibleTaskKind,
  type WeightDivergenceWorkingState,
} from "./contract.ts";

export interface WeightDivergenceReducerInput {
  previousState: WeightDivergenceWorkingState;
  /** La catégorie rendue par le dispatcher local. Hors liste ⇒ `other`. */
  category: string | null;
  /** Les mots de la personne, tels quels. */
  userMessage: string;
  /**
   * LE PLANCHER TCA, à CE tour. Requis.
   *
   * `true` ⇒ ce flow disparaît et rend la main. Il ne dit pas au revoir, il ne
   * clôt pas poliment: il n'écrit pas un mot. Le plancher prend le tour.
   */
  restrictionFlagged: boolean;
  /** LE CHEMIN DE CRISE, à CE tour. Requis. Même traitement. */
  crisis: boolean;
  /**
   * L'ESPACE D'ACTION PRÉ-CALCULÉ, dérivé du plan RÉEL par le canal FF-028.
   * Vide ⇒ il n'y a rien à proposer, et le flow le DIT plutôt que d'inventer.
   */
  availableActionIds: readonly string[];
  /**
   * L'empreinte du plan a-t-elle changé depuis l'ouverture ? (§7)
   * `true` ⇒ rien ne s'applique, et la personne le sait en une phrase.
   */
  planChanged: boolean;
}

/**
 * LA TRAPPE. Une sortie sans texte, distincte d'une fin.
 *
 * `handOver` n'est PAS `status: "exit"` avec un message vide: le premier rend
 * la main à une ceinture qui va parler, le second clôt une conversation. Les
 * confondre produirait un tour muet chez quelqu'un en détresse.
 */
export type WeightDivergenceHandOver = {
  handOver: "restriction_floor" | "crisis";
  /** L'épisode meurt. Il ne reprendra pas: le cooldown court depuis ici. */
  episodeState: "expired";
  reasonCode: string;
};

export type WeightDivergenceReducerOutput =
  | ({ kind: "reduction" } & WeightDivergenceReduction)
  | ({ kind: "hand_over" } & WeightDivergenceHandOver);

const NEXT_FOCUS: Record<WeightDivergenceVisibleTaskKind, string> = {
  propose_named_spot_action:
    "The person named where it happens. Offer the pre-computed plan change, in " +
    "their own terms, and ask once whether to make it. Nothing else.",
  acknowledge_named_spot_without_action:
    "The person named where it happens, and there is no plan change available " +
    "for it. Say plainly that you have noted it and that it will shape the next " +
    "week they put together. Do not invent a change.",
  point_to_plan_fit:
    "The plan is not what they actually eat. Say that the plan is what should " +
    "move, and point at the practical constraints and the plan window. Never " +
    "propose a snack here.",
  acknowledge_activity_drop:
    "Their activity dropped. Take it as information, say it is noted. NEVER " +
    "prescribe, suggest or encourage any exercise, in any form.",
  acknowledge_medical:
    "Record it without a word of interpretation. If it is clearly medical, say " +
    "in one sentence that a doctor is the person for it. Diagnose nothing.",
  acknowledge_life_factor:
    "Acknowledge it honestly and stop. Promise NO lever — you do not have one " +
    "for sleep or stress, and pretending otherwise is worse than saying so.",
  close_nothing_to_change:
    "They gave a reason the reading may be wrong. Say plainly that there is " +
    "nothing to change, and close. Do not add 'but keep an eye on it'.",
  offer_observation_window:
    "They do not know. Offer the bounded window: three days, only what they " +
    "eat ON TOP of the plan, then you recalibrate and it stops on its own. Say " +
    "the end date is already set.",
  respect_decline:
    "They do not want to talk about it. One sentence, no re-offer, no 'but', " +
    "no door left ajar. Then stop.",
  reformulate_once:
    "You did not understand. Say so plainly, once, without guessing at what " +
    "they meant and without listing possibilities.",
  close_out:
    "Close the exchange in one short sentence. No summary, no conclusion about " +
    "them, no follow-up.",
};

const TONE_CONSTRAINTS = Object.freeze([
  "plain",
  "short",
  "no_reassurance_about_the_body",
  "no_encouragement",
  "no_summary_of_the_person",
  "the_subject_of_every_sentence_is_the_plan",
]);

/**
 * CE QU'AUCUNE TÂCHE NE PEUT DIRE.
 *
 * Recopié dans CHAQUE prompt, et re-vérifié à la sortie par le validateur.
 * Les deux moitiés sont nécessaires: la consigne réduit la fréquence, le
 * validateur garantit le résultat. Ce dépôt a mesuré que la première seule ne
 * suffit pas (« une règle de prompt n'est pas une ceinture »).
 */
const DO_NOT_SAY = Object.freeze([
  "any calorie, kcal, macro or energy figure — in digits OR in words",
  "any number at all",
  "'are you sure', 'be honest', 'admit', or any wording that doubts them",
  "any reference to their ticks, their logging, or a mismatch between what " +
    "they reported and what the scale says",
  "any blame word: discipline, willpower, effort, fault, slipping",
  "anything that links this conversation to the fact that they weighed " +
    "themselves — never 'since you weighed yourself'",
  "any exercise, training or activity prescription",
  "any medical interpretation or diagnosis",
  "any mention of their household, their coach, or anyone else",
]);

function visibleTask(args: {
  kind: WeightDivergenceVisibleTaskKind;
  phase: WeightDivergencePhase;
  userMessage: string;
  proposedActionText: string | null;
}): WeightDivergenceVisibleTask {
  const words = args.userMessage.trim();
  return {
    kind: args.kind,
    conversation_context: {
      phase: args.phase,
      user_words: words ? [words] : [],
      proposed_action_text: args.proposedActionText,
      next_focus: NEXT_FOCUS[args.kind],
      tone_constraints: TONE_CONSTRAINTS,
      do_not_say: DO_NOT_SAY,
      max_questions: WEIGHT_DIVERGENCE_MAX_QUESTIONS[args.kind],
    },
  };
}

/**
 * LA CATÉGORIE, RAMENÉE DANS L'ENSEMBLE FERMÉ.
 *
 * Tout ce qui n'est pas un membre exact devient `other` — y compris `null`,
 * y compris une chaîne vide, y compris un token inventé par un modèle. R4 en
 * une fonction: « le LLM choisit DANS l'ensemble, un choix hors ensemble =
 * `other` ».
 */
export function normalizeCategory(value: unknown): WeightDivergenceCategory {
  return isWeightDivergenceCategory(value) ? value : "other";
}

/**
 * QUELLE ACTION POUR UN `named_spot`, ET POURQUOI CE N'EST PAS UN CHOIX.
 *
 * L'espace est PRÉ-CALCULÉ par FF-028 depuis le rythme réel de l'élève; il ne
 * contient que ce qui change vraiment quelque chose pour cette personne. On
 * prend la première entrée disponible dans un ordre FIXE, pas la « meilleure »:
 * un classement dépendant du texte remettrait un tirage sur le chemin qui OUVRE
 * un effet durable, ce que la règle transverse du dépôt interdit.
 *
 * Vide ⇒ `null`, et le flow le dit. Inventer une action ici serait exactement
 * « proposer une collation du soir à quelqu'un dont le problème est le matin ».
 */
export function pickNamedSpotAction(
  available: readonly string[],
): string | null {
  const ordered = ["add_breakfast", "add_afternoon_snack"];
  for (const id of ordered) if (available.includes(id)) return id;
  return null;
}

/** La catégorie → la tâche visible. Table exhaustive, sans branche par défaut. */
function taskForCategory(
  category: WeightDivergenceCategory,
  hasAction: boolean,
): WeightDivergenceVisibleTaskKind {
  switch (category) {
    case "named_spot":
      return hasAction
        ? "propose_named_spot_action"
        : "acknowledge_named_spot_without_action";
    case "plan_mismatch":
      return "point_to_plan_fit";
    case "activity_drop":
      return "acknowledge_activity_drop";
    case "medical":
      return "acknowledge_medical";
    case "life_factor":
      return "acknowledge_life_factor";
    case "not_a_divergence":
      return "close_nothing_to_change";
    case "unknown":
      return "offer_observation_window";
    case "declined":
      return "respect_decline";
    case "other":
      return "reformulate_once";
  }
}

/** L'état d'épisode que chaque catégorie ferme. `in_flow` = pas encore fini. */
function episodeStateForCategory(
  category: WeightDivergenceCategory,
  hasAction: boolean,
): WeightDivergenceReduction["episodeState"] {
  switch (category) {
    // ⚠️ `acted` N'EST PAS ÉCRIT ICI. Une proposition n'est pas une action:
    // l'épisode ne passe à `acted` qu'après le TAP et la relecture de la
    // directive (canal FF-028). Le poser maintenant ferait de la
    // classification l'effet — « le tap est l'effet, jamais la
    // classification » (§4).
    case "named_spot":
      return hasAction ? "in_flow" : "nothing_to_change";
    case "plan_mismatch":
    case "activity_drop":
    case "medical":
    case "life_factor":
      return "nothing_to_change";
    case "not_a_divergence":
      return "nothing_to_change";
    case "unknown":
      return "in_flow";
    case "declined":
      return "declined";
    case "other":
      return "in_flow";
  }
}

export function reduceWeightDivergence(
  input: WeightDivergenceReducerInput,
): WeightDivergenceReducerOutput {
  // ── LES DEUX TRAPPES, AVANT TOUT LE RESTE ────────────────────────────────
  // L'ordre n'est pas cosmétique: la crise passe devant le plancher TCA, qui
  // passe devant tout. Ce flow parle de poids qui ne descend pas — c'est le
  // pire terrain du produit, et il lui faut une évacuation à CHAQUE tour, pas
  // seulement à l'entrée.
  if (input.crisis === true) {
    return {
      kind: "hand_over",
      handOver: "crisis",
      episodeState: "expired",
      reasonCode: "weight_divergence.hand_over_crisis",
    };
  }
  if (input.restrictionFlagged === true) {
    return {
      kind: "hand_over",
      handOver: "restriction_floor",
      episodeState: "expired",
      reasonCode: "weight_divergence.hand_over_restriction",
    };
  }

  const state = input.previousState ?? {};
  const turnCount = (typeof state.turn_count === "number" ? state.turn_count : 0) + 1;
  const category = normalizeCategory(input.category);

  const actionId = category === "named_spot" && !input.planChanged
    ? pickNamedSpotAction(input.availableActionIds)
    : null;
  const hasAction = actionId !== null;

  let kind = taskForCategory(category, hasAction);
  let episodeState = episodeStateForCategory(category, hasAction);
  let phase: WeightDivergencePhase = kind === "reformulate_once"
    ? "deepening"
    : "closed";
  let reasonCode = `weight_divergence.${category}`;
  let status: "continue" | "exit" = phase === "closed" ? "exit" : "continue";

  // ── UNE SEULE REFORMULATION PAR ÉPISODE ──────────────────────────────────
  // Un deuxième `other` n'est pas une invitation à essayer encore: c'est le
  // signal que cette conversation ne se fera pas. « Jamais une action à côté »
  // (§7) veut aussi dire: jamais un troisième essai.
  if (kind === "reformulate_once" && state.reformulated === true) {
    kind = "close_out";
    phase = "closed";
    status = "exit";
    episodeState = "expired";
    reasonCode = "weight_divergence.unreadable_twice";
  }

  // ── LE PLAFOND DE TOURS. Structurel, lu, pas « respecté ». ───────────────
  if (status === "continue" && turnCount >= WEIGHT_DIVERGENCE_MAX_TURNS) {
    kind = "close_out";
    phase = "closed";
    status = "exit";
    episodeState = "expired";
    reasonCode = "weight_divergence.max_turns_reached";
  }

  // ── LE PLAN A CHANGÉ SOUS L'ÉPISODE (§7) ─────────────────────────────────
  // On ne propose rien sur un plan disparu, et la personne l'apprend en une
  // phrase plutôt que par une action qui ne fait rien.
  if (input.planChanged && category === "named_spot") {
    kind = "acknowledge_named_spot_without_action";
    phase = "closed";
    status = "exit";
    episodeState = "nothing_to_change";
    reasonCode = "weight_divergence.plan_changed_under_episode";
  }

  return {
    kind: "reduction",
    phase,
    visibleTask: visibleTask({
      kind,
      phase,
      userMessage: input.userMessage,
      // ⚠️ LE TEXTE DE L'ACTION N'EST PAS FABRIQUÉ ICI. Le skill le remplit
      // depuis le littéral gelé de FF-028; le reducer ne connaît qu'un
      // identifiant. Un module pur qui écrirait la copie serait le second
      // endroit où elle vit, et le second diverge toujours.
      proposedActionText: null,
    }),
    statePatch: {
      episode_id: state.episode_id,
      phase,
      turn_count: turnCount,
      last_category: category,
      reformulated: state.reformulated === true || kind === "reformulate_once",
      last_visible_task: kind,
    },
    status,
    episodeState,
    episodeCategory: category,
    // La fenêtre ne s'ouvre que sur `unknown`, et seulement si le flow ne
    // s'est pas fait couper par le plafond dans le même tour.
    opensObservationWindow: kind === "offer_observation_window",
    proposedActionId: kind === "propose_named_spot_action" ? actionId : null,
    reasonCode,
  };
}
