import { assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildCoachingRecommendationBridgeNote,
  isCoachingRecommendationBridgeNote,
} from "../../../_shared/coaching_parent_bridge.ts";
import {
  coachingDispatcherPromptForTest,
  initialCoachingRecommendationStateFromParentBridge,
  normalizeCoachingRecommendationLocalDispatcherOutput,
  reduceCoachingRecommendationLocalDispatcherOutput,
} from "./local_flow.ts";
import { runCoachingRecommendationSkill } from "./skill.ts";
import {
  ACTION_CARD_EMOTIONAL_FRICTION_GUIDANCE_LINES,
  COACHING_ONLY_VISIBLE_GUIDANCE_LINES,
  COACHING_VISIBLE_GLOBAL_RULES,
  LEVER_COMPARISON_KNOWLEDGE_LINES,
} from "./visible_agents/shared.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import { runActionPlanCoachingVisibleAgent } from "./visible_agents/action_plan_coaching.ts";
import { runEmotionCoachingVisibleAgent } from "./visible_agents/emotion_coaching.ts";
import { runNoPlanCoachingVisibleAgent } from "./visible_agents/no_plan_coaching.ts";

function decision(patch: Record<string, unknown> = {}) {
  return normalizeCoachingRecommendationLocalDispatcherOutput({
    flow_action: "recommend_feature",
    confidence: "high",
    risk_score: 0,
    coaching_intent: {
      kind: "feature_choice",
      summary: "User hesitates between attack card and plan adjustment.",
    },
    feature_candidates: [
      {
        feature: "attack_card",
        fit: "medium",
        why: "Useful when the issue is getting started.",
        destination_hint: "Cartes d'attaque dans Sophia.",
      },
      {
        feature: "adjust_plan",
        fit: "high",
        why: "Useful when the action itself is badly calibrated.",
        destination_hint: "Plan dans Sophia.",
      },
    ],
    recommendation: {
      primary_feature: "adjust_plan",
      secondary_feature: "attack_card",
      why_primary: "The action seems miscalibrated, not only forgotten.",
      user_facing_next_step: "ouvre le Plan puis ajuste cette action.",
    },
    state_updates: {
      stage: "recommend",
      status: "active",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "recommend_feature",
      instruction: "Recommend the best feature.",
      conversation_context: {
        state_summary: "Feature choice.",
        known_values: {},
        missing_or_weak_values: [],
        candidate_features: [],
        recommendation: {},
        tone_constraints: [],
        do_not_say: [],
        evidence_used: [],
      },
    },
    note_information: null,
    exit_memo: { needed: false, reason: "none" },
    evidence: ["feature choice"],
    ...patch,
  });
}

function activeCoachingState(localState: Record<string, unknown>) {
  return {
    version: 1 as const,
    skill_id: "coaching_recommendation",
    status: "active" as const,
    turn_count: Number(localState.turn_count ?? 0),
    started_at: "2026-06-22T00:00:00.000Z",
    updated_at: "2026-06-22T00:00:00.000Z",
    user_id: "u1",
    scope: "web",
    working_state: {
      coaching_recommendation_local_state: localState,
    },
  };
}

Deno.test("coaching action visible guidance requires naming attack card technique", () => {
  const guidance = ACTION_CARD_EMOTIONAL_FRICTION_GUIDANCE_LINES.join("\n");
  // La nomination de la technique est desormais scopee a la PREMIERE
  // recommandation (renforcement C5b): sur un follow-up, on passe au contenu
  // concret sans re-nommer la technique.
  assertEquals(
    guidance.includes(
      "Lors de la PREMIERE recommandation d'une carte d'attaque",
    ),
    true,
  );
  assertEquals(
    guidance.includes("nomme la technique conseillee et explique"),
    true,
  );
  assertEquals(guidance.includes("Contre-exemple interdit"), true);
  assertEquals(guidance.includes("Matrice de choix attaque"), true);
  assertEquals(
    guidance.includes("Ne choisis jamais une technique par defaut"),
    true,
  );
  assertEquals(
    guidance.includes(
      "N'utilise pas Preparer le terrain comme reponse automatique",
    ),
    true,
  );
  assertEquals(
    guidance.includes("Le texte magique si le blocage vient d'une pensee"),
    true,
  );
  assertEquals(
    guidance.includes(
      "Preparer le terrain seulement si le blocage vient surtout du contexte concret",
    ),
    true,
  );
  assertEquals(guidance.includes("Mot de bascule = un seul mot"), true);
  assertEquals(guidance.includes("Noms reserves attaque"), true);
  assertEquals(
    guidance.includes("appartiennent uniquement aux cartes d'attaque"),
    true,
  );
  assertEquals(
    guidance.includes(
      "Une carte de defense ne se presente pas par une technique nommee",
    ),
    true,
  );
  assertEquals(
    guidance.includes("moment critique, piege observable"),
    true,
  );
  assertEquals(guidance.includes("Limite carte de defense"), true);
  assertEquals(
    guidance.includes(
      "tu peux expliquer informellement ces composants",
    ),
    true,
  );
  assertEquals(
    guidance.includes(
      "tu ne dois jamais pre-remplir, rediger, simuler ou te projeter dans les sections exactes",
    ),
    true,
  );
  assertEquals(
    guidance.includes(
      "La creation et le remplissage se font ensuite sur la plateforme",
    ),
    true,
  );
  assertEquals(guidance.includes("Interdit carte de defense"), true);
  assertEquals(
    guidance.includes("ne jamais ecrire une liste du type"),
    true,
  );
  assertEquals(guidance.includes("'moment critique: ...'"), true);
  assertEquals(guidance.includes("'piege observable: ...'"), true);
  assertEquals(guidance.includes("'geste de retour: ...'"), true);
  assertEquals(guidance.includes("'plan B: ...'"), true);
  assertEquals(
    guidance.includes("meme si le user demande 'quoi mettre exactement'"),
    true,
  );
  assertEquals(guidance.includes("'champ par champ'"), true);
  assertEquals(
    guidance.includes("ne dis pas 'je peux t'aider a formuler ces elements'"),
    true,
  );
  assertEquals(guidance.includes("Forme autorisee carte de defense"), true);
  assertEquals(
    guidance.includes("Je ne vais pas remplir la carte depuis le chat"),
    true,
  );
  assertEquals(
    guidance.includes("sans donner de valeurs concretes"),
    true,
  );
  assertEquals(guidance.includes("Contre-exemple interdit defense"), true);
  assertEquals(guidance.includes("technique mot de bascule"), true);
  assertEquals(
    guidance.includes("reserve au cas ou le user sait qu'il risque de craquer"),
    true,
  );
  assertEquals(
    guidance.includes("N'utilise pas Mot de bascule pour un simple blocage"),
    true,
  );
  assertEquals(
    guidance.includes("Regle prioritaire action/no-plan"),
    true,
  );
  assertEquals(
    guidance.includes("commence bien puis decroche pendant l'action"),
    true,
  );
  assertEquals(
    guidance.includes("considere defense_card ou free_defense_card avant"),
    true,
  );
  assertEquals(
    guidance.includes(
      "Ne maintiens pas une carte d'attaque seulement parce que step_context.selected_feature=attack_card",
    ),
    true,
  );
});

Deno.test("coaching specialized visible contract allows revising selected attack hint", async () => {
  const source = await Deno.readTextFile(
    new URL("./visible_agents/shared.ts", import.meta.url),
  );
  assertEquals(source.includes("Contrat de decision visible"), true);
  assertEquals(
    source.includes(
      "visible_decision.variant ne doit jamais etre null",
    ),
    true,
  );
  assertEquals(
    source.includes(
      "step_context.selected_feature=attack_card ne force pas visible_decision.lever=attack_card",
    ),
    true,
  );
  assertEquals(
    source.includes(
      "Si step_context.selected_feature=attack_card, la reponse visible doit recommander une carte d'attaque",
    ),
    false,
  );
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes(
      "step_context.selected_feature est une hypothese initiale",
    ),
    true,
  );
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes(
      "Tu peux reviser la feature dans ton perimetre",
    ),
    true,
  );
  assertEquals(source.includes("Correction contractuelle obligatoire"), true);
  assertEquals(
    source.includes("defense_card_message_must_not_name_attack_card_technique"),
    true,
  );
  assertEquals(source.includes("messageContainsAttackTechniqueName"), true);
  assertEquals(
    source.includes("Pour defense_card ou free_defense_card"),
    true,
  );
  assertEquals(source.includes("ne nomme aucune technique d'attaque"), true);
  assertEquals(source.includes("_contract_retry"), true);
  assertEquals(source.includes("completeAttackCardTechnique"), false);
});

Deno.test("coaching in-plan and no-plan visible agents receive defense naming boundary", () => {
  const actionPlan = String(runActionPlanCoachingVisibleAgent);
  const noPlan = String(runNoPlanCoachingVisibleAgent);
  for (const source of [actionPlan, noPlan]) {
    assertEquals(
      source.includes("ACTION_CARD_EMOTIONAL_FRICTION_GUIDANCE_LINES"),
      true,
    );
  }
  const shared = ACTION_CARD_EMOTIONAL_FRICTION_GUIDANCE_LINES.join("\n");
  assertEquals(shared.includes("Contre-exemple interdit defense"), true);
  assertEquals(shared.includes("Limite carte de defense"), true);
  assertEquals(
    shared.includes("mot de bascule est une technique de carte d'attaque"),
    true,
  );
});

Deno.test("coaching visible agents receive transversal lever comparison knowledge", () => {
  const guidance = LEVER_COMPARISON_KNOWLEDGE_LINES.join("\n");
  assertEquals(guidance.includes("Bloc commun comparaison"), true);
  assertEquals(
    guidance.includes("Potion: levier pour un etat emotionnel global"),
    true,
  );
  assertEquals(guidance.includes("potion Amour ou Apaisement"), true);
  assertEquals(guidance.includes("resistance liee a l'action"), true);
});

Deno.test("coaching local dispatcher prompt makes global exit mutually exclusive with active recommendation", async () => {
  const source = await Deno.readTextFile(
    new URL("./local_flow.ts", import.meta.url),
  );
  assertEquals(
    source.includes(
      "exit_to_global_dispatcher est mutuellement exclusif avec une recommandation coaching active",
    ),
    true,
  );
  assertEquals(
    source.includes(
      "Si flow_action=exit_to_global_dispatcher: feature_candidates doit etre []",
    ),
    true,
  );
  assertEquals(
    source.includes(
      "Si recommendation.primary_feature est attack_card, defense_card, adjust_plan ou state_potion",
    ),
    true,
  );
  assertEquals(source.includes("forbidden_contradiction"), true);
});

Deno.test("coaching local dispatcher prompt defines generic flow boundary for global exit", async () => {
  const source = await Deno.readTextFile(
    new URL("./local_flow.ts", import.meta.url),
  );
  assertEquals(source.includes("Frontiere du flow"), true);
  assertEquals(
    source.includes(
      "tu possedes ce tour seulement si le message courant continue le travail de recommandation de coaching en cours",
    ),
    true,
  );
  assertEquals(
    source.includes(
      "si le message courant introduit une intention autonome qui doit etre arbitree globalement",
    ),
    true,
  );
  assertEquals(
    source.includes("Le message courant est prioritaire sur l'etat actif"),
    true,
  );
  assertEquals(
    source.includes("ne le reformule pas en carte, potion ou technique"),
    true,
  );
});

Deno.test("coaching local dispatcher prompt forces progression after an accepted offer (rose-r2 T4, nina-r1 T2)", async () => {
  const source = await Deno.readTextFile(
    new URL("./local_flow.ts", import.meta.url),
  );
  // Offre acceptee => executer l'offre, jamais rejouer le cadrage.
  assertEquals(source.includes("Progression apres acceptation"), true);
  assertEquals(
    source.includes(
      "ne rejoue jamais le meme cadrage ni la meme recommandation",
    ),
    true,
  );
  assertEquals(
    source.includes(
      "visible_task.instruction doit ordonner d'EXECUTER l'offre acceptee",
    ),
    true,
  );
  // Frontiere produit preservee (anti-faux-positif): pas de remplissage de
  // carte depuis le chat, meme apres acceptation.
  assertEquals(
    source.includes(
      "d'accuser l'acceptation et de donner le prochain pas concret sur la plateforme sans re-servir le scaffold",
    ),
    true,
  );
  assertEquals(source.includes("Interdit de progression"), true);
  // Renforcement (probe reel C5b 2026-07-03): un "aide-moi a la preparer" apres
  // une carte recommandee doit faire avancer, pas re-nommer la technique.
  assertEquals(
    source.includes("Distinction contenu vs destination dans un follow-up"),
    true,
  );
  assertEquals(
    source.includes(
      "ordonne d'AVANCER concretement sans re-nommer la technique",
    ),
    true,
  );
  const visibleShared = await Deno.readTextFile(
    new URL("./visible_agents/shared.ts", import.meta.url),
  );
  assertEquals(
    visibleShared.includes("Anti-repetition de cadrage"),
    true,
  );
  assertEquals(
    visibleShared.includes(
      "Ne re-propose jamais une offre que le user vient d'accepter",
    ),
    true,
  );
  // Avancee concrete sur carte d'attaque vs frontiere stricte carte de defense.
  assertEquals(
    visibleShared.includes(
      "Avancer sur une carte d'ATTAQUE deja recommandee",
    ),
    true,
  );
  assertEquals(
    visibleShared.includes(
      "Avancer sur une carte de DEFENSE deja recommandee",
    ),
    true,
  );
  assertEquals(
    visibleShared.includes(
      "La frontiere produit de la carte de defense reste stricte meme sur 'aide-moi a la preparer'",
    ),
    true,
  );
});

Deno.test("coaching visible rules carry presence-first altitude on emotional lows (eva-r1 T1, paul-r1 T12)", async () => {
  const visibleShared = await Deno.readTextFile(
    new URL("./visible_agents/shared.ts", import.meta.url),
  );
  assertEquals(
    visibleShared.includes("Altitude premier tour emotionnel"),
    true,
  );
  assertEquals(
    visibleShared.includes(
      "commence par un beat de validation/accueil humain",
    ),
    true,
  );
  assertEquals(
    visibleShared.includes(
      "jamais sous forme d'instructions UI (chemins d'ecrans, boutons) a ce tour-la",
    ),
    true,
  );
});

Deno.test("coaching local dispatcher prompt preserves stable product followups", async () => {
  const source = await Deno.readTextFile(
    new URL("./local_flow.ts", import.meta.url),
  );
  assertEquals(
    source.includes("Invariant stable recommendation product follow-up"),
    true,
  );
  assertEquals(source.includes("flow_action=answer_followup"), true);
  assertEquals(
    source.includes(
      "visible_task.kind=change_confirm_coaching_type est interdit",
    ),
    true,
  );
  assertEquals(
    source.includes("current_recommendation ne doit pas etre effacee"),
    true,
  );
  assertEquals(
    source.includes("stable_recommendation_product_followup"),
    true,
  );
});

Deno.test("coaching local dispatcher retries stable product followup contract violations", async () => {
  const source = await Deno.readTextFile(
    new URL("./local_flow.ts", import.meta.url),
  );
  assertEquals(
    source.includes("stableProductFollowupContractError"),
    true,
  );
  assertEquals(
    source.includes("coaching_recommendation.local_dispatcher.contract_retry"),
    true,
  );
  assertEquals(
    source.includes("Erreur detectee: ${contractError}"),
    true,
  );
});

Deno.test("coaching visible global rules prioritize latest visible user intent", () => {
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes(
      "VISIBLE_CONVERSATION_FLOW_RULES",
    ),
    true,
  );
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes("dernier message utilisateur"),
    true,
  );
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes(
      "reponds d'abord a cette demande precise",
    ),
    true,
  );
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes(
      "ne pousse pas une feature par reflexe",
    ),
    true,
  );
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes("ne veut pas de support"),
    true,
  );
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes("Pour un user novice"),
    true,
  );
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes("Exception stricte") &&
      COACHING_VISIBLE_GLOBAL_RULES.includes(
        "one_shot_reminder.committed=true",
      ),
    true,
  );
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes(
      "visible_runtime_context.recent_effects_summary prouve",
    ),
    true,
  );
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes(
      "Rappel ponctuel cree: execute et persiste",
    ),
    true,
  );
});

Deno.test("coaching specialized visible agents carry novice explanation rule", () => {
  const sources = [
    String(runActionPlanCoachingVisibleAgent),
    String(runNoPlanCoachingVisibleAgent),
    String(runEmotionCoachingVisibleAgent),
  ];
  for (const source of sources) {
    assertEquals(source.includes("Si le user est novice"), true);
    assertEquals(source.includes("explique d'abord"), true);
    assertEquals(source.includes("difference entre"), true);
    assertEquals(source.includes("demande seulement a comprendre"), true);
  }
  assertEquals(
    String(runNoPlanCoachingVisibleAgent).includes(
      "visible_decision.lever=coaching_only",
    ),
    true,
  );
});

Deno.test("coaching specialized visible agents can render generic coaching", () => {
  const sources = [
    String(runActionPlanCoachingVisibleAgent),
    String(runNoPlanCoachingVisibleAgent),
    String(runEmotionCoachingVisibleAgent),
  ];
  const guidance = COACHING_ONLY_VISIBLE_GUIDANCE_LINES.join("\n");
  assertEquals(guidance.includes("coaching generique"), true);
  assertEquals(guidance.includes("aide normale"), true);
  assertEquals(guidance.includes("une phrase a copier"), true);
  assertEquals(guidance.includes("parle normalement"), true);
  assertEquals(guidance.includes("pas de carte"), true);
  assertEquals(guidance.includes("une seule ligne"), true);
  for (const source of sources) {
    assertEquals(
      source.includes("COACHING_ONLY_VISIBLE_GUIDANCE_LINES"),
      true,
    );
  }
  assertEquals(
    String(runActionPlanCoachingVisibleAgent).includes(
      "attack_card, defense_card, adjust_plan ou coaching_only",
    ),
    true,
  );
  assertEquals(
    String(runEmotionCoachingVisibleAgent).includes(
      "state_potion ou coaching_only",
    ),
    true,
  );
});

Deno.test("coaching reducer compares attack card vs adjust plan", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "understand_need",
      user_need_summary: "Plan action seems miscalibrated.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: null,
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      dispatcher_signal_context: {
        coaching_type: "plan_action" as const,
        confidence: 0.9,
        action_context: {
          source: "plan",
          plan_item_id: "item-1",
          action_title: "Envoyer le mail a Camille",
        },
        reason: "Existing plan action is badly calibrated.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: null,
      turn_count: 0,
      max_turns: 4,
    },
    output: decision(),
    userMessage:
      "Je ne sais pas si je dois changer l'action ou mettre un rappel",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(
    reduced.local_state?.current_recommendation?.feature,
    "adjust_plan",
  );
  assertEquals(
    reduced.local_state?.secondary_recommendation?.feature,
    "attack_card",
  );
  assertEquals(reduced.effects.requested, []);
  assertEquals(reduced.effects.allowed, []);
  assertEquals(reduced.effects.committed, []);
  assertEquals(reduced.visible_task, "action_plan_coaching");
  assertEquals(reduced.step_context.task_kind, "action_plan_coaching");
});

Deno.test("coaching reducer allows free attack card for no-plan action", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "understand_need",
      user_need_summary: "Free action launch blocker.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: null,
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      coaching_type: "no_plan_action" as const,
      coaching_type_confidence: "high",
      coaching_type_evidence: ["free action"],
      pending_type_change: null,
      dispatcher_signal_context: {
        coaching_type: "no_plan_action" as const,
        confidence: 0.9,
        action_context: {
          source: "free",
          action_title: "Ecrire le mail a Camille",
        },
        reason: "Free action launch blocker.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: null,
      turn_count: 0,
      max_turns: 4,
    },
    output: decision({
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Prepare the start before opening the draft.",
        user_facing_next_step: "Prepare une carte d'attaque libre.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Launch blocker.",
        destination_hint: "Cartes d'attaque",
      }],
    }),
    userMessage: "Est-ce qu'une carte d'attaque libre est possible ?",
  });

  assertEquals(reduced.visible_task, "no_plan_coaching");
  assertEquals(
    reduced.local_state?.current_recommendation?.feature,
    "attack_card",
  );
  assertEquals(reduced.step_context.task_kind, "no_plan_coaching");
  if (reduced.step_context.task_kind === "no_plan_coaching") {
    assertEquals(reduced.step_context.selected_feature, "attack_card");
  }
});

Deno.test("coaching reducer blocks adjust plan for no-plan action", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "understand_need",
      user_need_summary: "Free action too large.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: null,
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      coaching_type: "no_plan_action" as const,
      coaching_type_confidence: "high",
      coaching_type_evidence: ["free action"],
      pending_type_change: null,
      dispatcher_signal_context: {
        coaching_type: "no_plan_action" as const,
        confidence: 0.9,
        action_context: {
          source: "free",
          action_title: "Ecrire le mail a Camille",
        },
        reason: "Free action is not in the plan.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: null,
      turn_count: 0,
      max_turns: 4,
    },
    output: decision({
      recommendation: {
        primary_feature: "adjust_plan",
        secondary_feature: "attack_card",
        why_primary: "Bad dispatcher output.",
        user_facing_next_step: "Bad.",
      },
      feature_candidates: [{
        feature: "adjust_plan",
        fit: "high",
        why: "Bad.",
        destination_hint: "Plan",
      }],
    }),
    userMessage: "C'est trop gros mais ce n'est pas dans mon plan",
  });

  assertEquals(reduced.visible_task, "no_plan_coaching");
  assertEquals(reduced.local_state?.current_recommendation, null);
  assertEquals(reduced.step_context.task_kind, "no_plan_coaching");
  if (reduced.step_context.task_kind === "no_plan_coaching") {
    assertEquals(reduced.step_context.selected_feature, null);
  }
});

Deno.test("coaching reducer accepts structured coaching type confirmation", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "understand_need",
      user_need_summary: "Need type confirmation.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: null,
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      coaching_type: "emotional" as const,
      coaching_type_confidence: "medium",
      coaching_type_evidence: ["emotion"],
      pending_type_change: {
        candidate_coaching_type: "no_plan_action" as const,
        reason: "User may be switching to a free action.",
      },
      dispatcher_signal_context: {
        coaching_type: "emotional" as const,
        confidence: 0.9,
        action_context: null,
        reason: "Emotional state.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: "change_confirm_coaching_type",
      turn_count: 1,
      max_turns: 4,
    },
    output: decision({
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Free action launch blocker.",
        user_facing_next_step: "Prepare une carte libre.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Free action.",
        destination_hint: "Cartes d'attaque",
      }],
    }),
    userMessage: "Hors plan.",
    dispatcherSignalContext: {
      coaching_type: "no_plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "free",
        action_title: "Ecrire le mail a Camille",
      },
      reason: "User confirmed free action.",
    },
  });

  assertEquals(reduced.visible_task, "no_plan_coaching");
  assertEquals(reduced.local_state?.coaching_type, "no_plan_action");
  assertEquals(reduced.step_context.task_kind, "no_plan_coaching");
});

Deno.test("coaching reducer does not infer adjust plan from latest user words", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "recommend",
      user_need_summary: "Plan action launch blocker.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: null,
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      coaching_type: "plan_action" as const,
      coaching_type_confidence: "high",
      coaching_type_evidence: ["plan"],
      pending_type_change: null,
      dispatcher_signal_context: {
        coaching_type: "plan_action" as const,
        confidence: 0.9,
        action_context: {
          source: "plan",
          plan_item_id: "item-1",
          action_title: "Preparer le dossier mutuelle",
        },
        reason: "Plan action launch blocker.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: "action_plan_coaching",
      turn_count: 1,
      max_turns: 4,
    },
    output: decision({
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Stale recommendation.",
        user_facing_next_step: "Prepare une carte d'attaque.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Stale.",
        destination_hint: "Cartes d'attaque",
      }],
    }),
    userMessage: "En fait l'action est trop grosse, il faut la decouper.",
  });

  assertEquals(reduced.visible_task, "action_plan_coaching");
  assertEquals(
    reduced.local_state?.current_recommendation?.feature,
    "attack_card",
  );
  if (reduced.step_context.task_kind === "action_plan_coaching") {
    assertEquals(reduced.step_context.selected_feature, "attack_card");
  }
});

Deno.test("coaching reducer does not infer defense card from latest user words", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "recommend",
      user_need_summary: "Plan action launch blocker.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: null,
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      coaching_type: "plan_action" as const,
      coaching_type_confidence: "high",
      coaching_type_evidence: ["plan"],
      pending_type_change: null,
      dispatcher_signal_context: {
        coaching_type: "plan_action" as const,
        confidence: 0.9,
        action_context: {
          source: "plan",
          plan_item_id: "item-1",
          action_title: "Preparer le dossier mutuelle",
        },
        reason: "Plan action launch blocker.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: "action_plan_coaching",
      turn_count: 1,
      max_turns: 4,
    },
    output: decision({
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Stale recommendation.",
        user_facing_next_step: "Prepare une carte d'attaque.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Stale.",
        destination_hint: "Cartes d'attaque",
      }],
    }),
    userMessage:
      "Le vrai souci c'est que je risque de decrocher et de tout fermer.",
  });

  assertEquals(reduced.visible_task, "action_plan_coaching");
  assertEquals(
    reduced.local_state?.current_recommendation?.feature,
    "attack_card",
  );
  if (reduced.step_context.task_kind === "action_plan_coaching") {
    assertEquals(reduced.step_context.selected_feature, "attack_card");
  }
});

Deno.test("coaching routes free action signal to no plan coaching with free card only", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "understand_need",
      user_need_summary: "Mail launch blocker.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: null,
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      dispatcher_signal_context: {
        coaching_type: "no_plan_action" as const,
        confidence: 0.9,
        action_context: {
          source: "free",
          plan_item_id: null,
          action_title: "ecrire un mail a Camille",
        },
        reason: "The user is blocked starting a mail.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: null,
      turn_count: 0,
      max_turns: 4,
    },
    output: decision({
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: "adjust_plan",
        why_primary: "The issue is starting the mail.",
        user_facing_next_step: "Prepare une carte d'attaque.",
      },
      feature_candidates: [
        {
          feature: "attack_card",
          fit: "high",
          why: "Launch blocker.",
          destination_hint: "Ressources",
        },
        {
          feature: "adjust_plan",
          fit: "medium",
          why: "Only if the mail is badly framed.",
          destination_hint: "Plan",
        },
      ],
    }),
    userMessage: "Je bloque quand j'ouvre le brouillon du mail pour Camille.",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.visible_task, "no_plan_coaching");
  assertEquals(reduced.step_context.task_kind, "no_plan_coaching");
  assertEquals(
    reduced.local_state?.candidate_features.map((candidate) =>
      candidate.feature
    ),
    ["attack_card"],
  );
  assertEquals(reduced.local_state?.secondary_recommendation, null);
  assertEquals(
    reduced.local_state?.recommendation_decision?.primary_feature,
    "attack_card",
  );
});

Deno.test("coaching asks to confirm type when plan relation is ambiguous", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "understand_need",
      user_need_summary: "Mail objective is unclear.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: null,
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      dispatcher_signal_context: {
        coaching_type: "ambiguous" as const,
        confidence: 0.65,
        action_context: {
          source: "ambiguous",
          plan_item_id: null,
          action_title: "mail pour Camille",
        },
        reason: "The user does not know what decision to ask Camille for.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: null,
      turn_count: 0,
      max_turns: 4,
    },
    output: decision({
      recommendation: {
        primary_feature: "adjust_plan",
        secondary_feature: "attack_card",
        why_primary: "The mail is badly framed.",
        user_facing_next_step: "Ajuste l'action dans le plan.",
      },
      feature_candidates: [
        {
          feature: "adjust_plan",
          fit: "high",
          why: "The mail is badly framed.",
          destination_hint: "Plan",
        },
        {
          feature: "attack_card",
          fit: "medium",
          why: "Could help once the action is clear.",
          destination_hint: "Ressources",
        },
      ],
    }),
    userMessage: "Je ne sais meme pas quelle decision demander a Camille.",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.visible_task, "change_confirm_coaching_type");
  assertEquals(reduced.step_context.task_kind, "change_confirm_coaching_type");
  assertEquals(reduced.local_state?.current_recommendation, null);
  assertEquals(
    reduced.local_state?.candidate_features.map((candidate) =>
      candidate.feature
    ),
    [],
  );
});

Deno.test("coaching routes emotional signal to emotion coaching only", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "understand_need",
      user_need_summary: "User is overwhelmed.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: null,
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      dispatcher_signal_context: {
        coaching_type: "emotional" as const,
        confidence: 0.9,
        action_context: null,
        reason: "The user needs help with an emotional state.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: null,
      turn_count: 0,
      max_turns: 4,
    },
    output: decision({
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: "state_potion",
        why_primary: "Bad model output should be corrected.",
        user_facing_next_step: "Prepare a card.",
      },
      feature_candidates: [
        {
          feature: "attack_card",
          fit: "high",
          why: "Bad candidate.",
          destination_hint: "Plan",
        },
        {
          feature: "state_potion",
          fit: "high",
          why: "Emotional state.",
          destination_hint: "Potions",
        },
      ],
    }),
    userMessage: "Je suis trop stresse pour avancer.",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.visible_task, "emotion_coaching");
  assertEquals(reduced.step_context.task_kind, "emotion_coaching");
  assertEquals(
    reduced.flow_context.recommendation.primary_feature,
    "state_potion",
  );
  assertEquals(
    reduced.local_state?.candidate_features.map((candidate) =>
      candidate.feature
    ),
    ["state_potion"],
  );
});

Deno.test("coaching keeps action-linked emotional friction in action coaching", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "recommend",
      user_need_summary: "Free action coaching in progress.",
      candidate_features: [],
      current_recommendation: {
        feature: "attack_card",
        fit: "high",
        why: "Free action launch blocker.",
        destination_hint: "Cartes d'attaque",
      },
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: "Prepare a free attack card.",
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      coaching_type: "no_plan_action" as const,
      coaching_type_confidence: "high",
      coaching_type_evidence: ["free action"],
      pending_type_change: null,
      dispatcher_signal_context: {
        coaching_type: "no_plan_action" as const,
        confidence: 0.86,
        action_context: {
          source: "free",
          plan_item_id: null,
          action_title: "mail à Camille",
        },
        reason: "Free action launch blocker.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: "no_plan_coaching",
      turn_count: 2,
      max_turns: 4,
    },
    dispatcherSignalContext: {
      coaching_type: "no_plan_action" as const,
      confidence: 0.88,
      action_context: {
        source: "free",
        plan_item_id: null,
        action_title: "mail à Camille",
      },
      reason:
        "Emotional friction is linked to starting a concrete free action.",
    },
    output: decision({
      recommendation: {
        primary_feature: "state_potion",
        secondary_feature: null,
        why_primary: "Bad model output should be blocked.",
        user_facing_next_step: "Choisir une potion.",
      },
      feature_candidates: [{
        feature: "state_potion",
        fit: "high",
        why: "Bad candidate for action-linked emotion.",
        destination_hint: "Potions",
      }],
    }),
    userMessage:
      "En fait là le plus dur n'est même pas le mail : je suis tendu et j'ai la boule au ventre avant de m'y mettre.",
  });

  assertEquals(reduced.visible_task, "no_plan_coaching");
  assertEquals(reduced.step_context.task_kind, "no_plan_coaching");
  assertEquals(reduced.local_state?.coaching_type, "no_plan_action");
  assertEquals(reduced.flow_context.recommendation.primary_feature, null);
  assertEquals(
    reduced.local_state?.candidate_features.some((candidate) =>
      candidate.feature === "state_potion"
    ),
    false,
  );
});

Deno.test("coaching blocks exit when plan action user compares potion with active action card", () => {
  const previous = {
    stage: "followup" as const,
    user_need_summary: "Plan action coaching in progress.",
    candidate_features: [{
      feature: "attack_card" as const,
      fit: "high" as const,
      why: "Launch blocker on plan action.",
      destination_hint: "Dashboard > Plan",
    }],
    current_recommendation: {
      feature: "attack_card" as const,
      fit: "high" as const,
      why: "Launch blocker on plan action.",
      destination_hint: "Dashboard > Plan",
    },
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Prepare an attack card.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["plan action"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "plan" as const,
        plan_item_id: "item-mutuelle",
        action_title: "Preparer le dossier mutuelle",
      },
      reason: "Plan action launch blocker.",
    },
    difficulty: null,
    cause_analysis: null,
    recommendation_decision: {
      primary_feature: "attack_card" as const,
      secondary_feature: null,
      why_primary: "Launch blocker on plan action.",
      why_not_others: {},
      platform_destination: {
        label: "carte d'attaque",
        surface_hint: "Dashboard > Plan",
        user_facing_destination: "depuis l'action concernee dans le Plan",
      },
      user_facing_next_step: null,
    },
    last_visible_decision: {
      lever: "attack_card" as const,
      variant: "preparer_terrain" as const,
      potion_type: null,
      reason: "Launch blocker on plan action.",
      confidence: "high" as const,
    },
    last_visible_task_kind: "action_plan_coaching" as const,
    turn_count: 3,
    max_turns: 4,
  };
  const signal = {
    coaching_type: "plan_action" as const,
    confidence: 0.88,
    action_context: {
      source: "plan" as const,
      plan_item_id: "item-mutuelle",
      action_title: "Preparer le dossier mutuelle",
    },
    reason: "Emotion is linked to starting the concrete plan action.",
  };
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous,
    dispatcherSignalContext: signal,
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      coaching_intent: {
        kind: "feature_choice",
        summary:
          "User compares a potion with an attack card for emotion linked to a plan action.",
      },
      target_switch: {
        status: "none",
        to_coaching_type: null,
        target: null,
      },
      recommendation: {
        primary_feature: "state_potion",
        secondary_feature: null,
        why_primary: "Bad model output should not survive.",
        user_facing_next_step: "Choisir une potion.",
      },
      feature_candidates: [{
        feature: "state_potion",
        fit: "high",
        why: "Bad candidate for action-linked emotion.",
        destination_hint: "Potions",
      }],
      state_updates: {
        stage: "followup",
        status: "exit_to_global",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "exit_ack",
        instruction: "Bad model output tries to exit.",
        conversation_context: {
          state_summary: "Bad exit.",
          known_values: {},
          missing_or_weak_values: [],
          candidate_features: [],
          recommendation: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        },
      },
    }),
    userMessage:
      "En vrai, j'ai une boule au ventre quand je pense au dossier mutuelle. Une potion serait plus logique que la carte d'attaque ?",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.visible_task, "action_plan_coaching");
  assertEquals(reduced.step_context.task_kind, "action_plan_coaching");
  assertEquals(reduced.local_state?.coaching_type, "plan_action");
  assertEquals(reduced.note_information, null);
  assertEquals(
    reduced.local_state?.candidate_features.some((candidate) =>
      candidate.feature === "state_potion"
    ),
    false,
  );
  assertEquals(
    reduced.flow_context.recommendation.primary_feature,
    "attack_card",
  );
});

Deno.test("coaching blocks initial exit for clear plan action coaching signal", () => {
  const signal = {
    coaching_type: "plan_action" as const,
    confidence: 0.86,
    action_context: {
      source: "plan" as const,
      plan_item_id: "item-mutuelle",
      action_title: "Preparer le dossier mutuelle",
    },
    reason:
      "User asks for coaching help on a specific active plan action and describes being blocked before starting it.",
  };
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: null,
    dispatcherSignalContext: signal,
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      coaching_intent: {
        kind: "off_topic",
        summary:
          "Bad model output exits despite a clear plan action coaching signal.",
      },
      target_switch: {
        status: "none",
        to_coaching_type: null,
        target: null,
      },
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "The issue is a launch blocker on a concrete plan action.",
        user_facing_next_step: "Prepare an attack card.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Useful when the user blocks before starting the plan action.",
        destination_hint: "Dashboard > Plan",
      }],
      state_updates: {
        stage: "recommend",
        status: "exit_to_global",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "exit_ack",
        instruction: "Bad model output tries to exit.",
        conversation_context: {
          state_summary: "Bad exit.",
          known_values: {},
          missing_or_weak_values: [],
          candidate_features: [],
          recommendation: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        },
      },
    }),
    userMessage:
      "J'ai dans mon plan l'action Preparer le dossier mutuelle. Je bloque avant de commencer. Tu me conseillerais quoi dans Sophia ?",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.visible_task, "action_plan_coaching");
  assertEquals(reduced.step_context.task_kind, "action_plan_coaching");
  assertEquals(reduced.local_state?.coaching_type, "plan_action");
  assertEquals(reduced.note_information, null);
  assertEquals(
    reduced.local_state?.current_recommendation?.feature,
    "attack_card",
  );
});

Deno.test("coaching switches active coaching type when incoming signal is clear", () => {
  const previous = {
    stage: "followup" as const,
    user_need_summary: "Free action coaching in progress.",
    candidate_features: [],
    current_recommendation: null,
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Pick the smallest next step.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "no_plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["free action"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "no_plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "free" as const,
        plan_item_id: null,
        action_title: "mail a Camille",
      },
      reason: "Free action.",
    },
    difficulty: null,
    cause_analysis: null,
    recommendation_decision: null,
    last_visible_task_kind: "no_plan_coaching" as const,
    turn_count: 1,
    max_turns: 4,
  };
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous,
    dispatcherSignalContext: {
      coaching_type: "plan_action" as const,
      confidence: 0.91,
      action_context: {
        source: "plan",
        plan_item_id: "item-2",
        action_title: "Faire la facture",
      },
      reason: "The user introduced a different plan action.",
    },
    output: decision({
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "New plan action.",
        user_facing_next_step: "Prepare a card.",
      },
    }),
    userMessage:
      "En fait je cherche aussi une solution pour ma facture du plan.",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.visible_task, "action_plan_coaching");
  assertEquals(reduced.step_context.task_kind, "action_plan_coaching");
  assertEquals(reduced.local_state?.coaching_type, "plan_action");
  assertEquals(
    reduced.local_state?.dispatcher_signal_context?.action_context
      ?.plan_item_id,
    "item-2",
  );
});

Deno.test("coaching asks targeted confirmation when incoming type signal is weak", () => {
  const previous = {
    stage: "followup" as const,
    user_need_summary: "Free action coaching in progress.",
    candidate_features: [],
    current_recommendation: null,
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Pick the smallest next step.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "no_plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["free action"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "no_plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "free" as const,
        plan_item_id: null,
        action_title: "mail a Camille",
      },
      reason: "Free action.",
    },
    difficulty: null,
    cause_analysis: null,
    recommendation_decision: null,
    last_visible_task_kind: "no_plan_coaching" as const,
    turn_count: 1,
    max_turns: 4,
  };
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous,
    dispatcherSignalContext: {
      coaching_type: "plan_action" as const,
      confidence: 0.52,
      action_context: {
        source: "plan",
        plan_item_id: "item-2",
        action_title: "Faire la facture",
      },
      reason: "The user may be introducing a different plan action.",
    },
    output: decision({
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "New plan action.",
        user_facing_next_step: "Prepare a card.",
      },
    }),
    userMessage:
      "En fait je cherche peut-être aussi une solution pour ma facture.",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.visible_task, "change_confirm_coaching_type");
  assertEquals(reduced.step_context.task_kind, "change_confirm_coaching_type");
  if (reduced.step_context.task_kind === "change_confirm_coaching_type") {
    assertEquals(reduced.step_context.current_coaching_type, "no_plan_action");
    assertEquals(reduced.step_context.candidate_coaching_type, "plan_action");
  }
  assertEquals(reduced.local_state?.current_recommendation, null);
});

Deno.test("coaching switches to plan action when incoming signal is structurally clear", () => {
  const previous = {
    stage: "followup" as const,
    user_need_summary: "Free action coaching in progress.",
    candidate_features: [],
    current_recommendation: null,
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Free attack card.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "no_plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["free action"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "no_plan_action" as const,
      confidence: 0.88,
      action_context: {
        source: "free" as const,
        plan_item_id: null,
        action_title: "mail à Camille",
      },
      reason: "Free action.",
    },
    difficulty: null,
    cause_analysis: null,
    recommendation_decision: null,
    last_visible_task_kind: "no_plan_coaching" as const,
    turn_count: 2,
    max_turns: 4,
  };
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous,
    dispatcherSignalContext: {
      coaching_type: "plan_action" as const,
      confidence: 0.88,
      action_context: {
        source: "plan",
        plan_item_id: "item-mutuelle",
        action_title: "Préparer le dossier mutuelle",
      },
      reason:
        "User names a concrete active plan action and asks if the same card applies.",
    },
    output: decision({
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Plan action launch blocker.",
        user_facing_next_step: "Prepare the card from the plan action.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Plan action launch blocker.",
        destination_hint: "Plan",
      }],
    }),
    userMessage:
      "Autre cas : dans mon plan j'ai Préparer le dossier mutuelle, et là je bloque pareil avant de m'y mettre.",
  });

  assertEquals(reduced.visible_task, "action_plan_coaching");
  assertEquals(reduced.step_context.task_kind, "action_plan_coaching");
  assertEquals(reduced.local_state?.coaching_type, "plan_action");
  assertEquals(reduced.local_state?.pending_type_change, null);
  assertEquals(
    reduced.local_state?.dispatcher_signal_context?.action_context
      ?.plan_item_id,
    "item-mutuelle",
  );
});

Deno.test("coaching target switch replaces stale free-action target without global signal", () => {
  const previous = {
    stage: "followup" as const,
    user_need_summary: "Free action coaching in progress.",
    candidate_features: [],
    current_recommendation: null,
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Free attack card for mail.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "no_plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["free action"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "no_plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "free" as const,
        plan_item_id: null,
        action_title: "mail perso",
      },
      reason: "Free action.",
    },
    difficulty: {
      target_kind: "free_action" as const,
      summary: "Mail perso.",
      action_title: "mail perso",
      action_source: "free" as const,
    },
    cause_analysis: null,
    recommendation_decision: null,
    last_visible_task_kind: "no_plan_coaching" as const,
    turn_count: 2,
    max_turns: 4,
  };

  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous,
    output: decision({
      coaching_intent: {
        kind: "stuck_action",
        summary: "Switch to the plan action Préparer le dossier mutuelle.",
      },
      target_switch: {
        status: "explicit",
        to_coaching_type: "plan_action" as const,
        target: {
          kind: "plan_action",
          title: "Préparer le dossier mutuelle",
          source: "plan",
          plan_item_id: null,
        },
      },
      visible_task: {
        kind: "no_plan_coaching",
        instruction: "Stale no-plan visible task from model.",
        conversation_context: {
          state_summary: "Stale no-plan context.",
          known_values: {},
          missing_or_weak_values: [],
          candidate_features: [],
          recommendation: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        },
      },
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Plan action launch blocker.",
        user_facing_next_step: "Prepare the plan action card.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Plan action launch blocker.",
        destination_hint: "Plan",
      }],
      evidence: ["User explicitly says this is about the plan action."],
    }),
    userMessage:
      "Non je parle bien de préparer le dossier mutuelle dans mon plan.",
  });

  assertEquals(reduced.visible_task, "action_plan_coaching");
  assertEquals(reduced.step_context.task_kind, "action_plan_coaching");
  assertEquals(reduced.local_state?.coaching_type, "plan_action");
  assertEquals(
    reduced.local_state?.dispatcher_signal_context?.action_context
      ?.action_title,
    "Préparer le dossier mutuelle",
  );
  assertEquals(
    reduced.local_state?.difficulty?.action_title,
    "Préparer le dossier mutuelle",
  );
  assertEquals(
    reduced.local_state?.dispatcher_signal_context?.action_context
      ?.plan_item_id,
    null,
  );
});

Deno.test("coaching target switch persists on next turn when model omits switch", () => {
  const switched = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "followup",
      user_need_summary: "Free action coaching in progress.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: "Free attack card for mail.",
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      coaching_type: "no_plan_action" as const,
      coaching_type_confidence: "high",
      coaching_type_evidence: ["free action"],
      pending_type_change: null,
      dispatcher_signal_context: {
        coaching_type: "no_plan_action" as const,
        confidence: 0.9,
        action_context: {
          source: "free",
          plan_item_id: null,
          action_title: "mail perso",
        },
        reason: "Free action.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: "no_plan_coaching",
      turn_count: 2,
      max_turns: 4,
    },
    output: decision({
      target_switch: {
        status: "explicit",
        to_coaching_type: "plan_action" as const,
        target: {
          kind: "plan_action",
          title: "Préparer le dossier mutuelle",
          source: "plan",
          plan_item_id: null,
        },
      },
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Plan action launch blocker.",
        user_facing_next_step: "Prepare the plan action card.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Plan action launch blocker.",
        destination_hint: "Plan",
      }],
    }),
    userMessage:
      "Non je parle bien de préparer le dossier mutuelle dans mon plan.",
  });

  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: switched.local_state,
    output: decision({
      visible_task: {
        kind: "no_plan_coaching",
        instruction: "Stale no-plan visible task from model.",
        conversation_context: {
          state_summary: "Stale no-plan context.",
          known_values: {},
          missing_or_weak_values: [],
          candidate_features: [],
          recommendation: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        },
      },
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Continue with the plan action.",
        user_facing_next_step: "Prepare the plan action card.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Plan action launch blocker.",
        destination_hint: "Plan",
      }],
    }),
    userMessage: "Je parle bien de la préparer.",
  });

  assertEquals(switched.visible_task, "action_plan_coaching");
  assertEquals(reduced.visible_task, "action_plan_coaching");
  assertEquals(reduced.step_context.task_kind, "action_plan_coaching");
  assertEquals(
    reduced.local_state?.dispatcher_signal_context?.action_context
      ?.action_title,
    "Préparer le dossier mutuelle",
  );
  assertEquals(
    reduced.local_state?.difficulty?.action_title,
    "Préparer le dossier mutuelle",
  );
});

Deno.test("coaching ambiguous target switch asks confirmation before replacing target", () => {
  const previous = {
    stage: "followup" as const,
    user_need_summary: "Free action coaching in progress.",
    candidate_features: [],
    current_recommendation: null,
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Free attack card for mail.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "no_plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["free action"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "no_plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "free" as const,
        plan_item_id: null,
        action_title: "mail perso",
      },
      reason: "Free action.",
    },
    difficulty: null,
    cause_analysis: null,
    recommendation_decision: null,
    last_visible_task_kind: "no_plan_coaching" as const,
    turn_count: 2,
    max_turns: 4,
  };
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous,
    output: decision({
      target_switch: {
        status: "ambiguous",
        to_coaching_type: "plan_action" as const,
        target: {
          kind: "plan_action",
          title: "dossier mutuelle",
          source: "ambiguous",
          plan_item_id: null,
        },
      },
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Maybe a new plan action.",
        user_facing_next_step: "Prepare a card.",
      },
    }),
    userMessage: "Et pour le dossier mutuelle c'est pareil ?",
  });

  assertEquals(reduced.visible_task, "change_confirm_coaching_type");
  assertEquals(reduced.step_context.task_kind, "change_confirm_coaching_type");
  if (reduced.step_context.task_kind === "change_confirm_coaching_type") {
    assertEquals(reduced.step_context.current_coaching_type, "no_plan_action");
    assertEquals(reduced.step_context.candidate_coaching_type, "plan_action");
  }
  assertEquals(reduced.local_state?.coaching_type, "no_plan_action");
  assertEquals(
    reduced.local_state?.dispatcher_signal_context?.action_context
      ?.action_title,
    "mail perso",
  );
});

Deno.test("coaching active flow rejects non-critical global exit when target switch is omitted", () => {
  const previous = {
    stage: "followup" as const,
    user_need_summary: "Free action coaching in progress.",
    candidate_features: [{
      feature: "attack_card" as const,
      fit: "high" as const,
      why: "Free action launch blocker.",
      destination_hint: "Ressources",
    }],
    current_recommendation: {
      feature: "attack_card" as const,
      fit: "high" as const,
      why: "Free action launch blocker.",
      destination_hint: "Ressources",
    },
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Free attack card for mail.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "no_plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["mail perso hors plan"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "no_plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "free" as const,
        plan_item_id: null,
        action_title: "mail perso",
      },
      reason: "Free action.",
    },
    difficulty: {
      target_kind: "free_action" as const,
      summary: "Mail perso.",
      action_title: "mail perso",
      action_source: "free" as const,
    },
    cause_analysis: null,
    recommendation_decision: null,
    last_visible_task_kind: "no_plan_coaching" as const,
    turn_count: 2,
    max_turns: 4,
  };

  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      coaching_intent: {
        kind: "feature_choice",
        summary:
          "The user compares a second coaching case but the model forgot target_switch.",
      },
      target_switch: {
        status: "none",
        to_coaching_type: null,
        target: null,
      },
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "A plan action launch blocker would use attack card.",
        user_facing_next_step: "Prepare the card from the plan action.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Launch blocker on second case.",
        destination_hint: "Plan",
      }],
      state_updates: {
        stage: "followup",
        status: "exit_to_global",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "exit_ack",
        instruction: "Bad model output tries to exit.",
        conversation_context: {
          state_summary: "Bad exit.",
          known_values: {},
          missing_or_weak_values: [],
          candidate_features: [],
          recommendation: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        },
      },
      evidence: [
        "The user gives a second coaching case.",
        "The user still asks which support to choose.",
      ],
    }),
    userMessage:
      "Deuxième cas : dans mon plan j'ai préparer le dossier mutuelle, et je bloque pareil avant de m'y mettre. Là tu choisirais quoi ?",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.reason_code, "coaching_recommendation_continue");
  assertEquals(reduced.visible_task, "change_confirm_coaching_type");
  assertEquals(reduced.step_context.task_kind, "change_confirm_coaching_type");
  assertEquals(reduced.note_information, null);
  assertEquals(
    reduced.diagnosis.exit_rejected_reason,
    "active_flow_non_critical_exit_blocked",
  );
  assertEquals(reduced.local_state?.coaching_type, "no_plan_action");
});

Deno.test("coaching active flow preserves a coherent autonomous exit (durable preference) instead of forcing type confirmation", () => {
  const previous = {
    stage: "followup" as const,
    user_need_summary: "No plan action coaching in progress.",
    candidate_features: [{
      feature: "attack_card" as const,
      fit: "high" as const,
      why: "Launch blocker.",
      destination_hint: "Ressources",
    }],
    current_recommendation: {
      feature: "attack_card" as const,
      fit: "high" as const,
      why: "Launch blocker.",
      destination_hint: "Ressources",
    },
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Attack card for the blocker.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "no_plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["mail perso hors plan"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "no_plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "free" as const,
        plan_item_id: null,
        action_title: "mail perso",
      },
      reason: "Free action.",
    },
    difficulty: {
      target_kind: "free_action" as const,
      summary: "Mail perso.",
      action_title: "mail perso",
      action_source: "free" as const,
    },
    cause_analysis: null,
    recommendation_decision: null,
    last_visible_task_kind: "no_plan_coaching" as const,
    turn_count: 2,
    max_turns: 4,
  };

  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      coaching_intent: {
        kind: "preference_request",
        summary:
          "The user asks Sophia to durably remember a coaching preference for next times.",
      },
      target_switch: {
        status: "none",
        to_coaching_type: null,
        target: null,
      },
      recommendation: {
        primary_feature: null,
        secondary_feature: null,
        why_primary: null,
        user_facing_next_step: null,
      },
      feature_candidates: [],
      state_updates: {
        stage: "followup",
        status: "exit_to_global",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "exit_ack",
        instruction: "Acknowledge and hand the durable preference to global.",
        conversation_context: {
          state_summary: "Durable preference request, out of coaching scope.",
          known_values: {},
          missing_or_weak_values: [],
          candidate_features: [],
          recommendation: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        },
      },
      evidence: [
        "The user asks for a durable coaching-style preference.",
      ],
    }),
    userMessage:
      "Retiens un truc pour les prochaines fois, comme une préférence durable : quand je bloque, donne-moi direct le premier geste concret, sans passer par le nom des cartes.",
  });

  assertEquals(reduced.status, "exit");
  assertEquals(reduced.reason_code, "coaching_recommendation_exit_to_global");
  assertEquals(reduced.diagnosis.exit_rejected_reason, null);
  assertEquals(reduced.visible_task !== "change_confirm_coaching_type", true);
  assertEquals(reduced.note_information !== null, true);
});

Deno.test("coaching switches from plan action to clear no-plan action without stale action context", () => {
  const previous = {
    stage: "followup" as const,
    user_need_summary: "Plan action coaching in progress.",
    candidate_features: [],
    current_recommendation: null,
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Attack card for plan action.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["plan action"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "plan" as const,
        plan_item_id: "item-plan",
        action_title: "Préparer le dossier mutuelle",
      },
      reason: "Plan action.",
    },
    difficulty: {
      target_kind: "plan_action" as const,
      summary: "Old plan action.",
      action_title: "Préparer le dossier mutuelle",
      action_source: "plan" as const,
    },
    cause_analysis: null,
    recommendation_decision: null,
    last_visible_task_kind: "action_plan_coaching" as const,
    turn_count: 2,
    max_turns: 4,
  };

  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous,
    dispatcherSignalContext: {
      coaching_type: "no_plan_action" as const,
      confidence: 0.88,
      action_context: {
        source: "free",
        plan_item_id: null,
        action_title: "mail à Camille",
      },
      reason: "The user introduced a separate non-plan action.",
    },
    output: decision({
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Free action launch blocker.",
        user_facing_next_step: "Prepare a free card.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Free action.",
        destination_hint: "Cartes d'attaque",
      }],
    }),
    userMessage: "J'ai aussi un mail à Camille qui n'est pas dans mon plan.",
  });

  assertEquals(reduced.visible_task, "no_plan_coaching");
  assertEquals(reduced.local_state?.coaching_type, "no_plan_action");
  assertEquals(reduced.local_state?.difficulty?.action_title, "mail à Camille");
  assertEquals(
    reduced.local_state?.dispatcher_signal_context?.action_context
      ?.plan_item_id,
    null,
  );
});

Deno.test("coaching active exit is blocked when local dispatcher forgets target switch and only echoes stale context", () => {
  const previous = {
    stage: "followup" as const,
    user_need_summary: "Plan action coaching in progress.",
    candidate_features: [],
    current_recommendation: null,
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Attack card for plan action.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["plan action"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "plan" as const,
        plan_item_id: "item-plan",
        action_title: "Préparer le dossier mutuelle",
      },
      reason: "Plan action.",
    },
    difficulty: {
      target_kind: "plan_action" as const,
      summary: "Old plan action.",
      action_title: "Préparer le dossier mutuelle",
      action_source: "plan" as const,
    },
    cause_analysis: null,
    recommendation_decision: null,
    last_visible_task_kind: "action_plan_coaching" as const,
    turn_count: 2,
    max_turns: 4,
  };

  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      coaching_intent: {
        kind: "feature_choice",
        summary:
          "The user introduces a mail that is not in the plan and still asks for coaching.",
      },
      target_switch: {
        status: "none",
        to_coaching_type: null,
        target: null,
      },
      state_updates: {
        stage: "followup",
        status: "exit_to_global",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "exit_ack",
        instruction: "Bad model output tries to exit with stale context.",
        conversation_context: {
          state_summary: "Bad exit.",
          known_values: {},
          missing_or_weak_values: [],
          candidate_features: [],
          recommendation: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        },
        flow_context: {
          dispatcher_signal_context: previous.dispatcher_signal_context,
          coaching_type: "plan_action" as const,
          candidate_coaching_type: null,
          coaching_type_reason: "Stale copied context.",
        },
      },
      evidence: [
        "The user gives another coaching case.",
        "The local dispatcher forgot target_switch.",
      ],
    }),
    userMessage:
      "Autre cas : j'ai un mail à Camille qui n'est pas dans mon plan, je bloque pareil dès que j'ouvre le brouillon.",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.reason_code, "coaching_recommendation_continue");
  assertEquals(reduced.visible_task, "change_confirm_coaching_type");
  assertEquals(reduced.note_information, null);
  assertEquals(
    reduced.diagnosis.exit_rejected_reason,
    "active_flow_non_critical_exit_blocked",
  );
  assertEquals(reduced.local_state?.coaching_type, "plan_action");
});

Deno.test("coaching switches from no-plan action to clear emotional coaching", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "recommend",
      user_need_summary: "No-plan action coaching in progress.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: "Free attack card.",
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      coaching_type: "no_plan_action" as const,
      coaching_type_confidence: "high",
      coaching_type_evidence: ["free action"],
      pending_type_change: null,
      dispatcher_signal_context: {
        coaching_type: "no_plan_action" as const,
        confidence: 0.88,
        action_context: {
          source: "free",
          plan_item_id: null,
          action_title: "mail à Camille",
        },
        reason: "Free action.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: "no_plan_coaching",
      turn_count: 3,
      max_turns: 4,
    },
    dispatcherSignalContext: {
      coaching_type: "emotional" as const,
      confidence: 0.92,
      action_context: {
        source: "none",
        plan_item_id: null,
        action_title: null,
      },
      reason: "The user says the main need is emotional.",
    },
    output: decision({
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Stale free action recommendation.",
        user_facing_next_step: "Prepare a free card.",
      },
    }),
    userMessage: "Je suis tendu et j'ai la boule au ventre.",
  });

  assertEquals(reduced.visible_task, "emotion_coaching");
  assertEquals(reduced.local_state?.coaching_type, "emotional");
  assertEquals(
    reduced.local_state?.recommendation_decision?.primary_feature,
    "state_potion",
  );
  assertEquals(reduced.step_context.task_kind, "emotion_coaching");
});

Deno.test("coaching keeps no-plan ownership for free card location question", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "followup",
      user_need_summary: "Mail action is not linked to plan.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: null,
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      dispatcher_signal_context: {
        coaching_type: "no_plan_action" as const,
        confidence: 0.9,
        action_context: {
          source: "free",
          plan_item_id: null,
          action_title: "mail pour Camille",
        },
        reason: "Mail action is not linked to a concrete plan item.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: null,
      turn_count: 1,
      max_turns: 4,
    },
    output: decision({
      flow_action: "answer_followup",
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Use the attack card.",
        user_facing_next_step: "Va dans le Plan.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Launch blocker.",
        destination_hint: "Dashboard > Plan",
      }],
      visible_task: {
        kind: "explain_platform_destination",
        instruction: "Tell where to find the attack card.",
        conversation_context: {
          state_summary: "User asks where to prepare the card.",
          known_values: {},
          missing_or_weak_values: [],
          candidate_features: [],
          recommendation: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        },
      },
    }),
    userMessage: "Je la trouve ou dans Sophia ?",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.visible_task, "no_plan_coaching");
  assertEquals(reduced.step_context.task_kind, "no_plan_coaching");
  assertEquals(
    reduced.flow_context.recommendation.primary_feature,
    "attack_card",
  );
  assertEquals(
    reduced.flow_context.recommendation.user_facing_next_step,
    "Prepare la carte comme aide libre, sans la rattacher a une action du Plan.",
  );
});

Deno.test("coaching reducer builds specialized visible contexts", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "understand_need",
      user_need_summary: "Repeated forgetting.",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: null,
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      dispatcher_signal_context: {
        coaching_type: "plan_action" as const,
        confidence: 0.9,
        action_context: {
          source: "plan",
          plan_item_id: "item-1",
          action_title: "Marcher 10 min",
        },
        reason: "Forgetting an existing plan action favors attack_card.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: null,
      turn_count: 0,
      max_turns: 4,
    },
    output: decision({
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Repeated forgetting needs preparation before the action.",
        user_facing_next_step: "Prepare une carte d'attaque.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Repeated forgetting.",
        destination_hint: "Cartes d'attaque",
      }],
    }),
    userMessage: "J'oublie toujours ma marche",
  });

  assertEquals(
    Object.hasOwn(
      reduced.flow_context.dispatcher_signal_context ?? {},
      "failure_mode",
    ),
    false,
  );
  assertEquals(reduced.flow_context.difficulty.action_title, "Marcher 10 min");
  assertEquals(reduced.step_context.task_kind, "action_plan_coaching");
  if (reduced.step_context.task_kind === "action_plan_coaching") {
    assertEquals(reduced.step_context.selected_feature, "attack_card");
  }
  assertEquals(
    Object.hasOwn(
      reduced.local_state?.dispatcher_signal_context ?? {},
      "priority_features",
    ),
    false,
  );
  assertEquals(
    reduced.local_state?.last_visible_task_kind,
    "action_plan_coaching",
  );
});

Deno.test("coaching platform guidance receives product catalog guidance", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "recommend",
      user_need_summary: "Launch blocker on email.",
      candidate_features: [{
        feature: "attack_card",
        fit: "high",
        why: "The user needs preparation before starting.",
        destination_hint: "Ressources",
      }],
      current_recommendation: {
        feature: "attack_card",
        fit: "high",
        why: "The user needs preparation before starting.",
        destination_hint: "Ressources",
      },
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: "Use an attack card.",
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      dispatcher_signal_context: {
        coaching_type: "plan_action" as const,
        confidence: 0.9,
        action_context: {
          source: "plan",
          plan_item_id: "item-1",
          action_title: "Envoyer le mail a Camille",
        },
        reason: "Existing plan item has a launch blocker.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "The user needs preparation before starting.",
        why_not_others: {},
        platform_destination: {
          label: "carte d'attaque",
          surface_hint: "Ressources",
          user_facing_destination: "Dashboard > Ressources",
        },
        user_facing_next_step: "prepare cette carte toi-meme.",
      },
      last_visible_task_kind: "recommend_feature",
      turn_count: 1,
      max_turns: 4,
    },
    output: decision({
      flow_action: "answer_followup",
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "The user needs preparation before starting.",
        user_facing_next_step: "prepare cette carte toi-meme.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "The user needs preparation before starting.",
        destination_hint: "Ressources",
      }],
      visible_task: {
        kind: "explain_platform_destination",
        instruction: "Explain where to find the recommended attack card.",
        conversation_context: {
          state_summary: "User asks where to find the recommended attack card.",
          known_values: {},
          missing_or_weak_values: [],
          candidate_features: [],
          recommendation: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        },
      },
    }),
    userMessage:
      "Ok, et si je veux preparer cette carte d'attaque moi-meme, je la trouve ou dans Sophia ?",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.visible_task, "action_plan_coaching");
  assertEquals(
    reduced.flow_context.product_guidance.attack_card?.catalog_feature_id,
    "resources.attack_card",
  );
  assertEquals(
    reduced.flow_context.product_guidance.attack_card?.how_to.includes(
      "si l'option est disponible",
    ),
    false,
  );
  assertEquals(
    reduced.flow_context.product_guidance.attack_card?.locations.some(
      (location) => location.surface === "Dashboard > Ressources",
    ),
    true,
  );
  if (reduced.step_context.task_kind === "action_plan_coaching") {
    assertEquals(
      reduced.step_context.product_guidance.attack_card?.catalog_feature_id,
      "resources.attack_card",
    );
    assertEquals(
      reduced.step_context.product_guidance.attack_card?.how_to.includes(
        "si l'option est disponible",
      ),
      false,
    );
  } else {
    throw new Error("expected action plan coaching step");
  }
});

Deno.test("coaching preserves stable plan product followup instead of reclarifying type", () => {
  const previousState = {
    stage: "followup" as const,
    user_need_summary:
      "User needs a defense card for a plan action where they drift to YouTube.",
    candidate_features: [{
      feature: "defense_card" as const,
      fit: "high" as const,
      why: "The issue is a drift risk during the action.",
      destination_hint: "Dashboard > Plan",
    }],
    current_recommendation: {
      feature: "defense_card" as const,
      fit: "high" as const,
      why: "The issue is a drift risk during the action.",
      destination_hint: "Dashboard > Plan",
    },
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Use a defense card for the drift moment.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["User said the dossier is in the Plan."],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "plan" as const,
        plan_item_id: null,
        action_title: "preparer le dossier mutuelle",
      },
      reason: "Plan action with a drift risk.",
    },
    difficulty: null,
    cause_analysis: null,
    recommendation_decision: {
      primary_feature: "defense_card" as const,
      secondary_feature: null,
      why_primary: "The issue is a drift risk during the action.",
      why_not_others: {},
      platform_destination: {
        label: "carte de defense",
        surface_hint: "Dashboard > Plan",
        user_facing_destination:
          "surface=Dashboard > Plan; anchor=action_concernee; object_type=carte de defense liee au Plan; user_action=ouvrir l'action concernee puis preparer la carte",
      },
      user_facing_next_step:
        "Prepare la carte depuis Dashboard > Plan, sur l'action concernee.",
    },
    last_visible_task_kind: "action_plan_coaching" as const,
    turn_count: 3,
    max_turns: 4,
  };
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: previousState,
    output: normalizeCoachingRecommendationLocalDispatcherOutput({
      flow_action: "continue_clarifying_need",
      confidence: "medium",
      risk_score: 0,
      coaching_intent: {
        kind: "unclear",
        summary: "User asks where to prepare the defense card.",
      },
      target_switch: {
        status: "none",
        to_coaching_type: null,
        target: null,
      },
      feature_candidates: [],
      recommendation: {
        primary_feature: null,
        secondary_feature: null,
        why_primary: null,
        user_facing_next_step: null,
      },
      state_updates: {
        stage: "followup",
        status: "active",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "change_confirm_coaching_type",
        instruction: "Clarify the coaching type.",
        conversation_context: {
          state_summary: "User asks where to prepare the defense card.",
          known_values: {},
          missing_or_weak_values: [],
          candidate_features: [],
          recommendation: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        },
      },
      note_information: null,
      exit_memo: { needed: false, reason: "none" },
      evidence: ["where exactly"],
    }),
    userMessage:
      "Ok, et cette carte de defense liee au dossier mutuelle dans le Plan, je la prepare ou exactement ?",
  });

  assertEquals(reduced.visible_task, "action_plan_coaching");
  assertEquals(reduced.step_context.task_kind, "action_plan_coaching");
  assertEquals(
    reduced.local_state?.current_recommendation?.feature,
    "defense_card",
  );
  assertEquals(reduced.local_state?.pending_type_change, null);
  assertEquals(
    reduced.flow_context.recommendation.primary_feature,
    "defense_card",
  );
});

Deno.test("coaching treats same-target explicit switch as stable product followup", () => {
  const previousState = {
    stage: "followup" as const,
    user_need_summary:
      "User needs a defense card for a plan action where they drift to YouTube.",
    candidate_features: [{
      feature: "defense_card" as const,
      fit: "high" as const,
      why: "The issue is a drift risk during the action.",
      destination_hint: "Dashboard > Plan",
    }],
    current_recommendation: {
      feature: "defense_card" as const,
      fit: "high" as const,
      why: "The issue is a drift risk during the action.",
      destination_hint: "Dashboard > Plan",
    },
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Use a defense card for the drift moment.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["User said the dossier is in the Plan."],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "plan" as const,
        plan_item_id: null,
        action_title: "preparer le dossier mutuelle",
      },
      reason: "Plan action with a drift risk.",
    },
    difficulty: null,
    cause_analysis: null,
    recommendation_decision: {
      primary_feature: "defense_card" as const,
      secondary_feature: null,
      why_primary: "The issue is a drift risk during the action.",
      why_not_others: {},
      platform_destination: {
        label: "carte de defense",
        surface_hint: "Dashboard > Plan",
        user_facing_destination:
          "surface=Dashboard > Plan; anchor=action_concernee; object_type=carte de defense liee au Plan; user_action=ouvrir l'action concernee puis preparer la carte",
      },
      user_facing_next_step:
        "Prepare la carte depuis Dashboard > Plan, sur l'action concernee.",
    },
    last_visible_task_kind: "action_plan_coaching" as const,
    turn_count: 3,
    max_turns: 4,
  };
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: previousState,
    output: normalizeCoachingRecommendationLocalDispatcherOutput({
      flow_action: "continue_clarifying_need",
      confidence: "medium",
      risk_score: 0,
      coaching_intent: {
        kind: "unclear",
        summary: "User asks where to prepare the defense card.",
      },
      target_switch: {
        status: "explicit",
        to_coaching_type: "plan_action" as const,
        target: {
          kind: "plan_action",
          title: "preparer le dossier mutuelle",
          source: "plan",
          plan_item_id: null,
        },
      },
      feature_candidates: [],
      recommendation: {
        primary_feature: null,
        secondary_feature: null,
        why_primary: null,
        user_facing_next_step: null,
      },
      state_updates: {
        stage: "followup",
        status: "active",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "change_confirm_coaching_type",
        instruction: "Clarify the coaching type.",
        conversation_context: {
          state_summary: "User asks where to prepare the defense card.",
          known_values: {},
          missing_or_weak_values: [],
          candidate_features: [],
          recommendation: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        },
      },
      note_information: null,
      exit_memo: { needed: false, reason: "none" },
      evidence: ["same target switch"],
    }),
    userMessage:
      "Ok, et cette carte de defense liee au dossier mutuelle dans le Plan, je la prepare ou exactement ?",
  });

  assertEquals(reduced.visible_task, "action_plan_coaching");
  assertEquals(reduced.step_context.task_kind, "action_plan_coaching");
  assertEquals(
    reduced.local_state?.current_recommendation?.feature,
    "defense_card",
  );
  assertEquals(reduced.local_state?.pending_type_change, null);
  assertEquals(
    reduced.flow_context.recommendation.primary_feature,
    "defense_card",
  );
});

Deno.test("coaching reducer drops forbidden platform and progress candidates", () => {
  const output = decision({
    feature_candidates: [
      { feature: "platform", fit: "high", why: "bad", destination_hint: null },
      {
        feature: "track_progress",
        fit: "high",
        why: "bad",
        destination_hint: null,
      },
      {
        feature: "defense_card",
        fit: "high",
        why: "risk moment",
        destination_hint: "Ressources",
      },
    ],
    recommendation: {
      primary_feature: "platform",
      secondary_feature: "track_progress_plan_item",
      why_primary: "bad",
      user_facing_next_step: "bad",
    },
  });

  assertEquals(
    output.feature_candidates.map((candidate) => candidate.feature),
    [
      "defense_card",
    ],
  );
  assertEquals(output.recommendation.primary_feature, "defense_card");
  assertEquals(output.recommendation.secondary_feature, null);
});

Deno.test("coaching skill passes dispatcher context to specialized visible input", async () => {
  const signalContext = {
    coaching_type: "plan_action" as const,
    confidence: 0.9,
    action_context: {
      source: "plan" as const,
      plan_item_id: "item-1",
      action_title: "Marcher 10 min",
    },
    reason: "Forgetting an existing plan action favors attack_card.",
  };
  const turnFrame: TurnFrame = {
    turn_id: "t1",
    source_message_id: "m1",
    user_id: "u1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    direct_effect_lane: {
      selected_handler: "create_one_shot_reminder",
      toolExecution: "success",
      executedTools: ["create_one_shot_reminder"],
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [{
        type: "create_one_shot_reminder",
        reminder_instruction: "marche",
      }],
      blocked_effects: [],
      visible_confirmation_hint: "C'est programme.",
    },
    direct_effect_confirmation_context: {
      has_committed_one_shot_reminder: true,
      has_requested_one_shot_reminder: true,
      one_shot_reminder: {
        committed: true,
        local_label: "demain à 8h55",
        reminder_instruction: "marche",
      },
      confirmation_text: null,
      committed_effects: [],
      requested_effects: [],
      blocked_effects: [],
      do_not_recreate: true,
      do_not_reroute: true,
      do_not_redemand: true,
      do_not_confirm_without_commit: true,
      remaining_user_need_must_continue: true,
    },
    skill_signals: {
      coaching_recommendation: {
        detected: true,
        confidence_band: "high",
        context: signalContext,
      },
    },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
  } as TurnFrame;
  let visibleInput: any = null;
  const output = await runCoachingRecommendationSkill({
    user_message: "J'oublie toujours ma marche",
    context: {
      skill_id: "coaching_recommendation",
      user_id: "u1",
      recent_messages: [
        { role: "user", content: "Avant je parlais d'autre chose" },
        { role: "assistant", content: "Ok." },
      ],
      active_skill_working_state: null,
      turn_frame: turnFrame,
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
      runtime_context: {
        recent_effects_summary: "=== EFFETS RÉCENTS ===\n- Rappel créé.\n",
      },
    },
    local_dispatcher: async () =>
      decision({
        recommendation: {
          primary_feature: "attack_card",
          secondary_feature: null,
          why_primary:
            "Repeated forgetting needs preparation before the action.",
          user_facing_next_step: "Prepare une carte d'attaque.",
        },
        feature_candidates: [{
          feature: "attack_card",
          fit: "high",
          why: "Repeated forgetting.",
          destination_hint: "Cartes d'attaque",
        }],
      }),
    visible_agent: async (input) => {
      visibleInput = input;
      return "Je partirais sur une carte d'attaque.";
    },
  });

  assertEquals(
    output.reply,
    "Je partirais sur une carte d'attaque.",
  );
  const state = (output.state_patch as any)
    .coaching_recommendation_local_state;
  assertEquals(state.last_visible_decision ?? null, null);
  assertEquals(visibleInput.visible_runtime_context.recent_messages, [
    {
      role: "user",
      content: "Avant je parlais d'autre chose",
    },
    { role: "assistant", content: "Ok." },
    { role: "user", content: "J'oublie toujours ma marche" },
  ]);
  assertEquals(
    visibleInput.visible_runtime_context.recent_effects_summary,
    "=== EFFETS RÉCENTS ===\n- Rappel créé.\n",
  );
  assertEquals(
    Object.hasOwn(
      visibleInput.flow_context.dispatcher_signal_context ?? {},
      "failure_mode",
    ),
    false,
  );
  assertEquals(
    visibleInput.flow_context.direct_effect_lane.selected_handler,
    "create_one_shot_reminder",
  );
  assertEquals(
    visibleInput.flow_context.direct_effect_confirmation_context
      .one_shot_reminder,
    {
      committed: true,
      local_label: "demain à 8h55",
      reminder_instruction: "marche",
    },
  );
  assertEquals(visibleInput.step_context.task_kind, "action_plan_coaching");
  assertEquals(
    visibleInput.step_context.selected_feature,
    "attack_card",
  );
});

Deno.test("coaching visible receives recent committed reminder context when current turn has no direct effect", async () => {
  const turnFrame: TurnFrame = {
    turn_id: "t-recent-reminder",
    source_message_id: "m-recent-reminder",
    user_id: "u1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {
      coaching_recommendation: {
        detected: true,
        confidence_band: "high",
        context: {
          coaching_type: "no_plan_action",
          confidence: 0.8,
          action_context: null,
          reason: "User asks a follow-up inside active coaching.",
        },
      },
    },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
  } as TurnFrame;
  const recentDirectContext = {
    has_committed_one_shot_reminder: true,
    has_requested_one_shot_reminder: true,
    one_shot_reminder: {
      committed: true,
      local_label: "dans 20 minutes",
      reminder_instruction: "relire la synthese",
    },
    committed_effects: [{
      type: "create_one_shot_reminder",
      id: "rem-recent-1",
      local_label: "dans 20 minutes",
      reminder_instruction: "relire la synthese",
    }],
    requested_effects: [],
    blocked_effects: [],
    do_not_recreate: true,
    do_not_reroute: true,
    do_not_redemand: true,
    do_not_confirm_without_commit: true,
    remaining_user_need_must_continue: true,
    source: "recent_effect_ledger",
  };
  let visibleInput: any = null;

  await runCoachingRecommendationSkill({
    user_message:
      "Tu peux me redire exactement ce que tu viens de programmer comme rappel ?",
    context: {
      skill_id: "coaching_recommendation",
      user_id: "u1",
      recent_messages: [],
      active_skill_working_state: null,
      turn_frame: turnFrame,
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
      runtime_context: {
        recent_effects_summary:
          "=== EFFETS RÉCENTS ===\n- Rappel ponctuel créé: exécuté et persisté; état DB actuel: pending.\n",
        recent_direct_effect_confirmation_context: recentDirectContext,
      },
    },
    local_dispatcher: async () =>
      decision({
        recommendation: {
          primary_feature: "attack_card",
          secondary_feature: null,
          why_primary: "The user is in an action-starting loop.",
          user_facing_next_step: "Use a short reset phrase.",
        },
        feature_candidates: [{
          feature: "attack_card",
          fit: "medium",
          why: "Action-starting loop.",
          destination_hint: "Cartes d'attaque",
        }],
      }),
    visible_agent: async (input) => {
      visibleInput = input;
      return "C'est bien le rappel dans 20 minutes.";
    },
  });

  assertEquals(
    visibleInput.flow_context.direct_effect_confirmation_context,
    recentDirectContext,
  );
  assertEquals(
    visibleInput.flow_context.direct_effect_confirmation_context
      .one_shot_reminder,
    {
      committed: true,
      local_label: "dans 20 minutes",
      reminder_instruction: "relire la synthese",
    },
  );
});

Deno.test("coaching skill stores structured visible decision as recommendation projection", async () => {
  const turnFrame: TurnFrame = {
    turn_id: "t1",
    source_message_id: "m1",
    user_id: "u1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {
      coaching_recommendation: {
        detected: true,
        confidence_band: "high",
        context: {
          coaching_type: "plan_action" as const,
          confidence: 0.9,
          action_context: {
            source: "plan",
            plan_item_id: "item-1",
            action_title: "Marcher 10 min",
          },
          reason: "Plan action.",
        },
      },
    },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
  } as TurnFrame;
  const output = await runCoachingRecommendationSkill({
    user_message: "Je risque surtout d'abandonner pendant la marche.",
    context: {
      skill_id: "coaching_recommendation",
      user_id: "u1",
      recent_messages: [],
      active_skill_working_state: null,
      turn_frame: turnFrame,
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    },
    local_dispatcher: async () =>
      decision({
        recommendation: {
          primary_feature: "attack_card",
          secondary_feature: null,
          why_primary: "Initial hint is attack card.",
          user_facing_next_step: "Prepare une carte.",
        },
        feature_candidates: [{
          feature: "attack_card",
          fit: "high",
          why: "Initial hint.",
          destination_hint: "Plan",
        }],
      }),
    visible_agent: async () => ({
      message:
        "Ici je basculerais plutôt vers une carte de défense: le risque est d'abandonner pendant l'action.",
      visible_decision: {
        lever: "defense_card",
        variant: null,
        potion_type: null,
        reason: "Le dernier message parle d'un risque pendant l'action.",
        confidence: "high",
      },
    }),
  });

  const state = (output.state_patch as any)
    .coaching_recommendation_local_state;
  assertEquals(String(output.reply ?? "").includes("carte de défense"), true);
  assertEquals(state.last_visible_decision.lever, "defense_card");
  assertEquals(state.current_recommendation.feature, "defense_card");
  assertEquals(
    state.recommendation_decision.primary_feature,
    "defense_card",
  );
});

Deno.test("coaching_only visible decision preserves the last stable product recommendation", async () => {
  const previousState = {
    stage: "followup",
    user_need_summary: "Mail to Camille launch blocker.",
    candidate_features: [{
      feature: "attack_card",
      fit: "high",
      why: "Launch blocker.",
      destination_hint: "Dashboard > Ressources",
    }],
    current_recommendation: {
      feature: "attack_card",
      fit: "high",
      why: "Launch blocker.",
      destination_hint: "Dashboard > Ressources",
    },
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Use a free attack card.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "no_plan_action" as const,
    coaching_type_confidence: "high",
    coaching_type_evidence: ["free action"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "no_plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "free",
        plan_item_id: null,
        action_title: "mail Camille",
      },
      reason: "Free action launch blocker.",
    },
    difficulty: {
      target_kind: "free_action",
      summary: "Mail Camille.",
      action_title: "mail Camille",
      action_source: "free",
    },
    cause_analysis: {
      primary_cause: "launch_blocker",
      why_it_exists: "Launch blocker.",
      confidence: "high",
      missing_info: [],
    },
    recommendation_decision: {
      primary_feature: "attack_card",
      secondary_feature: null,
      why_primary: "Launch blocker.",
      why_not_others: {},
      platform_destination: {
        label: "carte d'attaque libre",
        surface_hint: "Dashboard > Ressources",
        user_facing_destination:
          "surface=Dashboard > Ressources; object_type=carte d'attaque libre; relation_to_plan=hors_plan; user_action=ouvrir Ressources puis choisir ou creer ce type de carte",
      },
      user_facing_next_step: "Prepare une carte libre.",
    },
    last_visible_decision: {
      lever: "free_attack_card",
      variant: "preparer_terrain",
      potion_type: null,
      reason: "Launch blocker.",
      confidence: "high",
    },
    last_visible_task_kind: "no_plan_coaching",
    turn_count: 2,
    max_turns: 4,
  };
  const turnFrame: TurnFrame = {
    turn_id: "t-coaching-only",
    source_message_id: "m-coaching-only",
    user_id: "u1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {
      coaching_recommendation: {
        detected: true,
        confidence_band: "high",
        context: previousState.dispatcher_signal_context,
      },
    },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
  } as TurnFrame;
  const output = await runCoachingRecommendationSkill({
    user_message:
      "Je veux juste comprendre la difference, pas preparer maintenant.",
    context: {
      skill_id: "coaching_recommendation",
      user_id: "u1",
      recent_messages: [],
      active_skill_working_state: activeCoachingState(previousState),
      turn_frame: turnFrame,
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    },
    local_dispatcher: async () =>
      decision({
        flow_action: "answer_followup",
        feature_candidates: [],
        recommendation: {
          primary_feature: null,
          secondary_feature: null,
          why_primary: null,
          user_facing_next_step: null,
        },
        visible_task: {
          kind: "no_plan_coaching",
          instruction: "Explain only.",
          conversation_context: {
            state_summary: "User asks to understand only.",
            known_values: {},
            missing_or_weak_values: [],
            candidate_features: [],
            recommendation: {},
            tone_constraints: [],
            do_not_say: [],
            evidence_used: [],
          },
        },
      }),
    visible_agent: async () => ({
      message: "Oui, je t'explique sans preparer maintenant.",
      visible_decision: {
        lever: "coaching_only",
        variant: null,
        potion_type: null,
        reason: "Le user demande seulement une explication.",
        confidence: "high",
      },
    }),
  });

  const state = (output.state_patch as any)
    .coaching_recommendation_local_state;
  assertEquals(output.status, "continue");
  assertEquals(state.last_visible_decision.lever, "coaching_only");
  assertEquals(state.current_recommendation.feature, "attack_card");
  assertEquals(state.recommendation_decision.primary_feature, "attack_card");

  const actionPlanPreviousState = {
    ...previousState,
    user_need_summary: "Dossier mutuelle launch blocker.",
    candidate_features: [{
      feature: "attack_card",
      fit: "high",
      why: "Launch blocker on a plan action.",
      destination_hint: "Dashboard > Plan",
    }],
    current_recommendation: {
      feature: "attack_card",
      fit: "high",
      why: "Launch blocker on a plan action.",
      destination_hint: "Dashboard > Plan",
    },
    coaching_type: "plan_action" as const,
    dispatcher_signal_context: {
      coaching_type: "plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "plan",
        plan_item_id: "plan-item-1",
        action_title: "dossier mutuelle",
      },
      reason: "Plan action launch blocker.",
    },
    difficulty: {
      target_kind: "plan_action",
      summary: "Dossier mutuelle.",
      action_title: "dossier mutuelle",
      action_source: "plan",
    },
    recommendation_decision: {
      primary_feature: "attack_card",
      secondary_feature: null,
      why_primary: "Launch blocker on a plan action.",
      why_not_others: {},
      platform_destination: {
        label: "carte d'attaque",
        surface_hint: "Dashboard > Plan",
        user_facing_destination:
          "surface=Dashboard > Plan; anchor=action_concernee; object_type=carte d'attaque liee au Plan; user_action=ouvrir l'action concernee puis preparer la carte",
      },
      user_facing_next_step: "Prepare une carte depuis l'action du Plan.",
    },
    last_visible_decision: {
      lever: "attack_card",
      variant: "texte_magique",
      potion_type: null,
      reason: "Launch blocker on a plan action.",
      confidence: "high",
    },
    last_visible_task_kind: "action_plan_coaching",
  };
  const actionTurnFrame: TurnFrame = {
    ...turnFrame,
    turn_id: "t-coaching-only-action-plan",
    source_message_id: "m-coaching-only-action-plan",
    skill_signals: {
      coaching_recommendation: {
        detected: true,
        confidence_band: "high",
        context: actionPlanPreviousState.dispatcher_signal_context,
      },
    },
  } as TurnFrame;
  const actionOutput = await runCoachingRecommendationSkill({
    user_message: "Pas de carte: donne-moi juste la premiere phrase.",
    context: {
      skill_id: "coaching_recommendation",
      user_id: "u1",
      recent_messages: [],
      active_skill_working_state: activeCoachingState(actionPlanPreviousState),
      turn_frame: actionTurnFrame,
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    },
    local_dispatcher: async () =>
      decision({
        flow_action: "answer_followup",
        feature_candidates: [],
        recommendation: {
          primary_feature: null,
          secondary_feature: null,
          why_primary: null,
          user_facing_next_step: null,
        },
        visible_task: {
          kind: "action_plan_coaching",
          instruction: "Help conversationally without card label.",
          conversation_context: {
            state_summary: "User asks for a normal phrase.",
            known_values: {},
            missing_or_weak_values: [],
            candidate_features: [],
            recommendation: {},
            tone_constraints: ["pas de carte"],
            do_not_say: ["carte"],
            evidence_used: [],
          },
        },
      }),
    visible_agent: async () => ({
      message: "Ecris juste: je reprends par la premiere info manquante.",
      visible_decision: {
        lever: "coaching_only",
        variant: null,
        potion_type: null,
        reason: "Le user demande une phrase directe sans carte.",
        confidence: "high",
      },
    }),
  });
  const actionState = (actionOutput.state_patch as any)
    .coaching_recommendation_local_state;
  assertEquals(actionOutput.status, "continue");
  assertEquals(actionState.last_visible_decision.lever, "coaching_only");
  assertEquals(actionState.current_recommendation.feature, "attack_card");
  assertEquals(
    actionState.recommendation_decision.primary_feature,
    "attack_card",
  );
});

Deno.test("coaching product visible decision keeps ownership active when reducer would close", async () => {
  const previousState = {
    stage: "followup",
    user_need_summary: "Mail to Camille.",
    candidate_features: [],
    current_recommendation: null,
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: "Explaining only.",
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "no_plan_action" as const,
    coaching_type_confidence: "high",
    coaching_type_evidence: ["free action"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "no_plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "free",
        plan_item_id: null,
        action_title: "mail Camille",
      },
      reason: "Free action risk moment.",
    },
    difficulty: {
      target_kind: "free_action",
      summary: "Mail Camille.",
      action_title: "mail Camille",
      action_source: "free",
    },
    cause_analysis: {
      primary_cause: "risk_moment",
      why_it_exists: "Risk moment.",
      confidence: "high",
      missing_info: [],
    },
    recommendation_decision: null,
    last_visible_decision: {
      lever: "coaching_only",
      variant: null,
      potion_type: null,
      reason: "Explaining only.",
      confidence: "high",
    },
    last_visible_task_kind: "no_plan_coaching",
    turn_count: 4,
    max_turns: 4,
  };
  const turnFrame: TurnFrame = {
    turn_id: "t-keep-active",
    source_message_id: "m-keep-active",
    user_id: "u1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {
      coaching_recommendation: {
        detected: true,
        confidence_band: "high",
        context: previousState.dispatcher_signal_context,
      },
    },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
  } as TurnFrame;
  const output = await runCoachingRecommendationSkill({
    user_message: "Je ferme quand je vois une phrase froide.",
    context: {
      skill_id: "coaching_recommendation",
      user_id: "u1",
      recent_messages: [],
      active_skill_working_state: activeCoachingState(previousState),
      turn_frame: turnFrame,
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    },
    local_dispatcher: async () =>
      decision({
        flow_action: "close_flow",
        state_updates: {
          stage: "closing",
          status: "closed",
          turn_count_increment: 1,
          close_after_visible: true,
        },
        feature_candidates: [],
        recommendation: {
          primary_feature: null,
          secondary_feature: null,
          why_primary: null,
          user_facing_next_step: null,
        },
        visible_task: {
          kind: "no_plan_coaching",
          instruction: "Explain attack versus defense.",
          conversation_context: {
            state_summary: "User provides a risk moment.",
            known_values: {},
            missing_or_weak_values: [],
            candidate_features: [],
            recommendation: {},
            tone_constraints: [],
            do_not_say: [],
            evidence_used: [],
          },
        },
      }),
    visible_agent: async () => ({
      message: "La c'est une defense libre.",
      visible_decision: {
        lever: "free_defense_card",
        variant: null,
        potion_type: null,
        reason: "Le user decrit un decrochage pendant l'action.",
        confidence: "high",
      },
    }),
  });

  const state = (output.state_patch as any)
    .coaching_recommendation_local_state;
  assertEquals(output.status, "continue");
  assertEquals(state.last_visible_decision.lever, "free_defense_card");
  assertEquals(state.current_recommendation.feature, "defense_card");
  assertEquals(
    state.recommendation_decision.platform_destination.surface_hint,
    "Dashboard > Ressources",
  );
});

Deno.test("coaching UI grounding is data-like, not visible message templates", async () => {
  const files = [
    "supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/no_plan_coaching.ts",
    "supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/action_plan_coaching.ts",
    "supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/emotion_coaching.ts",
    "supabase/functions/sophia-brain/skills/coaching_recommendation/skill.ts",
    "supabase/functions/sophia-brain/skills/coaching_recommendation/local_flow.ts",
  ];
  const contents = await Promise.all(
    files.map((file) => Deno.readTextFile(file)),
  );
  const joined = contents.join("\n");

  assertEquals(joined.includes("Elements UI carte d'attaque libre"), true);
  assertEquals(joined.includes("Elements UI carte liee au Plan"), true);
  assertEquals(joined.includes("Elements UI potion"), true);
  assertEquals(joined.includes("surface=Dashboard > Ressources"), true);
  assertEquals(joined.includes("object_type=carte d'attaque libre"), true);
  assertEquals(joined.includes("section=Potions"), true);

  const badFreeAttack = ["comme", "carte d'attaque libre"].join(" ");
  const badFreeDefense = ["comme", "carte de defense libre"].join(" ");
  const legacyAttackDestination = ["Destination", "carte d'attaque libre:"]
    .join(" ");
  const legacyPotionDestination = ["Destination", "potion:"].join(" ");
  assertEquals(joined.includes(badFreeAttack), false);
  assertEquals(joined.includes(badFreeDefense), false);
  assertEquals(joined.includes(legacyAttackDestination), false);
  assertEquals(joined.includes(legacyPotionDestination), false);
});

Deno.test("coaching reducer drops removed product opportunity candidates", () => {
  const output = decision({
    feature_candidates: [
      {
        feature: "recurring_reminder",
        fit: "high",
        why: "removed",
        destination_hint: null,
      },
      {
        feature: "coach_preferences",
        fit: "high",
        why: "removed",
        destination_hint: null,
      },
      {
        feature: "one_shot_reminder",
        fit: "high",
        why: "removed",
        destination_hint: null,
      },
      {
        feature: "attack_card",
        fit: "high",
        why: "forgetting",
        destination_hint: "Ressources",
      },
    ],
    recommendation: {
      primary_feature: "coach_preferences",
      secondary_feature: "one_shot_reminder",
      why_primary: "bad",
      user_facing_next_step: "bad",
    },
  });

  assertEquals(
    output.feature_candidates.map((candidate) => candidate.feature),
    ["attack_card"],
  );
  assertEquals(output.recommendation.primary_feature, "attack_card");
  assertEquals(output.recommendation.secondary_feature, null);
});

Deno.test("coaching reducer does not turn legacy product help handoff into platform guidance without plan action", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: null,
    output: decision({
      flow_action: "handoff_to_product_help",
      coaching_intent: {
        kind: "product_question",
        summary: "What is a defense card?",
      },
    }),
    userMessage: "C'est quoi une carte de defense ?",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.note_information, null);
  assertEquals(reduced.visible_task, "change_confirm_coaching_type");
  assertEquals(reduced.step_context.task_kind, "change_confirm_coaching_type");
});

Deno.test("coaching reducer never handoffs safety from local flow", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: null,
    output: decision({
      flow_action: "safety_preempt",
      coaching_intent: {
        kind: "safety",
        summary: "Legacy local safety output.",
      },
      risk_score: 9,
      visible_task: {
        kind: "safety_transition",
        instruction: "Legacy safety transition.",
        conversation_context: {},
      },
    }),
    userMessage: "Je bloque a ecrire un mail.",
  });

  assertEquals(reduced.status, "exit");
  assertEquals(reduced.reason_code, "coaching_recommendation_exit_to_global");
  assertEquals(reduced.visible_task, "exit_ack");
  assertEquals(reduced.step_context.task_kind, "exit_ack");
  assertEquals(reduced.note_information?.target_dispatcher, "global");
  assertEquals(reduced.note_information?.handoff_reason, "topic_change");
});

Deno.test("coaching max turns forces recommendation or close", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "understand_need",
      user_need_summary: "Need unclear",
      candidate_features: [],
      current_recommendation: null,
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: null,
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      dispatcher_signal_context: {
        coaching_type: "plan_action" as const,
        confidence: 0.9,
        action_context: {
          source: "plan",
          plan_item_id: "item-1",
          action_title: "Action du plan",
        },
        reason: "Existing plan item launch blocker.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: null,
      turn_count: 3,
      max_turns: 4,
    },
    output: decision({
      flow_action: "continue_clarifying_need",
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Launch blocker.",
        user_facing_next_step: "ouvre une carte d'attaque.",
      },
      feature_candidates: [{
        feature: "attack_card",
        fit: "high",
        why: "Launch blocker.",
        destination_hint: "Ressources",
      }],
    }),
    userMessage: "je bloque encore",
  });

  assertEquals(reduced.visible_task, "action_plan_coaching");
});

Deno.test("coaching reads parent bridge note from daily", () => {
  const note = buildCoachingRecommendationBridgeNote({
    source_flow_id: "daily_action_review_v1",
    user_intent_summary: "User repeatedly forgets the daily action.",
    bridge_reason: "forgetting",
    parent_stage: "collecting",
    parent_state_summary: "Daily collecting current action.",
    action_context: { plan_item_id: "item-1", title: "Marcher 10 min" },
    known_values: {},
    missing_or_weak_values: ["reason"],
    return_focus: "return_to_daily_current_question",
    evidence: ["oubli recurrent"],
    confidence: "high",
    dispatcher_signal_context: {
      coaching_type: "plan_action" as const,
      confidence: 0.86,
      action_context: {
        source: "plan",
        plan_item_id: "item-1",
        action_title: "Marcher 10 min",
      },
      reason: "User repeatedly forgets the daily action.",
    },
  });
  const state = initialCoachingRecommendationStateFromParentBridge(note);

  assertEquals(isCoachingRecommendationBridgeNote(note), true);
  assertEquals(state?.parent_flow_id, "daily_action_review_v1");
  assertEquals(state?.parent_return_focus, "return_to_daily_current_question");
  assertEquals(state?.dispatcher_signal_context?.coaching_type, "plan_action");
  assertEquals(
    Object.hasOwn(state?.dispatcher_signal_context ?? {}, "failure_mode"),
    false,
  );
  assertEquals(state?.coaching_type, "plan_action");
  assertEquals(state?.difficulty?.action_title, "Marcher 10 min");
  assertEquals(state?.cause_analysis?.primary_cause, "unclear");
});

Deno.test("coaching reads parent bridge note from weekly", () => {
  const note = buildCoachingRecommendationBridgeNote({
    source_flow_id: "weekly_adaptive_review_v1",
    user_intent_summary: "User hesitates between Sophia levers.",
    bridge_reason: "feature_choice",
    parent_stage: "action_review",
    parent_state_summary: "Weekly action review active.",
    action_context: { plan_item_id: "item-1", title: "Marcher 10 min" },
    known_values: {},
    missing_or_weak_values: [],
    return_focus: "resume_weekly_review_after_coaching_recommendation",
    evidence: ["feature choice"],
    confidence: "high",
  });
  const state = initialCoachingRecommendationStateFromParentBridge(note);

  assertEquals(state?.parent_flow_id, "weekly_adaptive_review_v1");
});

Deno.test("coaching complete from parent returns structured note to parent", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "recommend",
      user_need_summary: "Repeated forgetting.",
      candidate_features: [{
        feature: "attack_card",
        fit: "high",
        why: "Repeated forgetting.",
        destination_hint: "Cartes d'attaque",
      }],
      current_recommendation: {
        feature: "attack_card",
        fit: "high",
        why: "Repeated forgetting.",
        destination_hint: "Cartes d'attaque",
      },
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: "Attack card fits repeated forgetting.",
      parent_flow_id: "weekly_adaptive_review_v1",
      parent_return_focus: "resume_weekly_review_after_coaching_recommendation",
      parent_action_context: { plan_item_id: "item-1" },
      parent_state_summary: "Weekly action review active.",
      dispatcher_signal_context: {
        coaching_type: "plan_action" as const,
        confidence: 0.9,
        action_context: {
          source: "plan",
          plan_item_id: "item-1",
          action_title: "Marcher 10 min",
        },
        reason: "Repeated forgetting favors attack_card.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: null,
      turn_count: 1,
      max_turns: 4,
    },
    output: decision({
      flow_action: "close_flow",
      state_updates: {
        stage: "closing",
        status: "closed",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "Repeated forgetting needs preparation before the action.",
        user_facing_next_step: "Prepare une carte d'attaque.",
      },
    }),
    userMessage: "ok merci",
  });

  assertEquals(reduced.status, "complete");
  assertEquals(
    reduced.note_information?.target_dispatcher,
    "weekly_adaptive_review_v1",
  );
  assertEquals(
    reduced.note_information?.structured_context.bridge_kind,
    "coaching_recommendation_to_parent",
  );
  assertEquals(
    (reduced.note_information?.structured_context.recommended_feature as any)
      ?.primary,
    "attack_card",
  );
  assertEquals(reduced.effects.committed, []);
});

Deno.test("coaching complete without parent keeps current no-note behavior", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: null,
    output: decision({
      flow_action: "close_flow",
      state_updates: {
        stage: "closing",
        status: "closed",
        turn_count_increment: 1,
        close_after_visible: true,
      },
    }),
    userMessage: "ok merci",
  });

  assertEquals(reduced.status, "complete");
  assertEquals(reduced.note_information, null);
});

Deno.test("technique_coherence survives normalization and invalid values collapse to null (alex-r1 B04)", () => {
  const forced = decision({
    visible_task: {
      kind: "recommend_feature",
      instruction: "Recommend with doubt.",
      conversation_context: {
        state_summary: "Forced technique.",
        known_values: {},
        missing_or_weak_values: [],
        candidate_features: [],
        recommendation: {},
        tone_constraints: [],
        do_not_say: [],
        evidence_used: [],
      },
      flow_context: {
        technique_coherence: {
          status: "forced_mismatch",
          requested_technique: "mot_de_bascule",
          suggested_technique: "externalisation",
          why: "Le besoin est de vider une tete qui craint d'oublier, pas de couper un geste.",
        },
      },
    },
  });
  assertEquals(
    forced.visible_task.flow_context?.technique_coherence?.status,
    "forced_mismatch",
  );
  assertEquals(
    forced.visible_task.flow_context?.technique_coherence?.suggested_technique,
    "externalisation",
  );

  // Anti-faux-positif: statut inconnu ou champ absent → null, jamais un
  // forced_mismatch invente.
  const invalid = decision({
    visible_task: {
      kind: "recommend_feature",
      instruction: "x",
      conversation_context: {
        state_summary: "s",
        known_values: {},
        missing_or_weak_values: [],
        candidate_features: [],
        recommendation: {},
        tone_constraints: [],
        do_not_say: [],
        evidence_used: [],
      },
      flow_context: { technique_coherence: { status: "maybe" } },
    },
  });
  assertEquals(
    invalid.visible_task.flow_context?.technique_coherence ?? null,
    null,
  );
  const absent = decision({});
  assertEquals(
    absent.visible_task.flow_context?.technique_coherence ?? null,
    null,
  );
});

Deno.test("la doctrine de coherence potion s'applique des la collecte, sans cadre fabrique (rose-r7 B02)", () => {
  const prompt = coachingDispatcherPromptForTest(
    {
      user_id: "user-test",
      request_id: "req-test",
      user_message: "donne-moi une potion de courage",
      recent_messages: [],
      previous_state: null,
      active_plan_items: [],
      turn_frame: null,
    } as any,
  );
  // Positif: le contrat s'applique avant qu'une recommandation existe.
  assertEquals(prompt.includes("DES LA COLLECTE"), true);
  assertEquals(
    prompt.includes("AVANT meme qu'une recommandation existe"),
    true,
  );
  // Interdiction de la rationalisation retroactive observee (cadre 'evitement'
  // jamais exprime par Rose fabrique pour justifier la bascule).
  assertEquals(
    prompt.includes("INTERDIT de fabriquer retroactivement un cadre"),
    true,
  );
  // Anti-faux-positif: la reaffirmation coherente s'accepte sans requalifier.
  assertEquals(
    prompt.includes("s'accepte sans requalification"),
    true,
  );
  // La regle levier-agnostique existante reste ancree (non-regression V4-5).
  assertEquals(
    prompt.includes("OBLIGATOIRE des qu'une technique OU un type de potion"),
    true,
  );
});

Deno.test("coaching local dispatcher prompt defines the deep discursive deposit exit (nav-frontieres NAV-B01)", async () => {
  const source = await Deno.readTextFile(
    new URL("./local_flow.ts", import.meta.url),
  );
  assertEquals(
    source.includes("Regle prioritaire DEPOT DISCURSIF PROFOND"),
    true,
  );
  assertEquals(
    source.includes(
      "prime sur la continuation du flow ET sur une recommandation deja posee",
    ),
    true,
  );
  assertEquals(
    source.includes("Abandon de recommandation sur depot discursif"),
    true,
  );
  assertEquals(
    source.includes(
      "l'invariant 'recommandation active interdit l'exit' ne s'applique pas",
    ),
    true,
  );
  // La regle "changement de cible local action→emotion" ne doit plus avaler le
  // depot discursif (c'etait le piege de B6/B7 du run nav-frontieres-r1).
  assertEquals(
    source.includes("n'est PAS un changement de cible vers emotional"),
    true,
  );
  // Le rejet d'une reco suivi d'un depot de fond route vers la sortie
  // discursive, pas vers "clarifie ou soutiens" dans le flow.
  assertEquals(
    source.includes(
      "S'il decline ET depose un sujet de fond ou dit vouloir juste parler",
    ),
    true,
  );
  // Anti-faux-positifs conserves: l'emotion liee a l'action avec demande
  // d'aide et le suivi de carte restent du coaching.
  assertEquals(
    source.includes("reste du coaching; un suivi de la carte en cours"),
    true,
  );
});

// Replay B7 du run nav-frontieres-r1: coaching emotional actif avec une potion
// deja recommandee (state_potion), le user refuse la potion et depose un sujet
// de fond ("je veux juste parler"). Le garde ne doit PAS convertir la sortie en
// continuation (active_flow_non_critical_exit_blocked): une sortie propre
// (exit_ack, recommendation nulle, candidates vides) est preservee meme avec
// une recommandation posee dans le state precedent.
Deno.test("coaching reducer preserves a clean discursive-deposit exit despite a standing recommendation", () => {
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: {
      stage: "recommend" as const,
      user_need_summary: "Se sent a cote de sa vie, procrastine le soir.",
      candidate_features: [{
        feature: "state_potion" as const,
        fit: "high" as const,
        why: "Etat emotionnel global.",
        destination_hint: "Potions",
      }],
      current_recommendation: {
        feature: "state_potion" as const,
        fit: "high" as const,
        why: "Potion clarte pour retrouver le sens.",
        destination_hint: "Potions",
      },
      secondary_recommendation: null,
      unresolved_question: null,
      last_answer_summary: "Potion clarte recommandee.",
      parent_flow_id: null,
      parent_return_focus: null,
      parent_action_context: null,
      parent_state_summary: null,
      coaching_type: "emotional" as const,
      coaching_type_confidence: "high",
      coaching_type_evidence: ["sentiment d'etre a cote de sa vie"],
      pending_type_change: null,
      dispatcher_signal_context: {
        coaching_type: "emotional" as const,
        confidence: 0.9,
        action_context: null,
        reason: "Etat emotionnel global.",
      },
      difficulty: null,
      cause_analysis: null,
      recommendation_decision: null,
      last_visible_task_kind: "emotion_coaching" as const,
      turn_count: 3,
      max_turns: 4,
    },
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      coaching_intent: {
        kind: "general_support",
        summary:
          "Le user refuse la potion et depose un sujet de fond: vide depuis sa rupture, il veut juste en parler.",
      },
      target_switch: {
        status: "none",
        to_coaching_type: null,
        target: null,
      },
      recommendation: {
        primary_feature: null,
        secondary_feature: null,
        why_primary: null,
        user_facing_next_step: null,
      },
      feature_candidates: [],
      state_updates: {
        stage: "followup",
        status: "exit_to_global",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "exit_ack",
        instruction:
          "Accuser le depot et rendre la main au dispatcher global (discussion de fond).",
        conversation_context: {
          state_summary: "Depot discursif profond, hors cadre coaching.",
          known_values: {},
          missing_or_weak_values: [],
          candidate_features: [],
          recommendation: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        },
      },
      note_information: {
        needed: true,
        reason: "deep_discussion_deposit",
        summary:
          "Refus de la potion; depuis sa rupture en mars il joue un role et se sent vide le soir; veut juste parler.",
      },
      evidence: [
        "Non j'ai pas envie d'une potion la. J'ai juste envie de parler pour une fois.",
      ],
    }),
    userMessage:
      "Non j'ai pas envie d'une potion là. J'ai juste envie de parler pour une fois. Depuis ma rupture en mars je fais tout ce qu'il faut mais c'est comme si je jouais un rôle.",
  });

  assertEquals(reduced.status, "exit");
  assertEquals(reduced.reason_code, "coaching_recommendation_exit_to_global");
  assertEquals(reduced.diagnosis.exit_rejected_reason, null);
  assertEquals(reduced.local_state, null);
  assertEquals(reduced.note_information !== null, true);
});

Deno.test("le handoff de creation coupe la re-explication (paul-triflow15 B03)", () => {
  const prompt = coachingDispatcherPromptForTest(
    {
      user_id: "user-test",
      request_id: "req-test",
      user_message: "ok vas-y cree-la",
      recent_messages: [],
      previous_state: null,
      active_plan_items: [],
      turn_frame: null,
    } as any,
  );
  // Positif: l'ordre de creation devient un handoff qui acte, plus une explication.
  assertEquals(
    prompt.includes(
      "Bascule vers la CREATION = handoff produit, jamais une re-explication",
    ),
    true,
  );
  assertEquals(
    prompt.includes("state_updates.materialization_handoff_done=true"),
    true,
  );
  // Ratchet: un 2e ordre de creation apres handoff = 1-2 phrases nettes.
  assertEquals(prompt.includes("handoff NET en 1-2 phrases"), true);
  assertEquals(
    prompt.includes("ZERO re-explication, ZERO re-definition"),
    true,
  );
  // Anti-faux-positif: une vraie question de contenu apres handoff reste servie.
  assertEquals(
    prompt.includes("je mets quoi dans le geste de retour"),
    true,
  );
  // Le miroir visible: l'agent ne re-sert jamais la definition sur un handoff.
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes(
      "Ordre de creation ('cree-la') = handoff, pas explication",
    ),
    true,
  );
});

Deno.test("materialization_handoff_done se normalise et se cliquete dans l'etat (paul-triflow15 B03)", () => {
  // Normalisation: absent → false, true explicite → true.
  const absent = decision({});
  assertEquals(absent.state_updates.materialization_handoff_done, false);
  const set = decision({
    state_updates: {
      stage: "followup",
      status: "active",
      turn_count_increment: 1,
      close_after_visible: false,
      materialization_handoff_done: true,
    },
  });
  assertEquals(set.state_updates.materialization_handoff_done, true);

  const basePrevious = {
    stage: "recommend" as const,
    user_need_summary: "Carte de defense presentee.",
    candidate_features: [],
    current_recommendation: null,
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: null,
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: "plan_action" as const,
    coaching_type_confidence: "high" as const,
    coaching_type_evidence: ["plan"],
    pending_type_change: null,
    dispatcher_signal_context: {
      coaching_type: "plan_action" as const,
      confidence: 0.9,
      action_context: {
        source: "plan" as const,
        plan_item_id: "item-1",
        action_title: "Preparer le dossier mutuelle",
      },
      reason: "Plan action launch blocker.",
    },
    difficulty: null,
    cause_analysis: null,
    recommendation_decision: null,
    last_visible_task_kind: "action_plan_coaching" as const,
    turn_count: 1,
    max_turns: 4,
  };

  // Le tour du handoff pose le flag dans l'etat.
  const handoffTurn = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: basePrevious,
    output: decision({
      state_updates: {
        stage: "followup",
        status: "active",
        turn_count_increment: 1,
        close_after_visible: false,
        materialization_handoff_done: true,
      },
    }),
    userMessage: "ok cree-la",
  });
  assertEquals(handoffTurn.local_state?.materialization_handoff_done, true);

  // Cliquet: au tour suivant, meme si le dispatcher omet le flag, il reste true.
  const nextTurn = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: { ...basePrevious, materialization_handoff_done: true },
    output: decision({}),
    userMessage: "cree-la s'il te plait",
  });
  assertEquals(nextTurn.local_state?.materialization_handoff_done, true);

  // Anti-faux-positif: sans handoff, le flag reste false/absent.
  const noHandoff = reduceCoachingRecommendationLocalDispatcherOutput({
    previous: basePrevious,
    output: decision({}),
    userMessage: "explique-moi la difference",
  });
  assertEquals(
    noHandoff.local_state?.materialization_handoff_done ?? false,
    false,
  );
});

Deno.test("le pivot emotionnel doux sort du flow coaching sans refus frontal (rose-multiflow B02, eva-g16 B02)", () => {
  const prompt = coachingDispatcherPromptForTest(
    {
      user_id: "user-test",
      request_id: "req-test",
      user_message: "j'ai juste besoin d'etre rassuree la",
      recent_messages: [],
      previous_state: null,
      active_plan_items: [],
      turn_frame: null,
    } as any,
  );
  // Positif: la sortie discursive couvre le pivot doux (reassurance/cloture apaisee).
  assertEquals(
    prompt.includes("Sortie sur PIVOT EMOTIONNEL DOUX"),
    true,
  );
  assertEquals(
    prompt.includes("n'exige NI refus frontal NI depot long"),
    true,
  );
  // eva-g16 B02: un depot de ressenti de fond sans demande d'outil sort aussi,
  // jamais un pitch de potion.
  assertEquals(
    prompt.includes(
      "depot d'un ressenti de fond (solitude, vide) sans demande d'outil",
    ),
    true,
  );
  assertEquals(
    prompt.includes("ni un pitch de potion sur ce pivot"),
    true,
  );
  // Anti-repetition inter-tours sur le pivot (rose T13).
  assertEquals(
    prompt.includes(
      "Ne re-sers JAMAIS la formule de soutien d'un tour precedent",
    ),
    true,
  );
  // Anti-faux-positifs: methode/continuation de carte restent du coaching.
  assertEquals(
    prompt.includes(
      "une demande de methode ou de continuation de la carte reste du coaching",
    ),
    true,
  );
  // Non-regression: la sortie refus frontal / depot profond reste ancree.
  assertEquals(
    prompt.includes("Regle prioritaire DEPOT DISCURSIF PROFOND"),
    true,
  );
});

Deno.test("la coherence technique s'applique aux cartes: le mot-cle ne choisit pas la carte (eva-g16 B03)", () => {
  const prompt = coachingDispatcherPromptForTest(
    {
      user_id: "user-test",
      request_id: "req-test",
      user_message: "vas-y pour l'attaque",
      recent_messages: [],
      previous_state: null,
      active_plan_items: [],
      turn_frame: null,
    } as any,
  );
  // Positif: le contrat technique_coherence couvre explicitement les cartes.
  assertEquals(
    prompt.includes("Les CARTES suivent exactement le meme contrat"),
    true,
  );
  assertEquals(
    prompt.includes(
      "requested_technique='attack_card' et suggested_technique='defense_card'",
    ),
    true,
  );
  assertEquals(
    prompt.includes(
      "le mot-cle user ne choisit JAMAIS la carte, la nature de l'action choisit",
    ),
    true,
  );
  // Non-regression: le micro-cadre nature d'action → technique reste la base.
  assertEquals(
    prompt.includes("Micro-cadre nature d'action → technique"),
    true,
  );
  // Miroir visible: interdiction de la contradiction definition/conclusion.
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes(
      "Coherence definition↔conclusion (eva-g16 B03)",
    ),
    true,
  );
  assertEquals(
    COACHING_VISIBLE_GLOBAL_RULES.includes(
      "INTERDIT de decrire un cas qui matche la definition defense et de conclure 'attaque'",
    ),
    true,
  );
  // Anti-faux-positif: un vrai moment de demarrage demande en attaque reste servi
  // sans doute (le contrat ne cree un doute que sur mismatch nature/wording).
  assertEquals(
    prompt.includes(
      "Une vraie fenetre de rupture demandee comme mot de bascule reste servie sans doute",
    ),
    true,
  );
});

Deno.test("le tour du handoff de creation ne clot jamais le flow (probe qa-v6-p6)", () => {
  // Positif: meme si le dispatcher rend closing/close_after_visible, le tour
  // qui pose materialization_handoff_done reste actif — le re-ordre de
  // creation doit retomber dans ce flow (ou vit le cliquet).
  const output = decision({
    state_updates: {
      stage: "followup",
      status: "closing",
      turn_count_increment: 1,
      close_after_visible: true,
      materialization_handoff_done: true,
    },
  });
  assertEquals(output.state_updates.status, "active");
  assertEquals(output.state_updates.close_after_visible, false);
  assertEquals(output.state_updates.materialization_handoff_done, true);

  // Anti-faux-positif: sans handoff, closing reste closing (rose-r5 B01:
  // la collecte finie CLOT la construction).
  const closing = decision({
    state_updates: {
      stage: "closing",
      status: "closing",
      turn_count_increment: 1,
      close_after_visible: true,
    },
  });
  assertEquals(closing.state_updates.status, "closing");
  assertEquals(closing.state_updates.close_after_visible, true);
});

Deno.test("la branche exit exécute le direct effect avant de rendre la main (P0-1, ALEX-CPR-B01)", async () => {
  // Positif: un rappel explicite demandé AU TOUR de sortie n'est jamais
  // perdu — l'exécuteur de lane est appelé avant le return exit.
  const executorCalls: any[] = [];
  const output = await runCoachingRecommendationSkill({
    user_message:
      "Laisse tomber la carte. Par contre rappelle-moi à 22h30 de poser le téléphone.",
    context: {
      skill_id: "coaching_recommendation",
      user_id: "u1",
      recent_messages: [],
      active_skill_working_state: null,
      turn_frame: {
      skill_signals: {
        coaching_recommendation: {
          detected: true,
          confidence_band: "high",
          context: {
            coaching_type: "no_plan_action",
            confidence: 0.9,
            action_context: { source: "free" },
            reason: "Blocage personnel identifiable.",
          },
        },
      },
    } as any,
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
      runtime_context: {},
    } as any,
    local_dispatcher: async () =>
      decision({
        flow_action: "exit_to_global_dispatcher",
        coaching_intent: {
          kind: "general_support",
          summary: "Depot discursif, le user veut parler.",
        },
        feature_candidates: [],
        recommendation: {
          primary_feature: null,
          secondary_feature: null,
          why_primary: null,
          user_facing_next_step: null,
        },
        state_updates: {
          stage: "closing",
          status: "exit_to_global",
          turn_count_increment: 1,
          close_after_visible: false,
        },
        visible_task: {
          kind: "exit_ack",
          instruction: "",
          conversation_context: {
            state_summary: "exit",
            known_values: {},
            missing_or_weak_values: [],
            candidate_features: [],
            recommendation: {},
            tone_constraints: [],
            do_not_say: [],
            evidence_used: [],
          },
        },
        note_information: {
          audience: "global_dispatcher",
          summary: "Le user veut parler du fond.",
        },
        direct_effect_request: {
          requested: true,
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            raw_text: "rappelle-moi à 22h30 de poser le téléphone",
            when_hint: "à 22h30",
            UTC_time: "2026-05-29T20:30:00.000Z",
            local_label: "22:30",
            instruction_hint: "poser le téléphone",
          },
          reason: "rappel explicite au tour de sortie",
        },
      }),
    direct_effect_executor: (async (request: any) => {
      executorCalls.push(request);
      return { turn_frame: null };
    }) as any,
    visible_agent: (async () => "jamais appelé sur exit") as any,
  } as any);

  assertEquals(output.status, "exit");
  assertEquals(executorCalls.length, 1);
  assertEquals(executorCalls[0]?.effect_type, "create_one_shot_reminder");

  // Anti-faux-positif: exit SANS direct_effect_request → exécuteur jamais appelé.
  const noRequestCalls: any[] = [];
  const clean = await runCoachingRecommendationSkill({
    user_message: "Laisse tomber, je veux juste parler.",
    context: {
      skill_id: "coaching_recommendation",
      user_id: "u1",
      recent_messages: [],
      active_skill_working_state: null,
      turn_frame: {
      skill_signals: {
        coaching_recommendation: {
          detected: true,
          confidence_band: "high",
          context: {
            coaching_type: "no_plan_action",
            confidence: 0.9,
            action_context: { source: "free" },
            reason: "Blocage personnel identifiable.",
          },
        },
      },
    } as any,
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
      runtime_context: {},
    } as any,
    local_dispatcher: async () =>
      decision({
        flow_action: "exit_to_global_dispatcher",
        coaching_intent: {
          kind: "general_support",
          summary: "Depot discursif.",
        },
        feature_candidates: [],
        recommendation: {
          primary_feature: null,
          secondary_feature: null,
          why_primary: null,
          user_facing_next_step: null,
        },
        state_updates: {
          stage: "closing",
          status: "exit_to_global",
          turn_count_increment: 1,
          close_after_visible: false,
        },
        visible_task: {
          kind: "exit_ack",
          instruction: "",
          conversation_context: {
            state_summary: "exit",
            known_values: {},
            missing_or_weak_values: [],
            candidate_features: [],
            recommendation: {},
            tone_constraints: [],
            do_not_say: [],
            evidence_used: [],
          },
        },
        note_information: {
          audience: "global_dispatcher",
          summary: "Le user veut parler.",
        },
      }),
    direct_effect_executor: (async (request: any) => {
      noRequestCalls.push(request);
      return { turn_frame: null };
    }) as any,
    visible_agent: (async () => "jamais appelé sur exit") as any,
  } as any);
  assertEquals(clean.status, "exit");
  assertEquals(noRequestCalls.length, 0);
});

Deno.test("la demande tactique immédiate livre un geste, pas une re-reco d'outil (paul-triflow r2 B01)", () => {
  const prompt = coachingDispatcherPromptForTest(
    {
      user_id: "user-test",
      request_id: "req-test",
      user_message: "Donne-moi un seul truc pour ce soir, pour pas rechuter dans le canapé.",
      recent_messages: [],
      previous_state: null,
      active_plan_items: [],
      turn_frame: null,
    } as any,
  );
  // Positif: le geste unique se livre, sans re-vendre le dispositif acté.
  assertEquals(prompt.includes("Demande TACTIQUE IMMEDIATE"), true);
  assertEquals(
    prompt.includes("le tour LIVRE le geste unique demande"),
    true,
  );
  assertEquals(
    prompt.includes(
      "Re-recommander de CONSTRUIRE l'outil deja handoffe sur cette demande est INTERDIT",
    ),
    true,
  );
  // Anti-faux-positif: la demande de méthode/outil garde la reco.
  assertEquals(
    prompt.includes(
      "une demande de METHODE ou d'OUTIL ('quel outil je devrais utiliser'",
    ),
    true,
  );
});

// ── P6-G (rose-hard18 B01-B03, eva-hard21 B05/B06) ──────────────────────────

Deno.test("contrat coaching: convergence, consent+slot, carte libre, composite, adequation 1er signal (P6-G)", () => {
  const prompt = coachingDispatcherPromptForTest(
    {
      user_id: "user-test",
      request_id: "req-test",
      user_message: "prépare-moi une carte pour samedi soir",
      recent_messages: [],
      previous_state: null,
      active_plan_items: [],
      turn_frame: null,
    } as any,
  );
  // rose B01: situation + moment nommés ⇒ proposition, plus de cadrage.
  assertStringIncludes(prompt, "CRITERE DE CONVERGENCE");
  assertStringIncludes(
    prompt,
    "la clarification est un outil d'entree, pas un mode de sejour",
  );
  // rose B02: consentement + slot in-turn consommés, jamais redemandés.
  assertStringIncludes(prompt, "CONSENTEMENT + SLOT DANS LE MEME TOUR");
  assertStringIncludes(
    prompt,
    "un slot fourni n'est jamais redemande, un consentement donne n'est jamais re-demande",
  );
  // rose B03: nature carte libre dite DANS le tour + operation_suggestion si
  // provisionné.
  assertStringIncludes(prompt, "CARTE LIBRE — durabilite annoncee DANS le tour");
  assertStringIncludes(
    prompt,
    "emets l'operation_suggestion vers le tool durable",
  );
  // eva B05: composite « deux X » = séquence, jamais re-narrowing après refus.
  assertStringIncludes(prompt, "DEMANDE COMPOSITE 'DEUX X'");
  assertStringIncludes(
    prompt,
    "la meme question re-posee apres refus est une violation de progression",
  );
  // eva B06: adéquation potion↔carte au premier signal.
  assertStringIncludes(prompt, "ADEQUATION AU PREMIER SIGNAL — potion vs carte");
});

// ── P7-E (nina-hard22 T7/T11) ────────────────────────────────────────────────

Deno.test("contrat coaching: co-demande transactionnelle (track, mémoire, statut) sort vers le global (P7-E)", () => {
  const prompt = coachingDispatcherPromptForTest(
    {
      user_id: "user-test",
      request_id: "req-test",
      user_message: "au fait j'ai réussi à boire mon verre d'eau ce matin",
      recent_messages: [],
      previous_state: null,
      active_plan_items: [],
      turn_frame: null,
    } as any,
  );
  assertStringIncludes(prompt, "CO-DEMANDE TRANSACTIONNELLE");
  // Les 3 intentions couvertes.
  assertStringIncludes(prompt, "REPORT DE COMPLETION");
  assertStringIncludes(prompt, "INTENTION MEMOIRE explicite");
  assertStringIncludes(prompt, "demande de STATUT/RECAP factuel");
  // Anti-faux-positif: le suivi de la technique en construction reste local.
  assertStringIncludes(
    prompt,
    "un report d'ESSAI de la technique en construction",
  );
});

// ── P8-G (alex-hard23 T7 / paul-untested22 T7) ───────────────────────────────

Deno.test("fenetre de rupture explicite: le mot de bascule n'est jamais disqualifie comme fragile (P8-G, alex-hard23 T7)", () => {
  const prompt = coachingDispatcherPromptForTest(
    {
      user_id: "user-test",
      request_id: "req-test",
      user_message:
        "je veux juste UN mot, un declencheur ultra court pour la seconde exacte ou je craque et rallume — pas tout un plan B",
      recent_messages: [],
      previous_state: null,
      active_plan_items: [],
      turn_frame: null,
    } as any,
  );
  // Positif: la disqualification est nommee interdite avec le verbatim.
  assertEquals(prompt.includes("DISQUALIFICATION INTERDITE"), true);
  assertEquals(
    prompt.includes(
      "sa pretendue fragilite n'est JAMAIS un motif de refus",
    ),
    true,
  );
  // Anti-faux-positif préservé: un simple blocage sans fenetre de rupture
  // garde le micro-cadre (defense/potion), la regle (b) reste en place.
  assertEquals(
    prompt.includes("piege MECANIQUE RECURRENT"),
    true,
  );
});

Deno.test("axe d'activation etat→potion: hypo ≠ apaisement, deux etats opposes = deux potions (P8-G, paul-untested22 T7)", () => {
  const prompt = coachingDispatcherPromptForTest(
    {
      user_id: "user-test",
      request_id: "req-test",
      user_message: "je suis tendu le jour et complement vide le soir, les deux",
      recent_messages: [],
      previous_state: null,
      active_plan_items: [],
      turn_frame: null,
    } as any,
  );
  assertEquals(prompt.includes("AXE D'ACTIVATION etat → potion"), true);
  assertEquals(
    prompt.includes("HYPO-activation") && prompt.includes("amour"),
    true,
  );
  assertEquals(
    prompt.includes(
      "replier le second etat sur la potion deja servie dans la journee est l'erreur observee",
    ),
    true,
  );
});
