import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import {
  buildAttackCardPayload,
  buildOperationDraftRequest,
} from "../_shared/operation_payload_builder.ts";
import {
  ATTACK_TECHNIQUES,
  type AttackCardDraftV1,
  type AttackTechniqueKey,
  runAttackCardGenerator,
} from "./generator.ts";

export type PrepareAttackCardOperationOutput = {
  operation_type: "prepare_attack_card";
  status:
    | "ask_question"
    | "pending_confirmation"
    | "cancelled"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";
  source: "direct_user_request" | "recommendation_tool";
  phase:
    | "target_resolution"
    | "technique_selection"
    | "generation"
    | "confirmation"
    | "exit";
  draft?: AttackCardDraftV1;
  confirmation?: {
    required: boolean;
    message: string;
    actions: ["yes", "no"];
  };
  next_question?: {
    needed: boolean;
    slot: "target" | "technique" | "activation_keyword";
    status: "missing" | "ambiguous" | "candidate_needs_confirmation";
    reason: string;
    question?: string;
    candidates?: AttackCardTargetCandidate[];
    candidate?: AttackCardTargetCandidate;
    technique_options?: AttackTechniqueOption[];
    activation_keyword_options?: string[];
    known_slots?: {
      target?: {
        kind: "plan_item" | "personal_action";
        plan_item_id?: string | null;
        title: string;
      };
      technique?: AttackTechniqueKey;
      technique_options?: AttackTechniqueOption[];
      technique_signal_text?: string;
      technique_fit_warning?: string;
      activation_keyword?: string;
      activation_keyword_options?: string[];
      occupied_activation_keywords?: AttackActivationKeyword[];
      rejected_activation_keyword?: string;
    };
  };
  pending_confirmation?: Record<string, unknown>;
  ack?: string;
  readiness: {
    ready_to_generate: boolean;
    fallback_to_dashboard: boolean;
    invalid_recommendation_payload: boolean;
    missing_required_slots: string[];
    reason: string;
  };
  state_patch: {
    summary: string;
    phase: string;
    missing_slots: string[];
    turn_count_increment: 1;
    operation_input?: Record<string, unknown> | null;
    intake_state?: unknown;
    tool_skill_state?: unknown;
  };
};

type AttackCardTargetCandidate = {
  kind: "plan_item";
  plan_item_id: string;
  title: string;
  confidence: number;
  matched_tokens: string[];
  reason: string;
};

type AttackPlanItem = {
  id: string;
  title: string;
  description: string;
  dimension: string;
  item_type: string;
  status: string;
  streak_current: number;
  last_entry_at: string;
};

export type AttackTechniqueOption = {
  technique_key: AttackTechniqueKey;
  title: string;
  description: string;
  reason: string;
  example: string;
  recommended?: boolean;
};

export type AttackActivationKeyword = {
  activation_keyword: string;
  activation_keyword_normalized: string;
};

type ResolvedAttackCardTarget =
  | {
    status: "identified";
    kind: "plan_item" | "personal_action";
    plan_item_id: string | null;
    title: string;
  }
  | {
    status: "candidate_needs_confirmation";
    kind: "unknown";
    candidate: AttackCardTargetCandidate;
  }
  | {
    status: "ambiguous";
    kind: "unknown";
    candidates: AttackCardTargetCandidate[];
  }
  | {
    status: "missing";
    kind: "unknown";
    candidates?: AttackCardTargetCandidate[];
  };

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const TARGET_STOPWORDS = new Set([
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
  "attaque",
  "cree",
  "creer",
  "lancer",
  "demarrer",
  "soir",
]);

function targetTokens(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !TARGET_STOPWORDS.has(token));
}

function planItems(
  planSnapshot: unknown,
): AttackPlanItem[] {
  const items = Array.isArray((planSnapshot as any)?.items)
    ? (planSnapshot as any).items
    : [];
  return items.map((item: any) => ({
    id: String(item?.id ?? ""),
    title: String(item?.title ?? ""),
    description: String(item?.description ?? ""),
    dimension: String(item?.dimension ?? ""),
    item_type: String(item?.item_type ?? item?.kind ?? ""),
    status: String(item?.status ?? ""),
    streak_current: Number(item?.streak_current ?? 0),
    last_entry_at: String(item?.last_entry_at ?? ""),
  })).filter((item: AttackPlanItem) => item.id && item.title);
}

function targetCandidate(args: {
  item: Pick<AttackPlanItem, "id" | "title">;
  score: number;
  matchedTokens: string[];
  reason: string;
}): AttackCardTargetCandidate {
  return {
    kind: "plan_item",
    plan_item_id: args.item.id,
    title: args.item.title,
    confidence: Math.max(0, Math.min(1, Number(args.score.toFixed(2)))),
    matched_tokens: args.matchedTokens,
    reason: args.reason,
  };
}

function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

function itemRankingTokens(item: AttackPlanItem): string[] {
  return uniqueTokens(targetTokens(
    [
      item.title,
      item.description,
      item.dimension,
      item.item_type,
      item.status,
    ].filter(Boolean).join(" "),
  ));
}

function hasAnyToken(tokens: string[], candidates: string[]): boolean {
  return candidates.some((candidate) => tokens.includes(candidate));
}

function hasSleepIntent(tokens: string[]): boolean {
  return hasAnyToken(tokens, [
    "sommeil",
    "dormir",
    "endormir",
    "endormissement",
    "nuit",
    "coucher",
    "fatigue",
  ]);
}

function hasActionIntent(tokens: string[]): boolean {
  return hasAnyToken(tokens, [
    "action",
    "demarrer",
    "lancer",
    "commencer",
    "soir",
    "truc",
    "sas",
  ]);
}

function targetSuggestionScore(args: {
  item: AttackPlanItem;
  messageTokens: string[];
}): { score: number; matchedTokens: string[]; reason: string } {
  const titleTokens = uniqueTokens(targetTokens(args.item.title));
  const descriptionTokens = uniqueTokens(targetTokens(args.item.description));
  const evidenceTokens = itemRankingTokens(args.item);
  const matchedTitleTokens = titleTokens.filter((token) =>
    args.messageTokens.includes(token)
  );
  const matchedDescriptionTokens = descriptionTokens.filter((token) =>
    args.messageTokens.includes(token)
  );
  const matchedTokens = uniqueTokens(
    [...matchedTitleTokens, ...matchedDescriptionTokens],
  );
  const normalizedTitle = normalize(args.item.title);
  const normalizedStatus = normalize(args.item.status);
  const normalizedType = normalize(args.item.item_type);
  const sleepIntent = hasSleepIntent(args.messageTokens);
  const actionIntent = hasActionIntent(args.messageTokens);
  let score = 0.18;

  score += matchedTitleTokens.length * 0.22;
  score += matchedDescriptionTokens.length * 0.1;

  if (normalizedStatus === "active") score += 0.14;
  if (normalizedType === "habit") score += 0.12;
  if (args.item.streak_current > 0) score += 0.04;
  if (args.item.last_entry_at) score += 0.03;

  if (sleepIntent && hasAnyToken(evidenceTokens, ["sommeil", "nuit"])) {
    score += 0.16;
  }
  if (sleepIntent && hasAnyToken(evidenceTokens, ["sas", "dechargement"])) {
    score += 0.18;
  }
  if (actionIntent && normalizedTitle.startsWith("faire ")) {
    score += 0.14;
  }
  if (actionIntent && normalizedTitle.startsWith("preparer ")) {
    score -= 0.04;
  }
  if (
    /\b(bilan|ajustement|review|relecture)\b/.test(normalizedTitle) &&
    !hasAnyToken(args.messageTokens, ["bilan", "ajustement", "review"])
  ) {
    score -= 0.18;
  }
  if (
    ["pending", "planned", "draft", "later", "backlog"].includes(
      normalizedStatus,
    )
  ) {
    score -= 0.1;
  }

  return {
    score,
    matchedTokens,
    reason: matchedTokens.length > 0
      ? "ranked_plan_item_suggestion_by_message_and_plan_context"
      : "ranked_plan_item_suggestion_by_plan_context",
  };
}

function rankedTargetSuggestions(
  message: string,
  planSnapshot: unknown,
): AttackCardTargetCandidate[] {
  const messageTokens = targetTokens(message);
  return planItems(planSnapshot)
    .filter((item) => !isNegatedPlanItemMention(message, item.title))
    .map((item) => {
      const ranking = targetSuggestionScore({ item, messageTokens });
      return targetCandidate({
        item,
        score: ranking.score,
        matchedTokens: ranking.matchedTokens,
        reason: ranking.reason,
      });
    })
    .sort((a, b) =>
      b.confidence - a.confidence ||
      Number(normalize(b.title).startsWith("faire ")) -
        Number(normalize(a.title).startsWith("faire ")) ||
      a.title.localeCompare(b.title)
    )
    .slice(0, 3);
}

function isNegatedPlanItemMention(message: string, itemTitle: string): boolean {
  const itemTokens = targetTokens(itemTitle);
  if (itemTokens.length === 0) return false;
  const text = normalize(message);
  const negatedSegments = text.matchAll(
    /\b(?:non pas|plutot pas|pas ca|pas cette action|pas le|pas la|pas les|pas l'|pas de|pas d'|pas)\b\s*([^.;,!?\n]{0,90})/g,
  );
  for (const match of negatedSegments) {
    const segmentTokens = targetTokens(match[1] ?? "");
    if (segmentTokens.length === 0) continue;
    const overlap = itemTokens.filter((token) => segmentTokens.includes(token))
      .length;
    if (overlap >= Math.min(2, itemTokens.length)) return true;
    const distinctiveOverlap = itemTokens.filter((token) =>
      token.length >= 4 && token !== "dechargement" &&
      segmentTokens.includes(token)
    );
    if (distinctiveOverlap.length > 0) return true;
  }
  return false;
}

function hasTargetNegation(message: string): boolean {
  return /\b(non pas|plutot pas|pas ca|pas cette action|pas le|pas la|pas les|pas l'|pas de|pas d')\b/
    .test(normalize(message));
}

function exactPlanItemMentions(
  message: string,
  planSnapshot: unknown,
): AttackPlanItem[] {
  const text = normalize(message);
  return planItems(planSnapshot).filter((item) =>
    text.includes(normalize(item.title)) &&
    !isNegatedPlanItemMention(message, item.title)
  );
}

function shouldUseOperationTarget(args: {
  target: Record<string, unknown>;
  message: string;
  planSnapshot: unknown;
}): boolean {
  const title = String(args.target.title ?? "").trim();
  if (!title) return false;
  if (isNegatedPlanItemMention(args.message, title)) return false;
  const planItemId = String(args.target.plan_item_id ?? "").trim();
  const exactMentions = exactPlanItemMentions(args.message, args.planSnapshot);
  return exactMentions.length === 0 ||
    exactMentions.some((item) =>
      item.id === planItemId || item.title === title
    );
}

function looksLikeVagueFreeTarget(candidate: string): boolean {
  const text = normalize(candidate);
  return (
    candidate.length < 4 ||
    /\b(me remettre|ma vie|tout|truc|machin|bidule|ce soir|plus tard|ca|ça)\b/
      .test(text) ||
    /\b(nouvelle tache|nouvelle action|autre chose)\b/.test(text) ||
    /\bmais\b/.test(text)
  );
}

function resolveTarget(
  message: string,
  planSnapshot: unknown,
): ResolvedAttackCardTarget {
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
        targetCandidate({
          item,
          score: 1,
          matchedTokens: targetTokens(item.title),
          reason: "multiple_exact_title_matches",
        })
      ),
    };
  }
  const messageTokens = targetTokens(message);
  const fuzzyMatches = planItems(planSnapshot)
    .filter((item) => !isNegatedPlanItemMention(message, item.title))
    .map((item) => {
      const itemTokens = targetTokens(item.title);
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
        targetCandidate({
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
        candidate: targetCandidate({
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
        targetCandidate({
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
    if (
      hasTargetNegation(message) && match.overlap >= 1 && match.score >= 0.45
    ) {
      return {
        status: "identified" as const,
        kind: "plan_item" as const,
        plan_item_id: match.item.id,
        title: match.item.title,
      };
    }
    if (match.overlap >= 1 && match.score >= 0.3) {
      return {
        status: "candidate_needs_confirmation" as const,
        kind: "unknown" as const,
        candidate: targetCandidate({
          item: match.item,
          score: match.score,
          matchedTokens: match.matchedTokens,
          reason: "single_partial_plan_item_match",
        }),
      };
    }
  }
  const free = message.match(/\bpour\s+(.+)$/i)?.[1]?.trim();
  if (free && !looksLikeVagueFreeTarget(free)) {
    return {
      status: "identified" as const,
      kind: "personal_action" as const,
      plan_item_id: null,
      title: free,
    };
  }
  const suggestions = rankedTargetSuggestions(message, planSnapshot);
  return {
    status: "missing" as const,
    kind: "unknown" as const,
    ...(suggestions.length > 0 ? { candidates: suggestions } : {}),
  };
}

function inferBlocker(message: string) {
  const text = normalize(message);
  if (/evite|repousse|procrast/.test(text)) return "avoidance";
  if (/trop lourd|fatigue/.test(text)) return "low_energy";
  if (/sais pas|flou/.test(text)) return "unclear_first_step";
  return "mixed";
}

function detectExplicitTechnique(message: string): AttackTechniqueKey | null {
  const text = normalize(message);
  const entries: Array<[AttackTechniqueKey, RegExp]> = [
    ["texte_recadrage", /\b(texte magique|recadrage|texte de recadrage)\b/],
    ["mantra_force", /\b(mantra|phrase de force|force interieure)\b/],
    ["ancre_visuelle", /\b(ancre visuelle|repere visuel|rappel visuel)\b/],
    [
      "visualisation_matinale",
      /\b(meditation|visualisation|visualiser|5 minutes)\b/,
    ],
    [
      "preparer_terrain",
      /\b(preparer le terrain|prepare le terrain|preparer l'environnement|terrain|friction|telephone loin|carnet pret)\b/,
    ],
    ["pre_engagement", /\b(mot de bascule|mot-cle|mot cle|bascule)\b/],
  ];
  return entries.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function techniqueAliases(technique: AttackTechniqueKey): string[] {
  if (technique === "preparer_terrain") {
    return [
      "preparer le terrain",
      "preparer terrain",
      "prepare le terrain",
      "prepare terrain",
      "terrain",
      "friction",
    ];
  }
  if (technique === "texte_recadrage") {
    return ["texte magique", "recadrage", "negociation", "negocier", "excuse"];
  }
  if (technique === "mantra_force") return ["mantra", "force"];
  if (technique === "ancre_visuelle") {
    return ["ancre visuelle", "visuel", "repere visuel", "rappel visuel"];
  }
  if (technique === "visualisation_matinale") {
    return ["meditation", "visualisation", "visualiser"];
  }
  return ["mot de bascule", "mot cle", "bascule", "signal", "secours"];
}

function isNegatedTechniqueMention(
  message: string,
  technique: AttackTechniqueKey,
): boolean {
  const text = normalize(message);
  const aliases = techniqueAliases(technique).map(normalize);
  const negatedSegments = text.matchAll(
    /\b(?:non pas|plutot pas|pas ca|pas cette technique|pas ce truc|pas un truc de|pas le|pas la|pas les|pas l'|pas de|pas d'|pas)\b\s*([^.;,!?\n]{0,90})/g,
  );
  for (const match of negatedSegments) {
    const segment = normalize(match[1] ?? "");
    if (aliases.some((alias) => alias && segment.includes(alias))) {
      return true;
    }
  }
  return false;
}

function hasExecutionRuptureSignal(text: string): boolean {
  return /\b(craque|craquer|crack|abandon|abandonner|lache|lacher|lâche|lâcher|esquive|esquiver|evite|eviter|évite|éviter|replonge|replonger|perds le controle|perdre le controle|moment fragile|je vais partir|je vais deraper|je vais déraper)\b/
    .test(text);
}

function hasPreEngagementSignal(text: string): boolean {
  return /\b(mot de bascule|mot-cle|mot cle|mot a envoyer|mot à envoyer|envoyer a sophia|envoyer à sophia)\b/
    .test(text) ||
    (
      /\b(signal|secours|declench|declencher|déclench|déclencher|mot|alerte)\b/
        .test(text) && hasExecutionRuptureSignal(text)
    );
}

function hasRegulationObservationContext(text: string): boolean {
  return /\b(hypervigilance|hyper-vigilance|alerte|scanne|scanner|scan|surinterpret|sur-interprete|sur-interprète|panique|angoisse|anxiete|anxiété|controle excessif|contrôle excessif)\b/
    .test(text);
}

function techniqueFitWarning(
  message: string,
  technique: AttackTechniqueKey | null,
): string | null {
  if (!technique) return null;
  const text = normalize(message);
  if (
    technique === "pre_engagement" &&
    hasRegulationObservationContext(text) &&
    !hasExecutionRuptureSignal(text)
  ) {
    return "Mot de bascule sert surtout quand le user sent qu'il va craquer, abandonner ou esquiver l'action. Ici le besoin ressemble plus a reconnaitre/reguler un piege; proposer aussi une ancre, un recadrage, ou une defense.";
  }
  return null;
}

function inferTechniqueChoiceFromSignals(
  message: string,
  options: AttackTechniqueOption[],
): AttackTechniqueKey | null {
  const text = normalize(message);
  const allowed = options.filter((option) =>
    !isNegatedTechniqueMention(message, option.technique_key)
  );
  if (
    /negoc|excuse|repousse|evite|procrast/.test(text) &&
    allowed.some((option) => option.technique_key === "texte_recadrage")
  ) {
    return "texte_recadrage";
  }
  if (
    hasPreEngagementSignal(text) &&
    !techniqueFitWarning(message, "pre_engagement") &&
    allowed.some((option) => option.technique_key === "pre_engagement")
  ) {
    return "pre_engagement";
  }
  if (
    /\b(rappel visuel|repere visuel|repere|visuel|voit|voir|objet|piece)\b/
      .test(text) &&
    allowed.some((option) => option.technique_key === "ancre_visuelle")
  ) {
    return "ancre_visuelle";
  }
  if (
    /\b(carnet pret|telephone loin|environnement|friction|preparer)\b/.test(
      text,
    ) &&
    allowed.some((option) => option.technique_key === "preparer_terrain")
  ) {
    return "preparer_terrain";
  }
  return null;
}

function inferTechniqueChoiceFromMessage(
  message: string,
): AttackTechniqueKey | null {
  const text = normalize(message);
  if (
    (
      /\b(texte magique|recadrage|texte de recadrage)\b/.test(text) ||
      /\b(truc|technique|option)\b.{0,50}\b(coupe|contre|bloque|calme)\b.{0,50}\b(excuse|negoc)/
        .test(
          text,
        ) ||
      /\b(excuse|negoc).{0,50}\b(truc|technique|option)\b/.test(text) ||
      /\bcommence a negocier\b/.test(text) ||
      /\bme raconter des excuses\b/.test(text)
    ) &&
    !isNegatedTechniqueMention(message, "texte_recadrage")
  ) {
    return "texte_recadrage";
  }
  if (
    hasPreEngagementSignal(text) &&
    !isNegatedTechniqueMention(message, "pre_engagement")
  ) {
    return "pre_engagement";
  }
  if (
    /\b(rappel visuel|repere visuel|repere|visuel|voit|voir|objet|piece)\b/
      .test(text) &&
    !isNegatedTechniqueMention(message, "ancre_visuelle")
  ) {
    return "ancre_visuelle";
  }
  if (
    /\b(carnet pret|telephone loin|environnement|friction)\b/.test(
      text,
    ) &&
    !isNegatedTechniqueMention(message, "preparer_terrain")
  ) {
    return "preparer_terrain";
  }
  return null;
}

function exampleForTechnique(
  techniqueKey: AttackTechniqueKey,
  targetTitle: string,
): string {
  if (techniqueKey === "preparer_terrain") {
    return `Exemple pour "${targetTitle}": preparer l'environnement avant le moment critique.`;
  }
  if (techniqueKey === "texte_recadrage") {
    return `Exemple pour "${targetTitle}": un texte court a relire quand tu negocies avec toi-meme.`;
  }
  if (techniqueKey === "ancre_visuelle") {
    return `Exemple pour "${targetTitle}": un repere visible qui te rappelle de demarrer.`;
  }
  if (techniqueKey === "visualisation_matinale") {
    return `Exemple pour "${targetTitle}": te visualiser en train de faire le premier geste.`;
  }
  if (techniqueKey === "mantra_force") {
    return `Exemple pour "${targetTitle}": une phrase courte qui te remet dans l'identite de quelqu'un qui agit.`;
  }
  return `Exemple pour "${targetTitle}": un mot-cle a envoyer quand le moment devient fragile.`;
}

function recommendedTechniqueOptions(
  message: string,
  targetTitle = "cette action",
): AttackTechniqueOption[] {
  const text = normalize(message);
  const options: AttackTechniqueOption[] = [];
  const push = (technique_key: AttackTechniqueKey, reason: string) => {
    if (options.some((option) => option.technique_key === technique_key)) {
      return;
    }
    if (isNegatedTechniqueMention(message, technique_key)) return;
    options.push({
      technique_key,
      title: ATTACK_TECHNIQUES[technique_key].title,
      description: ATTACK_TECHNIQUES[technique_key].pour_quoi,
      reason,
      example: exampleForTechnique(technique_key, targetTitle),
      recommended: options.length === 0,
    });
  };
  if (/telephone|carnet|prepar|environnement|friction|loin|pret/.test(text)) {
    push(
      "preparer_terrain",
      "retire la friction avant le moment d'action",
    );
  }
  if (hasRegulationObservationContext(text)) {
    push(
      "ancre_visuelle",
      "aide a revenir a un repere concret quand l'alerte prend trop de place",
    );
    push(
      "texte_recadrage",
      "aide a couper la surinterpretation et revenir a l'observation",
    );
  }
  if (
    hasPreEngagementSignal(text)
  ) {
    push("pre_engagement", "utile quand il faut un signal de bascule rapide");
  }
  if (/rappel|repere|voir|visuel|objet|piece/.test(text)) {
    push("ancre_visuelle", "transforme l'environnement en rappel concret");
  }
  if (/negoc|excuse|repousse|evite|procrast/.test(text)) {
    push("texte_recadrage", "aide quand le combat interieur demarre");
  }
  if (/matin|visualis|mentalement|projeter/.test(text)) {
    push("visualisation_matinale", "installe le geste avant la resistance");
  }
  if (/force|courage|solide|tenir/.test(text)) {
    push("mantra_force", "renforce le rapport a l'action");
  }
  push("preparer_terrain", "option simple pour faciliter le demarrage");
  push("texte_recadrage", "option utile si la resistance est surtout mentale");
  return options.slice(0, 3);
}

function mergeTechniqueOptions(
  left: AttackTechniqueOption[],
  right: AttackTechniqueOption[],
): AttackTechniqueOption[] {
  const byKey = new Map<AttackTechniqueKey, AttackTechniqueOption>();
  for (const option of [...left, ...right]) {
    if (!byKey.has(option.technique_key)) {
      byKey.set(option.technique_key, { ...option, recommended: false });
    }
  }
  return [...byKey.values()].map((option, index) => ({
    ...option,
    recommended: index === 0,
  })).slice(0, 3);
}

const FALLBACK_PRE_ENGAGEMENT_KEYWORDS = [
  "PÊCHE",
  "KIWI",
  "BIM",
  "GO",
  "PAUSE",
  "BASCULE",
];

function normalizeActivationKeyword(value: string): string {
  return normalize(value).replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ")
    .trim();
}

function activationKeywordsFromUnknown(
  value: unknown,
): AttackActivationKeyword[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: any) => {
    const keyword = cleanActivationKeyword(
      String(entry?.activation_keyword ?? entry?.keyword ?? entry ?? ""),
    );
    const normalized = normalizeActivationKeyword(
      String(entry?.activation_keyword_normalized ?? keyword ?? ""),
    );
    if (!keyword || !normalized) return [];
    return [{
      activation_keyword: keyword,
      activation_keyword_normalized: normalized,
    }];
  });
}

function isActivationKeywordOccupied(
  keyword: string | null,
  occupied: AttackActivationKeyword[],
): boolean {
  if (!keyword) return false;
  const normalized = normalizeActivationKeyword(keyword);
  return occupied.some((entry) =>
    entry.activation_keyword_normalized === normalized
  );
}

function pushKeywordOption(args: {
  options: string[];
  occupied: AttackActivationKeyword[];
  value: string;
}) {
  const keyword = cleanActivationKeyword(args.value);
  if (!keyword) return;
  if (isActivationKeywordOccupied(keyword, args.occupied)) return;
  if (
    args.options.some((existing) =>
      normalizeActivationKeyword(existing) ===
        normalizeActivationKeyword(keyword)
    )
  ) return;
  args.options.push(keyword);
}

function buildActivationKeywordOptions(args: {
  message: string;
  targetTitle: string;
  occupied: AttackActivationKeyword[];
}): string[] {
  const text = normalize(`${args.message} ${args.targetTitle}`);
  const options: string[] = [];
  const push = (value: string) =>
    pushKeywordOption({ options, occupied: args.occupied, value });

  if (/\bsas\b|decharg|décharg|sommeil|soir|rituel/.test(text)) {
    push("SAS");
    push("VIDE");
    push("NUIT");
  }
  if (/craqu|fragile|secours|urgence|signal|rapide/.test(text)) {
    push("PAUSE");
    push("ANCRE");
    push("STOP");
  }
  if (/negoc|excuse|debat|marchand/.test(text)) {
    push("STOP-DEBAT");
    push("COUPE");
    push("GO");
  }
  if (/carnet|ecri|ligne|noter/.test(text)) {
    push("CARNET");
    push("LIGNE");
  }
  for (const fallback of FALLBACK_PRE_ENGAGEMENT_KEYWORDS) {
    push(fallback);
    if (options.length >= 3) break;
  }
  return options.slice(0, 3);
}

function cleanActivationKeyword(value: string): string | null {
  const cleaned = value
    .trim()
    .replace(/^["'“”«»]+|["'“”«».,!?;:]+$/g, "")
    .replace(/\s+/g, " ");
  if (!cleaned) return null;
  if (!/^[\p{L}\s'-]{2,24}$/u.test(cleaned)) return null;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;
  const normalized = normalize(cleaned);
  if (
    [
      "mot de bascule",
      "mot cle",
      "mot-cle",
      "signal de secours",
      "secours",
      "signal",
      "choisis",
      "propose",
      "proposes",
      "comme mot",
      "comme mot cle",
      "comme mot-cle",
      "oui",
      "non",
    ].includes(normalized)
  ) return null;
  if (/\bcomme\s+mot\b/.test(normalized)) return null;
  return cleaned.toUpperCase();
}

function extractActivationKeyword(message: string, acceptBareAnswer: boolean) {
  const text = message.trim();
  const explicitPatterns = [
    /\b(?:mon\s+)?(?:mot|mot-cle|mot cle|signal)\s+(?:sera|est|c'est|c est|ce sera|ce serait|=|:)\s*["'“”«»]?([\p{L}'-]{2,24}(?:\s+[\p{L}'-]{2,24}){0,2})/iu,
    /\b(?:je\s+)?(?:choisis|prends|valide|veux|utilise)\s*["'“”«»]?([\p{L}'-]{2,24})["'“”«»]?\s+comme\s+(?:mot|mot-cle|mot cle|signal)\b/iu,
    /\b(?:je\s+)?(?:choisis|prends|valide|veux|utilise)\s*["'“”«»]?([\p{L}'-]{2,24}(?:\s+[\p{L}'-]{2,24}){0,2})["'“”«»]?(?:\s+comme\s+(?:mot|mot-cle|mot cle|signal)|[.!?]?$)/iu,
    /\b(?:mets|mettons|on met)\s*["'“”«»]?([\p{L}'-]{2,24}(?:\s+[\p{L}'-]{2,24}){0,2})["'“”«»]?(?:\s+comme\s+(?:mot|mot-cle|mot cle|signal)|[.!?]?$)/iu,
    /\b(?:le\s+mot|mot)\s+["'“”«»]?(?!de\b)([\p{L}'-]{2,24})(?:["'“”«»]|[.!?]?$)/iu,
  ];
  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    const keyword = cleanActivationKeyword(String(match?.[1] ?? ""));
    if (keyword) return keyword;
  }
  if (!acceptBareAnswer) return null;
  return cleanActivationKeyword(text);
}

function attackTechniqueOptionsFromUnknown(
  value: unknown,
): AttackTechniqueOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option: any) => {
    const technique = normalizedTechnique(option?.technique_key);
    if (!technique) return [];
    return [{
      technique_key: technique,
      title: String(option?.title ?? ATTACK_TECHNIQUES[technique].title),
      description: String(
        option?.description ?? ATTACK_TECHNIQUES[technique].pour_quoi,
      ),
      reason: String(option?.reason ?? ""),
      example: String(option?.example ?? ATTACK_TECHNIQUES[technique].example),
      recommended: Boolean(option?.recommended),
    }];
  });
}

function resolveTechniqueChoiceFromOptions(
  message: string,
  options: AttackTechniqueOption[],
): AttackTechniqueKey | null {
  if (options.length === 0) return null;
  const signalChoice = inferTechniqueChoiceFromSignals(message, options);
  if (signalChoice && !techniqueFitWarning(message, signalChoice)) {
    return signalChoice;
  }
  const text = normalize(message);
  const ordinalIndex =
    /\b(1|premiere|premier|la premiere|le premier)\b/.test(text)
      ? 0
      : /\b(2|deuxieme|seconde|la deuxieme|la seconde)\b/.test(text)
      ? 1
      : /\b(3|troisieme|la troisieme)\b/.test(text)
      ? 2
      : null;
  if (ordinalIndex !== null && options[ordinalIndex]) {
    const ordinalTechnique = options[ordinalIndex].technique_key;
    return isNegatedTechniqueMention(message, ordinalTechnique)
      ? null
      : ordinalTechnique;
  }
  for (const option of options) {
    if (isNegatedTechniqueMention(message, option.technique_key)) continue;
    if (techniqueFitWarning(message, option.technique_key)) continue;
    const haystack = normalize(
      `${option.title} ${option.reason} ${option.description} ${option.example}`,
    );
    if (
      haystack &&
      text.split(/\s+/).some((token) =>
        token.length > 4 && haystack.includes(token)
      )
    ) {
      return option.technique_key;
    }
  }
  return null;
}

function normalizedTechnique(value: unknown): AttackTechniqueKey | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw in ATTACK_TECHNIQUES) return raw as AttackTechniqueKey;
  return detectExplicitTechnique(raw);
}

export function runPrepareAttackCardIntake(input: {
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
}): PrepareAttackCardOperationOutput {
  const source = input.source ?? "direct_user_request";
  const blocked = {
    ready_to_generate: false,
    fallback_to_dashboard: false,
    invalid_recommendation_payload: false,
    missing_required_slots: [],
    reason: "blocked",
  };
  if (
    input.safety_pregate_risk_band === "medium" ||
    input.safety_pregate_risk_band === "high" ||
    input.safety_pregate_risk_band === "critical"
  ) {
    return {
      operation_type: "prepare_attack_card",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      readiness: blocked,
      state_patch: {
        summary: "Safety blocks attack card operation.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
      },
    };
  }
  const opInput = input.operation_input ?? {};
  const target = opInput.target && typeof opInput.target === "object" &&
      shouldUseOperationTarget({
        target: opInput.target as Record<string, unknown>,
        message: input.message,
        planSnapshot: input.plan_snapshot ?? {},
      })
    ? {
      status: "identified" as const,
      kind: ((opInput.target as any).kind ?? "plan_item") as
        | "plan_item"
        | "personal_action",
      plan_item_id: (opInput.target as any).plan_item_id,
      title: (opInput.target as any).title,
    }
    : resolveTarget(input.message, input.plan_snapshot ?? {});
  const rawExplicitTechnique = detectExplicitTechnique(input.message);
  const explicitTechniqueFitWarning = techniqueFitWarning(
    input.message,
    rawExplicitTechnique,
  );
  const explicitTechnique = rawExplicitTechnique &&
      !explicitTechniqueFitWarning &&
      !isNegatedTechniqueMention(input.message, rawExplicitTechnique)
    ? rawExplicitTechnique
    : null;
  const previousTechniqueOptions = attackTechniqueOptionsFromUnknown(
    opInput.technique_options,
  );
  const previousTechniqueSignalText = String(
    opInput.technique_signal_text ?? "",
  ).trim();
  const combinedTechniqueSignalText = [
    previousTechniqueSignalText,
    input.message,
  ].filter(Boolean).join("\n");
  const rawSignalTechnique = inferTechniqueChoiceFromMessage(input.message);
  const signalTechnique = rawSignalTechnique &&
      !techniqueFitWarning(input.message, rawSignalTechnique)
    ? rawSignalTechnique
    : null;
  const operationTechnique = normalizedTechnique(
    opInput.technique ?? opInput.desired_attack_angle ??
      opInput.desired_attack_technique,
  );
  const technique = (operationTechnique &&
      !isNegatedTechniqueMention(input.message, operationTechnique) &&
      (!explicitTechnique || explicitTechnique === operationTechnique)
    ? operationTechnique
    : null) ??
    explicitTechnique ??
    signalTechnique ??
    resolveTechniqueChoiceFromOptions(input.message, previousTechniqueOptions);
  const previousTechniqueFitWarning = String(
    opInput.technique_fit_warning ?? "",
  ).trim();
  const currentTechniqueFitWarning = explicitTechniqueFitWarning ??
    techniqueFitWarning(input.message, rawSignalTechnique) ??
    (previousTechniqueFitWarning || null);
  const previousActivationKeyword = cleanActivationKeyword(
    String(opInput.activation_keyword ?? opInput.keyword ?? ""),
  );
  const occupiedActivationKeywords = activationKeywordsFromUnknown(
    opInput.occupied_activation_keywords,
  );
  const activationKeyword = technique === "pre_engagement"
    ? extractActivationKeyword(input.message, Boolean(operationTechnique)) ??
      previousActivationKeyword
    : null;
  const activationKeywordOccupied = technique === "pre_engagement" &&
    isActivationKeywordOccupied(activationKeyword, occupiedActivationKeywords);
  const missing = [
    target.status !== "identified" ? "target" : "",
    target.status === "identified" && target.kind === "plan_item" &&
      !target.plan_item_id
      ? "plan_item_id"
      : "",
    target.status === "identified" && !target.title ? "title" : "",
    target.status === "identified" && !technique ? "technique" : "",
    target.status === "identified" && technique === "pre_engagement" &&
      (!activationKeyword || activationKeywordOccupied)
      ? "activation_keyword"
      : "",
  ].filter(Boolean);
  if (missing.length > 0) {
    const targetKnownSlot = target.status === "identified"
      ? {
        kind: target.kind,
        plan_item_id: target.plan_item_id,
        title: target.title,
      }
      : undefined;
    const selectedQuestionSlot = target.status !== "identified"
      ? "target"
      : !technique
      ? "technique"
      : "activation_keyword";
    const techniqueOptions = target.status === "identified"
      ? mergeTechniqueOptions(
        previousTechniqueOptions,
        recommendedTechniqueOptions(combinedTechniqueSignalText, target.title),
      )
      : recommendedTechniqueOptions(input.message, "cette action");
    const knownSlots = {
      ...(targetKnownSlot ? { target: targetKnownSlot } : {}),
      ...(techniqueOptions.length > 0
        ? { technique_options: techniqueOptions }
        : {}),
      ...(technique ? { technique } : {}),
      ...(currentTechniqueFitWarning
        ? { technique_fit_warning: currentTechniqueFitWarning }
        : {}),
      ...(combinedTechniqueSignalText
        ? { technique_signal_text: combinedTechniqueSignalText }
        : {}),
      ...(activationKeyword ? { activation_keyword: activationKeyword } : {}),
      ...(technique === "pre_engagement"
        ? {
          activation_keyword_options: buildActivationKeywordOptions({
            message: combinedTechniqueSignalText || input.message,
            targetTitle: targetKnownSlot?.title ?? "cette action",
            occupied: occupiedActivationKeywords,
          }),
          occupied_activation_keywords: occupiedActivationKeywords,
        }
        : {}),
      ...(activationKeywordOccupied && activationKeyword
        ? { rejected_activation_keyword: activationKeyword }
        : {}),
    };
    const targetQuestion = {
      needed: true,
      slot: selectedQuestionSlot as
        | "target"
        | "technique"
        | "activation_keyword",
      status: target.status === "candidate_needs_confirmation"
        ? "candidate_needs_confirmation" as const
        : target.status === "ambiguous"
        ? "ambiguous" as const
        : "missing" as const,
      reason: target.status === "candidate_needs_confirmation"
        ? "target_candidate_needs_confirmation"
        : target.status === "ambiguous"
        ? "target_ambiguous"
        : target.status === "identified" && technique === "pre_engagement" &&
            activationKeywordOccupied
        ? "pre_engagement_keyword_already_used"
        : target.status === "identified" && technique === "pre_engagement" &&
            !activationKeyword
        ? "pre_engagement_keyword_missing"
        : target.status === "identified"
        ? "attack_technique_missing"
        : "target_missing",
      ...(target.status === "candidate_needs_confirmation"
        ? { candidate: target.candidate, candidates: [target.candidate] }
        : {}),
      ...(target.status === "ambiguous"
        ? { candidates: target.candidates }
        : {}),
      ...(target.status === "missing" && target.candidates?.length
        ? { candidates: target.candidates }
        : {}),
      ...(Object.keys(knownSlots).length > 0
        ? {
          known_slots: knownSlots,
        }
        : {}),
      ...(target.status === "identified"
        ? { technique_options: techniqueOptions }
        : {}),
      ...(target.status === "identified" && technique === "pre_engagement"
        ? {
          activation_keyword_options: knownSlots.activation_keyword_options ??
            [],
        }
        : {}),
    };
    if (
      source === "recommendation_tool" &&
      !(target.status === "identified" && missing.length === 1 &&
        missing[0] === "technique")
    ) {
      return {
        operation_type: "prepare_attack_card",
        status: "invalid_recommendation_payload",
        source,
        phase: "exit",
        readiness: {
          ready_to_generate: false,
          fallback_to_dashboard: false,
          invalid_recommendation_payload: true,
          missing_required_slots: missing,
          reason: targetQuestion.reason,
        },
        state_patch: {
          summary: `Recommendation payload missing attack card slots: ${
            missing.join(", ")
          }.`,
          phase: "exit",
          missing_slots: missing,
          turn_count_increment: 1,
        },
      };
    }
    return {
      operation_type: "prepare_attack_card",
      status: "ask_question",
      source,
      phase: target.status === "identified" && technique
        ? "generation"
        : target.status === "identified"
        ? "technique_selection"
        : "target_resolution",
      next_question: {
        ...targetQuestion,
      },
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: missing,
        reason: targetQuestion.reason,
      },
      state_patch: {
        summary: selectedQuestionSlot === "activation_keyword"
          ? "Attack card intake needs pre-engagement keyword."
          : selectedQuestionSlot === "technique"
          ? "Attack card intake needs technique slot."
          : "Attack card intake needs structured target slot.",
        phase: selectedQuestionSlot === "activation_keyword"
          ? "generation"
          : selectedQuestionSlot === "technique"
          ? "technique_selection"
          : "target_resolution",
        missing_slots: missing,
        turn_count_increment: 1,
      },
    };
  }

  if (target.status !== "identified") {
    throw new Error("prepare_attack_card_target_unresolved_after_missing_gate");
  }
  if (!technique) {
    throw new Error(
      "prepare_attack_card_technique_unresolved_after_missing_gate",
    );
  }
  if (technique === "pre_engagement" && !activationKeyword) {
    throw new Error(
      "prepare_attack_card_activation_keyword_unresolved_after_missing_gate",
    );
  }

  const request = buildOperationDraftRequest({
    operation_type: "prepare_attack_card",
    user_id: input.user_id,
    timezone: input.timezone,
    channel: input.channel,
    trigger_message_id: input.trigger_message_id,
    current_user_message: input.message,
    operation_source: source,
    desired_attack_technique: technique,
    diagnosis: {
      blocker_type: (opInput.blocker as any)?.type ??
        inferBlocker(input.message),
      confidence: 0.76,
      constraints: ["no_pressure", "do_not_increase_difficulty"],
    },
    desired_attack_keyword: activationKeyword,
    target: {
      plan_item_id: target.plan_item_id,
      plan_item_title: target.title,
    },
  });
  const draft = runAttackCardGenerator(buildAttackCardPayload(request));
  return {
    operation_type: "prepare_attack_card",
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
      operation_type: "prepare_attack_card",
      source,
      target: {
        kind: target.kind,
        title: target.title,
        plan_item_id: target.plan_item_id,
      },
      summary: draft.draft.title,
      draft,
      expires_after_turns: 2,
    },
    readiness: {
      ready_to_generate: true,
      fallback_to_dashboard: false,
      invalid_recommendation_payload: false,
      missing_required_slots: [],
      reason: "ready",
    },
    state_patch: {
      summary: "Attack card draft generated.",
      phase: "confirmation",
      missing_slots: [],
      turn_count_increment: 1,
    },
  };
}
