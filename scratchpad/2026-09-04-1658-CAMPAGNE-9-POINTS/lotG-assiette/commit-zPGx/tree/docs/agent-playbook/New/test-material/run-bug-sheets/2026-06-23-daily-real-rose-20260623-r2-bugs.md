# Bug Sheet - daily-real-rose-20260623-r2

## Contexte

- Date: 2026-06-23
- Run: `daily-real-rose-20260623-r2`
- Rapport: `tests/real-personas/rose/runs/daily-weekly/daily-real-rose-20260623-r2.md`
- Domaine: `daily_action_review_v1`
- Statut global: `open`

## Bugs

### R2-B01

- Bug id: `R2-B01`
- Tours: 1-2
- Famille: `BF-INTAKE-01`
- Domaine owner: `daily_action_review_v1`
- Source amont: slot filler/reducer daily, recalcul de `missing_slots`
- Symptome visible: Sophia redemande la raison alors que le user a deja dit `j'etais trop crevee`, puis la redemande encore apres `La fatigue`.
- Preuve systeme: au tour 2, l'item `934ee6ce-a44b-4c3f-8266-defe9246131f` contient `reason_text="trop crevee / fatigue"` et `reason_category="fatigue"`, mais conserve `missing_slots=["reason"]`.
- Correction attendue: apres chaque merge d'item, recalculer les slots manquants depuis les champs stabilises ; si `reason_text` ou `reason_category` est pose avec confiance, retirer `reason` de `missing_slots`.
- Statut: `open`
- Fix reference: `none`
- Tests requis: test positif `missed + fatigue explicite`, paraphrase `j'etais epuisee`, anti-faux-positif `pas de raison donnee`, integration 3 targets avec passage a la target restante.

### R2-B02

- Bug id: `R2-B02`
- Tours: 3
- Famille: `BF-PROACTIVE-01`
- Domaine owner: `daily_action_review_v1`
- Source amont: queue daily et selection du stage visible pour une target restante
- Symptome visible: Sophia demande si `Cibler le joint reflexe` reste pertinent alors que cette target n'a pas encore d'outcome.
- Preuve systeme: au tour 3, item `80fdc319-6115-493b-8e64-1db689665535` a `outcome=null` et `missing_slots=["outcome"]`, mais le visible demande `still_relevant`.
- Correction attendue: pour une target non encore repondue, prioriser obligatoirement `clarify_outcome`; `clarify_still_relevant` ne doit etre possible qu'apres un `missed` explicite.
- Statut: `open`
- Fix reference: `none`
- Tests requis: test positif `remaining_occurrence_ids` avec target not_asked, test anti-faux-positif `missed sans still_relevant`, test integration daily 3 ou 4 targets.
