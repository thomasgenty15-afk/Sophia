# Bug Sheet - coachingrec-stable-product-followup-verify-20260625-r2

## R2-B01

- Bug id: R2-B01
- Tours: 1, 2, 4, 5
- Famille: BF-INTAKE-06 - Mauvais domaine semantique; BF-INTAKE-03 - Contrainte explicite perdue
- Domaine owner: `coaching_recommendation/action_plan_coaching`
- Source amont: visible decision + cause analysis pour le choix `attack_card` vs `defense_card`, et revision de recommandation apres correction explicite du user.
- Symptome visible: Sophia maintient `attack_card` technique `texte magique` alors que le user decrit un decrochage vers YouTube apres avoir commence l'action, puis demande explicitement une carte de defense.
- Preuve systeme: tous les tours restent `response_owner=coaching_recommendation`, `selected_handler=coaching_recommendation`, `route_reason=active_coaching_recommendation` apres T1; local state conserve `coaching_type=plan_action`, `current_recommendation=attack_card`, `last_visible_task_kind=action_plan_coaching`, `pending_type_change=null`. T4 user: "je commence bien, mais apres deux minutes je decroche"; T5 user: "preparer moi-meme une carte de defense"; Sophia repond encore attack card.
- Correction attendue: dans `action_plan_coaching`, distinguer clairement `preparer/demarrer/premier geste` de `deviation pendant l'action/piege concret/decrochage apres quelques minutes`. Le dernier message user doit pouvoir reviser `current_recommendation` de `attack_card` vers `defense_card` sans changer de coaching type.
- Statut: open
- Fix reference: a faire
- Tests requis: positif action Plan "je commence bien puis je decroche vers YouTube" -> `defense_card`; paraphrase "au bout de 2 minutes je pars sur Instagram" -> `defense_card`; anti-FP "je n'arrive meme pas a ouvrir le dossier" -> `attack_card`; integration run reel 5 tours avec follow-up "ou preparer la carte de defense" -> owner `coaching_recommendation`, visible `action_plan_coaching`, guidance `Dashboard > Plan`.

## R2-B02

- Bug id: R2-B02
- Tours: 3
- Famille: N/A - verification positive
- Domaine owner: `coaching_recommendation/local_flow`
- Source amont: invariant stable product follow-up.
- Symptome visible: aucun bug observe sur l'ownership; Sophia repond depuis le scope coaching actif a une question produit "ou preparer".
- Preuve systeme: T3 `response_owner=coaching_recommendation`, `route_reason=active_coaching_recommendation`, local state `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `pending_type_change=null`, aucun `product_help`.
- Correction attendue: conserver ce comportement.
- Statut: verified
- Fix reference: `supabase/functions/sophia-brain/skills/coaching_recommendation/local_flow.ts` invariant stable product follow-up incluant stale `target_switch=explicit`; tests `coaching treats same-target explicit switch as stable product followup`.
- Tests requis: garder le test reducer + rerun reel si la logique target_switch est retouchee.
