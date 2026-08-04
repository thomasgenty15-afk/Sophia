# Read Active Flow State Canonical Ownership Contract

## Purpose

This contract applies to the global dispatcher, conversation routers, local
dispatchers, and any runtime code that reads or writes active local flow state.

`readActiveFlowState(temp_memory)` is the canonical source for active flow
ownership at the beginning of a turn.

If it returns an active local flow, the turn is owned by that flow until the
flow itself exits, completes, hands off through an allowed contract, or safety
preempts.

## Core Rule

The global dispatcher may detect many signals in the current user message, but
it must not silently replace an active flow owner.

```txt
temp_memory
-> readActiveFlowState(temp_memory)
-> active_skill_state
-> selected local owner
-> local dispatcher decides next visible step or explicit exit
```

If `readActiveFlowState` returns:

```ts
{
  activeSkillState: {
    skill_id: "coaching_recommendation",
    status: "active",
    working_state: {}
  }
}
```

then the current turn belongs to `coaching_recommendation`.

A global product/status/tool signal in the same turn is only contextual input
unless the active flow explicitly exits or safety preempts.

## Ownership Is Not Recomputed By Product Signals

Product help is a standalone route only when no active flow owns the turn.

Valid standalone path:

```txt
readActiveFlowState -> null
global dispatcher detects product question
router selects product_help
```

Invalid path:

```txt
readActiveFlowState -> coaching_recommendation active
global dispatcher detects product question
router selects product_help directly
```

If the user asks a product/navigation question about a feature that the active
flow just recommended, the active local dispatcher must handle it inside its own
flow, usually through a platform guidance visible step.

Example:

```txt
Previous turn: coaching_recommendation recommends attack_card
User: "Je la trouve ou dans Sophia ?"
Expected owner: coaching_recommendation
Expected visible step: explain_platform_destination
Forbidden owner: product_help
```

## Runtime Responsibilities

### Turn Runtime

At the start of each user turn, runtime must:

1. load `temp_memory`;
2. call `readActiveFlowState(temp_memory)`;
3. pass `activeSkillState` to the global dispatcher and router;
4. pass the same `activeSkillState` to the selected local skill context;
5. persist the next active state when the local skill returns `continue`;
6. clear the active state only on `complete`, `exit`, explicit allowed handoff,
   or safety preemption.

The active state must not be cleared merely because the current user message has
a product help, status, tool, or direct-effect signal.

### Global Dispatcher / Router

The global router must treat `activeSkillState` as ownership evidence.

When `activeSkillState.skill_id` names a retained local conversation flow, the
router should route to that owner unless:

- safety risk is high or critical;
- the active flow state is invalid or closed;
- the active flow produced an explicit exit in a previous step;
- the user is answering a pending confirmation owned by another runtime lane.

Global skill signals can still be kept in `turn_frame` for local dispatcher
context, but they must not become the visible owner by themselves.

### Local Dispatcher

The local dispatcher owns:

- whether the current message stays in the flow;
- which visible step handles it;
- whether an explicit exit is needed;
- the `note_information` when exit is needed.

The local dispatcher must not rely on product help as a shortcut for questions
that are inside its flow responsibility.

For example, `coaching_recommendation` must answer platform guidance for:

- `adjust_plan`;
- `attack_card`;
- `defense_card`;
- `state_potion`.

It should receive canonical product guidance for those features and route to
its own platform guidance visible agent.

## Required Active State Shape

Runtime active state must contain enough information for the next turn to resume
the local flow:

```ts
{
  version: 1,
  skill_id: "coaching_recommendation",
  status: "active",
  turn_count: 1,
  started_at: "...",
  updated_at: "...",
  working_state: {
    coaching_recommendation_local_state: {}
  }
}
```

Equivalent retained local flow ids are allowed only if
`readActiveFlowState` recognizes them.

## Exit Requirement

A flow can lose ownership only through an explicit runtime event:

- `complete`;
- `exit`;
- `safety`;
- an allowed handoff contract documented for that flow.

No local flow should disappear because:

- the next user message looks like product help;
- a product/status/tool signal is high confidence;
- a direct effect ran in parallel;
- a visible agent answered a navigation question;
- the global dispatcher found a different possible route.

If ownership changes, there must be traceable evidence:

```txt
previous owner
-> local dispatcher exit decision
-> note_information or safety preemption
-> new owner
```

## Direct Effects

Direct effects are additive to active flow ownership.

If the user asks for a one-shot reminder while a local flow owns the turn:

```txt
readActiveFlowState -> active flow
direct-effect lane handles reminder
active local dispatcher handles remaining need
visible agent can confirm committed effect and continue the local answer
```

The direct-effect lane must not clear or replace the active flow unless a
documented explicit exit occurs.

## Anti-Patterns

Do not:

- route to `product_help` only because the current message asks "where is it?"
  when the referent is a feature recommended by an active flow;
- clear `__active_skill_state` or the canonical active state on a normal
  continuation;
- use `note_information` from a previous flow as active ownership;
- let a visible agent decide that another flow owns the turn;
- let a local dispatcher create undocumented handoffs to product help;
- treat product help as the fallback owner for any platform destination question.

## QA Regression Example

Bug shape:

```txt
Previous turn:
response_owner = coaching_recommendation
skill_run.status = continue
recommendation = attack_card

Current user:
"Ok, et si je veux preparer cette carte d'attaque moi-meme, je la trouve ou dans Sophia ? Ne cree rien depuis le chat."

Bad trace:
response_owner = product_help
route_reason = product_help_signal
active_owner = none
```

Expected trace:

```txt
readActiveFlowState -> coaching_recommendation
response_owner = coaching_recommendation
route_reason = active_coaching_recommendation
visible_task = explain_platform_destination
durable_effect = none
```

## Required Tests

Every flow that persists active ownership should have tests for:

1. after `status=continue`, active state is written in `temp_memory`;
2. `readActiveFlowState(temp_memory)` returns the active skill;
3. a product help signal does not replace the active owner;
4. a direct effect does not replace the active owner;
5. active state is cleared only on `complete`, `exit`, or safety preemption;
6. product/navigation follow-ups inside the active flow are handled by a local
   visible step, not by standalone `product_help`.

Minimum regression test:

```ts
const active = readActiveFlowState(tempMemory);
const decision = runConversationRouters({
  turn_frame: productHelpLikeTurnFrame,
  active_skill_state: active.activeSkillState,
  safety_context_risk_band: "none",
});

assertEquals(decision.response_owner, "coaching_recommendation");
```

## Implementation Pointers

Relevant runtime files:

- `supabase/functions/sophia-brain/router/active_flow_state.ts`
- `supabase/functions/sophia-brain/router/run.ts`
- `supabase/functions/sophia-brain/routers/routers.ts`

Relevant local flow example:

- `supabase/functions/sophia-brain/skills/coaching_recommendation/local_flow.ts`

Any agent modifying routing, direct effects, product help, or local dispatcher
state must verify this contract before changing ownership behavior.
