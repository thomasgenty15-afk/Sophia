import { assertEquals } from "jsr:@std/assert@1";

import type { PotionSupportContextV1 } from "./potion-support-context.ts";
import {
  advancePotionSupportCursor,
  evaluatePotionSupportQuietGate,
  preparePotionSupportOpening,
} from "./potion-support-runtime.ts";

const T0 = "2026-07-15T08:00:00.000Z";

const DEFAULT_MESSAGES = [{
  id: "already-read",
  role: "user",
  content: "ancien",
  scope: "whatsapp",
  created_at: T0,
}, {
  id: "new-user-message",
  role: "user",
  content: "J'ai fait une répétition et la pression est un peu redescendue.",
  scope: "web",
  created_at: "2026-07-15T09:00:00.000Z",
}];

const visibleAgentRunner = async () => ({
  opening_text:
    "Tu m'avais parlé de la pression autour de vendredi. Qu'est-ce qui est le plus présent aujourd'hui ?",
  question_text: "Qu'est-ce qui est le plus présent aujourd'hui ?",
});

function focusDecision(input: {
  evidenceId: string;
  text?: string;
  kind?: "unresolved_thread" | "progress" | "baseline";
  freshness?: "fresh" | "carried";
  continuity?: "new_thread" | "evolved_thread" | "same_thread";
}) {
  return {
    kind: input.kind ?? "baseline",
    text: input.text ?? "La présentation de vendredi reste le sujet.",
    evidence_ids: [input.evidenceId],
    freshness: input.freshness ?? "carried",
    continuity: input.continuity ?? "same_thread",
    why: "C'est le fil de soutien le plus pertinent.",
  };
}

function context(): PotionSupportContextV1 {
  return {
    version: 1,
    created_at: T0,
    potion_type: "apaisement",
    objective: {
      text: "Soutenir avant la présentation.",
      evidence_refs: [{
        source_type: "potion_answer",
        source_id: "potion_session:self",
        source_field: "pressure_source",
      }],
    },
    baseline_evidence: [{
      evidence_id: "potion_answer:potion_session:self:pressure_source:1",
      text: "Ma présentation de vendredi me met à cran.",
      source: {
        source_type: "potion_answer",
        source_id: "potion_session:self",
        source_field: "pressure_source",
      },
      observed_at: T0,
    }],
    rolling_evidence: [],
    cumulative_ledger: {
      grounded_facts: [],
      open_threads: [],
      user_boundaries: [],
      advisory_summary: null,
    },
    message_cursor: { created_at: T0, ids_at_boundary: ["already-read"] },
    opening_history: [],
    advisory_context: {
      topic_id: null,
      topic_confidence: null,
      user_named_theme: false,
      recent_conversation_available: false,
      thematic_memory_available: false,
    },
  };
}

class FakeQuery {
  constructor(
    private table: string,
    private supportContext: PotionSupportContextV1,
    private messages: Array<Record<string, unknown>>,
  ) {}
  select(_columns?: string) {
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
  lte(_column: string, _value: unknown) {
    return this;
  }
  order(_column: string, _options?: unknown) {
    return this;
  }
  limit(_value: number) {
    return this;
  }
  maybeSingle() {
    return Promise.resolve({
      data: this.table === "user_potion_sessions"
        ? {
          id: "session-1",
          metadata: { potion_support_v1: this.supportContext },
        }
        : null,
      error: null,
    });
  }
  then(
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) {
    const value = this.table === "chat_messages"
      ? {
        data: this.messages,
        error: null,
      }
      : { data: null, error: null };
    return Promise.resolve(value).then(resolve, reject);
  }
}

function fakeAdmin(
  supportContext: PotionSupportContextV1,
  messages: Array<Record<string, unknown>> = DEFAULT_MESSAGES,
) {
  return {
    from(table: string) {
      return new FakeQuery(table, supportContext, messages);
    },
  } as any;
}

Deno.test("potion support quiet gate allows exactly at two hours", () => {
  const last = "2026-07-15T08:00:00.000Z";
  assertEquals(
    evaluatePotionSupportQuietGate({
      nowMs: new Date("2026-07-15T09:59:59.999Z").getTime(),
      lastExchangeAt: last,
    }).allowed,
    false,
  );
  assertEquals(
    evaluatePotionSupportQuietGate({
      nowMs: new Date("2026-07-15T10:00:00.000Z").getTime(),
      lastExchangeAt: last,
    }).allowed,
    true,
  );
});

Deno.test("potion support cursor keeps every id at the timestamp boundary", () => {
  const next = advancePotionSupportCursor({
    previous: { created_at: T0, ids_at_boundary: [] },
    messages: [{
      id: "a",
      role: "user",
      content: "A",
      scope: "web",
      created_at: "2026-07-15T09:00:00.000Z",
    }, {
      id: "b",
      role: "assistant",
      content: "B",
      scope: "whatsapp",
      created_at: "2026-07-15T09:00:00.000Z",
    }],
  });
  assertEquals(next.created_at, "2026-07-15T09:00:00.000Z");
  assertEquals(next.ids_at_boundary, ["a", "b"]);
});

Deno.test("J1 sends from a grounded activation baseline without chat messages", async () => {
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(context(), []),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 1,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      grounded_facts: [],
      open_threads: [],
      user_boundaries: [],
      progress_facts: [],
      resolution_candidates: [],
    }),
    visibleAgentRunner,
  });
  assertEquals(result.decision, "send");
  assertEquals(result.focus_decision?.kind, "baseline");
  assertEquals(result.focus_decision?.provenance, "activation_baseline");
});

Deno.test("skip_resolved is default-deny while a carried thread remains open", async () => {
  const supportContext = context();
  supportContext.cumulative_ledger.open_threads = [{
    text: "La gorge reste serree avant de parler.",
    evidence_refs: [supportContext.baseline_evidence[0].source],
    last_observed_at: T0,
  }];
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(supportContext, [{
      id: "partial-better",
      role: "user",
      content: "Ca va un peu mieux aujourd'hui.",
      scope: "web",
      created_at: "2026-07-15T09:00:00.000Z",
    }]),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 2,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      open_threads: [],
      progress_facts: [{
        text: "La personne va un peu mieux.",
        evidence_ids: ["chat_message:partial-better"],
      }],
      resolution_candidates: [],
      user_boundaries: [],
    }),
    visibleAgentRunner,
  });
  assertEquals(result.decision, "send");
  assertEquals(result.cumulative_ledger_after.open_threads.length, 1);
});

Deno.test("an explicit fresh resolution can close the matching carried thread", async () => {
  const supportContext = context();
  const baselineId = supportContext.baseline_evidence[0].evidence_id;
  supportContext.cumulative_ledger.open_threads = [{
    text: "La presentation reste une source de pression.",
    evidence_refs: [supportContext.baseline_evidence[0].source],
    last_observed_at: T0,
  }];
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(supportContext, [{
      id: "resolved",
      role: "user",
      content: "L'entretien est passe et ce sujet est completement regle.",
      scope: "web",
      created_at: "2026-07-15T09:00:00.000Z",
    }]),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 2,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      open_threads: [],
      progress_facts: [],
      resolution_candidates: [{
        text: "Le sujet de la presentation est completement regle.",
        evidence_ids: ["chat_message:resolved", baselineId],
      }],
      user_boundaries: [],
    }),
    visibleAgentRunner,
  });
  assertEquals(result.decision, "skip_resolved");
  assertEquals(result.cumulative_ledger_after.open_threads, []);
});

Deno.test("potion support preparation accepts only known evidence ids and falls back to server baseline", async () => {
  const validId = context().baseline_evidence[0].evidence_id;
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(context()),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 2,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      decision: "send",
      advisory_summary:
        "La pression semble avoir diminué après une répétition.",
      grounded_facts: [{
        text: "La présentation de vendredi créait de la pression.",
        evidence_ids: [validId],
      }],
      open_threads: [],
      user_boundaries: [],
      focus_decision: focusDecision({ evidenceId: validId }),
      progress_facts: [{
        text: "La répétition a fait un peu redescendre la pression.",
        evidence_ids: ["chat_message:new-user-message"],
      }],
    }),
    visibleAgentRunner,
  });
  assertEquals(result.decision, "send");
  assertEquals(result.integrated_message_ids, ["new-user-message"]);
  assertEquals(result.context_after.message_cursor.ids_at_boundary, [
    "new-user-message",
  ]);
  assertEquals(result.context_after.rolling_evidence.length, 1);

  const invalid = await preparePotionSupportOpening({
    admin: fakeAdmin(context()),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 2,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      decision: "send",
      focus_decision: focusDecision({
        evidenceId: "missing-id",
        text: "Fait inventé",
      }),
      progress_facts: [],
    }),
    visibleAgentRunner,
  });
  assertEquals(invalid.decision, "send");
  assertEquals(invalid.focus_decision?.kind, "baseline");
  assertEquals(invalid.focus_decision?.provenance, "activation_baseline");
});

Deno.test("refusing another feature never cancels the potion campaign", async () => {
  const validId = context().baseline_evidence[0].evidence_id;
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(context(), [{
      id: "no-card",
      role: "user",
      content:
        "Je ne veux pas préparer de carte ni créer quoi que ce soit, je voulais juste te tenir au courant.",
      scope: "web",
      created_at: "2026-07-15T09:00:00.000Z",
    }]),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 2,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      // Simulate a contradictory model output: the structured target is
      // correct, but the free-form decision still tries to stop the campaign.
      decision: "skip_user_boundary",
      user_boundaries: [{
        text: "La personne refuse la création d'une carte.",
        evidence_ids: ["chat_message:no-card"],
        target: "other_feature",
      }],
      focus_decision: focusDecision({ evidenceId: validId }),
      progress_facts: [],
    }),
    visibleAgentRunner,
  });

  assertEquals(result.decision, "send");
  assertEquals(result.boundary_target, "other_feature");
  assertEquals(
    result.cumulative_ledger_after.user_boundaries[0]?.target,
    "other_feature",
  );
});

Deno.test("a local conversation closure never cancels the next potion day", async () => {
  const validId = context().baseline_evidence[0].evidence_id;
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(context(), [{
      id: "local-close",
      role: "user",
      content: "Je m'arrête là pour ce soir, à demain.",
      scope: "whatsapp",
      created_at: "2026-07-15T09:00:00.000Z",
    }]),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 2,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      decision: "skip_user_boundary",
      user_boundaries: [{
        text: "La personne clôt seulement l'échange du soir.",
        evidence_ids: ["chat_message:local-close"],
        target: "conversation_session",
      }],
      focus_decision: focusDecision({ evidenceId: validId }),
      progress_facts: [],
    }),
    visibleAgentRunner,
  });

  assertEquals(result.decision, "send");
  assertEquals(result.boundary_target, "conversation_session");
});

Deno.test("only a fresh user-authored potion boundary is terminal", async () => {
  const validId = context().baseline_evidence[0].evidence_id;
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(context(), [{
      id: "stop-potion",
      role: "user",
      content:
        "Je préfère continuer seule maintenant, ne me relance plus pour cette potion.",
      scope: "whatsapp",
      created_at: "2026-07-15T09:00:00.000Z",
    }]),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 3,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      // The structured boundary is authoritative even if the model forgets
      // to align its top-level decision.
      decision: "send",
      user_boundaries: [{
        text: "La personne demande l'arrêt des relances de cette potion.",
        evidence_ids: ["chat_message:stop-potion"],
        target: "potion_campaign",
      }],
      focus_decision: focusDecision({ evidenceId: validId }),
      progress_facts: [],
    }),
    visibleAgentRunner,
  });

  assertEquals(result.decision, "skip_user_boundary");
  assertEquals(result.boundary_target, "potion_campaign");
  assertEquals(result.opening_text, null);
});

Deno.test("assistant text can prevent repetition but cannot prove a campaign boundary", async () => {
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(context(), [{
      id: "assistant-claim",
      role: "assistant",
      content: "Tu ne veux plus recevoir de messages pour cette potion.",
      scope: "web",
      created_at: "2026-07-15T09:00:00.000Z",
    }]),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 2,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      decision: "skip_user_boundary",
      user_boundaries: [{
        text: "La personne ne veut plus recevoir les messages.",
        evidence_ids: ["chat_message:assistant-claim"],
        target: "potion_campaign",
      }],
      focus_decision: null,
      progress_facts: [],
    }),
    visibleAgentRunner,
  });

  assertEquals(result.decision, "send");
  assertEquals(result.boundary_target, null);
  assertEquals(result.cumulative_ledger_after.user_boundaries, []);
});

Deno.test("J3 server replaces a stale model focus with the fresh open thread", async () => {
  let visibleCalls = 0;
  const oldEvidenceId = context().baseline_evidence[0].evidence_id;
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(context(), [{
      id: "j3-update",
      role: "user",
      content:
        "J'ai réussi à prendre deux secondes avant mon exemple, mais j'ai encore la gorge serrée.",
      scope: "whatsapp",
      created_at: "2026-07-15T09:00:00.000Z",
    }]),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 3,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      decision: "send",
      grounded_facts: [{
        text: "La personne a réussi à prendre deux secondes.",
        evidence_ids: ["chat_message:j3-update"],
      }],
      open_threads: [{
        text: "La gorge reste serrée.",
        evidence_ids: ["chat_message:j3-update"],
      }],
      user_boundaries: [],
      // Structurally grounded, but inconsistent with the fresh open thread
      // selected by the same reducer.
      focus_decision: focusDecision({ evidenceId: oldEvidenceId }),
      progress_facts: [{
        text: "La personne a réussi à prendre deux secondes.",
        evidence_ids: ["chat_message:j3-update"],
      }],
    }),
    visibleAgentRunner: async () => {
      visibleCalls += 1;
      return { opening_text: "La gorge reste serree ?", question_text: null };
    },
  });

  assertEquals(result.decision, "send");
  assertEquals(result.focus_decision?.kind, "unresolved_thread");
  assertEquals(result.focus_decision?.text, "La gorge reste serrée.");
  assertEquals(visibleCalls, 1);
});

Deno.test("J3 server prevents downgrade of a fresh open thread to progress", async () => {
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(context(), [{
      id: "j3-mixed-update",
      role: "user",
      content:
        "La pause m'a aidée à garder mon exemple, mais ma gorge est toujours serrée.",
      scope: "whatsapp",
      created_at: "2026-07-15T09:00:00.000Z",
    }]),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 3,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      decision: "send",
      open_threads: [{
        text: "La gorge reste serrée.",
        evidence_ids: ["chat_message:j3-mixed-update"],
      }],
      focus_decision: focusDecision({
        evidenceId: "chat_message:j3-mixed-update",
        text: "La pause a aidé à garder l'exemple.",
        kind: "progress",
        freshness: "fresh",
        continuity: "evolved_thread",
      }),
      progress_facts: [{
        text: "La pause a aidé à garder l'exemple.",
        evidence_ids: ["chat_message:j3-mixed-update"],
      }],
    }),
    visibleAgentRunner,
  });

  assertEquals(result.decision, "send");
  assertEquals(result.focus_decision?.kind, "unresolved_thread");
});

Deno.test("J3 sends fresh focus and progress to the distinct visible agent", async () => {
  let visibleTask: Record<string, unknown> | null = null;
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(context(), [{
      id: "j3-update",
      role: "user",
      content:
        "J'ai réussi à prendre deux secondes avant mon exemple, mais j'ai encore la gorge serrée.",
      scope: "whatsapp",
      created_at: "2026-07-15T09:00:00.000Z",
    }]),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 3,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      decision: "send",
      grounded_facts: [{
        text: "La personne a réussi à prendre deux secondes.",
        evidence_ids: ["chat_message:j3-update"],
      }],
      open_threads: [{
        text: "La gorge reste serrée.",
        evidence_ids: ["chat_message:j3-update"],
      }],
      user_boundaries: [],
      focus_decision: focusDecision({
        evidenceId: "chat_message:j3-update",
        text: "La gorge reste serrée.",
        kind: "unresolved_thread",
        freshness: "fresh",
        continuity: "evolved_thread",
      }),
      progress_facts: [{
        text: "La personne a réussi à prendre deux secondes.",
        evidence_ids: ["chat_message:j3-update"],
      }],
    }),
    visibleAgentRunner: async (_systemPrompt, userPrompt) => {
      visibleTask = JSON.parse(userPrompt) as Record<string, unknown>;
      return {
        opening_text:
          "Tu as réussi à prendre ces deux secondes. Et cette gorge serrée, elle est comment juste avant de parler ?",
        question_text:
          "Cette gorge serrée, elle est comment juste avant de parler ?",
      };
    },
  });

  assertEquals(result.decision, "send");
  assertEquals(result.focus_decision?.kind, "unresolved_thread");
  assertEquals(result.focus_decision?.freshness, "fresh");
  assertEquals(result.opening_evidence_refs, [{
    source_type: "chat_message",
    source_id: "j3-update",
    source_field: "user",
  }]);
  assertEquals(visibleTask, {
    kind: "potion_support_opening",
    day_index: 3,
    focus: {
      kind: "unresolved_thread",
      text: "La gorge reste serrée.",
      freshness: "fresh",
      continuity: "evolved_thread",
    },
    progress_facts: [{
      text: "La personne a réussi à prendre deux secondes.",
    }],
    continuity: { previous_openings: [] },
  });
});

Deno.test("J3 paraphrase keeps separate fresh evidence for progress and open thread", async () => {
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(context(), [{
      id: "j3-progress",
      role: "user",
      content: "Le blanc avant de répondre m'a aidée à garder mon exemple.",
      scope: "web",
      created_at: "2026-07-15T09:00:00.000Z",
    }, {
      id: "j3-open-thread",
      role: "user",
      content: "Par contre ma voix se bloque encore au démarrage.",
      scope: "whatsapp",
      created_at: "2026-07-15T09:05:00.000Z",
    }]),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 3,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      decision: "send",
      grounded_facts: [{
        text: "Une courte pause l'a aidée à garder son exemple.",
        evidence_ids: ["chat_message:j3-progress"],
      }],
      open_threads: [{
        text: "La voix se bloque encore au démarrage.",
        evidence_ids: ["chat_message:j3-open-thread"],
      }],
      focus_decision: focusDecision({
        evidenceId: "chat_message:j3-open-thread",
        text: "La voix se bloque encore au démarrage.",
        kind: "unresolved_thread",
        freshness: "fresh",
        continuity: "evolved_thread",
      }),
      progress_facts: [{
        text: "Une courte pause l'a aidée à garder son exemple.",
        evidence_ids: ["chat_message:j3-progress"],
      }],
    }),
    visibleAgentRunner,
  });

  assertEquals(result.decision, "send");
  assertEquals(result.opening_evidence_refs, [{
    source_type: "chat_message",
    source_id: "j3-open-thread",
    source_field: "user",
  }, {
    source_type: "chat_message",
    source_id: "j3-progress",
    source_field: "user",
  }]);
});

Deno.test("an invalid visible-agent contract skips the slot without fallback prose", async () => {
  const validId = context().baseline_evidence[0].evidence_id;
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(context()),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 2,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      decision: "send",
      open_threads: [],
      focus_decision: focusDecision({ evidenceId: validId }),
      progress_facts: [],
    }),
    visibleAgentRunner: async () => ({ question_text: "Sans ouverture" }),
  });

  assertEquals(result.decision, "skip_no_grounding");
  assertEquals(result.opening_text, null);
  assertEquals(result.visible_task, null);
});
