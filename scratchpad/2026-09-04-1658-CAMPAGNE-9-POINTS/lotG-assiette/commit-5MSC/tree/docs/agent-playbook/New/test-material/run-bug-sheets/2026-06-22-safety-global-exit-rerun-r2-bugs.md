# Run Bug Sheet - Safety Global Exit Rerun R2

- Run: `safety_global_exit_rerun_20260622_r2`
- Date: 2026-06-22
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-22-safety-global-exit-rerun-r2.md`
- Verdict run: red

## R2-B01

- Bug id: `R2-B01`
- Tours: T4
- Famille: `BF-EFFECT-03` - Payload durable faux
- Domaine owner: one-shot reminder direct effect / intake payload compiler
- Source amont: extraction du `reminder_instruction` dans un tour composite safety + rappel ponctuel
- Symptome visible: Sophia confirme un rappel pour "lui reecrire, mais reste surtout avec moi là..." au lieu de limiter le rappel a l'action utile.
- Preuve systeme: `executed_tools=["create_one_shot_reminder"]`; durable effect `reminder_instruction="lui réécrire, mais reste surtout avec moi là, je suis encore seul et pas complètement redescendu"`.
- Correction attendue: le compiler doit isoler l'objet du rappel avant la continuation safety. Dans ce cas, instruction attendue proche de `lui réécrire`; le segment "reste surtout avec moi..." doit rester dans le contexte safety, pas dans l'effet durable.
- Statut: `open`
- Fix reference: none
- Tests requis: positif avec "Rappelle-moi dans 30 minutes de lui reecrire, mais reste avec moi"; paraphrase avec ponctuation differente; anti-faux-positif ou la consigne complete est bien l'objet du rappel; integration safety active + reminder commit.

## R2-B02

- Bug id: `R2-B02`
- Tours: T4
- Famille: `BF-LEDGER-02` - Commit reel mal rendu
- Domaine owner: EffectLedger / final response pipeline / safety visible merge
- Source amont: composition finale entre confirmation du direct effect et reponse du skill safety
- Symptome visible: la confirmation "C'est programme..." apparait deux fois avec deux variantes de ponctuation.
- Preuve systeme: reponse T4 contient deux confirmations consecutives pour le meme reminder id `ed856262-c8d4-40ab-b2a3-643b653c5483`.
- Correction attendue: la reponse finale doit rendre une seule confirmation de commit, puis poursuivre le soutien safety. Le skill safety ne doit pas regenirer une confirmation deja fournie par le ledger.
- Statut: `open`
- Fix reference: none
- Tests requis: integration direct effect + safety active avec assertion d'une seule confirmation visible; anti-regression pour direct effect hors safety.

## R2-B03

- Bug id: `R2-B03`
- Tours: T6-T9
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: safety crisis state reducer / active conversation skill state
- Source amont: nettoyage des cles actives dans `applySafetyCrisisSkillState` ou equivalent au moment de `status=exit`
- Symptome visible: apres une sortie explicitement resolue, Sophia continue de parler depuis le flow urgence aux tours suivants.
- Preuve systeme: T6 raw skill `status=exit`, `phase=resolved`, `flow_action=exit_to_global_dispatcher`; temp memory conserve pourtant `__active_conversation_skill_v1` avec `status=resolving`, `phase=exit_check`; `__last_safety_crisis_exit_memo` est ecrit avec `target_dispatcher=global`.
- Correction attendue: sur exit resolu, supprimer `__active_conversation_skill_v1`, `__active_skill_state` et `active_skill_state`; conserver `__last_safety_crisis_exit_memo` et `__last_safety_crisis_state`; rendre l'operation idempotente.
- Statut: `verified`
- Fix reference: `supabase/functions/sophia-brain/router/safety_crisis_runtime.ts`, `supabase/functions/sophia-brain/router/run_test.ts`
- Verification reference: `safety_global_exit_rerun_20260623_r3`, T6 durable state has no active skill keys; T7 routes `normal_reply`.
- Tests requis: test unitaire state reducer exit; test integration T6 exit -> T7 no active flow; test paraphrase "je veux quitter le mode urgence"; anti-faux-positif ou safety reste active si resolution facts manquent.

## R2-B04

- Bug id: `R2-B04`
- Tours: T7-T9
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: global dispatcher active-flow skip / active flow arbitration
- Source amont: lecture d'un active state safety stale apres exit
- Symptome visible: demandes normales post-exit capturees par `safety_crisis`; au T9 Sophia dit seulement qu'on peut passer a un sujet normal au lieu de fournir les trois etapes demandees.
- Preuve systeme: T7, T8 et T9 ont `response_owner=safety`, `selected_handler=safety_crisis`, `route_reason=active_safety_crisis`, alors que les messages utilisateur demandent explicitement le mode normal ou un sujet normal.
- Correction attendue: quand le dernier flow safety a `status=exit` / last exit memo global et qu'aucune cle active valide n'existe, le dispatcher global doit reprendre la main. Le last exit memo doit informer l'arbitrage, pas relancer le local dispatcher.
- Statut: `verified`
- Fix reference: `supabase/functions/sophia-brain/router/safety_crisis_runtime.ts`, `supabase/functions/sophia-brain/router/run_test.ts`
- Verification reference: `safety_global_exit_rerun_20260623_r3`, T7 routes `normal_reply`; T8 routes `product_help`.
- Tests requis: QA integration ou test route avec demande normale post-exit; paraphrase "sujet normal maintenant"; anti-faux-positif avec fresh safety signal qui doit preempter a nouveau.
