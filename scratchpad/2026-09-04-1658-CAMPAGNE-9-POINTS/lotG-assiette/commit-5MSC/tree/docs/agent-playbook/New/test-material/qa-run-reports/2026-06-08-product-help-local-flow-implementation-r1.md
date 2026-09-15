# 2026-06-08 - product_help local flow implementation r1

## Scope

- Implemented `product_help.local_dispatcher` contract/runtime.
- Added non-mutating reducer and standalone lightweight state.
- Added visible prompt agent for product help stages.
- Integrated nominal `runProductHelpSkill` path with local dispatcher + visible agent.
- Preserved inline parent flow state and standalone active product_help ownership.

## Verification

- `deno check supabase/functions/sophia-brain/skills/product_help/local_flow_test.ts supabase/functions/sophia-brain/skills/product_help/local_flow.ts supabase/functions/sophia-brain/skills/product_help/visible_agent.ts supabase/functions/sophia-brain/skills/product_help/skill.ts supabase/functions/sophia-brain/router/conversation_route_runtime_support.ts supabase/functions/sophia-brain/router/recommendation_runtime_support.ts supabase/functions/sophia-brain/routers/active_flow_arbitrator.ts supabase/functions/sophia-brain/router/safety_crisis_runtime.ts supabase/functions/sophia-brain/router/active_flow_state.ts`
- `deno test --allow-env --allow-read supabase/functions/sophia-brain/skills/product_help/local_flow_test.ts`
- `deno test --allow-env --allow-read supabase/functions/sophia-brain/router/active_flow_state_test.ts`

## Notes

- Full `routers.test.ts` was not used as pass/fail evidence because an existing `tool_skill_router covers start, continue, confirmation paths, blocked and none` assertion fails without diffs in the router files touched for this implementation.
- No Supabase DB writes or destructive commands were run.

