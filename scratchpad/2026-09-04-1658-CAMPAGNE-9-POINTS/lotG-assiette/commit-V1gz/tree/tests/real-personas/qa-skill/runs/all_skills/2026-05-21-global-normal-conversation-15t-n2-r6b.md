## 1. Contexte Du Test

- Date: 2026-05-21, timezone Europe/Paris.
- Run: `global15_20260521_n2_r6b`.
- Persona: user QA temporaire dedie, scope `qa-global-normal-conversation-15t-20260521-n2-r6b`.
- Objectif: relancer la conversation normale N2 apres corrections des faux routages defense card / recurring reminder / preference coach / status check.
- Trajectoire: fatigue du soir -> micro-action cuisine/sac -> carte de defense anti-scroll -> apaisement -> rappel ponctuel demain -> aide produit -> reformulation memoire -> preference coach -> recap -> check d'etat sans mutation.
- Surfaces visees: dispatcher, routers, `execution_breakdown`, `prepare_defense_card`, `select_state_potion`, `create_one_shot_reminder`, product/help-like answer, `update_coach_preferences`, status durable DB.
- Cadre IA reel: Supabase local, endpoint local `test-send-message` servi en Deno direct sur port 8000 apres crash Edge Runtime local, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Le run r6b a 15 tours HTTP 200. Incidents techniques precedents documentes: r4/r5 ont ete interrompus par instabilite Supabase locale, puis l'endpoint a ete redemarre et le run r6b a ete mene de bout en bout.

## 2. Tours De Conversation

### Tour 1

**User**
> Salut Sophia, je rentre du boulot completement vide. J'ai promis de ranger la cuisine et de preparer mon sac de sport, mais je sens que je vais finir sur mon telephone jusqu'a minuit. Je veux juste sauver ma soiree sans me mettre la pression.

**Sophia**
> Ah je vois le piège... t’es vidé, donc si tu démarres “en grand”, ton cerveau dit non et le téléphone gagne.
>
> Fais juste ça, maintenant (2 minutes max) : mets une minuterie et prépare uniquement ton “démarrage” = vider le sac de sport + poser tout ce qui est cuisine sur le plan de travail.
>
> Tu veux qu’on le transforme en Carte d’attaque pour rendre le démarrage encore plus simple ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- executed_tools: []
- durable_effect: null

### Tour 2

**User**
> Ok, on fait tres petit. Je vais commencer par la cuisine 6 minutes. Et j'aimerais une carte de defense pour le moment ou je m'assois sur le canape et que j'ouvre TikTok sans reflechir.

**Sophia**
> Voici ta carte de défense :
> Le moment : Quand je m'assois sur le canapé
> Le piège : Je cherche l'icône TikTok
> Mon geste : Le moment: Sur le canape
> Le piege: TikTok sans reflechir
> Mon geste: Poser le tel
> Plan B: Cuisine
> Plan B : Je vais faire mes 6 minutes de cuisine
> On valide ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- executed_tools: []
- durable_effect: draft/pending confirmation visible

### Tour 3

**User**
> Le moment qui craque: pose du sac, canape, telephone debloque, puis scroll automatique. Je veux un stop simple en 10 secondes.

**Sophia**
> Voici ta carte de défense :
> Le moment : Dès que je m'assois sur le canapé après avoir posé mon sac
> Le piège : Téléphone débloqué et début de scroll
> Mon geste : Le moment: Pose du sac et canapé
> Le piege: Scroll automatique
> Mon geste: Stop de 10 secondes
> Plan B: Poser le téléphone loin
> Plan B : Poser le téléphone loin
> On valide ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_flow_defers_tool_skill_opportunity`
- executed_tools: []
- durable_effect: pending defense card conservee

### Tour 4

**User**
> Oui, cree cette carte. Garde-la centree sur le canape + telephone, pas sur toute ma soiree.

**Sophia**
> C'est fait. J'ai créé la carte de défense "Stop Scroll Canapé" : Le moment: Pose du sac et canapé
> Le piege: Scroll automatique
> Mon geste: Stop de 10 secondes
> Plan B: Poser le téléphone loin
>
> Tu peux la retrouver dans Ressources > Cartes de defense...

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `pending_defense_card_confirmation_priority`
- executed_tools: [`prepare_defense_card`]
- durable_effect: `user_defense_cards` creee

### Tour 5

**User**
> Je viens de ranger l'evier et le plan de travail. C'est pas parfait, mais c'est mieux. Je suis tente de m'asseoir maintenant.

**Sophia**
> Yes, t’as déjà regagné du terrain. Maintenant, pour éviter le TikTok “automatique” :
> 1) Avant de t’asseoir : téléphone hors de portée.
> 2) Tu t’assois et tu déclenches le stop 10 secondes de ta carte “Stop Scroll Canapé”.
> 3) Pendant ces 10 secondes, tu choisis : soit tu reprends 1 micro-tâche, soit tu gardes juste le tel posé loin.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_conversation_skill_continue`
- executed_tools: []
- durable_effect: null

### Tour 6

**User**
> J'ai applique la carte: telephone laisse dans l'entree, sac de sport sorti. Franchement j'ai envie d'un mode calme maintenant, pas d'un plan militaire.

**Sophia**
> Yes, tu fais exactement le bon truc : tu as gagné le “sas” avant le canapé.
>
> Ok mode calme now : téléphone hors de portée, puis 10 secondes “stop scroll”, puis calme sans tâche.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `active_skill_exit_requested`
- executed_tools: []
- durable_effect: null

### Tour 7

**User**
> Oui, propose un mode apaisement tres simple pour ce soir. Pas besoin de le rendre parfait.

**Sophia**
> Ça marche, on va faire simple pour ce soir. Pour que je puisse te proposer le bon réflexe, qu'est-ce qui se passe exactement d'habitude quand ça devient difficile en fin de journée ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- executed_tools: []
- durable_effect: null

### Tour 8

**User**
> Ok je fais la respiration 2 minutes. Programme-moi aussi un rappel demain a 7h40: prendre le sac de sport et partir sans negocier.

**Sophia**
> C'est programmé pour vendredi 22 mai à 07:40 : prendre le sac de sport et partir sans negocier.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `explicit_one_shot_reminder_supersedes_tool_flow`
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: rappel ponctuel cree

### Tour 9

**User**
> Le rappel ponctuel de demain, si je change d'avis au reveil, je te demande ici de l'annuler ou je dois aller dans Initiatives ?

**Sophia**
> Si tu veux annuler un rappel ponctuel “demain” parce que tu changes d’avis au réveil, le plus simple c’est de me l’écrire ici.
>
> Tu ne devrais pas avoir besoin d’aller dans Initiatives, sauf si on te demande explicitement de passer par une section.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- executed_tools: []
- durable_effect: null

### Tour 10

**User**
> Ok, laisse l'interface. Tu peux me redire ce que tu dois retenir de mon piege du soir ?

**Sophia**
> Le déclencheur : pose du sac + canapé.
> Le piège : téléphone déjà débloqué puis scroll automatique.
> Et ton “contre” : stop 10 secondes, avant de te laisser partir dans le scroll.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- executed_tools: []
- durable_effect: null

### Tour 11

**User**
> Oui. Reformule-le en une phrase ultra courte que tu peux me ressortir quand je dis que je suis fatigue le soir.

**Sophia**
> Mode apaisement : dès que sac + canapé, téléphone hors de portée, et 10 secondes “stop scroll” avant tout.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- executed_tools: []
- durable_effect: aucun rappel recurrent cree

### Tour 12

**User**
> Pour la suite, quand je suis vide comme ca, parle-moi en mode tres concret: une action, pas trois options. Garde cette preference si tu peux.

**Sophia**
> Tu préfères que j'adopte un ton plus direct ou que je te pose moins de questions pour aller droit à l'essentiel ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `coach_preference_request_overrides_reminder_flow`
- executed_tools: []
- durable_effect: preference non encore appliquee

### Tour 13

**User**
> Oui, c'est exactement ca: une action concrete a la fois quand je suis vide.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te poserai moins de questions, plus courtes, surtout quand tu es bloqué.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `execution_breakdown_absorbed_by_active_tool_skill`
- executed_tools: [`update_coach_preferences`]
- durable_effect: `user_profile_facts.coach.question_tendency=low`

### Tour 14

**User**
> Ne cree rien de nouveau. Fais juste un recap sobre: ce que j'ai fait, ce qui est prevu demain, et la preference que tu as gardee.

**Sophia**
> Ok, recap sobre :
> - Ce que tu as fait: respiration 2 minutes; téléphone hors de portée; stop scroll 10 secondes.
> - Ce qui est prévu demain: rappel à 7h40, prendre le sac de sport et partir sans négocier.
> - Préférence gardée: une seule action concrète à la fois, pas 3 options.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- executed_tools: []
- durable_effect: aucune mutation

### Tour 15

**User**
> Dernier check: sans modifier quoi que ce soit, dis-moi si la carte de defense, le rappel de demain et ma preference sont bien en place.

**Sophia**
> Sans rien modifier :
> - Carte de défense : oui, elle est en place (carte de défense).
> - Rappel de demain : oui, il est programmé (prendre le sac de sport et partir sans negocier).
> - Préférence : oui, elle est gardée (Peu de questions).

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `status_recap_request_blocks_tool_start`
- executed_tools: []
- durable_effect: lecture DB sans mutation

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- La correction critique defense card est bonne: T4 valide la carte de defense et ne bascule plus vers attack card.
- T8 est fluide: le rappel ponctuel est programme, sans relancer une flow concurrente.
- T11 repond bien a une reformulation locale au lieu de proposer un rappel recurrent.
- T14 donne enfin un recap substantiel au lieu de promettre un recap vide.
- T15 repond au check final sans lancer une nouvelle creation.

**Problemes**
- Tours 2-3: le draft defense card reste mal formate, avec labels dupliques et contenu colle dans le mauvais champ. Impact: comprehensible mais peu propre. Severite: yellow.
- Tour 7: "mode apaisement tres simple" declenche encore une nouvelle `prepare_defense_card` au lieu de proposer directement un mode calme. Impact: friction conversationnelle. Severite: yellow.
- Tour 12: la preference "une action, pas trois options" est transformee en "moins de questions". C'est proche mais pas parfaitement fidele. Severite: yellow.

**Fix propose**
- Nettoyer le renderer/generator visible de `prepare_defense_card` pour normaliser les champs et supprimer les labels dupliques.
- Ajouter un guard "mode apaisement / mode calme ce soir" pour privilegier `select_state_potion` ou une reponse directe, jamais `prepare_defense_card`.
- Mapper explicitement "une action concrete a la fois, pas trois options" vers une preference distincte ou un reason plus fidele que `coach.question_tendency=low`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T4: bon routage `pending_defense_card_confirmation_priority`, effet durable correct.
- T8: bon routage `explicit_one_shot_reminder_supersedes_tool_flow`, avec execution directe `create_one_shot_reminder`.
- T11: pas de faux positif `create_recurring_reminder`; la demande reste en `normal_reply`.
- T13: confirmation de preference execute bien `update_coach_preferences`.
- T15: guard `status_recap_request_blocks_tool_start` bloque la creation d'une nouvelle carte et lit les objets durables.

**Skills / Operations / Tools**
- `prepare_defense_card`: execution OK, wording draft a corriger.
- `create_one_shot_reminder`: execution OK, scheduled_for `2026-05-22T05:40:00+00:00`.
- `update_coach_preferences`: execution OK, mais l'operation reduit la demande a `coach.question_tendency=low`.
- `create_recurring_reminder`: ne se declenche plus a tort.

**Memory / Effets durables**
- Avant cleanup: `user_defense_cards=1`, `scheduled_checkins=1`, `user_profile_facts` contient `coach.question_tendency=low`.
- Defense card DB: `Stop Scroll Canapé`, trigger canape/telephone/scroll, response stop 10 secondes.
- Rappel DB: vendredi 22 mai 2026 07:40 Europe/Paris, instruction `prendre le sac de sport et partir sans negocier`.
- Preference DB: `coach.question_tendency` = `low` avec reason issu du T13.

**Problemes**
- Tour 7: mauvais tool skill pour apaisement simple. Impact systeme: yellow.
- Tours 2-3: le draft visible de defense card sort de la structure attendue. Impact systeme: yellow.
- Tour 12-13: preference stockee comme "peu de questions", pas comme "une action concrete". Impact systeme: yellow.

**Fix propose**
- Ajouter tests operationnels sur rendu defense card: pas de duplication de labels dans `confirmation_message`.
- Ajouter test router "mode apaisement tres simple" ne doit pas selectionner `prepare_defense_card`.
- Etendre `update_coach_preferences` avec une cle ou valeur dediee au style "one concrete action".

## Verdict Global

- Verdict: yellow
- Raison principale: les bugs red du run N2 sont corriges et les effets durables critiques sont en place, mais il reste des frictions de wording et un mauvais choix de tool au tour apaisement.
- Follow-up prioritaire: corriger le rendu `prepare_defense_card` puis la classification "mode apaisement" avant d'elargir a d'autres conversations normales.
