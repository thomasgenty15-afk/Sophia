# 2026-06-08 - safety_crisis local flow implementation - r1

## Scope

Implemented `safety_crisis` local dispatcher + safety reducer visible task +
stage-specific visible agent integration.

## Covered

- Local dispatcher JSON normalizer keeps missing facts as `null`.
- Dispatcher output rejects tooling/mutation claims.
- Reducer escalates immediate danger and means-nearby-alone cases.
- Vague exit does not resolve.
- Resolved exit requires prior `exit_check`, no immediate danger, means safe,
  and human support / not alone.
- Product/tool attempt during safety maps to `product_tool_boundary`, keeps
  safety active, and produces no requested/allowed/committed effects.
- Legacy safety tests still pass through the old intake fallback path.

## Commands

```sh
deno check supabase/functions/sophia-brain/skills/safety_crisis/contract.ts supabase/functions/sophia-brain/skills/safety_crisis/intake.ts supabase/functions/sophia-brain/skills/safety_crisis/local_dispatcher.ts supabase/functions/sophia-brain/skills/safety_crisis/reducer.ts supabase/functions/sophia-brain/skills/safety_crisis/visible_agent.ts supabase/functions/sophia-brain/skills/safety_crisis/skill.ts supabase/functions/sophia-brain/skills/safety_crisis/local_flow_test.ts supabase/functions/sophia-brain/router/safety_crisis_runtime.ts supabase/functions/sophia-brain/router/recommendation_runtime_support.ts
deno test supabase/functions/sophia-brain/skills/safety_crisis/local_flow_test.ts
deno test --filter safety_crisis supabase/functions/sophia-brain/skills/skills_s3.test.ts
```

## Result

PASS.

## Notes

No Supabase DB reset, destructive SQL, DB write, or durable effect execution was
used in this QA run.
