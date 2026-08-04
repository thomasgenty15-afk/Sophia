# 2026-06-11 - update_coach_preferences conditional r9

## 1. Contexte Du Test

- Date: 2026-06-11
- Run: `update-coach-preferences-conditional-r9`
- Persona: `qa-skill`, connexion temporaire `updatecoachpref_updatecoachpref_r9`, user local `35e39ae5-d02c-4ad2-8cbd-7486d2429b0c`
- Objectif: vérifier le fix EffectLedger post-r8 et reconfirmer le flow conditionnel post-r6
- Trajectoire: demande durable avec portée conditionnelle non stockable -> proposition locale -> confirmation générale -> commit DB + ledger committed
- Surfaces visées: dispatcher global, dispatcher local `update_coach_preferences`, reducer local, writer DB, `user_profile_facts`, EffectLedger
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, hors sandbox, aucun renderer déterministe, aucun fallback direct
- Validité QA: valide. Run réel local mené tour par tour; cleanup ciblé effectué via `qa-cleanup-run-connection.sh`.
- Artefacts:
  - Raw T1-T2: `tests/real-personas/qa-skill/runs/operations/2026-06-11-update-coach-preferences-conditional-r9-t*.raw.json`
  - Durable before cleanup: `tests/real-personas/qa-skill/runs/operations/2026-06-11-update-coach-preferences-conditional-r9-durable-before-cleanup.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pour la suite, sois plus direct avec moi et limite vraiment les questions quand je suis coincé.

**Sophia**
> J'ai bien saisi ton besoin de changement. Est-ce que tu confirmes que tu veux que je passe à un ton direct et que je limite mes questions à l'avenir ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: low/no issue observed
- direct_effects: []
- operation: `update_coach_preferences`
- pending_confirmation: local proposed mapping, no legacy pending token
- memory_plan: targeted/light
- executed_tools: []
- durable_effect: none
- flow: `flow_action=write_preferences`, reducer `status=proposed`, `visible_task_kind=confirm_supported_mapping`
- context: proposed `coach.tone=direct`, `coach.question_tendency=low`; `unsupported_parts=["quand je suis coincé"]`
- write: `write_attempted=false`, `write_committed=false`, `committed_effects=[]`
- effect_ledger: `entries=[]`, `counts.blocked=0`

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, mets ça comme réglage général pour toutes nos conversations, pas uniquement quand je suis coincé.

**Sophia**
> C'est entendu. À partir de maintenant, j'adopterai un ton direct et je limiterai mes questions pour l'ensemble de nos échanges. On continue sur ton sujet en cours ?

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
- effect_ledger: `counts.requested=1`, `counts.allowed=1`, `counts.committed=1`, `counts.blocked=0`; committed entry `effect_type=coach_preferences.update`, `status=committed`, `db_ref.table=user_profile_facts`, `db_ref.key=coach.tone`
- DB before cleanup: `coach.tone=direct` and `coach.question_tendency=low` with `source_type=explicit_user`

## 3. Analyse De Fluidité Humaine

**Verdict: green**

**Ce qui marche**
- T1 ne prétend pas écrire durablement quand une portée conditionnelle non stockable est présente.
- T2 accepte la confirmation générale au premier tour de confirmation.
- Le succès visible correspond à un commit réel.

**Problèmes**
- Aucun problème bloquant observé.

**Fix proposé**
- Source amont: n/a.
- Correction recommandée: n/a.
- Tests d'invariant attendus: conserver T1 conditionnel -> no write; T2 confirmation générale -> write + ledger committed.

## 4. Analyse Système

**Verdict: green**

**Routage**
- T1: dispatcher global sélectionne correctement `update_coach_preferences` et transmet une `note_information`.
- T2: dispatcher global normal est skip pendant le flow actif; `blocked_paths` contient `active_update_coach_preferences_uses_local_dispatcher`.

**Skills / Operations / Tools**
- T1: dispatcher local + reducer transforment le write initial partiel en proposition, sans DB write.
- T2: dispatcher local retourne `confirm_proposed_mapping`; reducer passe en `write_ready`; writer DB commit.
- Aucun pending confirmation legacy ni platform handoff nominal.

**Memory / Effets durables**
- DB avant cleanup:
  - `coach.tone=direct`, `source_type=explicit_user`
  - `coach.question_tendency=low`, `source_type=explicit_user`
  - `coach.challenge_level=balanced`, `source_type=system_default`
- `tool_skill_run.committed_effects` contient l'effet `update_coach_preferences`.
- EffectLedger contient un effet durable `coach_preferences.update` en `committed`; aucune entrée `platform_handoff` bloquée.

**Problèmes**
- Aucun problème système observé sur la trajectoire testée.

**Fix proposé**
- Source amont: n/a.
- Correction recommandée: n/a.
- Tests d'invariant attendus: ajouter ce run comme preuve de non-régression pour le fix r8.

## Verdict Global

`green`.

Le flow conditionnel et le fix EffectLedger sont validés en conditions réelles.
