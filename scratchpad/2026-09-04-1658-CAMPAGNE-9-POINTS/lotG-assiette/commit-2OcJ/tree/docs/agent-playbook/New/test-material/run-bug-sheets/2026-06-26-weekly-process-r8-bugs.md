# Weekly Process R8 - Bug Sheet

## Run

- Date: 2026-06-26
- Run id: `weekly-qa-20260626-r8-partial_habits_mission_partial`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-26-weekly-process-r8.md`
- Verdict global: yellow

## Bugs

### R8-B01 - WorkerAlreadyRetired pendant un tour full AI

- Bug id: R8-B01
- Tours: T3
- Famille: BF-TEST-01 - Trace/test incoherent ou suite malsaine
- Domaine owner: runtime local / Supabase Edge worker
- Source amont: worker local retire pendant la requete
- Symptome visible: HTTP 500, reponse assistant vide.
- Preuve systeme: raw response `WorkerAlreadyRetired: request cannot be handled because the worker has already retired`; DB inchangee apres incident.
- Correction attendue: a surveiller; pas de correction metier weekly requise si incident isole.
- Statut: open
- Fix reference: a renseigner si recurrence
- Tests requis: verifier recurrence sur prochains runs locaux; si recurrent, investiguer runtime/test harness.

### R8-B02 - Premiere cloture visible ne finalise pas l'etat durable

- Bug id: R8-B02
- Tours: T5
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `weekly_adaptive_review_v1`
- Source amont: reducer/gates autour de `weekly_closure`
- Symptome visible: Sophia dit "on s'arrete la pour le weekly", mais l'etat reste ouvert jusqu'au tour suivant.
- Preuve systeme: T5 `visible_task=weekly_closure`, `flow_action=clarify_human_signal`, DB `status=open`, `closure_status=captured`, `validation_unlock.status=locked_until_weekly_complete`; T6 seulement passe `complete_flow` et `validation_unlock.status=available`.
- Correction attendue: quand le user demande explicitement la cloture et que `weekly_closure` est rendu apres synthese visible, finaliser le weekly dans le meme tour.
- Statut: verified
- Fix reference: `supabase/functions/sophia-brain/skills/weekly_review/local_flow.ts` + test `weekly reducer completes visible closure after rendered synthesis even when action clarifies signal`; verified by run `weekly-qa-20260626-r9-partial_habits_mission_partial`
- Tests requis: couvert par R9 T4, attendu observe `status=completed` et `validation_unlock=available` au premier tour de cloture.
