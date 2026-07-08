import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import { runDirectEffectGate } from "../../../routers/direct_effect_gate.ts";
import type {
  TrackProgressCommittedEffect,
  TrackProgressDirectEffectResult,
  TrackProgressIntent,
  TrackProgressRequestedEffect,
  TrackProgressStatus,
  TrackProgressWrite,
} from "./contract.ts";
import type { TrackProgressSameDayEvidenceCheck } from "./db.ts";
import { binaryItemPartialClarifyQuestion } from "./db.ts";
import { executeTrackProgressWrite } from "./executor.ts";
import { requestedEffectFromIntake, runTrackProgressIntake } from "./intake.ts";
import {
  enforceTrackProgressReplyInvariant,
  renderTrackProgressClarification,
  renderTrackProgressContradictionClarification,
  renderTrackProgressLoggedReply,
} from "./renderer.ts";

export type TrackProgressPlanItemRouterInput = {
  turn_frame: TurnFrame;
  message: string;
  plan_snapshot: unknown;
  recent_writes_idempotency?: { source_message_ids: string[] };
  db_idempotency_check?: (key: string) => Promise<boolean>;
  // Lecture d'evidence meme-jour injectee (voir
  // createTrackProgressSameDayEvidenceCheck): detecte un outcome oppose deja
  // committe avant d'autoriser un write non confirme.
  same_day_evidence_check?: TrackProgressSameDayEvidenceCheck;
  // Fenetre d'evidence textuelle pour le grounding de cible (F2): les 2
  // derniers messages de la conversation (les deux roles). La cible doit
  // etre attestee dans le message courant ou cette fenetre, sinon clarify.
  evidence_messages?: string[];
  no_mutation_requested?: boolean;
  blocked_reason_code?: string | null;
  write_progress: TrackProgressWrite;
};

export type TrackProgressRuntimeStateResult = {
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
  executedTools: string[];
};

export type TrackProgressDispatcherSignal = {
  detected: boolean;
  target_item_id?: string | null;
  target_title?: string | null;
  status_hint?: string | null;
  value_hint?: number | null;
  date_hint?: string | null;
};

export type TrackProgressPlanItemRuntimeInput =
  & Omit<TrackProgressPlanItemRouterInput, "turn_frame">
  & {
    turn_frame: TurnFrame | null;
    temp_memory: any;
    source_message_id?: string | null;
    skip_reason_code?: string | null;
  };

export const TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY =
  "__track_progress_plan_item_runtime";

function hasTrackProgressEffect(turnFrame: TurnFrame): boolean {
  return turnFrame.direct_effects.some((effect) =>
    effect.effect_type === "track_progress_plan_item"
  );
}

export function dispatcherTrackProgressSignalFromTurnFrame(
  turnFrame: TurnFrame | null,
): TrackProgressDispatcherSignal {
  const effect = turnFrame?.direct_effects.find((candidate) =>
    candidate.effect_type === "track_progress_plan_item"
  );
  if (!effect) return { detected: false };
  const payload = effect.payload_hint &&
      typeof effect.payload_hint === "object" &&
      !Array.isArray(effect.payload_hint)
    ? effect.payload_hint as Record<string, unknown>
    : {};
  return {
    detected: true,
    target_item_id: typeof payload.target_item_id === "string"
      ? payload.target_item_id
      : null,
    target_title: typeof payload.target_title === "string"
      ? payload.target_title
      : null,
    status_hint: typeof payload.status_hint === "string"
      ? payload.status_hint
      : null,
    value_hint: typeof payload.value_hint === "number"
      ? payload.value_hint
      : null,
    date_hint: typeof payload.date_hint === "string" ? payload.date_hint : null,
  };
}

function emptyResult(reasonCode: string): TrackProgressDirectEffectResult {
  return {
    detected: false,
    intent: "ignore",
    status: "ignored",
    reply: null,
    executed_tools: [],
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [],
    blocked_effects: [],
    debug: { reason_code: reasonCode },
  };
}

function blockedResult(params: {
  intent: TrackProgressIntent;
  reason_code: string;
  status?: "blocked" | "failed" | "ignored" | "needs_clarify";
  gate_reason?: string | null;
  requested_effects?: TrackProgressRequestedEffect[];
  allowed_effects?: TrackProgressRequestedEffect[];
  reply?: string | null;
}): TrackProgressDirectEffectResult {
  return enforceTrackProgressReplyInvariant({
    detected: true,
    intent: params.intent,
    status: params.status ?? "blocked",
    reply: params.reply ?? null,
    executed_tools: [],
    requested_effects: params.requested_effects ?? [],
    allowed_effects: params.allowed_effects ?? [],
    committed_effects: [],
    blocked_effects: [{
      type: "track_progress_plan_item",
      reason_code: params.reason_code,
    }],
    debug: {
      reason_code: params.reason_code,
      gate_reason: params.gate_reason ?? null,
    },
  });
}

function normalizeGateReasonCode(reasonCode: string): string {
  return reasonCode === "missing_time" ? "target_missing" : reasonCode;
}

function intentForProgressStatus(
  status: TrackProgressStatus,
): TrackProgressIntent {
  if (status === "missed") return "log_missed";
  if (status === "partial") return "log_partial";
  return "log_completed";
}

function planItems(
  planSnapshot: unknown,
): Array<
  {
    id: string;
    title: string;
    aliases: string[];
    dimension: string;
    target_reps: number | null;
  }
> {
  const items = Array.isArray(planSnapshot)
    ? planSnapshot
    : Array.isArray((planSnapshot as any)?.items)
    ? (planSnapshot as any).items
    : [];
  return items
    .map((item: any) => ({
      id: String(item?.id ?? ""),
      title: String(item?.title ?? ""),
      // nina-r7 B01: la garde partial-sur-binaire lit ces deux faits
      // structures du snapshot (jamais le texte du message).
      dimension: String(item?.dimension ?? ""),
      target_reps: Number.isFinite(Number(item?.target_reps)) &&
          item?.target_reps !== null && item?.target_reps !== undefined
        ? Number(item.target_reps)
        : null,
      aliases: [
        // Vocabulaire user-facing structurel de l'item: aliases si presents,
        // et description (le snapshot V2 la porte) — reduit la friction
        // quand le user nomme l'action avec ses mots a lui.
        ...(Array.isArray(item?.aliases)
          ? item.aliases.map((alias: unknown) => String(alias ?? ""))
          : []),
        String(item?.description ?? ""),
      ].filter(Boolean),
    }))
    .filter((item: { id: string; title: string }) => item.id && item.title);
}

function normalizeEvidenceText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Grounding de cible v2 (G1, contrat 3d-ter): le dispatcher fournit la
 * PREUVE — payload_hint.target_evidence, citation verbatim des mots du user
 * qui nomment l'action visee. Le runtime ne porte AUCUNE connaissance
 * metier (zero liste, zero pattern): il verifie seulement que la citation
 * existe telle quelle dans le message courant ou la fenetre recente
 * (normalisation accents/casse/espaces uniquement, pour tolerer une
 * citation aux accents pres). Toute la semantique — quel item, quels mots
 * le nomment — reste dans le prompt. Citation absente ou introuvable =
 * cible non prouvee → clarification (contrat O + re-arm 3g).
 */
export function trackTargetEvidenceVerified(args: {
  target_evidence: string | null;
  target_title: string;
  target_aliases?: string[];
  texts: string[];
}): boolean {
  const quote = normalizeEvidenceText(String(args.target_evidence ?? ""));
  if (!quote) return false;
  const quoteExists = args.texts.some((text) =>
    normalizeEvidenceText(text).includes(quote)
  );
  if (!quoteExists) return false;
  // Coherence citation ↔ cible choisie (observed: le modele cite la
  // reference vague elle-meme, "un autre truc du plan", comme evidence).
  // Une citation qui ne partage AUCUN mot avec le titre de l'item choisi ne
  // peut pas le nommer. Intersection ensembliste pure entre deux chaines du
  // contrat — zero liste, zero connaissance metier, rien a maintenir.
  // Les aliases structures de l'item comptent comme son nom: c'est le
  // vocabulaire user-facing prevu par le produit ("ma marche" pour "Faire
  // 10 min de mouvement en rentrant").
  const titleTokens = new Set(
    [args.target_title, ...(args.target_aliases ?? [])]
      .flatMap((source) =>
        normalizeEvidenceText(source).split(/[^a-z0-9]+/)
      )
      .filter((token) => token.length >= 3),
  );
  if (titleTokens.size === 0) return true;
  const quoteTokens = quote.split(/[^a-z0-9]+/).filter((token) =>
    token.length >= 3
  );
  return quoteTokens.some((token) => titleTokens.has(token));
}

export async function runTrackProgressPlanItemDirectEffect(
  input: TrackProgressPlanItemRouterInput,
): Promise<TrackProgressDirectEffectResult> {
  if (!hasTrackProgressEffect(input.turn_frame)) {
    return emptyResult("no_track_progress_direct_effect");
  }

  const intake = runTrackProgressIntake({
    turn_frame: input.turn_frame,
    message: input.message,
  });

  if (input.blocked_reason_code) {
    return blockedResult({
      intent: "ignore",
      reason_code: input.blocked_reason_code,
    });
  }

  if (input.no_mutation_requested) {
    return blockedResult({
      intent: "ignore",
      reason_code: "global_no_mutation_context",
    });
  }

  if (intake.intent === "status_question") {
    return blockedResult({
      intent: "status_question",
      status: "ignored",
      reason_code: "status_question",
    });
  }

  if (intake.intent === "future_intent") {
    return blockedResult({
      intent: "future_intent",
      reason_code: "future_intent",
    });
  }

  if (!intake.detected) return emptyResult(intake.reason_code);

  const itemForRequest = planItems(input.plan_snapshot).find((candidate) =>
    candidate.id === intake.target_item_id
  );
  const requested = requestedEffectFromIntake({
    intake,
    target_title: itemForRequest?.title ?? intake.target_title ??
      intake.target_item_id ?? "",
    source_message_id: input.turn_frame.source_message_id,
  });
  const requestedEffects = requested ? [requested] : [];

  const gate = await runDirectEffectGate({
    effect_type: "track_progress_plan_item",
    turn_frame: input.turn_frame,
    recent_writes_idempotency: input.recent_writes_idempotency ??
      { source_message_ids: [] },
    db_idempotency_check: input.db_idempotency_check ?? (async () => false),
  });
  if (gate.decision === "blocked") {
    const reasonCode = normalizeGateReasonCode(gate.reason_code);
    return blockedResult({
      intent: "ignore",
      reason_code: reasonCode,
      gate_reason: gate.reason_code,
      requested_effects: requestedEffects,
    });
  }
  if (gate.decision === "needs_clarify") {
    const reasonCode = normalizeGateReasonCode(gate.reason_code);
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: reasonCode,
      gate_reason: gate.reason_code,
      reply: gate.suggested_clarification ??
        renderTrackProgressClarification(reasonCode),
      requested_effects: requestedEffects,
    });
  }

  if (intake.reason_code === "status_missing") {
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: "status_missing",
      reply: renderTrackProgressClarification("status_missing"),
      requested_effects: requestedEffects,
    });
  }

  if (!requested) {
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: intake.target_item_id ? "status_missing" : "target_missing",
      reply: renderTrackProgressClarification(
        intake.target_item_id ? "status_missing" : "target_missing",
      ),
    });
  }

  const item = itemForRequest;
  if (!item) {
    return blockedResult({
      intent: "ignore",
      reason_code: "target_not_in_plan",
      requested_effects: requestedEffects,
    });
  }

  // Grounding de cible (G1, contrat 3d-ter): le dispatcher doit fournir la
  // citation verbatim des mots du user qui nomment la cible. Citation
  // absente (cible devinee, « un autre truc du plan ») ou introuvable
  // (fabriquee) → on n'ecrit pas, on demande (contrat O: la question part au
  // composeur + re-arm 3g au tour suivant). Zero sous-flow, zero etat.
  if (
    !trackTargetEvidenceVerified({
      target_evidence: intake.target_evidence,
      target_title: item.title,
      target_aliases: item.aliases,
      texts: [input.message, ...(input.evidence_messages ?? [])],
    })
  ) {
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: "target_not_evidenced",
      reply:
        `Tu parles de quelle action exactement ? Je pensais a "${item.title}" mais je prefere que tu me la nommes avant de la noter.`,
      requested_effects: requestedEffects,
    });
  }

  // nina-r7 B01 (arbitrage 2026-07-08): « j'ai avance » ≠ « j'ai fini ». Sur
  // un item tout-ou-rien, un report partiel n'a aucun etat intermediaire a
  // ecrire → question de confirmation, zero write. Garde ici (outcome
  // needs_clarify de premiere classe, re-armable au tour suivant via 3g) —
  // le double de db.ts reste en ceinture pour les autres chemins d'ecriture.
  const partialClarify = binaryItemPartialClarifyQuestion({
    status: requested.progress_status,
    item: {
      dimension: item.dimension,
      target_reps: item.target_reps ?? null,
      title: item.title,
    },
    fallbackTitle: requested.target_item_id,
  });
  if (partialClarify) {
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: "partial_on_binary_item",
      reply: partialClarify.question,
      requested_effects: requestedEffects,
    });
  }

  // Invariant d'integrite d'evidence: un outcome oppose deja committe le meme
  // jour (daily review, dashboard, tour precedent) exige une correction
  // explicite (payload_hint.correction, contrat dispatcher 3h). Sans elle, on
  // demande confirmation au lieu d'ecrire une evidence contradictoire.
  if (input.same_day_evidence_check && !intake.is_correction) {
    const conflicting = await input.same_day_evidence_check({
      target_item_id: requested.target_item_id,
      progress_status: requested.progress_status,
      date_hint: requested.date_hint ?? null,
    });
    if (conflicting) {
      // Blocked, pas clarify (paul-r5 B02): la confirmation qu'un clarify
      // inviterait est inexecutable (pas d'override same-day en chat, V1) —
      // l'offrir creait une boucle morte T14→T15.
      return blockedResult({
        intent: "ignore",
        status: "blocked",
        reason_code: "contradicts_same_day_evidence",
        reply: renderTrackProgressContradictionClarification({
          target_title: item.title,
          existing_outcome: conflicting.outcome,
          requested_status: requested.progress_status,
        }),
        requested_effects: requestedEffects,
      });
    }
  }

  const allowed: TrackProgressRequestedEffect = {
    ...requested,
    target_title: item.title,
  };
  const execution = await executeTrackProgressWrite({
    requested_effect: allowed,
    user_id: input.turn_frame.user_id,
    idempotency_key: gate.idempotency_key,
    write_progress: input.write_progress,
  });
  if (execution.status === "failed") {
    return blockedResult({
      intent: intake.intent,
      status: "failed",
      reason_code: execution.reason_code,
      requested_effects: requestedEffects,
      allowed_effects: [allowed],
    });
  }
  if (execution.status === "already_logged") {
    // Le progres demande est deja en DB pour ce jour (autre message): rien de
    // re-ecrit. Le composeur confirme l'existant via le contexte de
    // confirmation au lieu de re-committer ou de nier (Paul r1 T15).
    return blockedResult({
      intent: intake.intent,
      reason_code: "already_tracked_today",
      requested_effects: requestedEffects,
      allowed_effects: [allowed],
    });
  }

  const committed = execution.committed_effect;
  return enforceTrackProgressReplyInvariant({
    detected: true,
    intent: intake.intent,
    status: "logged",
    reply: renderTrackProgressLoggedReply(committed),
    executed_tools: ["track_progress_plan_item"],
    requested_effects: requestedEffects,
    allowed_effects: [allowed],
    committed_effects: [committed],
    blocked_effects: [],
    debug: {
      reason_code: "logged",
      gate_reason: null,
    },
  });
}

export function applyTrackProgressDirectEffectRuntimeState(args: {
  temp_memory: any;
  result: TrackProgressDirectEffectResult;
  source_message_id?: string | null;
}): TrackProgressRuntimeStateResult {
  const { temp_memory: tempMemory, result, source_message_id } = args;
  if (!result.detected || result.status === "ignored") {
    return { toolExecution: "none", executedTools: [] };
  }

  if (result.status === "logged") {
    const committed = result.committed_effects[0] ?? null;
    (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
      mode: "logged",
      message: result.reply ?? "",
      target: committed?.target_title ?? "",
      status: committed?.progress_status ?? "",
      source_message_id: source_message_id ?? null,
      committed_effects: result.committed_effects,
    };
    return {
      toolExecution: "success",
      executedTools: [...result.executed_tools],
    };
  }

  if (result.status === "needs_clarify") {
    const requestedSnapshot = result.requested_effects[0] ?? null;
    (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
      mode: "needs_clarify",
      message: result.reply ??
        "Impossible de logger automatiquement. Oriente vers le dashboard pour mise a jour immediate, ou propose d'attendre le prochain bilan.",
      reason_code: result.debug.reason_code,
      source_message_id: source_message_id ?? null,
      // Slots deja etablis: le dispatcher peut re-emettre l'effet complete
      // quand le user repond a la clarification (chantier O4, eva-r2 B01).
      known_slots: requestedSnapshot
        ? {
          target_item_id: requestedSnapshot.target_item_id ?? null,
          target_title: requestedSnapshot.target_title ?? null,
          progress_status: requestedSnapshot.progress_status ?? null,
          date_hint: requestedSnapshot.date_hint ?? null,
        }
        : null,
    };
    return { toolExecution: "blocked", executedTools: [] };
  }

  if (result.status === "failed") {
    (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
      mode: "failed",
      reason_code: result.debug.reason_code,
      source_message_id: source_message_id ?? null,
    };
    return { toolExecution: "failed", executedTools: [] };
  }

  (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
    mode: "blocked",
    reason_code: result.debug.reason_code,
    source_message_id: source_message_id ?? null,
  };
  return { toolExecution: "blocked", executedTools: [] };
}

/**
 * Fenetre de re-arm (chantier O4): apres un needs_clarify, le tour suivant
 * peut completer l'ecriture si le user repond a la question. On expose la
 * clarification en attente au dispatcher global UNE seule fois (le tour
 * d'apres), avec les slots deja etablis pour qu'il re-emette l'effet complet.
 * Marque l'etat comme expose (mutation volontaire du runtime key, persistee
 * avec temp_memory) pour ne pas polluer les tours ulterieurs.
 */
export function pendingTrackProgressClarificationForDispatcher(
  tempMemory: unknown,
): {
  effect_type: "track_progress_plan_item";
  reason_code: string;
  clarify_question: string;
  known_slots: Record<string, unknown> | null;
} | null {
  const runtime = (tempMemory as any)?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY];
  if (!runtime || runtime.mode !== "needs_clarify") return null;
  if (runtime.clarification_exposed_to_dispatcher === true) return null;
  runtime.clarification_exposed_to_dispatcher = true;
  return {
    effect_type: "track_progress_plan_item",
    reason_code: String(runtime.reason_code ?? "needs_clarify"),
    clarify_question: String(runtime.message ?? ""),
    known_slots: runtime.known_slots &&
        typeof runtime.known_slots === "object"
      ? runtime.known_slots as Record<string, unknown>
      : null,
  };
}

export function applyTrackProgressDirectEffectFailureState(args: {
  temp_memory: any;
  source_message_id?: string | null;
  reason_code?: string | null;
}): TrackProgressRuntimeStateResult {
  (args.temp_memory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
    mode: "failed",
    reason_code: args.reason_code ?? "track_progress_direct_effect_failed",
    source_message_id: args.source_message_id ?? null,
  };
  return { toolExecution: "failed", executedTools: [] };
}

export async function maybeRunTrackProgressPlanItemRuntime(
  input: TrackProgressPlanItemRuntimeInput,
): Promise<TrackProgressRuntimeStateResult> {
  if (!input.turn_frame) {
    return { toolExecution: "none", executedTools: [] };
  }
  const turnFrame = input.turn_frame;
  if (input.skip_reason_code) {
    return { toolExecution: "none", executedTools: [] };
  }

  const sourceMessageId = input.source_message_id ??
    turnFrame.source_message_id;
  const alreadyLogged =
    (input.temp_memory as any)?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
      ?.source_message_id &&
    sourceMessageId &&
    (input.temp_memory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
        .source_message_id ===
      sourceMessageId;
  if (alreadyLogged) return { toolExecution: "none", executedTools: [] };

  try {
    const previousSourceMessageId = String(
      (input.temp_memory as any)?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
        ?.source_message_id ?? "",
    ).trim();
    const result = await runTrackProgressPlanItemDirectEffect({
      turn_frame: turnFrame,
      message: input.message,
      plan_snapshot: input.plan_snapshot,
      db_idempotency_check: input.db_idempotency_check,
      same_day_evidence_check: input.same_day_evidence_check,
      no_mutation_requested: input.no_mutation_requested,
      blocked_reason_code: input.blocked_reason_code,
      write_progress: input.write_progress,
      recent_writes_idempotency: input.recent_writes_idempotency ?? {
        source_message_ids: previousSourceMessageId
          ? [previousSourceMessageId]
          : [],
      },
    });
    return applyTrackProgressDirectEffectRuntimeState({
      temp_memory: input.temp_memory,
      result,
      source_message_id: sourceMessageId,
    });
  } catch (_error) {
    return applyTrackProgressDirectEffectFailureState({
      temp_memory: input.temp_memory,
      source_message_id: sourceMessageId,
      reason_code: "track_progress_direct_effect_failed",
    });
  }
}

export async function runTrackProgressPlanItemFromWeeklyCorrection(args: {
  user_id: string;
  target_item_id: string;
  target_title: string;
  progress_status: "completed" | "missed" | "partial";
  value: number;
  date_hint?: string | null;
  source_message_id: string;
  write_progress: TrackProgressWrite;
}): Promise<TrackProgressDirectEffectResult> {
  const requested: TrackProgressRequestedEffect = {
    type: "track_progress_plan_item",
    target_item_id: args.target_item_id,
    target_title: args.target_title,
    progress_status: args.progress_status,
    value: args.value,
    date_hint: args.date_hint ?? null,
    source_message_id: args.source_message_id,
  };
  const execution = await executeTrackProgressWrite({
    requested_effect: requested,
    user_id: args.user_id,
    idempotency_key: `weekly:${args.source_message_id}:${args.target_item_id}:${
      args.date_hint ?? "none"
    }`,
    write_progress: args.write_progress,
  });
  if (execution.status === "committed") {
    const committed = execution.committed_effect;
    return enforceTrackProgressReplyInvariant({
      detected: true,
      intent: intentForProgressStatus(args.progress_status),
      status: "logged",
      reply: null,
      executed_tools: [],
      requested_effects: [requested],
      allowed_effects: [requested],
      committed_effects: [committed],
      blocked_effects: [],
      debug: { reason_code: "weekly_correction_logged" },
    });
  }
  if (execution.status === "already_logged") {
    // Commit idempotent: l'evidence demandee existe deja pour (item, jour,
    // outcome) — on l'expose comme preuve au lieu de re-ecrire.
    const committed: TrackProgressCommittedEffect = {
      type: "track_progress_plan_item",
      logged_progress_id: execution.existing_progress_id,
      target_item_id: args.target_item_id,
      target_title: args.target_title,
      progress_status: args.progress_status,
      value: args.value,
    };
    return enforceTrackProgressReplyInvariant({
      detected: true,
      intent: intentForProgressStatus(args.progress_status),
      status: "logged",
      reply: null,
      executed_tools: [],
      requested_effects: [requested],
      allowed_effects: [requested],
      committed_effects: [committed],
      blocked_effects: [],
      debug: { reason_code: "weekly_correction_already_logged" },
    });
  }
  return blockedResult({
    intent: "ignore",
    status: "failed",
    reason_code: execution.reason_code,
    requested_effects: [requested],
    allowed_effects: [requested],
  });
}
