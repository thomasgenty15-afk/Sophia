# Bug Sheet - emotional-repair-potion-bridges-r2

## Run

- Date: 2026-06-15
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-15-emotional-repair-potion-bridges-r2.md`
- Raw artifacts: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-15-emotional-repair-potion-bridges-r2-*.json`
- Verdict: red

## Bugs

### Bug id: R2-B01

- Tours: A2-A3, C2-C3
- Famille: `BF-STATE-01` - mauvaise transition de flow
- Domaine owner: `emotional_repair`
- Source amont: local reducer bridge potion, persistence active state `last_potion_bridge_offer`, state patch apres `potion_bridge_offer`.
- Symptome visible: Sophia peut parler d'un soutien durable ou meme proposer la Potion d'apaisement, mais le consentement suivant ne declenche pas `select_state_potion`.
- Preuve systeme:
  - A2 `flow_action=potion_bridge_offer`, `visible_task=separate_fact_from_identity`, blocked `bridge_not_mature`.
  - A3 `flow_action=confirm_potion_bridge`, blocked `missing_previous_potion_offer`.
  - C2 `flow_action=potion_bridge_offer`, `visible_task=potion_bridge_offer`.
  - C3 `flow_action=confirm_potion_bridge`, blocked `missing_previous_potion_offer`, `note_information_consumed=null`.
- Correction attendue: quand une offre potion est visible/persistable, ecrire et relire au tour suivant `last_potion_bridge_offer` avec `selected_potion`, `durable_need`, prefills et note/handoff. Si l'offre n'est pas persistable, ne pas l'afficher.
- Statut: open
- Fix reference: a definir
- Tests requis: integration multi-turn `apaisement offer -> oui -> select_state_potion.apaisement`; equivalent `amour` et `guerison`; invariant state patch contient `last_potion_bridge_offer` apres offre visible.

### Bug id: R2-B02

- Tours: B2-B3
- Famille: `BF-STATE-01` - mauvaise transition de flow
- Domaine owner: `emotional_repair`
- Source amont: local dispatcher classification du besoin durable et demande explicite potion pendant active flow.
- Symptome visible: la demande explicite "potion de guérison" est absorbee par une reponse de soutien; Sophia ne propose ni ne bridge la potion.
- Preuve systeme: B3 `flow_action=regulation_without_potion`, `visible_task=de_shame`, `reason_code=emotional_repair_local_continue`, malgre "je veux bien passer sur une potion de guérison".
- Correction attendue: si le user demande explicitement une potion compatible pendant `emotional_repair`, transformer l'intention en bridge consenti ou en offre persistable, pas en simple regulation.
- Statut: open
- Fix reference: a definir
- Tests requis: active `emotional_repair` + demande explicite `potion de guérison` -> `confirm_potion_bridge` valide ou `select_state_potion.guerison` selon contrat.

### Bug id: R2-B03

- Tours: transversal r2
- Famille: `BF-EFFECT-04` - executor/fallback technique fragile
- Domaine owner: `sophia-brain` runtime local
- Source amont: runtime Edge Function / active flow bridge integration.
- Symptome visible: aucun 502 dans r2.
- Preuve systeme: les 9 tours r2 retournent HTTP 200 avec reponse non vide.
- Correction attendue: conserver comme regression watch; ne pas fermer definitivement tant qu'un run vert bridge complet n'a pas eu lieu.
- Statut: improved-watch
- Fix reference: fix unitaire precedent + absence de 502 observee en r2
- Tests requis: rerun apres correction R2-B01/R2-B02, verifier 3 handoffs complets sans 502.
