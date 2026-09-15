# Bug Sheet - qa-always-on-tools-20260611-r1

## R1-B01

- Bug id: `R1-B01`
- Tours: 1, 2
- Famille: `BF-INTAKE-01` - Slot fourni mais redemande
- Domaine owner: `create_one_shot_reminder`
- Source amont: `tools/always_on/one_shot_reminder` intake/time parser/reducer/effect plan
- Symptome visible: Sophia repond "Il me manque le moment exact pour programmer ce rappel" alors que le user donne `demain à 8h40`, puis `vendredi 12 juin 2026 à 08:40, heure de Paris`.
- Preuve systeme: `selected_handler=create_one_shot_reminder`; direct effect high-confidence avec `when_hint`; EffectLedger tour 2 `requested=1`, `blocked=1`, `committed=0`, `reason_code=missing_time`; `scheduled_checkins=[]`.
- Correction attendue: le runtime one-shot doit convertir un `when_hint` exploitable en `scheduled_for` avant executor, ou degrader proprement l'intake sans pretendre que la cible est identifiee. La correction doit rester dans l'owner one-shot, pas dans `run.ts` ni via regex metier.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/time_parser.ts`, `instruction_parser.ts`, `intake.ts`, `executor.ts`, `one_shot_reminder_tool_test.ts`
- Tests requis: positif `demain a HH:mm`, positif date absolue + timezone, paraphrase conversationnelle, anti-faux-positif sans heure, integration EffectLedger prouvant `committed_effects` + `scheduled_checkins`.
- Tests ajoutes/executés:
  - `QA R1: parses explicit tomorrow HH:mm one-shot reminder`
  - `QA R1: parses absolute French date with Paris timezone`
  - `QA R1: parses absolute French date even when instruction is contextual`
  - `QA R1: create runner recovers instruction from context when current turn only gives date`
- Verification locale: `deno test --no-check --allow-env --allow-read supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_tool_test.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_router_test.ts` => 73 passed, 0 failed. `deno check` des fichiers owner `one_shot_reminder` et des entrees `sophia-brain/index.ts`, `router/agent_exec.ts`, `agents/companion.ts` => ok.
- Verification QA reelle: `qa-always-on-tools-20260611-r2` via `/functions/v1/test-send-message`, `force_full_ai=true`, valide le commit `scheduled_checkins` sur `demain à 8h45` et le commit `user_plan_item_entries` pour `track_progress_plan_item`. Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-11-qa-always-on-tools-r2.md`.
