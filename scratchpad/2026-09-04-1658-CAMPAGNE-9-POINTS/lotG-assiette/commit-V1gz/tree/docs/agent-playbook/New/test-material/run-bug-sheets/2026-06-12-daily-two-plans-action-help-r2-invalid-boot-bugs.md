# Bug Sheet - Daily Two Plans Action Help R2 Invalid Boot

## Contexte

- Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-daily-two-plans-action-help-r2-invalid-boot.md`
- Run: `daily-two-plans-action-help-20260612144355-r2`
- Persona: Rose
- Statut global: red
- Cadre: IA reelle locale, `process-checkins`, `whatsapp-webhook`, hors sandbox, pas de renderer deterministe ni fallback.

## Bugs

### R2-B01

- Bug id: `R2-B01`
- Tours: Tours 1 et 2
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: boot `whatsapp-webhook` / `router/adjust_plan_operation_bridge`
- Source amont: import legacy depuis `skills/weekly_review/runtime.ts`
- Symptome visible: Sophia ne repond pas; les deux appels entrants `/functions/v1/whatsapp-webhook` retournent `503 BOOT_ERROR`.
- Preuve systeme: `deno check supabase/functions/whatsapp-webhook/index.ts` echoue avec `TS2305: Module ... weekly_review/runtime.ts has no exported member 'isExplicitPendingApplyConfirmation'` sur `supabase/functions/sophia-brain/router/adjust_plan_operation_bridge.ts:14`.
- Correction attendue: supprimer/remplacer la dependance legacy `isExplicitPendingApplyConfirmation` dans le bridge adjust-plan, sans restaurer le vieux weekly renderer/plan patch et sans fallback visible.
- Statut: `open`
- Fix reference: a renseigner apres correction.
- Tests requis: `deno check` du worker `whatsapp-webhook`; test integration du bridge adjust-plan; rerun daily reel local avec deux plans et deux demandes d'explication separees; verifier absence d'entree daily ou changement occurrence tant que le user demande seulement "c'est quoi l'action ?".
