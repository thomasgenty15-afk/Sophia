# Bug Sheet - adjust_plan input coach R1

## Contexte

- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-adjust-plan-input-coach-r1.md`
- Run: `adjust-plan-input-coach-r1`
- Verdict global: red
- Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`.

## Bugs

### R1-B01 - Clarification adjust_plan possédée par orientation globale

- Tours: 1
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: dispatcher / orientation clarification
- Source amont: route decision + clarification ownership
- Symptome visible: Sophia pose une clarification utile, mais hors `adjust_plan_item`.
- Preuve systeme: `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, `route_reason=clarification_required`.
- Correction attendue: router les demandes "je veux ajuster mon plan mais je ne sais pas quoi écrire" vers `adjust_plan_item` en `platform_input_coaching`; le skill pose la clarification légère.
- Statut: `open`
- Fix reference: a definir
- Tests requis: demande vague adjust_plan -> `adjust_plan_item` ou clarification owned by skill; no scope decision; no execution.

### R1-B02 - Résolution de clarification vers execution_breakdown

- Tours: 2
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: orientation clarification resolver / dispatcher
- Source amont: mapping de résolution après clarification
- Symptome visible: après "découper et alléger", Sophia donne une micro-action à faire maintenant au lieu de formuler l'input Plan.
- Preuve systeme: `response_owner=conversation_handler`, `selected_handler=execution_breakdown`, `route_reason=orientation_clarification_resolved_conversation_skill`.
- Correction attendue: si la clarification résolue parle d'alléger/découper le plan en gardant l'objectif, maintenir `adjust_plan_item`.
- Statut: `open`
- Fix reference: a definir
- Tests requis: clarification "découper/alléger" -> `adjust_plan_item`; anti-faux-positif: demande d'aide à faire une action maintenant -> `execution_breakdown`.

### R1-B03 - Entrée explicite adjust_plan provoque HTTP 502

- Tours: 3, 4
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: `adjust_plan_item` runtime / Edge function
- Source amont: nouveau router/generator ou appel IA dans le chemin explicitement adjust_plan
- Symptome visible: réponse vide, run interrompu.
- Preuve systeme: `http_status=502`, body `An invalid response was received from the upstream server`, pas de `response_owner`, pas de trace route, `executed_tools=[]`.
- Correction attendue: reproduire avec input explicite "aide-moi à écrire la demande à coller dans Plan"; corriger le crash; garantir réponse non vide même si le generator IA échoue.
- Statut: `open`
- Fix reference: a definir
- Tests requis: test local du runtime avec `forceFullAi=true`; run full AI 5 tours; invariant no 502/no empty response/no executor.
