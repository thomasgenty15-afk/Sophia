import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import { schedulePotionFollowUpForSession } from "./potion-follow-up.ts";
import type { UserPotionSessionRow } from "./v2-types.ts";

type FakeCalls = {
  reminderPayload: Record<string, unknown> | null;
  scheduledRows: Array<Record<string, unknown>>;
  sessionUpdate: Record<string, unknown> | null;
};

class FakeQuery {
  private action: "select" | "insert" | "update" | null = null;
  private payload: unknown = null;

  constructor(
    private table: string,
    private session: UserPotionSessionRow,
    private calls: FakeCalls,
  ) {}

  select(_columns?: string) {
    this.action ??= "select";
    return this;
  }

  eq(_column: string, _value: unknown) {
    return this;
  }

  in(_column: string, _value: unknown[]) {
    return this;
  }

  gte(_column: string, _value: unknown) {
    return this;
  }

  order(_column: string, _options?: unknown) {
    return this;
  }

  limit(_value: number) {
    return this;
  }

  maybeSingle() {
    if (this.table === "user_potion_sessions") {
      return Promise.resolve({ data: this.session, error: null });
    }
    if (this.table === "profiles") {
      return Promise.resolve({
        data: { timezone: "Europe/Paris" },
        error: null,
      });
    }
    if (this.table === "user_recurring_reminders") {
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  insert(payload: unknown) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  single() {
    if (this.table === "user_recurring_reminders" && this.action === "insert") {
      this.calls.reminderPayload = this.payload as Record<string, unknown>;
      return Promise.resolve({ data: { id: "reminder-1" }, error: null });
    }
    if (this.table === "user_potion_sessions" && this.action === "update") {
      this.calls.sessionUpdate = this.payload as Record<string, unknown>;
      return Promise.resolve({
        data: {
          ...this.session,
          follow_up_strategy:
            (this.payload as Record<string, unknown>).follow_up_strategy,
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  }

  then(
    resolve: (value: { data?: unknown; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) {
    return this.resolve().then(resolve, reject);
  }

  private resolve() {
    if (this.table === "scheduled_checkins" && this.action === "insert") {
      this.calls.scheduledRows = this.payload as Array<Record<string, unknown>>;
    }
    return Promise.resolve({ data: null, error: null });
  }
}

function fakeAdmin(session: UserPotionSessionRow, calls: FakeCalls) {
  return {
    from(table: string) {
      return new FakeQuery(table, session, calls);
    },
  } as any;
}

function clarteSession(): UserPotionSessionRow {
  return {
    id: "session-1",
    user_id: "user-1",
    cycle_id: "cycle-1",
    scope_kind: "transformation",
    transformation_id: "transformation-1",
    phase_id: null,
    potion_type: "clarte",
    source: "manual",
    status: "completed",
    questionnaire_schema: [],
    questionnaire_answers: {
      plan_meaning_loss_reason:
        "Je ne vois plus le lien entre mes actions et mon pourquoi profond.",
    },
    free_text: null,
    content: {
      potion_name: "Clarte du plan",
      instant_response: "On revient au sens.",
      suggested_next_step: null,
      follow_up_proposal: {
        title: "Lien plan pourquoi",
        description: "Revenir au lien entre le plan et le pourquoi profond.",
        message_text:
          "Rappelle-moi le lien entre mon plan et mon pourquoi profond.",
        cadence_hint: "chaque jour",
      },
    },
    follow_up_strategy: {
      mode: "suggested_series",
      rationale: "Garder le sens du plan vivant.",
      suggested_delay_hours: 24,
      suggested_duration_days: 7,
    },
    metadata: { potion_title: "Potion de clarte" },
    generated_at: "2026-06-03T08:00:00.000Z",
    last_updated_at: "2026-06-03T08:00:00.000Z",
  };
}

function rappelSession(
  metadata: Record<string, unknown>,
): UserPotionSessionRow {
  return {
    ...clarteSession(),
    id: "rappel-session-1",
    potion_type: "rappel",
    questionnaire_answers: {
      drift_target: "mon sport",
      drift_style: "repousse",
    },
    content: {
      potion_name: "Raccrochage sport",
      instant_response: "On revient au fil.",
      suggested_next_step: null,
      follow_up_proposal: {
        title: "Raccrochage",
        description: "Revenir au sport sans pression.",
        message_text: "Reviens a ton sport par un geste simple.",
        cadence_hint: "chaque jour",
      },
    },
    metadata: {
      potion_title: "Potion anti-decrochage",
      ...metadata,
    },
  };
}

function courageSession(
  metadata: Record<string, unknown>,
): UserPotionSessionRow {
  return {
    ...clarteSession(),
    id: "courage-session-1",
    potion_type: "courage",
    questionnaire_answers: {
      avoidance_target: "envoyer ce message difficile",
      blocker_kind: "conflit",
    },
    content: {
      potion_name: "Courage message",
      instant_response: "On avance sans brutalite.",
      suggested_next_step: null,
      follow_up_proposal: {
        title: "Courage doux",
        description: "Revenir au passage sans pression.",
        message_text: "Reviens a ce message par un premier seuil doux.",
        cadence_hint: "chaque jour",
      },
    },
    metadata: {
      potion_title: "Potion de courage",
      ...metadata,
    },
  };
}

function guerisonSession(
  metadata: Record<string, unknown>,
): UserPotionSessionRow {
  return {
    ...clarteSession(),
    id: "guerison-session-1",
    potion_type: "guerison",
    questionnaire_answers: {
      recent_hurt: "j'ai craque hier",
      dominant_feeling: "honte",
    },
    content: {
      potion_name: "Reparation douce",
      instant_response: "On repare sans t'enfoncer.",
      suggested_next_step: null,
      follow_up_proposal: {
        title: "Reparation",
        description: "Revenir sans se punir.",
        message_text: "Aide-moi a reparer apres avoir craque.",
        cadence_hint: "chaque jour",
      },
    },
    metadata: {
      potion_title: "Potion de guerison",
      ...metadata,
    },
  };
}

function amourSession(
  metadata: Record<string, unknown>,
): UserPotionSessionRow {
  return {
    ...clarteSession(),
    id: "amour-session-1",
    potion_type: "amour",
    questionnaire_answers: {
      love_lack_context: "mon ecriture que je juge nulle",
      love_state: "dur",
    },
    content: {
      potion_name: "Amour doux",
      instant_response: "On baisse la durete.",
      suggested_next_step: null,
      follow_up_proposal: {
        title: "Douceur",
        description: "Revenir a une parole moins dure envers soi.",
        message_text: "Reviens a ton ecriture avec un regard plus tendre.",
        cadence_hint: "chaque jour",
      },
    },
    metadata: {
      potion_title: "Potion d'amour",
      ...metadata,
    },
  };
}

function apaisementSession(
  metadata: Record<string, unknown>,
): UserPotionSessionRow {
  return {
    ...clarteSession(),
    id: "apaisement-session-1",
    potion_type: "apaisement",
    questionnaire_answers: {
      pressure_source: "l'ecriture du matin qui me comprime",
      pressure_state: "a_cran",
    },
    content: {
      potion_name: "Apaisement court",
      instant_response: "On desserre la pression.",
      suggested_next_step: null,
      follow_up_proposal: {
        title: "Apaisement",
        description: "Redescendre la pression sans ajouter d'exigence.",
        message_text: "Reviens a ton ecriture sans en faire une pression.",
        cadence_hint: "chaque jour",
      },
    },
    metadata: {
      potion_title: "Potion d'apaisement",
      ...metadata,
    },
  };
}

Deno.test("schedule potion follow-up stores seven distinct draft messages", async () => {
  const calls: FakeCalls = {
    reminderPayload: null,
    scheduledRows: [],
    sessionUpdate: null,
  };
  const result = await schedulePotionFollowUpForSession({
    admin: fakeAdmin(clarteSession(), calls),
    userId: "user-1",
    sessionId: "session-1",
    localTimeHHMM: "09:00",
    durationDays: 7,
    now: new Date("2026-06-03T08:00:00.000Z"),
    seriesGenerator: async () =>
      Array.from({ length: 7 }).map((_, index) => ({
        day_index: index + 1,
        theme: `angle ${index + 1}`,
        draft_message: `Message ${
          index + 1
        }: relie ton plan a ton pourquoi profond.`,
      })),
  });

  assertEquals(result.scheduledCount, 7);
  assertEquals(calls.scheduledRows.length, 7);
  assertEquals(
    new Set(calls.scheduledRows.map((row) => row.draft_message)).size,
    7,
  );
  assert(calls.scheduledRows.every((row) => String(row.draft_message).trim()));
  assertEquals(
    calls.reminderPayload?.message_instruction,
    "Rappelle-moi le lien entre mon plan et mon pourquoi profond.",
  );
  const strategy = calls.sessionUpdate?.follow_up_strategy as
    | Record<string, unknown>
    | undefined;
  const storedSeries = strategy?.scheduled_message_series as unknown[];
  assertEquals(storedSeries.length, 7);
  const generatedSeries = strategy?.generated_series as unknown[];
  assertEquals(generatedSeries.length, 7);
  assertEquals(
    strategy?.series_generator_version,
    "potion_follow_up_series_v1",
  );
  assertEquals(typeof strategy?.series_generated_at, "string");
  const firstPayload = calls.scheduledRows[0].message_payload as Record<
    string,
    unknown
  >;
  assertEquals(
    (firstPayload.potion_follow_up_series_item as Record<string, unknown>)
      .draft_message,
    "Message 1: relie ton plan a ton pourquoi profond.",
  );
});

Deno.test("schedule potion follow-up falls back if series generation fails", async () => {
  const calls: FakeCalls = {
    reminderPayload: null,
    scheduledRows: [],
    sessionUpdate: null,
  };
  const result = await schedulePotionFollowUpForSession({
    admin: fakeAdmin(clarteSession(), calls),
    userId: "user-1",
    sessionId: "session-1",
    localTimeHHMM: "09:00",
    durationDays: 7,
    now: new Date("2026-06-03T08:00:00.000Z"),
    seriesGenerator: async () => {
      throw new Error("ai_down");
    },
  });

  assertEquals(result.scheduledCount, 7);
  assertEquals(calls.scheduledRows.length, 7);
  assertEquals(
    new Set(calls.scheduledRows.map((row) => row.draft_message)).size,
    7,
  );
  assert(calls.scheduledRows.every((row) => String(row.draft_message).trim()));
  const strategy = calls.sessionUpdate?.follow_up_strategy as
    | Record<string, unknown>
    | undefined;
  assertEquals((strategy?.generated_series as unknown[]).length, 7);
});

Deno.test("schedule rappel plan-linked follow-up preserves plan item target binding", async () => {
  const calls: FakeCalls = {
    reminderPayload: null,
    scheduledRows: [],
    sessionUpdate: null,
  };
  const session = rappelSession({
    rappel_scope: {
      scope_kind: "plan_linked",
      target_scope: "plan_item",
      target_plan_item_id: "11111111-1111-4111-8111-111111111111",
      target_label: "Courir 20 minutes",
    },
    target_binding: {
      kind: "plan_item",
      target_scope: "plan_item",
      target_plan_item_id: "11111111-1111-4111-8111-111111111111",
      label: "Courir 20 minutes",
      binding_policy: "live_action",
      lifecycle_policy: "while_target_active",
    },
  });

  await schedulePotionFollowUpForSession({
    admin: fakeAdmin(session, calls),
    userId: "user-1",
    sessionId: session.id,
    localTimeHHMM: "09:00",
    durationDays: 3,
    now: new Date("2026-06-03T08:00:00.000Z"),
    seriesGenerator: async (input) => {
      assertEquals(input.rappelScope, session.metadata.rappel_scope);
      return [1, 2, 3].map((day) => ({
        day_index: day,
        theme: `jour ${day}`,
        draft_message: `Jour ${day}: raccroche ton sport au plan.`,
      }));
    },
  });

  assertEquals(calls.reminderPayload?.target_kind, "plan_item");
  assertEquals(
    calls.reminderPayload?.target_plan_item_id,
    "11111111-1111-4111-8111-111111111111",
  );
  assertEquals(calls.reminderPayload?.target_binding_policy, "live_action");
  assertEquals(
    calls.reminderPayload?.target_lifecycle_policy,
    "while_target_active",
  );
  assertEquals(
    (calls.reminderPayload?.initiative_metadata as any)?.rappel_scope
      ?.scope_kind,
    "plan_linked",
  );
  assertEquals(
    (calls.scheduledRows[0]?.message_payload as any)?.target_binding?.label,
    "Courir 20 minutes",
  );
});

Deno.test("schedule rappel out-of-plan follow-up does not force plan target binding", async () => {
  const calls: FakeCalls = {
    reminderPayload: null,
    scheduledRows: [],
    sessionUpdate: null,
  };
  const session = rappelSession({
    rappel_scope: {
      scope_kind: "out_of_plan",
      target_scope: null,
      target_plan_item_id: null,
      target_label: null,
    },
    target_binding: {
      kind: "none",
      target_scope: null,
      target_plan_item_id: null,
      label: null,
      binding_policy: "none",
      lifecycle_policy: "independent",
    },
  });

  await schedulePotionFollowUpForSession({
    admin: fakeAdmin(session, calls),
    userId: "user-1",
    sessionId: session.id,
    localTimeHHMM: "09:00",
    durationDays: 3,
    now: new Date("2026-06-03T08:00:00.000Z"),
    seriesGenerator: async () =>
      [1, 2, 3].map((day) => ({
        day_index: day,
        theme: `jour ${day}`,
        draft_message: `Jour ${day}: reviens a ton sport.`,
      })),
  });

  assertEquals(calls.reminderPayload?.target_kind, "none");
  assertEquals(calls.reminderPayload?.target_plan_item_id, null);
  assertEquals(calls.reminderPayload?.target_binding_policy, "none");
  assertEquals(calls.reminderPayload?.target_lifecycle_policy, "independent");
  assertEquals(
    (calls.reminderPayload?.initiative_metadata as any)?.rappel_scope
      ?.scope_kind,
    "out_of_plan",
  );
});

Deno.test("schedule guerison plan-linked follow-up preserves potion scope and generated drafts", async () => {
  const calls: FakeCalls = {
    reminderPayload: null,
    scheduledRows: [],
    sessionUpdate: null,
  };
  const session = guerisonSession({
    potion_scope: {
      scope_kind: "plan_linked",
      target_scope: "plan_item",
      target_plan_item_id: "11111111-1111-4111-8111-111111111111",
      target_label: "Courir 20 minutes",
    },
    target_binding: {
      kind: "plan_item",
      target_scope: "plan_item",
      target_plan_item_id: "11111111-1111-4111-8111-111111111111",
      label: "Courir 20 minutes",
      binding_policy: "live_action",
      lifecycle_policy: "while_target_active",
    },
  });

  await schedulePotionFollowUpForSession({
    admin: fakeAdmin(session, calls),
    userId: "user-1",
    sessionId: session.id,
    localTimeHHMM: "09:00",
    durationDays: 7,
    now: new Date("2026-06-03T08:00:00.000Z"),
    seriesGenerator: async (input) => {
      assertEquals(input.potionScope, session.metadata.potion_scope);
      return Array.from({ length: 7 }).map((_, index) => ({
        day_index: index + 1,
        theme: `jour ${index + 1}`,
        draft_message: `Jour ${index + 1}: repare sans pression.`,
      }));
    },
  });

  assertEquals(calls.scheduledRows.length, 7);
  assertEquals(
    new Set(calls.scheduledRows.map((row) => row.draft_message)).size,
    7,
  );
  assertEquals(calls.reminderPayload?.target_kind, "plan_item");
  assertEquals(
    calls.reminderPayload?.target_plan_item_id,
    "11111111-1111-4111-8111-111111111111",
  );
  assertEquals(
    (calls.reminderPayload?.initiative_metadata as any)?.potion_scope
      ?.scope_kind,
    "plan_linked",
  );
  assertEquals(
    (calls.reminderPayload?.initiative_metadata as any)?.rappel_scope,
    null,
  );
  assertEquals(
    (calls.scheduledRows[0]?.message_payload as any)?.potion_scope
      ?.scope_kind,
    "plan_linked",
  );
  assertEquals(
    (calls.scheduledRows[0]?.message_payload as any)?.rappel_scope,
    null,
  );
});

Deno.test("schedule courage plan-linked follow-up preserves potion scope target binding", async () => {
  const calls: FakeCalls = {
    reminderPayload: null,
    scheduledRows: [],
    sessionUpdate: null,
  };
  const session = courageSession({
    potion_scope: {
      scope_kind: "plan_linked",
      target_scope: "plan_item",
      target_plan_item_id: "11111111-1111-4111-8111-111111111111",
      target_label: "Courir 20 minutes",
    },
    target_binding: {
      kind: "plan_item",
      target_scope: "plan_item",
      target_plan_item_id: "11111111-1111-4111-8111-111111111111",
      label: "Courir 20 minutes",
      binding_policy: "live_action",
      lifecycle_policy: "while_target_active",
    },
  });

  await schedulePotionFollowUpForSession({
    admin: fakeAdmin(session, calls),
    userId: "user-1",
    sessionId: session.id,
    localTimeHHMM: "09:00",
    durationDays: 3,
    now: new Date("2026-06-03T08:00:00.000Z"),
    seriesGenerator: async (input) => {
      assertEquals(input.potionScope, session.metadata.potion_scope);
      return [1, 2, 3].map((day) => ({
        day_index: day,
        theme: `jour ${day}`,
        draft_message: `Jour ${day}: courage pour ton passage.`,
      }));
    },
  });

  assertEquals(calls.reminderPayload?.target_kind, "plan_item");
  assertEquals(
    calls.reminderPayload?.target_plan_item_id,
    "11111111-1111-4111-8111-111111111111",
  );
  assertEquals(
    (calls.reminderPayload?.initiative_metadata as any)?.potion_scope
      ?.scope_kind,
    "plan_linked",
  );
  assertEquals(
    (calls.reminderPayload?.initiative_metadata as any)?.rappel_scope,
    null,
  );
  assertEquals(
    (calls.scheduledRows[0]?.message_payload as any)?.potion_scope
      ?.scope_kind,
    "plan_linked",
  );
  assertEquals(
    (calls.scheduledRows[0]?.message_payload as any)?.target_binding?.label,
    "Courir 20 minutes",
  );
});

Deno.test("schedule amour plan-linked follow-up preserves potion scope target binding", async () => {
  const calls: FakeCalls = {
    reminderPayload: null,
    scheduledRows: [],
    sessionUpdate: null,
  };
  const session = amourSession({
    potion_scope: {
      scope_kind: "plan_linked",
      target_scope: "plan_item",
      target_plan_item_id: "22222222-2222-4222-8222-222222222222",
      target_label: "Ecrire la premiere page",
    },
    target_binding: {
      kind: "plan_item",
      target_scope: "plan_item",
      target_plan_item_id: "22222222-2222-4222-8222-222222222222",
      label: "Ecrire la premiere page",
      binding_policy: "live_action",
      lifecycle_policy: "while_target_active",
    },
  });

  await schedulePotionFollowUpForSession({
    admin: fakeAdmin(session, calls),
    userId: "user-1",
    sessionId: session.id,
    localTimeHHMM: "09:00",
    durationDays: 3,
    now: new Date("2026-06-03T08:00:00.000Z"),
    seriesGenerator: async (input) => {
      assertEquals(input.potionType, "amour");
      assertEquals(input.potionScope, session.metadata.potion_scope);
      return [1, 2, 3].map((day) => ({
        day_index: day,
        theme: `jour ${day}`,
        draft_message: `Jour ${day}: douceur pour ton ecriture.`,
      }));
    },
  });

  assertEquals(calls.reminderPayload?.target_kind, "plan_item");
  assertEquals(
    calls.reminderPayload?.target_plan_item_id,
    "22222222-2222-4222-8222-222222222222",
  );
  assertEquals(
    (calls.reminderPayload?.initiative_metadata as any)?.potion_scope
      ?.scope_kind,
    "plan_linked",
  );
  assertEquals(
    (calls.reminderPayload?.initiative_metadata as any)?.rappel_scope,
    null,
  );
  assertEquals(
    (calls.scheduledRows[0]?.message_payload as any)?.potion_scope
      ?.scope_kind,
    "plan_linked",
  );
  assertEquals(
    (calls.scheduledRows[0]?.message_payload as any)?.target_binding?.label,
    "Ecrire la premiere page",
  );
});

Deno.test("schedule apaisement plan-linked follow-up preserves potion scope target binding", async () => {
  const calls: FakeCalls = {
    reminderPayload: null,
    scheduledRows: [],
    sessionUpdate: null,
  };
  const session = apaisementSession({
    potion_scope: {
      scope_kind: "plan_linked",
      target_scope: "plan_item",
      target_plan_item_id: "33333333-3333-4333-8333-333333333333",
      target_label: "Ecrire la premiere page",
    },
    target_binding: {
      kind: "plan_item",
      target_scope: "plan_item",
      target_plan_item_id: "33333333-3333-4333-8333-333333333333",
      label: "Ecrire la premiere page",
      binding_policy: "live_action",
      lifecycle_policy: "while_target_active",
    },
  });

  await schedulePotionFollowUpForSession({
    admin: fakeAdmin(session, calls),
    userId: "user-1",
    sessionId: session.id,
    localTimeHHMM: "09:00",
    durationDays: 3,
    now: new Date("2026-06-03T08:00:00.000Z"),
    seriesGenerator: async (input) => {
      assertEquals(input.potionType, "apaisement");
      assertEquals(input.potionScope, session.metadata.potion_scope);
      return [1, 2, 3].map((day) => ({
        day_index: day,
        theme: `jour ${day}`,
        draft_message: `Jour ${day}: desserre la pression autour du plan.`,
      }));
    },
  });

  assertEquals(calls.reminderPayload?.target_kind, "plan_item");
  assertEquals(
    calls.reminderPayload?.target_plan_item_id,
    "33333333-3333-4333-8333-333333333333",
  );
  assertEquals(
    (calls.reminderPayload?.initiative_metadata as any)?.potion_scope
      ?.scope_kind,
    "plan_linked",
  );
  assertEquals(
    (calls.reminderPayload?.initiative_metadata as any)?.rappel_scope,
    null,
  );
  assertEquals(
    (calls.scheduledRows[0]?.message_payload as any)?.potion_scope
      ?.scope_kind,
    "plan_linked",
  );
  assertEquals(
    (calls.scheduledRows[0]?.message_payload as any)?.target_binding?.label,
    "Ecrire la premiere page",
  );
});
