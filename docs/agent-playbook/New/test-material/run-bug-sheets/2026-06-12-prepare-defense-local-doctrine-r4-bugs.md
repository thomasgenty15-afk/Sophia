# Bug Sheet - 2026-06-12 - prepare-defense-local-doctrine-r4

## Synthese

- Run: `prepare-defense-local-doctrine-r4`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-prepare-defense-local-doctrine-r4.md`
- Verdict global: red
- Bugs principaux: prompt visible `apply_attempt` parle de plusieurs champs; active flow defense perdu avant sortie locale explicite vers global.
- Effets durables: aucune carte creee; cleanup cible OK.

## BF-STATE-01 - Mauvaise transition de flow

- Tours: 5
- Symptomes: `apply_attempt` refuse correctement la creation, mais dit "remplir les champs, notamment celui-ci" au lieu de traiter `support_need` comme unique champ plateforme prepare.
- Owner probable: prompt visible local `prepare_defense_card` pour `visible_task.kind=apply_attempt`.
- Source amont: `conversation_context` / prompt visible insuffisamment strict sur l'unicite du champ `support_need`.
- Statut: open
- Fix recommande: renforcer le prompt `apply_attempt` pour mentionner uniquement le champ canonique exact et interdire les formulations qui suggerent d'autres champs a remplir.
- Tests a ajouter:
  - Real/unit visible prompt: `apply_attempt` contient le label exact et ne contient pas "les champs" / "notamment".
  - Invariant: aucune creation, aucun pending confirmation, aucun claim "c'est cree".

## BF-ROUTE-01 - Mauvais owner selectionne

- Tours: 6
- Symptomes: demande explicite de carte d'attaque pendant le suivi defense route directement vers `prepare_attack_card`; trace finale `active_flow_arbitration.reason_code=no_active_flow`.
- Evidence trace: `read_active_flow_state` lit `active_tool_skill_id=prepare_defense_card`, puis `before_run_conversation_routers` n'a plus `__active_tool_skill_intake`; le global dispatcher selectionne `prepare_attack_card` avec `tool_skill_intent_start`.
- Owner probable: active flow lifecycle / reconciliation / arbitrator central.
- Source amont: l'etat actif `prepare_defense_card` est supprime apres handoff ou apply_attempt avant que le dispatcher local defense puisse emettre `exit_to_global_dispatcher`.
- Statut: open
- Fix recommande: conserver l'owner `prepare_defense_card` en post-handoff follow-up; toute nouvelle intention doit d'abord passer par `prepare_defense_card.local_dispatcher`, qui peut retourner `exit_to_global_dispatcher` avec `note_information`.
- Tests a ajouter:
  - Unit arbitration: post-handoff defense + message attaque explicite => `selected_handler=prepare_defense_card`, global bloque sur le premier passage.
  - Integration/real QA: tour de switch attaque montre une trace defense `flow_action=exit_to_global_dispatcher`, puis note information, puis activation globale de `prepare_attack_card`.
  - Regression: stop simple defense => `exit_to_global_dispatcher` sans appel global.
