# Bug Sheet - coachingrec-normal-flow-20260624-r1

## R1-B01

- Bug id: `R1-B01`
- Tours: 1
- Famille: `BF-INTAKE-06` - Mauvais domaine semantique
- Domaine owner: `coaching_recommendation`
- Source amont: visibles agents `action_plan_coaching` et `no_plan_coaching`, bloc commun des techniques de carte d'attaque
- Symptome visible: Sophia recommande `Mot de bascule` pour un blocage de demarrage simple.
- Preuve systeme: T1 `last_visible_decision.variant=mot_de_bascule` alors que le message decrit surtout un blocage avant de commencer, pas un risque de craquer contre l'objectif/action.
- Correction attendue: reserver `Mot de bascule` aux cas ou le user sait qu'il risque de craquer, abandonner ou basculer contre l'objectif/action fixee; pour un demarrage bloque simple, favoriser une autre technique d'attaque.
- Statut: `fixed`
- Fix reference: `ACTION_CARD_EMOTIONAL_FRICTION_GUIDANCE_LINES` mis a jour le 2026-06-24
- Tests requis: contrat prompt sur l'usage de `Mot de bascule`; run IA reel avec blocage de demarrage; contre-exemple avec risque explicite de craquer.

## R1-B02

- Bug id: `R1-B02`
- Tours: 6
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: local dispatcher/reducer, decision `topic_change` / `exit_to_global_dispatcher`
- Symptome visible: Sophia repond correctement au nouveau cas hors plan, mais le flow actif est vide apres le tour.
- Preuve systeme: T6 `response_owner=normal_reply`, `route_reason=coaching_recommendation_exit_to_global`, `skill_status=exit`, `active_skill=null`. La note d'exit resume pourtant un besoin de coaching hors plan.
- Correction attendue: introduire ou renforcer une transition interne `target_switch` pour les changements de cible coaching (`plan_action`, `no_plan_action`, `emotional_global`) tant que le message reste un besoin de coaching. Le flow doit mettre a jour `coaching_type` et appeler le visible agent cible sans exit global.
- Statut: `fixed`
- Fix reference: prompt local renforce + garde reducer sur exit actif avec contexte stale le 2026-06-24
- Tests requis: positif plan-action -> no-plan-action; paraphrase sans les mots "hors plan"; anti-faux-positif vraie sortie produit standalone; run IA reel multi-tour.
