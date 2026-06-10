import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  type AttackKeywordTriggerPayload,
  detectAttackKeywordTrigger,
} from "../../../../_shared/attack_keyword.ts";
import type { ActiveTransformationRuntime } from "../../../../_shared/v2-runtime.ts";
import type {
  AttackCardContent,
  LabScopeKind,
} from "../../../../_shared/v2-types.ts";
import type { ProductRecommendation } from "../../../recommendation/recommendation_types.ts";

type AttackCardPlanItemSnapshotItem = {
  id: string;
  title: string;
};

function readLastResolvedPlanItem(
  tempMemory: unknown,
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

export function buildAttackCardRecommendationOperationInput(args: {
  recommendation: ProductRecommendation | null;
  tempMemory: unknown;
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

export function isAttackCardPostCreationVerificationQuestion(args: {
  message: string;
  recentMessages: Array<{ role: string; content: string }>;
}): boolean {
  void args;
  return false;
}
