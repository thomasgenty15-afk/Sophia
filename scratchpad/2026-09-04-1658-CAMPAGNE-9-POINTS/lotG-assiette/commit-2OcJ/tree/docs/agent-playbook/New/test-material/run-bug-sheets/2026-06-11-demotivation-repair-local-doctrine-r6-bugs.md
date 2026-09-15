# Bug Sheet — Demotivation Repair Local Doctrine R6

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-11-demotivation-repair-local-doctrine-r6.md`

## R6-B01 — Exit local calcule mais reponse visible continue le flow

- Bug id: `R6-B01`
- Tours: 4
- Famille: `BF-AGENDA-02` — interruption explicite mal restauree
- Domaine owner: active flow response pipeline / TurnAgenda / handoff global
- Source amont: traitement same-turn de `skill_run.output.response_intent=exit_to_global_dispatcher`
- Symptome visible: le user dit "je veux arrêter ce flow ici", Sophia dit "point final" mais pose ensuite une nouvelle question de continuation locale.
- Preuve systeme:
  - `response_owner=conversation_handler`
  - `selected_handler=demotivation_repair`
  - `route_reason=active_skill_exit_requested`
  - raw trace: `skill_run.output.status=exit`
  - raw trace: `skill_run.output.response_intent=exit_to_global_dispatcher`
  - raw trace: `skill_run.output.diagnosis.flow_action=exit_to_global_dispatcher`
  - raw trace: `skill_run.output.diagnosis.note_information.target_dispatcher=global`
  - tour 5: `active_flow_arbitration.reason_code=no_active_flow`, donc l'etat actif est bien cleared apres le tour 4.
- Correction attendue:
  - Quand un flow local actif retourne `exit_to_global_dispatcher`, la pipeline doit traiter cet exit comme un handoff prioritaire sur le meme tour.
  - La `note_information` doit etre consommee par le dispatcher global.
  - La reponse visible du meme tour doit venir du chemin global post-exit, ou au minimum ne doit pas continuer le prompt local.
  - Ne pas corriger par une phrase fixe dans demotivation_repair; le dispatcher local a deja produit la bonne decision.
- Statut: `open`
- Fix reference: none yet
- Tests requis:
  - Positif: active demotivation_repair + demande explicite d'arret -> `exit_to_global_dispatcher` + `note_information` + visible same-turn n'invite pas a continuer le flow local.
  - Paraphrase: "je m'arrête ici", "on clôture ce flow", "pas besoin d'aller plus loin" doivent suivre le meme contrat sans regex metier.
  - Anti-faux-positif: "je veux arrêter de procrastiner" ou "je veux arrêter de laisser tomber" ne doit pas sortir du flow.
  - Integration: verifier que le tour suivant a `no_active_flow` et que le tour d'exit ne produit aucun tool/effect.

## Notes QA

- Le run a aussi confirme des points positifs:
  - entree `demotivation_repair` correcte;
  - continuation active correcte sur les tours 2-3;
  - pas de potion/carte/rappel pousse trop tot;
  - aucun effet durable non consenti;
  - etat actif cleared apres l'exit local.
- Incident QA mineur resolu: le premier snapshot durable etait en 401 a cause d'une mauvaise cle service passee au runner; le snapshot final du tour 5 est valide (`chat_messages=10`, `memory_items=0`, `reminders=0`, `checkins=0`).
