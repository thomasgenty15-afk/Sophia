# test_harness

The KEEL QA harness. Five directories, and the honest summary of each.

| directory | what it is | calls a model? |
|---|---|---|
| `personas/` | 2 coaches + 4 students, English. 3 of the students are adversarial eating-disorder personas — the important lot. | no |
| `golden_scenarios/` | the six product moments, each with clean turns AND planted breaches. | no |
| `llm_as_judge/` | a real judge: real model call, four written rubrics, verified evidence. | yes (gated) |
| `keel_properties/` | the three product invariants, asserted by enumeration. | no |
| `conversation_route_replay/`, `latency/` | deterministic routing replay and the latency budget. Pre-existing. | no |

Run everything offline:

```bash
cd supabase/functions
deno test --allow-env --allow-read --allow-net sophia-brain/test_harness/
```

Run the live judge (real model, needs `GEMINI_API_KEY`):

```bash
cd supabase/functions
GEMINI_API_KEY=... deno test --allow-env --allow-read --allow-net \
  sophia-brain/test_harness/llm_as_judge/live_test.ts
```

## What this directory used to claim, and did not do

Before W11, `llm_as_judge/` called **no model**. `heuristicJudge` was a handful of French regexes
scoring 30 near-identical French fixtures out of 10, next to a `rubrics/` folder containing one
README and zero rubrics. Every test was green, and the file tree read "we have a judge".

That is worth naming rather than quietly fixing, because the failure mode generalises: a green
signal standing where a real one belongs is more expensive than no signal, since nobody goes
looking. If you read an arborescence here and conclude a check exists, open the file.

## The division of labour, stated once

**`keel_properties/` decides. `llm_as_judge/` measures.**

Anything expressible as a predicate is a property test — deterministic, exhaustive over its input
space, no key required, part of the default net. The rubrics exist only for the ways prose slips
around a rule that cannot be written as a predicate: tone, framing, whether an escalation actually
escalated. A model judging a model is an instrument with variance. It never stands between a
student and harm; `_shared/keel/restriction_guard.ts` and the property tests do.

Full command list, skips, and the pinned defects: `docs/keel/TESTING.md`.
