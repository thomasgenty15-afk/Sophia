# Checklist - tools_deactivate_action_staging

## Dedicated user

- Slot: `6`
- Email: `user-deactivate-tool-staging@sophia-test.local`
- Config file: `frontend/eval/config/eval_fixed_users_real_staging.json`

## Pre-run reset expectations

- `user_chat_states`:
  - `current_mode = companion`
  - `investigation_state = null`
  - `temp_memory = {}`
- `chat_messages`: empty for the dedicated user/scope
- `turn_summary_logs`: empty for the dedicated user
- `user_checkup_logs`: empty for the dedicated user
- `user_actions`: exactly 2 active actions
  - `Lecture` (`status=active`)
  - `Marche 15 min` (`status=active`)

## Run expectations

- Runner mode: `no-bilan`
- Scenario: `tools_deactivate_action_v2_ai_user`
- Variant: `hard_12t`
- Model: `gemini-2.5-flash`
- Slot: `6`

## Post-run expectations

- Post-run reset succeeds with no DB error.
- Dedicated user can be re-run immediately.
- Slots are not blocked by stale `running` rows for this user.

