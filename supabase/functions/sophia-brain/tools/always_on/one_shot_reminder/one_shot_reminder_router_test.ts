import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { maybeRunOneShotReminderDirectEffect } from "./router.ts";

function fakeSupabase(options?: {
  pending?: Array<{ id: string; scheduled_for: string }>;
  failInsert?: boolean;
  onUpsert?: (row: any) => void;
}) {
  const pending = options?.pending ?? [];
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { timezone: "Europe/Paris", locale: "fr-FR" },
                  }),
                };
              },
            };
          },
        };
      }
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    like() {
                      return {
                        order() {
                          return {
                            limit: async () => ({ data: pending, error: null }),
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        upsert(row: any) {
          options?.onUpsert?.(row);
          return {
            select() {
              return {
                single: async () =>
                  options?.failInsert
                    ? ({ data: null, error: { message: "boom" } })
                    : ({
                      data: {
                        id: "created-1",
                        scheduled_for: row.scheduled_for,
                        event_context: row.event_context,
                      },
                      error: null,
                    }),
              };
            },
          };
        },
        update() {
          return {
            in: async () => ({ error: null }),
          };
        },
      };
    },
  } as any;
}

function turnFrameWithDirectEffect(
  effectType:
    | "create_one_shot_reminder"
    | "cancel_one_shot_reminder"
    | "replace_one_shot_reminder" = "create_one_shot_reminder",
) {
  return {
    turn_id: "t",
    source_message_id: "m",
    user_id: "user-1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [{
      effect_type: effectType,
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {},
    }],
    tool_skill_intents: [],
    flow_opportunity: null,
    skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    } as any,
  } as any;
}

Deno.test("create_with_time_and_instruction_commits_success", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "rappelle-moi demain à 16h05 de fermer le doc",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder"),
  });
  assertEquals(result.status, "success");
  assertEquals(result.committed_effects.length, 1);
  assertEquals(result.executed_tools, ["create_one_shot_reminder"]);
});

Deno.test("create success reply keeps safety context after committed reminder", async () => {
  const turnFrame = turnFrameWithDirectEffect("create_one_shot_reminder");
  turnFrame.safety = { risk_band: "medium", reason_codes: [], evidence: [] };
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message:
      "rappelle-moi dans 30 minutes de vérifier que je reste en sécurité",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame,
  });
  assertEquals(result.status, "success");
  assertEquals(result.reply?.includes("C'est programmé pour"), true);
  assertEquals(
    result.reply?.includes(
      "je te ferai un rappel pour vérifier que je reste en sécurité",
    ),
    true,
  );
  assertEquals(
    result.reply?.includes("garde ce qui peut te blesser hors de portée"),
    true,
  );
});

Deno.test("text_only_create_request_is_ignored_without_structured_direct_effect", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "rappelle-moi demain à 16h05 de fermer le doc",
    now: new Date("2026-05-29T10:00:00.000Z"),
  });
  assertEquals(result.status, "ignored");
  assertEquals(result.committed_effects.length, 0);
  assertEquals(result.executed_tools, []);
});

Deno.test("explicit unique reminder phrasing commits from active handoff exit", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "Un rappel unique demain à 17h pour envoyer mon bilan rapide.",
    now: new Date("2026-06-01T08:00:00.000Z"),
    turnFrame: {
      turn_id: "t",
      source_message_id: "m",
      user_id: "user-1",
      channel: "web",
      safety: { risk_band: "none", reason_codes: [], evidence: [] },
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          raw_text:
            "Un rappel unique demain à 17h pour envoyer mon bilan rapide.",
        },
      }],
      tool_skill_intents: [],
      flow_opportunity: null,
      skill_signals: { entry: {}, lifecycle: {}, exit: {} },
      memory_plan: {
        context_need: "minimal",
        memory_mode: "none",
        context_budget_tier: "tiny",
        targets: [],
        retrieval_policy: "semantic_first",
      },
    } as any,
  });

  assertEquals(result.status, "success");
  assertEquals(result.executed_tools, ["create_one_shot_reminder"]);
  assertEquals(result.committed_effects.length, 1);
});

Deno.test("create uses dispatcher instruction_hint as canonical reminder payload", async () => {
  let writtenRow: any = null;
  const instructionHint =
    "ouvrir le fichier, sans essayer de régler tout le dossier";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row) => {
        writtenRow = row;
      },
    }),
    userId: "user-1",
    message:
      "Alors rappelle-moi dans 25 minutes : ouvrir le fichier, sans essayer de régler tout le dossier.",
    now: new Date("2026-06-13T08:00:00.000Z"),
    turnFrame: {
      ...turnFrameWithDirectEffect("create_one_shot_reminder"),
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          raw_text:
            "rappelle-moi dans 25 minutes : ouvrir le fichier, sans essayer de régler tout le dossier.",
          when_hint: "dans 25 minutes",
          instruction_hint: instructionHint,
        },
      }],
    } as any,
  });

  assertEquals(result.status, "success");
  assertEquals(result.reminder_instruction, instructionHint);
  assertEquals(
    result.committed_effects[0]?.reminder_instruction,
    instructionHint,
  );
  assertEquals(
    writtenRow?.message_payload?.reminder_instruction,
    instructionHint,
  );
  assertEquals(
    writtenRow?.event_context,
    "one_shot_reminder:ouvrir_le_fichier_sans_essayer_de_regler_tout_le_dossier",
  );
});

Deno.test("one-shot exit with demain matin explicit hour commits", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "Non finalement juste demain matin à 9h pour préparer ma semaine.",
    now: new Date("2026-06-01T08:00:00.000Z"),
    turnFrame: {
      turn_id: "t",
      source_message_id: "m",
      user_id: "user-1",
      channel: "web",
      safety: { risk_band: "none", reason_codes: [], evidence: [] },
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          raw_text:
            "Non finalement juste demain matin à 9h pour préparer ma semaine.",
        },
      }],
      tool_skill_intents: [],
      flow_opportunity: null,
      skill_signals: { entry: {}, lifecycle: {}, exit: {} },
      memory_plan: {
        context_need: "minimal",
        memory_mode: "none",
        context_budget_tier: "tiny",
        targets: [],
        retrieval_policy: "semantic_first",
      },
    } as any,
  });

  assertEquals(result.status, "success");
  assertEquals(result.executed_tools, ["create_one_shot_reminder"]);
  assertEquals(result.committed_effects.length, 1);
  assertEquals(result.reminder_instruction, "préparer ma semaine");
});

Deno.test("create_missing_time_blocks", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "rappelle-moi de fermer le doc",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder"),
  });
  assertEquals(result.committed_effects.length, 0);
  assert(result.status === "needs_clarify" || result.status === "ignored");
});

Deno.test("create_missing_time_does_not_reuse_previous_context_commit", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "Rappelle-moi de vérifier le fichier.",
    contextMessages: [
      "Je suis un peu tendu là. Rappelle-moi dans 20 minutes de respirer doucement et de boire un verre d'eau.",
    ],
    now: new Date("2026-06-13T08:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder"),
  });

  assertEquals(result.status, "needs_clarify");
  assertEquals(result.executed_tools, []);
  assertEquals(result.committed_effects, []);
  assertEquals(result.blocked_effects, [{
    type: "create_one_shot_reminder",
    reason_code: "missing_time",
  }]);
});

Deno.test("cancel_no_reminder_no_done_language", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ pending: [] }),
    userId: "user-1",
    message: "annule mon rappel de 16h05",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("cancel_one_shot_reminder"),
  });
  assertEquals(result.committed_effects.length, 0);
  assertEquals(result.status, "no_reminder");
});

Deno.test("no_tool_blocks_create", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "pas d'outil, rappelle-moi demain à 16h05 de fermer le doc",
    noMutationRequested: true,
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder"),
  });
  assertEquals(result.committed_effects.length, 0);
  assertEquals(result.status, "blocked");
});

Deno.test("legacy_tool_not_used_by_prod_runtime", async () => {
  const files = [
    "supabase/functions/sophia-brain/router/run.ts",
    "supabase/functions/sophia-brain/router/turn_intent_arbitrator.ts",
    "supabase/functions/sophia-brain/agents/companion.ts",
  ];
  for (const file of files) {
    const text = await Deno.readTextFile(file);
    assert(!text.includes("one_shot_reminder_tool.ts"), file);
  }
});
