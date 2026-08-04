# QA Run Report - wa-plan-ready-pref-r2

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `20260608_wa_plan_ready_pref_r2`
- Persona: temporary local QA WhatsApp user `qa-wa-plan-ready-pref-20260608_wa_plan_ready_pref_r2@example.com`, `is_test_persona=true`
- Objectif: verifier en conditions reelles locales que, quand un plan devient actif apres conversation Sophia, le retour WhatsApp en `awaiting_plan_finalization` relance le flow de preferences WhatsApp au lieu de sortir vers le flow normal.
- Trajectoire: plan actif local + `profiles.onboarding_completed=true` + `whatsapp_state=awaiting_plan_finalization` + absence de `__whatsapp_onboarding_done`, puis conversation WhatsApp loopback tour par tour.
- Surfaces visees: `whatsapp-webhook`, onboarding WhatsApp, active plan routing, `update_coach_preferences`, `track_progress_plan_item`, durable profile facts, state/temp memory.
- Cadre IA reel: valide pour la surface WhatsApp. Chemin local `functions/v1/whatsapp-webhook` avec transport loopback, reponses produites par le runtime Sophia reel, pas de renderer deterministe, pas de fallback direct `processMessage`. `test-send-message` n'a pas ete utilise car le bug concerne le pre-handler WhatsApp.
- Validite QA: valide. Les messages utilisateur ont ete choisis tour par tour apres lecture de la reponse precedente et des traces courtes.
- Nettoyage: artefacts locaux verifies a zero apres cleanup cible (`profiles`, `user_chat_states`, `chat_messages`, `conversation_turn_traces`, `user_cycles`, `user_transformations`, `user_plans_v2`, `user_plan_items`, `user_profile_facts`, `whatsapp_outbound_messages`, `whatsapp_inbound_dedup`).

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` + `BF-EFFECT-01`

**User**
> C’est fait

**Sophia**
> Note pour Lister 5 contacts professionnels: fait. 🙂
>
> Tu préfères une Sophia plutôt douce, plutôt directe, ou un mix des deux ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `track_progress_plan_item`
- route_reason: `normal_reply_default`
- direct_effects: `track_progress_plan_item`
- operation: logged progress on `Lister 5 contacts professionnels`
- durable_effect: progress item committed; `whatsapp_state` moved to `onboarding_pref_tone`

**Analyse si yellow/red**
- Symptome: le flow de preferences reprend, mais le meme "C'est fait" est aussi interprete comme completion d'une action du plan.
- Source amont probable: arbitration WhatsApp/dispatcher laisse `track_progress_plan_item` prendre le tour au lieu de reserver le message a la finalisation du plan et a l'onboarding preferences.
- Owner runtime: `whatsapp-webhook` pre-handler + global routing admission.
- Meilleure correction: quand `whatsapp_state=awaiting_plan_finalization` et que le plan vient d'etre reconnu actif, le tour de confirmation doit etre consomme par l'onboarding WhatsApp; aucun tool progress ne doit etre admis sur ce meme message.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01`

**User**
> Un mix, chaleureux mais direct.

**Sophia**
> Aucune nouvelle reponse assistant. Le dernier message visible reste celui du tour 1.

**Trace courte**
- http_status: 200
- response_owner: none
- selected_handler: none
- route_reason: none
- direct_effects: none
- durable_effect: none
- DB: le message user est insere; aucune trace et aucun assistant ne sont crees; `whatsapp_state` reste `onboarding_pref_tone`.

**Analyse si yellow/red**
- Symptome: le webhook accepte le message mais le flow ne repond pas.
- Source amont probable: transition `onboarding_pref_tone` non consommee sur le tour suivant, probablement a cause de l'etat runtime laisse par le tour 1 ou d'une sortie silencieuse du webhook apres inbound insert.
- Owner runtime: `whatsapp-webhook` state reducer / reply orchestration.
- Meilleure correction: garantir qu'un message entrant en state `onboarding_pref_tone` produit toujours soit une reponse assistant, soit une trace d'erreur; ajouter un invariant integration "inbound accepted -> assistant or explicit failure trace".

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-LEDGER-02`

**User**
> Tu as reçu ? Je disais : un mix chaleureux mais direct.

**Sophia**
> Oui, je te prépare ça comme préférence durable pour la suite.
>
> Ça correspond au réglage suivant : Ton global sur Bienveillant ferme.
>
> Je garderais surtout garder les réponses utiles et concrètes.
> J’éviterais d’en faire une règle trop rigide : transformer ça en règle trop rigide sur la longueur, les questions ou le format si ce n'est pas ton intention.
>
> Il ne manque plus qu’à aller dans les Préférences coach pour mettre à jour ce réglage.
> Concrètement : ouvre les Préférences coach choisis le réglage correspondant applique-le depuis la plateforme 🙂
>
> Tu préfères que je te challenge comment quand tu décroches : plutôt léger, normal, ou assez direct ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- durable_effect: `coach.tone=warm_direct`
- state: `onboarding_pref_challenge`

**Analyse si yellow/red**
- Symptome: la preference est bien persistée, mais Sophia dit qu'il faut aller dans les preferences coach pour l'appliquer.
- Source amont probable: rendu visible reutilise le handoff plateforme de `update_coach_preferences` dans un flow onboarding WhatsApp qui persiste pourtant la preference via operation.
- Owner runtime: preference onboarding renderer / operation response merge.
- Meilleure correction: en onboarding WhatsApp, rendre le commit reel ("c'est note pour la suite") et ne pas afficher le handoff plateforme quand le fact durable est ecrit.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-05`

**User**
> Plutôt normal, direct seulement si je décroche vraiment.

**Sophia**
> Dernier réglage : tu préfères que je pose peu de questions, que je creuse un peu, ou que je te questionne franchement quand ça aide ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_handoff_field_confirmation`
- durable_effect: `coach.challenge_level=high`
- state: `onboarding_pref_questions`

**Analyse si yellow/red**
- Symptome: le message demande un challenge plutôt normal avec directivité conditionnelle, mais le durable fact devient `high`.
- Source amont probable: intake composite aplati sur le marqueur "direct" au lieu de garder le niveau principal `normal` et la condition "si je décroche".
- Owner runtime: `update_coach_preferences` intake / canonical mapping.
- Meilleure correction: mapper les preferences conditionnelles en valeur principale + nuance, ou clarifier quand la condition change la valeur cible.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-LEDGER-02`

**User**
> Pose peu de questions, juste celles qui débloquent.

**Sophia**
> Oui, je te prépare ça comme préférence durable pour la suite.
>
> Ça correspond au réglage suivant : Tendance à poser des questions sur Peu de questions.
>
> Je garderais surtout garder les réponses utiles et concrètes.
> J’éviterais d’en faire une règle trop rigide : transformer ça en règle trop rigide sur la longueur, les questions ou le format si ce n'est pas ton intention.
>
> Il ne manque plus qu’à aller dans les Préférences coach pour mettre à jour ce réglage.
> Concrètement : ouvre les Préférences coach choisis le réglage correspondant applique-le depuis la plateforme 🙂
>
> Avant qu’on passe à la suite : la création de ton plan, ça s’est passé comment pour toi ? Tu es content du résultat ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_handoff_field_confirmation`
- durable_effect: `coach.question_tendency=low`
- state: `onboarding_plan_creation_feedback`

**Analyse si yellow/red**
- Symptome: meme contradiction ledger que tour 3; le fact est ecrit mais la reponse dit d'aller l'appliquer ailleurs.
- Source amont probable: handoff visible de l'operation non neutralise en contexte onboarding.
- Owner runtime: preference onboarding response composer.
- Meilleure correction: separer la reponse d'onboarding du rendu plateforme standard de `update_coach_preferences`.

### Tour 6

**Verdict du tour:** green

**User**
> Oui, le plan me convient, je veux commencer par ça.

**Sophia**
> Parfait, c’est noté ✅
>
> Pour commencer maintenant, tu veux qu’on parle de ton plan, ou d’autre chose qui te paraît plus important ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `topic_change_clears_active_handoff`
- direct_effects: none
- state: `onboarding_topic_choice`

### Tour 7

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATUS-01`

**User**
> Le plan, clairement.

**Sophia**
> OK, go plan ✅  
> Cette semaine, il y a 1 mission : lister 5 contacts professionnels (missions; task; one_shot_mission; status=active).  
>
> Tu veux que je t’aide à la faire en mode “liste prête à envoyer” (oui/non) ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `topic_change_clears_active_handoff`
- durable_effect: `__whatsapp_onboarding_done` set; `whatsapp_state=null`
- state: normal WhatsApp flow

**Analyse si yellow/red**
- Symptome: la cloture onboarding fonctionne, mais le rendu du plan expose des champs internes `missions; task; one_shot_mission; status=active`.
- Source amont probable: projection/rendu status plan trop brut.
- Owner runtime: plan status renderer / normal reply context.
- Meilleure correction: rendre les items actifs en langage utilisateur sans metadata interne.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le bug initial est corrige au niveau state: le premier retour apres plan actif ne sort plus directement vers le flow normal, il passe en `onboarding_pref_tone`.
- Le flow finit par se completer: au tour 7, `__whatsapp_onboarding_done` est pose et `whatsapp_state` redevient `null`.

**Problemes**
- Tour 1: double intention mal geree. Sophia demande les preferences mais annonce aussi une action du plan comme faite. Famille: `BF-ROUTE-01` + `BF-EFFECT-01`. Impact: l'utilisatrice peut croire qu'une mission a ete terminee alors qu'elle confirmait seulement la creation du plan. Severite: red.
- Tour 2: message utilisateur sans reponse assistant ni trace. Famille: `BF-STATE-01`. Impact: trou conversationnel net, l'utilisatrice doit relancer. Severite: red.
- Tours 3 et 5: Sophia dit d'aller appliquer les preferences dans la plateforme alors qu'elles sont persistées. Famille: `BF-LEDGER-02`. Impact: confusion produit et perte de confiance. Severite: yellow.
- Tour 4: preference challenge trop forte par rapport au wording. Famille: `BF-INTAKE-05`. Impact: personnalisation inexacte. Severite: yellow.
- Tour 7: rendu plan avec metadata interne. Famille: `BF-STATUS-01`. Impact: impression technique/brute. Severite: yellow.

**Fix propose**
- Source amont: `whatsapp-webhook` state pre-handler et admission router/tool-skill pendant `awaiting_plan_finalization` puis `onboarding_pref_*`.
- Correction recommandee: rendre ces states exclusifs pour le tour courant; pas de `track_progress_plan_item` tant que le message sert a finaliser/reprendre l'onboarding WhatsApp; garantir une reponse ou une trace d'erreur pour chaque inbound accepte en flow onboarding.
- Tests d'invariant attendus: `awaiting_plan_finalization + "C'est fait"` => state `onboarding_pref_tone`, no progress commit; `onboarding_pref_tone + tone answer` => assistant response + state `onboarding_pref_challenge`; preference persisted => visible response says persisted, not platform handoff.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Invariant positif: le stale-state guard ne purge plus `awaiting_plan_finalization` quand l'onboarding WhatsApp preferences n'est pas fini.
- Bug restant: le tour de reprise reste visible au dispatcher comme `normal_reply_default`, avec `selected_handler=track_progress_plan_item`. Le owner attendu devait etre le handler d'onboarding WhatsApp uniquement.
- Bug bloquant: le tour suivant en `onboarding_pref_tone` est accepte HTTP 200 mais ne produit ni route decision ni assistant.

**Skills / Operations / Tools**
- `track_progress_plan_item` execute a tort au tour 1.
- `update_coach_preferences` persiste bien les facts ensuite, mais son rendu visible reste celui d'un handoff plateforme, incompatible avec un onboarding WhatsApp qui ecrit deja les preferences.

**Effets durables**
- Correct: `coach.tone=warm_direct`, `coach.question_tendency=low`, `__whatsapp_onboarding_done=true`, `whatsapp_state=null` en fin de run.
- Incorrect: un progress log est cree au tour 1 sans consentement explicite pour l'action du plan.
- Incorrect: `coach.challenge_level=high` pour une preference formulee comme "plutôt normal, direct seulement si je décroche vraiment".

**Correction concrete**
- Bloquer l'admission des tool skills generaux pendant le tour de reprise `awaiting_plan_finalization` tant que le handler onboarding n'a pas fini de composer sa reponse.
- Ajouter un test integration local qui envoie deux tours successifs via `whatsapp-webhook`: confirmation plan puis reponse de ton. Le test doit verifier deux assistant messages, deux state transitions et zero progress log.
- Adapter le renderer onboarding preferences pour ignorer le texte platform handoff quand `persistCoachPreferenceViaOperation` a ecrit le fact durable.

## Verdict Global

`red` pour validation production. Le bug initial de reprise du flow est partiellement verifie comme corrige, mais le run reel revele encore des bugs runtime bloquants avant de considerer le flux fiable.
