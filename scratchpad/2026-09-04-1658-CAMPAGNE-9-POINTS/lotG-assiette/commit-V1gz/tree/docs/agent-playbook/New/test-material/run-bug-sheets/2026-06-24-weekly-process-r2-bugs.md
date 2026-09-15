# Bug Sheet - Weekly Process R2

Run: `weekly-qa-20260624-r2-partial_habits_mission_partial`  
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-24-weekly-process-r2.md`  
Date: 2026-06-24  
Verdict: red

## R2-B01 - Demande "quoi faire semaine prochaine" sortie du weekly

- Tours: 4
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: `weekly_adaptive_review_v1`
- Source amont: dispatcher local weekly / transition `exit_to_global_dispatcher`
- Symptome visible: Sophia repond au besoin, mais via `coaching_recommendation`, pas via le weekly.
- Preuve systeme:
  - T4 `response_owner=coaching_recommendation`
  - T4 `route_reason=coaching_recommendation_signal`
  - T4 weekly `flow_action=exit_to_global_dispatcher`
  - T4 `visible_task=exit_or_cancel`
- Correction attendue:
  - Pendant un weekly actif, "que faire semaine prochaine ?" et "peux-tu ajuster ici ?" doivent rester dans `weekly_adaptive_review_v1`.
  - Le dispatcher doit choisir `weekly_adjust_recommendation` si `adjust_recommendation` est safe, sinon repondre dans weekly avec la destination correcte et sans mutation.
- Statut: open
- Fix reference: none
- Tests requis:
  - Integration weekly: demande "quoi faire semaine prochaine" -> `response_owner=weekly_adaptive_review_v1`.
  - Variante paraphrase: "tu me conseilles quoi pour la suite ?" -> weekly reste owner.
  - Anti-faux-positif: demande hors weekly explicite de coaching general peut sortir vers `coaching_recommendation`.

## R2-B02 - Mode next_level_required perdu au profit de "espace Plan"

- Tours: 4
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: `weekly_adaptive_review_v1` / visible recommendation
- Source amont: propagation `weekly_planning_context.adjustment_destination` vers tous les visibles qui parlent d'ajustement
- Symptome visible: Sophia dit "l'ajustement concret se fait dans l'espace Plan" alors que les traces weekly indiquaient `weekly_planning_context.mode=next_level_required`.
- Preuve systeme:
  - T1-T3 `weekly_planning_context.mode=next_level_required`
  - fixture plan sans `current_level_runtime`
  - T4 wording: "l'ajustement concret se fait dans l'espace Plan"
- Correction attendue:
  - En mode `next_level_required`, toute recommandation visible doit orienter vers validation du niveau / inputs du niveau suivant.
  - Interdire "Ajuster mon plan" / "espace Plan" dans ce mode, sauf si une semaine suivante est configuree.
- Statut: open
- Fix reference: none
- Tests requis:
  - Visible `weekly_adjust_recommendation` avec `next_level_required` -> mention validation niveau.
  - Visible `qualify_solution_fit` avec levier d'ajustement + `next_level_required` -> pas de destination Plan.
  - Run/integration sans semaine suivante configuree -> pas de "Ajuster mon plan".

## R2-B03 - Coaching recommendation capture la synthese et la cloture weekly

- Tours: 5, 6
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention; `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: active flow arbitration / `coaching_recommendation` parent return policy
- Source amont: restauration du parent weekly apres detour ou prevention du detour
- Symptome visible: le user demande explicitement de terminer le bilan weekly, mais `coaching_recommendation` reste owner.
- Preuve systeme:
  - T5 `response_owner=coaching_recommendation`, `route_reason=active_coaching_recommendation`
  - T6 `response_owner=coaching_recommendation`, `route_reason=active_coaching_recommendation`
  - T6 message "on clôture le weekly" sans reducer weekly actif
- Correction attendue:
  - Le fix principal est R2-B01: ne pas sortir du weekly au T4.
  - En defense, si un detour arrive, `coaching_recommendation` doit reconnaitre une demande de retour/synthese/cloture weekly et rendre la main au parent.
- Statut: open
- Fix reference: none
- Tests requis:
  - Apres detour coaching depuis weekly, "je veux terminer le bilan weekly" -> retour parent ou exit propre.
  - "cloturer le weekly sans changement automatique" ne doit pas etre rendu par `coaching_recommendation` comme si c'etait une cloture weekly.

## R2-B04 - Wording de qualification trop proche d'un ajustement direct

- Tours: 3
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: `weekly_solution_bridge` visible agent
- Source amont: contraintes visibles de qualification de levier
- Symptome visible: "Tu veux qu’on parte plutôt sur..." peut laisser entendre que le chat weekly choisit l'ajustement.
- Preuve systeme:
  - T3 `visible_task=qualify_solution_fit`
  - T3 `weekly_planning_context.mode=next_level_required`
  - T3 `adjust_recommendation.status=none`
- Correction attendue:
  - Les visibles de qualification doivent dire "l'ajustement utile a envisager serait..." ou demander une clarification, sans suggérer que le plan peut etre modifie par le chat.
  - Reprendre `weekly_planning_context.adjustment_destination` dans `qualify_solution_fit`.
- Statut: open
- Fix reference: none
- Tests requis:
  - Prompt visible `qualify_solution_fit` contient les contraintes non-mutantes et mode-aware.
  - Run avec demande de levier: pas de "on part sur" sans destination.
