# Bug Sheet - 2026-06-12 - prepare-defense-local-doctrine-r6

## Synthese

- Run: `prepare-defense-local-doctrine-r6`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-prepare-defense-local-doctrine-r6.md`
- Verdict global: red
- Nettoyage: scope exact nettoye, `user_defense_cards=0`

## BF-STATE-01 - Mauvaise transition de flow

- Tours: 1
- Symptome: proposition du champ plateforme au premier tour, sans passe de discussion.
- Owner probable: `prepare_defense_card.local_flow` / prompt dispatcher.
- Statut: connu, non traite dans cette mission.
- Fix recommande: ajouter invariant de rythme V1 apres le fix routing.

## BF-ROUTE-01 - Mauvais owner selectionne

- Tours: 5
- Symptome: `__active_defense_card_handoff` et `__active_tool_skill_intake` sont presents au debut du tour et `read_active_flow_state` lit `prepare_defense_card`; avant `runConversationRouters`, les deux cles ont disparu; global route ensuite directement vers `prepare_attack_card`.
- Owner probable: lifecycle active flow / clear tempMemory avant arbitration globale.
- Source amont: un clear intermediaire supprime le flow actif sans sortie locale explicite.
- Statut: open.
- Fix recommande: tracer et corriger l'appel de clear entre `after_pending_confirmation_reload` et `before_run_conversation_routers`; interdire le nettoyage de `__active_defense_card_handoff` hors `exit_to_global_dispatcher`, `cancel_flow`, `safety_preempt`, expiration explicite ou magic reset.
- Tests a ajouter:
  - Runtime unit: avec `__active_defense_card_handoff` present, aucune intention attack explicite ne peut passer global avant `prepare_defense_card.local_flow`.
  - Real QA: tour switch attack doit contenir une trace `prepare_defense_card.local_exit_to_global_dispatcher`, puis seulement ensuite `prepare_attack_card`.
