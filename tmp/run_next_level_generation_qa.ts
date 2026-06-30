const ROOT = new URL("../", import.meta.url);
const SNAPSHOT_PATH = new URL(
  "../tests/real-personas/rose/runs/operations/2026-06-15-adjust-plan-whole-plan-taxonomy-state-owned-r1.snapshot.json",
  import.meta.url,
);
const PERSONA_PATH = new URL("../tests/real-personas/rose/persona.md", import.meta.url);
const OBSERVATIONS_PATH = new URL("../tests/real-personas/rose/observations.md", import.meta.url);
const OUT_DIR = new URL("./next-level-generation-qa/", import.meta.url);

type JsonRecord = Record<string, unknown>;

function loadEnvFile(path: URL) {
  const raw = Deno.readTextFileSync(path).split(/\r?\n/);
  for (const line of raw) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!Deno.env.get(key)) Deno.env.set(key, value);
  }
}

function readJson(path: URL): JsonRecord {
  return JSON.parse(Deno.readTextFileSync(path)) as JsonRecord;
}

function cleanText(value: unknown, max = 4_000): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

function activePlan(snapshot: JsonRecord): JsonRecord {
  const plans = Array.isArray(snapshot.plans) ? snapshot.plans as JsonRecord[] : [];
  return plans.find((plan) => plan.status === "active") ?? plans[0] ?? {};
}

function phaseForCurrent(planContent: JsonRecord): JsonRecord {
  const runtime = planContent.current_level_runtime as JsonRecord;
  const phases = Array.isArray(planContent.phases) ? planContent.phases as JsonRecord[] : [];
  return phases.find((phase) =>
    phase.phase_id === runtime.phase_id ||
    phase.phase_order === runtime.level_order
  ) ?? phases[0] ?? {};
}

function nextBlueprintLevel(planContent: JsonRecord, currentPhase: JsonRecord): JsonRecord {
  const levels = ((planContent.plan_blueprint as JsonRecord | undefined)?.levels ?? []) as JsonRecord[];
  const currentOrder = Number(currentPhase.phase_order ?? 1);
  return levels
    .filter((level) => Number(level.level_order) > currentOrder)
    .sort((left, right) => Number(left.level_order) - Number(right.level_order))[0] ?? {};
}

function futureBlueprintLevels(planContent: JsonRecord, nextLevel: JsonRecord): JsonRecord[] {
  const levels = ((planContent.plan_blueprint as JsonRecord | undefined)?.levels ?? []) as JsonRecord[];
  const nextOrder = Number(nextLevel.level_order ?? 2);
  return levels
    .filter((level) => Number(level.level_order) > nextOrder)
    .sort((left, right) => Number(left.level_order) - Number(right.level_order));
}

function itemTempId(item: JsonRecord): string | null {
  const payload = item.payload as JsonRecord | undefined;
  const generation = payload?._generation as JsonRecord | undefined;
  const tempId = String(generation?.temp_id ?? "").trim();
  return tempId || null;
}

function compactPatch(patch: JsonRecord) {
  const next = patch.next_level as JsonRecord;
  return {
    decision: patch.decision,
    decision_reason: patch.decision_reason,
    title: next?.title,
    objective: next?.phase_objective,
    duration_weeks: next?.duration_weeks,
    metric_target: next?.phase_metric_target,
    heartbeat: next?.heartbeat,
    items: ((next?.items ?? []) as JsonRecord[]).map((item) => ({
      temp_id: item.temp_id,
      dimension: item.dimension,
      kind: item.kind,
      title: item.title,
      target_reps: item.target_reps,
      cadence_label: item.cadence_label,
      scheduled_days: item.scheduled_days,
      time_of_day: item.time_of_day,
    })),
    weeks: ((next?.weeks ?? []) as JsonRecord[]).map((week) => ({
      week_order: week.week_order,
      title: week.title,
      target: week.weekly_target_label,
      assignments: ((week.item_assignments ?? []) as JsonRecord[]).map((assignment) =>
        assignment.temp_id
      ),
      success_signal: week.success_signal,
    })),
    future_blueprint_levels: patch.future_blueprint_levels,
    continuity_notes: patch.continuity_notes,
  };
}

loadEnvFile(new URL("../supabase/.env", import.meta.url));
Deno.env.set("MEGA_TEST_MODE", "0");
Deno.env.set("SOPHIA_LLM_RAW_TRACE_ENABLED", "0");

const {
  buildLevelReviewSchema,
  buildLevelReviewSummary,
  buildNextLevelTransition,
  normalizeLevelReviewAnswers,
} = await import("../supabase/functions/_shared/v2-level-completion.ts");
const { generateNextLevelForPlan } = await import("../supabase/functions/generate-next-level-v1/index.ts");
const { validateNextLevelGenerationPatch } = await import("../supabase/functions/_shared/v2-next-level-generation.ts");

const snapshot = readJson(SNAPSHOT_PATH);
const planRow = activePlan(snapshot);
const planContent = planRow.content as JsonRecord;
const currentRuntime = planContent.current_level_runtime as JsonRecord;
const currentPhase = phaseForCurrent(planContent);
const nextBlueprint = nextBlueprintLevel(planContent, currentPhase);
const futureBlueprint = futureBlueprintLevels(planContent, nextBlueprint);
const planItems = ((snapshot.user_plan_items ?? []) as JsonRecord[])
  .filter((item) => item.plan_id === planRow.id && item.phase_id === currentPhase.phase_id)
  .map((item) => ({
    ...item,
    status: item.status === "pending" ? "completed" : item.status,
    phase_order: currentPhase.phase_order,
  }));
const schema = buildLevelReviewSchema({
  currentLevel: currentRuntime as never,
  items: planItems as never,
  weeks: (currentRuntime.weeks ?? []) as never,
  primaryMetricLabel: ((planContent.primary_metric as JsonRecord | undefined)?.label ?? null) as string | null,
});

const persona = cleanText(Deno.readTextFileSync(PERSONA_PATH), 5_000);
const observations = cleanText(Deno.readTextFileSync(OBSERVATIONS_PATH), 5_000);
const baseTransformationContext = {
  source: "local_qa_fixture_no_db_write",
  persona,
  observations,
  plan_metadata: planContent.metadata ?? null,
  journey_context: planContent.journey_context ?? null,
  user_summary: planContent.user_summary ?? null,
  internal_summary: planContent.internal_summary ?? null,
  situation_context: planContent.situation_context ?? null,
  mechanism_analysis: planContent.mechanism_analysis ?? null,
  key_understanding: planContent.key_understanding ?? null,
};

const cases = [
  {
    id: "keep_coherent",
    answers: {
      global_metric_state: "slight_progress",
      next_plan_coherence: "yes",
      difficulty_signal: "no",
      pride: "J'ai reussi a decaler le premier joint plusieurs soirs, meme si ce n'etait pas parfait.",
    },
  },
  {
    id: "incoherent_next_level",
    answers: {
      global_metric_state: "stable",
      next_plan_coherence: "no",
      coherence_reason:
        "Passer direct a des jours complets sans cannabis me parait trop brutal. Le vrai blocage reste le debut de soiree et l'ennui apres le travail.",
      difficulty_signal: "minor",
      pride: "J'ai au moins range le materiel et je remarque mieux le moment ou l'automatisme arrive.",
    },
  },
  {
    id: "blocking_difficulty",
    answers: {
      global_metric_state: "regressed",
      next_plan_coherence: "mostly",
      difficulty_signal: "blocking",
      difficulty_details:
        "Le sas de decompression a saute quand j'etais stresse. Si la journee etait lourde, je fumais directement en rentrant.",
      pride: "Je vois maintenant que le stress est le declencheur principal, pas juste l'habitude.",
    },
  },
];

await Deno.mkdir(OUT_DIR, { recursive: true });

const results = [];
for (const qaCase of cases) {
  const answers = normalizeLevelReviewAnswers(schema, qaCase.answers);
  const summary = buildLevelReviewSummary({
    items: planItems as never,
    answers,
  });
  const transition = buildNextLevelTransition({
    plan: planContent as never,
    summary,
    currentPhase: currentPhase as never,
  });
  const initialDecisionReason = transition.nextRuntime
    ? transition.preview.reason
    : nextBlueprint
    ? "Le niveau suivant est designé depuis le blueprint futur du plan, avec le bilan de fin de niveau comme signal de calibrage."
    : transition.preview.reason;
  const validationContext = {
    currentLevelOrder: Number(currentPhase.phase_order),
    completedPhaseId: String(currentPhase.phase_id),
    expectedNextBlueprint: nextBlueprint,
    existingCompletedTempIds: planItems.map(itemTempId).filter(Boolean),
    globalObjective: String(planContent.global_objective ?? ""),
  };
  const context = {
    plan: planContent,
    currentLevelRuntime: currentRuntime,
    completedPhase: currentPhase,
    completedLevelItems: planItems,
    nextBlueprintLevel: nextBlueprint,
    futureBlueprintLevels: futureBlueprint,
    reviewSchema: schema,
    answers,
    summary,
    weeklySignals: [
      {
        source: "qa_synthetic_weekly_signal",
        week: 3,
        note: qaCase.id === "keep_coherent"
          ? "Le sas a tenu certains soirs et le user veut continuer."
          : qaCase.id === "incoherent_next_level"
          ? "Le user craint un saut trop rapide vers les jours off."
          : "Le stress fait sauter l'action le soir.",
      },
    ],
    initialDecision: transition.preview.decision,
    initialDecisionReason,
    reviewMode: "user_review",
    transformationContext: baseTransformationContext,
  };

  const patch = await generateNextLevelForPlan({
    requestId: `local-next-level-qa:${qaCase.id}:${Date.now()}`,
    userId: "local-qa-no-db-write",
    context: context as never,
    validationContext: validationContext as never,
  });
  const validation = validateNextLevelGenerationPatch(patch, validationContext as never);
  const output = {
    id: qaCase.id,
    answers,
    summary,
    transition_preview: transition.preview,
    validation,
    patch,
    compact: compactPatch(patch as unknown as JsonRecord),
  };
  const outPath = new URL(`${qaCase.id}.json`, OUT_DIR);
  await Deno.writeTextFile(outPath, JSON.stringify(output, null, 2));
  results.push({
    id: qaCase.id,
    outPath: outPath.pathname,
    validation,
    compact: output.compact,
  });
}

const summaryPath = new URL("summary.json", OUT_DIR);
await Deno.writeTextFile(summaryPath, JSON.stringify({
  source_snapshot: SNAPSHOT_PATH.pathname,
  generated_at: new Date().toISOString(),
  results,
}, null, 2));

console.log(JSON.stringify({ ok: true, summaryPath: summaryPath.pathname, results }, null, 2));
