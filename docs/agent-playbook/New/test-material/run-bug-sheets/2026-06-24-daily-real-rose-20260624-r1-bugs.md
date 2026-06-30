# Bug Sheet - daily-real-rose-20260624-r1

## Contexte

- Date: 2026-06-24
- Run: `daily-real-rose-20260624-r1`
- Rapport: `tests/real-personas/rose/runs/daily-weekly/daily-real-rose-20260624-r1.md`
- Domaine: `daily_action_review_v1`
- Statut global: `open`

## Bugs

### R1-B01

- Bug id: `R1-B01`
- Tours: 2
- Famille: `BF-PROACTIVE-01`
- Domaine owner: `daily_action_review_v1`
- Source amont: normalisation/categorisation de `reason_category` apres capture de raison
- Symptome visible: aucun symptome visible bloquant ; Sophia termine correctement le daily.
- Preuve systeme: l'entry `missed` pour `Ranger le materiel hors de vue` contient `reason_text="epuisement"`, `still_relevant=true`, `reschedule_decision="rescheduled_tomorrow"`, mais `reason_category=null`.
- Correction attendue: mapper les raisons de fatigue/epuisement vers `reason_category="fatigue"` tout en conservant le texte utilisateur dans `reason_text`.
- Statut: `open`
- Fix reference: `none`
- Tests requis: test positif `epuisee/epuisement`, paraphrase `HS/trop fatiguee`, anti-faux-positif raison externe non fatigue, integration daily missed rescheduled.
