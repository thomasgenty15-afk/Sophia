# Prepare Attack Card Handoff Postfix Rerun - Bug Sheet

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, connexions QA temporaires, aucun fallback direct `processMessage`.

## Bugs

### PAC-POSTFIX-B01

- Bug id: `PAC-POSTFIX-B01`
- Tours: R3 Tour 2
- Famille: `BF-STATE-03` - Draft lifecycle casse
- Domaine owner: `prepare_attack_card`
- Source amont: active handoff state / revision operation_input
- Symptome visible: apres "Rends-la plus simple", Sophia revise bien la carte mais remplace l'obstacle exact "je veux que ce soit parfait avant d'appuyer sur envoyer" par "Piège de démarrage ou d'évitement identifié pendant l'intake."
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=prepare_attack_card`, `route_reason=active_handoff_revise_handoff`, `response_tool_execution=platform_handoff`, `executed_tools=[]`, aucun effet durable.
- Correction attendue: `revise_handoff` doit conserver `target_summary` et `blocker_summary` du handoff actif comme contexte stable, sauf modification explicite par l'utilisateur.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts`; test ajoute dans `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts`
- Tests requis: positif "rends-la plus simple" apres handoff conserve l'obstacle ajoute; paraphrase "plus court"; anti-faux-positif "change l'obstacle"; integration `/test-send-message force_full_ai=true` encore a relancer pour passer `verified`.

## Bugs Verifies Depuis Le Rapport Precedent

| Ancien symptome | Preuve postfix | Statut |
| --- | --- | --- |
| Post-clarification no-create renvoyait un guard durable-effect | R1b Tour 2 livre `platform_handoff`, `executed_tools=[]` | verified |
| `ok cree-la` apres handoff ne devenait pas apply_attempt | R1b Tour 3 route `active_handoff_apply_attempt`, no-mutation | verified |
| Technique explicite `Ancre visuelle` tombait en `technical_blocked` | R2 Tour 1 livre `platform_handoff` complet | verified |
| Direct `draft_only/no_create` sans technique tombait en guard | R3 Tour 1 livre `platform_handoff` avec technique recommandee | verified |
