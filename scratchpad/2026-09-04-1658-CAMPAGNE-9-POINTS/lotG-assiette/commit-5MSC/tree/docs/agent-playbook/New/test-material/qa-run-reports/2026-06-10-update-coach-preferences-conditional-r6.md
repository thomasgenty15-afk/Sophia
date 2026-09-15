# 2026-06-10 - update_coach_preferences conditional r6

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `update-coach-preferences-conditional-r6`
- Persona: `qa-skill`, connexion temporaire `updatecoachpref_updatecoachpref_r6`, user local `671a9b27-be75-4d31-9424-6ea2619be9f2`
- Objectif: vérifier le fix ciblé qui bloque le write direct quand une demande contient une contrainte non stockable de portée
- Trajectoire: demande conditionnelle partiellement supportée -> confirmation globale -> confirmation explicite renforcée -> commit
- Surfaces visées: dispatcher local `update_coach_preferences`, reducer local, `visible_task.conversation_context`, writer DB, `user_profile_facts`
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, hors sandbox, aucun renderer déterministe, aucun fallback direct
- Validité QA: valide. Run réel local mené tour par tour; cleanup ciblé effectué via `qa-cleanup-run-connection.sh`.
- Artefacts:
  - Raw T1-T3: `tests/real-personas/qa-skill/runs/operations/2026-06-10-update-coach-preferences-conditional-r6-t*.raw.json`
  - Summary: `tests/real-personas/qa-skill/runs/operations/2026-06-10-update-coach-preferences-conditional-r6.summary.json`
  - DB after T1: `tests/real-personas/qa-skill/runs/operations/2026-06-10-update-coach-preferences-conditional-r6-after-t1-db.json`
  - Durable before cleanup: `tests/real-personas/qa-skill/runs/operations/2026-06-10-update-coach-preferences-conditional-r6-durable-before-cleanup.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pour la suite, sois plus direct et pose-moi moins de questions quand je bloque.

**Sophia**
> Est-ce que tu confirmes vouloir que j'adopte un ton plus direct et que je diminue la fréquence de mes questions pour la suite ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: no issue observed
- direct_effects: []
- operation: `update_coach_preferences`
- pending_confirmation: local proposed mapping
- memory_plan: targeted/light
- executed_tools: []
- durable_effect: none
- flow: `status=proposed`, `visible_task_kind=confirm_supported_mapping`
- context: `unsupported_parts=["quand je bloque"]`, proposed updates `coach.tone=direct`, `coach.question_tendency=low`
- DB after T1: only defaults, no explicit preference write

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` — Mauvaise transition de flow

**User**
> Oui, applique-les comme réglages généraux, même si ce n’est pas seulement quand je bloque.

**Sophia**
> Entendu. Est-ce que tu me confirmes vouloir passer à un ton direct et à moins de questions pour l'ensemble de nos échanges à venir ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_update_coach_preferences_local_dispatcher`
- safety: no issue observed
- direct_effects: []
- operation: `update_coach_preferences`
- pending_confirmation: still local proposed mapping
- memory_plan: targeted/light
- executed_tools: []
- durable_effect: none
- flow: `flow_action=confirm_proposed_mapping`, `status=proposed`, `write_committed=false`
- context: `missing_or_weak_values=["confirmation"]` despite explicit general confirmation

**Analyse si yellow/red**
- Symptôme: le user confirme déjà l'application générale, mais Sophia redemande une confirmation équivalente.
- Source amont probable: reducer local garde `unsupported_parts` de la proposition précédente et retransforme un `confirm_proposed_mapping` en proposition, même quand le message courant confirme explicitement le mapping global.
- Owner runtime: `update_coach_preferences` reducer local.
- Meilleure correction selon les guidelines: le garde anti-write direct doit s'appliquer au premier write partiel, mais ne doit pas bloquer une vraie confirmation explicite du mapping général.
- Pourquoi ce n'est pas un patch local: le visible prompt suit l'état `status=proposed`; il faut corriger la transition reducer `proposed -> write_ready`.

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui je confirme : applique ton direct et moins de questions pour tous nos échanges à venir.

**Sophia**
> C'est entendu. J'adopterai désormais un ton direct et je limiterai le nombre de mes questions pour la suite de nos échanges. Sur quel sujet souhaites-tu que nous poursuivions ?

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
- executed_tools: [`update_coach_preferences`]
- durable_effect: committed `coach.tone=direct`, `coach.question_tendency=low`
- DB before cleanup: `coach.tone=direct` and `coach.question_tendency=low` with `source_type=explicit_user`

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- T1 valide le fix principal: pas de write direct quand une contrainte conditionnelle non stockable est détectée.
- T3 écrit seulement après une confirmation globale très explicite.
- La conversation reste compréhensible et aucun faux succès durable n'est visible avant commit.

**Problèmes**
- Tour 2: confirmation redemandée alors que le user avait déjà accepté l'application générale. Famille: `BF-STATE-01`. Impact: friction et impression de boucle légère. Sévérité: yellow.

**Fix proposé**
- Source amont: transition reducer `confirm_proposed_mapping`.
- Correction recommandée: si le dispatcher sort `confirm_proposed_mapping` avec updates locked et evidence de confirmation générale, ne pas réappliquer le garde `unsupported_parts.length > 0`; vider ou neutraliser l'ancienne unsupported part pour ce write confirmé.
- Tests d'invariant attendus: T1 partiel -> proposed/no write; T2 “oui applique comme réglage général” -> write; anti-faux-positif “oui mais seulement quand je bloque” -> no write/proposed.

## 4. Analyse Système

**Verdict: yellow**

**Routage**
- Tous les tours restent correctement dans `update_coach_preferences`.
- T2 et T3 utilisent `active_update_coach_preferences_local_dispatcher`; le dispatcher global ne reprend pas pendant le flow actif.

**Skills / Operations / Tools**
- T1: local flow propose mapping, no write.
- T2: local flow reconnaît `confirm_proposed_mapping`, mais reste en `status=proposed`.
- T3: write DB réussi après confirmation renforcée.

**Memory / Effets durables**
- DB après T1: aucun write explicite; `coach.tone=warm_direct`, `coach.question_tendency=normal`, `coach.challenge_level=balanced` restent des defaults.
- DB avant cleanup après T3:
  - `coach.tone=direct`, `source_type=explicit_user`
  - `coach.question_tendency=low`, `source_type=explicit_user`
  - `coach.challenge_level=balanced`, `source_type=system_default`
- Cleanup ciblé effectué.

**Problèmes**
- Tour 2: confirmation explicite non admise comme write-ready. Famille: `BF-STATE-01`. Impact système: double confirmation requise.

**Fix proposé**
- Source amont: reducer local du partial mapping.
- Correction recommandée: distinguer “première admission write avec unsupported_parts” de “confirmation d'une proposition déjà connue”. Le garde doit créer une proposition au premier tour, pas bloquer indéfiniment les confirmations.
- Tests d'invariant attendus: reducer `confirm_proposed_mapping` + previous proposed + locked updates + confirmation globale -> `write_ready`; variant avec confirmation conditionnelle persistante -> `proposed`.

## Verdict Global

`yellow`.

Le fix principal est validé: la demande conditionnelle ne write plus directement. Il reste une friction de transition: une confirmation générale explicite demande encore une deuxième confirmation avant commit.
