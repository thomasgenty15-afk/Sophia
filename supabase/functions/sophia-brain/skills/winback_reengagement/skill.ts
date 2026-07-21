// Chantier réengagement (2026-07-19) — orchestrateur du conversation skill
// winback_reengagement_v1 (famille product_help/coaching_recommendation).
// Cycle par tour : lire le state armé -> dispatcher local (classifie, avance
// les gates) -> selon l'action : tour visible (continue/terminaux avec
// réponse) ou exit vide re-dispatché au global le même tour (handoff cartes,
// hors-sujet, safety). Les effets durables (épisode, pause) ne sont PAS
// exécutés ici : le skill les déclare dans state_patch
// (winback_reengagement_episode_effect) et router/run.ts les commet — parité
// claim/ledger gérée côté run (une pause non committée dégrade la réponse).

import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import { baseOutput } from "../_shared/skill_helpers.ts";
import {
  createNoteInformation,
  noteInformationSummary,
} from "../../contracts/note_information.v1.ts";
import {
  runWinbackReengagementLocalDispatcher,
  type WinbackReengagementLocalDecision,
  winbackReengagementLocalFailureDecision,
} from "./local_flow.ts";
import {
  readWinbackReengagementLocalState,
  WINBACK_REENGAGEMENT_SKILL_ID,
  type WinbackReengagementLocalState,
} from "./state.ts";
import {
  runWinbackReengagementVisibleAgent,
  type WinbackReengagementVisibleAgent,
} from "./visible_agent.ts";

export type WinbackReengagementRunSkillInput = RunSkillInput & {
  local_dispatcher?: typeof runWinbackReengagementLocalDispatcher;
  visible_agent?: WinbackReengagementVisibleAgent;
};

export type WinbackReengagementEpisodeEffect =
  | {
    kind: "close";
    episode_id: string;
    exit_status: "reengaged" | "stopped" | "safety";
    solution_offered: string | null;
    redirect_target: string | null;
  }
  | {
    kind: "pause_and_close";
    episode_id: string;
    pause_days: number;
    solution_offered: "pause";
    redirect_target: null;
  };

const PAUSE_DAYS: Record<string, number> = {
  short: 3,
  week: 7,
  open: 30,
};

function nextLocalState(
  previous: WinbackReengagementLocalState,
  decision: WinbackReengagementLocalDecision,
): WinbackReengagementLocalState {
  return {
    ...previous,
    awaiting_first_reply: false,
    turn_count: previous.turn_count + 1,
    stage: decision.stage_next,
    gates: decision.gates,
    working_reason_note: decision.working_reason_note,
    solution_kind: decision.solution_kind,
    redirect_target: decision.redirect_target,
  };
}

function episodeEffectForDecision(
  state: WinbackReengagementLocalState,
  decision: WinbackReengagementLocalDecision,
): WinbackReengagementEpisodeEffect | null {
  if (decision.action === "complete_reengaged") {
    return {
      kind: "close",
      episode_id: state.episode_id,
      exit_status: "reengaged",
      solution_offered: decision.solution_kind ?? "none",
      redirect_target: decision.redirect_target,
    };
  }
  if (decision.action === "accept_pause") {
    return {
      kind: "pause_and_close",
      episode_id: state.episode_id,
      pause_days: PAUSE_DAYS[decision.pause?.kind ?? "short"] ?? 3,
      solution_offered: "pause",
      redirect_target: null,
    };
  }
  if (decision.action === "handoff_coaching_recommendation") {
    return {
      kind: "close",
      episode_id: state.episode_id,
      exit_status: "reengaged",
      solution_offered: decision.solution_kind ?? "attack_card",
      redirect_target: decision.redirect_target,
    };
  }
  if (decision.action === "exit_to_global_dispatcher") {
    return {
      kind: "close",
      episode_id: state.episode_id,
      exit_status: "stopped",
      solution_offered: decision.solution_kind,
      redirect_target: decision.redirect_target,
    };
  }
  if (decision.action === "safety_exit") {
    return {
      kind: "close",
      episode_id: state.episode_id,
      exit_status: "safety",
      solution_offered: null,
      redirect_target: null,
    };
  }
  return null;
}

function exitMemo(args: {
  decision: WinbackReengagementLocalDecision;
  userMessage: string;
  state: WinbackReengagementLocalState;
}): Record<string, unknown> {
  return {
    reason: args.decision.reason,
    user_message_summary: args.userMessage,
    flow_summary: `Réengagement après décrochage (step ${args.state.winback_step}, ${args.state.days_inactive_at_send}j) — ${
      args.state.working_reason_note ?? "raison non exprimée"
    }`,
    note_information: args.decision.note_information,
    at: new Date().toISOString(),
  };
}

function dispatchTrace(
  decision: WinbackReengagementLocalDecision,
  state: WinbackReengagementLocalState,
): Record<string, unknown> {
  return {
    action: decision.action,
    confidence: decision.confidence,
    reason: decision.reason,
    stage_next: decision.stage_next,
    gates: decision.gates,
    solution_kind: decision.solution_kind,
    coercions: decision.coercions,
    episode_id: state.episode_id,
    winback_step: state.winback_step,
    turn_count: state.turn_count,
  };
}

const FALLBACK_REPLY =
  "Je suis contente de te lire. Prends le temps qu'il te faut — dis-moi juste où tu en es, et on repart de là, sans pression.";

// Copy du domaine (charte anti-patching cmd 4/6 : run.ts exécute l'effet mais
// ne rédige pas la copy visible — l'owner du flow la possède). Utilisée par
// run.ts quand le commit de la pause échoue au verify-after-write : parité
// claim/ledger, la réponse ne promet rien qui ne soit pas en DB.
export const WINBACK_PAUSE_COMMIT_FAILED_REPLY =
  "Je t'entends — on lève le pied. Par contre je n'ai pas réussi à enregistrer la pause de mon côté à l'instant, donc je préfère ne rien te promettre : si je reviens trop tôt, redis-le moi simplement.";

export async function runWinbackReengagementSkill(
  input: WinbackReengagementRunSkillInput,
) {
  const previous = readWinbackReengagementLocalState(
    input.context.active_skill_working_state,
  );
  if (!previous) {
    // State illisible (clobber, version inconnue) : rendre la main au global
    // proprement plutôt que converser sans grounding. La note target="global"
    // est OBLIGATOIRE — sans elle, run.ts ne reconnaît pas l'exit (target
    // vide) et le tour tombe muet (reply "" jamais re-dispatché).
    const unreadableNote = createNoteInformation({
      source_flow_id: WINBACK_REENGAGEMENT_SKILL_ID,
      handoff_reason: "flow_interruption",
      target_dispatcher: "global",
      handoff_context_for_next_dispatcher:
        "Winback reengagement state was unreadable; reclassify the current message from scratch.",
      user_words: [input.user_message],
      structured_context: {
        source_flow: WINBACK_REENGAGEMENT_SKILL_ID,
        exit_reason: "winback_reengagement_state_unreadable",
        recommended_next_focus:
          "global_dispatcher_reclassify_current_message",
      },
      confidence: "high",
    });
    return baseOutput(WINBACK_REENGAGEMENT_SKILL_ID, {
      status: "exit",
      response_intent: "exit_to_global_dispatcher",
      reply: "",
      diagnosis: {
        local_flow: true,
        reason_code: "winback_reengagement_state_unreadable",
        note_information: unreadableNote,
      },
      effects: { requested: [], allowed: [], blocked: [], committed: [] },
      state_patch: {
        winback_reengagement_local_state: null,
        winback_reengagement_note_information: unreadableNote,
        winback_reengagement_exit_memo: {
          reason: "winback_reengagement_state_unreadable",
          user_message_summary: input.user_message,
          flow_summary: null,
          note_information: unreadableNote,
          at: new Date().toISOString(),
        },
        summary: "Winback reengagement state unreadable; exited to global.",
      },
    });
  }

  const dispatcher = input.local_dispatcher ??
    runWinbackReengagementLocalDispatcher;
  let decision: WinbackReengagementLocalDecision;
  try {
    decision = await dispatcher({
      userId: input.context.user_id,
      requestId:
        String((input.context.turn_frame as any)?.source_message_id ?? "") ||
        null,
      userMessage: input.user_message,
      recentMessages: input.context.recent_messages,
      state: previous,
    });
  } catch (error) {
    console.warn("[winback-reengagement] local dispatcher failed", error);
    decision = winbackReengagementLocalFailureDecision({
      userMessage: input.user_message,
      state: previous,
    });
  }
  const localState = nextLocalState(previous, decision);
  const episodeEffect = episodeEffectForDecision(localState, decision);
  const trace = dispatchTrace(decision, localState);
  console.info("[winback-reengagement] local_dispatcher_result", trace);

  const isSilentExit = decision.action === "exit_to_global_dispatcher" ||
    decision.action === "safety_exit" ||
    decision.action === "handoff_coaching_recommendation";

  if (isSilentExit) {
    return baseOutput(WINBACK_REENGAGEMENT_SKILL_ID, {
      status: "exit",
      response_intent: decision.action === "safety_exit"
        ? "safety_preempt"
        : "exit_to_global_dispatcher",
      reply: "",
      diagnosis: {
        local_flow: true,
        winback_reengagement_local_dispatch: trace,
        note_information: decision.note_information,
        reason_code: decision.reason,
      },
      effects: { requested: [], allowed: [], blocked: [], committed: [] },
      state_patch: {
        winback_reengagement_local_state: localState,
        winback_reengagement_note_information: decision.note_information,
        winback_reengagement_exit_memo: exitMemo({
          decision,
          userMessage: input.user_message,
          state: localState,
        }),
        winback_reengagement_episode_effect: episodeEffect,
        summary: noteInformationSummary(decision.note_information) ??
          `Winback reengagement exited: ${decision.action}.`,
      },
    });
  }

  const visibleAgent = input.visible_agent ?? runWinbackReengagementVisibleAgent;
  let reply = "";
  try {
    reply = await visibleAgent({
      userId: input.context.user_id,
      requestId:
        String((input.context.turn_frame as any)?.source_message_id ?? "") ||
        null,
      userMessage: input.user_message,
      recentMessages: input.context.recent_messages,
      state: localState,
      decision,
      userFirstName:
        input.context.runtime_context?.user_identity?.first_name ?? null,
    });
  } catch (error) {
    console.warn("[winback-reengagement] visible agent failed", error);
  }
  if (!reply) reply = FALLBACK_REPLY;

  const isTerminal = decision.action === "complete_reengaged" ||
    decision.action === "accept_pause";

  return baseOutput(WINBACK_REENGAGEMENT_SKILL_ID, {
    status: isTerminal ? "complete" : "continue",
    response_intent: decision.action,
    reply,
    diagnosis: {
      local_flow: true,
      winback_reengagement_local_dispatch: trace,
      reason_code: decision.reason,
    },
    effects: { requested: [], allowed: [], blocked: [], committed: [] },
    state_patch: {
      winback_reengagement_local_state: localState,
      winback_reengagement_note_information: null,
      winback_reengagement_exit_memo: null,
      winback_reengagement_episode_effect: episodeEffect,
      summary: isTerminal
        ? `Winback reengagement closed: ${decision.action} (${
          decision.solution_kind ?? "none"
        }).`
        : `Winback reengagement continues at stage ${decision.stage_next}.`,
    },
  });
}
