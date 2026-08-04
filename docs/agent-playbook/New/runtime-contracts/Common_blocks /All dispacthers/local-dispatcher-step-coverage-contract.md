# Local Dispatcher Step Coverage Contract

## Purpose

This contract is for agents responsible for a local flow dispatcher.

Before changing or creating a local dispatcher, the agent must verify that the dispatcher covers every step required to satisfy the flow responsibility, and that each visible agent receives the specific context needed for its step.

The local dispatcher is not only a router. It owns the flow progression.

## Core Principle

A local dispatcher must ensure step coverage:

1. It understands the user's need inside the scope of the flow.
2. It identifies what information is missing.
3. It selects the next useful step.
4. It provides a step-specific context pack to the visible agent.
5. It can relaunch a previous step when the data is not good enough.
6. It exits only when the flow has satisfied its responsibility.

The visible agent must not infer the flow plan by itself. It renders the step chosen by the local dispatcher.

## Responsibility Split

### Global Dispatcher

The global dispatcher owns:

- top-level intent detection;
- flow selection;
- initial dispatcher signal;
- high-level reason for entering the flow;
- stable context that must survive until flow exit.

### Local Dispatcher

The local dispatcher owns:

- local flow state;
- current step selection;
- missing information detection;
- step coverage;
- recommendation or decision logic when the flow requires it;
- visible agent context assembly;
- relaunch conditions;
- exit, close, or handoff conditions.

### Visible Agent

The visible agent owns only:

- user-facing wording;
- tone and clarity;
- the exact response for the selected step.

The visible agent must not decide:

- which step comes next;
- which feature, tool, or product surface should be recommended;
- which cause analysis is correct;
- whether the flow should exit;
- whether another flow should take over.

## Required Local Dispatcher Output

Each local dispatcher turn must produce an explicit visible task contract.

Recommended shape:

```ts
visible_task: {
  kind: string;
  instruction: string;
  flow_context: Record<string, unknown>;
  step_context: Record<string, unknown>;
}
```

If the codebase uses another field name, the same information must still exist:

- the selected visible step;
- the dispatcher instruction for this step;
- stable flow context;
- step-specific context.

## Flow Context Requirements

`flow_context` is the stable context that must remain available from flow entry to flow exit.

It should include, when relevant:

- original user words;
- global dispatcher signal;
- reason for entering the flow;
- selected flow type;
- action context;
- emotional context;
- feature opportunity context;
- user profile or preference context;
- already known facts;
- previous local dispatcher decisions;
- last visible answer summary.

This context must be safe for visible agents to read. Do not pass internal-only implementation details unless the visible agent needs them to produce the answer.

## Step Context Requirements

`step_context` is the local, step-specific package that tells the visible agent what to do now.

It must include:

- the objective of this visible step;
- the specific facts the visible agent should use;
- the missing fields if the step is a clarification;
- the selected recommendation or hypothesis if the step explains or recommends;
- the platform destination if the step guides the user;
- any forbidden moves for this step.

Each visible step must have a documented input contract. Generic context summaries are not enough.

## Step Coverage Audit

For every local flow, the responsible agent must fill this grid before implementation.

| Flow need | Visible step | Required context | Relaunch condition | Completion condition | Forbidden visible decisions |
| --- | --- | --- | --- | --- | --- |
| What user need must be satisfied? | Which visible task handles it? | What data must the visible agent receive? | When should dispatcher run this step again? | When is the step done? | What must the visible agent not decide? |

No flow should ship with an empty or implicit step coverage map.

## Required Checks

For each local dispatcher, verify:

1. The flow responsibility is explicit.
2. The success criteria are explicit.
3. Every user need inside the flow maps to a visible step.
4. Every visible step has a dedicated `step_context`.
5. The original global dispatcher signal remains available until exit.
6. The dispatcher can relaunch a step when the answer or data is insufficient.
7. The dispatcher can move forward when the step is complete.
8. The dispatcher defines clear exit or handoff conditions.
9. The visible agent cannot silently take over dispatcher decisions.
10. Tests cover the main step transitions and context propagation.

## Relaunch Rules

A local dispatcher may relaunch a visible step when:

- required data is missing;
- the user corrects the hypothesis;
- the visible answer did not satisfy the step objective;
- the user asks for clarification about the current step;
- the selected recommendation is no longer compatible with new information.

Relaunching a step is valid only if the dispatcher updates the context that caused the relaunch.

## Exit Rules

A local dispatcher may exit when:

- the flow objective is satisfied;
- the user explicitly rejects the flow;
- another flow is clearly more appropriate;
- the required action has been handed off to the correct product or tool path;
- the conversation is naturally closed.

The exit note must preserve the useful result of the local flow for the next dispatcher.

## Example: Coaching Recommendation

The coaching recommendation flow should not use one generic visible agent for every answer. Its local dispatcher must cover the needs of the flow step by step.

Example coverage:

| Flow need | Visible step | Required context | Relaunch condition | Completion condition | Forbidden visible decisions |
| --- | --- | --- | --- | --- | --- |
| Understand the difficulty | `difficulty_clarifier` | user words, action context, missing fields | difficulty is vague or action context is missing | difficulty is specific enough | recommend a feature |
| Explain the likely cause | `cause_explanation` | difficulty, cause analysis | user disputes or corrects the cause | cause hypothesis is accepted or usable | choose a product feature |
| Recommend the lever | `feature_recommendation` | cause analysis, recommendation, priority features | recommendation conflicts with new facts | main lever is clear | invent another priority |
| Explain where to find it | `platform_guidance` | platform destination, next step | destination is missing or ambiguous | user knows where to go | promise execution |
| Close or follow up | `close_or_followup` | last answer summary, recommendation | user asks a follow-up | answer is complete or closed | restart the whole flow alone |

## Anti-Patterns

Avoid:

- a single generic visible agent that decides the whole flow;
- passing only a generic `conversation_context`;
- letting the visible agent choose the feature, cause, destination, or exit;
- skipping intermediate needs such as clarification, explanation, guidance, or closure;
- defining steps without relaunch conditions;
- losing the original global dispatcher signal after the first local turn;
- treating product feature opportunities as coaching recommendations when they belong to another flow.

## Test Expectations

Local dispatcher tests should cover:

- selected visible step for each major input type;
- `flow_context` propagation from entry to exit;
- required `step_context` fields for every visible step;
- relaunch behavior when data is missing or corrected;
- exit or handoff behavior;
- visible agent prompt tests that prove visible agents receive dispatcher context and do not own dispatcher decisions.

For doc-only or prompt-only changes, update or add prompt-contract tests when the repository has them.

