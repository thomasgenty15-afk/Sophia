# Bug Sheet - coachingrec-type-switch-rerun-20260619-r1

## R1-B01

- Bug id: R1-B01
- Tours: 5
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: dispatcher/reducer local, decision `exit_to_global_dispatcher` alors que le signal reste dans le domaine coaching.
- Symptome visible: Sophia recommande bien une potion, mais la trace indique `response_owner=normal_reply`, `route_reason=coaching_recommendation_exit_to_global`, `skill_run.status=exit`.
- Preuve systeme:
  - Signal global T5: `coaching_type=emotional`, `confidence=0.92`, `needs_type_confirmation=false`.
  - Skill exit note T5: `current_recommendation=state_potion`, `candidate_features=[state_potion]`.
  - Route finale T5: `response_owner=normal_reply`, `selected_handler=null`.
- Correction attendue: quand `coaching_type=emotional` clair et `state_potion` identifie, le local flow doit rester owner et produire `emotion_coaching`; il ne doit sortir vers global que pour off-topic/safety/hors domaine.
- Statut: open
- Fix reference: none
- Tests requis: no_plan_action actif -> emotional clair au tour 4+ reste `status=continue`, `visible_task=emotion_coaching`, `response_owner=coaching_recommendation`.

## Verification Des Bugs Precedents

- Le bug `plan_action -> no_plan_action` observe dans `coachingrec-no-regex-20260619-r1` est verifie en run reel: T3 passe directement a `no_plan_coaching` sans clarification ternaire.
- Le stale context plan item est corrige dans ce rerun: T3 state local contient `difficulty.action_title=ouvrir le brouillon du mail à Camille` et `coaching_type=no_plan_action`.
