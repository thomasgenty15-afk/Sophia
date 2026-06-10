# 2026-06-09 - update_coach_preferences field rules r5

## 1. Contexte Du Test

- Date: 2026-06-09
- Run: `update-coach-preferences-field-rules-r5`
- Persona: `qa-skill`, connexion temporaire `updatecoachpref_updatecoachpref_r5`, user local `e020e633-e415-4a65-98ed-cdb0b4994f0b`
- Objectif: vérifier en conditions réelles le prompt renforcé du dispatcher local `update_coach_preferences`
- Trajectoire: write durable avec contrainte conditionnelle -> unsupported durable -> ponctuel -> stop local
- Surfaces visées: dispatcher global, dispatcher local `update_coach_preferences`, reducer/writer DB, visible task `conversation_context`, stop local, `user_profile_facts`
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, hors sandbox, aucun renderer déterministe, aucun fallback direct
- Validité QA: valide. Run réel local mené tour par tour; cleanup ciblé effectué via `qa-cleanup-run-connection.sh`.
- Artefacts:
  - Raw T1-T4: `tests/real-personas/qa-skill/runs/operations/2026-06-09-update-coach-preferences-field-rules-r5-t*.raw.json`
  - Summary: `tests/real-personas/qa-skill/runs/operations/2026-06-09-update-coach-preferences-field-rules-r5.summary.json`
  - Durable before cleanup: `tests/real-personas/qa-skill/runs/operations/2026-06-09-update-coach-preferences-field-rules-r5-durable-before-cleanup.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-05` — Sémantique composite aplatie

**User**
> Pour la suite, sois plus direct et pose-moi moins de questions quand je bloque.

**Sophia**
> C'est entendu. J'adopte désormais un ton plus direct et je limiterai le nombre de mes questions pour la suite de nos échanges.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: no issue observed
- direct_effects: []
- operation: `update_coach_preferences`
- pending_confirmation: null
- memory_plan: targeted/light
- executed_tools: [`update_coach_preferences`]
- durable_effect: committed `coach.tone=direct`, `coach.question_tendency=low`
- trace detail: `conversation_context.unsupported_parts=["application uniquement en cas de blocage"]`

**Analyse si yellow/red**
- Symptôme: le dispatcher détecte la partie conditionnelle non supportée, mais écrit quand même les réglages globaux sans confirmation de mapping partiel.
- Source amont probable: reducer/admission write pour `preference_intent` partiel ou `unsupported_parts` non vide.
- Owner runtime: `update_coach_preferences` reducer / local dispatcher contract enforcement.
- Meilleure correction selon les guidelines: si une demande contient une contrainte durable non stockable qui change la portée du réglage, passer par `propose_supported_mapping` + confirmation, ou expliquer la limite avant write.
- Pourquoi ce n'est pas un patch local: la visible response suit un commit réel; le problème est l'admission du write malgré une sémantique composite partielle.

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Et pour être précis, ne termine jamais tes réponses par une question.

**Sophia**
> Je ne peux pas configurer de règle permanente pour bannir systématiquement les questions finales de mes réponses. Ton profil est déjà réglé pour limiter leur fréquence au maximum, mais cette contrainte structurelle spécifique n'est pas supportée dans tes paramètres durables.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: no issue observed
- direct_effects: []
- operation: `update_coach_preferences`
- pending_confirmation: none
- memory_plan: targeted/light
- executed_tools: []
- durable_effect: none
- write: `write_attempted=false`, `write_committed=false`
- visible context: `unsupported_parts=["Ne jamais terminer les réponses par une question"]`, `do_not_say` includes no durable storage claim

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok, dans ce cas là maintenant réponds-moi plus doucement juste pour cette réponse.

**Sophia**
> C'est entendu, je vais m'exprimer avec un peu plus de douceur pour cet échange, comme tu le souhaites.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_update_coach_preferences_local_dispatcher`
- safety: no issue observed
- direct_effects: []
- operation: `update_coach_preferences`
- pending_confirmation: none
- memory_plan: targeted/light
- executed_tools: []
- durable_effect: none
- write: `flow_action=punctual_instruction`, `write_attempted=false`, `write_committed=false`

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok laisse tomber pour les préférences, on s’arrête là.

**Sophia**
> Entendu, on s'arrête là pour la configuration de tes préférences.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_update_coach_preferences_local_dispatcher`
- safety: no issue observed
- direct_effects: []
- operation: `update_coach_preferences`
- pending_confirmation: none
- memory_plan: targeted/light
- executed_tools: []
- durable_effect: none
- transition: `flow_action=stop_local_no_handoff`, `visible_task_kind=stop_or_cancel`, `note_information=null`

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- T2 est nettement meilleur que le run précédent: la réponse unsupported est courte, claire, sans question finale inutile et sans faux claim durable.
- T3 reconnaît correctement une consigne ponctuelle sans prétendre la stocker.
- T4 stoppe proprement le flow sans relancer le global ni poser une nouvelle question.

**Problèmes**
- Tour 1: la réponse confirme un réglage global alors que le user avait donné une portée conditionnelle “quand je bloque”. Famille: `BF-INTAKE-05`. Impact: Sophia peut appliquer une préférence plus large que demandé. Sévérité: yellow.

**Fix proposé**
- Source amont: reducer/admission write de `update_coach_preferences`.
- Correction recommandée: si `unsupported_parts` contient une condition de portée ou si `support_status=partial`, ne pas écrire directement; proposer le mapping supporté et demander confirmation.
- Tests d'invariant attendus: “sois direct quand je bloque” -> proposed mapping/no write; confirmation explicite -> write; “sois plus direct pour la suite” -> write direct.

## 4. Analyse Système

**Verdict: yellow**

**Routage**
- T1, T2, T3, T4 restent sur `update_coach_preferences`.
- Pendant le flow actif, T3 et T4 utilisent `active_update_coach_preferences_local_dispatcher`, donc le dispatcher global normal ne reprend pas.
- T4 respecte `stop_local_no_handoff`.

**Skills / Operations / Tools**
- T1 exécute `update_coach_preferences` avec commit DB.
- T2 unsupported ne write pas.
- T3 ponctuel ne write pas.
- T4 stop local ne write pas et ne handoff pas.

**Memory / Effets durables**
- DB avant cleanup confirme:
  - `coach.tone=direct`, `source_type=explicit_user`
  - `coach.question_tendency=low`, `source_type=explicit_user`
  - `coach.challenge_level=balanced`, `source_type=system_default`
- Aucun effet durable supplémentaire après T2/T3/T4.
- Cleanup ciblé effectué sur la connexion temporaire.

**Problèmes**
- Tour 1: `unsupported_parts` non vide mais write direct tout de même. Famille: `BF-INTAKE-05`. Impact système: mapping partiel non confirmé devient durable global. Sévérité: yellow.

**Fix proposé**
- Source amont: reducer local ou consigne dispatcher autour de `unsupported_parts` + `write_preferences`.
- Correction recommandée: bloquer `write_ready` si `unsupported_parts` non vide et la partie unsupported modifie la portée du réglage; transformer en `propose_supported_mapping`.
- Tests d'invariant attendus: unit reducer pour `write_preferences` avec unsupported condition -> blocked/proposed; integration réelle `force_full_ai=true`.

## Verdict Global

`yellow`.

Le renforcement du prompt améliore clairement les champs `unsupported_parts`, `conversation_context.do_not_say`, le no-write unsupported, la consigne ponctuelle et le stop local. Il reste un bug: une préférence conditionnelle partiellement supportée peut encore être écrite globalement sans confirmation.
