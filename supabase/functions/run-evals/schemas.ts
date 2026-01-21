import { z } from "../_shared/http.ts";

export const ScenarioSchema = z
  .object({
    dataset_key: z.string().min(1),
    id: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    steps: z.array(z.object({
      user: z.string().min(1),
      // Optional: simulate a "double text" (burst) by sending this step and the next in quick succession.
      // Used to trigger Router debounce/burst merge behavior.
      burst_delay_ms: z.number().int().min(1).max(20_000).optional(),
      // Optional: simulate a multi-message burst (3+ messages) by providing additional user messages
      // that will be sent shortly after this step (while the first is still within debounce wait).
      // Example: step.user (msg1) + burst_group[0] (msg2) + burst_group[1] (msg3).
      burst_group: z.array(z.string().min(1)).min(1).max(8).optional(),
    })).optional(),
    persona: z.any().optional(),
    objectives: z.array(z.any()).optional(),
    suggested_replies: z.array(z.string().min(1)).max(10).optional(),
    max_turns: z.number().int().min(1).max(50).optional(),
    assertions: z.any().optional(),
  })
  .passthrough();

export const BodySchema = z.object({
  scenarios: z.array(ScenarioSchema).min(1).max(50),
  limits: z
    .object({
      max_scenarios: z.number().int().min(1).max(50).default(10),
      max_turns_per_scenario: z.number().int().min(1).max(50).default(8),
      // When running bilan/investigator scenarios, seed a plan with N active actions,
      // and optionally generate an investigation_state matching them.
      bilan_actions_count: z.number().int().min(0).max(20).default(0),
      // NEW: Enable testing of post-checkup deferrals.
      // If true: the user simulator will be instructed to say "on en reparle après" or similar
      // during the bilan, and the runner will NOT stop at the end of the bilan, but wait for the parking lot to clear.
      test_post_checkup_deferral: z.boolean().default(false),
      user_difficulty: z.enum(["easy", "mid", "hard"]).default("mid"),
      stop_on_first_failure: z.boolean().default(false),
      // cost control is currently an estimate; default is safe.
      budget_usd: z.number().min(0).default(0),
      // Always real AI: conversation + user simulation + judge.
      use_real_ai: z.boolean().default(true),
      // Whether eval-judge should use the (slow/expensive) LLM judge.
      // Prod-faithful evals should keep this ON by default (we want real judge feedback).
      judge_force_real_ai: z.boolean().default(true),
      // If true, do not emit issues/suggestions automatically; manual qualitative judging is done externally.
      manual_judge: z.boolean().default(false),
      // If true, run eval-judge async (enqueued) instead of inline. Default false for local dev determinism.
      judge_async: z.boolean().default(false),
      // NEW: Use a pre-generated plan bank (stored in DB) instead of calling generate-plan (Gemini) during evals.
      // This reduces latency + cost by reusing real plans generated offline.
      use_pre_generated_plans: z.boolean().default(false),
      // Optional: constrain plan pick to a specific theme key (ex: "ENERGY", "SLEEP"...).
      // If omitted, any theme in the bank can be used.
      plan_bank_theme_key: z.string().optional(),
      // If true and the plan bank is empty/unavailable, fail early instead of falling back to live generation.
      pre_generated_plans_required: z.boolean().default(false),
      // If true, do NOT delete the ephemeral test auth user at the end of the scenario.
      // Useful when you want to manually verify DB writes after a tool test.
      keep_test_user: z.boolean().default(false),
      model: z.string().optional(),
      // Runner-only: stable request id across chunked run-evals calls (resume on wall-clock kills).
      _run_request_id: z.string().optional(),
      // Runner-only: keep each run-evals request under edge-runtime wall clock limits.
      max_wall_clock_ms_per_request: z.number().int().min(30_000).max(900_000).optional(),
    })
    // Important: do NOT strip unknown flags from the runner (keeps forward compatibility).
    .passthrough()
    .default({
      max_scenarios: 10,
      max_turns_per_scenario: 8,
      bilan_actions_count: 0,
      user_difficulty: "mid",
      stop_on_first_failure: false,
      budget_usd: 0,
      use_real_ai: true,
      judge_force_real_ai: true,
      manual_judge: false,
      judge_async: false,
      use_pre_generated_plans: false,
      pre_generated_plans_required: false,
      keep_test_user: false,
    }),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type RunEvalsBody = z.infer<typeof BodySchema>;



