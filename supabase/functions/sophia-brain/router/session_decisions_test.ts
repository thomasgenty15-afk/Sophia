import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  sessionDecisionFromCoachingState,
  sessionDecisionFromFeatureOpportunityState,
  sessionDecisionFromPlanRealignmentState,
  sessionDecisionsFromTempMemory,
  sessionDecisionsPromptBlock,
  withSessionDecision,
} from "./session_decisions.ts";

Deno.test("coaching state with a retained potion yields a session decision (nina-r6 B01)", () => {
  const decision = sessionDecisionFromCoachingState({
    current_recommendation: { feature: "state_potion" },
    last_visible_decision: {
      lever: "state_potion",
      variant: null,
      potion_type: "amour",
      reason: "besoin de douceur",
      confidence: "high",
    },
  });
  assertEquals(decision?.potion_type, "amour");
  assertEquals(decision?.feature, "state_potion");

  // Anti-faux-positif: etat sans recommandation → rien.
  assertEquals(sessionDecisionFromCoachingState({ turn_count: 2 }), null);
  assertEquals(sessionDecisionFromCoachingState(null), null);
});

Deno.test("session decisions block carries the canonical potion catalogue and grounding rules", () => {
  let tempMemory: Record<string, unknown> = {};
  tempMemory = withSessionDecision(tempMemory, {
    source: "coaching_recommendation",
    feature: "state_potion",
    lever: "state_potion",
    technique: null,
    potion_type: "amour",
  });
  const block = sessionDecisionsPromptBlock(tempMemory);
  assertEquals(block?.includes("DECISIONS DE SESSION"), true);
  assertEquals(block?.includes("potion amour"), true);
  assertEquals(
    block?.includes(
      "apaisement, amour, courage, clarte, guerison, anti_decrochage",
    ),
    true,
  );
  assertEquals(block?.includes("JAMAIS depuis ta memoire libre"), true);
  assertEquals(block?.includes("tranche explicitement"), true);

  // Upsert: la meme decision ne s'empile pas; une nouvelle s'ajoute.
  tempMemory = withSessionDecision(tempMemory, {
    source: "coaching_recommendation",
    feature: "state_potion",
    lever: "state_potion",
    technique: null,
    potion_type: "amour",
  });
  tempMemory = withSessionDecision(tempMemory, {
    source: "coaching_recommendation",
    feature: "attack_card",
    lever: "attack_card",
    technique: "mot_de_bascule",
    potion_type: null,
  });
  const decisions = tempMemory.__session_decisions as unknown[];
  assertEquals(decisions.length, 2);

  // Aucune decision → aucun bloc (pas de bruit).
  assertEquals(sessionDecisionsPromptBlock({}), null);
});

Deno.test("une nouvelle decision sur le meme levier supersede l'ancienne en 'ecartee' (rose-r7 B03)", () => {
  let tempMemory: Record<string, unknown> = {};
  // Capitulation initiale: courage retenu sur le levier state_potion.
  tempMemory = withSessionDecision(tempMemory, {
    source: "coaching_recommendation",
    feature: "state_potion",
    lever: "state_potion",
    technique: null,
    potion_type: "courage",
    handoff: null,
    status: "retained",
  });
  // Rejet user → le flow retient apaisement sur la MEME position.
  tempMemory = withSessionDecision(tempMemory, {
    source: "coaching_recommendation",
    feature: "state_potion",
    lever: "state_potion",
    technique: null,
    potion_type: "apaisement",
    handoff: null,
    status: "retained",
  });
  const decisions = sessionDecisionsFromTempMemory(tempMemory);
  assertEquals(decisions.length, 2);
  assertEquals(
    decisions.find((d) => d.potion_type === "courage")?.status,
    "dropped",
  );
  assertEquals(
    decisions.find((d) => d.potion_type === "apaisement")?.status,
    "retained",
  );
  const block = sessionDecisionsPromptBlock(tempMemory);
  assertEquals(block?.includes("potion apaisement"), true);
  assertEquals(block?.includes("Options ECARTEES"), true);
  assertEquals(
    block?.includes("jamais a re-lister comme retenues"),
    true,
  );
  // La ligne ecartee liste bien courage, separee des retenues.
  const retainedSection = block?.split("Options ECARTEES")[0] ?? "";
  assertEquals(retainedSection.includes("potion courage"), false);

  // Anti-faux-positif: une decision sur une AUTRE position ne droppe rien.
  tempMemory = withSessionDecision(tempMemory, {
    source: "coaching_recommendation",
    feature: "attack_card",
    lever: "attack_card",
    technique: "mot_de_bascule",
    potion_type: null,
    handoff: null,
    status: "retained",
  });
  const after = sessionDecisionsFromTempMemory(tempMemory);
  assertEquals(
    after.find((d) => d.potion_type === "apaisement")?.status,
    "retained",
  );
});

Deno.test("les hand-offs feature_opportunity et plan_realignment sont captures comme decisions de session (paul-r9 B02, nina-r7 B04)", () => {
  const initiative = sessionDecisionFromFeatureOpportunityState({
    feature: "initiatives",
    user_problem_summary: "message de motivation chaque matin a 7h30",
    turn_count: 2,
    max_turns: 6,
  });
  assertEquals(initiative?.source, "feature_opportunity");
  assertEquals(
    initiative?.handoff?.includes("7h30"),
    true,
  );

  const realignment = sessionDecisionFromPlanRealignmentState({
    drift_type: "plan_too_light",
    scope: "week",
  });
  assertEquals(realignment?.source, "plan_realignment");
  assertEquals(realignment?.handoff?.includes("plan_too_light"), true);

  // Anti-faux-positifs: pas de feature → rien; drift ambigu → rien.
  assertEquals(sessionDecisionFromFeatureOpportunityState({ feature: null }), null);
  assertEquals(
    sessionDecisionFromPlanRealignmentState({ drift_type: "ambiguous" }),
    null,
  );

  // Le bloc liste le reste-a-faire.
  let tempMemory: Record<string, unknown> = {};
  tempMemory = withSessionDecision(tempMemory, initiative);
  const block = sessionDecisionsPromptBlock(tempMemory);
  assertEquals(block?.includes("initiatives"), true);
  assertEquals(block?.includes("reste a faire de ton cote"), true);
});

Deno.test("les entrees pre-V5 sans statut restent lues comme retenues (retro-compatibilite d'etat)", () => {
  const block = sessionDecisionsPromptBlock({
    __session_decisions: [{
      source: "coaching_recommendation",
      feature: "state_potion",
      lever: "state_potion",
      technique: null,
      potion_type: "amour",
    }],
  });
  assertEquals(block?.includes("potion amour"), true);
  assertEquals(block?.includes("Options ECARTEES"), false);
});
