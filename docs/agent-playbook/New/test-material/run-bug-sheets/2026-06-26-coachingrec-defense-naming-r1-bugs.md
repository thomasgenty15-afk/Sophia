# Bug Sheet - coachingrec-defense-naming-20260626-r1

## R1-B01

- Bug id: R1-B01
- Tours: 3, 5
- Famille: BF-TEST-01 - Trace/test incoherent ou suite malsaine
- Domaine owner: QA runtime / `/functions/v1/test-send-message` / upstream LLM runtime
- Source amont: endpoint local ou provider; absence de trace exploitable sur echec.
- Symptome visible: Sophia renvoie une reponse vide avec HTTP 502.
- Preuve systeme: T3 et T5 `http_status=502`, `assistant=""`, `response_owner=null`, `selected_handler=null`, `executed_tools=[]`, `scheduled_checkins=[]`; l'etat actif `coaching_recommendation` reste intact.
- Correction attendue: stabiliser le chemin IA reel local ou exposer une trace d'erreur exploitable quand un 502 survient; ne pas laisser un tour QA sans diagnostic systeme.
- Statut: open
- Fix reference: a faire
- Tests requis: run QA local avec skill actif et upstream lent/erreur; verifier trace d'erreur non vide et absence de mutation durable.

## R1-B02

- Bug id: R1-B02
- Tours: 6
- Famille: BF-INTAKE-03 - Contrainte explicite perdue
- Domaine owner: `coaching_recommendation/no_plan_coaching`
- Source amont: priorisation du dernier message user dans le visible no-plan apres reprise d'un incident.
- Symptome visible: le user demande "tu me conseillerais quoi ?" mais Sophia commence par "Tu la prepares dans Dashboard > Ressources" avant de donner le conseil.
- Preuve systeme: T6 `coaching_type=no_plan_action`, `visible_decision.lever=free_defense_card`, destination correcte, mais message visible priorise la guidance produit alors que la demande actuelle est une recommandation.
- Correction attendue: pour `no_plan_coaching`, si le dernier message demande un conseil/recommandation, repondre d'abord au levier; ne donner la destination produit que si le user demande ou trouver/preparer/creer/consulter.
- Statut: open
- Fix reference: a faire
- Tests requis: no-plan apres contexte produit precedent + "tu me conseillerais quoi ?" -> conseil d'abord; anti-FP "ou je la trouve ?" -> destination d'abord.

## R1-B03

- Bug id: R1-B03
- Tours: 1, 2, 6, 7
- Famille: N/A - verification positive
- Domaine owner: `coaching_recommendation/visible_agents/shared.ts`
- Source amont: frontiere entre techniques de carte d'attaque et structure de carte de defense.
- Symptome visible: aucun bug observe sur le point cible; Sophia ne presente plus `mot de bascule` comme technique de defense.
- Preuve systeme: T1/T2 `visible_decision.lever=defense_card`, `variant=null`, message defense via moment critique/piege/geste 30 secondes/plan B; T6/T7 `visible_decision.lever=free_defense_card`, `variant=null`, aucune technique d'attaque nommee comme technique de defense.
- Correction attendue: conserver ce comportement.
- Statut: verified
- Fix reference: `supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/shared.ts` noms reserves attaque + contrat `defense_card_message_must_not_name_attack_card_technique`; test `coaching in-plan and no-plan visible agents receive defense naming boundary`.
- Tests requis: garder test contractuel + rerun reel si le prompt defense/attack est modifie.
