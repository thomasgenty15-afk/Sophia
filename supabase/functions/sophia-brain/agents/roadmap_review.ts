import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { generateWithGemini } from "../../_shared/gemini.ts";
import { extractStructuredCalibrationFields } from "../../_shared/v2-calibration-fields.ts";
import {
  executeRoadmapAction,
  type RoadmapActionResult,
} from "../../update-roadmap-v3/index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RoadmapReviewMeta = {
  requestId?: string;
  forceRealAi?: boolean;
  channel?: "web" | "whatsapp";
  model?: string;
};

export type RoadmapReviewResult = {
  text: string;
  executed_tools: string[];
  tool_execution: "none" | "success" | "error";
};

type TransformationContext = {
  id: string;
  title: string | null;
  priority_order: number;
  status: string;
  user_summary?: string;
  internal_summary?: string;
  questionnaire_context?: string[];
  source_group_index?: number | null;
  ordering_rationale?: string | null;
  completion_summary?: string | null;
  questionnaire_answers?: Record<string, unknown> | null;
  questionnaire_schema?: Record<string, unknown> | null;
  completed_at?: string | null;
};

type LoadedRoadmapReviewContext = {
  transformations: TransformationContext[];
  previousTransformationSummary: string | null;
  calibrationSummary: string | null;
  conversationPulseSummary: string | null;
};

// ---------------------------------------------------------------------------
// Tool definitions (Gemini function_declarations format)
// ---------------------------------------------------------------------------

const ROADMAP_TOOLS = [
  {
    name: "reorder_transformations",
    description:
      "Réordonne les transformations du parcours. Passe la liste complète des IDs dans le nouvel ordre souhaité (index 0 = première transformation à traiter).",
    parameters: {
      type: "object",
      properties: {
        ordered_ids: {
          type: "array",
          items: { type: "string" },
          description: "Liste des transformation IDs dans le nouvel ordre",
        },
      },
      required: ["ordered_ids"],
    },
  },
  {
    name: "add_transformation",
    description:
      "Ajoute une nouvelle transformation au parcours. Elle sera placée en dernière position.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Titre court et motivant (3-8 mots)",
        },
        user_summary: {
          type: "string",
          description: "Description courte pour l'utilisateur (2-4 phrases)",
        },
        ordering_rationale: {
          type: "string",
          description: "Justification de la position dans l'ordonnancement",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "remove_transformation",
    description:
      "Supprime une transformation du parcours (la passe en statut 'cancelled').",
    parameters: {
      type: "object",
      properties: {
        transformation_id: {
          type: "string",
          description: "ID de la transformation à supprimer",
        },
      },
      required: ["transformation_id"],
    },
  },
  {
    name: "rename_transformation",
    description: "Renomme une transformation existante.",
    parameters: {
      type: "object",
      properties: {
        transformation_id: {
          type: "string",
          description: "ID de la transformation à renommer",
        },
        title: {
          type: "string",
          description: "Nouveau titre (3-8 mots, clair et motivant)",
        },
      },
      required: ["transformation_id", "title"],
    },
  },
];

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildRoadmapReviewSystemPrompt(
  args: {
    transformations: TransformationContext[];
    isFirstOnboarding: boolean;
    previousTransformationSummary?: string | null;
    calibrationSummary?: string | null;
    conversationPulseSummary?: string | null;
  },
): string {
  const roadmapBlock = args.transformations
    .map(
      (t) =>
        `- [${t.status}] #${t.priority_order} "${t.title}" (id: ${t.id})${
          t.ordering_rationale ? `\n  Rationale: ${t.ordering_rationale}` : ""
        }`,
    )
    .join("\n") || "- Aucune transformation disponible pour le moment.";

  const signals: string[] = [];
  if (args.previousTransformationSummary) {
    signals.push(`Dernière transformation terminée\n${args.previousTransformationSummary}`);
  }
  if (args.calibrationSummary) {
    signals.push(`Calibrage initial disponible\n${args.calibrationSummary}`);
  }
  if (args.conversationPulseSummary) {
    signals.push(`Pulse récent\n${args.conversationPulseSummary}`);
  }

  const usefulSignalsBlock = signals.length > 0
    ? `\n## Signaux utiles\n${signals.join("\n\n")}`
    : "";

  return `Tu es Sophia en mode revue de roadmap. L'utilisateur voit sa roadmap de transformations personnelles et peut te demander de la modifier.

## Contexte
${args.isFirstOnboarding ? "C'est le premier onboarding de l'utilisateur. Il vient de découvrir son parcours." : "L'utilisateur a terminé une transformation et revoit son parcours pour la suite."}

## Roadmap actuelle
${roadmapBlock}
${usefulSignalsBlock}

## Tes capacités
Tu as accès à 4 outils pour modifier la roadmap EN TEMPS RÉEL :
- **reorder_transformations** : changer l'ordre des transformations
- **add_transformation** : ajouter une nouvelle transformation
- **remove_transformation** : supprimer une transformation
- **rename_transformation** : renommer une transformation

Quand tu modifies la roadmap, l'utilisateur voit les changements instantanément sur son écran.

## Règles
- Tutoie l'utilisateur, sois empathique et directe
- Si l'utilisateur veut changer l'ordre, utilise reorder_transformations avec TOUS les IDs (pas seulement ceux qui bougent)
- Si l'utilisateur mentionne un nouveau sujet, propose de l'ajouter avec add_transformation
- Si l'utilisateur dit qu'un sujet n'est plus pertinent, propose de le supprimer avec remove_transformation
- Après chaque modification, confirme brièvement ce que tu as fait
- Ne modifie JAMAIS la roadmap sans que l'utilisateur l'ait demandé ou validé
- Si l'utilisateur pose une question sur l'ordre, explique la logique de dépendance (fondamentaux → habilitants → objectifs finaux)
- Quand tu ajoutes une transformation, garde-la spécifique et exploitable dans le parcours actuel
- T'appuie sur les signaux utiles pour contextualiser ta réponse, sans inventer
- Reste concis (2-4 phrases max par réponse)
- Ne répète pas la liste complète des transformations sauf si on te le demande`;
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function extractOnboardingV2(
  handoffPayload: unknown,
): Record<string, unknown> {
  const onboardingV2 = (handoffPayload as
    | { onboarding_v2?: unknown }
    | null
    | undefined)?.onboarding_v2;
  return onboardingV2 && typeof onboardingV2 === "object"
    ? onboardingV2 as Record<string, unknown>
    : {};
}

function extractOrderingRationale(handoffPayload: unknown): string | null {
  const onboardingV2 = extractOnboardingV2(handoffPayload);
  return typeof onboardingV2.ordering_rationale === "string"
    ? onboardingV2.ordering_rationale
    : null;
}

function extractQuestionnaireContext(handoffPayload: unknown): string[] {
  const onboardingV2 = extractOnboardingV2(handoffPayload);
  return Array.isArray(onboardingV2.questionnaire_context)
    ? onboardingV2.questionnaire_context.filter((item): item is string =>
      typeof item === "string" && item.trim().length > 0
    )
    : [];
}

function extractSourceGroupIndex(handoffPayload: unknown): number | null {
  const onboardingV2 = extractOnboardingV2(handoffPayload);
  return typeof onboardingV2.source_group_index === "number"
    ? onboardingV2.source_group_index
    : null;
}

function formatRecentHistory(history: any[]): string | null {
  const entries = history
    .slice(-6)
    .map((item) => {
      const role = item?.role === "assistant" ? "Sophia" : "Utilisateur";
      const content = typeof item?.content === "string" ? item.content.trim() : "";
      if (!content) return null;
      return `${role}: ${content}`;
    })
    .filter((entry): entry is string => Boolean(entry));
  return entries.length > 0 ? entries.join("\n") : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function formatCalibrationSummary(
  entries: Array<{
    answers: Record<string, unknown> | null | undefined;
    schema: Record<string, unknown> | null | undefined;
  }>,
): string | null {
  let struggleDuration: string | null = null;
  let startingPoint: string | null = null;
  let mainBlocker: string | null = null;
  let priorityGoal: string | null = null;
  let perceivedDifficulty: string | null = null;
  let probableDrivers: string | null = null;
  let priorAttempts: string | null = null;
  let selfConfidence: number | null = null;
  let successIndicator: string | null = null;

  for (const entry of entries) {
    const answers = entry.answers;
    if (!answers) continue;
    const calibration = extractStructuredCalibrationFields(
      answers,
      entry.schema ?? null,
    );

    struggleDuration ||= calibration.struggle_duration;
    startingPoint ||= calibration.starting_point;
    mainBlocker ||= calibration.main_blocker;
    priorityGoal ||= calibration.priority_goal;
    perceivedDifficulty ||= calibration.perceived_difficulty;
    probableDrivers ||= calibration.probable_drivers;
    priorAttempts ||= calibration.prior_attempts;
    selfConfidence ??= calibration.self_confidence;
    successIndicator ||= calibration.success_indicator;
  }

  const lines = [
    struggleDuration ? `- Ancienneté du problème: ${struggleDuration}` : null,
    startingPoint ? `- Point de départ actuel: ${startingPoint}` : null,
    mainBlocker ? `- Blocage principal: ${mainBlocker}` : null,
    priorityGoal ? `- Critère concret de réussite: ${priorityGoal}` : null,
    perceivedDifficulty ? `- Difficulté perçue: ${perceivedDifficulty}` : null,
    probableDrivers ? `- Facteur probable dominant: ${probableDrivers}` : null,
    priorAttempts ? `- Tentatives passées: ${priorAttempts}` : null,
    selfConfidence != null && Number.isInteger(selfConfidence) &&
        selfConfidence >= 1 && selfConfidence <= 5
      ? `- Confiance initiale: ${selfConfidence}/5`
      : null,
    successIndicator && successIndicator !== priorityGoal
      ? `- Indicateur de réussite: ${successIndicator}`
      : null,
  ].filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : null;
}

function formatConversationPulseSummary(
  payload: Record<string, unknown>,
): string | null {
  const lines: string[] = [];
  const messagesLast72hCount = typeof payload.messages_last_72h_count === "number"
    ? payload.messages_last_72h_count
    : null;
  if (messagesLast72hCount != null) {
    lines.push(`- Messages sur 72h: ${messagesLast72hCount}`);
  }

  const recentBilans = Array.isArray(payload.recent_bilans)
    ? payload.recent_bilans
    : [];
  const bilanSummary = recentBilans
    .map((bilan) => {
      if (!bilan || typeof bilan !== "object") return null;
      const summary = typeof (bilan as any).summary === "string"
        ? (bilan as any).summary.trim()
        : "";
      return summary || null;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 2);
  if (bilanSummary.length > 0) {
    lines.push(`- Bilans récents: ${bilanSummary.join(" | ")}`);
  }

  const recentHandoff = payload.recent_transformation_handoff;
  if (recentHandoff && typeof recentHandoff === "object") {
    const summary = typeof (recentHandoff as any).summary === "string"
      ? (recentHandoff as any).summary.trim()
      : "";
    if (summary) {
      lines.push(`- Handoff récent: ${summary}`);
    }
  }

  const events = Array.isArray(payload.event_memories) ? payload.event_memories : [];
  const eventSummary = events
    .map((eventItem) => {
      if (!eventItem || typeof eventItem !== "object") return null;
      const title = typeof (eventItem as any).title === "string"
        ? (eventItem as any).title.trim()
        : "";
      const date = typeof (eventItem as any).date === "string"
        ? (eventItem as any).date.trim()
        : "";
      if (!title) return null;
      return date ? `${title} (${date})` : title;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 2);
  if (eventSummary.length > 0) {
    lines.push(`- Éléments de contexte: ${eventSummary.join(" | ")}`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

async function loadRoadmapReviewContext(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
): Promise<LoadedRoadmapReviewContext> {
  // Defense-in-depth: verify cycle belongs to user
  const { data: cycleRow, error: cycleError } = await supabase
    .from("user_cycles")
    .select("id")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .maybeSingle();
  if (cycleError) throw cycleError;
  if (!cycleRow) {
    throw new Error(`Cycle ${cycleId} not found or not owned by user ${userId}`);
  }

  const { data: transformationRows, error: transformationError } = await supabase
    .from("user_transformations")
    .select(
      "id, title, priority_order, status, user_summary, internal_summary, completion_summary, questionnaire_answers, questionnaire_schema, handoff_payload, completed_at",
    )
    .eq("cycle_id", cycleId)
    .neq("status", "cancelled")
    .order("priority_order", { ascending: true });

  if (transformationError) {
    throw transformationError;
  }

  const transformations = (transformationRows ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    priority_order: row.priority_order,
    status: row.status,
    user_summary: row.user_summary ?? "",
    internal_summary: row.internal_summary ?? "",
    completion_summary: row.completion_summary ?? null,
    questionnaire_answers:
      row.questionnaire_answers && typeof row.questionnaire_answers === "object"
        ? row.questionnaire_answers as Record<string, unknown>
        : null,
    questionnaire_schema:
      row.questionnaire_schema && typeof row.questionnaire_schema === "object"
        ? row.questionnaire_schema as Record<string, unknown>
        : null,
    questionnaire_context: extractQuestionnaireContext(row.handoff_payload),
    source_group_index: extractSourceGroupIndex(row.handoff_payload),
    ordering_rationale: extractOrderingRationale(row.handoff_payload),
    completed_at: row.completed_at ?? null,
  }));

  const previousTransformation = [...transformations]
    .filter((item) => item.status === "completed" || item.status === "archived")
    .sort((a: any, b: any) =>
      (parseIsoMs(b.completed_at) ?? -1) - (parseIsoMs(a.completed_at) ?? -1)
    )[0];

  const previousTransformationSummary = previousTransformation
    ? [
      previousTransformation.title
        ? `Titre: ${previousTransformation.title}`
        : null,
      previousTransformation.completion_summary
        ? `Résultat: ${previousTransformation.completion_summary}`
        : null,
    ].filter((line): line is string => Boolean(line)).join("\n") || null
    : null;

  const calibrationSummary = formatCalibrationSummary(
    transformations.map((item: TransformationContext) => ({
      answers: item.questionnaire_answers ?? null,
      schema: item.questionnaire_schema ?? null,
    })),
  );

  const { data: pulseRow, error: pulseError } = await supabase
    .from("system_runtime_snapshots")
    .select("payload, created_at")
    .eq("user_id", userId)
    .eq("cycle_id", cycleId)
    .eq("snapshot_type", "conversation_pulse")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pulseError) {
    throw pulseError;
  }

  let conversationPulseSummary: string | null = null;
  if (pulseRow?.payload && typeof pulseRow.payload === "object") {
    const pulseCreatedAtMs = parseIsoMs(pulseRow.created_at);
    if (
      pulseCreatedAtMs != null &&
      Date.now() - pulseCreatedAtMs <= 24 * 60 * 60 * 1000
    ) {
      conversationPulseSummary = formatConversationPulseSummary(
        pulseRow.payload as Record<string, unknown>,
      );
    }
  }

  return {
    transformations,
    previousTransformationSummary,
    calibrationSummary,
    conversationPulseSummary,
  };
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

async function executeTool(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<{ result: RoadmapActionResult; toolLabel: string }> {
  switch (toolName) {
    case "reorder_transformations": {
      const orderedIds = Array.isArray(toolArgs.ordered_ids)
        ? toolArgs.ordered_ids.map(String)
        : [];
      const result = await executeRoadmapAction(supabase, userId, {
        action: "reorder",
        cycle_id: cycleId,
        ordered_ids: orderedIds,
      });
      return { result, toolLabel: "reorder" };
    }

    case "add_transformation": {
      const result = await executeRoadmapAction(supabase, userId, {
        action: "add",
        cycle_id: cycleId,
        title: String(toolArgs.title ?? ""),
        user_summary: String(toolArgs.user_summary ?? ""),
        ordering_rationale: String(toolArgs.ordering_rationale ?? ""),
      });
      return { result, toolLabel: "add" };
    }

    case "remove_transformation": {
      const result = await executeRoadmapAction(supabase, userId, {
        action: "remove",
        cycle_id: cycleId,
        transformation_id: String(toolArgs.transformation_id ?? ""),
      });
      return { result, toolLabel: "remove" };
    }

    case "rename_transformation": {
      const result = await executeRoadmapAction(supabase, userId, {
        action: "rename",
        cycle_id: cycleId,
        transformation_id: String(toolArgs.transformation_id ?? ""),
        title: String(toolArgs.title ?? ""),
      });
      return { result, toolLabel: "rename" };
    }

    default:
      throw new Error(`Unknown roadmap tool: ${toolName}`);
  }
}

// ---------------------------------------------------------------------------
// Main agent
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "gemini-2.5-flash-preview-05-20";

export async function runRoadmapReview(
  supabase: SupabaseClient,
  userId: string,
  message: string,
  history: any[],
  context: string,
  roadmapContext: {
    cycleId: string;
    transformations: TransformationContext[];
    isFirstOnboarding: boolean;
    previousTransformation?: { title?: string | null } | null;
  },
  meta?: RoadmapReviewMeta,
): Promise<RoadmapReviewResult> {
  const loadedContext = await loadRoadmapReviewContext(
    supabase,
    userId,
    roadmapContext.cycleId,
  );
  const effectiveTransformations = loadedContext.transformations.length > 0
    ? loadedContext.transformations
    : roadmapContext.transformations;
  const previousTransformationSummary = loadedContext.previousTransformationSummary ??
    (roadmapContext.previousTransformation?.title
      ? `Titre: ${roadmapContext.previousTransformation.title}`
      : null);

  const systemPrompt = buildRoadmapReviewSystemPrompt({
    transformations: effectiveTransformations,
    isFirstOnboarding: roadmapContext.isFirstOnboarding,
    previousTransformationSummary,
    calibrationSummary: loadedContext.calibrationSummary,
    conversationPulseSummary: loadedContext.conversationPulseSummary,
  });

  const fullPrompt = context
    ? `${systemPrompt}\n\n--- Contexte additionnel ---\n${context}`
    : systemPrompt;

  const model = meta?.model ?? DEFAULT_MODEL;
  const recentHistory = formatRecentHistory(history);
  const userPrompt = [
    recentHistory ? `Historique récent\n${recentHistory}` : null,
    `Message utilisateur\n${message}`,
  ].filter((block): block is string => Boolean(block)).join("\n\n");

  const response = await generateWithGemini(
    fullPrompt,
    userPrompt,
    0.4,
    false,
    ROADMAP_TOOLS,
    "auto",
    {
      requestId: meta?.requestId,
      model,
      source: "sophia-brain:roadmap_review",
      forceRealAi: meta?.forceRealAi,
    },
  );

  // Text response — no tool call
  if (typeof response === "string") {
    return {
      text: response.replace(/\*\*/g, "").trim(),
      executed_tools: [],
      tool_execution: "none",
    };
  }

  // Tool call response
  if (response && typeof response === "object") {
    const toolName = (response as any)?.tool ?? (response as any)?.name ?? null;
    const toolArgs = (response as any)?.args ?? (response as any)?.arguments ?? {};

    if (toolName && roadmapContext.cycleId) {
      try {
        const { result, toolLabel } = await executeTool(
          supabase,
          userId,
          roadmapContext.cycleId,
          toolName,
          toolArgs,
        );

        // Generate a follow-up message to confirm the action
        const updatedRoadmapBlock = result.updated_transformations
          .map(
            (t) => `#${t.priority_order} "${t.title}" (${t.status})`,
          )
          .join(", ");

        const followUpResponse = await generateWithGemini(
          fullPrompt,
          [
            recentHistory ? `Historique récent\n${recentHistory}` : null,
            `Message utilisateur\n${message}`,
            `[TOOL EXECUTED: ${toolLabel}. Résultat: roadmap mise à jour. Transformations actuelles: ${updatedRoadmapBlock}]`,
            "Confirme brièvement à l'utilisateur ce que tu viens de faire.",
          ].filter((block): block is string => Boolean(block)).join("\n\n"),
          0.4,
          false,
          [],
          "auto",
          {
            requestId: meta?.requestId ? `${meta.requestId}:followup` : undefined,
            model,
            source: "sophia-brain:roadmap_review:followup",
            forceRealAi: meta?.forceRealAi,
          },
        );

        const text = typeof followUpResponse === "string"
          ? followUpResponse.replace(/\*\*/g, "").trim()
          : "C'est fait, ta roadmap est mise à jour.";

        return {
          text,
          executed_tools: [toolLabel],
          tool_execution: "success",
        };
      } catch (err) {
        console.error("[RoadmapReview] Tool execution failed:", err);
        const errorMessage = String((err as Error)?.message ?? err ?? "").trim();
        return {
          text: errorMessage
            ? `Je n'ai pas pu appliquer ce changement pour le moment: ${errorMessage}`
            : "Je n'ai pas pu modifier ta roadmap pour le moment. Tu peux réessayer ou valider en l'état.",
          executed_tools: [toolName],
          tool_execution: "error",
        };
      }
    }

    // Fallback: extract text if present
    const maybeText =
      (response as any)?.text ??
      (response as any)?.message ??
      null;
    if (typeof maybeText === "string" && maybeText.trim()) {
      return {
        text: maybeText.replace(/\*\*/g, "").trim(),
        executed_tools: [],
        tool_execution: "none",
      };
    }
  }

  return {
    text: "Je suis là pour t'aider à ajuster ton parcours. Qu'est-ce que tu voudrais modifier ?",
    executed_tools: [],
    tool_execution: "none",
  };
}
