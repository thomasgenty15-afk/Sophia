// Régression chantier 2 phase B (2026-05-28): loadDurableEffectsSummary doit
// produire un bloc texte fiable (et seulement en mode companion) qui empêche
// le LLM d'halluciner l'absence d'effets durables existants côté DB.
//
// Voir A2-r4 Tour 9 et docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md,
// chantier 2 phase B.

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  loadDurableEffectsSummary,
  loadRecentDirectEffectConfirmationContext,
  loadRecentEffectsLedgerSummary,
} from "./loader.ts";

type TableRowsByName = Record<string, unknown[]>;

function makeFakeSupabase(rowsByTable: TableRowsByName) {
  return {
    from(table: string) {
      const rows = rowsByTable[table] ?? [];
      const builder: any = {
        _rows: rows,
        _isMaybeSingle: false,
        select(_cols: string) {
          return this;
        },
        eq(_col: string, _val: unknown) {
          return this;
        },
        order(_col: string, _opts?: any) {
          return this;
        },
        like(_col: string, _val: string) {
          return this;
        },
        gte(_col: string, _val: unknown) {
          return this;
        },
        not(_col: string, _op: string, _val: unknown) {
          return this;
        },
        in(_col: string, _vals: unknown[]) {
          return this;
        },
        _limit: undefined as number | undefined,
        limit(n: number) {
          this._limit = n;
          return this;
        },
        maybeSingle() {
          // Chantier 12: profiles query uses maybeSingle(), return first
          // row or null.
          return Promise.resolve({
            data: rows[0] ?? null,
            error: null,
          });
        },
        then(
          onFulfilled: (
            v: { data: unknown[]; count: number; error: null },
          ) => unknown,
        ) {
          // Reproduit le contrat PostgREST: data respecte limit(), count
          // (avec { count: "exact" }) reflete le total DB avant troncature.
          const limited = typeof this._limit === "number"
            ? rows.slice(0, this._limit)
            : rows;
          return Promise.resolve({
            data: limited,
            count: rows.length,
            error: null,
          }).then(onFulfilled);
        },
      };
      return builder;
    },
  } as any;
}

Deno.test("loadDurableEffectsSummary returns null when nothing durable exists", async () => {
  const supabase = makeFakeSupabase({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [],
    user_profile_facts: [],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  assertEquals(summary, null);
});

Deno.test("loadDurableEffectsSummary lists an active attack card and forbids 'pas créé' (A2-r4 T9)", async () => {
  const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const supabase = makeFakeSupabase({
    user_attack_cards: [{
      id: "card-1",
      generated_at: recent,
      content: {
        operation_draft: {
          title: "Payer la facture une fois pour toutes",
          technique: "ancre_visuelle",
        },
      },
    }],
    user_defense_cards: [],
    scheduled_checkins: [],
    user_profile_facts: [],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  assertStringIncludes(summary, "ÉTAT DURABLE ACTUEL");
  assertStringIncludes(summary, "Carte d'attaque active");
  assertStringIncludes(summary, "Payer la facture une fois pour toutes");
  assertStringIncludes(summary, "ancre_visuelle");
  // Garde-fou: la consigne anti-hallucination doit être présente.
  assertStringIncludes(
    summary,
    'Ne dis JAMAIS "on n\'a pas validé/créé X"',
  );
});

Deno.test("loadDurableEffectsSummary mentions absence explicitly when defense card is missing", async () => {
  const recent = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const supabase = makeFakeSupabase({
    user_attack_cards: [{
      id: "a-1",
      generated_at: recent,
      content: { operation_draft: { title: "Tri PDF Express" } },
    }],
    user_defense_cards: [],
    scheduled_checkins: [],
    user_profile_facts: [],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  assertStringIncludes(summary, "Carte d'attaque active");
  assertStringIncludes(summary, "Carte de défense active: aucune.");
});

Deno.test("loadDurableEffectsSummary lists pending one-shot reminders with scheduled_for and instruction", async () => {
  const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const supabase = makeFakeSupabase({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [{
      id: "r-1",
      scheduled_for: inOneHour,
      status: "pending",
      message_payload: {
        reminder_instruction: "Payer la facture",
      },
    }],
    user_profile_facts: [],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  assertStringIncludes(summary, "Rappels ponctuels en attente (1)");
  assertStringIncludes(summary, "Payer la facture");
});

// C3 (2026-07-03) — Régression rose-r2 T15 (BF-STATUS-01): le cap silencieux
// à 5 rappels faisait annoncer "5" comme total exhaustif alors que 6 étaient
// pending en DB (le rappel créé en séance omis). Le summary doit lister tous
// les pending et annoncer le total DB réel.
Deno.test("loadDurableEffectsSummary lists every pending reminder with the real DB total (rose-r2 T15)", async () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    id: `r-${index}`,
    scheduled_for: new Date(Date.now() + (index + 1) * 60 * 60 * 1000)
      .toISOString(),
    status: "pending",
    message_payload: { reminder_instruction: `rappel numero ${index}` },
  }));
  const supabase = makeFakeSupabase({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: rows,
    user_profile_facts: [],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  assertStringIncludes(summary, "Rappels ponctuels en attente (6)");
  for (let index = 0; index < 6; index++) {
    assertStringIncludes(summary, `rappel numero ${index}`);
  }
});

Deno.test("loadDurableEffectsSummary never claims exhaustivity on a truncated reminder list", async () => {
  // 60 pending > borne de chargement (50): le total annoncé reste 60 et la
  // troncature est explicite — jamais de cap silencieux.
  const rows = Array.from({ length: 60 }, (_, index) => ({
    id: `r-${index}`,
    scheduled_for: new Date(Date.now() + (index + 1) * 60 * 60 * 1000)
      .toISOString(),
    status: "pending",
    message_payload: { reminder_instruction: `rappel numero ${index}` },
  }));
  const supabase = makeFakeSupabase({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: rows,
    user_profile_facts: [],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  assertStringIncludes(summary, "Rappels ponctuels en attente (60)");
  assertStringIncludes(summary, "non listé(s) ici");
  assertStringIncludes(summary, "ne présente jamais cette liste comme complète");
});

// Chantier 12 (2026-05-28) — Régression A4-r6 T15: scheduled_for affiché
// en UTC brut dans le summary, le LLM reprenait "09:21/09:37" au lieu
// de "11:21/11:37" (Europe/Paris). Le summary doit fournir l'heure locale.
Deno.test("loadDurableEffectsSummary formats scheduled_for in user timezone (A4-r6 T15)", async () => {
  // 2026-05-28T09:21:00Z = 11:21 Europe/Paris (DST)
  const isoUtc = "2026-05-28T09:21:00.000Z";
  const supabase = makeFakeSupabase({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [{
      id: "r-1",
      scheduled_for: isoUtc,
      status: "pending",
      message_payload: { reminder_instruction: "envoyer la note" },
    }],
    user_profile_facts: [],
    profiles: [{ timezone: "Europe/Paris" }],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  // Heure locale présente.
  assertStringIncludes(summary, "11:21");
  assertStringIncludes(summary, "Europe/Paris");
  // CHANTIER C3: l'heure UTC NE DOIT PLUS apparaître (c'était la source du
  // "09:21" recopié par le LLM à A4-r6 T15). Traçabilité via [ref: id].
  assertEquals(summary.includes("09:21"), false);
  assertEquals(summary.includes("[iso:"), false);
  assertStringIncludes(summary, "[ref: r-1]");
  // Consigne anti-UTC présente.
  assertStringIncludes(
    summary,
    "utilise UNIQUEMENT l'heure locale fournie",
  );
});

Deno.test("loadDurableEffectsSummary falls back to Europe/Paris when profile has no timezone", async () => {
  const supabase = makeFakeSupabase({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [{
      id: "r-1",
      scheduled_for: "2026-05-28T09:21:00.000Z",
      status: "pending",
      message_payload: { reminder_instruction: "envoyer la note" },
    }],
    user_profile_facts: [],
    profiles: [],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  assertStringIncludes(summary, "Europe/Paris");
});

// Chantier 6 (2026-05-28) — Régression A4-r5 T11: avec deux rappels en
// DB, le LLM répondait "non confirmé" sur le second car le summary
// ne détaillait que le premier.
Deno.test("loadDurableEffectsSummary details ALL pending reminders (A4-r5 T11)", async () => {
  const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const supabase = makeFakeSupabase({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [
      {
        id: "r-1",
        scheduled_for: inOneHour,
        status: "pending",
        message_payload: {
          reminder_instruction: "Envoyer à Mina la note finie",
        },
      },
      {
        id: "r-2",
        scheduled_for: inTwoHours,
        status: "pending",
        message_payload: {
          reminder_instruction: "Envoyer à Mina la note finie",
        },
      },
    ],
    user_profile_facts: [],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  // Comptage explicite.
  assertStringIncludes(summary, "Rappels ponctuels en attente (2):");
  // CHANTIER C3: les DEUX rappels sont listés, tracés par leur id (plus par
  // l'ISO UTC). On n'expose plus le scheduled_for brut au LLM.
  assertStringIncludes(summary, "[ref: r-1]");
  assertStringIncludes(summary, "[ref: r-2]");
  assertEquals(summary.includes(inOneHour), false);
  assertEquals(summary.includes(inTwoHours), false);
  // La nouvelle consigne anti-faux-négatif doit être présente.
  assertStringIncludes(
    summary,
    'Ne dis jamais "non" pour un rappel listé ci-dessus',
  );
});

Deno.test("loadDurableEffectsSummary lists explicit coach preferences with key=value format", async () => {
  const supabase = makeFakeSupabase({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [],
    user_profile_facts: [
      {
        key: "coach.tone",
        value: "bienveillant ferme",
        status: "active",
        source_type: "explicit_user",
      },
      {
        key: "coach.challenge_level",
        value: "équilibré",
        status: "active",
        source_type: "explicit_user",
      },
    ],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  assertStringIncludes(summary, "Préférences coach définies par l'utilisateur");
  assertStringIncludes(summary, "coach.tone=bienveillant ferme");
  assertStringIncludes(summary, "coach.challenge_level=équilibré");
});

// CHANTIER E6 (2026-05-28) — Les 9 defaults ne doivent JAMAIS être présentés
// comme des préférences choisies par l'utilisateur. Voir A11 T13.
Deno.test("loadDurableEffectsSummary distingue les defaults système des préférences explicites (A11 T13)", async () => {
  const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const supabase = makeFakeSupabase({
    user_attack_cards: [],
    user_defense_cards: [{
      id: "d-1",
      generated_at: recent,
      content: { operation_draft: { title: "Dossier captures vs Devis" } },
    }],
    scheduled_checkins: [],
    user_profile_facts: [
      {
        key: "coach.tone",
        value: { value: "warm_direct", label: "Bienveillant ferme" },
        status: "active",
        source_type: "system_default",
      },
      {
        key: "coach.challenge_level",
        value: { value: "balanced", label: "Équilibré" },
        status: "active",
        source_type: "system_default",
      },
    ],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  // Pas de préférence explicite -> message clair.
  assertStringIncludes(
    summary,
    "Préférences coach définies par l'utilisateur: aucune",
  );
  // Les defaults sont signalés comme NON choisis par l'utilisateur.
  assertStringIncludes(summary, "par défaut (système)");
  // Consigne anti-confusion présente.
  assertStringIncludes(summary, "aucune préférence coach enregistrée");
});

Deno.test("loadDurableEffectsSummary liste les rappels récurrents actifs (E6)", async () => {
  const supabase = makeFakeSupabase({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [],
    user_profile_facts: [],
    user_recurring_reminders: [{
      id: "rr-1",
      message_instruction: "boire de l'eau",
      local_time_hhmm: "09:00",
      scheduled_days: ["mon", "tue"],
      status: "active",
    }],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  assertStringIncludes(summary, "Rappels récurrents actifs (1)");
  assertStringIncludes(summary, "boire de l'eau");
  assertStringIncludes(summary, "09:00");
});

Deno.test("loadDurableEffectsSummary remonte une session de potion (A3-r10 T15)", async () => {
  const supabase = makeFakeSupabase({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [],
    user_profile_facts: [],
    user_potion_sessions: [{
      id: "p-1",
      potion_type: "apaisement",
      content: { title: "Potion d'apaisement" },
      status: "completed",
      generated_at: new Date().toISOString(),
    }],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  assertStringIncludes(summary, "Potion / mode d'état: une session existe");
  assertStringIncludes(summary, "apaisement");
});

Deno.test("loadDurableEffectsSummary swallows errors and returns null (non-blocking)", async () => {
  const supabase = {
    from(_table: string) {
      const builder: any = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        like() {
          return this;
        },
        limit() {
          return this;
        },
        then(_onFulfilled: any, onRejected: any) {
          return Promise.reject(new Error("DB down")).catch(onRejected);
        },
      };
      return builder;
    },
  } as any;
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  assertEquals(summary, null);
});

Deno.test("loadRecentEffectsLedgerSummary injects committed effects with current DB state", async () => {
  const supabase = makeFakeSupabase({
    turn_summary_logs: [{
      created_at: "2026-07-01T10:00:00.000Z",
      payload: {
        tag: "effect_ledger",
        entries: [{
          turn_id: "turn-1",
          user_id: "u1",
          created_at: "2026-07-01T10:00:00.000Z",
          status: "committed",
          kind: "durable_effect",
          effect_type: "one_shot_reminder.create",
          operation_type: "create_one_shot_reminder",
          source: "executor",
          payload_summary: {
            reminder_instruction: "relire la synthese avant de l'envoyer",
          },
          db_ref: { table: "scheduled_checkins", id: "rem-1" },
        }],
      },
    }],
    scheduled_checkins: [{
      id: "rem-1",
      scheduled_for: "2026-07-01T12:20:00.000Z",
      status: "pending",
      message_payload: {
        reminder_instruction: "relire la synthese avant de l'envoyer",
      },
    }],
  });

  const summary = await loadRecentEffectsLedgerSummary({
    supabase,
    userId: "u1",
    userTimePromptBlock: "user_timezone=Europe/Paris",
  });

  if (!summary) throw new Error("expected non-null summary");
  assertStringIncludes(summary, "EFFETS RÉCENTS");
  assertStringIncludes(summary, "Rappel ponctuel créé");
  assertStringIncludes(summary, "exécuté et persisté");
  assertStringIncludes(summary, "état DB actuel: programmé (pas encore déclenché)");
  assertStringIncludes(summary, "relire la synthese avant de l'envoyer");
  assertStringIncludes(summary, "ne révèle pas le nom EffectLedger");
});

// eva-r8 B04: la fenetre est passee de 5 tours a la SESSION (15 tours) pour
// que le recap de fin de soiree voie encore un effet du debut de session.
Deno.test("loadRecentEffectsLedgerSummary expires effects outside the last fifteen ledger turns", async () => {
  const supabase = makeFakeSupabase({
    turn_summary_logs: [{
      scope: "web",
      created_at: "2026-07-01T10:00:00.000Z",
      payload: {
        tag: "effect_ledger",
        entries: [
          {
            turn_id: "turn-old",
            user_id: "u1",
            created_at: "2026-07-01T10:00:00.000Z",
            status: "committed",
            kind: "durable_effect",
            effect_type: "one_shot_reminder.create",
            operation_type: "create_one_shot_reminder",
            source: "executor",
            payload_summary: { reminder_instruction: "ancien rappel" },
            db_ref: { table: "scheduled_checkins", id: "rem-old" },
          },
          ...Array.from({ length: 15 }, (_, i) => i + 1).map((n) => ({
            turn_id: `turn-keep-${n}`,
            user_id: "u1",
            source_message_id: `source-not-required-${n}`,
            created_at: `2026-07-01T10:${String(n).padStart(2, "0")}:00.000Z`,
            status: "committed",
            kind: "durable_effect",
            effect_type: "one_shot_reminder.create",
            operation_type: "create_one_shot_reminder",
            source: "executor",
            payload_summary: { reminder_instruction: `rappel recent ${n}` },
            db_ref: { table: "scheduled_checkins", id: `rem-keep-${n}` },
          })),
        ],
      },
    }],
    scheduled_checkins: Array.from({ length: 15 }, (_, i) => i + 1).map((n) => ({
      id: `rem-keep-${n}`,
      scheduled_for: "2026-07-01T12:20:00.000Z",
      status: "pending",
      message_payload: { reminder_instruction: `rappel recent ${n}` },
    })),
  });

  const summary = await loadRecentEffectsLedgerSummary({
    supabase,
    userId: "u1",
    scope: "web",
    userTimePromptBlock: "user_timezone=Europe/Paris",
  });

  if (!summary) throw new Error("expected non-null summary");
  assertStringIncludes(summary, "rappel recent 15");
  assertEquals(summary.includes("ancien rappel"), false);
});

Deno.test("loadRecentDirectEffectConfirmationContext projects a committed reminder", async () => {
  const supabase = makeFakeSupabase({
    turn_summary_logs: [{
      scope: "web",
      created_at: "2026-07-01T10:05:00.000Z",
      payload: {
        tag: "effect_ledger",
        entries: [{
          turn_id: "turn-1",
          user_id: "u1",
          source_message_id: "request-id-not-chat-message-id",
          created_at: "2026-07-01T10:05:00.000Z",
          status: "committed",
          kind: "durable_effect",
          effect_type: "one_shot_reminder.create",
          operation_type: "create_one_shot_reminder",
          source: "executor",
          payload_summary: {
            local_label: "dans 20 minutes",
            reminder_instruction: "relire la synthese",
          },
          db_ref: { table: "scheduled_checkins", id: "rem-1" },
        }],
      },
    }],
    scheduled_checkins: [{
      id: "rem-1",
      scheduled_for: "2026-07-01T12:20:00.000Z",
      status: "pending",
      message_payload: { reminder_instruction: "relire la synthese" },
    }],
  });

  const context = await loadRecentDirectEffectConfirmationContext({
    supabase,
    userId: "u1",
    scope: "web",
  });

  assertEquals((context as any)?.has_committed_one_shot_reminder, true);
  assertEquals((context as any)?.one_shot_reminder?.committed, true);
  assertEquals(
    (context as any)?.one_shot_reminder?.reminder_instruction,
    "relire la synthese",
  );
});
