# QA Run Report - Global 15T Sync Skills N3 Strict R3

## 1. Contexte Du Test

- Date: 2026-05-29
- Run: `global15_syncskills_20260529_n3_strict_r3`
- Persona: user QA temporaire local `2fcfb5fc-82d5-4954-8dfa-524e379c8d20`, email de test local, `is_test_persona=true`.
- Objectif: rejouer les memes surfaces que R2 avec un nouveau run local, en gardant le focus sur la synchronicite entre skills conversationnels et tool skills.
- Trajectoire: journee eparpillee -> premier geste -> carte d'attaque mails/facture -> sequence mails -> rappel ponctuel -> product help rappel -> preference/memoire tri mail -> preference coach -> frustration/reparation -> refus de potion/reset 2 min -> recap.
- Surfaces visees: `execution_breakdown`, `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, memoire conversationnelle, `update_coach_preferences`, reparation emotionnelle, `select_state_potion` explicitement refusee.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `client_now_iso=2026-05-29T10:00:00.000+02:00`, traces forcees par endpoint, aucun fallback deterministe.
- Validite QA: valide. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse et de la trace courte precedente. Aucun code applicatif modifie pendant le run.

Artefacts locaux:

- Raw turns: `tmp/qa-normal-conversation/global15_syncskills_20260529_n3_strict_r3/turn*.raw.json`
- Summary: `tmp/qa-normal-conversation/global15_syncskills_20260529_n3_strict_r3/summary_short.json`
- DB snapshots: `tmp/qa-normal-conversation/global15_syncskills_20260529_n3_strict_r3/db_*.json`

## 2. Tours De Conversation

### Tour 1

**User**
> Ce matin je pars dans tous les sens: facture a verifier, deux mails client, et mon bureau me donne envie de ranger au lieu de choisir. Donne-moi seulement un premier geste de moins de 5 minutes.

**Sophia**
> On fait compact : choisis une seule zone visible et ouvre-la.
> Premier geste : écris juste le titre du mini-pas suivant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- direct_effects: []
- operation: aucune
- executed_tools: []
- durable_effect: aucun

### Tour 2

**User**
> Le titre: traiter les deux mails qui debloquent la facture. Le piege concret: j ouvre le tiroir du bureau pour ranger au lieu de choisir les mails. Prepare-moi une carte d attaque pour ce moment.

**Sophia**
> C'est noté pour les deux mails. Pour éviter de te perdre dans le rangement du tiroir au moment de t'y mettre, quelle approche préfères-tu ?
>
> 1. **Le texte magique** : un court texte à relire pour stopper la négociation intérieure.
> 2. **Ancre visuelle** : un repère physique pour te signaler de rester sur les mails.
> 3. **Preparer le terrain** : une micro-installation pour rendre l'accès aux mails plus facile que le tiroir. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- operation: `prepare_attack_card` intake
- pending_confirmation: choix technique demande
- executed_tools: []
- durable_effect: aucun

### Tour 3

**User**
> Prends le texte magique, en version mot de bascule. Le mot court sera MAILS. La carte doit dire: deux mails puis facture. Je confirme que je veux la creer.

**Sophia**
> Voici ton brouillon :
> *Mot de bascule : MAILS*
> Technique : Mot de bascule
> Contenu : deux mails puis facture
> Envoie-moi MAILS quand tu sens la résistance monter pour que je te rappelle ton objectif.
> Est-ce que je crée cette carte ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- operation: `prepare_attack_card` draft
- pending_confirmation: confirmation creation
- executed_tools: []
- durable_effect: aucun

### Tour 4

**User**
> Oui, cree cette carte. Garde bien le declencheur: quand je pars ranger le tiroir, je reviens aux deux mails client puis a la facture.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Mot de bascule : MAILS
> Technique : Mot de bascule
> deux mails puis facture
>
> Mode d'emploi : Envoie-moi MAILS quand tu sens la résistance monter pour que je te rappelle ton objectif.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Le mot de cette carte peut etre remplace depuis cette zone; pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `product_help`
- route_reason: `skill_handoff_requested`
- operation: `prepare_attack_card`
- executed_tools: [`prepare_attack_card`]
- tool_execution: `success`
- durable_effect: 1 `user_attack_cards` active creee, mot `MAILS`, contenu `deux mails puis facture`

### Tour 5

**User**
> Bien. Maintenant sans nouvelle carte, donne-moi une sequence de 10 minutes pour faire ces deux mails. Et programme un rappel aujourd hui a 11h40: reprendre la facture sans rouvrir le tiroir.

**Sophia**
> C'est programmé pour vendredi 29 mai à 11:40 : reprendre la facture sans rouvrir le tiroir. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `central_arbitrator_one_shot_reminder_priority`
- direct_effects: `create_one_shot_reminder`
- operation: `create_one_shot_reminder`
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- durable_effect: 1 `scheduled_checkins` pending, `scheduled_for=2026-05-29T09:40:00+00:00`, instruction conforme
- warning: la sequence de 10 minutes demandee dans le meme message est ignoree.

### Tour 6

**User**
> Merci pour le rappel. Tu as saute la sequence: sans autre tool, donne-moi maintenant les 10 minutes minute par minute pour traiter les deux mails.

**Sophia**
> Ok 🙂 on y va: 10 minutes, minute par minute.
>
> 1:00 Ouvre les 2 mails (sans lire tout en détail).  
> 2:00 Pour le 1er: lis seulement l’objet + demande concrète.  
> 3:00 Pour le 1er: note 1 action précise à faire (répondre / envoyer doc / proposer un créneau).  
> 4:00 Rédige la réponse du 1er en mode brouillon (sans chercher la perfection).  
> 5:00 Finalise le 1er: relis 30 secondes et envoie.  
> 6:00 Pour le 2e: lis objet + demande concrète.  
> 7:00 Note l’action du 2e et ce qu’il faut absolument inclure.  
> 8:00 Rédige la réponse du 2e (brouillon).  
> 9:00 Finalise le 2e: relis + envoie.  
> 10:00 Check rapide: facture débloquée? Si oui, note la prochaine mini-étape (la facture, juste après).  
>
> Quand tu démarres, tu comptes plutôt “à partir de maintenant” ou à partir d’une heure précise ? ⏱️

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `central_arbitrator_status_exact_priority`
- operation: aucune
- executed_tools: []
- durable_effect: aucun

### Tour 7

**User**
> A partir de maintenant. Question produit: le rappel de 11h40, je le retrouve ou dans Sophia si je veux verifier ou modifier le texte ?

**Sophia**
> Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.
>
> Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement, par exemple: "change le rappel de demain à 9h" ou "annule le rappel de demain". 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- operation: aucune
- executed_tools: []
- durable_effect: aucun

### Tour 8

**User**
> Note pour la suite: quand je dis tri mail client, mes criteres par defaut sont facture bloquee d abord, puis echeance, jamais ordre d arrivee.

**Sophia**
> Yes, compris ✅ Quand tu dis “tri mail client”, tes règles par défaut c’est :
> 1) facture bloquée d’abord
> 2) puis les échéances
> 3) jamais selon l’ordre d’arrivée
>
> Je te propose qu’on fixe ça comme règle de décision claire pour éviter que ton cerveau parte en “tri au hasard” quand tu es pressé 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- memory_write_candidates_emitted: null
- executed_tools: []
- durable_effect: aucun `memory_items`

### Tour 9

**User**
> Oui, fixe-le comme regle de decision. Et autre preference coach durable: commence par un geste concret de moins de 10 minutes avant de me poser plusieurs questions.

**Sophia**
> Est-ce que tu souhaites que je te pose globalement plus de questions pour creuser tes réflexions, ou que je sois plus directe en privilégiant les actions ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- operation: `update_coach_preferences`, clarification
- executed_tools: []
- durable_effect: aucun
- warning: la regle de tri mail n'est pas fixee durablement.

### Tour 10

**User**
> Plus directe en privilegiant les actions. Formule exacte: d abord un geste concret de moins de 10 minutes, puis une question maximum si elle aide vraiment.

**Sophia**
> Tu veux plutôt moins de questions ou plus de questions ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_tool_skill_continue`
- operation: `update_coach_preferences`, clarification repetitive
- executed_tools: []
- durable_effect: aucun

### Tour 11

**User**
> Moins de questions, clairement. Je viens de le dire, et ca me frustre parce que j ai l impression que tu me fais repeter au lieu de m aider.

**Sophia**
> Bien reçu. Pour la suite, je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. Si c'est bien ça, je le garde comme préférence. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_tool_skill_continue`
- operation: `update_coach_preferences`, confirmation
- executed_tools: []
- durable_effect: aucun

### Tour 12

**User**
> Oui, confirme et garde cette preference. Maintenant applique-la: donne-moi un reset de 2 minutes pour revenir a la facture, sans me poser de question.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- operation: `update_coach_preferences`
- executed_tools: [`update_coach_preferences`]
- tool_execution: `success`
- durable_effect: `user_profile_facts.coach.question_tendency = low`, `source_type=explicit_user`
- warning: le reset 2 minutes demande dans le meme message est ignore.

### Tour 13

**User**
> Il manque le reset. Je suis un peu a plat, mais ne lance pas de potion: seulement un reset de 2 minutes pour revenir a la facture.

**Sophia**
> On fait ce reset de 2 minutes. Pour ta facture, tu as plutôt besoin d'un élan pour t'y remettre ou de relâcher la pression ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- operation: tool bloque par refus explicite, mais reponse pose une question
- executed_tools: []
- durable_effect: aucun

### Tour 14

**User**
> Elan, mais sans question: 2 minutes concretes maintenant. Minute 1 et minute 2, quoi faire exactement ?

**Sophia**
> Tu voudrais que Sophia te rattrape à quel moment autour de ça ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `immediate_mode_request_not_state_potion`
- operation: aucune
- executed_tools: []
- durable_effect: aucun
- warning: demande concrete non satisfaite, question hors cible.

### Tour 15

**User**
> Stop, recap tres court: carte d attaque, rappel, sequence mails, preference coach, et ce qui reste sur la facture.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Mot de bascule : MAILS).
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé à 11:40 (reprendre la facture sans rouvrir le tiroir).
> - Préférences coach : oui, moins de questions (le reste est sur la valeur par défaut système). 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `central_arbitrator_recap_request_priority`
- tool_intents: faux positif `prepare_attack_card` dans les intents, non execute
- executed_tools: []
- durable_effect: aucun nouveau
- warning: recap exact sur DB durable, mais oublie la sequence mails et le reste a faire sur la facture.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- T1: entree courte et actionnable dans `execution_breakdown`.
- T2-T4: flow carte d'attaque nettement meilleur que R2; Sophia demande un choix, prepare un brouillon, puis cree vraiment la carte.
- T6: sequence 10 minutes utile apres relance.
- T7: aide produit claire pour retrouver/modifier le rappel.
- T12: preference coach finalement confirmee et annoncee correctement.

**Problemes**
- T5: Sophia execute le rappel mais oublie la sequence demandee dans le meme message. Impact: l'utilisateur doit repeter. Severite: yellow.
- T8-T9: Sophia dit comprendre/fixer la regle de tri mail, mais aucune memoire durable n'est observee. Impact: promesse conversationnelle non fiable. Severite: red.
- T10: clarification inutile, car "plus directe" et "une question maximum" repondait deja au slot. Impact: repetition frustrante. Severite: yellow.
- T12: apres avoir confirme une preference "moins de questions", Sophia ignore la demande "reset sans question". Impact: synchronicite tool/conversation incomplete. Severite: yellow.
- T13-T14: la demande explicite "pas de potion / sans question / minute 1 et minute 2" est remplacee par des questions. Impact: experience bloquante au moment de baisse d'energie. Severite: red.
- T15: recap partiel centre sur effets durables; oublie la sequence mails et la facture. Impact: cloture incomplete. Severite: yellow.

**Fix propose**
- Apres execution d'un tool dans un message multi-intention, reprendre automatiquement les intentions conversationnelles restantes.
- Ne pas promettre "pour la suite" ou "fixer une regle" sans durable write, ou repondre explicitement que ce n'est pas encore enregistre.
- Dans `update_coach_preferences`, ne pas redemander une clarification deja fournie par la phrase exacte utilisateur.
- Quand un user refuse une potion/tool et demande une action concrete, sortir du mode question et produire l'action demandee.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- `execution_breakdown` correct au T1.
- `prepare_attack_card` correct aux T2-T4, avec `tool_execution=success` au T4. DB confirme 1 carte active.
- `create_one_shot_reminder` correct au T5, avec `tool_execution=success`. DB confirme 1 rappel pending a `2026-05-29T09:40:00+00:00`.
- `product_help` correct au T7.
- T8 route une regle de tri durable vers `product_help`; pas de `memory_write_candidates_emitted`, pas de `memory_items`.
- `update_coach_preferences` finit par fonctionner au T12; DB confirme `coach.question_tendency=low`, `source_type=explicit_user`.
- T13-T14 restent en `tool_skill` alors que le user demande explicitement pas de potion et une action conversationnelle immediate.

**Skills / Operations / Tools**
- `prepare_attack_card`: green sur ce run. L'effet durable correspond globalement a la demande: mot `MAILS`, cible mails/facture, carte active.
- `create_one_shot_reminder`: green sur l'effet durable, mais yellow sur l'arbitrage multi-intention.
- `update_coach_preferences`: yellow. L'effet durable final existe, mais le flow demande trop de clarifications et ignore l'action restante du tour de confirmation.
- `select_state_potion`: aucun executor lance, ce qui respecte le refus; mais le mode tool/question continue d'empecher le reset concret.

**Memory / Effets durables**
- `user_attack_cards`: 1 carte active creee.
- `scheduled_checkins`: 1 rappel pending cree.
- `user_profile_facts`: `coach.question_tendency` passe de default a `explicit_user` avec valeur `low`.
- `memory_items`: 0; la regle de tri mail n'est pas memorisee.
- `user_chat_states`: `risk_level=2`; pas d'effet durable utile pour le reset final.

**Problemes**
- T5/T12: multi-intention non completee apres tool success. Impact systeme: les tools interrompent le fil conversationnel. Severite: yellow.
- T8-T9: memory/preference de tri non durable malgre formulation "Note pour la suite" et "fixe-le". Impact systeme: promesse sans persistance. Severite: red.
- T13-T14: refus de potion bloque l'execution du tool mais ne restaure pas un `normal_reply` actionnable. Impact systeme: mauvais owner/reponse pour l'intention. Severite: red.
- T15: recap request declenche un faux positif `tool_intents.prepare_attack_card` non execute. Impact systeme faible mais trace bruitee. Severite: yellow.

**Fix propose**
- Ajouter un post-tool continuation planner: apres `executed_tools`, verifier les demandes non satisfaites dans le message user.
- Router "Note pour la suite" et "fixe cette regle" vers memoire durable ou vers une reponse non promissive.
- Dans `explicit_no_tool_request_blocks_tool_start`, forcer `response_owner=normal_reply` avec une action concrete si le message contient une demande immediate.
- Nettoyer les faux positifs de `tool_skill_intents` pendant les recaps.

## Verdict Global

**red**

R3 est meilleur que R2 sur les effets durables principaux: carte d'attaque, rappel et preference coach sont bien crees. Le run reste red pour la synchronicite globale: les messages multi-intention perdent les demandes conversationnelles, la regle de tri mail n'est pas memorisee, et le refus de potion/reset 2 minutes finit en boucle de questions au lieu d'une action concrete.
