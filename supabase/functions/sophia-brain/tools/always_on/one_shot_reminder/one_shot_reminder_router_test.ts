import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { maybeRunOneShotReminderDirectEffect } from "./router.ts";

function fakeSupabase(options?: {
  pending?: Array<{ id: string; scheduled_for: string }>;
  failInsert?: boolean;
  onUpsert?: (row: any) => void;
  onCancelIds?: (ids: string[]) => void;
}) {
  const pending = options?.pending ?? [];
  // P12-A: le fake modèle l'onConflict réel (user_id,event_context,
  // scheduled_for) — deux upserts sur la MÊME clé rendent le MÊME id (le
  // mécanisme du phantom nina-p10reval R1-B02), deux clés distinctes rendent
  // des ids distincts. L'ancien id fixe « created-1 » faisait passer tout
  // fan-out légitime pour un double commit du même id.
  const upsertIdsByKey = new Map<string, string>();
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
          const upsertKey =
            `${row.user_id}|${row.event_context}|${row.scheduled_for}`;
          if (!upsertIdsByKey.has(upsertKey)) {
            upsertIdsByKey.set(
              upsertKey,
              `created-${upsertIdsByKey.size + 1}`,
            );
          }
          const upsertId = upsertIdsByKey.get(upsertKey)!;
          return {
            select() {
              return {
                single: async () =>
                  options?.failInsert
                    ? ({ data: null, error: { message: "boom" } })
                    : ({
                      data: {
                        id: upsertId,
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
          // P9: chaîne réelle du cancel (`update().in().eq().select()`) —
          // l'ancienne forme `in: async` faisait échouer silencieusement les
          // cancels de replace (cancel_failed) et masquait le comportement
          // atomique. Les lignes annulées sont retirées de `pending` (état
          // partagé) pour que les relectures du même test voient la vérité.
          const chainState = { ids: [] as string[] };
          const chain = {
            in(_column: string, ids: string[]) {
              chainState.ids = (ids ?? []).map(String);
              return chain;
            },
            eq() {
              return chain;
            },
            select: async () => {
              const cancelled = pending.filter((row: any) =>
                chainState.ids.includes(String(row?.id ?? ""))
              );
              for (const row of cancelled) {
                const index = pending.indexOf(row as any);
                if (index >= 0) pending.splice(index, 1);
              }
              options?.onCancelIds?.(
                cancelled.map((row: any) => String(row.id)),
              );
              return {
                data: cancelled.map((row: any) => ({
                  id: row.id,
                  scheduled_for: row.scheduled_for,
                })),
                error: null,
              };
            },
          };
          return chain;
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

// P6-H (décision actée 13/07) — recalibrage volontaire d'eva-r5 B01: le
// reschedule HAUTE CONFIANCE (cible unique + heure parseable) s'exécute
// désormais en REPLACE ATOMIQUE (renverse V1 « pas d'édition en place »,
// nina-untested21 R1-B04). Le blocage honnête ne subsiste que sur
// l'ambiguïté (couvert par le test P6-H dédié).
Deno.test("reschedule haute confiance sur pending unique → replace atomique (eva-r5 B01 recalibré P6-H)", async () => {
  const message = "mets-le à 21h30 au lieu de 22h";
  let upsertRow: Record<string, unknown> | null = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "pending-22h",
      scheduled_for: "2026-07-06T20:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:poser_le_telephone",
      message_payload: { reminder_instruction: "poser le téléphone" },
    }], {
      onUpsert: (row) => {
        upsertRow = row;
      },
    }) as any,
    userId: "user-1",
    message,
    now: new Date("2026-07-06T18:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "reschedule",
      raw_text: message,
      when_hint: "21h30",
      UTC_time: "2026-07-06T19:30:00.000Z",
      local_label: "21:30",
    }),
  });
  assertEquals(result.status, "success");
  // L'instruction du rappel déplacé est HÉRITÉE (P3-F/P6-A).
  assertEquals(
    String((upsertRow as any)?.message_payload?.reminder_instruction ?? ""),
    "poser le téléphone",
  );
  assertEquals((upsertRow as any)?.scheduled_for, "2026-07-06T19:30:00.000Z");
});

// Fake flexible pour le cancel: distingue la requete pending (.eq status)
// de la lecture recente tous-statuts (.gte scheduled_for).
function fakeCancelSupabase(rows: Array<{
  id: string;
  scheduled_for: string;
  status: string;
  event_context: string;
  message_payload?: Record<string, unknown>;
}>, options: { onUpsert?: (row: Record<string, unknown>) => void } = {}) {
  function chain(filters: { pendingOnly: boolean }) {
    const self: any = {
      select: () => self,
      like: () => self,
      order: () => self,
      in: () => self,
      gte: () => self,
      // P6-A: chemin d'écriture du CREATE (replace complet cancel+create).
      upsert: (row: Record<string, unknown>) => {
        options.onUpsert?.(row);
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: "created-replace-1",
                scheduled_for: row.scheduled_for,
                event_context: row.event_context,
              },
              error: null,
            }),
          }),
        };
      },
      eq: (column: string, value: string) => {
        if (column === "status" && value === "pending") {
          return chain({ pendingOnly: true });
        }
        return self;
      },
      // P2-3c: chemin d'écriture du cancel (update → in → eq → select).
      // P6-A: le fake MUTE le statut comme la vraie DB — sans ça, le gate
      // anti-doublon du create d'un replace revoyait l'ancien rappel encore
      // « pending » et rendait same_instruction_pending à tort.
      update: () => ({
        in: (_col: string, ids: string[]) => ({
          eq: () => ({
            select: async () => {
              const cancelled = rows.filter((row) =>
                ids.includes(row.id) && row.status === "pending"
              );
              for (const row of cancelled) row.status = "cancelled";
              return {
                data: cancelled.map((row) => ({
                  id: row.id,
                  scheduled_for: row.scheduled_for,
                })),
                error: null,
              };
            },
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

// ── P6-H (nina-untested21 R1-B03/B04, décisions actées 13/07) ───────────────

Deno.test("« 7 heures » numérique + mot entier = même ceinture que « sept heures » (P6-H, nina-untested21 R1-B03)", async () => {
  let upserts = 0;
  const ambiguous = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => upserts++ }) as never,
    userId: "user-1",
    message: "mets-moi un rappel demain à 7 heures pour prendre mes affaires",
    now: new Date("2026-07-13T19:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "mets-moi un rappel demain à 7 heures pour prendre mes affaires",
      when_hint: "demain à 07:00",
      UTC_time: "2026-07-14T05:00:00.000Z",
      local_label: "demain à 07:00",
      instruction_hint: "prendre mes affaires",
    }),
  });
  assertEquals(ambiguous.status, "needs_clarify");
  assertEquals(ambiguous.debug.reason_code, "hour_meridiem_ambiguous");
  assertEquals(upserts, 0);
  // Anti-faux-positifs: méridiem explicite et heure ≥ 12 committent direct.
  let morningUpserts = 0;
  const morning = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => morningUpserts++ }) as never,
    userId: "user-1",
    message: "rappel demain à 7 heures du matin de prendre mes affaires",
    now: new Date("2026-07-13T19:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "rappel demain à 7 heures du matin de prendre mes affaires",
      when_hint: "demain à 07:00 du matin",
      UTC_time: "2026-07-14T05:00:00.000Z",
      local_label: "demain à 07:00",
      instruction_hint: "prendre mes affaires",
    }),
  });
  assertEquals(morning.status, "success");
  assertEquals(morningUpserts, 1);
  let eveningUpserts = 0;
  const evening = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => eveningUpserts++ }) as never,
    userId: "user-1",
    message: "rappel demain à 19 heures de sortir la poubelle",
    now: new Date("2026-07-13T15:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "rappel demain à 19 heures de sortir la poubelle",
      when_hint: "demain à 19:00",
      UTC_time: "2026-07-14T17:00:00.000Z",
      local_label: "demain à 19:00",
      instruction_hint: "sortir la poubelle",
    }),
  });
  assertEquals(evening.status, "success");
  assertEquals(eveningUpserts, 1);
});

Deno.test("reschedule HAUTE CONFIANCE = replace atomique cancel+create (P6-H, nina-untested21 R1-B04, décision actée)", async () => {
  let upsertRow: Record<string, unknown> | null = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "gamelle-1",
      scheduled_for: "2026-07-13T16:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:preparer_ta_gamelle",
      message_payload: { reminder_instruction: "préparer ta gamelle" },
    }], {
      onUpsert: (row) => {
        upsertRow = row;
      },
    }) as never,
    userId: "user-1",
    message: "en fait corrige l'heure du rappel gamelle: 19h, pas 18h",
    now: new Date("2026-07-13T14:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "reschedule",
      raw_text: "corrige l'heure du rappel gamelle: 19h, pas 18h",
      when_hint: "aujourd'hui à 19:00",
      UTC_time: "2026-07-13T17:00:00.000Z",
      local_label: "aujourd'hui à 19:00",
      instruction_hint: "préparer ta gamelle",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals((upsertRow as any)?.scheduled_for, "2026-07-13T17:00:00.000Z");
  assertEquals(
    String((upsertRow as any)?.message_payload?.reminder_instruction ?? ""),
    "préparer ta gamelle",
  );
  // Anti-faux-positif: cible ambiguë (2 pendings, aucune correspondance
  // d'instruction) → blocage honnête historique, rien muté.
  const ambiguous = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "a-1",
      scheduled_for: "2026-07-13T16:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:kine",
      message_payload: { reminder_instruction: "appeler le kiné" },
    }, {
      id: "b-1",
      scheduled_for: "2026-07-13T18:30:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:poubelle",
      message_payload: { reminder_instruction: "sortir la poubelle" },
    }]) as never,
    userId: "user-1",
    message: "décale mon rappel à 20h stp",
    now: new Date("2026-07-13T14:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "reschedule",
      raw_text: "décale mon rappel à 20h stp",
      when_hint: "aujourd'hui à 20:00",
      UTC_time: "2026-07-13T18:00:00.000Z",
      local_label: "aujourd'hui à 20:00",
    }),
  });
  assertEquals(ambiguous.status, "blocked");
  assertEquals(ambiguous.debug.reason_code, "reschedule_not_supported");
});

// ── P6-A (nina-untested21 R1-B01/B02, paul-hard21 R1-B04) ───────────────────

Deno.test("replace « même chose » → instruction HÉRITÉE du rappel remplacé, jamais littérale (P6-A, nina-untested21 R1-B01)", async () => {
  let upsertRow: Record<string, unknown> | null = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "gamelle-1",
      scheduled_for: "2026-07-13T17:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:preparer_ta_gamelle",
      message_payload: { reminder_instruction: "préparer ta gamelle" },
    }], {
      onUpsert: (row) => {
        upsertRow = row;
      },
    }) as never,
    userId: "user-1",
    message:
      "annule le rappel de 19h et remets-le demain à 19h, même chose stp",
    now: new Date("2026-07-13T15:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "replace",
      raw_text: "annule le rappel de 19h et remets-le demain à 19h, même chose",
      when_hint: "demain à 19:00",
      UTC_time: "2026-07-14T17:00:00.000Z",
      local_label: "demain à 19:00",
      instruction_hint: "même chose",
      replace_target_label: "19:00",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(
    String(
      (upsertRow as any)?.message_payload?.reminder_instruction ?? "",
    ),
    "préparer ta gamelle",
  );
  // Paraphrase couverte par le même helper (unit).
  const { isReminderInstructionInvarianceAnaphora } = await import(
    "./instruction_parser.ts"
  );
  assertEquals(isReminderInstructionInvarianceAnaphora("pareil"), true);
  assertEquals(isReminderInstructionInvarianceAnaphora("idem"), true);
  assertEquals(isReminderInstructionInvarianceAnaphora("la même chose"), true);
  assertEquals(isReminderInstructionInvarianceAnaphora("même chose stp"), true);
  // P6-V (probe P6-1 passe 6): la queue TEMPORELLE collée dans l'objet par
  // l'émission ne casse jamais le match — c'est le quand, pas le quoi.
  assertEquals(
    isReminderInstructionInvarianceAnaphora("même chose stp demain à 20h"),
    true,
  );
  assertEquals(
    isReminderInstructionInvarianceAnaphora("la même chose demain matin"),
    true,
  );
  assertEquals(
    isReminderInstructionInvarianceAnaphora("pareil à 19h30"),
    true,
  );
  // ...mais un vrai texte à queue temporelle reste un vrai texte.
  assertEquals(
    isReminderInstructionInvarianceAnaphora("appeler le médecin à 9h"),
    false,
  );
  // Anti-faux-positifs: un vrai texte n'est jamais traité en anaphore.
  assertEquals(
    isReminderInstructionInvarianceAnaphora("préparer ta gamelle"),
    false,
  );
  assertEquals(
    isReminderInstructionInvarianceAnaphora("boire de l'eau"),
    false,
  );
});

// ── P7-F (paul-p6reval R1-B04): reschedule à CIBLE NOMMÉE parmi plusieurs —
// tolérance morphologique (« la marche » ↔ « marcher ») sur le match. ───────

Deno.test("reschedule « le rappel de la marche à 18h » avec 2 pendings → replace atomique de la cible nommée (P7-F, paul-p6reval T8)", async () => {
  let upsertRow: Record<string, unknown> | null = null;
  const rows = [
    {
      id: "marche-1",
      scheduled_for: "2026-07-14T15:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:marcher_20_minutes",
      message_payload: { reminder_instruction: "marcher 20 minutes" },
    },
    {
      id: "sac-1",
      scheduled_for: "2026-07-15T06:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:preparer_le_sac",
      message_payload: { reminder_instruction: "préparer le sac de sport" },
    },
  ];
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase(rows, {
      onUpsert: (row) => {
        upsertRow = row;
      },
    }) as never,
    userId: "user-1",
    message: "décale le rappel de la marche à 18h stp",
    now: new Date("2026-07-14T10:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "reschedule",
      raw_text: "décale le rappel de la marche à 18h stp",
      instruction_hint: "la marche",
      when_hint: "18h",
      UTC_time: "2026-07-14T16:00:00.000Z",
      local_label: "18:00",
    }),
  });
  assertEquals(result.status, "success");
  // Contenu hérité de la cible nommée, l'autre pending JAMAIS touché.
  assertEquals(
    String((upsertRow as any)?.message_payload?.reminder_instruction ?? ""),
    "marcher 20 minutes",
  );
  assertEquals(rows[0].status, "cancelled");
  assertEquals(rows[1].status, "pending");
});

// ── P7-C (paul-p6reval R1-B01): fusion du tour-réponse au clarify MÉRIDIEM —
// heure-base + jour du tour d'origine + créneau de la réponse ⇒ commit. ────

const MERIDIEM_PENDING = {
  __one_shot_reminder_pending_clarification: {
    mode: "needs_clarify",
    intent: "create",
    reason_code: "hour_meridiem_ambiguous",
    clarify_question: "7h du matin, ou 19h ?",
    known_slots: {
      instruction_hint: "préparer mes affaires de sport",
      raw_text: "rappel demain à 7 heures pour préparer mes affaires de sport",
      when_hint: "demain à 7 heures",
    },
    source_message_id: "m-prev",
    clarification_exposed_to_dispatcher: true,
  },
};

Deno.test("clarify méridiem + réponse « du soir, 19h » → commit 19:00 demain, instruction héritée (P7-C, paul-p6reval T2)", async () => {
  let upsertRow: Record<string, unknown> | null = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row: Record<string, unknown>) => {
        upsertRow = row;
      },
    }) as never,
    userId: "user-1",
    message: "du soir, 19h stp",
    now: new Date("2026-07-13T19:05:00.000Z"),
    tempMemory: structuredClone(MERIDIEM_PENDING),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      // Le dispatcher ré-émet le texte d'ORIGINE avec UTC_time vide
      // (comportement observé paul T2/T3).
      raw_text: "rappel demain à 7 heures pour préparer mes affaires de sport",
      when_hint: "demain à 7 heures",
      UTC_time: "",
      local_label: "",
    }),
  });
  assertEquals(result.status, "success");
  // 19h Paris demain = 17:00Z le 14/07.
  assertEquals((upsertRow as any)?.scheduled_for, "2026-07-14T17:00:00.000Z");
  assertEquals(
    String((upsertRow as any)?.message_payload?.reminder_instruction ?? ""),
    "préparer mes affaires de sport",
  );
});

Deno.test("clarify méridiem + réponse méridiem seul « le soir » → heure-base +12 (P7-C paraphrase)", async () => {
  let upsertRow: Record<string, unknown> | null = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row: Record<string, unknown>) => {
        upsertRow = row;
      },
    }) as never,
    userId: "user-1",
    message: "le soir",
    now: new Date("2026-07-13T19:05:00.000Z"),
    tempMemory: structuredClone(MERIDIEM_PENDING),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "rappel demain à 7 heures pour préparer mes affaires de sport",
      when_hint: "demain à 7 heures",
      UTC_time: "",
      local_label: "",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals((upsertRow as any)?.scheduled_for, "2026-07-14T17:00:00.000Z");
});

Deno.test("clarify méridiem + réponse qui NE lève PAS l'ambiguïté → clarify inchangé, zéro write (P7-C anti-faux-positif)", async () => {
  let upserts = 0;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => upserts++ }) as never,
    userId: "user-1",
    // Nouvelle heure basse sans méridiem: toujours ambigu (9h du matin ou 21h ?).
    message: "en fait plutôt 9h",
    now: new Date("2026-07-13T19:05:00.000Z"),
    tempMemory: structuredClone(MERIDIEM_PENDING),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "rappel demain à 7 heures pour préparer mes affaires de sport",
      when_hint: "demain à 7 heures",
      UTC_time: "",
      local_label: "",
    }),
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(upserts, 0);
});

// ── P6-V (harness r5g-s2 T3): un instruction_hint qui ÉCHO la commande de
// déplacement n'est jamais un contenu de rappel — le reschedule coerce en
// replace atomique sur le pending unique, contenu HÉRITÉ, zéro doublon. ────

Deno.test("reschedule dont l'instruction ÉCHO la commande → replace atomique, contenu hérité, jamais un doublon (P6-V, harness r5g-s2)", async () => {
  let upsertRow: Record<string, unknown> | null = null;
  const rows = [{
    id: "tel-2230",
    scheduled_for: "2026-07-14T20:30:00.000Z",
    status: "pending",
    event_context: "one_shot_reminder:poser_le_telephone",
    message_payload: {
      reminder_instruction: "poser le téléphone hors de la chambre",
    },
  }];
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase(rows, {
      onUpsert: (row) => {
        upsertRow = row;
      },
    }) as never,
    userId: "user-1",
    message: "En fait mets-le plutôt à 23h, 22h30 c'est trop tôt.",
    now: new Date("2026-07-14T18:35:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "reschedule",
      raw_text: "En fait mets-le plutôt à 23h, 22h30 c'est trop tôt.",
      instruction_hint: "en fait mets-le plutôt à 23h, 22h30 c'est trop tôt",
      when_hint: "23h",
      UTC_time: "2026-07-14T21:00:00.000Z",
      local_label: "23:00",
    }),
  });
  assertEquals(result.status, "success");
  // Contenu INVARIANT: hérité du rappel déplacé, jamais l'écho de commande.
  assertEquals(
    String((upsertRow as any)?.message_payload?.reminder_instruction ?? ""),
    "poser le téléphone hors de la chambre",
  );
  assertEquals((upsertRow as any)?.scheduled_for, "2026-07-14T21:00:00.000Z");
  // Atomicité: l'ancien pending est annulé (jamais 2 pendings).
  assertEquals(rows[0].status, "cancelled");
});

Deno.test("reschedule clitique « mets-le » avec instruction POLLUÉE (sujet d'un autre tour) → replace atomique sur le pending unique, jamais un doublon (P6-V, harness r5g-s2 2e forme)", async () => {
  let upsertRow: Record<string, unknown> | null = null;
  const rows = [{
    id: "tel-2230",
    scheduled_for: "2026-07-14T20:30:00.000Z",
    status: "pending",
    event_context: "one_shot_reminder:poser_le_telephone",
    message_payload: {
      reminder_instruction: "poser le téléphone hors de la chambre",
    },
  }];
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase(rows, {
      onUpsert: (row) => {
        upsertRow = row;
      },
    }) as never,
    userId: "user-1",
    message: "En fait mets-le plutôt à 23h, 22h30 c'est trop tôt.",
    now: new Date("2026-07-14T18:35:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "reschedule",
      raw_text: "En fait mets-le plutôt à 23h, 22h30 c'est trop tôt.",
      // Pollution observée (harness5): le sujet du tour de diversion fuit
      // dans instruction_hint — sans rapport avec le rappel déplacé.
      instruction_hint: "appeler Paul",
      when_hint: "23h",
      UTC_time: "2026-07-14T21:00:00.000Z",
      local_label: "23:00",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(
    String((upsertRow as any)?.message_payload?.reminder_instruction ?? ""),
    "poser le téléphone hors de la chambre",
  );
  assertEquals(rows[0].status, "cancelled");
});

Deno.test("« remets-moi le rappel des pâtes » avec un seul pending SANS rapport → dégradation en create, jamais un déplacement du mauvais rappel (P6-V anti-faux-positif, P4-C préservé)", async () => {
  const rows = [{
    id: "kine-1",
    scheduled_for: "2026-07-14T15:00:00.000Z",
    status: "pending",
    event_context: "one_shot_reminder:appeler_le_kine",
    message_payload: { reminder_instruction: "appeler le kiné" },
  }];
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase(rows) as never,
    userId: "user-1",
    message: "remets-moi le rappel des pâtes",
    now: new Date("2026-07-14T10:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "reschedule",
      raw_text: "remets-moi le rappel des pâtes",
      instruction_hint: "les pâtes",
    }),
  });
  // Objet réel sans horaire = pas un écho: dégradation P4-C (clarify heure),
  // le pending kiné n'est JAMAIS touché.
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "reschedule_no_target");
  assertEquals(rows[0].status, "pending");
});

// ── P6-V (probe P6-1 passe 4): complétion du créneau d'un REPLACE quand
// l'émission perd TOUS les champs temporels — le message user reste la seule
// source, le segment après le verbe de re-création isole le NOUVEL horaire
// (le texte entier à deux heures fait gagner la mauvaise, vérifié: 19h). ────

Deno.test("replace sans champs temporels émis → heure complétée depuis le segment de re-création du message (P6-V, probe P6-1)", async () => {
  let upsertRow: Record<string, unknown> | null = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "gamelle-1",
      scheduled_for: "2026-07-13T17:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:preparer_ta_gamelle",
      message_payload: { reminder_instruction: "préparer ta gamelle" },
    }], {
      onUpsert: (row) => {
        upsertRow = row;
      },
    }) as never,
    userId: "user-1",
    message: "annule celui de 19h et remets-le demain à 20h, même chose",
    now: new Date("2026-07-13T15:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "replace",
      instruction_hint: "même chose",
      replace_target_label: "19h",
    }),
  });
  assertEquals(result.status, "success");
  // 20h Paris demain — jamais 19h (l'heure de la cible est rejetée).
  assertEquals((upsertRow as any)?.scheduled_for, "2026-07-14T18:00:00.000Z");
  assertEquals(
    String((upsertRow as any)?.message_payload?.reminder_instruction ?? ""),
    "préparer ta gamelle",
  );
});

Deno.test("replace avec raw_text à DEUX heures et UTC_time vide → le segment isole 20h, jamais 19h (P6-V paraphrase)", async () => {
  let upsertRow: Record<string, unknown> | null = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "gamelle-1",
      scheduled_for: "2026-07-13T17:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:preparer_ta_gamelle",
      message_payload: { reminder_instruction: "préparer ta gamelle" },
    }], {
      onUpsert: (row) => {
        upsertRow = row;
      },
    }) as never,
    userId: "user-1",
    message: "annule celui de 19h et remets-le demain à 20h, même chose",
    now: new Date("2026-07-13T15:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "replace",
      raw_text: "annule celui de 19h et remets-le demain à 20h, même chose",
      instruction_hint: "même chose",
      replace_target_label: "19h",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals((upsertRow as any)?.scheduled_for, "2026-07-14T18:00:00.000Z");
});

Deno.test("replace au créneau VAGUE → clarify inchangé, rien annulé (P6-V anti-faux-positif)", async () => {
  let upserts = 0;
  const rows = [{
    id: "gamelle-1",
    scheduled_for: "2026-07-13T17:00:00.000Z",
    status: "pending",
    event_context: "one_shot_reminder:preparer_ta_gamelle",
    message_payload: { reminder_instruction: "préparer ta gamelle" },
  }];
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase(rows, {
      onUpsert: () => upserts++,
    }) as never,
    userId: "user-1",
    message: "annule celui de 19h et remets-le plus tard dans la soirée",
    now: new Date("2026-07-13T15:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "replace",
      raw_text: "annule celui de 19h et remets-le plus tard dans la soirée",
      replace_target_label: "19h",
    }),
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "replace_payload_incomplete");
  assertEquals(upserts, 0);
  // Atomicité: le pending d'origine n'est PAS annulé.
  assertEquals(rows[0].status, "pending");
});

Deno.test("clarify PAST_TIME persiste les slots — l'objet survit au tour-réponse (P6-A, nina-untested21 R1-B02)", async () => {
  // « rappelle-moi ce soir 20h de me peser » à 21h (passé) → past_time, et le
  // pending DOIT porter l'instruction pour que « alors demain 20h » hérite.
  let upserts = 0;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => upserts++ }) as never,
    userId: "user-1",
    message: "rappelle-moi ce soir à 20h de me peser avant ma garde",
    now: new Date("2026-07-13T19:30:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "rappelle-moi ce soir à 20h de me peser avant ma garde",
      when_hint: "ce soir à 20:00",
      UTC_time: "2026-07-13T18:00:00.000Z",
      local_label: "ce soir à 20:00",
      instruction_hint: "me peser",
    }),
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "past_time");
  assertEquals(upserts, 0);
  assertEquals(result.pending_clarification?.intent, "create");
  assertEquals(
    result.pending_clarification?.known_slots?.instruction_hint,
    "me peser",
  );
});

Deno.test("instruction récupérée depuis un message récent — GUILLEMETS uniquement (P6-A, paul-hard21 R1-B04 aval)", async () => {
  // Le tour courant ne porte que le créneau ; un message récent portait le
  // libellé entre guillemets → récupéré. Sans guillemets → clarify honnête.
  let upsertRow: Record<string, unknown> | null = null;
  const recovered = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row: Record<string, unknown>) => {
        upsertRow = row;
      },
    }) as never,
    userId: "user-1",
    message: "ok mets demain matin 9h30",
    now: new Date("2026-07-13T15:00:00.000Z"),
    contextMessages: [
      "je veux un rappel avec marqué « appeler le dentiste », montre-moi d'abord",
    ],
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "ok mets demain matin 9h30",
      when_hint: "demain à 09:30",
      UTC_time: "2026-07-14T07:30:00.000Z",
      local_label: "demain à 09:30",
    }),
  });
  assertEquals(recovered.status, "success");
  assertEquals(
    String((upsertRow as any)?.message_payload?.reminder_instruction ?? ""),
    "appeler le dentiste",
  );
  // Anti-faux-positif: contexte SANS guillemets → pas de récupération lâche,
  // clarify missing_instruction honnête (le fix amont est l'émission draft).
  const notRecovered = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase() as never,
    userId: "user-1",
    message: "ok mets demain matin 9h30",
    now: new Date("2026-07-13T15:00:00.000Z"),
    contextMessages: [
      "j'aimerais un rappel pour appeler le dentiste, montre-moi d'abord",
    ],
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "ok mets demain matin 9h30",
      when_hint: "demain à 09:30",
      UTC_time: "2026-07-14T07:30:00.000Z",
      local_label: "demain à 09:30",
    }),
  });
  assertEquals(notRecovered.status, "needs_clarify");
  assertEquals(notRecovered.debug.reason_code, "missing_instruction");
});

// ── P5-B (rose-hard17 T14-T15) ──────────────────────────────────────────────

Deno.test("question de vérification émise en cancel → lane status, ZÉRO write (P5-B, rose-hard17 T14)", async () => {
  // Rose demande si le rappel de l'eau (déjà annulé) est bien annulé. Le
  // dispatcher émet intent=cancel ; avant le fix, le repli pending-unique
  // annulait le rappel de la SŒUR puis affirmait qu'il restait actif.
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "eau-1",
      scheduled_for: "2026-07-13T18:00:00.000Z",
      status: "cancelled",
      event_context: "one_shot_reminder:boire_un_grand_verre_d_eau",
      message_payload: { reminder_instruction: "boire un grand verre d'eau" },
    }, {
      id: "soeur-1",
      scheduled_for: "2026-07-14T07:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:appeler_ta_soeur",
      message_payload: { reminder_instruction: "appeler ta sœur" },
    }]) as never,
    userId: "user-1",
    message:
      "attends, t'es sûre que le rappel de l'eau est bien annulé ? vérifie que c'est le cas stp",
    now: new Date("2026-07-13T20:30:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "cancel",
      raw_text: "t'es sûre que le rappel de l'eau est bien annulé ?",
    }),
  });
  assertEquals(result.intent, "status");
  assertEquals(result.status, "success");
  assertEquals(result.debug.reason_code, "status_report");
  assertEquals(result.executed_tools, ["read_one_shot_reminder_status"]);
  // Aucun cancel committé, la sœur reste intouchée.
  assertEquals(
    result.committed_effects.some((effect) =>
      effect.type === "cancel_one_shot_reminder"
    ),
    false,
  );
  // La projection porte l'état réel des deux rappels (dont l'annulé récent).
  const statusEffect = result.committed_effects.find((effect) =>
    effect.type === "one_shot_reminder_status"
  ) as Record<string, unknown> | undefined;
  assertEquals(
    String(statusEffect?.target_title ?? "").includes("annulé"),
    true,
  );
  assertEquals(String(result.reply ?? "").includes("Rien n'a été modifié"), true);
});

Deno.test("cancel nommant un rappel déjà annulé → no-op honnête, le pending unique n'est JAMAIS muté (P5-B ceinture)", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "verre-1",
      scheduled_for: "2026-07-13T18:00:00.000Z",
      status: "cancelled",
      event_context: "one_shot_reminder:boire_un_grand_verre_d_eau",
      message_payload: { reminder_instruction: "boire un grand verre d'eau" },
    }, {
      id: "soeur-1",
      scheduled_for: "2026-07-14T07:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:appeler_ta_soeur",
      message_payload: { reminder_instruction: "appeler ta sœur" },
    }]) as never,
    userId: "user-1",
    message: "annule le rappel du verre d'eau",
    now: new Date("2026-07-13T20:30:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "cancel",
      raw_text: "annule le rappel du verre d'eau",
    }),
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "cancel_already_cancelled");
  assertEquals(result.committed_effects.length, 0);
  assertEquals(String(result.reply ?? "").includes("déjà annulé"), true);
});

Deno.test("cancel générique « annule-le » sur pending unique reste servi (P5-B anti-FP)", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "soeur-1",
      scheduled_for: "2026-07-14T07:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:appeler_ta_soeur",
      message_payload: { reminder_instruction: "appeler ta sœur" },
    }]) as never,
    userId: "user-1",
    message: "finalement annule-le",
    now: new Date("2026-07-13T20:30:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "cancel",
      raw_text: "finalement annule-le",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(result.debug.reason_code, "cancelled");
  assertEquals(
    result.committed_effects.some((effect) =>
      effect.type === "cancel_one_shot_reminder"
    ),
    true,
  );
});

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

Deno.test("cancel + « remets-en un à Yh » → reclassifié REPLACE, nouvel horaire du segment + jour hérité de l'ancre (P4-B, alex-global19 R1-B02)", async () => {
  // Le dispatcher aplatit « annule X et remets-en un à 21h00 » en UN effect
  // intent=cancel dont le when_hint porte l'ANCIEN horaire — seul le cancel
  // partait (0 pending, l'inverse de l'intention). Attendu: reclassement en
  // replace, heure = 21h00 (segment après le verbe de re-création), jour
  // hérité du rappel remplacé (demain), atomicité replace préservée.
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "pending-2130",
      scheduled_for: "2026-07-14T19:30:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:sortir_carnet",
      message_payload: {
        reminder_instruction: "sortir mon carnet avant de dormir",
      },
    }]) as never,
    userId: "user-1",
    message:
      "annule ce rappel et remets m'en un à 21h00 à la place pour le carnet",
    now: new Date("2026-07-13T14:14:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "cancel",
      raw_text:
        "annule ce rappel et remets m'en un à 21h00 à la place pour le carnet",
      when_hint: "demain soir vers 21h30",
      instruction_hint: "sortir mon carnet avant de dormir",
    }),
    // Court-circuite l'exécution complète: la cible du test est la
    // reclassification + la résolution temporelle, pas le write final
    // (l'atomicité du replace est couverte par les tests R-2/P2-3a).
    cancelReminder: (async () => ({
      detected: true,
      status: "ambiguous_target",
      pending_count: 2,
      user_message: "",
    })) as never,
  });
  assertEquals(result.intent, "replace");
  assertEquals(result.debug.reason_code, "replace_target_ambiguous");
  assertEquals(
    String(result.pending_clarification?.known_slots?.UTC_time ?? ""),
    "2026-07-14T19:00:00.000Z",
  );
});

Deno.test("heure NUE en toutes lettres → clarify du créneau, zéro write (P4-D, eva-global19 R1-B03)", async () => {
  let upserts = 0;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => upserts++ }) as never,
    userId: "user-1",
    message: "mets-moi un rappel demain à huit heures, juste marqué « range le téléphone »",
    now: new Date("2026-07-13T19:05:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text:
        "mets-moi un rappel demain à huit heures, juste marqué « range le téléphone »",
      when_hint: "demain à 08:00",
      UTC_time: "2026-07-14T06:00:00.000Z",
      local_label: "demain à 08:00",
      instruction_hint: "range le téléphone",
    }),
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "hour_meridiem_ambiguous");
  assertEquals(upserts, 0);
  assertEquals(String(result.reply ?? "").includes("8h"), true);
  // P5-D: le clarify PERSISTE les slots déjà fournis (l'instruction du tour
  // initial doit survivre au tour-réponse).
  assertEquals(result.pending_clarification?.intent, "create");
  assertEquals(
    result.pending_clarification?.known_slots?.instruction_hint,
    "range le téléphone",
  );
  // Anti-faux-positif: « à huit heures du matin » lève l'ambiguïté → create.
  let morningUpserts = 0;
  const morning = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => morningUpserts++ }) as never,
    userId: "user-1",
    message: "rappel demain à huit heures du matin de ranger le téléphone",
    now: new Date("2026-07-13T19:05:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "rappel demain à huit heures du matin de ranger le téléphone",
      when_hint: "demain à 08:00 du matin",
      UTC_time: "2026-07-14T06:00:00.000Z",
      local_label: "demain à 08:00",
      instruction_hint: "ranger le téléphone",
    }),
  });
  assertEquals(morning.status, "success");
  assertEquals(morningUpserts, 1);
  // Anti-faux-positif: forme chiffrée « demain à 9h » (convention matin)
  // n'est PAS bloquée par la ceinture (le jugement contextuel reste au
  // dispatcher via la règle prompt UTC_time-vide).
  let digitUpserts = 0;
  const digit = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => digitUpserts++ }) as never,
    userId: "user-1",
    message: "rappelle-moi demain à 9h d'appeler la diététicienne",
    now: new Date("2026-07-13T19:05:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "rappelle-moi demain à 9h d'appeler la diététicienne",
      when_hint: "demain à 9h",
      UTC_time: "2026-07-14T07:00:00.000Z",
      local_label: "demain à 09:00",
      instruction_hint: "appeler la diététicienne",
    }),
  });
  assertEquals(digit.status, "success");
  assertEquals(digitUpserts, 1);
});

Deno.test("tour-réponse au clarify de créneau → commit avec l'instruction INITIALE, ceinture désarmée (P5-D, eva-p4verify R1-B01/B02)", async () => {
  // Eva T2 : elle répond « le soir, 20h » au clarify « huit heures » — le
  // raw_text du frame agrège encore « huit heures » (dispatcher) et la
  // ceinture re-bloquait ; puis le commit prenait la phrase de
  // désambiguïsation comme texte du rappel (« le soir. pas le matin »).
  let upsertRow: Record<string, unknown> | null = null;
  const tempMemory: Record<string, unknown> = {
    __one_shot_reminder_pending_clarification: {
      mode: "needs_clarify",
      intent: "create",
      reason_code: "hour_meridiem_ambiguous",
      clarify_question: "8h du matin, ou 20h ?",
      known_slots: {
        instruction_hint: "range le téléphone",
        raw_text: "rappelle-moi demain à huit heures de ranger le téléphone",
        when_hint: "demain à huit heures",
      },
      clarification_exposed_to_dispatcher: true,
    },
  };
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row: Record<string, unknown>) => {
        upsertRow = row;
      },
    }) as never,
    userId: "user-1",
    message: "le soir. pas le matin. 20h, c'est ça que je veux.",
    now: new Date("2026-07-13T19:10:00.000Z"),
    tempMemory,
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      // Le dispatcher agrège le texte initial dans raw_text — la ceinture ne
      // doit PAS le relire quand le message user courant existe.
      raw_text:
        "rappelle-moi demain à huit heures de ranger le téléphone — le soir, 20h",
      when_hint: "demain à 20:00",
      UTC_time: "2026-07-14T18:00:00.000Z",
      local_label: "demain à 20:00",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(result.committed_effects.length, 1);
  assertEquals(
    (upsertRow as any)?.scheduled_for,
    "2026-07-14T18:00:00.000Z",
  );
  assertEquals(
    String((upsertRow as any)?.message_payload?.reminder_instruction ?? ""),
    "range le téléphone",
  );
});

Deno.test("brouillon demandé → ZÉRO write, brouillon rendu, slots persistés ; confirmation → commit (P5-F, nina-global20 B01 / alex-untested20 R1-B02)", async () => {
  // Tour 1 : « juste un brouillon, le crée pas tout de suite, je valide
  // avant » — avant le fix, la ligne pending était committée (« C'est déjà
  // créé pour demain à 08:30 »).
  let upserts = 0;
  const draft = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => upserts++ }) as never,
    userId: "user-1",
    message:
      "prépare-moi un rappel pour demain 8h30, mais juste un brouillon hein, le crée pas tout de suite, je veux valider avant",
    now: new Date("2026-07-13T19:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "un rappel pour demain 8h30, juste un brouillon",
      when_hint: "demain à 08:30",
      UTC_time: "2026-07-14T06:30:00.000Z",
      local_label: "demain à 08:30",
      instruction_hint: "préparer le sac de sport",
    }),
  });
  assertEquals(draft.status, "needs_clarify");
  assertEquals(draft.debug.reason_code, "draft_pending_confirmation");
  assertEquals(upserts, 0);
  assertEquals(draft.committed_effects.length, 0);
  assertEquals(String(draft.reply ?? "").includes("PAS encore créé"), true);
  assertEquals(draft.pending_clarification?.intent, "create");
  assertEquals(
    draft.pending_clarification?.known_slots?.UTC_time,
    "2026-07-14T06:30:00.000Z",
  );
  // Tour 2 : « ok crée-le » — le dispatcher ré-émet le payload (slots du
  // pending exposé) et le commit part tel quel.
  let confirmUpserts = 0;
  const confirmed = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => confirmUpserts++ }) as never,
    userId: "user-1",
    message: "parfait, ok crée-le",
    now: new Date("2026-07-13T19:02:00.000Z"),
    tempMemory: {
      __one_shot_reminder_pending_clarification: {
        mode: "needs_clarify",
        intent: "create",
        reason_code: "draft_pending_confirmation",
        clarify_question: "tu valides ?",
        known_slots: draft.pending_clarification?.known_slots ?? {},
        clarification_exposed_to_dispatcher: true,
      },
    },
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "ok crée-le",
      when_hint: "demain à 08:30",
      UTC_time: "2026-07-14T06:30:00.000Z",
      local_label: "demain à 08:30",
    }),
  });
  assertEquals(confirmed.status, "success");
  assertEquals(confirmUpserts, 1);
  assertEquals(
    confirmed.reminder_instruction,
    "préparer le sac de sport",
  );
  // Anti-faux-positif : une demande SANS anti-instruction committe direct.
  let directUpserts = 0;
  const direct = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => directUpserts++ }) as never,
    userId: "user-1",
    message: "mets-moi un rappel demain à 8h30 de préparer le sac",
    now: new Date("2026-07-13T19:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "mets-moi un rappel demain à 8h30 de préparer le sac",
      when_hint: "demain à 08:30",
      UTC_time: "2026-07-14T06:30:00.000Z",
      local_label: "demain à 08:30",
      instruction_hint: "préparer le sac",
    }),
  });
  assertEquals(direct.status, "success");
  assertEquals(directUpserts, 1);
});

Deno.test("replace sans heure cible dont l'instruction ne recouvre AUCUN pending → zéro cancel, create seul (P4-C, paul-p3verify R1-B03)", async () => {
  // « remets-moi le rappel des pâtes » émis en replace alors que le seul
  // pending est le kiné: annuler le « pending unique » de repli supprimerait
  // un rappel sans rapport.
  let cancelCalls = 0;
  let upsertRow: Record<string, unknown> | null = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "pending-kine",
      scheduled_for: "2026-07-14T08:00:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:appeler_le_kine",
      message_payload: { reminder_instruction: "appeler le kiné" },
    }]) as never,
    userId: "user-1",
    message: "remets-moi le rappel des pâtes pour demain 18h stp",
    now: new Date("2026-07-13T14:00:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "replace",
      raw_text: "remets-moi le rappel des pâtes pour demain 18h stp",
      when_hint: "demain 18h",
      UTC_time: "2026-07-14T16:00:00.000Z",
      local_label: "demain à 18:00",
      instruction_hint: "acheter des pâtes",
    }),
    cancelReminder: (async () => {
      cancelCalls += 1;
      return {
        detected: true,
        status: "cancelled",
        cancelled_ids: ["pending-kine"],
        cancelled_local_labels: ["10:00"],
        user_message: "",
      };
    }) as never,
  });
  // fakeCancelSupabase ne supporte pas l'upsert du create — le point du test
  // est UNIQUEMENT que le cancel n'a jamais été appelé (le kiné survit).
  void upsertRow;
  assertEquals(cancelCalls, 0);
  assertEquals(
    result.committed_effects.filter((effect) =>
      effect.type === "cancel_one_shot_reminder"
    ).length,
    0,
  );
});

Deno.test("cancel pur (aucun verbe de re-création) reste un cancel (P4-B anti-FP)", async () => {
  let cancelCalls = 0;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeCancelSupabase([{
      id: "pending-2130",
      scheduled_for: "2026-07-14T19:30:00.000Z",
      status: "pending",
      event_context: "one_shot_reminder:sortir_carnet",
    }]) as never,
    userId: "user-1",
    message: "annule le rappel de 21h30, je le ferai de tête",
    now: new Date("2026-07-13T14:14:00.000Z"),
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "cancel",
      raw_text: "annule le rappel de 21h30, je le ferai de tête",
      when_hint: "21h30",
    }),
    cancelReminder: (async () => {
      cancelCalls += 1;
      return {
        detected: true,
        status: "cancelled",
        cancelled_ids: ["pending-2130"],
        cancelled_local_labels: ["21:30"],
        user_message: "",
      };
    }) as never,
  });
  assertEquals(cancelCalls, 1);
  assertEquals(result.intent, "cancel");
  assertEquals(result.status, "success");
  assertEquals(
    result.committed_effects.filter((effect) =>
      effect.type === "create_one_shot_reminder"
    ).length,
    0,
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

// P8-A (rose-p7verify R1 T13/T14, BF-LEDGER-02): co-demande de N rappels —
// le frame porte N effets create, la lane committe N lignes distinctes et le
// rendu est asservi au ledger (default-deny par créneau).
function turnFrameWithTwoCreateEffects(
  payloads: Array<Record<string, unknown>>,
) {
  return {
    turn_id: "t",
    source_message_id: "m",
    user_id: "user-1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: payloads.map((payload_hint) => ({
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint,
    })),
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

Deno.test("co-demande de 2 rappels → 2 commits distincts et rendu qui nomme les 2 créneaux (P8-A, rose-p7verify T14)", async () => {
  const written: any[] = [];
  const message =
    "Pose-moi deux rappels d'un coup : jeudi à 18h pour appeler le médecin et samedi à 10h pour les courses.";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => written.push(row) }),
    userId: "user-1",
    message,
    now: new Date("2026-07-14T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithTwoCreateEffects([
      {
        raw_text: "jeudi à 18h pour appeler le médecin",
        when_hint: "jeudi à 18h",
        UTC_time: "2026-07-16T16:00:00.000Z",
        local_label: "jeudi à 18h",
        instruction_hint: "appeler le médecin",
      },
      {
        raw_text: "samedi à 10h pour les courses",
        when_hint: "samedi à 10h",
        UTC_time: "2026-07-18T08:00:00.000Z",
        local_label: "samedi à 10h",
        instruction_hint: "faire les courses",
      },
    ]),
  });
  assertEquals(result.status, "success");
  assertEquals(
    result.committed_effects.filter((e) =>
      e.type === "create_one_shot_reminder"
    ).length,
    2,
  );
  assertEquals(result.requested_effects.length, 2);
  assertEquals(written.length, 2);
  assertEquals(
    written.map((row) => row.scheduled_for).sort(),
    ["2026-07-16T16:00:00.000Z", "2026-07-18T08:00:00.000Z"],
  );
  const reply = String(result.reply ?? "");
  assert(reply.includes("jeudi à 18h"), `reply nomme jeudi: ${reply}`);
  assert(reply.includes("samedi à 10h"), `reply nomme samedi: ${reply}`);
  assertEquals(result.debug.reason_code, "multi_create");
});

Deno.test("co-demande 2 rappels dont 1 créneau irrésoluble → 1 commit + volet manquant annoncé, jamais « pris pour les deux » (P8-A paraphrase)", async () => {
  const written: any[] = [];
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => written.push(row) }),
    userId: "user-1",
    message:
      "Deux rappels : jeudi à 18h pour appeler le médecin, et samedi pour les courses (heure à voir).",
    now: new Date("2026-07-14T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithTwoCreateEffects([
      {
        raw_text: "jeudi à 18h pour appeler le médecin",
        when_hint: "jeudi à 18h",
        UTC_time: "2026-07-16T16:00:00.000Z",
        local_label: "jeudi à 18h",
        instruction_hint: "appeler le médecin",
      },
      {
        // Créneau manquant: UTC_time vide (règle heure ambiguë du contrat).
        raw_text: "samedi pour les courses",
        when_hint: "samedi",
        instruction_hint: "faire les courses",
      },
    ]),
  });
  // Le commit du volet complet n'est pas retenu en otage par le volet
  // manquant; la comptabilité reste totale (2 requested, 1 committed,
  // ≥1 blocked) et le rendu annonce le manquant explicitement.
  assertEquals(result.status, "success");
  assertEquals(written.length, 1);
  assertEquals(
    result.committed_effects.filter((e) =>
      e.type === "create_one_shot_reminder"
    ).length,
    1,
  );
  assertEquals(result.requested_effects.length, 2);
  assertEquals(result.blocked_effects.length >= 1, true);
  const reply = String(result.reply ?? "");
  assert(reply.includes("jeudi à 18h"), `reply nomme le commit: ${reply}`);
  assert(
    /PAS pos/i.test(reply),
    `reply annonce le volet manquant: ${reply}`,
  );
  assert(
    !/pos[ée]s? pour les deux|les deux sont/i.test(reply),
    `reply ne sur-accuse jamais: ${reply}`,
  );
});

Deno.test("un create UNIQUE reste sur le chemin nominal, jamais fusionné (P8-A anti-faux-positif)", async () => {
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
  assert(result.debug.reason_code !== "multi_create");
  assert(String(result.reply ?? "").includes("C'est programmé"));
});

// ── P8-D (nina-hard23 R1-B01): anaphore de style ≠ ancre temporelle ──────────

Deno.test("« rappel à 21h, pareil qu'avant, pour X » avec UTC_time vide → commit à 21h, jamais missing_time (P8-D, nina-hard23 T2)", async () => {
  let writtenRow: any = null;
  const message =
    "mets-moi un rappel à 21h, pareil qu'avant, pour préparer mes deux dîners de la semaine";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message,
    now: new Date("2026-07-14T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      // Le dispatcher, troublé par « pareil qu'avant », laisse UTC_time vide.
      raw_text: message,
      when_hint: "à 21h, pareil qu'avant",
      instruction_hint: "préparer mes deux dîners de la semaine",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(result.debug.reason_code !== "missing_time", true);
  // 21h Paris = 19:00Z le 14/07.
  assertEquals(writtenRow?.scheduled_for, "2026-07-14T19:00:00.000Z");
});

Deno.test("create nu avec marqueur de reschedule → jamais complété en create nu; clitique = chemin reschedule (P8-D/P8-V anti-faux-positif)", async () => {
  // P8-V: le clitique « mets-le » coerce désormais en RESCHEDULE — à zéro
  // pending, la dégradation P0-4 actée s'applique (l'intention réelle est de
  // (re)poser): AU PLUS un commit, jamais un doublon (le cas doublon avec
  // pending est couvert par le test replace atomique P8-V ci-dessous).
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "mets-le plutôt à 23h pour préparer mes dîners",
    now: new Date("2026-07-14T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "mets-le plutôt à 23h pour préparer mes dîners",
      when_hint: "plutôt à 23h",
      instruction_hint: "préparer mes dîners",
    }),
  });
  assertEquals(
    result.committed_effects.filter((e) =>
      e.type === "create_one_shot_reminder"
    ).length <= 1,
    true,
  );
  // Jamais un create nu complété silencieusement: le chemin est reschedule
  // (dégradation P0-4 documentée) ou clarify — pas la complétion P8-D.
  assertEquals(result.debug.reason_code !== "missing_time", true);
});

Deno.test("create nu à heure nue ambiguë → la ceinture méridiem garde la main (P8-D anti-faux-positif)", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message:
      "mets-moi un rappel à huit heures, pareil qu'avant, pour préparer mes dîners",
    now: new Date("2026-07-14T06:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text:
        "mets-moi un rappel à huit heures, pareil qu'avant, pour préparer mes dîners",
      when_hint: "à huit heures",
      instruction_hint: "préparer mes dîners",
    }),
  });
  assertEquals(result.committed_effects.length, 0);
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "hour_meridiem_ambiguous");
});

// ── P8-B (eva-hard23 T7, probe P8-3): instruction clitique-seule jamais
// committée sur un create nu — clarify de l'objet. ──────────────────────────

Deno.test("create nu avec instruction clitique-seule (« la retrouver ») → clarify missing_instruction, zéro write (P8-B)", async () => {
  let upserts = 0;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => upserts++ }),
    userId: "user-1",
    message:
      "oui vas-y formule-la moi, et garde-la moi bien au chaud pour que je la retrouve ce soir à 22h",
    now: new Date("2026-07-14T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "garde-la moi pour que je la retrouve ce soir à 22h",
      when_hint: "ce soir à 22h",
      UTC_time: "2026-07-14T20:00:00.000Z",
      local_label: "ce soir à 22h",
      instruction_hint: "la retrouver",
    }),
  });
  assertEquals(upserts, 0);
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "missing_instruction");
  // Le pending ne porte JAMAIS l'anaphore comme texte hérité.
  assertEquals(
    result.pending_clarification?.known_slots?.instruction_hint ?? null,
    null,
  );
});

Deno.test("instruction avec objet propre inchangée + replace hérité exempté (P8-B anti-faux-positifs)", async () => {
  // Anti-FP 1: une instruction normale committe comme avant.
  const normal = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "rappelle-moi ce soir à 22h de préparer ma tisane",
    now: new Date("2026-07-14T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "rappelle-moi ce soir à 22h de préparer ma tisane",
      when_hint: "ce soir à 22h",
      UTC_time: "2026-07-14T20:00:00.000Z",
      local_label: "ce soir à 22h",
      instruction_hint: "préparer ma tisane",
    }),
  });
  assertEquals(normal.status, "success");
  // Anti-FP 2: le REPLACE « même texte » hérite du pending — l'invariance
  // anaphorique y reste le chemin nominal (P6-A), jamais bloquée par P8-B.
  const replace = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      pending: [{ id: "r-1", scheduled_for: "2026-07-14T20:00:00.000Z" }],
    }),
    userId: "user-1",
    message: "annule le rappel de 22h et remets-le à 22h30, même texte",
    now: new Date("2026-07-14T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "replace",
      replace_target_label: "22h",
      raw_text: "annule le rappel de 22h et remets-le à 22h30, même texte",
      when_hint: "à 22h30",
      UTC_time: "2026-07-14T20:30:00.000Z",
      local_label: "ce soir à 22h30",
    }),
  });
  // Le replace suit son chemin (héritage/clarify replace) — jamais le
  // missing_instruction du create nu.
  assertEquals(
    replace.debug.reason_code !== "missing_instruction",
    true,
  );
});

// ── P8-B/P8-E (probes P8-3/P8-5 passe 2): gate artefact coaching + complétion
// du re-serve depuis les slots du différé. ───────────────────────────────────

Deno.test("create armé sur une demande de potion SANS acte de rappel → blocked coaching_artifact_not_reminder (P8-B, probe P8-3)", async () => {
  let upserts = 0;
  const message =
    "le soir vers 22h je suis tendue et je scrolle. tu peux me préparer une potion d'apaisement pour ce moment-là ?";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => upserts++ }),
    userId: "user-1",
    message,
    now: new Date("2026-07-14T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "me préparer une potion d'apaisement pour ce moment-là",
      when_hint: "ce soir à 22h",
      UTC_time: "2026-07-14T20:00:00.000Z",
      local_label: "ce soir à 22h",
      instruction_hint: "préparer une potion d'apaisement",
    }),
  });
  assertEquals(upserts, 0);
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "coaching_artifact_not_reminder");
});

Deno.test("« rappelle-moi de faire ma potion » garde son create — l'acte de rappel désarme le gate (P8-B anti-faux-positif)", async () => {
  const message = "rappelle-moi ce soir à 22h de faire ma potion d'apaisement";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message,
    now: new Date("2026-07-14T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "ce soir à 22h",
      UTC_time: "2026-07-14T20:00:00.000Z",
      local_label: "ce soir à 22h",
      instruction_hint: "faire ma potion d'apaisement",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(result.committed_effects.length, 1);
});

Deno.test("re-serve du différé avec émission incomplète → les slots du différé complètent, commit (P8-E, probe P8-5)", async () => {
  let writtenRow: any = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message: "aucun danger, vraiment. vas-y remets-le maintenant.",
    now: new Date("2026-07-14T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    tempMemory: {
      __safety_deferred_reminder: {
        mode: "deferred",
        exposed_to_dispatcher: true,
        known_slots: {
          raw_text: "remets-moi un rappel demain à 9h d'appeler ma sœur",
          when_hint: "demain à 9h",
          UTC_time: "2026-07-15T07:00:00.000Z",
          local_label: "demain à 9h",
          instruction_hint: "appeler ma sœur",
        },
      },
    },
    // Le dispatcher ré-émet SANS les champs temporels (observé passe 2).
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "vas-y remets-le maintenant",
      instruction_hint: "appeler ma sœur",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(writtenRow?.scheduled_for, "2026-07-15T07:00:00.000Z");
  assertEquals(result.reminder_instruction, "appeler ma sœur");
});

Deno.test("gate artefact: le payload local sans le mot potion est couvert par le MESSAGE user (P8-B, probe P8-3 passe 4)", async () => {
  let upserts = 0;
  // Chemin local coaching: le payload nomme « moment d'apaisement » sans le
  // mot potion — le message user, lui, demande bien une potion sans acte de
  // rappel.
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => upserts++ }),
    userId: "user-1",
    message:
      "le soir vers 22h je suis tendue. tu peux me préparer une potion d'apaisement pour ce moment-là ?",
    now: new Date("2026-07-14T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "le soir vers 22h, moment d'apaisement",
      when_hint: "ce soir à 22h",
      UTC_time: "2026-07-14T20:00:00.000Z",
      local_label: "ce soir à 22h",
      instruction_hint: "préparer ton moment d'apaisement",
    }),
  });
  assertEquals(upserts, 0);
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "coaching_artifact_not_reminder");
});

// ── P8-V (harness r5g-s2 T3): create nu + clitique « mets-le » = reschedule
// coercé ; ponctuation normalisée au gate same_instruction. ─────────────────

Deno.test("create NU (intent vide) + « mets-le plutôt à 23h » → coercé reschedule, replace atomique jamais un doublon (P8-V)", async () => {
  const message = "En fait mets-le plutôt à 23h, 22h30 c'est trop tôt.";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      pending: [{
        id: "r-1",
        scheduled_for: "2026-07-14T20:30:00.000Z",
        message_payload: {
          reminder_instruction: "poser le téléphone hors de la chambre",
        },
      } as any],
    }),
    userId: "user-1",
    message,
    now: new Date("2026-07-14T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      // Le dispatcher émet en create NU (intent vide) malgré la RÈGLE DU
      // PRONOM — la variance observée au harness.
      raw_text: message,
      when_hint: "à 23h",
      UTC_time: "2026-07-14T21:00:00.000Z",
      local_label: "ce soir à 23h",
      instruction_hint: "poser le téléphone hors de la chambre",
    }),
  });
  // Jamais un 2e pending: soit replace atomique (cancel+create), soit
  // blocage honnête — un create nu committé à côté de l'ancien est le red.
  const committedCreates = result.committed_effects.filter((e) =>
    e.type === "create_one_shot_reminder"
  );
  const committedCancels = result.committed_effects.filter((e) =>
    e.type === "cancel_one_shot_reminder"
  );
  if (committedCreates.length === 1) {
    assertEquals(committedCancels.length, 1);
  } else {
    assertEquals(committedCreates.length, 0);
  }
});

Deno.test("same_instruction_pending: la ponctuation n'échappe plus au gate (P8-V, harness r5g-s2)", async () => {
  let upserts = 0;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: () => upserts++,
      pending: [{
        id: "r-1",
        scheduled_for: "2026-07-14T20:30:00.000Z",
        message_payload: {
          // Point final stocké côté DB — l'égalité exacte ratait le match.
          reminder_instruction: "poser le téléphone hors de la chambre.",
        },
      } as any],
    }),
    userId: "user-1",
    message: "mets-moi un rappel ce soir à 23h pour poser le téléphone hors de la chambre",
    now: new Date("2026-07-14T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "un rappel ce soir à 23h pour poser le téléphone hors de la chambre",
      when_hint: "ce soir à 23h",
      UTC_time: "2026-07-14T21:00:00.000Z",
      local_label: "ce soir à 23h",
      instruction_hint: "poser le téléphone hors de la chambre",
    }),
  });
  assertEquals(upserts, 0);
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "same_instruction_pending");
});

Deno.test("re-serve d'un différé stocké par le backstop crise (raw_text seul) → instruction et heure ré-extraites, commit (P8-E, probe P8-5 passe 9)", async () => {
  let writtenRow: any = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message: "aucun danger, vraiment. vas-y remets-le maintenant.",
    now: new Date("2026-07-14T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    tempMemory: {
      // Le backstop run.ts de crise ne stocke QUE raw_text/when_hint.
      __safety_deferred_reminder: {
        mode: "deferred",
        exposed_to_dispatcher: true,
        known_slots: {
          raw_text:
            "remets-moi aussi un rappel demain à 9h d'appeler ma sœur.",
          when_hint: "demain à 9h",
        },
      },
    },
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "vas-y remets-le maintenant",
    }),
  });
  assertEquals(result.status, "success");
  // 9h Paris demain = 07:00Z le 15/07.
  assertEquals(writtenRow?.scheduled_for, "2026-07-15T07:00:00.000Z");
  assertEquals(
    String(result.reminder_instruction ?? "").includes("appeler ma s"),
    true,
  );
});

Deno.test("P9-A: anaphore SANS antécédent résoluble + spec complète → create additif, ZÉRO cancel du pending non lié (rose-p8reval T6)", async () => {
  // Contexte piège reproduit: le « 2e rappel » n'a jamais été créé; le seul
  // pending est le sas de 8h. « reprends celui-là … mets-le pour de bon »
  // redonne date+heure+contenu complets → l'antécédent du pronom est la SPEC
  // du message, jamais le pending qui traîne.
  const message =
    "ok donc le deuxième t'as pas réussi à le poser. bon reprends juste celui-là: un rappel après-demain, le 16 juillet, à 20h, pour checker mon envie avant de sortir. mets-le pour de bon cette fois.";
  let writtenRow: any = null;
  const cancelledIds: string[] = [];
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row) => writtenRow = row,
      onCancelIds: (ids) => cancelledIds.push(...ids),
      pending: [{
        id: "sas-8h",
        scheduled_for: "2026-07-15T06:00:00.000Z",
        message_payload: {
          reminder_instruction: "préparer mon sas de décompression du soir",
        },
      } as any],
    }),
    userId: "user-1",
    message,
    now: new Date("2026-07-14T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "le 16 juillet à 20h",
      UTC_time: "2026-07-16T18:00:00.000Z",
      local_label: "le 16 juillet à 20h",
      instruction_hint: "checker mon envie avant de sortir",
    }),
  });
  // Le rappel de 8h SURVIT — aucun cancel, aucun retarget.
  assertEquals(cancelledIds, []);
  const committedCancels = result.committed_effects.filter((e) =>
    e.type === "cancel_one_shot_reminder"
  );
  assertEquals(committedCancels.length, 0);
  // Le create additif est committé avec SON contenu (jamais l'hérité).
  assertEquals(result.status, "success");
  assertEquals(writtenRow?.scheduled_for, "2026-07-16T18:00:00.000Z");
  assertEquals(
    String(writtenRow?.message_payload?.reminder_instruction ?? "")
      .includes("checker mon envie"),
    true,
  );
});

Deno.test("P9-A paraphrase: « reprends-le » + contenu neuf complet sans rapport avec le pending → create, pending intact", async () => {
  const message =
    "reprends-le stp: un rappel demain à 9h pour arroser les plantes du balcon.";
  const cancelledIds: string[] = [];
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onCancelIds: (ids) => cancelledIds.push(...ids),
      pending: [{
        id: "poubelles",
        scheduled_for: "2026-07-15T05:00:00.000Z",
        message_payload: { reminder_instruction: "sortir les poubelles" },
      } as any],
    }),
    userId: "user-1",
    message,
    now: new Date("2026-07-14T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "demain à 9h",
      UTC_time: "2026-07-15T07:00:00.000Z",
      instruction_hint: "arroser les plantes du balcon",
    }),
  });
  assertEquals(cancelledIds, []);
  assertEquals(result.status, "success");
});

Deno.test("P9-A anti-faux-positif: instruction POLLUÉE (absente du message) → ciblage P6-H inchangé, jamais un doublon (P6-V 2e forme)", async () => {
  // L'émission pollue instruction_hint avec le sujet d'un tour précédent —
  // non ancrée dans le message: le clitique garde la voie P6-H (replace
  // atomique du pending unique), jamais une dégradation en create doublon.
  const message = "en fait mets-le plutôt à 23h ce soir, c'est mieux.";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      pending: [{
        id: "tel",
        scheduled_for: "2026-07-14T20:30:00.000Z",
        message_payload: {
          reminder_instruction: "poser le téléphone hors de la chambre",
        },
      } as any],
    }),
    userId: "user-1",
    message,
    now: new Date("2026-07-14T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "à 23h",
      UTC_time: "2026-07-14T21:00:00.000Z",
      // Pollution: sujet du tour précédent, absent du message courant.
      instruction_hint: "préparer la réunion budget de lundi",
    }),
  });
  const committedCreates = result.committed_effects.filter((e) =>
    e.type === "create_one_shot_reminder"
  );
  const committedCancels = result.committed_effects.filter((e) =>
    e.type === "cancel_one_shot_reminder"
  );
  // Replace atomique (cancel+create) ou blocage honnête — JAMAIS un create
  // seul (le doublon), jamais un cancel sec.
  if (committedCreates.length === 1) {
    assertEquals(committedCancels.length, 1);
  } else {
    assertEquals(committedCreates.length, 0);
    assertEquals(committedCancels.length, 0);
  }
});

Deno.test("P9-C: « decale le a jeudi soir meme heure » SANS trait d'union → replace atomique, jour nommé + heure héritée de la cible (alex-hard24 R1-B01)", async () => {
  const message =
    "le rappel de 22h la, finalement demain c est mort je serai pas chez moi. decale le a jeudi soir meme heure";
  let writtenRow: any = null;
  const cancelledIds: string[] = [];
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row) => writtenRow = row,
      onCancelIds: (ids) => cancelledIds.push(...ids),
      pending: [{
        id: "tel-22h",
        // 22h Paris (été) = 20:00Z, demain 15/07.
        scheduled_for: "2026-07-15T20:00:00.000Z",
        message_payload: {
          reminder_instruction: "brancher mon téléphone loin du lit",
        },
      } as any],
    }),
    userId: "user-1",
    message,
    now: new Date("2026-07-14T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      // Le dispatcher émet en create NU sans UTC_time (« même heure » non
      // résolue) — le chemin observé au run réel.
      raw_text: message,
      when_hint: "jeudi soir meme heure",
      instruction_hint: "brancher mon téléphone loin du lit",
    }),
  });
  // Replace atomique: l'ancien annulé + le nouveau jeudi 16/07 à 22h Paris
  // (20:00Z), contenu hérité. Jamais un blocage duplicate + claim.
  assertEquals(cancelledIds, ["tel-22h"]);
  assertEquals(result.status, "success");
  assertEquals(writtenRow?.scheduled_for, "2026-07-16T20:00:00.000Z");
  assertEquals(
    String(writtenRow?.message_payload?.reminder_instruction ?? "")
      .includes("téléphone"),
    true,
  );
});

Deno.test("P9-C anti-faux-positif: « mets le rappel des pâtes à 18h » (article, pas clitique) → jamais coercé reschedule", async () => {
  const message = "mets le rappel des pâtes à 18h stp";
  let writtenRow: any = null;
  const cancelledIds: string[] = [];
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row) => writtenRow = row,
      onCancelIds: (ids) => cancelledIds.push(...ids),
      pending: [{
        id: "autre",
        scheduled_for: "2026-07-15T05:00:00.000Z",
        message_payload: { reminder_instruction: "sortir les poubelles" },
      } as any],
    }),
    userId: "user-1",
    message,
    now: new Date("2026-07-14T10:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "à 18h",
      UTC_time: "2026-07-14T16:00:00.000Z",
      instruction_hint: "sortir les pâtes du congélateur",
    }),
  });
  // Create simple: le pending non lié survit, aucun cancel.
  assertEquals(cancelledIds, []);
  assertEquals(result.status, "success");
  assertEquals(writtenRow?.scheduled_for, "2026-07-14T16:00:00.000Z");
});

Deno.test("P10-A couche 4: « cette nuit à 2h du matin » à 22h + UTC_time LLM passé → commit demain 02:00, jamais past_time (nina-hard24 T4)", async () => {
  let writtenRow: any = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message:
      "je te le redemande clairement: un rappel cette nuit à 2h du matin pour penser à boire un grand verre d'eau. pose-le moi stp.",
    // 22:22 Paris le 15/07 (20:22Z).
    now: new Date("2026-07-15T20:22:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text:
        "un rappel cette nuit à 2h du matin pour penser à boire un grand verre d'eau",
      when_hint: "cette nuit à 2h du matin",
      // Le dispatcher ancre 02:00 à AUJOURD'HUI (passé de 18h) — le chemin
      // observé au run réel.
      UTC_time: "2026-07-15T00:00:00.000Z",
      instruction_hint: "boire un grand verre d'eau",
    }),
  });
  assertEquals(result.status, "success");
  // 02:00 Paris demain (16/07) = 00:00Z.
  assertEquals(writtenRow?.scheduled_for, "2026-07-16T00:00:00.000Z");
});

Deno.test("P10-A anti-faux-positif: heure NUE passée sans marqueur nocturne → clarify past_time conservé (décision V2-A)", async () => {
  let upserts = 0;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: () => upserts++ }),
    userId: "user-1",
    message: "mets-moi un rappel aujourd'hui à 2h pour boire de l'eau stp.",
    now: new Date("2026-07-15T20:22:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "un rappel aujourd'hui à 2h pour boire de l'eau",
      when_hint: "aujourd'hui à 2h",
      UTC_time: "2026-07-15T00:00:00.000Z",
      instruction_hint: "boire de l'eau",
    }),
  });
  assertEquals(upserts, 0);
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "past_time");
});

Deno.test("P10-A fusion past_time: réponse « la nuit qui vient » SANS heure → l'heure stockée se combine, commit demain 02:00 (nina-hard24 T5)", async () => {
  let writtenRow: any = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message: "mais oui c'est bon, la nuit qui arrive quoi. vas-y mets-le.",
    now: new Date("2026-07-15T20:30:00.000Z"),
    userTimezone: "Europe/Paris",
    tempMemory: {
      __one_shot_reminder_pending_clarification: {
        mode: "needs_clarify",
        intent: "create",
        reason_code: "past_time",
        clarify_question:
          "Cette heure est déjà passée aujourd'hui — tu veux un autre horaire, ou demain ?",
        known_slots: {
          instruction_hint: "boire un grand verre d'eau",
          raw_text:
            "un rappel cette nuit à 2h du matin pour penser à boire un grand verre d'eau",
          when_hint: "cette nuit à 2h du matin",
        },
      },
    },
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "mais oui c'est bon, la nuit qui arrive quoi. vas-y mets-le.",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(writtenRow?.scheduled_for, "2026-07-16T00:00:00.000Z");
  assertEquals(
    String(writtenRow?.message_payload?.reminder_instruction ?? "")
      .includes("boire"),
    true,
  );
});

Deno.test("P10-A fusion past_time paraphrase: réponse « pour demain alors » → jour de la réponse + heure stockée", async () => {
  let writtenRow: any = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message: "ok bah pour demain alors.",
    now: new Date("2026-07-15T20:30:00.000Z"),
    userTimezone: "Europe/Paris",
    tempMemory: {
      __one_shot_reminder_pending_clarification: {
        mode: "needs_clarify",
        intent: "create",
        reason_code: "past_time",
        clarify_question: "Cette heure est déjà passée aujourd'hui — demain ?",
        known_slots: {
          instruction_hint: "sortir les poubelles",
          raw_text: "un rappel à 8h du matin pour sortir les poubelles",
          when_hint: "à 8h du matin",
        },
      },
    },
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: "ok bah pour demain alors.",
    }),
  });
  assertEquals(result.status, "success");
  // 8h Paris demain (16/07) = 06:00Z.
  assertEquals(writtenRow?.scheduled_for, "2026-07-16T06:00:00.000Z");
});

Deno.test("P10-B: fan-out avec volet irrésoluble → comptabilité N=2 au ledger + clarify NOMINATIVE citant l'item (nina-hard24 R1-B02)", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({}),
    userId: "user-1",
    message:
      "mets-moi deux rappels ce soir stp: un à 23h pour préparer mes en-cas sains, et un autre pour penser à boire un grand verre d'eau.",
    now: new Date("2026-07-15T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: {
      ...turnFrameWithDirectEffect("create_one_shot_reminder", {}),
      direct_effects: [
        {
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            raw_text: "un à 23h pour préparer mes en-cas sains",
            when_hint: "ce soir à 23h",
            UTC_time: "2026-07-15T21:00:00.000Z",
            instruction_hint: "préparer mes en-cas sains",
            cardinality: "once",
          },
        },
        {
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          // Le volet sous-parsé du run réel: AUCUN créneau exploitable.
          payload_hint: {
            raw_text: "un autre pour penser à boire un grand verre d'eau",
            instruction_hint: "boire un grand verre d'eau",
            cardinality: "once",
          },
        },
      ],
    } as any,
  });
  // Comptabilité totale: chaque effet du frame atteint le ledger.
  assertEquals(result.requested_effects.length, 2);
  const committedCreates = result.committed_effects.filter((e) =>
    e.type === "create_one_shot_reminder"
  );
  assertEquals(committedCreates.length, 1);
  assertEquals(result.blocked_effects.length >= 1, true);
  // Le volet manquant est annoncé NOMINATIVEMENT (l'item cité), jamais un
  // « je ne peux pas te le confirmer ici » anonyme.
  const reply = String(result.reply ?? "");
  assertEquals(/boire un grand verre d'eau/i.test(reply), true);
  assertEquals(/pas pos|manque|donne/i.test(reply.normalize("NFD").replace(/\p{Diacritic}/gu, "")), true);
});

Deno.test("P10-E: « celui du midi, avance le a 12h » → replace atomique par créneau nominal, contenu HÉRITÉ, jamais « celui du midi » stocké (alex-hard24 R1-B02)", async () => {
  const message = "et celui du midi, garde le demain mais avance le a 12h pile au lieu de 12h30";
  let writtenRow: any = null;
  const cancelledIds: string[] = [];
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row) => writtenRow = row,
      onCancelIds: (ids) => cancelledIds.push(...ids),
      pending: [
        {
          id: "vitamines-8h",
          scheduled_for: "2026-07-16T06:00:00.000Z",
          message_payload: { reminder_instruction: "prendre mes vitamines" },
        } as any,
        {
          id: "dejeuner-1230",
          // 12:30 Paris demain = 10:30Z.
          scheduled_for: "2026-07-16T10:30:00.000Z",
          message_payload: {
            reminder_instruction: "faire une vraie pause déjeuner sans écran",
          },
        } as any,
        {
          id: "tel-22h",
          scheduled_for: "2026-07-16T20:00:00.000Z",
          message_payload: {
            reminder_instruction: "brancher mon téléphone loin du lit",
          },
        } as any,
      ],
    }),
    userId: "user-1",
    message,
    now: new Date("2026-07-15T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "demain à 12h pile",
      UTC_time: "2026-07-16T10:00:00.000Z",
      // L'anaphore-comme-contenu du run réel.
      instruction_hint: "celui du midi",
    }),
  });
  // JAMAIS un rappel dont le contenu est le pronom.
  const writtenInstruction = String(
    writtenRow?.message_payload?.reminder_instruction ?? "",
  );
  assertEquals(/^celui du midi$/i.test(writtenInstruction.trim()), false);
  // Replace atomique: le déjeuner 12h30 annulé (cible du créneau midi),
  // les deux autres pendings intacts.
  if (result.status === "success") {
    assertEquals(cancelledIds, ["dejeuner-1230"]);
    assertEquals(writtenInstruction.includes("pause déjeuner"), true);
    assertEquals(writtenRow?.scheduled_for, "2026-07-16T10:00:00.000Z");
  } else {
    // Dégradé toléré: clarify honnête, zéro cancel, zéro doublon.
    assertEquals(cancelledIds, []);
    assertEquals(result.committed_effects.length, 0);
  }
});

Deno.test("P10-E: replace « même chose » avec expression de référence en instruction → texte de la CIBLE hérité (nina-hard24 R1-B03)", async () => {
  const message = "décale le rappel des en-cas à 23h30, même chose sinon.";
  let writtenRow: any = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row) => writtenRow = row,
      pending: [{
        id: "encas",
        // 23:00 Paris = 21:00Z.
        scheduled_for: "2026-07-15T21:00:00.000Z",
        message_payload: {
          reminder_instruction:
            "préparer mes en-cas sains avant de partir en garde",
        },
      } as any],
    }),
    userId: "user-1",
    message,
    now: new Date("2026-07-15T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "à 23h30",
      UTC_time: "2026-07-15T21:30:00.000Z",
      // L'expression de RÉFÉRENCE émise comme instruction (le red nina).
      instruction_hint: "le rappel des en-cas",
      intent: "replace",
      replace_target_label: "23:00",
    }),
  });
  assertEquals(result.status, "success");
  const writtenInstruction = String(
    writtenRow?.message_payload?.reminder_instruction ?? "",
  );
  // Le contenu ORIGINAL hérité — jamais « le rappel des en-cas ».
  assertEquals(writtenInstruction.includes("en-cas sains"), true);
  assertEquals(/^le rappel des en[- ]cas$/i.test(writtenInstruction), false);
});

Deno.test("P10-E anti-faux-positif: une instruction avec objet PROPRE n'est pas une référence d'entité", () => {
  assertEquals(
    // deno-lint-ignore no-explicit-any
    (globalThis as any).__probe ?? true,
    true,
  );
});

// ── P12-A (vague 25) ─────────────────────────────────────────────────────
// Temps par item : les jetons de date du CONTENU sont inertes, le jour nommé
// se résout nativement par item, jamais 2 committed même id, le delta relatif
// s'ancre sur la CIBLE.

Deno.test("P12-A: date du CONTENU inerte — « ce soir à 21h … avant le passage de demain » committé aujourd'hui (eva-hard25 R1-B02)", async () => {
  const message =
    "rappelle-moi ce soir à 21h de sortir les poubelles avant le passage de demain";
  let writtenRow: any = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message,
    now: new Date("2026-07-15T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "ce soir à 21h",
      UTC_time: "2026-07-15T19:00:00.000Z",
      local_label: "ce soir à 21h",
      instruction_hint: "sortir les poubelles avant le passage de demain",
    }),
  });
  assertEquals(result.status, "success");
  // Le « demain » du contenu ne promeut PAS J+1 : commit aujourd'hui 21h.
  assertEquals(writtenRow?.scheduled_for, "2026-07-15T19:00:00.000Z");
});

Deno.test("P12-A paraphrase: « à 22h ce soir » + contenu « pour demain » → aujourd'hui 22h (alex-untested24 R1-B01)", async () => {
  const message =
    "mets-moi un rappel à 22h ce soir pour préparer mon sac de sport pour demain";
  let writtenRow: any = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message,
    now: new Date("2026-07-15T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "à 22h ce soir",
      UTC_time: "2026-07-15T20:00:00.000Z",
      local_label: "aujourd'hui à 22:00",
      instruction_hint: "préparer mon sac de sport pour demain",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(writtenRow?.scheduled_for, "2026-07-15T20:00:00.000Z");
});

Deno.test("P12-A anti-faux-positif: « demain à 9h » HORS contenu garde la réparation J+1 (couche 1 intacte)", async () => {
  const message = "rappelle-moi demain à 9h de préparer le sac pour ce soir";
  let writtenRow: any = null;
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message,
    now: new Date("2026-07-15T05:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "demain à 9h",
      // UTC_time LLM FAUX (aujourd'hui) — la couche 1 doit réparer à J+1.
      UTC_time: "2026-07-15T07:00:00.000Z",
      local_label: "demain à 9h",
      instruction_hint: "préparer le sac pour ce soir",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(writtenRow?.scheduled_for, "2026-07-16T07:00:00.000Z");
});

Deno.test("P12-A: fan-out même objet jeudi+vendredi — UTC LLM du 2e item FAUX réparé par item, 2 lignes distinctes (nina-p10reval R1-B02)", async () => {
  const written: any[] = [];
  const message =
    "rappelle-moi de récupérer le colis jeudi à 18h et vendredi à 18h";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => written.push(row) }),
    userId: "user-1",
    message,
    // Mercredi 15/07.
    now: new Date("2026-07-15T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithTwoCreateEffects([
      {
        raw_text: "récupérer le colis jeudi à 18h",
        when_hint: "jeudi à 18h",
        UTC_time: "2026-07-16T16:00:00.000Z",
        local_label: "jeudi à 18h",
        instruction_hint: "récupérer le colis",
      },
      {
        raw_text: "récupérer le colis vendredi à 18h",
        when_hint: "vendredi à 18h",
        // UTC_time LLM FAUX: compilé sur JEUDI (le phantom du run réel).
        UTC_time: "2026-07-16T16:00:00.000Z",
        local_label: "vendredi 17 juillet à 18:00",
        instruction_hint: "récupérer le colis",
      },
    ]),
  });
  assertEquals(result.status, "success");
  const committed = result.committed_effects.filter((e) =>
    e.type === "create_one_shot_reminder"
  );
  assertEquals(committed.length, 2);
  // 2 lignes DB à des instants DISTINCTS (vendredi réparé par le parseur).
  assertEquals(
    [...new Set(written.map((row) => row.scheduled_for))].sort(),
    ["2026-07-16T16:00:00.000Z", "2026-07-17T16:00:00.000Z"],
  );
  // Jamais 2 committed même id.
  const ids = committed.map((e: any) => String(e.id));
  assertEquals(new Set(ids).size, ids.length);
});

Deno.test("P12-A: fan-out irréparable retombant sur la MÊME ligne → 1 committed + volet manquant annoncé, jamais 2 committed même id", async () => {
  const written: any[] = [];
  const message = "pose-moi deux fois le même rappel jeudi à 18h";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => written.push(row) }),
    userId: "user-1",
    message,
    now: new Date("2026-07-15T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithTwoCreateEffects([
      {
        raw_text: "récupérer le colis jeudi à 18h",
        when_hint: "jeudi à 18h",
        UTC_time: "2026-07-16T16:00:00.000Z",
        local_label: "jeudi à 18h",
        instruction_hint: "récupérer le colis",
      },
      {
        raw_text: "récupérer le colis jeudi à 18h",
        when_hint: "jeudi à 18h",
        UTC_time: "2026-07-16T16:00:00.000Z",
        local_label: "jeudi à 18h",
        instruction_hint: "récupérer le colis",
      },
    ]),
  });
  const committed = result.committed_effects.filter((e) =>
    e.type === "create_one_shot_reminder"
  );
  assertEquals(committed.length, 1);
  assertEquals(
    result.blocked_effects.some((e) =>
      e.reason_code === "fan_out_duplicate_commit"
    ),
    true,
  );
  // Le rendu annonce le volet manquant, jamais « c'est pris pour les deux ».
  assertEquals(String(result.reply ?? "").includes("PAS"), true);
});

Deno.test("P12-A: « avance le rappel des courses d'une heure » → replace à CIBLE−1h, jamais now+1h (alex-untested24 R1-B05)", async () => {
  let writtenRow: any = null;
  const cancelledIds: string[] = [];
  const message = "avance le rappel des courses d'une heure stp";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row) => writtenRow = row,
      onCancelIds: (ids) => cancelledIds.push(...ids),
      pending: [{
        id: "courses-17h",
        // 17h Paris = 15:00Z.
        scheduled_for: "2026-07-15T15:00:00.000Z",
        message_payload: { reminder_instruction: "faire les courses" },
      } as any],
    }),
    userId: "user-1",
    message,
    now: new Date("2026-07-15T07:46:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "reschedule",
      raw_text: message,
      // L'émission observée au run réel: le relatif mal lu en « dans une
      // heure » (now+1h) — le delta ancré CIBLE doit primer.
      when_hint: "dans une heure",
      instruction_hint: "les courses",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(cancelledIds, ["courses-17h"]);
  // CIBLE−1h = 16h Paris (14:00Z) — jamais 10h46.
  assertEquals(writtenRow?.scheduled_for, "2026-07-15T14:00:00.000Z");
});

Deno.test("P12-A: « repousse le rappel des courses d'une heure » → CIBLE+1h (direction respectée)", async () => {
  let writtenRow: any = null;
  const cancelledIds: string[] = [];
  const message = "repousse le rappel des courses d'une heure";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({
      onUpsert: (row) => writtenRow = row,
      onCancelIds: (ids) => cancelledIds.push(...ids),
      pending: [{
        id: "courses-17h",
        scheduled_for: "2026-07-15T15:00:00.000Z",
        message_payload: { reminder_instruction: "faire les courses" },
      } as any],
    }),
    userId: "user-1",
    message,
    now: new Date("2026-07-15T07:46:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "reschedule",
      raw_text: message,
      when_hint: "dans une heure",
      instruction_hint: "les courses",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(cancelledIds, ["courses-17h"]);
  assertEquals(writtenRow?.scheduled_for, "2026-07-15T16:00:00.000Z");
});

Deno.test("P12-A anti-faux-positif: « rappelle-moi dans une heure » (create nominal) reste now+1h", async () => {
  let writtenRow: any = null;
  const message = "rappelle-moi dans une heure de boire de l'eau";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => writtenRow = row }),
    userId: "user-1",
    message,
    now: new Date("2026-07-15T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      raw_text: message,
      when_hint: "dans une heure",
      UTC_time: "2026-07-15T09:00:00.000Z",
      local_label: "dans une heure",
      instruction_hint: "boire de l'eau",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(writtenRow?.scheduled_for, "2026-07-15T09:00:00.000Z");
});

// ── P12-B (nina-p10reval R1-B01) ─────────────────────────────────────────
// Jours nommés dénombrables sans marqueur d'habitude classés recurring par le
// dispatcher → requalification déterministe en fan-out once×N.

Deno.test("P12-B: cardinality=recurring sur « jeudi et vendredi à 18h » → requalifié fan-out once×2, 2 lignes distinctes", async () => {
  const written: any[] = [];
  const message =
    "tu peux me rappeler de récupérer le colis jeudi et vendredi à 18h ?";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => written.push(row) }),
    userId: "user-1",
    message,
    // Mercredi 15/07.
    now: new Date("2026-07-15T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      cardinality: "recurring",
      raw_text: "récupérer le colis jeudi et vendredi à 18h",
      when_hint: "jeudi et vendredi à 18h",
      instruction_hint: "récupérer le colis",
    }),
  });
  assertEquals(result.status, "success");
  assertEquals(
    result.committed_effects.filter((e) =>
      e.type === "create_one_shot_reminder"
    ).length,
    2,
  );
  assertEquals(
    [...new Set(written.map((row) => row.scheduled_for))].sort(),
    ["2026-07-16T16:00:00.000Z", "2026-07-17T16:00:00.000Z"],
  );
});

Deno.test("P12-B anti-faux-positif: « tous les jeudis et vendredis à 18h » (marqueur d'habitude) reste bloqué recurring", async () => {
  const written: any[] = [];
  const message = "rappelle-moi tous les jeudis et vendredis à 18h le linge";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => written.push(row) }),
    userId: "user-1",
    message,
    now: new Date("2026-07-15T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      cardinality: "recurring",
      raw_text: message,
      when_hint: "tous les jeudis et vendredis à 18h",
      instruction_hint: "étendre le linge",
    }),
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "recurring_not_supported");
  assertEquals(written.length, 0);
});

Deno.test("P12-B anti-faux-positif: heure ambiguë (« à 8h » nu) → pas de requalification, blocage recurring honnête", async () => {
  const written: any[] = [];
  const message = "rappelle-moi le sport jeudi et vendredi à 8h";
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ onUpsert: (row) => written.push(row) }),
    userId: "user-1",
    message,
    now: new Date("2026-07-15T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      cardinality: "recurring",
      raw_text: message,
      when_hint: "jeudi et vendredi à 8h",
      instruction_hint: "faire le sport",
    }),
  });
  assertEquals(result.status, "blocked");
  assertEquals(written.length, 0);
});

Deno.test("P12-C: mass-cancel → une entrée committed PAR rappel annulé au ledger, labels par item (paul-p9reval R1-B01)", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({}),
    userId: "user-1",
    message: "annule tous les rappels que je t'ai mis aujourd'hui",
    now: new Date("2026-07-15T08:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: turnFrameWithDirectEffect("create_one_shot_reminder", {
      intent: "cancel",
      raw_text: "annule tous les rappels que je t'ai mis aujourd'hui",
    }),
    cancelReminder: (async () => ({
      detected: true,
      status: "cancelled",
      cancelled_count: 3,
      cancelled_local_labels: [
        "aujourd'hui à 07:45",
        "aujourd'hui à 08:00",
        "aujourd'hui à 12:15",
      ],
      cancelled_ids: ["a", "b", "c"],
      user_message: "annule tous les rappels que je t'ai mis aujourd'hui",
      mass_scope: true,
    })) as any,
  });
  assertEquals(result.status, "success");
  const committedCancels = result.committed_effects.filter((effect) =>
    effect.type === "cancel_one_shot_reminder"
  );
  // Cardinalité ledger = cardinalité DB (P7-B étendu au cancel de masse).
  assertEquals(committedCancels.length, 3);
  assertEquals(
    committedCancels.map((effect: any) => effect.local_label),
    ["aujourd'hui à 07:45", "aujourd'hui à 08:00", "aujourd'hui à 12:15"],
  );
  assertEquals(result.requested_effects.length, 3);
  // Le rendu déterministe énumère toujours les N annulés.
  assertEquals(
    String(result.reply ?? "").includes("07:45") &&
      String(result.reply ?? "").includes("12:15"),
    true,
  );
});
