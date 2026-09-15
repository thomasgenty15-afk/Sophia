# Bug Sheet - coachingrec-target-switch-20260624-r3

## R3-B01

- Bug id: `R3-B01`
- Tours: 1
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: reducer/local state lifecycle apres recommandation visible
- Symptome visible: Sophia donne une recommandation in-domain, mais l'active state est vide apres le tour.
- Preuve systeme: T1 `response_owner=coaching_recommendation`, `selected_handler=coaching_recommendation`, `skill_status=exit`, `active_skill=null`.
- Correction attendue: une recommandation coaching in-domain doit garder `active_skill=coaching_recommendation` et stabiliser `current_recommendation`/`last_visible_decision`, sauf close explicite.
- Statut: `open`
- Fix reference: a venir
- Tests requis: premier tour plan-action garde active state; follow-up hors plan devient target switch actif, pas nouvelle entree `coaching_recommendation_signal`; anti-faux-positif close explicite peut sortir.

## R3-B02

- Bug id: `R3-B02`
- Tours: 1
- Famille: `BF-INTAKE-06` - Mauvais domaine semantique
- Domaine owner: `coaching_recommendation`
- Source amont: visible agent action / sortie structuree de decision
- Symptome visible: Sophia recommande une carte d'attaque sans nommer la technique.
- Preuve systeme: T1 reponse visible "carte d'attaque" sans `Le texte magique`, `Preparer le terrain`, `Mantra de force`, `Ancre visuelle`, `Meditation de 5 minutes` ou `Mot de bascule`; state final vide, donc pas de `last_visible_decision`.
- Correction attendue: toute recommandation de carte d'attaque doit nommer la technique et fournir une decision visible structuree ou un fallback equivalent.
- Statut: `open`
- Fix reference: a venir
- Tests requis: blocage mental plan-action nomme une technique; blocage concret plan-action nomme une technique differente si pertinent; fallback visible sans JSON ne perd pas la decision.
