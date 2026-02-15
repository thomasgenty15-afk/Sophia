# Plan : Test Bilan Missed Streak + Breakdown Complet

## Contexte

Le test existant `bilan_missed_streak_breakdown_v3_ai_user.json` ne teste que la partie bilan (proposition de breakdown + consent). Il ne va **pas** au-delà du bilan.

Ce nouveau scénario teste le **flow complet** : bilan avec missed streak >= 5, proposition de breakdown, puis — si accepté — le deferred topic est repris après le bilan et la machine `breakdown_action` tourne via l'Architect.

## Dossier du test

```
frontend/eval/scenarios/bilan_missed_streak_breakdown/
├── scenario.json           ← Définition du scénario (2 variants: accept, decline)
├── checklist.md            ← Fiche de vérification (DB reset + post-run + transcript)
├── plan.md                 ← CE fichier
└── commands/
    ├── reset.mjs           ← Reset + validation standalone (peut être lancé indépendamment)
    └── run.sh              ← Commande complète : reset → test → post-run reset
```

## User dédié (slot 7)

| Champ       | Valeur |
|-------------|--------|
| Slot        | 7 |
| Email       | `user-bilan-missed-breakdown@sophia-test.local` |
| Password    | `SophiaEvalV4!007` |
| Full name   | `user-bilan-missed-breakdown` |
| Config file | `frontend/eval/config/eval_fixed_users_staging.json` |

À provisionner via `provision_eval_v2_users.mjs`.

## Setup commun

- **1 signe vital** : "Énergie" (/10, counter)
- **2 actions** :
  - "Méditation 10 min" : habit, `target_reps=5`, `current_reps=0`, streak missed = 5 jours
  - "Lecture 20 min" : habit, `target_reps=5`, `current_reps=3` (below, flow normal)
- **Action entries** : 5 entries "missed" pour "Méditation 10 min" (jours J-5 à J-1)
- **investigation_state** : seedé avec 3 items (1 vital + 2 actions), `status="checking"`, mode=`investigator`

### État DB attendu après reset

| Table | Contenu attendu |
|-------|-----------------|
| **user_actions** | 2 actions actives (Méditation 10 min, Lecture 20 min) |
| **user_vital_signs** | 1 signe vital actif (Énergie, /10, counter) |
| **user_chat_states** | mode=investigator, temp_memory={}, investigation_state seedé (3 items) |
| **chat_messages** | vide |
| **user_checkup_logs** | vide |
| **turn_summary_logs** | vide |
| **user_action_entries** | 5 rows (Méditation 10 min missed × 5 jours) |

### Détail actions

| Action | type | target_reps | current_reps | weekly_target_status |
|--------|------|-------------|--------------|----------------------|
| Méditation 10 min | habit | 5 | 0 | below |
| Lecture 20 min | habit | 5 | 3 | below |

## 2 Variants

### Variant `accept` (test post-bilan complet)

`setup.test_post_checkup_deferral: true` — le eval runner continue après la fin du bilan.

Flow attendu (~18-20 turns) :

```
1. User: trigger bilan ("On fait le point ?")
2. Sophia: question vital Énergie
3. User: répond 7/10
4. Sophia: question Méditation
5. User: pas fait
6. Sophia: pourquoi?
7. User: raison (manque de motivation)
8. Sophia: détecte streak>=5, propose breakdown APRÈS bilan
9. User: oui bonne idée
10. Sophia: continue bilan, action 2 Lecture
11. User: oui c'est fait
12. Sophia: clôture bilan
13. [deferred_topics_v2: breakdown_action stored]
14. Sophia: relaunch consent — tu veux qu'on en parle?
15. User: oui
16. Architect: breakdown_action machine démarre
17. Sophia: demande le blocage
18. User: explique le blocage
19. Sophia: propose micro-étape
20. User: accepte ajout au plan
```

### Variant `decline` (bilan seulement)

`test_post_checkup_deferral: false` — arrêt à la fin du bilan.

Flow attendu (~10-14 turns) :

```
1. User: trigger bilan
2. Sophia: question vital
3. User: répond
4. Sophia: question Méditation
5. User: pas fait
6. Sophia: pourquoi?
7. User: raison
8. Sophia: détecte streak>=5, propose breakdown
9. User: non merci, je préfère réessayer tel quel
10. Sophia: continue bilan, action 2
11. User: oui fait
12. Sophia: clôture bilan
```

## Commandes

```bash
# Reset seul (pour vérifier que la DB est propre)
cd frontend && \
SOPHIA_SUPABASE_URL="http://127.0.0.1:54321" \
SOPHIA_SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
node eval/scenarios/bilan_missed_streak_breakdown/commands/reset.mjs --variant accept

# Run complet variant accept (reset → test → post-run reset)
cd frontend && \
bash eval/scenarios/bilan_missed_streak_breakdown/commands/run.sh accept

# Run complet variant decline
cd frontend && \
bash eval/scenarios/bilan_missed_streak_breakdown/commands/run.sh decline 14
```

## Changements effectués

### 1. Nouveau variant dans simulate-user

**Fichier** : `supabase/functions/simulate-user/index.ts`

Ajouté un nouveau case `missed_streak_full_breakdown` dans `buildBilanV3StateMachineContext` qui étend le flow au-delà du bilan :

- **Stages 0-6** : bilan part (trigger → vital → action missed → accept breakdown offer → action 2 → bilan close)
- **Stage 7** : Sophia propose de revenir sur le sujet déféré (relaunch consent). User accepte.
- **Stage 8** : Architect demande le blocage. User explique.
- **Stage 9** : Attente / suivi si Sophia a besoin de clarifier.
- **Stage 10** : Sophia propose la micro-étape. User accepte ajout au plan.
- **Stage 11** : Flow terminé.

Le variant `decline` réutilise le case `missed_streak_decline` existant (pas besoin de nouveaux stages).

Ajouté aussi le stub `bilan_v3_missed_streak_full_breakdown` dans `stubNextMessage` pour le mode MEGA_TEST.

### 2. scenario.json

Le scenario.json définit :
- `id: "bilan-missed-streak-breakdown-V4"`
- `setup` commun (vital + 2 actions + 5 entries missed)
- `variants: [accept, decline]`
- Variant `accept` : `test_post_checkup_deferral: true`, `kind: "bilan_v3_missed_streak_full_breakdown"`, turns attendus ~20
- Variant `decline` : `test_post_checkup_deferral: false`, `kind: "bilan_v3_missed_streak_decline"`, turns attendus ~14

### 3. reset.mjs

Calqué sur `frontend/eval/scenarios/bilan_exceed_target/commands/reset.mjs` mais :
- Actions différentes : "Méditation 10 min" (missed streak) + "Lecture 20 min" (below)
- Action entries : 5 "missed" au lieu de 4 "completed"
- Le `seedInvestigationState` calcule `weekly_target_status: "below"` pour les deux actions (current < target)
- Pas de gestion de `scheduled_days` par variant (pas pertinent ici)
- Lecture du `user_id` depuis le fichier config (sera rempli après provisioning)

### 4. run.sh

Calqué sur `frontend/eval/scenarios/bilan_exceed_target/commands/run.sh` :
- `--slot 7`
- `--scenario bilan-missed-streak-breakdown-V4`
- Turns par défaut : 20 pour `accept`, 14 pour `decline` (auto-détecté)

### 5. checklist.md

Vérification :
- Reset : 3 pending_items, vital + 2 actions, 5 entries missed pour Méditation
- Post-run `accept` : breakdown_action machine complétée, micro-étape ajoutée au plan, `deferred_topics_v2` vide, mode `companion`
- Post-run `decline` : pas de breakdown, mode `companion`, pas de deferred topic
- Transcript : phases dans l'ordre, pas de "tu l'as fait ?" sur l'action missed (stream direct), alternance user/assistant

### 6. eval_fixed_users_staging.json

Ajouté slot 7 dans la liste des users.

### 7. plan.md

Ce document.

---

## Mécanisme clé : missed streak → breakdown → deferred topics

### Détection du missed streak

1. Quand l'investigator arrive à l'action "Méditation 10 min" et que le user dit "pas fait" (status = "missed")
2. `maybeHandleStreakAfterLog` dans `investigator/streaks.ts` calcule `getMissedStreakDays`
3. Si streak >= 5, il crée un `bilan_defer_offer` de kind `"breakdown"` dans `temp_memory`
4. L'investigator génère un message proposant de découper l'action en micro-étape APRÈS le bilan

### Stockage du consentement

5. Le user répond oui ou non
6. Le router dans `run.ts` détecte le signal `confirm_breakdown`
7. Si oui : `bilan_defer_consents.breakdown_action[action_id] = true` et `deferSignal` crée un topic dans `deferred_topics_v2`
8. Si non : `bilan_defer_consents.breakdown_action[action_id] = false`, pas de topic déféré

### Reprise après le bilan (variant `accept` uniquement)

9. Le bilan se termine, mode passe à `companion`
10. Le router détecte des `deferred_topics_v2` en attente
11. Sophia demande si le user veut revenir sur le sujet (relaunch consent)
12. Si oui : l'Architect lance la machine `breakdown_action`
13. La machine `breakdown_action` appelle la fonction `break-down-action` (Deno Edge Function) qui génère une micro-étape via LLM
14. La micro-étape est proposée au user et ajoutée au plan si acceptée

## Protocole de vérification

### Étape A : Vérification mécanique (run_evals_response.json)

1. `results[0].scenario_key` contient `bilan-missed-streak-breakdown-V4`
2. `results[0].issues_count === 0`
3. `results[0].bilan_completed === true`
4. `results[0].turns_executed >= 6`
5. `stopped_reason === null`

### Étape B : Vérification de l'investigation_state initial

1. `status === "checking"`
2. `pending_items` = 3 items (1 vital + 2 actions)
3. Méditation 10 min : `is_habit: true`, `weekly_target_status: "below"`, `target: 5`, `current: 0`
4. Lecture 20 min : `is_habit: true`, `weekly_target_status: "below"`, `target: 5`, `current: 3`

### Étape C : Vérification du transcript

#### Variant `accept` — phases attendues

| Phase | Description |
|-------|-------------|
| 1 | Déclenchement bilan |
| 2 | Signe vital Énergie |
| 3 | Action Méditation missed |
| 4 | Raison du miss |
| 5 | Proposition breakdown après bilan |
| 6 | Acceptation du breakdown |
| 7 | Action Lecture done |
| 8 | Clôture bilan |
| 9 | Relaunch consent (deferred topic) |
| 10 | Breakdown machine : blocage + micro-étape |
| 11 | Acceptation micro-étape + ajout plan |

#### Variant `decline` — phases attendues

| Phase | Description |
|-------|-------------|
| 1 | Déclenchement bilan |
| 2 | Signe vital Énergie |
| 3 | Action Méditation missed |
| 4 | Raison du miss |
| 5 | Proposition breakdown |
| 6 | Refus du breakdown |
| 7 | Action Lecture done |
| 8 | Clôture bilan |

### Red flags (échec immédiat)

- ❌ Sophia ne détecte pas le missed streak >= 5
- ❌ Sophia ne propose pas de breakdown / micro-étape
- ❌ Sophia démarre le breakdown pendant le bilan (au lieu de le différer)
- ❌ Sophia ne revient pas sur le sujet après le bilan (variant `accept`)
- ❌ Sophia lance le breakdown malgré le refus (variant `decline`)
- ❌ Messages consécutifs du même rôle
- ❌ `**markdown**` dans les messages Sophia


