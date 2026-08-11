/**
 * FF-056 — LE SKILL. Orchestration seule.
 *
 * Tout ce qui décide a déjà été décidé par quelque chose de déterministe en
 * amont:
 *   - si le flow existe: le détecteur + les gates du moteur du soir
 *     (`_shared/keel/weight_divergence_engine.ts`), et l'ÉPISODE EN BASE;
 *   - ce que le tour fait: `reducer.ts`, pur;
 *   - ce qui peut être dit: `visible_agent.ts`, validateur post-génération.
 *
 * Ce fichier les branche, et garantit qu'un tour de ce flow n'est jamais vide.
 * Il n'a AUCUNE I/O: l'avancement de l'épisode est rendu à l'appelant
 * (`episodeState`, `episodeCategory`, `opensObservationWindow`), qui écrit et
 * RELIT. Le registre reste honnête — rien n'est annoncé fait qui n'ait été
 * relu.
 */

import { baseOutput, type RunSkillInput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import {
  WEIGHT_DIVERGENCE_OBSERVATION_DAYS,
  WEIGHT_DIVERGENCE_SKILL_ID,
  type WeightDivergenceWorkingState,
} from "./contract.ts";
import { reduceWeightDivergence } from "./reducer.ts";
import {
  runWeightDivergenceVisibleAgent,
  weightDivergenceDeterministicMessage,
} from "./visible_agent.ts";
import type { DivergenceClassification } from "./local_dispatcher.ts";

/**
 * Ce que le runtime calcule et passe par un canal DÉDIÉ.
 *
 * ⚠️ AUCUN DE CES CHAMPS N'EST LU SUR LE TURN FRAME. Le turn frame est écrit
 * par le LLM du dispatcher; l'existence de l'épisode, le plancher TCA et la
 * bande de crise doivent venir de la base. Le patron est celui de
 * `disordered_eating_guard`, et la raison est la même: un flow dont l'entrée
 * ou les trappes transitent par un modèle est un flow qu'un modèle peut ouvrir
 * et refermer au hasard.
 */
export type WeightDivergenceSkillRuntime = {
  /** L'épisode vivant, relu en base ce tour-ci. */
  episode_id: string;
  /** La classification de la réponse, déjà faite (le plancher de refus inclus). */
  classification: DivergenceClassification;
  /** Le plancher TCA, à CE tour. Requis — la trappe est permanente. */
  restriction_flagged: boolean;
  /** Le chemin de crise, à CE tour. Requis. */
  crisis: boolean;
  /** L'espace d'action pré-calculé (canal FF-028), dérivé du plan RÉEL. */
  available_action_ids: readonly string[];
  /** Le texte EXACT de l'action retenue, littéral gelé de FF-028. */
  action_texts: Readonly<Record<string, string>>;
  /** L'empreinte du plan a-t-elle changé depuis l'ouverture de l'épisode ? */
  plan_changed: boolean;
  /** La journée locale de l'élève — la fenêtre d'observation se date dessus. */
  local_date: string;
};

function workingState(input: RunSkillInput): WeightDivergenceWorkingState {
  const raw = input.context.active_skill_working_state?.working_state;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as WeightDivergenceWorkingState
    : {};
}

function runtimeOf(input: RunSkillInput): WeightDivergenceSkillRuntime {
  // Le champ est déclaré `unknown` sur `SkillContext` (canal de runtime): la
  // vérification ci-dessous EST la validation. Un `as` sur l'objet entier
  // désarmerait le typecheck sur tous les champs à la fois — cicatrice
  // `as-cast-on-foreign-type-disarms-typecheck`.
  const runtime = input.context.weight_divergence_runtime as
    | WeightDivergenceSkillRuntime
    | undefined;
  if (!runtime || typeof runtime !== "object") {
    throw new Error(
      "[weight_divergence] missing weight_divergence_runtime on the skill " +
        "context — the live episode, the restriction floor and the crisis band " +
        "must be computed by the runtime, never inferred from the turn frame",
    );
  }
  return runtime;
}

export interface WeightDivergenceSkillResult {
  output: ConversationSkillOutput;
  /**
   * CE QUE L'APPELANT DOIT ÉCRIRE, et il doit le RELIRE.
   *
   * Rendu plutôt qu'écrit ici parce que ce skill n'a pas de base. `null` sur
   * `handOver`: quand une ceinture prend le tour, ce flow ne parle pas — et il
   * n'écrit pas non plus une catégorie qu'il n'a pas obtenue.
   */
  episodeAdvance: {
    state: string;
    category: string | null;
    turnCount: number;
    observationOpenedOn: string | null;
    observationEndsOn: string | null;
  } | null;
  /** `restriction_floor` ou `crisis` quand le tour est rendu à une ceinture. */
  handOver: "restriction_floor" | "crisis" | null;
}

export async function runWeightDivergenceSkill(
  input: RunSkillInput,
): Promise<WeightDivergenceSkillResult> {
  const runtime = runtimeOf(input);
  const previousState = workingState(input);

  const reduction = reduceWeightDivergence({
    previousState,
    category: runtime.classification.category,
    userMessage: input.user_message,
    restrictionFlagged: runtime.restriction_flagged === true,
    crisis: runtime.crisis === true,
    availableActionIds: runtime.available_action_ids ?? [],
    planChanged: runtime.plan_changed === true,
  });

  // ── LA TRAPPE ────────────────────────────────────────────────────────────
  // Ce flow disparaît. Il ne dit pas au revoir: dire au revoir à quelqu'un en
  // détresse au motif qu'on change de lane serait la dernière phrase qu'il
  // lirait de nous avant la bonne.
  if (reduction.kind === "hand_over") {
    console.info("weight_divergence.hand_over", {
      to: reduction.handOver,
      reason_code: reduction.reasonCode,
      episode_id: runtime.episode_id,
    });
    return {
      output: baseOutput(WEIGHT_DIVERGENCE_SKILL_ID, {
        status: "exit",
        response_intent: "hand_over_to_floor",
        reply: "",
        diagnosis: {
          hand_over: reduction.handOver,
          reducer_reason_code: reduction.reasonCode,
          episode_id: runtime.episode_id,
        },
        effects: emptyConversationEffects(),
        memory_write_candidates: [],
        state_patch: {},
      }),
      episodeAdvance: {
        state: reduction.episodeState,
        category: null,
        turnCount: (previousState.turn_count ?? 0) + 1,
        observationOpenedOn: null,
        observationEndsOn: null,
      },
      handOver: reduction.handOver,
    };
  }

  // Le texte de l'action vient du littéral gelé de FF-028, JAMAIS d'ici.
  const actionText = reduction.proposedActionId
    ? (runtime.action_texts?.[reduction.proposedActionId] ?? null)
    : null;
  const task = {
    ...reduction.visibleTask,
    conversation_context: {
      ...reduction.visibleTask.conversation_context,
      proposed_action_text: actionText,
    },
  };

  const visible = await runWeightDivergenceVisibleAgent({
    user_id: input.context.user_id,
    response_locale: input.context.response_locale,
    request_id: input.context.turn_frame.source_message_id,
    visible_task: task,
  });

  // ANTI-SILENCE. Un tour rejeté ou raté rend le littéral gelé, jamais du vide
  // et jamais la sortie brute du modèle.
  const deterministic = visible.message ? null : weightDivergenceDeterministicMessage(
    task.kind,
    input.context.response_locale,
    actionText,
  );
  if (!visible.message) {
    console.warn("weight_divergence.visible_generation_fallback", {
      "visible_task.kind": task.kind,
      reason: visible.failure_reason,
      deterministic_message_used: true,
    });
  }

  const observationOpenedOn = reduction.opensObservationWindow
    ? runtime.local_date
    : null;
  const observationEndsOn = reduction.opensObservationWindow
    ? shiftLocalDate(runtime.local_date, WEIGHT_DIVERGENCE_OBSERVATION_DAYS)
    : null;

  console.info("weight_divergence.reducer_result", {
    phase: reduction.phase,
    "visible_task.kind": task.kind,
    reason_code: reduction.reasonCode,
    category: reduction.episodeCategory,
    classification_source: runtime.classification.source,
    proposed_action: reduction.proposedActionId,
    episode_state: reduction.episodeState,
    opens_observation_window: reduction.opensObservationWindow,
  });

  return {
    output: baseOutput(WEIGHT_DIVERGENCE_SKILL_ID, {
      status: reduction.status,
      response_intent: reduction.status === "exit"
        ? "close_weight_divergence"
        : "hold_weight_divergence",
      reply: visible.message ?? deterministic ?? "",
      diagnosis: {
        phase: reduction.phase,
        reducer_reason_code: reduction.reasonCode,
        visible_task: task.kind,
        category: reduction.episodeCategory,
        classification_source: runtime.classification.source,
        proposed_action_id: reduction.proposedActionId,
        plan_changed: runtime.plan_changed === true,
        visible_agent_ok: visible.visible_agent_ok,
        visible_failure_reason: visible.failure_reason,
        deterministic_message_used: Boolean(deterministic),
        constraint_list: [
          "no_energy_figures",
          "no_doubt_or_suspicion",
          "no_blame",
          "no_weigh_in_reference",
          "no_exercise_prescription",
          "no_medical_interpretation",
          "no_household_or_coach_visibility",
        ],
      },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: ["no_second_ask_in_the_same_day"],
      },
      // Aucune I/O ici. La directive durable passe par le canal FF-028 et son
      // TAP; la classification n'est jamais l'effet (§4).
      effects: emptyConversationEffects(),
      memory_write_candidates: [],
      state_patch: reduction.statePatch as Record<string, unknown>,
    }),
    episodeAdvance: {
      state: reduction.episodeState ?? "in_flow",
      category: reduction.episodeCategory,
      turnCount: reduction.statePatch.turn_count ?? 1,
      observationOpenedOn,
      observationEndsOn,
    },
    handOver: null,
  };
}

/** `YYYY-MM-DD` + n jours, ancré à midi UTC (aucune arithmétique d'heure d'été). */
function shiftLocalDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
