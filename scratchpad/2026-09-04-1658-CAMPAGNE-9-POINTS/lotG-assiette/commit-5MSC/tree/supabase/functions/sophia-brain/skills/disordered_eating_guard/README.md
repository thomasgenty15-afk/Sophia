# `disordered_eating_guard`

Clinical guard flow for restrictive / compensatory eating. BUILD_PLAN **W3.2**.

## Why it exists

The KEEL product loop — a prescribed food plan, a derived adherence score, a daily
check-in — is category-1 risk in the CDT/Stanford report on AI and eating disorders.
NEDA's "Tessa" was pulled after giving weight-loss advice to people in treatment.
Before this lot the repo had **zero** eating-disorder detection of any kind.

## Shape

```
_shared/keel/restriction_guard.ts     deterministic floor: 4 triggers -> restriction_flag
        |                             (pure, zero imports, no model can lower it)
        v
routers/routers.ts                    restriction_flag owns the turn, under safety_crisis,
        |                             above every pressure lane
        v
reducer.ts                            deterministic transitions (folded lexicon, no model)
        v
visible_agent.ts                      model writes ONE sentence, then a deterministic
        |                             validator rejects any figure or metric word
        v
skill.ts                              output + the immediate coach escalation
```

## What makes it different from `safety_crisis`

| | `safety_crisis` | `disordered_eating_guard` |
|---|---|---|
| signal | suicidal / self-harm | restriction, compensation |
| resources | emergency + suicide line | ED helpline (NEDA / Beat / ABIE) + coach |
| method | triage questions | no triage, no numbers, no plan |
| end | resolves when safe | the conversation closes; the **suspension does not** |

When both signals are present, `safety_crisis` wins (routers.ts branch order).
The validator in `visible_agent.ts` actively **rejects** a suicide line emitted
from this flow — the separation is enforced, not documented.

## The invariant

**It never states a number.** Not a calorie, a weight, an adherence figure, a
percentage, a streak, or "you logged 2 of 7 days" — not even to say those things
are paused. Quantifying *is* the pressure. Enforced after generation by
`validateVisibleMessage`: every digit is rejected except a helpline contact
resolved from `resources.ts`, and a short list of metric words is rejected even
without a figure. Failure or rejection falls back to a fixed message, so the turn
is never silent and never a raw model output.

## Not wired yet (W4)

`skill.ts` reads `context.disordered_eating_guard_runtime` and throws if it is
missing — the guard result must be computed by the runtime from the DB, never
inferred from the turn frame. Wiring that channel, writing the
`contract_change_requests` row and re-reading it (execution truth) is W4.

## Resources

`resources.ts` holds **no seed**. It is a thin adapter over
`_shared/keel/crisis_resources.ts` (W3.3), pinning `kind='eating_disorder'` and
shaping rows for the reply path. That module is the single source of truth,
mirrored from the `crisis_resources` migration and drift-tested against it — a
second hardcoded helpline list here would be a second thing to go stale, on data
where stale means sending someone to a number that no longer answers.

The registry never returns empty: an unserved country degrades onto the
documented `ZZ` international directory, loudly (`fallbackUsed` travels into the
visible task and the skill diagnosis, and W3.3 logs it).
