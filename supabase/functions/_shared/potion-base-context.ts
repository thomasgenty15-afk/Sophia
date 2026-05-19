import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import type { LabScopeKind, PotionType } from "./v2-types.ts";
import { loadLabScopeContext } from "./v2-lab-context.ts";

export type PotionBaseContext = {
  scope: {
    kind: LabScopeKind;
    cycle_id: string | null;
    transformation_id: string | null;
    resolved_from: "explicit_transformation" | "related_plan_item" | "active_transformation" | "out_of_plan";
  };
  transformation: {
    title: string | null;
    user_summary: string | null;
    internal_summary: string | null;
    success_definition: string | null;
    main_constraint: string | null;
    deep_why_answers: Array<{ question: string; answer: string }>;
    questionnaire_answers: Record<string, unknown> | null;
  };
  plan_strategy: {
    identity_shift: string | null;
    core_principle: string | null;
    success_definition: string | null;
    main_constraint: string | null;
  };
  plan_items: Array<{
    id: string;
    title: string;
    description: string | null;
    dimension: string | null;
    kind: string | null;
    status: string | null;
    tracking_type: string | null;
    current_habit_state: string | null;
    support_mode: string | null;
    support_function: string | null;
    target_reps: number | null;
    current_reps: number | null;
    cadence_label: string | null;
    scheduled_days: string[] | null;
    time_of_day: string | null;
  }>;
  prior_potions: Array<{
    id: string;
    potion_type: string;
    title: string | null;
    generated_at: string | null;
    reminder_instruction: string | null;
  }>;
  active_potion_reminders: Array<{
    id: string;
    potion_type: string | null;
    message_instruction: string;
    local_time_hhmm: string;
    scheduled_days: string[];
  }>;
  usage_guidance: string[];
};

type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : null;
}

function extractDeepWhyAnswers(
  handoffPayload: unknown,
): Array<{ question: string; answer: string }> {
  if (!isRecord(handoffPayload)) return [];
  const phase1 = isRecord(handoffPayload.phase_1) ? handoffPayload.phase_1 : {};
  const deepWhy = isRecord(phase1.deep_why) ? phase1.deep_why : {};
  const questions = Array.isArray(deepWhy.questions)
    ? deepWhy.questions
    : [];
  const answers = Array.isArray(deepWhy.answers) ? deepWhy.answers : [];
  const questionById = new Map<string, string>();
  for (const question of questions) {
    if (!isRecord(question)) continue;
    const id = text(question.id);
    const label = text(question.label) ?? text(question.question);
    if (id && label) questionById.set(id, label);
  }
  return answers.flatMap((answer) => {
    if (!isRecord(answer)) return [];
    const questionId = text(answer.question_id);
    const answerText = text(answer.answer);
    if (!answerText) return [];
    return [{
      question: questionId ? questionById.get(questionId) ?? questionId : "Pourquoi profond",
      answer: answerText,
    }];
  }).slice(0, 6);
}

function guidanceForPotion(type: PotionType): string[] {
  switch (type) {
    case "clarte":
      return [
        "Priorite haute: pourquoi profond, resume de transformation, succes attendu, contrainte principale et strategie du plan.",
        "Utilise les actions du plan seulement pour aider a prioriser; ne transforme pas la potion en todo-list.",
      ];
    case "rappel":
      return [
        "Priorite haute: actions actives/en attente, habitudes, cadence, repetitions, horaires et rappels potion deja actifs.",
        "Le rappel doit raccrocher a un objet concret si la base en contient un.",
      ];
    case "courage":
      return [
        "Priorite haute: action active/en attente, contrainte principale, identity_shift et core_principle.",
        "Si aucune action concrete n'est disponible en base, reste sur un premier pas doux sans inventer de contexte.",
      ];
    case "guerison":
      return [
        "Priorite haute: resume utilisateur, contrainte principale, pourquoi profond, questionnaire global et potions de guerison precedentes.",
        "Ne fabrique pas d'echec recent si la base n'en contient pas; repare seulement ce qui est explicitement disponible.",
      ];
    case "amour":
      return [
        "Priorite haute: pourquoi profond, identity_shift, core_principle, resume utilisateur et potions d'amour precedentes.",
        "Ne suppose pas le dialogue interieur actuel si la base ne l'indique pas.",
      ];
    case "apaisement":
      return [
        "Priorite haute: charge visible du plan, cadences/horaires, contrainte principale et rappels potion deja actifs.",
        "Le suivi doit desserrer la pression; evite d'ajouter une exigence de performance.",
      ];
  }
}

async function resolveScope(args: {
  admin: SupabaseClient;
  userId: string;
  scopeKind?: LabScopeKind | null;
  transformationId?: string | null;
  relatedPlanItemId?: string | null;
}): Promise<PotionBaseContext["scope"]> {
  const relatedPlanItemId = text(args.relatedPlanItemId);
  if (relatedPlanItemId) {
    const { data } = await args.admin
      .from("user_plan_items")
      .select("cycle_id, transformation_id")
      .eq("user_id", args.userId)
      .eq("id", relatedPlanItemId)
      .maybeSingle();
    if (data?.transformation_id) {
      return {
        kind: "transformation",
        cycle_id: String(data.cycle_id),
        transformation_id: String(data.transformation_id),
        resolved_from: "related_plan_item",
      };
    }
  }

  const explicitTransformationId = text(args.transformationId);
  if (args.scopeKind === "transformation" && explicitTransformationId) {
    return {
      kind: "transformation",
      cycle_id: null,
      transformation_id: explicitTransformationId,
      resolved_from: "explicit_transformation",
    };
  }

  if (args.scopeKind === "out_of_plan") {
    const { data } = await args.admin
      .from("user_cycles")
      .select("id")
      .eq("user_id", args.userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      kind: "out_of_plan",
      cycle_id: data?.id ? String(data.id) : null,
      transformation_id: null,
      resolved_from: "out_of_plan",
    };
  }

  const { data: cycle } = await args.admin
    .from("user_cycles")
    .select("id, active_transformation_id")
    .eq("user_id", args.userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cycle?.active_transformation_id) {
    return {
      kind: "transformation",
      cycle_id: String(cycle.id),
      transformation_id: String(cycle.active_transformation_id),
      resolved_from: "active_transformation",
    };
  }

  return {
    kind: "out_of_plan",
    cycle_id: cycle?.id ? String(cycle.id) : null,
    transformation_id: null,
    resolved_from: "out_of_plan",
  };
}

export async function loadPotionBaseContext(args: {
  admin: SupabaseClient;
  userId: string;
  potionType: PotionType;
  scopeKind?: LabScopeKind | null;
  transformationId?: string | null;
  relatedPlanItemId?: string | null;
}): Promise<PotionBaseContext> {
  const scope = await resolveScope(args);
  const context = scope.kind === "transformation" && scope.transformation_id
    ? await loadLabScopeContext({
      admin: args.admin,
      userId: args.userId,
      transformationId: scope.transformation_id,
      scopeKind: "transformation",
    })
    : await loadLabScopeContext({
      admin: args.admin,
      userId: args.userId,
      scopeKind: "out_of_plan",
    });

  const { data: transformation } = scope.transformation_id
    ? await args.admin
      .from("user_transformations")
      .select("title, internal_summary, user_summary, success_definition, main_constraint, questionnaire_answers, handoff_payload")
      .eq("id", scope.transformation_id)
      .maybeSingle()
    : { data: null };

  const { data: items } = scope.transformation_id
    ? await args.admin
      .from("user_plan_items")
      .select("id,title,description,dimension,kind,status,tracking_type,current_habit_state,support_mode,support_function,target_reps,current_reps,cadence_label,scheduled_days,time_of_day,activation_order,updated_at")
      .eq("user_id", args.userId)
      .eq("transformation_id", scope.transformation_id)
      .in("status", ["active", "pending", "stalled", "in_maintenance"])
      .order("activation_order", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(10)
    : { data: [] };

  const { data: priorPotions } = await args.admin
    .from("user_potion_sessions")
    .select("id,potion_type,content,follow_up_strategy,generated_at")
    .eq("user_id", args.userId)
    .eq("status", "completed")
    .eq("potion_type", args.potionType)
    .order("generated_at", { ascending: false })
    .limit(3);

  const { data: reminders } = await args.admin
    .from("user_recurring_reminders")
    .select("id,message_instruction,local_time_hhmm,scheduled_days,source_potion_session_id,user_potion_sessions(potion_type)")
    .eq("user_id", args.userId)
    .eq("status", "active")
    .eq("initiative_kind", "potion_follow_up")
    .order("updated_at", { ascending: false })
    .limit(5);

  return {
    scope: {
      ...scope,
      cycle_id: scope.cycle_id ?? context.cycle_id,
      transformation_id: scope.transformation_id ?? context.transformation_id,
    },
    transformation: {
      title: text(transformation?.title) ?? context.transformation_title,
      user_summary: text(transformation?.user_summary) ?? context.user_summary,
      internal_summary: text(transformation?.internal_summary),
      success_definition: text(transformation?.success_definition),
      main_constraint: text(transformation?.main_constraint),
      deep_why_answers: extractDeepWhyAnswers(transformation?.handoff_payload),
      questionnaire_answers: isRecord(transformation?.questionnaire_answers)
        ? transformation.questionnaire_answers
        : context.questionnaire_answers,
    },
    plan_strategy: context.plan_strategy,
    plan_items: (items ?? []).map((item: RecordLike) => ({
      id: String(item.id),
      title: String(item.title ?? "").trim(),
      description: text(item.description),
      dimension: text(item.dimension),
      kind: text(item.kind),
      status: text(item.status),
      tracking_type: text(item.tracking_type),
      current_habit_state: text(item.current_habit_state),
      support_mode: text(item.support_mode),
      support_function: text(item.support_function),
      target_reps: typeof item.target_reps === "number" ? item.target_reps : null,
      current_reps: typeof item.current_reps === "number" ? item.current_reps : null,
      cadence_label: text(item.cadence_label),
      scheduled_days: stringArray(item.scheduled_days),
      time_of_day: text(item.time_of_day),
    })),
    prior_potions: (priorPotions ?? []).map((row: RecordLike) => {
      const content = isRecord(row.content) ? row.content : {};
      const followUp = isRecord(row.follow_up_strategy)
        ? row.follow_up_strategy
        : {};
      return {
        id: String(row.id),
        potion_type: String(row.potion_type ?? ""),
        title: text(content.potion_name) ?? text(content.title),
        generated_at: text(row.generated_at),
        reminder_instruction: text(followUp.message_text) ??
          text(followUp.reminder_instruction),
      };
    }),
    active_potion_reminders: (reminders ?? []).map((row: RecordLike) => {
      const session = Array.isArray(row.user_potion_sessions)
        ? row.user_potion_sessions[0]
        : row.user_potion_sessions;
      return {
        id: String(row.id),
        potion_type: isRecord(session) ? text(session.potion_type) : null,
        message_instruction: String(row.message_instruction ?? "").trim(),
        local_time_hhmm: String(row.local_time_hhmm ?? "").trim(),
        scheduled_days: stringArray(row.scheduled_days) ?? [],
      };
    }),
    usage_guidance: guidanceForPotion(args.potionType),
  };
}

export function formatPotionBaseContextForPrompt(
  context: PotionBaseContext | null | undefined,
): string {
  if (!context) return "Aucun contexte de base DB charge.";
  return JSON.stringify({
    source: "database",
    scope: context.scope,
    potion_specific_guidance: context.usage_guidance,
    transformation: context.transformation,
    plan_strategy: context.plan_strategy,
    plan_items: context.plan_items,
    prior_potions_same_type: context.prior_potions,
    active_potion_reminders: context.active_potion_reminders,
  }, null, 2);
}
