/**
 * W4.7 — LA BOUCLE CONVERSATIONNELLE KEEL, DE BOUT EN BOUT.
 *
 * Le défaut que ce lot corrige n'était pas une régression de logique: chaque
 * pièce était écrite ET testée, et l'ensemble était INERTE (zéro appelant).
 * Un test unitaire de plus sur chaque pièce ne l'aurait jamais vu. Ce fichier
 * teste donc les JOINTURES — ce qui traverse réellement le tour:
 *
 *   (a) « j'ai pris mon magnésium »        -> une ligne protocol_events, et
 *                                             l'accusé cite la ligne RELUE
 *   (b) « jeudi je suis en déplacement »   -> une ligne planned_deviations
 *   (c) « je vais prendre mon magnésium »  -> AUCUN effet (ceinture runtime,
 *                                             pas une consigne de prompt)
 *   (d) restriction_flag levé              -> disordered_eating_guard possède
 *                                             le tour, zéro effet durable
 *   (e) les deux ceintures anti-fail-open  -> voir leurs tests miroirs, dans
 *                                             routers_plan_question_test.ts et
 *                                             disordered_eating_guard_test.ts
 *
 * Les écritures passent par de FAUX clients, mais jamais par de faux
 * exécuteurs: `runKeelDirectEffectLane` appelle les vrais routers write-through
 * (`log_protocol_event`, `declare_deviation`), donc le gate, l'intake fail-loud,
 * la relecture et l'invariant de rendu sont exercés pour de vrai.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import { runConversationRouters } from "../routers/routers.ts";
import {
  conversationalRestrictionGuardForRouters,
  effectLedgerTraceForTest,
  type KeelTurnContext,
  resolvePlanQuestionCommitmentId,
  runKeelDirectEffectLane,
} from "./run.ts";
import type { RestrictionGuardResult } from "../../_shared/keel/restriction_guard.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_MESSAGE_ID = "msg-keel-1";

const KEEL_STUDENT: KeelTurnContext = {
  role: "student",
  is_student: true,
  country: "FR",
  content_locale: "fr-FR",
  local_date: "2026-07-27",
  plan_context: null,
  plan_version_id: "22222222-2222-4222-8222-222222222222",
  plan_block: "=== KEEL PLAN ===",
  plan_context_reason_code: "keel_student_plan_context",
  restriction: null,
  restriction_unavailable_reason: null,
  // PIVOT §3.3 — la ceinture de sortie est DÉSARMÉE dans ce fixture: aucune
  // contrainte, aucune doctrine. Les tours de cette boucle testent le plan et
  // les effets, pas les verrous (ceux-ci ont leurs propres tests).
  safety_constraints: [],
  safety_constraints_unavailable_reason: null,
  doctrine: null,
};

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn-keel-1",
    source_message_id: SOURCE_MESSAGE_ID,
    user_id: USER_ID,
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    direct_effect_time_context: {
      now_utc: "2026-07-27T07:12:00.000Z",
      user_timezone: "Europe/Paris",
      user_locale: "fr-FR",
      user_local_datetime: "2026-07-27T09:12:00",
      user_local_human: "lundi 27 juillet, 09:12",
    },
    skill_signals: {},
    memory_plan: {
      response_intent: "reflection",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.7,
    },
    ...patch,
  } as TurnFrame;
}

/**
 * Route RÉELLE: elle sort de `runConversationRouters`, jamais d'un objet écrit
 * à la main. C'est la moitié du câblage que ce lot ajoute (le vocabulaire
 * d'effets exécutables du routeur) — la fabriquer ici la rendrait invisible.
 */
function routeFor(turnFrame: TurnFrame): RouteDecision {
  return runConversationRouters({
    turn_frame: turnFrame,
    safety_context_risk_band: "none",
    keel_student: true,
  });
}

/** Client minimal: enregistre les écritures et rend une ligne relisible. */
function fakeSupabase(options: {
  onInsert?: (table: string, row: Record<string, unknown>) => void;
  insertedRow?: (table: string, row: Record<string, unknown>) => unknown;
  selectRows?: Record<string, unknown[]>;
}) {
  const calls: Array<{ table: string; op: string }> = [];
  const client = {
    from(table: string) {
      const selectResult = {
        data: options.selectRows?.[table] ?? [],
        error: null,
      };
      const chain: Record<string, unknown> = {
        select: (_columns: string) => chain,
        eq: (_column: string, _value: unknown) => chain,
        is: (_column: string, _value: unknown) => chain,
        limit: (_n: number) => chain,
        maybeSingle: () =>
          Promise.resolve({
            data: (options.selectRows?.[table] ?? [])[0] ?? null,
            error: null,
          }),
        single: () =>
          Promise.resolve({
            data: (options.selectRows?.[table] ?? [])[0] ?? null,
            error: null,
          }),
        then: (
          resolve: (value: typeof selectResult) => unknown,
        ) => Promise.resolve(selectResult).then(resolve),
        insert: (row: Record<string, unknown>) => {
          calls.push({ table, op: "insert" });
          options.onInsert?.(table, row);
          const inserted = options.insertedRow?.(table, row) ?? null;
          const insertChain: Record<string, unknown> = {
            select: (_columns: string) => insertChain,
            single: () => Promise.resolve({ data: inserted, error: null }),
            maybeSingle: () => Promise.resolve({ data: inserted, error: null }),
          };
          return insertChain;
        },
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

// ---------------------------------------------------------------------------
// (a) « j'ai pris mon magnésium » -> protocol_events, accusé sur la ligne relue
// ---------------------------------------------------------------------------

Deno.test("(a) a reported fact writes ONE protocol_events row and the acknowledgement quotes the re-read row", async () => {
  const inserted: Array<Record<string, unknown>> = [];
  const { client } = fakeSupabase({
    onInsert: (table, row) => {
      if (table === "protocol_events") inserted.push(row);
    },
    insertedRow: (table, row) =>
      table === "protocol_events"
        ? {
          id: "pe-1",
          user_id: USER_ID,
          // La base RENVOIE une valeur: c'est elle que l'accusé doit citer,
          // pas celle que le tour avait l'intention d'écrire.
          local_date: row.local_date,
          occurred_at: row.occurred_at,
          slot_key: row.slot_key,
          source: row.source,
          source_message_id: row.source_message_id,
          // D2: l'identite du fait fait partie de la relecture — l'accuse la
          // NOMME, donc l'executeur refuse de committer une identite que la
          // base n'a pas rendue. Le faux imite la base, colonne par colonne.
          food_group_ref: row.food_group_ref,
          substance_ref: row.substance_ref,
        }
        : null,
  });

  const turnFrame = frame({
    direct_effects: [{
      effect_type: "log_protocol_event",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        substance_ref: "magnesium_glycinate",
        slot_key: "breakfast",
        student_note: "j'ai pris mon magnesium",
      },
    }],
  });
  const routeDecision = routeFor(turnFrame);

  // Le vocabulaire du routeur est le premier maillon: sans lui la lane ne
  // tourne même pas.
  assertEquals(routeDecision.direct_effects_to_run, ["log_protocol_event"]);

  const runtime = await runKeelDirectEffectLane({
    supabase: client,
    userId: USER_ID,
    userMessage: "j'ai pris mon magnésium",
    channel: "web",
    turnFrame,
    routeDecision,
    tempMemory: {},
    keel: KEEL_STUDENT,
  });

  assert(runtime, "the KEEL lane did not run");
  assertEquals(inserted.length, 1, "exactly one protocol_events row");
  assertEquals(inserted[0].user_id, USER_ID);
  assertEquals(inserted[0].substance_ref, "magnesium_glycinate");
  assertEquals(inserted[0].local_date, "2026-07-27");
  assertEquals(inserted[0].content_locale, "fr-FR");
  // Idempotence de SCHÉMA: la clé part avec la ligne, sinon un retry appendrait
  // un second fait sur un index unique qui ne peut plus dédupliquer.
  // D2: le discriminant d'item. La garantie du schema passe de « un evenement
  // par message » a « un evenement par item rapporte du message », sans quoi un
  // message nommant deux aliments ne peut en ecrire qu'un.
  assertEquals(
    inserted[0].source_message_id,
    `${SOURCE_MESSAGE_ID}#substance:magnesium_glycinate`,
  );

  const committed = runtime.toolSkillRun.committed_effects as Array<
    Record<string, unknown>
  >;
  assertEquals(committed.length, 1);
  assertEquals(committed[0].protocol_event_id, "pe-1");
  assertEquals(runtime.toolExecution, "success");
  assertEquals(runtime.executedTools, ["log_protocol_event"]);

  // L'accusé cite la ligne RELUE — date, créneau ET identité rendus par la
  // base. Ce qui n'a pas traversé la base ne s'énonce pas: le fake ci-dessus
  // renvoie `substance_ref`, donc l'accusé peut la nommer; s'il ne la renvoyait
  // pas, l'écriture serait refusée en `readback_mismatch` plutôt qu'annoncée.
  assertEquals(
    runtime.content,
    "Recorded for 2026-07-27 (breakfast): Magnesium glycinate.",
  );

  // Et le ledger porte l'écriture, avec sa table et son id — c'est ce que
  // `effect_ledger_adapter.ts` laissait tomber en silence sur ces deux types.
  const trace = effectLedgerTraceForTest({
    turnId: "turn-keel-1",
    operationRuntime: runtime,
  });
  const entries = trace.entries as Array<Record<string, unknown>>;
  const committedEntry = entries.find((entry) =>
    entry.status === "committed" && entry.effect_type === "protocol_event.log"
  );
  assert(committedEntry, "the committed protocol event is absent from the ledger");
  assertEquals(committedEntry?.db_ref, { table: "protocol_events", id: "pe-1" });
  assertEquals((trace.counts as Record<string, number>).committed, 1);
});

// ---------------------------------------------------------------------------
// (b) « jeudi je suis en déplacement » -> planned_deviations
// ---------------------------------------------------------------------------

Deno.test("(b) an announced unavailability writes ONE planned_deviations row for the named day", async () => {
  const inserted: Array<Record<string, unknown>> = [];
  const { client } = fakeSupabase({
    onInsert: (table, row) => {
      if (table === "planned_deviations") inserted.push(row);
    },
    insertedRow: (table, row) =>
      table === "planned_deviations"
        ? {
          id: "pd-1",
          user_id: USER_ID,
          plan_version_id: row.plan_version_id,
          local_date: row.local_date,
          slot_key: row.slot_key,
          kind: row.kind,
          declared_via: row.declared_via,
          consumed_flex: row.consumed_flex,
        }
        : null,
  });

  const turnFrame = frame({
    direct_effects: [{
      effect_type: "declare_deviation",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        // Jeudi 30/07, résolu en ISO par le dispatcher depuis le contexte
        // temporel — jamais le mot « jeudi », qui daterait au mauvais jour.
        local_date: "2026-07-30",
        kind: "travel",
        note: "en deplacement",
      },
    }],
  });
  const routeDecision = routeFor(turnFrame);
  assertEquals(routeDecision.direct_effects_to_run, ["declare_deviation"]);

  const runtime = await runKeelDirectEffectLane({
    supabase: client,
    userId: USER_ID,
    userMessage: "jeudi je suis en déplacement",
    channel: "web",
    turnFrame,
    routeDecision,
    tempMemory: {},
    keel: KEEL_STUDENT,
  });

  assert(runtime, "the KEEL lane did not run");
  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].local_date, "2026-07-30");
  assertEquals(inserted[0].kind, "travel");
  assertEquals(inserted[0].plan_version_id, KEEL_STUDENT.plan_version_id);
  assertEquals(inserted[0].declared_via, "chat");
  // Le budget de flex appartient au coach: la ligne naît à false, la couche
  // dérivée décidera. Zéro compteur incrémental (CONTRACT).
  assertEquals(inserted[0].consumed_flex, false);

  const committed = runtime.toolSkillRun.committed_effects as Array<
    Record<string, unknown>
  >;
  assertEquals(committed.length, 1);
  assertEquals(committed[0].planned_deviation_id, "pd-1");
  assertEquals(
    runtime.content,
    "Noted — 2026-07-30 is flagged as planned time off.",
  );

  const trace = effectLedgerTraceForTest({
    turnId: "turn-keel-1",
    operationRuntime: runtime,
  });
  const entries = trace.entries as Array<Record<string, unknown>>;
  const committedEntry = entries.find((entry) =>
    entry.status === "committed" &&
    entry.effect_type === "planned_deviation.declare"
  );
  assert(committedEntry, "the committed deviation is absent from the ledger");
  assertEquals(committedEntry?.db_ref, {
    table: "planned_deviations",
    id: "pd-1",
  });
});

// ---------------------------------------------------------------------------
// (c) une intention future n'écrit RIEN
// ---------------------------------------------------------------------------

Deno.test("(c) a FUTURE intent writes nothing, even when the frame carries the effect", async () => {
  // Le test se place volontairement dans le pire cas: le dispatcher a mal
  // classé et a émis l'effet quand même. Un correctif prompt-only serait vert
  // sur un frame propre et rouge en run réel (p8-revalidation-rose-reds) —
  // c'est la ceinture déterministe du runtime qui est mesurée ici.
  const inserted: Array<Record<string, unknown>> = [];
  const { client, calls } = fakeSupabase({
    onInsert: (table, row) => inserted.push({ table, ...row }),
    insertedRow: () => ({ id: "should-not-exist" }),
  });

  const turnFrame = frame({
    direct_effects: [{
      effect_type: "log_protocol_event",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { substance_ref: "magnesium_glycinate" },
    }],
  });
  const routeDecision = routeFor(turnFrame);

  const runtime = await runKeelDirectEffectLane({
    supabase: client,
    userId: USER_ID,
    userMessage: "je vais prendre mon magnésium ce soir",
    channel: "web",
    turnFrame,
    routeDecision,
    tempMemory: {},
    keel: KEEL_STUDENT,
  });

  assert(runtime, "the lane must still report the refusal, not stay silent");
  assertEquals(inserted.length, 0, "no row may be written on a future intent");
  assertEquals(calls.length, 0, "no write was even attempted");
  assertEquals(runtime.toolSkillRun.committed_effects, []);
  assertEquals(runtime.executedTools, []);
  assertEquals(runtime.toolExecution, "blocked");
  assertEquals(runtime.toolSkillRun.blocked_effects, [
    { type: "log_protocol_event", reason_code: "future_intent" },
  ]);
  // Rien à accuser: le renderer ne peut produire un « c'est noté » que depuis
  // un effet committé, et il n'y en a pas.
  assertEquals(runtime.content, "");
});

Deno.test("(c-bis) the future-intent belt states its disarm condition: declare_deviation is untouched", async () => {
  // Une ceinture sans condition de désarmement devient un mur (doctrine P9).
  // Ici l'objet même de `declare_deviation` est le futur: l'y appliquer
  // rendrait la fonctionnalité inutilisable.
  const inserted: Array<Record<string, unknown>> = [];
  const { client } = fakeSupabase({
    onInsert: (table, row) => {
      if (table === "planned_deviations") inserted.push(row);
    },
    insertedRow: (_table, row) => ({
      id: "pd-2",
      user_id: USER_ID,
      plan_version_id: row.plan_version_id,
      local_date: row.local_date,
      slot_key: row.slot_key,
      kind: row.kind,
      declared_via: row.declared_via,
      consumed_flex: row.consumed_flex,
    }),
  });

  const turnFrame = frame({
    direct_effects: [{
      effect_type: "declare_deviation",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { local_date: "2026-07-30", kind: "social" },
    }],
  });

  const runtime = await runKeelDirectEffectLane({
    supabase: client,
    userId: USER_ID,
    // Formulation FUTURE, et c'est le cas nominal de cette lane.
    userMessage: "je vais faire un dîner d'anniversaire jeudi soir",
    channel: "web",
    turnFrame,
    routeDecision: routeFor(turnFrame),
    tempMemory: {},
    keel: KEEL_STUDENT,
  });

  assertEquals(inserted.length, 1);
  assertEquals(
    (runtime?.toolSkillRun.committed_effects as unknown[])?.length,
    1,
  );
});

// ---------------------------------------------------------------------------
// (c-ter) la lane n'existe pas hors KEEL
// ---------------------------------------------------------------------------

Deno.test("(c-ter) a legacy user cannot reach the KEEL executors at all", async () => {
  const { client, calls } = fakeSupabase({});
  const turnFrame = frame({
    direct_effects: [{
      effect_type: "log_protocol_event",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { substance_ref: "magnesium_glycinate" },
    }],
  });
  const runtime = await runKeelDirectEffectLane({
    supabase: client,
    userId: USER_ID,
    userMessage: "j'ai pris mon magnésium",
    channel: "web",
    turnFrame,
    routeDecision: routeFor(turnFrame),
    tempMemory: {},
    keel: { ...KEEL_STUDENT, role: null, is_student: false },
  });
  assertEquals(runtime, null);
  assertEquals(calls.length, 0);
});

// ---------------------------------------------------------------------------
// (d) plancher TCA: le tour appartient au flow clinique
// ---------------------------------------------------------------------------

function raisedGuard(codes: string[]): RestrictionGuardResult {
  return {
    guard_version: "restriction_guard.v1",
    restriction_flag: true,
    triggers: codes.map((code) => ({ code, evidence: {} })) as never,
    evaluated_for_date: "2026-07-27",
  };
}

Deno.test("(d) a raised restriction flag owns the conversational turn and kills every durable effect", () => {
  const guard = raisedGuard(["rapid_weight_loss"]);
  const armed = conversationalRestrictionGuardForRouters({
    restriction: guard,
    tempMemory: {},
    userMessage: "j'ai mangé une salade, c'est bon non ?",
  });
  assert(armed?.restriction_flag, "the floor must be armed in conversation");

  const decision = runConversationRouters({
    turn_frame: frame({
      direct_effects: [{
        effect_type: "log_protocol_event",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { food_group_ref: "leafy_greens" },
      }],
    }),
    safety_context_risk_band: "none",
    keel_student: true,
    restriction_guard: armed,
  });

  assertEquals(decision.response_owner, "disordered_eating_guard");
  // Zéro effet durable: une coche committée pendant ce flow EST la pression
  // d'adhérence que le flow existe pour suspendre.
  assertEquals(decision.direct_effects_to_run, []);
  const blocked = decision.blocked_paths.map((path) => path.path);
  assert(blocked.includes("direct_effects.log_protocol_event"));
  assert(blocked.includes("normal_reply"));
});

Deno.test("(d-bis) the floor is NOT armed when the guard could not be evaluated", () => {
  // Arbitrage nommé: une panne de lecture n'ouvre PAS un flow clinique. Un
  // faux négatif ici laisse un tour normal (le plancher reste fail-CLOSED sur
  // les surfaces proactives, W4.6); un faux positif enfermerait tous les
  // élèves dans un flow TCA pendant une panne de base.
  assertEquals(
    conversationalRestrictionGuardForRouters({
      restriction: null,
      tempMemory: {},
      userMessage: "salut",
    }),
    null,
  );
  assertEquals(
    conversationalRestrictionGuardForRouters({
      restriction: {
        guard_version: "restriction_guard.v1",
        restriction_flag: false,
        triggers: [],
        evaluated_for_date: "2026-07-27",
      },
      tempMemory: {},
      userMessage: "salut",
    }),
    null,
  );
});

Deno.test("(d-ter) a CLOSED episode does not re-trap the student, and names its two disarm conditions", () => {
  // `safety-crisis-flow-no-exit-on-denial`: un flow qu'on ne peut pas quitter
  // est un piège. Le plancher reste levé plusieurs jours (série de poids), donc
  // sans ce verrou l'élève recevrait le tour d'entrée à CHAQUE message.
  const guard = raisedGuard(["rapid_weight_loss", "energy_deficit_streak"]);
  const closed = {
    __keel_disordered_eating_guard_state: {
      episode_key: "energy_deficit_streak+rapid_weight_loss",
      closed: true,
      working_state: { phase: "closed" },
      updated_at: "2026-07-27T09:00:00.000Z",
    },
  };

  assertEquals(
    conversationalRestrictionGuardForRouters({
      restriction: guard,
      tempMemory: closed,
      userMessage: "bon, sinon, on parle de quoi ?",
    }),
    null,
    "a closed episode must not re-open on the same triggers",
  );

  // Désarmement 1 — un symptôme médical aigu rouvre, quoi qu'il arrive.
  assert(
    conversationalRestrictionGuardForRouters({
      restriction: guard,
      tempMemory: closed,
      userMessage: "j'ai fait un malaise ce matin",
    })?.restriction_flag,
  );

  // Désarmement 2 — un ÉPISODE différent (nouveaux déclencheurs) rouvre.
  assert(
    conversationalRestrictionGuardForRouters({
      restriction: raisedGuard(["compensatory_language"]),
      tempMemory: closed,
      userMessage: "bon, sinon, on parle de quoi ?",
    })?.restriction_flag,
  );
});

// ---------------------------------------------------------------------------
// plan_question: la cible se RÉSOUT ou s'escalade, elle ne se devine pas
// ---------------------------------------------------------------------------

function line(patch: Record<string, unknown>) {
  return {
    commitment_id: "c-1",
    title: "Baies au petit dej",
    student_instruction: null,
    content_locale: "fr-FR",
    polarity: "do",
    priority: "core",
    autonomy: "swap_within_policy",
    grain: "day",
    slot_kind: "nominal",
    bucket: "breakfast",
    anchor_text: "slot morning",
    target_text: "serving berries >= 1 portion",
    status: "unknown",
    timing_status: "unknown",
    observed_value: null,
    evidence: "none",
    counts_toward_adherence: true,
    auto_source: null,
    flex_eligible: true,
    swap_allowed: true,
    food_group_ref: "berries",
    substance_ref: null,
    ...patch,
  } as never;
}

Deno.test("plan_question — the targeted commitment is resolved by evidence, never guessed", () => {
  const planContext = {
    context_version: "keel_plan_context_v1",
    local_date: "2026-07-27",
    day: "mon",
    plan_version_id: "pv-1",
    today: [
      line({ commitment_id: "c-berries", food_group_ref: "berries" }),
      line({
        commitment_id: "c-fish",
        food_group_ref: "fatty_fish",
        bucket: "dinner",
      }),
    ],
    week: [],
    remaining: [],
    deviation_declared: false,
    deviated_slots: [],
    counts: {
      scheduled_today: 2,
      resolved_today: 0,
      remaining_today: 2,
      week_grain: 0,
    },
  } as never;

  // La preuve la plus forte: le groupe prescrit nommé par le dispatcher.
  assertEquals(
    resolvePlanQuestionCommitmentId({
      planContext,
      prescribedFoodGroup: "fatty_fish",
      slotHint: null,
    }),
    "c-fish",
  );
  // Puis le créneau, quand il ne désigne qu'une ligne.
  assertEquals(
    resolvePlanQuestionCommitmentId({
      planContext,
      prescribedFoodGroup: null,
      slotHint: "dinner",
    }),
    "c-fish",
  );
  // Sinon: null. Escalader vers le coach est un résultat correct; deviner la
  // ligne visée accorderait une permission sur la mauvaise prescription.
  assertEquals(
    resolvePlanQuestionCommitmentId({
      planContext,
      prescribedFoodGroup: null,
      slotHint: null,
    }),
    null,
  );
  assertEquals(
    resolvePlanQuestionCommitmentId({
      planContext: null,
      prescribedFoodGroup: "berries",
      slotHint: null,
    }),
    null,
  );
});

// ---------------------------------------------------------------------------
// R7 à la frontière: un slug inventé échoue BRUYAMMENT, il n'écrit rien
// ---------------------------------------------------------------------------

Deno.test("R7 — an invented token refuses the write loudly instead of landing a wrong fact", async () => {
  // Vague 0 a déjà payé ce cas: le modèle avait inventé `epa_dha`. La bonne
  // issue n'est pas « écrire quand même le plus proche », c'est un refus nommé
  // qui dit QUEL token a échoué — une ligne append-only fausse ne se retire pas.
  const inserted: unknown[] = [];
  const { client } = fakeSupabase({
    onInsert: (_table, row) => inserted.push(row),
    insertedRow: () => ({ id: "should-not-exist" }),
  });

  const turnFrame = frame({
    direct_effects: [{
      effect_type: "log_protocol_event",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { substance_ref: "unobtainium" },
    }],
  });

  const runtime = await runKeelDirectEffectLane({
    supabase: client,
    userId: USER_ID,
    userMessage: "j'ai pris mon unobtainium",
    channel: "web",
    turnFrame,
    routeDecision: routeFor(turnFrame),
    tempMemory: {},
    keel: KEEL_STUDENT,
  });

  assertEquals(inserted.length, 0);
  assertEquals(runtime?.toolSkillRun.committed_effects, []);
  assertEquals(runtime?.toolSkillRun.blocked_effects, [
    { type: "log_protocol_event", reason_code: "unknown_token" },
  ]);
  // Le refus NOMME le token fautif, il ne se contente pas de dire non.
  assert(
    String(runtime?.content ?? "").includes("unobtainium"),
    "the refusal must surface the exact token that failed to parse",
  );
});

// ---------------------------------------------------------------------------
// R2: pas de locale persistée => pas d'écriture (jamais de langue devinée)
// ---------------------------------------------------------------------------

Deno.test("R2 — a missing conversation locale refuses the write rather than guessing the language", async () => {
  const inserted: unknown[] = [];
  const { client } = fakeSupabase({
    onInsert: (_table, row) => inserted.push(row),
    insertedRow: () => ({ id: "should-not-exist" }),
  });

  const turnFrame = frame({
    direct_effects: [{
      effect_type: "log_protocol_event",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { substance_ref: "magnesium_glycinate" },
    }],
  });

  const runtime = await runKeelDirectEffectLane({
    supabase: client,
    userId: USER_ID,
    userMessage: "j'ai pris mon magnésium",
    channel: "web",
    turnFrame,
    routeDecision: routeFor(turnFrame),
    tempMemory: {},
    keel: { ...KEEL_STUDENT, content_locale: null },
  });

  assertEquals(inserted.length, 0);
  assertEquals(runtime?.toolSkillRun.blocked_effects, [
    { type: "log_protocol_event", reason_code: "missing_content_locale" },
  ]);
});
