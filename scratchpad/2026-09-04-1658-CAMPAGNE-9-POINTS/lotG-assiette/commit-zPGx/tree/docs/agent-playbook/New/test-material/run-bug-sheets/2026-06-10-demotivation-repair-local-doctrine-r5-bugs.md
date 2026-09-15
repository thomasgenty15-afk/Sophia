# Bug Sheet — demotivation_repair local doctrine R5

## R5-B01

- Bug id: R5-B01
- Tours: Tour 4
- Famille: BF-ROUTE-01 — Mauvais owner selectionne
- Domaine owner: active flow arbitration / dispatcher route policy
- Source amont: `active_flow_arbitration` route `active_skill_exit_requested`
- Symptome visible: le user demande un arret simple du flow actif, mais Sophia repond via `normal_reply` sans laisser `demotivation_repair` produire d'abord `exit_to_global_dispatcher` avec `note_information`.
- Preuve systeme: Tour 4 trace `response_owner=normal_reply`, `selected_handler=null`, `route_reason=active_skill_exit_requested`, `active_flow_arbitration.decision=abandon_active`, `active_owner=conversation_skill`, `selected_owner=normal_reply`.
- Correction attendue: pendant un conversation skill actif, un stop/cancel/defer/complete doit rester route vers le dispatcher local actif; le dispatcher local produit `exit_to_global_dispatcher` avec `note_information`, puis le global peut reprendre a partir de cette note.
- Statut: fixed_unit_verified_pending_real_qa
- Tests requis:
  - unit/contract: active conversation skill + stop simple -> premier passage owner `conversation_handler`, selected_handler actif;
  - unit/contract: active conversation skill + `pas besoin de carte ni d'outil, je m'arrete` -> pas de `normal_reply` direct, pas de tool, sortie locale avec note;
  - real QA: demotivation repair stop local apres reconnexion au sens.
