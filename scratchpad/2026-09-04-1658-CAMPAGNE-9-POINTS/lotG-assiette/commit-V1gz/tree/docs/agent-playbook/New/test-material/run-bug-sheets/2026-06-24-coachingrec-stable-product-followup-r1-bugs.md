# Bug Sheet - coachingrec-stable-product-followup-20260624-r1

## R1-B01

- Bug id: R1-B01
- Tours: 6, 7
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: dispatcher local/reducer, coherence de `visible_task` et preservation de recommandation stable.
- Symptome visible: Sophia redemande le besoin coaching au lieu de dire ou cliquer pour preparer la carte de defense du Plan.
- Preuve systeme: T6/T7 `response_owner=coaching_recommendation`, `route_reason=active_coaching_recommendation`, mais state: `last_visible_task_kind=change_confirm_coaching_type`, `current_recommendation=null`, `pending_type_change.candidate_coaching_type=unclear`; pourtant `recommendation_decision.primary_feature=defense_card`, `platform_destination.surface_hint=Dashboard > Plan`, `user_facing_destination=ouvrir l'action concernee puis preparer la carte`.
- Correction attendue: appliquer l'invariant stable recommendation product follow-up au niveau structurel, pas seulement prompt. Si une recommandation stable existe, que le `coaching_type` courant est clair, et que le user demande ou/comment preparer/trouver/utiliser le meme levier, `change_confirm_coaching_type` doit etre invalide; produire `answer_followup` + agent specialise courant avec la destination canonique.
- Statut: fixed
- Fix reference: `supabase/functions/sophia-brain/skills/coaching_recommendation/local_flow.ts` invariant `stableProductFollowupContractError` + retry `coaching_recommendation.local_dispatcher.contract_retry`; tests `coaching preserves stable plan product followup instead of reclarifying type` and `coaching treats same-target explicit switch as stable product followup`. The invariant also covers stale `target_switch=explicit` when the switch points to the same structured active target.
- Tests requis: reducer output contradictoire `change_confirm_coaching_type` + `recommendation_decision.primary_feature=defense_card`; run reel defense_card Plan + "où exactement"; correction explicite "je ne demande pas de clarifier"; variantes attack_card Plan et free_attack_card hors plan; anti-faux-positif vrai target switch hors Plan.

## R1-B02

- Bug id: R1-B02
- Tours: 4, 7
- Famille: BF-INTAKE-03 - Contrainte explicite perdue
- Domaine owner: `coaching_recommendation` visible agents / local flow context.
- Source amont: prise en compte de la polarite et des contraintes du dernier message user dans la reponse visible.
- Symptome visible: T4 commence par "Oui" alors que le user demande si c'est "toujours dans Ressources"; T7 ignore "Je ne te demande pas de clarifier".
- Preuve systeme: T4 owner correct et destination correcte mais wording contradictoire; T7 owner correct mais step context errone `change_confirm_coaching_type` alimente une clarification malgre la contrainte explicite.
- Correction attendue: le visible agent doit repondre explicitement a la polarite produit du dernier message; le reducer doit empecher le mauvais step context qui rend cette contrainte impossible a respecter.
- Statut: open
- Fix reference: a faire
- Tests requis: question negative "toujours dans Ressources ?" apres switch Plan; correction explicite "je ne demande pas X, je demande ou cliquer"; anti-faux-positif vraie demande de clarification de piege.
