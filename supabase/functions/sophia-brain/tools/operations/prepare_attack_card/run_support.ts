import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  type AttackKeywordTriggerPayload,
  detectAttackKeywordTrigger,
  normalizeAttackKeyword,
} from "../../../../_shared/attack_keyword.ts";
import type { ActiveTransformationRuntime } from "../../../../_shared/v2-runtime.ts";
import type {
  AttackCardContent,
  LabScopeKind,
} from "../../../../_shared/v2-types.ts";
import type { ProductRecommendation } from "../../../recommendation/recommendation_types.ts";
import type { AttackCardDraftV1 } from "./generator.ts";

type AttackCardPlanItemSnapshotItem = {
  id: string;
  title: string;
};

function normalizeRouteText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function normalizeOperationText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function readLastResolvedPlanItem(
  tempMemory: any,
): Record<string, unknown> | null {
  const raw = (tempMemory as any)?.__last_resolved_plan_item;
  if (!raw || typeof raw !== "object") return null;
  if (!String((raw as any).id ?? "").trim()) return null;
  if (!String((raw as any).title ?? "").trim()) return null;
  return raw as Record<string, unknown>;
}

export type AttackKeywordMatch = {
  payload: AttackKeywordTriggerPayload;
  scopeKind: LabScopeKind;
  transformationId: string | null;
  generatedAsset: string;
  modeEmploi: string;
};

type RankedAttackKeywordMatch = AttackKeywordMatch & {
  priority: number;
  lastUpdatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAttackKeywordTriggerPayload(
  value: unknown,
): value is AttackKeywordTriggerPayload {
  return isRecord(value) &&
    typeof value.activation_keyword === "string" &&
    typeof value.activation_keyword_normalized === "string" &&
    typeof value.risk_situation === "string" &&
    typeof value.strength_anchor === "string" &&
    typeof value.first_response_intent === "string" &&
    typeof value.assistant_prompt === "string";
}

export async function loadAttackKeywordMatch(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  runtime: ActiveTransformationRuntime | null;
}): Promise<AttackKeywordMatch | null> {
  const cycleId = args.runtime?.cycle?.id ?? null;
  if (!cycleId) return null;

  const activeTransformationId = args.runtime?.transformation?.id ?? null;
  const { data, error } = await args.supabase
    .from("user_attack_cards")
    .select("scope_kind, transformation_id, last_updated_at, content")
    .eq("user_id", args.userId)
    .eq("cycle_id", cycleId)
    .eq("status", "active")
    .order("last_updated_at", { ascending: false });

  if (error) throw error;

  const rows = (data as
    | Array<{
      scope_kind: LabScopeKind;
      transformation_id: string | null;
      last_updated_at: string;
      content: AttackCardContent;
    }>
    | null) ?? [];

  const candidates = rows.flatMap((row) => {
    const content = row.content;
    if (!content || !Array.isArray(content.techniques)) return [];

    return content.techniques.flatMap((technique) => {
      if (technique.technique_key !== "pre_engagement") return [];
      const generated = technique.generated_result;
      if (
        !generated || !isAttackKeywordTriggerPayload(generated.keyword_trigger)
      ) {
        return [];
      }

      const priority = row.transformation_id === activeTransformationId
        ? 0
        : row.scope_kind === "out_of_plan"
        ? 1
        : 2;

      return [{
        payload: generated.keyword_trigger,
        data: {
          payload: generated.keyword_trigger,
          scopeKind: row.scope_kind,
          transformationId: row.transformation_id,
          generatedAsset: generated.generated_asset,
          modeEmploi: generated.mode_emploi,
          priority,
          lastUpdatedAt: row.last_updated_at,
        } satisfies RankedAttackKeywordMatch,
      }];
    });
  }).sort((left, right) => {
    const leftPriority = left.data.priority;
    const rightPriority = right.data.priority;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return right.data.lastUpdatedAt.localeCompare(left.data.lastUpdatedAt);
  });

  const match = detectAttackKeywordTrigger(args.userMessage, candidates);
  return match?.data
    ? {
      payload: match.data.payload,
      scopeKind: match.data.scopeKind,
      transformationId: match.data.transformationId,
      generatedAsset: match.data.generatedAsset,
      modeEmploi: match.data.modeEmploi,
    }
    : null;
}

export function buildAttackKeywordContextOverride(args: {
  match: AttackKeywordMatch;
}): string {
  const scopeLabel = args.match.scopeKind === "out_of_plan"
    ? "hors transformation"
    : "transformation active";

  return [
    "=== MOT-CLE DE BASCULE DETECTE ===",
    "Le message utilisateur est uniquement un mot-cle de bascule configure dans une carte d'attaque.",
    `- Mot-cle: ${args.match.payload.activation_keyword}`,
    `- Scope: ${scopeLabel}`,
    `- Situation de risque: ${args.match.payload.risk_situation}`,
    `- Ce que l'utilisateur protege: ${args.match.payload.strength_anchor}`,
    `- Intention immediate: ${args.match.payload.first_response_intent}`,
    `- Consigne pour Sophia: ${args.match.payload.assistant_prompt}`,
    `- Rappel de l'objet genere: ${args.match.generatedAsset}`,
    `- Mode d'emploi defini: ${args.match.modeEmploi}`,
    "",
    "CONSIGNES DE REPONSE:",
    "- Considere que l'utilisateur est dans une fenetre de risque immediate ou pre-immediate.",
    "- Ne lui demande pas d'expliquer longuement la situation.",
    "- Reponds de facon breve, concrete, stable.",
    "- Commence par aider a tenir maintenant.",
    "- Donne une seule action immediate ou une seule etape de regulation.",
    "- Ne lui dis pas d'envoyer le mot-cle: il vient deja de l'envoyer.",
    "- Meme si le mot-cle ressemble a 'stop', 'annule' ou 'pause', ne l'interprete pas comme une demande d'arret: c'est le declencheur configure.",
    "- Tu peux finir par une relance tres courte, pas plus.",
    "- Ne mentionne pas les termes techniques comme carte d'attaque, mot-cle configure ou systeme.",
  ].join("\n");
}

export type RecentActiveAttackCard = {
  id: string;
  title: string;
  technique: string | null;
  ageSeconds: number;
};

export async function loadRecentActiveAttackCardForUser(args: {
  supabase: SupabaseClient;
  userId: string;
  maxAgeSeconds?: number;
}): Promise<RecentActiveAttackCard | null> {
  const maxAge = Number.isFinite(args.maxAgeSeconds)
    ? Number(args.maxAgeSeconds)
    : 300;
  if (typeof (args.supabase as any)?.from !== "function") return null;
  try {
    const { data, error } = await args.supabase
      .from("user_attack_cards")
      .select("id,content,generated_at")
      .eq("user_id", args.userId)
      .eq("status", "active")
      .order("generated_at", { ascending: false })
      .limit(1);
    if (error || !data || (data as any[]).length === 0) return null;
    const row = (data as any[])[0];
    const generatedAt = Date.parse(String(row?.generated_at ?? ""));
    if (!Number.isFinite(generatedAt)) return null;
    const ageSeconds = Math.max(
      0,
      Math.round((Date.now() - generatedAt) / 1000),
    );
    if (ageSeconds > maxAge) return null;
    const content = row?.content ?? null;
    const title = String(
      content?.operation_draft?.title ??
        content?.techniques?.[0]?.generated_result?.output_title ??
        content?.title ??
        "carte d'attaque",
    ).trim();
    const technique = content?.operation_draft?.technique ??
      content?.techniques?.[0]?.technique_key ??
      content?.technique ??
      null;
    return {
      id: String(row.id),
      title,
      technique: technique ? String(technique) : null,
      ageSeconds,
    };
  } catch (err) {
    console.warn(
      "[prepare_attack_card] loadRecentActiveAttackCardForUser failed:",
      err,
    );
    return null;
  }
}

export function userExplicitlyAsksForNewAttackCard(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  return /\b(nouvelle carte|autre carte|une autre|deuxieme carte|2eme carte|second(e)? carte|encore une carte|une carte de plus|une carte supplementaire)\b/
    .test(text);
}

export async function loadActiveAttackKeywordOptions(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<
  Array<{ activation_keyword: string; activation_keyword_normalized: string }>
> {
  if (typeof (args.supabase as any)?.from !== "function") return [];
  const { data, error } = await args.supabase
    .from("user_attack_cards")
    .select("content")
    .eq("user_id", args.userId)
    .eq("status", "active")
    .limit(100);
  if (error) {
    console.warn(
      "[prepare_attack_card] active attack keyword load failed",
      error,
    );
    return [];
  }
  const rows = (data as Array<{ content: AttackCardContent }> | null) ?? [];
  const byNormalized = new Map<
    string,
    { activation_keyword: string; activation_keyword_normalized: string }
  >();
  for (const row of rows) {
    const techniques = Array.isArray(row.content?.techniques)
      ? row.content.techniques
      : [];
    for (const technique of techniques) {
      if (technique.technique_key !== "pre_engagement") continue;
      const trigger = technique.generated_result?.keyword_trigger;
      if (!trigger?.activation_keyword) continue;
      const normalized = normalizeAttackKeyword(
        trigger.activation_keyword_normalized || trigger.activation_keyword,
      );
      if (!normalized) continue;
      byNormalized.set(normalized, {
        activation_keyword: trigger.activation_keyword,
        activation_keyword_normalized: normalized,
      });
    }
  }
  return [...byNormalized.values()];
}

export function buildAttackCardRecommendationOperationInput(args: {
  recommendation: ProductRecommendation | null;
  tempMemory: any;
  planItemSnapshot?: AttackCardPlanItemSnapshotItem[] | null;
}): Record<string, unknown> | null {
  const recommendation = args.recommendation;
  if (
    !recommendation ||
    recommendation.decision !== "recommend_operation" ||
    recommendation.operation_type !== "prepare_attack_card"
  ) {
    return null;
  }

  const rawInput = recommendation.operation_input &&
      typeof recommendation.operation_input === "object"
    ? recommendation.operation_input
    : {};
  const rawTarget = (rawInput as any).target;
  if (rawTarget && typeof rawTarget === "object") {
    const title = String((rawTarget as any).title ?? "").trim();
    const planItemId = String((rawTarget as any).plan_item_id ?? "").trim();
    if (title) {
      return {
        ...rawInput,
        target: {
          kind: (rawTarget as any).kind === "personal_action"
            ? "personal_action"
            : "plan_item",
          title,
          plan_item_id: planItemId || null,
        },
      };
    }
  }

  const planItemId = String((rawInput as any).plan_item_id ?? "").trim();
  const itemFromId = planItemId && Array.isArray(args.planItemSnapshot)
    ? args.planItemSnapshot.find((item) => item.id === planItemId) ?? null
    : null;
  const itemFromMemory = readLastResolvedPlanItem(args.tempMemory);
  const title = String(itemFromId?.title ?? itemFromMemory?.title ?? "").trim();
  const id = String(itemFromId?.id ?? itemFromMemory?.id ?? planItemId ?? "")
    .trim();
  if (!title) return null;
  return {
    ...rawInput,
    target: { kind: "plan_item", plan_item_id: id || null, title },
  };
}

export function isPendingAttackCardRecommendationOperation(
  value: unknown,
): value is {
  operation_type: "prepare_attack_card";
  surface_id?: string | null;
  surface_label?: string | null;
  recommendation_id?: string | null;
  operation_input?: Record<string, unknown> | null;
  created_at?: string;
  request_id?: string | null;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "prepare_attack_card" &&
      (record.surface_id === "attack_card" ||
        record.surface_id === "attack_cards") &&
      record.operation_input?.target?.title,
  );
}

export function isActiveAttackCardKeywordIntake(value: unknown): boolean {
  const record = value as any;
  if (!record || typeof record !== "object") return false;
  if (record.operation_type !== "prepare_attack_card") return false;
  const phase = String(record.phase ?? "").trim();
  const slot = String(
    record.slot_state?.slot ?? record.next_question?.slot ?? "",
  ).trim();
  const missing = Array.isArray(record.missing_slots)
    ? record.missing_slots.map((item: unknown) => String(item))
    : [];
  return phase === "keyword_intake" || slot === "activation_keyword" ||
    missing.includes("activation_keyword");
}

export function isPendingAttackCardOperation(value: unknown): value is {
  operation_id?: string;
  operation_type: "prepare_attack_card";
  draft: AttackCardDraftV1;
  target?: {
    plan_item_id?: string | null;
    kind?: "plan_item" | "personal_action";
    title?: string | null;
  };
  turn_count?: number;
  expires_after_turns?: number;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "prepare_attack_card" &&
      record.draft?.operation_type === "prepare_attack_card" &&
      record.draft?.draft?.title &&
      record.draft?.draft?.instruction,
  );
}

export function attackCardTargetFromPendingConfirmation(
  pendingConfirmation: Record<string, unknown> | undefined,
  fallbackOperationInput?: Record<string, unknown> | null,
): {
  plan_item_id?: string | null;
  kind?: "plan_item" | "personal_action";
  title?: string | null;
} {
  const pendingTarget = pendingConfirmation?.target as
    | Record<string, unknown>
    | undefined;
  const fallbackTarget = fallbackOperationInput?.target as
    | Record<string, unknown>
    | undefined;
  const target = pendingTarget ?? fallbackTarget ?? {};
  const planItemId = typeof target.plan_item_id === "string"
    ? target.plan_item_id
    : target.plan_item_id === null
    ? null
    : undefined;
  return {
    kind: target.kind === "plan_item" || planItemId
      ? "plan_item"
      : "personal_action",
    title: typeof target.title === "string" ? target.title : null,
    plan_item_id: planItemId ?? null,
  };
}

function attackCardQuestionCandidate(value: unknown): {
  kind: "plan_item";
  plan_item_id: string;
  title: string;
} | null {
  const candidate = value as any;
  if (!candidate || typeof candidate !== "object") return null;
  const planItemId = String(candidate.plan_item_id ?? "").trim();
  const title = String(candidate.title ?? "").trim();
  if (!planItemId || !title) return null;
  return { kind: "plan_item", plan_item_id: planItemId, title };
}

export function attackCardTargetFromQuestionCandidate(
  value: unknown,
): Record<string, unknown> | null {
  const candidate = attackCardQuestionCandidate(value);
  if (!candidate) return null;
  return {
    kind: "plan_item",
    plan_item_id: candidate.plan_item_id,
    title: candidate.title,
  };
}

function attackCardTechniqueOptionFromQuestion(question: any): {
  key: string;
  title: string;
  description: string;
  reason: string;
  example: string;
  recommended: boolean;
} | null {
  const techniqueOptions = Array.isArray(question?.technique_options)
    ? question.technique_options
      .map((option: any) => ({
        key: String(option?.technique_key ?? "").trim(),
        title: String(option?.title ?? "").trim(),
        description: String(option?.description ?? "").trim(),
        reason: String(option?.reason ?? "").trim(),
        example: String(option?.example ?? "").trim(),
        recommended: Boolean(option?.recommended),
      }))
      .filter((option: any) => option.key && option.title)
    : [];
  return techniqueOptions.find((option: any) => option.recommended) ??
    techniqueOptions.find((option: any) => option.key === "texte_recadrage") ??
    techniqueOptions[0] ?? null;
}

export function applyAttackCardSingleTechniquePreference(
  nextQuestion: unknown,
  options?: { preferSingleTechnique?: boolean },
): unknown {
  const question = nextQuestion as any;
  if (
    !options?.preferSingleTechnique ||
    String(question?.slot ?? "") !== "technique"
  ) return nextQuestion;
  const selected = attackCardTechniqueOptionFromQuestion(question);
  if (!selected) return nextQuestion;
  const detail = selected.reason || selected.description;
  return {
    ...question,
    question: `Je te propose ${selected.title}: ${detail}. On part là-dessus ?`,
    technique_options: [{
      technique_key: selected.key,
      title: selected.title,
      description: selected.description,
      reason: selected.reason,
      example: selected.example,
      recommended: true,
    }],
    known_slots: {
      ...(question?.known_slots ?? {}),
      suggested_attack_technique: selected.key,
      suggested_attack_technique_title: selected.title,
    },
  };
}

export function attackCardOperationInputWithSingleTechniqueApproval(
  operationInput: Record<string, unknown> | null | undefined,
  userMessage: string,
): Record<string, unknown> | null | undefined {
  const suggested = String(operationInput?.suggested_attack_technique ?? "")
    .trim();
  if (!suggested) return operationInput;
  if (
    !/^(oui|ok|okay|go|vas y|vas-y|d accord|partons|on part|valide)\b/.test(
      normalizeRouteText(userMessage),
    )
  ) return operationInput;
  return {
    ...(operationInput ?? {}),
    technique: suggested,
    desired_attack_technique: suggested,
  };
}

export function mergeAttackCardQuestionKnownSlots(
  operationInput: Record<string, unknown> | null | undefined,
  nextQuestion: unknown,
): Record<string, unknown> | null | undefined {
  const known = (nextQuestion as any)?.known_slots;
  if (!known || typeof known !== "object" || Array.isArray(known)) {
    return operationInput;
  }
  return { ...(operationInput ?? {}), ...(known as Record<string, unknown>) };
}

export function renderAttackCardSlotQuestion(
  nextQuestion: unknown,
  fallback =
    "Il me manque l'action à viser. Donne-moi l'action ou décris-la en une phrase.",
): string {
  const question = nextQuestion as any;
  const generatedQuestion = String(question?.question ?? "").trim();
  if (generatedQuestion) return generatedQuestion;
  const status = String(question?.status ?? "");
  const slot = String(question?.slot ?? "");
  const candidate = attackCardQuestionCandidate(question?.candidate);
  const candidates = Array.isArray(question?.candidates)
    ? question.candidates.map(attackCardQuestionCandidate).filter(Boolean)
    : [];
  const techniqueOptions = Array.isArray(question?.technique_options)
    ? question.technique_options
      .map((option: any) => ({
        key: String(option?.technique_key ?? "").trim(),
        title: String(option?.title ?? "").trim(),
        description: String(option?.description ?? "").trim(),
        reason: String(option?.reason ?? "").trim(),
        example: String(option?.example ?? "").trim(),
        recommended: Boolean(option?.recommended),
      }))
      .filter((option: any) => option.title)
    : [];
  const activationKeywordOptions = Array.isArray(
      question?.activation_keyword_options,
    )
    ? question.activation_keyword_options.map((option: unknown) =>
      String(option ?? "").trim()
    ).filter(Boolean)
    : [];
  const rejectedActivationKeyword = String(
    question?.known_slots?.rejected_activation_keyword ??
      question?.rejected_activation_keyword ?? "",
  ).trim();
  const techniqueFitWarning = String(
    question?.known_slots?.technique_fit_warning ??
      question?.technique_fit_warning ?? "",
  ).trim();
  if (slot === "technique" && techniqueOptions.length > 0) {
    const lines = techniqueOptions.map((option: any, index: number) => {
      const marker = option.recommended ? " (recommandee)" : "";
      const detail = option.reason || option.description;
      return `${
        index + 1
      }. ${option.title}${marker}: ${detail}. ${option.example}`;
    });
    const prefix = techniqueFitWarning
      ? "Je garde un doute sur la technique la plus adaptee ici: Mot de bascule sert surtout quand tu sens que tu vas craquer, abandonner ou esquiver. Pour ce besoin, je te propose aussi des options plus proches du contexte.\n\n"
      : "";
    return `${prefix}Quelle technique d'attaque tu veux utiliser ?\n\n${
      lines.join("\n")
    }\n\nReponds avec le nom ou le numero.`;
  }
  if (slot === "activation_keyword") {
    const examples = activationKeywordOptions.length > 0
      ? activationKeywordOptions.join(", ")
      : "PÊCHE, KIWI ou BIM";
    const conflictPrefix = rejectedActivationKeyword
      ? `${rejectedActivationKeyword} est deja utilise comme mot de bascule. `
      : "";
    return `${conflictPrefix}Pour Mot de bascule, il me faut ton mot declencheur avant de creer la carte. Choisis un mot court lie a ton probleme avec l'action. Je peux te proposer ${examples}, ou tu peux en donner un autre.`;
  }
  if (status === "candidate_needs_confirmation" && candidate) {
    return `Je pense à "${candidate.title}". Confirme si c'est ça, sinon corrige la cible.`;
  }
  if (status === "ambiguous" && candidates.length > 0) {
    return `J'hésite entre ${
      candidates.map((item: any) => `"${item.title}"`).join(" / ")
    }. Dis-moi laquelle viser.`;
  }
  if (status === "missing" && candidates.length > 0) {
    return `Il me manque l'action exacte à viser. Je peux viser ${
      candidates.map((item: any) => `"${item.title}"`).join(" / ")
    }, ou une autre action si ce n'est pas ça.`;
  }
  return fallback;
}

export function isAttackCardLocationOrManagementQuestion(
  message: string,
): boolean {
  const text = normalizeOperationText(message);
  return /\b(retrouve|retrouver|trouve|trouver|chercher|cherche|ou exactement|ou est|ou sont|ressources|modifier|modifie|imprimer|imprime)\b/
    .test(text) &&
    /\b(carte|cartes|attaque|elle|la)\b/.test(text) &&
    !/\b(cree|creer|fais|faire|nouvelle)\b/.test(text);
}

function hasRecentAttackCardContext(
  recentMessages: Array<{ role: string; content: string }>,
): boolean {
  const context = normalizeOperationText(
    recentMessages.slice(-6).map((turn) => turn.content).join("\n"),
  );
  return /\b(carte d'attaque|cartes d'attaque|carte attaque|attaque)\b/.test(
    context,
  );
}

function isAttackCardLocationOrManagementQuestionWithContext(args: {
  message: string;
  recentMessages: Array<{ role: string; content: string }>;
}): boolean {
  if (isAttackCardLocationOrManagementQuestion(args.message)) return true;
  if (!hasRecentAttackCardContext(args.recentMessages)) return false;
  const text = normalizeOperationText(args.message);
  return /\b(retrouve|retrouver|trouve|trouver|chercher|cherche|ou exactement|ou est|ou sont|ressources|plan|modifier|modifie|imprimer|imprime)\b/
    .test(text) &&
    /\b(carte|cartes|elle|la|ressources|plan)\b/.test(text) &&
    !/\b(cree|creer|fais|faire|nouvelle)\b/.test(text);
}

export function isAttackCardPostCreationVerificationQuestion(args: {
  message: string;
  recentMessages: Array<{ role: string; content: string }>;
}): boolean {
  if (!hasRecentAttackCardContext(args.recentMessages)) return false;
  const text = normalizeOperationText(args.message);
  const asksFactually =
    /\b(est ce que|est-ce que|je peux|on peut|possible|c est bien|c'est bien|tu l as|tu l'as|elle est|elle se|rattach|ou|où|retrouve|modifier|modifiable|imprimer|ressources)\b/
      .test(text) || /[?？]/.test(args.message);
  if (!asksFactually) return false;
  const asksNewOperation =
    /\b(cree|creer|prepare|preparer|fais|faire|nouvelle|nouvelle version|refais|refaire|modifie la|modifie-la|change la|change-la)\b/
      .test(text);
  return !asksNewOperation;
}

export function renderAttackCardPostCreationVerificationReply(args: {
  message: string;
  recentMessages: Array<{ role: string; content: string }>;
}): string | null {
  if (!isAttackCardPostCreationVerificationQuestion(args)) return null;
  const text = args.message.trim();
  const normalized = normalizeOperationText(text);
  const recentAssistant = args.recentMessages
    .filter((message) => message.role === "assistant")
    .slice(-4)
    .map((message) => message.content)
    .join("\n");

  const attachMatch = text.match(
    /rattach[ée]e?\s+[àa]\s+(.+?)(?:,\s*pas\s+[àa]\s+(.+?))?\s*\?/i,
  );
  if (attachMatch?.[1]) {
    const positive = attachMatch[1].trim().replace(/[?.!]+$/g, "");
    const negative = attachMatch[2]?.trim().replace(/[?.!]+$/g, "");
    return negative
      ? `Oui, elle est rattachée à ${positive}, pas à ${negative}. Je ne modifie rien.`
      : `Oui, elle est rattachée à ${positive}. Je ne modifie rien.`;
  }

  const quoted = text.match(/[“"]([^”"]{3,120})[”"]/);
  const phrase = quoted?.[1] ??
    (normalized.includes("ecrire une seule ligne")
      ? "écrire une seule ligne"
      : normalized.includes("decider")
      ? "décider après si je continue"
      : null);
  if (phrase) {
    const found = normalizeOperationText(recentAssistant).includes(
      normalizeOperationText(phrase),
    );
    return found
      ? "Oui, cette consigne est bien dans le contenu actuel. Je ne modifie rien."
      : "Non, je ne la vois pas dans le contenu actuel. Je ne modifie rien.";
  }

  if (isAttackCardLocationOrManagementQuestionWithContext(args)) return null;
  return "Oui, je vérifie seulement. Je ne crée rien et je ne modifie rien.";
}
