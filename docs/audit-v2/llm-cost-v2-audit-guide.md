# LLM Cost V2 Audit Guide

STATUT: complet

Structure standard: voir
[v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)

## Objectif

Auditer le cout reel du systeme LLM V2: cout par user par jour, repartition par
tier, appels redondants, derive temporelle, et conformite avec le budget defini
dans v2-technical-schema.md section 10.

## Questions d'audit cles

- Quel est le cout LLM reel par user actif par jour ?
- La repartition par tier (1/2/3) correspond-elle a ce qui etait prevu ?
- Y a-t-il des appels redondants (pulse regenere alors qu'il est frais, momentum
  recalcule trop souvent) ?
- Le cout augmente-t-il au fil du temps pour un meme user (derive) ?
- Les appels Tier 3 utilisent-ils bien des modeles rapides/cheap ?
- Les appels Tier 1 sont-ils rares (1-3 par cycle) ?
- Les fallbacks (pulse echoue → conserver le dernier valide) fonctionnent-ils ?
- Le conversation_pulse est-il le poste le plus cher de la V2 ? Si oui, est-il
  justifie ?

## Appels LLM reels du systeme V2

### Tier 1 — critique (onboarding, rare)

| Source tag          | Fonction                              | Fichier                                         | Modele attendu                          |
| ------------------- | ------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| `analyze-intake-v2` | Structuration des aspects utilisateur | `supabase/functions/analyze-intake-v2/index.ts` | Modele performant (env GLOBAL_AI_MODEL) |
| `crystallize-v2`    | Cristallisation des transformations   | `supabase/functions/crystallize-v2/index.ts`    | Modele performant                       |
| `generate-plan-v2`  | Generation du plan complet            | `supabase/functions/generate-plan-v2/index.ts`  | Modele performant                       |

Frequence attendue: 1-3 appels par cycle complet (onboarding).

### Tier 2 — recurrent (quotidien/hebdomadaire)

| Source tag                   | Fonction                      | Fichier                                                         | Modele attendu |
| ---------------------------- | ----------------------------- | --------------------------------------------------------------- | -------------- |
| `generate-questionnaire-v2`  | Questionnaire sur mesure      | `supabase/functions/generate-questionnaire-v2/index.ts`         | Intermediaire  |
| `conversation_pulse_builder` | Generation conversation_pulse | `supabase/functions/sophia-brain/conversation_pulse_builder.ts` | Intermediaire  |

Frequence attendue: max 1x/jour pour pulse.

### Tier 3 — routine (rapide/cheap)

| Source tag                                    | Fonction                              | Fichier                                                               | Modele attendu               |
| --------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- | ---------------------------- |
| `sophia-brain:dispatcher-v2-contextual`       | Routing / classification contextuelle | `supabase/functions/sophia-brain/router/dispatcher.ts`                | Flash (budget thinking 1024) |
| `sophia-brain:companion`                      | Generation reponse conversationnelle  | `supabase/functions/sophia-brain/agents/companion.ts`                 | Flash (budget thinking 3000) |
| `sophia-brain:sentry`                         | Sentry check rapide                   | `supabase/functions/sophia-brain/agents/sentry.ts`                    | Flash                        |
| `sophia-brain:synthesizer`                    | Synthese conversationnelle            | `supabase/functions/sophia-brain/agents/synthesizer.ts`               | Flash                        |
| `sophia-brain:coaching-intervention-selector` | Micro-selection coaching              | `supabase/functions/sophia-brain/coaching_intervention_selector.ts`   | Flash                        |
| `sophia-brain:coaching-intervention-followup` | Tracking follow-up                    | `supabase/functions/sophia-brain/coaching_intervention_tracking.ts`   | Flash                        |
| `process_checkins:momentum_morning_nudge`     | Posture morning nudge                 | `supabase/functions/process-checkins/index.ts`                        | Flash                        |
| `schedule_morning_nudge_v2`                   | Morning nudge scheduler               | `supabase/functions/schedule-morning-active-action-checkins/index.ts` | Flash                        |
| `sophia-brain:router_emergency`               | Emergency handler                     | `supabase/functions/sophia-brain/router/emergency.ts`                 | Flash                        |
| `sophia-brain:state-manager`                  | State management                      | `supabase/functions/sophia-brain/state-manager.ts`                    | Flash                        |
| `trigger-watcher-batch`                       | Watcher analysis                      | `supabase/functions/sophia-brain/agents/watcher.ts`                   | Flash                        |

Frequence attendue: potentiellement a chaque message (dispatcher, companion) ou
quotidien (nudge, watcher).

### Transverse — memoire (toutes frequences)

| Source tag                              | Fonction                               | Fichier            |
| --------------------------------------- | -------------------------------------- | ------------------ |
| `sophia-brain:memory_extraction`        | Extraction memoire depuis conversation | `topic_memory.ts`  |
| `sophia-brain:memory_validation`        | Validation memoire                     | `topic_memory.ts`  |
| `sophia-brain:topic_persist_gate`       | Gate de persistance                    | `topic_memory.ts`  |
| `sophia-brain:topic_compaction`         | Compaction memoire                     | `topic_memory.ts`  |
| `sophia-brain:topic_enrichment`         | Enrichissement memoire                 | `topic_memory.ts`  |
| `sophia-brain:topic_initial_synthesis`  | Synthese initiale                      | `topic_memory.ts`  |
| `sophia-brain:topic_auto_merge`         | Auto-merge memoire                     | `topic_memory.ts`  |
| `sophia-brain:global_memory_compaction` | Compaction memoire globale             | `global_memory.ts` |
| `sophia-brain:event_memory_upsert`      | Upsert memoire evenement               | `event_memory.ts`  |

Note: l'ancien `trigger-memory-echo` a ete retire du runtime WhatsApp le
2026-04-27.

### Transverse — embeddings

| Source tag                                   | Fonction                        |
| -------------------------------------------- | ------------------------------- |
| `sophia-brain:topic_match_query_embedding`   | Recherche vectorielle memoire   |
| `sophia-brain:topic_keyword_embedding`       | Embedding mots-cles             |
| `sophia-brain:topic_retrieve`                | Retrieval memoire               |
| `sophia-brain:global_memory_embedding`       | Embedding memoire globale       |
| `sophia-brain:global_memory_query_embedding` | Query embedding memoire globale |
| `sophia-brain:event_match_query`             | Query embedding evenement       |
| `sophia-brain:event_retrieval`               | Retrieval evenement             |
| `sophia-brain:research_grounding`            | Grounding par recherche         |

## Mapping operation_family → tier

Le script d'export utilise `operation_family` (infere depuis `source` par
`inferOperationFromSource` dans `_shared/llm-usage.ts`) pour classifier les
appels en tiers:

| operation_family     | Tier | Justification                                          |
| -------------------- | ---- | ------------------------------------------------------ |
| `plan_generation`    | 1    | Onboarding: structuration, cristallisation, generation |
| `dispatcher`         | 3    | Routing contextuel a chaque message                    |
| `message_generation` | 3    | Companion, sentry (reponse conversationnelle)          |
| `memorizer`          | 3    | Extraction, compaction, synthese memoire               |
| `embedding`          | 3    | Embeddings vectoriels                                  |
| `watcher`            | 3    | Analyse watcher                                        |
| `scheduling`         | 3    | Morning nudge, checkins                                |
| `ethics_check`       | 3    | Validation ethique                                     |
| `duplicate_check`    | 3    | Detection doublons                                     |
| `summarize_context`  | 2    | Synthese context / grounding                           |
| `summary_generation` | 2    | Generation de resumes                                  |
| `other`              | 3    | Fallback par defaut                                    |

`conversation_pulse_builder` est classe en Tier 2 par le script d'export via son
`source` tag directement. Les anciens triggers `trigger_daily_bilan` et
`trigger_weekly_bilan` ont ete retires du runtime WhatsApp le 2026-04-27.

## Comment agreger les couts depuis llm_usage_events

La table `llm_usage_events` contient toutes les colonnes necessaires:

```
id, created_at, request_id, user_id,
source, provider, model, kind,
prompt_tokens, output_tokens, total_tokens, cost_usd,
operation_family, operation_name, channel,
status, latency_ms,
provider_request_id, pricing_version,
input_price_per_1k_tokens_usd, output_price_per_1k_tokens_usd,
cost_unpriced, currency, step_index,
metadata (jsonb)
```

Axes d'agregation:

1. **Par user par jour**: `GROUP BY user_id, date_trunc('day', created_at)`
2. **Par tier**: via le mapping operation_family → tier (voir ci-dessus)
3. **Par fonction**: `GROUP BY operation_family, operation_name`
4. **Par modele**: `GROUP BY provider, model`
5. **Par channel**: `GROUP BY channel` (system vs whatsapp)

Index disponibles:

- `llm_usage_events_created_at_user_idx` (created_at, user_id)
- `llm_usage_events_operation_idx` (operation_family, operation_name)
- `llm_usage_events_model_provider_idx` (model, provider)
- `llm_usage_events_status_idx` (status)

## Comment detecter les appels redondants

Un appel est redondant quand une meme intention est executee alors qu'un
resultat frais existe encore.

### Freshness windows par operation

| Operation                    | Freshness window                          |
| ---------------------------- | ----------------------------------------- |
| `conversation_pulse_builder` | 12h                                       |
| `momentum_morning_nudge`     | 20h                                       |
| `dispatcher-v2-contextual`   | Pas de freshness (1 par message, attendu) |
| `companion` / `sentry`       | Pas de freshness (1 par message, attendu) |

### Algorithme de detection

Pour chaque fenetre de freshness:

1. Trier les appels par user + source + created_at
2. Pour chaque paire consecutive du meme user + meme source, calculer le delta
3. Si delta < freshness_window → marquer comme `redundant`
4. Le `redundant_call_rate` = nombre de redondants / total

## Comment mesurer la derive temporelle

La derive se mesure sur des fenetres glissantes (par jour):

1. Calculer le cout total par user par jour sur la fenetre d'audit
2. Tracer la serie `cost_per_day[]`
3. Calculer la tendance (regression lineaire simple ou comparaison premiere
   moitie vs seconde moitie)
4. Alerte si le cout de la seconde moitie est > 20% superieur a la premiere
   moitie

## Structure du bundle attendu

### trace

- `llm_calls_timeline`: chronologie des appels LLM avec source,
  operation_family, operation_name, model, provider, tokens in/out, cost_usd,
  latency_ms, status, channel
- `calls_by_tier`: appels groupes par tier (1/2/3) avec sous-total tokens et
  cost
- `calls_by_function`: appels groupes par operation_family avec metriques
- `calls_by_model`: appels groupes par provider + model
- `redundant_calls`: appels detectes comme redondants (meme intention <
  freshness window)
- `fallback_activations`: appels ayant un status != 'success' ou cost_unpriced =
  true
- `daily_cost_series`: cout par jour pour detecter la derive

### scorecard

- `total_cost_period`: cout total sur la fenetre
- `cost_per_user_per_day`: cout moyen par user actif par jour
- `cost_by_tier`: cout par tier {tier_1, tier_2, tier_3}
- `cost_by_function`: cout par operation_family (top 10)
- `calls_by_tier`: nombre d'appels par tier
- `calls_total`: nombre total d'appels
- `tokens_total`: tokens totaux (prompt + output)
- `redundant_call_rate`: pourcentage d'appels redondants
- `fallback_rate`: pourcentage d'appels ayant un status != 'success'
- `unpriced_rate`: pourcentage d'appels cost_unpriced
- `top_cost_functions`: top 5 des fonctions les plus couteuses
- `cost_trend`: evolution du cout par jour (ratio second half / first half)
- `avg_latency_ms_by_tier`: latence moyenne par tier
- `alerts`: liste d'alertes detectees

### Alertes automatiques

| Alerte                        | Condition                                     |
| ----------------------------- | --------------------------------------------- |
| `redundant_pulse_generation`  | 2+ pulses pour le meme user en < 12h          |
| `tier3_using_expensive_model` | Appel Tier 3 utilisant un modele non-Flash    |
| `cost_drift_detected`         | Derive > 20% entre premiere et seconde moitie |
| `high_fallback_rate`          | > 5% d'appels en erreur                       |
| `high_unpriced_rate`          | > 10% d'appels sans prix                      |
| `daily_budget_exceeded`       | Cout > $0.50 par user par jour                |
| `tier1_outside_onboarding`    | Appel plan_generation sans cycle recent       |

## Checklist d'audit

- [ ] Le cout par user par jour est-il dans le budget prevu (< $0.50) ?
- [ ] Les appels Tier 1 sont-ils rares (onboarding seulement) ?
- [ ] Les appels Tier 2 sont-ils hebdomadaires ou quotidiens max ?
- [ ] Les appels Tier 3 utilisent-ils des modeles rapides (flash) ?
- [ ] Le conversation_pulse respecte-t-il la regle de freshness 12h ?
- [ ] Le momentum n'est pas recalcule a chaque message ?
- [ ] Les fallbacks fonctionnent-ils (pas de crash quand LLM echoue) ?
- [ ] Le cout n'augmente pas significativement d'une semaine a l'autre ?
- [ ] Les embeddings ne representent pas un cout disproportionne ?
- [ ] Le morning nudge n'est pas regenere plusieurs fois par jour ?
- [ ] Les appels `cost_unpriced` sont-ils < 10% du total ?

## Patterns de bugs a surveiller

- conversation_pulse regenere 3+ fois par jour (freshness non respectee)
- momentum recalcule a chaque message au lieu de sur signal fort
- generation de plan lancee en boucle (generation_attempts non respecte)
- appels LLM sans fallback (crash si le provider est down)
- cout qui double en 2 semaines sans changement de volume
- embeddings qui explosent (compaction/merge/enrichment en boucle)
- appels memoire redondants (topic_compaction sur le meme topic en < 1h)
- appels watcher en boucle (batch scheduling qui relance sans attendre)

## Leviers de tuning

- choix de modele par tier: Flash pour Tier 3, intermediaire pour Tier 2,
  Pro/performant pour Tier 1
- freshness windows: 12h pour le pulse, potentiellement augmenter a 18-24h si
  stable
- frequence de recalcul momentum: sur signal fort seulement (pas a chaque
  message)
- caching des resultats LLM quand le contexte n'a pas change
- budget plafond par user par jour: hard limit a $0.50
- compaction memoire: limiter la frequence (1x/jour max par topic)
- embeddings: re-utiliser les embeddings existants plutot que re-generer
- thinking budget: ajuster DISPATCHER_THINKING_BUDGET et
  COMPANION_THINKING_BUDGET

## Commande d'export

```bash
# Un seul user, 7 jours
npm run llm-cost:audit:export -- --user-id <uuid> --hours 168

# Un seul user, fenetre custom
npm run llm-cost:audit:export -- --user-id <uuid> --from 2026-03-17T00:00:00Z --to 2026-03-24T00:00:00Z

# Tous les users, 7 jours
npm run llm-cost:audit:export -- --all-users --hours 168

# Sortie custom
npm run llm-cost:audit:export -- --user-id <uuid> --hours 72 --out my_audit.json
```
