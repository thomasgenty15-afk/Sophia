# Bug Sheet - Feature Opportunity Normal Local Real R1

## Run

- Date: 2026-06-24
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-24-feature-opportunity-normal-local-real-r1.md`
- Raw artifacts:
  - `tests/real-personas/qa-skill/runs/feature_opportunity/feature-opportunity-normal-local-real-20260624-r1.raw.json`
  - `tests/real-personas/qa-skill/runs/feature_opportunity/feature-opportunity-normal-local-real-20260624-r1.summary.json`
- Statut global: red

## Bugs

### FO-20260624-B01

- Bug id: `FO-20260624-B01`
- Tours: tour 1
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `feature_opportunity`
- Source amont: local dispatcher / reducer `feature_opportunity`
- Symptome visible: pour un besoin de soutien recurrent explicitement non ponctuel, Sophia sort du flow et repond `Soutien / Habitudes` au lieu d'aiguiller vers `Initiatives`.
- Preuve systeme: `response_owner=normal_reply`, `reason_code=feature_opportunity_exit_to_global`, `selected_handler=null`, `active_skill_state=null`, `executed_tools=[]`.
- Correction attendue: l'entree "soutien recurrent de Sophia" + "sans rappel ponctuel" doit produire `recommend_feature` vers `initiatives`, garder le visible agent `feature_opportunity` comme owner, creer l'active state et ne lancer aucun tool.
- Statut: `open`
- Fix reference: a definir.
- Tests requis: test local dispatcher sur wording recurrent non-one-shot; test IA reel paraphrase "soutien recurrent pourrait m'aider"; anti-faux-positif pour vraie question produit autonome qui peut sortir vers global/product_help; verification no `executed_tools` et no direct effects.
