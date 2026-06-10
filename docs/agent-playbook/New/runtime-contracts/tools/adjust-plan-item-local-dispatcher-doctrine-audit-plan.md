# adjust_plan_item - Local Dispatcher Doctrine Audit And Implementation Plan

Reference read in full before this plan:
`docs/agent-playbook/New/runtime-contracts/11-local-dispatcher-doctrine.md`.

Scope of this document: plan the correction of the `adjust_plan_item` local
flow so it follows the local dispatcher doctrine. This is not an implementation
patch.

## 0. Product Brainstorming Before Code

### Exact Purpose Of The Flow

`adjust_plan_item` helps the user prepare a clear adjustment to resume in the
Plan surface. The chat is a coaching and handoff surface, not an execution
surface.

The flow must support:

- making one plan item lighter, clearer, moved, split, paused, resumed or
  replaced;
- adjusting a cluster of actions, a current week, a current level, a whole plan
  or several plans;
- preserving user constraints, existing cadence, completed work and plan
  boundaries;
- answering limited read-only product/status questions while preserving the
  parent flow;
- refusing any direct chat-side apply while giving the exact Plan handoff.

The flow must never:

- mutate the Plan from chat;
- create a pending executable confirmation;
- claim that an adjustment was applied, saved, moved or validated;
- let a visible prompt infer missing scope, fields or target action.

### Possible States

V1 states should stay compact:

- `collecting_scope`: target plan, level, item or scope is missing/weak.
- `collecting_adjustment_need`: reason or requested change is missing/weak.
- `collecting_constraints`: preserve/avoid/cadence boundaries are missing when
  needed.
- `handoff_ready`: all required state exists and a Plan handoff draft is
  available.
- `handoff_delivered`: the Plan handoff has been shown and can be repeated,
  revised, explained or rejected.
- `revising`: user corrects a delivered/proposed handoff.
- `inline_roundtrip`: product/status answer is handled inline, parent state is
  preserved.
- `stopped`: user stops/cancels/defer without a new subject.
- `exit_to_global`: user clearly changes subject and global may reanalyse.
- `handoff_to_local_flow`: another local flow takes ownership.
- `safety_preempted`: safety local dispatcher takes ownership.
- `blocked_contract`: dispatcher or reducer contract failed; local safe
  clarification/ack is produced, no global fallback.

### Fields And Decisions To Stabilize

Fields owned by the local dispatcher/reducer:

- `scope.kind`: `specific_plan_item`, `action_cluster`, `current_week`,
  `current_level`, `whole_plan`, `multi_plan`, `unknown`.
- `scope.plan_id`, `plan_title`, `level_id`, `level_title`,
  `plan_item_ids`, `target_summary`, confidence/evidence/status.
- `adjustment_need.reason_change`, `requested_change`, `change_kind`.
- `constraints`, `preserve`, `avoid`, `missing_or_weak_values`.
- `platform_handoff.destination="Plan"`.
- `platform_handoff.suggested_platform_input`.
- `platform_handoff.grouped_by_plan` for multi-plan cases.
- `last_handoff_summary`, `last_visible_task`, `turn_count`.
- `risk_score` and `safety_signal`.
- `note_information` on every dispatcher change.

Every important structured field must carry or be traceable to:

- source: user message, DB context, inbound note, micro-memory, inference;
- evidence;
- confidence;
- status: missing, candidate, proposed, locked.

### User Responses That Can Arrive

The dispatcher must classify at least:

- vague start: "allege mon plan", "c'est trop lourd";
- scoped start: "rends l'action du soir plus legere";
- answer to scope clarification: "le sas de dechargement", "le deuxieme plan";
- answer to need clarification: "juste noter trois lignes";
- answer to constraints: "garde la cadence", "ne touche pas au niveau";
- revision: "non, plutot deux minutes", "change juste le titre";
- repeat: "redis-moi quoi mettre";
- destination: "ou je fais ca ?";
- explanation: "pourquoi tu proposes ca ?";
- apply attempt: "ok applique", "modifie-le dans le Plan";
- stop/defer: "laisse tomber", "pas maintenant";
- status question: "quelles actions existent deja ?";
- product help: "ou est le Plan ?";
- local bridge: "fais-moi une carte pour cette action";
- clear topic change: "laisse ca, aide-moi a prioriser ma journee";
- safety signal: self-harm, acute crisis, violence, medical/emergency risk.

### Exit Signals

- `stop_local_no_handoff`: user abandons the flow without a new topic. Local
  short acknowledgement. No global on the same turn.
- `exit_to_global_dispatcher`: user clearly changes subject. Requires
  `note_information`; global may reanalyse the same message.
- `safety_preempt`: safety takes priority. Requires `note_information` to
  `safety_crisis`; global normal does not run.
- `handoff_to_local_flow`: direct local bridge when the target dispatcher is
  known and supported, for example `prepare_attack_card` for a known action.
  Requires `note_information`.
- `inline_tool_roundtrip`: `product_help` or `status_recap` answer a bounded
  question and return to parent `adjust_plan_item`.

### Inline Tools And Local Flow Bridges

V1 inline tools:

- `status_recap` / `get_info_db`: read-only questions about plan items,
  current Plan contents, active actions, cards attached to the targeted action,
  or recent action status relevant to the adjustment.
- `product_help`: navigation/surface questions such as where to apply the
  handoff in Plan.

V1 local bridges:

- `safety_crisis`: preemption, never global normal.
- `prepare_attack_card`: only if the user explicitly asks for an attack card
  and the target action/context is sufficiently collected.
- `prepare_defense_card`: only if the user explicitly asks for a defense card
  and the risk/situation context is sufficiently collected.

Other requests should use `exit_to_global_dispatcher` with a full
`note_information` rather than a silent fallback.

### Stage-Specific Visible Prompts Needed

Minimum stage prompts:

- `ask_scope`;
- `ask_adjustment_need`;
- `ask_constraints`;
- `handoff_ready`;
- `revise_handoff`;
- `repeat_handoff`;
- `destination_followup`;
- `explain_handoff`;
- `inline_tool_return`;
- `apply_attempt`;
- `stop_or_cancel`;
- `exit_ack`;
- `safety_transition`;
- `contract_recovery`.

### Useful DB Context

`adjust_plan_item` benefits from DB context, but it must be compact:

- active plans and plan titles;
- active levels/phases;
- active plan items with id, title, description, status, cadence, time of day,
  reps, plan id and level id;
- linked cards status if already available;
- recent progression/status for candidate actions;
- plan boundaries: completed items, support items, current week/level markers;
- user preferences only if directly relevant to the handoff tone or Plan
  constraints.

### Micro Memory Use

Micro memory is useful for `adjust_plan_item`, but not by default on every
clarification.

Use it only when:

- the user uses a weak reference like "cette action", "le truc du soir", or a
  known action nickname;
- the dispatcher has one or more candidate plan items and recent memory can
  disambiguate;
- recent blockers/progress entries can explain why the adjustment is needed;
- an inbound flow note points to a specific action or plan context.

Do not load micro memory for a plain missing-field clarification if DB context
already answers the target, or if the message is a broad product/status
question.

Budget: 0 to 3 items for V1, maximum 4 by doctrine. The raw micro memory must
not be passed to the visible prompt. The dispatcher/reducer may convert it into
filtered `conversation_context.evidence_used` or `context_summary`.

## 1. Diagnostic Of The Current Flow

### Already Aligned With Doctrine

- A local dispatcher exists in
  `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/local_flow.ts`.
- The dispatcher is JSON-only and does not directly answer the user.
- A reducer exists and separates dispatcher output from visible response.
- The flow has explicit non-mutant semantics: `no_chat_mutation: true`,
  `executedTools: []`, and `executable_from_chat: false`.
- `apply_attempt` is blocked instead of applying a Plan mutation.
- `router/run.ts` contains an active-flow branch that skips global dispatcher
  while active for `adjust_plan_item`.
- Existing tests cover basic clarification, handoff, apply attempt, exit to
  global and inline DB status.

### Divergences From Doctrine

- `visible_task` contains only `kind` and `instruction`; it does not contain
  `visible_task.conversation_context`.
- The visible agent receives raw `local_state`, `draft`, recent messages and
  handoff state. It should receive only filtered `conversation_context`.
- The visible agent is a single generalist prompt with a switch-based
  instruction. The doctrine requires stage-specific prompts.
- Legacy platform input coaching still exists in the same router path:
  `buildDraft`, `writeVisibleReply`, `startInputCoach`,
  `handleActiveInputCoach`. This is a parallel legacy flow rather than a single
  local-dispatcher-led flow.
- First activation by global does not provide a canonical
  `note_information_inbound` to the local dispatcher.
- `exit_memo` is not the canonical `note_information` contract and lacks the
  full fields required for dispatcher changes.
- `get_info_db` calls inline status without a canonical note-information
  roundtrip.
- `safety_preempt` is represented in the reducer but currently returns local
  visible handling rather than a full note to `safety_crisis.local_dispatcher`.
- Dispatcher input uses `plan_snapshot` instead of standard `db_context_pack`
  with source/evidence/confidence/freshness.
- There is no `micro_memory_context`.
- Visible fallback messages are built by code in error paths. They are safe
  recovery text, but they must become explicit `contract_recovery` or
  `stop_or_cancel` stage prompts, not nominal renderers.
- The current visible contract checks for exact presence of the whole
  `suggested_platform_input`, which caused `missing_suggested_platform_input`
  in the real QA run. The correct invariant is that the reducer provides the
  handoff data and the stage prompt uses it, not brittle exact full-string
  matching.

### Legacy To Remove Or Quarantine

- Remove `startInputCoach` and `handleActiveInputCoach` from the nominal path
  after the local flow is complete.
- Replace `AdjustPlanHandoffState.mode="platform_input_coaching"` legacy naming
  with `platform_handoff` or keep it only as a read-compatible alias.
- Stop using legacy `generator.ts` / `renderer.ts` as a fallback for active
  local flow turns.
- Convert `exit_memo` to canonical `note_information`.
- Replace visible-agent raw-state input with `conversation_context`.

### Risks

- If legacy fallback remains, global/legacy logic can mask local dispatcher
  bugs and produce non-doctrine behavior.
- If `conversation_context` is too thin, visible prompts will invent fields.
- If `conversation_context` is too raw, visible prompts become hidden
  dispatchers.
- If state is not persisted after visible-agent failure, the next turn exits
  active flow, as observed in QA `adjust-plan-local-real-r2`.
- If `apply_attempt` has no handoff draft, the chat may refuse correctly but
  fail to tell the user what to do in Plan.

## 2. Target Architecture

### Runtime Schema

Nominal active flow:

```txt
message user
-> active adjust_plan_item detected
-> global dispatcher skipped and traced
-> db_context_pack loaded
-> optional micro_memory_context loaded
-> adjust_plan_item.local_dispatcher
-> adjust_plan_item.reducer
-> visible_task.kind + visible_task.conversation_context
-> stage-specific visible prompt
-> message visible
-> state persisted
```

First activation:

```txt
global dispatcher selects adjust_plan_item
-> canonical note_information_inbound is built from routeDecision/TurnFrame
-> local dispatcher starts with that note
-> reducer and visible prompt continue as above
```

Dispatcher change:

```txt
adjust_plan_item.local_dispatcher
-> flow_action exit/safety/handoff/inline
-> reducer validates note_information
-> target dispatcher consumes note_information
-> target reducer creates its own conversation_context
```

### Local Dispatcher

The local dispatcher is the only business decision-maker. It receives:

- current user message;
- recent messages;
- active local state;
- inbound note information, if any;
- `db_context_pack`;
- optional `micro_memory_context`;
- platform/channel/timezone/risk context;
- available inline tools and local bridge capabilities.

It returns only JSON.

It owns:

- scope resolution;
- field status and confidence;
- flow action;
- target dispatcher choice;
- note information;
- selected visible task kind;
- raw material for the reducer to build `conversation_context`.

It does not:

- answer the user;
- apply any Plan patch;
- call DB writers;
- route by regex/keywords;
- let visible prompts fill missing fields.

### Reducer

The reducer:

- validates enum values and required fields;
- validates every dispatcher change has canonical `note_information`;
- merges structured state;
- builds `AdjustPlanHandoffDraft` only from structured state;
- builds `visible_task.conversation_context`;
- decides whether state is kept, stopped, deferred or cleared;
- enforces no-chat-mutation and no executable confirmation;
- refuses a delivered handoff if `suggested_platform_input` is missing.

The reducer must not reclassify the raw user message.

### Conversation Context

`conversation_context` is the only payload sent to visible prompts.

Recommended shared shape:

```json
{
  "state_summary": "string",
  "user_words": ["string"],
  "field_or_stage": "scope|adjustment_need|constraints|handoff|closing",
  "known_values": {
    "scope": {},
    "adjustment_need": {},
    "constraints": [],
    "preserve": [],
    "avoid": []
  },
  "missing_or_weak_values": [],
  "selected_candidate": {},
  "handoff_data": {
    "destination": "Plan",
    "suggested_platform_input": "string|null",
    "grouped_by_plan": [],
    "previous_value": "string|null",
    "revised_value": "string|null"
  },
  "tone_constraints": [],
  "do_not_say": [],
  "context_summary": "string|null",
  "evidence_used": []
}
```

No raw DB snapshot and no raw micro memory should be exposed.

### Prompt Routing

Use a small prompt registry:

```txt
visible_task.kind -> stage-specific system prompt -> JSON { "message": "..." }
```

A shared transport helper is fine. A single generic visible-agent prompt is not.

### Transitions To Other Dispatchers

- `stop_local_no_handoff`: local prompt only, no global.
- `exit_to_global_dispatcher`: canonical note, clear/suspend local state,
  reroute same user message to global.
- `safety_preempt`: canonical note to `safety_crisis.local_dispatcher`, no
  global normal.
- `handoff_to_local_flow`: canonical note to the target local dispatcher.
- `inline_tool_roundtrip`: canonical note to `status_recap` or `product_help`,
  parent state preserved, returned answer passed through
  `inline_tool_return` prompt.

## 3. Local Dispatcher JSON Contract

### Input

```json
{
  "current_user_message": "string",
  "recent_messages": [],
  "active_flow_state": {},
  "note_information_inbound": {},
  "db_context_pack": {},
  "micro_memory_context": {},
  "platform_context": {
    "channel": "web|whatsapp|...",
    "timezone": "string",
    "surface": "chat"
  },
  "risk_context": {},
  "available_inline_tools": ["status_recap", "product_help"],
  "available_local_flows": [
    "safety_crisis",
    "prepare_attack_card",
    "prepare_defense_card"
  ],
  "parent_flow_context": {}
}
```

### Output

```json
{
  "flow_action": "continue_local|missing_info|confirm_candidate|handoff_ready|revise|repeat|apply_attempt|inline_tool_roundtrip|handoff_to_local_flow|exit_to_global_dispatcher|stop_local_no_handoff|cancel_flow|defer_flow|complete_flow|safety_preempt|contract_recovery",
  "confidence": "low|medium|high",
  "risk_score": 0,
  "safety": {
    "preempt": false,
    "risk_band": "none|low|medium|high|crisis",
    "evidence": []
  },
  "local_state_patch": {
    "status": "collecting_scope|collecting_adjustment_need|collecting_constraints|handoff_ready|handoff_delivered|revising|inline_roundtrip|stopped|exit_to_global|handoff_to_local_flow|safety_preempted|blocked_contract",
    "scope": {},
    "adjustment_need": {},
    "platform_handoff": {},
    "field_status": {}
  },
  "visible_task": {
    "kind": "ask_scope|ask_adjustment_need|ask_constraints|handoff_ready|revise_handoff|repeat_handoff|destination_followup|explain_handoff|inline_tool_return|apply_attempt|stop_or_cancel|exit_ack|safety_transition|contract_recovery|none",
    "conversation_context_seed": {}
  },
  "note_information": {
    "needed": false
  },
  "inline_tool": {
    "needed": false,
    "target_dispatcher": "status_recap|product_help|null",
    "question_to_answer": "string|null"
  },
  "no_chat_mutation": {
    "db_write_committed": false,
    "executable_confirmation_generated": false
  },
  "evidence": []
}
```

### Flow Actions

- `continue_local`: current stage can answer or progress locally.
- `missing_info`: ask for missing/weak field.
- `confirm_candidate`: candidate handoff needs confirmation or constraint.
- `handoff_ready`: Plan handoff can be shown.
- `revise`: revise an existing handoff.
- `repeat`: repeat a delivered handoff.
- `apply_attempt`: user asks to apply; block mutation and point to Plan.
- `inline_tool_roundtrip`: bounded status/product answer, parent state kept.
- `handoff_to_local_flow`: target local flow takes over with note.
- `exit_to_global_dispatcher`: clear new subject, global may reanalyse.
- `stop_local_no_handoff`: stop/defer/cancel locally, no global.
- `cancel_flow`, `defer_flow`, `complete_flow`: local closure variants.
- `safety_preempt`: target `safety_crisis`.
- `contract_recovery`: invalid/insufficient dispatcher output recovery.

### Canonical Note Information

For any dispatcher change, include:

```json
{
  "source_flow": "adjust_plan_item",
  "source_flow_id": "adjust_plan_item",
  "target_dispatcher": "global|safety_crisis|status_recap|product_help|prepare_attack_card|prepare_defense_card|other_local",
  "handoff_reason": "topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request",
  "user_message_summary": "string",
  "active_flow_summary": "string",
  "collected_state": {},
  "unresolved_questions": [],
  "confidence": "low|medium|high",
  "evidence": [],
  "recommended_next_focus": "string",
  "source_flow_presentation": "Prepares a non-mutant Plan adjustment handoff from chat. It never applies Plan changes from chat.",
  "handoff_context_for_next_dispatcher": "string",
  "target_local_dispatcher_hint": "string|null",
  "risk_score": 0,
  "no_chat_mutation": {
    "db_write_committed": false,
    "executable_confirmation_generated": false
  }
}
```

The note is never displayed directly.

## 4. Required Stage-Specific Visible Prompts

Each prompt receives only `conversation_context` and returns strict JSON:
`{"message":"..."}`.

### `ask_scope`

- Called when target plan/item/week/level is missing or ambiguous.
- Receives: candidate plans/items summary, known user words, why scope is weak.
- Produces: one natural question.
- Never: pick an item, mention internal labels, apply anything.

### `ask_adjustment_need`

- Called when scope exists but reason or requested change is weak.
- Receives: selected scope summary, known constraints, missing need fields.
- Produces: one natural question about what should change and why.
- Never: invent the change.

### `ask_constraints`

- Called when the change is clear but preservation/avoid/cadence boundaries are
  needed.
- Receives: selected scope, proposed change, missing constraints.
- Produces: one short question.
- Never: over-interrogate or assume cadence changes.

### `handoff_ready`

- Called when `suggested_platform_input` is ready.
- Receives: destination Plan, handoff text, constraints, evidence summary.
- Produces: a natural Plan handoff with clear next step.
- Never: say applied/saved/modified in DB.

### `revise_handoff`

- Called after user correction.
- Receives: previous value, revised value, unchanged constraints.
- Produces: concise revised handoff.
- Never: apply or imply persistence.

### `repeat_handoff`

- Called when user asks to repeat.
- Receives: last handoff only, destination Plan.
- Produces: short repeat.
- Never: add new reasoning or new fields.

### `destination_followup`

- Called when user asks where/how to use it.
- Receives: destination Plan and handoff text.
- Produces: short answer pointing to Plan.
- Never: give unrelated product tutorial unless routed inline to product_help.

### `explain_handoff`

- Called when user asks why this adjustment.
- Receives: evidence, constraints, state summary.
- Produces: brief reasoning.
- Never: change scope or draft.

### `inline_tool_return`

- Called after inline `status_recap` or `product_help`.
- Receives: inline answer summary, parent state summary, next local focus.
- Produces: answer plus return to the adjustment flow.
- Never: clear parent state or create new fields from inline answer unless the
  reducer already updated them.

### `apply_attempt`

- Called when user asks to apply/validate/modify from chat.
- Receives: handoff text if available, destination Plan, no-mutation invariant.
- Produces: soft refusal plus exact Plan next step.
- Never: apply, create confirmation, or say "done".

### `stop_or_cancel`

- Called for `stop_local_no_handoff`, cancel, defer.
- Receives: closure type and whether state is cleared/deferred.
- Produces: short acknowledgement, no final question.
- Never: call global, coach further, or reopen the flow.

### `exit_ack`

- Normally not visible if same message is rerouted to global. Only use when a
  local visible acknowledgement is explicitly required before leaving.
- Receives: minimal exit summary.
- Produces: one short bridge sentence.
- Never: answer the new topic.

### `safety_transition`

- Called only if safety dispatcher is about to take ownership and a minimal
  bridge is needed.
- Receives: risk summary, source flow summary.
- Produces: minimal transition.
- Never: continue Plan work.

### `contract_recovery`

- Called when dispatcher/visible contract failed and no dispatcher change is
  allowed.
- Receives: safe state summary and next recoverable field.
- Produces: local safe clarification or short retry request.
- Never: fall back to global, invent a handoff, or expose internals.

## 5. Context To Inject

### `db_context_pack`

Required for `adjust_plan_item`.

Shape:

```json
{
  "source": "supabase",
  "freshness": "same_turn",
  "confidence": "high",
  "plans": [],
  "levels": [],
  "plan_items": [],
  "cards": [],
  "recent_progress": [],
  "preferences": [],
  "surface_capabilities": {
    "plan_handoff_destination": "Plan",
    "chat_can_mutate_plan": false
  },
  "evidence": []
}
```

Keep it compact:

- limit active plans/items to relevant active/current scopes;
- include titles/descriptions/cadence/status, not full raw rows;
- include ids only for dispatcher/reducer; visible prompt gets labels and
  summaries through `conversation_context`;
- mark every item as `db_derived`, `user_provided`, `inferred` or
  `bridge_provided`.

### `micro_memory_context`

Use selectively.

Budget:

- default 0 items;
- 1 to 3 items when a candidate action/plan is identified and memory can
  disambiguate or explain the adjustment;
- absolute max 4 items.

Allowed sources:

- action-linked memory for candidate plan items;
- recent blocker/progress notes for candidate action;
- thread memory tied to the current adjustment;
- inbound flow note context.

Excluded:

- global profile memory;
- unrelated preferences;
- safety memory outside safety preemption;
- raw memory text to visible prompts;
- broad emotional history.

Justification: `adjust_plan_item` can benefit from memory because users often
refer to active actions indirectly. But for simple clarification or product
help, DB context and current message are enough.

## 6. QA Invariants

Minimum invariants:

- Global dispatcher is skipped while `adjust_plan_item` is active.
- Global dispatcher runs again only after explicit
  `exit_to_global_dispatcher`.
- No business regex routing.
- No business `message.includes(...)` routing.
- No deterministic visible renderer in nominal path.
- No single generic conversation agent for all stages.
- Every `flow_action` has an exact continuation.
- Every `visible_task.kind` has a stage-specific prompt.
- `visible_task.conversation_context` is non-empty and sufficient.
- `stop_local_no_handoff` does not call global on the same turn.
- `exit_to_global_dispatcher` includes canonical `note_information`.
- `safety_preempt` routes to `safety_crisis.local_dispatcher` with note.
- `handoff_to_local_flow` includes note and does not call global.
- Inline product/status roundtrips preserve parent flow state.
- Conversation agent only uses `conversation_context`.
- Raw `db_context_pack` is not passed to visible prompts.
- Raw `micro_memory_context` is not passed to visible prompts.
- Micro memory is minimal, relevant and capped.
- `apply_attempt` never mutates DB and never creates executable confirmation.
- `executedTools` remains empty for nominal Plan handoff/apply attempts.
- Handoff stages require a reducer-built `suggested_platform_input`.
- Visible failure does not erase active local state silently.
- Contract recovery does not fall back to global silently.

## 7. Implementation Plan

### Files To Modify

- `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/local_flow.ts`
  - add standard input fields;
  - expand flow actions;
  - add canonical note information;
  - add `conversation_context` to visible tasks;
  - enforce reducer invariants.
- `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/visible_agent.ts`
  - replace raw-state visible input with `conversation_context`;
  - split prompts by stage;
  - remove brittle exact-string handoff validation.
- `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router.ts`
  - remove/quarantine legacy input coach nominal path;
  - persist state on visible-agent failure through `contract_recovery`;
  - route inline product/status with note information;
  - route safety to safety local dispatcher.
- `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/state.ts`
  - normalize `platform_handoff` mode naming;
  - preserve read compatibility for old temp memory if necessary.
- `supabase/functions/sophia-brain/router/run.ts`
  - keep global skip while active;
  - consume local exit note information;
  - avoid global fallback on null local runtime.
- `supabase/functions/sophia-brain/router/active_flow_state.ts`
  - support canonical adjust-plan exit notes.
- `supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`
  - ensure first activation passes inbound note/context to local flow.
- Tests:
  - `adjust_plan_item/local_flow_test.ts`;
  - `router/active_flow_state_test.ts`;
  - `router/operation_runtime_pipeline_test.ts`;
  - add visible prompt contract tests if no dedicated file exists.

### Order Of Modification

1. Define types for `db_context_pack`, `micro_memory_context`,
   `note_information`, `conversation_context`.
2. Update dispatcher prompt/schema to produce doctrine actions and note
   information.
3. Update reducer to build `conversation_context` and validate exact
   continuations.
4. Replace visible agent input with stage-specific prompt registry.
5. Remove legacy input coach from nominal path; keep only read migration if
   needed.
6. Add canonical inline roundtrip handling for `status_recap` and
   `product_help`.
7. Add safety preempt route to `safety_crisis.local_dispatcher`.
8. Update active-flow exit handling in `run.ts` and `active_flow_state.ts`.
9. Add observability and tests.
10. Run targeted unit/integration tests, then real IA QA.

### Unit Tests

Required reducer/dispatcher tests:

- active flow continues locally on vague response;
- clear scope answer advances without global;
- clear need answer prepares handoff;
- handoff ready includes `conversation_context.handoff_data`;
- apply attempt returns non-mutant Plan handoff;
- stop local no handoff clears/defer state and does not set exit;
- exit global requires note information;
- safety preempt requires note information to safety;
- handoff to attack/defense card requires note information;
- inline status preserves parent state;
- inline product preserves parent state;
- invalid dispatcher JSON leads to `contract_recovery`, not global;
- visible stage prompt receives no raw DB or raw memory.

Static/contract tests:

- no business regex routing in adjust-plan local dispatcher;
- no business `message.includes(...)` routing;
- no deterministic renderer nominal path;
- no single generic visible prompt;
- every flow action maps to a continuation.

### Real IA Tests

After implementation, rerun local QA with Supabase local and
`force_full_ai=true`.

Minimum scenarios:

- implicit plan-lightening request should enter `adjust_plan_item` earlier;
- scoped item + requested change should produce handoff with no visible error;
- user says "apply it" and receives non-mutant Plan destination;
- user asks where to do it and gets destination followup;
- user asks what actions exist and status recap answers inline, then returns to
  parent flow;
- user says "laisse tomber" and global does not run;
- user clearly changes subject and global reruns with note;
- safety signal preempts to safety local dispatcher.

### Logs And Trace To Add

Add/standardize trace events:

- `local_dispatcher_called`;
- `local_dispatcher_result`;
- `db_context_pack_loaded`;
- `micro_memory_context_loaded`;
- `flow_action`;
- `visible_task.kind`;
- `conversation_context_built`;
- `note_information_created`;
- `note_information_consumed`;
- `global_dispatcher_skipped`;
- `inline_tool_roundtrip`;
- `local_stop_no_handoff`;
- `handoff_to_local_flow`;
- `safety_preempt`;
- `risk_score`;
- `contract_recovery`.

### Validation Criteria

The flow is V1 compliant when:

- every active turn follows local dispatcher -> reducer ->
  conversation_context -> stage-specific prompt;
- no active turn silently reaches global;
- real QA no longer shows `missing_suggested_platform_input`;
- Plan DB rows remain unchanged for chat handoff/apply attempts;
- visible responses are natural and stage-appropriate;
- all dispatcher changes carry canonical `note_information`;
- traces prove the global skip and target dispatcher transitions.
