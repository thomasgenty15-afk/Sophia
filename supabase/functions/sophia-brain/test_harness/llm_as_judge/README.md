# llm_as_judge

A real LLM judge: a real model call, four written rubrics loaded from `rubrics/*.md` at runtime,
over English cases that carry their own ground truth.

## What was here before (read this before trusting an arborescence again)

Until W11 this directory contained a `runner.ts` that **called no model**. `heuristicJudge` was a
handful of French regexes — `/suicide|me tuer/`, `/abonne-toi|achete/` — scoring 30 near-identical
French fixtures out of 10, beside a `rubrics/` folder holding one README and zero rubrics. The
tests were green. The file tree said "we have a judge".

That is not a gap, it is an architectural lie, and it is more expensive than having nothing: a
green signal standing where a real one belongs stops anyone from looking.

## Layout

| file | what it is |
|---|---|
| `rubrics/*.md` | the four rubrics, in English, read from disk on every run |
| `rubrics/index.ts` | loader — throws if the directory and `RUBRIC_IDS` disagree either way |
| `case.ts` | what a case is: transcript + effect ledger + plan + restriction flag |
| `runner.ts` | prompt assembly, response parsing, evidence grounding, calibration |
| `provider_gemini.ts` | the model call (and `scriptedJudgeProvider` for offline tests) |
| `runner_test.ts` | offline: loader, tokens, evidence check, calibration counters |
| `live_test.ts` | the real round-trip. Skips loudly without `GEMINI_API_KEY` |
| `cli.ts` | run it by hand, print or write the markdown report |

## The three things that make it an instrument rather than a vibe

**1. Ground truth is supplied, never inferred.** Each case carries `committed_effects` — the rows
that exist after the turn. An empty list means nothing was written. "Was there a row?" is a
lookup, not an impression. The same holds for `restriction_flag`: it is the output of
`_shared/keel/restriction_guard.ts`, deterministic, and the judge does not get a vote on it.

**2. Evidence is verified.** A `fail` must quote the offending sentence character-for-character.
`assertQuoteIsGrounded` checks the quote really is in the assistant turn and **throws** when it is
not. A judge that can invent a violation is a random number generator with a rationale attached.

**3. The judge is measured too.** Every scenario ships `should_fail` cases with the rubric that
must catch them. `calibrate()` reports `false_negatives` (the judge went blind — the previous
implementation's permanent state) and `false_positives` (the judge cries wolf, which teaches
people to ignore red). `live_test.ts` fails on a single false negative.

## Running it

```bash
cd supabase/functions

# offline (part of the default net — no key, no network)
deno test --allow-env --allow-read --allow-net sophia-brain/test_harness/

# live, real model
GEMINI_API_KEY=... deno test --allow-env --allow-read --allow-net \
  sophia-brain/test_harness/llm_as_judge/live_test.ts

# by hand, with a report file
GEMINI_API_KEY=... deno run --allow-env --allow-read --allow-net --allow-write \
  sophia-brain/test_harness/llm_as_judge/cli.ts --out=/tmp/judge.md
```

Model: `gemini-3.1-pro-preview` by default, `KEEL_JUDGE_MODEL` to override, `temperature: 0`.
No fallback model — a report whose rows came from two different models measures nothing.

## What this is not

**It is not the safety floor.** The floor is `_shared/keel/restriction_guard.ts` (pure,
deterministic, with no input a model could use to lower it) plus the property tests in
`../keel_properties/`. A model judging a model is an instrument with variance: excellent at
catching regressions in tone, framing and reasoning, and never the thing that stands between a
student and harm. If a rule can be stated deterministically, it belongs in a property test, and
the rubric is only there to catch the ways prose slips around it.
