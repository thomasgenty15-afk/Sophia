import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildClarificationContextPack } from "./context_pack.ts";
import type { ClarificationCandidateSignal } from "./contract.ts";

function signal(operationType: string): ClarificationCandidateSignal {
  return {
    candidate_id: operationType,
    label: operationType,
    target_dispatcher: operationType,
    operation_type: operationType,
    surface_id: null,
    confidence: "high",
    why_plausible: "test",
    structured_payload_hint: {},
  };
}

function fakeSupabase(rowsByTable: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        then(resolve: (value: { data: unknown[]; error: null }) => void) {
          resolve({ data: rowsByTable[table] ?? [], error: null });
        },
      };
      return builder;
    },
  } as any;
}

Deno.test("clarification context pack loads union projections for attack and defense", async () => {
  const pack = await buildClarificationContextPack({
    supabase: fakeSupabase({
      user_attack_cards: [{
        id: "attack-1",
        content: { title: "Demarrer le sport" },
        status: "active",
      }],
      user_defense_cards: [{
        id: "defense-1",
        content: { title: "Soiree a risque" },
        status: "active",
      }],
      user_plan_items: [{
        id: "plan-1",
        title: "Routine du matin",
        status: "active",
        kind: "habit",
      }],
    }),
    userId: "user-1",
    candidateSignals: [
      signal("prepare_attack_card"),
      signal("prepare_defense_card"),
    ],
  });

  assertEquals(pack.projections.attack_cards[0].title, "Demarrer le sport");
  assertEquals(pack.projections.attack_cards[0].source, "db_context");
  assertEquals(pack.projections.attack_cards[0].context_status, "db_derived");
  assertEquals(pack.projections.attack_cards[0].confidence, "high");
  assertEquals(pack.projections.defense_cards[0].title, "Soiree a risque");
  assertEquals(pack.projections.active_plan_items[0].title, "Routine du matin");
});

Deno.test("clarification context pack loads reminders and plan for recurring versus adjust", async () => {
  const pack = await buildClarificationContextPack({
    supabase: fakeSupabase({
      user_recurring_reminders: [{
        id: "reminder-1",
        message_instruction: "Faire le bilan",
        status: "active",
      }],
      user_plan_items: [{
        id: "plan-1",
        title: "Bilan hebdo",
        status: "active",
      }],
    }),
    userId: "user-1",
    candidateSignals: [
      signal("create_recurring_reminder"),
      signal("adjust_plan_item"),
    ],
  });

  assertEquals(pack.projections.recurring_reminders[0].title, "Faire le bilan");
  assertEquals(pack.projections.active_plan_items[0].title, "Bilan hebdo");
});

Deno.test("clarification context pack returns empty projections without db-backed candidates", async () => {
  const pack = await buildClarificationContextPack({
    supabase: fakeSupabase({}),
    userId: "user-1",
    candidateSignals: [signal("product_help")],
  });

  assertEquals(pack.projections.attack_cards.length, 0);
  assertEquals(pack.projections.active_plan_items.length, 0);
  assertEquals(pack.retrieval_notes, ["no_db_backed_candidate_family"]);
});
