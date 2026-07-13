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
  payload_hint: Record<string, unknown> = {},
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
      payload_hint,
    }],
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
  const message = "rappelle-moi demain à 16h05 de fermer le doc";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message,
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "demain à 16h05",
      UTC_time: "2026-05-30T14:05:00.000Z",
      local_label: "demain à 16:05",
      instruction_hint: "fermer le doc",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(result.committed_effects.length, 1);
  assertEquals(result.executed_tools, ["create_one_shot_reminder"]);
});

Deno.test("create writes dispatcher UTC_time as scheduled_for and keeps local label", async () => {
  let writtenRow: any = null;
  const message = "rappelle-moi demain à 09h10 de relire le plan";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row) => {
        writtenRow = row;
      },
    }),
    userId: "user-1",
    message,
    now: new Date("2026-06-24T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "demain à 09h10",
      UTC_time: "2026-06-25T07:10:00.000Z",
      local_label: "demain à 09h10",
      instruction_hint: "relire le plan",
    }),
  });

  assertEquals(result.status, "success");
  assertEquals(writtenRow?.scheduled_for, "2026-06-25T07:10:00.000Z");
  assertEquals(result.local_label, "demain à 09h10");
  assertEquals(
    writtenRow?.message_payload?.user_timezone,
    "Europe/Paris",
  );
});

Deno.test("create success reply keeps safety context after committed reminder", async () => {
  const message =
    "rappelle-moi dans 30 minutes de vérifier que je reste en sécurité";
  const turnFrame = turnFrameWithDirectEffect("create_one_shot_reminder", {
    raw_text: message,
    when_hint: "dans 30 minutes",
    UTC_time: "2026-05-29T10:30:00.000Z",
    local_label: "dans 30 minutes",
    instruction_hint: "vérifier que je reste en sécurité",
  });
  turnFrame.safety = { risk_band: "medium", reason_codes: [], evidence: [] };
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message,
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame,
  });
  assertEquals(result.status, "success");
  assertEquals(result.reply?.includes("C'est programmé pour"), true);
  assertEquals(
    result.reply?.includes(
      "je te ferai le rappel demandé",
    ),
    true,
  );
  assertEquals(
    result.reply?.includes("je te ferai un rappel pour vérifier"),
    false,
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

Deno.test("structured create without scheduled payload needs clarification", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "rappelle-moi demain à 16h05 de fermer le doc",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder"),
  });

  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "missing_time");
  assertEquals(result.executed_tools, []);
  assertEquals(result.committed_effects, []);
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
          when_hint: "demain à 17h",
          UTC_time: "2026-06-02T15:00:00.000Z",
          local_label: "demain à 17:00",
          instruction_hint: "envoyer mon bilan rapide",
        },
      }],
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
          UTC_time: "2026-06-13T08:25:00.000Z",
          local_label: "dans 25 minutes",
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

Deno.test("create uses bounded structured dispatcher payload instead of full composite message", async () => {
  let writtenRow: any = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row) => {
        writtenRow = row;
      },
    }),
    userId: "user-1",
    message:
      "Dans 40 minutes, rappelle-moi de rouvrir le dossier banque, et aide-moi aussi a comprendre pourquoi je bloque a ecrire le mail a Camille.",
    now: new Date("2026-06-18T13:44:05.364Z"),
    turnFrame: {
      ...turnFrameWithDirectEffect("create_one_shot_reminder"),
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          raw_text: "Dans 40 minutes, rappelle-moi de rouvrir le dossier banque",
          when_hint: "dans 40 minutes",
          UTC_time: "2026-06-18T14:24:05.364Z",
          local_label: "dans 40 minutes",
          instruction_hint: "rouvrir le dossier banque",
        },
      }],
    } as any,
  });

  assertEquals(result.status, "success");
  assertEquals(result.reminder_instruction, "rouvrir le dossier banque");
  assertEquals(
    result.committed_effects[0]?.reminder_instruction,
    "rouvrir le dossier banque",
  );
  assertEquals(
    writtenRow?.message_payload?.reminder_instruction,
    "rouvrir le dossier banque",
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
          when_hint: "demain matin à 9h",
          UTC_time: "2026-06-02T07:00:00.000Z",
          local_label: "demain à 09:00",
          instruction_hint: "préparer ma semaine",
        },
      }],
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
  const message = "rappelle-moi de fermer le doc";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message,
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      instruction_hint: "fermer le doc",
    }),
  });
  assertEquals(result.committed_effects.length, 0);
  assert(result.status === "needs_clarify" || result.status === "ignored");
});

Deno.test("create_missing_time_does_not_reuse_previous_context_commit", async () => {
  const message = "Rappelle-moi de vérifier le fichier.";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message,
    contextMessages: [
      "Je suis un peu tendu là. Rappelle-moi dans 20 minutes de respirer doucement et de boire un verre d'eau.",
    ],
    now: new Date("2026-06-13T08:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      instruction_hint: "vérifier le fichier",
    }),
  });

  assertEquals(result.status, "needs_clarify");
  assertEquals(result.executed_tools, []);
  assertEquals(result.committed_effects, []);
  assertEquals(result.blocked_effects, [{
    type: "create_one_shot_reminder",
    reason_code: "missing_time",
  }]);
});

Deno.test("cancel_request_is_ignored_by_create_direct_effect_lane", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ pending: [] }),
    userId: "user-1",
    message: "annule mon rappel de 16h05",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("cancel_one_shot_reminder"),
  });
  assertEquals(result.committed_effects.length, 0);
  assertEquals(result.executed_tools, []);
  assertEquals(result.attempted_effects, []);
  assertEquals(result.status, "ignored");
  assertEquals(
    result.debug.reason_code,
    "missing_explicit_direct_effect",
  );
  assertEquals(result.blocked_effects, []);
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
    "supabase/functions/sophia-brain/agents/companion.ts",
  ];
  for (const file of files) {
    const text = await Deno.readTextFile(file);
    assert(!text.includes("one_shot_reminder_tool.ts"), file);
  }
});

Deno.test("reschedule_intent_blocks_honestly_with_outcome (eva-r5 B01)", async () => {
  // Un decalage de rappel existant n'est pas supporte en chat (decision V1).
  // Le dispatcher emet intent='reschedule' et le runtime bloque: le tour
  // porte un outcome (plus jamais un tour "sans effet" ou le composeur
  // improvise un faux "c'est note : 21h30").
  const message = "mets-le à 21h30 au lieu de 22h";
  const result = await maybeRunOneShotReminderDirectEffect({
    // Le scénario d'eva-r5 B01 suppose un rappel EXISTANT (« au lieu de
    // 22h ») — le fixture le porte: sans aucun pending, le runtime dégrade
    // légitimement en create depuis P0-4 (nina R1-B02).
    supabase: fakeCancelSupabase([{
      id: "pending-22h",
      scheduled_for: "2026-07-06T20:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:poser_le_telephone",
    }]) as any,
    userId: "user-1",
    message,
    now: new Date("2026-07-06T18:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "reschedule",
      raw_text: message,
      when_hint: "21h30",
    }),
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "reschedule_not_supported");
  assertEquals(result.committed_effects.length, 0);
  assertEquals(
    result.blocked_effects.some((effect) =>
      effect.reason_code === "reschedule_not_supported"
    ),
    true,
  );
  // La reply est honnete: rien de change, destination plateforme.
  assertEquals(String(result.reply ?? "").includes("Rien n'a été changé"), true);
});

// Fake flexible pour le cancel: distingue la requete pending (.eq status)
// de la lecture recente tous-statuts (.gte scheduled_for).
function fakeCancelSupabase(rows: Array<{
  id: string;
  scheduled_for: string;
  status: string;
  event_context: string;
  message_payload?: Record<string, unknown>;
}>) {
  function chain(filters: { pendingOnly: boolean }) {
    const self: any = {
      select: () => self,
      like: () => self,
      order: () => self,
      in: () => self,
      gte: () => self,
      eq: (column: string, value: string) => {
        if (column === "status" && value === "pending") {
          return chain({ pendingOnly: true });
        }
        return self;
      },
      // P2-3c: chemin d'écriture du cancel (update → in → eq → select).
      update: () => ({
        in: (_col: string, ids: string[]) => ({
          eq: () => ({
            select: async () => ({
              data: rows
                .filter((row) =>
                  ids.includes(row.id) && row.status === "pending"
                )
                .map((row) => ({
                  id: row.id,
                  scheduled_for: row.scheduled_for,
                })),
              error: null,
            }),
          }),
        }),
      }),
      limit: async () => ({
        data: filters.pendingOnly
          ? rows.filter((row) => row.status === "pending")
          : rows,
        error: null,
      }),
      maybeSingle: async () => ({
        data: { timezone: "Europe/Paris", locale: "fr-FR" },
      }),
    };
    return self;
  }
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { timezone: "Europe/Paris", locale: "fr-FR" },
              }),
            }),
          }),
        };
      }
      return chain({ pendingOnly: false });
    },
  };
}

Deno.test("cancel of an already-delivered reminder says delivered, never 'nothing recorded' (eva-r6 B03)", async () => {
  // Le rappel a fire (pending → awaiting_user) juste avant la demande
  // d'annulation: il EXISTE. Avant le fix, la lecture pending-only le
  // rendait invisible et la reply niait son existence.
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "chk-1",
      scheduled_for: "2026-07-07T20:30:00.000Z",
      status: "awaiting_user",
      event_context: "one_shot_reminder:couper_le_tel",
    }]) as never,
    userId: "user-1",
    message: "finalement annule mon rappel de 22h30",
    now: new Date("2026-07-07T20:45:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "cancel",
      raw_text: "finalement annule mon rappel de 22h30",
      when_hint: "22h30",
    }),
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "cancel_already_delivered");
  assertEquals(
    String(result.reply ?? "").includes("déjà été envoyé"),
    true,
  );
  assertEquals(
    String(result.reply ?? "").includes("aucun rappel"),
    false,
  );
  assertEquals(
    result.blocked_effects.some((effect) =>
      effect.reason_code === "cancel_already_delivered"
    ),
    true,
  );
});

Deno.test("cancel with truly no reminder still says nothing to cancel", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([]) as never,
    userId: "user-1",
    message: "annule mon rappel",
    now: new Date("2026-07-07T20:45:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "cancel",
      raw_text: "annule mon rappel",
    }),
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "no_pending_reminder");
  assertEquals(
    String(result.reply ?? "").includes("rien à annuler"),
    true,
  );
});

// ── P2-3 (vague untested-surfaces 12/07) ────────────────────────────────────

Deno.test("replace: heure nue passée héritée du jour du rappel remplacé (P2-3a, alex-untested R1-B02)", async () => {
  // 23h17 locale ; l'ancien rappel est demain 21h50 ; « remets-en un à
  // 21h15 » résolu par le dispatcher au JOUR COURANT (passé). Avant le fix :
  // cancel committé PUIS create bloqué past_time → plus aucun rappel.
  // Attendu : l'heure hérite du jour de l'ancre AVANT toute mutation.
  let cancelCalls = 0;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "pending-2150",
      scheduled_for: "2026-07-07T19:50:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:micro_pause",
    }]) as never,
    userId: "user-1",
    message: "annule celui de 21h50 et remets-en un à 21h15",
    now: new Date("2026-07-06T21:17:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "replace",
      raw_text: "annule celui de 21h50 et remets-en un à 21h15",
      when_hint: "21h15",
      UTC_time: "2026-07-06T19:15:00.000Z",
      local_label: "21h15",
      instruction_hint: "micro-pause active",
      replace_target_label: "21h50",
    }),
    // Court-circuite APRÈS la réparation : la cible du test est l'admission
    // temporelle, pas l'exécution complète du replace.
    cancelReminder: (async () => {
      cancelCalls += 1;
      return {
        detected: true,
        status: "ambiguous_target",
        pending_count: 2,
        user_message: "",
      };
    }) as never,
  });
  assertEquals(cancelCalls, 1);
  assertEquals(result.debug.reason_code, "replace_target_ambiguous");
  // La réparation a bien porté le nouveau rappel à J+1 (jour de l'ancre).
  assertEquals(
    String(result.pending_clarification?.known_slots?.UTC_time ?? ""),
    "2026-07-07T19:15:00.000Z",
  );
});

Deno.test("replace: heure passée SANS ancre résoluble → clarify, rien annulé (P2-3a anti-FP)", async () => {
  let cancelCalls = 0;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([]) as never,
    userId: "user-1",
    message: "annule celui de 21h50 et remets-en un à 21h15",
    now: new Date("2026-07-06T21:17:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "replace",
      raw_text: "annule celui de 21h50 et remets-en un à 21h15",
      when_hint: "21h15",
      UTC_time: "2026-07-06T19:15:00.000Z",
      local_label: "21h15",
      instruction_hint: "micro-pause active",
      replace_target_label: "21h50",
    }),
    cancelReminder: (async () => {
      cancelCalls += 1;
      return { detected: true, status: "no_reminder", user_message: "" };
    }) as never,
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "replace_past_time");
  // AUCUNE mutation : le cancel n'a jamais été tenté.
  assertEquals(cancelCalls, 0);
  assertEquals(result.committed_effects.length, 0);
  assertEquals(result.pending_clarification?.reason_code, "replace_past_time");
});

Deno.test("cancel: cible résolue par contenu d'instruction sans heure (P2-3c, rose-lifecycle R1-B02)", async () => {
  const { maybeCancelOneShotReminder } = await import("./executor.ts");
  const outcome = await maybeCancelOneShotReminder({
    supabase: fakeCancelSupabase([
      {
        id: "pending-carto",
        scheduled_for: "2026-07-07T07:00:00.000Z",
        status: "pending",
        event_context: "one_shot_reminder:carto",
        message_payload: {
          reminder_instruction: "finir la carto de mes ruminations",
        },
      },
      {
        id: "pending-lessive",
        scheduled_for: "2026-07-07T16:00:00.000Z",
        status: "pending",
        event_context: "one_shot_reminder:lessive",
        message_payload: { reminder_instruction: "sortir la lessive" },
      },
    ]) as never,
    userId: "user-1",
    message: "annule celui de la carto demain matin",
    now: new Date("2026-07-06T21:00:00.000Z"),
  });
  assertEquals(outcome.detected, true);
  assertEquals((outcome as { status: string }).status, "cancelled");
  assertEquals(
    (outcome as { cancelled_ids?: string[] }).cancelled_ids,
    ["pending-carto"],
  );
});

Deno.test("cancel: deux candidats positifs au contenu → vraie ambiguïté, clarify (P2-3c anti-FP)", async () => {
  const { maybeCancelOneShotReminder } = await import("./executor.ts");
  const outcome = await maybeCancelOneShotReminder({
    supabase: fakeCancelSupabase([
      {
        id: "pending-carto-1",
        scheduled_for: "2026-07-07T07:00:00.000Z",
        status: "pending",
        event_context: "one_shot_reminder:carto1",
        message_payload: { reminder_instruction: "finir la carto du matin" },
      },
      {
        id: "pending-carto-2",
        scheduled_for: "2026-07-07T16:00:00.000Z",
        status: "pending",
        event_context: "one_shot_reminder:carto2",
        message_payload: { reminder_instruction: "relire la carto du soir" },
      },
    ]) as never,
    userId: "user-1",
    message: "annule celui de la carto",
    now: new Date("2026-07-06T21:00:00.000Z"),
  });
  assertEquals((outcome as { status: string }).status, "ambiguous_target");
});

Deno.test("pending replace clarify: persisté, exposé UNE fois, supersédé (P2-3d, rose-lifecycle R1-B03)", async () => {
  const {
    applyOneShotReminderPendingClarification,
    pendingOneShotReminderClarificationForDispatcher,
  } = await import("./router.ts");
  const tempMemory: Record<string, unknown> = {};
  applyOneShotReminderPendingClarification({
    temp_memory: tempMemory,
    pending_clarification: {
      intent: "replace",
      reason_code: "replace_target_ambiguous",
      clarify_question: "Lequel je remplace ?",
      known_slots: { UTC_time: "2026-07-07T19:15:00.000Z" },
    },
  });
  // Exposé au dispatcher une fois…
  const exposed = pendingOneShotReminderClarificationForDispatcher(tempMemory);
  assertEquals(exposed?.effect_type, "create_one_shot_reminder");
  assertEquals(exposed?.intent, "replace");
  assertEquals(
    String(exposed?.known_slots?.UTC_time ?? ""),
    "2026-07-07T19:15:00.000Z",
  );
  // …puis plus jamais (pas de pollution des tours ultérieurs).
  assertEquals(
    pendingOneShotReminderClarificationForDispatcher(tempMemory),
    null,
  );
  // Toute exécution de lane sans nouveau clarify supersède le pending.
  applyOneShotReminderPendingClarification({
    temp_memory: tempMemory,
    pending_clarification: null,
  });
  assertEquals(
    "__one_shot_reminder_pending_clarification" in tempMemory,
    false,
  );
});

Deno.test("différé de crise: résultat canonique, zéro exécution (P3-A, alex-safety R1-B01)", async () => {
  const { safetyCrisisDeferredDirectEffectResult } = await import(
    "./router.ts"
  );
  const result = safetyCrisisDeferredDirectEffectResult();
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "safety_crisis_deferred");
  assertEquals(result.committed_effects.length, 0);
  assertEquals(result.executed_tools.length, 0);
  // Le différé est explicite, jamais une confirmation.
  assertEquals(String(result.reply ?? "").includes("garde"), true);
  assertEquals(String(result.reply ?? "").includes("programmé"), false);
});

// ── P3-B temps déterministe (paul-untested16 T12, rose-hard15 T11) ─────────

Deno.test("P3-B couche 1: « demain à 19h » de nuit → le parseur prime sur l'UTC_time LLM dérivé", async () => {
  // 02h49 Paris (00:49Z). Le LLM a résolu « demain 19h » à AUJOURD'HUI 19h
  // (futur, donc jamais rattrapé par past_time) — le parseur ancré client
  // corrige au 14/07.
  let writtenRow: any = null;
  const message = "rappelle-moi demain à 19h d'appeler mon frère";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message,
    now: new Date("2026-07-13T00:49:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "demain à 19h",
      UTC_time: "2026-07-13T17:00:00.000Z",
      local_label: "demain à 19h",
      instruction_hint: "appeler mon frère",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(writtenRow?.scheduled_for, "2026-07-14T17:00:00.000Z");
});

Deno.test("P3-B couche 2: « demain matin » sans heure parseable → jour forcé à J+1, heure LLM gardée", async () => {
  let writtenRow: any = null;
  const message = "rappelle-moi demain matin de préparer le dossier";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message,
    now: new Date("2026-07-13T00:30:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "demain matin",
      // Le LLM a mis « ce matin » (aujourd'hui 9h locale = 07:00Z).
      UTC_time: "2026-07-13T07:00:00.000Z",
      local_label: "demain matin",
      instruction_hint: "préparer le dossier",
    }),
  });
  assertEquals(result.status, "success");
  const written = new Date(String(writtenRow?.scheduled_for));
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(written);
  assertEquals(day, "2026-07-14");
});

Deno.test("P3-B anti-FP: UTC_time LLM correct conservé + heure nue passée garde past_time (V2-A)", async () => {
  // Cas nominal: parseur et LLM d'accord → aucun changement (contrat A1).
  let writtenRow: any = null;
  const message = "rappelle-moi demain à 09h10 de relire le plan";
  const nominal = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message,
    now: new Date("2026-06-24T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "demain à 09h10",
      UTC_time: "2026-06-25T07:10:00.000Z",
      local_label: "demain à 09h10",
      instruction_hint: "relire le plan",
    }),
  });
  assertEquals(nominal.status, "success");
  assertEquals(writtenRow?.scheduled_for, "2026-06-25T07:10:00.000Z");

  // Heure nue déjà passée SANS « demain »: le bump du parseur ne remplace
  // pas le clarify past_time (ambiguïté volontaire, décision V2-A).
  const past = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({}),
    userId: "user-1",
    message: "rappelle-moi à 15h de sortir la poubelle",
    now: new Date("2026-07-13T14:30:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "rappelle-moi à 15h de sortir la poubelle",
      when_hint: "à 15h",
      UTC_time: "2026-07-13T13:00:00.000Z",
      local_label: "15h",
      instruction_hint: "sortir la poubelle",
    }),
  });
  assertEquals(past.status !== "success", true);
  assertEquals(past.debug.reason_code, "past_time");
});
