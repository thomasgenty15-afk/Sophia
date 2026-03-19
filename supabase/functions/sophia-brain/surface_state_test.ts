import { buildSurfaceRuntimeDecision } from "./surface_state.ts";
import type {
  DispatcherMemoryPlan,
  DispatcherSignals,
  DispatcherSurfacePlan,
} from "./router/dispatcher.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg ? `${msg} - ` : ""}expected ${JSON.stringify(expected)} but got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

const BASE_SIGNALS: DispatcherSignals = {
  safety: { level: "NONE", confidence: 0.9 },
  interrupt: { kind: "NONE", confidence: 0.9 },
  needs_explanation: { value: false, confidence: 0.9 },
  needs_research: { value: false, confidence: 0.9 },
  checkup_intent: { detected: false, confidence: 0.5 },
  create_action: { detected: false },
  update_action: { detected: false },
  breakdown_action: { detected: false },
  track_progress_action: { detected: false, status_hint: "unknown" },
  track_progress_vital_sign: { detected: false },
  track_progress_north_star: { detected: false },
  action_discussion: { detected: false },
  activate_action: { detected: false },
  delete_action: { detected: false },
  deactivate_action: { detected: false },
  dashboard_preferences_intent: { detected: false, confidence: 0.5 },
  dashboard_recurring_reminder_intent: { detected: false, confidence: 0.5 },
  risk_score: 0,
};

function buildPlan(
  surface_id: DispatcherSurfacePlan["candidates"][number]["surface_id"],
  overrides?: Partial<DispatcherSurfacePlan["candidates"][number]>,
  planOverrides?: Partial<DispatcherSurfacePlan>,
): DispatcherSurfacePlan {
  return {
    surface_mode: "guided",
    planning_horizon: "watch_next_turns",
    plan_confidence: 0.9,
    candidates: [
      {
        surface_id,
        opportunity_type: "support",
        confidence: 0.82,
        suggested_level: 2,
        reason: "signal pertinent",
        evidence_window: "current_turn",
        persistence_horizon: "3_turns",
        cta_style: "soft",
        content_need: "light",
        ...overrides,
      },
    ],
    ...planOverrides,
  };
}

function buildMemoryPlan(
  overrides?: Partial<DispatcherMemoryPlan>,
): DispatcherMemoryPlan {
  return {
    response_intent: "support",
    reasoning_complexity: "medium",
    context_need: "targeted",
    memory_mode: "targeted",
    model_tier_hint: "standard",
    context_budget_tier: "medium",
    targets: [],
    plan_confidence: 0.9,
    ...overrides,
  };
}

Deno.test("buildSurfaceRuntimeDecision: repeated relevant turns can keep the same surface only with explicit follow-up", () => {
  const tempMemory: any = {};

  const turn1 = buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("dashboard.north_star", {
      suggested_level: 2,
      reason: "Le user parle de cap",
      opportunity_type: "identity",
    }),
    dispatcherSignals: BASE_SIGNALS,
    userMessage: "Je ne sais plus où je vais en ce moment",
    targetMode: "companion",
    nowIso: "2026-03-18T10:00:00.000Z",
  });

  assertEquals(turn1.addon?.surface_id, "dashboard.north_star");
  assert(turn1.addon!.level >= 2, "turn1 should surface lightly");

  const turn2 = buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("dashboard.north_star", {
      suggested_level: 3,
      reason: "Le sujet de direction persiste",
      opportunity_type: "identity",
      evidence_window: "both",
    }),
    dispatcherSignals: BASE_SIGNALS,
    userMessage: "Oui, je veux vraiment qu'on travaille mon étoile polaire",
    targetMode: "companion",
    nowIso: "2026-03-18T10:01:00.000Z",
  });

  assertEquals(turn2.addon?.surface_id, "dashboard.north_star");
  assert(
    Number(turn2.addon?.level ?? 0) >= Number(turn1.addon?.level ?? 0),
    "surface level should not go down on repeated relevance",
  );
});

Deno.test("buildSurfaceRuntimeDecision: explicit dashboard reminder intent suppresses generic reminder push", () => {
  const tempMemory: any = {};
  const signals: DispatcherSignals = {
    ...BASE_SIGNALS,
    dashboard_recurring_reminder_intent: {
      detected: true,
      confidence: 0.91,
      reminder_fields: ["time"],
    },
  };

  const decision = buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("dashboard.reminders", {
      suggested_level: 4,
      reason: "Le user veut un rappel planifié",
      opportunity_type: "activation",
      cta_style: "direct",
    }),
    dispatcherSignals: signals,
    userMessage: "Fais-moi un rappel demain matin",
    targetMode: "companion",
    nowIso: "2026-03-18T10:02:00.000Z",
  });

  assertEquals(decision.addon, undefined);
});

Deno.test("buildSurfaceRuntimeDecision: direct mention can trigger a stronger content surface", () => {
  const tempMemory: any = {};
  const decision = buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("architect.reflections", {
      suggested_level: 3,
      reason: "Le user veut structurer une idée",
      opportunity_type: "reflection",
      content_need: "ranked",
      content_query_hint: "sabotage discipline",
    }),
    dispatcherSignals: BASE_SIGNALS,
    userMessage: "J'ai une réflexion sur pourquoi on sabote notre discipline",
    targetMode: "companion",
    nowIso: "2026-03-18T10:03:00.000Z",
  });

  assertEquals(decision.addon?.surface_id, "architect.reflections");
  assert(
    Number(decision.addon?.level ?? 0) >= 4,
    "directly named reflection should reach a strong level",
  );
});

Deno.test("buildSurfaceRuntimeDecision: generic short ok after a light mention does not count as acceptance", () => {
  const tempMemory: any = {};

  buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("dashboard.north_star", {
      suggested_level: 2,
      reason: "Cap évoqué légèrement",
      opportunity_type: "identity",
    }),
    dispatcherSignals: BASE_SIGNALS,
    userMessage: "Je suis un peu perdu sur ma direction",
    targetMode: "companion",
    nowIso: "2026-03-18T10:10:00.000Z",
  });

  const turn2 = buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("dashboard.north_star", {
      suggested_level: 3,
      reason: "Le thème continue",
      opportunity_type: "identity",
    }),
    dispatcherSignals: BASE_SIGNALS,
    userMessage: "ok",
    targetMode: "companion",
    nowIso: "2026-03-18T10:11:00.000Z",
  });

  assertEquals(turn2.addon, undefined);
  assertEquals(
    turn2.state.entries["dashboard.north_star"]?.accepted_count ?? 0,
    0,
  );
});

Deno.test("buildSurfaceRuntimeDecision: low confidence surface plan is fully ignored", () => {
  const tempMemory: any = {};
  const decision = buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("architect.reflections", {
      suggested_level: 4,
      reason: "Signal trop faible",
      content_need: "ranked",
    }, {
      surface_mode: "guided",
      plan_confidence: 0.52,
    }),
    dispatcherSignals: BASE_SIGNALS,
    userMessage: "J'ai une idée",
    targetMode: "companion",
    nowIso: "2026-03-18T10:12:00.000Z",
  });

  assertEquals(decision.addon, undefined);
});

Deno.test("buildSurfaceRuntimeDecision: inventory dossier suppresses unrelated surface push", () => {
  const tempMemory: any = {};
  const decision = buildSurfaceRuntimeDecision({
    tempMemory,
    memoryPlan: buildMemoryPlan({
      response_intent: "inventory",
      context_need: "dossier",
      memory_mode: "dossier",
      targets: [
        {
          type: "global_theme",
          key: "psychologie",
          priority: "high",
          retrieval_policy: "force_taxonomy",
          expansion_policy: "expand_theme_subthemes",
        },
      ],
    }),
    surfacePlan: buildPlan("dashboard.north_star", {
      suggested_level: 4,
      reason: "Le user parle de cap",
      opportunity_type: "identity",
      cta_style: "direct",
    }),
    dispatcherSignals: BASE_SIGNALS,
    userMessage: "Qu'est-ce que tu sais sur ma psychologie ?",
    targetMode: "companion",
    nowIso: "2026-03-18T10:13:00.000Z",
  });

  assertEquals(decision.addon, undefined);
});

Deno.test("buildSurfaceRuntimeDecision: explicit dashboard intent suppresses unrelated opportunistic surface", () => {
  const tempMemory: any = {};
  const signals: DispatcherSignals = {
    ...BASE_SIGNALS,
    create_action: { detected: true },
  };

  const decision = buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("dashboard.north_star", {
      suggested_level: 4,
      reason: "Le user cherche un cap",
      opportunity_type: "identity",
      cta_style: "direct",
    }),
    dispatcherSignals: signals,
    userMessage: "Aide-moi à créer une action pour aller courir",
    targetMode: "companion",
    nowIso: "2026-03-18T10:14:00.000Z",
  });

  assertEquals(decision.addon, undefined);
});

Deno.test("buildSurfaceRuntimeDecision: does not alternate to another surface on the next turn without explicit mention", () => {
  const tempMemory: any = {};

  const turn1 = buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("dashboard.north_star", {
      suggested_level: 4,
      reason: "Perte de cap explicite",
      opportunity_type: "identity",
      cta_style: "direct",
    }),
    dispatcherSignals: BASE_SIGNALS,
    userMessage: "Je crois que j'ai besoin d'une étoile polaire",
    targetMode: "companion",
    nowIso: "2026-03-18T10:15:00.000Z",
  });

  assertEquals(turn1.addon?.surface_id, "dashboard.north_star");

  const turn2 = buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("architect.wishlist", {
      suggested_level: 4,
      reason: "Le user évoque ce qui l'attire",
      opportunity_type: "identity",
      cta_style: "direct",
    }),
    dispatcherSignals: BASE_SIGNALS,
    userMessage: "Je me sens encore un peu perdu",
    targetMode: "companion",
    nowIso: "2026-03-18T10:16:00.000Z",
  });

  assertEquals(turn2.addon, undefined);
});

Deno.test("buildSurfaceRuntimeDecision: strong visible push can be explicitly ignored and enters cooldown", () => {
  const tempMemory: any = {};

  const turn1 = buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("dashboard.reminders", {
      suggested_level: 4,
      reason: "Le user veut un vrai rappel proactif",
      opportunity_type: "activation",
      cta_style: "direct",
    }),
    dispatcherSignals: BASE_SIGNALS,
    userMessage: "Je veux des rendez-vous pour que tu me relances",
    targetMode: "companion",
    nowIso: "2026-03-18T10:17:00.000Z",
  });

  assertEquals(turn1.addon?.surface_id, "dashboard.reminders");
  assert((turn1.addon?.level ?? 0) >= 4, "first turn should be a strong surface");

  const turn2 = buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("dashboard.reminders", {
      suggested_level: 4,
      reason: "Le besoin existe encore",
      opportunity_type: "activation",
      cta_style: "direct",
    }),
    dispatcherSignals: BASE_SIGNALS,
    userMessage: "pas maintenant",
    targetMode: "companion",
    nowIso: "2026-03-18T10:18:00.000Z",
  });

  assertEquals(turn2.addon, undefined);
  assertEquals(turn2.state.entries["dashboard.reminders"]?.ignored_count ?? 0, 1);
  assert(
    Number(turn2.state.entries["dashboard.reminders"]?.cooldown_turns_remaining ?? 0) >= 2,
    "ignored strong surface should trigger cooldown",
  );
});

Deno.test("buildSurfaceRuntimeDecision: runtime normalizes CTA and content to the effective level", () => {
  const tempMemory: any = {};

  const decision = buildSurfaceRuntimeDecision({
    tempMemory,
    surfacePlan: buildPlan("architect.reflections", {
      suggested_level: 4,
      reason: "Le user veut structurer une réflexion",
      opportunity_type: "reflection",
      cta_style: "direct",
      content_need: "full",
      content_query_hint: "discipline sabotage",
    }, {
      surface_mode: "opportunistic",
      plan_confidence: 0.9,
    }),
    dispatcherSignals: BASE_SIGNALS,
    userMessage: "J'ai une réflexion sur le sabotage de la discipline",
    targetMode: "companion",
    nowIso: "2026-03-18T10:19:00.000Z",
  });

  assertEquals(decision.addon?.surface_id, "architect.reflections");
  assertEquals(decision.addon?.level, 3);
  assertEquals(decision.addon?.cta_style, "soft");
  assertEquals(decision.addon?.content_need, "light");
});
