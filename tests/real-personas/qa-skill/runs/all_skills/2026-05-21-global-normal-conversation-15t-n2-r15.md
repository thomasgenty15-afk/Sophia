# Global Normal Conversation 15T — N2 R15

## 1. Contexte Du Test

- Date: 2026-05-21
- Run: `global15_20260521_n2_r14` complet exploitable + corrections ciblees post-run, puis tentatives `r15` interrompues par crash endpoint local.
- Persona: user QA temporaire local, cree via Auth local, nettoye apres run.
- Objectif: verifier coexistence dispatcher, memoire conversationnelle, skills conversationnels, tool skills, one-shot reminder, preferences coach, statut no-mutation.
- Trajectoire: soiree fatiguee -> carte de defense -> apaisement local -> rappel ponctuel -> product help rappel -> reformulation memoire locale -> preference coach -> recap -> verification statut.
- Surfaces visees: `normal_reply`, `execution_breakdown`, `prepare_defense_card`, `create_one_shot_reminder`, `product_help`, `update_coach_preferences`, status-only runtime.
- Cadre IA reel: endpoint local `/functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, pas de fallback direct executor.
- Validite QA: valide comme regression replay IA locale. Limite: le runner utilise une sequence fixe de messages, donc ce rapport ne remplace pas un run conversationnel libre strict au sens de `01-qa-run-report-structure.md`.

## 2. Tours De Conversation

### Tour 1

**User**
> Salut Sophia, je rentre du boulot completement vide. J'ai promis de ranger la cuisine et de preparer mon sac de sport, mais je sens que je vais finir sur mon telephone jusqu'a minuit. Je veux juste sauver ma soiree sans me mettre la pression.

**Sophia**
> Ah merde… quand t’es rincé comme ça, c’est normal de vouloir juste “scroll pour tenir” jusqu’à minuit [...] L’idée: pas “faire tout”, juste sauver la fin de journée avec 2 micro-étapes, sans pression.

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: broad_rescue_request_not_defense_card
- executed_tools: []
- durable_effect: none

### Tour 2

**User**
> Ok, on fait tres petit. Je vais commencer par la cuisine 6 minutes. Et j'aimerais une carte de defense pour le moment ou je m'assois sur le canape et que j'ouvre TikTok sans reflechir.

**Sophia**
> Voici ta carte de défense :
> Le moment : Quand je m'assois sur le canapé
> Le piège : J'ouvre TikTok sans réfléchir
> Mon geste : Je pose mon téléphone et je respire 3 fois
> Plan B : Je change de pièce ou je prends un livre
> On valide ?

**Trace courte**
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: tool_skill_intent_start
- executed_tools: []
- durable_effect: pending confirmation only

### Tour 3

**User**
> Le moment qui craque: pose du sac, canape, telephone debloque, puis scroll automatique. Je veux un stop simple en 10 secondes.

**Sophia**
> Voici ta carte de défense :
> Le moment : Pose du sac et canapé
> Le piège : Téléphone débloqué
> Mon geste : Un stop complet de 10 secondes sans toucher à l'écran
> Plan B : Poser le téléphone sur la table
> On valide ?

**Trace courte**
- response_owner: normal_reply
- selected_handler: null
- route_reason: normal_reply_default
- executed_tools: []
- durable_effect: pending card updated, no execution

### Tour 4

**User**
> Oui, cree cette carte. Garde-la centree sur le canape + telephone, pas sur toute ma soiree.

**Sophia**
> C'est fait. J'ai créé la carte de défense "Rituel du canapé" : Un stop complet de 10 secondes sans toucher à l'écran [...]

**Trace courte**
- response_owner: tool_skill
- selected_handler: prepare_defense_card
- route_reason: pending_defense_card_confirmation_priority
- executed_tools: [prepare_defense_card]
- durable_effect: carte de defense creee

### Tours 5–7

**User**
> Progression cuisine, application carte, puis demande de mode apaisement simple.

**Sophia**
> Repond avec soutien court, stop 10 secondes, puis mode apaisement local. Au tour 7, ne lance plus `select_state_potion`; elle reste en reponse normale.

**Trace courte**
- T5: normal_reply, no tool.
- T6: normal_reply, no tool.
- T7: normal_reply, route_reason `immediate_mode_request_not_state_potion`, no tool.

### Tour 8

**User**
> Ok je fais la respiration 2 minutes. Programme-moi aussi un rappel demain a 7h40: prendre le sac de sport et partir sans negocier.

**Sophia**
> C'est programmé pour vendredi 22 mai à 07:40 : prendre le sac de sport et partir sans negocier.

**Trace courte**
- response_owner: normal_reply
- executed_tools: [create_one_shot_reminder]
- durable_effect: rappel ponctuel cree

### Tour 9

**User**
> Le rappel ponctuel de demain, si je change d'avis au reveil, je te demande ici de l'annuler ou je dois aller dans Initiatives ?

**Sophia**
> Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.
>
> Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement, par exemple : "change le rappel de demain à 09:00" ou "annule le rappel de demain".

**Trace courte**
- response_owner: normal_reply
- selected_handler: null
- executed_tools: []
- durable_effect: none

### Tours 10–11

**User**
> Redemande ce qu'il faut retenir du piege du soir, puis demande une phrase ultra courte reutilisable.

**Sophia**
> Resume le piege canapé + telephone debloque + scroll automatique, puis donne une phrase courte. Aucun rappel recurrent n'est cree.

**Trace courte**
- T10: normal_reply, no tool.
- T11: normal_reply, route_reason `local_memory_reformulation_not_recurring_reminder`, no tool.

### Tours 12–13

**User**
> Pour la suite, quand je suis vide comme ca, parle-moi en mode tres concret: une action, pas trois options. Garde cette preference si tu peux.

**Sophia attendue apres correction ciblee**
> Bien reçu. Pour la suite, je te proposerai une seule action concrète à la fois, avec moins de questions/options quand tu es vidé ou bloqué. Si c'est bien ça, je le garde comme préférence.

**User**
> Oui, c'est exactement ca: une action concrete a la fois quand je suis vide.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te proposerai une seule action concrète à la fois, avec moins de questions/options quand tu es vidé ou bloqué.

**Trace courte**
- selected_handler: update_coach_preferences
- T12: pending confirmation only
- T13: executed_tools [update_coach_preferences]
- durable_effect: `coach.question_tendency=low`, status label "une action concrète à la fois"

### Tours 14–15

**User**
> Recap sobre, puis check sans modifier.

**Sophia**
> Recap: action faite, rappel demain 07:40, preference gardee.
>
> Sans rien modifier :
> - Carte de défense : oui.
> - Rappel de demain : oui.
> - Préférence : oui, elle est gardée (une action concrète à la fois).

**Trace courte**
- T14: normal_reply, no tool.
- T15: normal_reply, route_reason `status_only_request_blocks_tool_start`, no tool.

## 3. Analyse De Fluidite Humaine

**Verdict: green avec reserve de validation libre**

**Ce qui marche**
- Le faux depart carte au premier message est bloque: Sophia aide d'abord normalement.
- La carte de defense est comprehensible, courte, centree sur canapé + telephone.
- Le mode apaisement reste local et ne pousse plus une Potion d'etat.
- Le product help du rappel est maintenant factuel et conforme a la consigne.
- Le recap final est sobre et confirme les bons objets.

**Problemes corriges pendant la passe**
- Tour 1: faux positifs `prepare_defense_card` puis `prepare_attack_card` sur demande large "sauver ma soiree". Corrige par garde broad rescue.
- Tour 7: faux positif `select_state_potion`. Corrige par garde immediate mode.
- Tour 9: wording rappel disait de ne pas aller dans Initiatives. Corrige.
- Tour 12: clarification A/B avant preference. Corrige par patch deterministe `une action, pas trois options`.

## 4. Analyse Systeme

**Verdict: green sur les corrections testees, yellow sur robustesse infra locale**

**Routage**
- `broad_rescue_request_not_defense_card` empeche les tool skills au tour 1.
- `pending_defense_card_confirmation_priority` priorise bien la confirmation au tour 4.
- `immediate_mode_request_not_state_potion` bloque la potion au tour 7.
- `local_memory_reformulation_not_recurring_reminder` bloque le rappel recurrent au tour 11.
- `status_only_request_blocks_tool_start` bloque toute mutation au tour 15.

**Skills / Operations / Tools**
- `prepare_defense_card`: pending puis execution apres oui explicite uniquement.
- `create_one_shot_reminder`: execution directe uniquement sur demande ponctuelle claire.
- `update_coach_preferences`: execution apres confirmation explicite, avec libelle final correct.

**Memory / Effets durables**
- Carte de defense creee.
- Rappel ponctuel cree pour vendredi 22 mai 2026 a 07:40 Europe/Paris.
- Preference coach stockee comme une action concrete a la fois.

**Validation technique**
- `deno check`: OK sur `run.ts` et `update_coach_preferences/intake.ts`.
- Suite regression locale: 87 tests passed, 0 failed.
- Nettoyage cible: utilisateurs/artefacts QA temporaires `r7`–`r15` nettoyes via script dedie.

**Incident infra**
- Plusieurs endpoints Deno locaux se sont arretes en cours de run avec `UND_ERR_SOCKET` / endpoint port ferme. Les tours deja enregistres et les tests unitaires montrent les corrections, mais il faut refaire un run libre non-scripté pour un verdict QA strict sans reserve.

## Verdict Global

**Verdict: green pour les corrections code + yellow pour validite QA stricte.**

Le comportement produit vise est maintenant corrige et couvert par tests. Le prochain run a faire est un run conversationnel libre, non pre-scripted, pour lever la reserve de validite stricte du playbook.
