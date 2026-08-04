# Prepare Attack Card Platform Fields Rerun Invalid - Bug Sheet

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, run `attack-card-fields-20260603-r1`. Aucun fallback deterministe. Aucun changement de code pendant la tentative.

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-prepare-attack-card-platform-fields-rerun-invalid.md`

## Bugs

### PAC-FIELDS-RERUN-INVALID-B01

- Bug id: `PAC-FIELDS-RERUN-INVALID-B01`
- Tours: Tour 1
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: boot Edge local / module `adjust_plan_item`
- Source amont: double declaration `parseJsonObject` dans `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/generator.ts`
- Symptome visible: `/functions/v1/test-send-message` retourne `503 BOOT_ERROR` avant toute reponse Sophia.
- Preuve systeme: logs `supabase_edge_runtime_Sophia_2`: `worker boot error: Uncaught SyntaxError: Identifier 'parseJsonObject' has already been declared` a `adjust_plan_item/generator.ts:168:1`; recherche locale: declarations `parseJsonObject` aux lignes 87 et 448.
- Correction attendue: dedupliquer ou renommer les helpers JSON du module, verifier que le worker Edge boote, puis relancer un run reel local avec `force_full_ai=true`.
- Statut: `open`
- Fix reference:
- Tests requis: check TypeScript/Deno large couvrant `test-send-message` et `sophia-brain`; rerun QA reel `prepare_attack_card` apres correction.

## Verifications Vertes

| Scenario | Preuve | Statut |
| --- | --- | --- |
| Pas de fallback deterministe | Le run a ete arrete apres `BOOT_ERROR`; aucun renderer/test unitaire utilise comme substitut | green |
| Pas de modification pendant le run | Diagnostic et rapport uniquement | green |
| Cleanup cible | Utilisateur Auth temporaire `524e8eed-9342-465f-a41c-8b429b9f6bc0` supprime via endpoint admin local | green |
