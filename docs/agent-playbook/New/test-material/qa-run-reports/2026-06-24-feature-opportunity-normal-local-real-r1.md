# QA Run - Feature Opportunity Normal Local Real R1

## 1. Contexte Du Test

- Date: 2026-06-24, Supabase local.
- Run: `feature-opportunity-normal-local-real-20260624-r1`.
- Persona: `qa-skill`, connexion temporaire `feature_opportunity_feature-opportunity-normal-local-real-20260624-r1`.
- Objectif: verifier le fonctionnement normal du flow `feature_opportunity` uniquement, sans creation ni test de one-shot reminder.
- Trajectoire: opportunite `initiatives` recurrente -> clarification produit -> opportunite `coach_preferences` -> suivi produit lie -> sortie globale.
- Surfaces visees: global dispatcher, `feature_opportunity`, visible agent, `product_help` en recuperation, active state, absence de tools et side effects.
- Cadre IA reel: `/functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, pas de renderer deterministe, pas de fallback direct, pas de correction de code pendant le run.
- Validite QA: valide. API/Auth/Functions/DB locales joignables; des services auxiliaires Supabase etaient arretes sans bloquer le run. Connexion temporaire nettoyee en fin de run.
- Artefacts: `tests/real-personas/qa-skill/runs/feature_opportunity/feature-opportunity-normal-local-real-20260624-r1.raw.json`, `tests/real-personas/qa-skill/runs/feature_opportunity/feature-opportunity-normal-local-real-20260624-r1.summary.json`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow.

**User**
> Le lundi matin, avant d’ouvrir mes mails, je perds souvent le fil de mes priorités. Je me dis qu’un soutien récurrent de Sophia pourrait m’aider à reprendre le bon contexte sans créer un rappel ponctuel.

**Sophia**
> Oui, c’est exactement le bon type de soutien à viser : un point de reprise récurrent, pas un rappel isolé 🙂  
> Dans la plateforme, ça se pense côté Soutien / Habitudes, pour t’aider à retrouver le contexte du lundi matin avant les mails.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `feature_opportunity_exit_to_global`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: aucun active state `feature_opportunity`

**Analyse si yellow/red**
- Symptome: le message correspond au signal attendu `initiatives` et exclut explicitement le rappel ponctuel, mais le flow sort vers global et la reponse visible propose `Soutien / Habitudes` au lieu de `Initiatives`.
- Source amont probable: local dispatcher / reducer `feature_opportunity` qui classe a tort cette entree comme sortie globale.
- Owner runtime: `feature_opportunity` local dispatcher + visible ownership pipeline.
- Meilleure correction selon les guidelines: garder `recommend_feature` pour les demandes de soutien recurrent explicite sans demande de one-shot, et laisser le visible agent `feature_opportunity` nommer `initiatives` avec ses reglages.
- Pourquoi ce n'est pas un patch local: le probleme n'est pas une phrase a corriger dans la reponse finale; c'est une transition de flow qui retire le tour au visible agent attendu.

### Tour 2

**Verdict du tour:** green

**User**
> Quand tu dis Soutien / Habitudes, tu veux dire la fonctionnalité Initiatives ? Quels réglages je dois prévoir si je veux le faire moi-même dans la plateforme ?

**Sophia**
> Pas exactement. 
>
> - Habitudes, dans le Dashboard > Plan, sert à ancrer une répétition dans ton quotidien.
> - Initiatives, dans Dashboard > Initiatives, sert à planifier un message récurrent que je t’envoie.
>
> Si tu veux le faire toi-même, prévois surtout : quoi dire, pourquoi c’est utile, l’heure, les jours actifs, et la destination du message. 
>
> Si tu veux, je peux aussi te dire lequel des deux colle le mieux à ton besoin du lundi matin.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: aucun active state

### Tour 3

**Verdict du tour:** green

**User**
> Autre chose : quand je bloque, ça me frustre que Sophia pose trop de questions. J’aimerais qu’elle soit plus directe et moins interrogative.

**Sophia**
> Le bon réglage ici, c’est Preferences coach : baisse la tendance à poser des questions et mets un ton plus direct. Tu peux viser un style plus franc, avec moins d’interrogations quand tu bloques.

**Trace courte**
- http_status: 200
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `feature_opportunity_signal`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: active state `feature_opportunity`, feature `coach_preferences`, `opportunity_kind=coach_style_feedback`

### Tour 4

**Verdict du tour:** green

**User**
> Et dans Preferences coach, je peux régler quoi exactement ? Je veux juste savoir les options, pas que tu l’appliques.

**Sophia**
> Dans Preferences coach, tu peux régler 3 choses :
> - le ton : plus doux, chaleureux/direct ou direct
> - le niveau de challenge : faible, équilibré ou élevé
> - la tendance à poser des questions : peu de questions, normal ou très questionnant
>
> Si tu veux, je peux aussi te dire lequel colle le mieux à ton besoin “plus directe et moins interrogative”.

**Trace courte**
- http_status: 200
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `active_feature_opportunity`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: active state `feature_opportunity` conserve, aucun tool appele

### Tour 5

**Verdict du tour:** green

**User**
> Ok merci. Autre sujet : explique-moi en deux phrases la différence entre une carte d’attaque et une carte de défense.

**Sophia**
> Une carte d’attaque sert à te pousser vers l’action, à créer de l’élan ou à te challenger.  
> Une carte de défense sert à te protéger, à réduire la pression ou à t’aider à tenir un cadre quand ça secoue 🛡️

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `feature_opportunity_exit_to_global`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: active state nettoye

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le run ne declenche aucun one-shot reminder et aucun side effect.
- Le signal `coach_preferences` fonctionne: Sophia identifie les preferences coach, propose les bons axes et ne pretend pas appliquer le changement.
- Le follow-up lie aux preferences reste dans `feature_opportunity`.
- La sortie hors sujet nettoie l'etat actif et repond normalement.

**Problemes**
- Tour 1: l'opportunite recurrente explicite ne reste pas dans `feature_opportunity` et Sophia nomme une destination confuse `Soutien / Habitudes`. Famille: BF-STATE-01. Impact: le user n'obtient pas l'aiguillage normal `initiatives`. Severite: red.

**Fix propose**
- Source amont: `feature_opportunity` local dispatcher / reducer.
- Correction recommandee: traiter "soutien recurrent de Sophia" + "sans rappel ponctuel" comme `recommend_feature` vers `initiatives`, pas comme sortie globale.
- Tests d'invariant attendus: entree recurrente explicite sans one-shot -> `feature_opportunity_signal`, visible `initiatives`, active state cree; follow-up reglages -> `active_feature_opportunity`; aucun `executed_tools`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1 prouve que le signal atteint le domaine `feature_opportunity` mais sort immediatement: `route_reason=feature_opportunity_exit_to_global`, `response_owner=normal_reply`, aucun active state.
- T2 route `product_help`, ce qui est coherent comme recuperation produit apres la reponse confuse, mais ce n'est pas le fonctionnement normal attendu du flow.
- T3/T4 valident la branche `coach_preferences`.
- T5 valide la sortie globale depuis un active `feature_opportunity`.

**Skills / Operations / Tools**
- Aucun tool execute sur les cinq tours.
- Aucun direct effect demande, autorise ou commis.
- Aucune creation de one-shot reminder.
- Branche `coach_preferences`: comportement conforme.
- Branche `initiatives`: comportement non conforme au tour d'entree.

**Memoire / DB**
- Active state absent apres T1, present apres T3/T4, nettoye apres T5.
- Connexion temporaire nettoyee apres capture des artefacts.

**Correction concrete**
- Owner principal: `feature_opportunity` local dispatcher.
- Ne pas corriger via `product_help`: le probleme apparait avant la reponse visible attendue de `feature_opportunity`.

## 5. Verdict Global

**Verdict global: red**

Le fonctionnement normal n'est pas completement valide. `coach_preferences` est vert et le flow sort proprement, mais l'entree normale `initiatives` echoue: elle sort vers global et rend une destination confuse au lieu de rester dans `feature_opportunity`.
