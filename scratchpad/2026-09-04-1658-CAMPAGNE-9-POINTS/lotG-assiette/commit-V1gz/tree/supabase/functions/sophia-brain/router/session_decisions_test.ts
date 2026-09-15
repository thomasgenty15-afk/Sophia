import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {

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

// SUPPRIMÉ: `le hand-off plan_realignment est capturé comme décision de session`.
// `sessionDecisionFromPlanRealignmentState` est parti avec la lane en phase A4;
// ce module n'a plus AUCUN producteur de décision, seulement des lecteurs. La
// rétro-compatibilité d'ÉTAT — une entrée déjà persistée doit rester relue —
// est ce qui compte encore, et le cas juste en dessous la couvre.

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
