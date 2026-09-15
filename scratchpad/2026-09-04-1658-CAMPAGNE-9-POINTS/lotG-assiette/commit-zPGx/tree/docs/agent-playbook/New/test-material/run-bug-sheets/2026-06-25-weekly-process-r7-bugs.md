# Weekly Process R7 - Bug Sheet

## Run

- Date: 2026-06-25
- Run id: `weekly-qa-20260625-r7-partial_habits_mission_partial`
- Rapport:
  `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-25-weekly-process-r7.md`
- Verdict global: red

## Bugs

### R7-B01 - Demande de recommandation routee en synthese

- Bug id: R7-B01
- Tours: T3-T4
- Famille: BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee
- Domaine owner: `weekly_adaptive_review_v1`
- Source amont: local dispatcher, selection de `visible_task`
- Symptome visible: quand le user demande "quoi noter precisement / ou le
  faire", Sophia repete d'abord la synthese; puis elle fournit la phrase utile
  mais reste en `weekly_synthesis` et ajoute un recap non demande.
- Preuve systeme: T3 `visible_task=weekly_synthesis`,
  `flow_action=recap_weekly`, `adjust_recommendation.status=none`; T4
  `adjust_recommendation.status=surfaced`, `safe_to_surface=true`, mais
  `visible_task=weekly_synthesis`.
- Correction attendue: quand la demande porte sur la suite et que la
  recommandation peut etre remplie avec confiance >= 0.95, selectionner
  `visible_task=weekly_adjust_recommendation`.
- Statut: fixed
- Fix reference: `supabase/functions/sophia-brain/skills/weekly_review/local_flow.ts`, test `weekly reducer routes safe new adjust recommendation to visible adjust agent`
- Tests requis: test dispatcher/reducer sur demande "quoi noter pour le prochain
  niveau"; run IA reel verifiant `weekly_adjust_recommendation` et absence de
  recap non demande.

### R7-B02 - Completion weekly bloquee en synthesis malgre demande explicite de cloture

- Bug id: R7-B02
- Tours: T5-T6
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `weekly_adaptive_review_v1`
- Source amont: reducer/gates `weekly_review_completion_requires_synthesis`
- Symptome visible: le user demande de cloturer sans repeter le conseil; Sophia
  repete la recommandation, reste en `weekly_synthesis`, et ne termine pas le
  weekly.
- Preuve systeme: T5-T6 `flow_action=complete_weekly_no_change`,
  `reason_code=weekly_review_completion_requires_synthesis`,
  `visible_task=weekly_synthesis`; final DB `status=open`, `stage=synthesis`,
  `closure_status=complete`, `synthesis_status=captured`,
  `validation_unlock.status=locked_until_weekly_complete`.
- Correction attendue: si `synthesis_visible_status=rendered` et le user demande
  explicitement la cloture, ne pas forcer `weekly_synthesis`; selectionner
  `weekly_closure`, finaliser `status=completed`, et debloquer
  `validation_unlock`.
- Statut: fixed
- Fix reference: `supabase/functions/sophia-brain/skills/weekly_review/local_flow.ts`, tests `weekly reducer completes closure when synthesis was already rendered` et `weekly reducer still blocks completion when synthesis was not rendered`
- Tests requis: test reducer avec `synthesis_visible_status=rendered`,
  `adjust_recommendation.surfaced_in_weekly=true`, demande de cloture; rerun IA
  reel qui verifie absence de repetition et validation disponible.
