# QA Run Report - plan_realignment_deep_r4

## 1. Contexte Du Test

- Date: 2026-07-01
- Run: `plan_realignment_deep_r4`
- Persona: `qa-skill`, connexion temporaire `plan_realign_planrealign_r4_deep`
- Objectif: tester plus profondement `plan_realignment` avec multi-intention rappel ponctuel + realignement, refus d'execution depuis le chat, nuance emotionnelle, question produit, trame explicite et sortie vers coaching hors plan.
- Trajectoire: rappel ponctuel + decrochage du plan -> refus d'ajustement depuis le chat -> honte/self-blame -> guidance produit -> trame a trous demandee explicitement -> changement de cible vers action hors plan.
- Surfaces visees: dispatcher global, ownership actif, local flow `plan_realignment`, direct effect `create_one_shot_reminder`, visible agent, exit note vers global, `coaching_recommendation` en sortie.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, appels tour par tour, aucune reponse fabriquee par renderer/fallback.
- Validite QA: valide. Trace exportee dans `tmp/planrealign_r4deep_trace.json`; 12 `chat_messages`, 0 `system_error_logs`. Connexion temporaire nettoyee apres run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Dans 45 minutes, rappelle-moi d’ouvrir Ajuster mon plan. Et là j’ai décroché de toute ma semaine : je veux comprendre quoi raconter à Sophia sans que tu écrives une réponse à ma place.

**Sophia**
> C’est noté : dans 45 minutes, je te rappelle d’ouvrir Ajuster mon plan.
>
> Pour ce que tu peux y raconter à Sophia, pense surtout à ce qui a décroché cette semaine : ce qui n’a pas tenu, pourquoi ça a coincé, ce qui est devenu trop lourd ou irréaliste, ton niveau de retard, ton énergie dispo en ce moment, et ce que tu veux absolument garder malgré tout.
>
> L’idée n’est pas d’écrire “la bonne réponse”, mais de donner assez de contexte pour que ton plan reparte sur quelque chose de tenable.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `plan_realignment_signal`
- safety: `none`
- direct_effects: [`create_one_shot_reminder`]
- operation: `create_one_shot_reminder`
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: `scheduled_checkins` row creee, `status=pending`, `scheduled_for=2026-07-01T13:44:03.829Z`, `reminder_instruction=ouvrir Ajuster mon plan`
- effect_ledger: `committed=0` malgre `tool_execution=success`

**Analyse si yellow/red**
- Symptome: cote user et DB, le comportement est bon; cote observabilite, l'EffectLedger annonce `committed=0` alors qu'un rappel a bien ete cree et que `executed_tools` contient `create_one_shot_reminder`.
- Source amont probable: trace/effect ledger final du direct effect transversal.
- Owner runtime: final response trace / effect ledger adapter.
- Meilleure correction selon les guidelines: aligner le ledger et la trace avec les effets durables transversaux reellement commis, sans changer le wording visible.
- Pourquoi ce n'est pas un patch local: le rappel est correct; le probleme est la projection systeme du commit dans les traces QA.

### Tour 2

**Verdict du tour:** green

**User**
> Tu peux ajuster le plan toi-même ici ? Et est-ce que je dois détailler toutes les actions que j’ai ratées une par une ?

**Sophia**
> Non, je ne peux pas le faire ici. Va dans Dashboard > Plan > Ajuster mon plan : c’est là que tu peux expliquer ce qui n’a pas tenu, ce qui t’a fait décrocher, ce que tu veux garder, ce qui est devenu trop lourd, et le rythme qui serait plus tenable. Tu n’as pas besoin de détailler chaque action ratée une par une si c’est trop lourd : parle plutôt du blocage global, du contexte qui a changé et de tes contraintes de temps ou d’énergie.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `active_plan_realignment`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> En vrai j’ai honte, j’ai envie d’écrire juste que c’est ma faute et que j’ai été nul. Est-ce que c’est utile de mettre ça ?

**Sophia**
> Non, ce n’est pas utile de te résumer à ça. Le plus aidant, c’est plutôt d’expliquer ce qui a coincé cette semaine, ce qui a rendu le rythme trop lourd ou irréaliste, et ce que tu veux retrouver à la place. Si tu veux, tu peux aussi dire ce que tu veux absolument garder, même si le reste n’a pas tenu. Va dans Dashboard > Plan > Ajuster mon plan.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `plan_realignment_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: []
- durable_effect: none
- skill_signals: `plan_realignment.detected=true`

**Analyse si yellow/red**
- Symptome: la reponse visible est bonne, mais le tour repasse par `plan_realignment_signal` alors que T2 et T4 utilisent `active_plan_realignment`. Cela suggere une re-entree ou une transition active-state non stable.
- Source amont probable: local state `plan_realignment` / active flow retention / route trace.
- Owner runtime: `plan_realignment` reducer + `readActiveFlowState` integration.
- Meilleure correction selon les guidelines: verifier pourquoi l'etat actif n'est pas consomme comme owner actif sur ce tour, et ajouter un invariant QA: apres `status=continue`, un follow-up in-scope doit router par `active_plan_realignment`, pas par un nouveau signal global.
- Pourquoi ce n'est pas un patch local: le contenu visible est correct; le probleme concerne la continuite de flow et la source canonique d'ownership.

### Tour 4

**Verdict du tour:** green

**User**
> Ok, et concrètement je trouve où ce cadre ? Je veux être sûr de ne pas aller dans Ressources ou dans le chat.

**Sophia**
> Oui : va dans Dashboard > Plan, puis ouvre Ajuster mon plan. Ce n’est pas dans Ressources ni dans le chat. Là, tu peux expliquer ce qui a décroché sur ta semaine, ce qui t’a bloqué, ce qui est devenu trop lourd, et ce que tu veux garder malgré tout.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `active_plan_realignment`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: []
- durable_effect: none

### Tour 5

**Verdict du tour:** green

**User**
> Là oui donne-moi une trame, mais avec des blancs à remplir et pas une phrase finale à copier telle quelle.

**Sophia**
> Oui — ouvre Dashboard > Plan > Ajuster mon plan, puis pars d’une trame comme celle-ci et remplis avec tes vrais détails :
>
> - Ce qui n’a pas tenu : ___
> - Depuis quand / à quel point je suis en retard : ___
> - Ce qui a bloqué ou changé : ___
> - Ce que je veux garder absolument : ___
> - Ce qui est devenu trop lourd ou irréaliste : ___
> - Le rythme que je peux tenir maintenant : ___
> - Ce que j’accepte de laisser de côté pour l’instant : ___
>
> Pas besoin d’écrire que c’est “ta faute”. Le plus utile, c’est surtout de décrire le décalage et le contexte réel.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `active_plan_realignment`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: []
- durable_effect: none

### Tour 6

**Verdict du tour:** green

**User**
> Autre sujet lié : finalement le plus gros blocage concret, c’est un mail à Camille hors de mon plan. Dès que j’ouvre le brouillon je pars ailleurs. Là tu m’aiderais comment ?

**Sophia**
> Je partirais sur une carte d’attaque libre, technique préparer le terrain : ici le blocage vient surtout du contexte et de la distraction dès l’ouverture du brouillon, donc l’idée est de rendre le démarrage plus simple et plus cadré. Si tu veux la retrouver ensuite, va dans Dashboard > Ressources puis ouvre le chemin des cartes et choisis-en une nouvelle.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: []
- durable_effect: none
- note_information: `source_flow_id=plan_realignment`, `target_dispatcher=global`
- coaching signal: `coaching_type=no_plan_action`, `action_context.source=free`, `plan_item_id=null`, `action_title=mail à Camille`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia compose correctement rappel ponctuel + realignement au T1, sans absorber le besoin conversationnel.
- Les reponses T1-T5 ouvrent les axes de reflexion au lieu de donner une phrase finale au user.
- T2 refuse clairement l'ajustement depuis le chat.
- T3 traite la honte sans basculer vers une potion ou un autre flow inapproprie.
- T6 sort naturellement vers coaching quand le user recentre sur une action hors plan.

**Problemes**
- Aucun probleme visible bloquant. Les warnings sont systeme/trace, pas UX.

**Fix propose**
- Aucun fix visible prioritaire pour le wording `plan_realignment`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1 entre par `plan_realignment_signal`, avec direct effect transversal `create_one_shot_reminder`.
- T2, T4, T5 restent sous `active_plan_realignment`.
- T3 est fonctionnel mais suspect: `route_reason=plan_realignment_signal` au lieu de `active_plan_realignment`.
- T6 sort proprement via note `plan_realignment -> global`, puis `coaching_recommendation` avec `coaching_type=no_plan_action` et `action_context.source=free`.

**Skills / Operations / Tools**
- T1: `create_one_shot_reminder` execute avec succes.
- T1: entree durable verifiee dans `scheduled_checkins`, `status=pending`, `reminder_instruction=ouvrir Ajuster mon plan`.
- T2-T5: aucun tool.
- T6: aucun tool; skill actif final devient `coaching_recommendation`.

**Memory / Effets durables**
- `memory_mode=none` sur tout le run.
- `system_error_logs=0`.
- Durable effect attendu: un rappel ponctuel au T1, correctement cree puis nettoye avec la connexion temporaire.
- Warning: `effect_ledger.committed=0` au T1 malgre `tool_execution=success` et row `scheduled_checkins`.

**Problemes**
- T1: trace ledger incoherente pour direct effect commis. Famille: `BF-TEST-01`. Impact systeme: QA moins fiable si on s'appuie sur `effect_ledger` seul.
- T3: route_reason non actif sur un follow-up in-scope. Famille: `BF-STATE-01`. Impact systeme: ownership probablement correct en sortie visible, mais la source canonique d'active flow semble instable ou mal tracee.

**Fix propose**
- Source amont T1: effect ledger / trace final response pour direct effects transversaux.
- Correction recommandee T1: faire remonter le commit `create_one_shot_reminder` dans `effect_ledger` ou documenter clairement un champ canonique alternatif.
- Tests d'invariant T1: multi-intent direct effect + local flow doit avoir `executed_tools=[create_one_shot_reminder]`, DB row creee, et trace ledger coherente.
- Source amont T3: active flow state / local reducer completion / route trace.
- Correction recommandee T3: garantir qu'un follow-up plan_realignment in-scope apres `status=continue` utilise `active_plan_realignment`.
- Tests d'invariant T3: T1 plan_realignment continue, T2 follow-up emotionnel in-scope -> pas de nouveau `skill_signal` global, owner actif preserve.

## Verdict Global

- Verdict: yellow
- Raison principale: UX et comportement metier `plan_realignment` sont bons, mais le run revele deux warnings systeme: ledger du rappel non coherent et route_reason non actif sur un follow-up in-scope.
- Follow-up prioritaire: corriger/clarifier l'observabilite des direct effects dans `effect_ledger`, puis verifier la stabilite active-state de `plan_realignment` sur les follow-ups emotionnels in-scope.
