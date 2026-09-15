# QA Run Report - Coaching Recommendation Active Ownership R1

## 1. Contexte Du Test

- Date: 2026-06-18
- Run: `coachingrec-active-ownership-20260618-r1`
- Persona: persona QA temporaire locale `ff04e855-21e7-4fdb-8516-1f2240125756`, email `qa-normal-coachingrec-active-ownership-20260618-r1-1781797723212@example.com`
- Objectif: tester `coaching_recommendation` apres les corrections d'ownership actif, notamment question produit inline et direct effect `create_one_shot_reminder`.
- Trajectoire: blocage de lancement sur mail -> reprise apres incident -> carte d'attaque -> question "ou la trouver" -> comparaison `adjust_plan` -> rappel ponctuel + coaching.
- Surfaces visees: dispatcher global, `readActiveFlowState`, active skill state, local dispatcher `coaching_recommendation`, visible agents, direct effect one-shot reminder, absence de handoff produit.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide comme run de detection de regression. Le tour 1 a echoue en HTTP 409 avec reponse vide; la reprise a continue sur le meme run. Cleanup cible execute en fin de run pour `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` et `auth.users`; `user_memories` a retourne `404`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Je dois ecrire un mail a Camille depuis deux jours, mais je bloque a chaque fois que j'ouvre le brouillon. Je ne sais pas si je dois juste me forcer, preparer une carte, ou changer l'action.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 409
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `coaching_recommendation_for_blocked_action`
- executed_tools: []
- durable_effect: aucun `scheduled_checkins=[]`
- detail critique: `skill_run.status="handoff"` alors que `safety=none`; temp memory contient `__last_coaching_recommendation_exit_memo` avec `handoff_reason="safety"` et `target_dispatcher="safety_crisis"`.

**Analyse si yellow/red**
- Symptome: entree coaching correcte, mais aucune reponse visible et HTTP 409.
- Source amont probable: reducer/local flow `coaching_recommendation` qui emet encore une transition `handoff` vers safety pour un simple `launch_blocker`.
- Owner runtime: `coaching_recommendation` local dispatcher / transition contract.
- Meilleure correction selon les guidelines: bloquer toute sortie `handoff` legacy dans ce flow sauf safety pregate reellement active; un blocage d'action doit rester dans les steps coaching et produire une reponse visible.
- Pourquoi ce n'est pas un patch local: le probleme est une transition de flow et un statut runtime, pas une phrase visible.

### Tour 2

**Verdict du tour:** green

**User**
> Je parle bien d'un blocage d'action, pas d'un danger. Le souci c'est que je ne sais pas comment lancer ce mail sans repartir faire autre chose.

**Sophia**
> La carte d’attaque est le bon levier ici : elle t’aide à préparer le premier geste du mail avant de commencer, pour éviter de partir faire autre chose. Si tu veux, pars sur une carte simple centrée sur le tout premier pas.

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
- durable_effect: aucun `scheduled_checkins=[]`; active skill `coaching_recommendation`, stage `recommend`, recommendation `attack_card`

### Tour 3

**Verdict du tour:** green

**User**
> Ok, et si je veux preparer cette carte d'attaque moi-meme, je la trouve ou dans Sophia ? Ne cree rien depuis le chat.

**Sophia**
> Va dans **Ressources** : c’est là que tu peux retrouver une carte d’attaque déjà générée, ou la préparer si l’option est dispo depuis une mission ou une habitude liée. Dans **Plan**, tu peux seulement en voir un aperçu quand elle est déjà reliée.

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
- detail positif: `product_help.detected=true`, mais arbitration `continue_active`, `active_owner=coaching_recommendation`, `last_visible_task_kind=explain_platform_destination`

### Tour 4

**Verdict du tour:** green

**User**
> Et si finalement c'est juste que le mail me parait un peu flou, est-ce que je dois quand meme faire une carte d'attaque ou plutot ajuster le plan ?

**Sophia**
> Là, le bon levier, c’est l’ajustement du plan : si le mail est trop flou dans son contenu ou son objectif, il vaut mieux le recadrer d’abord. Si le mail est clair mais que tu bloques juste pour t’y mettre, la carte d’attaque peut aider ensuite.

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
- durable_effect: aucun; active skill recommendation `adjust_plan`

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-LEDGER-02` - Commit reel mal rendu

**User**
> Dans 25 minutes, rappelle-moi de relire le brouillon du mail, et aide-moi aussi a choisir le premier geste pour ne pas repartir sur autre chose.

**Sophia**
> C'est programmé pour vendredi 22 mai à 10:25: je te ferai un rappel pour relire le brouillon du mail.
>
> C’est programmé pour vendredi 22 mai à 10:25 : je te ferai un rappel pour relire le brouillon du mail.
>
> La carte d’attaque est le bon levier ici pour te donner le premier geste et éviter de partir ailleurs. Si besoin, l’ajustement du plan peut venir ensuite, si l’action ne colle plus.

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
- durable_effect: un `scheduled_checkin` cree, `status=pending`, `event_context=one_shot_reminder:relire_le_brouillon_du_mail`, `scheduled_for=2026-05-22T08:25:00+00:00`
- note de cadrage: le runner a fourni `client_now_iso=2026-05-22T10:00:00.000+02:00`, donc l'heure affichee correspond au temps injecte par le test, pas a la date reelle du 2026-06-18.

**Analyse si yellow/red**
- Symptome: le rappel est bien cree et le coaching continue, mais la confirmation "C'est programmé..." est rendue deux fois.
- Source amont probable: pipeline de composition entre confirmation du direct effect et visible agent coaching; la confirmation est injectee puis aussi re-rendue par la reponse finale.
- Owner runtime: final response pipeline / direct effect confirmation handoff vers visible agent.
- Meilleure correction selon les guidelines: transmettre au visible agent un bloc de confirmation deja consomme ou dedupliquer la confirmation durable avant rendu final; conserver une seule confirmation puis la partie coaching.
- Pourquoi ce n'est pas un patch local: la duplication vient de l'agenda multi-intention et du rendu de commit, pas d'un wording specifique.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Apres reprise, Sophia recommande correctement `attack_card` pour un blocage de lancement.
- La question produit "ou trouver la carte" reste dans le flow coaching, avec une reponse courte et utile.
- La comparaison `adjust_plan` / `attack_card` est coherente: `adjust_plan` seulement quand l'action est floue, `attack_card` quand le demarrage bloque.
- Le tour composite garde les deux intentions: rappel cree et conseil coaching donne.

**Problemes**
- Tour 1: experience inutilisable, reponse vide et HTTP 409 sur une demande coaching normale. Famille: `BF-STATE-01`. Impact: le user ne recoit aucune aide au premier message. Severite: red.
- Tour 5: confirmation de rappel dupliquee. Famille: `BF-LEDGER-02`. Impact: friction visible et impression de pipeline mal assemble. Severite: yellow.

**Fix propose**
- Source amont: local flow `coaching_recommendation` pour la transition handoff; final response/direct effect pipeline pour la duplication.
- Correction recommandee: garantir que les blocages d'action restent dans `coaching_recommendation` sauf safety pregate reel; rendre une seule confirmation de direct effect quand un visible agent ajoute aussi une reponse coaching.
- Tests d'invariant attendus: premier tour "je bloque a demarrer une action" doit retourner 200 avec assistant non vide; tour composite "rappelle-moi dans X et aide-moi a choisir le premier geste" doit creer un seul checkin et rendre une seule confirmation.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1 route vers le bon owner (`coaching_recommendation`) mais le skill retourne `status=handoff`, ce qui casse la reponse.
- Tours 3 a 5 valident l'arbitrage actif: `readActiveFlowState`/active state garde `coaching_recommendation` comme owner, meme quand `product_help.detected=true`.
- Tour 5 valide que `create_one_shot_reminder` peut etre execute en direct effect sans voler l'owner conversationnel.

**Skills / Operations / Tools**
- `selected_skill_id=coaching_recommendation` sur les 5 tours.
- Aucun outil appele aux tours 1 a 4.
- Tour 5: `executed_tools=["create_one_shot_reminder"]`, `tool_execution=success`, un seul checkin DB observe.

**Memory / Effets durables**
- Tour 2 cree bien les deux cles active state: `__active_skill_state` et `__active_conversation_skill_v1`.
- Tour 3: active state stage `followup`, task `explain_platform_destination`, recommendation `attack_card`.
- Tour 5: active state reste `coaching_recommendation`, turn_count `4`, recommendation `attack_card`.
- Cleanup cible effectue apres verification; tous les objets du run ont ete supprimes sauf `user_memories` qui n'existe pas dans ce schema local (`404`).

**Problemes**
- `skill_run.status=handoff` au tour 1 indique qu'un chemin legacy ou une transition safety reste observable dans le runtime local.
- Le `effect_ledger.counts` reste a zero au tour 5 malgre `executed_tools=["create_one_shot_reminder"]`; ce point est un warning de tracabilite, secondaire face a la duplication visible.

**Fix propose**
- Supprimer ou neutraliser la transition `handoff` de `coaching_recommendation` pour les cas non-safety.
- Ajouter un test integration sur `active_coaching_recommendation_with_direct_effects` qui verifie: owner coaching, checkin count = 1, confirmation rendue une seule fois, conseil coaching present.

## Verdict Global

Red. L'ownership actif vers `product_help` est corrige sur le cas critique, et le direct effect reste dans le flow coaching. Mais le premier tour peut encore produire un `handoff` legacy avec reponse vide, et le rendu composite du rappel duplique la confirmation.
