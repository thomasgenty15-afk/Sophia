// Régression chantier 2 phase B (2026-05-28): loadDurableEffectsSummary doit
// produire un bloc texte fiable (et seulement en mode companion) qui empêche
// le LLM d'halluciner l'absence d'effets durables existants côté DB.
//
// Voir A2-r4 Tour 9 et docs/agent-playbook/13-architecture-skills,
// chantier 2 phase B.

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import { loadDurableEffectsSummary } from "./loader.ts";

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
        limit(_n: number) {
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
          onFulfilled: (v: { data: unknown[]; error: null }) => unknown,
        ) {
          return Promise.resolve({ data: rows, error: null }).then(
            onFulfilled,
          );
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
    "Ne dis JAMAIS \"on n'a pas validé/créé X\"",
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
  // ISO conservé entre crochets pour traçabilité.
  assertStringIncludes(summary, "[iso: 2026-05-28T09:21:00.000Z]");
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
  // Les DEUX rappels doivent être listés avec leur scheduled_for.
  assertStringIncludes(summary, inOneHour);
  assertStringIncludes(summary, inTwoHours);
  // La nouvelle consigne anti-faux-négatif doit être présente.
  assertStringIncludes(
    summary,
    "Ne dis jamais \"non\" pour un rappel listé ci-dessus",
  );
});

Deno.test("loadDurableEffectsSummary lists coach preferences with key=value format", async () => {
  const supabase = makeFakeSupabase({
    user_attack_cards: [],
    user_defense_cards: [],
    scheduled_checkins: [],
    user_profile_facts: [
      { key: "coach.tone", value: "bienveillant ferme", status: "active" },
      { key: "coach.challenge_level", value: "équilibré", status: "active" },
    ],
  });
  const summary = await loadDurableEffectsSummary(supabase, "u1");
  if (!summary) throw new Error("expected non-null summary");
  assertStringIncludes(summary, "Préférences coach actives");
  assertStringIncludes(summary, "coach.tone=bienveillant ferme");
  assertStringIncludes(summary, "coach.challenge_level=équilibré");
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
