## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `2026-06-15-update-coach-preferences-stateful-r1`
- Persona: `qa-skill`, connexion temporaire locale `update_coach_stateful_20260615_r1`, user `8c68168c-2da4-494f-aa6d-e5f5ee827cf5`, cleanup effectué.
- Objectif: vérifier en conditions réelles le flow local stateful `update_coach_preferences` après ajout du merge server-owned / mutation audit.
- Trajectoire: write durable clair -> status read-only -> demande durable non supportée -> correction naturelle depuis flow actif.
- Surfaces visées: dispatcher global, active flow policy, `update_coach_preferences.local_dispatcher`, reducer, writer `user_profile_facts`, `status_recap`, trace `state_mutation_audit`.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, auth locale vérifiée, aucun fallback déterministe.
- Validité QA: valide. Les 4 tours ont répondu `200` avec réponse Sophia réelle. JWT non affiché.
- Artefacts: `tests/real-personas/qa-skill/runs/operations/2026-06-15-update-coach-preferences-stateful-r1.{raw,summary,durable,cleanup}.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pour les prochaines fois, challenge-moi un peu plus franchement et évite de me noyer sous les questions.

**Sophia**
> C'est entendu. Je monterai d'un cran le niveau de challenge et je ferai attention à ne pas t'envahir de questions lors de nos prochains échanges. Est-ce que tu veux continuer sur notre sujet actuel ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: `none`
- operation: `status=executed`, `reason_code=update_coach_preferences_write_ready`, `flow_action=write_preferences`, `visible_task_kind=preference_saved`, `write_committed=true`
- pending_confirmation: `null`
- executed_tools: `["update_coach_preferences"]`
- durable_effect: `update_coach_preferences` committed for `coach.challenge_level`, `coach.question_tendency`
- db_check: `coach.challenge_level=high`, `coach.question_tendency=low`
- state_mutation_audit: no rejected changes, server-owned fields present.

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Tu peux me rappeler quelles préférences coach sont actives maintenant ?

**Sophia**
> Voici tes préférences actuelles. Tu as configuré un niveau de challenge **Élevé** et **Peu de questions**. Pour le reste, j'applique les réglages par défaut : un ton **Bienveillant ferme**, un focus **Discipline / action** et des messages **Courts**.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- safety: `none`
- operation: `status=answered`, `reason_code=status_recap_local_answer_coach_preferences_status`, `flow_action=answer_coach_preferences_status`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: `[]`
- db_check: no new preference write; status answer matches DB.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` — mauvaise transition de flow

**User**
> En fait, j'aimerais que tu ne termines jamais tes réponses par une question, si tu peux garder ça pour toujours.

**Sophia**
> Je comprends que tu aimerais que je ne termine plus jamais mes messages par une question. Malheureusement, je n'ai pas de réglage spécifique pour bannir totalement ce format de manière durable. Ma tendance à poser des questions est déjà réglée au minimum, mais je ne peux pas te garantir une absence totale à chaque fois. Est-ce que cela te convient quand même ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- operation: `status=collecting`, `reason_code=update_coach_preferences_unsupported_preference`, `flow_action=unsupported_preference`, `visible_task_kind=unsupported_preference`, `write_attempted=false`, `write_committed=false`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: `[]`
- diagnosis.constraints: `["ne jamais terminer ses réponses par une question"]`
- state_mutation_audit: `restored_fields=["unsupported_parts"]`, `rejected_changes=[{"field":"unsupported_parts","reason_code":"invalid_status_transition"}]`

**Analyse si yellow/red**
- Symptôme: pas de faux write, mais le reducer rejette le stockage local de `unsupported_parts` sur une transition `unsupported_preference` qui reste `collecting`. La réponse visible finit aussi par une question alors que la demande du user porte précisément sur l'absence de question finale.
- Source amont probable: transition reducer `unsupported_preference` / merge state trop strict pour `unsupported_parts`, plus prompt visible `unsupported_preference` qui ne reçoit pas ou n'applique pas assez la contrainte conversationnelle immédiate.
- Owner runtime: `update_coach_preferences` reducer + visible prompt stage `unsupported_preference`.
- Meilleure correction selon les guidelines: autoriser la transition unsupported à appliquer `unsupported_parts` sans write, et passer une contrainte visible courte "ne pas finir par une question" pour ce tour quand la demande porte sur ce format, sans en faire une préférence durable.
- Pourquoi ce n'est pas un patch local: le problème est une transition de flow et une frontière conversation_context, pas une phrase à remplacer.

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> D'accord, dans ce cas garde simplement moins de questions et rends ton ton plus direct durablement.

**Sophia**
> C'est fait ! Je suis désormais prête à être plus directe avec toi et je veillerai à limiter mes questions, comme tu me l'as demandé. Est-ce que cela te convient pour la suite ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_update_coach_preferences_local_dispatcher`
- safety: `none`
- operation: `status=executed`, `reason_code=update_coach_preferences_write_ready`, `flow_action=write_preferences`, `visible_task_kind=preference_saved`, `write_committed=true`
- pending_confirmation: `null`
- executed_tools: `["update_coach_preferences"]`
- durable_effect: `update_coach_preferences` committed for `coach.tone`, `coach.question_tendency`
- db_check: `coach.tone=direct`, `coach.question_tendency=low`
- state_mutation_audit: no rejected changes.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les demandes durables supportées sont comprises naturellement sans que le user parle comme un test.
- Le status recap répond clairement et sans write.
- Après une demande non supportée, le user peut corriger naturellement vers une préférence supportée; le flow actif reprend bien la main.

**Problemes**
- Tour 3: Sophia termine par une question alors que le user demande explicitement de ne jamais terminer par une question. Famille: `BF-STATE-01` côté contexte/prompt stage, avec impact UX visible. Sévérité: yellow.

**Fix propose**
- Source amont: reducer/conversation_context du stage `unsupported_preference`.
- Correction recommandée: conserver `unsupported_parts` sur la transition unsupported et exposer une contrainte de réponse ponctuelle au visible prompt, sans write durable.
- Tests d'invariant attendus: unsupported preference no-write + `unsupported_parts` appliqué au local state + visible prompt ne contredit pas la contrainte du tour.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tour 1: correct, dispatcher global -> `update_coach_preferences`.
- Tour 2: correct, status explicite -> `status_recap`.
- Tour 3: correct owner `update_coach_preferences`, no-write correct.
- Tour 4: correct, active flow -> dispatcher local `update_coach_preferences`, global skipped.

**Skills / Operations / Tools**
- Writes durables observés uniquement quand l'intention est durable/supportée/locked.
- Aucun write durable sur demande unsupported.
- `state_mutation_audit` est présent et exploitable.

**Memory / Effets durables**
- DB après Tour 1: `coach.challenge_level=high`, `coach.question_tendency=low`.
- DB après Tour 4: `coach.tone=direct`, `coach.question_tendency=low`.
- Cleanup ciblé: connexion temporaire supprimée via `scripts/qa-cleanup-run-connection.sh qa-skill update_coach_stateful_20260615_r1`.

**Problemes**
- Tour 3: `unsupported_parts` rejeté par le merge avec `invalid_status_transition`, alors que c'est une information utile de flow. Famille: `BF-STATE-01`. Impact système: trace yellow et risque de contexte local incomplet si le user pose ensuite plusieurs questions sur la limite.

**Fix propose**
- Source amont: `mergeCoachPreferenceLocalState` / transition reducer pour `unsupported_preference`.
- Correction recommandée: introduire une transition explicite `unsupported` ou autoriser `blocked/collecting` à appliquer `unsupported_parts` quand `flow_action=unsupported_preference`, sans autoriser de write.
- Tests d'invariant attendus: unsupported no-write, audit sans rejected change, correction ultérieure supportée continue à écrire seulement les clés supportées.

## Verdict Global

- Verdict: yellow
- Raison principale: les invariants principaux tiennent, mais le Tour 3 révèle une rigidité stateful sur `unsupported_parts` et une contradiction visible mineure.
- Follow-up prioritaire: corriger la transition unsupported du reducer et relancer une variante unsupported -> correction naturelle.
