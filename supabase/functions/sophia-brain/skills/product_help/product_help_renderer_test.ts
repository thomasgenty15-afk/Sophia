import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { baseProductHelpDecision } from "./contract.ts";
import { reduceProductHelpTurn } from "./reducer.ts";
import {
  getProductHelpFeature,
  retrieveProductHelpCandidates,
} from "./retrieval.ts";

function catalogDecision(
  patch: Parameters<typeof baseProductHelpDecision>[0],
) {
  return baseProductHelpDecision({
    target: {
      kind: "feature_catalog",
      feature_id: "resources.attack_vs_defense_cards",
      confidence_band: "high",
    },
    grounding: {
      catalog_feature_ids: ["resources.attack_vs_defense_cards"],
      db_sources_required: false,
      db_sources_used: [{
        source_type: "catalog",
        id: "resources.attack_vs_defense_cards",
        label: "Cartes d'attaque et de defense",
      }],
    },
    response_contract: {
      max_questions: 0,
      allow_operation_suggestion: false,
      allow_status_projection: false,
      allow_generic_catalog_answer: true,
      must_include_location: false,
      must_include_limit: false,
    },
    ...patch,
  });
}

Deno.test("product_help compare fallback is a targeted choice, not a catalog block", () => {
  const feature = getProductHelpFeature("resources.attack_vs_defense_cards")!;
  const candidates = retrieveProductHelpCandidates(
    "attaque vs defense, je choisis quoi quand je veux juste me mettre a l'action ?",
  );
  assertEquals(candidates[0]?.id, "resources.attack_vs_defense_cards");

  const output = reduceProductHelpTurn({
    feature,
    intake_errors: [],
    decision: catalogDecision({
      intent: "compare_features",
    }),
  });

  assertEquals(output.response_intent, "compare_features");
  assertEquals(output.operation_suggestions, []);
  assertStringIncludes(output.reply ?? "", "Pour choisir");
  assertStringIncludes(output.reply ?? "", "carte d'attaque");
  assertStringIncludes(output.reply ?? "", "te mettre a l'action");
  assertStringIncludes(output.reply ?? "", "moment de risque");
  assertEquals((output.reply ?? "").includes("Ce que ca apporte"), false);
});

Deno.test("product_help compare accepts a structured targeted reply", () => {
  const feature = getProductHelpFeature("resources.attack_vs_defense_cards")!;
  const targetedReply =
    "Pour te mettre a l'action, pars sur une carte d'attaque. La defense sert plutot si tu risques de derailer pendant l'action.";
  const output = reduceProductHelpTurn({
    feature,
    intake_errors: [],
    decision: catalogDecision({
      intent: "compare_features",
      reply: targetedReply,
    }),
  });

  assertEquals(output.reply, targetedReply);
  assertEquals(output.operation_suggestions, []);
});

Deno.test("product_help where_is_it answers conditional card location without the full template", () => {
  const feature = getProductHelpFeature("resources.attack_card")!;
  const output = reduceProductHelpTurn({
    feature,
    intake_errors: [],
    decision: catalogDecision({
      intent: "where_is_it",
      target: {
        kind: "feature_catalog",
        feature_id: "resources.attack_card",
        confidence_band: "high",
      },
      grounding: {
        catalog_feature_ids: ["resources.attack_card"],
        db_sources_required: false,
        db_sources_used: [{
          source_type: "catalog",
          id: "resources.attack_card",
          label: "Carte d'attaque",
        }],
      },
      response_contract: {
        max_questions: 0,
        allow_operation_suggestion: false,
        allow_status_projection: false,
        allow_generic_catalog_answer: true,
        must_include_location: true,
        must_include_limit: true,
      },
    }),
  });

  assertEquals(output.response_intent, "where_is_it");
  assertEquals(output.operation_suggestions, []);
  assertStringIncludes(output.reply ?? "", "Si une carte d'attaque");
  assertStringIncludes(output.reply ?? "", "Dashboard > Ressources");
  assertStringIncludes(output.reply ?? "", "Je ne peux pas confirmer");
  assertEquals((output.reply ?? "").includes("Ce que ca apporte"), false);
  assertEquals((output.reply ?? "").includes("Le texte magique"), false);
});
