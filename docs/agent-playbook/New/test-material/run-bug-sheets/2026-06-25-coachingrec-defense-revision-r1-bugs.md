# Bug Sheet - coachingrec-defense-revision-20260625-r1

## R1-B01

- Bug id: R1-B01
- Tours: 1
- Famille: BF-INTAKE-06 - Mauvais domaine semantique
- Domaine owner: `coaching_recommendation/visible_agents/shared.ts`
- Source amont: contrat visible cartes d'action et separation produit entre techniques d'attaque et structure de carte de defense.
- Symptome visible: Sophia recommande correctement une carte de defense, mais dit que la technique la plus adaptee est `mot de bascule`, alors que `mot_de_bascule` est une technique de carte d'attaque.
- Preuve systeme: T1 `response_owner=coaching_recommendation`, `selected_handler=coaching_recommendation`, local state `current_recommendation.feature=defense_card`, `visible_decision.lever=defense_card`, `visible_decision.variant=null`; message visible contient "La technique la plus adaptee serait un mot de bascule".
- Correction attendue: quand `visible_decision.lever=defense_card` ou `free_defense_card`, ne jamais presenter les techniques d'attaque comme techniques de defense. Decrire la carte de defense par ses composants: moment critique, piege observable, geste faisable en moins de 30 secondes, plan B.
- Statut: open
- Fix reference: a faire
- Tests requis: positif Plan `defense_card` ne nomme pas `mot de bascule/texte magique/...` comme technique; positif hors plan `free_defense_card` idem; anti-FP `attack_card/free_attack_card` continue a nommer une technique; integration run reel avec correction explicite user.

## R1-B02

- Bug id: R1-B02
- Tours: 1, 4
- Famille: N/A - verification positive
- Domaine owner: `coaching_recommendation/action_plan_coaching` et `no_plan_coaching`
- Source amont: revision de `step_context.selected_feature` par les visibles agents dans leur perimetre.
- Symptome visible: aucun bug observe sur le choix principal; Sophia recommande `defense_card` pour decrochage pendant l'action dans le Plan et `free_defense_card` pour action hors plan.
- Preuve systeme: T1 `coaching_type=plan_action`, `current_recommendation=defense_card`, `visible_decision.lever=defense_card`; T4 `coaching_type=no_plan_action`, `current_recommendation=defense_card`, `visible_decision.lever=free_defense_card`; aucun `pending_type_change`.
- Correction attendue: conserver ce comportement.
- Statut: verified
- Fix reference: `supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/shared.ts` contrat `step_context.selected_feature` revisable + regle prioritaire decrochage pendant action.
- Tests requis: garder les tests prompt existants et rerun reel si le contrat visible est retouche.
