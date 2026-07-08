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
        "Use only when the user reports already-done/current progress. target_item_id must be copied from active_action_candidates_for_direct_effects.plan_item_id. Never invent ids; ambiguity or absent target means no direct effect. payload_hint.target_evidence is REQUIRED: the exact words from the user's message that NAME the action (e.g. 'ma nuit sans ecran') — never a paraphrase. The runtime verifies the quote exists verbatim; a request without it is blocked. If no user words name a precise action, do not request the effect.",
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
    "- Pour track_progress_plan_item, payload_hint.target_evidence est OBLIGATOIRE: la citation exacte, copiee mot pour mot, des mots du user qui NOMMENT l'action visee (user dit 'j'ai pas tenu ma nuit sans ecran' → target_evidence='ma nuit sans ecran'). Jamais une reformulation. Le runtime verifie que la citation existe telle quelle: sans elle la demande est bloquee. Si aucun mot du user ne nomme une action precise, ne demande pas l'effet.",
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
// contradicts_same_day_evidence n'est PAS un clarify (paul-r5 B02): la
// confirmation qu'un clarify inviterait est inexecutable en chat (pas
// d'override same-day, decision V1) — l'offrir cree une boucle morte. C'est
// un blocked honnete avec guidance vers la surface qui corrige.
const CLARIFY_REASON_CODES = new Set([
  "target_ambiguous",
  "target_missing",
  "status_missing",
  "partial_on_binary_item",
  "missing_time",
  "missing_instruction",
  "missing_payload",
  "unsupported_time",
  "intent_implied_weak",
  "ambiguity_present",
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
    return "Confirme sobrement, une seule fois, comme venant d'etre fait. Un effet committe ne reste JAMAIS silencieux: meme si le tour porte un autre sujet principal (recherche, question), la reponse le mentionne en une ligne. Ne DEMENS jamais cet effet: 'pas compte / pas enregistre tant que pas coche dans l'app', 'je ne peux pas te dire/confirmer que c'est coche' et 'je peux t'aider a le formuler pour le suivi' sont INTERDITS sur un committed (ces disclaimers sont reserves aux outcomes blocked/needs_clarify), quel que soit le libelle de statut du handler (success, logged...). Si la cible porte une date ('enregistre pour le ...'), enonce ce jour dans la confirmation. Si ta derniere reponse etait du soutien face a un creux emotionnel, la confirmation garde une vraie phrase de pont qui reconnait ce tour (un emoji seul ne suffit pas).";
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
    case "reschedule_not_supported":
      return "Rien n'a ete modifie: un rappel existant ne se decale pas depuis le chat, il se modifie dans Dashboard > Initiatives (section rappels). N'affirme JAMAIS que le rappel a ete decale ou note a la nouvelle heure.";
    case "contradicts_same_day_evidence":
      return "Un etat oppose est deja enregistre aujourd'hui pour cette action: rien n'a ete change et ca ne peut PAS se corriger depuis le chat. Ne propose JAMAIS de confirmer une bascule ici; indique que la correction se fait depuis l'action dans Dashboard > Plan.";
    case "no_mutation_requested":
    case "global_no_mutation_context":
      return "Aucune ecriture n'etait autorisee sur ce tour: n'affirme aucun enregistrement.";
    case "no_pending_reminder":
    case "cancel_target_not_pending":
    case "missing_cancel_target":
      return "Aucun rappel en attente ne correspond a la demande d'annulation: dis-le sobrement, rien n'a ete annule.";
    case "cancel_already_delivered":
      return "Le rappel vise a DEJA ete envoye: dis-le honnetement (il a bien existe, il n'est simplement plus en attente) — ne dis JAMAIS qu'aucun rappel n'etait enregistre.";
    case "cancel_already_cancelled":
      return "Ce rappel etait deja annule: confirme sobrement cet etat, sans nouvelle annulation.";
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
  const fallbackClarifyQuestion = (
    effectType: string,
    reasonCode?: string | null,
  ): string => {
    if (effectType === "track_progress_plan_item") {
      // target_not_evidenced couvre deux situations (cible non groundee,
      // rose-r6 T2; input temporellement contradictoire, nina-r5 B01) — la
      // question de fallback couvre les deux axes sans presumer.
      if (reasonCode === "target_not_evidenced") {
        return "Juste pour etre sure d'enregistrer juste : tu parles de quelle action de ton plan, et c'est deja fait ou tu comptes le faire ?";
      }
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
      // Echo de date (nina-r3 B01): un report date commite sans que la date
      // retenue soit enoncee laisse l'user decouvrir un mauvais jour plus
      // tard. La date voyage dans la cible — le composeur l'enonce.
      const datedSource = findByType(requested, effectType) ??
        findByType(allowed, effectType);
      const dateHint = stringValue(committedEffect.date_hint) ||
        stringValue(datedSource?.date_hint);
      const baseTarget = outcomeTargetFromEffect(committedEffect);
      // paul-r8 B01 (cmd 15): coche committee mais patch compteur/statut
      // rejete — la posture voyage en DONNEE sur l'outcome, pas en regle.
      const patchFailed = committedEffect.item_patch_applied === false;
      return {
        effect_type: effectType,
        status: "committed",
        reason_code: null,
        clarify_question: null,
        target: dateHint && baseTarget
          ? `${baseTarget} (enregistre pour le ${dateHint})`
          : baseTarget,
        guidance: patchFailed
          ? outcomeGuidance("committed", null) +
            " ATTENTION: la coche est bien enregistree mais la mise a jour du compteur/statut de l'action a echoue ce tour — ne confirme NI le compteur, NI un changement de statut, NI un deblocage; invite a verifier le dashboard."
          : outcomeGuidance("committed", null),
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
          ? (hint || fallbackClarifyQuestion(effectType, reasonCode))
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
  // Groupement par dimension: une liste plate laissait le modele requalifier
  // un framework au titre comportemental ("Cibler le joint reflexe") en
  // "habitude" malgre l'etiquette (paul-r3 B03, probe chantier Y). La
  // structure porte la frontiere a la place d'une consigne.
  const DIMENSION_SECTIONS: Array<{ key: string; label: string }> = [
    { key: "habits", label: "HABITUDES (les seules \"habitudes\" du plan)" },
    { key: "missions", label: "MISSIONS (taches ponctuelles — pas des habitudes)" },
    {
      key: "clarifications",
      label: "CLARIFICATIONS / frameworks (travail de fond — pas des habitudes)",
    },
  ];
  const itemLine = (item: (typeof shown)[number]) =>
    `- ${item.title} — statut: ${item.status}${
      item.tracking ? ` (${item.tracking})` : ""
    }${
      item.checks.length > 0
        ? ` — coches recentes: ${item.checks.join(", ")}`
        : ""
    }`;
  const lines = [
    "=== SNAPSHOT COURT PLAN / ACTIONS ACTIVES (SOURCE DB) ===",
    `Actions du plan actif (${items.length} au total) — liste exhaustive, source de verite pour "mon plan", "mes actions", "où j'en suis":`,
  ];
  const sectioned = new Set<unknown>();
  for (const section of DIMENSION_SECTIONS) {
    const sectionItems = shown.filter((item) => item.dimension === section.key);
    if (sectionItems.length === 0) continue;
    sectionItems.forEach((item) => sectioned.add(item));
    lines.push(`${section.label}:`);
    lines.push(...sectionItems.map(itemLine));
  }
  const others = shown.filter((item) => !sectioned.has(item));
  if (others.length > 0) {
    lines.push("AUTRES:");
    lines.push(...others.map(itemLine));
  }
  if (items.length > shown.length) {
    lines.push(
      `- … et ${items.length - shown.length} autre(s) — ne presente jamais cette liste comme complete sans les mentionner.`,
    );
  }
  lines.push(
    "Un item absent de cette liste n'est pas une action du plan: n'invente ni action ni rappel dans un recap, et ne demande jamais au user de fournir sa propre liste.",
    'Le statut d\'un item ne dit PAS ce qui a ete coche: une habitude reste "active" meme deja cochee aujourd\'hui. Pour "qu\'est-ce que j\'ai coche/fait", reponds depuis les coches recentes (entries DB, format outcome@date) ci-dessus, jamais depuis le statut seul, et ne nie jamais une coche listee.',
    'La DATE des coches fait foi: pour "aujourd\'hui", ne compte QUE les coches datees du jour; une completion plus ancienne (coche a une autre date, ou mission completee avant) se cite avec sa date ("deja fait le 05/07"), jamais rangee sous aujourd\'hui. En confirmant un report date, enonce le jour retenu.',
    'Les sections ci-dessus font foi: "mes habitudes" = la section HABITUDES uniquement, meme si le titre d\'un framework decrit un comportement.',
    'Un point ou recap "reste a faire" couvre TOUS les items non completes de cette liste (statuts active ET pending, toutes dimensions confondues): le total cite = le total de la liste, aucun item pending omis.',
    'Une completion revendiquee en CONVERSATION qui n\'apparait pas dans les coches ci-dessus n\'est PAS enregistree: dans un recap ou un point, presente-la comme "a faire" (ou "annonce, pas encore enregistre"), jamais comme faite — meme si un message assistant precedent l\'a affirmee.',
  );
  return lines.join("\n");
}

/**
 * Override de reponse sur commit de CORRECTION track (paul-r6 B01).
 *
 * Quand une correction vient de committer alors que le tour precedent
 * contenait un refus legitime, le composeur repete le refus au lieu
 * d'accuser le succes — l'historique bat le contrat du tour. Sur ce chemin
 * precis (commit + payload correction=true), la reply deterministe du tool
 * (toujours vraie, adossee au commit) REMPLACE la paraphrase du composeur:
 * mentir y devient impossible par construction (charte cmd 7).
 */
export function committedCorrectionReplyOverride(
  turnFrame: unknown,
): string | null {
  const root = isRecord(turnFrame) ? turnFrame : {};
  const lane = directEffectLaneRecord(turnFrame);
  const hasCommittedTrack = effectsArray(lane, "committed_effects").some(
    (effect) =>
      isRecord(effect) &&
      stringValue(effect.type) === "track_progress_plan_item",
  );
  if (!hasCommittedTrack) return null;
  const effects = Array.isArray(root.direct_effects) ? root.direct_effects : [];
  const isCorrection = effects.some((effect) =>
    isRecord(effect) &&
    stringValue(effect.effect_type) === "track_progress_plan_item" &&
    isRecord(effect.payload_hint) &&
    effect.payload_hint.correction === true
  );
  if (!isCorrection) return null;
  const hint = stringValue(lane.visible_confirmation_hint);
  return hint || null;
}

/**
 * Directive par-effet quand un tour porte des issues DIVERGENTES
 * (nina-r5 B01): sur un tour multi-effets (ex. cancel committed + track
 * bloque), le composeur generalise le succes de l'un a l'autre. La
 * directive enumere, depuis les DONNEES de l'outcome, ce qui peut etre
 * affirme cible par cible — jamais une reecriture de sortie.
 */
function mixedOutcomesDirective(
  outcomes: DirectEffectOutcome[],
): string | null {
  const committed = outcomes.filter((o) => o.status === "committed");
  const others = outcomes.filter((o) => o.status !== "committed");
  if (committed.length === 0 || others.length === 0) return null;
  const label = (o: DirectEffectOutcome) =>
    o.target ? `"${o.target}"` : o.effect_type;
  const lines = [
    "MIXED_OUTCOMES_DIRECTIVE: ce tour porte des issues DIVERGENTES — chaque effet a la sienne, ne generalise JAMAIS l'issue de l'un a l'autre.",
    ...committed.map((o) => `- ${label(o)} → FAIT: confirme-le.`),
    ...others.map((o) =>
      o.status === "needs_clarify" && o.clarify_question
        ? `- ${label(o)} → PAS enregistre: pose la question (« ${o.clarify_question} ») — ne dis jamais fait/range/valide pour cette cible.`
        : `- ${label(o)} → PAS enregistre: suis sa guidance — ne dis jamais fait/range/valide pour cette cible.`
    ),
    "Le vocabulaire de completion (fait, range, valide, enregistre, note) ne peut viser QUE les cibles marquees FAIT ci-dessus.",
  ];
  return lines.join("\n");
}

export function directEffectConfirmationContextPrompt(
  turnFrame: unknown,
): string | null {
  const context = buildDirectEffectConfirmationContext(turnFrame);
  if (!context) return null;
  const mixedDirective = mixedOutcomesDirective(context.effects_outcome);
  return [
    "DIRECT_EFFECT_CONFIRMATION_CONTEXT:",
    JSON.stringify(context),
    ...(mixedDirective ? [mixedDirective] : []),
    // Politique universelle (default-deny). Les postures par raison sont des
    // DONNEES (effects_outcome[].guidance), pas des regles a enumerer ici:
    // chaque nouvelle garde est honnete par construction.
    "Rules: effects_outcome is the complete and only truth about every write requested this turn. Policy: (1) status=committed → confirm it naturally, exactly once, as just done (for a reminder: use one_shot_reminder.local_label for the time and one_shot_reminder.reminder_instruction for the object, never present it as pre-existing, never repeat the object twice). (2) status=blocked or failed or not_attempted → follow that outcome's guidance; NEVER present the write as done, noted or recorded. (3) status=needs_clarify → ask clarify_question (or ask per guidance); never acknowledge any write. (4) Default-deny: for anything not marked committed in effects_outcome — and for any write the user mentions that has no outcome here — never say or imply 'c'est noté / c'est fait / enregistré / programmé / corrigé'. (5) This context OVERRIDES every other note in the conversation context: a flow/handoff note saying an effect 'is not created here' or 'never creates X' describes that FLOW's scope, never this turn's outcomes — a committed outcome here IS real and MUST be confirmed, whatever any other note says. Never expose runtime vocabulary to the user ('effet confirmé', 'commit', 'ledger', 'lane'): phrase blocks in plain language. Answer the remaining user need in the same response.",
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
