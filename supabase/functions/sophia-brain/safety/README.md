# safety/ — deterministic pregate and the risk-band floor

## What changed (W3.1)

`initialSafetyContext` used to return `risk_band: 'none'` hard-coded with
`dispatcher_llm: false`. Crisis detection rested **entirely** on one LLM call,
with no deterministic floor underneath — and the trace column
`conversation_turn_traces.safety_pregate` stopped being written, which is why
migration `20260625143000` had to drop its `NOT NULL`.

There is now a real pregate. It computes a **floor** from the current user
message, the runtime re-imposes that floor on every frame, and the result is
written back to `safety_pregate`.

## Files

| file | role |
| --- | --- |
| `safety_thresholds.ts` | The band → permissions matrix. **Unchanged, authoritative.** Never inline a band comparison elsewhere. |
| `safety_lexicon.ts` | Data + matching. EN/FR belts, escalators (imminence, means), and the named **disarmament conditions**. Carries the doctrine in its header. |
| `safety_pregate.ts` | The engine. Pure function `runSafetyPregate(message) -> floor`, plus the trace payload builder. |
| `safety_floor.ts` | **The ratchet**: `final = max(llm, floor)`. Single place where the max is taken. |
| `safety_context.ts` | Turn entry point: runs the pregate, publishes the floor, builds the trace. |

## The one rule

```
final_band = max(llm_band, pregate_floor)
```

The LLM may **raise** the band — it sees context the lexicon cannot. It can
never lower it below the floor. Enforced at a single runtime choke point,
`buildTurnFrameForRuntime` (router/run.ts), so a re-dispatch after a local-flow
exit, a repair pass, or a neutral frame cannot bypass it. Tested directly and
exhaustively in `safety_floor.test.ts`, including the full 5×5 band matrix and
the `none`-frame-on-a-critical-message case.

Reason codes and evidence are **unioned**, never replaced: the routers branch on
the exact strings in `DISTRESS_IDEATION_REASON_CODES` (routers/routers.ts), so a
blocked turn must keep the reason for the block.

## Floors

| cluster | floor | with imminence | with means |
| --- | --- | --- | --- |
| `suicidal_intent_active` | `high` | `critical` | `critical` |
| `self_harm_intent` | `high` | `critical` | `critical` |
| `suicidal_ideation_passive` | `medium` | `medium` | `high` |
| `distress_acute` | `low` | `low` | `low` |

The floor sits deliberately **one notch below** the LLM contract band on the
ambiguous clusters (dispatcher rule 1d puts passive ideation / worthlessness /
hopelessness at "medium minimum"): a lexical match carries less evidence than a
context-aware classification, and a floor cannot be argued down. `low` still
matters — it is the band the prompt itself uses to "garder la trace sans rien
bloquer", and it makes the trigger rate measurable.

## Anti-false-positives

Three layers, in order of strength:

1. **Structural** — every belt contains an explicit first-person self referent.
   No bare verb phrase. This is why `tout arreter` / `tout supprimer`, the
   product-frustration idiom the dispatcher prompt spends a paragraph
   disambiguating, is not in the lexicon at all.
2. **Named disarmament conditions** (doctrine P9) — `negation`,
   `quoted_or_reported`, `humor_register`, `historical_distant`,
   `third_party_referent`, `hypothetical_framing`, `task_or_product_referent`,
   `scoped_self_deprecation`, `effort_or_accident_register`. Each belt declares,
   in data, the exhaustive list of conditions that may silence it. The
   scope-based ones are **never** offered to the unambiguous danger-to-life
   belts: "je veux me suicider, mon boulot me detruit" keeps firing.
3. **Fixture corpus** — `safety_pregate.fixtures.ts`, with a third family
   (`PREGATE_KNOWN_LIMITATIONS`) asserted as `none` on purpose so that scope
   creep shows up as a reviewed diff.

Two guards carry their own re-arming condition, and both are tested:

- `negation` does not apply over a control-loss escalator
  ("je sais pas comment ne pas me faire du mal").
- `historical_distant` does not apply when the message carries a present anchor
  ("quand j'etais ado … et ca revient").

French negation is `ne … pas`, never `ne … plus`: `je n'ai plus envie de vivre`
is the aggravated reading and must fire.

## Tests

```
deno test --allow-all supabase/functions/sophia-brain/safety/
```

| file | what it locks |
| --- | --- |
| `safety_pregate.test.ts` | true positives EN + FR, false positives, known limitations, canonical reason codes, escalation, trace shape |
| `safety_pregate.disarm.test.ts` | **P9**: every belt is armed on its probe; every declared condition silences it under a false premise; every condition is reachable; scope disarms stay off the lethal belts |
| `safety_floor.test.ts` | the ratchet: full band matrix, `none`-frame regression, rule-1c cap does not bypass, idempotence |
| `safety_thresholds.test.ts` | the band → permissions matrix (pre-existing) |

## Trace

`safetyPregateTraceForTurn(context)` builds the `safety_pregate` jsonb written on
every routed turn: version, `detected`, `floor_band`, `llm_band`, `final_band`,
`floor_applied`, the belts that fired, and the belts that were **disarmed and by
which condition**. That last field is what makes a red run diagnosable and the
trigger rate measurable against a real denominator.

Once the write has been observed in production, `safety_pregate` can go back to
`NOT NULL` (reverting `20260625143000`).

## Known limitations

Left to the LLM layer on purpose; asserted as `none` in the fixtures so a change
of mind is explicit:

- `tout arreter` / `tout supprimer` — referent-ambiguous (product vs life).
- Means-only messages with no self-directed phrase
  ("programme-moi un rappel a 22h pour prendre tous les cachets").
- Euphemisms with no self referent ("faire une connerie ce soir").
- The floor reads the **current message only** (dispatcher rule 1d-bis a). Trail
  is a separate layer (`conversation_risk_history`); folding it in here would
  build a floor no later message could lower.
