# Memoire V2 Sophia - Architecture Atomique Memory-Item-First

## Objectif du document

Ce document sert de base de review pour une refonte profonde de la memoire Sophia.

Il ne s'agit pas seulement d'ajouter du RAG ou quelques tables supplementaires. Le but est de concevoir une architecture memoire fiable pour un coach conversationnel long terme, capable de suivre des sujets humains complexes, des actions datees, des signaux WhatsApp, des skills conversationnelles, et des evolutions personnelles dans le temps.

Le point de depart de cette version est une decision structurante :

> La source de verite des souvenirs interpretes doit etre une couche atomique unique : `user_memory_items`.

Les topics conversationnels et les global memories ne doivent plus etre les endroits ou la verite se perd. Ils deviennent des vues/syntheses derivees au-dessus d'objets atomiques, datables, sourcables, corrigeables et reliables.

Ce document doit permettre a un reviewer externe de challenger l'architecture, les schemas, les pipelines, les arbitrages et les risques.

## Contexte produit

Sophia est une application de coaching personnel conversationnel.

Elle aide un utilisateur a se transformer sur des sujets de vie importants :

- discipline ;
- addiction ;
- sante ;
- confiance ;
- relations ;
- travail ;
- habitudes ;
- estime de soi ;
- objectifs personnels ;
- execution quotidienne ;
- gestion des blocages ;
- reprise apres echec.

Le produit combine plusieurs surfaces :

- un dashboard avec un plan personnalise ;
- des actions datees dans le temps ;
- des checks WhatsApp matin/soir ;
- des bilans hebdomadaires legers ;
- des conversations libres avec Sophia ;
- des skills conversationnelles specialisees ;
- une memoire durable ;
- des donnees d'execution reelles : actions prevues, faites, partielles, ratees, deplacees.

Sophia n'est donc pas un simple chatbot. Elle doit relier :

- ce que le user dit ;
- ce qu'il ressent ;
- ce qu'il fait vraiment ;
- ce qu'il n'arrive pas a faire ;
- les patterns qui emergent dans le temps ;
- les sujets qui reviennent ;
- les evenements dates ;
- les actions et le plan ;
- les formulations fortes du user ;
- les donnees sensibles a manipuler avec prudence.

## Pourquoi la memoire est difficile ici

Une memoire de coaching est plus difficile qu'une memoire de conversation classique.

Dans un assistant standard, on peut parfois se contenter de :

- derniers messages ;
- un resume global ;
- quelques facts utilisateur ;
- RAG vectoriel.

Pour Sophia, ce n'est pas suffisant.

Sophia doit comprendre le fil d'un sujet sur plusieurs semaines, parfois plusieurs mois. Elle doit savoir que "mon pere" peut appartenir a plusieurs sujets differents : enfance, conflit actuel, mariage des parents, sentiment d'abandon, etc. Elle doit savoir que "vendredi dernier" peut etre un event lie au topic courant, ou un autre event completement different. Elle doit savoir que "j'ai pas fait mon action" n'est pas seulement une phrase, mais une information reliee a une occurrence de plan.

Les risques principaux sont :

- faux souvenirs ;
- mauvais rattachements ;
- duplication de topics ;
- summaries qui deviennent des fictions ;
- contexte injecte instable ;
- infos sensibles ressorties hors contexte ;
- user corrige Sophia mais la memory continue d'utiliser l'ancienne interpretation ;
- global profile trop psychologisant ;
- cout LLM trop eleve ;
- latence runtime trop forte ;
- memorizer qui relit trop de choses et devient ingouvernable.

L'architecture doit donc etre :

- fiable ;
- corrigeable ;
- auditable ;
- incrementale ;
- stable en runtime ;
- soutenable en cout ;
- prudente sur le sensible ;
- capable de relier conversation et execution reelle.

## Decision d'architecture centrale

La proposition cible est :

```text
chat_messages / plan / checkins / skill_runs
        |
        v
user_memory_items + memory_item_sources
        |
        v
memory_edges
        |
        v
topics vivants + global memory views
        |
        v
runtime loader + payload stable
        |
        v
Sophia
        |
        v
memorizer async + compaction + correction
```

Les objets atomiques deviennent la base. Les summaries deviennent des vues derivees.

### Ce que cela change

Avant, la tentation etait de faire porter trop de poids aux topics et aux global memories :

- topic synthesis comme source de verite ;
- global memory facts comme conteneur principal ;
- links centres autour des topics ;
- events a part ;
- facts pas toujours atomiques ;
- correction difficile.

La nouvelle logique est :

- `user_memory_items` porte les souvenirs interpretes atomiques ;
- `memory_item_sources` porte les preuves ;
- `memory_edges` porte les relations ;
- `user_topic_memories` porte les dossiers conversationnels ;
- `user_global_memories` ou `user_global_memory_views` porte les vues transversales ;
- summaries et search docs sont des caches intelligents ;
- le memorizer maintient les liens et les syntheses.

## Concepts fondamentaux

### 1. Historique brut

`chat_messages` reste la source brute de conversation.

Il contient :

- message user ;
- message assistant ;
- scope : WhatsApp, web, module, etc. ;
- timestamps ;
- metadata runtime ;
- topic context ;
- retrieval mode ;
- references temporelles ;
- signaux detectes.

Ce n'est pas une memoire interpretee. C'est la source historique brute.

### 2. Memory item atomique

`user_memory_items` est la source de verite des souvenirs interpretes.

Un memory item est une unite atomique, datable, sourcable, corrigeable.

Types possibles :

- `fact` : fait explicite ou quasi explicite ;
- `event` : evenement date ou quasi date ;
- `statement` : formulation forte du user conservee comme parole ;
- `preference` : preference stable ;
- `goal` : objectif ou intention ;
- `boundary` : limite formulee ;
- `action_observation` : observation derivee du plan/action ;
- `behavioral_pattern` : pattern repete ;
- `risk_signal` : signal sensible ou safety ;
- `correction_note` : correction apportee par le user.

Le memory item ne doit pas etre trop gros. Il doit correspondre a une idee claire.

Exemple fact :

```text
La fatigue du soir rend l'action marche plus difficile.
```

Exemple event :

```text
Soiree difficile avec des amis fumeurs vendredi soir.
```

Exemple statement :

```text
"Je veux vraiment arreter le cannabis, mais j'ai peur de perdre mes potes."
```

Exemple action observation :

```text
L'action marche a ete ratee deux fois et partielle une fois cette semaine, avec fatigue du soir comme obstacle mentionne.
```

### 3. Source et provenance

Un memory item doit toujours avoir une source.

`memory_item_sources` relie un souvenir a :

- un message ;
- une occurrence d'action ;
- un check WhatsApp ;
- un skill run ;
- un weekly review ;
- une correction user ;
- un signal systeme.

Pourquoi c'est important :

- audit ;
- correction ;
- confiance ;
- suppression ;
- re-compaction ;
- eviter les hallucinations ;
- savoir si l'information vient du user, du plan, ou d'une inference.

Un statement sensible ne doit jamais etre traite comme une verite objective. Sa source doit permettre de retrouver qu'il s'agit d'une formulation du user dans un contexte donne.

### 4. Edges / relations

`memory_edges` relie les objets entre eux.

Ce n'est pas une memoire en soi. C'est la structure relationnelle.

Relations possibles :

- memory item -> topic ;
- memory item -> global memory ;
- memory item -> plan item ;
- memory item -> action occurrence ;
- memory item -> skill run ;
- memory item -> memory item ;
- topic -> topic ;
- event -> topic ;
- statement -> global memory ;
- action observation -> behavioral pattern.

Relation types minimaux :

- `about` ;
- `supports` ;
- `derived_from` ;
- `mentioned_with` ;
- `blocks` ;
- `helps` ;
- `related_to` ;
- `supersedes` ;
- `contradicts`.

Les edges permettent :

- de charger la memoire par topic ;
- de charger une vue globale par preuves ;
- de retrouver ce qui supporte une summary ;
- de propager les corrections ;
- de savoir quelles syntheses recompacter.

### 5. Topics conversationnels

Les topics sont les dossiers vivants de conversation.

Ils repondent a la question :

> De quoi parle-t-on dans ce fil conversationnel ?

Un topic peut etre :

- arret du cannabis ;
- rupture amoureuse ;
- conflit avec le pere ;
- difficulte a tenir le plan sante ;
- stress au travail ;
- passage a vide ;
- relation avec un ami ;
- blocage autour d'une action.

Un topic contient :

- title ;
- aliases/keywords ;
- lifecycle ;
- synthesis ;
- search_doc ;
- embedding ;
- active state ;
- summary version ;
- importance ;
- sensitivity max ;
- pending deltas.

Mais le topic n'est pas la source de verite. Son `synthesis` est une vue compacte derivee des memory items et edges.

### 6. Global memories / global profile

Les global memories sont des vues transversales.

Elles repondent a la question :

> Qu'est-ce qu'on sait durablement sur une dimension de la personne ?

Exemples :

- psychologie.discipline ;
- psychologie.estime_de_soi ;
- addictions.cannabis ;
- relations.appartenance_sociale ;
- travail.conflits ;
- habitudes.execution ;
- sante.energie ;
- objectifs.identite.

Un topic peut alimenter plusieurs global memories.

Exemple :

Topic `arret_cannabis` peut alimenter :

- `addictions.cannabis` ;
- `psychologie.discipline` ;
- `relations.appartenance_sociale` ;
- `habitudes.environnement`.

La global memory est donc une synthese transversale derivee de plusieurs memory items, topics et edges.

### 7. Summary / synthesis / search_doc

Les summaries ne sont pas la source de verite.

Elles sont des caches intelligents pour :

- repondre plus vite ;
- garder une continuite ;
- eviter de relire trop d'atomiques ;
- donner au modele une vue compacte.

Types de syntheses :

- `topic.synthesis` ;
- `topic.search_doc` ;
- `global_memory.canonical_summary` ;
- `global_memory.search_doc`.

Les syntheses doivent etre recompilables depuis les memory items et edges.

## Schema cible

### user_memory_items

Table principale des souvenirs interpretes.

Champs recommandes :

```sql
id uuid primary key
user_id uuid not null
kind text not null
status text not null default 'candidate'
canonical_key text null
domain text null
subdomain text null
content_text text not null
normalized_summary text null
structured_data jsonb default '{}'
confidence numeric not null default 0.7
importance_score numeric not null default 0
sensitivity_level integer not null default 0
sensitivity_categories text[] default '{}'
injection_policy text not null default 'normal_if_relevant'
observed_at timestamptz null
valid_from timestamptz null
valid_until timestamptz null
event_start_at timestamptz null
event_end_at timestamptz null
time_precision text null
timezone text null
source_scope text null
source_hash text null
embedding vector(...)
superseded_by_item_id uuid null
last_retrieved_at timestamptz null
metadata jsonb default '{}'
created_at timestamptz default now()
updated_at timestamptz default now()
```

Statuses :

- `candidate` ;
- `active` ;
- `superseded` ;
- `invalidated` ;
- `hidden_by_user` ;
- `deleted_by_user` ;
- `archived`.

### memory_item_sources

Preuves et provenance.

```sql
id uuid primary key
user_id uuid not null
memory_item_id uuid not null
source_type text not null
source_id uuid null
source_message_id uuid null
source_scope text null
source_created_at timestamptz null
evidence_quote text null
evidence_summary text null
extraction_run_id uuid null
confidence numeric default 0.7
metadata jsonb default '{}'
created_at timestamptz default now()
```

Source types :

- `chat_message` ;
- `action_occurrence` ;
- `scheduled_checkin` ;
- `skill_run` ;
- `weekly_review` ;
- `manual_correction` ;
- `system_signal`.

### memory_edges

Relations generiques.

```sql
id uuid primary key
user_id uuid not null
source_type text not null
source_id uuid not null
target_type text not null
target_id uuid not null
relation_type text not null
confidence numeric default 0.7
observed_count integer default 1
first_observed_at timestamptz default now()
last_observed_at timestamptz default now()
evidence_start_at timestamptz null
evidence_end_at timestamptz null
status text default 'active'
metadata jsonb default '{}'
created_at timestamptz default now()
updated_at timestamptz default now()
```

Contraintes :

- unique par user/source/target/relation ;
- ne jamais creer de lien faible juste pour remplir le graphe ;
- si doute, ne pas lier ou laisser candidate.

### user_topic_memories

Table existante a faire evoluer.

Elle devient une vue conversationnelle derivee.

Champs a ajouter :

- `lifecycle_stage` ;
- `importance_score` ;
- `confidence` ;
- `active_days_count` ;
- `last_active_at` ;
- `search_doc` ;
- `search_doc_embedding` ;
- `pending_delta_count` ;
- `summary_version` ;
- `search_doc_version` ;
- `sensitivity_max` ;
- `archived_reason` ;
- `merged_into_topic_id` ;
- `created_from_message_id` ;
- `last_compacted_at`.

Lifecycle :

- `candidate` ;
- `durable` ;
- `dormant` ;
- `archived`.

Je supprimerais `ephemeral` au MVP. Un sujet ephemere reste candidate puis archived avec une raison.

### user_global_memories ou user_global_memory_views

Le repo actuel a deja `user_global_memories`. Deux options :

Option A : enrichir la table existante.

- Moins de migration conceptuelle ;
- plus compatible avec le code existant ;
- attention a ne pas melanger ancienne logique et nouvelle.

Option B : creer `user_global_memory_views`.

- Plus propre conceptuellement ;
- explicitement une vue derivee ;
- meilleure separation avec ancien systeme ;
- plus de chantier.

Comme il n'y a pas d'utilisateurs actifs, l'option B est defendable si elle clarifie l'architecture.

Champs cibles :

- full_key ;
- domain ;
- subdomain ;
- title ;
- canonical_summary ;
- search_doc ;
- embedding ;
- confidence ;
- sensitivity_max ;
- source_item_count ;
- source_topic_count ;
- pending_delta_count ;
- summary_version ;
- search_doc_version ;
- status ;
- last_compacted_at.

### memory_summary_deltas

File d'attente des updates a integrer dans les syntheses.

```sql
id uuid primary key
user_id uuid not null
target_type text not null
target_id uuid not null
delta_type text not null
content text not null
source_memory_item_ids uuid[] default '{}'
source_message_ids uuid[] default '{}'
status text default 'pending'
metadata jsonb default '{}'
created_at timestamptz default now()
compacted_at timestamptz null
```

Les deltas permettent de ne pas recompacter a chaque message.

### memory_operations

Operations de gouvernance memoire :

- correction ;
- oubli ;
- invalidation ;
- supersession ;
- hide ;
- delete ;
- merge.

```sql
id uuid primary key
user_id uuid not null
operation_type text not null
target_type text null
target_id uuid null
user_instruction text null
reason text null
status text default 'pending'
created_from_message_id uuid null
applied_at timestamptz null
metadata jsonb default '{}'
created_at timestamptz default now()
updated_at timestamptz default now()
```

### memory_extraction_runs

Audit du memorizer.

Permet de savoir :

- quel batch a ete traite ;
- quel modele a ete utilise ;
- combien d'items proposes ;
- combien acceptes ;
- combien rejetes ;
- quels edges crees ;
- erreurs eventuelles.

## Runtime conversationnel

Le runtime ne doit pas etre lourd.

Son role :

1. enregistrer le message ;
2. detecter les signaux rapides ;
3. resoudre les references temporelles ;
4. choisir un retrieval mode ;
5. router le topic actif ;
6. charger un payload memoire stable ;
7. generer la reponse ;
8. enregistrer la reponse ;
9. mettre a jour les states legers ;
10. queue le memorizer si necessaire.

### Message signals

Le runtime detecte :

- trivial / short ack ;
- safety ;
- correction ;
- forget ;
- topic switch explicite ;
- rappel memoire explicite ;
- reference temporelle ;
- action related ;
- demande global profile ;
- intensite emotionnelle ;
- skill possible.

### Temporal resolution

Ne pas laisser le LLM deviner seul les dates.

Une brique deterministe doit convertir :

- hier ;
- ce matin ;
- vendredi dernier ;
- vendredi il y a deux semaines ;
- la semaine derniere ;
- dans deux jours ;
- dimanche soir.

En sortie :

- raw expression ;
- resolved_start_at ;
- resolved_end_at ;
- precision ;
- confidence ;
- timezone.

On produit une fenetre, pas seulement un instant.

### Retrieval modes

Le dispatcher/runtime choisit une porte d'entree :

- `topic_first` ;
- `global_profile_first` ;
- `event_first` ;
- `plan_action_first` ;
- `safety_first` ;
- `correction_first`.

Ce choix n'est pas toujours definitif. Il peut avoir des hints :

- `dated_reference` ;
- `explicit_memory_recall` ;
- `explicit_topic_switch` ;
- `action_related` ;
- `emotional_blocker` ;
- `skill_related` ;
- `sensitive_content` ;
- `low_confidence` ;
- `possible_conflict`.

Le loader applique une logique :

```text
mode principal -> hints -> score confiance -> fallback controle
```

### Topic router sticky

Le topic router repond a une seule question :

> Dans quel sujet conversationnel sommes-nous maintenant ?

Il ne choisit pas tout le payload. Il maintient le fil.

Entrees :

- message user ;
- topic actif ;
- search_doc du topic actif ;
- derniers messages ;
- retrieval mode ;
- signaux date/action/safety/skill ;
- rupture explicite.

Decisions :

- `stay_current` ;
- `switch_existing` ;
- `reopen_dormant` ;
- `create_candidate` ;
- `side_note` ;
- `mark_trivial` ;
- `no_topic`.

Regle d'or :

> Sticky par defaut. Ne switcher que si le nouveau sujet devient le centre de gravite.

Compatibilite au topic actif :

- semantic score ;
- lexical score ;
- entity score ;
- recent context score ;
- intent score ;
- rupture penalty.

Si compatibilite haute : stay.

Si moyenne : stay + surveiller.

Si basse ou rupture : chercher candidats.

Recherche candidats :

- topic actif ;
- topic precedent ;
- topics recents ;
- topics dormants importants ;
- `search_doc_embedding` ;
- title ;
- keywords ;
- synthesis ;
- aliases.

LLM topic router seulement si ambigu.

### Active topic state

Stockage runtime :

```text
user_chat_states.temp_memory.__active_topic_state_v1
```

Contenu :

- active_topic_id ;
- active_topic_title ;
- lifecycle_stage ;
- confidence ;
- stickiness_score ;
- switch_suspicion_score ;
- previous_topic_id ;
- candidate_topic_ids ;
- last_decision ;
- last_decision_reason ;
- last_switched_at ;
- updated_at ;
- router_version.

## Memory loader et payload stable

Le loader construit ce qui va dans le prompt.

Il doit eviter deux erreurs :

1. charger trop peu, donc Sophia oublie ;
2. charger differemment a chaque tour, donc Sophia parait incoherente.

### Payload stable

Stockage :

```text
user_chat_states.temp_memory.__memory_payload_state_v1
```

Il contient les IDs des items injectes recemment, leur raison, confidence et TTL.

Regles :

- un item pertinent reste quelques tours ;
- le noyau constant ne disparait pas sans raison ;
- un module temporaire expire ;
- un item invalidated ne doit jamais etre reinjecte ;
- les items sensibles sont filtres ;
- le budget total reste fixe.

### Sections prompt

Le prompt ne doit pas recevoir un bloc "memoire" flou.

Sections :

- Topic courant ;
- Memories liees au topic ;
- Global profile ;
- Events dates ;
- Plan/action context ;
- Conversation recente ;
- Skill context ;
- Safety context.

Chaque item injecte doit porter :

- type ;
- id ;
- source/provenance ;
- date/fraicheur ;
- confidence ;
- raison d'injection ;
- sensitivity/injection policy si utile.

Exemple statement :

```text
Statement utilisateur, pas un fait objectif :
"J'ai l'impression de toujours tout gacher."
Source: WhatsApp, 2026-04-30.
Usage: reconnaitre une pensee dure envers soi, sans la presenter comme une verite.
```

## Memorizer V2

Le memorizer est asynchrone.

Il ne repond pas au user.

Il ne doit pas bloquer la conversation.

Il range, relie, dedoublonne, corrige, compacte.

### Declencheurs

Lancer le memorizer sur :

- batch de nouveaux messages ;
- topic switch ;
- candidate topic cree ;
- skill termine ;
- check action ;
- message emotionnel fort ;
- correction ;
- safety ;
- fin de conversation probable ;
- weekly review.

Ne pas lancer completement sur :

- ok ;
- merci ;
- bouton simple ;
- reaction sans contenu.

### Inputs

Le memorizer recoit un batch limite :

- messages recents ;
- topic_context ;
- retrieval modes ;
- active topic state ;
- injected memory IDs ;
- plan/action signals ;
- skill runs ;
- temporal references ;
- safety signals ;
- previous payload diagnostics.

Il ne relit pas toute la memoire.

### Extraction

Un appel IA propose :

- memory items ;
- edges ;
- summary deltas ;
- corrections ;
- rejected observations.

Regles :

- ne pas extraire le small talk ;
- ne pas transformer une emotion ponctuelle en trait ;
- ne pas diagnostiquer ;
- ne pas creer un fact objectif a partir d'un statement ;
- creer un statement si les mots exacts comptent ;
- creer un event si date ou periode ;
- creer action observation si conversation + donnees plan ;
- creer risk signal avec prudence.

### Validation

Validation deterministe apres extraction :

- source obligatoire ;
- confidence minimale ;
- pas de diagnostic ;
- kind coherent ;
- event date coherent ;
- statement pas mal classe en fact ;
- sensible correctement classe ;
- pas trop large.

### Dedupe

Comparer :

- canonical_key ;
- embedding ;
- normalized summary ;
- source message ;
- event window ;
- topic actif ;
- edges existants.

Decisions :

- create_new ;
- merge_into_existing ;
- add_source_to_existing ;
- supersede_existing ;
- reject_duplicate.

### Linking

Le memorizer ne charge pas tout.

Il fait :

1. extraire objet ;
2. trouver candidats via RAG/shortlist ;
3. scorer ;
4. lier si confiance haute ;
5. appel IA de linking seulement si ambigu.

Candidats :

- topic actif ;
- topic precedent ;
- topics recents ;
- topics proches ;
- global memories par taxonomie ;
- plan items concernes ;
- events proches ;
- memory items similaires ;
- edges existants.

Score :

- semantic similarity ;
- lexical match ;
- temporal coherence ;
- active topic coherence ;
- existing edge support ;
- source context.

Seuils :

- >= 0.80 : lien automatique ;
- 0.60 - 0.80 : IA judge shortlist ;
- < 0.60 : pas de lien force.

### Summary deltas

Le memorizer ne compacte pas directement a chaque run.

Il cree des deltas :

- target_type ;
- target_id ;
- delta_type ;
- content ;
- source_memory_item_ids ;
- source_message_ids.

Ces deltas alimentent :

- topic synthesis ;
- topic search_doc ;
- global summary ;
- global search_doc.

## Compaction

Compaction seulement sur seuil.

Triggers topic :

- pending deltas >= N ;
- correction importante ;
- conflit resolu ;
- topic promu durable ;
- topic rouvert ;
- summary stale ;
- weekly review.

Triggers global :

- pending deltas >= N ;
- plusieurs topics alimentent la vue ;
- correction sensible ;
- conflit ;
- demande globale recente.

Regles :

- ne rien inventer ;
- ne pas utiliser invalidated ;
- distinguer ancien/recent ;
- garder statements comme statements ;
- pas de diagnostic ;
- source IDs internes ;
- synthesis courte ;
- search_doc oriente retrieval.

Validation anti-hallucination :

- chaque claim important doit etre supporte par source IDs actifs ;
- aucun item hidden/deleted/invalidated ;
- summaries versionnees ;
- deltas marques compacted.

## Actions et plan

Le plan/action n'est pas une memoire psychologique. C'est une source structuree produit.

Le memorizer peut en deriver :

- action_observation ;
- behavioral_pattern ;
- facts ;
- topic updates ;
- global memory updates.

Action signals :

- plan_item_id ;
- occurrence_id ;
- action_title ;
- scheduled_at ;
- status ;
- recent occurrences ;
- streak ;
- missed count ;
- recurring time ;
- comment ;
- confidence.

Exemple :

User :

```text
J'ai pas reussi a faire la marche cette semaine, j'etais creve le soir.
```

Plan :

- lundi missed ;
- mercredi partial ;
- vendredi missed.

Memory item :

```text
kind: action_observation
content: La fatigue du soir semble avoir bloque l'action marche cette semaine.
```

Edges :

- action observation -> plan item ;
- action observation -> topic execution sante ;
- action observation -> global habits/execution.

Pattern seulement si repetition :

- au moins 3 observations ;
- sur au moins 2 semaines ;
- confidence moyenne suffisante.

## Correction, oubli et conflits

Une memoire fiable doit savoir desapprendre.

Messages a detecter :

- "non ce n'est pas ca" ;
- "tu as mal compris" ;
- "corrige ca" ;
- "ce n'est plus vrai" ;
- "oublie ca" ;
- "ne retiens pas ca".

Retrieval mode :

- `correction_first`.

Target resolution :

1. memory explicitement mentionnee ;
2. item injecte au tour precedent ;
3. dernier souvenir cite par Sophia ;
4. topic actif ;
5. global memory recente ;
6. semantic search.

Operations :

- invalidate ;
- supersede ;
- hide ;
- delete ;
- merge ;
- correction_note.

Apres operation :

- retirer du payload stable ;
- desactiver edges si necessaire ;
- creer summary delta ;
- planifier recompaction ;
- regenerer search_doc si besoin.

Sophia doit confirmer simplement.

Exemple :

```text
Tu as raison, je corrige ca. Je ne vais plus utiliser cette idee comme si elle etait vraie.
```

## Privacy et sensibilite

La memoire contient potentiellement des donnees sensibles.

Categories :

- addiction ;
- health ;
- mental_health ;
- family ;
- trauma ;
- relationship ;
- work ;
- sexuality ;
- self_harm ;
- shame ;
- financial.

Sensitivity levels :

- 0 banal ;
- 1 personnel ;
- 2 sensible ;
- 3 tres sensible ;
- 4 safety critical.

Injection policies :

- normal_if_relevant ;
- only_directly_relevant ;
- only_user_initiated ;
- safety_only ;
- never_inject.

Regle importante :

> La memoire doit aider Sophia a etre continue, pas ressortir des vulnerabilites hors contexte.

Statements sensibles :

Ne pas reciter mecaniquement :

```text
Tu m'avais dit : "J'ai l'impression de toujours tout gacher."
```

Preferer :

```text
Je me souviens que dans des moments difficiles, tu as deja formule une pensee tres dure envers toi-meme.
```

Sauf si le user demande explicitement les mots exacts.

## Evaluation et rollout

Il faut tester la memoire avec des scenarios multi-tours.

Scenarios obligatoires :

- continuité topic ;
- detail lateral ;
- vrai switch ;
- rappel dormant ;
- question globale ;
- event date ;
- action ratee ;
- statement fort ;
- correction ;
- forget ;
- safety ;
- mauvais candidat RAG.

Metriques runtime :

- retrieval_mode accuracy ;
- topic decision accuracy ;
- false switch rate ;
- false create rate ;
- payload churn ;
- injected item count ;
- sensitive excluded count ;
- fallback used ;
- latency ;
- invalidated memory injection rate.

Metriques memorizer :

- extraction precision ;
- duplicate rate ;
- wrong link rate ;
- statement_as_fact_error_rate ;
- event_date_accuracy ;
- correction_application_success ;
- unsupported claim rate in compaction.

Rollout recommande :

1. schema only ;
2. runtime shadow ;
3. topic router shadow ;
4. loader shadow ;
5. memorizer dry-run ;
6. canary ;
7. rollout progressif.

Feature flags :

- memory_v2_schema_enabled ;
- memory_v2_runtime_trace_enabled ;
- memory_v2_topic_router_shadow_enabled ;
- memory_v2_topic_router_enabled ;
- memory_v2_loader_shadow_enabled ;
- memory_v2_loader_enabled ;
- memory_v2_memorizer_dry_run_enabled ;
- memory_v2_memorizer_enabled ;
- memory_v2_compaction_enabled ;
- memory_v2_corrections_enabled ;
- memory_v2_action_signals_enabled.

## Vertical slice MVP recommande

Pour prouver l'architecture sans tout construire :

### Scenario

Jour 1 :

```text
Je veux arreter le cannabis, mais j'ai peur de perdre mes potes.
```

Jour 2 :

```text
Hier soir c'etait dur, ils fumaient tous.
```

Jour 5 :

```text
Je reparle de mon arret cannabis.
```

### Attendu runtime

- creer/retrouver topic arret cannabis ;
- rester sticky ;
- resoudre "hier soir" ;
- retrouver le topic au jour 5 ;
- charger synthesis + statement + event ;
- ne pas injecter global profile inutile.

### Attendu memorizer

Memory items :

- statement : "Je veux arreter le cannabis, mais j'ai peur de perdre mes potes."
- fact : "La peur de perdre le lien social rend l'arret du cannabis plus difficile."
- event : "Soiree difficile avec amis fumeurs."

Topic :

- arret cannabis.

Edges :

- statement -> topic supports ;
- fact -> topic supports ;
- event -> topic about ;
- fact -> global memory addictions.cannabis supports ;
- fact -> global memory relations.appartenance_sociale supports.

Compaction topic :

```text
Le user travaille sur l'arret du cannabis. Un enjeu important semble etre la peur de perdre le lien social avec ses amis fumeurs, surtout lors des soirees.
```

Ce scenario prouve :

- runtime trace ;
- topic router ;
- temporal reference ;
- memory item extraction ;
- sources ;
- edges ;
- topic synthesis ;
- global memory support.

## Erreurs a eviter

### 1. Implementer la compaction avant les atomiques

Les summaries doivent etre derivees, pas primaires.

### 2. Faire du LLM runtime partout

Le runtime doit rester leger.

### 3. Creer trop de topics

Utiliser `side_note`, `mark_trivial`, candidate + archive.

### 4. Laisser les facts vivre uniquement dans global memories

Cela rend correction et provenance faibles.

### 5. Reporter correction/forget trop tard

Le schema doit le prevoir des le debut.

### 6. Injecter trop de sensible

La memoire sensible doit etre contextualisee.

### 7. Transformer des statements en facts

Un user qui dit "je me sens nul" ne cree pas un fact "le user est nul".

### 8. Creer des patterns trop vite

Un echec d'action n'est pas un pattern.

## Questions explicites pour le reviewer

1. Est-ce que `user_memory_items` doit vraiment absorber les events, ou faut-il garder `user_event_memories` comme table specialisee ?
2. Faut-il creer `user_global_memory_views` ou enrichir `user_global_memories` existant ?
3. Le schema `memory_edges` est-il assez general sans devenir un graphe ingouvernable ?
4. Comment simplifier le MVP sans perdre la colonne vertebrale atomique ?
5. Quels champs sont indispensables dans `user_memory_items` des le debut ?
6. Quelle politique de compaction evite les hallucinations de summary ?
7. Comment evaluer le wrong-link-rate de maniere realiste ?
8. Comment gerer les corrections user avec le moins de complexite possible ?
9. Quelle strategie pour les donnees sensibles dans le prompt ?
10. Quel est le meilleur decoupage runtime vs memorizer pour minimiser cout/latence ?

## Recommendation actuelle

Comme il n'y a pas d'utilisateurs actifs, il faut profiter de cette fenetre pour mettre en place une architecture propre.

Recommendation :

1. adopter `user_memory_items` comme colonne vertebrale ;
2. adopter `memory_item_sources` pour la preuve ;
3. adopter `memory_edges` comme relation generique ;
4. faire des topics des vues conversationnelles ;
5. faire des global memories des vues transversales ;
6. garder le runtime leger ;
7. faire du memorizer async ;
8. prevoir correction/forget dans le schema des le depart ;
9. construire un vertical slice avant de tout generaliser.

Le point non negociable :

> Aucun souvenir interprete important ne doit vivre uniquement dans une summary.

Les summaries servent a parler, pas a prouver. La preuve vit dans les memory items, les sources et les edges.
