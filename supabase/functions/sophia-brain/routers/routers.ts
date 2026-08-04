import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import { isAtLeast } from "../safety/safety_thresholds.ts";

type FlowInterventionContext = {
  last_flow_target?: string | null;
  turns_since_last_flow_exit?: number | null;
};

function safetyBlocksGlobalRoute(riskBand: RiskBand): boolean {
  return riskBand === "high" || riskBand === "critical";
}

// Preemption detresse (paul-r3 T12, BF-SAFETY-01 / BF-ROUTE-04): en dessous
// de high/critical, un tour porteur d'ideation passive ou de devalorisation
// (band >= medium) ne doit JAMAIS etre capture par une lane de recommandation
// produit/coaching — on ne vend pas un dispositif a quelqu'un en detresse.
// Le vocabulaire est canonique (contrat dispatcher regle 1d): le prompt
// decide du code, la route agit sur le fait. Les codes pregate equivalents
// sont inclus pour couvrir la frame neutre des flows locaux.
// P5-A: exporté — la lane direct-effect (operation_runtime_pipeline) consomme
// le même vocabulaire pour son verrou turn-level (source de vérité unique).
export const DISTRESS_IDEATION_REASON_CODES = new Set([
  "suicidal_ideation_passive",
  "suicidal_ideation",
  "explicit_suicidal_thoughts",
  "passive_disappear_ideation",
  "passive_absence_ideation",
  "self_harm_thoughts",
  "self_harm_intent",
]);

const DISTRESS_SUPPORT_REASON_CODES = new Set([
  "worthlessness_thoughts",
  "hopelessness",
]);

function distressCluster(args: {
  turn_frame: TurnFrame;
  safety_context_risk_band: RiskBand;
}): "ideation" | "support" | null {
  const bandAtLeastMedium =
    isAtLeast(args.turn_frame.safety.risk_band, "medium") ||
    isAtLeast(args.safety_context_risk_band, "medium");
  if (!bandAtLeastMedium) return null;
  const codes = (args.turn_frame.safety.reason_codes ?? []).map((code) =>
    String(code)
  );
  if (codes.some((code) => DISTRESS_IDEATION_REASON_CODES.has(code))) {
    return "ideation";
  }
  if (codes.some((code) => DISTRESS_SUPPORT_REASON_CODES.has(code))) {
    return "support";
  }
  return null;
}

function buildRouteDecision(args: {
  response_owner: RouteDecision["response_owner"];
  reason_code: string;
  selected_handler?: string;
  blocked_paths?: RouteDecision["blocked_paths"];
  direct_effects_to_run?: string[];
  active_owner?: string;
  arbitration_decision?: string;
  resume_policy?: string;
}): RouteDecision {
  const decision: RouteDecision = {
    route_version: "v1",
    response_owner: args.response_owner,
    blocked_paths: args.blocked_paths ?? [],
    direct_effects_to_run: args.direct_effects_to_run ?? [],
    reason_code: args.reason_code,
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  };
  if (args.arbitration_decision || args.active_owner || args.resume_policy) {
    decision.active_flow_arbitration = {
      decision: args.arbitration_decision ?? "global_route_default",
      active_owner: args.active_owner ?? "none",
      selected_owner: args.response_owner,
      resume_policy: args.resume_policy ?? "none",
      reason_code: args.reason_code,
    };
  }
  if (args.selected_handler !== undefined) {
    decision.selected_handler = args.selected_handler;
  }
  return decision;
}

/**
 * W4.7 — vocabulaire des effets que la lane sait EXÉCUTER.
 *
 * Les deux effets KEEL rejoignent la liste : sans eux, `direct_effects_to_run`
 * restait vide pour un élève KEEL et le gate n'était jamais consulté — un
 * « j'ai pris mon magnésium » émis correctement par le dispatcher mourait ici,
 * en silence, une couche avant l'exécuteur write-through déjà écrit.
 *
 * La liste est fermée et NOMMÉE : elle est le miroir routeur de
 * `KNOWN_DIRECT_EFFECT_TYPES` (routers/direct_effect_gate.ts). Un effet ajouté
 * au contrat sans être ajouté ici n'est pas « bloqué », il est INVISIBLE — la
 * classe de panne que W4.3 a déjà payée sur `effect_gate_orchestrator.ts`.
 */
export const ROUTER_RUNNABLE_DIRECT_EFFECT_TYPES: ReadonlySet<string> = new Set([
  "create_one_shot_reminder",
  "track_progress_plan_item",
  "log_protocol_event",
  "declare_deviation",
  // QA agent 4 — et l'avertissement du paragraphe ci-dessus s'est vérifié
  // séance tenante: `declare_safety_constraint` était déclaré au contrat,
  // accepté par le sanitizer, connu du gate, exécutable par sa lane... et
  // INVISIBLE, parce qu'il manquait dans CE Set. Deux tours réels ont émis
  // `direct_effects: []` sans le moindre message d'erreur avant que la cause
  // soit trouvée ici. Cinq points de contrôle, et le cinquième est muet.
  "declare_safety_constraint",
]);

function runnableDirectEffects(turnFrame: TurnFrame): string[] {
  return turnFrame.direct_effects
    .filter((effect) =>
      ROUTER_RUNNABLE_DIRECT_EFFECT_TYPES.has(effect.effect_type) &&
      effect.explicitness === "explicit" &&
      effect.target_status === "identified" &&
      (effect.confidence_band === "high" ||
        effect.confidence_band === "critical")
    )
    .map((effect) => effect.effect_type);
}

function blockedDirectEffects(
  turnFrame: TurnFrame,
): RouteDecision["blocked_paths"] {
  return turnFrame.direct_effects
    .filter((effect) =>
      effect.target_status !== "identified" ||
      effect.explicitness !== "explicit" ||
      effect.confidence_band === "low" ||
      effect.confidence_band === "medium"
    )
    .map((effect) => ({
      path: `direct_effects.${effect.effect_type}`,
      reason_code: effect.target_status === "identified"
        ? "direct_effect_not_strong_enough"
        : effect.target_status === "ambiguous"
        ? "target_ambiguous"
        : "target_missing",
    }));
}

function productHelpDetected(turnFrame: TurnFrame): boolean {
  return turnFrame.skill_signals.product_help?.detected === true &&
    turnFrame.skill_signals.product_help.confidence_band !== "low";
}

function coachingRecommendationDetected(turnFrame: TurnFrame): boolean {
  return turnFrame.skill_signals.coaching_recommendation?.detected === true &&
    turnFrame.skill_signals.coaching_recommendation.confidence_band !== "low";
}

// W2.A: `featureOpportunityDetected` supprimé avec la lane initiatives /
// coach_preferences (le signal n'existe plus dans le TurnFrame).

function planRealignmentDetected(turnFrame: TurnFrame): boolean {
  return turnFrame.skill_signals.plan_realignment?.detected === true &&
    turnFrame.skill_signals.plan_realignment.confidence_band !== "low";
}

// W4.4 — KEEL. Le signal SEUL ne suffit pas: la lane ne peut rien résoudre
// sans `plan_commitments` (swap_policy, food_group_ref, autonomy). Le gate
// `keel_student` est calculé par le RUNTIME depuis `profiles.keel_role`,
// jamais lu dans le turn_frame — même doctrine que le plancher TCA: ce qui
// OUVRE une lane ne transite pas par le LLM du dispatcher.
function planQuestionDetected(turnFrame: TurnFrame): boolean {
  return turnFrame.skill_signals.plan_question?.detected === true &&
    turnFrame.skill_signals.plan_question.confidence_band !== "low";
}

// Entrée présence CONSERVATRICE: signal explicite ET confiance forte. La
// règle des deux tours (un signal moyen n'entre qu'en se répétant) est portée
// par la calibration de confidence du dispatcher (il voit recent_messages),
// pas par un état candidat threadé ici. Un tour classé comme mouvement de
// SORTIE (tool_pull/closure/topic_change) n'ouvre jamais un flow présence.
function presenceEntryEligible(turnFrame: TurnFrame): boolean {
  const signal = turnFrame.skill_signals.presence_conversation;
  if (signal?.detected !== true) return false;
  if (
    signal.confidence_band !== "high" && signal.confidence_band !== "critical"
  ) return false;
  const kind = signal.context?.kind ?? "maintain";
  return kind === "maintain";
}

function activeConversationSkillId(activeSkillState: unknown): string {
  const record = activeSkillState && typeof activeSkillState === "object" &&
      !Array.isArray(activeSkillState)
    ? activeSkillState as Record<string, unknown>
    : {};
  return String(record.skill_id ?? "").trim();
}

function isActiveConversationSkill(
  activeSkillState: unknown,
  skillId:
    | "safety_crisis"
    | "disordered_eating_guard"
    | "product_help"
    | "coaching_recommendation"
    | "plan_realignment"
    | "daily_action_coaching_recommendation_v1"
    | "weekly_adaptive_review_v1"
    | "winback_reengagement_v1"
    | "presence_conversation",
): boolean {
  const record = activeSkillState && typeof activeSkillState === "object" &&
      !Array.isArray(activeSkillState)
    ? activeSkillState as Record<string, unknown>
    : {};
  return activeConversationSkillId(activeSkillState) === skillId &&
    String(record.status ?? "active").trim() !== "closed";
}

export function runConversationRouters(input: {
  turn_frame: TurnFrame;
  active_skill_state?: unknown;
  flow_intervention_context?: FlowInterventionContext;
  safety_context_risk_band: RiskBand;
  // Kill-switch du flow présence (SOPHIA_PRESENCE_FLOW_ENABLED). Gate l'ENTRÉE
  // uniquement; la continuation d'un flow déjà entré reste possible.
  presence_flow_enabled?: boolean;
  // W3.2 — Plancher TCA. Calculé par le RUNTIME depuis la base
  // (`_shared/keel/restriction_guard.ts`), JAMAIS lu dans le turn_frame : le
  // turn_frame est écrit par le LLM du dispatcher, et l'entrée de ce flow ne
  // doit pas transiter par un modèle. Absent ⇒ plancher non armé (W4 câble le
  // calcul; l'ordre des branches ci-dessous est déjà définitif).
  restriction_guard?: {
    restriction_flag: boolean;
    trigger_codes?: string[];
  } | null;
  // W4.4 — `profiles.keel_role === 'student'`, lu en base par le runtime.
  // Absent/false ⇒ la lane plan_question n'existe pas pour ce tour (le legacy
  // n'a ni commitments ni swap_policy: il n'y aurait rien à résoudre).
  keel_student?: boolean;
}): RouteDecision {
  void input.flow_intervention_context;

  const riskBand = input.turn_frame.safety.risk_band;
  const directEffectsToRun = runnableDirectEffects(input.turn_frame);
  const blockedPaths = blockedDirectEffects(input.turn_frame);
  if (
    safetyBlocksGlobalRoute(riskBand) ||
    safetyBlocksGlobalRoute(input.safety_context_risk_band)
  ) {
    // P5-A (paul-p4verify T12): plus AUCUN carve-out rappel à high/critical.
    // L'exception V5-1 (rappel bénin explicite servi) ne vit QUE sur la
    // branche distress_support (medium non-crise) plus bas. Ici, le rappel
    // demandé est DIFFÉRÉ honnêtement par la lane (safety_crisis_deferred +
    // persistance __safety_deferred_reminder pour re-serve post-crise),
    // jamais committé — parité avec les branches active_safety_crisis et
    // distress_ideation (P3-A).
    return buildRouteDecision({
      response_owner: "safety",
      selected_handler: "safety_crisis",
      direct_effects_to_run: [],
      reason_code: "safety_high_critical_priority",
      blocked_paths: [
        ...blockedPaths,
        ...directEffectsToRun
          .map((effect) => ({
            path: `direct_effects.${effect}`,
            reason_code: "safety_priority",
          })),
        { path: "product_help", reason_code: "safety_priority" },
        {
          path: "coaching_recommendation",
          reason_code: "safety_priority",
        },
        {
          path: "plan_realignment",
          reason_code: "safety_priority",
        },
        { path: "normal_reply", reason_code: "safety_priority" },
      ],
    });
  }

  if (
    isActiveConversationSkill(input.active_skill_state, "safety_crisis")
  ) {
    // P3-A (alex-safety-escalation R1-B01): AUCUN effet durable pendant une
    // crise active — l'exception V5-1 (rappel bénin) ne vaut QUE pour la
    // détresse medium NON-crise (branche distress_support ci-dessous). Un
    // rappel committé au milieu d'une crise suicidaire est le bug observé ;
    // le runtime rend un différé honnête (safety_crisis_deferred), jamais un
    // commit ni une confirmation. Parité avec track_progress (déjà bloqué).
    return buildRouteDecision({
      response_owner: "safety",
      selected_handler: "safety_crisis",
      direct_effects_to_run: [],
      blocked_paths: [
        ...blockedPaths,
        ...directEffectsToRun.map((effect) => ({
          path: `direct_effects.${effect}`,
          reason_code: "active_safety_priority",
        })),
        { path: "product_help", reason_code: "active_safety_priority" },
        {
          path: "coaching_recommendation",
          reason_code: "active_safety_priority",
        },
        {
          path: "plan_realignment",
          reason_code: "active_safety_priority",
        },
        { path: "normal_reply", reason_code: "active_safety_priority" },
      ],
      active_owner: "safety_crisis",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: "active_safety_crisis",
    });
  }

  const distress = distressCluster(input);
  if (distress === "ideation") {
    // Ideation passive a band medium: le chemin safety possede le tour
    // (meme contrat que high/critical), avec desescalade geree par le flow.
    // P3-A: même parité qu'en crise active — zéro effet durable, différé
    // honnête (le cas exclu de V5-1).
    return buildRouteDecision({
      response_owner: "safety",
      selected_handler: "safety_crisis",
      direct_effects_to_run: [],
      reason_code: "distress_ideation_safety_priority",
      blocked_paths: [
        ...blockedPaths,
        ...directEffectsToRun.map((effect) => ({
          path: `direct_effects.${effect}`,
          reason_code: "distress_ideation_safety_priority",
        })),
        { path: "product_help", reason_code: "distress_ideation_safety_priority" },
        {
          path: "coaching_recommendation",
          reason_code: "distress_ideation_safety_priority",
        },
        {
          path: "plan_realignment",
          reason_code: "distress_ideation_safety_priority",
        },
        { path: "normal_reply", reason_code: "distress_ideation_safety_priority" },
      ],
    });
  }
  // W3.2 — TCA. Les DEUX branches ci-dessous sont placées ICI, et cette place
  // est le fond du lot : sous les trois branches safety (haute/critique, crise
  // active, idéation medium) parce que rien n'est plus urgent qu'un danger
  // immédiat pour la vie ; AU-DESSUS de tout le reste parce que toutes les
  // lanes suivantes (soutien, présence, produit, coaching, réalignement de
  // plan) sont des lanes de PRESSION — et la pression d'adhérence est
  // exactement ce que le plancher suspend.
  //
  // Continuation d'abord : un flow ouvert n'est pas lâché parce que le
  // plancher n'a pas été recalculé ce tour-ci.
  if (
    isActiveConversationSkill(input.active_skill_state, "disordered_eating_guard")
  ) {
    return buildRouteDecision({
      response_owner: "disordered_eating_guard",
      selected_handler: "disordered_eating_guard",
      // Zéro effet durable : une coche de progrès ou un rappel de conformité
      // committé pendant ce flow EST la pression d'adhérence. Parité avec les
      // branches safety (P3-A), pas de carve-out.
      direct_effects_to_run: [],
      blocked_paths: [
        ...blockedPaths,
        ...directEffectsToRun.map((effect) => ({
          path: `direct_effects.${effect}`,
          reason_code: "active_restriction_flag_priority",
        })),
        { path: "product_help", reason_code: "active_restriction_flag_priority" },
        {
          path: "coaching_recommendation",
          reason_code: "active_restriction_flag_priority",
        },
        {
          path: "plan_realignment",
          reason_code: "active_restriction_flag_priority",
        },
        { path: "normal_reply", reason_code: "active_restriction_flag_priority" },
      ],
      active_owner: "disordered_eating_guard",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: "active_disordered_eating_guard",
    });
  }

  // Entrée : UNIQUEMENT le plancher déterministe. Aucun signal du dispatcher
  // n'ouvre ce flow — il n'existe volontairement pas de
  // `skill_signals.disordered_eating_guard`, sans quoi un modèle pourrait à la
  // fois l'ouvrir et le refuser.
  if (input.restriction_guard?.restriction_flag === true) {
    return buildRouteDecision({
      response_owner: "disordered_eating_guard",
      selected_handler: "disordered_eating_guard",
      direct_effects_to_run: [],
      reason_code: "restriction_flag_priority",
      blocked_paths: [
        ...blockedPaths,
        ...directEffectsToRun.map((effect) => ({
          path: `direct_effects.${effect}`,
          reason_code: "restriction_flag_priority",
        })),
        { path: "product_help", reason_code: "restriction_flag_priority" },
        {
          path: "coaching_recommendation",
          reason_code: "restriction_flag_priority",
        },
        { path: "plan_realignment", reason_code: "restriction_flag_priority" },
        {
          path: "presence_conversation",
          reason_code: "restriction_flag_priority",
        },
        { path: "normal_reply", reason_code: "restriction_flag_priority" },
      ],
      arbitration_decision: "enter_disordered_eating_guard",
      resume_policy: "enter_fresh",
    });
  }

  if (distress === "support") {
    // Devalorisation/desespoir sans ideation: tour de SOUTIEN (companion),
    // pas de crise (pas de hotline), et surtout aucune lane de recommandation
    // — ni flow actif ni signal du tour ne peut pitcher un dispositif ici.
    // Les direct effects legitimes (report de progres, rappel) restent
    // executables: bloquer une ecriture demandee recreerait un chemin muet.
    return buildRouteDecision({
      response_owner: "normal_reply",
      direct_effects_to_run: directEffectsToRun,
      reason_code: "distress_support_priority",
      blocked_paths: [
        ...blockedPaths,
        { path: "product_help", reason_code: "distress_support_priority" },
        {
          path: "coaching_recommendation",
          reason_code: "distress_support_priority",
        },
        {
          path: "plan_realignment",
          reason_code: "distress_support_priority",
        },
      ],
    });
  }

  // Flow présence actif: on continue TOUJOURS ici (collant). Les sorties
  // (tool_pull, topic_change, closure, expiration) sont décidées par le skill
  // lui-même (statut != continue → état effacé → re-dispatch global au tour
  // suivant, charte cmd 17). Les effets directs (rappel, coche) passent sans
  // fermer le flow (parenthèse tâche).
  if (
    isActiveConversationSkill(input.active_skill_state, "presence_conversation")
  ) {
    return buildRouteDecision({
      response_owner: "presence_conversation",
      selected_handler: "presence_conversation",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      active_owner: "presence_conversation",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: directEffectsToRun.length > 0
        ? "active_presence_conversation_with_direct_effects"
        : "active_presence_conversation",
    });
  }

  if (
    isActiveConversationSkill(input.active_skill_state, "product_help")
  ) {
    return buildRouteDecision({
      response_owner: "product_help",
      selected_handler: "product_help",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      active_owner: "product_help",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: directEffectsToRun.length > 0
        ? "active_product_help_with_direct_effects"
        : "active_product_help",
    });
  }

  // Flow réengagement winback actif (armé à l'envoi d'une touche winback,
  // collant après la première réponse). Pas d'entrée fraîche par signal :
  // seul l'armement hors conversation ouvre ce flow ; ses sorties passent par
  // exit_to_global_dispatcher (re-dispatch le même tour).
  if (
    isActiveConversationSkill(
      input.active_skill_state,
      "winback_reengagement_v1",
    )
  ) {
    return buildRouteDecision({
      response_owner: "winback_reengagement_v1",
      selected_handler: "winback_reengagement_v1",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      active_owner: "winback_reengagement_v1",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: directEffectsToRun.length > 0
        ? "active_winback_reengagement_with_direct_effects"
        : "active_winback_reengagement",
    });
  }

  if (
    isActiveConversationSkill(
      input.active_skill_state,
      "weekly_adaptive_review_v1",
    )
  ) {
    return buildRouteDecision({
      response_owner: "weekly_adaptive_review_v1",
      selected_handler: "weekly_adaptive_review_v1",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      active_owner: "weekly_adaptive_review_v1",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: directEffectsToRun.length > 0
        ? "active_weekly_adaptive_review_with_direct_effects"
        : "active_weekly_adaptive_review",
    });
  }

  if (
    isActiveConversationSkill(
      input.active_skill_state,
      "daily_action_coaching_recommendation_v1",
    )
  ) {
    return buildRouteDecision({
      response_owner: "daily_action_coaching_recommendation_v1",
      selected_handler: "daily_action_coaching_recommendation_v1",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      active_owner: "daily_action_coaching_recommendation_v1",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: directEffectsToRun.length > 0
        ? "active_daily_action_coaching_recommendation_with_direct_effects"
        : "active_daily_action_coaching_recommendation",
    });
  }

  if (
    isActiveConversationSkill(
      input.active_skill_state,
      "coaching_recommendation",
    )
  ) {
    return buildRouteDecision({
      response_owner: "coaching_recommendation",
      selected_handler: "coaching_recommendation",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      active_owner: "coaching_recommendation",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: directEffectsToRun.length > 0
        ? "active_coaching_recommendation_with_direct_effects"
        : "active_coaching_recommendation",
    });
  }

  if (
    isActiveConversationSkill(input.active_skill_state, "plan_realignment")
  ) {
    return buildRouteDecision({
      response_owner: "plan_realignment",
      selected_handler: "plan_realignment",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      active_owner: "plan_realignment",
      arbitration_decision: "continue_active",
      resume_policy: "resume_active",
      reason_code: directEffectsToRun.length > 0
        ? "active_plan_realignment_with_direct_effects"
        : "active_plan_realignment",
    });
  }

  // W2.A: branche de CONTINUATION `feature_opportunity` retirée (l'ordre des
  // branches restantes est inchangé). Un état de flow résiduel en base ne peut
  // plus reprendre la main : `active_flow_state.ts` ne le reconnaît plus, le
  // tour repart au dispatcher global.

  // ENTRÉE présence: uniquement quand AUCUN flow local n'est actif (les
  // continuations ci-dessus gardent la main sinon — pas de préemption
  // parent→enfant). Un flow actif qui doit rendre la main le décide lui-même
  // (exit_to_global_dispatcher → re-dispatch global le même tour); l'entrée se
  // fait alors ici, état purgé. Prioritaire sur les signaux frais produit/
  // coaching: un dépôt discursif fort prime sur un signal levier concurrent
  // (le dispatcher n'émet presence high/critical que sur intention discursive).
  if (
    input.presence_flow_enabled === true &&
    presenceEntryEligible(input.turn_frame)
  ) {
    return buildRouteDecision({
      response_owner: "presence_conversation",
      selected_handler: "presence_conversation",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      arbitration_decision: "enter_presence",
      resume_policy: "enter_fresh",
      reason_code: "presence_conversation_entry",
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // KEEL — LES TROIS LANES B2C SONT FERMÉES À UN ÉLÈVE DE COACH.
  //
  // MESURÉ, pas déduit (QA WEB L1-c, run réel): un élève KEEL dont le coach
  // interdit explicitement le comptage de calories demande « Should I start
  // counting my calories? ». Le dispatcher classe
  // `coaching_recommendation.detected=true` et la lane répond
  // « What's the situation you want to get unstuck from, exactly? » — une
  // relance générique, sans un mot de la position du coach.
  //
  // POURQUOI C'EST STRUCTUREL ET PAS UNE ERREUR DE MODÈLE. La doctrine du
  // coach n'est injectée qu'à UN endroit — `withKeelDoctrineBlock`, sur le
  // contexte du composeur (`runAgentAndVerify`) — alors que
  // `applyKeelOutputLocks` VÉRIFIE la sortie sur SIX chemins. Ces trois lanes
  // sont donc verrouillées sur une doctrine qu'elles n'ont jamais lue: elles
  // peuvent contredire le coach, et le verrou ne rattrape que les formes de
  // surface qu'il connaît. Un plancher qui laisse la lane la plus bavarde
  // parler à la place du coach n'est pas un plancher.
  //
  // Elles sont B2C DE PART EN PART, en plus: leurs prompts sont en français,
  // ils parlent de potions, de leviers et de surfaces produit qui n'existent
  // pas dans KEEL. Les fermer ne retire donc aucune capacité à un élève — ça
  // lui rend le composeur, qui porte la doctrine ET le verrou.
  //
  // FERMÉES À L'ENTRÉE SEULEMENT. Les branches de CONTINUATION plus haut
  // restent intactes: un flow déjà ouvert (compte migré, état résiduel) doit
  // pouvoir se refermer proprement plutôt que d'être coupé au milieu. Comme
  // un élève KEEL ne peut plus en ouvrir, la continuation ne se déclenchera
  // pour lui qu'une fois, sur un état antérieur à ce correctif.
  //
  // `keel_student` vient du RUNTIME (`profiles.keel_role`), jamais du LLM du
  // dispatcher — même doctrine que le plancher TCA et que `plan_question`.
  // ══════════════════════════════════════════════════════════════════════
  const keelStudent = input.keel_student === true;

  if (!keelStudent && productHelpDetected(input.turn_frame)) {
    return buildRouteDecision({
      response_owner: "product_help",
      selected_handler: "product_help",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      reason_code: directEffectsToRun.length > 0
        ? "product_help_with_direct_effects"
        : "product_help_signal",
    });
  }

  if (!keelStudent && coachingRecommendationDetected(input.turn_frame)) {
    return buildRouteDecision({
      response_owner: "coaching_recommendation",
      selected_handler: "coaching_recommendation",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      reason_code: "coaching_recommendation_signal",
    });
  }

  // W4.4 — plan_question AVANT plan_realignment, et ce placement est le fond
  // du lot. « je peux remplacer le riz par des pâtes ? » capté par
  // plan_realignment renvoie l'élève vers un écran d'ajustement de plan pour
  // une question que le coach a DÉJÀ tranchée en écrivant `autonomy` et
  // `swap_policy` — c'est la classe de misroute déjà payée sur les récaps
  // read-only. En dessous de product_help et coaching_recommendation en
  // revanche: ces deux-là sont des PULL explicites (comprendre le produit,
  // demander un levier), plan_question est le défaut pour une question sur la
  // prescription elle-même. Lane NON collante: aucune branche de continuation
  // plus haut, la question se répond en un tour.
  if (keelStudent && planQuestionDetected(input.turn_frame)) {
    return buildRouteDecision({
      response_owner: "plan_question",
      selected_handler: "plan_question",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      reason_code: "plan_question_signal",
    });
  }

  // Fermée pour la même raison que les deux précédentes, et pour une de plus:
  // `plan_realignment` renvoie vers l'écran d'ajustement de plan B2C. Un récap
  // read-only y a déjà été capté une fois (défaut connu), et un élève KEEL n'a
  // pas d'écran d'ajustement — sa semaine se compose, elle ne se réaligne pas.
  if (!keelStudent && planRealignmentDetected(input.turn_frame)) {
    return buildRouteDecision({
      response_owner: "plan_realignment",
      selected_handler: "plan_realignment",
      direct_effects_to_run: directEffectsToRun,
      blocked_paths: blockedPaths,
      reason_code: "plan_realignment_signal",
    });
  }

  // W2.A: branche d'ENTRÉE `feature_opportunity` retirée — elle était la
  // dernière avant le repli normal_reply, l'ordre des branches précédentes est
  // donc strictement conservé.

  return buildRouteDecision({
    response_owner: "normal_reply",
    direct_effects_to_run: directEffectsToRun,
    blocked_paths: blockedPaths,
    reason_code: directEffectsToRun.length > 0
      ? "direct_effects_then_normal_reply"
      : "normal_reply_default",
  });
}
