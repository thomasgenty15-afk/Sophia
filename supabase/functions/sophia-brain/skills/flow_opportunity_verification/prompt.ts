export const FLOW_OPPORTUNITY_LOCAL_DISPATCHER_PROMPT_VERSION =
  "flow_opportunity_verification_local_dispatcher_v1_2026_06_08";

export function flowOpportunityLocalDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow `flow_opportunity_verification`.",
    "Ton role est de verifier une opportunite deja choisie par le dispatcher global, pas de repicker toutes les opportunites.",
    "Tu gardes l'ancre de confirmation initiale et tu conserves target_flow, target_context et confirmation_anchor.",
    "Tu peux appeler `get_info_product` pour un aller-retour produit via product_help; product_help ne devient jamais owner final.",
    "Tu peux appeler `get_info_db` pour un aller-retour DB/status via status_recap; status_recap ne devient pas owner final.",
    "Tu lances le flow cible seulement si le user accepte suffisamment l'offre courante ou donne une commande explicite pour le target_flow.",
    "Tu retournes au dispatcher global uniquement avec `exit_to_global_dispatcher` et un exit_memo complet.",
    "Tu ne fais aucun write DB, ne crees aucun executedTools, aucun committed_effects, aucun pending executable legacy.",
    "Tu ne dois jamais utiliser de regex ou mots-cles comme decision metier; raisonne depuis le contexte fourni et l'ancre.",
    "Priorites: safety, commande explicite, question produit inline, acceptation/refus/revision, repetition, sortie globale.",
    "Retourne uniquement un JSON strict conforme au contrat fourni, sans markdown.",
  ].join("\n");
}

export function buildFlowOpportunityLocalDispatcherUserPrompt(input: {
  user_message: string;
  active_state: unknown;
  initial_payload: unknown;
  recent_user_messages: string[];
  subskill_history: unknown[];
  supported_target_flows: string[];
  safety: unknown;
}): string {
  return JSON.stringify({
    task: "dispatch_flow_opportunity_verification",
    current_user_message: input.user_message,
    active_state: input.active_state,
    initial_payload: input.initial_payload,
    recent_user_messages: input.recent_user_messages.slice(-5),
    subskill_history: input.subskill_history,
    supported_target_flows: input.supported_target_flows,
    safety: input.safety,
    required_json_shape: {
      local_action:
        "offer_opportunity|accept_opportunity|decline_opportunity|get_info_product|return_from_get_info_product|get_info_db|repeat_offer|revise_focus|correct_target_flow|launch_target_flow|direct_command_interrupt|unsupported_request_inside_flow|stale_or_already_answered|cancel_flow|exit_to_global_dispatcher|safety_preempt",
      confidence: "low|medium|high",
      risk_score: 0,
      opportunity: {
        opportunity_id: "string",
        target_flow: "string",
        target_action: "string",
        confirmation_anchor_still_valid: true,
        reason: "string",
      },
      target_flow_input: {
        focus: ["string"],
        surface: "string|null",
        seed_context: {},
        origin_evidence: ["string"],
      },
      subskill_call: {
        needed: false,
        skill_id: "product_help|status_recap|null",
        reason: "string|null",
        context_for_subskill: {},
      },
      visible_task: { kind: "string", instruction: "string" },
      state_patch: {
        status: "string",
        target_flow: "string",
        target_context: {},
        confirmation_anchor: {},
        subskill_history_append: {},
      },
      exit_memo: {
        needed: false,
        reason:
          "topic_change|cancelled|direct_command_other_flow|unsupported|stale|safety|none",
        flow_summary: "string|null",
        original_opportunity_id: "string|null",
        target_flow: "string|null",
        target_context: {},
        handoff_hint_for_global_dispatcher: "string|null",
        same_user_message_should_be_reprocessed: false,
      },
      evidence: ["string"],
    },
    action_guidance: {
      product_question_inside_flow:
        "local_action=get_info_product, subskill_call.skill_id=product_help, visible_task.kind=none",
      db_status_question_inside_flow:
        "local_action=get_info_db, subskill_call.skill_id=status_recap, visible_task.kind=none",
      late_yes:
        "local_action=launch_target_flow if confidence medium/high and anchor still valid",
      refusal: "local_action=decline_opportunity",
      topic_change:
        "local_action=exit_to_global_dispatcher with same_user_message_should_be_reprocessed=true when useful",
    },
  });
}
