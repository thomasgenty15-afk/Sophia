import { z } from "../_shared/http.ts";

export const ScenarioSchema = z
  .object({
    dataset_key: z.string().min(1),
    id: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    steps: z.array(z.object({ user: z.string().min(1) })).optional(),
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
      model: z.string().optional(),
    })
    .default({
      max_scenarios: 10,
      max_turns_per_scenario: 8,
      bilan_actions_count: 0,
      user_difficulty: "mid",
      stop_on_first_failure: false,
      budget_usd: 0,
      use_real_ai: true,
      judge_force_real_ai: true,
    }),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type RunEvalsBody = z.infer<typeof BodySchema>;


