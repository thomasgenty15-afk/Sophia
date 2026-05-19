# Synthese fstress3

| run | verdict | focus |
| --- | --- | --- |
| r1a | yellow/green | future intent no-write, shame no-write, stabilized progress write, one-shot duplicate found then fixed |
| r2b | green | recurring reminder correction + Oui confirmation + durable row |
| r3 | green | adjust_plan_item confirmation + safety side-effect block |
| r4 | green | isolated one-shot without duplicate |

# Matrice skills/tools/operations

| surface | observed |
| --- | --- |
| emotional_repair | r1a, r3 |
| execution_breakdown | r4 |
| product/normal handoff | r2b/r3 neutral closes |
| safety_crisis | r3 |
| track_progress_plan_item | r1a turn 3 |
| create_one_shot_reminder | r4 turn 1 |
| create_recurring_reminder_tool_skill | r2b |
| adjust_plan_item_tool_skill | r3 |

# Matrice dispatcher/router/owner

| case | result |
| --- | --- |
| future progress intent | normal_reply, no tool |
| acute shame + completed action | emotional_repair, no tool |
| stabilized completed action | conversation_handler + track_progress_plan_item |
| recurring correction while pending | pending/tool skill recovered, then execute_confirmed |
| safety after operation | safety owner, side effects blocked |

# Erreurs bloqueuses corrigees

- `track_progress_plan_item` was detected by TurnFrame but not connected to the actual V2 write path.
- One-shot router execution duplicated the existing agent tool path; removed router-side write.
- Recurring reminder intake did not preserve slots across correction turns.
- `réduis cette action` was routed as adjust but not recognized by the operation runtime explicit-edit guard.
- QA durable reader selected stale columns and skipped/failed DB evidence reads.

# Warnings humains

- Some agent replies still ask one extra confirmation after a neutral close.
- One-shot absolute-time text showed local label drift in r1a historical rows, but r4 relative-time path is clean and single-write.

# Warnings systeme

- r1a contains duplicate one-shot durable rows from before the final fix; r4 is the clean verification.
- r2/r2a are exploratory failed reruns kept as raw evidence; r2b is the clean post-fix run.

# Verdict final

green for the fixed surfaces verified in r2b, r3, and r4. r1a remains yellow/green only because it intentionally captured the duplicate bug before the final patch.

# Follow-ups

- Add a direct integration test for one-shot idempotency if the agent tool path becomes easier to invoke without full conversation runtime.
- Consider tightening one-shot absolute local-time formatting in a focused parser test.
