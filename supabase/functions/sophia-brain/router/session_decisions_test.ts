import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  sessionDecisionFromPlanRealignmentState,
  sessionDecisionsFromTempMemory,
  sessionDecisionsPromptBlock,
  withSessionDecision,
} from "./session_decisions.ts";

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

// W2.B: le volet `feature_opportunity` de ce test est parti avec le skill.
// La retro-compatibilite d'ETAT reste couverte plus bas: une entree persistee
// portant `source: "feature_opportunity"` doit encore etre relue telle quelle.
Deno.test("le hand-off plan_realignment est capture comme decision de session (nina-r7 B04)", () => {
  const realignment = sessionDecisionFromPlanRealignmentState({
    drift_type: "plan_too_light",
    scope: "week",
  });
  assertEquals(realignment?.source, "plan_realignment");
  assertEquals(realignment?.handoff?.includes("plan_too_light"), true);

  // Anti-faux-positif: drift ambigu → rien.
  assertEquals(
    sessionDecisionFromPlanRealignmentState({ drift_type: "ambiguous" }),
    null,
  );

  // Le bloc liste le reste-a-faire.
  let tempMemory: Record<string, unknown> = {};
  tempMemory = withSessionDecision(tempMemory, realignment);
  const block = sessionDecisionsPromptBlock(tempMemory);
  assertEquals(block?.includes("plan_too_light"), true);
  assertEquals(block?.includes("reste a faire de ton cote"), true);
});

// W2.B: garde-fou de retro-compatibilite d'ETAT — une decision persistee par
// l'ancien skill `feature_opportunity` doit rester lue avec sa source, jamais
// re-etiquetee en `coaching_recommendation`.
Deno.test("une decision persistee source=feature_opportunity reste relue telle quelle (retro-compatibilite W2.B)", () => {
  const decisions = sessionDecisionsFromTempMemory({
    __session_decisions: [{
      source: "feature_opportunity",
      feature: "initiatives",
      handoff: "initiatives: message de motivation chaque matin a 7h30",
      status: "retained",
    }],
  });
  assertEquals(decisions.length, 1);
  assertEquals(decisions[0].source, "feature_opportunity");
  assertEquals(decisions[0].handoff?.includes("7h30"), true);
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
