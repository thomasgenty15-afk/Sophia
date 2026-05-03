# Sophia Memory V2 - Plan consolide MVP

## Statut du document

Ce document remplace le cadrage trop large de `memory-v2-atomic-architecture-review-plan.md` par un plan MVP consolide.

Il prend le meilleur des deux directions :

- architecture cible atomique, sourcable, corrigeable ;
- simplification forte pour livrer une premiere version robuste ;
- priorite a la fluidite conversationnelle WhatsApp ;
- priorite a la robustesse systeme ;
- priorite a la performance de retrieval et de memorisation ;
- testabilite par scenarios multi-tours avant activation produit.

Le document ne decrit pas une plateforme memoire finale a 18 mois.
Il decrit la meilleure premiere version soutenable de Memory V2 pour Sophia.

## Decisions Sprint 0 (verrouillees)

Les decisions ouvertes du Sprint 0 ont ete tranchees apres inspection de l'etat reel du repo.

| Decision | Valeur figee | Source |
|---|---|---|
| Version Postgres | **17** | `supabase/config.toml` (`major_version = 17`) |
| Strategie unique constraint sources | **`nulls not distinct`** | Postgres >= 15 disponible |
| Modele d'embedding | **`gemini-embedding-001`** | deja en place dans `supabase/functions/_shared/llm.ts` (`geminiEmbed`) |
| Dimension d'embedding | **768** | tronque deja a 768 dans `geminiEmbed` (`outputDimensionality = 768`) |
| Champ `embedding_model` (valeur stockee) | **`gemini-embedding-001@768`** | identifiable + versionnable |
| Modele LLM extraction memorizer | **`gemini-3-flash-preview`** | aligne avec `topic_memory.ts` existant, JSON mode, FR-strong, derniere generation Gemini Flash |
| Modele LLM topic router (zone grise) | **`gemini-3-flash-preview`** | meme provider, prompt court |
| Modele LLM compaction topic | **`gemini-3-flash-preview`** | meme provider, qualite suffisante MVP |
| Domain keys v1 | **liste fermee** definie en `## Taxonomie domain_keys.v1`, format `domain.subdomain` (`.general` si pas de subdivision) | versionnee `v1`, evolution via review humaine |
| Sensitivity categories MVP | **12 tags** : `addiction, mental_health, family, relationship, work, financial, health, sexuality, self_harm, shame, trauma, other_sensitive` | non combinatoire au MVP, juste tag |
| Relation cardinality registry | **defini** en `### Cardinalite des relations` (charger via `relation_cardinality.v1.json`) | extensible |
| Retention RGPD | **`chat_messages`** indef tant que user actif, hard delete 30j apres suppression compte ; **`memory_items deleted_by_user`** soft 90j puis hard ; **`memory_extraction_runs`** 90j ; **`memory_change_log`** 365j | cf. `## Politique de retention RGPD` |
| Fenetre canary | **5% -> 25% -> 50% -> 100%**, 48-72h stable par palier | cf. `## Procedure de rollback` |
| Variables d'env runtime | `GEMINI_EMBEDDING_MODEL=gemini-embedding-001` (deja default), `MEMORY_V2_EXTRACTION_MODEL=gemini-3-flash-preview`, `MEMORY_V2_ROUTER_MODEL=gemini-3-flash-preview`, `MEMORY_V2_COMPACTION_MODEL=gemini-3-flash-preview` | a ajouter dans `supabase/env.example` |

Notes operationnelles :

- on garde `vector(768)` pour cette V2 -> coherence avec 90% du schema existant ;
- la table `user_global_memories` utilise deja `vector(1536)` pour `semantic_embedding` (V1) -> ne PAS la toucher au MVP ; V2 ne lit ni n'ecrit dedans (cf. `## Migration de l'existant`) ;
- l'identifiant `embedding_model` au format `<modele>@<dim>` permet de gerer une eventuelle migration future sans casser les rows existants ;
- aucune autre decision ne doit etre laissee ouverte avant Phase 1 (migrations).

## Decision centrale

La memoire durable de Sophia doit reposer sur des souvenirs atomiques interpretes.

Invariant non negociable :

```text
Aucun souvenir interprete important ne doit vivre uniquement dans une summary.
Tout souvenir durable doit etre atomique, source, corrigeable et filtrable.
```

Complements MVP :

```text
Aucun item durable ne doit etre cree sans provenance.
Aucune extraction ne doit etre appliquee sans extraction_run idempotent.
Aucun domaine memoire ne doit etre invente hors taxonomie controlee.
Aucune memoire invalidee, cachee ou supprimee ne doit etre reinjectee.
Les summaries servent a parler, pas a prouver.
```

## Verdict architectural

On garde :

- `chat_messages` comme verite brute ;
- `memory_items` comme verite interpretee atomique ;
- `memory_item_sources` pour les cas multi-source ou non-message ;
- `user_topic_memories` comme dossiers conversationnels vivants ;
- `user_entities` comme ancres persistantes de personnes, organisations, lieux et projets ;
- tables de jointure ciblees au lieu d'un graphe generique ;
- memorizer asynchrone ;
- runtime leger ;
- payload stable ;
- correction et oubli prevus des le debut ;
- compaction uniquement des topics au MVP ;
- global profile calcule on-demand au MVP ;
- golden conversations avant activation.

On reporte :

- `memory_edges` generique ;
- `user_global_memory_views` materialisees ;
- `memory_summary_deltas` ;
- `memory_operations` complexe ;
- behavioral patterns materialises ;
- risk signals materialises ;
- global memory verifier complet ;
- graphe relationnel avance.

On ajoute :

- `user_entities` ;
- `memory_item_entities` ;
- `memory_change_log` minimal ;
- `embedding_model` partout ou il y a embedding ;
- `version` pour optimistic locking ;
- `batch_hash` idempotent pour memorizer ;
- taxonomie fermee `domain_keys.v1` ;
- regle anti-bruit avant extraction ;
- test harness multi-tours.

## Objectifs produit

Sophia doit aider un utilisateur a avancer dans des sujets humains complexes :

- discipline ;
- addiction ;
- sante ;
- sommeil ;
- relations ;
- travail ;
- confiance ;
- habitudes ;
- objectifs personnels ;
- execution quotidienne ;
- reprise apres echec ;
- blocages emotionnels ;
- bilans hebdomadaires ;
- actions planifiees ;
- checks WhatsApp matin et soir.

La memoire doit permettre a Sophia de :

- garder le fil d'un sujet sur plusieurs jours ou semaines ;
- retrouver un sujet dormant sans le confondre avec un sujet proche ;
- relier ce que le user dit a ce qu'il fait vraiment ;
- distinguer un fait, une parole subjective et un evenement ;
- ne pas transformer une emotion ponctuelle en trait psychologique ;
- corriger un mauvais souvenir ;
- oublier une information quand le user le demande ;
- ne pas ressortir du sensible hors contexte ;
- rester rapide dans une conversation WhatsApp ;
- etre auditable en cas de bug ou correction.

## Objectifs systeme

Le MVP doit optimiser trois criteres.

### 1. Fluidite conversationnelle

Le runtime ne doit pas devenir lourd.

Le tour conversationnel doit rester simple :

```text
message user
  -> detection signaux rapides
  -> topic router sticky
  -> retrieval leger
  -> payload stable
  -> generation reponse
  -> queue memorizer async
```

Le runtime ne doit pas :

- extraire des souvenirs durables ;
- dedoublonner de maniere complexe ;
- recompacter ;
- relire toute la memoire ;
- faire plusieurs appels LLM auxiliaires par tour ;
- bloquer la reponse utilisateur.

### 2. Robustesse memoire

Le systeme doit empecher les erreurs structurelles classiques :

- faux souvenirs ;
- summaries fictionnelles ;
- mauvais rattachements ;
- doublons d'entites ;
- facts crees depuis des emotions ;
- contradictions non marquees ;
- corrections ignorees ;
- informations sensibles injectees hors contexte ;
- items invalides encore injectes ;
- retries memorizer qui creent des doublons.

### 3. Performance retrieval

Le retrieval doit rester :

- stable d'un tour a l'autre ;
- peu couteux ;
- indexable ;
- observable ;
- testable ;
- explicable.

Les requetes principales doivent etre simples :

- items actifs du topic courant ;
- items actifs d'une entite ;
- items actifs par `domain_keys` ;
- events dans une fenetre temporelle ;
- action observations liees a un plan item ;
- items injectes recemment par payload state.

## Architecture MVP recommandee

Vue d'ensemble :

```text
RAW SOURCES
chat_messages
plan_items
action_occurrences
skill_runs
scheduled_checkins
weekly_reviews

        |
        v

ATOMIC MEMORY
memory_items
  - fact
  - statement
  - event
  - action_observation

        |
        v

PROVENANCE + TARGETED LINKS
memory_item_sources
memory_item_topics
memory_item_entities
memory_item_actions

        |
        v

CONVERSATIONAL VIEWS
user_topic_memories
  - synthesis
  - search_doc
  - search_doc_embedding
  - pending_changes_count

        |
        v

RUNTIME
topic router sticky
3 retrieval modes
payload stable
sensitivity filter

        |
        v

ASYNC MEMORIZER
extract
validate
dedupe
resolve entities
link
compact topic only
audit run
```

Ce schema est volontairement moins general que l'architecture cible.

Le choix important :

```text
MVP = tables ciblees + invariants forts
V2.5 = graphe generique seulement si usage prouve
```

## Migration de l'existant

Le repo contient deja des structures memoire V1. Il faut decider precisement leur sort avant de lancer la Phase 1.

### Inventaire actuel

Tables existantes dans le repo :

- `user_topic_memories` (avec `synthesis`, `synthesis_embedding`, `mention_count`, etc.) ;
- `user_topic_enrichment_log` ;
- `user_event_memories` (avec `event_key`, `event_embedding`, `relevance_until`, etc.) ;
- `user_global_memories` (avec scopes, summaries) ;
- `user_chat_states.temp_memory` ;
- `chat_messages` avec `metadata.topic_context` deja utilise.

Plans V1 a abandonner :

- `topic_memory_links` (propose dans `memory-v2-topic-memory-plan.md`) -> remplace par `memory_item_topics` ;
- `conversation_topic_trace` (propose et deja decide non) -> reste decide non.

### Decisions de migration

#### `user_topic_memories`

Decision : **etendre, ne pas remplacer**.

Actions :

- ajouter les colonnes Phase 1 (`lifecycle_stage`, `search_doc`, `search_doc_embedding`, `search_doc_version`, `pending_changes_count`, `last_compacted_at`, `summary_version`, `sensitivity_max`, `archived_reason`, `merged_into_topic_id`) ;
- backfill `lifecycle_stage` :
  - `status='active'` et `last_enriched_at` recent -> `durable` ;
  - `status='active'` ancien sans usage -> `dormant` ;
  - `status='archived'` ou `status='merged'` -> `archived` ;
- backfill `search_doc` initial = `title || synthesis` (truncate si trop long) ;
- backfill `search_doc_embedding` async via job d'embedding ;
- ne pas toucher `synthesis_embedding` existant pour eviter regression V1.

#### `user_event_memories`

Decision : **migrer en `memory_items kind='event'`** au backfill Phase 1.

Pourquoi : eviter de maintenir 2 systemes events en parallele.

Actions :

- script de migration one-shot lit `user_event_memories` et insere dans `memory_items` :
  - `kind = 'event'` ;
  - `status = 'active'` si `status in ('upcoming','active','recently_past')` ;
  - `status = 'archived'` sinon ;
  - `event_start_at = starts_at` ;
  - `event_end_at = ends_at` ;
  - `time_precision = time_precision` ;
  - `confidence = confidence` ;
  - `embedding = event_embedding` (meme dimension) ;
  - `embedding_model = legacy_v1` ;
  - `metadata.legacy_event_key = event_key` ;
  - `metadata.legacy_event_id = id` ;
- conserver `user_event_memories` en lecture seule pendant 30 jours pour audit ;
- supprimer la table apres validation Phase 6.

Garde-fou :

- l'extraction memorizer Phase 4+ ne doit pas re-creer un event existant (dedupe par `metadata.legacy_event_key` et embedding).

#### `user_global_memories`

Decision : **conserver en parallele jusqu'a Phase 10**, puis evaluer.

Pourquoi : la table est utilisee par des flows V1 (bilans, daily, etc.) qui ne sont pas immediatement migres. La pression de migration est faible car le MVP n'utilise pas de global views materialisees.

Actions Phase 1 :

- ne rien faire de destructif ;
- l'extracteur Phase 4 peut **lire** les global memories existantes pour eviter de re-creer des items deja synthetises, mais ne **doit pas ecrire** dans cette table ;
- les nouveaux memory items portent `domain_keys` qui couvrent le besoin V2.

Decision Phase 10+ :

- si `domain_keys + cross_topic_lookup` suffit -> deprecier `user_global_memories` ;
- sinon -> evaluer materialisation V2.5 via `user_global_memory_views`.

#### `user_topic_enrichment_log`

Decision : **conserver tel quel**, considere comme historique V1.

Pourquoi : sert a l'audit et a l'evolution des topics. Pas un blocker MVP.

Action future : pourrait etre fusionne avec `memory_extraction_runs` si redondance avere.

#### `chat_messages.metadata.topic_context`

Decision : **conserver le champ, evoluer le format**.

Le runtime V1 ecrit deja `topic_context` dans la metadata d'un message. V2 doit :

- continuer a ecrire ce champ pour compatibilite ;
- ajouter `topic_context.router_version = 'memory_v2_router_mvp_1'` ;
- ajouter `topic_context.decision`, `topic_context.confidence`, `topic_context.previous_topic_id` ;
- garder le format JSON souple, pas de migration retroactive.

#### `user_chat_states.temp_memory`

Decision : **versionner les cles**.

V1 utilise `temp_memory.__active_topic_state_v1` et autres cles `_v1`.
V2 utilise `__active_topic_state_v2` et `__memory_payload_state_v2`.

Pendant le shadow et la canary, les deux peuvent coexister sans conflit.

Apres rollout 100% V2, les cles `_v1` peuvent etre purgees.

### Ordre de migration Phase 1

Les FK imposent un ordre strict :

```text
1.  user_entities                       (independent)
2.  memory_items                        (independent, triggers + checks)
3.  memory_item_sources                 (FK -> memory_items, chat_messages)
4.  memory_item_topics                  (FK -> memory_items, user_topic_memories)
5.  memory_item_entities                (FK -> memory_items, user_entities)
6.  memory_item_actions                 (FK -> memory_items)
7.  memory_item_action_occurrences      (FK -> memory_item_actions)
8.  memory_extraction_runs              (independent)
9.  memory_message_processing           (FK -> chat_messages, memory_extraction_runs)
10. memory_change_log                   (independent, FK soft -> chat_messages)
11. ALTER user_topic_memories           (extension colonnes Phase 1)
12. ADD FK extraction_run_id sur tables concernees
13. ADD triggers updated_at sur toutes les tables concernees
14. backfill user_event_memories        (one-shot script, idempotent)
```

Chaque migration est dans un fichier dedie, par ordre de timestamp pour respecter la convention existante.

## Pourquoi pas `memory_edges` au MVP

Un graphe generique est seduisant :

```text
source_type
source_id
target_type
target_id
relation_type
```

Mais au MVP, il pose des problemes pratiques :

- pas de vraies FK ;
- risque de liens orphelins ;
- requetes plus difficiles ;
- debugging plus lent ;
- typage porte par l'application ;
- migrations futures plus risquee ;
- faible valeur tant que les usages sont simples.

Les usages MVP sont previsibles :

- memory item vers topic ;
- memory item vers entity ;
- memory item vers action / plan occurrence ;
- memory item remplace ou invalide un autre item.

Donc on utilise des tables ciblees :

- `memory_item_topics` ;
- `memory_item_entities` ;
- `memory_item_actions` ;
- `superseded_by_item_id` dans `memory_items` ;
- `memory_change_log` pour audit.

`memory_edges` pourra revenir plus tard si un usage ne rentre pas dans ces tables.

## Pourquoi `user_entities` est indispensable

Les topics sont des dossiers conversationnels.
Les entites sont des referents persistants.

Exemples :

- "mon pere" ;
- "papa" ;
- "mon daron" ;
- "ma soeur" ;
- "Tania" ;
- "mon ex" ;
- "mon manager" ;
- "Bruno" ;
- "ma boite" ;
- "mon taf" ;
- "le cannabis" ;
- "mon projet Sophia".

Sans entites, Sophia risque de :

- creer plusieurs topics pour le meme referent ;
- confondre "mon pere" dans un conflit familial et "mon pere" dans un souvenir d'enfance ;
- mal corriger une erreur ("non, c'est ma soeur, pas ma mere") ;
- oublier que Tania apparait dans plusieurs sujets ;
- faire du retrieval seulement par similarite textuelle, sans ancre stable.

Regle conceptuelle :

```text
Topic = fil conversationnel qui evolue dans le temps.
Entity = referent persistant qui peut apparaitre dans plusieurs topics.
Memory item = unite atomique qui peut etre liee a un topic et a plusieurs entities.
```

Exemple :

```text
Topic: conflit avec mon pere
Entity: pere
Memory item: "Le user dit que son pere critique souvent ses choix professionnels."
Links:
  - item -> topic conflit avec mon pere
  - item -> entity pere
```

## Memory item kinds MVP

Le MVP utilise 4 kinds.

```ts
type MemoryItemKind =
  | "fact"
  | "statement"
  | "event"
  | "action_observation";
```

### `fact`

Un fait explicite ou quasi explicite, attribuable au user, au plan ou a une source structuree.

Exemples :

```text
Le user travaille souvent tard le mardi soir.
Le user a un objectif d'arret du cannabis.
Le user prefere recevoir les checks le matin avant 9h.
```

Contraintes :

- ne doit pas venir d'une emotion ponctuelle ;
- doit etre source ;
- doit avoir confidence ;
- doit etre corrigeable.

### `statement`

Une formulation du user conservee comme parole.

Exemples :

```text
"Je veux vraiment arreter le cannabis, mais j'ai peur de perdre mes potes."
"J'ai l'impression de toujours tout gacher."
"Je veux redevenir quelqu'un de fiable."
```

Contraintes :

- ne jamais transformer automatiquement en verite objective ;
- garder comme statement si les mots exacts comptent ;
- sensible par defaut si auto-jugement fort, addiction, sante mentale ou relation intime ;
- citation litterale interdite par defaut si sensible.

### `event`

Un evenement date ou quasi date.

Exemples :

```text
Soiree difficile avec des amis fumeurs vendredi soir.
Discussion tendue avec son pere dimanche.
Entretien important la semaine prochaine.
```

Contraintes :

- doit avoir `event_start_at` ou fenetre temporelle ;
- doit avoir `time_precision` ;
- ne pas laisser le LLM deviner seul la date ;
- utiliser la resolution temporelle runtime quand possible.

### `action_observation`

Une observation interpretee depuis les actions, checks ou occurrences du plan.

Exemples :

```text
La marche du soir a ete ratee deux fois cette semaine, avec fatigue mentionnee comme obstacle.
Le user reussit mieux les actions courtes placees le matin.
Le check du soir montre une baisse d'energie recurrente sur trois jours.
```

Contraintes :

- ne pas dupliquer les occurrences ;
- relier a `plan_item_id` et/ou `occurrence_ids` ;
- ne pas creer un pattern depuis un seul echec ;
- pattern avance reporte en V2.5.

## Ce qui n'est pas un kind MVP

Les types suivants ne sont pas des kinds MVP :

- `preference` ;
- `goal` ;
- `boundary` ;
- `behavioral_pattern` ;
- `risk_signal` ;
- `correction_note`.

Ils vivent en metadata :

```json
{
  "statement_role": "goal"
}
```

```json
{
  "statement_role": "boundary"
}
```

```json
{
  "fact_role": "preference"
}
```

```json
{
  "observation_role": "possible_pattern"
}
```

Promotion future :

- un `behavioral_pattern` materialise peut etre ajoute quand il y a assez d'observations ;
- un `risk_signal` materialise peut etre ajoute quand safety flows sont stabilises ;
- un `correction_note` materialise peut etre ajoute si les corrections deviennent complexes.

## Status MVP

```ts
type MemoryItemStatus =
  | "candidate"
  | "active"
  | "superseded"
  | "invalidated"
  | "hidden_by_user"
  | "deleted_by_user"
  | "archived";
```

### `candidate`

Item propose mais pas encore promu.

Utilisation :

- extraction avec confiance moyenne ;
- nouvel item potentiellement durable mais pas encore confirme ;
- item issu d'un topic candidate.

TTL recommande :

```text
candidate non reactive apres 14 jours -> archived
candidate non lie a topic/entity/action -> archived
candidate faible confidence < 0.55 -> reject ou archived
```

### Regles d'ecriture initiale (candidate vs active)

Probleme : le loader ne charge que `status = 'active'`. Il faut donc trancher precisement ce que le memorizer ecrit en active vs candidate.

#### Ecrire directement en `active`

```text
Conditions toutes reunies :
  - confidence >= 0.75
  - source claire (source_message_id non NULL OU memory_item_sources >= 1)
  - validation deterministe OK (kind coherent, domain_keys valides, pas de diagnostic)
  - lien topic OU entity OU action a confiance >= 0.70
  - pas un sensitive critique mal compris

Cas typiques :
  - fact venant d'une affirmation explicite et reaffirmee
  - statement evident dans le fil conversationnel
  - event date deterministiquement
  - action_observation avec plan_item_id confirme
```

#### Ecrire en `candidate`

```text
Au moins UNE des conditions :
  - 0.55 <= confidence < 0.75
  - lien topic/entity ambigu (zone grise router/resolver)
  - statement sensible mais formulation incertaine
  - event sans date precise mais probable
  - action_observation sans plan_item_id confirme
  - first occurrence d'une information potentiellement importante mais non confirmee
```

#### Rejeter (ne pas ecrire du tout)

```text
Au moins UNE des conditions :
  - confidence < 0.55
  - pas de source identifiable
  - small talk / ack / trivial
  - duplicate exact d'un item recent
  - diagnostic psychologique
  - statement mal classe en fact
```

Les rejets sont consignes dans `memory_extraction_runs.rejected_item_count` et dans `metadata.rejected_observations[]` pour audit.

### Promotion `candidate` -> `active`

Un candidate peut etre promu en active si AU MOINS UNE :

```text
1. Reaffirmation user : meme idee re-formulee dans une nouvelle conversation
   -> add source, confidence += 0.10, promote to active si >= 0.75
2. Confirmation explicite : Sophia a verifie ("tu as bien dit que..."?), user a confirme
   -> active immediat
3. Lien topic devenu durable : le topic candidate est passe durable
   -> les candidates lies au topic sont evalues pour promotion
4. Confirmation par signal action structure : un check WhatsApp confirme l'action_observation
   -> active immediat
5. Cross-validation : meme idee retrouvee dans une autre source independante
   -> add source, promote to active
```

Pipeline de promotion (job nightly + on-demand) :

```text
1. SELECT candidates WHERE created_at > now() - 30 days
2. Pour chaque candidate :
   a. Compter sources independantes -> si >= 2, promote
   b. Verifier confidence updates accumules
   c. Verifier topic durabilite
3. Update status = 'active' si conditions reunies
4. Log memory_change_log (operation_type=promote, target_type=memory_item)
   - Note : ajouter 'promote' aux operation_types autorises (voir SQL plus bas)
5. Increment topic.pending_changes_count
```

### Expiration `candidate`

```text
candidate sans aucune source nouvelle apres 14 jours -> archived
candidate sans lien topic/entity/action apres 7 jours -> archived
candidate sensible avec confidence < 0.65 apres 7 jours -> archived plus vite
candidate dans topic archived -> archived par cascade soft
```

Job nightly d'expiration :

```sql
UPDATE memory_items
SET status='archived',
    metadata = metadata || jsonb_build_object('archived_reason', 'candidate_expired')
WHERE status='candidate'
  AND created_at < now() - interval '14 days'
  AND id NOT IN (
    SELECT memory_item_id FROM memory_item_topics WHERE status='active'
    UNION
    SELECT memory_item_id FROM memory_item_entities
    UNION
    SELECT memory_item_id FROM memory_item_actions
  );
```

### `active`

Item utilisable par le loader.

Regle dure :

```text
Le loader ne charge que status = active.
Exception: correction flow peut chercher dans superseded/invalidated pour audit, mais jamais pour prompt normal.
```

### `superseded`

Item remplace par un autre.

Exemple :

```text
Ancien: "Le user prefere faire du sport le soir."
Nouveau: "Le user se rend compte qu'il tient mieux le sport le matin."
```

### `invalidated`

Item faux ou mal compris.

Exemple :

```text
Sophia a compris que Tania etait la soeur du user, mais Tania est son ex.
```

### `hidden_by_user`

Le user demande de ne plus utiliser l'information.
Le contenu peut rester pour audit interne, mais jamais dans le prompt.

### `deleted_by_user`

Le user demande suppression.

Action recommande :

```text
status = deleted_by_user
content_text = ''
normalized_summary = ''
embedding = null
metadata.redacted = true
```

Conserver l'ID, timestamps, operation log et metadata minimale pour audit.

### `archived`

Item ancien, peu utile, non sensible, ou candidate expire.
Pas charge par defaut.

## Retrieval modes MVP

Le MVP utilise 3 modes primaires.

```ts
type RetrievalMode =
  | "topic_continuation"
  | "cross_topic_lookup"
  | "safety_first";
```

Hints :

```ts
type RetrievalHint =
  | "dated_reference"
  | "correction"
  | "action_related";
```

### `topic_continuation`

Mode par defaut.

Utilise quand :

- user continue le fil ;
- pas de demande globale explicite ;
- pas de safety ;
- pas de correction explicite.

Charge :

- topic actif ;
- synthesis topic ;
- top items du topic ;
- entities du topic ;
- events recents du topic ;
- payload stable des derniers tours ;
- conversation recente.

### `cross_topic_lookup`

Utilise quand le user demande une vue large.

Exemples :

```text
Tu peux me parler de ma psychologie ?
Qu'est-ce que tu sais de mon rapport au travail ?
Tu vois quoi comme pattern chez moi ?
Pourquoi je bloque souvent ?
C'est quoi mon probleme principal en ce moment ?
```

Probleme : le mapping question -> domain_keys n'est pas toujours net.
"Pourquoi je bloque souvent ?" ne mappe pas trivialement a un domain_key.

Pipeline de retrieval cross-topic en 4 etapes :

```text
1. Mapping question -> domain_keys candidats
   - regex/keywords sur la question ;
   - intent classifier deterministe ;
   - peut produire 0, 1 ou plusieurs domain_keys.

2. Domain query
   - SELECT memory_items WHERE domain_keys && :candidates
     AND status='active'
   - filtre sensitivity selon regles ;
   - ORDER BY importance_score, observed_at LIMIT 30.

3. Semantic top-K (complement)
   - embedding(question) compare a embedding des memory_items
     status='active' du user ;
   - top-K (k=10) ;
   - rerank par importance_score et fraicheur.

4. Topic-aware rerank
   - boost les items appartenant a des topics durables ;
   - boost les items lies a des entities mentionnees recemment ;
   - boost les items avec confidence elevee ;
   - penalty pour items sensibles tant que pas requested explicitement.

Final : merge des trois sources, dedup par item_id, top-K final (k=12).
```

Pourquoi ce pipeline :

- `domain_keys` est rapide et structure mais incomplet ;
- la semantic search couvre les cas ou la question ne mappe pas ;
- le rerank topic-aware donne du sens a la mosaique resultante ;
- le filtre sensitivity reste applique a chaque etape.

Hint utile : `memory.runtime.cross_topic_lookup.fallback_used_count` pour mesurer combien de fois le domain_keys mapping seul a echoue.

### `safety_first`

Utilise en cas de signal safety.

Charge :

- contexte safety minimal ;
- items safety/sensitive directement pertinents ;
- pas de profil large ;
- pas de sensible gratuit ;
- protocole de reponse safety.

Objectif :

- repondre avec prudence ;
- ne pas faire de coaching long ;
- ne pas noyer le user sous sa memoire ;
- ne pas ressortir des details vulnerables hors contexte.

### Hint `dated_reference`

Declenche :

- resolution temporelle ;
- recherche events dans fenetre ;
- recherche action occurrences si date proche ;
- ajout au payload d'un module `dated_context`.

Exemples :

```text
hier soir
vendredi dernier
la semaine derniere
ce matin
dimanche
il y a deux semaines
```

### Hint `correction`

Declenche :

- target resolution ;
- recherche dans items injectes au tour precedent ;
- recherche dans dernier souvenir cite par Sophia ;
- confirmation si cible ambigu ;
- operation `invalidate`, `supersede`, `hide` ou `delete`.

### Hint `action_related`

Declenche :

- recherche plan item ;
- recherche action occurrence ;
- contexte action du jour ou de la semaine ;
- possible creation `action_observation` par memorizer async.

Exemples :

```text
J'ai pas fait ma marche.
J'ai decale l'action.
J'ai reussi ce matin.
Je suis en retard sur mon plan.
```

## Topic decisions MVP

```ts
type TopicDecision =
  | "stay"
  | "switch"
  | "create_candidate"
  | "side_note";
```

### `stay`

Le message continue le topic courant.

### `switch`

Le user change clairement de sujet.

### `create_candidate`

Un nouveau sujet important emerge.

### `side_note`

Le message contient un detail lateral, mais ne merite pas nouveau topic.

Regle :

```text
Sticky par defaut.
Ne switcher que si le nouveau sujet devient le centre de gravite.
```

## Topic router MVP

Objectif :

```text
Decider le fil conversationnel courant sans alourdir le runtime.
```

Inputs :

- message user ;
- topic actif ;
- `search_doc` du topic actif ;
- derniers messages ;
- topics recents ;
- topics dormants importants ;
- retrieval mode ;
- hints ;
- signal rupture explicite.

Algorithme simple :

```text
1. Si safety_first -> ne pas creer/switch topic sauf signal explicite.
2. Si correction -> garder topic actif sauf correction explicitement liee a autre topic.
3. Calculer similarity(message_embedding, active_topic.search_doc_embedding).
4. Si similarity > 0.55 -> stay.
5. Si similarity < 0.40 -> chercher top-3 topics candidats.
6. Si best_candidate > 0.60 -> switch.
7. Si aucun candidat mais sujet important -> create_candidate.
8. Si zone 0.40-0.55 -> LLM router court.
9. Si message trivial -> side_note ou stay selon contexte.
```

LLM router court seulement en zone grise.

Prompt router doit recevoir :

- dernier message user ;
- 3 a 5 derniers messages ;
- topic actif title + search_doc court ;
- top-3 topics candidats ;
- consigne sticky ;
- decisions possibles.

Le router ne doit pas :

- extraire de souvenirs ;
- repondre au user ;
- creer de summary ;
- faire du global profile.

## Payload stable

Probleme :

Si Sophia recoit une memoire differente a chaque tour, elle parait incoherente.

Solution :

Maintenir un etat leger :

```text
user_chat_states.temp_memory.__memory_payload_state_v2
```

Contenu :

```json
{
  "version": 2,
  "last_turn_id": "...",
  "active_topic_id": "...",
  "items": [
    {
      "memory_item_id": "...",
      "reason": "active_topic_core",
      "ttl_turns_remaining": 3,
      "sensitivity_level": "normal",
      "last_injected_at": "..."
    }
  ],
  "entities": [
    {
      "entity_id": "...",
      "reason": "mentioned_recently",
      "ttl_turns_remaining": 3
    }
  ],
  "modules": {
    "dated_context": {
      "expires_at": "..."
    },
    "action_context": {
      "expires_at": "..."
    }
  }
}
```

Regles :

- item pertinent reste 3 a 5 tours ;
- item invalidated/superseded/hidden/deleted est purge immediatement ;
- modules date/action expirent vite ;
- topic core reste stable tant que topic stay ;
- sensible expire plus vite ;
- budget total fixe.

Budget MVP recommande :

```text
Topic synthesis: 250-500 tokens
Topic items: 5-8 items
Entities: 3-5 entities
Events dated: 0-3 events
Action context: 0-5 facts/actions
Global/cross-topic: 0-8 items
Recent conversation: 4-8 messages
Safety context: minimal and explicit
```

## Prompt sections

Le prompt ne doit pas recevoir un bloc flou "memoire".

Sections recommandees :

```text
1. Conversation recente
2. Topic courant
3. Souvenirs du topic
4. Entites pertinentes
5. Events dates pertinents
6. Contexte plan/action
7. Vue transversale on-demand
8. Contraintes privacy/safety
```

Chaque item injecte doit porter :

- id ;
- kind ;
- statut implicite active ;
- date/fraicheur ;
- confidence ;
- source courte ;
- reason d'injection ;
- sensitivity ;
- consigne d'usage si statement sensible.

Exemple statement sensible :

```text
Memory item mem_123
Kind: statement
Usage: parole du user, pas une verite objective.
Content: Le user a deja formule une pensee tres dure envers lui-meme dans des moments de decouragement.
Do not quote literally unless the user asks for the exact words.
Source: WhatsApp, 2026-04-30.
```

## Runtime pipeline MVP

Pipeline :

```text
1. Insert chat_message user
2. Detect signals
3. Resolve temporal reference if needed
4. Select retrieval mode + hints
5. Topic router sticky
6. Load stable payload
7. Apply sensitivity filter
8. Generate Sophia response
9. Insert chat_message assistant
10. Update active topic state
11. Update memory payload state
12. Queue memorizer async if needed
```

### Step 1 - Insert user message

Le message est brut.

Il contient :

- user_id ;
- channel ;
- content ;
- created_at ;
- metadata initiale ;
- request_id ;
- source scope.

### Step 2 - Detect signals

Detection rapide.

Signaux :

- trivial/ack ;
- correction ;
- forget/delete ;
- safety ;
- explicit topic switch ;
- dated reference ;
- action related ;
- cross-topic/profile query ;
- sensitive content ;
- high emotion.

Cette detection peut etre hybride :

- regex deterministic ;
- petit classifier si deja disponible ;
- pas d'appel LLM lourd par defaut.

### Step 3 - Temporal resolution

Resoudre :

- hier ;
- ce matin ;
- vendredi dernier ;
- la semaine derniere ;
- dimanche soir ;
- il y a deux semaines ;
- dans deux jours.

Sortie :

```json
{
  "raw_expression": "vendredi dernier",
  "resolved_start_at": "...",
  "resolved_end_at": "...",
  "precision": "day",
  "confidence": 0.9,
  "timezone": "Europe/Paris"
}
```

Regle :

```text
Le LLM ne doit pas deviner les dates seul.
Le runtime fournit une fenetre.
```

### Step 4 - Retrieval mode

Regles simples :

```text
Si safety signal -> safety_first
Sinon si question globale -> cross_topic_lookup
Sinon -> topic_continuation
```

Hints attaches :

```text
dated_reference si date trouvee
correction si correction/forget detecte
action_related si plan/action/check detecte
```

### Step 5 - Topic router

Utilise l'algorithme sticky simple.

Trace decision dans :

```text
chat_messages.metadata.topic_context
user_chat_states.temp_memory.__active_topic_state_v2
```

Exemple :

```json
{
  "active_topic_id": "...",
  "decision": "stay",
  "confidence": 0.82,
  "reason": "high_similarity_active_topic",
  "router_version": "memory_v2_router_mvp_1"
}
```

### Step 6 - Loader

Le loader fait des requetes simples.

Pour `topic_continuation` :

```sql
select mi.*
from memory_items mi
join memory_item_topics mit on mit.memory_item_id = mi.id
where mi.user_id = :user_id
  and mi.status = 'active'
  and mit.topic_id = :active_topic_id
order by mi.importance_score desc, mi.observed_at desc nulls last
limit 8;
```

Pour entities :

```sql
select e.*
from user_entities e
join memory_item_entities mie on mie.entity_id = e.id
join memory_item_topics mit on mit.memory_item_id = mie.memory_item_id
where e.user_id = :user_id
  and e.status = 'active'
  and mit.topic_id = :active_topic_id
limit 5;
```

Pour cross-topic :

```sql
select *
from memory_items
where user_id = :user_id
  and status = 'active'
  and domain_keys && :domain_keys
order by importance_score desc, observed_at desc nulls last
limit 12;
```

Pour dated events :

```sql
select *
from memory_items
where user_id = :user_id
  and status = 'active'
  and kind = 'event'
  and event_start_at <= :window_end
  and coalesce(event_end_at, event_start_at) >= :window_start
order by confidence desc, event_start_at desc
limit 5;
```

### Step 7 - Sensitivity filter

Regles :

```text
normal -> injectable si pertinent
sensitive -> injectable si topic actif lie, demande explicite, ou safety_first
safety -> uniquement safety_first
```

### Step 8 - Generation

Le modele principal repond.

Il doit etre instruit :

- ne pas citer literalement les statements sensibles ;
- ne pas presenter les statements comme facts ;
- ne pas inventer de memoire ;
- demander clarification si correction ambigu ;
- rester conversationnel.

### Step 9 - Save assistant message

Sauvegarder :

- response ;
- retrieval mode ;
- topic context ;
- injected memory IDs ;
- sensitivity excluded count ;
- latency ;
- model ;
- prompt version.

### Step 10-11 - Update states

Mettre a jour :

- active topic state ;
- payload state ;
- last injected items ;
- TTL ;
- purges si correction.

### Step 12 - Queue memorizer

Queue seulement si utile.

Triggers :

- message substantif ;
- switch topic ;
- create candidate topic ;
- statement fort ;
- event date ;
- action related ;
- correction/forget ;
- safety ;
- weekly review ;
- skill run completed.

Skip :

- ok ;
- merci ;
- oui/non sans contexte ;
- emoji ;
- bouton simple ;
- acknowledgement court.

## Regle anti-bruit

Le memorizer ne doit pas traiter tout.

Avant appel LLM extraction :

```text
Skip extraction si :
- message length < 30 chars et aucun signal important ;
- ack pur : ok, merci, oui, non, super, parfait ;
- bouton/quick reply sans contenu ;
- confirmation d'action sans contexte ;
- contenu deja extrait dans les dernieres 24h sur meme topic + meme cluster semantique ;
- message assistant uniquement ;
- small talk sans information durable.
```

Cette regle reduit :

- cout ;
- bruit ;
- faux souvenirs ;
- topics inutiles ;
- pollution de summaries.

## Memorizer MVP

Le memorizer est async.

Il ne repond jamais au user.
Il ne bloque jamais la conversation.

Objectifs :

- extraire seulement les souvenirs utiles ;
- valider ;
- dedoublonner ;
- resoudre entites ;
- lier aux topics/actions ;
- appliquer corrections ;
- compacter topics si seuil atteint ;
- logger l'extraction.

Pipeline :

```text
1. Select batch eligible
2. Create extraction_run running
3. Anti-noise filter
4. LLM extraction candidate JSON
5. Deterministic validation
6. Entity resolution
7. Dedupe memory items
8. Topic/action linking
9. Persist transaction
10. Update pending_changes_count
11. Trigger topic compaction if needed
12. Complete extraction_run
```

## Memorizer idempotence

L'idempotence agit sur **deux axes** :

```text
Axe 1 : un meme batch ne doit jamais creer deux fois les memes items.
Axe 2 : un meme message ne doit jamais etre traite plusieurs fois en role primary.
```

L'axe 1 protege contre les retries.
L'axe 2 protege contre le chevauchement de batches et les weekly reviews.
Les deux sont necessaires.

### Axe 1 - Batch idempotence

Definition :

```text
batch_hash = sha256(sorted_message_ids + prompt_version + extraction_model_id)
```

Contraintes :

```sql
unique (user_id, batch_hash, prompt_version)
```

Comportement retry :

```text
Si run completed existe -> skip no-op.
Si run failed existe -> supprimer rows liees extraction_run_id puis retry.
Si run running depuis > 5 minutes -> mark failed puis retry.
Si crash transaction -> aucune row partielle.
```

Tous les rows crees par memorizer portent :

- `extraction_run_id` ;
- `created_by = memorizer_v2` dans metadata ;
- prompt_version ;
- model_name.

### Axe 2 - Message processing tracking

Probleme reel :

```text
Batch A : messages [1, 2, 3]
Batch B : messages [3, 4, 5]
Weekly review : messages [1..30]

Le message 3 peut etre traite 3 fois.
batch_hash protege chaque batch individuellement, pas le message.
La dedupe attrape la majorite mais pas tout.
```

Solution : tracker chaque message comme processe en role explicit.

#### Table `memory_message_processing`

```sql
create table public.memory_message_processing (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  extraction_run_id uuid not null,

  processing_role text not null check (processing_role in (
    'primary',
    'context_only',
    'skipped_noise',
    'reprocessed_for_correction'
  )),
  processing_status text not null default 'completed' check (processing_status in (
    'completed',
    'skipped',
    'failed'
  )),

  prompt_version text not null,
  model_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  unique (user_id, message_id, processing_role)
);

create index idx_memory_message_processing_user_message
  on public.memory_message_processing (user_id, message_id);

create index idx_memory_message_processing_run
  on public.memory_message_processing (extraction_run_id);
```

#### Regles d'eligibilite

```text
Avant de creer un batch :
  Selectionner uniquement les messages user_id ou il n'existe PAS deja
  un row memory_message_processing avec processing_role='primary'
  et processing_status='completed'.

Apres extraction reussie :
  Pour chaque message du batch traite en mode primary :
    INSERT memory_message_processing (
      message_id, extraction_run_id,
      processing_role='primary', status='completed'
    )

Pour les messages utilises comme contexte (mais pas extraits a nouveau) :
  INSERT memory_message_processing (
    message_id, extraction_run_id,
    processing_role='context_only', status='completed'
  )

Pour les messages skip-anti-noise :
  INSERT memory_message_processing (
    message_id, extraction_run_id,
    processing_role='skipped_noise', status='skipped'
  )
```

#### Reprocessing exceptionnel

Cas legitimes ou un message peut etre re-traite :

```text
1. Correction : le user dit "tu as mal compris ce que j'ai dit hier".
   -> creer un row processing_role='reprocessed_for_correction'
   -> NE casse pas l'unique car le role est different
   -> log explicite dans memory_change_log

2. Bug d'extraction connu, replay manuel par l'eng :
   -> processing_role='reprocessed_for_correction' avec metadata.reason='manual_replay'

3. Changement majeur de prompt_version :
   -> decision conscious : re-extraction massive
   -> nouveau processing_role='primary' AUTORISE seulement si le row existant a un prompt_version different ET un flag explicit
```

#### Impact sur weekly review

Le weekly review **ne re-extrait PAS toute la semaine naivement**.

```text
weekly_review traite :
  - les messages substantifs NON encore processes en role='primary' ;
  - compacte les topics avec pending_changes_count > 0 ;
  - detecte les candidats possible_pattern depuis les action_observations existantes ;
  - met a jour last_active_at des topics ;
  - reactive les topics dormants pertinents.

weekly_review NE FAIT PAS :
  - re-extraire des memory_items depuis des messages deja processes ;
  - re-creer des entities deja resolues ;
  - re-faire le travail des batches courants.
```

Sans cette regle, une weekly review = pluie de doublons malgre le batch_hash.

## Extraction LLM

Input limite :

- messages user recents ;
- assistant response precedente si elle cite des souvenirs ;
- topic context ;
- active topic state ;
- injected memory IDs ;
- plan/action signals ;
- temporal resolutions ;
- existing candidate topics/entities shortlist ;
- domain_keys taxonomy ;
- extraction rules.

Output JSON attendu :

```json
{
  "memory_items": [
    {
      "kind": "statement",
      "content_text": "...",
      "normalized_summary": "...",
      "domain_keys": ["addictions.cannabis"],
      "confidence": 0.82,
      "importance_score": 0.75,
      "sensitivity_level": "sensitive",
      "sensitivity_categories": ["addiction"],
      "source_message_ids": ["..."],
      "evidence_quote": "...",
      "event_start_at": null,
      "time_precision": null,
      "entity_mentions": ["papa"],
      "topic_hint": "arret cannabis",
      "metadata": {
        "statement_role": "goal"
      }
    }
  ],
  "entities": [
    {
      "entity_type": "person",
      "display_name": "pere",
      "aliases": ["mon pere", "papa"],
      "relation_to_user": "father",
      "confidence": 0.8
    }
  ],
  "corrections": [],
  "rejected_observations": [
    {
      "reason": "small_talk",
      "text": "merci"
    }
  ]
}
```

## Validation deterministe

Apres extraction, le systeme valide.

Rejeter si :

- pas de source ;
- `content_text` vide ;
- kind hors liste ;
- domain_key hors taxonomie ;
- event sans date ou precision ;
- statement classe en fact alors qu'il contient emotion subjective ;
- confidence < 0.55 ;
- item trop large ;
- diagnostic psychologique ;
- contenu sensible non tagge ;
- source message introuvable ;
- source d'un autre user ;
- doublon exact.

Regles anti-diagnostic :

Rejeter ou reclasser si le contenu affirme :

```text
Le user est depressif.
Le user a un trouble...
Le user est narcissique.
Le user est incapable...
```

Preferer :

```text
Le user dit se sentir tres decourage dans ce contexte.
Le user formule une pensee dure envers lui-meme.
Le user decrit une difficulte recurrente a...
```

## Statement vs fact

Regle dure :

```text
Une emotion subjective ne devient pas un fact objectif.
```

Exemples :

User :

```text
Je me sens nul.
```

Creer :

```text
kind: statement
content: "Le user dit se sentir nul dans ce moment."
```

Ne pas creer :

```text
kind: fact
content: "Le user est nul."
```

User :

```text
J'ai peur de perdre mes potes si j'arrete le cannabis.
```

Creer :

```text
kind: statement
content: "Le user dit avoir peur de perdre ses amis s'il arrete le cannabis."
```

Optionnel fact prudent si repetition ou contexte fort :

```text
kind: fact
content: "Le lien social avec ses amis fumeurs semble etre un enjeu dans l'arret du cannabis."
confidence: 0.65
```

Mais ne pas affirmer :

```text
Le user perdra ses amis s'il arrete le cannabis.
```

## Dedupe memory items

Signals :

- canonical_key ;
- embedding similarity ;
- source overlap ;
- normalized_summary ;
- kind ;
- event window ;
- topic ;
- entity ;
- domain_keys.

Decisions :

```text
create_new
add_source_to_existing
merge_into_existing
supersede_existing
reject_duplicate
```

Seuils MVP :

```text
Exact same source_message_id + same kind + similar normalized_summary -> reject_duplicate
embedding similarity >= 0.92 + same kind + same topic/entity -> merge or add source
embedding 0.80-0.92 -> LLM judge or create candidate
different event window -> create_new
different entity -> create_new unless aliases match
```

## Entity resolution

Pipeline :

```text
1. Normalize mention
2. Exact alias match for user
3. Relation match if mention is generic
4. Embedding search among same entity_type
5. LLM judge if ambiguous
6. Create candidate entity if no match
```

Normalization :

- lowercase ;
- trim ;
- remove possessives when useful (`mon`, `ma`, `mes`) ;
- normalize accents if needed ;
- singular simple ;
- keep original aliases.

### Cardinalite des relations

La regle naive "same relation_to_user et une seule entite active -> reuse" est dangereuse pour les relations multiples. Un user peut avoir plusieurs soeurs, plusieurs ex, plusieurs amis, plusieurs managers dans le temps.

Registry de cardinalite recommandee (`memory/entities/relation_cardinality.v1.json`) :

```ts
const RELATION_CARDINALITY: Record<string, 'usually_single' | 'multiple' | 'time_scoped'> = {
  // Famille typiquement unique
  father: 'usually_single',
  mother: 'usually_single',
  step_father: 'usually_single',
  step_mother: 'usually_single',
  spouse: 'time_scoped',
  current_partner: 'time_scoped',

  // Famille multiple
  sister: 'multiple',
  brother: 'multiple',
  child: 'multiple',
  cousin: 'multiple',
  uncle: 'multiple',
  aunt: 'multiple',
  grandparent: 'multiple',

  // Relations sociales multiples
  friend: 'multiple',
  ex_partner: 'multiple',
  colleague: 'multiple',

  // Relations time-scoped
  manager: 'time_scoped',
  coach: 'time_scoped',
  therapist: 'time_scoped',
  company: 'time_scoped',
  current_company: 'time_scoped',
};
```

Rules de matching :

```text
1. Exact alias match -> reuse entity.

2. relation = usually_single :
   - une seule entite active de cette relation -> reuse.

3. relation = multiple :
   - NE jamais auto-merge sur la seule relation.
   - exiger alias match exact OU embedding >= 0.85 OU LLM judge.

4. relation = time_scoped :
   - plusieurs entites actives possibles si valid_until different.
   - reuse seulement si l'entite courante a status='active' et pas valid_until.
   - sinon : creer nouvelle entite avec metadata.previous_entity_id.

5. Embedding >= 0.85 same type -> reuse/add alias
   (sauf si relation multiple sans alias match).

6. Embedding 0.65-0.85 -> LLM judge.

7. < 0.65 -> create candidate.
```

### Anti-noise entities

Tout nom commun ne doit PAS devenir une entite. Sinon explosion de bruit ("la boulangerie", "mon cafe", "mon lit", "la pluie").

Creer une entite seulement si AU MOINS UNE :

```text
- personne nommee (prenom, nom, ou label relationnel : "mon pere") ;
- relation personnelle importante stable (famille, partenaire, amis recurrents) ;
- organisation durable (employeur, ecole, club) ;
- lieu recurrent significatif (maison familiale, ville d'origine) ;
- projet personnel ou professionnel persistant ;
- groupe relationnel important ("mes potes du sport") ;
- objet ou concept central a un objectif ou addiction ("le cannabis", "mes ecrans").
```

NE PAS creer pour :

```text
- objets banals isoles ("mon telephone", "ma voiture")
  sauf si central au sujet ;
- lieux ponctuels ("la boulangerie", "le metro") ;
- noms communs non recurrents ;
- contexte logistique trivial ;
- emotions/sentiments -> ce sont des kinds (statement), pas des entities ;
- dates/periodes -> resolution temporelle, pas entity.
```

Heuristique pratique au memorizer :

```text
1. Mention nom propre detecte -> candidate entity.
2. Mention "mon/ma X" avec X = relation reconnue -> candidate entity.
3. Mention "mon/ma X" avec X = nom commun ->
   - si X apparait deja dans 3+ messages distincts ET dans 2+ topics -> candidate ;
   - sinon -> NE pas creer entity, garder en metadata.entity_mentions_raw du memory_item.
4. Mention sans possessif d'un nom commun -> NE pas creer.
```

Ce filtre s'applique cote validation deterministe, apres l'extraction LLM.

Metrics anti-bruit :

```text
memory.entities.created_per_day_per_user
memory.entities.never_referenced_after_creation_count
memory.entities.merge_rate
```

Si `entities_per_user` depasse 100 apres 3 mois pour un user moyen, c'est un signal d'over-creation.

Ambiguous example :

```text
User: "ma soeur"
Existing:
  - Tania, relation ex_partner
  - Sarah, relation sister
Decision: Sarah
```

Ambiguous without existing sister :

```text
User: "ma soeur"
Existing: none
Decision: create candidate entity display_name="soeur", relation_to_user="sister"
```

Correction example :

```text
User: "Non, Tania c'est mon ex, pas ma soeur."
```

Apply :

- update entity relation_to_user ;
- log memory_change_log operation `supersede` or `merge` if needed ;
- invalidate items that claimed wrong relation if any ;
- purge payload.

## Topic linking

Link item to topic using:

- active topic ;
- explicit topic mention ;
- top-3 semantic topics ;
- entity overlap ;
- temporal continuity ;
- recent conversation.

Rules :

```text
If item extracted from current conversation and topic decision stay -> link active topic.
If topic decision switch -> link switched topic.
If item is side_note -> no topic or low-confidence link.
If item strongly matches dormant topic -> link dormant topic and reopen if needed.
If no clear topic and item important -> create candidate topic.
```

Relations MVP :

```ts
type MemoryItemTopicRelation =
  | "about"
  | "supports"
  | "mentioned_with"
  | "blocks"
  | "helps";
```

Use sparingly.

Default :

```text
about
```

## Entity linking

Relations MVP recommandees :

```ts
type MemoryItemEntityRelation =
  | "mentions"
  | "about";
```

Everything else in metadata.

Examples :

```json
{
  "relation_type": "about",
  "metadata": {
    "role": "conflict_with"
  }
}
```

Pourquoi seulement 2 relations :

- facilite retrieval ;
- evite taxonomie trop large ;
- reduit erreurs LLM ;
- permet d'ajouter plus tard.

## Action linking

Action observations doivent etre reliees a :

- plan_item_id ;
- occurrence_ids ;
- observation window ;
- aggregation kind.

Exemples :

```text
User: "J'ai pas fait ma marche cette semaine, j'etais creve le soir."
Plan:
  Monday missed
  Wednesday partial
  Friday missed
Memory item:
  kind action_observation
  content fatigue du soir associee aux echecs marche cette semaine
Links:
  memory_item_actions.plan_item_id = walk_plan_id
  occurrence_ids = [mon, wed, fri]
  aggregation_kind = week_summary
```

Rules :

```text
single_occurrence -> un check/action precis
week_summary -> plusieurs occurrences sur 7 jours
streak_summary -> sequence claire
possible_pattern -> seulement si seuil minimal
```

Pattern threshold MVP :

```text
Ne pas materialiser pattern.
Tag possible_pattern seulement si:
  - >= 3 observations
  - sur >= 2 semaines
  - meme domain/action/entity
  - confidence moyenne >= 0.7
```

## Global profile MVP

Pas de `user_global_memory_views` materialisees au MVP.

Pour une question globale :

```text
Tu peux me parler de ma psychologie ?
Pourquoi je bloque souvent ?
Qu'est-ce que tu vois dans mon rapport au travail ?
```

Le loader :

```text
1. detecte cross_topic_lookup
2. mappe question -> domain_keys
3. recupere top-K memory_items actifs
4. recupere topics associes
5. recupere entities pertinentes
6. construit une vue temporaire pour le prompt
```

Avantages :

- pas de deuxieme cache a maintenir ;
- pas de compaction globale ;
- moins de risque de summary fictionnelle ;
- plus facile a corriger ;
- meilleur pour MVP.

Les global views peuvent arriver quand :

- questions globales frequentes ;
- latency cross-topic trop haute ;
- besoin de synthese recurrente ;
- assez de data pour compacter proprement.

## Taxonomie `domain_keys.v1`

Les domain keys sont controlees.

L'extracteur ne peut pas inventer librement.

Format :

```text
domain.subdomain
```

Liste MVP proposee :

### Psychologie

```text
psychologie.estime_de_soi
psychologie.discipline
psychologie.controle_impulsions
psychologie.identite
psychologie.peur_echec
psychologie.emotions
psychologie.motivation
```

### Relations

```text
relations.famille
relations.couple
relations.amitie
relations.appartenance_sociale
relations.conflit
relations.limites
```

### Addictions

```text
addictions.cannabis
addictions.alcool
addictions.ecrans
addictions.tabac
addictions.autre
```

### Sante

```text
sante.energie
sante.sommeil
sante.alimentation
sante.activite_physique
sante.douleur
sante.medical
```

### Travail

```text
travail.performance
travail.conflits
travail.sens
travail.charge
travail.carriere
```

### Habitudes et execution

```text
habitudes.execution
habitudes.environnement
habitudes.planification
habitudes.procrastination
habitudes.reprise_apres_echec
```

### Objectifs

```text
objectifs.identite
objectifs.long_terme
objectifs.court_terme
objectifs.transformation
```

### Argent

```text
finances.gestion
finances.stress
```

### Autres

```text
spiritualite.general
loisirs.general
education.general
logement.general
administratif.general
```

### Regle de format

**Tous les domain_keys ont le format `domain.subdomain`.**

Pour les domaines sans sous-decoupage MVP, utiliser le suffixe `.general`. Cela garantit :

- une regex de validation simple (`^[a-z]+\.[a-z_]+$`) ;
- des requetes SQL homogenes (pas de cas particulier "single segment") ;
- une evolution naturelle vers des subdomains plus tard sans rupture.

Regle validation :

```text
Si domain_key hors liste -> reject field, log proposed_domain_key.
Pas de creation auto.
Review humaine periodique pour enrichir taxonomie.
```

## Privacy MVP

Niveaux :

```ts
type SensitivityLevel =
  | "normal"
  | "sensitive"
  | "safety";
```

Categories tags :

```text
addiction
mental_health
family
relationship
work
financial
health
sexuality
self_harm
shame
trauma
other_sensitive
```

Champ :

```text
requires_user_initiated boolean
```

Regles injection :

```text
normal:
  injectable si pertinent

sensitive:
  injectable si topic actif directement lie
  ou demande explicite du user
  ou safety_first

safety:
  uniquement safety_first
```

Statements sensibles :

```text
Ne pas citer litteralement par defaut.
Reformuler avec tact.
Citer exact seulement si user demande explicitement.
```

Exemple interdit par defaut :

```text
Tu m'avais dit : "J'ai l'impression de toujours tout gacher."
```

Exemple prefere :

```text
Je me souviens que dans des moments difficiles, tu as deja formule une pensee tres dure envers toi-meme.
```

Audit :

```text
Log chaque injection d'item sensitive/safety:
  - item_id
  - reason
  - mode
  - prompt section
  - no raw content in logs
```

## Sensibilite des topic synthesis

La sensibilite ne s'applique pas qu'aux `memory_items`. **Le `topic.synthesis` injecte est lui-meme du contenu**, et il peut etre sensible.

Exemple :

```text
topic.synthesis = "Le user associe son arret du cannabis a la peur de perdre
ses amis fumeurs. Il a evoque plusieurs fois un sentiment d'echec personnel."
```

Cette synthesis est `sensitive` (addiction, auto-jugement). Si Sophia l'injecte hors contexte, c'est une violation de privacy aussi grave que d'injecter un statement sensible.

### Champ `sensitivity_max` sur topic

Deja prevu dans le schema. Sa valeur est :

```text
sensitivity_max = max(sensitivity_level) sur tous les memory_items active lies au topic
```

Recalculee automatiquement quand :

- un item est ajoute ;
- un item est invalidated / hidden / deleted / superseded ;
- un item change de sensitivity_level ;
- compaction du topic.

### Politique d'injection des topic synthesis

```text
topic.sensitivity_max = 'normal'
  -> synthesis injectee normalement si pertinente

topic.sensitivity_max = 'sensitive'
  -> synthesis injectee SI le topic est le topic actif
     ET le user est en train de parler du sujet
  -> sinon : injecter une version courte (title + 1 phrase generique)
  -> jamais injectee en cross_topic_lookup sans demande explicite

topic.sensitivity_max = 'safety'
  -> synthesis JAMAIS injectee hors mode safety_first
  -> meme en topic actif, version reformulee tres prudente
```

### Champ optionnel `topic_synthesis_redaction_mode`

Pour les topics les plus sensibles, ajouter un champ optionnel :

```sql
alter table public.user_topic_memories
  add column if not exists synthesis_redaction_mode text
    not null default 'auto'
    check (synthesis_redaction_mode in ('auto', 'always_redacted', 'never_redacted'));
```

Valeurs :

- `auto` : applique la regle ci-dessus selon `sensitivity_max` ;
- `always_redacted` : forcer la version courte meme en topic actif (cas opt-in user) ;
- `never_redacted` : autoriser la synthesis complete meme en safety (cas tres rare, eg topic specifique sante non sensible).

Au MVP, garder `auto` partout.

### Compaction et sensibilite

Quand le memorizer recompacte un topic dont `sensitivity_max = 'sensitive'` ou plus :

```text
1. Le prompt de compaction recoit explicitement le niveau sensitivity_max.
2. Le prompt impose :
   - pas de citation litterale des statements ;
   - reformulation avec tact ;
   - pas de quote des evidence_quote sensibles.
3. La synthesis produite est validee :
   - ne contient pas de termes brut listes en sensitivity blacklist (mots crus
     auto-jugement, descriptions explicites trauma, etc.) ;
   - sinon, synthesis rejetee, audit log, ancienne synthesis conservee.
```

### Audit

Logger chaque injection de topic synthesis avec niveau >= sensitive :

```text
memory.runtime.topic_synthesis_injected_sensitive_count
  - tags : sensitivity_level, topic_lifecycle, retrieval_mode
```

## Strategie multilingue

Sophia est principalement francophone, mais doit gerer le code-switching FR/EN occasionnel.

### Decisions

- **Langue principale** : francais.
- **Modele d'embedding** : modele multilingue avec bonne qualite FR.
- **Langue des contenus internes** : `content_text`, `normalized_summary`, `synthesis`, `search_doc` en francais quel que soit la langue du message d'entree.
- **Reponses Sophia** : dans la langue dominante du user, detectee depuis l'historique recent.

### Regles extracteur

```text
1. Detecter la langue du message (rapide, deterministe).
2. Si langue != francais -> traduire mentalement en francais pour content_text et normalized_summary.
3. Conserver l'evidence_quote dans la langue originale (preuve).
4. domain_keys reste en francais (vocabulaire ferme FR).
5. canonical_key normalise en francais.
```

### Aliases d'entites

Les aliases peuvent etre multilingues :

```text
display_name: "pere"
aliases: ["mon pere", "papa", "my dad", "father"]
relation_to_user: "father"
```

### Embeddings

Un seul modele d'embedding pour tout (items, topics, entities, search_doc). Modele candidat : multilingue capable de FR/EN sans degradation, dimension 768 ou 1536 selon la decision finale embedding.

### Decision differable

La gestion d'autres langues (ES, AR, DE) est repoussee. Si un user code-switche frequemment, on documente dans `metadata.dominant_languages = ['fr', 'en']`.

## Politique de retention RGPD

### Principes

- **Droit a l'oubli** : un user peut demander la suppression de ses donnees.
- **Audit minimum** : conserver de quoi prouver qu'une operation a bien ete appliquee, sans conserver le contenu.
- **Transparence** : un endpoint dashboard doit lister ce que Sophia se souvient.

### Retention par table

```text
chat_messages
  - retention par defaut : indefini tant que user actif
  - apres compte supprime : 30 jours puis hard delete
  - apres demande explicite RGPD : hard delete immediat

memory_items
  - status active/superseded/invalidated/archived : indefini tant que user actif
  - status hidden_by_user : indefini, jamais charge
  - status deleted_by_user :
      content_text vide
      normalized_summary vide
      embedding null
      conserve id, timestamps, metadata.redacted_at pendant 90 jours
      apres 90 jours : hard delete row
  - apres compte supprime : 30 jours puis hard delete

memory_item_sources
  - meme regle que memory_items lies (cascade on delete)

user_entities
  - meme regle de soft/hard delete que memory_items
  - merge conserve metadata.merged_from pour audit pendant 90 jours

memory_extraction_runs
  - retention 90 jours puis hard delete
  - input_message_ids anonymises avant retention longue
  - aucune donnee sensible dans le row directement (ids seulement)

memory_change_log
  - retention 365 jours pour audit (preuve d'oubli)
  - apres compte supprime : 30 jours puis hard delete
  - aucun contenu sensible dans `reason` (consigne stricte au memorizer)

user_topic_memories
  - retention indefinie tant que user actif
  - synthesis et search_doc effaces si tous les items sources deletes/hidden
  - apres compte supprime : 30 jours puis hard delete
```

### Suppression de compte

Procedure :

```text
1. Marker user.deleted_at
2. Cascade soft-delete sur toutes les tables user-scoped
3. Job nightly purge les rows dont deleted_at < now() - 30 jours
4. Generation d'un certificat de suppression (memory_change_log entry: operation_type='account_deleted')
5. Conservation 365 jours d'un log minimal anonymise (uuid hash, timestamp, type d'operation)
```

### Endpoint utilisateur

A prevoir cote produit (pas dans le MVP technique mais a anticiper) :

- `GET /api/memory/me/items` -> liste des items actifs
- `GET /api/memory/me/entities` -> liste des entites
- `POST /api/memory/me/items/:id/hide` -> hide
- `POST /api/memory/me/items/:id/delete` -> delete
- `POST /api/memory/me/forget-all` -> reset memoire (extreme)

## Definition du `weekly_review` trigger

Le `weekly_review` est utilise comme trigger de memorizer et de compaction. Il faut le definir clairement.

### Definition

Un `weekly_review` est un evenement systeme genere une fois par semaine et par user actif, qui declenche :

- une passe memorizer sur les messages de la semaine ;
- une compaction de tous les topics avec `pending_changes_count > 0` ;
- une mise a jour du `last_active_at` des topics ;
- une evaluation des topics dormants (rouvrir si reactives) ;
- une passe de detection de patterns possibles (>= 3 obs / 2 sem) ;
- une generation eventuelle d'un bilan WhatsApp si le produit en propose un.

### Source

Le trigger peut venir de :

- un cron edge function `trigger-weekly-memory-review` execute le dimanche soir (timezone user) ;
- un evenement produit "bilan hebdomadaire genere" si Sophia produit deja ce bilan ;
- une commande manuelle pour debug (`POST /api/memory/admin/trigger-weekly-review`).

### Idempotence

```text
unique (user_id, iso_week, iso_year)
```

Une seule passe par user par semaine ISO. Retry safe.

### Distinction avec les autres triggers

```text
batch trigger : 5-10 minutes apres N messages substantifs
event trigger : signal fort detecte runtime (correction, safety, switch)
weekly_review : passe globale planifiee
```

Les trois alimentent le meme pipeline memorizer mais avec un scope different.

## Correction, oubli, conflits

Objectif :

```text
Sophia doit savoir desapprendre.
```

Signals :

```text
non ce n'est pas ca
tu as mal compris
corrige ca
ce n'est plus vrai
oublie ca
ne retiens pas ca
supprime cette info
```

### Target resolution

Ordre :

```text
1. item explicitement cite
2. item injecte au tour precedent
3. souvenir cite par Sophia dans sa derniere reponse
4. item du topic actif le plus proche
5. entity/topic explicitement mentionne
6. semantic search
```

### Prudence correction

Si cible claire :

```text
appliquer directement
confirmer simplement
```

Si cible ambigue :

```text
demander confirmation
ne rien modifier
```

Exemple :

```text
Tu veux que je corrige le souvenir ou j'avais compris que Tania etait ta soeur ?
```

### Operations MVP

#### Invalidate

Quand Sophia a mal compris.

```text
item.status = invalidated
memory_change_log.operation_type = invalidate
purge payload
increment topic pending_changes_count
```

#### Supersede

Quand une information evolue.

```text
old.status = superseded
old.superseded_by_item_id = new.id
old.valid_until = now()
new.status = active
memory_change_log.operation_type = supersede
```

#### Hide

Quand le user dit "ne retiens pas ca".

```text
item.status = hidden_by_user
memory_change_log.operation_type = hide
purge payload
```

#### Delete

Quand le user demande suppression.

```text
item.status = deleted_by_user
item.content_text = ''
item.normalized_summary = ''
item.embedding = null
memory_change_log.operation_type = delete
purge payload
```

### Conflict handling

Conflits MVP :

- preferer `supersede` si nouvelle information remplace ancienne ;
- preferer `invalidate` si ancienne information etait fausse ;
- ne pas creer de graphe `contradicts` au MVP ;
- utiliser metadata :

```json
{
  "conflict_with_item_id": "...",
  "conflict_resolution": "superseded"
}
```

## Memory redaction job

**Critique** : `status = deleted_by_user` + `content_text = ''` ne suffit PAS.

Un souvenir supprime peut survivre dans plusieurs surfaces derivees. Si l'invariant "aucune memoire supprimee ne doit etre re-injectee" doit tenir, un job de redaction doit traiter TOUTES les surfaces.

### Surfaces concernees

```text
1. memory_items
   - content_text
   - normalized_summary
   - structured_data (peut contenir des extraits)
   - metadata (peut contenir des quotes)
   - domain_keys (rarement sensible, mais peut leak un sujet)
   - canonical_key (peut leak)
   - source_hash (peut etre identifiant derive)
   - embedding

2. memory_item_sources
   - evidence_quote (CRITIQUE : citation litterale)
   - evidence_summary (peut contenir le contenu)
   - metadata

3. user_topic_memories
   - synthesis (peut citer ou resumer l'item)
   - search_doc (peut contenir l'item)
   - search_doc_embedding (derive du search_doc)

4. user_chat_states.temp_memory.__memory_payload_state_v2
   - items[] qui contient memory_item_id

5. memory_extraction_runs
   - input_message_ids (referentiels seulement)
   - metadata (ne doit pas contenir contenu user)

6. memory_change_log
   - reason (consigne stricte : pas de contenu sensible direct)

7. fixtures de tests
   - exclusion par convention : pas de contenu reel user dans les fixtures
```

### Procedure pour `hidden_by_user`

```text
Action immediate (synchrone si possible) :
  1. UPDATE memory_items SET status='hidden_by_user'
  2. Purger payload_state : retirer tous les item_ids hidden
  3. Insert memory_change_log (operation_type='hide')
  4. Increment pending_changes_count des topics lies

Action async (job redaction_v2) :
  5. Pour chaque topic lie :
     - si la synthesis cite l'item -> marquer pending recompaction urgente
     - si search_doc contient l'item -> idem
     - declencher topic compaction prioritaire
  6. Recalculer sensitivity_max du topic
  7. Audit final : verifier qu'aucune surface ne charge l'item

Conserver :
  - le row memory_items et ses sources (audit)
  - le contenu (pour permettre restore si user change d'avis sous 30 jours)
```

### Procedure pour `deleted_by_user`

```text
Action immediate (synchrone) :
  1. UPDATE memory_items SET
       status='deleted_by_user',
       content_text='',
       normalized_summary='',
       structured_data='{}'::jsonb,
       embedding=NULL,
       canonical_key=NULL,
       source_hash=NULL,
       metadata=jsonb_build_object('redacted_at', now())
  2. UPDATE memory_item_sources SET
       evidence_quote=NULL,
       evidence_summary=NULL,
       metadata='{}'::jsonb
     WHERE memory_item_id = :id
  3. Purger payload_state
  4. Insert memory_change_log (operation_type='delete')
  5. Increment pending_changes_count des topics lies

Action async (job redaction_v2 immediate) :
  6. Pour chaque topic lie :
     - si la synthesis cite l'item -> recompaction urgente AVANT prochain message user
     - si search_doc contient l'item -> idem
     - regenerer search_doc_embedding apres recompaction
  7. Recalculer sensitivity_max du topic
  8. Audit : SELECT COUNT(*) WHERE synthesis ILIKE '%<terme cle de l'item>%' = 0

Conservation pour audit (90 jours puis hard delete row) :
  - id, user_id, kind, status, created_at, updated_at, redacted_at
  - extraction_run_id (pour tracer l'origine)
  - metadata.redacted_at
```

### Garde-fous loader

Le loader applique TOUJOURS :

```sql
WHERE status = 'active'
```

Aucune exception. Meme pas en correction flow (qui peut chercher dans superseded mais via une RPC explicite, jamais dans le SELECT du loader normal).

Verification automatique en CI :

```text
- Aucun chemin de code ne doit faire de SELECT memory_items sans WHERE status = 'active'
  (sauf RPC d'audit explicite tagge audit_only).
- Aucun prompt de compaction ne doit recevoir un item dont status != 'active'.
- Le payload_state purge doit etre testee dans les golden conversations.
```

### Test obligatoire (golden scenario 10)

Le scenario `10_forget_sensitive_item` doit verifier :

```text
1. User cree un statement sensible.
2. Sophia compacte le topic, synthesis cite l'idee du statement.
3. User demande "oublie ca".
4. Apres operation :
   - item.status = deleted_by_user
   - item.content_text = ''
   - source.evidence_quote = NULL
   - topic.synthesis NE contient PLUS l'idee
   - topic.search_doc NE contient PLUS l'idee
   - prochain prompt n'inclut RIEN de l'item ni du topic synthesis pre-redaction
```

Si ce scenario echoue, rollout bloque.

## Compaction MVP

Seule compaction materialisee au MVP :

```text
topic synthesis + topic search_doc
```

Pas de compaction globale.

Triggers :

```text
pending_changes_count >= 5
topic promoted durable
correction applied
dormant reopened
weekly review
manual maintenance
```

Inputs compaction :

- topic actuel ;
- active memory items linked to topic ;
- important statements ;
- recent events ;
- action observations ;
- entities ;
- previous synthesis ;
- invalidated/superseded excluded.

Output :

- `synthesis` court ;
- `search_doc` oriente retrieval ;
- `supporting_item_ids` metadata ;
- `summary_version + 1` ;
- `search_doc_version + 1` ;
- embeddings mis a jour ;
- `pending_changes_count = 0`.

Regles compaction :

```text
Ne rien inventer.
Ne pas utiliser invalidated/superseded/hidden/deleted.
Distinguer recent vs ancien.
Statements restent statements.
Pas de diagnostic.
Pas de jugement psychologisant.
Summary <= 200-300 mots.
Search_doc peut etre plus riche mais factuel.
```

Validation anti-hallucination :

```text
Chaque claim important doit etre supporte par au moins un item_id actif.
Aucun supporting_item_id invalide.
Pas de statement sensible cite litteralement.
Pas de fact derive depuis statement subjectif.
```

Si validation echoue :

- ne pas update synthesis ;
- log compaction_failed ;
- garder old synthesis ;
- alert dev si repetitif.

## Schema SQL recommande

### `memory_items`

```sql
create table public.memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  kind text not null check (kind in (
    'fact',
    'statement',
    'event',
    'action_observation'
  )),

  status text not null default 'candidate' check (status in (
    'candidate',
    'active',
    'superseded',
    'invalidated',
    'hidden_by_user',
    'deleted_by_user',
    'archived'
  )),

  content_text text not null,
  normalized_summary text,
  structured_data jsonb not null default '{}'::jsonb,

  domain_keys text[] not null default '{}',

  confidence numeric(3,2) not null default 0.70
    check (confidence >= 0 and confidence <= 1),
  importance_score numeric(3,2) not null default 0
    check (importance_score >= 0 and importance_score <= 1),

  sensitivity_level text not null default 'normal' check (sensitivity_level in (
    'normal',
    'sensitive',
    'safety'
  )),
  sensitivity_categories text[] not null default '{}',
  requires_user_initiated boolean not null default false,

  source_message_id uuid references public.chat_messages(id) on delete set null,
  source_scope text,
  source_hash text,

  observed_at timestamptz,
  event_start_at timestamptz,
  event_end_at timestamptz,
  time_precision text,
  timezone text,
  valid_from timestamptz,
  valid_until timestamptz,

  canonical_key text,

  embedding vector(768),
  embedding_model text,

  superseded_by_item_id uuid references public.memory_items(id) on delete set null,

  extraction_run_id uuid,
  last_retrieved_at timestamptz,

  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_memory_items_user_status_kind
  on public.memory_items (user_id, status, kind);

create index idx_memory_items_user_observed
  on public.memory_items (user_id, observed_at desc nulls last);

create index idx_memory_items_domain_keys
  on public.memory_items using gin (domain_keys);

create index idx_memory_items_sensitivity
  on public.memory_items (user_id, sensitivity_level);

create index idx_memory_items_canonical_key
  on public.memory_items (user_id, canonical_key)
  where canonical_key is not null;

create index idx_memory_items_embedding
  on public.memory_items using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Event constraints
alter table public.memory_items
  add constraint chk_memory_items_event_has_start
  check (
    kind <> 'event'
    or event_start_at is not null
  );

alter table public.memory_items
  add constraint chk_memory_items_event_end_after_start
  check (
    event_end_at is null
    or event_start_at is null
    or event_end_at >= event_start_at
  );

-- Updated_at trigger
create or replace function public.tg_memory_items_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_memory_items_set_updated_at
  before update on public.memory_items
  for each row execute function public.tg_memory_items_set_updated_at();
```

Note embedding :

Le repo actuel utilise deja `vector(768)` dans plusieurs migrations.
Decision a prendre avant implementation :

- garder `768` pour compatibilite ;
- ou migrer vers `1536` si modele embedding choisi l'exige.

### `memory_item_sources`

```sql
create table public.memory_item_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_item_id uuid not null references public.memory_items(id) on delete cascade,

  source_type text not null check (source_type in (
    'chat_message',
    'action_occurrence',
    'plan_item',
    'scheduled_checkin',
    'skill_run',
    'weekly_review',
    'manual_correction',
    'system_signal'
  )),
  source_id uuid,
  source_message_id uuid references public.chat_messages(id) on delete set null,
  source_created_at timestamptz,
  source_scope text,

  evidence_quote text,
  evidence_summary text,
  extraction_run_id uuid,
  confidence numeric(3,2) not null default 0.70
    check (confidence >= 0 and confidence <= 1),

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Unique constraint Postgres 15+ (verrouille Sprint 0 : Postgres 17)
create unique index uniq_memory_item_sources
  on public.memory_item_sources (
    memory_item_id, source_type, source_id, source_message_id
  ) nulls not distinct;

create index idx_memory_item_sources_item
  on public.memory_item_sources (memory_item_id);

create index idx_memory_item_sources_user_source
  on public.memory_item_sources (user_id, source_type, source_id);
```

Note unique constraint :

Postgres traite les NULL comme distincts par defaut dans une contrainte unique. La clause `nulls not distinct` (disponible Postgres 15+) traite les NULL comme egaux, ce qui garantit l'unicite reelle quand `source_id` ou `source_message_id` est NULL.

Decision verrouillee Sprint 0 : Postgres 17 confirme dans `supabase/config.toml` -> on utilise `nulls not distinct`.

Utilisation :

```text
Ne pas creer de row pour chaque source message simple.
Utiliser source_message_id direct dans memory_items.
Creer rows ici pour multi-source, action, skill, checkin, weekly review.
```

### `user_entities`

```sql
create table public.user_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  entity_type text not null check (entity_type in (
    'person',
    'organization',
    'place',
    'project',
    'object',
    'group',
    'other'
  )),

  display_name text not null,
  aliases text[] not null default '{}',
  normalized_key text,

  relation_to_user text,
  description text,

  confidence numeric(3,2) not null default 0.70
    check (confidence >= 0 and confidence <= 1),

  sensitivity_level text not null default 'normal' check (sensitivity_level in (
    'normal',
    'sensitive',
    'safety'
  )),

  status text not null default 'active' check (status in (
    'active',
    'merged',
    'archived',
    'hidden_by_user',
    'deleted_by_user'
  )),

  merged_into_entity_id uuid references public.user_entities(id) on delete set null,

  embedding vector(768),
  embedding_model text,

  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_user_entities_user_type_status
  on public.user_entities (user_id, entity_type, status);

create index idx_user_entities_aliases
  on public.user_entities using gin (aliases);

create index idx_user_entities_normalized_key
  on public.user_entities (user_id, normalized_key)
  where normalized_key is not null;

create index idx_user_entities_embedding
  on public.user_entities using hnsw (embedding vector_cosine_ops)
  where embedding is not null;
```

### `memory_item_topics`

```sql
create table public.memory_item_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_item_id uuid not null references public.memory_items(id) on delete cascade,
  topic_id uuid not null references public.user_topic_memories(id) on delete cascade,

  relation_type text not null default 'about' check (relation_type in (
    'about',
    'supports',
    'mentioned_with',
    'blocks',
    'helps'
  )),

  confidence numeric(3,2) not null default 0.70
    check (confidence >= 0 and confidence <= 1),

  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  observed_count integer not null default 1,

  status text not null default 'active' check (status in (
    'active',
    'retracted'
  )),

  extraction_run_id uuid,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (memory_item_id, topic_id, relation_type)
);

create index idx_memory_item_topics_topic
  on public.memory_item_topics (user_id, topic_id, status);

create index idx_memory_item_topics_item
  on public.memory_item_topics (memory_item_id);
```

### `memory_item_entities`

```sql
create table public.memory_item_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_item_id uuid not null references public.memory_items(id) on delete cascade,
  entity_id uuid not null references public.user_entities(id) on delete cascade,

  relation_type text not null default 'mentions' check (relation_type in (
    'mentions',
    'about'
  )),

  confidence numeric(3,2) not null default 0.70
    check (confidence >= 0 and confidence <= 1),

  extraction_run_id uuid,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (memory_item_id, entity_id, relation_type)
);

create index idx_memory_item_entities_entity
  on public.memory_item_entities (user_id, entity_id);

create index idx_memory_item_entities_item
  on public.memory_item_entities (memory_item_id);
```

### `memory_item_actions`

Une row decrit une observation d'item liee a un plan item, avec une fenetre temporelle.
Les occurrences specifiques sont liees via une junction table dediee (FK reelles).

```sql
create table public.memory_item_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_item_id uuid not null references public.memory_items(id) on delete cascade,

  plan_item_id uuid,

  observation_window_start timestamptz,
  observation_window_end timestamptz,

  aggregation_kind text not null default 'single_occurrence' check (aggregation_kind in (
    'single_occurrence',
    'week_summary',
    'streak_summary',
    'possible_pattern'
  )),

  confidence numeric(3,2) not null default 0.70
    check (confidence >= 0 and confidence <= 1),

  extraction_run_id uuid,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_memory_item_actions_window
    check (observation_window_end is null
           or observation_window_start is null
           or observation_window_end >= observation_window_start)
);

create index idx_memory_item_actions_plan
  on public.memory_item_actions (user_id, plan_item_id)
  where plan_item_id is not null;

create index idx_memory_item_actions_item
  on public.memory_item_actions (memory_item_id);

create index idx_memory_item_actions_window
  on public.memory_item_actions (user_id, observation_window_start, observation_window_end);

-- Note plan_item_id FK :
-- Decision Phase 0 : soft reference au MVP.
-- Si la table action_occurrences (et plan_items) est stable, ajouter :
--   alter table public.memory_item_actions
--     add constraint fk_memory_item_actions_plan_item
--     foreign key (plan_item_id) references public.plan_items(id) on delete set null;
```

### `memory_item_action_occurrences`

Junction table avec FK reelles vers les occurrences. Remplace l'ancien `action_occurrence_ids uuid[]` qui n'avait pas d'integrite referentielle.

```sql
create table public.memory_item_action_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_item_action_id uuid not null references public.memory_item_actions(id) on delete cascade,
  action_occurrence_id uuid not null,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  unique (memory_item_action_id, action_occurrence_id)
);

create index idx_memory_item_action_occurrences_action
  on public.memory_item_action_occurrences (memory_item_action_id);

create index idx_memory_item_action_occurrences_occurrence
  on public.memory_item_action_occurrences (user_id, action_occurrence_id);

-- FK action_occurrence_id soft au MVP, a transformer en hard FK une fois la table stable :
--   alter table public.memory_item_action_occurrences
--     add constraint fk_memory_item_action_occurrences_occurrence
--     foreign key (action_occurrence_id) references public.action_occurrences(id) on delete cascade;
```

### Extension `user_topic_memories`

Ajouter :

```sql
alter table public.user_topic_memories
  add column if not exists lifecycle_stage text not null default 'candidate'
    check (lifecycle_stage in ('candidate', 'durable', 'dormant', 'archived')),
  add column if not exists search_doc text not null default '',
  add column if not exists search_doc_embedding vector(768),
  add column if not exists search_doc_version integer not null default 1,
  add column if not exists pending_changes_count integer not null default 0,
  add column if not exists last_compacted_at timestamptz,
  add column if not exists summary_version integer not null default 1,
  add column if not exists sensitivity_max text not null default 'normal'
    check (sensitivity_max in ('normal', 'sensitive', 'safety')),
  add column if not exists archived_reason text,
  add column if not exists merged_into_topic_id uuid references public.user_topic_memories(id) on delete set null;

create index if not exists idx_user_topic_memories_lifecycle
  on public.user_topic_memories (user_id, lifecycle_stage, status);

create index if not exists idx_user_topic_memories_search_embedding
  on public.user_topic_memories using hnsw (search_doc_embedding vector_cosine_ops)
  where search_doc_embedding is not null;
```

### `memory_extraction_runs`

```sql
create table public.memory_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  batch_hash text not null,
  prompt_version text not null,
  model_name text not null,
  embedding_model text,

  status text not null default 'running' check (status in (
    'running',
    'completed',
    'failed',
    'skipped'
  )),

  trigger_type text not null,
  input_message_ids uuid[] not null default '{}',

  proposed_item_count integer not null default 0,
  accepted_item_count integer not null default 0,
  rejected_item_count integer not null default 0,
  proposed_entity_count integer not null default 0,
  accepted_entity_count integer not null default 0,

  duration_ms integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,

  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),

  unique (user_id, batch_hash, prompt_version)
);

create index idx_memory_extraction_runs_user_status
  on public.memory_extraction_runs (user_id, status, started_at desc);
```

### `memory_change_log`

```sql
create table public.memory_change_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  operation_type text not null check (operation_type in (
    'invalidate',
    'supersede',
    'hide',
    'delete',
    'merge',
    'restore',
    'promote',
    'archive_expired',
    'redaction_propagated'
  )),

  target_type text not null check (target_type in (
    'memory_item',
    'entity',
    'topic'
  )),
  target_id uuid not null,

  replacement_id uuid,
  source_message_id uuid references public.chat_messages(id) on delete set null,
  extraction_run_id uuid,

  reason text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index idx_memory_change_log_user_target
  on public.memory_change_log (user_id, target_type, target_id, created_at desc);
```

## Definitions de champs derives

Pour eviter la derive d'implementation, certains champs derives doivent avoir leur regle de calcul explicite.

### `user_topic_memories.sensitivity_max`

```text
sensitivity_max = max(sensitivity_level)
sur tous les memory_items avec status='active' lies au topic
via memory_item_topics (status='active')
```

Recalcul declenche quand :

- un item est ajoute (link cree) ;
- un item passe de candidate a active ;
- un item passe a invalidated, hidden, deleted, superseded ;
- un item change de sensitivity_level (rare) ;
- un memory_item_topics passe a status='retracted' ;
- compaction du topic.

Implementation : trigger Postgres ou recalcul a chaque change d'etat critique.

### `user_topic_memories.pending_changes_count`

Compteur des changements depuis la derniere compaction.

Incremente par +1 quand :

```text
- un memory_item active est lie au topic
- un memory_item passe en superseded/invalidated/hidden/deleted (impact sur synthesis)
- une entity importante est ajoutee/changee sur le topic
- une action_observation lie au topic est ajoutee
- correction appliquee sur un item du topic
- supersession appliquee sur un item du topic
```

NE PAS incrementer pour :

```text
- duplicate rejected
- candidate non lie au topic
- side_note marque trivial
- update purement metadata sans impact synthesis
```

Reset a 0 lors d'une compaction reussie.

Trigger compaction quand `pending_changes_count >= 5` (tunable).

### `memory_items.source_hash`

But : aider la dedupe et la detection de doublons cross-batch.

```text
source_hash = sha256(
  user_id ||
  source_message_id ||
  kind ||
  normalized_content_hash
)
```

Avec `normalized_content_hash` = hash du `normalized_summary` apres normalisation (lowercase, trim, retrait ponctuation).

Usage :

- comparer `source_hash` est plus rapide que comparer texte ;
- index dedie possible si volume eleve ;
- attention : un hash derive d'un contenu sensible reste un identifiant lie au user. RGPD : a hard-deleter sur demande user (deja prevu dans `deleted_by_user`).

Note : `source_hash = NULL` est autorise quand le contenu vient d'agregations (action_observation derivee) sans message-source unique.

### `chat_messages.metadata.topic_context`

V1 ecrit deja ce champ. V2 doit etendre **sans casser les consumers V1**.

Format V2 :

```json
{
  "topic_context": {
    "version": 2,
    "active_topic_id": "uuid|null",
    "active_topic_slug": "string|null",
    "decision": "stay|switch|create_candidate|side_note",
    "confidence": 0.0,
    "previous_topic_id": "uuid|null",
    "router_version": "memory_v2_router_mvp_1",
    "v1_compat": {
      "active_topic_id_v1": "uuid|null",
      "decision_v1": "string|null"
    }
  }
}
```

Regle :

- conserver toujours les champs lus par V1 (sous `v1_compat` ou en doublon top-level si necessaire) ;
- pendant le shadow Phase 3, ecrire `version=2` mais garder le format V1 actif ;
- apres rollout 100% V2, on peut deprecier `v1_compat` mais pas avant 30 jours stables.

## Triggers `updated_at`

Toutes les tables qui ont un champ `updated_at` doivent avoir un trigger pour le maintenir.

Pattern reutilisable :

```sql
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

Appliquer a :

```sql
create trigger trg_user_entities_updated_at
  before update on public.user_entities
  for each row execute function public.tg_set_updated_at();

create trigger trg_memory_item_topics_updated_at
  before update on public.memory_item_topics
  for each row execute function public.tg_set_updated_at();

create trigger trg_memory_item_entities_updated_at
  before update on public.memory_item_entities
  for each row execute function public.tg_set_updated_at();

create trigger trg_memory_item_actions_updated_at
  before update on public.memory_item_actions
  for each row execute function public.tg_set_updated_at();

create trigger trg_user_topic_memories_updated_at
  before update on public.user_topic_memories
  for each row execute function public.tg_set_updated_at();
```

Note : `memory_items` a deja son propre trigger nomme (defini plus haut). On peut le remplacer par le pattern generique pour reduire le code.

## FK extraction_run_id (recommandee)

Une fois `memory_extraction_runs` cree, ajouter des FK soft (on delete set null) sur les tables qui referencent un run :

```sql
alter table public.memory_items
  add constraint fk_memory_items_extraction_run
  foreign key (extraction_run_id)
  references public.memory_extraction_runs(id)
  on delete set null;

alter table public.memory_item_topics
  add constraint fk_memory_item_topics_extraction_run
  foreign key (extraction_run_id)
  references public.memory_extraction_runs(id)
  on delete set null;

alter table public.memory_item_entities
  add constraint fk_memory_item_entities_extraction_run
  foreign key (extraction_run_id)
  references public.memory_extraction_runs(id)
  on delete set null;

alter table public.memory_item_actions
  add constraint fk_memory_item_actions_extraction_run
  foreign key (extraction_run_id)
  references public.memory_extraction_runs(id)
  on delete set null;

alter table public.memory_item_sources
  add constraint fk_memory_item_sources_extraction_run
  foreign key (extraction_run_id)
  references public.memory_extraction_runs(id)
  on delete set null;
```

Pourquoi `set null` et pas `cascade` :

- on ne veut pas perdre des memory items si on purge un old extraction_run pour retention 90j ;
- `set null` casse l'audit pointeur mais conserve la donnee, ce qui est le bon arbitrage.

## RLS et securite

Chaque table user-scoped doit avoir :

- `user_id not null` ;
- RLS enabled ;
- select/insert/update policies sur `auth.uid() = user_id` ;
- service role compatible pour edge functions ;
- tests d'isolation multi-user.

Attention :

Les RPC `security definer` doivent toujours verifier `target_user_id = auth.uid()` ou service role explicit.

Test obligatoire :

```text
User A ne peut jamais lire memory_items de User B.
User A ne peut jamais chercher par embedding sur items User B.
RPC match_memory_items respecte user_id.
```

## Embedding strategy

**Decision verrouillee Sprint 0** (cf. `## Decisions Sprint 0`) :

```text
Modele     : gemini-embedding-001
Dimension  : 768 (outputDimensionality)
Provider   : Gemini (deja integre via supabase/functions/_shared/llm.ts -> geminiEmbed)
embedding_model stocke : "gemini-embedding-001@768"
```

Pourquoi ce choix :

- compatibilite native avec 90% du schema existant (`vector(768)`) ;
- multilingue avec FR de qualite ;
- deja integre, donc 0 dette d'integration au MVP ;
- variable d'env existante : `GEMINI_EMBEDDING_MODEL`.

Tables avec embedding au MVP :

- `memory_items.embedding` ;
- `user_entities.embedding` ;
- `user_topic_memories.search_doc_embedding`.

Coexistence avec V1 :

- `user_topic_memories.synthesis_embedding` deja en `vector(768)` -> aucun changement ;
- `user_global_memories.semantic_embedding` est en `vector(1536)` (modele different V1) -> on ne lit ni n'ecrit dedans depuis V2 ;
- l'identifiant `embedding_model` au format `<modele>@<dim>` permet de gerer une eventuelle migration future sans casser les rows existants.

Migration future eventuelle (V2.5+) :

- changer de modele -> dual-write pendant 1-2 semaines ;
- nouveau champ `embedding_v2` ou nouvelle table de mapping ;
- jamais en cours de rollout MVP.

## Observabilite

Metrics runtime :

```text
memory.runtime.retrieval_mode.count
memory.runtime.hints.count
memory.runtime.topic_decision.count
memory.runtime.topic_router_llm_used.count
memory.runtime.false_create_shadow_rate
memory.runtime.payload_item_count
memory.runtime.payload_churn_rate
memory.runtime.sensitive_excluded_count
memory.runtime.invalid_injection_count
memory.runtime.loader_latency_ms
memory.runtime.total_memory_latency_ms
```

Metrics memorizer :

```text
memory.memorizer.batch_count
memory.memorizer.skipped_noise_count
memory.memorizer.extraction_latency_ms
memory.memorizer.proposed_item_count
memory.memorizer.accepted_item_count
memory.memorizer.rejected_item_count
memory.memorizer.statement_as_fact_violation_count
memory.memorizer.duplicate_rate
memory.memorizer.entity_merge_rate
memory.memorizer.wrong_link_rate_eval
memory.memorizer.retry_count
memory.memorizer.idempotent_skip_count
```

Metrics compaction :

```text
memory.compaction.run_count
memory.compaction.failed_validation_count
memory.compaction.unsupported_claim_count
memory.compaction.topic_pending_count
memory.compaction.latency_ms
```

Alerts critiques :

```text
invalid_injection_count > 0
statement_as_fact_violation_count > 0
deleted_item_in_payload > 0
cross_user_memory_access > 0
compaction_unsupported_claim_rate > threshold
```

Logs sans contenu sensible :

- item IDs ;
- topic IDs ;
- entity IDs ;
- reasons ;
- modes ;
- counts ;
- hashes ;
- pas de raw sensitive content.

## Budget tokens et couts cibles

Sans budget cible, le memorizer peut devenir le poste de cout principal de Sophia. Il faut viser des chiffres concrets des Phase 4.

### Hypotheses MVP

```text
User actif moyen :
  - 30 messages user / jour
  - 30 messages assistant / jour
  - 60 messages total / jour
  - ~30% substantifs (apres anti-noise)
  - ~18 messages substantifs / jour
  - 6 batches memorizer / jour (3 messages par batch en moyenne)
  - 1 weekly review / semaine
```

### Cible runtime

```text
Tour conversationnel :
  - signal detection deterministe : 0 token LLM
  - resolution temporelle deterministe : 0 token LLM
  - topic router LLM (zone grise, ~20% des tours) :
      input ~600 tokens, output ~80 tokens
      cost ~ rare et borne
  - generation Sophia : modele principal (existant)
  - aucun appel LLM auxiliaire systematique

Cible : memoire ajoute < 5% du cout total d'un tour conversationnel.
```

### Cible memorizer

```text
Batch extraction :
  - input ~2000-3500 tokens (messages + context + taxonomie + rules)
  - output ~400-700 tokens (JSON extraction)
  - 6 batches / jour / user actif
  -> ~15-25k tokens input / jour / user
  -> ~3-5k tokens output / jour / user

Compaction topic :
  - input ~1500-2500 tokens
  - output ~300-500 tokens
  - ~1-2 par jour / user actif (declenche sur seuil)

Weekly review :
  - 1 passe ~ 5-10 batches consolides
  - ~30-60k tokens / semaine / user actif

Entity resolution LLM judge :
  - rare, < 10% des extractions
  - ~500 tokens input, ~50 tokens output
```

### Estimation budget

Avec un modele extraction type `gpt-4o-mini` ou `claude-3-5-haiku` :

```text
Cible : < 0.10 EUR / user actif / mois pour la memoire
Soft alert : > 0.15 EUR / user actif / mois
Hard alert : > 0.25 EUR / user actif / mois
```

A mesurer en Phase 4 dry-run avant rollout.

### Levers de cout

Si budget depasse :

```text
1. Renforcer anti-noise (skip plus agressif)
2. Augmenter taille batch (moins de calls, plus de contexte)
3. Reduire frequence weekly review
4. Reduire compaction trigger (seuil pending_changes_count plus haut)
5. Cap dur sur extraction par user/jour
6. Modele extraction moins cher (avec eval qualite)
7. Cache prompt (system prompt reutilise)
```

### Suivi

```text
Daily metrics :
  - memorizer_input_tokens_per_user
  - memorizer_output_tokens_per_user
  - memorizer_cost_per_user_eur
  - compaction_input_tokens_per_user
  - topic_router_llm_calls_per_tour

Weekly aggregate :
  - p50, p95, p99 cost per active user
  - top 1% expensive users -> alerte si >> moyenne
```

## Evaluation strategy

Avant activation :

```text
Golden conversations obligatoires.
```

Format recommande :

```yaml
id: 04_reopen_dormant_cannabis
description: Reouvre un topic dormant avec statement et event date
initial_state:
  topics: []
  entities: []
turns:
  - user: "Je veux arreter le cannabis, mais j'ai peur de perdre mes potes."
    expect:
      topic_decision: create_candidate
      created_items:
        - kind: statement
          contains: "peur de perdre"
      created_entities: []
      forbidden_items:
        - kind: fact
          contains: "perdra ses amis"
  - user: "Hier soir c'etait dur, ils fumaient tous."
    expect:
      topic_decision: stay
      retrieval_hints:
        - dated_reference
      created_items:
        - kind: event
      linked_topic: arret_cannabis
  - user: "Je reparle de mon arret cannabis."
    after_days: 5
    expect:
      topic_decision: switch
      payload_contains:
        - previous_statement
        - recent_event
```

12 scenarios MVP :

```text
01_topic_continuity_breakup
02_false_switch_lateral_detail
03_true_switch_work
04_reopen_dormant_cannabis
05_cross_topic_psychology
06_dated_event_friday
07_action_missed_walk
08_strong_statement_self_blame
09_correction_wrong_memory
10_forget_sensitive_item
11_safety_minimal_context
12_entity_father_aliases
```

Chaque scenario teste :

- topic decision ;
- retrieval mode ;
- hints ;
- items crees ;
- items non crees ;
- entities creees ;
- entity alias matching ;
- links topic/entity/action ;
- payload injecte ;
- items exclus ;
- correction appliquee ;
- status apres correction ;
- pas d'injection invalidated ;
- compaction si applicable.

## Test harness

### Contrat TypeScript

Pour eviter que chaque developpeur invente une interface differente, le contrat est fixe.

```ts
// memory/testing/types.ts

export type GoldenScenarioId = string;

export interface GoldenScenario {
  id: GoldenScenarioId;
  description: string;
  scenario_version: number;
  initial_state?: ScenarioInitialState;
  turns: ScenarioTurn[];
  global_assertions?: GlobalAssertion[];
}

export interface ScenarioInitialState {
  topics?: SeedTopic[];
  entities?: SeedEntity[];
  memory_items?: SeedMemoryItem[];
  payload_state?: SeedPayloadState;
}

export interface ScenarioTurn {
  user?: string;
  assistant_response_mock?: string;
  after_days?: number;
  after_minutes?: number;
  expect: TurnExpectation;
}

export interface TurnExpectation {
  retrieval_mode?: RetrievalMode;
  retrieval_hints?: RetrievalHint[];
  topic_decision?: TopicDecision;
  topic_confidence_min?: number;
  active_topic_slug?: string;
  payload_contains?: PayloadAssertion[];
  payload_does_not_contain?: PayloadAssertion[];
  created_items?: CreatedItemAssertion[];
  forbidden_items?: ForbiddenItemAssertion[];
  created_entities?: CreatedEntityAssertion[];
  applied_operations?: AppliedOperationAssertion[];
  no_extraction?: boolean;
}

export interface CreatedItemAssertion {
  kind: MemoryItemKind;
  contains?: string[];
  not_contains?: string[];
  domain_keys_any_of?: string[];
  sensitivity_level?: SensitivityLevel;
  linked_topic_slug?: string;
  linked_entity_aliases_any_of?: string[];
  linked_action?: boolean;
}

export interface ForbiddenItemAssertion {
  kind?: MemoryItemKind;
  contains?: string[];
}

export interface CreatedEntityAssertion {
  display_name?: string;
  aliases_any_of?: string[];
  relation_to_user?: string;
  entity_type?: string;
}

export interface AppliedOperationAssertion {
  operation_type: 'invalidate' | 'supersede' | 'hide' | 'delete' | 'merge';
  target_kind?: 'memory_item' | 'entity' | 'topic';
}

export interface PayloadAssertion {
  kind?: MemoryItemKind;
  contains?: string;
  topic_slug?: string;
  entity_alias?: string;
}

export interface GlobalAssertion {
  no_invalid_injection: boolean;
  no_deleted_in_payload: boolean;
  no_statement_as_fact: boolean;
  no_cross_user_data: boolean;
  no_duplicate_extraction_on_retry: boolean;
}
```

### Runner

```ts
// memory/testing/runner.ts

export interface ScenarioRunOptions {
  llm_mode: 'mock' | 'replay' | 'record';
  fixtures_dir?: string;
  user_seed?: string;
  isolate_db?: boolean;
}

export interface ScenarioRunResult {
  scenario_id: GoldenScenarioId;
  passed: boolean;
  turn_results: TurnResult[];
  global_assertions_result: Record<string, boolean>;
  duration_ms: number;
  failures: ScenarioFailure[];
}

export interface TurnResult {
  turn_index: number;
  passed: boolean;
  observed: ObservedTurnState;
  failures: AssertionFailure[];
}

export interface ObservedTurnState {
  retrieval_mode: RetrievalMode;
  retrieval_hints: RetrievalHint[];
  topic_decision: TopicDecision;
  active_topic_id: string | null;
  payload_item_ids: string[];
  payload_entities: string[];
  created_item_ids: string[];
  created_entity_ids: string[];
  applied_operations: AppliedOperation[];
  extraction_run_id: string | null;
  duration_ms: number;
}

export interface ScenarioRunner {
  run(scenario: GoldenScenario, options: ScenarioRunOptions): Promise<ScenarioRunResult>;
  runAll(scenarios: GoldenScenario[], options: ScenarioRunOptions): Promise<ScenarioRunResult[]>;
}
```

### Modes LLM

```text
mock mode :
  fixtures deterministes inline dans le scenario YAML
  utile pour CI rapide

record mode :
  appel LLM reel, sauvegarde input/output dans fixtures_dir
  utile pour generer les fixtures initiaux

replay mode :
  rejoue les fixtures sauvegardees
  detecte si prompt_version a change -> echec demandant refresh

refresh mode :
  re-record uniquement les fixtures dont la prompt_version a change
```

### Le harness doit permettre :

```text
run scenario
seed DB
play turns
mock LLM or replay cached LLM output
inspect DB after each turn
assert runtime traces
assert payload
assert memorizer output
assert no forbidden item
```

Modes :

```text
mock mode:
  utilise fixtures deterministic

record mode:
  appelle LLM et sauvegarde outputs

replay mode:
  rejoue outputs sauvegardes

refresh mode:
  regenere fixtures quand prompt_version change
```

Assertions critiques :

```text
No memory_items status != active in payload normal.
No deleted content in any prompt.
No statement_as_fact.
No unsupported compaction claim.
No cross-user data.
No duplicate extraction on retry.
```

## Roadmap implementation

### Phase 0 - Decisions et contrats

Avant code :

1. Valider ce document.
2. Trancher embedding dimension/model.
3. Valider domain_keys v1.
4. Valider sensitivity categories.
5. Valider lifecycle/status.
6. Valider golden scenario format.
7. Valider rollout flags.

Livrables :

- `plan/memory-v2-mvp-consolidated-architecture-plan.md` ;
- `memory/domain_keys.v1.json` ou equivalent ;
- `tests/memory/scenarios/*.yaml` spec.

### Phase 1 - Migrations MVP

Creer :

- `memory_items` ;
- `memory_item_sources` ;
- `user_entities` ;
- `memory_item_topics` ;
- `memory_item_entities` ;
- `memory_item_actions` ;
- `memory_extraction_runs` ;
- `memory_change_log`.

Etendre :

- `user_topic_memories`.

Ne pas activer comportement utilisateur.

Feature flag :

```text
memory_v2_schema_enabled
```

### Phase 2 - Golden conversations + harness

Avant activation :

- ecrire 12 scenarios ;
- creer runner ;
- mock/replay LLM ;
- assertions DB ;
- assertions payload ;
- retry/idempotence tests ;
- RLS isolation tests.

Feature flag :

```text
memory_v2_eval_harness_enabled
```

### Phase 3 - Runtime shadow

Implementer :

- signal detection ;
- retrieval mode simple ;
- hints ;
- topic router sticky ;
- payload stable ;
- sensitivity filter ;
- traces.

Mode shadow :

- ne pas utiliser le payload V2 pour repondre ;
- calculer V2 en parallele de V1 ;
- comparer V1 vs V2 selon le contrat ci-dessous ;
- mesurer latency separee.

#### Spec comparaison shadow V1 vs V2

Comparer les decisions a chaque tour, sans bloquer la reponse.

```text
Pour chaque tour eligible :

1. Topic decision
   - V1.active_topic_id == V2.active_topic_id ?
   - decision_match = same | diff | v1_only | v2_only
   - log avec confidence des deux

2. Retrieval mode
   - V1.implicit_mode (deduit) vs V2.explicit_mode
   - mode_alignment_pct sur fenetre 7j

3. Payload overlap
   - V1.injected_memory_ids (mappes a V2 si possible) inter V2.payload_item_ids
   - jaccard_overlap >= 0.5 ? logger
   - items uniques V2 -> verifier qu'ils n'amenent pas de regression qualite

4. Latency
   - V1.loader_latency_ms vs V2.loader_latency_ms
   - alerte si V2 p95 > V1 p95 * 1.5
```

Seuils de blocage canary Phase 5+ :

```text
mode_alignment_pct < 70% -> investigation
topic_decision_match < 60% -> investigation
payload_jaccard_overlap median < 0.3 -> investigation
V2 p95 latency > 250ms -> blocage
invalid_injection_count > 0 -> blocage
```

Flags :

```text
memory_v2_runtime_trace_enabled
memory_v2_topic_router_shadow_enabled
memory_v2_loader_shadow_enabled
```

### Phase 4 - Memorizer dry-run

Implementer :

- batch selection ;
- anti-noise ;
- extraction 4 kinds ;
- validation ;
- entity resolution ;
- dedupe ;
- linking topic/entity/action ;
- idempotence ;
- extraction runs.

Dry-run :

- log candidates ;
- ne pas ecrire `memory_items` actifs ;
- comparer golden expected.

Flags :

```text
memory_v2_memorizer_dry_run_enabled
```

### Phase 5 - Memory write canary

Activer ecriture pour petit segment.

Criteria avant rollout :

```text
statement_as_fact_violations = 0 on golden
invalid_injection = 0
idempotent retry ok
duplicate rate acceptable
wrong topic link rate acceptable
entity alias tests pass
no_message_double_processing on golden (memory_message_processing tests)
```

Flags :

```text
memory_v2_memorizer_enabled
```

### Phase 6 - Correction et oubli minimal

**Avant** d'activer largement le loader V2, il faut que le user puisse corriger / oublier. Sinon : trahison de confiance.

Activer :

- correction hint ;
- target resolution (ordre defini : item explicite -> tour precedent -> dernier souvenir cite -> topic actif) ;
- operations : `invalidate`, `supersede`, `hide`, `delete` ;
- redaction job complet (synthesis, search_doc, sources) ;
- `memory_change_log` ;
- payload purge automatique apres operation ;
- recompaction urgente apres delete d'un item cite dans synthesis.

Test bloquant rollout :

```text
Le scenario 10_forget_sensitive_item DOIT passer integralement :
  - delete propage aux sources ;
  - delete propage a la synthesis du topic ;
  - delete propage au search_doc ;
  - aucune trace de l'item dans le prompt suivant.
```

Flags :

```text
memory_v2_corrections_enabled
```

### Phase 7 - Loader V2 actif

Activer :

- topic items ;
- entity items ;
- dated events ;
- action context ;
- payload stable.

Rollout :

```text
5% -> 25% -> 50% -> 100%
```

Gates :

- p95 memory latency ok ;
- sensitive excluded metrics ok ;
- no invalid injection ;
- no safety regression ;
- correction operations actives (Phase 6 verrouillee).

Flags :

```text
memory_v2_loader_enabled
```

### Phase 8 - Topic compaction

Activer :

- pending_changes_count ;
- topic synthesis compaction (avec validation per-claim) ;
- search_doc regeneration ;
- topic sensitivity_max recalcul ;
- compaction failure logs ;
- recompaction sur correction (deja Phase 6).

Flags :

```text
memory_v2_topic_compaction_enabled
```

### Phase 9 - Action observations

Activer plus profondement :

- plan item detection ;
- occurrence linking via `memory_item_action_occurrences` ;
- week summary ;
- action_observation ;
- possible_pattern metadata (apres seuils 3 obs / 2 sem).

Flags :

```text
memory_v2_action_signals_enabled
```

### Phase 10 - Cross-topic profile on-demand

Activer :

- domain_keys query ;
- semantic top-K complement ;
- entity-aware rerank ;
- top-K cross-topic payload ;
- no global summaries materialisees.

Eval :

- quality of profile answer ;
- latency ;
- sensitive leakage ;
- fallback rate (questions ou domain_keys ne mappe pas).

### Phase 11 - V2.5 options

Seulement si besoin prouve :

- `user_global_memory_views` ;
- `memory_summary_deltas` ;
- `memory_edges` generique ;
- advanced behavioral patterns ;
- risk signals materialises ;
- memory verifier ;
- operations queue.

## Rollout flags recommandes

Ordre d'activation :

```text
memory_v2_schema_enabled
memory_v2_eval_harness_enabled
memory_v2_runtime_trace_enabled
memory_v2_topic_router_shadow_enabled
memory_v2_loader_shadow_enabled
memory_v2_memorizer_dry_run_enabled
memory_v2_memorizer_enabled
memory_v2_corrections_enabled            # AVANT loader V2 actif
memory_v2_topic_router_enabled
memory_v2_loader_enabled
memory_v2_topic_compaction_enabled
memory_v2_action_signals_enabled
memory_v2_cross_topic_lookup_enabled
memory_v2_sensitive_audit_enabled
memory_v2_redaction_job_enabled          # actif des Phase 6 pour delete/hide
```

## SLOs MVP

Runtime :

```text
memory loader p95 < 200ms
topic router no-LLM path p95 < 80ms
topic router with LLM p95 acceptable only in shadow / rare path
payload item count <= configured budget
invalid injection = 0
```

Memorizer :

```text
batch extraction async, no user-facing latency
idempotent retry success = 100%
statement_as_fact violations = 0 on golden
unsupported compaction claim = 0 on golden
```

Quality :

```text
topic decision accuracy >= 90% on golden
false switch low
false create low
entity alias resolution >= 90% on golden
correction success = 100% on golden
forget success = 100% on golden
```

## Procedure de rollback

Si une phase canary detecte une regression, il faut un plan clair.

### Niveaux de rollback

#### Niveau 1 - Disable feature flag

Desactive un flag specifique sans toucher la DB.

Cas d'usage :

- topic router V2 produit trop de switches faux ;
- loader V2 trop lent ;
- memorizer trop bruyant.

Actions :

```text
1. Set flag false (memory_v2_loader_enabled = false)
2. Le runtime revient a V1
3. Le memorizer continue async (selon flag separe)
4. Pas d'impact sur les rows deja ecrites
5. Time to recover : minutes
```

#### Niveau 2 - Stop memorizer write

Arrete les ecritures durables sans toucher aux rows existantes.

Cas d'usage :

- statement_as_fact violations en hausse ;
- doublons en hausse ;
- entity merges errones.

Actions :

```text
1. Set memory_v2_memorizer_enabled = false
2. Le memorizer continue en dry-run
3. Les nouvelles propositions sont logguees mais pas persistees
4. Les rows deja ecrites restent lisibles par le loader V2 si actif
5. Time to recover : minutes
```

#### Niveau 3 - Quarantine rows V2

Marque les rows V2 recentes comme suspectes sans les supprimer.

Cas d'usage :

- bug d'extraction qui a produit des items biases sur fenetre identifiable ;
- regression sur un pan specifique (ex: tous les statements sensibles mal classes).

Actions :

```text
1. Identifier la fenetre temporelle suspecte (extraction_run_id range)
2. UPDATE memory_items SET status='archived', metadata.quarantined_reason='canary_regression_2026-XX-XX'
   WHERE extraction_run_id IN (suspect_runs)
3. Logger memory_change_log entries en bulk
4. Ne pas hard delete (audit)
5. Time to recover : 30 minutes
```

#### Niveau 4 - Revert migrations

Dernier recours si le schema lui-meme cause un probleme bloquant.

Cas d'usage :

- migration corrompue ;
- contrainte qui casse les writes V1.

Actions :

```text
1. STOP toutes les writes V2 (flags off)
2. Rollback migrations dans l'ordre inverse
3. Conserver dump des donnees V2 pour analyse
4. Communication interne obligatoire avant exec
5. Time to recover : heures
```

### Decision matrix

```text
Probleme                       | Niveau | Owner
-------------------------------|--------|------------
Latency runtime > SLO          | 1      | Eng on-call
Wrong topic switches frequent  | 1      | Eng on-call
Statement_as_fact violations   | 2      | Eng on-call
Duplicate items en hausse      | 2      | Eng on-call
Sensitive injection hors policy| 1      | Eng + privacy
Cross-user data leak           | 2 + audit | Eng + security
Bug extraction sur fenetre     | 3      | Eng + memory lead
Schema corrompu                | 4      | Eng lead seul
```

### Communication

- Niveau 1 : log interne, retro post-mortem.
- Niveau 2 : alerte Slack #memory + post-mortem.
- Niveau 3 : alerte + decision lead + audit log RGPD si donnees user impactees.
- Niveau 4 : alerte critique, comm utilisateur si downtime perceptible.

### Tests rollback

A executer avant chaque rollout majeur :

```text
1. Disable memory_v2_loader_enabled puis re-enable -> verifier coherence
2. Quarantine artificielle de N items test -> verifier loader les ignore
3. Simuler retry memorizer sur batch deja completed -> verifier idempotence
4. Drop and recreate user_topic_memories.search_doc_embedding -> verifier rebuild ok
```

## Principaux risques

### 1. Trop de memoire, pas assez de silence

Risque :

Le memorizer extrait trop.

Mitigation :

- anti-noise ;
- importance_score ;
- candidate TTL ;
- golden forbidden_items ;
- metrics proposed/accepted.

### 2. Statement transforme en fact

Risque :

Sophia pathologise ou objective une emotion.

Mitigation :

- validation deterministe ;
- prompt extraction strict ;
- metric violation ;
- golden self-blame scenario.

### 3. Mauvais topic

Risque :

Un item va dans le mauvais dossier et biaise les futures reponses.

Mitigation :

- sticky router ;
- zone grise LLM ;
- no forced link if low confidence ;
- topic link confidence ;
- eval wrong-link.

### 4. Entites dupliquees

Risque :

"papa" et "mon pere" deviennent deux entites.

Mitigation :

- aliases ;
- relation_to_user ;
- exact match ;
- embedding match ;
- merge log ;
- golden father aliases.

### 5. Correction non appliquee

Risque :

User perd confiance.

Mitigation :

- correction hint ;
- target resolution ;
- memory_change_log ;
- payload purge ;
- test correction/forget.

### 6. Sensible injecte hors contexte

Risque :

Sophia ressort une vulnerabilite au mauvais moment.

Mitigation :

- sensitivity filter ;
- requires_user_initiated ;
- no literal quote ;
- sensitive audit ;
- safety scenario.

### 7. Compaction hallucinee

Risque :

summary invente.

Mitigation :

- supporting_item_ids ;
- validation ;
- old summary preserved on failure ;
- no global compaction MVP.

### 8. Cout memorizer

Risque :

Extraction trop chere.

Mitigation :

- anti-noise ;
- batching ;
- async ;
- dry-run measurement ;
- skip trivial ;
- no compaction global.

### 9. Latence runtime

Risque :

WhatsApp devient lent.

Mitigation :

- no extraction runtime ;
- simple queries ;
- payload cache ;
- LLM router rare ;
- p95 memory latency metrics.

### 10. Retry doublonne

Risque :

Memorizer cree deux fois les memes items.

Mitigation :

- batch_hash ;
- unique constraint ;
- transaction ;
- extraction_run_id ;
- retry behavior tested.

## Tableau recapitulatif des decisions MVP

| # | Sujet | Decision | Reportable a |
|---|-------|----------|--------------|
| 1 | `memory_edges` generique | Non. Tables ciblees. | V2.5 si usage prouve |
| 2 | `user_entities` | Oui des le MVP | - |
| 3 | Global memory views materialisees | Non. `domain_keys` + retrieval on-demand multi-source | V2 si latence/qualite l'exige |
| 4 | Memory item kinds | 4 (`fact`, `statement`, `event`, `action_observation`) | extension via metadata roles |
| 5 | Retrieval modes | 3 modes + 3 hints | enrichissement progressif |
| 6 | Correction audit | `memory_change_log` enrichi (promote, archive_expired, redaction_propagated) | queue complete en V2 |
| 7 | Compaction | Topics only, claims valides per-id | global compaction V2 |
| 8 | Golden conversations | Obligatoires avant activation, scenario `forget` bloquant | - |
| 9 | Domain keys | Taxonomie fermee v1, format `domain.subdomain` (`.general` si pas de subdivision) | reviews periodiques |
| 10 | Embedding (modele + dim) | **`gemini-embedding-001@768`** (verrouille Sprint 0) | migration dual-write V2.5 si besoin |
| 11 | Extraction durable runtime | Non. Runtime lit/route/charge/repond | - |
| 12 | Memorizer idempotence | Double : `batch_hash` (axe 1) + `memory_message_processing` (axe 2) | - |
| 13 | Privacy | 3 niveaux + categories tags + `requires_user_initiated` priorisant | matrix fine V2 |
| 14 | Actions | `action_observation` + `memory_item_actions` + junction `memory_item_action_occurrences` | `behavioral_pattern` materialise V2.5 |
| 15 | `memory_summary_deltas` | Non. `pending_changes_count` suffit | V2 si debug fin requis |
| 16 | Statement -> fact | Pas de promotion auto | derivation explicite via `derived_from` V2 |
| 17 | Multilingue | FR principal, embeddings multilingues, content interne FR | - |
| 18 | Retention RGPD | Soft delete + hard delete a 30/90/365 jours selon table | endpoint user dashboard V2 |
| 19 | Weekly review trigger | Cron timezone-aware + idempotent par iso_week, ne re-extrait pas messages deja traites | - |
| 20 | Rollback | 4 niveaux : flag, stop write, quarantine, revert migration | - |
| 21 | Candidate -> active | Regles explicites (>=0.75 et source -> active ; 0.55-0.75 -> candidate ; <0.55 -> reject) ; promotion via reaffirmation/cross-source/topic_durable | - |
| 22 | Redaction sur delete/hide | Job complet propage a sources, synthesis, search_doc, payload state | - |
| 23 | action_link extraction | Non LLM. Linker deterministe cote systeme depuis plan_signals | - |
| 24 | Cardinalite relations | Registry `usually_single | multiple | time_scoped` | enrichissement |
| 25 | Anti-noise entities | Heuristique : nom commun -> requiert recurrence dans 3+ messages et 2+ topics | - |
| 26 | Cross-topic lookup | 4 etapes : domain_keys + semantic top-K + topic-aware rerank + sensitivity filter | - |
| 27 | Topic synthesis sensitivity | `sensitivity_max` calcule, injection conditionnelle selon mode et lifecycle | - |
| 28 | unique constraint sources | **`nulls not distinct`** (Postgres 17 confirme) | - |
| 29 | Triggers `updated_at` | Pattern generique applique a toutes les tables ayant ce champ | - |
| 30 | FK `extraction_run_id` | Soft FK (`set null`) sur memory_items, sources et joins | - |
| 31 | Ordre roadmap | Correction/forget AVANT loader actif large | - |

## Definition of done MVP

Memory V2 MVP est pret quand :

- migrations appliquees localement ;
- RLS tests passent ;
- 12 golden conversations passent ;
- runtime shadow produit traces coherentes ;
- memorizer dry-run idempotent ;
- no statement_as_fact on golden ;
- no invalid/deleted item in payload ;
- correction/forget scenarios passent ;
- entity alias scenario passe ;
- action missed scenario passe ;
- p95 loader latency acceptable ;
- canary logs sans alerte critique.

## Conclusion

Cette version garde le coeur ambitieux de Sophia Memory V2 :

- memoire atomique ;
- provenance ;
- correction ;
- oubli ;
- topics vivants ;
- actions reliees ;
- sensible filtre ;
- summaries derivees.

Mais elle retire ce qui rendrait le MVP fragile :

- graphe generique ;
- global summaries ;
- deltas complexes ;
- operations queue ;
- kinds trop nombreux ;
- privacy matrix trop fine ;
- router trop sophistique.

Le resultat vise :

```text
Une memoire assez structuree pour etre fiable,
assez simple pour etre livree,
assez rapide pour WhatsApp,
assez auditable pour corriger,
assez extensible pour V2.5.
```

Le principe final :

```text
Construire d'abord la colonne vertebrale.
Mesurer les erreurs.
Puis seulement ajouter les organes complexes.
```

## Annexe A - Prompts canoniques

Les prompts ci-dessous sont les versions de reference du MVP.
Toute modification doit incrementer `prompt_version` et regenerer les fixtures golden.

### A.1 Extraction memorizer

`memory.memorizer.extraction.v1`

```text
Tu es un extracteur de souvenirs pour Sophia, un coach IA.

Tu recois :
- les derniers messages du user et de l'assistant ;
- le topic conversationnel actif (si present) ;
- la liste des entites connues du user ;
- la taxonomie domain_keys autorisee ;
- les items deja injectes recemment (pour eviter doublons) ;
- les signaux temporels deja resolus.

Tu produis un JSON strict avec :
- memory_items : nouveaux souvenirs interpretes
- entities : nouvelles entites ou aliases a ajouter
- corrections : operations correction/oubli detectees
- rejected_observations : ce que tu as choisi de ne pas extraire et pourquoi

Regles dures :

1. Tu n'inventes JAMAIS d'information non presente dans les messages.
2. Tu cites toujours une source (source_message_ids).
3. Tu ne transformes JAMAIS une emotion en fait objectif.
   - "Je me sens nul" -> kind=statement
   - JAMAIS kind=fact "Le user est nul"
4. Tu ne diagnostiques JAMAIS.
   - Pas de "le user est depressif", "trouble", "narcissique", "incapable".
   - Reformuler en statement ou observation contextuelle.
5. Tu choisis kind dans la liste fermee uniquement :
   - fact, statement, event, action_observation
6. Tu choisis domain_keys uniquement dans la taxonomie fournie.
   - Si aucun ne correspond, laisse [] et ajoute proposed_domain_key dans metadata.
7. Pour kind=event, event_start_at est obligatoire.
   Utilise les resolutions temporelles fournies, ne devine jamais une date.
8. Pour kind=action_observation, link a plan_item_id si present dans le contexte.
9. Tu marques sensitivity_level :
   - safety : detresse, crise, ideation, danger pour soi/autrui
   - sensitive : addiction, sante mentale, intimite, famille, finances, auto-jugement dur
   - normal : reste
10. Tu ne crees PAS d'item pour :
    - small talk, ack, "merci", "ok", emoji ;
    - confirmations sans contexte ("fait", "done").
10b. Si une information du message correspond DEJA a un item injecte recemment :
    - ne pas creer un nouvel item ;
    - ajouter une entree dans rejected_observations avec :
        reason="already_known"
        existing_memory_item_id="<id de l'item connu>"
        source_message_ids=[...]
    - le systeme decidera d'ajouter une source supplementaire ou
      d'incrementer la confidence de l'item existant.
11. Tu n'extraies pas un pattern depuis 1 ou 2 occurrences.
    Pour kind=action_observation, marque metadata.observation_role="possible_pattern"
    UNIQUEMENT si tu vois >= 3 occurrences sur >= 2 semaines dans le contexte.
12. Pour les entites :
    - reuse exact match si alias deja connu ;
    - propose merge avec metadata.merge_target_id si tres proche.
13. confidence < 0.55 : ne cree pas l'item, mets-le dans rejected_observations.

Format de sortie : JSON valide uniquement, pas de prose autour.
```

Schema de sortie attendu :

```json
{
  "memory_items": [
    {
      "kind": "fact|statement|event|action_observation",
      "content_text": "...",
      "normalized_summary": "...",
      "domain_keys": ["..."],
      "confidence": 0.0,
      "importance_score": 0.0,
      "sensitivity_level": "normal|sensitive|safety",
      "sensitivity_categories": ["..."],
      "requires_user_initiated": false,
      "source_message_ids": ["..."],
      "evidence_quote": "...",
      "event_start_at": null,
      "event_end_at": null,
      "time_precision": null,
      "entity_mentions": ["..."],
      "topic_hint": "...",
      "canonical_key_hint": null,
      "metadata": {
        "statement_role": "goal|boundary|preference|...",
        "observation_role": "single|week|streak|possible_pattern"
      }
    }
  ],
  "entities": [
    {
      "entity_type": "person|organization|place|project|object|group|other",
      "display_name": "...",
      "aliases": ["..."],
      "relation_to_user": "...",
      "confidence": 0.0,
      "metadata": {
        "merge_target_id": null
      }
    }
  ],
  "corrections": [
    {
      "operation_type": "invalidate|supersede|hide|delete",
      "target_hint": "...",
      "reason": "...",
      "source_message_ids": ["..."]
    }
  ],
  "rejected_observations": [
    {
      "reason": "small_talk|low_confidence|no_source|diagnostic_attempt|already_known|duplicate",
      "text": "...",
      "existing_memory_item_id": null
    }
  ]
}
```

### Champs ajoutes : explication

#### `requires_user_initiated`

Le LLM le met a `true` quand l'item est tellement intime, douloureux ou cru que sa simple reinjection automatique serait inappropriee, meme si le topic actif s'y rapporte. Exemples :

- trauma evoque par le user ;
- contenu sexuel ou intime tres explicite ;
- honte tres forte / auto-devalorisation tres crue ;
- ideation auto-destructrice ;
- sante mentale tres intime.

Quand `requires_user_initiated = true`, le loader ne charge l'item QUE si :

- le user demande explicitement ce souvenir ;
- ou le user revient explicitement sur le meme sujet sensible ;
- ou `safety_first` le rend strictement necessaire.

Cette regle prime sur la regle topic actif.

#### `canonical_key_hint`

Optionnel. Le LLM peut proposer une cle canonique courte pour aider la dedupe :

```text
Format : domain.subdomain.specific
Exemples :
  addictions.cannabis.social_fear
  travail.conflits.manager_actuel
  habitudes.execution.fatigue_soir
```

Le systeme **ne stocke pas directement ce hint dans `canonical_key`**. Il le passe au resolver de dedupe qui peut l'utiliser comme signal supplementaire avant de generer la cle finale (combinaison de hint + entity_ids + kind).

#### `action_link` : delegue au systeme

Le LLM **ne propose PAS** `action_link`. Il indique seulement dans le contenu de l'item si une action est concernee, et passe les references via `metadata.observation_role`.

C'est le **linker deterministe cote systeme** qui :

1. detecte `kind = 'action_observation'` ;
2. recupere les `plan_signals` deja injectes dans le contexte LLM (plan_item_id, occurrence_ids, dates) ;
3. construit la row `memory_item_actions` avec :
   - `plan_item_id` (depuis le contexte) ;
   - `observation_window_start/end` (depuis les dates resolues) ;
   - `aggregation_kind` (depuis `metadata.observation_role`) ;
4. ajoute les rows `memory_item_action_occurrences` pour chaque occurrence_id present.

Avantage : un LLM peut halluciner un UUID. Un linker deterministe ne peut pas.

### A.2 Topic router (zone grise)

`memory.runtime.topic_router.v1`

```text
Tu es un routeur conversationnel pour Sophia.

Tu recois :
- le dernier message du user ;
- les 3 a 5 derniers messages ;
- le topic actif (titre + search_doc court) ;
- les top-3 topics candidats avec titres et snippets ;
- les hints (dated_reference, correction, action_related, safety).

Tu choisis UNE decision parmi :
- stay : le message continue le topic actif
- switch : le message change clairement de sujet vers un topic existant
- create_candidate : un nouveau sujet emerge clairement
- side_note : detail lateral, pas de changement de fil

Regles :

1. Sticky par defaut : si tu doutes, choisis stay.
2. switch seulement si le nouveau sujet est manifestement le centre de gravite.
3. create_candidate seulement si AUCUN candidat ne convient et le sujet est important
   (pas un detail trivial).
4. side_note si le user mentionne un detail lateral mais reste mentalement sur le topic actif.
5. En cas de hint=correction, choisis stay sauf si la correction porte explicitement sur un autre topic.
6. En cas de hint=safety, ne change pas de topic sauf rupture explicite.

Format sortie : JSON strict :

{
  "decision": "stay|switch|create_candidate|side_note",
  "target_topic_id": "uuid|null",
  "new_topic_proposal": {
    "title": "...",
    "domain_hint": "...",
    "search_seed": "..."
  } | null,
  "confidence": 0.0,
  "reason": "..."
}

Pas de prose autour, JSON uniquement.
```

### A.3 Compaction topic

`memory.compaction.topic.v1`

```text
Tu produis la nouvelle synthesis et le nouveau search_doc d'un topic Sophia.

Tu recois :
- le titre du topic ;
- la synthesis precedente (peut etre vide) ;
- la liste des memory items actifs lies au topic, dans l'ordre :
  - statements importants ;
  - facts ;
  - events recents ;
  - action observations.
  Chaque item porte : id, kind, content_text, observed_at, sensitivity_level, source_message_id.

Tu produis :
- synthesis : 100 a 250 mots, factuelle, sans diagnostic, sans drame.
- search_doc : 200 a 600 mots, riche en mots-cles pour retrieval.
- supporting_item_ids : la liste des memory_item.id que tu cites ou resumes.

Regles dures :

1. Tu n'inventes RIEN. Si une info n'est pas dans les items fournis, tu ne l'inclus pas.
2. Tu ne transformes JAMAIS un statement en fact objectif.
   - "Le user dit se sentir nul" reste une parole, pas une realite.
3. Tu ne cites JAMAIS litteralement un statement marque sensitive ou safety.
   - Reformule avec tact, indique que c'est une parole du user dans un contexte difficile.
4. Tu distingues toujours :
   - ce qui est recent (< 14 jours) ;
   - ce qui est plus ancien.
5. Tu n'utilises AUCUN item dont le statut n'est pas "active".
   (Le caller t'envoie deja seulement les actifs, mais respecte cette regle si doute.)
6. Tu ne fais pas de diagnostic psychologique.
7. Tu utilises un francais clair, sobre, respectueux du user.
8. Tu produis une liste explicite de `claims`, chacun avec ses `supporting_item_ids`.
   Cela permet au systeme de valider qu'aucun claim n'est invente.
9. La synthesis ne doit pas dramatiser ni minimiser.
10. Si un item est marque sensitive ou safety, ne pas le citer literalement
    dans la synthesis ; le reformuler avec tact.

Format sortie : JSON strict :

{
  "synthesis": "...",
  "search_doc": "...",
  "claims": [
    {
      "claim": "Le user travaille sur l'arret du cannabis.",
      "supporting_item_ids": ["mem_1"],
      "sensitivity_level": "normal"
    },
    {
      "claim": "La peur de perdre le lien social semble etre un enjeu.",
      "supporting_item_ids": ["mem_2", "mem_3"],
      "sensitivity_level": "sensitive"
    }
  ],
  "supporting_item_ids": ["mem_1", "mem_2", "mem_3"],
  "sensitivity_max": "normal|sensitive|safety",
  "warnings": []
}

Si tu ne peux pas produire une synthesis honnete avec les items fournis, mets warnings et synthesis vide.
```

#### Validation post-compaction (cote systeme)

```text
Pour chaque claim :
  - supporting_item_ids non vide ;
  - tous les ids existent et ont status = 'active' ;
  - tous les ids appartiennent au user_id en cours.

Si la synthesis contient une affirmation factuelle qui n'apparait dans aucun claim ->
   considerer la compaction comme suspecte.

Strategie de detection naive (regex / segmentation phrase) :
  Si une phrase commence par "Le user X" ou "Le user a Y" et n'est pas
  couverte par un claim -> warning.

En cas d'echec :
  - ne PAS appliquer la nouvelle synthesis ;
  - conserver l'ancienne ;
  - log memory.compaction.failed_validation_count ;
  - alerte si le taux d'echec > 5% sur fenetre 7j.
```

### Versioning des prompts

Chaque prompt a un `prompt_version` :

```text
memory.memorizer.extraction.v1
memory.runtime.topic_router.v1
memory.compaction.topic.v1
```

Regles :

```text
1. Tout changement non-trivial incremente la version (v1 -> v2).
2. memory_extraction_runs.prompt_version est obligatoire.
3. Les fixtures golden sont indexees par prompt_version.
4. Le replay mode echoue si les fixtures ne matchent pas la version courante -> trigger refresh.
5. Un changement majeur de prompt declenche une re-eval golden complete avant rollout.
```

## Annexe B - Cles temp_memory MVP

Cles a utiliser dans `user_chat_states.temp_memory` :

```text
__active_topic_state_v2
__memory_payload_state_v2
__last_extraction_run_marker_v2
__pending_correction_target_v2
```

Format `__active_topic_state_v2` :

```json
{
  "version": 2,
  "active_topic_id": "uuid|null",
  "active_topic_slug": "string|null",
  "lifecycle_stage": "candidate|durable|dormant",
  "confidence": 0.0,
  "previous_topic_id": "uuid|null",
  "candidate_topic_ids": ["uuid"],
  "last_decision": "stay|switch|create_candidate|side_note",
  "last_decision_reason": "string",
  "last_switched_at": "iso",
  "router_version": "memory_v2_router_mvp_1",
  "updated_at": "iso"
}
```

Format `__memory_payload_state_v2` :

```json
{
  "version": 2,
  "last_turn_id": "uuid",
  "active_topic_id": "uuid|null",
  "items": [
    {
      "memory_item_id": "uuid",
      "reason": "active_topic_core|cross_topic|dated|action|safety|payload_carryover",
      "ttl_turns_remaining": 3,
      "sensitivity_level": "normal|sensitive|safety",
      "last_injected_at": "iso"
    }
  ],
  "entities": [
    {
      "entity_id": "uuid",
      "reason": "mentioned_recently|topic_anchor",
      "ttl_turns_remaining": 3
    }
  ],
  "modules": {
    "dated_context": {
      "expires_at": "iso",
      "window_start": "iso",
      "window_end": "iso"
    },
    "action_context": {
      "expires_at": "iso",
      "plan_item_ids": ["uuid"]
    }
  },
  "budget": {
    "max_items": 12,
    "max_entities": 5,
    "tokens_target": 1800
  }
}
```

## Annexe C - Fichiers de reference a creer

Pour eviter la derive entre la doc et le code, certains contrats vivent dans des fichiers dedies.

```text
memory/types.v1.ts
  - MemoryItemKind, MemoryItemStatus
  - SensitivityLevel, SensitivityCategory
  - RetrievalMode, RetrievalHint
  - TopicDecision
  - MemoryItemTopicRelation, MemoryItemEntityRelation
  - AggregationKind
  - canonical lists exportees

memory/domain_keys.v1.json
  - liste fermee versionnee
  - utilisable directement par l'extracteur et par la validation

memory/prompts/
  - extraction.v1.md
  - topic_router.v1.md
  - compaction_topic.v1.md

memory/testing/
  - types.ts (cf. Annexe Test harness)
  - runner.ts
  - scenarios/*.yaml
  - fixtures/<scenario_id>/<prompt_version>.json
```

Toute divergence entre ces fichiers et le present plan est un bug a fixer dans le plan ou dans le fichier.
