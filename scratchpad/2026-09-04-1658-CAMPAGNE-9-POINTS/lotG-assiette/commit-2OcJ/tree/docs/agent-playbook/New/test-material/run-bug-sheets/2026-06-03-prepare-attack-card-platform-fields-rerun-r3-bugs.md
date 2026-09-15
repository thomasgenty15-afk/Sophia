# Prepare Attack Card Platform Fields Rerun R3 - Bug Sheet

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, run `attack-card-fields-20260603-r3`. Aucun fallback deterministe. Aucun changement de code pendant le run.

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-prepare-attack-card-platform-fields-rerun-r3.md`

## Bugs

### PAC-FIELDS-R3-B01

- Bug id: `PAC-FIELDS-R3-B01`
- Tours: Tour 2, Tour 3
- Famille: `BF-INTAKE-01` - Slot fourni mais redemande
- Domaine owner: `prepare_attack_card` platform field intake / state reducer
- Source amont: merge ou persistence multi-tour de `platform_fields`
- Symptome visible: apres avoir demande seulement l'etat voulu au Tour 1, Sophia redemande au Tour 2 l'action et l'excuse deja fournies et deja lockees.
- Preuve systeme: Tour 1 `negotiated_action=locked`, `recurring_excuse=locked`, `desired_reframe_state=missing`; Tour 2 `desired_reframe_state=locked` mais `negotiated_action` et `recurring_excuse` redeviennent `missing`.
- Correction attendue: un patch partiel de champs plateforme doit conserver tous les champs `locked` precedents sauf correction explicite utilisateur.
- Statut: `verified`
- Fix reference: `prepare_attack_card/platform_fields.ts`, `prepare_attack_card/ai_intake.ts`, tests `attack_card platform field merge preserves locked fields across partial patch` et `attack_card platform field intake preserves prior locked fields when dispatcher sends partial intake_state`; verified by QA run `attack-card-fields-20260603-r4` Tours 1-2.
- Tests requis: unit merge `locked` preserved; integration "action+excuse T1, desired state T2 => handoff direct"; paraphrase; correction multi-champ; anti-FP vague.

### PAC-FIELDS-R3-B02

- Bug id: `PAC-FIELDS-R3-B02`
- Tours: Tour 4
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: active handoff arbitration / trace agenda
- Source amont: classification active handoff pour `ok cree-la`
- Symptome visible: la reponse est correcte, mais la trace indique `active_handoff_turn_unclear` et un effet `clarification.intent asked`, alors que `tool_skill_run.status=apply_attempt`.
- Preuve systeme: Tour 4 `draft_review_decision=approve`, `blocked_effects=[create_attack_card/chat_creation_disabled_platform_handoff]`, mais route reason `active_handoff_turn_unclear`.
- Correction attendue: aligner l'arbitrage et l'agenda sur `apply_attempt` quand le message active handoff est reconnu comme demande de creation non-mutante.
- Statut: `verified`
- Fix reference: verified by QA run `attack-card-fields-20260603-r4` Tour 3: `route_reason=active_handoff_apply_attempt`, `status=apply_attempt`, no clarification asked, `executed_tools=[]`, `user_attack_cards=[]`.
- Tests requis: run reel `ok cree-la` apres handoff; assertion trace `status=apply_attempt`, no clarification asked, `executed_tools=[]`, `user_attack_cards=[]`.

## Verifications Vertes

| Scenario | Preuve | Statut |
| --- | --- | --- |
| Routage initial naturel | Tour 1 `response_owner=tool_skill`, `selected_handler=prepare_attack_card`, pas `product_help` | green |
| Handoff final sans modele | Tour 3 affiche destination + parcours + champs plateforme, pas de brouillon de carte | green |
| No mutation sur handoff | Tour 3 `executed_tools=[]`, ledger delivered platform handoff, `committed=false` | green |
| Apply attempt non-mutant | Tour 4 `blocked_effects=create_attack_card/chat_creation_disabled_platform_handoff`, `executed_tools=[]` | green |
| DB sans carte | Verification apres run: `user_attack_cards=[]` | green |
| Cleanup cible | Utilisateur Auth temporaire `42ca8b2f-d3dc-4943-8520-5d013b9def64` supprime | green |
