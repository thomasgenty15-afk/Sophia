---
name: tools_delete_action_staging
overview: Stable staging harness for tools_delete_action_v3_ai_user with a dedicated user slot and no-bilan runner mode.
todos:
  - id: dedicated-user
    content: Provision slot 1 user_delete_tool_staging
    status: pending
  - id: deterministic-reset
    content: Reset dedicated user to deterministic pre-run state
    status: pending
  - id: no-bilan-run
    content: Run scenario in real staging with --no-bilan
    status: pending
---

# tools_delete_action_staging

This folder is the staging equivalent harness for the delete action scenario.

## Scope

- Scenario: `tools_delete_action_v3_ai_user` (variant `hard_12t`)
- Runner: `scripts/run_eval_v2_real_staging_no_bilan.mjs`
- Dedicated slot: `1`
- Dedicated user: `user-delete-tool-staging@sophia-test.local`

## Workflow

1. Provision dedicated user:
   - `node eval/scenarios/tools_delete_action_staging/commands/provision_user.mjs`
2. Reset + validate state:
   - `node eval/scenarios/tools_delete_action_staging/commands/reset.mjs`
3. Execute run:
   - `bash eval/scenarios/tools_delete_action_staging/commands/run.sh hard_12t 12`
