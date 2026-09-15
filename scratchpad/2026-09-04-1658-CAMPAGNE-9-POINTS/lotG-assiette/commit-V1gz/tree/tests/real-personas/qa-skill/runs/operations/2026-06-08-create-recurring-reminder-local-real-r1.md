# QA Run - create_recurring_reminder local flow real R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `recurring-local-flow-real-20260608-r1`
- Persona: connexion temporaire locale `qa-normal-recurring-local-flow-real-20260608-r1-1780946264519@example.com`
- Objectif: verifier en conditions reelles le flow local `create_recurring_reminder` apres migration dispatcher local + reducer + visible agent.
- Trajectoire: demande recurrente complete -> destination -> apply attempt -> question produit inline -> question status/DB inline + retry.
- Surfaces visees: dispatcher global, active handoff arbitration, `create_recurring_reminder`, visible agent, inline `product_help`, inline `status_recap`, EffectLedger, DB `scheduled_checkins`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe, aucun renderer/executor appele directement.
- Validite QA: valide jusqu'au blocage systeme observe aux tours 5-6. Les erreurs 409 font partie du run, aucune tentative n'a ete remplacee par un fallback.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> Peux-tu me préparer un rappel tous les matins à 8h15 pour boire un verre d'eau avant d'ouvrir Slack ?

**Sophia**
> Souhaitez-vous rattacher ce rappel quotidien de 08h15 à votre plan courant ou à votre base de vie ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_recurring_reminder`
- route_reason: `central_arbitrator_recurring_reminder_structured_intent`
- safety: `low`
- direct_effects: `[]`
- operation: `create_recurring_reminder`
- pending_confirmation: none
- memory_plan: targeted/light
- executed_tools: `[]`
- durable_effect: none; `scheduled_checkins=[]`

**Analyse si yellow/red**
- Symptome: Sophia demande la destination alors que la demande est une routine personnelle generaliste, donc `base_de_vie` etait inferable.
- Source amont probable: dispatcher local / reducer de destination.
- Owner runtime: `create_recurring_reminder.local_dispatcher`.
- Meilleure correction selon les guidelines: renforcer la regle "general life routine -> base_de_vie safe default" dans le prompt local et ajouter un invariant real/contractuel.
- Pourquoi ce n'est pas un patch local: le probleme est la decision de slot, pas une phrase visible.

### Tour 2

**Verdict du tour:** green

**User**
> Base de vie, c'est juste une petite routine perso.

**Sophia**
> C'est entendu pour votre base de vie. Ce rappel n'est pas créé depuis le chat, mais vous pouvez le reporter dans votre section Rappels avec les informations suivantes : 'boire un verre d'eau avant d'ouvrir Slack', tous les matins à 08h15. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_recurring_reminder`
- route_reason: `active_handoff_field_confirmation`
- safety: `low`
- direct_effects: `[]`
- operation: `create_recurring_reminder`
- pending_confirmation: none
- memory_plan: targeted/light
- executed_tools: `[]`
- durable_effect: none; `scheduled_checkins=[]`

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok, programme-le alors.

**Sophia**
> Comme je vous l'indiquais, je ne peux pas l'ajouter directement depuis notre discussion. Je vous invite à le reporter dans votre section Rappels : 'boire un verre d'eau avant d'ouvrir Slack', tous les matins à 08h15 pour votre Base de vie. Est-ce que cela vous convient ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_recurring_reminder`
- route_reason: `active_handoff_apply_attempt`
- safety: `low`
- direct_effects: `[]`
- operation: `create_recurring_reminder`
- pending_confirmation: none
- memory_plan: targeted/light
- executed_tools: `[]`
- durable_effect: none; `scheduled_checkins=[]`

**Analyse si yellow/red**
- Symptome: la non-mutation est correcte, mais la question finale relance une confirmation inutile apres un `apply_attempt`.
- Source amont probable: visible task `apply_attempt` insuffisamment contrainte; le visible agent garde une question.
- Owner runtime: `create_recurring_reminder.visible_agent`.
- Meilleure correction selon les guidelines: rendre le stage `apply_attempt` terminal et interdire explicitement toute question de convenance.
- Pourquoi ce n'est pas un patch local: il faut corriger le contrat de stage visible, pas supprimer une phrase exacte.

### Tour 4

**Verdict du tour:** green

**User**
> Oui. Au fait, c'est quoi exactement un rappel récurrent chez Sophia ?

**Sophia**
> Un rappel récurrent, que j'appelle aussi une 'Initiative', est un message que je vous envoie automatiquement selon un planning précis (heure et jours choisis). C'est un outil pour ancrer une routine dans le temps, comme votre verre d'eau matinal, sans que vous ayez besoin de revenir sur l'application pour y penser. Vous pouvez les gérer directement dans votre section Rappels. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_recurring_reminder`
- route_reason: `active_handoff_field_confirmation`
- safety: `low`
- direct_effects: `[]`
- operation: `create_recurring_reminder` + inline `product_help`
- pending_confirmation: none
- memory_plan: targeted/light
- executed_tools: `[]`
- durable_effect: none; `scheduled_checkins=[]`

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATUS-01 - Projection DB mal lue

**User**
> Et j'en ai déjà combien des rappels récurrents actifs ?

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 409
- response_owner: `tool_skill`
- selected_handler: `create_recurring_reminder`
- route_reason: `active_handoff_platform_destination_followup`
- safety: `low`
- direct_effects: `[]`
- operation: `create_recurring_reminder`, local dispatcher `flow_action=get_info_db`, note vers `status_recap`
- pending_confirmation: none
- memory_plan: targeted/light
- executed_tools: `[]`
- durable_effect: none; `scheduled_checkins=[]`

**Analyse si yellow/red**
- Symptome: question status reconnue et note_information vers `status_recap` presente, mais la reponse finale est vide et le endpoint retourne 409.
- Source amont probable: inline `status_recap` / projection DB / final response handling de la reponse status vide.
- Owner runtime: `status_recap` inline depuis `create_recurring_reminder`.
- Meilleure correction selon les guidelines: garantir qu'un get_info_db inline produit toujours une reponse visible grounded, meme si la projection retourne zero objet.
- Pourquoi ce n'est pas un patch local: le dispatcher local fait le bon handoff; le bug est dans le roundtrip status/DB ou son rendu.

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATUS-01 - Projection DB mal lue

**User**
> Je reformule : combien de rappels récurrents actifs tu vois pour moi actuellement ?

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 409
- response_owner: `tool_skill`
- selected_handler: `create_recurring_reminder`
- route_reason: `active_recurring_handoff_stays_with_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `create_recurring_reminder`
- pending_confirmation: none
- memory_plan: targeted/light
- executed_tools: `[]`
- durable_effect: none; `scheduled_checkins=[]`

**Analyse si yellow/red**
- Symptome: le retry confirme le blocage: toujours 409, aucune reponse visible.
- Source amont probable: meme famille que T5, etat actif reste `repeat_handoff` avec note status precedente.
- Owner runtime: `status_recap` inline / active flow resume.
- Meilleure correction selon les guidelines: ajouter un invariant d'integration "active recurring + status count question -> status_recap inline returns non-empty answer and preserves parent state".
- Pourquoi ce n'est pas un patch local: la correction doit couvrir la projection zero-result et le retour inline, pas seulement cette phrase.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le flow reste non-mutant: aucun rappel recurrent ni scheduled checkin n'est cree.
- La demande complete est comprise et le handoff plateforme est humainement lisible au tour 2.
- La question produit inline au tour 4 est naturelle et ne casse pas l'etat parent.

**Problemes**
- Tour 1: clarification de destination inutile. Famille: BF-INTAKE-01. Impact: friction legere, le user doit repondre a un slot qui aurait pu etre safe-default. Severite: yellow.
- Tour 3: question finale inutile apres apply attempt. Famille: BF-STATE-01. Impact: boucle conversationnelle confuse. Severite: yellow.
- Tours 5-6: reponse vide + HTTP 409 sur status actif. Famille: BF-STATUS-01. Impact: experience inutilisable pour la question status. Severite: red.

**Fix propose**
- Source amont: `create_recurring_reminder.local_dispatcher`, `visible_agent.apply_attempt`, inline `status_recap`.
- Correction recommandee: safe default destination pour routines generales; stage `apply_attempt` sans question finale; garantie status inline non-empty avec zero resultat.
- Tests d'invariant attendus: full-AI local recurring complete one-turn handoff; apply attempt no question/no mutation; active recurring status question returns count zero and preserves parent state.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1-T4: route correcte vers `create_recurring_reminder`; active handoff conserve l'ownership local.
- T4: `product_help` apparait comme skill signal inline avec note_information, sans global dispatcher normal.
- T5: local dispatcher retourne `get_info_db` avec note vers `status_recap`, ce qui est l'intention systeme correcte.

**Skills / Operations / Tools**
- `create_recurring_reminder` produit `tool_execution=platform_handoff`.
- `executed_tools=[]` sur tous les tours.
- Le handoff draft garde `no_chat_mutation=true` et `executable_from_chat=false`.
- Le bug critique est le retour inline status: `status_recap` ne fournit pas de contenu visible et le endpoint finit en 409.

**Memory / Effets durables**
- DB snapshot apres chaque tour: `scheduled_checkins=[]`.
- Etat actif conserve `__recurring_reminder_handoff_state` avec status `collecting`, puis `handoff_delivered`, puis `repeat_handoff`.
- Aucune mutation durable recurrente observee.

**Problemes**
- Tour 1: destination redemandee inutilement. Famille: BF-INTAKE-01. Impact systeme: champ safe-default non applique. Severite: yellow.
- Tour 3: `apply_attempt` rendu comme repeat avec question finale. Famille: BF-STATE-01. Impact systeme: visible_task terminal insuffisant. Severite: yellow.
- Tours 5-6: status inline reconnu mais sortie vide/409. Famille: BF-STATUS-01. Impact systeme: roundtrip DB/status casse en active flow. Severite: red.

**Fix propose**
- Source amont: prompt local recurring, visible prompt stage `apply_attempt`, status_recap inline runtime.
- Correction recommandee: renforcer les contrats et ajouter tests integration runtime sur les trois cas.
- Tests d'invariant attendus: `get_info_db` inline active recurring avec zero rappel actif doit retourner une phrase non vide et aucun effet durable.

## Verdict Global

- Verdict: red
- Raison principale: le flow local recurring gere bien le handoff non-mutant, mais la question status/DB inline pendant active flow produit deux `409` avec reponse vide.
- Follow-up prioritaire: corriger `create_recurring_reminder -> get_info_db -> status_recap` pour garantir une reponse visible grounded et non vide.
