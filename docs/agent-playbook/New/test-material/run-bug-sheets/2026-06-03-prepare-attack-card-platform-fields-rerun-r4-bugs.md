# Prepare Attack Card Platform Fields Rerun R4 - Bug Sheet

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runs `attack-card-fields-20260603-r4`, `attack-card-fields-20260603-r4b`, `attack-card-fields-20260603-r4c`. Aucun fallback deterministe. Aucun changement de code pendant les runs.

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-prepare-attack-card-platform-fields-rerun-r4.md`

## Bugs

### PAC-FIELDS-R4-B01

- Bug id: `PAC-FIELDS-R4-B01`
- Tours: Run R4c Tour 2
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `prepare_attack_card` active handoff / revision reducer
- Source amont: handling `revise_handoff` apres `handoff_delivered`
- Symptome visible: l'utilisateur corrige l'action en `sortir mes baskets`, mais Sophia repete l'ancien handoff avec `lancer la marche de dix minutes`.
- Preuve systeme: `active_handoff_action.type=revise_handoff`, `route_reason=active_handoff_revise_handoff`, mais `tool_skill_run.status=repeat_handoff` et `platform_handoff.inputs[negotiated_action].value=lancer la marche de dix minutes`.
- Correction attendue: `revise_handoff` doit relancer la couche `platform_field_filler` ou appliquer un patch structure aux champs actifs, puis rendre un handoff revise. Les champs non corriges doivent rester lockes.
- Statut: `open`
- Fix reference:
- Tests requis: positif correction multi-champ apres handoff; paraphrase "plutot mets action=..."; anti-faux-positif "redis-moi" reste repeat sans mutation; integration `executed_tools=[]`, `user_attack_cards=[]`.

## Verifications Vertes

| Scenario | Preuve | Statut |
| --- | --- | --- |
| R3-B01 preservation multi-tour | Run R4 Tour 1 lock action+excuse, Tour 2 handoff reprend les 3 champs | green |
| R3-B02 apply attempt trace | Run R4 Tour 3 `active_handoff_apply_attempt`, `status=apply_attempt`, pas clarification parasite | green |
| Multi-lock direct | Run R4b Tour 1 lock les 3 champs en un seul message | green |
| Handoff no model | Reponses visibles sans brouillon, apercu, template ou champs "a preserver/a eviter" | green |
| No DB write | REST `user_attack_cards=[]` pour les trois utilisateurs QA | green |
| Cleanup cible | Trois utilisateurs Auth temporaires supprimes | green |
