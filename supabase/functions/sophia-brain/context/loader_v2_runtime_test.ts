import {
  buildContextString,
  formatCurrentWeekPlanContextBlock,
  formatDashboardCapabilitiesAddon,
  formatDashboardCapabilitiesLiteAddon,
  formatPlanItemIndicatorsBlock,
  formatRetractedInSessionBlock,
  formatSessionMemoryIntentsBlock,
  formatWeeklyRecapSnapshot,
} from "./loader.ts";

import type {
  SystemRuntimeSnapshotRow,
  UserPlanItemEntryRow,
  UserPlanItemRow,
} from "../../_shared/v2-types.ts";
import type { PlanItemRuntimeRow } from "../../_shared/v2-runtime.ts";

function assert(cond: unknown, msg?: string) {
  if (!cond) throw new Error(msg ?? "Assertion failed");
}

function baseEntry(
  kind: UserPlanItemEntryRow["entry_kind"],
  day: string,
): UserPlanItemEntryRow {
  const iso = `${day}T12:00:00.000Z`;
  return {
    id: crypto.randomUUID(),
    user_id: "u1",
    cycle_id: "c1",
    transformation_id: "t1",
    plan_id: "p1",
    plan_item_id: "pi1",
    entry_kind: kind,
    outcome: kind,
    value_numeric: null,
    value_text: null,
    difficulty_level: null,
    blocker_hint: null,
    created_at: iso,
    effective_at: iso,
    metadata: {},
  };
}

function basePlanItem(
  overrides: Partial<UserPlanItemRow> = {},
  entries: UserPlanItemEntryRow[] = [],
): PlanItemRuntimeRow {
  return {
    id: "pi1",
    user_id: "u1",
    cycle_id: "c1",
    transformation_id: "t1",
    plan_id: "p1",
    dimension: "habits",
    kind: "habit",
    status: "active",
    title: "Méditation du soir",
    description: null,
    tracking_type: "boolean",
    activation_order: 1,
    activation_condition: null,
    current_habit_state: "active_building",
    support_mode: null,
    support_function: null,
    target_reps: 5,
    current_reps: 2,
    cadence_label: "daily",
    scheduled_days: null,
    time_of_day: null,
    start_after_item_id: null,
    payload: {},
    created_at: "2026-03-20T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
    activated_at: "2026-03-20T08:00:00.000Z",
    completed_at: null,
    last_entry_at: entries[0]?.effective_at ?? null,
    recent_entries: entries,
    ...overrides,
  } as PlanItemRuntimeRow;
}

Deno.test("formatPlanItemIndicatorsBlock: renders V2 plan item indicators", () => {
  const block = formatPlanItemIndicatorsBlock([
    basePlanItem({}, [
      baseEntry("checkin", "2026-03-24"),
      baseEntry("progress", "2026-03-23"),
      baseEntry("skip", "2026-03-22"),
    ]),
  ]);

  assert(block.includes("=== INDICATEURS PLAN ITEMS (V2) ==="));
  assert(block.includes("Méditation du soir"));
  assert(block.includes("[habitudes]"));
  assert(block.includes("streak=2"));
  assert(block.includes("tendance=en hausse"));
});

Deno.test("formatCurrentWeekPlanContextBlock: renders current week actions, validation and execution details", () => {
  const block = formatCurrentWeekPlanContextBlock({
    timezone: "Europe/Paris",
    weekStart: "2026-06-15",
    items: [
      {
        id: "pi-focus",
        dimension: "habits",
        kind: "habit",
        status: "active",
        title: "Session focus courte",
        description: "Faire une session focus sans viser parfait.",
        tracking_type: "boolean",
        activation_order: 1,
        current_habit_state: "active_building",
        target_reps: 4,
        current_reps: 1,
        cadence_label: "4 fois cette semaine",
        scheduled_days: ["mon", "wed", "fri", "sun"],
        time_of_day: "evening",
        payload: { recommended_day: "fri", note: "priorité douce" },
        updated_at: "2026-06-16T09:00:00.000Z",
        activated_at: "2026-06-15T07:00:00.000Z",
      },
    ],
    weekPlans: [
      {
        plan_item_id: "pi-focus",
        week_start_date: "2026-06-15",
        status: "confirmed",
        confirmed_at: "2026-06-16T05:00:00.000Z",
        updated_at: "2026-06-16T05:00:00.000Z",
      },
    ],
    occurrences: [
      {
        plan_item_id: "pi-focus",
        week_start_date: "2026-06-15",
        ordinal: 1,
        planned_day: "fri",
        original_planned_day: "sun",
        actual_day: "fri",
        default_day: "sun",
        status: "planned",
        source: "weekly_confirmed",
        validated_at: "2026-06-16T05:00:00.000Z",
      },
    ],
    entries: [
      {
        plan_item_id: "pi-focus",
        entry_kind: "progress",
        outcome: "done",
        value_text: "Session faite hier",
        difficulty_level: "low",
        blocker_hint: null,
        created_at: "2026-06-16T08:00:00.000Z",
        effective_at: "2026-06-15T19:00:00.000Z",
      },
    ],
  });

  assert(block.includes("=== SEMAINE COURANTE PLAN / ACTIONS (SOURCE DB) ==="));
  assert(block.includes("Semaine locale: 2026-06-15 -> 2026-06-21"));
  assert(block.includes("Session focus courte"));
  assert(block.includes("jours_planifies=vendredi"));
  assert(!block.includes("jours_conseilles="));
  assert(block.includes("validation_semaine: status=confirmed"));
  assert(block.includes("confirmed_at=2026-06-16T05:00:00.000Z"));
  assert(block.includes("vendredi: status=planned"));
  assert(!block.includes("original_day=dimanche"));
  assert(!block.includes("default_day=dimanche"));
  assert(block.includes("entry_kind=progress"));
  assert(block.includes("value_text=Session faite hier"));
});

Deno.test("formatCurrentWeekPlanContextBlock: recap source line + no silent cap on entries (paul-r1 T14)", () => {
  const entries = Array.from({ length: 5 }, (_, index) => ({
    plan_item_id: "pi-move",
    entry_kind: "checkin",
    outcome: index === 0 ? "missed" : "completed",
    value_text: null,
    difficulty_level: null,
    blocker_hint: null,
    created_at: `2026-06-1${6 + (index % 3)}T08:0${index}:00.000Z`,
    effective_at: `2026-06-1${5 + (index % 4)}T19:0${index}:00.000Z`,
  }));
  const block = formatCurrentWeekPlanContextBlock({
    timezone: "Europe/Paris",
    weekStart: "2026-06-15",
    items: [{
      id: "pi-move",
      dimension: "habits",
      kind: "habit",
      status: "active",
      title: "Faire 10 min de mouvement",
      tracking_type: "boolean",
      target_reps: 5,
      current_reps: 4,
    }],
    weekPlans: [],
    occurrences: [],
    entries,
  });

  // Le recap « où j'en suis » doit être servi par ce bloc, sans excuse de
  // liste manquante.
  assert(block.includes("executions_semaine"));
  assert(
    block.includes(
      "ne dis jamais que la liste des séances faites te manque",
    ),
  );
  // 5 entries, 3 détaillées: la troncature est annoncée, jamais silencieuse.
  assert(block.includes("(+2 autre(s) execution(s) cette semaine"));

  // Anti-faux-positif: 3 entries ou moins => aucune mention de troncature.
  const smallBlock = formatCurrentWeekPlanContextBlock({
    timezone: "Europe/Paris",
    weekStart: "2026-06-15",
    items: [{
      id: "pi-move",
      dimension: "habits",
      kind: "habit",
      status: "active",
      title: "Faire 10 min de mouvement",
      tracking_type: "boolean",
      target_reps: 5,
      current_reps: 2,
    }],
    weekPlans: [],
    occurrences: [],
    entries: entries.slice(0, 2),
  });
  assert(!smallBlock.includes("autre(s) execution(s)"));
});

Deno.test("formatWeeklyRecapSnapshot: extracts summary from V2 runtime snapshot", () => {
  const snapshot: Pick<
    SystemRuntimeSnapshotRow,
    "snapshot_type" | "payload" | "created_at"
  > = {
    snapshot_type: "weekly_bilan_completed_v2",
    created_at: "2026-03-24T18:00:00.000Z",
    payload: {
      user_id: "u1",
      cycle_id: "c1",
      transformation_id: "t1",
      metadata: {
        week_start: "2026-03-16",
        decision: "consolidate",
        output: {
          decision: "consolidate",
          suggested_posture_next_week: "focus_today",
          coaching_note: "On garde moins d'items, mais mieux tenus.",
          load_adjustments: [{ id: "adj-1" }, { id: "adj-2" }],
        },
      },
    },
  };

  const block = formatWeeklyRecapSnapshot(snapshot);

  assert(block !== null, "expected a formatted weekly recap");
  assert(block?.includes("Semaine: 2026-03-16"));
  assert(block?.includes("Décision: consolidate"));
  assert(block?.includes("Ajustements retenus: 2"));
  assert(block?.includes("On garde moins d'items, mais mieux tenus."));
});

Deno.test("dashboard capability addons: describe V2 surfaces instead of old V1 sections", () => {
  const lite = formatDashboardCapabilitiesLiteAddon();
  const full = formatDashboardCapabilitiesAddon({
    intents: ["plan_item_discussion"],
  });

  assert(lite.includes("Plan: actions, missions, habitudes"));
  assert(lite.includes("Ressources: cartes d'attaque"));
  assert(lite.includes("Inspirations: contenus"));
  assert(lite.includes("Initiatives: messages récurrents"));
  assert(!lite.includes("Sections dimensions: Soutien, Missions, Habitudes"));
  assert(!lite.includes("Construction du Temple"));
  assert(full.includes("Plan: pour actions, missions, habitudes"));
  assert(full.includes("Ressources: pour cartes d'attaque"));
  assert(full.includes("Initiatives: pour planifier un message récurrent"));
  assert(!full.includes("Mission cards"));
  assert(!full.includes("Actions Personnelles"));
});

Deno.test("buildContextString: plan item indicators block is injected", () => {
  const ctx = buildContextString({
    planItemIndicators: "=== INDICATEURS PLAN ITEMS (V2) ===\nBLOCK\n",
  });

  assert(ctx.includes("=== INDICATEURS PLAN ITEMS (V2) ==="));
  assert(ctx.includes("BLOCK"));
});

Deno.test("buildContextString: current week plan context is injected before indicators", () => {
  const ctx = buildContextString({
    currentWeekPlanContext:
      "=== SEMAINE COURANTE PLAN / ACTIONS (SOURCE DB) ===\nWEEK\n",
    planItemIndicators: "=== INDICATEURS PLAN ITEMS (V2) ===\nINDICATORS\n",
  });

  const weekIndex = ctx.indexOf("WEEK");
  const indicatorsIndex = ctx.indexOf("INDICATORS");
  assert(weekIndex >= 0);
  assert(indicatorsIndex >= 0);
  assert(weekIndex < indicatorsIndex);
});

Deno.test("P12-E (alex-untested24 R1-B11): session memory intents block carries un-batched confided facts", () => {
  const block = formatSessionMemoryIntentsBlock(
    {
      __session_memory_intents: [
        {
          text:
            "garde ça en tête : je prépare un déménagement à Lyon pour septembre",
        },
        { text: "retiens que je fais de la poterie le jeudi" },
      ],
    },
    [],
  );
  assert(block, "expected a session intents block");
  assert(block!.includes("CONFIÉ EN SESSION (pas encore en mémoire longue)"));
  assert(block!.includes("déménagement à Lyon"));
  assert(block!.includes("poterie"));
});

Deno.test("P12-E anti-faux-positif: a confided-then-retracted intent is NEVER served by the session block", () => {
  const block = formatSessionMemoryIntentsBlock(
    {
      __session_memory_intents: [
        {
          text:
            "garde ça en tête : je prépare un déménagement à Lyon pour septembre",
        },
        { text: "retiens que je fais de la poterie le jeudi" },
      ],
    },
    [
      {
        role: "user",
        content:
          "garde ça en tête : je prépare un déménagement à Lyon pour septembre",
      },
      { role: "assistant", content: "C'est noté !" },
      {
        role: "user",
        content: "en fait oublie ce que je t'ai dit sur le déménagement",
      },
    ],
  );
  assert(block, "expected a block (poterie intent survives)");
  assert(!block!.includes("déménagement"), "retracted intent must be excluded");
  assert(block!.includes("poterie"));
  // Toutes les intentions rétractées ⇒ aucun bloc du tout.
  const empty = formatSessionMemoryIntentsBlock(
    {
      __session_memory_intents: [
        {
          text:
            "garde ça en tête : je prépare un déménagement à Lyon pour septembre",
        },
      ],
    },
    [
      {
        role: "user",
        content: "oublie ce que je t'ai dit sur le déménagement à Lyon",
      },
    ],
  );
  assert(empty === null);
});

Deno.test("P12-E (eva-hard25 R1-B05): retracted-in-session block forbids spontaneous MENTION of the topic, not only restitution", () => {
  const block = formatRetractedInSessionBlock([
    {
      role: "user",
      content:
        "je me suis mise à la céramique, je voulais t'en parler. ah non, oublie ça en fait.",
    },
  ]);
  assert(block, "expected a retracted block");
  assert(
    block!.includes("INTERDIT DE RESTITUTION ET DE MENTION SPONTANÉE"),
    "reinforced header missing",
  );
  assert(
    block!.includes("n'en parle que si l'utilisateur rouvre lui-même le sujet"),
    "reopen-only clause missing",
  );
});

Deno.test("P12-E: buildContextString places session intents before the retracted block, both present", () => {
  const ctx = buildContextString({
    sessionMemoryIntents:
      "=== CONFIÉ EN SESSION (pas encore en mémoire longue) ===\nINTENTS\n\n",
    retractedInSession:
      "=== RÉTRACTÉ EN SESSION (INTERDIT DE RESTITUTION ET DE MENTION SPONTANÉE) ===\nRETRACTED\n\n",
  });
  const intentsIndex = ctx.indexOf("INTENTS");
  const retractedIndex = ctx.indexOf("RETRACTED");
  assert(intentsIndex >= 0);
  assert(retractedIndex >= 0);
  assert(intentsIndex < retractedIndex);
});
