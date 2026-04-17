# V2 MVP Scope

## Statut

Document canonique de scope pour la V2.

Ce document s'appuie sur:

- [onboarding-v2-canonique.md](/Users/ahmedamara/Dev/Sophia%202/docs/onboarding-v2-canonique.md)
- [v2-systemes-vivants-implementation.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-systemes-vivants-implementation.md)
- [v2-technical-schema.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md)
- [v2-orchestration-rules.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-orchestration-rules.md)
- [v2-global-implementation-plan.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-global-implementation-plan.md)
- [v2-execution-playbook.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-execution-playbook.md)
- [v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)

Il repond a 5 questions:

1. Qu'est-ce qui est indispensable a V2.0 ?
2. Qu'est-ce qui part en V2.1 ?
3. Qu'est-ce qui est explicitement hors scope ?
4. Quelle est la definition of done V2.0 ?
5. Quelle dette temporaire est acceptee ?

## Principe directeur

- V2.0 = le coeur qui tient. Onboarding refondu, nouveau modele metier, plan par
  dimensions, dashboard V2, systemes vivants minimaux fiables.
- V2.1 = le systeme qui devient raffine. Proactivite avancee, preferences
  relationnelles, repair formel, rendez-vous riches.

On ne livre pas V2.1 avant que V2.0 tourne en reel. On ne construit pas de
couches avancees sur un coeur non eprouve.

---

# V2.0

## 1. Schema DB

### Must

| Element                                                     | Statut         |
| ----------------------------------------------------------- | -------------- |
| `user_cycles`                                               | nouvelle table |
| `user_transformations`                                      | nouvelle table |
| `user_transformation_aspects`                               | nouvelle table |
| `user_plans_v2` (avec `content` JSON read-only)             | refonte        |
| `user_plan_items`                                           | nouvelle table |
| `user_plan_item_entries`                                    | nouvelle table |
| `user_metrics` (table unique, scope cycle + transformation) | nouvelle table |
| `user_victory_ledger`                                       | nouvelle table |
| `system_runtime_snapshots`                                  | nouvelle table |
| Enums SQL canoniques                                        | nouveaux       |
| Contraintes d'unicite et invariants critiques               | nouveaux       |

### Reporte a V2.1 → **Livre en V2.1**

| Element                           | Raison initiale du report                    | Statut V2.1                                  |
| --------------------------------- | -------------------------------------------- | -------------------------------------------- |
| `user_cycle_drafts`               | cache invite frontend suffit en V2.0         | **Livre** (Phase D.1, migration + CRUD + frontend dual-source) |
| `user_relation_preferences`       | apprendre des donnees reelles d'abord        | **Livre** (Phase B, migration + moteur inference + consumers)  |
| `user_rendez_vous` (table dediee) | enrichissement des scheduled_checkins suffit | **Livre** (Phase C.1-C.2, migration + CRUD + pipeline runtime) |

## 2. Runtime views

### Must

| Element                                       | Statut       |
| --------------------------------------------- | ------------ |
| `v_active_transformation_runtime`             | nouvelle vue |
| `v_plan_item_runtime`                         | nouvelle vue |
| Helpers backend de chargement runtime unifies | nouveaux     |
| Event contracts V2 (lifecycle + runtime)      | nouveaux     |
| Freshness windows definies                    | nouveaux     |

### Reporte a V2.1

| Element                                      | Raison                                              |
| -------------------------------------------- | --------------------------------------------------- |
| `v_proactive_runtime_context` (vue formelle) | le proactive V2.0 peut lire les helpers directement |
| `v_weekly_runtime_context` (vue formelle)    | le weekly peut construire son contexte inline       |

## 3. Plan generation

### Must

| Element                                                              | Statut  |
| -------------------------------------------------------------------- | ------- |
| Generation questionnaire sur mesure V2                               | nouveau |
| Generation plan V2 (dimensions, activation_condition, support modes) | nouveau |
| Distribution plan_items (JSON → `user_plan_items`)                   | nouveau |
| `PlanContentV2` conforme au technical schema                         | nouveau |

### Source de verite

- `user_plan_items` = source de verite d'execution
- `user_plans_v2.content` = snapshot de generation, read-only apres distribution
- aucune sync bidirectionnelle

## 4. Onboarding

### Must

| Etape                                                        | Statut  |
| ------------------------------------------------------------ | ------- |
| Capture libre (texte libre unique)                           | nouveau |
| Analyse IA initiale (aspects, regroupements, Pour plus tard) | nouveau |
| Validation des aspects (drag & drop cartes)                  | nouveau |
| Cristallisation (regroupements → transformations)            | nouveau |
| Priorisation                                                 | refonte |
| Questionnaire sur mesure                                     | refonte |
| Inscription si necessaire (cache invite frontend)            | refonte |
| Profil minimal (birth_date, gender, duration_months)         | refonte |
| Generation du plan V2                                        | refonte |

### Machine d'etat cycle V2.0

```
draft → clarification_needed (si texte trop vague)
clarification_needed → draft (apres complement)
draft → structured
structured → prioritized
prioritized → structured (retour utilisateur)
prioritized → questionnaire_in_progress
questionnaire_in_progress → signup_pending (si inscription requise)
questionnaire_in_progress → profile_pending (si deja inscrit)
signup_pending → profile_pending
profile_pending → ready_for_plan
ready_for_plan → active
active → completed
active → abandoned
```

### Cas produit couverts en V2.0

- Cas A: besoin simple (1 transformation)
- Cas B: besoin multiple (2-3 transformations)
- Cas C: besoin flou (clarification → nouvelle analyse)
- Cas D: besoin trop large (max 3 blocs + Pour plus tard)

### Lifecycle "Pour plus tard" V2.0

- au demarrage d'un nouveau cycle, les aspects deferred du cycle precedent sont
  proposes
- jamais auto-injectes, jamais imposes, jamais oublies
- l'utilisateur peut les ignorer, les reprendre, ou les reformuler

## 5. Dashboard

### Must

| Element                                       | Statut  |
| --------------------------------------------- | ------- |
| Header transformation active                  | nouveau |
| Bloc strategie                                | nouveau |
| Dimension support (items actifs)              | nouveau |
| Dimension missions (items actifs)             | nouveau |
| Dimension habits (items actifs + maintenance) | nouveau |
| North Star cycle (depuis `user_metrics`)      | refonte |
| Progress markers transformation               | nouveau |
| Bloc prochain debloquage                      | nouveau |

### Ce qui disparait

- toute vue basee sur les phases
- `PlanPhaseBlock.tsx` remplace par des blocs dimension
- dependance a `current_phase` supprimee

## 6. Runtime foundations (Lot 6A)

### Must

| Element                                                               | Statut   |
| --------------------------------------------------------------------- | -------- |
| Active load engine                                                    | nouveau  |
| Momentum V2 classifier (6 dimensions internes)                        | refonte  |
| Helpers runtime unifies (items actifs, slots, traction par dimension) | nouveaux |

### Etats momentum publics conserves

`momentum`, `friction_legere`, `evitement`, `pause_consentie`,
`soutien_emotionnel`, `reactivation`

### Dimensions momentum internes ajoutees

`engagement`, `execution_traction`, `emotional_load`, `consent`, `plan_fit`,
`load_balance`

### Postures recommandees

`push_lightly`, `simplify`, `hold`, `support`, `reopen_door`, `reduce_load`,
`repair`

## 6bis. Memory V2 (integre dans Lots 6B/6C)

### Must

| Element                                                                         | Statut  |
| ------------------------------------------------------------------------------- | ------- |
| Retrieval specialise par intention (5 intentions runtime)                       | refonte |
| Tagging par scope (cycle/transformation/execution/relational) dans le memorizer | refonte |
| Contrats de budget tokens par intention                                         | nouveau |
| Coaching memory dimension-aware (blocker tague par dimension)                   | refonte |

### Conserve tel quel

- tables memoire existantes (`user_topic_memories`, `user_global_memories`,
  `user_event_memories`, `user_core_identity`)
- pattern `memory_plan` / `surface_plan` du dispatcher
- mecanismes d'extraction, validation, persistence du memorizer
- compaction des globals

### Reporte a V2.1

| Element                                                         | Raison                                |
| --------------------------------------------------------------- | ------------------------------------- |
| Memory handoff formel (payload structure entre transformations) | handoff minimal suffit en V2.0        |
| Compaction cross-cycle                                          | pas de multi-cycle en V2.0            |
| `relation_preferences` comme source de relational memory        | apprendre des donnees reelles d'abord |

### Dette V2.0 memoire

Les tables memoire restent V1. Seuls le tagging (`scope`, `cycle_id`,
`transformation_id`) et le retrieval changent. Pas de migration de schema
memoire en V2.0.

## 7. Bilans (Lot 6B)

### Must

| Element                                                             | Statut  |
| ------------------------------------------------------------------- | ------- |
| Daily bilan V2 (4 modes, 1-2 items cibles, max 3 questions)         | refonte |
| Weekly bilan V2 (hold/expand/consolidate/reduce, max 3 ajustements) | refonte |
| Conversation pulse (synthese 7j, rafraichi max 1x/jour)             | nouveau |

### Daily modes V2.0

- `check_light`
- `check_supportive`
- `check_blocker`
- `check_progress`

### Weekly decisions V2.0

- `hold`
- `expand`
- `consolidate`
- `reduce`

## 8. Coaching + Proactive (Lot 6C)

### Must

| Element                                                        | Statut  |
| -------------------------------------------------------------- | ------- |
| Coaching dimension-aware (blocage mission vs habit vs support) | refonte |
| Distinction micro-coaching / structural coaching               | nouveau |
| Morning nudge V2 (nouvelles postures)                          | refonte |
| Victory ledger (alimentation par daily/weekly/chat)            | nouveau |

### Postures morning nudge V2.0

- `focus_today`
- `simplify_today`
- `support_softly`
- `open_door`
- `protective_pause`
- `celebration_ping`
- `pre_event_grounding`

### Reporte a V2.1

| Element                         | Raison                                                    |
| ------------------------------- | --------------------------------------------------------- |
| Proactive windows engine formel | morning nudge V2 + pre_event_grounding couvrent le besoin |
| Cooldown engine formel          | regles simples en dur suffisent en V2.0                   |
| Confidence gates formel         | logique inline dans les selecteurs suffit                 |

## 9. Legacy cleanup (Lot 7)

### A supprimer

- logique `current_phase` comme colonne vertebrale
- usages produit de `user_goals` comme verite transformation
- fonctions onboarding devenues obsoletes (`recommend-transformations`,
  `summarize-context` ancienne forme)
- composants dashboard dependants des phases (`PlanPhaseBlock`, etc.)
- heuristiques runtime sur `user_actions / frameworks / vitals` comme grille
  primaire

### A garder temporairement

- `user_chat_states` pour le runtime conversationnel transitoire
- `chat_messages` pour l'historique
- tables d'observabilite existantes
- registries coaching existants
- `event_memory`

## 10. Definition of done V2.0

La V2.0 est livree quand:

- [ ] un user peut aller du texte libre au plan V2 genere
- [ ] les transformations sont structurees en cycle avec aspects et priorisation
- [ ] le plan est structure en dimensions (support/missions/habits), pas en
      phases
- [ ] le dashboard s'appuie sur les dimensions V2 et les plan_items
- [ ] la North Star vit dans `user_metrics` comme metric canonique
- [ ] le daily bilan V2 interroge les plan_items, pas les phases
- [ ] le weekly bilan V2 produit hold/expand/consolidate/reduce
- [ ] le momentum V2 classe sur 6 dimensions internes avec posture recommandee
- [ ] le coaching detecte le type de blocage par dimension
- [ ] le morning nudge V2 varie ses postures
- [ ] aucun chemin user ne depend du contrat legacy (phases, user_goals comme
      verite)
- [ ] le conversation_pulse est generable et utilise par bilans
- [ ] l'observabilite couvre: transitions momentum, decisions weekly, nudges
      envoyes/skips

## 11. Dette temporaire acceptee en V2.0

> **Mise a jour V2.1:** les 7 premieres dettes ont ete resolues pendant les
> Phases A-D de la V2.1. Elles sont conservees ci-dessous, barrees, pour
> tracabilite.

| Dette                                    | Raison                                                                  | Declencheur de resolution                                             | Statut |
| ---------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| ~~Pas de `user_cycle_drafts` serveur~~   | cache invite frontend suffit                                            | > 15% de sessions invite perdues mesurees (analytics ou retours user) | **Resolu Phase D.1** |
| ~~Pas de repair mode formel~~            | `pause_consentie` + cooldowns + posture conservative couvrent le besoin | 3+ cas reels observes ou le lien casse malgre pause_consentie         | **Resolu Phase B.1** |
| ~~Pas de `relation_preferences`~~        | on ne sait pas encore quelles preferences comptent le plus              | 50+ users actifs avec historique de nudges > 2 semaines               | **Resolu Phase B.2** |
| ~~Pas de `user_rendez_vous` table~~      | enrichissement des `scheduled_checkins` suffit                          | pre_event_grounding utilise > 3x/semaine en production                | **Resolu Phase C.1-C.2** |
| ~~Pas de proactive windows engine formel~~ | morning nudge V2 + pre_event_grounding ciblé couvrent le besoin       | besoin confirme de > 2 types de fenetres actives simultanement        | **Resolu Phase A.3** |
| ~~Cooldowns en regles simples hardcodees~~ | suffisant pour le volume initial                                      | 3+ cas reels ou les cooldowns hardcodes sont manifestement inadequats | **Resolu Phase A.2** |
| Confidence gates inline                  | pas de moteur dedie, logique dans les selecteurs                        | > 3 selecteurs dupliquent la meme logique de confiance                | Ouvert |
| ~~Pas de weekly conversation digest separe~~ | le conversation_pulse couvre le besoin                              | weekly bilan V2 produit des decisions visiblement sous-informees      | **Resolu Phase D.2** |
| ~~Transformation handoff minimal~~       | wins + supports a garder, pas de payload formel                         | premier user qui passe a la transformation 2 (besoin reel observe)    | **Resolu Phase C.3-C.4** |

### Regle

Chaque dette a un declencheur mesurable ou observable. "V2.1" n'est pas un
declencheur. Le declencheur decide quand on resout, pas un calendrier.

---

# V2.1

## Objectif

Enrichir le systeme V2.0 eprouve avec les couches de raffinement qui demandent
des donnees reelles pour etre bien calibrees.

V2.1 ne demarre qu'une fois V2.0 en production et valide.

## 1. Proactive windows engine

### Objectif

Remplacer le morning nudge V2 par un moteur generalise de fenetres proactives.

### Fenetres cibles

- `morning_presence`
- `pre_event_grounding`
- `midday_rescue`
- `evening_reflection_light`
- `reactivation_window`

### Architecture

- `watcher` = couche d'observation (existant)
- `proactive windows engine` = couche de decision (nouveau)
- `scheduled_checkins / process-checkins` = couche d'execution (existant)

### Decisions du moteur

- `create_window`
- `reschedule_window`
- `cancel_window`
- `downgrade_to_soft_presence`
- `skip`

### Pre-requis V2.0

- momentum V2 operant
- conversation_pulse operant
- morning nudge V2 valide en production (patterns observes)

## 2. Relation preferences

### Objectif

Permettre au systeme de moduler ton, timing et intensite des contacts selon les
preferences apprises.

### Table

`user_relation_preferences` (definie dans le technical schema)

### Champs

- `preferred_contact_windows` (`morning` / `afternoon` / `evening`)
- `disliked_contact_windows` (`morning` / `afternoon` / `evening`)
- `preferred_tone` (gentle / direct / mixed)
- `preferred_message_length` (short / medium)
- `max_proactive_intensity` (low / medium / high)
- `soft_no_contact_rules`

### Alimentation

- inference a partir du comportement reel (reponses aux nudges, horaires,
  longueurs preferees)
- mise a jour conservative: sans signal suffisant, on preserve les valeurs
  existantes
- jamais de questionnaire explicite (trop intrusif)

### Impact

- module morning nudges / outreach / rendez-vous
- module le coaching ton

### Pre-requis V2.0

- historique suffisant de nudges envoyes + reponses
- patterns reels observes

## 3. Repair mode formel

### Objectif

Passer d'une couverture par `pause_consentie` + cooldowns a un etat runtime
explicite.

### Source de verite

`user_chat_states.temp_memory.__repair_mode_v1`

### Conditions d'entree

- plusieurs proactives sans echo
- refus explicite ou implicite repete
- message utilisateur montrant que la pression est mal calibree

### Effets

- pas de proactive offensive
- pas de coaching non demande
- pas de daily insistant
- seulement presence douce ou silence

### Conditions de sortie

- reouverture claire
- nouveau consentement
- temperature relationnelle redevenue saine

### Observabilite

- event `repair_mode_entered_v2` / `repair_mode_exited_v2`
- snapshot dans `system_runtime_snapshots`

### Pre-requis V2.0

- momentum V2 avec posture `repair` operante
- patterns de friction reels observes

## 4. Rendez-vous (table dediee)

### Objectif

Passer de l'enrichissement des `scheduled_checkins` a une table dediee pour les
contacts intentionnels contextualises.

### Table

`user_rendez_vous` (definie dans le technical schema)

### Kinds

- `pre_event_grounding`
- `post_friction_repair`
- `weekly_reset`
- `mission_preparation`
- `transition_handoff`

### Regles

- pas de rendez-vous si `confidence=low`
- pas de nouveau rendez-vous si un autre a ete refuse recemment
- toujours une `trigger_reason` claire
- rares, motives, faciles a ignorer

### Pre-requis V2.0

- pre_event_grounding valide via scheduled_checkins
- patterns de timing reels observes

## 5. Cooldown engine formel

### Objectif

Remplacer les regles hardcodees V2.0 par un moteur configurable.

### Cooldowns cibles

- meme posture proactive: 48h si aucune reaction
- meme item rappele explicitement: 72h
- meme technique coach jugee inutile: 14 jours
- nouveau rendez-vous apres refus explicite: 7 jours
- nouvelle reactivation_window apres silence: 72h

### Architecture

- table ou config de cooldown rules
- helper `isCooledDown(user_id, cooldown_type, context)`
- integration dans proactive windows engine

### Pre-requis V2.0

- regles hardcodees validees en production
- donnees reelles sur les bons intervals

## 6. Confidence gates formel

### Objectif

Extraire la logique de confiance des selecteurs inline vers un moteur dedie.

### Niveaux

- `low_confidence` → `skip` ou `soft_presence_only`
- `medium_confidence` → posture legere uniquement
- `high_confidence` → proactivite normale autorisee

### Sources de confiance

- clarte du signal conversationnel
- recence du signal
- coherence avec event memory
- absence de contradictions recentes

### Pre-requis V2.0

- selecteurs inline operants
- patterns de confiance reels observes

## 7. Transformation handoff formel

### Objectif

Passer du handoff minimal V2.0 a un payload structure qui alimente la
transformation suivante.

### Payload cible

```ts
type TransformationHandoffPayload = {
  wins: string[];
  supports_to_keep: string[];
  habits_in_maintenance: string[];
  techniques_that_failed: string[];
  relational_signals: string[];
  coaching_memory_summary: string;
};
```

### Alimentation

- genere automatiquement lors de `transformation.status = completed`
- stocke dans `user_transformations.handoff_payload`

### Impact

- alimente le mini recap avant questionnaire de la transformation suivante
- alimente le conversation_pulse
- alimente le victory ledger
- alimente le coaching memory

## 8. user_cycle_drafts (cache invite serveur)

### Objectif

Rendre le parcours invite resilient cote serveur.

### Quand

Si les donnees montrent que le cache frontend seul perd trop de sessions invite.

### Table

`user_cycle_drafts` (definie dans le technical schema)

### Regles

- TTL configurable (ex: 7 jours)
- hydratation complete vers `user_cycles` apres signup
- cleanup automatique des drafts expires

## 9. Weekly conversation digest

### Objectif

Produire une analyse conversationnelle de semaine plus riche que le
conversation_pulse.

### Contenu

- tonalite dominante
- meilleurs moments de traction
- moments de fermeture ou fatigue
- blocage le plus reel
- soutien qui a aide
- risque principal de la semaine suivante
- opportunite relationnelle

### Alimentation

- analyse LLM Tier 2 de la conversation de la semaine
- snapshot dans `system_runtime_snapshots`

### Pre-requis V2.0

- conversation_pulse operant
- weekly bilan V2 operant

---

## Definition of done V2.1

La V2.1 est livree quand:

- [ ] le proactive windows engine decide les fenetres de contact (pas seulement
      le morning)
- [ ] les relation preferences modulent le ton, le timing et l'intensite
- [ ] le repair mode est un etat runtime explicite avec entree/sortie tracees
- [ ] les rendez-vous vivent dans leur table dediee avec lifecycle complet
- [ ] les cooldowns sont configurables, plus hardcodes
- [ ] le transformation handoff produit un payload structure
- [ ] l'observabilite couvre toutes les nouvelles briques

---

## Hors scope (ni V2.0 ni V2.1)

| Element                               | Raison                                    |
| ------------------------------------- | ----------------------------------------- |
| Backlog global d'aspects cross-cycles | complexite sans ROI prouve                |
| Multi-cycle paralleles                | un cycle actif max par user suffit        |
| A/B testing infrastructure            | premature avant volume                    |
| Analytics dashboard avance            | les audit bundles existants suffisent     |
| i18n multi-langue                     | le produit est en francais pour l'instant |
| Export de donnees utilisateur         | pas de besoin immediat                    |
| API publique                          | pas de besoin immediat                    |

---

## Resume visuel

```
V2.0 (livrer d'abord)
├── Schema DB V2
├── Runtime views
├── Plan generation V2
├── Onboarding V2
├── Dashboard V2
├── 6A: active_load + momentum V2
├── 6B: daily V2 + weekly V2 + conversation_pulse
├── 6C: coaching V2 + morning nudge V2 + victory ledger
└── Legacy cleanup

V2.1 (enrichir ensuite)
├── Proactive windows engine
├── Relation preferences
├── Repair mode formel
├── Rendez-vous (table dediee)
├── Cooldown engine formel
├── Confidence gates formel
├── Transformation handoff formel
├── user_cycle_drafts serveur
└── Weekly conversation digest
```
