// Chantier réengagement (2026-07-19) — dispatcher LOCAL du flow
// winback_reengagement_v1. Moule potion : pur classifieur LLM (jamais le
// texte visible), sorties plates, coercition default-deny sur tout ce qui est
// terminal ou mutatif. La labellisation canonique de la raison du décrochage
// n'est PAS faite ici (extracteur post-clôture) — le dispatcher ne porte
// qu'une note de travail informelle pour brancher la conversation.

import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  createNoteInformation,
  type NoteInformation,
} from "../../contracts/note_information.v1.ts";
import {
  coerceWinbackGates,
  coerceWinbackSolutionKind,
  coerceWinbackStage,
  WINBACK_REENGAGEMENT_MAX_TURNS,
  WINBACK_REENGAGEMENT_SKILL_ID,
  type WinbackReengagementGates,
  type WinbackReengagementLocalState,
  type WinbackReengagementStage,
  type WinbackSolutionKind,
} from "./state.ts";

export type WinbackReengagementLocalAction =
  | "continue_reengagement"
  | "complete_reengaged"
  | "accept_pause"
  | "handoff_coaching_recommendation"
  | "exit_to_global_dispatcher"
  | "safety_exit";

export type WinbackPauseKind = "short" | "week" | "open";

export type WinbackReengagementLocalDecision = {
  action: WinbackReengagementLocalAction;
  confidence: "low" | "medium" | "high";
  reason: string;
  stage_next: WinbackReengagementStage;
  gates: WinbackReengagementGates;
  working_reason_note: string | null;
  solution_kind: WinbackSolutionKind | null;
  redirect_target: string | null;
  pause: { kind: WinbackPauseKind; user_evidence: string } | null;
  resume_evidence: string | null;
  visible_focus: string | null;
  note_information: NoteInformation | null;
  coercions: string[];
};

export type WinbackReengagementLocalDispatcherRunner = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<unknown>;

const ACTIONS = new Set<WinbackReengagementLocalAction>([
  "continue_reengagement",
  "complete_reengaged",
  "accept_pause",
  "handoff_coaching_recommendation",
  "exit_to_global_dispatcher",
  "safety_exit",
]);

const PAUSE_KINDS = new Set<WinbackPauseKind>(["short", "week", "open"]);

const SYSTEM_PROMPT = [
  "Tu es le dispatcher LOCAL de la conversation de réengagement de Sophia (l'utilisateur avait décroché de son plan et vient de répondre à une relance).",
  "Tu classes le mouvement du message courant et fais avancer la machine à états; tu ne rédiges JAMAIS la réponse visible.",
  "Stages: opening (accueillir, classer ce que la réponse contient déjà) -> diagnose (comprendre pourquoi il a décroché, une question max) -> reanchor (relier à pourquoi SES actions comptent pour lui, rappeler qu'il peut parler à Sophia quand ça flanche) -> solution (proposer UNE porte adaptée) -> closure (sceller un micro-engagement).",
  "Les stages sont gate-driven, pas linéaires: si le user donne la raison dès son premier message, reason_status=captured et on saute diagnose. S'il veut juste reprendre, on va direct en closure.",
  "Tant qu'AUCUNE gate n'est acquise (reason_status=missing et solution_status=pending), stage_next ne peut pas être closure: la relance est une conversation, pas un guichet.",
  "Si recent_episode_confirmable=true et reason_status=missing: stage_next=diagnose — la confirmation de la raison du DERNIER épisode (dans past_episodes) EST le diagnostic. Ne re-demande pas à froid, confirme.",
  "Si plusieurs past_episodes portent la MÊME reason_category, c'est un signal STRUCTUREL: le simple ré-encouragement a déjà été servi et n'a pas tenu. Privilégie solution_kind=adjust_plan (repenser le format, la taille ou le rythme des actions sur la plateforme) et nomme la récurrence.",
  "Portes de solution selon la raison de travail: actions plus pertinentes ou trop grosses -> solution_kind=adjust_plan (redirection vers la plateforme, Plan); c'est dur SUR LE MOMENT (craving, situation difficile à traverser) -> defense_card; il n'y pense pas, oublie, manque d'élan structurel, manque de CADRE (rien d'externe ne pousse, discipline à tenir seul, a perdu de vue pourquoi ça compte) -> attack_card (mantra de force / texte magique); surcharge de vie -> pause ou adjust_plan; état émotionnel -> talk_reminder (porte ouverte); confusion sur le fonctionnement -> product_help. La qualification SUR LE MOMENT vs CADRE t'appartient en tant que coach: un décrochage raconté avec 'ça glisse' n'est defense QUE si le user est en mouvement et dérape pendant; s'il ne se met jamais en route faute de structure, c'est attack_card.",
  "solution_kind=adjust_plan UNIQUEMENT si tu orientes vers une MODIFICATION du plan sur la plateforme. Encourager à reprendre une action existante telle quelle n'est PAS une solution: solution_kind=none.",
  "Actions:",
  "continue_reengagement: la conversation avance dans le flow (y compris proposer une solution, répondre à une objection, poser la question de diagnostic).",
  "complete_reengaged: le user est reparti (il a accepté une solution, ou dit clairement qu'il reprend). Fournis resume_evidence = citation exacte du user qui le prouve.",
  "accept_pause: le user demande EXPLICITEMENT une pause (pas maintenant / pas cette semaine / laisse-moi revenir). Fournis pause.kind (short=2-3 jours, week=cette semaine, open=il reviendra de lui-même) et pause.user_evidence = citation exacte.",
  "handoff_coaching_recommendation: le user est partant pour un outil contre le craving ou le manque d'élan; solution_kind doit être attack_card ou defense_card. Le flow de recommandation prendra la main.",
  "exit_to_global_dispatcher: le user change complètement de sujet ou demande un dispositif produit précis (rappel, potion, statut, question produit). Ne nomme jamais le prochain flow.",
  "safety_exit: idéation suicidaire, auto-agression, danger immédiat ou signal de crise.",
  "Ne déduis JAMAIS une pause d'un ton las: sans demande explicite, continue_reengagement.",
  "En cas de doute entre continuer et clore, continue_reengagement.",
  "Réponds uniquement en JSON avec EXACTEMENT ces champs:",
  '{"action":"continue_reengagement"|"complete_reengaged"|"accept_pause"|"handoff_coaching_recommendation"|"exit_to_global_dispatcher"|"safety_exit",',
  '"confidence":"low"|"medium"|"high" (une de ces trois chaines, jamais un nombre),',
  '"reason":"<phrase courte en francais>",',
  '"stage_next":"opening"|"diagnose"|"reanchor"|"solution"|"closure",',
  '"gates":{"reason_status":"missing"|"captured"|"declined","reanchor_status":"not_needed"|"pending"|"done","solution_status":"pending"|"offered"|"accepted"|"declined"},',
  '"working_reason_note":"<note courte sur pourquoi il a décroché, dans ses mots>"|null,',
  '"solution_kind":"adjust_plan"|"attack_card"|"defense_card"|"pause"|"talk_reminder"|"product_help"|"none"|null,',
  '"pause":{"kind":"short"|"week"|"open","user_evidence":"<citation exacte du user>"}|null,',
  '"resume_evidence":"<citation exacte du user>"|null,',
  '"visible_focus":"<consigne courte pour le tour visible: quoi dire/demander maintenant>"|null}',
  "accept_pause exige pause.user_evidence non vide. complete_reengaged exige reason_status!=missing OU resume_evidence non vide. handoff_coaching_recommendation exige solution_kind=attack_card ou defense_card.",
].join("\n");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseModel(raw: unknown): Record<string, unknown> | null {
  if (isRecord(raw)) return raw;
  const text = cleanText(raw, 6_000)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function redirectTargetForSolution(
  kind: WinbackSolutionKind | null,
): string | null {
  if (kind === "adjust_plan") return "Plan";
  if (kind === "attack_card") return "Cartes";
  if (kind === "defense_card") return "Cartes";
  if (kind === "product_help") return null;
  return null;
}

function noteForExit(input: {
  action: WinbackReengagementLocalAction;
  reason: string;
  userMessage: string;
  state: WinbackReengagementLocalState;
  solutionKind: WinbackSolutionKind | null;
}): NoteInformation {
  const isSafety = input.action === "safety_exit";
  const isHandoff = input.action === "handoff_coaching_recommendation";
  return createNoteInformation({
    source_flow_id: WINBACK_REENGAGEMENT_SKILL_ID,
    handoff_reason: isSafety
      ? "safety"
      : isHandoff
      ? "bridge"
      : "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher: isHandoff
      ? `Winback reengagement hands off to coaching recommendation (${
        input.solutionKind ?? "card"
      }): ${input.reason}`
      : `Winback reengagement released ownership: ${input.reason}`,
    user_words: [input.userMessage],
    structured_context: {
      source_flow: WINBACK_REENGAGEMENT_SKILL_ID,
      exit_action: input.action,
      exit_reason: input.reason,
      episode_id: input.state.episode_id,
      winback_step: input.state.winback_step,
      working_reason_note: input.state.working_reason_note,
      solution_kind: input.solutionKind,
      // Parité claim/ledger : rien n'a été créé ni modifié depuis le chat.
      render_constraints: [
        "no_mutation_claim: ne jamais dire qu'une carte a été créée, que le plan a été ajusté ou qu'un objet a été modifié — le flow réengagement ne fait que rediriger.",
      ],
      recommended_next_focus: isHandoff
        ? "coaching_recommendation"
        : "global_dispatcher_reclassify_current_message",
    },
    confidence: "high",
  });
}

export function normalizeWinbackReengagementDecision(input: {
  raw: unknown;
  userMessage: string;
  state: WinbackReengagementLocalState;
}): WinbackReengagementLocalDecision {
  const coercions: string[] = [];
  const parsed = parseModel(input.raw);

  if (!parsed) {
    // Sortie invalide : on continue dans le flow avec l'état inchangé — le
    // tour visible reste groundé sur le stage courant. (Contraste avec le sas
    // potion qui exit : ici le user est déjà en conversation structurée.)
    return {
      action: "continue_reengagement",
      confidence: "low",
      reason: "local_dispatcher_invalid_output",
      stage_next: input.state.stage,
      gates: input.state.gates,
      working_reason_note: input.state.working_reason_note,
      solution_kind: input.state.solution_kind,
      redirect_target: input.state.redirect_target,
      pause: null,
      resume_evidence: null,
      visible_focus: null,
      note_information: null,
      coercions: ["invalid_output_continue_unchanged"],
    };
  }

  let action = ACTIONS.has(
      cleanText(parsed.action, 60) as WinbackReengagementLocalAction,
    )
    ? cleanText(parsed.action, 60) as WinbackReengagementLocalAction
    : "continue_reengagement";
  if (!ACTIONS.has(cleanText(parsed.action, 60) as never)) {
    coercions.push("unknown_action_to_continue");
  }

  const rawConfidence: unknown = parsed.confidence;
  const numericConfidence = typeof rawConfidence === "number"
    ? rawConfidence
    : /^[0-9.]+$/.test(cleanText(rawConfidence, 10))
    ? Number(cleanText(rawConfidence, 10))
    : NaN;
  const confidence = rawConfidence === "high" || rawConfidence === "medium" ||
      rawConfidence === "low"
    ? rawConfidence
    : Number.isFinite(numericConfidence) && numericConfidence >= 0 &&
        numericConfidence <= 1
    ? (numericConfidence >= 0.75
      ? "high"
      : numericConfidence >= 0.4
      ? "medium"
      : "low")
    : "low";

  const stageNext = coerceWinbackStage(parsed.stage_next);
  // Merge par champ sur les gates précédentes : un objet gates PARTIEL renvoyé
  // par le LLM (p.ex. seulement solution_status) ne doit pas faire régresser
  // un reason_status "captured" déjà acquis vers "missing" (review 19/07 #25).
  const previousGates = input.state.gates;
  const parsedGates = isRecord(parsed.gates) ? parsed.gates : {};
  const gates = coerceWinbackGates({
    reason_status: parsedGates.reason_status ?? previousGates.reason_status,
    reanchor_status: parsedGates.reanchor_status ??
      previousGates.reanchor_status,
    solution_status: parsedGates.solution_status ??
      previousGates.solution_status,
  });
  const workingReasonNote = cleanText(parsed.working_reason_note, 500) ||
    input.state.working_reason_note;
  let solutionKind = coerceWinbackSolutionKind(parsed.solution_kind) ??
    input.state.solution_kind;
  const resumeEvidence = cleanText(parsed.resume_evidence, 300) || null;
  const visibleFocus = cleanText(parsed.visible_focus, 400) || null;

  let pause: WinbackReengagementLocalDecision["pause"] = null;
  if (isRecord(parsed.pause)) {
    const kind = cleanText(parsed.pause.kind, 20) as WinbackPauseKind;
    const evidence = cleanText(parsed.pause.user_evidence, 300);
    if (PAUSE_KINDS.has(kind) && evidence) {
      pause = { kind, user_evidence: evidence };
    }
  }

  // Default-deny sur tout ce qui est terminal ou mutatif.
  if (action === "accept_pause" && !pause) {
    action = "continue_reengagement";
    coercions.push("pause_without_evidence_downgraded");
  }
  if (
    action === "complete_reengaged" &&
    gates.reason_status === "missing" && !resumeEvidence
  ) {
    action = "continue_reengagement";
    coercions.push("complete_without_reason_or_evidence_downgraded");
  }
  // QA S2 (20/07), leçon P8 : les conditions ci-dessus viennent de la MÊME
  // sortie LLM que l'action — le modèle peut toutes les fabriquer d'un coup
  // (gates «captured/done/accepted» + citation-excuse comme resume_evidence
  // sur « désolée j'ai encore disparu »). L'invariant s'appuie donc sur
  // l'état PERSISTÉ : une clôture exige au moins un tour de flow déjà joué.
  // Le premier tour est toujours une conversation (opening/confirm), jamais
  // un guichet de clôture.
  let stageAfterCoercion = stageNext;
  let gatesAfterCoercion = gates;
  // QA S11 (20/07) : une closure sans RIEN d'acquis est une incohérence de la
  // machine à états (validation d'état persisté, pas d'interprétation du
  // message). Le stage retombe là où la conversation doit se tenir — diagnose,
  // où vit la confirmation de la raison passée.
  if (
    action === "continue_reengagement" && stageNext === "closure" &&
    input.state.gates.reason_status === "missing" &&
    input.state.gates.solution_status === "pending" &&
    gates.reason_status === "missing"
  ) {
    stageAfterCoercion = "diagnose";
    coercions.push("empty_closure_stage_redirected_to_diagnose");
  }
  if (action === "complete_reengaged" && input.state.turn_count < 1) {
    action = "continue_reengagement";
    coercions.push("first_turn_completion_downgraded");
    // Les gates «acquises» qui accompagnaient la clôture rejetée sont
    // fabriquées par la même sortie : on repart de l'état persisté, et le
    // stage retombe là où la conversation doit réellement se tenir (diagnose
    // = là où vit la règle «confirme la raison passée au lieu de re-demander»).
    gatesAfterCoercion = input.state.gates;
    stageAfterCoercion = input.state.gates.reason_status === "missing"
      ? "diagnose"
      : "reanchor";
  }
  if (
    action === "handoff_coaching_recommendation" &&
    solutionKind !== "attack_card" && solutionKind !== "defense_card"
  ) {
    action = "continue_reengagement";
    coercions.push("handoff_without_card_kind_downgraded");
  }
  if (action === "accept_pause") solutionKind = "pause";

  // Garde-fou anti-boucle : au-delà du budget de tours, un continue devient
  // une clôture (le flow ne retient jamais un utilisateur en otage).
  if (
    action === "continue_reengagement" &&
    input.state.turn_count + 1 >= WINBACK_REENGAGEMENT_MAX_TURNS
  ) {
    action = "complete_reengaged";
    coercions.push("max_turns_forced_completion");
  }

  const reason = cleanText(parsed.reason, 300) ||
    "winback_reengagement_local_decision";
  // redirect_target suit la solution COURANTE (pas de fallback collant sur
  // l'ancien target : une bascule vers pause/talk_reminder doit le remettre à
  // null, review 19/07 #26). solutionKind reste sticky via son propre ??, donc
  // une omission LLM conserve la solution — mais un changement la reflète.
  const redirectTarget = redirectTargetForSolution(solutionKind);

  const isExit = action === "exit_to_global_dispatcher" ||
    action === "safety_exit" ||
    action === "handoff_coaching_recommendation";
  const note = isExit
    ? noteForExit({
      action,
      reason,
      userMessage: input.userMessage,
      state: {
        ...input.state,
        working_reason_note: workingReasonNote,
      },
      solutionKind,
    })
    : null;

  return {
    action,
    confidence,
    reason,
    stage_next: stageAfterCoercion,
    gates: gatesAfterCoercion,
    working_reason_note: workingReasonNote,
    solution_kind: solutionKind,
    redirect_target: redirectTarget,
    pause,
    resume_evidence: resumeEvidence,
    visible_focus: visibleFocus,
    note_information: note,
    coercions,
  };
}

export async function runWinbackReengagementLocalDispatcher(input: {
  userId: string;
  requestId?: string | null;
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  state: WinbackReengagementLocalState;
  runner?: WinbackReengagementLocalDispatcherRunner;
}): Promise<WinbackReengagementLocalDecision> {
  const userPrompt = JSON.stringify({
    flow_state: {
      stage: input.state.stage,
      gates: input.state.gates,
      turn_count: input.state.turn_count,
      awaiting_first_reply: input.state.awaiting_first_reply,
      winback_step: input.state.winback_step,
      days_inactive_at_send: input.state.days_inactive_at_send,
      working_reason_note: input.state.working_reason_note,
      solution_kind: input.state.solution_kind,
    },
    grounding: {
      stalled_actions: input.state.context.stalled_actions,
      past_episodes: input.state.context.past_episodes,
      recent_episode_confirmable:
        input.state.context.recent_episode_confirmable,
    },
    recent_messages: input.recentMessages.slice(-8),
    current_user_message: input.userMessage,
  });
  const raw = input.runner
    ? await input.runner(SYSTEM_PROMPT, userPrompt)
    : await generateWithGemini(
      SYSTEM_PROMPT,
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.requestId ?? undefined,
        userId: input.userId,
        source: "winback-reengagement-local-dispatcher-v1",
        model: getGlobalAiModel(),
        maxRetries: 1,
        httpTimeoutMs: 15_000,
      },
    );
  return normalizeWinbackReengagementDecision({
    raw,
    userMessage: input.userMessage,
    state: input.state,
  });
}

export function winbackReengagementLocalFailureDecision(input: {
  userMessage: string;
  state: WinbackReengagementLocalState;
}): WinbackReengagementLocalDecision {
  return normalizeWinbackReengagementDecision({ ...input, raw: null });
}

export {
  SYSTEM_PROMPT as WINBACK_REENGAGEMENT_LOCAL_DISPATCHER_SYSTEM_PROMPT,
};
