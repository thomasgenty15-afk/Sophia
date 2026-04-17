# Plan Execution V2 Audit Guide

STATUT: complet — Lot 5

Structure standard: voir [v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)

## 1. Objectif

Auditer le lifecycle des `user_plan_items` en execution reelle, de bout en bout:

```
plan distribue → items actifs → entries utilisateur → transitions de statut
→ debloquage conditionnel → ajustements weekly → completion / stall
```

Ce guide permet de repondre a:

- Les items passent-ils dans les bons statuts (`pending → active → completed / stalled`) ?
- Les `activation_condition` se declenchent-elles correctement quand les preconditions sont remplies ?
- Le graphe de debloquage fonctionne-t-il (item complete → item suivant active) ?
- Y a-t-il des items "zombies" (actifs depuis trop longtemps sans entry) ?
- Les habitudes passent-elles en `in_maintenance` au bon moment (regle 3/5) ?
- Les supports `recommended_now` sont-ils remplaces quand ils ne servent plus ?
- Le weekly ajuste-t-il correctement les items (activate / deactivate / maintenance) ?
- La charge active respecte-t-elle les caps canoniques ?
- Les entries sont-elles correctement enregistrees (entry_kind, difficulty_level, blocker_hint) ?
- La North Star evolue-t-elle au fil du cycle ?

## 2. Le lifecycle reel des plan_items

### 2.1 Statuts canoniques (`PlanItemStatus`)

| Statut | Signification |
|--------|---------------|
| `pending` | En attente — sa condition de debloquage n'est pas encore remplie |
| `active` | En cours d'execution |
| `in_maintenance` | Habitude suffisamment ancree, pression reduite |
| `completed` | Termine avec succes |
| `deactivated` | Retire du plan actif (decision weekly ou coaching) |
| `cancelled` | Annule definitivement |
| `stalled` | N'avance plus — a reevaluer, alleger ou remplacer |

### 2.2 Transitions de statut attendues

```
pending → active            (activation_condition remplie ou ajustement weekly)
active → completed          (task/milestone terminee, habit target atteint)
active → in_maintenance     (habitude: regle 3/5 reussites atteinte)
active → stalled            (pas d'entry pendant trop longtemps, friction repetee)
active → deactivated        (decision weekly/coaching: reduire la charge)
active → cancelled          (decision utilisateur ou systeme)
in_maintenance → active     (regression detectee — l'habitude a besoin de focus)
in_maintenance → stalled    (abandon progressif detecte)
stalled → active            (relance apres coaching ou reevaluation)
stalled → deactivated       (trop longtemps stalled, pas de signal de reprise)
deactivated → active        (reactivation par weekly: la charge le permet)
```

### 2.3 Mecaniques de debloquage

Les items `pending` se debloquent via leur `activation_condition`. Types valides:

| Type | Condition |
|------|-----------|
| `immediate` (ou `null`) | Actif des la distribution |
| `after_item_completion` | Se debloque quand l'item reference dans `depends_on` passe a `completed` |
| `after_habit_traction` | Se debloque quand l'habitude referencee dans `depends_on` atteint la traction cible (ex: 3/5) |
| `after_milestone` | Se debloque quand un milestone specifique est atteint |

`depends_on` contient un ou plusieurs UUIDs d'items (resolus depuis les `temp_id` lors de la distribution).

### 2.4 Regle d'ancrage des habitudes (3/5)

Une habitude est consideree suffisamment ancree pour passer en `in_maintenance` quand:

- **3 reussites sur les 5 derniers jours** (pour les habitudes quotidiennes)
- **3 reussites sur les 5 dernieres occurrences planifiees** (pour les habitudes avec `scheduled_days`)

Ce n'est pas un streak: 3 jours non consecutifs sur 5 comptent. L'objectif est de mesurer la traction reelle, pas la perfection.

### 2.5 Detection des items zombies

Un item est considere "zombie" quand:

- `status = active`
- aucune entry (`user_plan_item_entries`) depuis plus de **7 jours**
- pas de `skip` explicite

Les items zombies doivent etre detectes par le momentum engine et/ou le weekly bilan pour decision: `stall`, `deactivate`, ou `reduce`.

### 2.6 Caps de charge active

Le plan V2 respecte des caps de charge canoniques:

| Dimension | Cap |
|-----------|-----|
| Missions actives | max 1 principale + 1 secondaire |
| Habitudes en construction (`active_building`) | max 2 simultanees |
| Supports `recommended_now` | max 1-2 |

Les depassements de caps sont un signal d'alarme a l'audit.

### 2.7 Entries d'execution (`user_plan_item_entries`)

Chaque interaction d'execution produit une entry:

| `entry_kind` | Signification |
|--------------|---------------|
| `checkin` | Check-in normal (daily bilan, in-app) |
| `progress` | Avancee sur une mission ou milestone |
| `skip` | L'utilisateur a explicitement saute |
| `partial` | Execution partielle |
| `blocker` | Blocage signale |
| `support_feedback` | Feedback sur un support |

Champs critiques:
- `difficulty_level` (`low`, `medium`, `high`) — qualite du signal de friction
- `blocker_hint` — texte libre quand l'utilisateur signale un blocage
- `effective_at` — quand l'action a ete faite (peut differer de `created_at`)

## 3. Ce que le bundle contient

### 3.1 `trace`

Le coeur du bundle. Reconstitue la timeline d'execution du plan:

```json
{
  "trace": {
    "window": {
      "from": "2026-03-01T00:00:00Z",
      "to": "2026-03-15T00:00:00Z",
      "hours": 336
    },
    "plan": {
      "id": "...",
      "status": "active",
      "version": 1,
      "generation_attempts": 1,
      "created_at": "...",
      "activated_at": "..."
    },
    "cycle": {
      "id": "...",
      "status": "active",
      "duration_months": 2
    },
    "transformation": {
      "id": "...",
      "title": "...",
      "status": "active"
    },
    "plan_items_snapshot": [
      {
        "id": "...",
        "dimension": "habits",
        "kind": "habit",
        "title": "...",
        "status": "active",
        "current_habit_state": "active_building",
        "activation_order": 1,
        "activation_condition": null,
        "target_reps": 5,
        "current_reps": 3,
        "support_mode": null,
        "support_function": null,
        "activated_at": "...",
        "completed_at": null,
        "last_entry_at": "2026-03-14T18:00:00Z",
        "entry_count_in_window": 8,
        "recent_entries": []
      }
    ],
    "status_transitions": [
      {
        "item_id": "...",
        "item_title": "...",
        "from_status": "pending",
        "to_status": "active",
        "at": "2026-03-05T10:00:00Z",
        "trigger": "activation_condition_met"
      }
    ],
    "unlock_events": [
      {
        "unlocked_item_id": "...",
        "unlocked_item_title": "...",
        "condition_type": "after_item_completion",
        "depends_on_item_id": "...",
        "depends_on_item_title": "...",
        "at": "2026-03-05T10:00:00Z"
      }
    ],
    "entries_timeline": [
      {
        "id": "...",
        "plan_item_id": "...",
        "item_title": "...",
        "entry_kind": "checkin",
        "outcome": "done",
        "difficulty_level": "low",
        "blocker_hint": null,
        "effective_at": "2026-03-14T18:00:00Z",
        "created_at": "2026-03-14T18:05:00Z"
      }
    ],
    "weekly_adjustments": [
      {
        "week_start": "2026-03-10",
        "decision": "expand",
        "items_activated": ["..."],
        "items_deactivated": [],
        "items_to_maintenance": [],
        "at": "2026-03-10T08:00:00Z"
      }
    ],
    "zombie_candidates": [
      {
        "item_id": "...",
        "item_title": "...",
        "dimension": "missions",
        "kind": "task",
        "status": "active",
        "last_entry_at": "2026-03-02T12:00:00Z",
        "days_since_last_entry": 12
      }
    ],
    "load_timeline": [
      {
        "at": "2026-03-01T00:00:00Z",
        "missions_active": 1,
        "habits_building": 2,
        "support_recommended_now": 1,
        "total_active": 4
      }
    ],
    "metrics_snapshot": {
      "north_star": {
        "title": "...",
        "unit": "...",
        "current_value": "12",
        "target_value": "20",
        "status": "active"
      },
      "progress_markers": []
    },
    "events": []
  }
}
```

### 3.2 `scorecard`

Vue agregee pour aller vite:

```json
{
  "scorecard": {
    "plan_id": "...",
    "plan_status": "active",
    "window_hours": 336,
    "items_total": 12,
    "items_by_dimension": {
      "support": { "pending": 1, "active": 2, "completed": 1 },
      "missions": { "pending": 2, "active": 1, "completed": 2 },
      "habits": { "active": 2, "in_maintenance": 1 }
    },
    "items_by_status": {
      "pending": 3,
      "active": 5,
      "in_maintenance": 1,
      "completed": 3,
      "deactivated": 0,
      "cancelled": 0,
      "stalled": 0
    },
    "completion_rate": 0.25,
    "average_time_to_complete_days": {
      "task": 4.5,
      "milestone": 8.0,
      "habit": null,
      "framework": 3.0,
      "exercise": 2.0
    },
    "unlock_trigger_rate": 0.67,
    "unlocks_triggered": 4,
    "unlocks_potential": 6,
    "zombie_count": 1,
    "zombie_items": ["..."],
    "weekly_adjustment_count": 2,
    "load_current": {
      "missions_active": 1,
      "habits_building": 2,
      "support_recommended_now": 1,
      "total_active": 4
    },
    "load_caps_exceeded": false,
    "habit_anchoring_rate": 0.33,
    "habits_in_maintenance": 1,
    "habits_total": 3,
    "support_effectiveness": {
      "recommended_now_used": 1,
      "recommended_now_ignored": 0,
      "always_available_used": 2,
      "rescue_used": 0
    },
    "entries_total": 42,
    "entries_with_difficulty": 38,
    "entries_with_blocker_hint": 3,
    "north_star_progress": {
      "current": "12",
      "target": "20",
      "percent": 60
    },
    "alerts": []
  }
}
```

### 3.3 `annotations`

Jugements humains optionnels:

```json
{
  "annotations": [
    {
      "target": "unlock_logic",
      "label": "good",
      "note": "les dependances se resolvent correctement"
    },
    {
      "target": "habit_anchoring",
      "label": "partial",
      "note": "habitude 2 aurait du passer en maintenance plus tot"
    }
  ]
}
```

Labels possibles: `good`, `partial`, `miss`, `harmful`

## 4. Methode d'audit

Ordre de lecture recommande:

1. **Scorecard**: reperer les zones faibles (zombies, caps depasses, faible taux de deblocage)
2. **Load timeline**: la charge est-elle stable, en croissance saine, ou en surcharge ?
3. **Status transitions**: les items changent-ils de statut au bon moment ?
4. **Unlock events**: les deblocages se produisent-ils quand les conditions sont remplies ?
5. **Entries timeline**: les entries capturent-elles de la preuve reelle (difficulty, blockers) ?
6. **Zombie candidates**: des items oublies trainent-ils en `active` sans signal ?
7. **Weekly adjustments**: le weekly prend-il les bonnes decisions ? (expand quand il le faut, reduce quand surcharge)
8. **Metrics**: la North Star evolue-t-elle ? Les progress markers bougent-ils ?
9. **Synthese**: formuler un jugement global

## 5. Checklist de verification

### Transitions de statut

- [ ] Les items `pending` se debloquent-ils quand leur `activation_condition` est remplie ?
- [ ] Les items `completed` ne redeviennent jamais `active` sans event explicite ?
- [ ] Les items `deactivated` ne produisent plus d'entries ?
- [ ] Les items `cancelled` sont definitivement inertes ?
- [ ] Il n'y a pas d'items restes `pending` alors que leur condition est remplie depuis > 24h ?

### Habitudes

- [ ] Les habitudes en `active_building` passent en `in_maintenance` apres 3/5 reussites ?
- [ ] La regle 3/5 utilise bien les `scheduled_days` pour les habitudes non quotidiennes ?
- [ ] `current_habit_state` evolue correctement (`active_building → in_maintenance`) ?
- [ ] Les habitudes `stalled` sont detectees (pas d'entry positive depuis > 7 jours) ?

### Charge active

- [ ] La charge active ne depasse pas les caps (max 1+1 missions, max 2 habits building, max 1-2 supports recommended_now) ?
- [ ] Si les caps sont depasses, un ajustement weekly les corrige au cycle suivant ?

### Entries

- [ ] Les entries ont un `difficulty_level` renseigne (au moins sur les checkins) ?
- [ ] Les `blocker_hint` sont remontes quand il y a friction (`difficulty_level = high`) ?
- [ ] Les entries ne sont pas enregistrees sur des items `cancelled` ou `deactivated` ?
- [ ] `effective_at` est coherent (pas dans le futur, pas a plus de 48h de `created_at`) ?

### Weekly

- [ ] Le weekly materialise correctement ses ajustements (activate, deactivate, maintenance) ?
- [ ] Le weekly ne fait pas `expand` quand `needs_reduce = true` (surcharge detectee) ?
- [ ] Le weekly detecte les items zombies et agit (stall ou deactivate) ?

### Supports

- [ ] Les supports `recommended_now` sont remplaces quand ils ont ete utilises/completes ?
- [ ] Les supports `always_available` ne bloquent rien (pas de dependance sur eux) ?
- [ ] Les supports `unlockable` se debloquent au bon moment ?
- [ ] Au moins un support `rescue` reste toujours accessible ?

### Metrics

- [ ] La North Star evolue au fil du cycle (progression visible) ?
- [ ] Les progress markers sont mis a jour quand les milestones sont atteints ?

## 6. Patterns de bugs a surveiller

### Deblocage

- **Item fantome bloquant**: item en `pending` dont la `depends_on` reference un item qui n'existe plus ou qui est `cancelled`
- **Double deblocage**: item active deux fois (doublon d'event)
- **Deblocage en cascade non tronque**: une completion declenche 5 deblocages d'un coup sans respecter les caps de charge

### Habitudes

- **Habitude eternellement `active_building`**: bonne traction mais jamais passee en `in_maintenance` (regle 3/5 non appliquee)
- **Habitude `in_maintenance` sans traction**: passee en maintenance trop tot ou regression non detectee
- **`current_habit_state` desynchronise**: valeur en base qui ne correspond pas a l'etat reel

### Charge

- **Surcharge silencieuse**: caps depasses sans ajustement weekly
- **Weekly `expand` en surcharge**: le weekly active un item supplementaire alors que la charge est deja au cap
- **Items zombies non detectes**: actifs depuis 10+ jours sans entry ni stall

### Entries

- **Entries sur item inerte**: entry enregistree sur un item `cancelled` ou `deactivated`
- **Entries sans contexte**: ni `difficulty_level`, ni `blocker_hint`, ni `value_numeric` — signal perdu
- **Entries backdatees incoherentes**: `effective_at` a plus de 48h de `created_at`

### Metrics

- **North Star figee**: `current_value` ne bouge pas malgre l'execution
- **Progress markers orphelins**: markers qui ne correspondent a aucun milestone actif

## 7. Leviers de tuning

| Pattern detecte | Levier | Fichier/config |
|-----------------|--------|----------------|
| Habitudes qui ne passent pas en maintenance | Ajuster le seuil 3/5 (ex: 2/4) | Runtime momentum / active_load |
| Trop de zombies | Reduire le delai de detection (7j → 5j) | Watcher / momentum engine |
| Caps de charge depasses | Resserrer les caps dans les decisions weekly | Weekly bilan engine |
| Deblocages en cascade | Limiter le nombre de deblocages par cycle weekly | Distribution / weekly engine |
| Weekly trop conservateur (jamais expand) | Assouplir les conditions d'expand | Weekly bilan engine |
| Weekly trop agressif (expand en surcharge) | Ajouter un gate `load_balance < threshold` | Weekly bilan engine |
| Entries sans difficulty_level | Rendre le champ obligatoire dans le daily bilan | Daily bilan engine |
| Supports ignores | Reduire le nombre de recommended_now ou mieux cibler | Plan generation prompt |
| North Star figee | Connecter les entries aux metrics (auto-increment) | Dashboard / metric updater |

## 8. Commande d'export

```bash
npm run plan-exec:audit:export -- --user-id <uuid> --plan-id <uuid> --hours <N>
```

Options:

| Option | Description |
|--------|-------------|
| `--user-id <uuid>` | Requis. UUID de l'utilisateur |
| `--plan-id <uuid>` | Requis. UUID du plan a auditer |
| `--hours <N>` | Optionnel. Fenetre temporelle en heures (defaut: 336 = 14 jours) |
| `--out <path>` | Chemin du fichier JSON de sortie (defaut: `tmp/`) |
| `--help` | Affiche l'aide |

Le script:

1. Se connecte a Supabase (local via `supabase status` ou via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en env)
2. Charge le plan (`user_plans_v2`) et le cycle/transformation associes
3. Charge tous les `user_plan_items` du plan
4. Charge toutes les `user_plan_item_entries` du plan sur la fenetre
5. Charge les `user_metrics` (north star + progress markers) du cycle
6. Charge les events V2 pertinents depuis `system_runtime_snapshots`
7. Reconstitue les status transitions a partir des entries et des `activated_at/completed_at`
8. Detecte les unlock events en croisant `activation_condition` et les transitions
9. Detecte les items zombies (actifs sans entry > 7 jours)
10. Calcule la load timeline (charge active a chaque point de changement)
11. Ecrit le bundle JSON dans `tmp/`

Script: `scripts/export_plan_execution_audit_bundle.mjs`

## 9. Construction manuelle du bundle (sans script)

Si le script n'est pas utilisable, voici les requetes SQL pour reconstituer le bundle:

```sql
-- 1. Plan
SELECT * FROM user_plans_v2 WHERE id = '<plan_id>';

-- 2. Cycle + Transformation
SELECT * FROM user_cycles WHERE id = (SELECT cycle_id FROM user_plans_v2 WHERE id = '<plan_id>');
SELECT * FROM user_transformations WHERE id = (SELECT transformation_id FROM user_plans_v2 WHERE id = '<plan_id>');

-- 3. Plan items (snapshot)
SELECT *,
  (SELECT MAX(created_at) FROM user_plan_item_entries WHERE plan_item_id = upi.id) AS last_entry_at,
  (SELECT COUNT(*) FROM user_plan_item_entries WHERE plan_item_id = upi.id AND created_at > NOW() - INTERVAL '14 days') AS entry_count_in_window
FROM user_plan_items upi
WHERE plan_id = '<plan_id>'
ORDER BY activation_order ASC NULLS LAST;

-- 4. Entries sur la fenetre
SELECT e.*, upi.title AS item_title, upi.dimension, upi.kind
FROM user_plan_item_entries e
JOIN user_plan_items upi ON upi.id = e.plan_item_id
WHERE e.plan_id = '<plan_id>'
  AND e.created_at > NOW() - INTERVAL '14 days'
ORDER BY e.effective_at ASC;

-- 5. Zombie candidates (actifs sans entry > 7 jours)
SELECT upi.id, upi.title, upi.dimension, upi.kind, upi.status,
  (SELECT MAX(created_at) FROM user_plan_item_entries WHERE plan_item_id = upi.id) AS last_entry_at,
  EXTRACT(DAY FROM NOW() - (SELECT MAX(created_at) FROM user_plan_item_entries WHERE plan_item_id = upi.id)) AS days_since
FROM user_plan_items upi
WHERE upi.plan_id = '<plan_id>'
  AND upi.status = 'active'
  AND (SELECT MAX(created_at) FROM user_plan_item_entries WHERE plan_item_id = upi.id) < NOW() - INTERVAL '7 days'
     OR NOT EXISTS (SELECT 1 FROM user_plan_item_entries WHERE plan_item_id = upi.id);

-- 6. Metrics
SELECT * FROM user_metrics
WHERE cycle_id = (SELECT cycle_id FROM user_plans_v2 WHERE id = '<plan_id>')
ORDER BY scope, kind;

-- 7. Events pertinents
SELECT * FROM system_runtime_snapshots
WHERE user_id = '<user_id>'
  AND cycle_id = (SELECT cycle_id FROM user_plans_v2 WHERE id = '<plan_id>')
  AND snapshot_type IN (
    'plan_activated_v2', 'transformation_activated_v2', 'transformation_completed_v2',
    'weekly_bilan_completed_v2', 'daily_bilan_completed_v2',
    'active_load_recomputed_v2', 'momentum_state_updated_v2'
  )
  AND created_at > NOW() - INTERVAL '14 days'
ORDER BY created_at;
```
