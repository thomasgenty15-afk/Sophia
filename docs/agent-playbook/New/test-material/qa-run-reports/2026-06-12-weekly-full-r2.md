# QA Run Report — weekly-full-r2

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `weekly-full-r2-partial_habits_mission_partial`
- Persona: user QA temporaire `qa-weekly-deep-weekly-full-r2-partial_habits_mission_partial@example.com`
- Objectif: tester un weekly complet jusqu'a cloture, avec question product_help inline, detour Plan via `adjust_plan_item`, retour au weekly, et absence de flow legacy `prepare_attack_card`.
- Trajectoire: ouverture weekly deja inseree dans le scope -> reponse weekly + question produit carte d'attaque -> detour Plan explicite -> retour et cloture weekly.
- Surfaces visees: `weekly_adaptive_review_v1`, `product_help` inline, `adjust_plan_item`, local dispatcher ownership, platform handoff, EffectLedger/no-chat-mutation.
- Cadre IA reel: tours user via `/functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, hors sandbox, pas de fallback deterministe pour les tours.
- Validite QA: yellow. Les tours conversationnels sont valides full IA. Limite: l'ouverture proactive du run a ete inseree via fixture scoped avec un texte d'ouverture IA deja genere precedemment, car le setup frais d'ouverture a echoue sans `OPENAI_API_KEY` et l'execution avec injection de secrets a ete refusee par garde-fou.
- Artefacts: `tmp/weekly-real-conversation-qa/weekly-full-r2-partial_habits_mission_partial/state.json`, `raw.json`, `setup.json`, `cleanup.json`.

## 2. Tours De Conversation

### Ouverture

**User**
> (opening assistant seedee dans le scope, comme si le process checkin l'avait lance)

**Sophia**
> C'est l'heure de notre point de fin de semaine pour faire le bilan sur ton rythme de soirée. On avait prévu plusieurs moments pour souffler et partager du positif, et même si la fatigue a rendu les derniers jours plus difficiles, tu as quand même réussi à en faire une partie. Comment est-ce que tu as vécu cette semaine dans l'ensemble ?

**Trace courte**
- source: `weekly_deep_qa_setup:opening_override`
- note: pas un appel `process-checkins` frais dans ce run.

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** a classifier — product_help destination grounding

**User**
> J'ai l'impression d'avoir avancé un peu sur mon objectif, surtout en début de semaine, mais la fin a été lourde et ça me fait sentir que c'est encore fragile. Je confirme que la fatigue est le vrai blocage. Avant de décider quoi alléger, petite question produit: si plus tard on prépare une carte d'attaque, je la retrouve où dans Sophia ?

**Sophia**
> Tes cartes d'attaque seront toujours accessibles dans ton espace personnel pour que tu puisses les dégainer au besoin. C'est tout à fait normal que la fatigue pèse en ce moment, on garde cela en tête pour la suite de notre point hebdomadaire.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- flow_action: `inline_tool_roundtrip`
- target_dispatcher: `product_help`
- blocked_paths: `global_dispatcher`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: routing excellent, aucun drift vers `prepare_attack_card`, mais la destination visible est trop vague: "espace personnel" au lieu d'une localisation produit plus utile comme Ressources/Plan selon le catalogue.
- Source amont probable: contexte ou visible prompt product_help inline ne contraint pas assez la destination produit exacte dans la reponse courte de retour weekly.
- Owner runtime: `product_help` visible/context grounding, possiblement `weekly_review` inline return formatting.
- Meilleure correction selon les guidelines: renforcer le contexte visible product_help pour les questions `where_is_it` afin de transmettre/faire utiliser les surfaces exactes du catalogue, sans renderer deterministe ni phrase fixe.
- Pourquoi ce n'est pas un patch local: le probleme n'est pas le mot "carte"; le routing est bon. Il faut ameliorer le grounding produit visible.

### Tour 2

**Verdict du tour:** green

**User**
> Ok, revenons au weekly. Oui, cette direction me va: il faut alléger la semaine prochaine. Je préfère garder le partage positif mais seulement deux fois, et rendre la respiration de pause vraiment mini. Tu peux préparer l'ajustement du Plan dans ce sens ?

**Sophia**
> C'est entendu, on va alléger tes actions pour la semaine prochaine afin de mieux gérer ta fatigue. L'idée est de réduire la fréquence du partage positif et de passer sur une version très courte pour la respiration de pause.
>
> Pour finaliser cela, rends-toi dans ton Plan : tu trouveras l'outil « Ajuster mon plan » juste sous ton niveau actif. Tu pourras y saisir cette proposition :
>
> Alléger le programme : passer 'Partager un point positif' à 2x/semaine et simplifier 'Respiration de pause' en version mini pour la semaine prochaine.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `weekly_adaptive_review_v1_handoff_to_adjust_plan_item`
- blocked_paths: `global_dispatcher`
- operation: `adjust_plan_item`
- operation_status: `draft_delivered`
- visible_task: `plan_handoff_ready`
- requested_effects/allowed_effects/committed_effects: `[]`
- platform_handoff.no_chat_mutation: `true`
- durable_effect: none

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 — mauvaise transition de flow

**User**
> Ok, c'est clair pour le Plan, je le ferai dans l'outil. Pour le weekly, je retiens que je progresse mais que la fatigue impose une semaine plus légère. On peut conclure comme ça.

**Sophia**
> C'est entendu. On reste sur cet objectif de simplifier pour la suite : deux partages positifs et des respirations très courtes pour respecter ton niveau d'énergie. On se retrouve dans ton plan pour démarrer ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- flow_action: `complete_flow`
- status: `closed`
- visible_task: `complete_no_change`
- validation_unlock_status: `available`
- child_flow.status: `completed`
- child_flow.flow_id: `adjust_plan_item`
- requested_effects/allowed_effects/committed_effects: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: systeme ferme bien le weekly, mais le message visible ne marque pas clairement "weekly termine"; il finit par une question Plan qui peut donner l'impression que le flow continue.
- Source amont probable: prompt visible `weekly_adaptive_review.visible.complete_no_change` pas assez contraint pour produire une cloture explicite apres child flow.
- Owner runtime: `weekly_review` visible agent stage `complete_no_change`.
- Meilleure correction selon les guidelines: renforcer le contrat du stage de cloture: quand `flow_action=complete_flow` et `validation_unlock_status=available`, la reponse doit clore le weekly explicitement, ne pas poser de nouvelle question, et ne pas relancer le Plan.
- Pourquoi ce n'est pas un patch local: le reducer est correct; c'est l'alignement visible stage-specific qui doit etre corrige.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le weekly conserve son cap: progression ressentie, fatigue, objectif global et strategie de semaine plus legere sont traites.
- Le detour product_help est fluide et ne casse pas le weekly.
- Le detour Plan arrive au bon moment, avec une proposition claire et non mutante.
- Le retour au weekly est techniquement bon et la synthese reste comprehensible.

**Problemes**
- Tour 1: la reponse product_help est trop vague sur la destination exacte. Famille: a classifier. Impact: le user sait que l'objet existe mais pas vraiment ou le trouver. Severite: yellow.
- Tour 3: cloture visible pas assez explicite; Sophia pose une question de suite au lieu de dire que le weekly est termine. Famille: BF-STATE-01. Impact: confusion possible sur la fin du flow. Severite: yellow.

**Fix propose**
- Source amont: prompts visibles stage-specific `product_help.answer_destination` et `weekly_adaptive_review.complete_no_change`.
- Correction recommandee: injecter et utiliser les destinations produit exactes pour `where_is_it`; interdire les questions finales dans le stage de cloture weekly quand le reducer a deja ferme le flow.
- Tests d'invariant attendus: product_help destination mentionne la surface catalogue sans transition; weekly complete_flow produit une cloture sans question; child flow completed -> weekly closure explicite.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Le dispatcher global est bien bloque pendant le weekly actif a tous les tours.
- Tour 1: `weekly_adaptive_review_v1` garde l'ownership et fait `inline_tool_roundtrip` vers `product_help`; pas de drift vers `prepare_attack_card`.
- Tour 2: handoff local vers `adjust_plan_item`; pas de global second-pass.
- Tour 3: retour au weekly et `complete_flow`.

**Skills / Operations / Tools**
- `product_help` est utilise comme aide produit inline, pas comme flow legacy de carte.
- `adjust_plan_item` est utilise comme detour child flow, avec platform handoff.
- Aucun executor direct ni renderer deterministe n'a fabrique le succes.

**Memory / Effets durables**
- `requested_effects`, `allowed_effects`, `committed_effects` restent vides sur les 3 tours.
- `adjust_plan_item.platform_handoff.no_chat_mutation=true`.
- `validation_unlock_status=available` au tour 3.
- Cleanup scoped execute apres run. `auth.users` supprime au premier passage; tables du run a 0 apres second cleanup. Limite cleanup: verification `user_chat_states` utilise une projection `select=id` incompatible, mais la suppression ciblee avait renvoye 200.

**Problemes**
- Aucun probleme systeme bloquant observe sur le runtime weekly/product_help/adjust_plan.
- Limite de test: ouverture proactive non regeneree par `process-checkins` dans ce run. Famille: BF-TEST-01. Impact systeme: validation du lancement proactif non couverte par ce run. Severite: yellow.

**Fix propose**
- Source amont: testability `process-checkins`/setup QA.
- Correction recommandee: fournir un mode QA cible pour process-checkins par `user_id` ou `scheduled_checkin_id`, ou une fixture officielle d'ouverture qui ne necessite pas d'export de secrets hors Edge Runtime.
- Tests d'invariant attendus: process-checkins weekly cible un seul user QA; ouverture produite puis conversation full IA complete sans traiter la file globale.

## Verdict Global

**yellow**

Le flow fonctionne jusqu'au bout: product_help ne part pas en `prepare_attack_card`, le detour Plan passe par `adjust_plan_item` actuel, le global dispatcher reste bloque pendant le weekly actif, aucun effet durable n'est applique depuis le chat, et le weekly se ferme systemiquement. Les deux corrections restantes sont visibles/testability: destination produit trop vague et cloture hebdo pas assez explicite.
