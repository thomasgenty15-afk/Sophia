import type {
  DirectEffectTimeContext,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import {
  oneShotReminderCanonicalLocalDispatcherPromptLines,
} from "./one_shot_reminder_prompt_contract.ts";

/**
 * Contrat d'outcome TOTAL (chantier O1, 2026-07-03).
 *
 * Invariant: tout effet direct demande au tour recoit exactement un statut
 * final dans un vocabulaire ferme. Le composeur ne peut plus rencontrer de
 * blocage muet: une garde qui bloque produit mecaniquement un outcome
 * visible, y compris quand la lane n'a pas tourne (safety) — c'est le
 * defaut d'enumeration champ-par-champ qui produisait les claims inventes
 * ("c'est note" sous blocage safety, rose-global15-r5 T11/T12).
 */
export type DirectEffectOutcomeStatus =
  | "committed"
  | "blocked"
  | "needs_clarify"
  | "failed"
  | "not_attempted";

export type DirectEffectOutcome = {
  effect_type: string;
  status: DirectEffectOutcomeStatus;
  reason_code: string | null;
  /** Question a poser au user quand status=needs_clarify (reponse de la lane). */
  clarify_question: string | null;
  /** Cible user-facing quand connue (titre d'action, objet du rappel...). */
  target: string | null;
  /** Posture de rendu par raison — une DONNEE du contexte, pas une regle de prompt. */
  guidance: string;
};

export type DirectEffectConfirmationContext = {
  /**
   * La verite complete du tour: un outcome par type d'effet demande.
   * Politique composer: committed → confirmer une fois; blocked → suivre
   * guidance; needs_clarify → poser clarify_question; sinon aucun claim.
   */
  effects_outcome: DirectEffectOutcome[];
  has_committed_one_shot_reminder: boolean;
  has_requested_one_shot_reminder: boolean;
  one_shot_reminder: {
    committed: boolean;
    local_label: string | null;
    reminder_instruction: string | null;
  } | null;
  /** Raison structurelle si la creation a ete bloquee ce tour (past_time, duplicate_pending...). */
  blocked_one_shot_reminder: {
    reason_code: string;
  } | null;
  /** Commit track_progress du tour: sans ce canal, le composeur nie un effet reel. */
  track_progress: {
    committed: boolean;
    target_title: string | null;
    progress_status: string | null;
  } | null;
  /**
   * Track bloque ce tour avec raison structurelle (already_tracked_today...):
   * le composeur confirme l'etat existant au lieu de re-committer ou de nier.
   */
  blocked_track_progress: {
    reason_code: string;
    target_title: string | null;
    progress_status: string | null;
  } | null;
  /** @deprecated Visible agents must use one_shot_reminder instead. */
  confirmation_text: string | null;
  /** @deprecated Kept empty for compatibility; do not expose raw effect rows. */
  committed_effects: unknown[];
  /** @deprecated Kept empty for compatibility; do not expose raw effect rows. */
  requested_effects: unknown[];
  /** @deprecated Kept empty for compatibility; do not expose raw effect rows. */
  blocked_effects: unknown[];
  do_not_recreate: true;
  do_not_reroute: true;
  do_not_redemand: true;
  do_not_confirm_without_commit: true;
  remaining_user_need_must_continue: true;
};

export type ActiveActionCandidateForDirectEffects = {
  plan_item_id: string;
  title: string;
  status: string;
  plan_id: string | null;
  tracking_type: string | null;
  dimension: string | null;
  aliases: string[];
  occurrence_id: string | null;
};

export function directEffectTimeContextFromUnknown(
  raw: unknown,
): DirectEffectTimeContext | null {
  const outer = isRecord(raw) ? raw : {};
  const root = isRecord(outer.direct_effect_time_context)
    ? outer.direct_effect_time_context
    : outer;
  const nowUtc = stringValue(root.now_utc);
  const timezone = stringValue(root.user_timezone);
  const locale = stringValue(root.user_locale);
  const localDateTime = stringValue(root.user_local_datetime);
  const localHuman = stringValue(root.user_local_human);
  if (!nowUtc || !timezone) return null;
  return {
    now_utc: nowUtc,
    user_timezone: timezone,
    user_locale: locale || "fr-FR",
    user_local_datetime: localDateTime,
    user_local_human: localHuman,
  };
}

export function directEffectTimeContextFromTurnFrame(
  turnFrame: unknown,
): DirectEffectTimeContext | null {
  const root = isRecord(turnFrame) ? turnFrame : {};
  return directEffectTimeContextFromUnknown(root.direct_effect_time_context);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function stringArray(value: unknown, max = 6): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, max)
    : [];
}

function rawPlanItems(planSnapshot: unknown): unknown[] {
  if (Array.isArray(planSnapshot)) return planSnapshot;
  if (isRecord(planSnapshot) && Array.isArray(planSnapshot.items)) {
    return planSnapshot.items;
  }
  return [];
}

export function activeActionCandidatesForDirectEffects(
  planSnapshot: unknown,
  maxItems = 10,
): ActiveActionCandidateForDirectEffects[] {
  return rawPlanItems(planSnapshot)
    .map((raw): ActiveActionCandidateForDirectEffects | null => {
      if (!isRecord(raw)) return null;
      const planItemId = stringValue(
        raw.plan_item_id ?? raw.id ?? raw.item_id ?? raw.target_item_id,
      );
      const title = stringValue(raw.title ?? raw.label ?? raw.name);
      if (!planItemId || !title) return null;
      return {
        plan_item_id: planItemId,
        title,
        status: stringValue(raw.status) || "active",
        plan_id: stringValue(raw.plan_id) || null,
        tracking_type: stringValue(raw.tracking_type ?? raw.item_type) || null,
        dimension: stringValue(raw.dimension) || null,
        aliases: stringArray(raw.aliases ?? raw.user_facing_aliases),
        occurrence_id: stringValue(raw.occurrence_id) || null,
      };
    })
    .filter((item): item is ActiveActionCandidateForDirectEffects =>
      Boolean(item)
    )
    .filter((item) => item.status !== "archived" && item.status !== "deleted")
    .slice(0, maxItems);
}

export function dailyTargetsToActiveActionCandidates(
  targets: unknown,
  maxItems = 10,
): ActiveActionCandidateForDirectEffects[] {
  if (!Array.isArray(targets)) return [];
  return targets
    .map((raw): ActiveActionCandidateForDirectEffects | null => {
      if (!isRecord(raw)) return null;
      const planItemId = stringValue(
        raw.plan_item_id ?? raw.planItemId ?? raw.item_id,
      );
      const title = stringValue(raw.title ?? raw.label ?? raw.action_title);
      if (!planItemId || !title) return null;
      return {
        plan_item_id: planItemId,
        title,
        status: "active",
        plan_id: stringValue(raw.plan_id) || null,
        tracking_type: stringValue(raw.tracking_type ?? raw.item_type) || null,
        dimension: stringValue(raw.dimension) || null,
        aliases: stringArray(raw.aliases),
        occurrence_id: stringValue(raw.occurrence_id ?? raw.id) || null,
      };
    })
    .filter((item): item is ActiveActionCandidateForDirectEffects =>
      Boolean(item)
    )
    .slice(0, maxItems);
}

export function withDirectEffectLocalContext<T extends Record<string, unknown>>(
  context: T | null | undefined,
  planSnapshot?: unknown,
  extraCandidates?: ActiveActionCandidateForDirectEffects[],
  directEffectTimeContext?: DirectEffectTimeContext | null,
): T & {
  active_action_candidates_for_direct_effects:
    ActiveActionCandidateForDirectEffects[];
  direct_effect_time_context: DirectEffectTimeContext | null;
  direct_effect_tools: string[];
  direct_effect_tool_policy: Record<string, string>;
} {
  const base = context && typeof context === "object" && !Array.isArray(context)
    ? context
    : {} as T;
  const candidates = [
    ...(extraCandidates ?? []),
    ...activeActionCandidatesForDirectEffects(planSnapshot),
  ];
  const deduped = new Map<string, ActiveActionCandidateForDirectEffects>();
  for (const candidate of candidates) {
    if (!candidate.plan_item_id || deduped.has(candidate.plan_item_id)) {
      continue;
    }
    deduped.set(candidate.plan_item_id, candidate);
  }
  return {
    ...base,
    active_action_candidates_for_direct_effects: [...deduped.values()],
    direct_effect_time_context: directEffectTimeContext ?? null,
    direct_effect_tools: [
      "create_one_shot_reminder",
      "track_progress_plan_item",
    ],
    direct_effect_tool_policy: {
      track_progress_plan_item:
        "Use only when the user reports already-done/current progress. target_item_id must be copied from active_action_candidates_for_direct_effects.plan_item_id. Never invent ids; ambiguity or absent target means no direct effect.",
      create_one_shot_reminder:
        "Use for one-time reminder requests only. A duration/time is not enough: it must clearly refer to a wanted reminder/notification/programming request, not conversational pacing like 'talk for two minutes'. Use direct_effect_time_context.now_utc and direct_effect_time_context.user_timezone to compute payload_hint.UTC_time; never ask timezone when user_timezone is present. The owner validates date, time and instruction; do not treat recurring reminders as one-shot.",
    },
  };
}

export function directEffectLocalDispatcherPromptLines(): string[] {
  return [
    "Brique direct effects instantanes disponible pour les dispatchers locaux:",
    ...oneShotReminderCanonicalLocalDispatcherPromptLines(),
    "- Le contexte temporel canonique est dans platform_context.direct_effect_time_context. Ne calcule jamais UTC_time depuis l'horloge implicite du modele.",
    "- track_progress_plan_item: si le user rapporte un progres deja fait ou en cours sur une action active.",
    "- Pour track_progress_plan_item, target_item_id doit venir uniquement de platform_context.active_action_candidates_for_direct_effects[].plan_item_id ou du contexte direct equivalent. Ne jamais inventer un id.",
    "- Si plusieurs actions peuvent correspondre, si l'action est absente des candidates, si le user parle d'une intention future, ou si le statut n'est pas clair, ne cree pas de direct effect durable; demande/route une clarification.",
  ];
}

function directEffectLaneRecord(turnFrame: unknown): Record<string, unknown> {
  const root = isRecord(turnFrame) ? turnFrame : {};
  const lane = root.direct_effect_lane;
  return isRecord(lane) ? lane : {};
}

function effectsArray(
  lane: Record<string, unknown>,
  key:
    | "committed_effects"
    | "requested_effects"
    | "allowed_effects"
    | "blocked_effects",
): unknown[] {
  return Array.isArray(lane[key]) ? lane[key] as unknown[] : [];
}

function visibleConfirmationHint(lane: Record<string, unknown>): string | null {
  const text = stringValue(lane.visible_confirmation_hint);
  return text || null;
}

function hasEffect(effects: unknown[], type: string): boolean {
  return effects.some((effect) =>
    isRecord(effect) && String(effect.type ?? "") === type
  );
}

/**
 * Raisons qui appellent une clarification conversationnelle plutot qu'un
 * constat de blocage. Vocabulaire ferme issu des gardes structurelles
 * (direct_effect_gate, intake track, executor reminder) — pas de semantique.
 */
const CLARIFY_REASON_CODES = new Set([
  "target_ambiguous",
  "target_missing",
  "status_missing",
  "missing_time",
  "missing_instruction",
  "missing_payload",
  "unsupported_time",
  "intent_implied_weak",
  "ambiguity_present",
  "contradicts_same_day_evidence",
  "target_not_evidenced",
  "cancel_target_ambiguous",
]);

const FAILED_REASON_CODES = new Set([
  "write_failed",
  "insert_failed",
  "missing_logged_progress_id",
  "missing_create_commit",
  "track_progress_direct_effect_failed",
]);

/** Posture de rendu par raison — donnee injectee au composeur, jamais une regle codee en dur dans son prompt. */
function outcomeGuidance(
  status: DirectEffectOutcomeStatus,
  reasonCode: string | null,
): string {
  if (status === "committed") {
    return "Confirme sobrement, une seule fois, comme venant d'etre fait.";
  }
  if (status === "needs_clarify") {
    return "Pose la question de clarification au user. N'accuse aucune ecriture: rien n'a ete enregistre.";
  }
  if (status === "failed") {
    return "L'ecriture a echoue techniquement: dis-le simplement, rien n'est enregistre; propose de reessayer ou la plateforme.";
  }
  switch (reasonCode) {
    case "safety_active":
    case "safety_high":
      return "Ecriture differee: un moment sensible est en cours. Reste present d'abord, sans aucun claim d'enregistrement; propose de le noter ensemble un peu plus tard.";
    case "already_tracked_today":
      return "Ce progres est deja enregistre aujourd'hui pour cette cible: confirme l'existant, rien n'a ete ecrit deux fois; vraie deuxieme occurrence → dashboard.";
    case "duplicate_pending":
      return "Un rappel identique est deja en attente: rappelle-le au lieu de confirmer une nouvelle creation.";
    case "past_time":
      return "Rien n'a ete cree: l'heure demandee est deja passee aujourd'hui. Propose un autre horaire ou demain.";
    case "recurring_not_supported":
      return "Rien n'a ete cree en ponctuel: un rappel recurrent se configure dans les Initiatives.";
    case "no_mutation_requested":
    case "global_no_mutation_context":
      return "Aucune ecriture n'etait autorisee sur ce tour: n'affirme aucun enregistrement.";
    case "no_pending_reminder":
    case "cancel_target_not_pending":
    case "missing_cancel_target":
      return "Aucun rappel en attente ne correspond a la demande d'annulation: dis-le sobrement, rien n'a ete annule.";
    default:
      return "Rien n'a ete ecrit pour cette demande ce tour. Ne le presente jamais comme fait; dis ce qui bloque si utile et propose la suite.";
  }
}

function outcomeTargetFromEffect(effect: Record<string, unknown>): string | null {
  return stringValue(effect.target_title) ||
    stringValue(effect.reminder_instruction) ||
    stringValue(effect.local_label) || null;
}

/**
 * Derive la liste TOTALE des outcomes: un par type d'effet present dans le
 * turn frame ou dans la lane. Un effet demande sans aucune trace de lane
 * (lane jamais executee, ex. blocage safety en amont) devient not_attempted
 * avec la raison structurelle deductible — jamais un silence.
 */
function deriveEffectsOutcome(args: {
  frameEffectTypes: string[];
  riskBand: string;
  lane: Record<string, unknown>;
}): DirectEffectOutcome[] {
  const committed = effectsArray(args.lane, "committed_effects");
  const blocked = effectsArray(args.lane, "blocked_effects");
  const allowed = effectsArray(args.lane, "allowed_effects");
  const requested = effectsArray(args.lane, "requested_effects");
  const hint = visibleConfirmationHint(args.lane);

  const types = new Set<string>(args.frameEffectTypes);
  for (const list of [committed, blocked, allowed, requested]) {
    for (const effect of list) {
      if (isRecord(effect)) {
        const type = stringValue(effect.type);
        if (type) types.add(type);
      }
    }
  }

  const findByType = (list: unknown[], type: string) =>
    list.find((candidate) =>
      isRecord(candidate) && stringValue(candidate.type) === type
    ) as Record<string, unknown> | undefined;

  // Invariant "pas de silence validant" (rose-r6 B02): un needs_clarify sans
  // question rendrait le contrat O muet — le composeur n'aurait rien a poser
  // et validerait emotionnellement sans effet. Quel que soit le chemin qui
  // produit le needs_clarify, une question existe toujours.
  const fallbackClarifyQuestion = (effectType: string): string => {
    if (effectType === "track_progress_plan_item") {
      return "Tu parles de quelle action de ton plan exactement ?";
    }
    if (
      effectType === "create_one_shot_reminder" ||
      effectType === "cancel_one_shot_reminder"
    ) {
      return "Tu peux preciser quel rappel, et pour quelle heure ?";
    }
    return "Tu peux preciser ce que tu veux exactement ?";
  };

  return [...types].map((effectType): DirectEffectOutcome => {
    const committedEffect = findByType(committed, effectType);
    if (committedEffect) {
      return {
        effect_type: effectType,
        status: "committed",
        reason_code: null,
        clarify_question: null,
        target: outcomeTargetFromEffect(committedEffect),
        guidance: outcomeGuidance("committed", null),
      };
    }
    const blockedEffect = findByType(blocked, effectType);
    if (blockedEffect) {
      const reasonCode = stringValue(blockedEffect.reason_code) || "blocked";
      const status: DirectEffectOutcomeStatus =
        CLARIFY_REASON_CODES.has(reasonCode)
          ? "needs_clarify"
          : FAILED_REASON_CODES.has(reasonCode)
          ? "failed"
          : "blocked";
      const targetEffect = findByType(allowed, effectType) ??
        findByType(requested, effectType);
      return {
        effect_type: effectType,
        status,
        reason_code: reasonCode,
        clarify_question: status === "needs_clarify"
          ? (hint || fallbackClarifyQuestion(effectType))
          : null,
        target: targetEffect ? outcomeTargetFromEffect(targetEffect) : null,
        guidance: outcomeGuidance(status, reasonCode),
      };
    }
    // Effet demande au tour mais lane jamais executee: le cas historiquement
    // muet. Un risk_band bloquant en amont est la seule cause structurelle
    // connue; sinon on constate juste l'absence d'ecriture.
    const safetyBlocked = args.riskBand === "high" ||
      args.riskBand === "critical";
    const requestedEffect = findByType(requested, effectType);
    return {
      effect_type: effectType,
      status: "not_attempted",
      reason_code: safetyBlocked ? "safety_active" : null,
      clarify_question: null,
      target: requestedEffect ? outcomeTargetFromEffect(requestedEffect) : null,
      guidance: outcomeGuidance(
        "not_attempted",
        safetyBlocked ? "safety_active" : null,
      ),
    };
  });
}

function oneShotReminderVisibleFact(
  committed: unknown[],
): DirectEffectConfirmationContext["one_shot_reminder"] {
  const effect = committed.find((candidate) =>
    isRecord(candidate) &&
    String(candidate.type ?? "") === "create_one_shot_reminder"
  );
  if (!isRecord(effect)) return null;
  return {
    committed: true,
    local_label: stringValue(effect.local_label) || null,
    reminder_instruction: stringValue(effect.reminder_instruction) || null,
  };
}

export function buildDirectEffectConfirmationContext(
  turnFrame: unknown,
): DirectEffectConfirmationContext | null {
  const root = isRecord(turnFrame) ? turnFrame : {};
  const directEffects = Array.isArray(root.direct_effects)
    ? root.direct_effects
    : [];
  const frameEffectTypes = directEffects
    .map((effect) => isRecord(effect) ? stringValue(effect.effect_type) : "")
    .filter(Boolean);
  const hasRequestedOneShot = frameEffectTypes.includes(
    "create_one_shot_reminder",
  );
  const lane = directEffectLaneRecord(turnFrame);
  const committed = effectsArray(lane, "committed_effects");
  const requested = effectsArray(lane, "requested_effects");
  const blocked = effectsArray(lane, "blocked_effects");
  const hasCommittedOneShot = hasEffect(
    committed,
    "create_one_shot_reminder",
  );
  // Contrat total: le contexte existe des qu'UNE intention d'effet a existe
  // ce tour (frame ou lane), y compris quand la lane n'a jamais tourne
  // (blocage safety amont) — c'etait le chemin muet qui laissait le
  // composeur inventer un accuse.
  if (
    frameEffectTypes.length === 0 && !hasCommittedOneShot &&
    requested.length === 0 && blocked.length === 0 && committed.length === 0
  ) {
    return null;
  }
  const safety = isRecord(root.safety) ? root.safety : {};
  const effectsOutcome = deriveEffectsOutcome({
    frameEffectTypes,
    riskBand: stringValue(safety.risk_band) || "none",
    lane,
  });
  // La raison du blocage doit atteindre le composeur: sans elle, il sait
  // seulement qu'aucun commit n'existe et produit un refus ambigu ("je ne
  // peux pas le programmer ici") au lieu d'expliquer le blocage reel
  // (heure passee, doublon) et de proposer la suite.
  const blockedOneShot = blocked.find((candidate) =>
    isRecord(candidate) &&
    String(candidate.type ?? "") === "create_one_shot_reminder"
  );
  const committedTrack = committed.find((candidate) =>
    isRecord(candidate) &&
    String(candidate.type ?? "") === "track_progress_plan_item"
  );
  const blockedTrack = blocked.find((candidate) =>
    isRecord(candidate) &&
    String(candidate.type ?? "") === "track_progress_plan_item"
  );
  // Le blocked_effect ne porte que la raison; la cible vient de l'effet
  // admis (allowed) du meme tour, qui porte target_title/progress_status.
  const allowedTrack = effectsArray(lane, "allowed_effects").find((
    candidate,
  ) =>
    isRecord(candidate) &&
    String(candidate.type ?? "") === "track_progress_plan_item"
  );
  return {
    effects_outcome: effectsOutcome,
    has_committed_one_shot_reminder: hasCommittedOneShot,
    has_requested_one_shot_reminder: hasRequestedOneShot,
    one_shot_reminder: hasCommittedOneShot
      ? oneShotReminderVisibleFact(committed)
      : null,
    blocked_one_shot_reminder: isRecord(blockedOneShot)
      ? { reason_code: stringValue(blockedOneShot.reason_code) || "blocked" }
      : null,
    track_progress: isRecord(committedTrack)
      ? {
        committed: true,
        target_title: stringValue(committedTrack.target_title) || null,
        progress_status: stringValue(committedTrack.progress_status) || null,
      }
      : null,
    blocked_track_progress: isRecord(blockedTrack) && !isRecord(committedTrack)
      ? {
        reason_code: stringValue(blockedTrack.reason_code) || "blocked",
        target_title: isRecord(allowedTrack)
          ? stringValue(allowedTrack.target_title) || null
          : null,
        progress_status: isRecord(allowedTrack)
          ? stringValue(allowedTrack.progress_status) || null
          : null,
      }
      : null,
    confirmation_text: null,
    committed_effects: [],
    requested_effects: [],
    blocked_effects: [],
    do_not_recreate: true,
    do_not_reroute: true,
    do_not_redemand: true,
    do_not_confirm_without_commit: true,
    remaining_user_need_must_continue: true,
  };
}

function hasCommittedOneShotReminderContext(context: unknown): boolean {
  if (!isRecord(context)) return false;
  if (context.has_committed_one_shot_reminder === true) return true;
  const oneShot = context.one_shot_reminder;
  return isRecord(oneShot) && oneShot.committed === true;
}

export function selectDirectEffectConfirmationContext(args: {
  turnFrame: unknown;
  reducedContext?: unknown;
  recentContext?: unknown;
}): DirectEffectConfirmationContext | Record<string, unknown> | null {
  const currentContext = isRecord(args.turnFrame)
    ? (args.turnFrame.direct_effect_confirmation_context ?? null)
    : null;
  const current = currentContext ?? buildDirectEffectConfirmationContext(
    args.turnFrame,
  );
  if (current) return current as DirectEffectConfirmationContext;

  if (hasCommittedOneShotReminderContext(args.recentContext)) {
    return args.recentContext as Record<string, unknown>;
  }
  if (hasCommittedOneShotReminderContext(args.reducedContext)) {
    return args.reducedContext as Record<string, unknown>;
  }
  return (args.reducedContext as Record<string, unknown> | null) ??
    (args.recentContext as Record<string, unknown> | null) ??
    null;
}

export function withDirectEffectConfirmationContext<
  T extends Record<string, unknown>,
>(
  turnFrame: T,
): T & {
  direct_effect_confirmation_context?: DirectEffectConfirmationContext;
} {
  const context = buildDirectEffectConfirmationContext(turnFrame);
  if (!context) return turnFrame;
  return {
    ...turnFrame,
    direct_effect_confirmation_context: context,
  };
}

/**
 * Bloc "SNAPSHOT COURT PLAN / ACTIONS ACTIVES" (F3, 2026-07-03).
 *
 * La regle companion designait cette section comme source de verite des
 * recaps de plan... mais elle n'etait construite nulle part (paul-broadflow
 * T3/T15, nina-r1 T12, rose-r5 T3: recaps improvises, items inventes). Le
 * bloc est desormais construit a chaque tour depuis le planItemSnapshot deja
 * charge — liste exhaustive, count reel, aucun cap silencieux.
 */
export function activePlanSnapshotPromptBlock(
  planSnapshot: unknown,
): string | null {
  const items = rawPlanItems(planSnapshot)
    .map((raw) => {
      if (!isRecord(raw)) return null;
      const title = stringValue(raw.title ?? raw.label ?? raw.name);
      if (!title) return null;
      const checks = Array.isArray(raw.recent_checks)
        ? raw.recent_checks
          .map((check) => {
            if (!isRecord(check)) return null;
            const outcome = stringValue(check.outcome);
            const day = stringValue(check.effective_at).slice(0, 10);
            if (!outcome && !day) return null;
            return `${outcome || "?"}@${day || "?"}`;
          })
          .filter((check): check is string => check !== null)
        : [];
      return {
        title,
        status: stringValue(raw.status) || "active",
        dimension: stringValue(raw.dimension) || null,
        tracking: stringValue(raw.tracking_type) || null,
        checks,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  if (items.length === 0) return null;
  const shown = items.slice(0, 16);
  const lines = [
    "=== SNAPSHOT COURT PLAN / ACTIONS ACTIVES (SOURCE DB) ===",
    `Actions du plan actif (${items.length} au total) — liste exhaustive, source de verite pour "mon plan", "mes actions", "où j'en suis":`,
    ...shown.map((item) =>
      `- ${item.title}${item.dimension ? ` [${item.dimension}]` : ""} — statut: ${item.status}${
        item.tracking ? ` (${item.tracking})` : ""
      }${
        item.checks.length > 0
          ? ` — coches recentes: ${item.checks.join(", ")}`
          : ""
      }`
    ),
  ];
  if (items.length > shown.length) {
    lines.push(
      `- … et ${items.length - shown.length} autre(s) — ne presente jamais cette liste comme complete sans les mentionner.`,
    );
  }
  lines.push(
    "Un item absent de cette liste n'est pas une action du plan: n'invente ni action ni rappel dans un recap, et ne demande jamais au user de fournir sa propre liste.",
    'Le statut d\'un item ne dit PAS ce qui a ete coche: une habitude reste "active" meme deja cochee aujourd\'hui. Pour "qu\'est-ce que j\'ai coche/fait", reponds depuis les coches recentes (entries DB, format outcome@date) ci-dessus, jamais depuis le statut seul, et ne nie jamais une coche listee.',
  );
  return lines.join("\n");
}

export function directEffectConfirmationContextPrompt(
  turnFrame: unknown,
): string | null {
  const context = buildDirectEffectConfirmationContext(turnFrame);
  if (!context) return null;
  return [
    "DIRECT_EFFECT_CONFIRMATION_CONTEXT:",
    JSON.stringify(context),
    // Politique universelle (default-deny). Les postures par raison sont des
    // DONNEES (effects_outcome[].guidance), pas des regles a enumerer ici:
    // chaque nouvelle garde est honnete par construction.
    "Rules: effects_outcome is the complete and only truth about every write requested this turn. Policy: (1) status=committed → confirm it naturally, exactly once, as just done (for a reminder: use one_shot_reminder.local_label for the time and one_shot_reminder.reminder_instruction for the object, never present it as pre-existing, never repeat the object twice). (2) status=blocked or failed or not_attempted → follow that outcome's guidance; NEVER present the write as done, noted or recorded. (3) status=needs_clarify → ask clarify_question (or ask per guidance); never acknowledge any write. (4) Default-deny: for anything not marked committed in effects_outcome — and for any write the user mentions that has no outcome here — never say or imply 'c'est noté / c'est fait / enregistré / programmé / corrigé'. Answer the remaining user need in the same response.",
  ].join("\n");
}

export function committedEffectsToConfirmFromToolSkillRun(
  toolSkillRun: unknown,
): Array<{
  effect_type: "track_progress_plan_item" | "create_one_shot_reminder";
  user_confirmation_fact: string;
  structured_fact: Record<string, unknown>;
}> {
  if (!isRecord(toolSkillRun)) return [];
  const effects = Array.isArray(toolSkillRun.committed_effects)
    ? toolSkillRun.committed_effects
    : [];
  return effects.flatMap((raw): Array<{
    effect_type: "track_progress_plan_item" | "create_one_shot_reminder";
    user_confirmation_fact: string;
    structured_fact: Record<string, unknown>;
  }> => {
    if (!isRecord(raw)) return [];
    const type = stringValue(raw.type);
    if (type === "track_progress_plan_item") {
      const title = stringValue(raw.target_title) || "l'action";
      const status = stringValue(raw.progress_status) || "completed";
      return [{
        effect_type: "track_progress_plan_item" as const,
        user_confirmation_fact:
          `Le progres sur "${title}" a ete enregistre avec le statut ${status}.`,
        structured_fact: { ...raw },
      }];
    }
    if (type === "create_one_shot_reminder") {
      const instruction = stringValue(raw.reminder_instruction) ||
        stringValue(raw.instruction) || "ce rappel";
      const localLabel = stringValue(raw.local_label);
      return [{
        effect_type: "create_one_shot_reminder" as const,
        user_confirmation_fact: localLabel
          ? `Le rappel ponctuel "${instruction}" a ete cree pour ${localLabel}.`
          : `Le rappel ponctuel "${instruction}" a ete cree.`,
        structured_fact: {
          one_shot_reminder: {
            committed: true,
            local_label: localLabel || null,
            reminder_instruction: instruction || null,
          },
        },
      }];
    }
    return [];
  });
}
