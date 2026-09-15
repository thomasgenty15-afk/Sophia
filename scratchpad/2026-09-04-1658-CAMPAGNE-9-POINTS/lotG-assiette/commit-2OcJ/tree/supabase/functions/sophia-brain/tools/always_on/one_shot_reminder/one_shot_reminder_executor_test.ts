import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildOneShotReminderMessagePayload,
  executeOneShotReminderEffects,
} from "./executor.ts";

function fakeSupabase() {
  return {
    from(table: string) {
      return {
        upsert(row: any) {
          assertEquals(table, "scheduled_checkins");
          return {
            select() {
              return {
                single: async () => ({
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
        update(vals: any) {
          assertEquals(vals, { status: "cancelled" });
          return {
            in(_col: string, ids: string[]) {
              return {
                eq() {
                  return {
                    select: async () => ({
                      data: ids.map((id) => ({
                        id,
                        scheduled_for: "2026-05-29T14:05:00.000Z",
                      })),
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  } as any;
}

function fakeSupabaseWithExistingOneShot(existing: any) {
  let upsertCount = 0;
  return {
    client: {
      from(table: string) {
        assertEquals(table, "scheduled_checkins");
        return {
          select() {
            const query = {
              eq() {
                return query;
              },
              limit() {
                return {
                  maybeSingle: async () => ({ data: existing, error: null }),
                };
              },
            };
            return query;
          },
          upsert(row: any) {
            upsertCount += 1;
            return {
              select() {
                return {
                  single: async () => ({
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
    } as any,
    upsertCount: () => upsertCount,
  };
}

Deno.test("create_with_time_and_instruction_commits", async () => {
  const result = await executeOneShotReminderEffects({
    supabase: fakeSupabase(),
    userId: "user-1",
    effect_plan: {
      requested_effects: [],
      allowed_effects: [{
        type: "create_one_shot_reminder",
        scheduled_for: "2026-05-29T14:05:00.000Z",
        local_label: "vendredi 29 mai à 16:05",
        reminder_instruction: "fermer le doc",
      }],
      blocked_effects: [],
      reason_code: "ready",
    },
  });
  assertEquals(result.committed_effects.length, 1);
  assertEquals(result.committed_effects[0].id, "created-1");
});

Deno.test("create_with_same_source_message_reuses_existing_row_before_upsert", async () => {
  const fake = fakeSupabaseWithExistingOneShot({
    id: "existing-1",
    scheduled_for: "2026-05-29T14:05:00.000Z",
    event_context: "one_shot_reminder:fermer_le_doc",
  });
  const result = await executeOneShotReminderEffects({
    supabase: fake.client,
    userId: "user-1",
    sourceMessageId: "message-1",
    effect_plan: {
      requested_effects: [],
      allowed_effects: [{
        type: "create_one_shot_reminder",
        scheduled_for: "2026-05-29T14:05:00.042Z",
        local_label: "vendredi 29 mai à 16:05",
        reminder_instruction: "fermer le doc",
      }],
      blocked_effects: [],
      reason_code: "ready",
    },
  });
  assertEquals(result.committed_effects[0].id, "existing-1");
  assertEquals(fake.upsertCount(), 0);
});

Deno.test("create payload cleans punctuation and avoids first-person helper instruction", () => {
  const payload = buildOneShotReminderMessagePayload({
    instruction: "vérifier que je reste en sécurité,",
    requestText:
      "Mets-moi un rappel dans 30 minutes pour vérifier que je reste en sécurité, s'il te plaît.",
    timezone: "Europe/Paris",
    parseSource: "local_parser",
  });

  assertEquals(
    payload.reminder_instruction,
    "vérifier que je reste en sécurité",
  );
  assertEquals(
    payload.instruction,
    "Rappel ponctuel demandé explicitement par l'utilisateur. Objet du rappel utilisateur: vérifier que je reste en sécurité.",
  );
  assertEquals(
    String(payload.instruction).includes("sécurité,."),
    false,
  );
});

Deno.test("cancel_targeted_reminder_commits_cancellation (F4)", async () => {
  // F4 (2026-07-03, paul-broadflow15 T14): l'annulation ciblee est desormais
  // une vraie capacite — le pending vise passe en cancelled et le commit est
  // prouve (le contrat O rendra la confirmation depuis ce commit).
  const result = await executeOneShotReminderEffects({
    supabase: fakeSupabase(),
    userId: "user-1",
    effect_plan: {
      requested_effects: [],
      allowed_effects: [{
        type: "cancel_one_shot_reminder",
        target_reminder_ids: ["reminder-1"],
        target_local_labels: ["vendredi 29 mai à 16:05"],
      }],
      blocked_effects: [],
      reason_code: "ready",
    },
  });
  assertEquals(result.failed_effects, []);
  assertEquals(result.committed_effects.length, 1);
  assertEquals(result.committed_effects[0].type, "cancel_one_shot_reminder");
  assertEquals(result.committed_effects[0].ids, ["reminder-1"]);
  assertEquals(
    result.committed_effects[0].local_label,
    "vendredi 29 mai à 16:05",
  );
});

Deno.test("no_done_language_without_commit", async () => {
  const result = await executeOneShotReminderEffects({
    supabase: fakeSupabase(),
    userId: "user-1",
    effect_plan: {
      requested_effects: [],
      allowed_effects: [{
        type: "create_one_shot_reminder",
        scheduled_for: "",
        reminder_instruction: "fermer le doc",
      }],
      blocked_effects: [],
      reason_code: "ready",
    },
  });
  assertEquals(result.committed_effects.length, 0);
  assertEquals(result.failed_effects[0].reason_code, "missing_time");
});
