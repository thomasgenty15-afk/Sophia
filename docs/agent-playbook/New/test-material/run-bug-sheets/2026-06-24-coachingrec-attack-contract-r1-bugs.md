# Bug Sheet - coachingrec-attack-contract-20260624-r1

## R1-B01

- Bug id: R1-B01
- Tours: 6
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: local dispatcher/reducer, selection du `visible_task` pour les follow-ups produit sur une recommandation stable.
- Symptome visible: le user demande "où exactement" préparer la carte de defense, Sophia repond partiellement puis demande "C’est quoi le moment précis où tu décroches ?".
- Preuve systeme: `response_owner=coaching_recommendation`, `route_reason=active_coaching_recommendation`, mais state apres T6: `last_visible_task_kind=change_confirm_coaching_type`, `current_recommendation=null`, `pending_type_change.candidate_coaching_type=unclear`, alors que `recommendation_decision.primary_feature=defense_card` et `platform_destination.surface_hint=Dashboard > Plan`.
- Correction attendue: ajouter un invariant local "stable recommendation product follow-up": si une recommandation existe et que le dernier tour demande ou/comment trouver/preparer le meme levier, le dispatcher local conserve le scope courant et appelle l'agent specialise (`action_plan_coaching` ou `no_plan_coaching`) avec `recommendation_decision.platform_destination`; il ne doit pas passer par `change_confirm_coaching_type`.
- Statut: open
- Fix reference: a faire
- Tests requis: positif defense_card Plan + "où exactement"; paraphrase "je clique où ?"; positif attack_card Plan + "où préparer"; positif free_attack_card hors plan + "où"; anti-faux-positif "en fait ce n'est pas dans mon Plan" doit permettre target switch.
