# 2026-06-10 - update_coach_preferences conditional r8

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `update-coach-preferences-conditional-r8`
- Persona: `qa-skill`, connexion temporaire `updatecoachpref_updatecoachpref_r8`, user local `30608ef4-857d-4ab0-b0fb-cd8b814d1626`
- Objectif: vérifier le fix post-r6 sur la confirmation générale après proposition partielle conditionnelle
- Trajectoire: demande durable avec portée conditionnelle non stockable -> proposition locale -> confirmation générale -> commit DB
- Surfaces visées: dispatcher global, dispatcher local `update_coach_preferences`, reducer local, writer DB, `user_profile_facts`, EffectLedger
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, hors sandbox, aucun renderer déterministe, aucun fallback direct
- Validité QA: valide. Run réel local mené tour par tour; cleanup ciblé effectué via `qa-cleanup-run-connection.sh`.
- Artefacts:
  - Raw T1-T2: `tests/real-personas/qa-skill/runs/operations/2026-06-10-update-coach-preferences-conditional-r8-t*.raw.json`
  - Durable before cleanup: `tests/real-personas/qa-skill/runs/operations/2026-06-10-update-coach-preferences-conditional-r8-durable-before-cleanup.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pour nos prochains échanges, j’aimerais que tu sois plus directe et que tu me poses moins de questions quand je suis bloqué.

**Sophia**
> Est-ce que ça te convient si j'adopte un ton plus direct et que je réduise la fréquence de mes questions pour nos prochains échanges ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: low/no issue observed
- direct_effects: []
- operation: `update_coach_preferences`
- pending_confirmation: local proposed mapping, no legacy pending token
- memory_plan: minimal/none
- executed_tools: []
- durable_effect: none
- flow: `flow_action=write_preferences`, reducer `status=proposed`, `visible_task_kind=confirm_supported_mapping`
- context: proposed `coach.tone=direct`, `coach.question_tendency=low`; `unsupported_parts=["moins de questions spécifiquement quand je suis bloqué"]`
- write: `write_attempted=false`, `write_committed=false`, `committed_effects=[]`

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-LEDGER-02` — Commit réel mal rendu

**User**
> Oui, applique ça comme réglage général pour toutes nos conversations, pas seulement quand je suis bloqué.

**Sophia**
> C'est entendu. J'ai bien pris en compte ton souhait d'un ton plus direct et de moins de questions pour l'ensemble de nos échanges. On continue sur ton sujet actuel ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_update_coach_preferences_local_dispatcher`
- blocked_paths: `global_dispatcher` blocked by active local flow
- safety: none
- direct_effects: []
- operation: `update_coach_preferences`
- pending_confirmation: none
- memory_plan: minimal/none
- executed_tools: [`update_coach_preferences`]
- durable_effect: committed `coach.tone=direct`, `coach.question_tendency=low`
- flow: `flow_action=confirm_proposed_mapping`, `reason_code=update_coach_preferences_write_ready`, `status=executed`
- write: `write_attempted=true`, `write_committed=true`, `write_blocked_reason=null`
- committed_effects: `type=update_coach_preferences`, preference keys `coach.tone`, `coach.question_tendency`
- DB before cleanup: `coach.tone=direct` and `coach.question_tendency=low` with `source_type=explicit_user`

**Analyse si yellow/red**
- Symptôme: le fix fonctionnel est validé, mais `effect_ledger.entries` contient encore une entrée `platform_handoff.update_coach_preferences` en `blocked` avec `reason_code=missing_platform_handoff_contract`, et `counts.committed=0`.
- Source amont probable: intégration EffectLedger / adapter runtime encore branchée sur un contrat legacy `platform_handoff` pour ce skill.
- Owner runtime: `effect_ledger_adapter` / intégration ledger du tool skill `update_coach_preferences`.
- Meilleure correction selon les guidelines: enregistrer un effet ledger de commit réel `update_coach_preferences` / `coach_preferences.update` quand `write_committed=true`, au lieu d'une entrée legacy platform handoff bloquée.
- Pourquoi ce n'est pas un patch local: le writer et la DB sont corrects; la correction appartient à la frontière effects/ledger, pas au prompt visible ni au reducer.

## 3. Analyse De Fluidité Humaine

**Verdict: green**

**Ce qui marche**
- T1 ne prétend pas écrire durablement et demande une confirmation claire.
- T2 ne boucle plus sur une deuxième confirmation: la confirmation générale est acceptée au premier tour de confirmation.
- Le message visible de succès arrive seulement après `write_committed=true`.

**Problèmes**
- Aucun problème bloquant côté conversation. Le “On continue sur ton sujet actuel ?” est acceptable mais pas indispensable.

**Fix proposé**
- Source amont: n/a pour la fluidité.
- Correction recommandée: n/a.
- Tests d'invariant attendus: garder T1 conditionnel -> no write; T2 confirmation générale -> write.

## 4. Analyse Système

**Verdict: yellow**

**Routage**
- T1: le dispatcher global sélectionne correctement `update_coach_preferences` et transmet une `note_information`.
- T2: le dispatcher global normal est bien skip pendant le flow actif; `blocked_paths` contient `global_dispatcher` avec `active_update_coach_preferences_uses_local_dispatcher`.

**Skills / Operations / Tools**
- T1: dispatcher local + reducer convertissent le write initial partiel en proposition, sans DB write.
- T2: dispatcher local retourne `confirm_proposed_mapping`; reducer passe en `write_ready`; writer DB commit.
- Aucun pending confirmation legacy ni platform handoff nominal.

**Memory / Effets durables**
- DB avant cleanup:
  - `coach.tone=direct`, `source_type=explicit_user`
  - `coach.question_tendency=low`, `source_type=explicit_user`
  - `coach.challenge_level=balanced`, `source_type=system_default`
- `tool_skill_run.committed_effects` contient bien l'effet `update_coach_preferences`.

**Problèmes**
- Tour 2: EffectLedger incohérent avec le commit réel. Famille: `BF-LEDGER-02`. Impact système: traces d'effets durables non fiables pour audit global, même si la DB et la réponse visible sont correctes.

**Fix proposé**
- Source amont: `effect_ledger_adapter` / intégration runtime du ledger pour `update_coach_preferences`.
- Correction recommandée: créer une entrée ledger commit pour le write DB réel et supprimer l'entrée legacy platform handoff bloquée sur le chemin nominal local write.
- Tests d'invariant attendus: run local avec `write_committed=true` -> `EffectLedger.counts.committed>=1`, entrée `coach_preferences.update` ou équivalent, aucune entrée `platform_handoff` bloquée sur chemin nominal.

## Verdict Global

`yellow`.

Le fix demandé est validé en conditions réelles: la confirmation générale écrit bien en DB au premier tour de confirmation. Le seul warning restant est distinct: EffectLedger garde une trace legacy bloquée alors que le commit DB réel a réussi.
