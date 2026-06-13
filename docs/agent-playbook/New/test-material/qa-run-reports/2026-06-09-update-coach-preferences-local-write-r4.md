# 2026-06-09 - update_coach_preferences local write r4

## 1. Contexte Du Test

- Date: 2026-06-09
- Run: `update-coach-preferences-local-write-r4`
- Persona: `qa-skill`, connexion temporaire `updatecoachpref_updatecoachpref_r4`, user local `764d8627-7df3-48d3-91f2-c45e24449c3a`
- Objectif: vérifier en conditions réelles les modifications V1 du flow local `update_coach_preferences`
- Trajectoire: write durable clair -> status explicite -> reprise status -> unsupported durable -> consigne ponctuelle
- Surfaces visées: dispatcher global, dispatcher local `update_coach_preferences`, reducer/writer DB, `status_recap`, `flow_opportunity_verification`, visible agent local, `user_profile_facts`
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer déterministe, aucun fallback direct
- Validité QA: valide. Run réel local mené tour par tour, avec cleanup ciblé de la connexion temporaire après run.
- Artefacts:
  - Raw T1-T5: `tests/real-personas/qa-skill/runs/operations/2026-06-09-update-coach-preferences-local-write-r4-t*.raw.json`
  - Summary: `tests/real-personas/qa-skill/runs/operations/2026-06-09-update-coach-preferences-local-write-r4.summary.json`
  - Durable before cleanup: `tests/real-personas/qa-skill/runs/operations/2026-06-09-update-coach-preferences-local-write-r4-durable-before-cleanup.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pour la suite, limite vraiment les questions et réponds plus directement quand je suis bloqué.

**Sophia**
> C'est entendu. Je vais désormais adopter un ton plus direct et limiter mes questions, comme tu le souhaites pour nos prochains échanges.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: `low`, no reason codes
- direct_effects: []
- operation: `update_coach_preferences`
- pending_confirmation: null
- executed_tools: [`update_coach_preferences`]
- durable_effect: committed `coach.question_tendency=low`, `coach.tone=direct`
- DB: `user_profile_facts` active rows confirmed before cleanup with `source_type=explicit_user`

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-03` — Product/status/tool mal priorisés

**User**
> Tu peux me redire les préférences coach actives que tu as maintenant ?

**Sophia**
> Je peux te faire un récapitulatif de tes préférences coach actives. On regarde ça ensemble ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `status_recap_request_blocks_tool_start`
- safety: no issue observed
- direct_effects: []
- operation: `flow_opportunity_verification`
- pending_confirmation: opportunity confirmation
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptôme: demande explicite de status recap capturée comme opportunité à confirmer.
- Source amont probable: priorisation global dispatcher / opportunity verification pour signal `status_recap`.
- Owner runtime: `flow_opportunity_verification` + routage global des signals status.
- Meilleure correction selon les guidelines: quand le user demande explicitement un recap de préférences actives, router directement vers `status_recap`; réserver `flow_opportunity_verification` aux opportunités non explicites.
- Pourquoi ce n'est pas un patch local: le contenu visible n'est que la conséquence; le mauvais owner est déjà sélectionné.

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, montre-moi le récapitulatif maintenant.

**Sophia**
> Voici ton récapitulatif actuel :
>
> Fait : Profil configuré (ton direct, peu de questions, focus discipline).
> Prévu : Aucun rappel, session ou carte n'est programmé.
> Fragile : Aucune carte d'attaque ou de défense n'est active.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_flow_opportunity_verification_local_dispatcher`
- safety: no issue observed
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: none after answer
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` — Mauvaise transition de flow

**User**
> Et pour la suite, ne termine jamais tes réponses par une question.

**Sophia**
> Je comprends votre demande, mais je ne dispose pas d'un réglage permanent permettant de garantir l'absence totale de questions en fin de message. Pour l'instant, nous utilisons déjà le paramètre « Peu de questions » pour limiter leur fréquence au maximum. Souhaitez-vous que nous continuions avec cette configuration ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: no issue observed
- direct_effects: []
- operation: `update_coach_preferences`
- pending_confirmation: none durable
- executed_tools: []
- durable_effect: none
- write: `write_attempted=false`, `write_committed=false`, `preference_updates=[]`

**Analyse si yellow/red**
- Symptôme: le flow refuse correctement le réglage unsupported, mais finit par une question de confirmation inutile alors que la demande porte précisément sur les questions finales.
- Source amont probable: visible prompt `unsupported_preference` / continuation state après unsupported.
- Owner runtime: `update_coach_preferences` local visible task / reducer continuation.
- Meilleure correction selon les guidelines: pour `unsupported_preference` sans mapping à confirmer, produire une explication courte et fermer localement (`exit_to_global_dispatcher` ou état done), sans demander confirmation.
- Pourquoi ce n'est pas un patch local: le visible prompt doit être guidé par `conversation_context` et par une continuation correcte, pas par une phrase fixe.

### Tour 5

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Là maintenant, réponds-moi plus doucement juste pour cette réponse.

**Sophia**
> Je comprends tout à fait, je vais adopter un ton plus doux pour cette réponse, comme tu le souhaites.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_update_coach_preferences_local_dispatcher`
- safety: no issue observed
- direct_effects: []
- operation: `update_coach_preferences`
- pending_confirmation: none
- executed_tools: []
- durable_effect: none
- write: `write_attempted=false`, `write_committed=false`, `flow_action=punctual_instruction`

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- T1 est clair et naturel après commit réel.
- T3 restitue bien un état compréhensible.
- T5 distingue bien consigne ponctuelle et préférence durable.

**Problèmes**
- Tour 2: Sophia demande une confirmation pour un status explicitement demandé. Famille: `BF-ROUTE-03`. Impact: friction inutile et un tour de retard. Sévérité: yellow.
- Tour 4: refus unsupported correct, mais question finale maladroite. Famille: `BF-STATE-01`. Impact: l'expérience contredit la demande utilisateur dans le style immédiat, même si aucun write faux n'est fait. Sévérité: yellow.

**Fix proposé**
- Source amont: priorisation status explicite et visible task unsupported.
- Correction recommandée: `status_recap` doit court-circuiter `flow_opportunity_verification` quand la demande est explicite; `unsupported_preference` sans mapping doit fermer court sans confirmation.
- Tests d'invariant attendus: demande explicite de préférences actives -> `status_recap` direct; unsupported exact sans mapping -> no write, no confirmation question, local flow closed.

## 4. Analyse Système

**Verdict: yellow**

**Routage**
- T1 route correctement vers `update_coach_preferences`.
- T2 route incorrectement vers `flow_opportunity_verification` malgré une demande explicite de status.
- T3 récupère correctement `status_recap` après confirmation.
- T4 et T5 restent dans le dispatcher local `update_coach_preferences` sans global dispatcher pendant flow actif.

**Skills / Operations / Tools**
- `update_coach_preferences` écrit uniquement sur T1, avec updates `locked` et `committed_effects`.
- T4 unsupported ne write pas.
- T5 ponctuel ne write pas.
- `status_recap` répond au T3, mais seulement après un tour de confirmation inutile.

**Memory / Effets durables**
- DB avant cleanup confirme:
  - `coach.tone = direct`, `source_type=explicit_user`
  - `coach.question_tendency = low`, `source_type=explicit_user`
  - `coach.challenge_level = balanced`, `source_type=system_default`
- Aucun write supplémentaire observé après T4/T5.
- Cleanup ciblé effectué via `qa-reset-persona.sh`, puis suppression de la connexion temporaire via `qa-cleanup-run-connection.sh`.

**Problèmes**
- Tour 2: mauvais owner pour status explicite. Famille: `BF-ROUTE-03`. Impact système: un status explicite devient une opportunité à confirmer. Sévérité: yellow.
- Tour 4: transition unsupported laisse une continuité questionnante non nécessaire. Famille: `BF-STATE-01`. Impact système: pas d'effet durable faux, mais état/visible task trop ouverte. Sévérité: yellow.

**Fix proposé**
- Source amont: dispatcher/opportunity arbitration pour T2; reducer/visible task `unsupported_preference` pour T4.
- Correction recommandée: statut explicite bypass opportunity; unsupported sans mapping route vers réponse finale locale courte.
- Tests d'invariant attendus: integration `/test-send-message force_full_ai=true` couvrant T1 write, T2 status direct, T4 unsupported no confirmation, T5 punctual no write.

## Verdict Global

`yellow`.

Le nouveau flow local `update_coach_preferences` fonctionne pour le write durable clair, le no-write unsupported et le no-write ponctuel. Le run révèle deux bugs restants: status explicite priorisé comme opportunité, et réponse unsupported qui garde une question de confirmation inutile.
