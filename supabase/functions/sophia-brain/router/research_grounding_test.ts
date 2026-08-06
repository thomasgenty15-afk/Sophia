import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  RESEARCH_CONTEXT_MARKER,
  runResearchGroundingLane,
} from "./research_grounding.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";

function frame(patch: Record<string, unknown> = {}): TurnFrame {
  return {
    turn_id: "t1",
    source_message_id: "m1",
    user_id: "u1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
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
  } as unknown as TurnFrame;
}

Deno.test("research lane executes on structured signal and builds the companion block", async () => {
  const result = await runResearchGroundingLane({
    declaredMedicalCondition: null,
    turnFrame: frame({
      needs_research: {
        detected: true,
        value: true,
        query: "magnesium envies de sucre etudes recentes",
        confidence: 0.98,
      },
    }),
    searchFn: async (query: string) => ({
      text: `Resultat frais pour ${query}.`,
      snippets: ["snippet"],
      sources: ["https://example.org/etude"],
    }),
  });
  assertEquals(result.outcome, "executed");
  assertEquals(result.honesty_directive, null);
  assertEquals(result.context_block?.includes(RESEARCH_CONTEXT_MARKER), true);
  assertEquals(
    result.context_block?.includes("magnesium envies de sucre"),
    true,
  );
  assertEquals(
    result.context_block?.includes("https://example.org/etude"),
    true,
  );
});

Deno.test("research lane failure yields the honesty directive, never a block (cmd 7)", async () => {
  const failed = await runResearchGroundingLane({
    declaredMedicalCondition: null,
    turnFrame: frame({
      needs_research: { detected: true, value: true, query: "quoi de neuf" },
    }),
    searchFn: async () => {
      throw new Error("network down");
    },
  });
  assertEquals(failed.outcome, "failed");
  assertEquals(failed.context_block, null);
  assertEquals(
    failed.honesty_directive?.includes("Ne dis JAMAIS que tu as verifie"),
    true,
  );

  const empty = await runResearchGroundingLane({
    declaredMedicalCondition: null,
    turnFrame: frame({
      needs_research: { detected: true, value: true, query: "quoi de neuf" },
    }),
    searchFn: async () => ({ text: "", snippets: [], sources: [] }),
  });
  assertEquals(empty.outcome, "empty");
  assertEquals(empty.honesty_directive !== null, true);
});

Deno.test("research lane stays silent without signal and mutes on high safety (anti-faux-positif)", async () => {
  let called = 0;
  const spy = async () => {
    called += 1;
    return { text: "x", snippets: [], sources: [] };
  };

  const none = await runResearchGroundingLane({
    declaredMedicalCondition: null,
    turnFrame: frame(),
    searchFn: spy,
  });
  assertEquals(none.outcome, "not_requested");
  assertEquals(none.context_block, null);
  assertEquals(none.honesty_directive, null);

  const falseValue = await runResearchGroundingLane({
    declaredMedicalCondition: null,
    turnFrame: frame({
      needs_research: { detected: true, value: false, query: "x" },
    }),
    searchFn: spy,
  });
  assertEquals(falseValue.outcome, "not_requested");

  // LA COUPURE MÉDICALE, exercée — elle ne l'était par aucun test, et la
  // revalidation en réel n'a pas pu la prouver: `declaredMedicalCondition`
  // valait `null` dans les six fixtures. Une recherche « quoi manger quand on a
  // telle maladie » rapporte par construction ce que la garde clinique interdit
  // de dire, et le composeur la remet EN TÊTE du prompt.
  const medical = await runResearchGroundingLane({
    declaredMedicalCondition: "diabetes",
    turnFrame: frame({
      needs_research: {
        detected: true,
        value: true,
        query: "dietary advice for type 2 diabetes",
      },
    }),
    searchFn: (() => {
      throw new Error("la recherche ne doit PAS être appelée sur une maladie déclarée");
    }) as never,
  });
  assertEquals(medical.outcome, "medical_muted");
  assertEquals(medical.context_block, null);
  // Pas de directive d'honnêteté non plus: on n'a rien tenté, donc il n'y a
  // rien à avouer. La dire ferait parler l'agent d'une recherche absente.
  assertEquals(medical.honesty_directive, null);

  const high = await runResearchGroundingLane({
    declaredMedicalCondition: null,
    turnFrame: frame({
      safety: { risk_band: "high", reason_codes: [], evidence: [] },
      needs_research: { detected: true, value: true, query: "x" },
    }),
    searchFn: spy,
  });
  assertEquals(high.outcome, "safety_muted");
  assertEquals(called, 0);
});
