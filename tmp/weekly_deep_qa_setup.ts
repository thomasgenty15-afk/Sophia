import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  buildWeeklyProgressReviewGrounding,
  currentWeekStartForTimezone,
  loadWeeklyProgressReview,
  weekEndForWeekStart,
} from "../supabase/functions/_shared/weekly_progress_review.ts";
import {
  buildWeeklyAdaptiveReview,
  buildWeeklyAdaptiveReviewGrounding,
  buildWeeklyAdaptiveReviewInstruction,
  buildWeeklyAdaptiveReviewIntroMessage,
} from "../supabase/functions/_shared/weekly_adaptive_review.ts";

type VariantKey =
  | "all_habits_done_mission_missed"
  | "partial_habits_mission_partial"
  | "none_done"
  | "no_signal"
  | "not_relevant_level_review";

type OccurrenceSpec = {
  itemKey: "habit_positive" | "habit_breath" | "mission_signal";
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  outcome: "completed" | "partial" | "missed" | "none";
  reasonCategory: string | null;
  reasonText: string | null;
  stillRelevant: boolean | null;
  rescheduleDecision: string | null;
};

const root = new TextDecoder().decode(
  new Deno.Command("git", {
    args: ["rev-parse", "--show-toplevel"],
    stdout: "piped",
  }).outputSync().stdout,
).trim();

const runRoot = `${root}/tmp/weekly-real-conversation-qa`;
const connectionRoot = `${runRoot}/connections`;
const timezone = "Europe/Paris";
const password = "1234567";

function argValue(name: string, fallback = ""): string {
  const prefixed = `--${name}=`;
  const direct = Deno.args.find((arg) => arg.startsWith(prefixed));
  if (direct) return direct.slice(prefixed.length);
  const index = Deno.args.indexOf(`--${name}`);
  if (index >= 0) return Deno.args[index + 1] ?? fallback;
  return fallback;
}

function safeRunPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 80);
}

function ymdAdd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function dayOffset(day: OccurrenceSpec["day"]): number {
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].indexOf(day);
}

function statusForOutcome(outcome: OccurrenceSpec["outcome"]): string {
  if (outcome === "completed") return "done";
  if (outcome === "missed") return "missed";
  return "planned";
}

async function writeJson(path: string, value: unknown) {
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function loadSupabaseStatus(): Record<string, string> {
  const envText = [
    `${root}/frontend/.env.local`,
    `${root}/supabase/.env`,
  ].map((path) => {
    try {
      return Deno.readTextFileSync(path);
    } catch {
      return "";
    }
  }).join("\n");
  const env: Record<string, string> = {};
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return {
    API_URL: env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ??
      "http://127.0.0.1:54321",
    ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? "",
    SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    SECRET_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
}

async function must<T>(
  label: string,
  promise: PromiseLike<{ data: T; error: unknown }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${JSON.stringify(error)}`);
  return data;
}

function variantSpecs(variant: VariantKey): OccurrenceSpec[] {
  const completed = (
    itemKey: OccurrenceSpec["itemKey"],
    day: OccurrenceSpec["day"],
  ): OccurrenceSpec => ({
    itemKey,
    day,
    outcome: "completed",
    reasonCategory: "none",
    reasonText: "fait comme prevu",
    stillRelevant: true,
    rescheduleDecision: "none",
  });
  const missed = (
    itemKey: OccurrenceSpec["itemKey"],
    day: OccurrenceSpec["day"],
    reasonCategory: string,
    reasonText: string,
    stillRelevant = true,
  ): OccurrenceSpec => ({
    itemKey,
    day,
    outcome: "missed",
    reasonCategory,
    reasonText,
    stillRelevant,
    rescheduleDecision: stillRelevant ? "carry_over" : "drop",
  });
  const partial = (
    itemKey: OccurrenceSpec["itemKey"],
    day: OccurrenceSpec["day"],
    reasonCategory: string,
    reasonText: string,
  ): OccurrenceSpec => ({
    itemKey,
    day,
    outcome: "partial",
    reasonCategory,
    reasonText,
    stillRelevant: true,
    rescheduleDecision: "carry_over",
  });
  const noSignal = (
    itemKey: OccurrenceSpec["itemKey"],
    day: OccurrenceSpec["day"],
  ): OccurrenceSpec => ({
    itemKey,
    day,
    outcome: "none",
    reasonCategory: null,
    reasonText: null,
    stillRelevant: null,
    rescheduleDecision: null,
  });

  if (variant === "all_habits_done_mission_missed") {
    return [
      completed("habit_positive", "mon"),
      completed("habit_positive", "wed"),
      completed("habit_positive", "fri"),
      completed("habit_breath", "tue"),
      completed("habit_breath", "thu"),
      missed(
        "mission_signal",
        "fri",
        "context",
        "la discussion avec la personne concernee n'a pas eu lieu",
      ),
    ];
  }
  if (variant === "partial_habits_mission_partial") {
    return [
      completed("habit_positive", "mon"),
      partial(
        "habit_positive",
        "wed",
        "fatigue",
        "j'ai commence mais trop fatigue",
      ),
      missed(
        "habit_positive",
        "fri",
        "too_hard",
        "trop lourd en fin de semaine",
      ),
      completed("habit_breath", "tue"),
      missed("habit_breath", "thu", "fatigue", "j'ai zappe en rentrant tard"),
      partial(
        "mission_signal",
        "fri",
        "context",
        "message brouillon fait mais pas envoye",
      ),
    ];
  }
  if (variant === "none_done") {
    return [
      missed("habit_positive", "mon", "fatigue", "journee trop chargee"),
      missed("habit_positive", "wed", "emotional", "j'etais trop tendu"),
      missed("habit_positive", "fri", "too_hard", "trop gros a faire"),
      missed("habit_breath", "tue", "fatigue", "pas d'energie"),
      missed("habit_breath", "thu", "too_hard", "je n'ai pas trouve le moment"),
      missed(
        "mission_signal",
        "fri",
        "context",
        "pas de fenetre pour en parler",
      ),
    ];
  }
  if (variant === "no_signal") {
    return [
      noSignal("habit_positive", "mon"),
      noSignal("habit_positive", "wed"),
      noSignal("habit_positive", "fri"),
      noSignal("habit_breath", "tue"),
      noSignal("habit_breath", "thu"),
      noSignal("mission_signal", "fri"),
    ];
  }
  return [
    missed(
      "habit_positive",
      "mon",
      "not_relevant",
      "l'action ne colle plus",
      false,
    ),
    missed(
      "habit_positive",
      "wed",
      "not_relevant",
      "ce n'est plus le bon levier",
      false,
    ),
    missed(
      "habit_positive",
      "fri",
      "not_relevant",
      "je ne vois plus l'interet",
      false,
    ),
    missed(
      "habit_breath",
      "tue",
      "not_relevant",
      "ca ne repond pas au vrai probleme",
      false,
    ),
    missed(
      "habit_breath",
      "thu",
      "not_relevant",
      "le niveau semble mal calibre",
      false,
    ),
    missed(
      "mission_signal",
      "fri",
      "not_relevant",
      "la mission n'a plus de sens",
      false,
    ),
  ];
}

async function createAuthUser(admin: any, email: string) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "QA Weekly Deep",
      timezone,
      is_test_persona: true,
      temporary_qa_connection: true,
    },
    app_metadata: {
      is_test_persona: true,
      temporary_qa_connection: true,
    },
  });
  if (created.error) {
    throw new Error(`auth_create_user_failed: ${created.error.message}`);
  }
  const userId = created.data?.user?.id;
  if (!userId) throw new Error("auth_create_user_missing_id");
  return userId;
}

async function setupVariant(args: {
  admin: any;
  authAdmin: any;
  variant: VariantKey;
  runPrefix: string;
  weekStartDate: string;
}) {
  const { admin, authAdmin, variant, runPrefix, weekStartDate } = args;
  const runId = `${safeRunPart(runPrefix)}-${variant}`;
  const email = `qa-weekly-deep-${
    safeRunPart(runPrefix)
  }-${variant}@example.com`;
  const userId = await createAuthUser(authAdmin, email);
  const now = new Date();
  const nowIso = now.toISOString();
  const lastInbound = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const oldOutbound = new Date(now.getTime() - 3 * 60 * 60 * 1000)
    .toISOString();
  const scope = `weekly-deep-${variant}-${safeRunPart(runPrefix)}`;
  const phoneSuffix = Math.floor(Math.random() * 9000000 + 1000000);

  await must(
    "upsert_profile",
    admin.from("profiles").upsert({
      id: userId,
      full_name: "QA Weekly Deep",
      onboarding_completed: true,
      timezone,
      locale: "fr-FR",
      access_tier: "trial",
      whatsapp_opted_in: true,
      whatsapp_bilan_opted_in: true,
      whatsapp_last_inbound_at: lastInbound,
      whatsapp_last_outbound_at: oldOutbound,
      phone_number: `+1555${phoneSuffix}`,
      phone_verified_at: nowIso,
      updated_at: nowIso,
    }, { onConflict: "id" }).select("id").single(),
  );

  const cycleId = crypto.randomUUID();
  const transformationId = crypto.randomUUID();
  const planId = crypto.randomUUID();
  await must(
    "insert_cycle",
    admin.from("user_cycles").insert({
      id: cycleId,
      user_id: userId,
      status: "active",
      raw_intake_text:
        "QA weekly deep fixture: retrouver un rythme plus stable sans surcharger la semaine.",
      intake_language: "fr",
      duration_months: 1,
      version: 1,
      created_at: nowIso,
      updated_at: nowIso,
    }).select("id").single(),
  );
  await must(
    "insert_transformation",
    admin.from("user_transformations").insert({
      id: transformationId,
      cycle_id: cycleId,
      priority_order: 1,
      status: "active",
      title: "Stabiliser le rythme de fin de journee",
      internal_summary: "Fixture QA pour weekly adaptive review.",
      user_summary: "Installer un rythme simple en fin de journee.",
      success_definition:
        "Tenir deux habitudes legeres et une mission de coordination.",
      main_constraint: "Fatigue et charge du soir.",
      activated_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    }).select("id").single(),
  );
  await must(
    "update_cycle_active_transformation",
    admin.from("user_cycles")
      .update({
        active_transformation_id: transformationId,
        updated_at: nowIso,
      })
      .eq("id", cycleId)
      .select("id")
      .single(),
  );
  await must(
    "insert_plan",
    admin.from("user_plans_v2").insert({
      id: planId,
      user_id: userId,
      cycle_id: cycleId,
      transformation_id: transformationId,
      status: "active",
      version: 1,
      title: "Semaine 1 - rythme simple",
      content: {
        source: "weekly_deep_qa_setup",
        week_start_date: weekStartDate,
        note:
          "Plan fixture cree dynamiquement pour tester les branches weekly.",
      },
      activated_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    }).select("id").single(),
  );

  const itemIds = {
    habit_positive: crypto.randomUUID(),
    habit_breath: crypto.randomUUID(),
    mission_signal: crypto.randomUUID(),
    support_context: crypto.randomUUID(),
  };
  const items = [
    {
      id: itemIds.habit_positive,
      dimension: "habits",
      kind: "habit",
      title: "Partager un point positif",
      tracking_type: "boolean",
      target_reps: 3,
      scheduled_days: ["mon", "wed", "fri"],
      cadence_label: "3x/semaine",
      current_habit_state: "active_building",
    },
    {
      id: itemIds.habit_breath,
      dimension: "habits",
      kind: "habit",
      title: "Respiration de pause",
      tracking_type: "boolean",
      target_reps: 2,
      scheduled_days: ["tue", "thu"],
      cadence_label: "2x/semaine",
      current_habit_state: "active_building",
    },
    {
      id: itemIds.mission_signal,
      dimension: "missions",
      kind: "task",
      title: "Convenir d'un signal de pause",
      tracking_type: "milestone",
      target_reps: 1,
      scheduled_days: ["fri"],
      cadence_label: "mission ponctuelle",
      current_habit_state: null,
    },
    {
      id: itemIds.support_context,
      dimension: "support",
      kind: "framework",
      title: "Fiche support: repere de fatigue",
      tracking_type: "text",
      target_reps: null,
      scheduled_days: null,
      cadence_label: null,
      current_habit_state: null,
      support_mode: "always_available",
      support_function: "understanding",
    },
  ];
  await must(
    "insert_plan_items",
    admin.from("user_plan_items").insert(items.map((item, index) => ({
      id: item.id,
      user_id: userId,
      cycle_id: cycleId,
      transformation_id: transformationId,
      plan_id: planId,
      dimension: item.dimension,
      kind: item.kind,
      status: "active",
      title: item.title,
      description: item.title,
      tracking_type: item.tracking_type,
      activation_order: index + 1,
      current_habit_state: item.current_habit_state,
      support_mode: (item as any).support_mode ?? null,
      support_function: (item as any).support_function ?? null,
      target_reps: item.target_reps,
      current_reps: 0,
      cadence_label: item.cadence_label,
      scheduled_days: item.scheduled_days,
      payload: { source: "weekly_deep_qa_setup", variant },
      activated_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    }))).select("id"),
  );

  const confirmedItems = items.filter((item) => item.dimension !== "support");
  await must(
    "insert_week_plans",
    admin.from("user_habit_week_plans").insert(
      confirmedItems.map((item) => ({
        user_id: userId,
        cycle_id: cycleId,
        transformation_id: transformationId,
        plan_id: planId,
        plan_item_id: item.id,
        week_start_date: weekStartDate,
        status: "confirmed",
        confirmed_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })),
    ).select("id"),
  );

  const specs = variantSpecs(variant);
  const occurrenceRows = specs.map((spec, index) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    cycle_id: cycleId,
    transformation_id: transformationId,
    plan_id: planId,
    plan_item_id: itemIds[spec.itemKey],
    week_start_date: weekStartDate,
    ordinal: index + 1,
    default_day: spec.day,
    planned_day: spec.day,
    original_planned_day: spec.day,
    actual_day: spec.outcome === "none" ? null : spec.day,
    status: statusForOutcome(spec.outcome),
    source: "weekly_confirmed",
    validated_at: spec.outcome === "completed" ? nowIso : null,
    created_at: nowIso,
    updated_at: nowIso,
    spec,
  }));
  await must(
    "insert_occurrences",
    admin.from("user_habit_week_occurrences")
      .insert(occurrenceRows.map(({ spec: _spec, ...row }) => row))
      .select("id"),
  );

  const entryRows = occurrenceRows
    .filter((row) => row.spec.outcome !== "none")
    .map((row) => {
      const effectiveDate = ymdAdd(weekStartDate, dayOffset(row.spec.day));
      return {
        user_id: userId,
        cycle_id: cycleId,
        transformation_id: transformationId,
        plan_id: planId,
        plan_item_id: row.plan_item_id,
        entry_kind: "checkin",
        outcome: row.spec.outcome,
        value_text: row.spec.reasonText ?? row.spec.outcome,
        difficulty_level: row.spec.outcome === "completed" ? "low" : "medium",
        blocker_hint: row.spec.reasonCategory,
        effective_at: `${effectiveDate}T12:00:00.000Z`,
        created_at: nowIso,
        metadata: {
          source: "daily_action_review_v1",
          skill_id: "daily_action_review_v1",
          occurrence_id: row.id,
          occurrence_status: row.status,
          reason_category: row.spec.reasonCategory,
          reason_text: row.spec.reasonText,
          matched_user_text: row.spec.reasonText,
          still_relevant: row.spec.stillRelevant,
          reschedule_decision: row.spec.rescheduleDecision,
          confidence: "high",
          outcome_source: "qa_fixture",
        },
      };
    });
  if (entryRows.length > 0) {
    await must(
      "insert_entries",
      admin.from("user_plan_item_entries").insert(entryRows).select("id"),
    );
  }

  const review = await loadWeeklyProgressReview(admin, {
    userId,
    timezone,
    weekStartDate,
    dashboardUrl: "http://localhost:5173/dashboard",
  });
  const adaptiveReview = buildWeeklyAdaptiveReview(review);
  const opening = buildWeeklyAdaptiveReviewIntroMessage(review, adaptiveReview);
  const scheduledCheckinId = crypto.randomUUID();
  const payload = {
    source: "weekly_deep_qa_setup:weekly_adaptive_review_v1",
    weekly_progress_review: review,
    weekly_adaptive_review: adaptiveReview,
    instruction: buildWeeklyAdaptiveReviewInstruction(adaptiveReview),
    event_grounding: `${
      buildWeeklyProgressReviewGrounding(review)
    }\n\nweekly_adaptive_review=${
      buildWeeklyAdaptiveReviewGrounding(adaptiveReview)
    }`,
    chat_capability: "weekly_adaptive_review",
    week_start_date: weekStartDate,
    week_end_date: weekEndForWeekStart(weekStartDate),
  };
  await must(
    "insert_scheduled_checkin",
    admin.from("scheduled_checkins").insert({
      id: scheduledCheckinId,
      user_id: userId,
      event_context: "weekly_progress_review_v2",
      draft_message: opening,
      scheduled_for: nowIso,
      status: "sent",
      processed_at: nowIso,
      message_mode: "dynamic",
      message_payload: payload,
      origin: "weekly_review",
      delivery_attempt_count: 1,
      delivery_last_request_id: `${runId}-setup`,
    }).select("id").single(),
  );
  await must(
    "insert_opening_chat_message",
    admin.from("chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: opening,
      scope,
      metadata: {
        channel: "web",
        source: "weekly_deep_qa_setup",
        scheduled_checkin_id: scheduledCheckinId,
        event_context: "weekly_progress_review_v2",
        weekly_adaptive_review: {
          habit_verdict: adaptiveReview.habit_verdict,
          week_strategy: adaptiveReview.week_strategy,
          question: adaptiveReview.question,
          plan_patch: adaptiveReview.plan_patch,
        },
      },
    }).select("id").single(),
  );
  await must(
    "upsert_chat_state",
    admin.from("user_chat_states").upsert({
      user_id: userId,
      scope,
      current_mode: "companion",
      risk_level: 0,
      short_term_context: `Weekly QA active: ${variant}`,
      last_interaction_at: nowIso,
      updated_at: nowIso,
      temp_memory: {
        __active_skill_state: {
          skill_id: "weekly_adaptive_review_v1",
          status: "active",
          started_at: nowIso,
          scheduled_checkin_id: scheduledCheckinId,
          requires_confirmation: true,
          weekly_progress_review: review,
          weekly_adaptive_review: adaptiveReview,
        },
      },
    }, { onConflict: "user_id,scope" }).select("user_id").single(),
  );

  const connectionPath = `${connectionRoot}/${runId}.json`;
  await writeJson(connectionPath, {
    user_id: userId,
    email,
    password,
    scope,
    persona: "qa-weekly-deep",
    is_temporary_qa_connection: true,
  });

  const setupPath = `${runRoot}/${runId}/setup.json`;
  const summary = {
    run_id: runId,
    variant,
    user_id: userId,
    email,
    password_redacted: true,
    scope,
    connection_file: connectionPath.replace(`${root}/`, ""),
    week_start_date: weekStartDate,
    week_end_date: weekEndForWeekStart(weekStartDate),
    scheduled_checkin_id: scheduledCheckinId,
    opening,
    expected: {
      habit_verdict: adaptiveReview.habit_verdict,
      daily_evidence_summary: adaptiveReview.daily_evidence_summary,
      week_strategy: adaptiveReview.week_strategy,
      question: adaptiveReview.question,
      plan_patch: adaptiveReview.plan_patch,
      item_decisions: adaptiveReview.item_decisions,
      supports_out_of_scope: true,
    },
    review_summary: review.transformations.map((transformation) => ({
      transformation_id: transformation.transformation_id,
      plan_id: transformation.plan_id,
      summary: transformation.summary,
      actions: transformation.actions.map((action) => ({
        title: action.title,
        dimension: action.dimension,
        deviation: action.deviation,
        had_entry: action.had_entry,
        reason_category: action.daily_evidence?.reason_category ?? null,
      })),
    })),
  };
  await writeJson(setupPath, summary);
  return summary;
}

const status = loadSupabaseStatus();
const serviceKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
const authAdminKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
const admin = createClient(status.API_URL, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authAdmin = createClient(status.API_URL, authAdminKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const weekStartDate = argValue(
  "week-start",
  currentWeekStartForTimezone(timezone, new Date()),
);
const requested = argValue(
  "variants",
  "all_habits_done_mission_missed,partial_habits_mission_partial,none_done,no_signal,not_relevant_level_review",
).split(",").map((value) => value.trim()).filter(Boolean) as VariantKey[];
const runPrefix = argValue(
  "run-prefix",
  `weekly-deep-${Date.now().toString(36)}`,
);

await Deno.mkdir(connectionRoot, { recursive: true });
const summaries = [];
for (const variant of requested) {
  summaries.push(
    await setupVariant({ admin, authAdmin, variant, runPrefix, weekStartDate }),
  );
}

console.log(JSON.stringify(
  {
    run_prefix: runPrefix,
    week_start_date: weekStartDate,
    runs: summaries.map((summary) => ({
      run_id: summary.run_id,
      variant: summary.variant,
      user_id: summary.user_id,
      email: summary.email,
      scope: summary.scope,
      connection_file: summary.connection_file,
      setup_file:
        `tmp/weekly-real-conversation-qa/${summary.run_id}/setup.json`,
      opening: summary.opening,
      habit_verdict: summary.expected.habit_verdict.status,
      week_strategy: summary.expected.week_strategy.decision,
      question: summary.expected.question?.id ?? null,
      operations: summary.expected.plan_patch.operations.map((op: any) =>
        op.op
      ),
    })),
  },
  null,
  2,
));
