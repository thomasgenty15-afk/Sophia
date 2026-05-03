import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { detectMemorySignals } from "./signal_detection.ts";
import { routeTopic } from "./topic_router.ts";

Deno.test("routeTopic keeps breakup topic sticky for scenario 01", async () => {
  const signals = detectMemorySignals(
    "Ce matin j'ai relu ses messages et ca m'a remis dedans.",
  );
  const routed = await routeTopic({
    message: "Ce matin j'ai relu ses messages et ca m'a remis dedans.",
    retrieval_mode: signals.retrieval_mode,
    signals,
    active_topic: { id: "t1", slug: "rupture_couple", title: "Rupture couple" },
    candidate_topics: [{
      id: "t2",
      slug: "travail_manager",
      title: "Conflit manager",
    }],
  });
  assertEquals(routed.decision, "stay");
  assertEquals(routed.active_topic_slug, "rupture_couple");
});

Deno.test("routeTopic avoids lateral false switch for scenario 02", async () => {
  const msg =
    "Au passage mon cafe etait degueu, mais le vrai sujet c'est que je repousse tout.";
  const signals = detectMemorySignals(msg);
  const routed = await routeTopic({
    message: msg,
    retrieval_mode: signals.retrieval_mode,
    signals,
    active_topic: {
      id: "t1",
      slug: "discipline_matin",
      title: "Discipline du matin",
    },
    candidate_topics: [{ id: "t2", slug: "cafe", title: "Cafe" }],
  });
  assertEquals(routed.decision, "stay");
  assertEquals(routed.active_topic_slug, "discipline_matin");
});

Deno.test("routeTopic switches on explicit work topic for scenario 03", async () => {
  const msg =
    "Changement de sujet: au travail mon manager m'a encore humilie en reunion.";
  const signals = detectMemorySignals(msg);
  const routed = await routeTopic({
    message: msg,
    retrieval_mode: signals.retrieval_mode,
    signals,
    active_topic: { id: "t1", slug: "rupture_couple", title: "Rupture couple" },
    candidate_topics: [{
      id: "t2",
      slug: "travail_manager",
      title: "Conflit manager",
    }],
  });
  assertEquals(routed.decision, "switch");
  assertEquals(routed.active_topic_slug, "travail_manager");
});

Deno.test("routeTopic calls LLM only in grey zone", async () => {
  let calls = 0;
  const signals = detectMemorySignals("je suis encore partage");
  for (const similarity of [0.2, 0.45, 0.8, 0.1, 0.7]) {
    await routeTopic({
      message: "je suis encore partage",
      retrieval_mode: signals.retrieval_mode,
      signals,
      active_topic: { id: "t1", title: "Sujet", similarity },
      llm_router: async () => {
        calls++;
        return { decision: "stay", topic_id: "t1", confidence: 0.6 };
      },
    });
  }
  assertEquals(calls, 1);
  assertEquals(calls / 5 < 0.25, true);
});
