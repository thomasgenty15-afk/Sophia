# Checklist de vérification — bilan_missed_streak_breakdown

## 1. Validation du reset DB (vérifiée automatiquement par `commands/reset.mjs`)

### user_chat_states

| Champ                | Valeur attendue                       | Critique |
|----------------------|---------------------------------------|----------|
| `current_mode`       | `"investigator"`                      | ✅ Oui   |
| `temp_memory`        | `{}` (objet vide)                     | ✅ Oui   |
| `investigation_state.status` | `"checking"`                  | ✅ Oui   |
| `investigation_state.current_item_index` | `0`              | ✅ Oui   |
| `investigation_state.pending_items` | 3 items (1 vital + 2 actions) | ✅ Oui |
| `investigation_state.temp_memory.opening_done` | `false`    | ✅ Oui   |
| `short_term_context` | `""` (vide)                           | Non      |
| `risk_level`         | `0`                                   | Non      |
| `unprocessed_msg_count` | `0`                                | Non      |

### user_actions

| Champ          | Méditation 10 min  | Lecture 20 min     | Critique |
|----------------|--------------------|--------------------|----------|
| `type`         | `"habit"`          | `"habit"`          | ✅ Oui   |
| `target_reps`  | `5`                | `5`                | ✅ Oui   |
| `current_reps` | `0`                | `3`                | ✅ Oui   |
| `status`       | `"active"`         | `"active"`         | ✅ Oui   |
| `tracking_type`| `"boolean"`        | `"boolean"`        | Non      |
| `time_of_day`  | `"morning"`        | `"evening"`        | Non      |
| `scheduled_days` | `null`           | `null`             | Non      |

### investigation_state.pending_items — détail

| Item              | Champ                   | Valeur attendue | Critique |
|-------------------|-------------------------|-----------------|----------|
| Énergie (vital)   | `type`                  | `"vital"`       | ✅ Oui   |
|                   | `title`                 | `"Énergie"`     | ✅ Oui   |
|                   | `unit`                  | `"/10"`         | Non      |
|                   | `tracking_type`         | `"counter"`     | Non      |
| Méditation 10 min | `type`                  | `"action"`      | ✅ Oui   |
|                   | `is_habit`              | `true`          | ✅ Oui   |
|                   | `weekly_target_status`  | `"below"`       | ✅ Oui   |
|                   | `target`                | `5`             | ✅ Oui   |
|                   | `current`               | `0`             | ✅ Oui   |
| Lecture 20 min    | `type`                  | `"action"`      | ✅ Oui   |
|                   | `is_habit`              | `true`          | ✅ Oui   |
|                   | `weekly_target_status`  | `"below"`       | ✅ Oui   |
|                   | `target`                | `5`             | ✅ Oui   |
|                   | `current`               | `3`             | ✅ Oui   |

### Tables vidées/re-seedées après reset

| Table                  | Attendu                            |
|------------------------|------------------------------------|
| `chat_messages`        | 0 rows                             |
| `user_checkup_logs`    | 0 rows                             |
| `turn_summary_logs`    | 0 rows                             |
| `user_action_entries`  | 5 rows (5 "missed" pour Méditation)|

### user_vital_signs

| Champ           | Valeur attendue |
|-----------------|-----------------|
| `label`         | `"Énergie"`     |
| `unit`          | `"/10"`         |
| `status`        | `"active"`      |
| `tracking_type` | `"counter"`     |

---

## 2. Validation post-run (avant reset) — à vérifier manuellement si doute

### Variant `accept` (accepte breakdown → post-bilan complet)

| Champ                              | Attendu                                  |
|------------------------------------|------------------------------------------|
| `investigation_state`              | `null` (bilan clôturé)                   |
| `current_mode`                     | `"companion"` (fin de bilan + breakdown) |
| `temp_memory.deferred_topics_v2`   | Vide ou absent (topic consommé)          |
| `temp_memory.bilan_defer_consents` | `breakdown_action` → `{<meditation_id>: true}` |
| Trace: breakdown_action machine    | Démarrée via deferred_topics, complétée  |
| Trace: `break-down-action` call    | 1 appel, micro-étape générée             |
| Micro-étape                        | Nouvelle action ajoutée au plan          |

### Variant `decline` (refuse breakdown → bilan seulement)

| Champ                              | Attendu                                  |
|------------------------------------|------------------------------------------|
| `investigation_state`              | `null` (bilan clôturé)                   |
| `current_mode`                     | `"companion"` (fin de bilan)             |
| `temp_memory.deferred_topics_v2`   | Vide ou absent (pas de topic créé)       |
| `temp_memory.bilan_defer_consents` | `breakdown_action` → `{<meditation_id>: false}` |
| Trace: breakdown_action machine    | **AUCUN démarrage** (pas de breakdown)   |
| Trace: `break-down-action` call    | **AUCUN appel**                          |

---

## 3. Validation du transcript — Variant `accept` (phases dans l'ordre)

| Phase | Description | Quoi chercher |
|-------|-------------|---------------|
| 1 | Déclenchement bilan | User demande bilan → Sophia commence |
| 2 | Signe vital | Sophia pose question sur Énergie → user répond "7 sur 10" |
| 3 | Action 1 : Méditation 10 min | Sophia demande si fait → user dit non |
| 4 | Raison du miss | Sophia creuse → user explique manque motivation |
| 5 | Proposition breakdown | Sophia détecte streak >= 5, propose micro-étape APRÈS bilan |
| 6 | Acceptation | User accepte clairement ("oui bonne idée") |
| 7 | Action 2 : Lecture 20 min | Sophia passe à action 2 → user dit fait |
| 8 | Clôture bilan | Sophia conclut le bilan |
| 9 | Relaunch consent | Sophia revient sur le sujet mis en attente → user accepte |
| 10 | Breakdown machine | Sophia demande le blocage → user explique |
| 11 | Micro-étape proposée | Sophia propose micro-étape → user accepte ajout au plan |

### Validation du transcript — Variant `decline` (phases dans l'ordre)

| Phase | Description | Quoi chercher |
|-------|-------------|---------------|
| 1 | Déclenchement bilan | User demande bilan → Sophia commence |
| 2 | Signe vital | Sophia pose question sur Énergie → user répond |
| 3 | Action 1 : Méditation 10 min | Sophia demande si fait → user dit non |
| 4 | Raison du miss | Sophia creuse → user explique |
| 5 | Proposition breakdown | Sophia détecte streak >= 5, propose micro-étape |
| 6 | Refus | User refuse clairement ("non merci") |
| 7 | Action 2 : Lecture 20 min | Sophia passe à action 2 → user dit fait |
| 8 | Clôture bilan | Sophia conclut le bilan, mode → companion |

---

## 4. Red flags (échec immédiat)

- ❌ Sophia ne détecte pas le missed streak >= 5 pour Méditation 10 min
- ❌ Sophia ne propose pas de breakdown / micro-étape
- ❌ Sophia démarre le breakdown pendant le bilan (au lieu de le différer)
- ❌ Sophia ne revient pas sur le sujet après le bilan (variant `accept`)
- ❌ Sophia lance le breakdown malgré le refus (variant `decline`)
- ❌ Mode reste `investigator` après clôture
- ❌ Messages consécutifs du même rôle (user-user ou assistant-assistant)
- ❌ `**markdown**` dans les messages Sophia
- ❌ Sophia dit "bonjour" / "salut" en milieu de bilan

## 5. Note sur le nombre de turns

- **Variant `accept`** : Flow complet (bilan + post-bilan breakdown). Attendu raisonnable: `turns_executed` entre **8 et 20**
- **Variant `decline`** : Bilan seulement. Attendu raisonnable: `turns_executed` entre **6 et 14**
- Alerte si `< 6`: bilan probablement non lancé ou interrompu trop tôt


