# Sophia Memory V2 - Roadmap d'implementation pas-a-pas

> **Status 2026-05-04 : MVP V2-only completed / roadmap historique.**
>
> Cette roadmap de coexistence V1/V2 est conservee comme archive de conception.
> Le chantier final a tranche un big bang V2-only : pas de backfill legacy,
> pas de canary runtime V1, pas de fallback V1. La source operative actuelle est
> `docs/memory-architecture.md` et le runbook actuel est
> `docs/memory-v2-only-runbook.md`.

## Addendum final - Big Bang Memory V2-only (2026-05-04)

Cette section documente l'ecart volontaire entre la roadmap initiale
coexistence/canary et ce qui a finalement ete implemente. Elle sert de vue
globale pour reprendre le chantier plus tard sans relire tout l'historique.

### Decisions finales

| Sujet | Decision finale | Impact |
|---|---|---|
| Donnees legacy | Aucun user reel a preserver | Pas de migration `user_global_memories` / `user_event_memories` vers V2 |
| Strategie rollout | Big bang local V2-only | Suppression de la coexistence longue V1/V2 |
| Fallback runtime | Aucun fallback V1 | Si V2 est desactive ou timeout, Sophia repond sans memoire durable |
| Source de verite | `memory_items` atomiques | Les summaries ne prouvent rien ; elles servent uniquement a parler |
| Topic surface | `user_topic_memories.search_doc` | `synthesis` et colonnes V1 supprimees |
| Memorizer | Async principal | Le concept `write_canary` a ete renomme/supprime |
| DB reset | Autorise | Migration destructive unique acceptable |

### Ce qui remplace les sprints historiques

Les sprints ci-dessous restent utiles pour comprendre la genese, mais leur
execution concrete a ete remplacee par le plan V2-only :

- `S3 Backfill et coexistence V1/V2` : **superseded**. Aucun backfill legacy,
  pour eviter d'importer les hallucinations/syntheses V1 dans la source V2.
- `S5 Runtime shadow` : **superseded**. Le runtime actuel est V2-only ; shadow
  V1 supprime du flow normal.
- `S7 Memorizer write canary` : **superseded**. Le memorizer async est le
  chemin principal, avec kill-switch d'ecriture.
- `S9 Loader canary -> 100%` : **superseded**. Le loader V2 est ON par defaut,
  avec kill-switch qui ne reactive jamais V1.

### Changements implementes en plus du plan initial

| ID | Ajout final | Fichiers principaux | Verification |
|---|---|---|---|
| M1 | Fixture seed V2-only dediee | `scripts/seed_memory_v2_fixture.mjs` | 60 messages, 4 topics, 6 entities, 30 items dont 25 actifs |
| M2 | Goldens globaux etendus | `scenarios/13_cross_topic_work.yaml`, `14_cross_topic_family.yaml`, `15_cross_topic_habits.yaml`, `16_cross_topic_main_problem.yaml` | 16 scenarios charges et executes en mock |
| M3 | E2E forget user RGPD complet | `correction/forget_user_complete.ts`, `forget_user_complete_e2e_test.ts` | Redaction item/topic/chat metadata/entities + change log + < 30s |
| M4 | Renommage `write_canary` | `memorizer/memorizer_async.ts`, `memorizer/controls.ts` | `write_canary.ts` supprime, imports runtime nettoyes |
| M5 | Drop exhaustif colonnes topic V1 | `20260504090000_drop_legacy_memory_v1.sql` | Audit DB : 0 colonne morte V1 restante |
| M6 | Docs V2-only | `docs/memory-architecture.md`, `docs/memory-v2-only-runbook.md`, `docs/archive/memory-v2-coexistence.md` | Runbook V2-only publie, doc coexistence archivee |
| M7 | Cost cap dur memorizer | `memorizer/controls.ts`, `memorizer_async.ts`, `persist.ts` | Test env `0.50` EUR coupe l'extraction avant appel LLM |
| M8 | RPCs legacy exhaustives | `20260504090000_drop_legacy_memory_v1.sql` | Audit DB : `legacy_rpc_count = 0` |

### Runtime V2-only final

- Loader V2 ON par defaut.
- Kill-switch lecture : `memory_v2_loader_disabled=1`.
- Kill-switch ecriture : `memory_v2_memorizer_disabled=1`.
- Timeout loader dur : `memory_v2_loader_timeout_ms`, defaut 1500ms.
- Le loader disabled / timeout produit un payload vide ou partiel, jamais un
  fallback V1.
- Le chat principal n'injecte plus `topicMemories`, `globalMemories` ou
  `eventMemories` V1.
- Les scripts d'audit actifs lisent `memory_items` et `user_topic_memories`
  V2-only, pas `user_global_memories` / `user_event_memories`.

### DB finale apres reset

Tables legacy absentes :

- `user_global_memories`
- `user_event_memories`
- `user_topic_enrichment_log`

RPCs legacy absentes :

- `match_topic_memories_by_keywords`
- `match_topic_memories_by_synthesis`
- `match_topic_memories_by_title`
- `match_global_memories`
- `match_event_memories`
- `match_memories_for_user`
- `match_memories`

Colonnes topic V1 absentes :

- `synthesis`
- `synthesis_embedding`
- `mention_count`
- `enrichment_count`
- `first_mentioned_at`
- `last_enriched_at`
- `last_retrieved_at`
- `summary_compacted_at`
- `pending_enrichment_count`
- `pending_enrichment_chars`
- `title_embedding`

Schema final attendu pour `user_topic_memories` :

```text
id
user_id
slug
title
status
metadata
created_at
updated_at
lifecycle_stage
search_doc
search_doc_embedding
search_doc_version
pending_changes_count
last_compacted_at
summary_version
sensitivity_max
archived_reason
merged_into_topic_id
```

### Tests et checks de cloture

Commandes passees pendant le chantier final :

```bash
supabase db reset
node scripts/seed_memory_v2_fixture.mjs
node scripts/run_memory_v2_conversation_smoke.mjs
deno check supabase/functions/sophia-brain/index.ts supabase/functions/sophia-brain/router/agent_exec.ts supabase/functions/sophia-brain/agents/companion.ts
deno check supabase/functions/trigger-weekly-memory-review/index.ts supabase/functions/trigger-memory-v2-alerts/index.ts supabase/functions/trigger-topic-compaction/index.ts
deno check supabase/functions/backfill-memory-v2-topic-embeddings/index.ts supabase/functions/memory-redaction-job/index.ts
deno test --allow-read --allow-env supabase/functions/_shared/memory/testing/scenario_loader_test.ts supabase/functions/_shared/memory/runtime/loader_test.ts supabase/functions/_shared/memory/memorizer/memorizer_async_test.ts supabase/functions/_shared/memory/correction/forget_user_complete_e2e_test.ts
deno test supabase/functions/_shared/memory/runtime/active_loader_test.ts supabase/functions/_shared/v2-memory-retrieval_test.ts supabase/functions/_shared/memory/observability_test.ts supabase/functions/_shared/memory/memorizer/batch_selector_test.ts supabase/functions/_shared/memory/compaction/topic_compaction_test.ts supabase/functions/_shared/memory/correction/redaction_test.ts
deno test --allow-read supabase/functions/_shared/memory/__tests__/v2_only_cleanup_test.ts supabase/functions/_shared/memory/__tests__/rls.int.test.ts
```

Resultats de cloture :

- DB reset local clean.
- Fixture V2-only reproductible.
- Smoke runtime V2-only OK.
- 16 scenarios golden charges et executes en mock.
- 20 tests cibles OK.
- 38 tests memoire V2 existants OK.
- 6 tests RLS/migrations OK.
- `legacy_rpc_count = 0`.
- Audit colonnes topic V1 : `0 rows`.
- Audit tables V1 : toutes absentes.

### Points a ne pas reouvrir sans raison forte

- Ne pas reintroduire `user_global_memories` comme source runtime.
- Ne pas recreer un fallback V1 derriere les kill-switch V2.
- Ne pas remigrer les summaries V1 vers `memory_items`.
- Ne pas materialiser de global profile tant que le lookup `domain_keys` +
  rerank n'a pas montre une insuffisance mesurable.
- Ne pas renommer `search_doc` en `synthesis` : `search_doc` est une surface
  conversationnelle V2, pas une source de verite.

## Comment utiliser ce document

Ce document est l'execution du plan `plan/memory-v2-mvp-consolidated-architecture-plan.md` (le **plan d'archi**).

Il ne re-explique pas les decisions. Il dit **dans quel ordre faire quoi**, avec :

- les fichiers a creer ou a modifier ;
- les commandes a executer ;
- les tests a faire passer ;
- la **definition of done** de chaque etape ;
- les references vers les sections du plan d'archi.

Conventions :

- chaque etape porte un identifiant `S<sprint>.<step>` ;
- chaque sprint vaut entre **0,5 et 2 jours** de travail ;
- chaque etape se termine par une **DoD** verifiable ;
- chaque sprint a un **checkpoint** : ce qui doit fonctionner avant d'attaquer le sprint suivant ;
- les references vers le plan d'archi sont notees `[archi: <titre de section>]` ;
- les commandes shell sont fournies. **Aucune commande destructive ne doit etre executee sans confirmation explicite** (cf. `safety-no-destructive-db.mdc`).

Mode d'usage suggere avec Cursor :

1. ouvrir l'etape S<x>.<y> ;
2. lire la reference archi associee ;
3. demander a l'agent de l'executer ;
4. valider la DoD ;
5. passer a l'etape suivante.

## Vue d'ensemble - 12 sprints

```text
S0  - Pre-flight : decisions a verrouiller             (0,5j)
S1  - Fondations : types, taxonomie, prompts           (1-1,5j)
S2  - Migrations schema MVP                            (1-2j)
S3  - Backfill et coexistence V1/V2                    (0,5-1j)
S4  - Test harness et 12 golden conversations          (2-3j)
S5  - Runtime shadow (signal + router + loader)        (2-3j)
S6  - Memorizer dry-run                                (2-3j)
S7  - Memorizer write canary                           (1-2j)
S8  - Correction et redaction                          (1-2j)
S9  - Loader V2 actif (canary -> 100%)                 (1-2j)
S10 - Topic compaction                                 (1-2j)
S11 - Action signals + cross-topic profile             (1-2j)
S12 - Stabilisation et observabilite                   (0,5-1j)
```

Total estime : **15-25 jours de dev focus**. Pas de raccourci sur S4 (golden conversations).

## Sprint 0 - Pre-flight (VERROUILLE)

**Statut** : completed le 2026-04-30.

Toutes les decisions ouvertes ont ete tranchees apres inspection du repo. Les valeurs figees vivent dans le plan d'archi -> `## Decisions Sprint 0 (verrouillees)`.

Recap de ce qui a ete decide (et pourquoi) :

| Decision | Valeur | Justification |
|---|---|---|
| Postgres major version | **17** | confirme dans `supabase/config.toml` |
| Unique constraint sources | **`nulls not distinct`** | Postgres 17 le supporte |
| Embedding model | **`gemini-embedding-001`** | deja en place dans `supabase/functions/_shared/llm.ts` |
| Embedding dimension | **768** | tronque deja a 768 dans `geminiEmbed` |
| `embedding_model` stocke | **`gemini-embedding-001@768`** | format `<modele>@<dim>`, futur-proof |
| LLM extraction memorizer | **`gemini-3-flash-preview`** | aligne avec `topic_memory.ts`, JSON, FR-strong, derniere generation Flash |
| LLM topic router (zone grise) | **`gemini-3-flash-preview`** | meme provider |
| LLM compaction topic | **`gemini-3-flash-preview`** | meme provider |
| Domain keys v1 | **liste fermee** | cf. `## Taxonomie domain_keys.v1`, format `domain.subdomain` (`.general`) |
| Sensitivity categories MVP | **12 tags** | cf. plan d'archi `## Decisions Sprint 0` |
| Relation cardinality | **registry defini** | cf. `### Cardinalite des relations` |
| Retention RGPD | **30j compte / 90j item / 365j change_log** | cf. `## Politique de retention RGPD` |
| Fenetre canary | **5% -> 25% -> 50% -> 100%, 48-72h par palier** | cf. `## Procedure de rollback` |

Variables d'env a ajouter dans `supabase/env.example` (a faire en S1.0) :

```text
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
MEMORY_V2_EXTRACTION_MODEL=gemini-3-flash-preview
MEMORY_V2_ROUTER_MODEL=gemini-3-flash-preview
MEMORY_V2_COMPACTION_MODEL=gemini-3-flash-preview
```

Plus tard, si on doit benchmarker un autre modele d'embedding (V2.5+), on suivra la procedure dual-write decrite dans `## Embedding strategy`. **Pas avant le rollout 100%.**

### S0.1 - Embedding model (DONE)

- Modele : `gemini-embedding-001` ;
- Dimension : `768` ;
- Identifiant stocke : `gemini-embedding-001@768` ;
- Provider : Gemini (deja integre).

### S0.2 - Verifier la version Postgres (DONE)

- Postgres 17 confirme via `supabase/config.toml` -> `major_version = 17` ;
- Strategie unique constraint = `nulls not distinct`.

### S0.3 - Decisions secondaires (DONE)

Toutes documentees dans le plan d'archi `## Decisions Sprint 0 (verrouillees)`.

### S0.4 - Checkpoint S0 (DONE)

- [x] embedding model et dimension choisis ;
- [x] strategie unique constraint choisie ;
- [x] toutes les decisions plan d'archi sont figees ;
- [x] team / agent aligne sur le scope MVP.

**Aucune decision ouverte ne doit etre prise dans les sprints suivants. Si un point bloque, c'est un bug du plan d'archi a fixer en priorite.**

## Sprint 1 - Fondations : types, taxonomie, prompts

**But** : creer les fichiers de reference partages que tout le code va importer.

Reference archi : `## Annexe C - Fichiers de reference a creer`.

### S1.1 - Creer `memory/types.v1.ts`

Fichier : `supabase/functions/_shared/memory/types.v1.ts` (ou equivalent selon convention repo).

Contenu : exporter les types canoniques.

Reference archi :

- `## Memory item kinds MVP` ;
- `## Status MVP` ;
- `## Retrieval modes MVP` ;
- `## Topic decisions MVP` ;
- `## Privacy MVP`.

Types a exporter :

```ts
export type MemoryItemKind =
  | 'fact'
  | 'statement'
  | 'event'
  | 'action_observation';

export type MemoryItemStatus =
  | 'candidate'
  | 'active'
  | 'superseded'
  | 'invalidated'
  | 'hidden_by_user'
  | 'deleted_by_user'
  | 'archived';

export type SensitivityLevel = 'normal' | 'sensitive' | 'safety';

export type RetrievalMode =
  | 'topic_continuation'
  | 'cross_topic_lookup'
  | 'safety_first';

export type RetrievalHint =
  | 'dated_reference'
  | 'correction'
  | 'action_related';

export type TopicDecision = 'stay' | 'switch' | 'create_candidate' | 'side_note';

export type MemoryItemTopicRelation =
  | 'about'
  | 'supports'
  | 'mentioned_with'
  | 'blocks'
  | 'helps';

export type MemoryItemEntityRelation = 'mentions' | 'about';

export type AggregationKind =
  | 'single_occurrence'
  | 'week_summary'
  | 'streak_summary'
  | 'possible_pattern';

export type EntityType =
  | 'person'
  | 'organization'
  | 'place'
  | 'project'
  | 'object'
  | 'group'
  | 'other';

export type RelationCardinality = 'usually_single' | 'multiple' | 'time_scoped';

export type ChangeOperationType =
  | 'invalidate'
  | 'supersede'
  | 'hide'
  | 'delete'
  | 'merge'
  | 'restore'
  | 'promote'
  | 'archive_expired'
  | 'redaction_propagated';

export type ProcessingRole =
  | 'primary'
  | 'context_only'
  | 'skipped_noise'
  | 'reprocessed_for_correction';
```

DoD :

- fichier importable depuis n'importe quel module Supabase ;
- types exportes correspondent au tableau recapitulatif des decisions MVP.

### S1.2 - Creer `memory/domain_keys.v1.json`

Fichier : `supabase/functions/_shared/memory/domain_keys.v1.json`.

Reference archi : `## Taxonomie domain_keys.v1`.

Format suggere :

```json
{
  "version": 1,
  "format": "domain.subdomain",
  "keys": [
    { "key": "psychologie.estime_de_soi", "label": "Estime de soi" },
    { "key": "psychologie.discipline", "label": "Discipline" }
  ]
}
```

Coupler avec un helper :

```ts
// memory/domain_keys.ts
import data from './domain_keys.v1.json' with { type: 'json' };
export const DOMAIN_KEYS_V1: Set<string> = new Set(data.keys.map(k => k.key));
export const DOMAIN_KEYS_V1_VERSION: number = data.version;

export function isValidDomainKey(key: string): boolean {
  return DOMAIN_KEYS_V1.has(key);
}
```

DoD :

- toute la liste du plan d'archi est dans le JSON ;
- format `domain.subdomain` (avec `.general` si pas de subdivision) ;
- helper `isValidDomainKey` testee avec des cas valides et invalides.

### S1.3 - Creer `memory/relation_cardinality.v1.json`

Fichier : `supabase/functions/_shared/memory/relation_cardinality.v1.json`.

Reference archi : `### Cardinalite des relations`.

DoD :

- registry complet importable ;
- helper `getRelationCardinality(role: string)` qui retourne `'usually_single' | 'multiple' | 'time_scoped' | null`.

### S1.4 - Creer les 3 prompts versionnes

Reference archi : `## Annexe A - Prompts canoniques`.

Fichiers :

```text
supabase/functions/_shared/memory/prompts/
  extraction.v1.md
  topic_router.v1.md
  compaction_topic.v1.md
```

Pour chaque prompt :

- copier integralement le contenu de l'Annexe A ;
- ajouter en en-tete YAML : `prompt_version`, `model_recommended`, `created_at` ;
- ne pas inclure d'exemples avec contenu user reel.

Helper :

```ts
// memory/prompts/index.ts
export const PROMPT_VERSIONS = {
  extraction: 'memory.memorizer.extraction.v1',
  topic_router: 'memory.runtime.topic_router.v1',
  compaction: 'memory.compaction.topic.v1',
} as const;
```

DoD :

- les 3 fichiers existent ;
- le helper retourne les bonnes versions ;
- une CI snapshot test compare les fichiers a un hash de reference (pour detecter les modifs non versionnees).

### S1.5 - Creer le harness de tests `memory/testing/types.ts`

Reference archi : `## Test harness` -> `### Contrat TypeScript`.

Fichier : `supabase/functions/_shared/memory/testing/types.ts`.

Contenu : copier integralement les interfaces du plan d'archi (`GoldenScenario`, `ScenarioRunner`, `TurnExpectation`, etc.).

DoD :

- types compilables et exportes ;
- pas d'implementation runner encore (c'est S4).

### S1.6 - Checkpoint S1

- [ ] `memory/types.v1.ts` exporte tous les types canoniques ;
- [ ] `memory/domain_keys.v1.json` valide les keys du plan d'archi ;
- [ ] `memory/relation_cardinality.v1.json` registry complet ;
- [ ] 3 prompts versionnes en place ;
- [ ] `memory/testing/types.ts` compile.

Aucune migration DB encore. Tout est dans le code partage.

## Sprint 2 - Migrations schema MVP

**But** : creer toutes les tables MVP en local sans casser V1.

Reference archi : `## Schema SQL recommande`, `### Ordre de migration Phase 1`, `## Triggers updated_at`, `## FK extraction_run_id (recommandee)`.

Convention timestamp : prendre la convention existante (`YYYYMMDDHHMMSS_<name>.sql`).

### S2.1 - Migration `user_entities`

Fichier : `supabase/migrations/<ts>_create_user_entities.sql`.

Reference archi : `### user_entities`.

Contenu :

- table `user_entities` complete ;
- indexes (status, aliases gin, normalized_key, embedding hnsw) ;
- RLS policies select/insert/update sur `auth.uid() = user_id` ;
- trigger `updated_at`.

DoD :

- table existe en local ;
- RLS test : inserer comme user A, lire comme user B -> 0 ligne.

**Rappel safety** : NE jamais executer `db reset` ou `db push` automatiquement. Toujours demander confirmation. Cf. `safety-no-destructive-db.mdc`.

### S2.2 - Migration `memory_items` (avec checks et trigger)

Fichier : `supabase/migrations/<ts>_create_memory_items.sql`.

Reference archi : `### memory_items` (incluant les `chk_event_*` et le trigger).

Inclure dans la meme migration :

- table ;
- 6 indexes ;
- 2 check constraints event ;
- trigger `tg_memory_items_set_updated_at` (ou pattern generique) ;
- RLS policies.

DoD :

- contraintes event verifiees : INSERT kind=event sans event_start_at -> rejet ;
- INSERT event avec event_end_at < event_start_at -> rejet ;
- update sans changement de updated_at -> updated_at change.

### S2.3 - Migration `memory_item_sources`

Fichier : `supabase/migrations/<ts>_create_memory_item_sources.sql`.

Reference archi : `### memory_item_sources`.

Choisir selon S0.2 :

- soit `source_dedupe_key text generated always as (...) stored` + `unique (memory_item_id, source_dedupe_key)` ;
- soit `unique nulls not distinct` (Postgres 15+).

DoD :

- INSERT deux rows identiques avec source_id NULL -> 2eme rejete.

### S2.4 - Migrations join tables

Fichiers separes (un par migration pour faciliter rollback) :

```text
<ts>_create_memory_item_topics.sql
<ts>_create_memory_item_entities.sql
<ts>_create_memory_item_actions.sql
<ts>_create_memory_item_action_occurrences.sql
```

Reference archi :

- `### memory_item_topics` ;
- `### memory_item_entities` ;
- `### memory_item_actions` ;
- `### memory_item_action_occurrences`.

DoD :

- chaque table a sa unique constraint correcte ;
- chaque table a son trigger updated_at (sauf occurrences qui n'a que created_at) ;
- RLS policies en place.

### S2.5 - Migrations infra memorizer

Fichiers :

```text
<ts>_create_memory_extraction_runs.sql
<ts>_create_memory_message_processing.sql
<ts>_create_memory_change_log.sql
```

Reference archi :

- `### memory_extraction_runs` ;
- `### memory_message_processing` (dans `## Memorizer idempotence` -> `### Axe 2`) ;
- `### memory_change_log`.

DoD :

- unique `(user_id, batch_hash, prompt_version)` sur runs verifiee ;
- unique `(user_id, message_id, processing_role)` sur processing verifiee ;
- check operation_type enrichi (`promote`, `archive_expired`, `redaction_propagated`).

### S2.6 - Migration extension `user_topic_memories`

Fichier : `<ts>_extend_user_topic_memories_v2.sql`.

Reference archi : `### Extension user_topic_memories` + champ `synthesis_redaction_mode` (`## Sensibilite des topic synthesis`).

Action :

- ALTER TABLE pour ajouter colonnes ;
- backfill de `lifecycle_stage` :
  - `status='active'` recent -> `durable` ;
  - `status='active'` ancien -> `dormant` ;
  - autres -> `archived` ;
- backfill de `search_doc` initial = `title || ' ' || synthesis` (truncate 2000 chars) ;
- ne pas backfill `search_doc_embedding` ici (job async S3).

DoD :

- toutes les nouvelles colonnes existent et sont remplies pour les rows existantes ;
- les consumers V1 ne cassent pas (les nouvelles colonnes sont nullable ou ont des defaults).

### S2.7 - Migration FK `extraction_run_id`

Fichier : `<ts>_add_fk_extraction_run_id.sql`.

Reference archi : `## FK extraction_run_id (recommandee)`.

Ajouter les FK soft (`set null`) sur :

- `memory_items` ;
- `memory_item_sources` ;
- `memory_item_topics` ;
- `memory_item_entities` ;
- `memory_item_actions`.

DoD :

- DELETE d'une row `memory_extraction_runs` -> les rows liees gardent leur donnee mais avec `extraction_run_id = NULL`.

### S2.8 - Migration triggers updated_at communs

Fichier : `<ts>_create_updated_at_function_and_triggers.sql`.

Reference archi : `## Triggers updated_at`.

- creer la fonction `tg_set_updated_at()` ;
- ajouter triggers sur les tables qui n'en ont pas encore.

DoD :

- UPDATE d'une row -> `updated_at` mis a jour automatiquement.

### S2.9 - Tests RLS isolation multi-user

Fichier : `supabase/functions/_shared/memory/__tests__/rls.int.test.ts` (ou equivalent).

Pour chaque table user-scoped :

- creer 2 users en local (signup ou seed) ;
- inserer en tant que A ;
- verifier que B ne voit rien (`select count(*) = 0`) ;
- verifier qu'une RPC service-role respecte `target_user_id`.

DoD :

- tests passent en CI ;
- aucune fuite cross-user detectee.

### S2.10 - Checkpoint S2

- [ ] toutes les tables MVP existent en local ;
- [ ] V1 continue de fonctionner ;
- [ ] tests RLS passent ;
- [ ] aucune migration push remote.

## Sprint 3 - Backfill et coexistence V1/V2

**But** : migrer les donnees historiques utiles sans casser V1.

Reference archi : `## Migration de l'existant`.

### S3.1 - Backfill `user_event_memories` -> `memory_items`

Fichier : `supabase/migrations/<ts>_backfill_user_event_memories.sql` (ou edge function one-shot).

Reference archi : `### user_event_memories`.

Action :

- script idempotent qui INSERT memory_items kind='event' depuis user_event_memories ;
- mapping precis : starts_at, ends_at, time_precision, confidence, embedding ;
- metadata.legacy_event_id pour tracer l'origine ;
- skip si `metadata->>'legacy_event_id' = id` deja existant (idempotence).

DoD :

- count(events V1 actifs) == count(memory_items kind='event' avec legacy_event_id) ;
- run du script 2x = no-op.

### S3.2 - Job d'embedding `search_doc_embedding`

Reference archi : `### user_topic_memories` (extension) + `## Embedding strategy`.

Action :

- edge function ou cron qui prend un user_topic_memory sans embedding ;
- calcule embedding du `search_doc` ;
- update + set `search_doc_version=1`.

Limite : 100 topics par run pour eviter explosion de cout.

DoD :

- tous les topics existants ont un `search_doc_embedding` non NULL ;
- `embedding_model` documente.

### S3.3 - Politique de coexistence

Documenter dans une note interne :

- `user_global_memories` : conserve, V2 lit pour eviter doublons mais n'ecrit pas ;
- `topic_memory_links` (s'il avait ete cree) : abandonne, ne pas creer la table ;
- `chat_messages.metadata.topic_context` : versionne `_v2` cohabite avec V1.

DoD :

- note interne dans `docs/` ou commentaire dans le code partage.

### S3.4 - Checkpoint S3

- [ ] events V1 disponibles en `memory_items` ;
- [ ] topics V1 ont `search_doc_embedding` ;
- [ ] V1 continue de fonctionner sans regression ;
- [ ] aucune ecriture V2 dans les tables V1.

## Sprint 4 - Test harness et 12 golden conversations

**But critique** : avoir un filet de securite avant de toucher au runtime ou memorizer.

Reference archi : `## Test harness`, `## Evaluation strategy` (les 12 scenarios), `### Test obligatoire (golden scenario 10)`.

**Ce sprint est non negociable.** Sans lui, S5+ devient impossible a evaluer.

### S4.1 - Implementer le runner

Fichier : `supabase/functions/_shared/memory/testing/runner.ts`.

Reference archi : `## Test harness` -> `### Runner`.

Capacites :

- `run(scenario, options)` ;
- `runAll(scenarios, options)` ;
- modes `mock | record | replay | refresh` ;
- isolation DB par run (transactions reset OU users de test dedies) ;
- compare assertions vs observed_state.

DoD :

- runner peut executer un scenario factice (1 turn, 1 assertion) ;
- echec d'assertion produit un rapport lisible.

### S4.2 - Mock LLM provider

Fichier : `supabase/functions/_shared/memory/testing/mock_llm.ts`.

Capacites :

- intercepter chaque appel LLM (extraction, router, compaction) ;
- retourner soit un fixture inline, soit un fichier `fixtures/<scenario>/<prompt_version>.json` ;
- mode `record` : appelle vrai LLM et sauvegarde ;
- mode `replay` : echoue si fixture manquant ou prompt_version incorrect.

DoD :

- `llm_mode='replay'` sans fixture -> erreur explicite ;
- `llm_mode='record'` cree le fichier dans `fixtures/`.

### S4.3 - Ecrire les 12 scenarios

Repertoire : `supabase/functions/_shared/memory/testing/scenarios/`.

Reference archi : `## Evaluation strategy` -> les 12 IDs.

Fichiers :

```text
01_topic_continuity_breakup.yaml
02_false_switch_lateral_detail.yaml
03_true_switch_work.yaml
04_reopen_dormant_cannabis.yaml
05_cross_topic_psychology.yaml
06_dated_event_friday.yaml
07_action_missed_walk.yaml
08_strong_statement_self_blame.yaml
09_correction_wrong_memory.yaml
10_forget_sensitive_item.yaml
11_safety_minimal_context.yaml
12_entity_father_aliases.yaml
```

Pour chaque scenario :

- 2 a 5 turns ;
- assertions DB precises (created_items, forbidden_items, applied_operations) ;
- assertions runtime (retrieval_mode, topic_decision) ;
- assertions payload (payload_contains, payload_does_not_contain).

Priorite d'ecriture (qui debloquent le plus de phases) :

1. `12_entity_father_aliases` (debloque entity resolver) ;
2. `09_correction_wrong_memory` (debloque correction) ;
3. `10_forget_sensitive_item` (CRITIQUE pour Phase 6 et redaction job) ;
4. `01_topic_continuity_breakup` (debloque router sticky) ;
5. `04_reopen_dormant_cannabis` (debloque retrieval) ;
6. `06_dated_event_friday` (debloque temporal resolution) ;
7. les autres en parallele.

DoD :

- 12 fichiers YAML existent ;
- chaque fichier valide le schema (parsing reussi) ;
- aucune fixture LLM encore (recordee plus tard).

### S4.4 - Asserts globaux

Reference archi : `## Test harness` -> `### Assertions critiques`.

Implementer les checks globaux dans le runner :

- `no_invalid_injection` ;
- `no_deleted_in_payload` ;
- `no_statement_as_fact` ;
- `no_cross_user_data` ;
- `no_duplicate_extraction_on_retry` ;
- `no_message_double_processing` (S2.5).

DoD :

- chaque assert global a un test direct verifiable a partir de l'etat DB observe.

### S4.5 - CI integration

- ajouter un job `memory_v2_eval` dans la CI ;
- run sur PR avec mode `replay` (utilise les fixtures) ;
- echoue si fixtures manquantes ou prompt_version differente.

DoD :

- CI verte sur main avec 0 fixture (les scenarios doivent juste parser et le runner doit tourner sur des mocks placeholders).

### S4.6 - Checkpoint S4

- [ ] runner fonctionne en mock mode ;
- [ ] 12 scenarios YAML existent et parsent ;
- [ ] CI execute le harness ;
- [ ] aucune ecriture en prod.

A ce stade, le filet de securite existe. **GO pour S5**.

## Sprint 5 - Runtime shadow

**But** : implementer signal detection + topic router + loader en mode shadow (sans utiliser le payload V2 pour repondre).

Reference archi : `## Runtime pipeline MVP`, `## Topic router MVP`, `## Payload stable`, `## Sensibilite des topic synthesis`.

### S5.1 - Signal detection

Fichier : `supabase/functions/_shared/memory/runtime/signal_detection.ts`.

Reference archi : `## Runtime pipeline MVP` -> `### Step 2 - Detect signals`.

Implementer :

- regex/keywords pour : trivial, correction, forget, safety, explicit_topic_switch, dated_reference, action_related, sensitive ;
- output `DetectedSignals` typed.

DoD :

- tests unitaires sur 30+ phrases couvrant chaque signal ;
- aucune dependance LLM.

### S5.2 - Temporal resolution

Fichier : `supabase/functions/_shared/memory/runtime/temporal_resolution.ts`.

Reference archi : `## Runtime pipeline MVP` -> `### Step 3 - Temporal resolution`.

Implementer un parser deterministe pour :

- hier, hier soir, ce matin ;
- vendredi dernier, dimanche soir ;
- la semaine derniere, il y a deux semaines ;
- dans deux jours.

Sortir `{raw, resolved_start_at, resolved_end_at, precision, confidence, timezone}`.

DoD :

- 20+ tests unitaires couvrant les expressions courantes FR ;
- gestion des timezones via `user.timezone`.

### S5.3 - Topic router sticky

Fichier : `supabase/functions/_shared/memory/runtime/topic_router.ts`.

Reference archi : `## Topic router MVP`.

Implementer :

- pure cosine threshold rules d'abord (pas de LLM) ;
- shortlist top-3 candidates ;
- LLM router uniquement en zone grise (0.40-0.55).

DoD :

- scenario `01_topic_continuity_breakup` passe en shadow ;
- scenario `02_false_switch_lateral_detail` passe (pas de switch) ;
- scenario `03_true_switch_work` passe (switch detecte) ;
- LLM router appele < 25% du temps.

### S5.4 - Loader topic_continuation

Fichier : `supabase/functions/_shared/memory/runtime/loader.ts`.

Reference archi : `## Runtime pipeline MVP` -> `### Step 6 - Loader` (queries SQL fournies).

Implementer :

- query topic items ;
- query entities du topic ;
- query dated events si hint ;
- query action context si hint ;
- application sensitivity filter ;
- application topic synthesis sensitivity policy ;
- assertion : tous items retournes ont status='active'.

DoD :

- query latency p95 < 200ms en local sur dataset seed ;
- assertion runtime : si un item status != active passe -> erreur explicite et alerte.

### S5.5 - Loader cross_topic_lookup

Reference archi : `### cross_topic_lookup` (4 etapes).

Implementer le pipeline 4 etapes :

1. domain_keys mapping ;
2. semantic top-K ;
3. topic-aware rerank ;
4. final merge.

DoD :

- scenario `05_cross_topic_psychology` passe ;
- fallback rate < 30% sur scenarios.

### S5.6 - Payload stable

Fichier : `supabase/functions/_shared/memory/runtime/payload_state.ts`.

Reference archi : `## Payload stable`, `## Annexe B - Cles temp_memory MVP`.

Implementer :

- read/write `__memory_payload_state_v2` ;
- TTL turns ;
- purge sur correction/delete/hide ;
- carryover entre tours.

DoD :

- carryover entre 3 tours consecutifs preserve les items pertinents ;
- correction ou delete purge l'item du state immediatement.

### S5.7 - Active topic state

Fichier : `supabase/functions/_shared/memory/runtime/active_topic_state.ts`.

Reference archi : `## Annexe B - Cles temp_memory MVP` (format `__active_topic_state_v2`).

DoD :

- read/write fonctionne ;
- coexistence avec V1 (`_v1` reste lu si present, mais V2 ecrit `_v2`).

### S5.8 - Integration shadow dans le tour conversationnel

Reference archi : `### Phase 3 - Runtime shadow` (notamment `#### Spec comparaison shadow V1 vs V2`).

Action :

- dans le code du `sophia-brain` (ou equivalent), ajouter un hook qui calcule en parallele V1 (existant) et V2 (nouveau) ;
- ne PAS utiliser V2 pour repondre ;
- logger les comparaisons : topic decision match, retrieval mode alignment, payload jaccard, latency delta.

Flag : `memory_v2_loader_shadow_enabled`.

DoD :

- en local et staging : le shadow tourne sans erreur ;
- les logs comparaisons sont accessibles via une vue ou un endpoint debug ;
- aucun impact sur la reponse user.

### S5.9 - Metriques shadow

Reference archi : `## Observabilite` (runtime metrics).

Instrumenter :

- `memory.runtime.shadow.topic_decision_match` ;
- `memory.runtime.shadow.payload_jaccard` ;
- `memory.runtime.shadow.latency_delta_ms` ;
- `memory.runtime.shadow.invalid_injection_simulated_count`.

DoD :

- metriques visibles dans le dashboard ;
- seuils canary du plan respectes.

### S5.10 - Checkpoint S5

- [ ] signal detection + temporal resolution operationnels ;
- [ ] topic router shadow fonctionne ;
- [ ] loader shadow fonctionne pour les 3 modes ;
- [ ] payload state V2 fonctionne ;
- [ ] golden scenarios 1-6 passent en shadow (assertions runtime) ;
- [ ] aucune ecriture durable encore.

## Sprint 6 - Memorizer dry-run

**But** : implementer le memorizer complet en mode dry-run (n'ecrit pas en active).

Reference archi : `## Memorizer MVP`, `## Memorizer idempotence`, `## Extraction LLM`, `## Validation deterministe`, `## Dedupe memory items`, `## Entity resolution`, `## Topic linking`, `## Action linking`, `## Statement vs fact`.

### S6.1 - Selection batch et anti-bruit

Fichier : `supabase/functions/_shared/memory/memorizer/batch_selector.ts`.

Reference archi : `## Regle anti-bruit`, `## Memorizer MVP` -> Triggers.

Implementer :

- selection des messages user_id eligibles non deja `processing_role='primary'` ;
- application anti-noise (skip ack, small talk) ;
- creation des rows `memory_message_processing` correspondantes (skipped_noise / context_only).

DoD :

- batch d'un user retourne uniquement les messages substantifs ;
- le tracking par message est en place avant l'appel LLM.

### S6.2 - Extraction LLM

Fichier : `supabase/functions/_shared/memory/memorizer/extract.ts`.

Reference archi : `## Extraction LLM`, `## Annexe A - Prompts canoniques` -> `### A.1`.

Implementer :

- construction du prompt avec context, topics actifs, entities connues, taxonomie ;
- appel LLM (provider configurable selon S0) ;
- parsing JSON strict (rejet si invalide) ;
- ecriture dans `memory_extraction_runs` (status running puis completed/failed).

DoD :

- run d'extraction sur un message test produit un JSON valide ou un failed run loggue ;
- idempotence : meme `batch_hash` deux fois -> 2eme = no-op.

### S6.3 - Validation deterministe

Fichier : `supabase/functions/_shared/memory/memorizer/validate.ts`.

Reference archi : `## Validation deterministe`.

Implementer toutes les regles :

- source obligatoire ;
- `kind` dans la liste fermee ;
- `domain_keys` dans la taxonomie v1 ;
- event sans date -> rejet ;
- statement vs fact (regex sur termes emotionnels) ;
- diagnostic detection (`tu es / le user est / trouble / depressif / ...`) ;
- confidence >= 0.55 ;
- regle `requires_user_initiated` -> respect dans le post-traitement.

DoD :

- chaque regle a un test unitaire avec exemples positifs et negatifs ;
- statement_as_fact violations = 0 sur fixtures.

### S6.4 - Dedupe memory items

Fichier : `supabase/functions/_shared/memory/memorizer/dedupe.ts`.

Reference archi : `## Dedupe memory items`.

Implementer :

- canonical_key generation ;
- cosine comparison ;
- decision tree : create_new / merge / add_source / supersede / reject_duplicate.

DoD :

- duplicate exact -> rejected ;
- similar (>= 0.92) -> merged or add_source ;
- distinct event windows -> create_new.

### S6.5 - Entity resolution

Fichier : `supabase/functions/_shared/memory/memorizer/entity_resolver.ts`.

Reference archi : `## Entity resolution` (incluant cardinalite et anti-noise).

Implementer :

- normalization ;
- alias match ;
- cardinality-aware matching (registry charge depuis JSON) ;
- embedding match avec seuils ;
- LLM judge en zone grise ;
- anti-noise heuristique (3+ messages / 2+ topics avant creation).

DoD :

- scenario `12_entity_father_aliases` passe en dry-run ;
- pas d'entite "boulangerie" creee dans fixtures ;
- plusieurs soeurs distinctes restent distinctes.

### S6.6 - Linking topic / entity / action deterministe

Fichiers :

```text
memorizer/link_topic.ts
memorizer/link_entity.ts
memorizer/link_action.ts
```

Reference archi :

- `## Topic linking` ;
- `## Entity linking` ;
- `## Action linking` (rappel : action_link reconstruit cote systeme).

Pour `link_action.ts` :

- depuis `kind='action_observation'` + plan_signals (deja injectes au runtime), construire la row `memory_item_actions` ;
- ajouter rows dans `memory_item_action_occurrences` pour chaque occurrence_id du contexte.

DoD :

- scenario `07_action_missed_walk` passe en dry-run ;
- pas de UUID action invente par le LLM (uniquement IDs venant du contexte).

### S6.7 - Persist en dry-run

Fichier : `supabase/functions/_shared/memory/memorizer/persist.ts`.

Action en mode dry-run :

- ecrire dans `memory_extraction_runs` (audit reel) ;
- ecrire dans `memory_message_processing` (status="completed") ;
- NE PAS ecrire dans `memory_items`, `memory_item_*` ;
- logger les candidates dans `metadata.dry_run_candidates` du extraction_run.

Flag : `memory_v2_memorizer_dry_run_enabled`.

DoD :

- 0 row creee dans `memory_items` en mode dry-run ;
- toutes les decisions sont visibles dans `metadata.dry_run_candidates`.

### S6.8 - Tests scenarios memorizer

Faire passer en mode dry-run :

- `04_reopen_dormant_cannabis` ;
- `06_dated_event_friday` ;
- `07_action_missed_walk` ;
- `08_strong_statement_self_blame` ;
- `12_entity_father_aliases`.

DoD :

- pour chaque scenario, les `created_items` attendus apparaissent dans `dry_run_candidates` ;
- les `forbidden_items` n'apparaissent pas ;
- les entities attendues sont resolues correctement.

### S6.9 - Checkpoint S6

- [ ] memorizer extract + valide + dedupe + linke en dry-run ;
- [ ] idempotence batch_hash et message_processing testees ;
- [ ] 5+ scenarios memorizer passent ;
- [ ] cout LLM mesure et compare au budget cible ;
- [ ] aucune ecriture durable.

## Sprint 7 - Memorizer write canary

**But** : activer l'ecriture durable sur un segment reduit, en surveillant les metriques.

Reference archi : `### Phase 5 - Memory write canary`, `### Regles d'ecriture initiale (candidate vs active)`.

### S7.1 - Implementer regles candidate -> active

Reference archi : `### Regles d'ecriture initiale (candidate vs active)`.

Dans `persist.ts` (S6.7), retirer le mode dry-run et ajouter :

- decision write status (`active` vs `candidate` vs reject) selon les regles ;
- application des regles `requires_user_initiated` ;
- transaction Postgres avec extraction_run_id partage.

DoD :

- items haute confidence -> active ;
- items zone grise -> candidate ;
- jamais d'item active sans source.

### S7.2 - Job promotion candidate -> active

Fichier : `supabase/functions/promote-candidate-memory-items/index.ts` (cron nightly).

Reference archi : `### Promotion candidate -> active`.

Implementer :

- selection candidates >= 7j ;
- check des regles de promotion ;
- update status + log dans `memory_change_log` (operation_type='promote').

DoD :

- candidate reaffirme 2+ fois -> promote ;
- candidate sans signal apres 14j -> archived (job d'expiration, peut etre dans le meme cron) ;
- log d'audit complet.

### S7.3 - Activation canary

Flag : `memory_v2_memorizer_enabled`.

Rollout :

- 5% des users actifs (selecteur deterministe par `user_id` hash) ;
- monitoring 48-72h ;
- gates :
  - `statement_as_fact_violations = 0` ;
  - `invalid_injection_simulated_count = 0` (le loader V2 n'est pas encore actif, on simule) ;
  - `cost_per_user_eur` dans le budget ;
  - `duplicate_rate < 5%`.

DoD :

- 5% canary stable 72h sans alerte critique ;
- decision documentee dans une note pour passer a 25%.

### S7.4 - Checkpoint S7

- [ ] memorizer ecrit durablement pour 5% ;
- [ ] candidate -> active job tourne nightly ;
- [ ] metriques canary OK ;
- [ ] **PAS d'extension a 100% avant Sprint 8** (correction d'abord).

## Sprint 8 - Correction et redaction

**But** : que le user puisse corriger et oublier AVANT que le loader V2 soit actif largement.

Reference archi : `### Phase 6 - Correction et oubli minimal`, `## Memory redaction job`, `## Correction, oubli, conflits`.

### S8.1 - Detection signal correction (deja fait S5.1, verifier)

Verifier que `signal_detection.ts` detecte correctement :

- "non c'est pas ca" ;
- "tu as mal compris" ;
- "corrige ca" ;
- "oublie ca" ;
- "supprime cette info".

DoD :

- 20+ tests unitaires.

### S8.2 - Target resolution

Fichier : `supabase/functions/_shared/memory/correction/target_resolver.ts`.

Reference archi : `### Target resolution` (ordre 6 etapes).

DoD :

- scenario `09_correction_wrong_memory` passe en dry-run.

### S8.3 - Operations de correction

Fichier : `supabase/functions/_shared/memory/correction/operations.ts`.

Implementer :

- `invalidate(item_id, reason, source_message_id)` ;
- `supersede(old_id, new_item, source_message_id)` ;
- `hide(item_id, reason, source_message_id)` ;
- `delete(item_id, reason, source_message_id)` (avec redaction immediate).

Toutes les operations :

- update du row ;
- insert dans `memory_change_log` ;
- increment `pending_changes_count` du topic ;
- purge du payload state.

DoD :

- chaque operation a un test unitaire ;
- `memory_change_log` cree systematiquement.

### S8.4 - Memory redaction job

Fichier : `supabase/functions/memory-redaction-job/index.ts`.

Reference archi : `## Memory redaction job` (procedures hide et delete).

Action :

- pour chaque item passe a `hidden_by_user` ou `deleted_by_user`, propager :
  - sources : redacter `evidence_quote`, `evidence_summary` ;
  - topics : trigger recompaction urgente ;
  - search_doc : regenerer apres recompaction ;
  - payload state : purge tous les users ayant l'item.
- pour delete : redacter `content_text`, `normalized_summary`, `embedding`, `canonical_key`, `source_hash`.

Flag : `memory_v2_redaction_job_enabled`.

DoD :

- scenario `10_forget_sensitive_item` passe **completement** :
  - item.content_text = '' ;
  - source.evidence_quote = NULL ;
  - topic.synthesis ne contient plus l'idee ;
  - prochain prompt n'a aucune trace.

### S8.5 - Confirmation user en cas d'ambiguite

Reference archi : `### Prudence correction`.

Implementer dans le runtime :

- si target resolution a confidence < 0.7 -> Sophia demande confirmation au tour suivant ;
- ne rien modifier ;
- attendre confirmation explicite.

DoD :

- scenarios avec correction ambigue ne corrompent pas la memoire.

### S8.6 - Checkpoint S8 (BLOQUANT pour S9)

- [ ] correction + redaction job operationnels ;
- [ ] scenario `10_forget_sensitive_item` passe sans defaut ;
- [ ] scenario `09_correction_wrong_memory` passe ;
- [ ] aucune trace d'item delete dans synthesis, search_doc, sources ;
- [ ] flag `memory_v2_corrections_enabled` actif sur le canary.

## Sprint 9 - Loader V2 actif (canary -> 100%)

**But** : passer le runtime en V2 progressivement.

Reference archi : `### Phase 7 - Loader V2 actif`.

### S9.1 - Switch shadow -> active sur canary 5%

Flag : `memory_v2_loader_enabled` true pour 5% des users.

Action :

- les users du canary recoivent leur reponse construite a partir du payload V2 ;
- monitoring 72h.

Gates :

- p95 memory latency < 250ms ;
- `invalid_injection_count = 0` ;
- `sensitive_excluded_count` aligne avec l'attendu ;
- pas de regression observee dans les conversations samples.

DoD :

- 5% stable 72h sans alerte ;
- comparaison shadow V1 vs V2 satisfaisante (jaccard mediane > 0.5).

### S9.2 - Rollout 25% / 50% / 100%

Pour chaque palier :

- attendre 48-72h stable au palier precedent ;
- monitorer toutes les metriques ;
- desactiver le flag immediatement si une metrique critique depasse.

DoD :

- 100% des users en V2 ;
- aucune regression observee ;
- V1 loader peut etre desactive (mais pas supprime, pour rollback potentiel).

### S9.3 - Checkpoint S9

- [ ] V2 loader actif a 100% ;
- [ ] V1 loader pret pour rollback Niveau 1 si besoin ;
- [ ] dashboard memoire stable.

## Sprint 10 - Topic compaction

**But** : maintenir des syntheses de topics fraiches, validees, sans hallucination.

Reference archi : `## Compaction MVP`, `## Annexe A - Prompts canoniques` -> `### A.3`, `### Validation post-compaction (cote systeme)`.

### S10.1 - Trigger de compaction

Fichier : `supabase/functions/trigger-topic-compaction/index.ts` (cron + on-demand).

Reference archi : `## Compaction MVP` -> Triggers.

Logic :

- selectionner topics avec `pending_changes_count >= 5` ;
- ou trigger explicite (correction recente, weekly review) ;
- enqueue les topics a compacter.

DoD :

- topic touche par correction = trigge sous 1 minute ;
- compaction non-urgente = trigge nightly.

### S10.2 - Implementer la compaction

Fichier : `supabase/functions/_shared/memory/compaction/topic_compaction.ts`.

Reference archi : `## Compaction MVP`, `## Annexe A - Prompts canoniques` -> `### A.3`.

Action :

- charger items actifs lies au topic ;
- appel LLM avec prompt v1 ;
- parser claims[] avec supporting_item_ids ;
- validation post-compaction (cf. ref archi) ;
- update synthesis, search_doc, search_doc_embedding, summary_version, search_doc_version, last_compacted_at, sensitivity_max ;
- reset pending_changes_count.

DoD :

- compaction d'un topic test reussit ;
- claims supportes par items actifs uniquement ;
- aucun statement sensible cite litteralement.

### S10.3 - Recalcul de `sensitivity_max`

Reference archi : `### user_topic_memories.sensitivity_max`.

Implementer le recalcul automatique sur :

- compaction reussie ;
- correction appliquee ;
- item ajoute / change.

DoD :

- changements bien repercutes ;
- topic synthesis sensitivity policy appliquee correctement (S5.4).

### S10.4 - Checkpoint S10

- [ ] compaction trigger + run + validation operationnels ;
- [ ] aucune compaction unsupported claim sur scenarios ;
- [ ] sensitivity_max correctement maintenu ;
- [ ] flag `memory_v2_topic_compaction_enabled` actif a 100%.

## Sprint 11 - Action signals + cross-topic profile

**But** : finaliser les surfaces specifiques au coaching Sophia.

Reference archi : `### Phase 9 - Action observations`, `### Phase 10 - Cross-topic profile on-demand`.

### S11.1 - Action observations enrichies ✅

Fichier : `supabase/functions/_shared/memory/memorizer/action_observations.ts`.

Reference archi : `## Action linking`, `### A.1` -> `#### action_link`.

Action :

- detecter pattern `single_occurrence | week_summary | streak_summary` depuis `action_occurrences` recents ;
- generer `action_observation` items ;
- linker via `memory_item_actions` + `memory_item_action_occurrences` ;
- detecter `possible_pattern` apres 3 obs / 2 sem.

DoD :

- scenario `07_action_missed_walk` passe completement (write actif) ;
- pas de pattern materialise depuis 1 ou 2 occurrences.

### S11.2 - Cross-topic profile en production ✅

Reference archi : `### cross_topic_lookup` + `### Phase 10 - Cross-topic profile on-demand`.

Action :

- activer le pipeline 4 etapes (S5.5) en production ;
- mesurer fallback rate ;
- ajuster les seuils.

Gates :

- `fallback_used_count` < 30% sur fenetre 7j ;
- qualite de reponse aux questions globales validee sur 5 conversations samples.

DoD :

- scenario `05_cross_topic_psychology` passe en production ;
- aucun leak de sensible.

### S11.3 - Weekly review trigger ✅

Fichier : `supabase/functions/trigger-weekly-memory-review/index.ts`.

Reference archi : `## Definition du weekly_review trigger`.

Cron :

- dimanche soir timezone user ;
- idempotent par `(user_id, iso_week, iso_year)`.

Action :

- traiter les messages substantifs non encore primary ;
- compacter topics avec pending_changes_count > 0 ;
- detecter possible_pattern depuis action_observations existantes ;
- mettre a jour last_active_at des topics ;
- reactiver topics dormants pertinents.

DoD :

- une weekly review tourne sans creer de doublons ;
- les topics sont a jour apres execution.

### S11.4 - Endpoint user dashboard memoire ✅

Reference archi : `### Endpoint utilisateur` (dans `## Politique de retention RGPD`).

Implementer (au moins en MVP minimal) :

- `GET /api/memory/me/items` (liste active) ;
- `GET /api/memory/me/entities` ;
- `POST /api/memory/me/items/:id/hide` ;
- `POST /api/memory/me/items/:id/delete`.

DoD :

- un user peut voir ce que Sophia retient et oublier un item explicitement ;
- les actions hide/delete declenchent le redaction job (S8.4).

### S11.5 - Checkpoint S11

- [x] action observations completes en prod ;
- [x] cross-topic profile actif ;
- [x] weekly review tourne sans bug ;
- [x] endpoint user dashboard minimal en place.

Implementation Sprint 11 :

- `supabase/functions/_shared/memory/memorizer/action_observations.ts` detecte `single_occurrence`, `week_summary`, `streak_summary` et garde `possible_pattern` derriere le seuil 3 observations / 2 semaines.
- `supabase/functions/trigger-weekly-memory-review/index.ts` execute une passe idempotente par `(user_id, iso_year, iso_week)`, compacte les topics pending, tente le memorizer weekly si active, materialise les `possible_pattern` candidats et reactive les topics dormants pertinents.
- `supabase/functions/memory-me/index.ts` expose le dashboard minimal : items, entities, hide, delete, avec appel best-effort au redaction job.
- `supabase/migrations/20260501091500_create_memory_weekly_review_runs.sql` ajoute la table d'idempotence weekly review.

## Sprint 12 - Stabilisation et observabilite

**But** : avant de declarer le MVP done, verrouiller observabilite et alerte.

Reference archi : `## Observabilite`, `## SLOs MVP`, `## Procedure de rollback`.

### S12.1 - Reconnecter le memory_plan dispatcher au loader V2 actif ✅

**Probleme a corriger** : le dispatcher produit deja un `memory_plan` pilote par IA
(`context_need`, `memory_mode`, `context_budget_tier`, `targets`, `retrieval_policy`),
et l'ancien context loader l'utilise encore. Mais le loader V2 actif introduit en S9
s'appuie surtout sur `detectMemorySignals()` + `topic_router`, donc il peut contourner
les indications IA du dispatcher.

Principe d'architecture :

```text
dispatcher.memory_plan
  -> decide le perimetre, le budget, les targets et l'intention

runtime signals
  -> ajoutent les garde-fous deterministes (safety, correction, dated, action)

topic_router
  -> choisit le topic actif/candidat uniquement si le plan demande du topic

loader V2
  -> charge les items en respectant le plan + safeguards
```

Objectif :

- `memory_mode=none` doit empecher tout chargement memoire durable V2 ;
- `context_need=minimal` doit limiter le payload V2 au strict minimum ;
- `targeted/broad/dossier` doivent mapper vers des budgets V2 explicites ;
- les `targets` dispatcher doivent piloter le perimetre V2 :
  - `event` -> dated/event memory ;
  - `topic` -> active/candidate topic items ;
  - `global_subtheme` / `global_theme` -> cross-topic/global lookup ;
- `retrieval_policy` doit influencer l'ordre taxonomy/semantic ;
- les signaux runtime (`safety`, `correction`, `dated_reference`, `action_related`)
  restent des garde-fous, pas un remplacement du `memory_plan`.

Cas attendus :

- "Hello" -> `memory_mode=none`, aucun payload durable V2 injecte ;
- "Je me sens vraiment pas bien par rapport a hier" -> support emotionnel + event/dated context cible ;
- "Qu'est-ce que tu sais sur ma psychologie ?" -> cross-topic/global profile lookup ;
- correction/forget -> correction flow prioritaire, pas de retrieval large ;
- safety -> safety-first, sensible autorise seulement selon policy.

### S12.1.1 - Contrat `DispatcherMemoryPlan -> MemoryV2LoaderPlan` ✅

Fichier cible : `supabase/functions/_shared/memory/runtime/dispatcher_plan_adapter.ts`.

Creer un type intermediaire explicite :

```ts
interface MemoryV2LoaderPlan {
  enabled: boolean;
  reason: string;
  retrieval_mode: "topic_continuation" | "cross_topic_lookup" | "safety_first";
  budget: {
    max_items: number;
    max_entities: number;
    topic_items: number;
    event_items: number;
    global_items: number;
    action_items: number;
  };
  requested_scopes: Array<"topic" | "event" | "global" | "action" | "entity">;
  topic_targets: string[];
  event_queries: string[];
  global_keys: string[];
  retrieval_policy: "force_taxonomy" | "taxonomy_first" | "semantic_first" | "semantic_only";
  requires_topic_router: boolean;
  dispatcher_memory_plan_applied: true;
}
```

Mapping attendu :

- `memory_mode=none` -> `enabled=false`, `requires_topic_router=false` ;
- `light` -> petit budget, pas de cross-topic sauf target explicite ;
- `targeted` -> targets explicites + fallback semantique faible ;
- `broad` -> targets + support topic/event/global selon intent ;
- `dossier` -> budget large, inventory/cross-topic assumé ;
- `context_budget_tier=tiny|small|medium|large` -> budgets numeriques stables ;
- `targets[].type=topic` -> `requested_scopes += topic`, topic router autorise ;
- `targets[].type=event` -> `requested_scopes += event`, temporal/dates priorises ;
- `targets[].type=global_subtheme/global_theme` -> `retrieval_mode=cross_topic_lookup`.

DoD :

- tests unitaires de mapping pour `none`, `light`, `targeted`, `broad`, `dossier` ;
- aucun appel DB dans l'adapter ;
- valeurs par defaut conservatrices si le dispatcher sort un plan incomplet.

### S12.1.2 - Integrer le plan dans `runMemoryV2ActiveLoader` ✅

Fichiers cibles :

- `supabase/functions/_shared/memory/runtime/active_loader.ts` ;
- `supabase/functions/sophia-brain/router/run.ts`.

Action :

- passer `contextual.dispatcherResult.memory_plan` a `runMemoryV2ActiveLoader` ;
- appeler `buildMemoryV2LoaderPlan(memory_plan, signals)` avant le topic router ;
- si `enabled=false`, retourner un resultat actif vide ou `null` avec raison `dispatcher_memory_none` ;
- ne pas appeler `routeTopic` quand `requires_topic_router=false` ;
- choisir `retrieval_mode` depuis le loader plan, puis appliquer les overrides safety/correction ;
- transmettre budget/scopes/targets a `loadMemoryV2Payload` ;
- logger :
  - `dispatcher_memory_plan_applied=true` ;
  - `dispatcher_memory_mode` ;
  - `dispatcher_context_need` ;
  - `loader_plan_requested_scopes` ;
  - `loader_plan_reason`.

DoD :

- `Hello` avec `memory_mode=none` ne charge aucun item et ne route pas de topic ;
- le topic router ne peut plus "inventer" un besoin memoire si le dispatcher dit none ;
- fallback V1 intact si le loader V2 actif plante.

### S12.1.3 - Etendre `loadMemoryV2Payload` pour respecter scopes/budgets ✅

Fichier cible : `supabase/functions/_shared/memory/runtime/loader.ts`.

Action :

- ajouter `loader_plan?: MemoryV2LoaderPlan` a `LoadMemoryV2PayloadInput` ;
- limiter les requetes aux `requested_scopes` ;
- appliquer les budgets numeriques par scope ;
- `global_theme/global_subtheme` doivent declencher `cross_topic_lookup` avec domain keys ;
- `event` doit charger events datés si temporal window, sinon query/event fallback faible ;
- `action` doit charger action observations seulement si scope action demandé ou hint action_related ;
- garder `assertOnlyActiveMemoryItems` et sensitivity filter comme garde-fous non negociables.

DoD :

- tests montrent que `requested_scopes=["event"]` ne charge pas topic/global ;
- tests montrent que `requested_scopes=["global"]` ne depend pas du topic actif ;
- budget max respecte meme si DB retourne trop de rows.

### S12.1.4 - Harmoniser topic router et cross-topic ✅

Action :

- topic router uniquement si :
  - scope `topic` demandé ;
  - ou besoin de continuer un topic actif ;
  - ou `retrieval_mode=topic_continuation`.
- cross-topic/global inventory ne doit pas etre force dans un topic actif ;
- correction/forget doit court-circuiter retrieval large et aller vers target resolution.

DoD :

- scenario cross-topic profile ne reste pas bloque sur le dernier topic actif ;
- scenario correction ne charge pas un dossier large ;
- scenario side-note garde topic actif sans augmenter le payload.

### S12.1.5 - Golden scenarios et tests de non-regression ✅

Ajouter/renforcer les tests :

- small-talk / greeting :
  - user: "Hello"
  - attendu: aucun payload durable V2, pas de topic routing obligatoire.
- dated distress :
  - user: "Je me sens vraiment pas bien par rapport a hier"
  - attendu: event/dated + active topic si pertinent, budget targeted.
- cross-topic inventory :
  - user: "Qu'est-ce que tu sais sur ma psychologie ?"
  - attendu: cross-topic/global profile, pas seulement active topic.
- direct help no-memory :
  - user: "Aide-moi a repondre a ce message"
  - attendu: none/light selon memory_plan, pas de dossier.
- safety :
  - safety_first override, sensible autorise selon policy.

DoD :

- `memory_v2_eval` couvre ces cas ;
- logs de test exposent le `MemoryV2LoaderPlan` final ;
- jaccard shadow/active reste interpretable parce que le perimetre est explicite.

### S12.1.6 - Rollout gate specifique ✅

Avant reprise du rollout loader V2 :

- verifier sur samples que `memory_mode=none` produit 0 item injecte ;
- verifier que les demandes broad/dossier chargent plus que targeted ;
- verifier que cross-topic profile n'est pas sticky sur active topic ;
- monitorer :
  - `memory.runtime.active.dispatcher_plan_missing_count` ;
  - `memory.runtime.active.topic_router_skipped_count` ;
  - `memory.runtime.active.memory_none_item_count` doit rester 0 ;
  - `memory.runtime.active.cross_topic_fallback_rate`.

DoD :

- tests unitaires sur le mapping `DispatcherMemoryPlan -> MemoryV2 loader plan` ;
- golden scenarios small-talk / dated distress / cross-topic inventory passent ;
- logs `memory.runtime.active.loaded` incluent `dispatcher_memory_plan_applied=true` ;
- aucune regression sur `memory_v2_eval` ;
- le topic router ne peut plus charger un topic si `memory_mode=none`.

### S12.2 - Dashboard memoire ✅

Creer un dashboard avec :

- metriques runtime ;
- metriques memorizer ;
- metriques compaction ;
- metriques privacy (sensitive injection count) ;
- cost per user.

DoD :

- dashboard accessible a l'eng via `get-memory-scorecard` / `get-memory-trace` et le scorecard ops `buildMemoryV2OpsScorecard` ;
- vue par user disponible pour debug via `get-memory-scorecard`, `get-memory-trace`, `memory-me` et `scripts/export_memory_v2_audit_bundle.mjs`.

Implementation :

- `supabase/functions/_shared/memory/observability.ts` calcule runtime, memorizer, compaction, privacy, cost per user et alertes ;
- `supabase/functions/trigger-memory-v2-alerts/index.ts` lit `memory_observability_events`, calcule le scorecard et route les alertes vers `MEMORY_V2_ALERT_WEBHOOK_URL` si configure ;
- flags ajoutes : `memory_v2_alerts_enabled`, `MEMORY_V2_ALERT_WEBHOOK_URL`.

### S12.3 - Alertes ✅

Reference archi : `## Observabilite` -> `### Alerts critiques`.

Configurer :

- alerte `invalid_injection_count > 0` ;
- alerte `statement_as_fact_violation_count > 0` ;
- alerte `deleted_item_in_payload > 0` ;
- alerte `cross_user_memory_access > 0` ;
- alerte `compaction_unsupported_claim_rate > 5%`.

DoD :

- alertes routees vers le canal eng via webhook optionnel ;
- testees avec faux positifs en local (`observability_test.ts`).

### S12.4 - Tests rollback ✅

Reference archi : `### Tests rollback`.

Executer chaque test :

- disable/re-enable flag loader ;
- quarantine artificielle ;
- retry memorizer sur batch deja completed ;
- rebuild search_doc_embedding.

DoD :

- chaque test passe (`rollback_test.ts`) ;
- procedure de rollback documentee dans `docs/memory-v2-rollback-runbook.md`.

### S12.5 - Final checkpoint MVP

Reference archi : `## Definition of done MVP`.

Verifier :

- [ ] migrations appliquees ;
- [x] RLS tests passent ;
- [x] 12 golden conversations passent ;
- [x] runtime shadow / actif coherent ;
- [x] loader V2 actif respecte le `memory_plan` dispatcher ;
- [x] memorizer dry-run / write idempotent ;
- [x] no statement_as_fact ;
- [x] no invalid/deleted item in payload ;
- [x] correction/forget passent (scenario 10 critique) ;
- [x] entity alias passe (scenario 12) ;
- [x] action missed passe (scenario 7) ;
- [x] p95 loader latency mesuree par scorecard ops ;
- [ ] canary -> 100% sans alerte critique.

**MVP = Done**.

## Sprint 13 - Endurcissement post-MVP (critique avant rollout users)

**Statut** : ouvert, non bloquant pour declarer le MVP done en local mais
**bloquant avant tout rollout users reels**.

**But** : fermer les trois trous restants reperes apres revue d'architecture :

1. `possible_pattern` est detecte mais non visible cote runtime/prompt ;
2. `cross_topic_lookup` n'a pas de mesure de qualite explicite, donc on ne
   sait pas a partir de quand il faut materialiser un global profile ;
3. la regle "aucune memoire invalidee/cachee/supprimee ne doit etre
   reinjectee" n'a pas de garde-fou de detection automatique en runtime.

Reference archi :

- `## Action linking` -> pattern threshold MVP (3 obs / 2 sem) ;
- `### cross_topic_lookup` -> pipeline 4 etapes ;
- `## Memory redaction job` + `### Phase 6 - Correction et oubli minimal`.

### S13.1 - `possible_pattern` end-to-end et visible au prompt

**Probleme observe** :

- la detection deterministe existe deja
  (`memorizer/action_observations.ts` -> `detectActionObservationPattern`,
  `shouldMaterializePossiblePattern`, `buildPossiblePatternObservation`) ;
- la weekly review materialise les candidats
  (`trigger-weekly-memory-review` + `weekly_review.ts`) ;
- MAIS aucune verification systematique que :
  - les items avec `metadata.observation_role='possible_pattern'`
    remontent dans le payload V2 quand le user parle d'un domaine concerne ;
  - le prompt principal Sophia les rend visibles autrement que comme un
    `action_observation` generique ;
  - aucun pattern n'est materialise depuis 1 ou 2 occurrences (regression
    silencieuse possible si la weekly review change).

**Objectif** : `possible_pattern` est extrait **avec** les autres action
observations dans le payload, et le prompt Sophia peut s'en servir
explicitement (ex : "tu sembles rater le sport quand X depuis Y semaines").

#### S13.1.1 - Verifier que le loader expose `possible_pattern`

Fichier cible : `supabase/functions/_shared/memory/runtime/loader.ts`.

Action :

- s'assurer que la query `kind='action_observation'` ne filtre pas sur
  `observation_role` ;
- ajouter un champ `is_possible_pattern: boolean` dans le payload
  (derive de `metadata.observation_role === 'possible_pattern'`) ;
- prioriser les `possible_pattern` actifs dans le scope `action`
  (importance_score plus haut, mais respecter le budget).

DoD :

- test unitaire `loader_test.ts` : si un user a 1 single_occurrence + 1
  week_summary + 1 possible_pattern actifs, et budget action_items = 2,
  les 2 items injectes incluent **toujours** le `possible_pattern`.

#### S13.1.2 - Rendre le pattern lisible dans le prompt principal

Fichier cible : `supabase/functions/sophia-brain/agents/companion.ts` (ou
equivalent qui assemble le prompt durable V2).

Action :

- ajouter une section dediee `Patterns d'execution observes` qui rend
  visible chaque `possible_pattern` actif ;
- format minimal : `[possible_pattern] <content_text> (sur N occurrences,
  fenetre <window_start> -> <window_end>)` ;
- ne pas melanger ces lignes avec les `single_occurrence` /
  `week_summary` qui sont du contexte court terme.

DoD :

- snapshot test du prompt V2 avec un fixture user contenant 1
  `possible_pattern` -> la chaine "Patterns d'execution observes"
  apparait, le content_text est present, l'observation_window est
  affiche.

#### S13.1.3 - Garde-fou : aucun pattern depuis < 3 obs / < 2 sem

Fichier cible :
`supabase/functions/_shared/memory/memorizer/action_observations.ts` (deja
en place) + `weekly_review.ts`.

Action :

- ajouter un test de regression `action_observations_pattern_threshold_test.ts`
  qui essaie 1 obs, 2 obs, 3 obs sur 1 semaine, 3 obs sur 13 jours,
  3 obs sur 14 jours -> seul ce dernier cas materialise un pattern ;
- bloquer toute creation directe de `possible_pattern` hors du chemin
  `buildPossiblePatternObservation` via une assertion runtime dans
  `persist.ts` (rejeter un item kind=action_observation avec
  observation_role=possible_pattern qui ne provient pas de la weekly
  review).

DoD :

- test passe ;
- alerte runtime si un pattern arrive du memorizer principal au lieu de
  la weekly review.

#### S13.1.4 - Golden scenario dedie pattern

Fichier cible :
`supabase/functions/_shared/memory/testing/scenarios/17_possible_pattern_walk.yaml`.

Scenario propose :

```text
seed:
  plan_item_id: walk_evening_v1
  occurrences:
    - week_iso 2026-W14, status=missed
    - week_iso 2026-W14, status=missed
    - week_iso 2026-W15, status=missed
    - week_iso 2026-W16, status=partial
    - week_iso 2026-W16, status=missed

turns:
  - user: "Cette semaine encore j'ai pas reussi a faire ma marche du soir."
    expected:
      payload_contains:
        - kind: action_observation
          metadata.observation_role: possible_pattern
        - mentions: "Patterns d'execution observes"
      no_diagnostic_in_response: true
```

DoD :

- scenario passe en mock + replay ;
- pas de creation de pattern si on retire 1 ou 2 occurrences.

### S13.2 - Mesurer `cross_topic_lookup` et decider du global profile

**Probleme observe** : le pipeline 4 etapes
(`domain_keys` -> semantic top-K -> rerank -> merge) marche en theorie
mais on n'a pas de critere objectif pour decider quand il faut
materialiser un global profile (cf. addendum final, point "Ne pas
materialiser de global profile tant que l'insuffisance n'a pas ete
mesuree").

Objectif : **avoir cette mesure** pour pouvoir trancher.

#### S13.2.1 - Ajouter 4 golden scenarios "broad lookup"

Fichiers cibles :

```text
supabase/functions/_shared/memory/testing/scenarios/
  18_broad_main_problem.yaml
  19_broad_psychology_summary.yaml
  20_broad_blocked_pattern.yaml
  21_broad_relationship_overview.yaml
```

Pour chaque scenario, le seed contient 8 a 12 `memory_items` repartis
sur 3+ topics, avec des `domain_keys` couvrant le sujet large. Le user
pose une question vague.

Assertions :

- `recall_at_5` : sur les top-5 items injectes, combien font partie de
  l'ensemble "items considered relevant" defini en seed ?
- `cross_topic_fallback_used` : true si seul `topic_continuation` a ete
  utilise au lieu de `cross_topic_lookup` ;
- `topic_diversity_in_payload` : nombre distinct de `topic_id` dans le
  payload (doit etre >= 2 pour ces 4 scenarios).

DoD :

- 4 fichiers existent et parsent ;
- runner expose ces metriques dans le rapport.

#### S13.2.2 - Metriques agregees

Fichier cible : `supabase/functions/_shared/memory/observability.ts`.

Ajouter :

- `memory.runtime.cross_topic.recall_at_5` (gauge, par scenario) ;
- `memory.runtime.cross_topic.topic_diversity_avg` (gauge) ;
- `memory.runtime.cross_topic.fallback_rate` (gauge, % des broad queries
  ou on retombe sur topic_continuation) ;
- `memory.runtime.cross_topic.latency_p95_ms`.

DoD :

- `buildMemoryV2OpsScorecard` integre ces metriques ;
- alerte si `recall_at_5 < 0.5` sur 7 jours OU `fallback_rate > 0.4`
  sur 7 jours.

#### S13.2.3 - Decision gate pour global profile

Critere objectif documente :

```text
DECISION : materialiser un global synthesis seulement si, sur 14j de prod
et >= 50 broad queries reelles :
  - recall_at_5 < 0.6 ;
  OU fallback_rate > 0.4 ;
  OU latency p95 > 1500ms cross-topic ;
  OU 3 incidents user "Sophia ne se souvient pas de ma situation globale"
    en feedback.
```

Si seuils franchis :

- creer Sprint S14 (non planifie ici) avec vue materialisee
  `user_global_profile_v1` (claims + supporting_item_ids, meme invariant
  que topic compaction) ;
- jamais avant.

DoD :

- decision gate ecrite dans `docs/memory-architecture.md` section
  "Cross-topic lookup decision gate" ;
- scorecard ops affiche un panneau dedie "Cross-topic health".

### S13.3 - Garde-fou silent correction-recall

**Probleme observe** : aujourd'hui rien n'alerte si un item dont le user
a explicitement dit "oublie ca" reapparait silencieusement dans le
payload (exemple : redaction job a echoue, ou un autre item ressuscite
le meme contenu via un canonical_key proche).

**Objectif** : alerte automatique a la moindre violation de cet
invariant ("aucune memoire invalidated/hidden/deleted ne doit etre
reinjectee").

#### S13.3.1 - Persister les `forbidden_canonical_keys` par user

Migration : `<ts>_create_memory_user_forbidden_keys.sql`.

Schema :

```sql
create table memory_user_forbidden_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_key text not null,
  origin_item_id uuid references memory_items(id) on delete set null,
  origin_status text not null check (origin_status in (
    'invalidated','hidden_by_user','deleted_by_user'
  )),
  reason text,
  created_at timestamptz not null default now(),
  unique (user_id, canonical_key)
);
```

Trigger : sur transition d'un `memory_items` vers `invalidated` /
`hidden_by_user` / `deleted_by_user`, INSERT (idempotent) la cle dans
`memory_user_forbidden_keys`.

DoD :

- delete d'un item -> sa canonical_key est dans
  `memory_user_forbidden_keys` ;
- restore (vers `active`) -> la row correspondante est supprimee.

#### S13.3.2 - Bloquer la re-creation d'item sur `forbidden_canonical_keys`

Fichier cible :
`supabase/functions/_shared/memory/memorizer/persist.ts`.

Action :

- avant tout INSERT `memory_items` actif/candidate, verifier que la
  `canonical_key` n'est pas dans `memory_user_forbidden_keys` du user ;
- si c'est le cas :
  - logger `memory.memorizer.forbidden_recall_blocked` ;
  - ecrire `memory_extraction_runs.metadata.rejected_observations`
    avec `reason='forbidden_canonical_key'` ;
  - ne PAS creer l'item.

DoD :

- test e2e : user delete un item, le memorizer rejoue une extraction
  qui aurait recree l'idee sous une forme proche -> rejete.

#### S13.3.3 - Sanity check loader vs payload

Fichier cible :
`supabase/functions/_shared/memory/runtime/loader.ts` (ou un wrapper
post-loader).

Action :

- apres `loadMemoryV2Payload`, faire un check final :
  pour chaque item dans le payload, verifier que son `canonical_key`
  n'est PAS dans `memory_user_forbidden_keys` du user ;
- si match : retirer l'item, incrementer
  `memory.runtime.correction_recall_violation_count`,
  loguer en alerte critique.

DoD :

- test simule un item active dont la cle est dans la blacklist (cas
  bug DB) -> filtre par le loader, alerte emise ;
- aucune regression sur les golden scenarios existants.

#### S13.3.4 - Alerte critique dediee

Fichier cible : `supabase/functions/trigger-memory-v2-alerts/index.ts`.

Ajouter :

- threshold critique :
  `memory.runtime.correction_recall_violation_count > 0` sur 1h ;
- threshold critique :
  `memory.memorizer.forbidden_recall_blocked > 5` sur 24h (signal que
  le memorizer essaie souvent de recreer des items oublies, donc
  probablement un probleme cote LLM extraction ou cote redaction
  insuffisante).

DoD :

- alertes routees vers `MEMORY_V2_ALERT_WEBHOOK_URL` ;
- test unitaire dans `observability_test.ts`.

### S13.4 - Checkpoint S13

- [ ] `possible_pattern` visible au prompt + golden scenario 17 OK ;
- [ ] 4 golden scenarios cross-topic + metriques recall/fallback OK ;
- [ ] decision gate global profile documentee ;
- [ ] `memory_user_forbidden_keys` en place + bloque les recreations ;
- [ ] sanity check loader vs blacklist actif ;
- [ ] alerte `correction_recall_violation_count > 0` cablee.

**Tant que S13 n'est pas vert, ne pas exposer Memory V2 a des users
reels au-dela d'un alpha tres restreint.**

## Annexe - Recettes utiles

### Comment ecrire un golden scenario rapidement

1. Choisir un objectif testable (ex: "le router doit rester sticky meme sur detail lateral").
2. Ecrire 2-3 turns user.
3. Pour chaque turn, definir UNE assertion centrale.
4. Ajouter 1-2 `forbidden_items` pour verifier les non-extractions.
5. Run en mock pour verifier que le YAML parse.
6. Run en record pour generer fixtures LLM.
7. Run en replay pour verifier que c'est stable.

### Comment debugger un faux switch de topic

1. Activer `memory_v2_runtime_trace_enabled`.
2. Recuperer la trace : `chat_messages.metadata.topic_context` du tour incrimine.
3. Inspecter `last_decision_reason` et `confidence`.
4. Comparer `cosine(message_embedding, active_topic.search_doc_embedding)`.
5. Si zone grise -> vrai cas LLM, ecrire un golden scenario qui le couvre.
6. Si hors zone grise mais decision fausse -> verifier search_doc du topic actif (peut-etre obsolete).

### Comment auditer un user "memoire bizarre"

1. SELECT chat_messages.metadata.topic_context recents.
2. SELECT memory_change_log WHERE user_id ORDER BY created_at DESC LIMIT 50.
3. SELECT memory_extraction_runs WHERE user_id ORDER BY started_at DESC LIMIT 20.
4. SELECT memory_items WHERE user_id AND status='active' ORDER BY observed_at DESC.
5. Cross-checker avec les golden scenarios pour reproduire.

### Comment verifier qu'un delete user a bien purge

```sql
-- contenu doit etre vide
SELECT content_text, normalized_summary, embedding
FROM memory_items
WHERE id = :item_id AND status = 'deleted_by_user';

-- evidence_quote doit etre NULL
SELECT evidence_quote, evidence_summary
FROM memory_item_sources
WHERE memory_item_id = :item_id;

-- topic synthesis ne doit plus contenir l'idee
SELECT synthesis, search_doc
FROM user_topic_memories
WHERE id IN (
  SELECT topic_id FROM memory_item_topics
  WHERE memory_item_id = :item_id
);

-- audit
SELECT * FROM memory_change_log
WHERE target_id = :item_id ORDER BY created_at;

-- post-S13.3 : la canonical_key doit etre blacklistee
SELECT * FROM memory_user_forbidden_keys
WHERE user_id = :user_id AND canonical_key = :canonical_key_of_item;
```

### Comment lire un `possible_pattern`

```sql
-- les patterns actifs d'un user
SELECT mi.id, mi.content_text, mi.metadata->>'observation_role' as role,
       mi.event_start_at as window_start, mi.event_end_at as window_end,
       jsonb_array_length(mi.metadata->'occurrence_ids') as obs_count
FROM memory_items mi
WHERE mi.user_id = :user_id
  AND mi.status = 'active'
  AND mi.kind = 'action_observation'
  AND mi.metadata->>'observation_role' = 'possible_pattern'
ORDER BY mi.observed_at DESC;

-- les observations sources qui ont nourri le pattern
SELECT *
FROM memory_items
WHERE id = ANY (
  SELECT jsonb_array_elements_text(
    (SELECT metadata->'source_observation_ids' FROM memory_items WHERE id = :pattern_id)
  )::uuid
);
```

## Annexe - Liste des fichiers a creer

### Code partage

```text
supabase/functions/_shared/memory/types.v1.ts
supabase/functions/_shared/memory/domain_keys.v1.json
supabase/functions/_shared/memory/domain_keys.ts
supabase/functions/_shared/memory/relation_cardinality.v1.json
supabase/functions/_shared/memory/relation_cardinality.ts
supabase/functions/_shared/memory/prompts/extraction.v1.md
supabase/functions/_shared/memory/prompts/topic_router.v1.md
supabase/functions/_shared/memory/prompts/compaction_topic.v1.md
supabase/functions/_shared/memory/prompts/index.ts

supabase/functions/_shared/memory/runtime/signal_detection.ts
supabase/functions/_shared/memory/runtime/temporal_resolution.ts
supabase/functions/_shared/memory/runtime/topic_router.ts
supabase/functions/_shared/memory/runtime/loader.ts
supabase/functions/_shared/memory/runtime/payload_state.ts
supabase/functions/_shared/memory/runtime/active_topic_state.ts

supabase/functions/_shared/memory/memorizer/batch_selector.ts
supabase/functions/_shared/memory/memorizer/extract.ts
supabase/functions/_shared/memory/memorizer/validate.ts
supabase/functions/_shared/memory/memorizer/dedupe.ts
supabase/functions/_shared/memory/memorizer/entity_resolver.ts
supabase/functions/_shared/memory/memorizer/link_topic.ts
supabase/functions/_shared/memory/memorizer/link_entity.ts
supabase/functions/_shared/memory/memorizer/link_action.ts
supabase/functions/_shared/memory/memorizer/persist.ts
supabase/functions/_shared/memory/memorizer/action_observations.ts

supabase/functions/_shared/memory/correction/target_resolver.ts
supabase/functions/_shared/memory/correction/operations.ts

supabase/functions/_shared/memory/compaction/topic_compaction.ts

supabase/functions/_shared/memory/testing/types.ts
supabase/functions/_shared/memory/testing/runner.ts
supabase/functions/_shared/memory/testing/mock_llm.ts
supabase/functions/_shared/memory/testing/scenarios/01..12_*.yaml
supabase/functions/_shared/memory/testing/fixtures/<scenario_id>/*.json
```

### Edge functions / cron

```text
supabase/functions/memory-redaction-job/index.ts
supabase/functions/promote-candidate-memory-items/index.ts
supabase/functions/trigger-topic-compaction/index.ts
supabase/functions/trigger-weekly-memory-review/index.ts
```

### Migrations (ordre)

```text
1.  <ts>_create_user_entities.sql
2.  <ts>_create_memory_items.sql
3.  <ts>_create_memory_item_sources.sql
4.  <ts>_create_memory_item_topics.sql
5.  <ts>_create_memory_item_entities.sql
6.  <ts>_create_memory_item_actions.sql
7.  <ts>_create_memory_item_action_occurrences.sql
8.  <ts>_create_memory_extraction_runs.sql
9.  <ts>_create_memory_message_processing.sql
10. <ts>_create_memory_change_log.sql
11. <ts>_extend_user_topic_memories_v2.sql
12. <ts>_add_fk_extraction_run_id.sql
13. <ts>_create_updated_at_function_and_triggers.sql
14. <ts>_backfill_user_event_memories.sql
15. <ts>_create_memory_user_forbidden_keys.sql           (S13.3.1)
```

### Fichiers ajoutes par Sprint 13

```text
supabase/functions/_shared/memory/testing/scenarios/17_possible_pattern_walk.yaml
supabase/functions/_shared/memory/testing/scenarios/18_broad_main_problem.yaml
supabase/functions/_shared/memory/testing/scenarios/19_broad_psychology_summary.yaml
supabase/functions/_shared/memory/testing/scenarios/20_broad_blocked_pattern.yaml
supabase/functions/_shared/memory/testing/scenarios/21_broad_relationship_overview.yaml
supabase/functions/_shared/memory/memorizer/action_observations_pattern_threshold_test.ts
```

## Recap final

Ce roadmap couvre 12 sprints MVP + 1 sprint d'endurcissement post-MVP
critique avant rollout users reels, ~17-28 jours de dev focus au total. Il
te permet de livrer Memory V2 sans casser V1, sans creer de mauvaise
memoire, et sans perdre la confiance des users.

Les 4 invariants a ne JAMAIS violer pendant l'implementation :

1. **Aucun souvenir interprete important ne vit uniquement dans une summary.**
2. **Aucune memoire invalidated/hidden/deleted ne doit jamais etre re-injectee.**
3. **Le user doit pouvoir corriger/oublier AVANT que le loader V2 soit large.**
4. **Aucun `possible_pattern` materialise depuis moins de 3 obs sur moins de 2 semaines.**

Reference archi finale : `## Conclusion`.
