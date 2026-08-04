# Bug Sheet - adjust_plan_item handoff rerun R2 - 2026-06-01

## R2-B01

- Bug id: R2-B01
- Tours: action T5, niveau T4
- Famille: `BF-INTAKE-03`
- Domaine owner: `adjust_plan_item`
- Source amont: `reviseAdjustPlanHandoffDraft` / renderer revision
- Symptome visible: la recommandation revisee commence par `Version révisée demandée` et recopie la demande user.
- Preuve systeme: status `revise_handoff`, `executed_tools=[]`, `committed_effects=[]`, mais `recommended_change` contient la phrase brute.
- Correction attendue: transformer la revision en recommandation claire et actionnable, sans wrapper mecanique.
- Statut: open
- Fix reference: a faire
- Tests requis: revision action et niveau ne contiennent pas `Version révisée demandée`; revision preserve no-mutation; apply_attempt apres revision reste handoff.

## R2-B02

- Bug id: R2-B02
- Tours: niveau T6
- Famille: `BF-INTAKE-03`
- Domaine owner: `adjust_plan_item`
- Source amont: repeat handoff policy / renderer compact mode
- Symptome visible: l'utilisateur demande `juste la destination Plan`, Sophia renvoie le handoff complet.
- Preuve systeme: status `repeat_handoff`, owner correct, mais contenu visible complet au lieu d'une destination-only.
- Correction attendue: ajouter un mode repeat destination-only quand l'intention est de redemander seulement ou faire dans Plan.
- Statut: open
- Fix reference: a faire
- Tests requis: `Redis-moi juste la destination Plan` -> destination Plan + 1-2 steps + no-mutation, sans sections completes.

## R2-B03

- Bug id: R2-B03
- Tours: whole T1
- Famille: `BF-INTAKE-01`
- Domaine owner: `adjust_plan_item`
- Source amont: question writer / draft generation retry wording
- Symptome visible: Sophia dit `reprendre le brouillon proprement` alors qu'aucun brouillon visible n'existe.
- Preuve systeme: status `clarifying`, missing slot `draft_generation_retry_needed`, no mutation.
- Correction attendue: supprimer tout langage de brouillon invisible dans les questions whole plan.
- Statut: open
- Fix reference: a faire
- Tests requis: whole-plan first clarification ne contient pas `brouillon` si aucun draft n'a ete livre.

## R2-B04

- Bug id: R2-B04
- Tours: whole T2
- Famille: `BF-INTAKE-01`
- Domaine owner: `adjust_plan_item`
- Source amont: whole-plan readiness / reducer
- Symptome visible: apres ordre actuel + ordre cible explicites, Sophia redemande ce qui doit rester inchangé.
- Preuve systeme: status `clarifying`, missing slot `draft_generation_retry_needed`, no mutation.
- Correction attendue: considerer ordre actuel + ordre cible comme draft-ready ou handoff-ready prudent, avec preserve/avoid si le contenu n'est pas explicitement modifie.
- Statut: open
- Fix reference: a faire
- Tests requis: `acceleration puis consolidation -> inverser` produit handoff whole-plan, pas clarification supplementaire.

## R2-B05

- Bug id: R2-B05
- Tours: whole T3
- Famille: `BF-ROUTE-02`
- Domaine owner: active handoff arbitration / router
- Source amont: active flow continuation for whole-plan clarification answer
- Symptome visible: Sophia sort du handoff et repond en `normal_reply` alors que le user complete la clarification du whole plan.
- Preuve systeme: `response_owner=normal_reply`, `selected_handler=null`, `route_reason=central_arbitrator_status_exact_priority`, `operation=null`, `durable_effect=none`.
- Correction attendue: toute reponse au slot whole-plan actif reste chez `adjust_plan_item` sauf intention concurrente explicite.
- Statut: open
- Fix reference: a faire
- Tests requis: `Les deux phases doivent garder leur contenu...` inside active whole-plan handoff -> `tool_skill/adjust_plan_item`, no mutation, handoff or clarification skill-owned.
