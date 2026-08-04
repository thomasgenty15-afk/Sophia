# Prepare Attack Card Handoff Rerun - Bug Sheet

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, connexions QA temporaires, cleanup cible effectue.

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-01-prepare-attack-card-handoff-rerun.md`

## Bugs

### R1-B01

- Tours: R1 Tour 2
- Famille: `BF-INTAKE-03` - Contrainte explicite perdue
- Domaine owner: `prepare_attack_card`
- Source amont: continuation post-clarification, intake constraints, transition `continue_collecting -> produce_handoff`
- Symptome visible: apres cible + piege + "Ne la cree pas", Sophia repond "Je ne confirme aucun changement durable sans effet confirmé" au lieu de produire le handoff.
- Preuve systeme: `selected_handler=prepare_attack_card`, `status=ask_question`, `executed_tools=[]`, pas de `platform_handoff`.
- Correction attendue: la continuation post-clarification doit accepter les slots fournis et produire `handoff_delivered` no-mutation.
- Statut: `fixed`
- Fix reference: `prepare_attack_card/tests.ts` - `active intake continuation can deliver initial handoff`
- Tests requis: positif post-clarification no-create couvert en unitaire; rerun reel `/test-send-message force_full_ai=true` encore requis pour passer `verified`.

### R1-B02

- Tours: R1 Tour 3
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `prepare_attack_card`
- Source amont: active state/reducer apres clarification incomplete
- Symptome visible: Sophia dit "je vais la créer directement" et demande une technique, au lieu de refuser la creation chat et de redonner la destination plateforme.
- Preuve systeme: `selected_handler=prepare_attack_card`, `status=ask_question`, `executed_tools=[]`, pas de `apply_attempt`.
- Correction attendue: `ok crée-la` doit toujours devenir `apply_attempt` non-mutant quand l'intention prepare_attack_card est active ou vient d'etre clarifiee.
- Statut: `fixed`
- Fix reference: `prepare_attack_card/tests.ts` - `active handoff forces ok cree-la to apply_attempt`
- Tests requis: apply_attempt actif couvert; wording interdit absent couvert; rerun reel encore requis pour passer `verified`.

### R2-B01

- Tours: R2 Tour 1, R3 Tour 1
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `prepare_attack_card`
- Source amont: handoff status/reason_code initial
- Symptome visible: reponse correcte, mais trace initiale en `repeat_handoff`.
- Preuve systeme: premier tour direct `status=repeat_handoff`, `platform_handoff.reason_code=repeat_platform_handoff`.
- Correction attendue: le premier handoff doit tracer `handoff_delivered` avec un reason_code initial, et `repeat_handoff` doit rester reserve aux demandes "redis-moi".
- Statut: `fixed`
- Fix reference: `prepare_attack_card/tests.ts` - initial handoff reason_code `attack_card_platform_handoff`, repeat ledger `repeat_platform_handoff`
- Tests requis: initial/repeat couverts en unitaire; rerun reel encore requis pour valider la trace bout-en-bout.

### R2-B02

- Tours: R2 Tour 3
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: active handoff arbitration / `prepare_attack_card`
- Source amont: capture de `pas de carte` en handoff actif
- Symptome visible: annulation visible correcte, mais owner `normal_reply` et pas de status `cancelled` cote skill.
- Preuve systeme: `response_owner=normal_reply`, `selected_handler=null`.
- Correction attendue: `pas de carte` en handoff actif doit rester au skill et tracer `cancelled`, puis nettoyer l'etat local.
- Statut: `fixed`
- Fix reference: `handoff_flow_arbitration_test.ts` - `active attack_card + pas de carte clears inside handoff`; `prepare_attack_card/tests.ts` - cancellation clears state
- Tests requis: owner handoff et state clear couverts; rerun reel encore requis pour passer `verified`.

### R3-B01

- Tours: R3 Tour 2
- Famille: `BF-STATE-03` - Draft lifecycle casse
- Domaine owner: `prepare_attack_card`
- Source amont: draft review decision / active handoff revision mapping
- Symptome visible: "Rends-la plus simple" repete le meme brouillon au lieu de produire une version revisee.
- Preuve systeme: `status=repeat_handoff`, `platform_handoff.reason_code=repeat_platform_handoff`; contenu quasi identique au tour precedent.
- Correction attendue: demandes de simplification/changement doivent router vers `revise_handoff` et regenerer une recommandation differente.
- Statut: `fixed`
- Fix reference: `prepare_attack_card/tests.ts` - `active handoff forces plus simple to revise_handoff`
- Tests requis: revision active couverte; ajouter paraphrases supplementaires lors du prochain durcissement; rerun reel encore requis pour passer `verified`.
