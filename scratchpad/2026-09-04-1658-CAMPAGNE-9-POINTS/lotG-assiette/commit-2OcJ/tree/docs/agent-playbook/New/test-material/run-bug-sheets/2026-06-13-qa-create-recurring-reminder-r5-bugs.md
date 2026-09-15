# 2026-06-13 - QA create recurring reminder r5 - Bug sheet

## R5-B01

- Bug id: `R5-B01`
- Tours: 5
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention / interruption policy
- Domaine owner: active flow arbitration / router handoff policy
- Source amont: `router/run.ts` clears `active_tool_skill_id=create_recurring_reminder` on `active_handoff_action.type=cancel_handoff` before the local dispatcher runs.
- Symptome visible: none blocking. Sophia leaves the reminder aside and starts prioritizing the day.
- Preuve systeme: T5 trace shows `active_tool_skill_id=create_recurring_reminder` at `read_active_flow_state`, then `active_handoff_action.type=cancel_handoff` and `skill_signals.exit.create_recurring_reminder.detected=true`. Before `before_run_conversation_routers`, the active flow is already cleared. The final handler is `adjust_plan_item`; no `create_recurring_reminder.local_dispatcher` output exists for T5.
- Correction attendue: when a local flow is active, do not let global handoff arbitration clear it directly. Route the current message to the local dispatcher first. The local dispatcher must produce `exit_to_global_dispatcher` with `note_information`; only then can the global dispatcher/new local dispatcher consume the handoff.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/router/handoff_flow_arbitration.ts`, `supabase/functions/sophia-brain/router/run.ts`, `supabase/functions/sophia-brain/router/handoff_flow_arbitration_test.ts`
- Tests requis: integration assertion for active `create_recurring_reminder` + message "laisse ce rappel de côté, aide-moi à prioriser" proving `selected_handler=create_recurring_reminder` first, `local_dispatcher.flow_action=exit_to_global_dispatcher`, `local_reducer.exit_to_global_dispatcher=true`, and `note_information.target_dispatcher=global` before any `adjust_plan_item` handoff.
- Tests executes: `/usr/local/bin/deno test supabase/functions/sophia-brain/router/handoff_flow_arbitration_test.ts`; `/usr/local/bin/deno test supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts`; `/usr/local/bin/deno check supabase/functions/sophia-brain/router/handoff_flow_arbitration.ts supabase/functions/sophia-brain/router/handoff_flow_arbitration_test.ts supabase/functions/sophia-brain/router/run.ts`; `/usr/local/bin/deno fmt --check supabase/functions/sophia-brain/router/handoff_flow_arbitration.ts supabase/functions/sophia-brain/router/handoff_flow_arbitration_test.ts supabase/functions/sophia-brain/router/run.ts`
