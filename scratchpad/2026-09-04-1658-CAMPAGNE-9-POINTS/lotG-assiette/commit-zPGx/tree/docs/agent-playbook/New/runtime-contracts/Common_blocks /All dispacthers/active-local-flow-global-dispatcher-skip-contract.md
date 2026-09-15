# Active Local Flow / Global Dispatcher Skip Contract

## Purpose

This block applies to every Sophia runtime path that can resume an active local
flow.

When a local flow is active, the global dispatcher normal path must not run for
the same user turn.

The active local dispatcher is the only dispatcher allowed to decide the next
flow action.

## Core Rule

```txt
temp_memory
-> readActiveFlowState(temp_memory)
-> active_skill_state present
-> skip global dispatcher LLM / global TurnFrame decision
-> build neutral runtime TurnFrame
-> route to active local owner
-> local dispatcher decides continuation, stop, exit, safety, or allowed handoff
```

Forbidden path:

```txt
active_skill_state present
-> global dispatcher LLM runs
-> global TurnFrame recomputes product/coaching/tool route
-> router changes owner without local dispatcher exit
```

This is a double-decision bug. It can make a flow lose ownership even though the
local dispatcher never exited.

## Allowed Global Dispatcher Moments

The global dispatcher may run only when:

- no active local flow is returned by `readActiveFlowState`;
- a local dispatcher explicitly returns `exit_to_global_dispatcher`;
- the first activation of a local flow is being selected from no active owner;
- a documented safety preemption path requires the safety local dispatcher.

If a local dispatcher exits to global, a `note_information` is mandatory and the
global dispatcher may consume it on the next routing decision.

## Runtime Requirement

If `readActiveFlowState(temp_memory)` returns a retained active local flow:

- do not call the global dispatcher LLM;
- do not call `runDispatcher` with an LLM runner;
- do not use global skill signals to replace the active owner;
- build only a neutral runtime `TurnFrame` needed by shared lanes;
- preserve `active_skill_state` until the local flow returns a valid close,
  exit, safety transition, or allowed handoff.

The neutral `TurnFrame` may contain:

- ids for the current turn;
- user/channel metadata;
- safety context already computed by the safety layer;
- empty `skill_signals`;
- empty `direct_effects`;
- minimal memory plan.

It must not contain a new global semantic route decision.

## Local Dispatcher Responsibility

The active local dispatcher owns:

- whether the message continues the current flow;
- whether the user is correcting, confirming, refusing, or stopping;
- whether the message is insufficient;
- whether the user clearly changes subject;
- whether `exit_to_global_dispatcher` is required;
- whether `safety_preempt` is required;
- the `note_information` for any dispatcher change.

The visible agent must receive only the local reducer's
`visible_task.conversation_context`.

## Direct Effects Are Not Global Dispatcher Ownership

Transverse direct effects can still run while a local flow owns the turn.

Example:

```txt
active flow: product_help
user: "Est-ce que je peux modifier une carte d'attaque ? Et rappelle-moi demain a 9h."
```

Expected path:

```txt
active product_help state
-> skip global dispatcher LLM
-> direct-effect lane may handle create_one_shot_reminder
-> product_help local dispatcher answers the product question
```

The one-shot reminder lane may parse and commit the reminder, but it does not
become the dispatcher owner and it must not clear the active local flow.

## Product / Coaching / Tool Signals During Active Flow

If the current message contains product, coaching, status, or tool-looking
signals while a local flow is active:

- those signals are context for the local dispatcher;
- they do not authorize the global dispatcher to run;
- they do not replace the active owner;
- they can cause a dispatcher change only if the local dispatcher explicitly
  exits with `note_information`.

## Required Trace

When global dispatcher is skipped because a local flow is active, trace must
make that visible.

Minimum trace fields:

```txt
dispatcher_run.prompt_version = dispatcher_skipped_active_local_flow_v1
dispatcher_run.model_used = null
dispatcher_run.tokens_in = 0
dispatcher_run.tokens_out = 0
route_decision.active_flow_arbitration.decision = continue_active
route_decision.active_flow_arbitration.active_owner = <active skill id>
```

The trace must let QA answer:

- did the global dispatcher LLM run?
- who owned the turn?
- did a direct effect run additively?
- did the local dispatcher exit explicitly?

## QA Invariants

Every runtime implementation must have tests proving:

- active local flow skips global dispatcher LLM;
- active local flow keeps the active owner by default;
- direct effects can still run additively without global dispatcher ownership;
- product/status/coaching-looking text does not steal ownership;
- local `exit_to_global_dispatcher` is the only normal way to return to global;
- `note_information` exists for every dispatcher change;
- active state is not cleared by global signal detection;
- old active states remain readable or exit/clarify cleanly.

## Anti-Patterns

Do not:

- call the global dispatcher "just to build a TurnFrame" during an active local
  flow;
- run a global LLM pass and then ignore most of it;
- let global `skill_signals.product_help` take ownership from an active flow;
- let global `direct_effects` be the only way to expose one-shot reminders
  during local flow turns;
- clear active state because another skill signal is high confidence;
- allow a visible agent to decide that ownership changed.
