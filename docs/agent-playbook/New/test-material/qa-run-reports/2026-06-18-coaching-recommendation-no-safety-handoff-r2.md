# QA Run Report - Coaching Recommendation No Safety Handoff R2

## 1. Contexte Du Test

- Date: 2026-06-18
- Run: `coachingrec-no-safety-handoff-20260618-r2`
- Persona: persona QA temporaire locale `00dbab4b-a2c9-4253-85e5-c9ece05aef7d`, email `qa-normal-coachingrec-no-safety-handoff-20260618-r2-1781801602428@example.com`
- Objectif: verifier que `coaching_recommendation` ne peut plus produire de handoff safety local sur un blocage d'action, puis recontroler ownership produit et direct effect one-shot reminder.
- Trajectoire: blocage mail Camille -> carte d'attaque -> question emplacement produit -> comparaison attack/adjust -> rappel ponctuel + coaching -> confirmation de regle.
- Surfaces visees: dispatcher global, `readActiveFlowState`, local flow `coaching_recommendation`, visible agents, direct effect `create_one_shot_reminder`, absence de handoff safety.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Les 5 tours ont ete choisis au fil de la conversation. Aucun code modifie pendant le run. Cleanup cible execute en fin de run; `user_memories` retourne `404` car absent du schema local.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Depuis hier je repousse le mail pour Camille. Quand j'ouvre le brouillon, je bloque et je pars faire autre chose. Je ne sais pas si je dois preparer une carte d'attaque ou modifier l'action.

**Sophia**
> La carte d’attaque est la plus adaptée ici : ton blocage ressemble surtout à une difficulté de démarrage sur un mail déjà identifié. Si, en relisant le brouillon, tu vois que le mail est mal cadré ou trop lourd, l’ajustement du plan peut venir ensuite.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non expose dans la trace courte
- executed_tools: []
- durable_effect: aucun
- detail positif: `skill_run.status=continue`; active skill `coaching_recommendation`, recommendation `attack_card`; aucun `handoff`, aucun `target_dispatcher=safety_crisis`

### Tour 2

**Verdict du tour:** green

**User**
> Ok. Si je veux la preparer moi-meme dans Sophia, je vais ou exactement ? Ne cree rien depuis le chat.

**Sophia**
> Va dans **Dashboard > Plan**, ouvre ta mission ou ton habitude liée au mail, puis cherche l’option pour **préparer/générer une carte d’attaque** si elle est disponible. Une fois fait, tu la retrouves dans **Dashboard > Ressources**, rangée par niveau, pour la consulter. Je ne crée rien depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non expose dans la trace courte
- executed_tools: []
- durable_effect: aucun
- detail positif: `product_help.detected=true`, mais arbitration `continue_active`, `active_owner=coaching_recommendation`

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne; `BF-INTAKE-05` - Semantique composite aplatie

**User**
> En fait le brouillon est la, mais je ne sais meme pas quelle decision je dois demander a Camille. La carte d'attaque suffit ou la c'est plutot ajuster l'action ?

**Sophia**
> La carte d’attaque suffit si le blocage, c’est surtout de formuler et envoyer le mail.
>
> Si le vrai problème, c’est que le contenu du mail ou la cible a changé, alors il faut plutôt ajuster l’action.  
> Là, d’après ce que tu dis, je partirais sur carte d’attaque d’abord. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `coaching_recommendation_exit_to_global`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non expose dans la trace courte
- executed_tools: []
- durable_effect: aucun
- detail systeme: arbitration dit pourtant `decision=continue_active`, `active_owner=coaching_recommendation`, `selected_owner=coaching_recommendation`; active state reste `coaching_recommendation`.

**Analyse si yellow/red**
- Symptome: le tour reste dans le sujet coaching, mais la reponse finale est owned par `normal_reply` et `selected_handler=null`.
- Source amont probable: sortie `exit_to_global_dispatcher` trop permissive ou final routing qui honore un exit local alors que l'arbitration active indique encore `continue_active`.
- Owner runtime: arbitration/skill runtime autour de `coaching_recommendation`.
- Meilleure correction selon les guidelines: si `readActiveFlowState`/arbitration continue l'active owner, le rendu final ne doit pas passer `normal_reply`; le local dispatcher doit utiliser `answer_followup` ou `recommend_feature` pour une comparaison attack/adjust encore dans le flow.
- Pourquoi ce n'est pas un patch local: le bug oppose la source canonique d'ownership a la decision finale de response owner.
- Note qualite: le user indique une action mal definie ("quelle decision demander a Camille"), ce qui aurait du pousser plus clairement `adjust_plan`; la reponse garde `attack_card` en priorite.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-LEDGER-02` - Commit reel mal rendu

**User**
> Dans 20 minutes, rappelle-moi de relire ce brouillon, et aide-moi aussi a choisir le tout premier geste pour repartir dessus sans me disperser.

**Sophia**
> C'est programmé pour vendredi 22 mai à 10:20: je te ferai un rappel pour relire ce brouillon.
>
> C'est programmé pour vendredi 22 mai à 10:20 : je te ferai un rappel pour relire ce brouillon.
>
> Pour repartir sans te disperser, fais juste ça : ouvre le brouillon et relis uniquement la première phrase.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation_with_direct_effects`
- safety: `none`
- direct_effects: [`create_one_shot_reminder`]
- operation: `create_one_shot_reminder`
- pending_confirmation: none
- memory_plan: non expose dans la trace courte
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: un `scheduled_checkin` cree, `status=pending`, `event_context=one_shot_reminder:relire_ce_brouillon`, `scheduled_for=2026-05-22T08:20:00+00:00`
- note: `client_now_iso` du runner est `2026-05-22T10:00:00.000+02:00`; l'heure affichee vient du temps injecte par le test.

**Analyse si yellow/red**
- Symptome: un seul rappel est cree en DB, mais la confirmation visible est dupliquee.
- Source amont probable: final response pipeline/direct effect confirmation compose deux fois le meme commit avec le visible agent.
- Owner runtime: direct effect confirmation handoff / final response composer.
- Meilleure correction selon les guidelines: une confirmation de commit doit etre rendue une seule fois, puis le visible agent traite le reste du besoin.
- Pourquoi ce n'est pas un patch local: le commit DB est correct; le bug est dans le rendu/ledger de confirmation.

### Tour 5

**Verdict du tour:** green

**User**
> Ok, donc pour ce cas je garde carte d'attaque tant que l'action est claire, et j'ajuste le plan seulement si la demande a Camille est mal definie, c'est bien ca ?

**Sophia**
> Oui, c’est ça. Tant que l’action reste claire, je garde la carte d’attaque. Si la demande à Camille est vraiment mal définie ou mal calibrée, là on regarde l’ajustement du plan.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non expose dans la trace courte
- executed_tools: []
- durable_effect: aucun nouveau; le rappel du tour 4 reste le seul checkin du run avant cleanup

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le faux safety du run precedent est corrige: le premier tour retourne une reponse utile, non vide, avec `status=continue`.
- Sophia explique correctement la priorite globale: carte d'attaque pour demarrage d'une action claire, `adjust_plan` si l'action est mal definie.
- La question produit inline reste naturelle et ne cree rien.
- Le composite rappel + coaching repond aux deux intentions.

**Problemes**
- Tour 3: Sophia tranche encore trop vite vers carte d'attaque alors que "je ne sais meme pas quelle decision demander" est un signal fort d'action mal definie. Famille: `BF-INTAKE-05`. Severite: yellow.
- Tour 4: confirmation de rappel dupliquee. Famille: `BF-LEDGER-02`. Severite: yellow.

**Fix propose**
- Source amont: local dispatcher coaching pour la comparaison attack/adjust; final response pipeline pour la confirmation.
- Correction recommandee: renforcer le mapping "objectif/cible de l'action flous" -> `adjust_plan`; dedupliquer la confirmation de direct effect avant rendu final.
- Tests d'invariant attendus: "je ne sais pas quoi demander a X" doit prioriser `adjust_plan`; "rappelle-moi dans X et aide-moi aussi" doit rendre une seule confirmation.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tour 1 verifie la correction principale: aucun `handoff`, aucun `safety_crisis`, owner `coaching_recommendation`, `skill_run.status=continue`.
- Tour 2 verifie l'ownership actif face a `product_help.detected=true`.
- Tour 3 revele une incoherence: arbitration `continue_active` et active state coaching, mais response owner final `normal_reply` avec `route_reason=coaching_recommendation_exit_to_global`.
- Tours 4 et 5 reviennent correctement sur `coaching_recommendation`.

**Skills / Operations / Tools**
- Aucun outil aux tours 1, 2, 3, 5.
- Tour 4: `create_one_shot_reminder` execute avec succes, un seul checkin DB observe.
- `effect_ledger.counts` reste a zero au tour 4 malgre `executed_tools=["create_one_shot_reminder"]`, warning deja observe dans R1.

**Memory / Effets durables**
- Active state `__active_conversation_skill_v1` persiste sur le run.
- Le rappel cree au tour 4 est le seul effet durable observe, puis supprime au cleanup.
- Cleanup cible OK pour `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`; `user_memories=404`.

**Problemes**
- `normal_reply` peut encore devenir owner sur un tour qui appartient logiquement au flow actif.
- Confirmation directe du reminder rendue deux fois.

**Fix propose**
- Faire respecter l'arbitration active comme source canonique jusqu'au final owner.
- Ajouter un invariant integration: si arbitration `continue_active` et active owner `coaching_recommendation`, le response owner final ne peut pas etre `normal_reply` sauf exit explicite valide et fermeture active state.
- Corriger la composition de confirmation direct effect pour ne pas repeter le commit.

## Verdict Global

Yellow. La regression critique est corrigee: `coaching_recommendation` ne handoff plus vers safety sur un blocage d'action. Il reste deux bugs independants: sortie ponctuelle vers `normal_reply` malgre active owner coaching, et confirmation one-shot reminder dupliquee.
