# V2 Audit Strategy

## Statut

Document canonique de strategie d'audit pour la V2.

Ce document definit:

- les 9 guides d'audit prevus
- leur role et leur timing
- la structure standard d'un guide et d'un bundle
- les events V2 qui alimentent chaque audit
- le planning de creation

Il s'appuie sur:

- [v2-technical-schema.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md)
  — source de verite pour les events et types
- [v2-orchestration-rules.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-orchestration-rules.md)
  — regles de decision a auditer
- [v2-execution-playbook.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-execution-playbook.md)
  — timing d'implementation par lot
- [v2-mvp-scope.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-mvp-scope.md) —
  scope V2.0 vs V2.1

Les guides d'audit V1 existants servent de reference de qualite:

- [momentum-audit-analysis-guide.md](/Users/ahmedamara/Dev/Sophia%202/docs/momentum-audit-analysis-guide.md)
- [memory-audit-analysis-guide.md](/Users/ahmedamara/Dev/Sophia%202/docs/memory-audit-analysis-guide.md)
- [coaching-intervention-audit-analysis-guide.md](/Users/ahmedamara/Dev/Sophia%202/docs/coaching-intervention-audit-analysis-guide.md)

## 1. Les 9 guides d'audit V2

| # | Guide                       | Type    | Lot    | Systeme audite                                           |
| - | --------------------------- | ------- | ------ | -------------------------------------------------------- |
| 1 | Plan Generation V2 Audit    | Nouveau | Lot 3  | Structuration, cristallisation, generation, distribution |
| 2 | Plan Execution V2 Audit     | Nouveau | Lot 5  | Lifecycle des items, unlock logic, statuts, zombies      |
| 3 | Momentum V2 Audit           | Refonte | Lot 6A | 6 dimensions, active_load, plan_fit, posture             |
| 4 | Memory V2 Audit             | Refonte | Lot 6B | 6 couches, retrieval par intention, tagging, handoff     |
| 5 | Daily/Weekly V2 Audit       | Nouveau | Lot 6B | Modes daily, decisions weekly, ajustements, outcomes     |
| 6 | Conversation Pulse V2 Audit | Nouveau | Lot 6B | Generation, freshness, usage downstream                  |
| 7 | Coaching V2 Audit           | Refonte | Lot 6C | Dimension-aware, micro/structural, technique lifecycle   |
| 8 | Proactive V2 Audit          | Nouveau | Lot 6C | skip_or_speak, postures, cooldowns, budget               |
| 9 | LLM Cost Audit              | Nouveau | Lot 7  | Cout reel par user, tiers, derive, redondances           |

Les guides sont dans `docs/audit-v2/`.

Guides deja materialises a ce jour:

- [momentum-v2-audit-guide.md](/Users/ahmedamara/Dev/Sophia%202/docs/audit-v2/momentum-v2-audit-guide.md)
- [memory-v2-audit-guide.md](/Users/ahmedamara/Dev/Sophia%202/docs/audit-v2/memory-v2-audit-guide.md)
- [conversation-pulse-v2-audit-guide.md](/Users/ahmedamara/Dev/Sophia%202/docs/audit-v2/conversation-pulse-v2-audit-guide.md)
- [coaching-v2-audit-guide.md](/Users/ahmedamara/Dev/Sophia%202/docs/audit-v2/coaching-v2-audit-guide.md)
- [proactive-v2-audit-guide.md](/Users/ahmedamara/Dev/Sophia%202/docs/audit-v2/proactive-v2-audit-guide.md)
- [llm-cost-v2-audit-guide.md](/Users/ahmedamara/Dev/Sophia%202/docs/audit-v2/llm-cost-v2-audit-guide.md)

Scripts d'export deja en place:

- `npm run momentum-v2:audit:export -- --user-id <uuid> --hours <N> --scope <scope>`
- `npm run memory-v2:audit:export -- --user-id <uuid> --hours <N> --scope <scope>`
- `npm run pulse-v2:audit:export -- --user-id <uuid> --hours <N> --scope <scope>`
- `npm run coaching-v2:audit:export -- --user-id <uuid> --hours <N> --scope <scope>`
- `npm run proactive-v2:audit:export -- --user-id <uuid> --hours <N>`
- `npm run llm-cost:audit:export -- --user-id <uuid> --hours <N>` (ou
  `--all-users`)

## 2. Structure standard d'un guide V2

Chaque guide suit la meme structure, heritee des guides V1:

### 2.1 Objectif

Quoi auditer, pourquoi, quelles questions le bundle doit permettre de repondre.

### 2.2 Ce que le bundle contient

- JSON principal (trace + scorecard + annotations)
- Transcript texte

### 2.3 Structure du JSON

#### `trace`

Le coeur du bundle. Contient:

- `window` (fenetre temporelle)
- `summary` (volumes globaux)
- `messages` (messages bruts)
- `turns` (tours reconstruits avec chaines de decision)
- sections specifiques au systeme audite (ex: `state_timeline` pour momentum,
  `selector_runs` pour coaching, etc.)
- `unassigned_events`

#### `scorecard`

Vue agregee pour aller vite:

- `coverage` (volume exploitable)
- metriques specifiques au systeme
- `alerts` (patterns a investiguer)

#### `annotations`

Jugements humains optionnels:

- par dimension
- par label (`good`, `partial`, `miss`, `harmful`)

### 2.4 Methode d'audit

Ordre de lecture recommande:

1. Transcript (sentir la dynamique)
2. Scorecard (reperer les zones faibles)
3. Trace.turns (zoomer sur les moments critiques)
4. Trace.sections_specifiques (comprendre la mecanique)
5. Synthese

### 2.5 Checklist de verification

Liste de questions oui/non specifiques au systeme. Chaque guide a sa propre
checklist.

### 2.6 Patterns de bugs frequents

Les erreurs recurrentes a surveiller en priorite. Specifiques au systeme.

### 2.7 Leviers de tuning

Quand un pattern revient, quoi ajuster. Specifiques au systeme.

### 2.8 Commande d'export

La commande CLI pour generer le bundle. Format:

```bash
npm run <system>:audit:export -- --user-id <uuid> --hours <N> --scope <scope>
```

## 3. Structure standard d'un bundle V2

### 3.1 Adaptations par rapport aux bundles V1

Les bundles V2 suivent le meme format (JSON + transcript) mais avec ces
differences:

- les traces lisent `plan_items` au lieu de
  `user_actions / user_framework_tracking`
- les dimensions momentum sont les 6 dimensions V2 (engagement,
  execution_traction, emotional_load, consent, plan_fit, load_balance)
- les decisions weekly sont `hold / expand / consolidate / reduce` au lieu de
  `activate / deactivate / swap`
- les interventions coaching sont taggees par `dimension + kind` (mission vs
  habit vs support)
- le retrieval memoire est tague par `intent` et `layers`
- les morning nudges ont 7 postures au lieu d'une logique binaire
- les entries d'items remplacent les entries d'actions/frameworks

### 3.2 Haut niveau d'un bundle V2

```ts
type V2AuditBundle = {
  ok: boolean;
  exported_at: string;
  source: {
    supabase_url: string;
    connection_type: "local" | "env";
  };
  request: {
    user_id: string;
    scope: string;
    from: string;
    to: string;
  };
  trace: Record<string, unknown>;
  scorecard: Record<string, unknown>;
  annotations: unknown[];
};
```

## 4. Events V2 qui alimentent les audits

### 4.1 Mapping event → guide

Note importante pour le Lot 6C:

- Le technical-schema reference des event types V2 cibles pour
  coaching/proactive.
- En pratique, les bundles d'audit 6C actuellement livres s'appuient sur les
  endpoints canoniques de trace/scorecard deja en production
  (`get-coaching-intervention-trace`, `get-coaching-intervention-scorecard`,
  `get-momentum-trace`, `get-momentum-scorecard`) et sur les
  `scheduled_checkins` reels.
- Les guides 7 et 8 ne doivent donc pas supposer aujourd'hui l'existence d'un
  rail complet de snapshots `coaching_*_v2` ou `morning_nudge_generated_v2` emis
  a chaque tour.

| Event                                 | Guide(s) qui l'utilise(nt)                  |
| ------------------------------------- | ------------------------------------------- |
| `cycle_created_v2`                    | Plan Generation                             |
| `cycle_structured_v2`                 | Plan Generation                             |
| `plan_generated_v2`                   | Plan Generation                             |
| `plan_activated_v2`                   | Plan Generation, Plan Execution             |
| `transformation_activated_v2`         | Plan Execution                              |
| `transformation_completed_v2`         | Plan Execution                              |
| `momentum_state_updated_v2`           | Momentum, Daily/Weekly, Proactive           |
| `active_load_recomputed_v2`           | Momentum, Daily/Weekly                      |
| `conversation_pulse_generated_v2`     | Conversation Pulse, Daily/Weekly, Proactive |
| `daily_bilan_decided_v2`              | Daily/Weekly                                |
| `daily_bilan_completed_v2`            | Daily/Weekly                                |
| `weekly_bilan_decided_v2`             | Daily/Weekly                                |
| `weekly_bilan_completed_v2`           | Daily/Weekly                                |
| `memory_retrieval_executed_v2`        | Memory                                      |
| `memory_persisted_v2`                 | Memory                                      |
| `memory_handoff_v2`                   | Memory                                      |
| `coaching_blocker_detected_v2`        | Coaching                                    |
| `coaching_intervention_proposed_v2`   | Coaching                                    |
| `coaching_intervention_rendered_v2`   | Coaching                                    |
| `coaching_follow_up_captured_v2`      | Coaching                                    |
| `coaching_technique_deprioritized_v2` | Coaching                                    |
| `proactive_window_decided_v2`         | Proactive                                   |
| `morning_nudge_generated_v2`          | Proactive                                   |
| `rendez_vous_state_changed_v2`        | Proactive                                   |
| `repair_mode_entered_v2`              | Momentum, Proactive                         |
| `repair_mode_exited_v2`               | Momentum, Proactive                         |

### 4.2 Events qui alimentent le LLM Cost Audit

Le LLM Cost Audit ne repose pas sur des events specifiques mais sur:

- `llm_usage_events` (table existante)
- aggregation par user, par jour, par tier, par fonction appelante

## 5. Planning de creation

| Lot    | Guide a creer               | Pre-requis                                                   |
| ------ | --------------------------- | ------------------------------------------------------------ |
| Lot 3  | Plan Generation V2 Audit    | Prompts de structuration/cristallisation/generation operants |
| Lot 5  | Plan Execution V2 Audit     | Dashboard V2 operant, plan_items distribues                  |
| Lot 6A | Momentum V2 Audit           | active_load + momentum V2 classifier operants                |
| Lot 6B | Memory V2 Audit             | Retrieval par intention operant                              |
| Lot 6B | Daily/Weekly V2 Audit       | Daily + weekly V2 operants                                   |
| Lot 6B | Conversation Pulse V2 Audit | conversation_pulse builder operant                           |
| Lot 6C | Coaching V2 Audit           | Coaching dimension-aware operant                             |
| Lot 6C | Proactive V2 Audit          | Morning nudge V2 operant                                     |
| Lot 7  | LLM Cost Audit              | Tous les systemes V2 operants                                |

### Regle

Chaque guide est cree au moment ou le systeme est implemente, pas avant
(speculation) et pas apres (oubli). C'est une etape finale de chaque lot.

## 6. Workflow d'audit en production

Une fois les guides en place, le workflow d'audit recommande est:

1. Exporter le bundle pour un user et une fenetre
2. Lire le transcript
3. Consulter la scorecard
4. Zoomer sur les tours problematiques
5. Croiser avec les events
6. Identifier les patterns recurrents
7. Proposer des ajustements precis
8. Verifier l'amelioration sur la fenetre suivante

### Frequence recommandee

- audit ponctuel: quand un probleme est signale
- audit hebdomadaire: 1 user representatif, 7 jours, tous les systemes
- audit de release: apres chaque lot, 2-3 users, verification des nouveaux
  systemes
