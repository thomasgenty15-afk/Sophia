# One-Shot Reminder Transverse Direct Effect Contract

## Purpose

This contract applies to every local dispatcher and global dispatcher path.

`create_one_shot_reminder` is a transverse direct effect. It must remain available in every flow, including safety, feature opportunity, coaching recommendation, product help, weekly review, daily review, and normal reply.

It is not a standalone isolated flow that replaces the rest of the turn.

## Core Rule

Every dispatcher must be able to detect an explicit one-shot reminder request and expose it to the standard direct-effect lane.

The direct-effect lane owns:

- validation of reminder intent;
- time and instruction validation;
- one-shot vs recurring boundary;
- safety/idempotency checks;
- durable commit;
- visible confirmation after commit.

The local dispatcher owns only:

- recognizing that the current user message contains a one-shot reminder request;
- calculating the requested instant as `payload_hint.UTC_time` from the user-facing time/delay, current time, and user timezone;
- preserving the user-facing time as `payload_hint.local_label`;
- preserving the rest of the user message for the active flow;
- passing context forward so the visible agent can answer the non-reminder part.

## Canonical Shared Prompt Block

The executable source of truth is:

```txt
supabase/functions/sophia-brain/router/one_shot_reminder_prompt_contract.ts
```

All dispatcher prompts must consume the shared block from that module or mirror it exactly when a runtime boundary prevents direct import.

### Global Dispatcher Rules

The global dispatcher must apply this canonical rule block:

```txt
direct_effects.create_one_shot_reminder:
- Emit only if the user explicitly asks for a one-time reminder, notification, or programming action, with an actionable time or delay.
- Do not emit for conversational duration or pacing, for example "stay with me for two minutes".
- payload_hint.raw_text must contain the exact reminder clause, not the whole multi-intent message.
- payload_hint.when_hint must contain the actionable time or delay.
- payload_hint.UTC_time must contain the ISO UTC instant calculated from the time/delay, current time, and user timezone. Default timezone: Europe/Paris.
- payload_hint.local_label must contain the user-facing temporal label to display.
- payload_hint.instruction_hint must contain only what should be reminded, without absorbing the other requests in the message.
- If the same message contains a product question and an explicit one-shot reminder request, keep both: skill_signals.product_help for the product question and direct_effects.create_one_shot_reminder for the reminder.
- If the same message contains coaching, feature_opportunity, weekly, or safety plus an explicit one-shot reminder request, keep both: the local skill/flow signal for the remaining need and direct_effects.create_one_shot_reminder for the reminder.
- If create_one_shot_reminder is emitted with a conversational skill signal, the global direct-effect lane owns the effect; the local skill handles only the remaining user need.
- The reminder must never absorb the remaining intent of the turn.
- Never treat a recurring reminder as create_one_shot_reminder.
```

### Local Dispatcher Rules

Every local dispatcher that can own a turn must receive the same local block:

```txt
Canonical create_one_shot_reminder block:
- If the user explicitly asks for a one-time reminder, notification, or programming action with an actionable time or delay, this direct effect must stay available during the local flow.
- A duration/time alone is not enough: it must concern an intended reminder, not conversational pacing.
- Required canonical payload when emitted: `payload_hint.raw_text`, `payload_hint.when_hint`, `payload_hint.UTC_time`, `payload_hint.local_label`, and `payload_hint.instruction_hint`.
- `payload_hint.UTC_time` is the ISO UTC instant the runtime writes as DB `scheduled_for`; the runtime validates it but does not parse `when_hint` to calculate the reminder time.
- If `when_hint`, `UTC_time`, `local_label`, or `instruction_hint` is missing, the dispatcher must not emit `create_one_shot_reminder`.
- If turn_frame.direct_effects contains create_one_shot_reminder, treat it as already flagged by the global dispatcher for the direct lane.
- If the local dispatcher exposes `direct_effect_request`, it must set `direct_effect_request.requested=false` in that case.
- The local dispatcher must not recreate, reroute, re-ask, or confirm this reminder.
- The local dispatcher must continue its active local domain on the remaining user need.
- If direct_effect_lane.committed_effects contains create_one_shot_reminder, the reminder is already committed: pass the confirmation context to the visible agent and continue the remaining need.
- If turn_frame.direct_effects contains create_one_shot_reminder but direct_effect_lane has no commit, never say that the reminder is programmed; let the global runtime handle the effect and continue the remaining need.
- The direct effect must never absorb the whole turn.
- Never treat a recurring reminder as create_one_shot_reminder.
```

### Visible Agent Rules

Every visible agent that may answer after a local dispatcher must receive a canonical confirmation guard:

```txt
- If the local visible context has `one_shot_reminder.committed=true`, the visible agent must naturally confirm the reminder once, use `one_shot_reminder.local_label` for the moment and `one_shot_reminder.reminder_instruction` for the reminder object, then answer the remaining user need.
- The visible agent must not repeat `one_shot_reminder.reminder_instruction` or an equivalent reminder object twice.
- The visible agent must not reformulate the reminder object before and after the time marker.
- If has_committed_one_shot_reminder is not true, the visible agent must never say that a reminder is programmed, created, saved, activated, or done.
- The visible agent must never calculate a displayed time from `UTC_time` or DB `scheduled_for`; it must use `local_label`.
- The visible agent must never recreate, reroute, re-ask, or re-decide a reminder.
```

## Not An Isolated Flow

`create_one_shot_reminder` must work in the general turn pipeline.

If the user says:

> Rappelle-moi a 18h de relire mes notes, et aide-moi aussi a comprendre pourquoi je bloque.

Sophia should not choose between reminder creation and coaching.

Expected behavior:

1. The direct-effect lane handles the reminder.
2. The active or selected flow handles the coaching/product/safety/feature part.
3. The final visible response can confirm the committed reminder and continue answering the rest.

The reminder effect is additive, not exclusive.

## Required Dispatcher Behavior

Every dispatcher must include the shared direct-effect context or an equivalent contract:

```ts
platform_context: withDirectEffectLocalContext(...)
```

Every local dispatcher prompt must communicate:

- `create_one_shot_reminder` is always available;
- a time or duration alone is not enough;
- the user must clearly ask for a reminder, notification, or later prompt;
- recurring/ritual needs are not one-shot reminders;
- the dispatcher must not claim the reminder was created;
- creation can be confirmed only after the direct-effect runtime commits it.

Local prompts must not carry scattered or contradictory one-shot reminder rules.
Flow-specific lines are allowed only when they describe a local output field, for
example Safety's `direct_effect_request`.

## Product Help Rule

Product Help must not block `create_one_shot_reminder`.

If the user asks a product question and also asks for a one-shot reminder:

1. the global dispatcher keeps `skill_signals.product_help`;
2. the global dispatcher also keeps `direct_effects.create_one_shot_reminder`;
3. the direct-effect lane may execute the reminder in the same turn;
4. the Product Help local dispatcher answers only the product need;
5. the Product Help visible agent confirms the reminder only if the shared
   confirmation context says it was committed.

Product Help must not emit a rule saying that one-shot reminders are not a local
Product Help output or that the local dispatcher should send a flagged
one-shot reminder back to the global dispatcher. Once it is in
`turn_frame.direct_effects`, the runtime lane owns it.

## Safety Rule

Safety does not disable `create_one_shot_reminder`.

During safety:

- `create_one_shot_reminder` remains available for explicit one-shot reminder requests;
- other direct effects may remain blocked;
- the safety dispatcher must keep safety ownership;
- the visible safety agent must not confirm creation unless the direct-effect lane has committed the reminder;
- safety support still answers the safety need in the same turn.

## Feature Opportunity Rule

Feature opportunity must not confuse one-shot reminders with `initiatives`.

- A repeated context, ritual, or recurring difficulty can point to `initiatives`.
- An explicit one-time request such as "rappelle-moi a 18h de..." points to `create_one_shot_reminder`.
- If both are present, the reminder is handled by the direct-effect lane and the feature opportunity flow can still recommend `initiatives` for the recurring pattern.

## Coaching Recommendation Rule

Coaching recommendation must not recommend reminders as a coaching feature.

Allowed coaching recommendation features stay:

- `attack_card`;
- `defense_card`;
- `adjust_plan`;
- `state_potion`.

If the user explicitly asks for a one-shot reminder while also needing coaching:

1. the reminder goes to `create_one_shot_reminder`;
2. the coaching dispatcher continues the coaching diagnosis and recommendation;
3. the visible response can include the reminder confirmation only if the direct-effect lane committed it.

## Global To Local Dispatcher Contract

When the global dispatcher emits `create_one_shot_reminder` together with a
conversation skill signal, the direct effect is owned by the global direct-effect
lane for that turn.

The local dispatcher must receive enough context to know:

- the one-shot reminder request was already identified by the global dispatcher;
- if `direct_effect_lane.committed_effects` contains `create_one_shot_reminder`,
  the reminder was already handled and must not be recreated, rerouted, or
  re-asked locally;
- if the direct-effect lane has no commit, the local dispatcher still must not
  claim that the reminder was programmed;
- the remaining non-reminder user need is still active and must be handled by the
  local flow.

The global dispatcher must not let the reminder text absorb the rest of the
message. It should keep the remaining need in the relevant skill signal context
so the local dispatcher can continue the flow.

All local dispatchers that import the common direct-effect prompt block inherit
this rule. Flow-specific prompts may restate it, but must not weaken it.

## Shared Confirmation Context

The runtime must build one shared object after the direct-effect lane runs:

```ts
direct_effect_confirmation_context = {
  has_committed_one_shot_reminder: boolean,
  has_requested_one_shot_reminder: boolean,
  one_shot_reminder: {
    committed: true,
    local_label: string | null,
    reminder_instruction: string | null
  } | null,
  confirmation_text: null,
  committed_effects: [],
  requested_effects: [],
  blocked_effects: [],
  do_not_recreate: true,
  do_not_reroute: true,
  do_not_redemand: true,
  do_not_confirm_without_commit: true,
  remaining_user_need_must_continue: true
}
```

This object is the canonical contract for confirmation and duplication guards.
`confirmation_text`, `committed_effects`, `requested_effects`, and
`blocked_effects` are legacy compatibility fields and must stay empty/null in
visible contexts. The visible-safe reminder fact is `one_shot_reminder`.
It must be available to:

- the local dispatcher, through `turn_frame.direct_effect_confirmation_context`;
- the visible agent selected by a local dispatcher, through its visible context;
- the normal reply agent when no local flow owns the rest of the turn.

`direct_effect_lane` remains the detailed runtime trace. Visible agents should
prefer `direct_effect_confirmation_context` for user-facing confirmation rules.
The runtime must not prepend a deterministic confirmation sentence when a
visible agent is already composing the final answer. It may expose structured
commit facts, but the visible wording belongs to the selected visible agent.

## Visible Agent Context

When a direct effect has run, the visible agent must receive a safe summary:

```ts
direct_effect_confirmation_context
```

The visible agent may use this to:

- acknowledge a committed one-shot reminder;
- avoid duplicate confirmation;
- answer the rest of the user message naturally.

The only user-facing one-shot fields are:

```ts
one_shot_reminder: {
  committed: true,
  local_label: string | null,
  reminder_instruction: string | null
}
```

The visible agent must not:

- decide to create a reminder;
- infer commit success from user intent alone;
- say "c'est programme" without committed effect evidence;
- use `UTC_time`, DB `scheduled_for`, effect `type`, ids, reason codes, or raw effect arrays to phrase the confirmation;
- expose internal names like `create_one_shot_reminder`,
  `direct_effect_lane`, or `direct_effect_confirmation_context`.

## Normal Reply Path

If the global dispatcher routes to `normal_reply` with
`direct_effects_then_normal_reply`, the normal reply agent must still receive
`direct_effect_confirmation_context`.

The runtime must not short-circuit directly to the reminder confirmation unless
the route is truly a pure direct effect. When there is remaining user content,
normal reply must compose:

1. the committed reminder confirmation, if any;
2. the normal answer to the remaining user need.

## Local Dispatcher Detected Reminder Path

Sometimes the global dispatcher is not the component that first identifies the
one-shot reminder. This happens when a local flow already owns the turn and its
local dispatcher sees a new explicit one-shot reminder request.

The required path is:

```txt
active local dispatcher
  -> detects explicit one-shot reminder
  -> exposes create_one_shot_reminder as a direct-effect request/handoff
  -> runtime direct-effect lane validates and commits or blocks
  -> runtime builds direct_effect_confirmation_context
  -> selected visible agent receives direct_effect_confirmation_context
  -> visible response confirms only committed effects and continues the local flow
```

Rules:

- the local dispatcher may identify the reminder request, but it still does not
  execute the reminder itself;
- the reminder must enter the same standard direct-effect lane as global
  dispatcher reminders;
- the visible agent must receive `direct_effect_confirmation_context`, not a
  hand-written claim;
- if the lane commits, the visible agent may confirm the reminder and then handle
  the local flow step;
- if the lane blocks or lacks a commit, the visible agent must not say the
  reminder is programmed;
- the local flow must not lose its current step unless safety or explicit user
  interruption requires it.

Example:

```txt
User, inside safety: "Rappelle-moi dans 30 minutes d'ecrire a Nora, et reste avec moi maintenant."

safety local dispatcher detects create_one_shot_reminder
direct-effect lane commits the reminder
safety visible agent receives direct_effect_confirmation_context
visible answer: confirms the reminder briefly, then continues grounding/safety
```

This is the same confirmation contract as the global-dispatcher path. The only
difference is where the reminder was first detected.

## Expected Final Response Composition

When the reminder commits and another visible answer exists, final response composition should merge both parts.

Example shape:

```text
C'est programme pour 18h : relire tes notes.

Pour le blocage, la piste la plus utile semble etre une carte d'attaque...
```

The reminder confirmation should not erase the active flow answer.

The active flow answer should not ignore the committed reminder.

## Anti-Patterns

Avoid:

- routing one-shot reminders to product help only;
- treating one-shot reminders as `initiatives`;
- treating one-shot reminders as a coaching recommendation feature;
- blocking one-shot reminders during safety by default;
- exiting the active local flow just because a one-shot reminder was detected;
- confirming reminder creation from a local dispatcher or visible agent before runtime commit;
- making `create_one_shot_reminder` a separate isolated flow that prevents the rest of the message from being handled.

## Tests To Add Or Preserve

Each relevant dispatcher should have tests for:

- one-shot reminder plus normal reply;
- one-shot reminder plus product help;
- Product Help route executes the direct-effect lane when
  `direct_effects_to_run` contains `create_one_shot_reminder`;
- one-shot reminder plus coaching recommendation;
- one-shot reminder plus feature opportunity;
- one-shot reminder during safety;
- ambiguous reminder blocked or clarified;
- recurring/ritual context not misclassified as one-shot;
- visible context receives committed direct-effect summary;
- final visible text merges reminder confirmation with the rest of the answer.
