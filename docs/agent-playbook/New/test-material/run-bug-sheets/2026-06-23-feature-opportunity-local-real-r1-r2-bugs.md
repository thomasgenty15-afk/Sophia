# Bug Sheet - Feature Opportunity Local Real R1/R2

## Run

- Date: 2026-06-23
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-23-feature-opportunity-local-real-r1-r2.md`
- Raw artifacts:
  - `tests/real-personas/qa-skill/runs/feature_opportunity/feature-opportunity-local-real-20260623-r1.raw.json`
  - `tests/real-personas/qa-skill/runs/feature_opportunity/feature-opportunity-local-real-20260623-r2.raw.json`
- Statut global: red

## Bugs

### FO-20260623-B01

- Bug id: `FO-20260623-B01`
- Tours: variante N.1 tour 1
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: global dispatcher / route policy
- Source amont: arbitrage `coaching_recommendation` vs `feature_opportunity`
- Symptome visible: Sophia demande "Tu veux te debloquer..." au lieu d'aiguiller vers une opportunite `initiatives` pour un rituel recurrent.
- Preuve systeme: `response_owner=coaching_recommendation`, `selected_handler=coaching_recommendation`, `reason_code=coaching_recommendation_signal`, active state `coaching_recommendation`; aucun `feature_opportunity`.
- Correction attendue: le dispatcher doit reconnaitre les formulations recurrentes qui revelent une opportunite produit meme si le user emploie "soutenir", tant qu'il ne demande pas explicitement un levier de coaching.
- Statut: `open`
- Fix reference: a definir.
- Tests requis: test positif avec rituel recurrent + "Sophia me soutienne"; test paraphrase avec moment repete; contre-test ou le user demande vraiment "quelle carte/quoi faire pour me debloquer"; integration IA/local si possible apres fix.

### FO-20260623-B02

- Bug id: `FO-20260623-B02`
- Tours: variante N.1 tour 2
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: `coaching_recommendation` local dispatcher / active flow policy
- Source amont: interruption/exit depuis un active skill quand le user refuse le cadre coaching et demande une fonctionnalite produit.
- Symptome visible: le user dit "Pas vraiment me debloquer" et demande "quelle fonctionnalite", mais Sophia continue a demander quel moment le bloque.
- Preuve systeme: `response_owner=coaching_recommendation`, `reason_code=active_coaching_recommendation`, active state `coaching_recommendation` conserve, pas de sortie vers global.
- Correction attendue: `coaching_recommendation` doit sortir vers global quand l'utilisateur nie explicitement le cadre coaching et reformule vers une surface produit/opportunite; la recuperation doit permettre au dispatcher global ou a `feature_opportunity` de reprendre.
- Statut: `open`
- Fix reference: a definir.
- Tests requis: active `coaching_recommendation` puis follow-up "pas me debloquer, je veux savoir quelle fonctionnalite"; test produit lie; test anti-faux-positif ou le user dit "pas une carte, aide-moi quand meme a choisir une autre technique" et doit rester coaching.
