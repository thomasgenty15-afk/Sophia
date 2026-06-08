# Flow Presentation Catalog

## Scope

This catalog lists flows that already have, or are explicitly planned to have,
a local dispatcher or local owner able to suspend the global dispatcher while
the flow is active.

Reference doctrine:

- `Note d'information`
- `00-architecture-doctrine.md`
- `01-global-runtime.md`
- `07-active-handoff-arbitration.md`

Cross-dispatcher rule:

- Any ownership transfer from one dispatcher to another must carry a
  non-visible `note_information`.
- The note helps the next dispatcher fill its JSON from context; it is never a
  user-visible message and never a deterministic routing shortcut.
- Internal `select_state_potion -> potion subskill` routing remains the explicit
  specialized exception: it can keep its current structured subskill contract.

Canonical note shape:

```json
{
  "source_flow_presentation": "Two-line maximum presentation of the flow being left.",
  "handoff_context_for_next_dispatcher": "Useful context for the next dispatcher JSON."
}
```

Allowed non-visible metadata:

```json
{
  "source_flow_id": "string",
  "target_dispatcher": "global|safety_crisis|select_state_potion|product_help|status_recap|...",
  "handoff_reason": "topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request|...",
  "target_local_dispatcher_hint": "string|null",
  "risk_score": 0
}
```

Action taxonomy used below:

- `stop_local / acknowledge / no handoff this turn`: the local flow closes,
  pauses, or acknowledges the user without reprocessing the same message through
  global.
- `exit_to_global_dispatcher`: the same user message may be reanalyzed by the
  global dispatcher, with `note_information`.
- `handoff_to_local_dispatcher`: ownership transfers directly to another local
  dispatcher, with `note_information`.
- `safety_preempt`: safety takes priority, with `note_information` for
  `safety_crisis`.
- `inline_tool_roundtrip`: a parent flow calls `product_help` or
  `status_recap` for information, then keeps ownership unless safety or an
  explicit exit changes that.

Important stop-local rule:

If the user says something like "laisse tomber", "arrete tes questions", or
"ca me saoule tes questions" without a clear new topic, this is not
automatically `exit_to_global_dispatcher`. The local dispatcher can return a
local stop/cancel/ack action, close or defer its state, and avoid calling global
on the same turn.

## adjust_plan_item

- Presentation: Helps prepare a Plan adjustment to resume in the Plan surface.
  It never modifies the plan from chat.
- Type: `tool_flow`, `platform_handoff_skill`.
- Local dispatcher: `adjust_plan_item.local_dispatcher` exists in docs and code.
- Active state key: `__adjust_plan_handoff_state` / active platform handoff
  frame loaded by `adjust_plan_item/state.ts`.
- Active state status: `collecting|clarifying|handoff_ready|handoff_delivered|revising|apply_attempt|cancelled|exit_to_global|safety`.
- Can handoff to:
  - global dispatcher: yes, for topic change, explicit other tool, status,
    product help, preference update, normal coaching.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: planned/possible via local exit today; should become
    inline if question is only product info.
  - status_recap inline: planned/possible via local exit today; should become
    inline if question is only DB status.
  - select_state_potion: yes via global or direct local handoff when explicit
    potion ownership is desired.
- Stop local actions: `cancel_flow`, `apply_attempt`, `repeat_plan_handoff`,
  `explain_handoff`, `platform_destination_followup`.
- Exits without handoff: local cancel/ack closes or marks cancelled and should
  not invoke global unless the same message contains a separate clear topic.
- Required note_information on ownership transfer: source should summarize the
  Plan scope, requested adjustment, constraints, last handoff summary, and
  no-chat-mutation status.
- Notes already present or missing: `exit_memo` exists; `note_information`
  should be added/generalized for every global/local transfer.
- Missing work: add explicit inline info roundtrip and generalized
  `note_information`.

## prepare_attack_card

- Presentation: Helps prepare an attack card to resume in the product surface.
  It chooses/validates technique and fields but never creates the card.
- Type: `tool_flow`, `platform_handoff_skill`.
- Local dispatcher: `prepare_attack_card.local_dispatcher` exists in docs and
  code.
- Active state key: `__active_attack_card_handoff`.
- Active state status: `target_intake|blocker_intake|technique_selection|platform_field_intake|handoff_ready|handoff_delivered|exit`.
- Can handoff to:
  - global dispatcher: yes, for topic change, cancellation with new topic, or
    explicit request for another owner.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: yes, for product/navigation questions during card prep.
  - status_recap inline: yes, for DB/status questions about existing objects.
  - select_state_potion: yes, when user asks for a potion instead of card prep.
- Stop local actions: `cancel_flow`, `apply_attempt`,
  `platform_destination_followup`, `repeat_handoff`.
- Exits without handoff: `cancel_flow` can close locally with an ack; a bare
  "laisse tomber" should not force global.
- Required note_information on ownership transfer: source should include target
  action, blocker, chosen/proposed technique, locked fields, current stage, and
  no-card-created invariant.
- Notes already present or missing: `exit_memo` exists; inline info fields are
  present in router paths; generalized `note_information` missing.
- Missing work: make every local exit/inline target receive the canonical note.

## prepare_defense_card

- Presentation: Helps prepare a defense card for a moment of risk or derailment.
  It fills/supports the platform handoff but never creates the card.
- Type: `tool_flow`, `platform_handoff_skill`.
- Local dispatcher: `prepare_defense_card.local_dispatcher` exists in docs and
  code.
- Active state key: `__active_tool_skill_intake` when
  `operation_type=prepare_defense_card`.
- Active state status: `tool_fit|attachment_intake|risk_intake|support_need_intake|handoff_ready|handoff_delivered|exit`.
- Can handoff to:
  - global dispatcher: yes, for topic change or another explicit owner.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: yes, for product/navigation explanation.
  - status_recap inline: yes, for DB/status questions.
  - select_state_potion: yes, when the user shifts from card prep to state
    support.
  - prepare_attack_card: yes, when local tool-fit resolves to attack instead of
    defense; this should be a local handoff or global exit with note.
- Stop local actions: `cancel_flow`, `apply_attempt`,
  `platform_destination_followup`, `repeat_handoff`.
- Exits without handoff: local cancel/ack closes the card prep; no global unless
  there is a distinct new request.
- Required note_information on ownership transfer: source should include
  defense/attack fit, attachment, risk situation, support_need, ambiguity, and
  no-card-created invariant.
- Notes already present or missing: `exit_memo` exists; router has inline info
  paths; generalized `note_information` missing.
- Missing work: canonicalize attack-card handoff and inline info notes.

## select_state_potion

- Presentation: Helps recommend a state potion or support option and redirects
  to the Etat-Potions surface. It never launches or schedules a potion.
- Type: `tool_flow`, `platform_handoff_skill`.
- Local dispatcher: `select_state_potion.local_flow_dispatcher` exists in docs
  and code.
- Active state key: `__active_tool_skill_intake` when
  `operation_type=select_state_potion`.
- Active state status: `collecting|clarifying|handoff_ready|handoff_delivered|revise_handoff|repeat_handoff|apply_attempt|cancelled|topic_change|blocked`.
- Can handoff to:
  - global dispatcher: yes, for topic change, status DB, one-shot, track
    progress, or explicit other tool.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: yes, for product/navigation questions.
  - status_recap inline: yes, for DB/status questions.
  - select_state_potion subskill: yes, internal exception only; potion router
    and detail subskills keep their specialized structured contract.
- Stop local actions: `cancel_flow`, `apply_attempt`, `repeat_handoff`,
  `platform_destination_followup`, `unclear`.
- Exits without handoff: "pas de potion" or "laisse tomber" can cancel/block
  locally without global if no new topic exists.
- Required note_information on ownership transfer: source should include chosen
  potion/state summary, collected fields, weak/missing fields, constraints like
  `no_followup`, and no-potion-session invariant.
- Notes already present or missing: can receive `operation_input.context.handoff_summary`;
  demotivation bridge already carries note; generalized note still missing for
  all exits.
- Missing work: accept and persist canonical note for every inbound ownership
  transfer; keep internal subskill exception explicit.

## create_recurring_reminder

- Presentation: Prepares a recurring reminder handoff for the Recurring
  Reminders surface. It never creates recurring reminders from chat.
- Type: `tool_flow`, `platform_handoff_skill`.
- Local dispatcher: planned/partial; no dedicated local dispatcher prompt found,
  but intake/router/state own active handoff continuation.
- Active state key: `__recurring_reminder_handoff_state`.
- Active state status: `collecting|clarifying|handoff_ready|handoff_delivered|revise_handoff|repeat_handoff|apply_attempt|handoff_to_one_shot|cancelled|topic_change|blocked`.
- Can handoff to:
  - global dispatcher: yes, for topic change or unsupported request.
  - safety_crisis: yes through global/safety pregate.
  - product_help inline: not yet explicit; should be available for product
    explanation.
  - status_recap inline: not yet explicit; status questions should go to
    status_recap.
  - one_shot_reminder direct effect: yes, via `handoff_to_one_shot`.
- Stop local actions: `cancelled`, `blocked`, `apply_attempt`,
  `repeat_handoff`.
- Exits without handoff: cancel/no-create/draft-only can close locally without
  global.
- Required note_information on ownership transfer: source should include
  recurring cadence/content/binding collected so far, missing decisions, and
  no-chat-mutation status.
- Notes already present or missing: handoff state exists; canonical
  cross-dispatcher note and local dispatcher prompt are missing.
- Missing work: add dedicated prompt or document current intake as local owner;
  add notes for one-shot/global/status/product transfers.

## update_coach_preferences

- Presentation: Updates a small closed set of durable coach preferences when
  clear and supported. It can also handle punctual or unsupported preference
  requests without writing.
- Type: `tool_flow`, write-skill local.
- Local dispatcher: `update_coach_preferences.local_dispatcher` exists in docs
  and code.
- Active state key: `__coach_preference_flow_state_v1` and legacy
  `__coach_preference_handoff_state_v1`.
- Active state status: `collecting|proposed|write_ready|written|blocked|cancelled|exit`.
- Can handoff to:
  - global dispatcher: yes, for topic change or unsupported other flow.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: yes, `visible_task.kind=get_info_product`.
  - status_recap inline: yes, `visible_task.kind=get_info_db`.
  - select_state_potion: yes via global/local handoff if user asks state
    support instead of preferences.
- Stop local actions: `cancel_flow`, `punctual_instruction`,
  `unsupported_preference`, `repeat_saved_preferences`.
- Exits without handoff: fatigue with questions can be handled locally if it is
  a preference intent; "stop questions" may write/defer locally rather than
  global.
- Required note_information on ownership transfer: source should include current
  setting/value proposal, committed preference keys if any, unsupported parts,
  and whether DB write committed.
- Notes already present or missing: inline routes exist; canonical
  `note_information` missing.
- Missing work: add canonical note to inline calls and global/safety exits.

## whatsapp_onboarding

- Presentation: Manages WhatsApp onboarding, plan readiness, preference
  calibration, and first-topic handoff. It blocks normal product exits until
  the plan is ready.
- Type: `tool_flow`, onboarding flow.
- Local dispatcher: `whatsapp_onboarding.local_dispatcher` exists in docs and
  code under `whatsapp-webhook/onboarding`.
- Active state key: WhatsApp onboarding state and local onboarding state in the
  webhook runtime.
- Active state status: `awaiting_plan_finalization|awaiting_plan_finalization_support|onboarding_pref_tone|onboarding_pref_challenge|onboarding_pref_questions|onboarding_plan_creation_feedback|onboarding_topic_choice`.
- Can handoff to:
  - global dispatcher: yes, only when plan is `ready_pending_activation` or
    `active`, or after completion/defer; not for normal product exits before
    plan readiness.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: not primary; product requests before plan ready are
    blocked locally.
  - status_recap inline: not primary.
  - select_state_potion: yes after allowed global/local exit if the user asks
    state support.
- Stop local actions: `blocked_exit_before_plan_ready`,
  `frustration_exit_after_plan_ready`, `complete_onboarding`,
  `skip_optional_preference`, `technical_blocked`.
- Exits without handoff: blocked/frustration can be locally acknowledged and
  state marked deferred/complete without global when no new topic is present.
- Required note_information on ownership transfer: source should include plan
  readiness, onboarding stage, saved/skipped preferences, exit justification,
  and any first-topic hint.
- Notes already present or missing: `exit_memo_request` exists; generalized
  note missing.
- Missing work: map `exit_memo_request` to canonical `note_information`.

## demotivation_repair

- Presentation: Repairs demotivation, fatigue, loss of meaning, avoidance, or
  overwhelm without moralizing. It may bridge to a potion after consent.
- Type: `conversation_skill`.
- Local dispatcher: `demotivation_repair.local_dispatcher` exists in docs and
  code.
- Active state key: `__active_skill_state` with `skill_id=demotivation_repair`.
- Active state status: `active|handoff_to_potion|complete|exit|safety`.
- Can handoff to:
  - global dispatcher: yes, for topic change or explicit other tool.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: possible but not core; should be inline for product
    questions if added.
  - status_recap inline: possible but not core.
  - select_state_potion: yes, confirmed bridge to `clarte|courage|rappel`
    mapped visibly to Potion de clarte, Potion de courage, Potion
    anti-decrochage.
  - prepare_attack_card / prepare_defense_card: suggested with consent, not
    direct execution.
- Stop local actions: `cancel_flow`, `repeat_last_repair`,
  `answer_repair`, `smaller_step`.
- Exits without handoff: refusal/no questions/no tool support can stay local
  and close/defer.
- Required note_information on ownership transfer: source should include
  diagnosed motivation source, durable need, selected potion if any, prefill
  candidates, weak/missing context, and no-chat-mutation.
- Notes already present or missing: `note_information` already exists for
  potion bridge and global exit in docs/code.
- Missing work: align the existing note with the global canonical metadata
  fields and ensure all transfers use it.

## emotional_repair

- Presentation: Repairs shame, guilt, anxiety, self-attack, relational tension,
  or acute emotional pressure. It can bridge to limited state potions after
  consent.
- Type: `conversation_skill`.
- Local dispatcher: `emotional_repair.local_dispatcher` exists in docs and
  code.
- Active state key: `__active_skill_state` with `skill_id=emotional_repair`.
- Active state status: local repair state with phases
  `stabilize|de_shame|separate_fact_from_identity|repair_relationship|action_card_ready|exit`.
- Can handoff to:
  - global dispatcher: yes, for topic change or explicit other tool.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: possible but not core.
  - status_recap inline: possible but not core.
  - select_state_potion: yes, confirmed bridge to `amour|guerison|apaisement`.
- Stop local actions: `cancel_flow`, `repeat_last_repair`, `soft_presence`,
  `regulation_without_potion`.
- Exits without handoff: no-tool/no-potion/no-questions and soft support can
  remain local and close/defer without global.
- Required note_information on ownership transfer: source should include repair
  summary, emotional dominance, constraints, chosen potion if any, prefill
  candidates, and missing/weak context.
- Notes already present or missing: bridge context exists but canonical
  `note_information` is not as explicit as in demotivation docs.
- Missing work: add canonical note for potion bridge, global exit, and safety.

## safety_crisis

- Presentation: Owns active safety/crisis turns and prioritizes immediate human
  safety, grounding, means distance, and support contact. Product/tool requests
  are deferred, not routed.
- Type: `safety_flow`.
- Local dispatcher: `safety_crisis.local_dispatcher` exists in docs and code.
- Active state key: active safety state / `__active_skill_state` with
  `skill_id=safety_crisis`.
- Active state status: reducer phase
  `entry|immediate_risk_check|acute_grounding|support_contact|stabilizing|exit_check|resolved`.
- Can handoff to:
  - global dispatcher: only after reducer-confirmed `resolved_exit_to_global`
    or equivalent resolved state, not merely because user asks.
  - safety_crisis: already owner.
  - product_help inline: no.
  - status_recap inline: no.
  - select_state_potion: no during active crisis; defer until resolved.
- Stop local actions: `wants_to_exit` does not exit by itself;
  `product_or_tool_attempt` stays safety-owned.
- Exits without handoff: resolved exit can render a safety closing prompt and
  clear state before global resumes on later turns.
- Required note_information on ownership transfer: source should include risk
  facts, deescalation/resolution facts, deferred product/tool attempt, and
  residual constraints.
- Notes already present or missing: safety contract has state summaries and
  deferred product boundary; canonical note missing.
- Missing work: define resolved-exit note to global without exposing safety
  internals to the user.

## product_help

- Presentation: Answers Sophia product, navigation, feature, and limit
  questions. It never creates, modifies, activates, cancels, or fills another
  flow's slots.
- Type: `conversation_skill`, `inline_info_flow`.
- Local dispatcher: `product_help.local_dispatcher` exists in docs and code.
- Active state key: product help active state for standalone; parent
  `active_flow_context` for inline.
- Active state status: `open|answered|closing|exit_to_global|safety`.
- Can handoff to:
  - global dispatcher: yes, for off-topic or explicit request for another flow.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: already itself.
  - status_recap inline: no direct status recap; object status should exit or
    route to parent/global/status.
  - select_state_potion: only via explicit handoff/global, never by product
    explanation alone.
- Stop local actions: `close_product_help`, `return_to_parent_flow`,
  `apply_attempt` as non-mutant explanation.
- Exits without handoff: in inline mode, `return_to_parent_flow` is a
  roundtrip, not global exit.
- Required note_information on ownership transfer: source should include
  answered question, grounded surface/catalog ids, mode, parent flow if any, and
  no-mutation constraints.
- Notes already present or missing: `return_to_parent` and `exit_memo` exist;
  canonical note missing.
- Missing work: canonicalize inline `return_summary` as note payload for parent
  and global exits.

## status_recap

- Presentation: Answers DB-grounded questions about what exists, is active,
  was cancelled, or recently happened. It is read-only and never mutates.
- Type: `conversation_skill`, `inline_info_flow`.
- Local dispatcher: `status_recap.local_dispatcher` exists in docs and code.
- Active state key: `__status_recap_flow_state_v1`.
- Active state status: `active|closing|closed|exit_to_global|safety`.
- Can handoff to:
  - global dispatcher: yes, for create/modify/cancel/activate, product help,
    preference update, normal coaching, or other tool request.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: not core; product navigation should exit or be handled
    by product_help where integrated.
  - status_recap inline: already itself.
  - select_state_potion: yes via global/local handoff if user asks for potion.
- Stop local actions: `cancel_flow`, `repeat_last_status`, `narrow_scope`,
  `human_recap_no_db` when handled as redirect/close.
- Exits without handoff: "stop the recap" closes locally without global if no
  new action is requested.
- Required note_information on ownership transfer: source should include last
  DB intent, target objects, projection summary, answer summary, and the
  constraint not to treat facts as a create/modify request.
- Notes already present or missing: `exit_memo` exists; inline status helper
  creates context; canonical note missing.
- Missing work: standardize `exit_memo` and inline context as
  `note_information`.

## flow_opportunity_verification

- Presentation: Verifies an implicit opportunity chosen by the global
  dispatcher while preserving the original confirmation anchor. It can answer
  product/status questions inline before launching the accepted target flow.
- Type: `conversation_skill`, `inline_info_flow`.
- Local dispatcher: `flow_opportunity_verification.local_dispatcher` exists in
  docs and code.
- Active state key: `__active_skill_state` with
  `skill_id=flow_opportunity_verification`.
- Active state status: `offered|explaining|waiting_confirmation|accepted|declined|launched|cancelled|exit|blocked`.
- Can handoff to:
  - global dispatcher: yes, for topic change, direct command other flow,
    unsupported request, stale flow, or cancellation needing reprocess.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: yes, `get_info_product`.
  - status_recap inline: yes, `get_info_db`.
  - target local dispatchers: yes, via `launch_target_flow` to
    `status_recap|update_coach_preferences|emotional_repair|demotivation_repair|prepare_attack_card|prepare_defense_card|select_state_potion|create_recurring_reminder|adjust_plan_item`.
  - one_shot_reminder / track_progress_plan_item: one-shot is listed as target
    direct effect; track progress can interrupt via direct effect when explicit.
- Stop local actions: `decline_opportunity`, `cancel_flow`,
  `stale_or_already_answered`, `unsupported_request_inside_flow`.
- Exits without handoff: decline/cancel can ack and close locally; no global
  unless same message should be reprocessed.
- Required note_information on ownership transfer: source should include
  opportunity id, target flow, target context, confirmation anchor, inline
  subskill history, and whether the same message should be reprocessed.
- Notes already present or missing: `exit_memo` and subskill context exist;
  canonical `note_information` missing.
- Missing work: add note to target-flow launch and global exit.

## daily_action_review_v1

- Presentation: Collects daily evidence for one or two targeted actions. It may
  commit a daily review entry only after reducer/executor validation.
- Type: `proactive_followup`.
- Local dispatcher: `daily_action_review.local_dispatcher` exists in docs and
  code under `_shared/daily_action_review`.
- Active state key: daily review pending state created by proactive daily
  opening.
- Active state status: `collecting|needs_clarification|complete|stopped|blocked`.
- Can handoff to:
  - global dispatcher: yes, for explicit tool request, product help, status
    question, preference update, normal coaching, topic change.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: planned/possible; currently specified as exit reason.
  - status_recap inline: planned/possible; currently specified as exit reason.
  - select_state_potion: yes via global/local handoff if user asks potion.
- Stop local actions: `user_stopped`, `repeat_current_question`,
  `recap_daily_state`.
- Exits without handoff: user stop/refusal closes daily locally; do not call
  global if no new topic exists.
- Required note_information on ownership transfer: source should include daily
  targets, collected item updates, missing slots, current review state, and
  committed effects if any.
- Notes already present or missing: `exit_memo` exists; canonical
  `note_information` missing.
- Missing work: add canonical note and inline info roundtrips.

## weekly_adaptive_review_v1

- Presentation: Runs the weekly strategic review, updates human signals, and
  may prepare a Plan handoff. It never applies plan changes from chat.
- Type: `proactive_followup`.
- Local dispatcher: `weekly_adaptive_review.local_dispatcher` exists in docs and
  code under `skills/weekly_review`.
- Active state key: weekly review active state in `weekly_review/state.ts`.
- Active state status: `open|proposal_discussed|handoff_ready|completed|stopped|exit_to_global|safety`.
- Can handoff to:
  - global dispatcher: yes, for explicit other tool, product help, status,
    preference update, normal coaching, topic change.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: planned/possible; currently exit reason.
  - status_recap inline: planned/possible; currently exit reason.
  - adjust_plan_item: yes, for Plan adjustment handoff; can also prepare local
    Plan handoff itself.
  - track_progress_plan_item: direct effect path for forgotten progress
    correction when target is clear.
- Stop local actions: `stop_weekly`, `complete_weekly_no_change`,
  `repeat_plan_handoff`, `apply_attempt`.
- Exits without handoff: stop weekly can close locally; "ok applique" is local
  non-mutant `apply_attempt`, not execution/global by default.
- Required note_information on ownership transfer: source should include weekly
  stage, strategy, human signals, last weekly summary, Plan handoff summary,
  validation status, and no-plan-mutation constraint.
- Notes already present or missing: `exit_memo` exists; canonical note missing.
- Missing work: add note to adjust_plan/global/safety transfers and inline info.

## morning_nudge_v2

- Presentation: Proactive send surface that may open a post-morning local flow
  depending on structured nudge payload. It is not itself a free-form local
  conversation dispatcher.
- Type: `proactive_followup` source event.
- Local dispatcher: no direct dispatcher; resolver selects one of the
  `post_morning_nudge.*` dispatchers from structured payload.
- Active state key: persisted `morning_nudge_v2` payload and optional
  `post_morning_nudge` state.
- Active state status: `opens_local_flow=true|false` with
  `intended_followup_flow=action|suppressed_action|emotional_presence|null`.
- Can handoff to:
  - global dispatcher: yes when no local flow opens or after post flow explicit
    exit.
  - safety_crisis: yes through post flow or global pregate.
  - product_help inline: only inside post flow if added.
  - status_recap inline: only inside post flow if added.
  - select_state_potion: via post flow exit or local handoff.
- Stop local actions: `no_action_greeting` opens no local flow; no stop action
  is needed.
- Exits without handoff: celebratory/greeting payload can leave next user turn
  to global without note because no dispatcher ownership was active.
- Required note_information on ownership transfer: if a post flow exits, note
  belongs to that post flow, not to the send event.
- Notes already present or missing: structured source payload exists; not a
  dispatcher-owner note source except through post flows.
- Missing work: none for catalog except keeping payload structured.

## post_morning_nudge.action

- Presentation: Handles the first reply to a morning action nudge. It helps the
  user start, reduce scope, handle a blocker, or close quickly.
- Type: `proactive_followup`.
- Local dispatcher: `post_morning_nudge.action_dispatcher` exists in docs and
  code.
- Active state key: `post_morning_nudge` state with `flow_kind=action`.
- Active state status: `active|closing|closed|exit_to_global|safety`.
- Can handoff to:
  - global dispatcher: yes, for other tool, product help, status, preference,
    new goal, topic change.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: planned/possible; currently exit reason.
  - status_recap inline: planned/possible; currently exit reason.
  - select_state_potion: yes via global/local handoff if explicit potion need.
- Stop local actions: `quick_close_ready`, `cancel_flow`,
  `negative_nudge_feedback`, `support_not_today`.
- Exits without handoff: ready/ack/cancel/not-today can close locally with an
  ack and no global.
- Required note_information on ownership transfer: source should include source
  nudge summary, target actions/items, last local assessment, and no-mutation
  constraints.
- Notes already present or missing: `exit_memo` exists; canonical note missing.
- Missing work: map `exit_memo` to canonical note and add inline info if needed.

## post_morning_nudge.suppressed_action

- Presentation: Handles the first reply to a protective morning nudge where an
  action was deliberately not pushed. It preserves protection unless the user
  asks to reopen action.
- Type: `proactive_followup`.
- Local dispatcher: `post_morning_nudge.suppressed_action_dispatcher` exists in
  docs and code.
- Active state key: `post_morning_nudge` state with
  `flow_kind=suppressed_action`.
- Active state status: `active|closing|closed|exit_to_global|safety`.
- Can handoff to:
  - global dispatcher: yes, for other tool, product help, status, preference,
    new goal, topic change.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: planned/possible; currently exit reason.
  - status_recap inline: planned/possible; currently exit reason.
  - select_state_potion: yes if the user explicitly asks for potion/state
    support beyond local soft support.
- Stop local actions: `protective_close`, `confirm_no_action_today`,
  `negative_nudge_feedback`, `cancel_flow`.
- Exits without handoff: no-action-today/cancel can close locally; no global
  unless there is a distinct new request.
- Required note_information on ownership transfer: source should include source
  nudge summary, suppressed actions, suppression reason, last local assessment,
  and protection constraint.
- Notes already present or missing: `exit_memo` exists; canonical note missing.
- Missing work: map `exit_memo` to canonical note and add inline info if needed.

## post_morning_nudge.emotional_presence

- Presentation: Handles the first reply to a non-action morning presence nudge.
  It can hold space, clarify support, offer a soft next step, or close quickly.
- Type: `proactive_followup`.
- Local dispatcher: `post_morning_nudge.emotional_presence_dispatcher` exists in
  docs and code.
- Active state key: `post_morning_nudge` state with
  `flow_kind=emotional_presence`.
- Active state status: `active|closing|closed|exit_to_global|safety`.
- Can handoff to:
  - global dispatcher: yes, for other tool, product help, status, preference,
    action-specific request, new goal, topic change.
  - safety_crisis: yes, via `safety_preempt`.
  - product_help inline: planned/possible; currently exit reason.
  - status_recap inline: planned/possible; currently exit reason.
  - select_state_potion: yes if the user asks for state/potion support.
- Stop local actions: `presence_ack_close`, `negative_nudge_feedback`,
  `cancel_flow`.
- Exits without handoff: acknowledgement/cancel/negative feedback can close
  locally with no global.
- Required note_information on ownership transfer: source should include source
  nudge summary, no-hidden-action constraint, main emotion/context, soft next
  step if any, and last local assessment.
- Notes already present or missing: `exit_memo` exists; canonical note missing.
- Missing work: map `exit_memo` to canonical note and add inline info if needed.

## Not Local Dispatcher Flows

### one_shot_reminder

- Presentation: Direct effect owner for punctual reminder create/cancel/replace.
  It is not a multi-turn local dispatcher.
- Type: direct effect, not catalogued as local dispatcher flow.
- Can receive handoff from: `create_recurring_reminder` via
  `handoff_to_one_shot`, active handoff arbitration, or global direct effect.
- Note requirement: if a local dispatcher transfers to one-shot, pass enough
  context to distinguish punctual vs recurring and preserve user constraints.

### track_progress_plan_item

- Presentation: Direct effect owner for explicit plan item progress logging. It
  is not a multi-turn local dispatcher.
- Type: direct effect, not catalogued as local dispatcher flow.
- Can receive handoff from: weekly forgotten progress correction, active
  handoff interruption, or global direct effect.
- Note requirement: if a local dispatcher transfers to progress tracking, pass
  target item, outcome/status hint, evidence, and no-double-write constraints.

### execution_breakdown

- Presentation: Directory exists but no files, docs, local dispatcher prompt, or
  runtime contract were found in the inspected repo state.
- Type: absent/unknown; not catalogued as an implemented or planned local flow.

## Coverage Checklist

- Local prompt files covered:
  `adjust-plan-item`, `prepare-attack-card`, `prepare-defense-card`,
  `whatsapp-onboarding`, `demotivation-repair`, `emotional-repair`,
  `product-help`, `safety-crisis`, `status-recap`,
  `flow-opportunity-verification`, `daily-action-review`, `weekly-review`,
  `post-morning-nudge.action`, `post-morning-nudge.suppressed_action`,
  `post-morning-nudge.emotional_presence`.
- Tool flows without local dispatcher prompt but with active handoff state:
  `create_recurring_reminder`.
- Inline info flows covered:
  `product_help / get_info_product`, `status_recap / get_info_db`,
  `flow_opportunity_verification` inline roundtrips.
- Safety preemption covered for every active local flow.
- Stop-local actions are separated from `exit_to_global_dispatcher`.
- `select_state_potion -> potion subskill` is marked as the explicit
  specialized exception.
