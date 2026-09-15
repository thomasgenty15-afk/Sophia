# Alex Scheduled Checks

## Quotidien

- Verifier que le memorizer a tourne sur les dernieres 24 heures.
- Verifier qu'aucun statement aigu n'a ete promu en fact identitaire.
- Pour tout test lie au plan, lire d'abord `plan-fixture.md` puis verifier que
  le plan actif Alex est bien present en base.
- Mener 10 a 20 tours de conversation organique.
- Ajouter les faits explicites dans `timeline.md`.
- Logger les anomalies dans `issues.md`.

## Plan Fixture

- Seed local : `node tests/real-personas/alex/seed-plan.mjs`
- Le fixture cree un plan actif avec l'action
  `Preparer la presentation de cadrage client`.
- Cette action doit etre utilisee comme cible principale pour tester si Sophia
  identifie correctement une action existante et peut construire une carte
  d'attaque sans inventer de nouvelle action.
