import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import {
  buildDefenseCardPayload,
  buildOperationDraftRequest,
  type DefenseCardGeneratorInput,
} from "../_shared/operation_payload_builder.ts";
import {
  type DefenseCardDraftV1,
  runDefenseCardGenerator,
} from "./generator.ts";

export type PrepareDefenseCardOperationOutput = {
  operation_type: "prepare_defense_card";
  status:
    | "ask_question"
    | "pending_confirmation"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";
  source: "direct_user_request" | "recommendation_tool";
  phase: "attachment_resolution" | "generation" | "confirmation" | "exit";
  draft?: DefenseCardDraftV1;
  confirmation?: { required: boolean; message: string; actions: ["yes", "no"] };
  pending_confirmation?: Record<string, unknown>;
  next_question?: {
    needed: boolean;
    slot: "attachment" | "risk_situation" | "tool_fit";
    status: "missing" | "ambiguous" | "candidate_needs_confirmation";
    reason: string;
    candidates?: DefenseCardAttachmentCandidate[];
    candidate?: DefenseCardAttachmentCandidate;
    known_slots?: {
      attachment?: DefenseCardGeneratorInput["attachment"];
      risk_situation?: DefenseCardGeneratorInput["risk_situation"];
      defense_response_hint?:
        DefenseCardGeneratorInput["defense_response_hint"];
      tool_fit_warning?: string;
    };
  };
  ack?: string;
  state_patch: {
    summary: string;
    phase: string;
    missing_slots: string[];
    turn_count_increment: 1;
  };
};

type DefenseCardAttachmentCandidate = {
  kind: "plan_item";
  plan_item_id: string;
  title: string;
  confidence: number;
  matched_tokens: string[];
  reason: string;
};

type ResolvedDefenseAttachment =
  | (DefenseCardGeneratorInput["attachment"] & { status: "identified" })
  | {
    status: "candidate_needs_confirmation";
    kind: "unknown";
    candidate: DefenseCardAttachmentCandidate;
  }
  | {
    status: "ambiguous";
    kind: "unknown";
    candidates: DefenseCardAttachmentCandidate[];
  }
  | { status: "missing"; kind: "unknown" };

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const ATTACHMENT_STOPWORDS = new Set([
  "une",
  "des",
  "mes",
  "mon",
  "ma",
  "mes",
  "ton",
  "ta",
  "tes",
  "pour",
  "avec",
  "dans",
  "sur",
  "faire",
  "fais",
  "moi",
  "carte",
  "defense",
  "défense",
  "cree",
  "creer",
  "proteger",
  "protéger",
  "quand",
  "moment",
]);

function attachmentTokens(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !ATTACHMENT_STOPWORDS.has(token));
}

function planItems(
  planSnapshot: unknown,
): Array<{ id: string; title: string }> {
  const items = Array.isArray((planSnapshot as any)?.items)
    ? (planSnapshot as any).items
    : [];
  return items.map((item: any) => ({
    id: String(item?.id ?? ""),
    title: String(item?.title ?? ""),
  })).filter((item: { id: string; title: string }) => item.id && item.title);
}

function attachmentCandidate(args: {
  item: { id: string; title: string };
  score: number;
  matchedTokens: string[];
  reason: string;
}): DefenseCardAttachmentCandidate {
  return {
    kind: "plan_item",
    plan_item_id: args.item.id,
    title: args.item.title,
    confidence: Math.max(0, Math.min(1, Number(args.score.toFixed(2)))),
    matched_tokens: args.matchedTokens,
    reason: args.reason,
  };
}

function isNegatedPlanItemMention(message: string, itemTitle: string): boolean {
  const itemTokens = attachmentTokens(itemTitle);
  if (itemTokens.length === 0) return false;
  const text = normalize(message);
  const negatedSegments = text.matchAll(
    /\b(?:non pas|plutot pas|pas ca|pas cette action|pas de|pas d')\b\s*([^.;,!?\n]{0,90})/g,
  );
  for (const match of negatedSegments) {
    const segmentTokens = attachmentTokens(match[1] ?? "");
    if (segmentTokens.length === 0) continue;
    const overlap = itemTokens.filter((token) => segmentTokens.includes(token))
      .length;
    if (overlap >= Math.min(2, itemTokens.length)) return true;
  }
  return false;
}

function inferAttachment(
  message: string,
  planSnapshot: unknown,
): ResolvedDefenseAttachment {
  const text = normalize(message);
  const matches = planItems(planSnapshot).filter((item) =>
    text.includes(normalize(item.title)) &&
    !isNegatedPlanItemMention(message, item.title)
  );
  if (matches.length === 1) {
    return {
      status: "identified" as const,
      kind: "plan_item" as const,
      plan_item_id: matches[0].id,
      title: matches[0].title,
    };
  }
  if (matches.length > 1) {
    return {
      status: "ambiguous" as const,
      kind: "unknown" as const,
      candidates: matches.slice(0, 4).map((item) =>
        attachmentCandidate({
          item,
          score: 1,
          matchedTokens: attachmentTokens(item.title),
          reason: "multiple_exact_title_matches",
        })
      ),
    };
  }
  const messageTokens = attachmentTokens(message);
  const fuzzyMatches = planItems(planSnapshot)
    .filter((item) => !isNegatedPlanItemMention(message, item.title))
    .map((item) => {
      const itemTokens = attachmentTokens(item.title);
      const matchedTokens = itemTokens.filter((token) =>
        messageTokens.includes(token)
      );
      const overlap = matchedTokens.length;
      return {
        item,
        overlap,
        matchedTokens,
        score: itemTokens.length > 0 ? overlap / itemTokens.length : 0,
      };
    })
    .filter((match) => match.overlap >= 1 && match.score >= 0.3)
    .sort((a, b) => b.score - a.score || b.overlap - a.overlap);
  const strongMatches = fuzzyMatches.filter((match) =>
    match.overlap >= 2 && match.score >= 0.6
  );
  if (
    strongMatches.length === 1 || (
      strongMatches.length > 1 &&
      strongMatches[0].score > strongMatches[1].score + 0.25
    )
  ) {
    const item = strongMatches[0].item;
    return {
      status: "identified" as const,
      kind: "plan_item" as const,
      plan_item_id: item.id,
      title: item.title,
    };
  }
  if (strongMatches.length > 1) {
    return {
      status: "ambiguous" as const,
      kind: "unknown" as const,
      candidates: strongMatches.slice(0, 4).map((match) =>
        attachmentCandidate({
          item: match.item,
          score: match.score,
          matchedTokens: match.matchedTokens,
          reason: "close_fuzzy_plan_item_matches",
        })
      ),
    };
  }
  if (fuzzyMatches.length > 1) {
    const [top, second] = fuzzyMatches;
    if (top.score > second.score + 0.2) {
      return {
        status: "candidate_needs_confirmation" as const,
        kind: "unknown" as const,
        candidate: attachmentCandidate({
          item: top.item,
          score: top.score,
          matchedTokens: top.matchedTokens,
          reason: "partial_fuzzy_plan_item_match",
        }),
      };
    }
    return {
      status: "ambiguous" as const,
      kind: "unknown" as const,
      candidates: fuzzyMatches.slice(0, 4).map((match) =>
        attachmentCandidate({
          item: match.item,
          score: match.score,
          matchedTokens: match.matchedTokens,
          reason: "close_partial_plan_item_matches",
        })
      ),
    };
  }
  if (fuzzyMatches.length === 1) {
    const [match] = fuzzyMatches;
    if (match.overlap >= 1 && match.score >= 0.3) {
      return {
        status: "candidate_needs_confirmation" as const,
        kind: "unknown" as const,
        candidate: attachmentCandidate({
          item: match.item,
          score: match.score,
          matchedTokens: match.matchedTokens,
          reason: "single_partial_plan_item_match",
        }),
      };
    }
  }
  if (/dimanche|soir|quand|envie|craque|fumer|uber|rechute/.test(text)) {
    return {
      status: "identified" as const,
      kind: /dimanche|soir/.test(text)
        ? "recurring_context" as const
        : "free_risk_context" as const,
      title: message.match(/\bquand\s+(.+)$/i)?.[1]?.trim() ??
        "moment a risque",
    };
  }
  return { status: "missing" as const, kind: "unknown" as const };
}

function inferRisk(
  message: string,
): DefenseCardGeneratorInput["risk_situation"] | null {
  const text = normalize(message);
  if (/fumer/.test(text)) return { label: "envie de fumer" };
  if (/scroll|telephone|t[ée]l[ée]phone|ecran|[ée]cran|rallume/.test(text)) {
    return { label: "rallumer l'ecran dans le moment fragile" };
  }
  if (/craque|uber|commander/.test(text)) return { label: "craquage du soir" };
  if (/pleut|sauter/.test(text)) {
    return { label: "sauter l'action quand le contexte se degrade" };
  }
  if (/fatigue|epuise|épuisé|vide/.test(text)) {
    return { label: "fatigue qui fragilise l'action" };
  }
  if (/rechute|tentation/.test(text)) return { label: "tentation recurrente" };
  return null;
}

function hasDefenseRiskSignal(message: string): boolean {
  const text = normalize(message);
  return /\b(risque|risquer|derap|dérap|deraill|déraill|piege|piège|ceder|céder|cede|cède|craque|craquer|rechute|tentation|impulsion|compulsion|automatique|reflexe|réflexe|envie|fumer|commander|uber|scroll|rallume|rallumer|sauter|eviter|éviter|evitement|évitement)\b/
    .test(text);
}

function hasAttackFrictionSignal(message: string): boolean {
  const text = normalize(message);
  return /\b(demarrer|démarrer|lancer|commencer|preparer|préparer|installer|mettre en place|premier geste|premiere etape|première étape|friction|flou|zone|carnet|stylo|chercher|trouve pas|introuvable|pas pret|pas prêt)\b/
    .test(text);
}

function defenseFitWarning(message: string): string | null {
  if (hasAttackFrictionSignal(message) && !hasDefenseRiskSignal(message)) {
    return "La demande ressemble surtout a un probleme de demarrage/preparation. Une carte d'attaque peut etre plus adaptee qu'une carte de defense, sauf si le user veut couvrir un vrai moment de derapage.";
  }
  return null;
}

function inferDefenseResponseHint(
  message: string,
): DefenseCardGeneratorInput["defense_response_hint"] | undefined {
  const text = normalize(message);
  if (
    /\b(quitter|sortir|m'eloigner|m eloigner|s'eloigner|s eloigner|changer de piece|changer de pièce)\b/
      .test(text)
  ) {
    return { strategy_hint: "leave_context", value: message };
  }
  if (
    /\b(bloquer|bloque|hors de portee|hors de portée|loin|face cachee|face cachée|couper l'acces|couper l acces)\b/
      .test(text)
  ) {
    return { strategy_hint: "environment_block", value: message };
  }
  if (
    /\b(remplacer|a la place|à la place|action de remplacement)\b/.test(text)
  ) {
    return { strategy_hint: "replace_action", value: message };
  }
  if (/\b(phrase|me dire|rappel|recadrage)\b/.test(text)) {
    return { strategy_hint: "self_talk", value: message };
  }
  if (
    /\b(attendre|pause|respirer|10 minutes|dix minutes|2 minutes|deux minutes)\b/
      .test(text)
  ) {
    return { strategy_hint: "delay", value: message };
  }
  return undefined;
}

function inferTrigger(
  message: string,
): DefenseCardGeneratorInput["trigger"]["type"] {
  const text = normalize(message);
  if (/fumer|tentation/.test(text)) return "temptation";
  if (/craque|impulsion/.test(text)) return "impulse";
  if (/fatigue/.test(text)) return "fatigue";
  if (/stress/.test(text)) return "stress";
  if (/scroll|telephone|t[ée]l[ée]phone|ecran|[ée]cran|rallume/.test(text)) {
    return "habit_loop";
  }
  if (/evite|sauter/.test(text)) return "avoidance";
  return "habit_loop";
}

function attachmentFromUnknown(
  value: unknown,
): (DefenseCardGeneratorInput["attachment"] & { status: "identified" }) | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const title = String(raw.title ?? "").trim();
  if (!title) return null;
  const kind = String(raw.kind ?? "plan_item");
  return {
    status: "identified" as const,
    kind: kind === "personal_action" ||
        kind === "free_risk_context" ||
        kind === "recurring_context"
      ? kind
      : "plan_item",
    plan_item_id: typeof raw.plan_item_id === "string"
      ? raw.plan_item_id
      : null,
    title,
  };
}

function shouldUseInferredAttachment(
  inferred: ResolvedDefenseAttachment,
  existing:
    | (DefenseCardGeneratorInput["attachment"] & {
      status: "identified";
    })
    | null,
): boolean {
  if (!existing) return true;
  if (
    inferred.status === "ambiguous" ||
    inferred.status === "candidate_needs_confirmation"
  ) {
    return true;
  }
  if (inferred.status !== "identified") return false;
  return inferred.kind === "plan_item";
}

export function runPrepareDefenseCardIntake(input: {
  user_id: string;
  channel: ConversationChannel;
  timezone: string;
  message: string;
  source?: "direct_user_request" | "recommendation_tool";
  trigger_message_id: string;
  safety_pregate_risk_band: RiskBand;
  turn_count?: number;
  plan_snapshot?: unknown;
  operation_input?: Record<string, unknown> | null;
}): PrepareDefenseCardOperationOutput {
  const source = input.source ?? "direct_user_request";
  if (
    input.safety_pregate_risk_band === "medium" ||
    input.safety_pregate_risk_band === "high" ||
    input.safety_pregate_risk_band === "critical"
  ) {
    return {
      operation_type: "prepare_defense_card",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      state_patch: {
        summary: "Safety blocks defense card operation.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
      },
    };
  }
  const opInput = input.operation_input ?? {};
  const rawAttachment = (opInput.attachment as any) ??
    (opInput.target as any) ??
    null;
  const existingAttachment = attachmentFromUnknown(rawAttachment);
  const inferredAttachment = inferAttachment(
    input.message,
    input.plan_snapshot ?? {},
  );
  const attachment: ResolvedDefenseAttachment = shouldUseInferredAttachment(
      inferredAttachment,
      existingAttachment,
    )
    ? inferredAttachment
    : existingAttachment ?? inferredAttachment;
  const inferredRisk = inferRisk(input.message);
  const risk = inferredRisk ?? (opInput.risk_situation as any) ?? null;
  const defenseResponseHint = inferDefenseResponseHint(input.message) ??
    (opInput.defense_response_hint as
      | DefenseCardGeneratorInput["defense_response_hint"]
      | undefined);
  const fitWarning = defenseFitWarning(input.message);
  if (fitWarning && source === "direct_user_request") {
    return {
      operation_type: "prepare_defense_card",
      status: "ask_question",
      source,
      phase: "attachment_resolution",
      next_question: {
        needed: true,
        slot: "tool_fit",
        status: "missing",
        reason: "defense_fit_uncertain",
        known_slots: {
          ...(attachment.status === "identified" ? { attachment } : {}),
          ...(risk ? { risk_situation: risk } : {}),
          ...(defenseResponseHint
            ? { defense_response_hint: defenseResponseHint }
            : {}),
          tool_fit_warning: fitWarning,
        },
      },
      state_patch: {
        summary: "Defense card intake needs attack-vs-defense clarification.",
        phase: "attachment_resolution",
        missing_slots: ["tool_fit"],
        turn_count_increment: 1,
      },
    };
  }
  const missing = [
    attachment.status !== "identified" ? "attachment" : "",
    !risk ? "risk_situation" : "",
  ].filter(Boolean);
  if (missing.length > 0) {
    const nextQuestion = {
      needed: true,
      slot: (attachment.status !== "identified"
        ? "attachment"
        : "risk_situation") as "attachment" | "risk_situation",
      status: attachment.status === "candidate_needs_confirmation"
        ? "candidate_needs_confirmation" as const
        : attachment.status === "ambiguous"
        ? "ambiguous" as const
        : "missing" as const,
      reason: attachment.status === "candidate_needs_confirmation"
        ? "attachment_candidate_needs_confirmation"
        : attachment.status === "ambiguous"
        ? "attachment_ambiguous"
        : attachment.status !== "identified"
        ? "attachment_missing"
        : "risk_situation_missing",
      ...(attachment.status === "candidate_needs_confirmation"
        ? {
          candidate: attachment.candidate,
          candidates: [attachment.candidate],
        }
        : {}),
      ...(attachment.status === "ambiguous"
        ? { candidates: attachment.candidates }
        : {}),
      known_slots: {
        ...(attachment.status === "identified" ? { attachment } : {}),
        ...(risk ? { risk_situation: risk } : {}),
        ...(defenseResponseHint
          ? { defense_response_hint: defenseResponseHint }
          : {}),
      },
    };
    if (source === "recommendation_tool") {
      return {
        operation_type: "prepare_defense_card",
        status: "invalid_recommendation_payload",
        source,
        phase: "exit",
        state_patch: {
          summary: "Recommendation payload missing defense card slots.",
          phase: "exit",
          missing_slots: missing,
          turn_count_increment: 1,
        },
      };
    }
    return {
      operation_type: "prepare_defense_card",
      status: "ask_question",
      source,
      phase: "attachment_resolution",
      next_question: nextQuestion,
      state_patch: {
        summary: "Defense card intake needs structured slot.",
        phase: "attachment_resolution",
        missing_slots: missing,
        turn_count_increment: 1,
      },
    };
  }
  if (attachment.status !== "identified") {
    throw new Error("prepare_defense_card_attachment_unresolved_after_gate");
  }
  const request = buildOperationDraftRequest({
    operation_type: "prepare_defense_card",
    user_id: input.user_id,
    timezone: input.timezone,
    channel: input.channel,
    trigger_message_id: input.trigger_message_id,
    current_user_message: input.message,
    operation_source: source,
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    attachment: DefenseCardGeneratorInput["attachment"];
    risk_situation: DefenseCardGeneratorInput["risk_situation"];
    trigger: DefenseCardGeneratorInput["trigger"];
    defense_goal: DefenseCardGeneratorInput["defense_goal"];
    defense_response_hint?: DefenseCardGeneratorInput["defense_response_hint"];
  };
  request.attachment = attachment;
  request.risk_situation = risk;
  request.trigger = {
    type: inferTrigger(input.message),
    evidence: [input.message],
    confidence: 0.76,
  };
  request.defense_goal = "interrupt_impulse";
  request.defense_response_hint = defenseResponseHint;
  const draft = runDefenseCardGenerator(buildDefenseCardPayload(request));
  return {
    operation_type: "prepare_defense_card",
    status: "pending_confirmation",
    source,
    phase: "confirmation",
    draft,
    confirmation: {
      required: true,
      message: draft.confirmation_message,
      actions: ["yes", "no"],
    },
    pending_confirmation: {
      operation_id: request.operation_id,
      operation_type: "prepare_defense_card",
      source,
      attachment: {
        kind: attachment.kind,
        title: attachment.title,
        plan_item_id: attachment.plan_item_id ?? null,
      },
      risk_situation: risk,
      ...(defenseResponseHint
        ? { defense_response_hint: defenseResponseHint }
        : {}),
      summary: draft.draft.title,
      draft,
      expires_after_turns: 2,
    },
    state_patch: {
      summary: "Defense card draft generated.",
      phase: "confirmation",
      missing_slots: [],
      turn_count_increment: 1,
    },
  };
}
