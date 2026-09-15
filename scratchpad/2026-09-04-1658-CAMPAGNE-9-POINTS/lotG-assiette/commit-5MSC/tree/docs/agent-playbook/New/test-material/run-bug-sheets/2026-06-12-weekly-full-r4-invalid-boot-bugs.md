# Bug Sheet — Weekly Full R4 Invalid Boot

## Contexte

- Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-weekly-full-r4-invalid-boot.md`
- Run: `weekly-full-20260612-r4-rose`
- Persona: Rose
- Statut global: red
- Cadre: IA reelle locale, `/functions/v1/test-send-message`, `force_full_ai=true`, hors sandbox.

## Bugs

### R4-B01

- Bug id: `R4-B01`
- Tours: Tour 1
- Famille: `BF-TEST-01` — Trace/test incoherent ou suite malsaine
- Domaine owner: `router/adjust_plan_operation_bridge`
- Source amont: import legacy depuis `skills/weekly_review/runtime.ts`
- Symptome visible: Sophia renvoie une reponse vide; l'appel `/functions/v1/test-send-message` retourne `503 BOOT_ERROR`.
- Preuve systeme: `deno check` echoue avec `TS2305: Module ... weekly_review/runtime.ts has no exported member 'isExplicitPendingApplyConfirmation'` sur `supabase/functions/sophia-brain/router/adjust_plan_operation_bridge.ts:14`.
- Correction attendue: supprimer ou remplacer la dependance legacy `isExplicitPendingApplyConfirmation` au niveau du bridge adjust-plan, sans restaurer le vieux flow weekly plan patch et sans fallback visible.
- Statut: `open`
- Fix reference: a renseigner apres correction.
- Tests requis: `deno check` du worker complet; test integration du bridge adjust-plan; scan anti-legacy weekly; rerun weekly full reel Rose avec au moins 8 tours, incluant synthese et cloture.
