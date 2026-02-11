# Checklist de vérification — bilan_exceed_target

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

| Champ          | Sport 30 min       | Lecture 15 min     | Critique |
|----------------|--------------------|--------------------|----------|
| `type`         | `"habit"`          | `"habit"`          | ✅ Oui   |
| `target_reps`  | `3`                | `5`                | ✅ Oui   |
| `current_reps` | `4`                | `2`                | ✅ Oui   |
| `status`       | `"active"`         | `"active"`         | ✅ Oui   |
| `tracking_type`| `"boolean"`        | `"boolean"`        | Non      |
| `time_of_day`  | `"morning"`        | `"evening"`        | Non      |
| `scheduled_days` | variant-dépendant (voir ci-dessous) | `null`   | ✅ Oui |

#### `scheduled_days` pour Sport 30 min selon variant

| Variant         | scheduled_days attendu |
|-----------------|------------------------|
| `no`            | `null`                 |
| `yes_no_days`   | `null`                 |
| `yes_with_days` | `["mon","wed","fri"]`  |

### investigation_state.pending_items — détail

| Item              | Champ                   | Valeur attendue | Critique |
|-------------------|-------------------------|-----------------|----------|
| Énergie (vital)   | `type`                  | `"vital"`       | ✅ Oui   |
|                   | `title`                 | `"Énergie"`     | ✅ Oui   |
|                   | `unit`                  | `"/10"`         | Non      |
|                   | `tracking_type`         | `"counter"`     | Non      |
| Sport 30 min      | `type`                  | `"action"`      | ✅ Oui   |
|                   | `is_habit`              | `true`          | ✅ Oui   |
|                   | `weekly_target_status`  | `"exceeded"`    | ✅ Oui   |
|                   | `target`                | `3`             | ✅ Oui   |
|                   | `current`               | `4`             | ✅ Oui   |
|                   | `scheduled_days`        | voir tableau ci-dessus | ✅ Oui |
| Lecture 15 min    | `type`                  | `"action"`      | ✅ Oui   |
|                   | `is_habit`              | `true`          | ✅ Oui   |
|                   | `weekly_target_status`  | `"below"`       | ✅ Oui   |
|                   | `target`                | `5`             | ✅ Oui   |
|                   | `current`               | `2`             | ✅ Oui   |

### Tables vidées après reset

| Table                  | Attendu     |
|------------------------|-------------|
| `chat_messages`        | 0 rows      |
| `user_checkup_logs`    | 0 rows      |
| `turn_summary_logs`    | 0 rows      |
| `user_action_entries`  | 4 rows (re-seedées) |

### user_vital_signs

| Champ           | Valeur attendue |
|-----------------|-----------------|
| `label`         | `"Énergie"`     |
| `unit`          | `"/10"`         |
| `status`        | `"active"`      |
| `tracking_type` | `"counter"`     |

---

## 2. Validation post-run (avant reset) — à vérifier manuellement si doute

### Variant `no` (refus d'augmentation)

| Champ                              | Attendu                                  |
|------------------------------------|------------------------------------------|
| `Sport 30 min → target_reps`       | `3` (inchangé)                           |
| `Sport 30 min → scheduled_days`    | `null` (inchangé)                        |
| `investigation_state`              | `null` (bilan clôturé)                   |
| `current_mode`                     | `"companion"` (fin de bilan)             |
| Trace: `increaseWeekTarget`        | **AUCUN appel** (pas d'augmentation)     |

### Variant `yes_no_days` (accepte sans jours)

| Champ                              | Attendu                                  |
|------------------------------------|------------------------------------------|
| `Sport 30 min → target_reps`       | `4` (augmenté de 3 → 4)                 |
| `Sport 30 min → scheduled_days`    | `null` (inchangé)                        |
| `investigation_state`              | `null` (bilan clôturé)                   |
| `current_mode`                     | `"companion"`                            |
| Trace: `increaseWeekTarget`        | 1 appel, `success: true`, `old: 3, new: 4` |

### Variant `yes_with_days` (accepte avec jours)

| Champ                              | Attendu                                  |
|------------------------------------|------------------------------------------|
| `Sport 30 min → target_reps`       | `4` (augmenté de 3 → 4)                 |
| `Sport 30 min → scheduled_days`    | `["mon","tue","wed","fri"]` (mardi ajouté)|
| `investigation_state`              | `null` (bilan clôturé)                   |
| `current_mode`                     | `"companion"`                            |
| Trace: `increaseWeekTarget`        | 1 appel, `success: true`, `old: 3, new: 4`, `dayToAdd: "tue"` |

---

## 3. Validation du transcript (phases à vérifier dans l'ordre)

| Phase | Description | Quoi chercher |
|-------|-------------|---------------|
| 1 | Déclenchement bilan | User demande bilan → Sophia commence |
| 2 | Signe vital | Sophia pose question sur Énergie → user répond |
| 3 | Action exceeded | Sophia félicite + propose augmentation (PAS "tu l'as fait ?") |
| 4 | Réponse user | oui/non clair (pas ambigu) |
| 4b | Choix du jour (yes_with_days seulement) | Sophia demande quel jour → user répond |
| 5 | Confirmation/refus | Cohérent avec réponse + tool call |
| 6 | Action 2 (Lecture) | Sophia traite normalement |
| 7 | Clôture bilan | Message de fin, mode → companion |

### Red flags (échec immédiat)

- ❌ Sophia demande "tu l'as fait ?" pour Sport 30 min (action exceeded)
- ❌ Sophia confirme augmentation sans appel `increaseWeekTarget` réussi
- ❌ Sophia augmente alors que user a dit non
- ❌ Mode reste `investigator` après clôture
- ❌ Messages consécutifs du même rôle (user-user ou assistant-assistant)
- ❌ `**markdown**` dans les messages Sophia
- ❌ Sophia dit "bonjour" / "salut" en milieu de bilan

## 4. Note sur le nombre de turns

Avec le flow V4 (vital → offer exceeded direct → refus/accept → action 2 → clôture), un run propre peut se terminer en **4 turns exécutés** côté eval selon le grouping des messages.

- Attendu raisonnable: `turns_executed` entre **4 et 14**
- Alerte si `< 4`: bilan probablement non lancé ou interrompu trop tôt

