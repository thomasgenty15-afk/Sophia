# Bug Sheet - Coaching Recommendation Ownership Product Guidance R2

## Run

- Date: 2026-06-23
- Run id: `coachingrec-ownership-product-guidance-20260623-r2`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-23-coaching-recommendation-ownership-product-guidance-r2.md`
- Verdict global: red

## Bugs

### R2-B01

- Tours: T4
- Famille: `BF-INTAKE-06` - Mauvais domaine semantique; `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: local dispatcher / visible `action_plan_coaching` / exit policy
- Symptome visible: Sophia recommande une potion pour une "boule au ventre" explicitement liee a l'action du plan `Préparer le dossier mutuelle`.
- Preuve systeme:
  - Avant T4, active state: `coaching_type=plan_action`, `current_recommendation.feature=attack_card`, `destination_hint=Dashboard > Plan`.
  - T4 route: active arbitration `continue_active`, `active_owner=coaching_recommendation`.
  - T4 skill run: `status=exit`, `exit_target=global`, `exit_note_information.handoff_reason=topic_change`.
  - T4 exit note still contains `dispatcher_signal_context.coaching_type=plan_action` and `current_recommendation=attack_card`.
- Correction attendue: emotion rattachee a une action concrete du plan reste dans `plan_action`; le visible doit expliquer pourquoi carte d'attaque/defense ou ajustement selon cause, et ne pas basculer vers potion sauf emotion globale non rattachee.
- Statut: open
- Fix reference: a creer
- Tests requis:
  - Positif: "boule au ventre quand je pense a [action du plan]" reste `coaching_recommendation`, `coaching_type=plan_action`, pas de `topic_change`.
  - Paraphrases: "stress avant d'ouvrir", "peur de m'y mettre", "angoisse quand je vois cette action".
  - Anti-faux-positif: emotion globale sans action precise peut recommander potion.
  - Integration: run IA reel local `/functions/v1/test-send-message`, `force_full_ai=true`.

### R2-B02

- Tours: T4-T5
- Famille: `BF-STATE-01` - Mauvaise transition de flow; consequence `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: `coaching_recommendation`, puis dispatcher global par absence d'active state
- Source amont: completion/exit note du skill local
- Symptome visible: T4 vide l'active flow; T5 route vers `product_help` pour une question de localisation issue du coaching.
- Preuve systeme:
  - T4: `response_owner=normal_reply`, `route_reason=coaching_recommendation_exit_to_global`, active skill after turn = null.
  - T5: `response_owner=product_help`, `selected_handler=product_help`, `route_reason=product_help_signal`.
- Correction attendue: ne pas produire `exit_to_global` quand le user compare une feature candidate a la recommandation stable pour la meme action. Si le flow doit sortir, la note d'exit doit etre coherente et non stale.
- Statut: open
- Fix reference: depend de R2-B01
- Tests requis:
  - Positif: T4-like puis "ou je la trouve" reste `active_coaching_recommendation`.
  - Anti-faux-positif: vraie question produit standalone sans active flow reste `product_help`.

### R2-B03

- Tours: T4
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: observability / `coaching_recommendation` exit note
- Source amont: exit note construction
- Symptome visible: la note d'exit indique `handoff_reason=topic_change`, mais son `structured_context` contient encore `coaching_type=plan_action`, `current_recommendation=attack_card`, et un `user_need_summary` stale du tour precedent.
- Preuve systeme:
  - `exit_note_information.structured_context.collected_state.user_need_summary`: "Le user ne demande plus quelle recommandation choisir; il veut simplement savoir où cliquer..." alors que le message T4 parle de boule au ventre/potion.
  - `user_words` contient bien le message T4.
- Correction attendue: l'exit note doit refleter le dernier tour et exposer la vraie raison de sortie; un resume stale ne doit pas justifier une transition.
- Statut: open
- Fix reference: a creer
- Tests requis:
  - Contract test: exit note local dispatcher contient `user_message_summary` et `collected_state` coherents avec le dernier user message.
  - Integration: trace T4-like ne contient pas `topic_change` si le tour reste in-scope.
