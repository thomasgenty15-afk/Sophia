# Prepare Attack Card Handoff Verify Rerun 2026-06-02 - Bug Sheet

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, connexions QA temporaires, aucun fallback direct `processMessage`, aucune correction pendant le run.

## Bugs

### PAC-VERIFY-20260602-B01

- Bug id: `PAC-VERIFY-20260602-B01`
- Tours: R1 Tour 2, R3 Tour 1
- Famille: `BF-EFFECT-04` - Executor ou fallback technique fragile
- Domaine owner: `prepare_attack_card`
- Source amont: AI intake / draft generator / fallback no-mutation sur le chemin "technique a choisir"
- Symptome visible: Sophia route au bon handler mais repond "Je n'arrive pas à préparer cette carte proprement là" au lieu de produire un handoff plateforme.
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=prepare_attack_card`; R1 route_reason `orientation_clarification_resolved_tool_skill`, R3 route_reason `tool_skill_intent_start`; `response_tool_execution=failed`; `executed_tools=[]`; aucun pending executable; aucun effet durable.
- Correction attendue: quand cible + blocker + `no_create/draft_only` sont presents, le skill doit recommander une technique et livrer `platform_handoff`, meme si la technique n'est pas explicitement nommee.
- Statut: `verified`
- Fix reference: `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/ai_intake.ts`, `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts`, `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts`
- Verification locale: `/usr/local/bin/deno test --allow-env --allow-read --allow-net supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts supabase/functions/sophia-brain/tools/operations/prepare_attack_card/prepare_attack_card_fallback_test.ts` -> 51 passed / 0 failed.
- Verification QA: rerun integration focalise `/functions/v1/test-send-message force_full_ai=true` passe le 2026-06-02 sur `attack_blocking_focus_r1` et `attack_blocking_focus_r2`; rapport `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-prepare-attack-card-blocking-focus-rerun.md`.
- Tests requis: positif post-clarification no-create; positif direct no-technique draft_only/no_create; paraphrase "choisis la technique toi-meme"; anti-faux-positif demande product_help; integration `/test-send-message force_full_ai=true`.

## Verifications Vertes

| Scenario | Preuve | Statut |
| --- | --- | --- |
| Clarification comprendre/preparer | R1 Tour 1 `orientation_clarification`, tutoiement | green |
| Technique explicite `Ancre visuelle` | R2 Tour 1 `platform_handoff`, `executed_tools=[]`, no-mutation | green |
| Aucun effet durable chat | Tous les tours `executed_tools=[]`, aucun `committed_effects` | green |
