import { assertEquals } from "jsr:@std/assert@1";

import {
  classifyTemplateReplyChoice,
  findTemplateButtonForFlag,
  type LastTemplateContext,
  mapTemplateChoiceToFlags,
  materializeTemplateContext,
  resolveLastTemplateContext,
} from "./template_context.ts";

type Row = Record<string, any>;

function createAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const state = {
        rows: [...(tables[table] ?? [])],
        filters: [] as Array<(row: Row) => boolean>,
      };
      const builder = {
        select(_columns: string) {
          return builder;
        },
        eq(key: string, value: unknown) {
          state.filters.push((row) => row[key] === value);
          return builder;
        },
        in(key: string, values: unknown[]) {
          state.filters.push((row) => values.includes(row[key]));
          return builder;
        },
        gte(key: string, value: unknown) {
          state.filters.push((row) => String(row[key] ?? "") >= String(value));
          return builder;
        },
        filter(key: string, op: string, value: unknown) {
          if (key === "payload->>event_context" && op === "eq") {
            state.filters.push((row) => row.payload?.event_context === value);
          }
          return builder;
        },
        order(key: string, options: { ascending?: boolean }) {
          state.rows.sort((a, b) => {
            const result = String(a[key] ?? "").localeCompare(
              String(b[key] ?? ""),
            );
            return options.ascending ? result : -result;
          });
          return builder;
        },
        limit(_value: number) {
          return builder;
        },
        maybeSingle() {
          const rows = state.rows.filter((row) =>
            state.filters.every((filter) => filter(row))
          );
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
      };
      return builder;
    },
  };
}

function outbound(overrides: Row): Row {
  return {
    user_id: "u1",
    message_type: "template",
    status: "sent",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {},
    graph_payload: {},
    ...overrides,
  };
}

Deno.test("last template resolution gives reply wamid priority over latest template", async () => {
  const admin = createAdmin({
    whatsapp_outbound_messages: [
      outbound({
        provider_message_id: "wamid.reply",
        created_at: new Date(Date.now() - 60_000).toISOString(),
        metadata: { template_name: "sophia_optin_v2", purpose: "optin" },
      }),
      outbound({
        provider_message_id: "wamid.latest",
        created_at: new Date().toISOString(),
        metadata: {
          template_name: "sophia_checkin_v2",
          purpose: "scheduled_checkin",
        },
      }),
    ],
  });

  const context = await resolveLastTemplateContext({
    admin,
    userId: "u1",
    replyToWamid: "wamid.reply",
  });
  assertEquals(context?.name, "sophia_optin_v2");
  assertEquals(context?.wamid, "wamid.reply");
});

Deno.test("unknown catalog template is treated as unresolved", () => {
  const context = materializeTemplateContext({
    row: outbound({
      provider_message_id: "wamid.unknown",
      metadata: { template_name: "missing_template_v99" },
    }),
  });
  assertEquals(context, null);
});

Deno.test("template context is bounded by 24h and pending expiry", () => {
  const old = materializeTemplateContext({
    nowMs: Date.now(),
    row: outbound({
      created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      metadata: { template_name: "sophia_checkin_v2" },
    }),
  });
  const expired = materializeTemplateContext({
    nowMs: Date.now(),
    pendingExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    row: outbound({
      metadata: { template_name: "sophia_checkin_v2" },
    }),
  });
  assertEquals(old, null);
  assertEquals(expired, null);
});

Deno.test("template button mapping produces only the expected existing flags", () => {
  const cases: Array<[string, string, [boolean, boolean, boolean]]> = [
    ["sophia_optin_v2", "Absolument !", [true, false, false]],
    ["sophia_optin_winback_v2", "C'est bien moi !", [true, false, false]],
    ["global_reach_template", "Oui!", [false, true, false]],
    ["global_reach_template", "Plus tard!", [false, false, true]],
    ["sophia_reminder_consent_v1_", "Avec plaisir !", [false, true, false]],
    ["sophia_reminder_consent_v1_", "Pas maintenant", [false, false, true]],
    ["end_subscription_v1", "Avec plaisir!", [false, true, false]],
    ["end_subscription_v1", "Pas pour le moment!", [false, false, true]],
    ["end_trial_v1", "C'est parti !", [false, true, false]],
    ["end_trial_v1", "Pas pour le moment", [false, false, true]],
    ["sophia_bilan_weekly_v1", "Go !", [false, true, false]],
    [
      "sophia_bilan_weekly_v1",
      "La semaine prochaine!",
      [false, false, true],
    ],
    ["sophia_bilan_v2", "Carrément!", [false, true, false]],
    ["sophia_bilan_v2", "On le fait demain!", [false, false, true]],
    ["sophia_checkin_v2", "Oui !", [false, true, false]],
    [
      "sophia_checkin_v2",
      "Une prochaine fois !",
      [false, false, true],
    ],
    ["morning_nudge_v1", "Go !", [false, true, false]],
    ["sophia_potion_reminder_v1", "Oui !", [false, true, false]],
  ];
  for (const [template, choice, expected] of cases) {
    const flags = mapTemplateChoiceToFlags(template, choice);
    assertEquals(
      [flags.isOptInYes, flags.isCheckinYes, flags.isCheckinLater],
      expected,
      `${template}:${choice}`,
    );
  }
  assertEquals(mapTemplateChoiceToFlags("sophia_checkin_v2", "unknown"), {
    isOptInYes: false,
    isCheckinYes: false,
    isCheckinLater: false,
  });
  assertEquals(mapTemplateChoiceToFlags("sophia_checkin_v2", "unrelated"), {
    isOptInYes: false,
    isCheckinYes: false,
    isCheckinLater: false,
  });
  const reminderContext: LastTemplateContext = {
    name: "sophia_reminder_consent_v1_",
    // W2.D-2 — `content` (the rendered question) and `inbound_turns_before` became required
    // on LastTemplateContext (template_context.ts:4-20) after this case was written. Neither
    // is read by `findTemplateButtonForFlag`; they carry their neutral value here.
    content: "Tu veux que je te le rappelle ?",
    inbound_turns_before: 0,
    purpose: "recurring_reminder",
    buttons: ["Avec plaisir !", "Pas maintenant"],
    event_context: "recurring_reminder:r1",
    original_checkin_id: "checkin-r1",
    wamid: "wamid.r1",
    sent_at: new Date().toISOString(),
  };
  assertEquals(
    findTemplateButtonForFlag(reminderContext, "later"),
    "Pas maintenant",
  );
});

const CHECKIN_CONTEXT: LastTemplateContext = {
  name: "sophia_checkin_v2",
  content: "Hello 🙂 on fait le point ?",
  inbound_turns_before: 0,
  purpose: "scheduled_checkin",
  buttons: ["Oui !", "Une prochaine fois !"],
  event_context: "daily_checkin",
  original_checkin_id: "checkin-1",
  wamid: "wamid.checkin",
  sent_at: new Date().toISOString(),
};

Deno.test("classifier retains only an exact high-confidence button", async () => {
  const high = await classifyTemplateReplyChoice({
    template: CHECKIN_CONTEXT,
    inboundText: "avec plaisir",
    llmRunner: async () =>
      JSON.stringify({ choice: "Oui !", confidence: 0.91 }),
  });
  const low = await classifyTemplateReplyChoice({
    template: CHECKIN_CONTEXT,
    inboundText: "peut-être",
    llmRunner: async () =>
      JSON.stringify({ choice: "Oui !", confidence: 0.79 }),
  });
  assertEquals(high, { choice: "Oui !", confidence: 0.91 });
  assertEquals(low, { choice: "unrelated", confidence: 0.79 });
});

Deno.test("classifier fails closed for reservations, STOP and wrong-number text", async () => {
  let calls = 0;
  const llmRunner = async () => {
    calls += 1;
    return JSON.stringify({ choice: "Oui !", confidence: 0.99 });
  };
  for (
    const inboundText of [
      "ok mais pas maintenant",
      "stop",
      "stop pour ce soir",
      "t'as pas fait un mauvais numéro ?",
    ]
  ) {
    const result = await classifyTemplateReplyChoice({
      template: CHECKIN_CONTEXT,
      inboundText,
      llmRunner,
    });
    assertEquals(result.choice, "unrelated", inboundText);
  }
  assertEquals(calls, 0);
});
