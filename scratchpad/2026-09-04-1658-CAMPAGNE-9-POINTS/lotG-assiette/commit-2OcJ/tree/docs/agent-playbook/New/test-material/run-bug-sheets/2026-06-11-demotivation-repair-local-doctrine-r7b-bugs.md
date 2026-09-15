# Bug Sheet — Demotivation Repair Local Doctrine R7b

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-11-demotivation-repair-local-doctrine-r7b.md`

## R7B-B01 — Contrainte "rien à ajouter" perdue apres handoff global

- Bug id: `R7B-B01`
- Tours: 4
- Famille: `BF-INTAKE-03` — contrainte explicite perdue
- Domaine owner: global normal reply post-exit / handoff context
- Source amont: preservation des contraintes utilisateur pendant `local_flow_exit_handoff` et generation finale globale.
- Symptome visible: le user dit "stop aujourd'hui", "pas de carte", "pas d'outil", "rien à ajouter"; Sophia sort bien du flow mais demande quand meme "Tu le fais tout de suite ou dans 2 minutes ?".
- Preuve systeme:
  - `response_owner=normal_reply`
  - `route_reason=normal_reply_default`
  - `active_flow_arbitration.reason_code=no_active_flow`
  - `local_flow_exit_handoff` present
  - `blocked_paths[0].reason_code=local_exit_to_global_dispatcher_blocks_local_reply`
  - `memory_items=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`
- Correction attendue:
  - Quand le second passage global suit un `local_flow_exit_handoff`, conserver les contraintes explicites du message courant dans le contexte global: stop, no_tool, no_card, no_more_question, no_extra_action.
  - La reponse globale post-exit doit cloturer sans poser de nouvelle question quand le user dit "rien à ajouter" ou equivalent.
  - Ne pas corriger dans le visible agent demotivation: la trace prouve que la reponse locale est deja bloquee.
- Statut: `open`
- Fix reference: none yet
- Tests requis:
  - Positif: active demotivation_repair + "stop aujourd'hui, rien à ajouter" -> same-turn `normal_reply` sans question finale.
  - Paraphrases: "on s'arrête là", "ne relance rien", "pas besoin de continuer" -> pas de question post-exit.
  - Anti-faux-positif: "je veux arrêter de procrastiner" dans le flow ne doit pas etre traite comme cloture.
  - Integration: trace contient `local_flow_exit_handoff` et `local_exit_to_global_dispatcher_blocks_local_reply`.

## Notes QA

- Le bug R6 principal est verifie comme corrige:
  - le tour d'exit n'est plus une continuation locale visible;
  - la reponse locale est bloquee;
  - le second passage global produit le visible same-turn;
  - l'etat actif est absent au tour suivant.
- Un essai `r7` avant `r7b` est invalide a cause d'une erreur de cle d'auth QA au tour 4 (`401`). Il n'est pas utilise pour le verdict.
