# V2 Global Implementation Plan

## Statut

Document canonique de plan global d'implementation pour la V2.

Ce document s'appuie sur:

- [onboarding-v2-canonique.md](/Users/ahmedamara/Dev/Sophia%202/docs/onboarding-v2-canonique.md)
- [v2-systemes-vivants-implementation.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-systemes-vivants-implementation.md)
- [v2-technical-schema.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md)
- [v2-orchestration-rules.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-orchestration-rules.md)
- [v2-mvp-scope.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-mvp-scope.md) — tranche ce qui est V2.0 vs V2.1
- [v2-execution-playbook.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-execution-playbook.md) — operationnalise ce plan
- [v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md) — strategie d'audit integree aux lots

Il ne redefinit pas la cible.
Il dit comment l'atteindre sans casser le systeme.

## 1. Objectif du plan

Livrer la V2 de bout en bout avec:

- un onboarding refondu
- un nouveau contrat metier
- une nouvelle structure de plan
- un dashboard V2
- des bilans V2
- une orchestration runtime V2
- une coexistence minimale avec le legacy pendant la transition

Le but n'est pas de tout rewriter d'un coup sans filet.
Le but est de sequencer un redesign massif en couches controlables.

## 2. Principe general de rollout

Le rollout optimal n'est pas:

- frontend d'abord
- puis backend
- puis runtime

Le rollout optimal est:

1. `fixer le nouveau socle de donnees`
2. `fixer les vues runtime`
3. `fixer la generation de plan V2`
4. `fixer l'onboarding V2`
5. `fixer le dashboard V2`
6. `fixer bilans/momentum/coaching/proactive`
7. `retirer le legacy`

Regle cle:

- tant qu'une couche amont n'est pas stable, on ne branche pas massivement les couches aval

## 3. Strategie de migration

Comme il n'y a pas encore de base users a preserver, la bonne strategie est:

- `page blanche metier`
- `reutilisation selective de l'infra`
- `hard cut sur le contrat canonique`

Concretement:

- on peut garder certaines tables/supports techniques
- on ne garde pas les anciennes primitives comme verite produit

## 4. Ordre global d'implementation

Je recommande 10 lots (dont 3 sous-lots pour le runtime vivant).

### Lot 0

Preparation et garde-fous.

### Lot 1

Schema DB V2 + enums + invariants.

### Lot 2

Runtime views V2 + state shapes + event contracts.

### Lot 3

Plan generation V2 + distribution relationnelle des plan_items.

### Lot 4

Onboarding frontend/backend V2.

### Lot 5

Dashboard V2.

### Lot 6A

Runtime foundations: active_load + momentum V2 classifier.

### Lot 6B

Bilans V2: daily + weekly + conversation_pulse.

### Lot 6C

Coaching + Proactive V2: coaching dimension-aware + morning nudge V2 + victory ledger.

### Lot 7

Cleanup legacy + durcissement + observabilite finale.

## 5. Lot 0 - Preparation

## 5.1 Objectif

Se donner le cadre de travail qui evitera le chaos pendant la refonte.

## 5.2 A faire

- creer une branche de refonte V2 propre
- figer les 4 docs canoniques
- figer le present doc comme reference de sequencing
- lister les fichiers legacy a ne plus etendre
- mettre un drapeau explicite `V2 work in progress` si necessaire pour isoler des flows

## 5.3 Livrables

- branche de travail propre
- liste de modules geles
- checklist de revue pre-merge

## 5.4 Risques

- continuer a toucher le legacy au fil de l'eau
- derivation de contrats si plusieurs fichiers bougent sans reference commune

## 5.5 Critere de validation

- plus aucune decision V2 importante n'est prise "a l'oral seulement"
- les 5 docs servent de reference unique

## 6. Lot 1 - Schema DB V2

## 6.1 Objectif

Installer le nouveau modele de donnees canonique sans encore brancher tout le produit dessus.

## 6.2 Travail cible

Creer / adapter:

- `user_cycles`
- `user_transformations`
- `user_transformation_aspects`
- `user_plans_v2` (nouvelle table, ne pas modifier l'ancienne `user_plans`)
- `user_plan_items`
- `user_plan_item_entries`
- `user_metrics` (table unique avec `scope` cycle|transformation — remplace l'ancien split en deux tables)
- `user_victory_ledger`
- `system_runtime_snapshots`

Tables reportees a V2.1 (ne PAS les creer en V2.0):

- `user_relation_preferences` (apprendre des donnees reelles d'abord)
- `user_rendez_vous` (enrichissement des scheduled_checkins suffit en V2.0)
- `user_cycle_drafts` (cache invite frontend suffit en V2.0)

## 6.3 Decisions recommandees

- creer les enums SQL canoniques des maintenant
- poser les contraintes d'unicite critiques
- ne pas essayer de tordre `user_goals` pour faire V2
- garder `user_chat_states` pour le runtime transitoire, y compris `__repair_mode_v1`

## 6.4 Fichiers touches

- migrations Supabase nouvelles
- potentiellement types partages si generation de types DB

## 6.5 Risques

- schema trop ambitieux trop tot
- enums trop mouvants
- duplication temporaire mal geree avec tables legacy

## 6.6 Validation

- migrations passent from scratch
- contraintes uniques/invariants principaux poses
- schema lisible et coherent avec [v2-technical-schema.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md)

## 7. Lot 2 - Runtime views et contrats d'events

## 7.1 Objectif

Fixer la maniere dont le systeme V2 reconstruit l'etat vivant.

## 7.2 Travail cible

Mettre en place:

- `v_active_transformation_runtime`
- `v_plan_item_runtime`
- `v_proactive_runtime_context`
- `v_weekly_runtime_context`

Et definir concretement:

- payloads d'events V2
- snapshots runtime
- freshness windows

## 7.3 Pourquoi avant le reste

Sans vues runtime stables:

- le dashboard V2 sera bancal
- momentum et bilans liront chacun autre chose
- les tests d'integration seront flous

## 7.4 Fichiers touches

- SQL views / functions si necessaire
- helpers backend de chargement runtime
- types shared backend/frontend

## 7.5 Risques

- lire directement trop de tables brutes
- reconstruire la logique runtime differemment selon les endpoints

## 7.6 Validation

- un seul helper runtime par grand usage
- les vues suffisent a reconstruire la transformation active, la charge active, et le contexte proactif

## 8. Lot 3 - Plan generation V2

## 8.1 Objectif

Rendre possible la generation d'un plan V2 complet, meme sans avoir encore branche tout le produit dessus.

## 8.2 Travail cible

Refondre:

- la fonction de generation de questionnaire sur mesure
- la fonction de generation de plan
- la distribution des items du plan dans `user_plan_items`

## 8.3 Sous-étapes

### 8.3.1 Questionnaire generation

Sortie attendue:

- schema de questions V2
- choix qualitatif / QCM
- flags single/multiple

### 8.3.2 Plan generation

Sortie attendue:

- `content` conforme au `PlanContentV2`
- dimensions `support / missions / habits`
- logique de debloquage
- support modes / support functions

### 8.3.3 Plan item distribution

Sortie attendue:

- chaque item du JSON a sa traduction relationnelle
- aucun besoin de relire des `phases`

## 8.4 Fichiers probables

- fonctions onboarding/generation V2 nouvelles ou refondues
- helpers de distribution type `planActions.ts` ou successeur V2

## 8.5 Risques

- JSON V2 trop riche pour etre fiablement distribue
- gap entre JSON et relationnel
- support/habit semantics encore floues

## 8.6 Validation

- un plan V2 peut etre genere et persiste sans UI
- les `plan_items` crees sont suffisants pour le runtime
- aucun champ legacy indispensable n'est requis

## 9. Lot 4 - Onboarding V2

## 9.1 Objectif

Remplacer le flow onboarding existant par le flow canonique V2.

## 9.2 Travail cible

Construire:

- capture libre
- analyse IA initiale
- validation des aspects
- cristallisation
- priorisation
- questionnaire sur mesure
- inscription si necessaire
- profil minimal

## 9.3 Ecrans/pages a creer ou refondre

- remplacement lourd de l'entree `GlobalPlan`
- nouvelle etape de validation d'aspects avant priorisation
- refonte `PlanPriorities`
- suppression/refonte de l'ancien `ActionPlanGenerator`

## 9.4 Cache invite / inscription

Decider entre:

- cache frontend uniquement
- ou `user_cycle_drafts` + hydratation post-signup

Ma reco pragmatique:

- commencer par cache frontend si tu veux aller plus vite
- mais garder `user_cycle_drafts` comme extension prevue si la fiabilite invite devient critique

## 9.5 Fonctions backend impactees

- remplacement de `recommend-transformations`
- refonte ou remplacement de `sort-priorities`
- suppression de `summarize-context` ancienne forme
- nouvelles fonctions pour:
  - structuration
  - cristallisation
  - questionnaire generation
  - plan generation V2

## 9.6 Risques

- friction excessive a l'etape d'aspects
- incoherence entre regroupement valide et transformations persistées
- perte de donnees lors du signup

## 9.7 Validation

- un user peut aller de texte libre a plan genere sans legacy
- le flow est stable mobile
- les transformations creees sont coherentes avec le runtime V2

## 10. Lot 5 - Dashboard V2

## 10.1 Objectif

Faire du dashboard la premiere surface d'execution V2 lisible et propre.

## 10.2 Travail cible

Refondre l'affichage:

- transformation active
- dimensions visibles simultanement
- active load
- supports / missions / habits
- north star cycle
- progress markers transformation

## 10.3 Composants impactes

- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/hooks/useDashboardData.ts`
- `frontend/src/hooks/useDashboardLogic.ts`
- `frontend/src/components/dashboard/PlanPhaseBlock.tsx`
- `frontend/src/components/dashboard/PlanActionCard.tsx`
- `frontend/src/components/dashboard/PersonalActionsSection.tsx`
- `frontend/src/components/dashboard/StrategyCard.tsx`
- `frontend/src/components/dashboard/NorthStarSection.tsx`
- `frontend/src/components/dashboard/RemindersSection.tsx`
- `frontend/src/types/dashboard.ts`
- `frontend/src/types/plan.ts`

## 10.4 Regles

- plus aucune dependance a `current_phase`
- plus aucune vue primaire basee sur les phases
- les items viennent du runtime V2, pas de la logique legacy

## 10.5 Risques

- garder des hypothèses legacy caches dans les hooks
- forcer trop de richesse d'un coup dans l'UI

## 10.6 Validation

- le dashboard peut s'afficher uniquement a partir des structures V2
- la transformation active et ses dimensions sont claires
- les items `support` ne paraissent pas secondaires

## 11. Lot 6A - Runtime foundations

## 11.1 Objectif

Construire le socle runtime sur lequel tous les systemes vivants s'appuient.

## 11.2 Travail cible

- `active_load engine`: calcul de charge active a partir de `user_plan_items`
- `momentum_state_v2 classifier`: refonte de `momentum_state.ts` avec les 6 dimensions internes
- helpers de lecture runtime unifies (plan items actifs, slots utilises, traction par dimension)

## 11.3 Fichiers touches

- `supabase/functions/sophia-brain/momentum_state.ts` (refonte forte)
- `supabase/functions/sophia-brain/momentum_policy.ts` (adaptation)
- `supabase/functions/sophia-brain/state-manager.ts` (refonte: remplacer lectures actions/frameworks par plan_items)
- nouveau helper `active_load_engine.ts`

## 11.4 Pourquoi d'abord

Sans `active_load` et `momentum V2`, les bilans et le coaching n'ont pas de socle fiable.

## 11.5 Risques

- momentum V2 qui lit encore les anciennes entites par accident
- active_load mal calibre initialement

## 11.6 Guide d'audit

- completer `docs/audit-v2/momentum-v2-audit-guide.md`

## 11.7 Validation

- momentum V2 produit des postures coherentes sur des scenarios fixtures
- active_load retourne des scores lisibles a partir de plan_items reels
- aucune dependance directe a `user_actions / user_framework_tracking` dans les nouveaux helpers

## 12. Lot 6B - Bilans V2

## 12.1 Objectif

Refondre daily et weekly pour lire le runtime V2. Introduire le `conversation_pulse`.

## 12.2 Travail cible

### Daily V2

- refonte de `trigger-daily-bilan`
- logique de mode/cibles/output basee sur plan_items + momentum V2

### Weekly V2

- refonte de `trigger-weekly-bilan` et payload
- refonte de `agents/investigator-weekly/*`
- decision `hold / expand / consolidate / reduce` basee sur active_load + traction par dimension

### Conversation pulse

- introduction du snapshot `conversation_pulse` (appel LLM Tier 2)
- stockage dans `system_runtime_snapshots`
- lecture par weekly et daily

### Memory V2 - retrieval par intention

- adaptation du retrieval pour les 5 intentions runtime
- tagging par scope (cycle/transformation/execution/relational) dans le memorizer
- respect des contrats de budget tokens par intention (voir v2-technical-schema.md section 5.7)
- adaptation de `sophia-brain/router/dispatcher.ts` et `sophia-brain/context/loader.ts`

### Guides d'audit

- completer `docs/audit-v2/daily-weekly-v2-audit-guide.md`
- completer `docs/audit-v2/conversation-pulse-v2-audit-guide.md`
- completer `docs/audit-v2/memory-v2-audit-guide.md`

## 12.3 Fichiers touches

- `supabase/functions/trigger-daily-bilan/index.ts`
- `supabase/functions/trigger-weekly-bilan/payload.ts`
- `supabase/functions/trigger-weekly-bilan/index.ts`
- `supabase/functions/sophia-brain/agents/investigator-weekly/*`
- nouveau module `conversation_pulse_builder.ts`
- `supabase/functions/sophia-brain/router/dispatcher.ts` (retrieval par intention)
- `supabase/functions/sophia-brain/context/loader.ts` (budget tokens par couche)
- modules memory existants (tagging par scope)

## 12.4 Risques

- weekly trop dependant de vieux payloads phase-based
- conversation_pulse trop couteux en LLM si mal cadre

## 12.5 Validation

- daily ne lit plus les phases
- weekly produit des decisions coherentes sur des scenarios fixtures
- conversation_pulse genere en < 12h de fraicheur, cout acceptable

## 13. Lot 6C - Coaching + Proactive V2

## 13.1 Objectif

Adapter le coaching et les nudges au runtime V2.

## 13.2 Travail cible

### Coaching V2

- selector dimension-aware (blocker sur mission vs habit vs support)
- tracking techniques utiles/inutiles (existant a garder)
- integration avec active_load et plan_fit

### Morning nudge V2

- refonte de `momentum_morning_nudge.ts`
- nouvelles postures (celebration_ping, pre_event_grounding, protective_pause)
- lecture de conversation_pulse et momentum V2

### Victory ledger

- introduction de `user_victory_ledger`
- alimentation par daily/weekly/chat

### Coaching memory dimension-aware

- adaptation de la coaching memory pour tagger les blockers par dimension (mission/habit/support)
- integration avec les plan_items pour identifier le type d'item bloque

### Guides d'audit

- completer `docs/audit-v2/coaching-v2-audit-guide.md`
- completer `docs/audit-v2/proactive-v2-audit-guide.md`

## 13.3 Ce qui est reporte a V2.1

- `proactive windows engine` formel (le morning nudge V2 + pre_event_grounding couvrent le besoin V2.0)
- `relation_preferences` table (apprendre d'abord des donnees reelles)
- `repair_mode` formel (couvert par pause_consentie + cooldowns + posture conservative en V2.0)
- `user_rendez_vous` table dediee (enrichissement des scheduled_checkins suffit en V2.0)

## 13.4 Fichiers touches

- `supabase/functions/sophia-brain/coaching_intervention_selector.ts` (adaptation)
- `supabase/functions/sophia-brain/momentum_morning_nudge.ts` (refonte)
- `supabase/functions/sophia-brain/momentum_outreach.ts` (adaptation)
- `supabase/functions/sophia-brain/momentum_proactive_selector.ts` (adaptation)

## 13.5 Risques

- collisions entre proactive V2 et triggers legacy
- coaching encore alimente par anciennes entites par accident

## 13.6 Validation

- coaching detecte le bon type de blocage (dimension-aware)
- morning nudge V2 respecte budget/cooldowns
- victory ledger alimente et lisible

## 14. Lot 7 - Cleanup legacy

## 14.1 Objectif

Supprimer les primitives legacy qui n'ont plus a exister.

## 14.2 A supprimer ou deprecier

- logique `current_phase`
- usages produit de `user_goals` comme verite transformation
- anciennes functions onboarding devenues obsoletes
- composants dashboard dependants des phases
- heuristiques runtime sur `user_actions / frameworks / vitals` comme grille primaire

## 14.3 Regle

Ne supprimer qu'apres:

- remplacement effectif
- tests
- observabilite
- verification des chemins admin/debug

## 14.4 Validation

- aucun chemin user ne depend encore du contrat legacy
- les logs ne remontent plus d'hypotheses `phase-based`

## 15. Orchestration du travail

## 15.1 Ordre d'execution recommande

Ordre concret:

1. Lot 0 - Preparation
2. Lot 1 - Schema DB V2
3. Lot 2 - Runtime views + events
4. Lot 3 - Plan generation V2
5. Lot 4 - Onboarding V2
6. Lot 5 - Dashboard V2
7. Lot 6A - Runtime foundations (active_load + momentum V2)
8. Lot 6B - Bilans V2 (daily + weekly + conversation_pulse)
9. Lot 6C - Coaching + Proactive V2
10. Lot 7 - Cleanup legacy

## 15.2 Regle de progression

On ne passe au lot suivant que si:

- contrats du lot courant stables
- tests minimaux verts
- aucune incoherence structurelle ouverte

## 15.3 Parallelisation intelligente

Possible en parallele:

- schema DB + type definitions
- design UI dashboard + runtime views
- coaching selector adaptation + weekly payload redesign

Pas ideal en parallele:

- onboarding final avant schema/runtime
- proactive engine avant momentum/load runtime

## 16. Testing strategy

## 16.1 Tests minimums par lot

### Lot 1

- migrations from scratch
- contraintes d'unicite
- enums valides

### Lot 2

- reconstruction runtime user actif
- freshness windows
- snapshots coherents

### Lot 3

- generation questionnaire
- generation plan
- distribution plan_items

### Lot 4

- parcours onboarding complet
- cas 1 transformation
- cas 3 transformations + `Pour plus tard`
- signup en cours de flow

### Lot 5

- dashboard transformation active
- rendu dimensions
- north star cycle

### Lot 6A

- momentum V2 produit des postures coherentes sur scenarios fixtures
- active_load scores corrects sur plan_items de test

### Lot 6B

- daily decision coherente (mode + cibles)
- weekly decision coherente (hold/expand/consolidate/reduce)
- conversation_pulse generable et < budget LLM Tier 2

### Lot 6C

- coaching dimension-aware detecte le bon type de blocage
- morning nudge V2 respecte budget/cooldowns
- victory ledger alimente par daily/weekly

### Lot 7

- absence de dependances legacy

## 16.2 Eval scenarios recommandes

Il faut prevoir des scenarios au moins pour:

- user motive et stable
- user en friction legere
- user evitement
- user soutien emotionnel
- user en reprise
- semaine vide
- semaine avec evenement proche
- plan trop charge
- support inutile
- habitude en maintenance
- repair mode

## 16.3 Golden test cases recommandes

Pour les lots critiques (3, 6A, 6B), definir des fixtures completes avec:

- un user fixture avec cycle + transformation + plan + plan_items distribues
- des entries simulees (mix de succes, echecs, skips)
- des assertions verifiables sur les sorties attendues

Exemples:

- **Lot 3**: un texte libre realiste → plan genere → distribution en plan_items → verification que chaque item a les bons champs
- **Lot 6A**: un set de plan_items avec statuts mixtes → active_load attendu → momentum_state attendu
- **Lot 6B**: une semaine d'entries simulees → daily mode attendu → weekly decision attendue

## 17. Observabilite et admin

## 17.1 Avant de brancher le proactive V2

Il faut absolument pouvoir voir facilement:

- transformation active
- active load
- momentum_state_v2
- conversation_pulse
- dernieres decisions proactives
- cooldowns actifs
- repair mode actif ou non

## 17.2 Minimum admin/debug

Je recommande une vue ou log debug qui expose:

- `cycle_id`
- `transformation_id`
- `plan_id`
- `momentum_state_v2`
- `active_load`
- `conversation_pulse summary`
- `proactive budget usage`
- `repair_mode`
- `last_weekly_decision`

## 18. Risques majeurs du projet

## 18.1 Risques techniques

- double verite entre JSON plan et relationnel
- runtime views mal definies
- collisions entre triggers et scheduling
- derive progressive du contrat V2

## 18.2 Risques produit

- onboarding trop long
- etape de validation d'aspects trop lourde
- support dimension percue comme secondaire
- weekly trop bavard
- proactive trop frequent ou trop froid

## 18.3 Risques organisationnels

- retomber dans le legacy "temporairement"
- corriger au fil de l'eau sans reference aux docs
- attaquer 6 couches a la fois

## 19. Decisions a prendre avant de coder massivement

Il reste 2 decisions d'implementation a trancher:

1. `user_cycle_drafts` oui/non des la V1
2. vues runtime materialisees ou calculees d'abord en backend

Ma reco:

- `user_cycle_drafts` non au tout debut sauf besoin invite serveur fort
- vues runtime d'abord en backend si ca accelere, puis SQL si necessaire quand le contrat se stabilise

## 20. Budget LLM

La strategie de cout LLM est definie dans [v2-technical-schema.md section 10](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md).

Regles cles pour le plan d'implementation:

- Lots 1-5: pas d'impact LLM runtime (seulement generation onboarding, deja budgete)
- Lot 6A: pas de nouvel appel LLM (heuristiques + calculs deterministes)
- Lot 6B: introduction du `conversation_pulse` (1 appel Tier 2 / jour max)
- Lot 6C: coaching selector + morning nudge (appels Tier 3, modeles rapides)

Le cout LLM incremental de la V2 par rapport a la V1 vient principalement de:

- `conversation_pulse` (nouveau, quotidien)
- `weekly conversation digest` n'est **pas** dans le scope V2.0 et ne doit pas etre budgete avant la V2.1

Les autres appels (momentum, daily mode, coaching) remplacent des appels existants et ne doivent pas augmenter le budget.

## 21. Definition of done globale

La V2 est consideree comme livree quand:

- un user peut aller du texte libre au plan V2
- le dashboard s'appuie sur les dimensions V2
- daily/weekly/momentum/coaching/proactive lisent tous le runtime V2
- budget proactif et cooldowns sont operants, et la couverture relationnelle V2.0 fonctionne via `pause_consentie` + posture conservative
- les anciennes hypotheses `phase-based` ne gouvernent plus le produit

## 22. Conclusion

Le bon rollout n'est pas de tout reconstruire d'un coup.

Le bon rollout est:

- `schema`
- `runtime views`
- `generation`
- `onboarding`
- `dashboard`
- `runtime foundations` (6A)
- `bilans` (6B)
- `coaching + proactive` (6C)
- `cleanup`

Si cet ordre est respecte, la refonte reste pilotable.
Si cet ordre est casse, le risque principal est d'obtenir une V2 tres intelligente sur le papier mais fragile dans le code.
