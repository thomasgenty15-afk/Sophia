# V2 Execution Playbook

## Statut

Document operationnel d'execution pour la refonte V2.0 → V2.1.

Ce document s'appuie sur:

- [onboarding-v2-canonique.md](/Users/ahmedamara/Dev/Sophia%202/docs/onboarding-v2-canonique.md)
- [v2-systemes-vivants-implementation.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-systemes-vivants-implementation.md)
- [v2-technical-schema.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md)
- [v2-orchestration-rules.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-orchestration-rules.md)
- [v2-global-implementation-plan.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-global-implementation-plan.md)
- [v2-mvp-scope.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-mvp-scope.md)
- [v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)
  — structure des guides d'audit integres aux lots

Il ne redefinit pas la cible. Il dit exactement comment l'atteindre, etape par
etape, avec quel outil.

## Modeles et roles

### Claude (Cursor)

Acces complet au repo. Edite les fichiers, lance les commandes, a le contexte du
code.

Forces: architecture, validation, coherence cross-docs, code review, refactoring
structure, decisions de contrat.

Usage: decision, validation, structuration, review, refactoring.

### GPT (Codex)

Acces au repo. Genere du code rapidement, implemente en volume.

Forces: implementation rapide, generation bulk, code boilerplate,
automatisation, generation de prompts LLM.

Usage: production de code, migrations SQL, generation de types, implementation
de fonctions.

### Gemini

Pas d'acces repo direct. Travaille sur des specs/mockups.

Forces: UX/UI, design produit, organisation visuelle, prototypage d'ecrans,
critique UX.

Usage: design de flows, mockups, critique d'experience, structure de composants
UI.

### Regle d'orchestration

- Claude valide ce que GPT produit
- GPT implemente ce que Claude structure
- Gemini designe ce que Claude et GPT vont construire
- Aucun code ne merge sans review Claude
- Aucun design UX ne se code sans validation Gemini

---

# PARTIE 1 — VUE GLOBALE

## Timeline V2.0

```
Semaine 1-2:   Lot 0 + Lot 1 (preparation + schema DB)
Semaine 2-3:   Lot 2 (runtime views + events)
Semaine 3-5:   Lot 3 (plan generation V2 + audit guide plan generation)
Semaine 4-7:   Lot 4 (onboarding V2) — parallele avec fin lot 3
Semaine 6-8:   Lot 5 (dashboard V2 + audit guide plan execution)
Semaine 8-10:  Lot 6A (active_load + momentum V2 + audit guide momentum)
Semaine 10-12: Lot 6B (daily + weekly + pulse + memory retrieval V2 + 3 audit guides)
Semaine 12-13: Lot 6C (coaching + morning nudge V2 + 2 audit guides)
Semaine 13-14: Lot 7 (dispatcher V2 adaptation + modele GPT 5.4 Mini)
Semaine 14-15: Lot 8 (legacy cleanup + LLM cost audit guide)
```

Note: la timeline passe de 12 a 15 semaines pour integrer le retrieval memoire
V2 (Lot 6B), les etapes d'audit par lot, et l'adaptation du dispatcher aux
sources V2.

## Timeline V2.1

```
Apres V2.0 en production + 2-4 semaines de donnees reelles:

Phase A: Proactive windows engine + cooldown engine
Phase B: Repair mode formel + relation preferences
Phase C: Rendez-vous table + transformation handoff
Phase D: user_cycle_drafts + weekly conversation digest
```

---

# PARTIE 2 — PHASES DETAILLEES V2.0

---

# GESTION DES CONVERSATIONS

Chaque lot doit etre traite dans une **nouvelle conversation** pour eviter la
saturation de contexte.

**Regle:** au debut de chaque nouvelle conversation, coller le contenu de
`docs/v2-context-prompt.md` puis le prompt de l'etape en cours.

| Conversation | Contenu                                  | Fin de conversation                                                |
| ------------ | ---------------------------------------- | ------------------------------------------------------------------ |
| Conv 1       | Lot 0 complet (0.2 + 0.3)                | Quand `FROZEN_MODULES.md` et `V2_MERGE_CHECKLIST.md` sont produits |
| Conv 2       | Lot 1 complet (1.1 → 1.4)                | Quand migrations SQL + types TS sont generes et revus. **CP1**     |
| Conv 3       | Lot 2 complet (2.1 + 2.2)                | Quand helpers runtime et event contracts sont prets                |
| Conv 4       | Lot 3 complet (3.1 → 3.5)                | Quand plan generation fonctionne end-to-end. **CP2**               |
| Conv 5       | Lot 4 (4.0 UX design avec Gemini)        | Quand mockups UX valides                                           |
| Conv 6       | Lot 4 (4.1 + 4.2 implementation)         | Quand onboarding V2 fonctionnel                                    |
| Conv 7       | Lot 5 (5.0 UX design avec Gemini)        | Quand mockups dashboard valides                                    |
| Conv 8       | Lot 5 (5.1 + 5.3 implementation + audit) | Quand dashboard V2 fonctionnel. **CP3**                            |
| Conv 9       | Lot 6A complet (6A.1 → 6A.3)             | Quand momentum V2 + active_load operationnels                      |
| Conv 10      | Lot 6B complet (6B.1 → 6B.5)             | Quand bilans + pulse + memory retrieval prets. **CP4**             |
| Conv 11      | Lot 6C complet (6C.1 → 6C.3)             | Quand coaching + nudge V2 operationnels                            |
| Conv 12      | Lot 7 complet (7.1 → 7.6)                | Quand dispatcher adapte V2 + modele GPT 5.4 Mini                   |
| Conv 13      | Lot 8 complet (8.1 → 8.3)                | Quand legacy nettoye, audit LLM fait                               |

**Quand changer de conversation:**

- Toujours a la frontiere d'un lot
- Toujours apres un checkpoint (CP1-CP4)
- Si la conversation depasse ~40-50 echanges
- Si le modele commence a "oublier" des decisions ou a se repeter
- Les lots UX (Gemini) et implementation (Claude/GPT) sont dans des
  conversations separees

**Quand NE PAS changer:**

- Au milieu d'une etape (ex: entre 3.2 et 3.3)
- Si on debug un probleme lie a l'etape en cours
- Si l'etape suivante depend directement du contexte de l'etape en cours (meme
  lot)

**Rituel de fin de conversation (OBLIGATOIRE):**

Avant de fermer, toujours copier-coller le prompt de cloture qui se trouve dans
`docs/v2-context-prompt.md` section "Rituel de fin de conversation".

Ce rituel couvre 5 etapes:

1. Mise a jour du suivi (statuts, decisions, fichiers crees)
2. Mise a jour du playbook (etapes FAIT)
3. Propagation des changements (references croisees, coherence cross-docs)
4. Check de coherence rapide (noms obsoletes, types dupliques, fichiers
   orphelins)
5. Resume de fin pour la conversation suivante

**C'est la protection principale contre l'effet boule de neige.** Ne jamais
sauter cette etape, meme si la conversation semble "petite".

---

# CHECKPOINTS DE RECALIBRAGE

Il n'est PAS necessaire de revalider le plan apres chaque etape. Il est
necessaire de le faire a **4 moments precis**.

## CP1 — Apres Lot 1 (Schema DB)

**Question:** le schema implemente correspond-il au technical schema ?

Verifier:

- [x] Les types generes matchent `v2-technical-schema.md`
- [x] Les enums SQL correspondent aux enums TypeScript
- [x] `user_plans_v2` est une nouvelle table, l'ancienne n'est pas modifiee
- [x] Les contraintes d'unicite critiques sont posees
- [x] Aucune table V2.1 n'a ete creee par erreur

**Si ecart:** patcher le schema ou le technical schema. Ne pas avancer au Lot 2
avec un schema bancal.

## CP2 — Apres Lot 3 (Plan generation)

**Question:** le plan genere par le LLM est-il conforme et distribuable ?

Verifier:

- [x] Le JSON genere est conforme a `PlanContentV2`
- [x] La distribution en `user_plan_items` fonctionne (temp_id → UUID,
      activation_condition resolue)
- [x] Les items generes sont concrets et personnalises, pas generiques
- [x] Le cout LLM de generation est acceptable
- [x] Les prompts ont ete testes sur 3-5 cas realistes

**Si ecart:** iterer sur les prompts AVANT de commencer le Lot 4. Le frontend
onboarding ne doit pas etre branche sur des prompts instables.

## CP3 — Apres Lot 5 (Dashboard V2)

**Question:** le runtime V2 nourrit-il l'UI correctement sans hack ?

Verifier:

- [x] Le dashboard affiche les 3 dimensions a partir de `user_plan_items`
- [x] Aucune dependance residuelle a `current_phase` ou `user_actions`
- [x] La North Star vient de `user_metrics`
- [x] Le debloquage conditionnel s'affiche correctement
- [x] Les supports ne paraissent pas secondaires dans l'UI

**Si ecart:** corriger le runtime ou l'UI avant d'attaquer les systemes vivants
(6A). Si le dashboard ne marche pas sur le runtime V2, le momentum et les bilans
ne marcheront pas non plus.

## CP4 — Apres Lot 6B (Bilans V2)

**Question:** le cout du conversation_pulse est-il acceptable ? Les bilans
fonctionnent-ils ?

Verifier:

- [x] Le conversation_pulse se genere en < 12h de freshness
- [x] Le cout LLM du pulse est acceptable (mesurer sur 1 semaine de test)
- [x] Le daily V2 produit des modes coherents sur les scenarios fixtures
- [x] Le weekly V2 produit des decisions coherentes
      (hold/expand/consolidate/reduce)
- [x] Si le pulse est trop cher, le daily/weekly fonctionnent en mode degrade
      (momentum + entries seuls)

**Si ecart:** rendre le conversation_pulse optionnel et continuer avec les
bilans en mode degrade. Ne pas bloquer le Lot 6C pour un probleme de cout.

---

## LOT 0 — PREPARATION

### Etape 0.1 — Creer la branche V2

**Statut:** FAIT — branche `v2-redesign` creee.

**Output:** branche locale `v2-redesign` active

---

### Etape 0.2 — Lister les modules geles

**Statut:** FAIT — `docs/FROZEN_MODULES.md` cree (~180 fichiers geles, tous
verifies existants).

**Modele:** Claude (Cursor) — **nouvelle conversation** **Pourquoi:** connait le
repo en profondeur, peut auditer

**Prompt: coller `docs/v2-context-prompt.md` en entier, puis ajouter:**

````
# Tache: Etape 0.2 — Lister les modules geles

On est dans la branche `v2-redesign`. On commence la refonte V2 de Sophia.

## Objectif

Produire un fichier `docs/FROZEN_MODULES.md` qui liste tous les fichiers et
modules qui ne doivent PAS etre modifies pendant la refonte, sauf bugfix critique.

## Comment proceder

1. Lis la cartographie `keep / refactor / delete` dans
   `docs/v2-systemes-vivants-implementation.md` section 29
   (lignes ~1897-1945). Elle donne les fichiers:
   - 29.1 Keep presque tel quel (= FROZEN)
   - 29.2 Refactor fort (= seront modifies, PAS frozen)
   - 29.3 Delete ou deprecate (= seront supprimes, PAS frozen)

2. Scanne le codebase pour completer la liste avec les modules legacy
   qui ne sont PAS dans la cartographie mais qui ne doivent pas etre
   touches non plus pendant la V2, notamment:
   - Pages frontend legacy (onboarding V1, settings, etc.)
   - Components frontend legacy qui ne sont PAS dans la liste refactor
   - Edge functions qui ne sont PAS listees dans refactor/delete
   - Hooks legacy qui ne sont PAS dans la liste refactor

3. Pour chaque fichier, verifie qu'il existe reellement dans le repo
   (pas de chemin invente).

## Format du fichier FROZEN_MODULES.md

```markdown
# Modules geles — Refonte V2

> Ces fichiers ne doivent PAS etre modifies pendant la refonte V2,
> sauf bugfix critique approuve explicitement.
> Derniere mise a jour: [date]

## Backend — Edge Functions gelees
- `chemin/fichier.ts` — raison courte

## Backend — Brain modules geles
- `chemin/fichier.ts` — raison courte

## Frontend — Pages gelees
- `chemin/fichier.tsx` — raison courte

## Frontend — Components geles
- `chemin/fichier.tsx` — raison courte

## Frontend — Hooks geles
- `chemin/fichier.ts` — raison courte

## Modules explicitement NON geles (seront refactores/supprimes)
> Rappel: ces fichiers SERONT modifies par la V2. Cf. section 29.2 et 29.3.
- liste courte pour reference
````

4. Ne push pas sur le remote.
5. Ne modifie aucun fichier existant a part creer FROZEN_MODULES.md.

```
**Output:** `docs/FROZEN_MODULES.md`
**Validation:** chaque fichier liste existe reellement dans le repo

---

### Etape 0.3 — Checklist de revue pre-merge

**Statut:** FAIT — `docs/V2_MERGE_CHECKLIST.md` cree (12 sections, ~45 points de controle).

**Modele:** Claude (Cursor)
**Pourquoi:** structuration, coherence

**Prompt:**
```

Cree un fichier docs/V2_MERGE_CHECKLIST.md qui sera utilise avant chaque merge
de lot V2. Il doit contenir:

- [ ] Les types sont conformes a v2-technical-schema.md
- [ ] Aucune dependance a current_phase, user_goals comme verite, ou phases
- [ ] Les plan_items sont la source de verite d'execution (pas le JSON plan)
- [ ] Les nouveaux events sont conformes aux event contracts V2
- [ ] Les invariants techniques sont respectes (1 cycle actif max, 1
      transformation active max, etc.)
- [ ] Pas de logique qui lit user_actions/user_framework_tracking comme grille
      primaire
- [ ] L'observabilite est presente (events logues)

```
**Output:** `docs/V2_MERGE_CHECKLIST.md`
**Validation:** relecture humaine

---

## LOT 1 — SCHEMA DB V2

### Hors scope de ce lot

- `user_relation_preferences` (V2.1 — apprendre des donnees reelles d'abord)
- `user_rendez_vous` (V2.1 — enrichissement des scheduled_checkins suffit en V2.0)
- `user_cycle_drafts` (V2.1 — cache invite frontend suffit en V2.0)
- Modification de la table `user_plans` existante — creer `user_plans` V2 comme nouvelle table, ne pas tordre l'ancienne

### Etape 1.1 — Generer les migrations SQL

**Statut:** FAIT — migration `supabase/migrations/20260323181825_v2_core_schema.sql` creee.

**Modele:** GPT (Codex)
**Pourquoi:** generation bulk de SQL, rapide et structure

**Prompt:**
```

Tu travailles sur le projet Sophia 2 (Supabase / PostgreSQL).

Lis attentivement le fichier docs/v2-technical-schema.md.

Genere les migrations SQL pour creer les tables V2 suivantes, dans cet ordre:

1. user_cycles
2. user_transformations
3. user_transformation_aspects
4. user_plans_v2 (nouvelle table — ne PAS modifier l'ancienne user_plans)
5. user_plan_items
6. user_plan_item_entries
7. user_metrics (table unique avec scope cycle|transformation)
8. user_victory_ledger
9. system_runtime_snapshots

Pour chaque table:

- cree les colonnes conformes au type defini dans v2-technical-schema.md
- ajoute les foreign keys
- ajoute les contraintes d'unicite critiques
- ajoute RLS enable + policies basiques (user_id = auth.uid())
- ajoute les index utiles (cycle_id, transformation_id, plan_id, status)
- ajoute created_at/updated_at avec defaults

Cree les enums PostgreSQL:

- cycle_status, transformation_status, aspect_status, aspect_uncertainty,
  deferred_reason, plan_status, plan_dimension, plan_item_kind,
  plan_item_status, support_mode, support_function, habit_state, tracking_type,
  metric_scope, metric_kind, metric_status

Genere un seul fichier de migration avec un timestamp de la forme
YYYYMMDDHHMMSS_v2_core_schema.sql.

N'utilise PAS DROP TABLE. N'utilise PAS de commandes destructives.

```
**Output:** fichier migration SQL dans `supabase/migrations/`
**Validation:** Claude review

---

### Etape 1.2 — Review de la migration

**Statut:** FAIT — migration validee sans ecart bloquant.

**Modele:** Claude (Cursor)
**Pourquoi:** validation de coherence avec le technical schema

**Prompt:**
```

Lis la migration SQL generee pour le schema V2 et compare-la avec
docs/v2-technical-schema.md.

Verifie:

- chaque table a les bonnes colonnes et types
- les enums correspondent exactement
- les foreign keys sont correctes
- les contraintes d'unicite critiques sont posees (ex: 1 seule north_star active
  par cycle, 1 seul cycle actif par user)
- RLS est enable sur chaque table
- aucune commande destructive (DROP, TRUNCATE, etc.)

Si tu trouves des ecarts, corrige la migration directement.

```
**Output:** migration validee (0 correction necessaire)
**Validation:** migration passe `supabase db reset` localement

---

### Etape 1.3 — Generer les types TypeScript shared

**Statut:** FAIT — fichier `supabase/functions/_shared/v2-types.ts` cree et verifie avec `deno check`.

**Modele:** GPT (Codex)
**Pourquoi:** generation bulk de types, miroir des enums SQL

**Prompt:**
```

A partir de docs/v2-technical-schema.md section 2 (Enums canoniques), genere un
fichier TypeScript qui exporte tous les enums et types V2.

Le fichier doit aller dans supabase/functions/_shared/v2-types.ts.

Inclus:

- tous les enums de la section 2
- les row types de la section 3 (UserCycleRow, UserTransformationRow, etc.)
- les state shapes de la section 5 (PlanContentV2, ConversationPulse,
  MomentumStateV2, DailyBilanOutput, WeeklyBilanOutput, RendezVousRuntime)

Exporte tout avec export type. N'importe rien d'externe.

```
**Output:** `supabase/functions/_shared/v2-types.ts`
**Validation:** Claude verifie la conformite avec le technical schema

---

### Etape 1.4 — Generer les types frontend

**Statut:** FAIT — fichier `frontend/src/types/v2.ts` cree et valide avec `tsc --noEmit`.

**Modele:** GPT (Codex)
**Pourquoi:** miroir frontend des types backend

**Prompt:**
```

A partir du fichier supabase/functions/_shared/v2-types.ts qui vient d'etre
cree, genere un fichier frontend/src/types/v2.ts qui contient les memes types
adaptes pour le frontend.

Regles:

- memes types, memes enums
- pas de dependance a Supabase server-side
- exporte tout avec export type

```
**Output:** `frontend/src/types/v2.ts`
**Validation:** `tsc --noEmit` passe

---

## LOT 2 — RUNTIME VIEWS + EVENTS

### Hors scope de ce lot

- `v_proactive_runtime_context` (V2.1 — le proactive V2.0 lit les helpers directement)
- `v_weekly_runtime_context` (V2.1 — le weekly construit son contexte inline)

### Etape 2.1 — Creer les helpers runtime backend

**Statut:** FAIT — fichier `supabase/functions/_shared/v2-runtime.ts` cree avec types de retour exportes; `deno fmt` passe et le `deno check` cible reste a rejouer dans un contexte ou la resolution JSR fonctionne.

**Modele:** GPT (Codex)
**Pourquoi:** implementation rapide de fonctions de lecture

**Prompt:**
```

Tu travailles dans supabase/functions/ du projet Sophia 2.

Cree un fichier supabase/functions/_shared/v2-runtime.ts qui exporte les helpers
suivants:

1. getActiveTransformationRuntime(supabase, userId)
   - retourne: cycle actif, transformation active, plan actif, north star cycle,
     progress markers, counts plan_items par dimension/statut

2. getPlanItemRuntime(supabase, planId)
   - retourne: tous les plan_items du plan avec: last_entry_at, recent_entries
     (5 derniers), status, dimension, kind

3. getActiveLoad(supabase, planId)
   - retourne: current_load_score, mission_slots_used, support_slots_used,
     habit_building_slots_used, needs_reduce, needs_consolidate
   - calcule a partir des plan_items actifs

Chaque helper doit:

- utiliser le client Supabase passe en parametre
- retourner un objet type (pas de any)
- gerer les cas null/vide proprement
- utiliser les types de _shared/v2-types.ts

Importe les types depuis ./v2-types.ts.

```
**Output:** `supabase/functions/_shared/v2-runtime.ts`
**Validation:** Claude review + types check

---

### Etape 2.2 — Definir les event contracts

**Statut:** FAIT — fichier `supabase/functions/_shared/v2-events.ts` cree avec 27 event types, payloads types depuis section 6 du technical-schema, et helper `logV2Event` type-safe. `deno fmt` + `deno check` passent. **Post-audit:** `logV2Event` wrappe dans try/catch interne — ne crashe plus les requetes sur erreur DB (`console.warn` par defaut, option `throwOnError` si besoin).

**Modele:** Claude (Cursor)
**Pourquoi:** decisions d'architecture, coherence avec orchestration rules

**Prompt:**
```

A partir de v2-technical-schema.md section 6 (Events canoniques), cree un
fichier supabase/functions/_shared/v2-events.ts qui contient:

- les types de payload pour chaque event V2
- une fonction helper logV2Event(supabase, eventType, payload) qui insere dans
  la table appropriee (system_runtime_snapshots ou un mecanisme existant)
- les event types comme const enum

Assure-toi que chaque event a au minimum: user_id, cycle_id, timestamp.

```
**Output:** `supabase/functions/_shared/v2-events.ts`
**Validation:** conformite avec section 6 du technical schema

**Decision architecturale:** `logV2Event` persiste dans `system_runtime_snapshots`. La contrainte CHECK `snapshot_type` n'accepte que 5 valeurs actuellement — une migration additive sera necessaire pour y ajouter les 27 event types avant la premiere emission effective (Lot 3+). Les payloads utilisent `V2EventPayloadMap` pour un dispatch type-safe (chaque event type force le bon payload au call site). Les events coaching (6.5) utilisent `GenericV2EventPayload` car aucun schema specifique n'est defini dans le technical-schema — les lots 6A-6C raffineront.

---

## LOT 3 — PLAN GENERATION V2

### Hors scope de ce lot

- Transformation handoff formel (V2.1 — handoff minimal suffit en V2.0)
- Multi-generation sophistiquee (la limite de 2 generations par transformation reste)

### Legacy neutralise par ce lot

- `supabase/functions/generate-plan/index.ts` — remplace par `generate-plan-v2`. Supprime au lot 8.2.
- `supabase/functions/recommend-transformations/index.ts` — remplace par `analyze-intake-v2`. Supprime au lot 8.2.
- `supabase/functions/sort-priorities/index.ts` — remplace par `crystallize-v2`. Supprime au lot 8.2.
- `supabase/functions/summarize-context/index.ts` (ancienne forme) — plus necessaire pour la generation V2. Supprime au lot 8.2.

### Attention

Ce lot va probablement iterer. Les prompts LLM ne seront pas parfaits du premier coup. Prevoir 2-3 cycles de test → correction avant de brancher le frontend.

### Etape 3.1 — Designer le prompt de structuration IA

**Modele:** Claude (Cursor)
**Pourquoi:** design de prompt complexe, qualite de raisonnement

**Prompt:**
```

Lis docs/onboarding-v2-canonique.md, sections Etape 2 (Analyse IA initiale) et
Etape 4 (Cristallisation).

Ecris le system prompt et le user prompt pour l'appel LLM qui prend le
raw_intake_text de l'utilisateur et produit:

- aspects extraits (label + raw_excerpt)
- regroupements provisoires (max 3 blocs)
- aspects differes (pour plus tard)
- aspects incertains (avec uncertainty_level)

Le prompt doit:

- etre en francais
- produire un JSON structure conforme aux types V2
- ne pas forcer 12 sujets dans 3 categories artificielles
- utiliser "Pour plus tard" quand c'est sain
- ne pas encore donner de nom de transformation final
- viser un excellent ratio comprehension/interactions correctives

Ecris aussi le prompt de cristallisation qui transforme les regroupements
valides en transformations formelles avec:

- titre
- synthese interne
- synthese user-ready
- contexte questionnaire
- ordre recommande

Produis les prompts dans un fichier
supabase/functions/_shared/v2-prompts/structuration.ts et
supabase/functions/_shared/v2-prompts/cristallisation.ts

```
**Output:** prompts de structuration et cristallisation
**Validation:** test manuel avec 3-5 textes libres realistes

---

### Etape 3.2 — Designer le prompt de generation de plan

**Modele:** Claude (Cursor)
**Pourquoi:** prompt complexe, doit produire un JSON conforme a PlanContentV2

**Prompt:**
```

Lis docs/onboarding-v2-canonique.md (structure du plan, dimensions, items,
debloquage) et docs/v2-technical-schema.md (PlanContentV2, PlanContentItem).

Ecris le system prompt et le user prompt pour la generation de plan V2.

Entrees:

- transformation (titre, synthese, contraintes)
- reponses questionnaire
- profil minimal (age, genre, duree)

Sortie attendue: JSON conforme a PlanContentV2 avec:

- strategy (identity_shift, core_principle, success_definition, main_constraint)
- dimensions support/missions/habits avec items complets
- chaque item a: temp_id, dimension, kind, tracking_type, activation_order,
  activation_condition, support_mode/function si applicable
- cycle_north_star_suggestion
- timeline_summary

Contraintes du prompt:

- max 1 mission principale active au depart
- max 2 habits en active_building
- max 1-2 supports recommended_now
- utiliser activation_condition pour le debloquage (pas de phases)
- la duree (1/2/3 mois) modifie la densite, pas la structure
- produire des items concrets et personnalises, pas generiques

Produis le prompt dans supabase/functions/_shared/v2-prompts/plan-generation.ts

```
**Output:** prompt de generation de plan V2
**Validation:** test avec 3 profils types (simple, multiple, complexe)

---

### Etape 3.3 — Implementer la distribution plan_items

**Statut:** FAIT

**Modele:** GPT (Codex)
**Pourquoi:** implementation mecanique, mapping JSON → rows

**Prompt:**
```

Cree une fonction distributePlanItems dans
supabase/functions/_shared/v2-plan-distribution.ts.

Cette fonction:

1. Recoit un PlanContentV2 (JSON genere par le LLM)
2. Pour chaque item dans dimensions[].items:
   - cree un UserPlanItemRow avec un vrai UUID
   - mappe temp_id → id
   - resout les activation_condition.depends_on en remplacant les temp_ids par
     les vrais UUIDs
   - initialise status a "pending" (ou "active" pour activation_order = 1)
3. Insere tous les plan_items dans user_plan_items via Supabase
4. Cree la metric north_star dans user_metrics si cycle_north_star_suggestion
   est present
5. Retourne la liste des items crees

Utilise les types de _shared/v2-types.ts. Gere les erreurs proprement. Logue un
event plan_generated_v2.

```
**Output:** `supabase/functions/_shared/v2-plan-distribution.ts`
**Validation:** Claude review + test avec un JSON de plan fixture

**Implementation note:** helper pur `preparePlanDistribution` + wrapper `distributePlanItems`; `scheduled_days` normalises vers `mon..sun`; `temp_id` original persiste dans `payload._generation.temp_id` pour permettre un rerun sans dupliquer si des `user_plan_items` existent deja pour le `plan_id`; North Star cycle-level creee ou actualisee; event `plan_generated_v2` en best-effort tant que la CHECK constraint de `system_runtime_snapshots.snapshot_type` n'est pas etendue.

---

### Etape 3.4 — Creer la edge function generate-plan-v2

**Statut:** FAIT

**Modele:** GPT (Codex)
**Pourquoi:** assemblage rapide de la pipeline

**Prompt:**
```

Cree une edge function supabase/functions/generate-plan-v2/index.ts.

Cette fonction:

1. Recoit { transformation_id } en body
2. Charge la transformation, le cycle, le questionnaire_answers, le profil
3. Verifie que generation_attempts < 2
4. Appelle le LLM avec le prompt de plan-generation.ts
5. Parse et valide le JSON recu
6. Stocke le JSON dans user_plans_v2.content (status = "generated")
7. Appelle distributePlanItems pour creer les plan_items
8. Passe le plan en status = "active"
9. Passe la transformation en status = "active"
10. Incremente generation_attempts
11. Logue les events appropriés

Utilise les modules existants pour l'appel LLM (regarde comment
generate-plan/index.ts fonctionne actuellement et adapte).

```
**Output:** `supabase/functions/generate-plan-v2/index.ts`
**Validation:** Claude review + test end-to-end avec fixture

**Implementation note:** le handler authentifie l'utilisateur via le bearer token, charge `user_transformations` + `user_cycles`, refuse la generation si un plan V2 `generated/active/paused` existe deja pour la transformation, calcule `version = generation_attempts = tentative courante`, appelle `generateWithGemini` avec le prompt V2, valide le JSON via `validatePlanOutput`, persiste le snapshot dans `user_plans_v2`, distribue les items via `distributePlanItems`, puis active `user_plans_v2`, `user_transformations` et `user_cycles`. `plan_activated_v2` et `transformation_activated_v2` sont logues en best-effort; `plan_generated_v2` continue d'etre emis dans la distribution. Un test local `generate-plan-v2/index_test.ts` couvre les helpers purs (tentatives, age, validation fixture), mais pas encore un vrai E2E DB+LLM.

---

### Etape 3.5 — Ecrire le Plan Generation V2 Audit Guide ✅

**Modele:** Claude (Cursor)
**Pourquoi:** audit d'une chaine LLM complexe, besoin de rigueur

**Prompt:**
```

Lis docs/audit-v2/plan-generation-v2-audit-guide.md (squelette) et
docs/v2-audit-strategy.md (structure standard).

Complete le guide avec les details de la chaine reelle telle qu'implementee:
structuration → cristallisation → generation → distribution.

Pour chaque etape de la chaine:

- quels sont les inputs reels
- quels sont les outputs reels
- quels events sont logues
- comment construire le bundle d'audit

Ecris aussi un script d'export basique qui:

- charge le cycle + transformations + plan + plan_items pour un user
- reconstitue la chaine de generation
- produit un JSON au format standard V2 (trace + scorecard)

```
**Output:** guide complet + script `scripts/export_plan_generation_audit_bundle.mjs`
**Validation:** test sur 2-3 cycles de test

---

## LOT 4 — ONBOARDING V2

### Hors scope de ce lot

- `user_cycle_drafts` serveur (V2.1 — cache localStorage suffit en V2.0)
- Flows de reprise apres abandon mid-onboarding (V2.1)
- Onboarding pour transformation suivante (mini recap — implementer en V2.0 mais garder simple)

### Legacy neutralise par ce lot

- `frontend/src/pages/GlobalPlan.tsx` — remplace par le flow V2. Retirer des routes new-user, garder accessible sur route legacy debug `/onboarding-legacy`.
- `frontend/src/pages/GlobalPlanFollow.tsx` — meme traitement.
- `frontend/src/pages/PlanPriorities.tsx` — **conserve et adapte** pour le flow V2 (passer cycle_id/transformation_ids V2 au lieu des axes legacy). L'ecran de priorisation drag-and-drop existant fonctionne bien — il suffit de brancher les nouvelles donnees.
- `frontend/src/pages/PlanPrioritiesFollow.tsx` — meme traitement (adapter, pas remplacer).
- `frontend/src/pages/ActionPlanGenerator.tsx` — remplace par la generation V2 integree au flow onboarding. Garder pour les flows legacy.
- `frontend/src/pages/ActionPlanGeneratorFollow.tsx` — meme traitement.
- `frontend/src/pages/Auth.tsx` — **conserve tel quel**. L'ecran d'inscription/connexion est deja fonctionnel et bien fait. Le flow V2 l'appelle au meme moment que le flow actuel.
- `frontend/src/components/ResumeOnboardingView.tsx` — adapter pour detecter si le user est en cycle V2 ou legacy.

Note: les anciennes pages ne sont pas supprimees mais ne sont plus accessibles par le flow principal. Le Lot 8 les supprimera definitivement.

### Attention

Ce lot va iterer aussi. Le flow UX de validation des aspects est nouveau et non eprouve. Prevoir des tests utilisateur.

### Etape 4.0 — Designer les ecrans UX ✅

**Modele:** Gemini + review Claude
**Pourquoi:** UX/UI, flow design, experience utilisateur

**Statut: FAIT**

Gemini a produit les specs UX initiales. Claude a fait une review de coherence contre le flow canonique, les prompts implementes (`structuration.ts`, `cristallisation.ts`) et le playbook. 8 corrections integrees :

1. Ecran de clarification ajoute (Cas C : texte vague, `needs_clarification`)
2. Transition cristallisation ajoutee entre validation et priorisation (appel LLM invisible)
3. Action "retirer un aspect hors sujet" ajoutee a l'ecran de validation
4. Swipe carte entiere retire (trop destructif — deplacements aspect par aspect)
5. Barre de progression rendue non-numerotee (nombre d'etapes variable)
6. Progression questionnaire sans total fixe (nombre de questions dynamique)
7. "Modifier" remplace par "Deplacer vers..." dans la modale incertaine
8. Section guest flow / localStorage ajoutee (sauvegarde brouillon, reprise)

4 points ouverts restent a valider par Gemini (traitement visuel des niveaux d'incertitude, micro-copy "programme" vs "plan", mini recap transformation suivante, CTA ecran 1).

**Output:** `docs/v2-onboarding-ux-specs.md` — specs UX completes, 7 ecrans + transitions + guest flow
**Validation:** review Claude faite, retour a Gemini pour validation finale en cours

---

### Etape 4.1 — Implementer les edge functions onboarding

**Modele:** GPT (Codex)
**Pourquoi:** implementation rapide de la pipeline backend

**Statut: FAIT**

**Prompt:**
```

Tu travailles sur le projet Sophia 2.

Cree les edge functions suivantes pour l'onboarding V2:

1. supabase/functions/analyze-intake-v2/index.ts
   - recoit { raw_intake_text, cycle_id? }
   - si pas de cycle_id, cree un cycle en status "draft"
   - appelle le LLM de structuration (prompt dans v2-prompts/structuration.ts)
   - stocke les aspects dans user_transformation_aspects
   - stocke la structure provisoire dans le cycle
   - passe le cycle en "structured" (ou "clarification_needed" si trop vague)
   - retourne { cycle_id, aspects, provisional_groups, deferred_aspects }

2. supabase/functions/crystallize-v2/index.ts
   - recoit { cycle_id, validated_groups }
   - appelle le LLM de cristallisation
   - cree les transformations dans user_transformations
   - associe les aspects aux transformations
   - passe le cycle en "prioritized"
   - retourne { transformations }

3. supabase/functions/generate-questionnaire-v2/index.ts
   - recoit { transformation_id }
   - genere un questionnaire sur mesure base sur la synthese interne
   - stocke le schema dans transformation.questionnaire_schema
   - retourne { questions }

Chaque fonction doit:

- utiliser les types V2
- loguer les events V2
- gerer les erreurs proprement
- verifier les preconditions (bon status du cycle, etc.)

```
**Output:** 3 edge functions
**Validation:** Claude review + test avec scenarios Cas A/B/C/D

**Implementation note:** 3 edge functions ont ete creees: `analyze-intake-v2`, `crystallize-v2`, `generate-questionnaire-v2`. `analyze-intake-v2` authentifie l'utilisateur, cree/recharge un cycle tant qu'aucune transformation n'existe encore, appelle le prompt de structuration, persiste les aspects (`active` / `deferred`) dans `user_transformation_aspects`, stocke le snapshot onboarding dans `user_cycles.validated_structure`, et passe le cycle en `structured` ou `clarification_needed`. `crystallize-v2` accepte les regroupements valides, resolve les aspects existants, appelle la cristallisation, recree les transformations si elles ne sont pas encore engagees downstream, associe les aspects aux transformations, marque les aspects retires comme `rejected`, et passe le cycle en `prioritized`. `generate-questionnaire-v2` genere un schema questionnaire dynamique a partir de `internal_summary` + `handoff_payload.onboarding_v2.questionnaire_context`, le persiste dans `questionnaire_schema`, et passe le cycle en `questionnaire_in_progress`. Contrainte additive necessaire: migration `20260324103000_add_validated_structure_to_user_cycles.sql` pour rendre explicite le snapshot cycle-level. Detail d'audit temporaire: faute d'event canonique dedie au questionnaire dans le technical-schema actuel, `generate-questionnaire-v2` logue `cycle_prioritized_v2` avec `reason = questionnaire_generated` comme hook transitoire.

---

### Etape 4.2 — Implementer le frontend onboarding

**Modele:** GPT (Codex) pour le code, Gemini pour le polish UX
**Pourquoi:** volume de code frontend important

**Statut: FAIT**

**Prompt GPT (implementation):**
```

Tu travailles dans frontend/src/ du projet Sophia 2 (React + TypeScript +
Tailwind).

Cree les pages et composants suivants pour l'onboarding V2:

Pages (dans frontend/src/pages/):

- OnboardingV2.tsx — page orchestratrice du flow V2
- (ou utilise un systeme de steps interne)

Composants (dans frontend/src/components/onboarding-v2/):

- FreeTextCapture.tsx — grand champ libre, bouton continuer
- AspectValidation.tsx — cartes draggables avec aspects, zone "Pour plus tard",
  badges "a confirmer" sur aspects incertains
- CustomQuestionnaire.tsx — questions quali + QCM dynamiques (le nombre de
  questions n'est PAS fixe a 3+3, il varie selon la complexite)
- MinimalProfile.tsx — date naissance, genre, duree

Ecrans existants a REUTILISER (adapter, pas recoder):

- PlanPriorities.tsx — l'ecran de priorisation drag-and-drop existant. Adapter
  pour recevoir les transformations V2 (cycle_id, transformation_ids) au lieu
  des axes legacy. L'UX est deja bonne.
- Auth.tsx — l'ecran d'inscription/connexion existant. Ne PAS le toucher. Le
  flow V2 redirige vers /auth si l'utilisateur n'est pas inscrit, exactement
  comme le flow actuel.

Le flow doit:

- gerer un etat local "cycle draft" tant que l'user n'est pas inscrit
- appeler analyze-intake-v2, crystallize-v2, generate-questionnaire-v2,
  generate-plan-v2 aux bons moments
- supporter le mobile-first (Tailwind responsive)
- stocker le brouillon dans localStorage pour le cache invite

Utilise les types de frontend/src/types/v2.ts.

```
**Prompt Gemini (polish UX):**
```

Tu reviews l'UI de l'onboarding V2 de Sophia, une app de transformation
personnelle mobile-first.

Contexte produit:

- L'utilisateur commence par un champ libre pour decrire sa situation.
- Sophia extrait des aspects, propose des regroupements, puis l'utilisateur
  valide ce qui compte maintenant vs plus tard.
- Ensuite l'utilisateur priorise ses transformations.
- Puis Sophia genere un questionnaire dynamique sur mesure.
- Enfin l'utilisateur complete un mini profil avant la generation du plan.
- Le flow doit inspirer confiance, etre simple, humain, et eviter toute
  sensation de formulaire froid ou administratif.

Contraintes importantes:

- Mobile-first
- Ne pas casser la logique metier existante
- Auth existe deja et n'est pas a redesign ici
- PlanPriorities est un ecran legacy reutilise en mode V2, donc privilegie des
  ameliorations ciblees plutot qu'un redesign total

Voici les composants/pages a reviewer:

1. frontend/src/pages/OnboardingV2.tsx
2. frontend/src/components/onboarding-v2/FreeTextCapture.tsx
3. frontend/src/components/onboarding-v2/AspectValidation.tsx
4. frontend/src/components/onboarding-v2/CustomQuestionnaire.tsx
5. frontend/src/components/onboarding-v2/MinimalProfile.tsx
6. frontend/src/pages/PlanPriorities.tsx

Code: [COLLER ICI LE CODE DES FICHIERS]

Review chaque composant/page sur ces axes:

1. Hierarchie visuelle L'information la plus importante est-elle immediatement
   visible ? Le CTA principal est-il clair ? Y a-t-il des elements visuels qui
   se concurrencent inutilement ?

2. Micro-copy Les textes sont-ils humains, rassurants, non techniques ? Y a-t-il
   des formulations trop abstraites, trop longues, trop "produit" ou trop "IA" ?
   Reecris les textes faibles si necessaire.

3. Friction A quels moments l'utilisateur risque-t-il d'hesiter, se fatiguer, ou
   abandonner ? Y a-t-il trop d'effort cognitif, trop d'options, ou un manque de
   feedback ? Propose des simplifications concretes.

4. Mobile Les tap targets sont-ils assez grands ? Le scroll est-il naturel ? Les
   blocs sont-ils bien espaces ? Le clavier mobile risque-t-il de gener
   certaines etapes ? Repere toute friction mobile concrete.

5. Emotion / confiance Est-ce que l'experience donne confiance ? Est-ce qu'elle
   parait utile, calme, credible et personnelle ? Indique les moments ou l'UI
   parait trop brute, trop dense, ou pas assez accompagnante.

Format de reponse attendu:

- Organise la review par composant/page
- Pour chaque probleme trouve:
  - explique brievement le probleme
  - donne son impact utilisateur
  - propose une correction concrete
- Quand utile, propose directement:
  - une nouvelle micro-copy
  - un changement de structure
  - un changement de hierarchie visuelle
  - une amelioration mobile specifique
- Priorise les corrections les plus importantes
- Ne fais pas de refonte complete si une amelioration ciblee suffit

Si un composant est deja bon, dis-le explicitement et precise pourquoi.

```
**Output:** pages et composants onboarding V2
**Validation:** boucle GPT → Gemini → Claude

**Implementation note:** page `frontend/src/pages/OnboardingV2.tsx` creee comme orchestrateur du flow V2. Elle pilote les etapes capture libre → validation des aspects → priorisation (via `PlanPriorities.tsx` adapte en mode V2) → questionnaire dynamique → profil minimal → generation de plan. Les composants `FreeTextCapture`, `AspectValidation`, `CustomQuestionnaire` et `MinimalProfile` ont ete ajoutes sous `frontend/src/components/onboarding-v2/`. Le brouillon V2 est stocke dans `localStorage` via `frontend/src/lib/onboardingV2.ts`, ce qui permet la reprise invite et le retour depuis `/auth` sans toucher a `Auth.tsx`. Ecart d'implementation documente: les edge functions onboarding V2 exigent actuellement une session authentifiee, donc le draft reste local tant que l'utilisateur est invite; l'hydratation backend commence apres passage par `/auth`, pas avant. `PlanPriorities.tsx` a ete adapte pour accepter `v2Onboarding + v2Transformations` dans `location.state`, mettre a jour `user_transformations.priority_order/status`, puis renvoyer vers `/onboarding-v2` pour la suite. `ResumeOnboardingView.tsx` privilegie maintenant la reprise d'un cycle V2 incomplet avant le legacy, et `OnboardingV2.tsx` sait rehydrater un cycle V2 incomplet depuis Supabase quand il n'y a plus de brouillon local. Verification locale: `./frontend/node_modules/.bin/tsc --noEmit -p frontend/tsconfig.app.json` passe.

---

## LOT 5 — DASHBOARD V2

### Hors scope de ce lot

- Rendez-vous dans le dashboard (V2.1)
- Vue multi-transformation (V2.0 = 1 transformation active visible)
- Historique de transformations completees (V2.1)

### Legacy neutralise par ce lot

- `frontend/src/pages/Dashboard.tsx` — remplace par `DashboardV2.tsx`. L'ancien devient accessible sur `/dashboard-legacy` temporaire pour debug.
- `frontend/src/hooks/useDashboardData.ts` — remplace par `useDashboardV2Data.ts`. Garder l'ancien tant que la route legacy existe.
- `frontend/src/hooks/useDashboardLogic.ts` — remplace par `useDashboardV2Logic.ts`. Idem.
- `frontend/src/components/dashboard/PlanPhaseBlock.tsx` — plus utilise par le dashboard V2 (pas de phases). Garder pour la route legacy.
- `frontend/src/components/dashboard/PlanActionCard.tsx` — remplace par `PlanItemCard.tsx`.
- `frontend/src/components/dashboard/PersonalActionsSection.tsx` — remplace par `DimensionSection.tsx`.
- `frontend/src/types/dashboard.ts` — a terme remplace par `frontend/src/types/v2.ts`. Garder tant que les anciens composants existent.

Note: la route `/dashboard` pointe desormais vers `DashboardV2.tsx`. L'ancien dashboard reste sur `/dashboard-legacy` jusqu'au Lot 8.

### Etape 5.0 — Designer le dashboard UX ✅

**Modele:** Gemini + review Claude
**Pourquoi:** design d'interface complexe, organisation visuelle

**Statut: FAIT**

Gemini a produit les specs UX initiales. Claude a fait une review de coherence contre le doc canonique, le technical-schema et le playbook. 8 corrections integrees :

1. Ordre des dimensions corrige : Support passe en premier (avant Missions et Habits), conformement a la structure canonique du dashboard
2. Mode `unlockable` ajoute aux supports (carte grisee/flouee + cadenas)
3. Taxonomie fonctionnelle des supports integree (`rescue` avec badge SOS en tete, `practice` standard, `understanding` avec indicateur one-shot)
4. Etat `stalled` des habitudes designe (bordure ambre, message bienveillant, CTA "Adapter")
5. Indicateur d'ancrage remplace le streak : affichage "3/5" base sur preuves d'ancrage, grille adaptee aux `scheduled_days`
6. Milestones differencies des tasks dans la section Missions (icone drapeau, design distinct)
7. Point d'entree daily check-in ajoute en haut du dashboard (bandeau CTA)
8. Habitudes en construction passees en cartes empilees verticalement (carousel inutile pour 1-2 items max)

4 points ouverts restent a valider (emplacement daily check-in, acces rapide rescue, exploitation success_definition, slot coaching/nudges).

**Output:** `docs/v2-dashboard-ux-specs.md` — specs UX completes, 7 sections + points ouverts
**Validation:** review Claude faite, retour a Gemini pour validation finale en cours

---

### Etape 5.1 — Implementer le dashboard

**Modele:** GPT (Codex)
**Pourquoi:** volume de composants a creer/refondre

**Statut: FAIT**

**Prompt:**
```

Tu travailles dans frontend/src/ du projet Sophia 2.

Refonds le dashboard pour la V2. Les composants actuels a remplacer:

- Dashboard.tsx
- useDashboardData.ts
- useDashboardLogic.ts
- PlanPhaseBlock.tsx → supprime (plus de phases)
- PlanActionCard.tsx → remplace par PlanItemCard.tsx
- PersonalActionsSection.tsx → remplace par DimensionSection.tsx
- NorthStarSection.tsx → adapte pour lire user_metrics

Cree: frontend/src/pages/DashboardV2.tsx
frontend/src/hooks/useDashboardV2Data.ts
frontend/src/hooks/useDashboardV2Logic.ts
frontend/src/components/dashboard-v2/DimensionSection.tsx
frontend/src/components/dashboard-v2/PlanItemCard.tsx
frontend/src/components/dashboard-v2/StrategyHeader.tsx
frontend/src/components/dashboard-v2/NorthStarV2.tsx
frontend/src/components/dashboard-v2/UnlockPreview.tsx
frontend/src/components/dashboard-v2/HabitMaintenanceStrip.tsx

useDashboardV2Data doit:

- charger via l'API le runtime transformation active (cycle, transformation,
  plan, plan_items, metrics)
- ne JAMAIS lire current_phase
- ne JAMAIS lire user_actions ou user_framework_tracking comme source primaire

useDashboardV2Logic doit:

- grouper les items par dimension
- separer actifs vs pending vs maintenance
- calculer le prochain debloquage potentiel
- fournir les actions (complete item, log entry, etc.)

Utilise les types V2 de frontend/src/types/v2.ts. Mobile-first avec Tailwind.

```
**Output:** dashboard V2 complet
**Validation:** boucle Gemini (UX review) → Claude (code review)

Implementation realisee:

- `DashboardV2.tsx` cree et branche sur `/dashboard`; l'ancien dashboard reste accessible sur `/dashboard-legacy`
- `useDashboardV2Data.ts` charge le runtime V2 actif depuis `user_cycles`, `user_transformations`, `user_plans_v2`, `user_plan_items`, `user_plan_item_entries` et `user_metrics`
- `useDashboardV2Logic.ts` groupe les items par dimension, separe `active/pending/maintenance`, calcule le prochain debloquage a partir de `activation_condition` et fournit les mutations d'execution
- composants dedies crees: `StrategyHeader`, `NorthStarV2`, `DimensionSection`, `PlanItemCard`, `UnlockPreview`, `HabitMaintenanceStrip`
- l'ecriture de progression passe par `user_plan_item_entries` et les updates de `user_plan_items`; aucune lecture primaire de `current_phase`, `user_actions` ou `user_framework_tracking`
- `npm run build` passe localement; seul warning notable: Node 18.17.0 est sous la version recommandee par Vite 7

---

### Etape 5.2 — Ecrire le Plan Execution V2 Audit Guide ✅

**Modele:** Claude (Cursor)
**Pourquoi:** audit du lifecycle des items, logique metier

**Statut: FAIT**

Guide complet avec:
- lifecycle reel des `user_plan_items` (7 statuts, transitions canoniques)
- mecaniques de debloquage (4 types d'`activation_condition`, resolution `depends_on`)
- regle d'ancrage 3/5 des habitudes (quotidiennes et avec `scheduled_days`)
- detection des items zombies (actifs sans entry > 7 jours)
- caps de charge active (missions, habits, supports)
- entries d'execution (`entry_kind`, `difficulty_level`, `blocker_hint`)
- trace JSON (plan_items_snapshot, status_transitions, unlock_events, entries_timeline, zombie_candidates, load_timeline, metrics_snapshot)
- scorecard (completion_rate, unlock_trigger_rate, habit_anchoring_rate, support_effectiveness, alerts)
- checklist de verification (transitions, habitudes, charge, entries, weekly, supports, metrics)
- patterns de bugs (deblocage fantome, habitude eternellement building, surcharge silencieuse, entries sans contexte)
- leviers de tuning

Script d'export: `scripts/export_plan_execution_audit_bundle.mjs` — charge plan, items, entries, metrics et events V2 via Supabase REST API, reconstitue la timeline, detecte les zombies, calcule la scorecard. `node --check` passe localement.

**Output:** `docs/audit-v2/plan-execution-v2-audit-guide.md` + `scripts/export_plan_execution_audit_bundle.mjs`
**Validation:** `node --check` passe

---

## LOT 6A — RUNTIME FOUNDATIONS

### Hors scope de ce lot

- Proactive windows engine (V2.1)
- Repair mode formel (V2.1 — pause_consentie + posture conservative suffisent)
- Relation preferences (V2.1)
- Confidence gates comme moteur dedie (V2.0 = logique inline)

### Legacy neutralise par ce lot

- `supabase/functions/sophia-brain/state-manager.ts` : les helpers legacy lies a `user_actions / user_framework_tracking / user_vital_signs` ont ensuite ete retires completement lors du lot 8.3, apres migration des chemins runtime vers les sources V2.
- `supabase/functions/sophia-brain/momentum_state.ts` : la coexistence V1/V2 et la lazy migration ont ete supprimees au lot 8.3. Le runtime actif ne conserve plus que le chemin V2.

### Etape 6A.1 — Implementer l'active load engine

**Statut:** FAIT — `supabase/functions/sophia-brain/active_load_engine.ts` cree, `_shared/v2-runtime.ts` refactore pour deleguer le calcul, et `active_load_engine_test.ts` couvre 5 scenarios fixtures. **Post-audit:** la fonction pure `computeActiveLoad` a ete extraite dans `_shared/v2-active-load.ts` pour eliminer la dependance circulaire `_shared` → `sophia-brain`; `active_load_engine.ts` re-exporte pour compatibilite.

**Modele:** GPT (Codex)
**Pourquoi:** logique deterministe, pas besoin de LLM

**Prompt:**
```

Cree supabase/functions/sophia-brain/active_load_engine.ts.

Ce module exporte computeActiveLoad(planItems: UserPlanItemRow[]):

Logique:

- mission_slots_used = count items dimension=missions, status=active
- support_slots_used = count items dimension=support,
  support_mode=recommended_now
- habit_building_slots_used = count items dimension=habits,
  current_habit_state=active_building
- current_load_score = mission_slots_used * 3 + habit_building_slots_used * 2
  - support_slots_used * 1
- needs_reduce = current_load_score > 7 OU mission_slots_used > 2
- needs_consolidate = habit_building_slots_used > 2 ET au moins 1 habit a
  recent_traction = "poor"

Retourne un ActiveLoadResult conforme a MomentumStateV2.active_load.

Importe les types depuis _shared/v2-types.ts. Pas d'appel LLM. Pas d'appel base.
Pure fonction.

IMPORTANT — refacto depuis le Lot 2.1:

- _shared/v2-runtime.ts contient deja getActiveLoad() qui fait fetch DB + calcul
  inline. Au Lot 6A.1, refactorer getActiveLoad() pour deleguer le calcul a
  computeActiveLoad() au lieu de dupliquer la logique. getActiveLoad() devient:
  fetch plan_items + fetch entries → appel computeActiveLoad(planItems,
  entriesByItem).
- computeActiveLoad doit donc accepter les entries en parametre pour evaluer
  needs_consolidate (heuristique hasPoorRecentTraction).

Heuristique hasPoorRecentTraction (posee au Lot 2.1, a revisiter ici):

- "partial" compte comme signal positif (l'utilisateur a fait quelque chose)
- "support_feedback" est neutre (ni positif ni negatif)
- La traction est "poor" si negativeCount > positiveCount sur les 5 dernieres
  entries
- Pas de short-circuit agressif sur le dernier signal seul

```
**Output:** `active_load_engine.ts`
**Validation:** Claude review + tests unitaires sur 5 scenarios fixtures

---

### Etape 6A.2 — Refondre momentum_state.ts

**Statut:** FAIT — V2 ajoute dans `momentum_state.ts` (cle `__momentum_state_v2`, coexistence V1), avec 6 dimensions, assessment, posture, active_load, blockers, lazy migration V1→V2, router V2, watcher V2 (source plan_items), et 10 tests dans `momentum_state_v2_test.ts`. Correctif post-review integre: `plan_fit` evalue les zombies de maniere deterministe a partir de `nowIso`; un item `active` sans entry n'est considere zombie qu'apres >7 jours depuis `activated_at` (fallback `created_at`), pas immediatement.

**Modele:** Claude (Cursor)
**Pourquoi:** refactoring complexe d'un fichier existant de 1900+ lignes

**Prompt:**
```

Lis le fichier actuel supabase/functions/sophia-brain/momentum_state.ts et
docs/v2-technical-schema.md section 5.3 (MomentumStateV2).

Refonds momentum_state.ts pour V2:

1. Remplace le state shape V1 par MomentumStateV2
2. Garde les 6 etats publics existants
3. Ajoute les 6 dimensions internes: engagement, execution_traction,
   emotional_load, consent, plan_fit, load_balance
4. Ajoute l'assessment (top_blocker, top_risk, confidence)
5. Integre active_load (appel a active_load_engine)
6. Ajoute posture recommandee
7. Remplace les lectures de user_actions/frameworks par plan_items runtime
8. Garde la cle temp_memory __momentum_state_v2 (nouvelle cle, coexistence V1)
9. Ajoute lazy migration: si l'ancien format est lu, migre vers le nouveau

Respecte la regle: les etats publics restent peu nombreux, la richesse est dans
les sous-signaux.

```
**Output:** momentum_state.ts V2
**Validation:** tests sur les 6 etats publics avec fixtures plan_items

---

### Etape 6A.3 — Ecrire le Momentum V2 Audit Guide

**Statut:** FAIT — guide complet livre et script d'export aligne sur la fenetre auditée (`effective_at`, resolution du bon plan/cycle, scorecard calcule a `window.to`).

**Modele:** Claude (Cursor)
**Pourquoi:** refonte d'un guide existant, connaissance du nouveau momentum necessaire

**Prompt:**
```

Lis docs/momentum-audit-analysis-guide.md (guide V1) et
docs/audit-v2/momentum-v2-audit-guide.md (squelette V2).

Ecris le guide complet en:

1. Conservant tout ce qui est encore valide du V1
2. Adaptant pour les 6 dimensions V2 (ajouter plan_fit, load_balance)
3. Ajoutant l'active_load comme bloc auditable
4. Ajoutant la posture recommandee comme output auditable
5. Ajoutant la distinction "friction user vs plan mal dose"
6. Mettant a jour les patterns de bugs
7. Mettant a jour les leviers de tuning

Adapte aussi le script d'export existant
scripts/export_momentum_audit_bundle.mjs pour V2.

```
**Output:** guide complet + script d'export V2
**Validation:** `node --check` passe sur le script

**Resultat actuel:** Guide complet `docs/audit-v2/momentum-v2-audit-guide.md` (~330 lignes) couvrant les 6 dimensions V2, la distinction "friction user vs plan mal dose", l'active_load comme bloc auditable, la posture recommandee, 7 sections de checklist, patterns de bugs V1 herites + V2 nouveaux, et 10 leviers de tuning. Nouveau script `scripts/export_momentum_v2_audit_bundle.mjs` (~450 lignes) suivant le pattern V2 (requetes REST directes, scorecard locale) avec chargement des messages, snapshots V2, plan_items, entries, et calcul local du state_timeline, active_load_timeline, posture_timeline, scorecard avec alertes automatiques (oscillations, plan_fit_poor_ignored, load_overloaded_no_reduce, accused_user_while_plan_overloaded). Commande: `npm run momentum-v2:audit:export -- --user-id <uuid> --hours <N>`.

**Correctif de validation:** le script `scripts/export_momentum_v2_audit_bundle.mjs` a ete aligne sur le runtime V2 pour la temporalite. Les entries sont maintenant filtrees/reconstruites via `effective_at` (plus `created_at`) pour `last_entry_at`, les zombies et la timeline. Le contexte n'est plus pris depuis le cycle/plan actifs au moment de l'export: le script resolve d'abord le plan/cycle/transformation les plus plausibles pour la fenetre auditee (evidence snapshots + entries + overlap temporel des plans), puis charge les `plan_items` et les entries jusqu'a `window.to`. Le scorecard et le snapshot plan_items sont donc calcules "as of window end" au lieu de lire le runtime courant.

---

## LOT 6B — BILANS V2

### Hors scope de ce lot

- Weekly conversation digest comme module separe (V2.1 — le conversation_pulse couvre le besoin)
- Victory ledger (Lot 6C, pas 6B)

### Legacy neutralise par ce lot

- `supabase/functions/trigger-weekly-bilan/payload.ts` : supprimer les lectures `current_phase`, `current_phase_index`, `is_current_phase`. Le nouveau payload lit les plan_items et l'active_load.
- `supabase/functions/sophia-brain/agents/investigator-weekly/suggestions.ts` : les suggestions `activate/deactivate/swap` centrees actions sont remplacees par `hold/expand/consolidate/reduce` centrees dimensions. L'ancienne logique est supprimee dans le refacto.
- `supabase/functions/trigger-daily-bilan/index.ts` : l'ancienne logique qui lit les phases est remplacee par la logique V2 basee sur plan_items + momentum V2.

### Attention budget LLM

Le conversation_pulse est un nouvel appel LLM quotidien (Tier 2). Respecter la regle de freshness 12h. Si le cout s'avere trop eleve, le pulse peut devenir optionnel — le daily/weekly peuvent fonctionner avec momentum + entries seuls en mode degrade.

### Etape 6B.1 — Refondre trigger-daily-bilan ✅

**Modele:** GPT (Codex) pour l'implementation, Claude pour le prompt LLM
**Pourquoi:** la structure est mecanique, le prompt est sensible

**Prompt Claude (design du prompt daily):**
```

Ecris le prompt LLM (Tier 3 — modele rapide) pour le daily bilan V2.

Entrees:

- items actifs avec dimension, kind, status, derniere entry, difficulte recente
- momentum_state_v2 resume (state, posture, emotional_load)
- optionnel: conversation_pulse resume

Sortie attendue: DailyBilanOutput conforme au technical schema (mode,
target_items, prompt_shape, expected_capture, next_actions)

Le prompt doit:

- choisir 1 item cible par defaut (2 max)
- choisir le bon mode (check_light si tout va, check_blocker si friction
  repetee, etc.)
- ne jamais produire plus de 3 questions
- preferer check_light dans 60% des cas

Alternative: concevoir une logique deterministe qui couvre 80% des cas sans
appel LLM, et ne recourir au LLM que pour les cas ambigus.

```
**Prompt GPT (implementation):**
```

Refonds supabase/functions/trigger-daily-bilan/index.ts pour V2.

La fonction doit:

1. Charger le runtime V2 (plan_items, momentum_state_v2)
2. Decider le mode du daily (logique deterministe ou LLM Tier 3)
3. Choisir les items cibles
4. Produire un DailyBilanOutput
5. Materialiser le checkin correspondant dans scheduled_checkins
6. Loguer daily_bilan_decided_v2

Ne plus lire:

- current_phase
- user_actions / user_framework_tracking comme source primaire
- phases du plan

```
**Output:** daily bilan V2
**Validation:** Claude review + test sur 5 scenarios (momentum, friction, blocker, progress, silence)

---

### Etape 6B.2 — Refondre trigger-weekly-bilan ✅

**Pourquoi ce lot est sensible:** le weekly bilan est le seul systeme qui modifie la charge active du user (activer/desactiver/maintenance des plan_items). Une mauvaise decision degrade directement l'experience. Le lot est donc scinde en deux sous-etapes avec des responsabilites claires.

#### 6B.2a — Prompt LLM + Validator + Materializer (Claude / Cursor)

**Modele:** Claude (Cursor)
**Pourquoi Claude:** le prompt de recalibrage est l'appel LLM le plus impactant du systeme. Les invariants de validation et la logique de materialisation sont des regles metier sensibles qui necessitent du jugement, pas du wiring mecanique.

**Fichiers produits:**
- `supabase/functions/_shared/v2-prompts/weekly-recalibrage.ts` — prompt systeme Tier 2
- `supabase/functions/_shared/v2-weekly-bilan-engine.ts` — validator + materializer
- `supabase/functions/_shared/v2-weekly-bilan-engine_test.ts` — tests

**Scope detaille:**

1. **Definir `WeeklyBilanV2Input`** — le contrat d'entree du LLM:
   - items snapshot (id, title, dimension, kind, status, active_load entries de la semaine, difficulte, blockers)
   - momentum_state_v2 resume (state, posture, emotional_load, consent_level)
   - conversation_pulse resume (optionnel, si fresh < 12h)
   - victories de la semaine (items avec strong_progress)
   - blockers recurrents (items avec repeated_blocker)

2. **Ecrire le prompt systeme Tier 2** (`weekly-recalibrage.ts`):
   - Role: coach de recalibrage hebdomadaire
   - Input: `WeeklyBilanV2Input` serialise
   - Output attendu: `WeeklyBilanOutput` conforme au technical schema
   - Consignes dans le prompt:
     - celebrer sobrement les victoires AVANT de corriger
     - decision = hold (defaut si rien ne pousse a changer) | expand | consolidate | reduce
     - max 3 `load_adjustments`
     - `coaching_note` optionnelle, 1-2 phrases max, ton Sophia
     - `suggested_posture_next_week` obligatoire

3. **Ecrire le validator** (dans `v2-weekly-bilan-engine.ts`):
   - Parse et valide la sortie LLM en `WeeklyBilanOutput`
   - Invariants a enforcer:
     - si `decision === "reduce"` → aucun adjustment de type `"activate"` autorise
     - si `decision === "expand"` → au moins un signal de traction solide dans l'input (item avec >=60% completion ou strong_progress)
     - `load_adjustments.length <= 3`
     - chaque `target_item_id` doit exister dans les items du snapshot input
     - pas de doublon de `target_item_id` dans les adjustments
   - Si un invariant echoue: fallback a `{ decision: "hold", load_adjustments: [], reasoning: "invariant violation — hold by default" }`

4. **Ecrire le materializer** (dans `v2-weekly-bilan-engine.ts`):
   - `materializeWeeklyAdjustments(supabase, planId, adjustments)` — pur side-effect
   - Mapping:
     - `activate` → update plan_item status = `"active"`, `recommended_at = now`
     - `deactivate` → update plan_item status = `"paused"`, `paused_at = now`
     - `maintenance` → update plan_item status = `"in_maintenance"`
     - `replace` → deactivate l'ancien + activate le nouveau (2 ops)
   - Retourne `{ applied: number, skipped: number, errors: string[] }`
   - Chaque update est idempotent (skip si deja dans le bon status)

5. **Tests** (`v2-weekly-bilan-engine_test.ts`):
   - Validator: reduce + activate → rejection, expand sans traction → rejection, hold valide, item_id inexistant → rejection
   - Materializer: activate idempotent, deactivate, maintenance, replace (2 ops)

**Output:** prompt + engine (validator + materializer) + tests
**Validation:** `deno fmt && deno check && deno test` — tous les tests passent

---

#### 6B.2b — Payload Assembly + Trigger Refactoring (GPT / Codex)

**Modele:** GPT (Codex)
**Pourquoi GPT:** l'assemblage du payload et le rewiring du trigger suivent exactement le meme pattern mecanique que 6B.1 (charger runtime V2 → gating → appeler le decider → inserer scheduled_checkins → loguer event). Pas de jugement metier requis.

**Fichiers concernes:**
- `supabase/functions/trigger-weekly-bilan/v2_weekly_bilan.ts` (nouveau) — helper d'assemblage
- `supabase/functions/trigger-weekly-bilan/v2_weekly_bilan_test.ts` (nouveau) — tests
- `supabase/functions/trigger-weekly-bilan/index.ts` (refacto)
- `supabase/functions/process-checkins/index.ts` (ajustement mineur)
- `supabase/functions/whatsapp-webhook/handlers_pending.ts` (ajustement mineur)

**Scope detaille:**

1. **Creer `v2_weekly_bilan.ts`** — helper d'assemblage:
   - `assembleWeeklyBilanV2Input(runtime, planItems, momentum, pulse?)` → `WeeklyBilanV2Input`
   - Charge les entries de la semaine pour chaque item actif
   - Identifie les victories (items avec >=60% completion ou entries positives)
   - Identifie les blockers recurrents (items avec >=2 entries blocker)
   - `buildWeeklyBilanV2DraftMessage(output: WeeklyBilanOutput)` → message FR pour scheduled_checkins
   - `buildWeeklyBilanV2MessagePayload(...)` → message_payload pour scheduled_checkins

2. **Refactorer `trigger-weekly-bilan/index.ts`**:
   - Meme pattern que le daily V2 refactore (cf. 6B.1):
     - Charger `ActiveTransformationRuntime` via `v2-runtime.ts`
     - Si pas de runtime V2 actif → skip
     - Verifier `hasWeeklyBilanScheduledForLocalWeek` (dedup)
     - Charger `PlanItemRuntime[]` + `ConversationPulse` (freshness 12h) + `MomentumStateV2`
     - Appeler `assembleWeeklyBilanV2Input`
     - Appeler le LLM Tier 2 avec le prompt de `weekly-recalibrage.ts`
     - Valider avec le validator de `v2-weekly-bilan-engine.ts`
     - Materialiser avec le materializer
     - Inserer dans `scheduled_checkins` (origin: `"rendez_vous"`, event_context: `"weekly_bilan_v2"`)
     - Loguer `weekly_bilan_decided_v2` + `weekly_bilan_completed_v2`
   - Ne plus lire: `current_phase`, `user_actions`, `user_framework_tracking`, phases du plan
   - Supprimer les imports legacy (`WeeklyPlanActionSnapshot`, `ActionWeekSummary`, etc.)

3. **Adapter `process-checkins/index.ts`**:
   - `isWeeklyBilanCheckin` doit reconnaitre `event_context === "weekly_bilan_v2"`

4. **Adapter `handlers_pending.ts`**:
   - Les reponses "oui"/"plus tard" doivent matcher les checkins `weekly_bilan_v2`

5. **Event logging**:
   - `weekly_bilan_decided_v2`: decision, adjustment_count, posture, reasoning
   - `weekly_bilan_completed_v2`: applied, skipped, errors (apres materialisation)

**Dependance:** 6B.2a doit etre termine AVANT de lancer 6B.2b (GPT a besoin du prompt, du validator et du materializer comme dependances).

**Output:** payload builder + trigger refactore + adaptations aval
**Validation:** Claude review + `deno fmt && deno check && deno test` sur les scenarios: user motive, friction, surcharge, semaine vide, reprise

---

### Etape 6B.3 — Implementer conversation_pulse ✅

**Modele:** Claude (Cursor) pour le prompt, GPT pour le module
**Pourquoi:** le pulse est un nouvel appel LLM, le prompt doit etre precis

### Etape 6B.3a
**Prompt Claude (design prompt):**
```

Ecris le prompt LLM (Tier 2) pour generer un ConversationPulse.

Entrees: les messages des 7 derniers jours (user + assistant), les bilans
recents, les event memories.

Sortie: ConversationPulse conforme au technical schema section 5.2.

Contraintes:

- max 1 tonalite dominante
- max 3 wins, 3 friction_points
- max 1 likely_need
- max 1 upcoming_event
- doit rester court et actionnable
- ne doit PAS devenir un resume exhaustif

```
### Etape 6B.3b
**Prompt GPT (implementation):**
```

Cree supabase/functions/sophia-brain/conversation_pulse_builder.ts.

Ce module:

1. Charge les messages recents (7 jours) pour le user
2. Charge les daily/weekly recents
3. Charge les event memories proches
4. Appelle le LLM avec le prompt de conversation pulse
5. Parse et valide le ConversationPulse
6. Stocke le snapshot dans system_runtime_snapshots
7. Logue conversation_pulse_generated_v2
8. Retourne le pulse

Regle de freshness: si un pulse de moins de 12h existe, le retourner sans
regenerer.

```
**Output:** conversation_pulse_builder.ts
**Validation:** test avec conversations fixtures reelles (bundles existants dans tmp/)

---

### Etape 6B.4 — Adapter le retrieval memoire par intention ✅

**Modele:** Claude (Cursor) pour l'architecture, GPT pour l'implementation
**Pourquoi:** refactoring du dispatcher et du loader, decisions d'architecture memoire

#### 6B.4a — Architecture contracts + scope classifier + adapter (Claude / Cursor) ✅

**Fichier cree:** `supabase/functions/_shared/v2-memory-retrieval.ts` (+ tests)
**26 tests passent.**

Ce module pur (pas de DB) definit:

1. **5 contrats canoniques** (`V2_MEMORY_CONTRACTS`) — un par `MemoryRetrievalIntent`:
   - `answer_user_now` → 6 couches, budget full, 4000 tokens
   - `nudge_decision` → 4 couches (execution/relational/event/coaching), budget light, 1200 tokens
   - `daily_bilan` → 3 couches (execution/coaching/event), budget minimal, 600 tokens
   - `weekly_bilan` → 5 couches (sans relational), budget medium, 2500 tokens
   - `rendez_vous_or_outreach` → 3 couches (event/relational/execution), budget light, 1000 tokens

2. **Layer → table mapping** (`LAYER_SOURCES`) — pour chaque couche V2, les tables V1 et filtres:
   - `cycle` → `user_global_memories` scope=cycle, filter cycle_id
   - `transformation` → `user_global_memories` scope=transformation, filter cycle+transformation
   - `execution` → `user_topic_memories`, filter transformation_id
   - `coaching` → `user_chat_states` (coaching history existant)
   - `relational` → `user_core_identity` + `user_global_memories` scope=relational
   - `event` → `user_event_memories`

3. **Scope classifier** (`classifyMemoryScope()`) — determine a quelle couche un fait persiste:
   - Priorite: flags explicites > category_hint > keywords > references_plan_item > default
   - Default = `transformation` (le plus frequent)
   - Keywords relational: prefere, pression, tutoiement, etc.
   - Keywords cycle: north star, etoile polaire, objectif global, etc.

4. **Retrieval plan resolver** (`resolveV2RetrievalPlan()`) — transforme un intent en plan concret:
   - `load_global_memories`, `load_topic_memories`, `load_event_memories`, etc.
   - `global_scope_filter` = quels scopes filtrer dans `user_global_memories`
   - `topic_filter_transformation` = si topic_memory filtre par transformation_id
   - `budget` = caps par type de memoire (global_max, topic_max, event_max, identity_max)

5. **Event payload builders** — pour `memory_retrieval_executed_v2` et `memory_persisted_v2`

**Decision d'architecture cle:** les V2 intents ne remplacent PAS le `memory_plan` du dispatcher.
- En contexte conversationnel (`answer_user_now`), le dispatcher produit toujours un `memory_plan` detaille. Le V2 contract sert de guardrail/budget cap.
- En contexte non-conversationnel (bilans, nudges), le V2 contract est utilise directement puisque ces flows ne passent pas par le dispatcher.

#### 6B.4b — Wiring loader + memory modules + memorizer (GPT / Codex)

**Scope GPT:** implementation mecanique du wiring en se basant sur l'architecture 6B.4a.
```

Lis supabase/functions/_shared/v2-memory-retrieval.ts (architecture Claude).

Implemente:

1. LOADER (sophia-brain/context/loader.ts):
   - Ajouter un param optionnel `v2Intent?: MemoryRetrievalIntent` a
     ContextLoaderOptions
   - Quand v2Intent est present et mode != "companion":
     - appeler resolveV2RetrievalPlan(v2Intent)
     - utiliser le plan V2 a la place de deriveDispatcherMemoryLoadStrategy()
     - respecter le budget du plan (global_max, topic_max, event_max)
   - Quand mode == "companion" et v2Intent == "answer_user_now":
     - garder le memory_plan du dispatcher comme primaire
     - utiliser le budget V2 comme cap maximum
   - Logger memory_retrieval_executed_v2 via buildRetrievalExecutedPayload()

2. MEMORY MODULES (global_memory.ts, topic_memory.ts):
   - Ajouter des params optionnels aux fonctions de retrieval:
     - retrieveGlobalMemories: + scope?: MemoryLayerScope[], cycle_id?,
       transformation_id?
     - retrieveTopicMemories: + transformation_id?
   - Quand ces params sont fournis, ajouter les filtres SQL correspondants
   - Ne PAS casser les appels existants (params optionnels)

3. MEMORIZER (topic_memory.ts section persistence):
   - Quand le memorizer persiste un fait (upsertGlobalMemoryCandidate, etc.):
     - appeler classifyMemoryScope() pour determiner le scope
     - passer le scope au upsert (ajouter le champ scope au payload)
   - Logger memory_persisted_v2 via buildPersistedPayload()
   - Le scope tagging n'est applique que si cycle_id ou transformation_id sont
     disponibles dans le contexte (backward compatible)

4. DISPATCHER (sophia-brain/router/dispatcher.ts):
   - NE PAS modifier le dispatcher. L'intention V2 est determinee par le CALLER,
     pas par le dispatcher:
     - sophia-brain main loop → "answer_user_now"
     - trigger-daily-bilan → "daily_bilan"
     - trigger-weekly-bilan → "weekly_bilan"
     - nudge engine → "nudge_decision"
     - rendez-vous engine → "rendez_vous_or_outreach"

Invariants:

- Backward compatible: tous les appels existants sans v2Intent continuent de
  fonctionner
- Les tables ne changent pas de schema (scope est deja un champ existant sur
  global_memories)
- Si scope/cycle_id/transformation_id ne sont pas disponibles, ne pas filtrer

```
**Output:** retrieval par intention operant
**Validation:** Claude review + test avec les 5 intentions

---

### Etape 6B.5 — Ecrire les guides d'audit Memory V2 + Daily/Weekly V2 + Conversation Pulse V2 ✅

**Modele:** Claude (Cursor)
**Pourquoi:** 3 guides a completer dans le meme lot, besoin de coherence

**Fichiers completes:**

- `docs/audit-v2/memory-v2-audit-guide.md` — guide complet (9 sections, refonte du guide V1 pour les 6 couches, tagging scope, retrieval par intention, contrats de budget tokens)
- `docs/audit-v2/daily-weekly-v2-audit-guide.md` — guide complet (9 sections, chaine decision → ajustements → outcomes, modes daily, decisions weekly hold/expand/consolidate/reduce)
- `docs/audit-v2/conversation-pulse-v2-audit-guide.md` — guide complet (9 sections, generation → freshness → usage downstream, coherence avec momentum)

**Scripts d'export crees:**

- `scripts/export_memory_v2_audit_bundle.mjs` → `npm run memory-v2:audit:export`
- `scripts/export_bilans_v2_audit_bundle.mjs` → `npm run bilans-v2:audit:export`
- `scripts/export_conversation_pulse_v2_audit_bundle.mjs` → `npm run pulse-v2:audit:export`

Chaque script suit le pattern du momentum V2 (REST direct sur Supabase, JSON + transcript, scorecard calculee localement).

**Output:** 3 guides complets + 3 scripts d'export + npm scripts dans package.json

---

## LOT 6C — COACHING + PROACTIVE V2

### Hors scope de ce lot

- Proactive windows engine formel (V2.1 — morning nudge V2 ameliore suffit)
- Cooldown engine formel (V2.0 = regles hardcodees)
- Rendez-vous table (V2.1 — enrichissement scheduled_checkins suffit)

### Legacy neutralise par ce lot

- `supabase/functions/sophia-brain/coaching_intervention_selector.ts` : refacto in-place, les anciennes lectures par action/framework sont remplacees par plan_item dimension+kind. Pas de coexistence, le selecteur est adapte directement.
- `supabase/functions/sophia-brain/momentum_morning_nudge.ts` : refacto in-place, la logique V1 (liste d'items mecaniques) est remplacee par la cascade skip_or_speak → posture. Pas de coexistence.
- `supabase/functions/sophia-brain/momentum_outreach.ts` : adaptation pour lire le momentum V2 et les plan_items au lieu des anciennes entites.

### Etape 6C.1 — Adapter coaching_intervention_selector.ts

**Statut:** FAIT — le selecteur V2 est branche au runtime reel. `router/run.ts` lui injecte `v2_momentum` et un `target_plan_item` resolu depuis le plan actif. La surcharge conclut maintenant sur `simplify` sans technique residuelle, et le contexte `dimension + kind` est exploite dans la strategie.

**Modele:** Claude (Cursor)
**Pourquoi:** refactoring d'un fichier existant, decisions d'architecture

**Prompt:**
```

Lis supabase/functions/sophia-brain/coaching_intervention_selector.ts.

Adapte-le pour V2:

1. Lire le blocage depuis plan_items (dimension + kind) au lieu de
   user_actions/frameworks
2. Adapter la reponse selon le type d'item bloque:
   - mission: clarifier, reduire, pre-engager, decouper
   - habitude: reduire friction, soutenir repetition, proteger opportunite
   - support: verifier utilite, timing, mode d'acces
3. Garder le registre de techniques existant
4. Garder le tracking utile/inutile
5. Ajouter la distinction micro-coaching / structural coaching
6. Integrer plan_fit et load_balance dans la decision (si surcharge, conclure
   "simplify" plutot qu'une technique)

```
**Output:** coaching_intervention_selector.ts V2
**Validation:** test sur 3 types de blocage (mission, habit, support)

---

### Etape 6C.2 — Refondre morning nudge

#### 6C.2a — Cascade logic + posture selection (Claude / Cursor)

**Statut:** FAIT — la logique pure V2 est en place dans `momentum_morning_nudge.ts`, avec 7 postures, cooldown de posture, budget hebdo et cooldown same-item.

**Modele:** Claude (Cursor)
**Pourquoi:** la logique de selection de posture est sensible — elle decide si Sophia parle ou non, et avec quel ton. Ce sont des decisions d'architecture de coaching, pas du wiring mecanique.

**Fichiers concernes:**
- `supabase/functions/sophia-brain/momentum_morning_nudge.ts` (refacto in-place)

**Prompt:**
```

Lis supabase/functions/sophia-brain/momentum_morning_nudge.ts (V1 actuel).

Refonds-le pour V2 en suivant cette cascade:

1. skip_or_speak: decider si un nudge est pertinent ce matin. Criteres de skip:
   - pause_consentie → skip toujours
   - budget proactif depasse (max 1 notable/jour) → skip
   - meme posture utilisee 2 fois consecutivement sans reaction → skip
   - aucun angle pertinent detecte → skip

2. if speak → choose posture parmi les 7 postures V2:
   - protective_pause: charge emotionnelle haute, ne pas ajouter de charge
   - support_softly: soutien_emotionnel ou signaux emotionnels recents
   - pre_event_grounding: evenement proche detecte
     (conversation_pulse.signals.upcoming_event)
   - open_door: reactivation — porte ouverte sans pression
   - simplify_today: friction_legere ou surcharge legere — viser une version
     minimale
   - focus_today: momentum — elan concret sur les items du jour
   - celebration_ping: victoire recente ou ancrage confirme — renforcer

3. validate cooldown + confidence: Cooldowns V2.0 (hardcodes, pas de table):
   - meme posture: 48h sans reaction user
   - meme item rappele: 72h Si cooldown viole → fallback a une posture adjacente
     ou skip

4. if validated → produire la structure de nudge (instruction, fallback_text,
   event_grounding) Le contenu genere par LLM sera fait par GPT en 6C.2b.

Inputs V2 a lire:

- MomentumStateV2 (readMomentumStateV2): current_state, dimensions, active_load,
  posture, blockers, assessment
- conversation_pulse (optionnel, depuis system_runtime_snapshots si frais <12h)
- plan_items du jour (filtre par scheduled_days = jour courant)
- dernier nudge envoye (type + date) depuis scheduled_checkins
- reponse user au dernier nudge (oui/non/silence) depuis chat_messages ou
  process-checkins

Regles:

- Ne jamais lire user_actions, user_vital_signs ou user_framework_tracking comme
  source primaire
- Lire les plan_items et plan_item_entries via v2-runtime.ts
- Le type MomentumMorningStrategy V1 est remplace par MorningNudgePosture
  (v2-types.ts)
- Garder la structure MomentumMorningPlan mais adapter les champs

Tests (7 scenarios, 1 par posture):

- soutien_emotionnel → protective_pause ou support_softly
- reactivation + silence 3j → open_door
- friction_legere + bloquer sur item du jour → simplify_today
- momentum + items scheduled today → focus_today
- upcoming_event dans conversation_pulse → pre_event_grounding
- victoire recente confirmee → celebration_ping
- pause_consentie → skip

```
**Output:** `momentum_morning_nudge.ts` V2 (logique pure, pas d'appel LLM) + tests
**Validation:** `deno fmt && deno check && deno test` — 7 scenarios passent

---

#### 6C.2b — V2 wiring + outreach adaptation (GPT / Codex)

**Statut:** FAIT — wiring runtime termine. Le scheduler cree des `scheduled_checkins` en `morning_nudge_v2`, `process-checkins` resolve le plan V2 et genere le message au moment d'envoi, `momentum_outreach.ts` lit `momentum_state_v2` + `plan_items`, et le watcher annule aussi les contexts morning V2.

**Modele:** GPT (Codex)
**Pourquoi GPT:** l'assemblage du payload, le chargement des donnees runtime V2, l'appel LLM pour la generation du message, et l'adaptation de `momentum_outreach.ts` suivent un pattern mecanique deja vu dans 6B.1/6B.2b. Pas de jugement metier requis.

**Dependance:** 6C.2a doit etre termine AVANT de lancer 6C.2b (GPT a besoin de la cascade et des types poses par Claude).

**Fichiers concernes:**
- `supabase/functions/sophia-brain/momentum_morning_nudge.ts` (wiring runtime)
- `supabase/functions/sophia-brain/momentum_outreach.ts` (adaptation V2)
- `supabase/functions/process-checkins/index.ts` (generation et logging a l'envoi)
- `supabase/functions/schedule-whatsapp-v2-checkins/index.ts` (creation des `scheduled_checkins` V2)
- `supabase/functions/sophia-brain/agents/watcher.ts` (annulation des contexts morning legacy + V2)

**Scope detaille:**

1. **Wiring runtime dans `momentum_morning_nudge.ts` + rail d'envoi:**
   - Charger `MomentumStateV2` via `readMomentumStateV2(tempMemory)`
   - Charger les plan_items du jour (via `getPlanItemRuntime` + filtre `scheduled_days`)
   - Charger le `ConversationPulse` frais (< 12h) depuis `system_runtime_snapshots`
   - Charger le dernier nudge envoye depuis `scheduled_checkins` (event_context contient `morning`)
   - Injecter tout dans la cascade conçue par Claude en 6C.2a
   - Persister dans `scheduled_checkins` avec `event_context = "morning_nudge_v2"`
   - Au moment d'envoi, `process-checkins` genere le message one-idea via appel LLM (Tier 3) a partir de l'instruction + du grounding V2 stocke dans `message_payload`

2. **Adapter `momentum_outreach.ts`:**
   - Remplacer `readMomentumState` par `readMomentumStateV2`
   - Lire les `plan_items` au lieu de `user_actions` / `user_framework_tracking`
   - Adapter les strategies de outreach pour utiliser les dimensions V2 (plan_fit, load_balance)
   - Garder les event_context existants pour la compatibilite avec `process-checkins`

3. **Cooldown tracking:**
   - Lire le dernier `scheduled_checkins` avec `event_context LIKE 'morning_nudge%'`
   - Extraire la posture utilisee et la date
   - Verifier la reponse user (check_in repondu ou silence)
   - Passer les infos au moteur de cooldown de 6C.2a

4. **Event logging:**
   - `process-checkins` logue la decision morning V2, la generation du message, la posture, le `confidence`, les `plan_item_titles_targeted` et les infos de cooldown utiles au suivi

**Output:** wiring complet + outreach adapte
**Validation:** Claude review + `deno fmt && deno check && deno test`

---

### Etape 6C.3 — Ecrire les guides d'audit Coaching V2 + Proactive V2 ✅

**Statut:** FAIT — guides et scripts d'export livres puis corriges pour coller au runtime reel. Les bundles exploitent les endpoints canoniques de trace/scorecard deja existants, plus les `scheduled_checkins` et snapshots reelement disponibles, au lieu de dependre d'events V2 dedies non emis.

**Modele:** Claude (Cursor)
**Pourquoi:** refonte du guide coaching V1 + nouveau guide proactive

**Prompt:**
```

Lis les squelettes dans docs/audit-v2/:

- coaching-v2-audit-guide.md
- proactive-v2-audit-guide.md

Et le guide V1 de reference:

- docs/coaching-intervention-audit-analysis-guide.md

Complete les 2 guides:

Pour Coaching V2:

- adapter le guide V1 pour dimension-aware (mission vs habit vs support)
- ajouter la distinction micro-coaching / structural coaching
- ajouter la conclusion "simplify" comme outcome auditable
- ajouter l'integration plan_fit et load_balance
- adapter le script d'export existant (npm run coaching:audit:export)

Pour Proactive V2:

- documenter la cascade skip_or_speak → posture → cooldown → budget → generation
- documenter les 7 postures et leurs conditions
- documenter les cooldowns hardcodes V2.0
- creer un script d'export

```
**Output:** 2 guides complets + `scripts/export_coaching_v2_audit_bundle.mjs` + `scripts/export_proactive_v2_audit_bundle.mjs`
**Validation:** `node --check` sur les 2 scripts + verification de coherence avec `router/run.ts`, `process-checkins/index.ts`, `momentum_morning_nudge.ts` et les endpoints canoniques de trace/scorecard

---

## LOT 7 — ADAPTATION DISPATCHER V2

Le dispatcher est le point d'entree analytique de chaque turn: il recoit le message utilisateur, produit des signaux structures, et oriente toute la suite (routing, contexte, tracking). Apres les Lots 1-6C, le runtime V2 est en place mais le dispatcher alimente encore plusieurs flux a partir de sources V1. Ce lot adapte le dispatcher et ses consommateurs pour que tout le pipeline soit coherent avec le modele V2.

### Etape 7.1 — Snapshot plan items V2 pour le dispatcher

**Statut:** FAIT — le dispatcher consomme un snapshot V2 `plan_item_snapshot` construit depuis `getPlanItemRuntime`, avec test explicite sur l'injection dans le prompt et validation locale reproductible sans `--allow-env`.

**Modele:** GPT (Codex)
**Pourquoi:** remplacement d'une source de donnees legacy critique pour le dispatcher

**Contexte du probleme:**
`run.ts` (L1244-1253) appelle `getDispatcherActionSnapshot` depuis `state-manager.ts` qui lit les `user_actions` V1. Ce snapshot est passe au prompt du dispatcher via `dispatcher_flow.ts`. Le dispatcher raisonne donc sur des actions V1 alors que le plan de l'utilisateur est en V2 (`user_plan_items`).

**Prompt:**
```

Lis:

- supabase/functions/sophia-brain/router/run.ts (section
  getDispatcherActionSnapshot)
- supabase/functions/sophia-brain/router/dispatcher_flow.ts (section
  buildDispatcherInput)
- supabase/functions/sophia-brain/router/dispatcher.ts (interface
  DispatcherInputV2, section TOOLS_SIGNALS)
- supabase/functions/_shared/v2-runtime.ts (getPlanItemRuntime)

Cree une fonction buildV2PlanItemSnapshot(supabase, userId, cycleId) qui:

- appelle getPlanItemRuntime pour recuperer les plan_items actifs du cycle
  courant
- formate un snapshot compact: pour chaque item, retourne { id, title,
  dimension, item_type, status, streak_current, last_entry_at,
  active_load_score? }
- le format doit etre lisible dans un prompt LLM (~100 tokens par item max)

Puis:

- dans run.ts, remplace l'appel a getDispatcherActionSnapshot par
  buildV2PlanItemSnapshot
- dans dispatcher_flow.ts, passe le nouveau snapshot au lieu de actionSnapshot
- dans dispatcher.ts, mets a jour le type DispatcherInputV2 pour accepter
  plan_item_snapshot au lieu de action_snapshot
- adapte le prompt TOOLS_SIGNALS_SECTION pour que le LLM reference les
  plan_items (id + title) au lieu des actions V1 dans target_hint

Tests: adapter les tests existants dans run_test.ts si necessaire.

```
**Output:** `buildV2PlanItemSnapshot` + adaptation du pipeline dispatcher
**Validation:** `deno test router/run_test.ts` + verification que le dispatcher recoit bien les plan_items V2

---

### Etape 7.2 — Nettoyer le prompt dispatcher: supprimer les signaux V1 superflus

**Statut:** FAIT — les signaux CRUD V1 et le tracking vital signs legacy ont ete retires du prompt runtime; les signaux canoniques sont maintenant `plan_item_discussion`, `plan_feedback`, `track_progress_plan_item` et `track_progress_north_star`.

**Modele:** GPT (Codex)
**Pourquoi:** le prompt dispatcher contient ~800-1000 tokens de signaux CRUD V1 inutiles en V2

**Contexte du probleme:**
Le prompt du dispatcher (`dispatcher.ts`, sections PLAN_SIGNALS et TOOLS_SIGNALS) demande au LLM de detecter des intentions CRUD utilisateur (`create_action`, `update_action`, `breakdown_action`, `activate_action`, `delete_action`, `deactivate_action`). En V2, le plan est genere par le LLM via `crystallize-v2` et n'est pas manipule manuellement par l'utilisateur. Ces signaux ne sont plus pertinents et gonflent le prompt inutilement.

De meme, `track_progress_vital_sign` est superflu car les vital signs V1 n'existent plus en V2.

**Prompt:**
```

Lis:

- supabase/functions/sophia-brain/router/dispatcher.ts (tout le fichier, focus
  sur les sections prompt)
- supabase/functions/sophia-brain/router/run.ts (sections qui consomment les
  signaux dispatcher: extractDashboardRedirectIntents,
  detectHighMissedStreakBreakdownCandidate, handleCrudActions,
  maybeTrackProgressParallel)

Modifications du prompt dispatcher:

1. PLAN_SIGNALS_SECTION:
   - supprimer create_action, update_action, breakdown_action, activate_action,
     delete_action, deactivate_action
   - garder action_discussion (renommer en plan_item_discussion)
   - ajouter un signal plan_feedback: { sentiment:
     "positive"|"negative"|"neutral", target_item_id?: string, detail?: string }
     pour capter le feedback utilisateur sur ses plan_items (ex: "cette habitude
     est trop dure", "j'ai bien avance sur mon projet")

2. TOOLS_SIGNALS_SECTION:
   - supprimer track_progress_vital_sign
   - renommer track_progress_action en track_progress_plan_item
   - adapter les regles de target_hint pour referencer plan_item.id au lieu de
     action.id
   - garder track_progress_north_star (sera reconnecte a user_metrics en 7.4)

3. MOTHER_SIGNALS_SECTION:
   - simplifier dashboard_redirect_intents pour V2 (les surfaces sont
     differentes)
   - verifier que checkup_intent est encore utile (les bilans sont cron-driven
     en V2, mais l'utilisateur peut quand meme demander un bilan → garder avec
     note)

4. Mettre a jour DispatcherSignals et les parsers correspondants.

5. Dans run.ts, adapter les fonctions consommatrices:
   - extractDashboardRedirectIntents → adapter aux nouvelles surfaces V2
   - supprimer ou adapter detectHighMissedStreakBreakdownCandidate (utilise
     investigation_state.pending_items V1)
   - adapter handleCrudActions → handlePlanItemFeedback (traite plan_feedback)
   - renommer les references internes

Ne casse pas la compatibilite: si un signal renomme est consomme ailleurs, grep
pour retrouver tous les consommateurs et adapter.

```
**Output:** prompt dispatcher allege + signaux V2 coherents
**Validation:** `deno test router/run_test.ts` + verification manuelle que le prompt est ~800 tokens plus court

---

### Etape 7.3 — Adapter le tracking parallele a V2

**Statut:** FAIT — le tracking parallele ecrit en V2 (`user_plan_item_entries`, `user_metrics`) et emet `plan_item_entry_logged_v2` / `metric_recorded_v2`, tout en gardant `Promise.allSettled`.

**Modele:** GPT (Codex)
**Pourquoi:** le tracking ecrit dans les tables V1, il faut rediriger vers V2

**Contexte du probleme:**
`maybeTrackProgressParallel` (run.ts L617-746) appelle `handleTracking` et `updateEtoilePolaire` qui ecrivent dans `user_action_entries` (V1) et `user_north_stars` (V1). En V2, les entrees de progression vont dans `user_plan_item_entries` et la North Star dans `user_metrics`.

**Prompt:**
```

Lis:

- supabase/functions/sophia-brain/router/run.ts (maybeTrackProgressParallel,
  handleTracking, updateEtoilePolaire)
- supabase/functions/_shared/v2-runtime.ts (getPlanItemRuntime)
- supabase/functions/_shared/v2-types.ts (PlanItemEntry, UserMetric)

Adapte maybeTrackProgressParallel:

1. handleTracking:
   - au lieu d'ecrire dans user_action_entries, ecrire dans
     user_plan_item_entries
   - utiliser le plan_item_id (venant du signal
     track_progress_plan_item.target_hint) au lieu de action_id
   - le format d'entree: { plan_item_id, value, note?, logged_at }
   - emettre l'event V2 correspondant (v2:plan_item:entry_logged)

2. updateEtoilePolaire:
   - au lieu d'ecrire dans user_north_stars, ecrire dans user_metrics
   - mapper le format: { user_id, cycle_id, metric_key: "north_star", value,
     recorded_at }
   - emettre l'event V2 (v2:metric:recorded)

3. Garder le pattern parallel (Promise.allSettled) pour ne pas bloquer le turn.

Tests: ecrire des tests unitaires pour les nouvelles fonctions de tracking.

```
**Output:** tracking V2 operationnel
**Validation:** `deno test` + verification que les events V2 sont emis

---

### Etape 7.4 — Migrer les loaders de contexte vers les sources V2

**Statut:** FAIT — les blocs de contexte cibles lisent maintenant les sources V2 reelles (`getPlanItemRuntime`, `user_metrics`, `system_runtime_snapshots`) et les addons dashboard decrivent les surfaces V2.

**Modele:** GPT (Codex)
**Pourquoi:** le context loader alimente le prompt agent avec des donnees V1 dans plusieurs blocs

**Contexte du probleme:**
Dans `context/loader.ts`:
- `loadActionIndicators` (L2653-2722) lit `user_actions` + `user_action_entries` (V1)
- `loadNorthStarContext` (L2399-2458) lit `user_north_stars` (V1)
- `loadWeeklyRecapContext` (L2316-2379) lit `weekly_bilan_recaps` (V1)
- Les formatters dashboard (`formatDashboardRedirectAddon`, `formatDashboardCapabilitiesLiteAddon`, `formatDashboardCapabilitiesAddon`) decrivent les features V1

**Prompt:**
```

Lis:

- supabase/functions/sophia-brain/context/loader.ts (loadActionIndicators,
  loadNorthStarContext, loadWeeklyRecapContext, formatDashboardRedirectAddon,
  formatDashboardCapabilitiesLiteAddon, formatDashboardCapabilitiesAddon)
- supabase/functions/_shared/v2-runtime.ts
- supabase/functions/_shared/v2-types.ts
- docs/v2-dashboard-ux-specs.md (pour les surfaces V2 du dashboard)

Adapte chaque loader:

1. loadActionIndicators → loadPlanItemIndicators:
   - lire user_plan_items + user_plan_item_entries (via getPlanItemRuntime)
   - formater: pour chaque item actif, montrer titre, dimension, streak,
     derniere entree, tendance (en hausse/stable/en baisse)

2. loadNorthStarContext:
   - lire user_metrics WHERE metric_key = 'north_star' au lieu de
     user_north_stars
   - garder le format de sortie similaire (valeur actuelle + historique recent)

3. loadWeeklyRecapContext:
   - lire system_runtime_snapshots WHERE snapshot_type = 'weekly_bilan' au lieu
     de weekly_bilan_recaps
   - extraire le summary depuis le snapshot JSON

4. Dashboard formatters:
   - mettre a jour formatDashboardCapabilitiesAddon pour decrire les surfaces
     V2: North Star card, Dimension sections (mission/habit/support), Habit
     maintenance strip, Plan item cards, Unlock preview
   - supprimer les references aux phases, actions CRUD, vital signs dashboard

Ne pas casser les loaders qui fonctionnent deja en V2
(resolveContextMemoryLoadStrategy, resolveV2RuntimeRefs sont OK).

```
**Output:** loaders de contexte 100% V2
**Validation:** `deno test context/` + review manuelle des blocs de contexte generes

---

### Etape 7.5 — Migration modele dispatcher: GPT 5.4 Mini + routing Nano

**Statut:** FAIT — le dispatcher utilise `gpt-5.4-mini` avec `reasoning_effort=low`, fallback explicite `gemini-2.5-flash`, et le tier `lite` agent passe a `gpt-5.4-nano`.

**Modele:** GPT (Codex)
**Pourquoi:** optimisation cout/latence du dispatcher — GPT 5.4 Mini en reasoning low pour l'analyse des signaux, et GPT 5.4 Nano pour les reponses simples (peu de contexte, pas complexes)

**Decision architecturale:**
- Le dispatcher passe de Gemini Flash a **GPT 5.4 Mini (reasoning: low)** pour l'analyse des signaux. Le reasoning low suffit car le dispatcher produit un JSON structure sans generation longue.
- Pour les reponses agent simples (companion mode, tier "lite", peu de contexte), on passe sur **GPT 5.4 Nano** au lieu de Gemini Flash Lite. Le Nano est plus rapide et moins cher pour les turns triviaux (salutations, reponses courtes, acknowledgments).

**Prompt:**
```

Lis:

- supabase/functions/sophia-brain/router/dispatcher.ts (section
  analyzeSignalsV2, variable dispatcherModel, appel generateWithGemini)
- supabase/functions/sophia-brain/router/run.ts (resolveAgentChatModel,
  tierModelMap)
- supabase/functions/_shared/gemini.ts (ou openai.ts si existant — pour le
  client API)

Modifications:

1. Dispatcher model → GPT 5.4 Mini:
   - dans dispatcher.ts, remplacer l'appel generateWithGemini par un appel au
     client OpenAI (creer un helper generateWithOpenAI si necessaire, ou
     reutiliser un existant)
   - configurer: model = "gpt-5.4-mini", reasoning_effort = "low"
   - le format de prompt reste le meme (system + user → JSON response)
   - variable d'environnement: SOPHIA_DISPATCHER_MODEL (defaut: "gpt-5.4-mini")
   - garder le fallback Gemini Flash en cas d'erreur API OpenAI (resilience: si
     OpenAI est down, on degrade sur Gemini)
   - logger le modele utilise dans les metriques existantes (turn_summary_logs)

2. Agent model tier "lite" → GPT 5.4 Nano:
   - dans resolveAgentChatModel, modifier tierModelMap: lite: "gpt-5.4-nano" (au
     lieu de gemini-3.1-flash-lite-preview)
   - variable d'environnement: SOPHIA_COMPANION_MODEL_LITE (defaut:
     "gpt-5.4-nano")
   - le routing vers lite/standard/deep est deja gere par le memory_plan du
     dispatcher (model_tier_hint), donc pas de changement de logique necessaire
   - s'assurer que le client OpenAI est disponible pour le tier lite (le
     standard et deep restent sur Gemini pour l'instant)

3. Adapter les tests:
   - mocker le client OpenAI dans les tests dispatcher
   - adapter resolveAgentChatModel tests pour verifier le nouveau default lite

4. Metriques:
   - s'assurer que turn_summary_logs.dispatcher_model reflecte "gpt-5.4-mini"
   - s'assurer que turn_summary_logs.agent_model reflecte "gpt-5.4-nano" quand
     applicable

```
**Output:** dispatcher sur GPT 5.4 Mini + lite tier sur GPT 5.4 Nano
**Validation:** `deno test` + verification des logs de modele + test manuel d'un turn simple (verifier que le dispatcher repond en JSON valide via GPT 5.4 Mini)

---

### Etape 7.6 — Dedupliquer le chargement runtime V2

**Statut:** FAIT — `getActiveTransformationRuntime` est prefetche une seule fois par turn dans `processMessage`, puis reuse via `v2Runtime` par le snapshot dispatcher, le coaching selector, le tracking parallele et le context loader; un trace `brain:v2_runtime_prefetched` mesure ce chargement.

**Modele:** GPT (Codex)
**Pourquoi:** optimisation — `getActiveTransformationRuntime` est appele plusieurs fois par turn

**Contexte du probleme:**
`getActiveTransformationRuntime` est appele dans:
- `run.ts` (L888-890) pour `loadCoachingSelectorV2Context`
- `context/loader.ts` (L515-517) pour `resolveV2RuntimeRefs` dans `loadContextForMode`
- potentiellement d'autres endroits selon le flow

Chaque appel fait une requete DB. Sur un turn complet, ca peut representer 2-3 requetes identiques.

**Prompt:**
```

Lis:

- supabase/functions/sophia-brain/router/run.ts (chercher tous les appels a
  getActiveTransformationRuntime)
- supabase/functions/sophia-brain/context/loader.ts (idem)
- supabase/functions/_shared/v2-runtime.ts (signature de
  getActiveTransformationRuntime)

Refactore pour un seul appel par turn:

1. Dans run.ts, au debut du flow principal (apres authentication), appeler
   getActiveTransformationRuntime UNE SEULE fois et stocker le resultat dans une
   variable v2Runtime.

2. Passer v2Runtime en parametre a tous les consommateurs:
   - loadCoachingSelectorV2Context(... , v2Runtime)
   - loadContextForMode(... , v2Runtime) → qui le passe a resolveV2RuntimeRefs
   - buildV2PlanItemSnapshot(... , v2Runtime) (cree en 7.1)
   - tout autre appelant dans le meme flow

3. Adapter les signatures des fonctions pour accepter un runtime optionnel (si
   fourni, ne pas refaire la requete; si absent, le charger — pour garder la
   compatibilite avec les appelants externes comme momentum_outreach).

4. Ajouter un log de timing pour mesurer le gain.

```
**Output:** un seul appel `getActiveTransformationRuntime` par turn
**Validation:** `deno test` + verification dans les logs qu'il n'y a plus qu'un seul appel par request_id

---

### Legacy neutralise par ce lot

- `getDispatcherActionSnapshot` et le champ legacy `action_snapshot` ne sont plus la source du dispatcher; le contrat canonique est `plan_item_snapshot`.
- Les signaux CRUD V1 (`create_action`, `update_action`, `breakdown_action`, `activate_action`, `delete_action`, `deactivate_action`) ainsi que `track_progress_vital_sign` sont retires du prompt runtime.
- Le tracking parallele n'ecrit plus dans `user_action_entries` ni `user_north_stars`; il ecrit en V2 dans `user_plan_item_entries` et `user_metrics`.
- Les blocs de contexte cibles ne s'appuient plus sur `user_actions`, `user_action_entries`, `user_north_stars` ou `weekly_bilan_recaps` pour les usages couverts par le lot 7.

## LOT 8 — LEGACY CLEANUP

Note: le gros du travail de neutralisation a ete fait lot par lot (blocs "Legacy neutralise" dans chaque lot). Le Lot 8 ne fait que le nettoyage final: supprimer les fichiers morts, retirer les routes temporaires, verifier qu'aucun chemin ne depend encore du legacy.

### Etape 8.1 — Audit final des dependances legacy residuelles

**Statut: FAIT**

**Modele:** Claude (Cursor)
**Pourquoi:** audit complet du repo apres tous les lots, verifier qu'il ne reste rien

**Rapport:** `docs/audit-v2/legacy-cleanup-audit-report.md`

**Resultats cles de l'audit:**
- ~12 pages frontend V1 suppressibles (GlobalPlan, ActionPlanGenerator*, Dashboard, NextPlan, Recraft, PlanPrioritiesFollow)
- ~20 composants dashboard V1 suppressibles (tout `components/dashboard/` sauf les V2)
- ~8 hooks/libs V1 suppressibles (useDashboardData/Logic, usePlanGeneratorData/Logic, planActions, topicMemory, loadingSequence)
- 7 edge functions V1 suppressibles (recommend-transformations, sort-priorities, summarize-context, suggest-north-star, generate-plan, break-down-action, archive-plan)
- 3 fichiers brain dead code (getDispatcherActionSnapshot, lib/tracking.ts, lib/tool_ledger.ts)
- 4 fichiers frontend mixtes V1/V2 a nettoyer (App.tsx, PlanPriorities.tsx, ResumeOnboardingView.tsx, Auth.tsx)
- ~10 fichiers backend en coexistence V1/V2 (momentum V1, investigator, checkin_scope, whatsapp-webhook, payload.ts, etc.)
- 8 fonctions SQL stockees et 6 triggers actifs sur les tables V1
- Le Grimoire resistait au moment de l'audit initial; il a finalement ete conserve puis adapte en V2-only lors du lot 8.3
- `weekly_bilan_recaps` est utilise par le V2 comme persistence complementaire — pas suppressible maintenant
- La route `/onboarding-legacy` n'a jamais ete creee. Seule `/dashboard-legacy` existe dans App.tsx.

**Output:** rapport d'audit legacy complet (26 sections)
**Validation:** review humaine avant toute suppression

---

### Etape 8.2 — Supprimer par batch

**Statut: FAIT**

**Modele:** GPT (Codex)
**Pourquoi:** suppression bulk, rapide

**Prompt:**
```

A partir du rapport d'audit legacy, supprime tout ce qui est safe. Procede par
batch:

Batch 1: routes et pages frontend

- supprimer la route /dashboard-legacy (`/onboarding-legacy` n'a jamais existe)
- supprimer GlobalPlan.tsx, GlobalPlanFollow.tsx, PlanPrioritiesFollow.tsx,
  ActionPlanGenerator.tsx, ActionPlanGeneratorFollow.tsx
- supprimer l'ancien Dashboard.tsx et ses composants dependants
  (PlanPhaseBlock.tsx, PlanActionCard.tsx, PersonalActionsSection.tsx)
- supprimer useDashboardData.ts et useDashboardLogic.ts
- conserver `PlanPriorities.tsx` mais supprimer ses branches V1 pour en faire un
  ecran V2-only
- nettoyer App.tsx, Auth.tsx et les CTA marketing des routes legacy supprimees

Batch 2: edge functions

- supprimer recommend-transformations/ (remplace par analyze-intake-v2)
- supprimer sort-priorities/ (remplace par crystallize-v2)
- supprimer summarize-context/ ancienne forme
- supprimer l'ancien generate-plan/ si generate-plan-v2 est operant
- supprimer aussi suggest-north-star/, break-down-action/ et
  `_shared/plan-validator.ts`
- nettoyer state-manager.ts des fonctions legacy non utilisees
  (`getDispatcherActionSnapshot` supprime; les helpers encore necessaires sont
  migrés ensuite en V2 au lot 8.3)
- supprimer le dead code brain safe (`lib/tracking.ts`, `lib/tool_ledger.ts`)

Batch 3: types et donnees

- supprimer frontend/src/types/dashboard.ts (remplace par types/v2.ts)
- supprimer frontend/src/types/plan.ts legacy (remplace par types/v2.ts)
- conserver le Grimoire hors de ce lot; son adaptation V2-only est traitee
  ensuite

Apres chaque batch, verifie que le build passe (npm run build) et que les tests
passent.

```
**Output:** codebase legacy "safe now" nettoyee cote frontend + edge functions safe, sans toucher a l'Architecte ni supprimer le Grimoire
**Validation:** `npm run build` passe. Les nettoyages backend mixtes, la bascule momentum V2-only et la suppression totale du residuel V1 sont reportes au lot 8.3.

---

### Etape 8.3 — Suppression totale du V1 (zero coexistence)

**Statut: FAIT**

**Modele:** GPT (Codex)
**Pourquoi:** suppression bulk, execution mecanique sur un manifeste detaille

**Contexte:** aucun utilisateur en base. Zero coexistence V1/V2 necessaire. On supprime tout le code V1 restant: lazy migration, investigator daily/weekly, momentum V1, signaux CRUD V1, routes/tests/scripts/frontend legacy, etc. Exception explicite: le Grimoire est conserve et maintenu, mais en version V2-only.

**Manifeste:** `docs/lot8-v1-full-cleanup-manifest.md`

**Prompt:**
```

Lis `docs/lot8-v1-full-cleanup-manifest.md` dans son integralite. Ce manifeste
contient 6 batches de suppression. Execute-les dans l'ordre.

Pour chaque batch:

1. Effectue les suppressions et nettoyages decrits
2. Verifie que le build passe (`npm run build` pour le frontend, `deno check`
   pour les fichiers backend modifies)
3. Si un import casse apres suppression, corrige-le (le manifeste indique les
   remplacements)

Regles:

- Ne JAMAIS toucher aux fichiers dans `supabase/migrations/`
- Quand le manifeste dit "remplacer readMomentumState par readMomentumStateV2",
  adapter les champs: V1 `.current_state` → V2 `.state`, V1
  `.dimensions.progression` → V2 `.dimensions.execution_traction`, etc.
- Quand le manifeste dit "remplacer .from('user_plans')" dans whatsapp-webhook,
  utiliser `getActiveTransformationRuntime` de `_shared/v2-runtime.ts` pour
  obtenir le plan V2 actif
- Quand le manifeste dit "supprimer investigator routing" dans run.ts, remplacer
  tout routing vers `investigator` ou `investigator-weekly` par un fallback
  `companion`
- Quand un fichier de test est marque CLEAN, ne supprimer que les test cases V1,
  pas le fichier entier

Apres le batch 6 (verification finale), fais un grep sur le repo pour confirmer
qu'il n'y a plus aucune reference V1 active (hors migrations SQL et texte
marketing).

```
**Execution reelle:**

- Batch 1 frontend: routes/fichiers V1 supprimes, puis restauration du `Grimoire` en V2-only (`Grimoire.tsx`, `grimoire.ts`, `types/grimoire.ts`, `FrameworkHistoryModal.tsx`, routes `/grimoire`).
- Batch 2 frontend mixte: tests E2E / integration / fixtures scripts nettoyes pour retirer les references `user_plans`, `user_actions`, `sort-priorities`, `summarize-context`, `break-down-action`, etc.
- Batch 3 backend delete: suppression des edge functions V1 restantes (`archive-plan`, `process-plan-topic-memory`, `schedule-recurring-checkins`) et nettoyage `supabase/config.toml`.
- Batch 4 brain delete: suppression de l'integralite des dossiers `agents/investigator/` et `agents/investigator-weekly/`, des tests associes, de `north_star_tools.ts` et du payload weekly V1.
- Batch 5 brain/shared/whatsapp clean: retrait des signaux CRUD V1 du dispatcher, suppression de la lazy migration / momentum V1, bascule des handlers WhatsApp et du checkin scope vers les sources V2 runtime.
- Batch 6 verification: `npm run build` passe et grep confirmatoire propre sur `supabase/functions` pour les references V1 interdites.

**Output:** codebase runtime 100% V2-only sur le perimetre applicatif actif, avec Grimoire conserve en V2-only
**Validation:** `npm run build` passe; grep confirmatoire backend propre. Un `deno check` large du dossier `whatsapp-webhook` remonte encore des erreurs TypeScript preexistantes hors perimetre strict du cleanup V1.

---

### Etape 8.4 — Ecrire le LLM Cost Audit Guide

**Statut: FAIT**

**Modele:** Claude (Cursor)
**Pourquoi:** audit transverse, tous les systemes doivent tourner

**Prompt:**
```

Lis docs/audit-v2/llm-cost-v2-audit-guide.md (squelette).

Complete le guide avec les details reels:

- quels appels LLM existent maintenant (par fonction, par tier)
- comment agreger les couts depuis llm_usage_events
- comment detecter les appels redondants
- comment mesurer la derive temporelle

Ecris un script d'export qui:

- agrege les llm_usage_events par user, par jour, par tier, par fonction
- detecte les appels redondants (meme intention < freshness window)
- produit un JSON au format standard V2 (trace + scorecard)
- supporte --user-id (1 user) et --all-users (tous)

```
**Execution reelle:**

- Guide `docs/audit-v2/llm-cost-v2-audit-guide.md` complete avec les appels LLM reels V2 par tier (3 Tier 1, 5 Tier 2, 11+ Tier 3), plus les appels transverses memoire (11 sources) et embeddings (8 sources).
- Mapping `operation_family → tier` documente (utilise `inferOperationFromSource` de `_shared/llm-usage.ts`) avec override par `source` tag pour les bilans/pulse.
- Freshness windows documentees: 12h pulse, 20h daily, 6j weekly, 20h nudge, 1h compaction memoire.
- Detection de derive temporelle: comparaison premiere/seconde moitie avec seuil 20%.
- 9 alertes automatiques: budget depasse, pulse redondant, Tier 3 sur modele cher, derive de cout, taux de fallback, taux unpriced, volume Tier 1, daily/weekly redondants.
- Script `scripts/export_llm_cost_audit_bundle.mjs` cree: supporte `--user-id` et `--all-users`, fenetre `--hours`/`--from`/`--to`, produit un bundle JSON standard V2 (trace + scorecard).

**Output:** guide complet + script `scripts/export_llm_cost_audit_bundle.mjs`
**Validation:** `node --check scripts/export_llm_cost_audit_bundle.mjs` passe

---

# PARTIE 3 — PHASES V2.1

---

## Phase A — Proactive windows engine + cooldown engine

### Dette reportee depuis V2.0

- Remplacer les cooldowns hardcodes de 6C.2 (`same_posture`, `same_item_reminded`) par un vrai moteur de cooldown parametrable.
- Re-evaluer la strategie de validation de `system_runtime_snapshots.snapshot_type` avant d'ajouter beaucoup de nouveaux event types V2.1. Tant que la taxonomie reste stable, la CHECK SQL est acceptable; si Phase A introduit une forte expansion des events, migrer vers une validation plus souple (table de reference ou garde applicative).

### Pre-requis

- V2.0 en production
- morning nudge V2 valide (patterns observes)
- besoin confirme de > 2 types de fenetres actives

### Etape A.1 — Designer l'architecture du moteur

**Statut: FAIT**

**Modele:** Claude
**Pourquoi:** architecture de systeme complexe

Architecture produite: decision pipeline en 8 etapes (absolute locks → budget → confidence → dominant need → window kind → posture → cooldown → emit). Types `CooldownType`, `DominantNeedKind` ajoutes dans `v2-types.ts` et `v2-technical-schema.md`. Event contracts reutilisent `proactive_window_decided_v2` deja defini au Lot 2.2. Le cooldown engine derive les cooldowns time-based depuis `scheduled_checkins` (same_posture, same_item, reactivation) et stocke les cooldowns registres (failed_technique, refused_rdv) dans `system_runtime_snapshots` avec `snapshot_type: "cooldown_entry"`.

### Etape A.2 — Implementer le cooldown engine

**Statut: FAIT**

`cooldown_engine.ts` cree avec approche hybride: cooldowns derives (same_posture, same_item, reactivation) via `checkPostureCooldown`, `checkItemCooldown`, `checkReactivationCooldown` depuis `ProactiveHistoryEntry[]` ; cooldowns registres (technique, rdv) via `checkRegistryCooldown` et `registerCooldown` dans `system_runtime_snapshots`. `validatePostureWithCooldown` gere le fallback vers postures adjacentes. `loadProactiveHistory` charge l'historique complet depuis `scheduled_checkins` avec detection des reactions user. Correction post-review: `momentum_morning_nudge.ts` consomme maintenant cet historique complet au lieu de reconstruire un historique a 1 entree depuis `lastNudge`, ce qui supprime les faux negatifs sur same_posture / same_item. 17 tests cooldown passent; 2 tests de non-regression morning nudge couvrent ce wiring. **Post-audit:** `checkRegistryCooldown` + types + constantes extraits dans `_shared/v2-cooldown-registry.ts` pour eliminer la dependance circulaire `_shared` → `sophia-brain`; `cooldown_engine.ts` re-exporte pour compatibilite.

### Etape A.3 — Implementer le proactive windows engine

**Statut: FAIT**

`proactive_windows_engine.ts` cree avec `evaluateProactiveWindow` comme point d'entree pur. Pipeline: absolute locks (pause_consentie, repair_mode) → momentum policy gate → confidence gate → identifyDominantNeed (6 besoins, priorite event > emotional > load > traction > reactivation > presence) → selectWindowKind (5 types, sensible a l'heure locale) → posture selection (cascade par window kind) → cooldown check via cooldown_engine → emit decision. Budget canonique respecte (§7.1): notable max 1/j 3/7j, light max 1/j supprime si notable same day. Corrections post-review: `min_gap_hours` du `momentum_policy.ts` est maintenant applique, `confidence=medium` downgrade reellement les sorties vers une window light avec posture light-only, et `buildProactiveWindowDecidedPayload` respecte le contrat canonique (`user_id` requis, `window_kind` non-null). La migration `20260325100000_extend_snapshot_type_for_cooldown_entry.sql` realigne aussi le CHECK `snapshot_type` avec les events runtime `plan_item_entry_logged_v2` et `metric_recorded_v2`, en plus de `cooldown_entry`. 34 tests proactive passent. `momentum_morning_nudge.ts` refactore: suppression des cooldowns hardcodes, delegation a `validatePostureWithCooldown`, correction du bug pre-existant `topBlocker`. 19 tests morning nudge passent sans regression. Total: 70 tests passent.

---

## Phase B — Repair mode formel + relation preferences

### Pre-requis

- 3+ cas reels ou le lien casse malgre pause_consentie
- 50+ users actifs avec historique nudges > 2 semaines

### Etape B.1 — Implementer repair mode

**Modele:** Claude
**Pourquoi:** runtime sensible, decisions de design

**Prompt:**
```

Implemente le repair mode formel V2.1.

Source de verite: user_chat_states.temp_memory.__repair_mode_v1

Le module doit:

1. Detecter les conditions d'entree (proactives sans echo, refus repetes)
2. Activer le mode (ecrire dans temp_memory)
3. Bloquer les proactives offensives pendant le mode
4. Detecter les conditions de sortie (reouverture, consentement)
5. Desactiver le mode
6. Loguer repair_mode_entered_v2 et repair_mode_exited_v2

Integrer avec le proactive windows engine: si repair_mode.active, le moteur ne
peut que skip ou downgrade_to_soft_presence.

```
### Etape B.2 — Implementer relation preferences

**Modele:** GPT (migration + CRUD) + Claude (logique d'inference)

**Statut:** FAIT — table `user_relation_preferences` creee, inference progressive branchee depuis l'historique reel, et preferences consommees par le scheduler morning, le renderer WhatsApp dynamique et le proactive windows engine.

**Fichiers concernes:**
- `supabase/migrations/20260325113000_create_user_relation_preferences.sql`
- `supabase/functions/sophia-brain/relation_preferences_engine.ts`
- `supabase/functions/sophia-brain/relation_preferences_engine_test.ts`
- `supabase/functions/schedule-whatsapp-v2-checkins/index.ts`
- `supabase/functions/_shared/scheduled_checkins.ts`
- `supabase/functions/sophia-brain/proactive_windows_engine.ts`
- `supabase/functions/sophia-brain/router/run.ts`

**Prompt Claude (inference):**
```

Designe la logique d'inference des relation_preferences.

A partir de:

- historique des nudges envoyes et des reponses (ou non-reponses)
- horaires des interactions
- longueurs des messages user
- reactions aux differents tons

Inferer:

- preferred_contact_windows
- preferred_tone
- max_proactive_intensity

Regles:

- jamais de questionnaire explicite
- mise a jour progressive, pas brutale
- confiance minimale requise avant de modifier un preference

```
**Implementation retenue:**

- source de verite: `user_relation_preferences`
- inference a partir des `scheduled_checkins` proactifs (`morning_nudge_v2`, `momentum_*`) et des reponses `chat_messages` WhatsApp
- `preferred_contact_windows` / `disliked_contact_windows` sont bornes a `morning | afternoon | evening`
- `preferred_tone` est infere via les reactions observees aux familles de posture (`gentle`, `direct`, `mixed`)
- `preferred_message_length` est infere via la longueur mediane des reponses user aux contacts proactifs
- `max_proactive_intensity` est inferé de facon conservative (downgrade vers `low` si les contacts `notable` performent mal ou declenchent des refus)
- mise a jour progressive: en l'absence de signal suffisant, on preserve les valeurs existantes
- consommation runtime:
  - le scheduler morning saute les users qui n'acceptent pas la fenetre `morning`
  - le renderer WhatsApp dynamique injecte les preferences relationnelles dans le prompt de generation
  - le proactive windows engine respecte les fenetres de contact et cappe les users `low` a une intensite `light`

**Validation:** `deno test` passe sur `relation_preferences_engine_test.ts`, `proactive_windows_engine_test.ts` et `momentum_morning_nudge_test.ts` (61 tests). Le `deno check` cible des fichiers modifies est propre; il reste seulement 2 erreurs TypeScript preexistantes dans `_shared/checkin_scope.ts` hors perimetre de B.2.

---

## Phase C — Rendez-vous table + transformation handoff formel

### Dettes reportees depuis V2.0

- **Rendez-vous** : en V2.0 les contacts proactifs contextualises (pre-event,
  post-friction, etc.) passent par `scheduled_checkins` enrichis. Le
  technical-schema definit une table dediee `user_rendez_vous` (section 3.11)
  avec lifecycle complet, mais elle n'a pas ete creee car les
  `scheduled_checkins` suffisaient au volume initial.
- **Transformation handoff** : en V2.0, quand une transformation passe en
  `completed`, `handoff_payload` dans `user_transformations` reste `null` ou
  contient un objet minimal non structure. La transformation suivante demarre
  sans bilan formel de la precedente.

### Pre-requis

- `pre_event_grounding` utilise > 3x/semaine en production (declencheur
  mesurable — cf. mvp-scope section dette)
- Premier user qui passe a la transformation 2 (besoin reel observe pour le
  handoff — cf. mvp-scope section 7)
- Phases A et B stables (cooldown engine + proactive windows engine + repair
  mode + relation preferences operationnels)

### Etape C.1 — Migration SQL + CRUD rendez-vous

**Modele:** GPT (Codex)
**Pourquoi:** migration SQL, types, CRUD standard — meme pattern que B.2
migration

**Statut:** FAIT — table `user_rendez_vous` creee avec RLS/indexes/trigger `updated_at`, helper shared `v2-rendez-vous.ts` ajoute avec validation des invariants + transitions, et event `rendez_vous_state_changed_v2` maintenant type specifiquement.

**Fichiers concernes:**
- `supabase/migrations/20260325143000_create_user_rendez_vous.sql`
- `supabase/functions/_shared/v2-rendez-vous.ts`
- `supabase/functions/_shared/v2-rendez-vous_test.ts`
- `supabase/functions/_shared/v2-events.ts`
- `docs/v2-technical-schema.md`

**Implementation retenue:**
- `createRendezVous` peut creer un rendez-vous en `draft` ou `scheduled` (auto-derive `scheduled` si `scheduled_for` est deja renseigne)
- invariants appliques des la creation: `trigger_reason` obligatoire, `confidence=low` refuse, verification du cooldown `refused_rendez_vous` via le cooldown engine
- cle de cooldown retenue: `${kind}:${transformation_id ?? cycle_id}`
- `transitionRendezVous` valide le lifecycle `draft -> scheduled|cancelled`, `scheduled -> delivered|cancelled`, `delivered -> completed|skipped|cancelled`
- `getActiveRendezVous` expose les rendez-vous non termines (`draft`, `scheduled`, `delivered`) et `getRendezVousHistory` fournit l'historique filtre par `kind`
- les types `RendezVousKind`, `RendezVousState` et `UserRendezVousRow` existaient deja dans `v2-types.ts` et `frontend/src/types/v2.ts`, donc aucun changement n'etait necessaire sur ces miroirs

**Validation:** `deno test supabase/functions/_shared/v2-rendez-vous_test.ts` + `deno check supabase/functions/_shared/v2-rendez-vous.ts`.

**Prompt:**
```

Cree la table `user_rendez_vous` et le CRUD associe.

Source de verite: docs/v2-technical-schema.md section 3.11 (UserRendezVousRow)
et section 2.8 (RendezVousKind, RendezVousState).

1. Migration SQL additive:
   - table `user_rendez_vous` avec colonnes du technical-schema
   - FK vers `user_cycles`, `user_transformations` (nullable)
   - RLS : user voit uniquement ses propres rendez-vous
   - index sur (user_id, state) et (user_id, scheduled_for)
   - CHECK constraint sur `kind` et `state`

2. Types TypeScript:
   - ajouter `UserRendezVousRow` dans `_shared/v2-types.ts`
   - miroir dans `frontend/src/types/v2.ts`
   - ajouter `RendezVousKind` et `RendezVousState` si pas deja presents

3. Helpers CRUD dans `_shared/v2-rendez-vous.ts`:
   - `createRendezVous(row)` — insertion + log `rendez_vous_state_changed_v2`
   - `transitionRendezVous(id, newState)` — transition avec validation
     (draft→scheduled→delivered→completed|skipped|cancelled)
   - `getActiveRendezVous(userId, cycleId)` — rendez-vous non termines
   - `getRendezVousHistory(userId, opts)` — historique avec filtre par kind

Invariants (technical-schema section 8.3):

- aucun rendez-vous sans `trigger_reason`
- aucun rendez-vous si `confidence=low`
- cooldown `refused_rendez_vous` (7j) respecte via cooldown engine

```
**Fichiers finalement touches:**
- `supabase/migrations/20260325143000_create_user_rendez_vous.sql` (new)
- `supabase/functions/_shared/v2-rendez-vous.ts` (new)
- `supabase/functions/_shared/v2-rendez-vous_test.ts` (new)
- `supabase/functions/_shared/v2-events.ts` (payload `rendez_vous_state_changed_v2` specialise)
- `docs/v2-technical-schema.md` (event payload + invariant `confidence=low`)
- `docs/v2-context-prompt.md` (suivi Phase C.1)
- `supabase/functions/_shared/v2-types.ts` / `frontend/src/types/v2.ts` (deja alignes, inchanges)

### Etape C.2 — Integration rendez-vous dans le proactive pipeline

**Statut:** FAIT — le pipeline proactif cree maintenant de vrais
`user_rendez_vous` en production quand le scheduler morning arbitre en faveur de
ce canal, avec delivery, completion/skipped et cooldown de refus relies au flux
WhatsApp reel.

**Modele:** Claude (Cursor)
**Pourquoi:** decisions d'architecture runtime — comment le proactive windows
engine decide de creer un rendez-vous plutot qu'un simple nudge, integration
avec le cooldown engine et le scheduler

**Prompt:**
```

Integre la table `user_rendez_vous` dans le pipeline proactif existant.

Contexte:

- Le proactive windows engine (proactive_windows_engine.ts) decide deja des
  fenetres et des postures.
- Le cooldown engine (cooldown_engine.ts) gere deja `refused_rendez_vous`.
- Le scheduler morning (schedule-whatsapp-v2-checkins) cree des
  `scheduled_checkins`.
- La table `user_rendez_vous` a un lifecycle propre
  (draft→scheduled→delivered→completed|skipped|cancelled).

A implementer:

1. Logique de decision: quand le proactive windows engine produit une fenetre,
   determiner si elle justifie un rendez-vous plutot qu'un nudge simple.
   Criteres:
   - `pre_event_grounding` avec event confirme → rendez-vous
     kind=pre_event_grounding
   - friction detectee + repair mode recemment sorti → rendez-vous
     kind=post_friction_repair
   - weekly bilan avec decision `reduce` ou `consolidate` → rendez-vous
     kind=weekly_reset
   - `mission_preparation` reste desactive dans l'implementation retenue tant
     que le runtime n'expose pas d'echeance fiable pour les plan items mission
   - Les rendez-vous `transition_handoff` sont crees par l'etape C.3, pas par le
     proactive engine.

2. Creation: quand la decision est "rendez-vous", creer via `createRendezVous`
   au lieu de `scheduled_checkins`.

3. Delivery: adapter `process-checkins` pour lire aussi les rendez-vous
   `scheduled` dont `scheduled_for <= now()` et les delivrer (generer le message
   via le prompt adequat, marquer `delivered`).

4. Completion tracking: detecter la reponse user au rendez-vous et marquer
   `completed` ou `skipped`.

5. Cooldown: un rendez-vous refuse (user explicitement skip) registre un
   cooldown `refused_rendez_vous` via `registerCooldown`.

Ne pas modifier le contrat du proactive windows engine (evaluateProactiveWindow
reste pur). Ajouter une couche de decision au-dessus qui consomme la decision
proactive et choisit le canal (nudge simple vs rendez-vous).

```
**Fichiers concernes:**
- `supabase/functions/sophia-brain/proactive_windows_engine.ts` (lecture, pas
  modification du contrat pur)
- `supabase/functions/sophia-brain/rendez_vous_decision.ts` (new — couche de
  decision au-dessus du proactive engine)
- `supabase/functions/schedule-whatsapp-v2-checkins/index.ts`
  (wiring scheduler -> nudge vs rendez-vous)
- `supabase/functions/process-checkins/index.ts` (adapter pour delivrer les
  rendez-vous)
- `supabase/functions/whatsapp-webhook/handlers_pending.ts` (completion/skipped
  precis via pending actions)
- `supabase/functions/whatsapp-webhook/index.ts` (completion best-effort avant
  le pipeline brain)
- `supabase/functions/sophia-brain/router/run.ts` (suppression de
  l'auto-complete trop large)
- `supabase/migrations/20260325153000_extend_whatsapp_pending_actions_for_rendez_vous.sql`
  (additif — nouveau kind `rendez_vous`)

**Implementation retenue:**

- `rendez_vous_decision.ts` reste la couche de decision au-dessus du proactive
  windows engine, mais elle expose maintenant aussi
  `resolveRendezVousDecisionForRuntime`, qui charge le contexte runtime utile
  (momentum, repair mode, relation preferences, historique proactif,
  conversation pulse, event memories, victoires recentes) sans modifier le
  contrat pur de `evaluateProactiveWindow`.
- Le scheduler `schedule-whatsapp-v2-checkins` appelle cette couche et
  arbitre par user entre trois issues:
  1. `skip` du proactive engine → pas de nudge ni de rendez-vous pour ce slot
  2. decision `rendez_vous` → creation de `user_rendez_vous` via
     `createRendezVousFromProactiveDecision`
  3. fallback `nudge` ou `downgrade_to_soft_presence` → creation du
     `scheduled_checkins` morning nudge V2 habituel
- Criteres effectivement actifs dans C.2, avec ordre de priorite:
  1. `pre_event_grounding` + event confirme dans `user_event_memories` →
     `pre_event_grounding`
  2. friction (`emotional_protection` ou `traction_rescue`) + sortie recente de
     repair mode (<72h) → `post_friction_repair`
  3. weekly bilan recent avec decision `reduce` ou `consolidate` (<48h) →
     `weekly_reset`
- `mission_preparation` a ete retire du runtime actif de C.2. Le type et le kind
  restent dans le schema, mais ce critere ne sera reactive que lorsque
  `PlanItemRuntimeRow` exposera une echeance reelle exploitable sans casts de
  fixture.
- `process-checkins` delivre les rendez-vous `scheduled`, genere le message
  dynamique par kind, transitionne vers `delivered`, et cree un
  `whatsapp_pending_actions(kind='rendez_vous')` pour suivre la reponse user.
- `whatsapp-webhook` complete ensuite le rendez-vous de facon precise:
  reponse libre -> `completed`; refus explicite / "plus tard" -> `skipped` +
  `registerRendezVousRefusal(...)`.
- L'auto-complete large dans `router/run.ts` a ete retire pour ne plus marquer
  un rendez-vous `completed` sur un message utilisateur non lie.
- Le contrat du proactive windows engine (`evaluateProactiveWindow`) n'a PAS
  ete modifie — il reste pur.

**Corrections qui ferment la review precedente:**

- wiring scheduler -> `user_rendez_vous` maintenant effectif
- flux reel de refus/skip -> cooldown `refused_rendez_vous` maintenant branche
- completion tracking resserre sur un `pending_action` explicite par
  rendez-vous livre
- critere `mission_preparation` retire du runtime actif au lieu de reposer sur
  des champs absents

**Validation:**

- `deno test supabase/functions/sophia-brain/rendez_vous_decision_test.ts supabase/functions/_shared/v2-rendez-vous_test.ts --no-check` → OK (25 tests)
- `deno check supabase/functions/sophia-brain/rendez_vous_decision.ts` → OK
- `deno check supabase/functions/schedule-whatsapp-v2-checkins/index.ts`
  et `deno check supabase/functions/process-checkins/index.ts` restent bloques
  uniquement par 2 erreurs TypeScript preexistantes dans
  `_shared/checkin_scope.ts`
- `deno check supabase/functions/whatsapp-webhook/handlers_pending.ts` reste
  bloque par des dettes TypeScript deja presentes dans `wa_db.ts` et
  `wa_whatsapp_api.ts`; aucun nouveau diagnostic n'a ete introduit dans les
  fichiers modifies, et les diagnostics IDE des fichiers touches sont propres

### Etape C.3 — Prompt + moteur du transformation handoff

**Statut: FAIT**

**Modele:** Claude (Cursor)
**Pourquoi:** design de prompt LLM sensible (meme pattern que 6B.2a, 6B.3a) —
le handoff resume une transformation entiere et ses apprentissages, ce qui
demande un prompt nuance et bien cadre

**Prompt:**
```

Designe le prompt LLM et le validateur pour le transformation handoff formel.

Declencheur: quand `user_transformations.status` passe a `completed`.

Entrees a charger:

- `user_transformations` row (titre, internal_summary, duration, dates)
- `user_plan_items` de la transformation (tous statuts confondus) avec leurs
  `user_plan_item_entries` (les 30 derniers jours au minimum)
- `user_victory_ledger` entries liees a la transformation
- coaching history: derniers snapshots `system_runtime_snapshots` de type
  coaching intervention pour cette transformation
- `user_metrics` scope=transformation (north star progress)
- conversation_pulse le plus recent de la transformation

Sortie attendue — `TransformationHandoffPayload` (mvp-scope section 7):

- wins: string[] (max 5) — victoires significatives, pas des platitudes
- supports_to_keep: string[] (IDs de plan_items support a conserver dans la
  transformation suivante car encore utiles)
- habits_in_maintenance: string[] (IDs de plan_items habitude qui ont atteint
  l'ancrage et passent en maintenance)
- techniques_that_failed: string[] (IDs de plan_items ou techniques coaching qui
  n'ont pas fonctionne — eviter de les reproposer)
- relational_signals: string[] (max 3) — observations sur la relation user ↔
  Sophia pendant cette transformation (ex: "repond mieux aux nudges matinaux",
  "prefere les bilans courts")
- coaching_memory_summary: string (1 paragraphe) — synthese narrative de ce que
  le coaching a appris sur cet user pendant cette transformation

Regles du prompt:

- le handoff RESUME, il ne copie pas (invariant technique section 8.6)
- les IDs doivent etre des IDs reels de plan_items existants
- `wins` doit etre ancre dans des entries/victoires reelles, pas invente
- `coaching_memory_summary` ne doit pas depasser 200 tokens
- si la transformation a ete courte (< 14 jours) OU si l'activite reelle est
  tres faible (< 5 `total_entries` agreges), le handoff peut etre partiel (wins
  et habits optionnels)

Validateur:

- wins: 1-5 strings, chacun < 100 chars
- supports_to_keep: IDs valides parmi les plan_items de dimension `support`
- habits_in_maintenance: IDs valides parmi les plan_items kind=habit
- techniques_that_failed: IDs valides (plan_items ou `technique_key` presents
  dans les coaching snapshots)
- relational_signals: 0-3 strings, chacun < 150 chars
- coaching_memory_summary: string non vide, < 200 tokens

Cree aussi le prompt builder (meme pattern que les prompts 6B) et le validateur
dans un fichier dedie.

```
**Fichiers crees:**
- `supabase/functions/_shared/v2-prompts/transformation-handoff.ts` (prompt
  system + user builder + validateur)
- `supabase/functions/_shared/v2-prompts/transformation-handoff_test.ts` (27
  tests unitaires)

**Implementation retenue:**

- Meme pattern que `conversation-pulse.ts` (6B.3a) et `weekly-recalibrage.ts`
  (6B.2a) : system prompt + user prompt builder + validateur + JSON parse helper.
- Type `TransformationHandoffPayload` exporte depuis le module, aligne sur
  `v2-mvp-scope.md` section 7.
- Input builders purs (`buildHandoffTransformationSnapshot`,
  `buildHandoffPlanItemSnapshot`, `buildPulseSummaryForHandoff`) qui
  transforment les rows DB en snapshots compacts pour le LLM.
- System prompt avec regles strictes par champ :
  - `supports_to_keep` limite aux IDs de plan_items de dimension `support`
  - `habits_in_maintenance` limite aux IDs de plan_items kind=`habit`
  - `techniques_that_failed` autorise explicitement les IDs de plan_items ET les
    `technique_key` presents dans `coaching_snapshots`
  - `coaching_memory_summary` < 200 tokens
  - handoff partiel autorise si transformation courte (< 14j) OU activite tres
    faible (< 5 `total_entries` agreges)
- Validateur `validateTransformationHandoffOutput` avec clamping et filtrage :
  - wins: cap a 5, chaque win < 100 chars
  - supports_to_keep: filtrage des IDs invalides + rejet explicite des items
    hors dimension `support`
  - habits_in_maintenance: filtrage IDs invalides + verification kind=habit
  - techniques_that_failed: accepte les IDs plan_items ET les coaching
    technique_keys des snapshots
  - relational_signals: cap a 3, chaque signal < 150 chars
  - coaching_memory_summary: non vide, cap ~800 chars (~200 tokens)
- Fallback payload vide si le LLM retourne du garbage.

**Validation:** `deno test` passe sur `transformation-handoff_test.ts` (27
tests) — snapshot builders (6 tests), validateur (16 tests), LLM parser (3
tests), user prompt builder (2 tests). Zero regression sur
`conversation-pulse_test.ts` (19 tests).

### Etape C.4 — Wiring du transformation handoff

**Modele:** GPT (Codex)
**Pourquoi:** implementation mecanique — charger le contexte, appeler le LLM,
persister le resultat, emettre les events (meme pattern que 6B.2b, 6B.3b)

**Statut:** EN COURS — le module d'execution idempotent est livre, la lecture
downstream par `generate-questionnaire-v2` et `conversation_pulse_builder` est
branchee, et le rendez-vous `transition_handoff` est cree automatiquement quand
un handoff est genere. Le seul morceau encore ouvert est le point d'appel direct
sur une transition explicite `user_transformations.status -> completed`, car ce
flow n'existe pas encore comme mutation centrale dans le repo.

**Fichiers concernes:**

- `supabase/functions/sophia-brain/transformation_handoff.ts`
- `supabase/functions/sophia-brain/transformation_handoff_test.ts`
- `supabase/functions/generate-questionnaire-v2/index.ts`
- `supabase/functions/sophia-brain/conversation_pulse_builder.ts`
- `supabase/functions/sophia-brain/conversation_pulse_builder_test.ts`
- `supabase/functions/_shared/v2-prompts/conversation-pulse.ts`
- `supabase/functions/process-checkins/index.ts`

**Implementation retenue:**

- Nouveau module `executeTransformationHandoff(supabase, userId, transformationId)` dans
  `sophia-brain/transformation_handoff.ts`, sur le meme pattern que les modules
  runtime V2: chargement DB, appel LLM, validation, persistence, events.
- Le chargeur assemble toutes les entrees du prompt C.3: transformation,
  plan_items avec historique complet d'entries, `user_victory_ledger`,
  historique coaching depuis `memory_observability_events`, metriques cycle +
  transformation, et dernier `conversation_pulse` de la transformation.
- Le handoff est persiste de facon additive dans
  `user_transformations.handoff_payload.transformation_handoff_v2` sans ecraser
  `handoff_payload.onboarding_v2`. Le payload stocke aussi des artefacts derives
  pour les consumers: `questionnaire_context`, `pulse_context`, `mini_recap`.
- Le module est idempotent: s'il retrouve deja
  `handoff_payload.transformation_handoff_v2`, il ne relance pas le LLM mais
  peut quand meme completer la creation du rendez-vous `transition_handoff` si
  besoin.
- `generate-questionnaire-v2` charge maintenant la transformation precedente du
  cycle. Si elle est `completed` mais sans handoff stocke, il appelle
  `executeTransformationHandoff` en backfill, puis enrichit le
  `questionnaire_context` de la transformation suivante avec le handoff
  precedent.
- `conversation_pulse_builder` charge le handoff de la transformation completee
  la plus recente du cycle actif et l'injecte dans le prompt comme contexte de
  continuite entre transformations.
- `process-checkins` enrichit maintenant le grounding des rendez-vous avec les
  `source_refs.transformation_handoff` pour que le message `transition_handoff`
  puisse vraiment faire un mini recap utile plutot qu'un simple message
  generique.

**Point d'appel reellement livre a ce stade:**

- Faute de mutation centrale existante pour "marquer une transformation
  completed", le wiring runtime effectif passe aujourd'hui par le premier
  consumer reel qui a besoin du handoff (`generate-questionnaire-v2`), avec
  creation du rendez-vous `transition_handoff` dans la meme execution.
- Le module exporte est pret a etre appele directement le jour ou un flow
  explicite de completion (weekly bilan ou action manuelle) sera introduit dans
  le repo.

**Validation:** `deno test supabase/functions/sophia-brain/transformation_handoff_test.ts --no-check` et
`deno test supabase/functions/sophia-brain/conversation_pulse_builder_test.ts --no-check --allow-read`.
`ReadLints` propre sur les fichiers touches. `deno check` des fichiers modifies
ne remonte plus que les 2 erreurs TypeScript preexistantes de
`supabase/functions/_shared/checkin_scope.ts` (hors perimetre).

**Prompt:**
```

Implemente le module qui execute le transformation handoff.

Architecture: meme pattern que les bilans V2 (6B.2b) — un module pur qui charge
les entrees, appelle le LLM avec le prompt de C.3, valide la sortie, persiste et
logue.

1. Module `transformation_handoff.ts` dans `sophia-brain/`:
   - `executeTransformationHandoff(supabase, userId, transformationId)`
   - Charge les entrees definies par le prompt C.3 (transformation, plan_items
     avec entries, victory_ledger, coaching history, metrics, pulse)
   - Appelle le LLM Tier 2 avec le prompt de transformation-handoff.ts
   - Valide la sortie via le validateur
   - Persiste dans `user_transformations.handoff_payload`
   - Logue `transformation_handoff_generated_v2`

2. Point d'appel: brancher dans le flow de completion de transformation. Quand
   une transformation passe a `completed` (soit via le weekly bilan, soit
   manuellement), appeler `executeTransformationHandoff` apres la transition de
   statut.

3. Consommation downstream:
   - Le questionnaire de la transformation suivante
     (`generate-questionnaire-v2`) doit lire `handoff_payload` de la
     transformation precedente pour enrichir le `questionnaire_context`
   - Le `conversation_pulse` doit pouvoir lire le `handoff_payload` comme
     contexte additionnel quand la transformation change
   - Creer un rendez-vous kind=`transition_handoff` pour delivrer le mini recap
     a l'utilisateur via le canal de rendez-vous (table `user_rendez_vous`)

Fichiers:

- supabase/functions/sophia-brain/transformation_handoff.ts (new)
- supabase/functions/sophia-brain/transformation_handoff_test.ts (new)
- supabase/functions/_shared/v2-events.ts (verifier payload type)
- supabase/functions/generate-questionnaire-v2/index.ts (lire handoff)
- supabase/functions/sophia-brain/conversation_pulse_builder.ts (lire handoff)
- supabase/functions/_shared/v2-rendez-vous.ts (creer rendez-vous
  transition_handoff)

```
---

## Phase D — user_cycle_drafts + weekly conversation digest

### Contexte

Deux dettes acceptees en V2.0 avec declencheurs explicites (mvp-scope section 5):

1. **user_cycle_drafts** — le draft onboarding invite repose aujourd'hui
   uniquement sur `localStorage` (`frontend/src/lib/onboardingV2.ts`). Toute
   perte du localStorage (switch de navigateur, lien magique ouvert dans un
   autre onglet, mode prive, nettoyage auto) efface la saisie de l'utilisateur
   avant meme la creation d'un cycle Supabase.
2. **Weekly conversation digest** — le weekly bilan V2 recoit actuellement un
   `pulse_summary` qui est le dernier ConversationPulse frais (fenetre 12h, pas
   retrospective de semaine). L'orchestration-rules section 5.4 prevoit
   explicitement un "build weekly digest" (etape 2) avant le weekly bilan
   (etape 4), mais ce module n'existe pas encore. Le bilan peut donc decider
   `expand` alors que la semaine a ete difficile du lundi au jeudi mais que le
   pulse du vendredi soir montre "tout va bien".

### Pre-requis (declencheurs)

- D.1: > 15% de sessions invite perdues (analytics ou retours user)
- D.2: weekly bilan V2 produit des decisions visiblement sous-informees

### Hors scope de cette phase

- Sync bidirectionnelle temps-reel entre localStorage et serveur (un simple
  "last-write-wins" par `updated_at` suffit)
- Flow de reprise mid-onboarding complexe (multi-device simultane, merge de
  conflits)
- Dashboard frontend du weekly digest (le digest est un artefact backend,
  consomme uniquement par le weekly bilan et les nudges)
- Remplacement du conversation_pulse par le digest — les deux coexistent,
  l'un quotidien/temps-reel, l'autre hebdomadaire/retrospectif

### Legacy neutralise par cette phase

- Aucun — cette phase est purement additive

---

### Etape D.1 — user_cycle_drafts (cache invite serveur)

**Statut:** EN COURS — implementation code livree par GPT, review Claude
effectuee avec 3 corrections integrees:
1. Race condition corrigee: `migrateServerDraft` skip quand
   `pending_auth_action === "analyze"` (le flow local gere deja l'analyse)
2. Post-auth hydration: le `clearOnboardingV2Draft` est conditionne sur
   `response.hydrated === true`; le cas `existing_cycle` injecte le `cycle_id`
   dans le draft au lieu d'effacer, ce qui laisse l'effet de rehydration
   Supabase prendre le relais proprement
3. Cleanup global: `cleanupExpiredDrafts(admin)` remplace le cleanup par
   session — supprime les drafts expires de toutes les sessions en best-effort

Application locale de la migration et scenarios manuels encore a rejouer.

**Modele:** GPT (Codex) + Claude (review)
**Pourquoi:** implementation mecanique — migration SQL, CRUD edge function,
frontend hydration logic, cleanup. Aucun prompt LLM, aucune decision
d'architecture au-dela de ce que le technical-schema section 3.2 definit deja.
Claude review sur la strategie de conflit localStorage ↔ serveur + correction
de 3 edge cases dans le flow post-auth.

**Sous-etapes:**

#### D.1a — Migration SQL

Migration additive `create_user_cycle_drafts.sql`:

```
Source de verite: docs/v2-technical-schema.md section 3.2 (UserCycleDraftRow).

1. Table `user_cycle_drafts`:
   - id uuid PK default gen_random_uuid()
   - anonymous_session_id text NOT NULL
   - status text NOT NULL CHECK (status IN ('draft','structured','prioritized','expired'))
   - raw_intake_text text NOT NULL DEFAULT ''
   - draft_payload jsonb NOT NULL DEFAULT '{}'
   - expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
   - created_at timestamptz NOT NULL DEFAULT now()
   - updated_at timestamptz NOT NULL DEFAULT now()

2. Index: unique sur (anonymous_session_id) — un draft actif max par session
3. Index: (expires_at) — pour le cleanup
4. RLS:
   - Pas de policy auth.uid() — ces drafts sont pre-signup
   - Acces controle par l'edge function via service_role key
   - INSERT/UPDATE/SELECT via service_role uniquement
5. Trigger updated_at (meme pattern que les autres tables V2)
```

**Fichiers concernes:**
- `supabase/migrations/20260325170000_create_user_cycle_drafts.sql` (new)
- `docs/v2-technical-schema.md` (verifier alignement section 3.2)

#### D.1b — Types TypeScript

```
Ajouter UserCycleDraftRow dans les types partages:

1. `supabase/functions/_shared/v2-types.ts`:
   - type UserCycleDraftRow aligne sur le technical-schema section 3.2
   - type CycleDraftStatus = 'draft' | 'structured' | 'prioritized' | 'expired'

2. `frontend/src/types/v2.ts`:
   - miroir du type (meme pattern que les autres row types)
```

**Fichiers concernes:**
- `supabase/functions/_shared/v2-types.ts`
- `frontend/src/types/v2.ts`

#### D.1c — Edge function CRUD

```
Creer une edge function `cycle-draft` (ou deux: `upsert-cycle-draft` +
`get-cycle-draft`) pour gerer les drafts pre-signup.

Contexte:
- L'onboarding V2 frontend genere un anonymous_session_id (UUID v4) au premier
  acces, stocke dans localStorage a cote du draft.
- Les calls sont pre-auth, donc PAS de JWT. L'edge function utilise la
  service_role key pour acceder a la table.
- L'anonymous_session_id sert de cle de lookup (non devinable = UUID v4).

Endpoints:

1. POST /cycle-draft — upsert
   Body: { anonymous_session_id: string, draft: OnboardingV2Draft }
   - Si un draft existe avec cet anonymous_session_id et n'est pas expired:
     mettre a jour draft_payload, raw_intake_text, status, updated_at,
     reset expires_at a now() + 7 days
   - Sinon: creer un nouveau draft
   - Retourne { id, updated_at }

2. GET /cycle-draft?session_id=xxx — lecture
   - Retourne le draft actif pour cet anonymous_session_id (status != 'expired')
   - Si pas de draft ou draft expire: retourne { draft: null }
   - Retourne { draft: OnboardingV2Draft, updated_at }

3. POST /cycle-draft/hydrate — migration post-signup (auth requise)
   Body: { anonymous_session_id: string }
   - Requiert un JWT valide (auth.uid())
   - Lit le draft actif pour cet anonymous_session_id
   - Si un cycle V2 existe deja pour ce user (meme stage ou plus avance):
     ne rien faire, supprimer le draft, retourner { hydrated: false }
   - Sinon: declencher le flow onboarding V2 depuis le draft
     (appeler analyze-intake-v2 avec le raw_intake_text si stage='capture',
      ou rehydrater le cycle existant si stage > 'capture')
   - Supprimer le draft apres hydratation reussie
   - Retourne { hydrated: true, cycle_id }

Implementation retenue:
- Une seule edge function `cycle-draft` avec `config.toml verify_jwt = false`
  + routage interne `GET` / `POST` / `POST /hydrate`
- `POST /hydrate` verifie manuellement le JWT; si `draft_payload.cycle_id`
  appartient deja au user, il re-utilise ce cycle et supprime le draft
- Sinon il rejoue `analyze-intake-v2` a partir du `raw_intake_text`

Invariants:
- Un anonymous_session_id ne peut avoir qu'un seul draft actif
- Le draft est supprime apres hydratation OU expiration
- Aucune donnee personnelle dans le draft (pas d'email, pas de nom)
```

**Fichiers concernes:**
- `supabase/functions/cycle-draft/index.ts` (new)
- `supabase/functions/cycle-draft/index_test.ts` (new)
- `supabase/functions/cycle-draft/config.toml` (new)
- `supabase/config.toml`

#### D.1d — Frontend dual-source hydration

```
Adapter le frontend onboarding V2 pour sync le draft sur le serveur.

Contexte:
- Le draft vit aujourd'hui dans localStorage uniquement
  (frontend/src/lib/onboardingV2.ts)
- Le type OnboardingV2Draft est deja bien defini
- L'objectif est une sync best-effort, pas un systeme offline-first complet

Changements dans frontend/src/lib/onboardingV2.ts:

1. Ajouter un champ `anonymous_session_id` au type OnboardingV2Draft
   - Generer un UUID v4 a la creation si absent
   - Stocker dans localStorage avec le draft

2. Ajouter une fonction `syncDraftToServer(draft)`:
   - POST vers /cycle-draft avec le anonymous_session_id et le draft
   - Fire-and-forget (pas de blocage UI)
   - Catch silencieux si offline ou erreur

3. Modifier `saveOnboardingV2Draft` pour appeler `syncDraftToServer` en
   parallele de l'ecriture localStorage

4. Ajouter une fonction `loadDraftFromServer(sessionId)`:
   - GET /cycle-draft?session_id=xxx
   - Retourne le draft ou null

Changements dans frontend/src/pages/OnboardingV2.tsx:

5. Au chargement initial:
   a. Lire le draft localStorage
   b. Lire le anonymous_session_id depuis localStorage
   c. Si pas de draft localStorage mais un session_id existe:
      appeler loadDraftFromServer(sessionId) comme fallback
   d. Si les deux existent: prendre le plus recent (comparer updated_at)
   e. Si aucun: creer un draft vide (comportement actuel)

6. Apres auth (retour de /auth):
   a. Si un anonymous_session_id existe dans localStorage:
      appeler POST /cycle-draft/hydrate avec le session_id
   b. Le flow existant (pending_auth_action) continue a fonctionner
      comme fallback si le serveur n'a pas de draft

Strategie de conflit:
- Simple "last-write-wins" par updated_at
- En cas d'egalite, le draft localStorage gagne (plus frais par definition)
- Pas de merge partiel — le draft est atomique
```

**Fichiers concernes:**
- `frontend/src/lib/onboardingV2.ts`
- `frontend/src/pages/OnboardingV2.tsx`

#### D.1e — Cleanup des drafts expires

```
Deux strategies possibles (implementer la plus simple):

Option A (recommandee): cleanup inline dans l'edge function
- A chaque POST /cycle-draft, supprimer les drafts ou expires_at < now()
  pour cet anonymous_session_id (batch de 1, quasi gratuit)
- A chaque POST /cycle-draft/hydrate, supprimer le draft apres migration

Option B (si volume justifie): cron dedie
- Nouveau cron `cleanup-expired-cycle-drafts` qui tourne 1x/jour
- DELETE FROM user_cycle_drafts WHERE expires_at < now()

L'option A suffit largement pour le volume prevu (< 100 drafts actifs).
```

**Checkpoint D.1:**
- [ ] migration appliquee localement
- [x] `deno check` et `deno test` passent sur l'edge function
- [x] `npm run build` passe sur le frontend
- [ ] scenario de test: saisir du texte en invite, fermer le navigateur,
      rouvrir dans un autre navigateur avec le meme session_id stocke,
      retrouver le draft
- [ ] scenario de test: saisir du texte, s'authentifier, verifier que le
      draft est hydrate vers un cycle reel et le draft serveur supprime

---

### Etape D.2 — Weekly conversation digest

**Statut:** EN COURS — D.2a-D.2f implementes en code (builder, migration/event,
weekly bilan enrichi, wiring cron, consumer downstream minimal); review Claude
effectuee avec 1 correction integree:
1. `WeeklyDigestGeneratedPayload` aligne avec `ConversationPulseGeneratedPayload`:
   ajout de `snapshot_id` dans le type, le builder, et v2-technical-schema.md
   — permet le lien direct event → snapshot sans jointure sur timestamp

Restent l'application locale de la migration et la validation end-to-end.

Cette etape suit la **Boucle 2: Architecture → Implementation → Validation**
(Claude concoit le prompt et l'architecture, GPT implemente le module).

#### D.2a — Type + Prompt LLM + Validateur

**Statut: FAIT**

**Modele:** Claude (Cursor)
**Pourquoi:** design de prompt LLM — meme pattern que conversation-pulse
(6B.3a) et weekly-recalibrage (6B.2a). Le digest doit resumer l'arc emotionnel
d'une semaine entiere, ce qui demande un prompt bien cadre pour eviter les
platitudes.

**Prompt:**
```

Designe le type, le prompt LLM et le validateur pour le weekly conversation
digest.

Contexte:

- Le weekly conversation digest est un artefact hebdomadaire qui resume l'arc
  conversationnel de la semaine. Il est genere AVANT le weekly bilan
  (orchestration-rules section 5.4, etape 2) et lui sert d'input.
- Il ne REMPLACE PAS le conversation_pulse (quotidien, fenetre 12h). Les deux
  coexistent: le pulse est le signal temps-reel, le digest est la retrospective
  de semaine.
- Le conversation_pulse_builder.ts et le weekly-recalibrage.ts existent deja et
  servent de reference pour le pattern.

1. Type WeeklyConversationDigest a ajouter dans v2-types.ts:

   - week_start: string (ISO date, debut de la semaine)
   - dominant_tone: string (libre, < 50 chars, ex: "fatigue melee de
     determination")
   - tone_evolution: string (libre, < 100 chars, description de l'arc tonal sur
     la semaine, ex: "debut hesitant, regain mercredi, relachement vendredi")
   - best_traction_moments: string[] (max 3, < 100 chars chacun, ancres dans
     des messages reels)
   - closure_fatigue_moments: string[] (max 3, < 100 chars chacun, moments ou
     l'utilisateur a montre de la fermeture ou de la fatigue)
   - most_real_blockage: string | null (< 150 chars, le blocage le plus
     concret de la semaine — pas une platitude)
   - support_that_helped: string | null (< 150 chars, ce qui a aide —
     specifique, pas generique)
   - main_risk_next_week: string | null (< 150 chars, risque principal anticipe
     pour la semaine suivante)
   - relational_opportunity: string | null (< 150 chars, observation sur la
     relation Sophia-user exploitable pour ajuster le ton/timing)
   - confidence: 'high' | 'medium' | 'low'
   - message_count: number (nombre total de messages user dans la fenetre)
   - active_days: number (nombre de jours distincts avec au moins 1 message
     user)

2. Input du prompt:

   - Tous les messages user+assistant de la semaine [week_start, week_start+7j[
     (pas juste les derniers 80 — charger jusqu'a 150 messages pour couvrir une
     semaine active)
   - Daily bilans envoyes cette semaine (mode, items cibles, outcome)
   - Event memories actives/upcoming dans la fenetre
   - Dernier conversation_pulse de la semaine (comme reference, pas comme
     source unique)
   - Nombre de messages et jours actifs (pre-calcule)

3. System prompt:

   Regles strictes:
   - Le digest RESUME l'arc de la semaine, il ne recopie pas les messages
   - Les best_traction_moments et closure_fatigue_moments doivent etre ancres
     dans des messages reels (citer approximativement le contenu, pas juste
     "lundi" ou "mercredi")
   - most_real_blockage ne doit PAS etre un copier-coller de top_blocker du
     momentum — c'est le blocage observe dans la CONVERSATION, pas dans les
     metriques
   - Si < 5 messages user dans la semaine: confidence=low, champs non
     renseignables mis a null
   - Si aucune conversation significative: retourner un digest minimal
     (dominant_tone="silence", tone_evolution="peu d'echanges", listes vides)
   - relational_opportunity doit etre actionnable (ex: "l'utilisateur repond
     mieux le matin" ou "prefere des messages courts"), pas vague

4. Validateur (meme pattern que parseConversationPulseLLMResponse):

   - JSON parse avec fallback
   - Clamping de tous les champs texte (max chars)
   - Cap des listes (max 3 items)
   - Verification coherence confidence vs message_count
   - Fallback digest minimal si parse echoue

Creer le fichier `v2-prompts/weekly-conversation-digest.ts` avec:
- type WeeklyConversationDigestInput
- WEEKLY_CONVERSATION_DIGEST_SYSTEM_PROMPT
- buildWeeklyConversationDigestUserPrompt(input)
- parseWeeklyConversationDigestLLMResponse(raw, input, nowIso)

```

**Fichiers concernes:**
- `supabase/functions/_shared/v2-prompts/weekly-conversation-digest.ts` (new)
- `supabase/functions/_shared/v2-prompts/weekly-conversation-digest_test.ts` (new)
- `supabase/functions/_shared/v2-types.ts` (ajout WeeklyConversationDigest)
- `frontend/src/types/v2.ts` (miroir)

**Implementation retenue:**

- Meme pattern que `conversation-pulse.ts` (6B.3a): system prompt + user prompt
  builder + validateur + JSON parse helper.
- Type `WeeklyConversationDigest` ajoute dans `v2-types.ts` avec 12 champs
  (version, week_start, generated_at, 7 champs d'analyse, confidence,
  message_count, active_days).
- System prompt en francais avec 8 regles strictes: ancrage dans les messages,
  independance du pulse, seuils de confiance (< 5 messages → low), semaine
  silencieuse (< 3 messages → digest minimal), caps sur tous les champs.
- Validateur `validateWeeklyConversationDigestOutput` avec clamping par champ,
  coherence confidence vs message_count, enforcement semaine silencieuse
  (listes videes, champs nullable → null), et fallback digest si parse echoue.
- 12 tests couvrent: user prompt builder (2), output valide (1), clamping (1),
  coherence confidence (1), semaine silencieuse (1), fallback null (1), champs
  manquants (1), JSON parse (3), normalisation strings vides → null (1).

**Validation:** `deno check` et `deno test` (12 tests) passent. `npm run build`
passe. Zero regression sur `conversation-pulse_test.ts` (19 tests).

#### D.2b — Module builder

**Modele:** GPT (Codex)
**Pourquoi:** implementation mecanique — meme pattern que
conversation_pulse_builder.ts (6B.3b). Chargement parallele des donnees, appel
LLM, persistence snapshot.

**Prompt:**
```

Implemente le module weekly conversation digest builder.

Architecture: meme pattern que conversation_pulse_builder.ts — un module avec
chargement parallele des donnees, appel LLM Tier 2, validation, persistence
dans system_runtime_snapshots.

Contexte:
- Le prompt et le validateur sont dans
  v2-prompts/weekly-conversation-digest.ts (etape D.2a)
- Le module doit etre appele par le cron weekly AVANT le weekly bilan
  (orchestration-rules section 5.4)
- Freshness: un digest par semaine par user (dedupe key:
  weekly_digest:{user_id}:{week_start})

Module `weekly_conversation_digest_builder.ts` dans sophia-brain/:

1. Loaders (paralleles):
   - loadWeeklyMessages(supabase, userId, weekStart, weekEnd)
     → chat_messages dans la fenetre [weekStart, weekEnd[, limit 150
   - loadWeeklyDailyBilans(supabase, userId, weekStart, weekEnd)
     → scheduled_checkins event_context='daily_bilan_v2' dans la fenetre
   - loadWeeklyEventMemories(supabase, userId, weekStart, weekEnd)
     → user_event_memories actives/upcoming dans la fenetre
   - loadLatestConversationPulse(supabase, userId, runtime)
     → dernier conversation_pulse frais (reutiliser la logique existante)

2. Input builder:
   - Agreger les donnees chargees en WeeklyConversationDigestInput
   - Pre-calculer message_count et active_days

3. Appel LLM:
   - Tier 2 (meme modele que conversation_pulse ou weekly bilan)
   - generateWithGemini() avec le system prompt et user prompt du D.2a

4. Validation:
   - parseWeeklyConversationDigestLLMResponse()

5. Persistence:
   - INSERT dans system_runtime_snapshots avec
     snapshot_type='weekly_digest'
   - scope: cycle_id + transformation_id (meme pattern que conversation_pulse)

6. Event log (best effort):
   - logV2Event: weekly_digest_generated_v2

7. Cache:
   - Avant de generer, verifier si un snapshot weekly_digest existe deja
     pour ce (user_id, cycle_id, transformation_id) avec un week_start
     identique dans le payload. Si oui, retourner le cache.

Export: buildWeeklyConversationDigest(args) → Promise<BuildWeeklyDigestResult>

Fichiers:
- supabase/functions/sophia-brain/weekly_conversation_digest_builder.ts (new)
- supabase/functions/sophia-brain/weekly_conversation_digest_builder_test.ts (new)

```

#### D.2c — Migration snapshot_type + event type

**Modele:** GPT (Codex)

```
Migration additive pour:

1. Etendre le CHECK constraint system_runtime_snapshots.snapshot_type
   pour accepter 'weekly_digest'

2. Ajouter le type d'event 'weekly_digest_generated_v2' dans v2-events.ts
   avec un payload specifique:
   - user_id, cycle_id, transformation_id
   - week_start
   - dominant_tone
   - confidence
   - message_count
   - active_days

3. Verifier que le snapshot_type est aligne entre:
   - la migration SQL
   - v2-types.ts (SnapshotType)
   - v2-events.ts (V2_EVENT_TYPES)
```

**Fichiers concernes:**
- `supabase/migrations/YYYYMMDDHHMMSS_extend_snapshot_type_for_weekly_digest.sql` (new)
- `supabase/functions/_shared/v2-events.ts`
- `supabase/functions/_shared/v2-types.ts` (si SnapshotType enum existe)

#### D.2d — Integration avec le weekly bilan

**Modele:** Claude (Cursor)
**Pourquoi:** modification du prompt weekly recalibrage existant — le digest
ajoute une source d'information au prompt, il faut ajuster les instructions
du LLM pour qu'il lise correctement les deux signaux (pulse temps-reel +
digest retrospectif)

```
Integrer le weekly conversation digest dans le weekly bilan V2.

Changements:

1. Etendre WeeklyBilanV2Input (weekly-recalibrage.ts):
   - Ajouter un champ optionnel:
     weekly_digest: WeeklyConversationDigest | null
   - pulse_summary reste tel quel (le pulse est le signal temps-reel)
   - weekly_digest est le signal retrospectif de la semaine

2. Adapter buildWeeklyBilanV2Input:
   - Accepter un parametre optionnel digest: WeeklyConversationDigest | null
   - L'injecter dans l'input

3. Adapter le system prompt WEEKLY_RECALIBRAGE_SYSTEM_PROMPT:
   - Ajouter une section "Digest conversationnel de la semaine
     (weekly_digest)" dans les donnees recues
   - Preciser: "Le digest resume l'arc emotionnel de TOUTE la semaine.
     Le pulse_summary est un snapshot recent (dernieres 12h). Quand les
     deux divergent, accorder plus de poids au digest pour la decision de
     semaine."
   - Utiliser le digest pour:
     - tone_evolution → informe la decision hold vs reduce
     - best_traction_moments → renforce la decision expand
     - closure_fatigue_moments → renforce la decision reduce/consolidate
     - most_real_blockage → enrichit le coaching note
     - main_risk_next_week → informe la posture recommandee
     - relational_opportunity → enrichit le coaching note

4. Adapter le user prompt builder pour injecter le digest s'il est present

Fichiers:
- supabase/functions/_shared/v2-prompts/weekly-recalibrage.ts
- supabase/functions/_shared/v2-weekly-bilan-engine_test.ts (adapter fixtures)
```

#### D.2e — Wiring dans le cron weekly

**Modele:** GPT (Codex)
**Pourquoi:** plumbing mecanique — brancher le digest builder avant le weekly
bilan dans le flow du cron

```
Brancher le weekly conversation digest builder dans le cron weekly.

Contexte:
- L'orchestration-rules section 5.4 definit la sequence weekly:
  1. recompute weekly snapshot
  2. build weekly digest        ← C'EST ICI
  3. recompute momentum + active load
  4. produire weekly_bilan_v2
  5. materialiser ajustements retenus
  6. evaluer rendez-vous / handoff si pertinent

- Le weekly bilan est aujourd'hui declenche par trigger-weekly-bilan/

Changements dans trigger-weekly-bilan/:

1. Avant de construire le WeeklyBilanV2Input, appeler
   buildWeeklyConversationDigest({ supabase, userId, weekStart })

2. Injecter le digest dans buildWeeklyBilanV2Input comme parametre
   supplementaire

3. Si le digest builder echoue: fallback null (le weekly bilan continue
   sans digest, comme aujourd'hui — meme resilience que pour
   conversationPulse)

4. Logger le digest_id dans le message_payload du weekly bilan pour
   tracabilite

Fichiers:
- supabase/functions/trigger-weekly-bilan/v2_weekly_bilan.ts
- supabase/functions/trigger-weekly-bilan/v2_weekly_bilan_test.ts

```

#### D.2f — Consommation downstream (optionnel, post-weekly)

```
Consumers secondaires du weekly digest (a brancher si besoin apres
validation du weekly bilan enrichi):

1. Morning nudge: le proactive_windows_engine peut lire le digest de la
   semaine precedente pour informer le dominant_need du lundi matin
   (ex: si main_risk_next_week pointe vers un blocage specifique,
   le nudge du lundi peut cibler cet item)

2. Outreach: si le digest montre silence (message_count < 3,
   active_days < 2), le proactive windows engine peut prioriser un
   soft_presence ou un open_door

Ces integrations sont des extensions naturelles et ne sont pas requises
pour le MVP de la Phase D.
```

**Checkpoint D.2:**
- [x] type WeeklyConversationDigest dans v2-types.ts + miroir frontend
- [x] prompt + validateur + tests dans weekly-conversation-digest.ts
- [x] module builder + tests dans weekly_conversation_digest_builder.ts
- [ ] migration snapshot_type appliquee localement
- [x] weekly bilan V2 recoit et utilise le digest
- [x] `deno check` et `deno test` passent
- [x] `npm run build` passe
- [ ] scenario de test: generer un digest sur une semaine avec des fixtures de
      messages variees (semaine stable, semaine en degringolade, semaine
      silencieuse), verifier que le digest et le weekly bilan reagissent
      differemment

---

### Resume du split Claude / GPT pour la Phase D

| Etape | Modele | Raison |
|-------|--------|--------|
| D.1a Migration SQL | GPT | migration additive triviale |
| D.1b Types TypeScript | GPT | miroir mecanique |
| D.1c Edge function CRUD | GPT | plumbing CRUD |
| D.1d Frontend dual-source | GPT | sync best-effort |
| D.1e Cleanup | GPT | inline dans l'edge function |
| D.1 Review conflit strategy | Claude | edge cases auth redirect |
| D.2a Type + Prompt + Validateur | Claude | design de prompt LLM |
| D.2b Module builder | GPT | meme pattern que pulse builder |
| D.2c Migration snapshot_type | GPT | migration additive |
| D.2d Integration weekly bilan | Claude | modification prompt existant |
| D.2e Wiring cron | GPT | plumbing mecanique |
| D.2f Consumers downstream | GPT (si besoin) | extensions optionnelles |
| D.2 Review code + coherence | Claude | correction snapshot_id payload |

---

# PARTIE 4 — BOUCLES DE COLLABORATION

## Boucle 1: Design → Build → Polish
```

Gemini (UX specs) → GPT (implementation) → Gemini (UX review) → GPT
(corrections)

```
Usage: Lots 4, 5 (onboarding et dashboard)

## Boucle 2: Architecture → Implementation → Validation
```

Claude (architecture + prompts) → GPT (implementation) → Claude (code review)

```
Usage: Lots 1, 2, 3, 6A, 6B, 6C

## Boucle 3: Prompt Design → Test → Iterate
```

Claude (prompt V1) → GPT (test avec fixtures) → Claude (analyse des sorties) →
Claude (prompt V2 ameliore)

```
Usage: tous les prompts LLM (structuration, cristallisation, plan generation,
conversation pulse, daily/weekly decision)

## Boucle 4: Audit → Clean → Verify
```

Claude (audit legacy) → GPT (suppression batch) → Claude (verification merge
checklist)

```
Usage: Lot 8

## Regle: aucun merge sans passage par Claude

GPT et Gemini produisent. Claude valide. Toujours.

---

# PARTIE 5 — OPTIMISATIONS ET RACCOURCIS

## Ou gagner du temps

1. **Lot 1 + 1.4 en parallele**: GPT genere les migrations SQL pendant que
   Claude ecrit les types — les deux convergent sur le technical schema

2. **Lot 3 prompts + Lot 4.0 UX en parallele**: Claude designe les prompts LLM
   pendant que Gemini designe les ecrans onboarding — zero dependance

3. **Lot 5.0 UX + Lot 6A en parallele**: Gemini designe le dashboard pendant
   que GPT implemente l'active load engine — zero dependance

4. **Daily/Weekly V2 (6B) peuvent etre developpes en parallele**: ils lisent
   le meme runtime mais ne s'influencent pas

## Ou utiliser un modele plutot qu'un autre pour x10

| Tache | Mauvais choix | Bon choix | Gain |
|-------|---------------|-----------|------|
| Migration SQL bulk | Claude | GPT | x5 vitesse |
| Design de prompt LLM | GPT | Claude | x3 qualite |
| UX review mobile | Claude/GPT | Gemini | x3 pertinence |
| Refactoring fichier existant 1900 lignes | GPT | Claude | x2 fiabilite |
| Composants React bulk | Claude | GPT | x5 vitesse |
| Audit de coherence cross-docs | GPT | Claude | x3 precision |
| Polish micro-copy | GPT | Gemini | x2 naturel |

## Erreurs a eviter

1. **Ne pas faire coder GPT sans types definis**: toujours Lot 1 (types) avant
   Lot 3+ (implementation). Sinon GPT invente des shapes.

2. **Ne pas faire designer Gemini sans le flow canonique**: toujours donner
   le flow V2 complet a Gemini, pas juste "fais un onboarding". Sinon il
   reinvente la roue.

3. **Ne pas laisser GPT refondre momentum_state.ts**: fichier trop gros,
   trop de decisions d'architecture. Claude seulement.

4. **Ne pas faire valider du code par Gemini**: Gemini valide l'UX, pas le code.
   Claude valide le code.

5. **Ne pas skipper les tests de prompt LLM**: chaque prompt de generation
   (plan, structuration, cristallisation) doit etre teste sur 3-5 cas
   realistes AVANT de brancher le frontend dessus.

6. **Ne pas paralleliser ce qui depend du runtime V2**: les bilans (6B)
   et le coaching (6C) ne peuvent pas commencer avant que 6A soit stable.

7. **Ne pas oublier les events**: chaque nouvelle fonction doit loguer
   ses events V2. C'est la seule facon d'auditer et debugger.
```

---

## Audit global V2.1 — Corrections livrees

**Date:** 2026-03-25
**Modele:** Claude (audit + corrections)

Audit complet du codebase V2 croisant code, playbook et context-prompt.
10 corrections livrees, organisees par priorite:

### P0 — Bloquants

| Correction | Fichiers | Detail |
| --- | --- | --- |
| Dependance circulaire `_shared` → `sophia-brain` (active load) | `_shared/v2-active-load.ts` (nouveau), `_shared/v2-runtime.ts`, `sophia-brain/active_load_engine.ts` | `computeActiveLoad` extrait dans `_shared`; l'ancien module re-exporte pour ne casser aucun import existant |
| Dependance circulaire `_shared` → `sophia-brain` (cooldown) | `_shared/v2-cooldown-registry.ts` (nouveau), `_shared/v2-rendez-vous.ts`, `sophia-brain/cooldown_engine.ts` | `checkRegistryCooldown` + types extraits dans `_shared`; re-export + type cast `CooldownContext` |
| `logV2Event` crash les requetes en cas d'erreur DB | `_shared/v2-events.ts` | Wrapping try/catch interne, `console.warn` par defaut, option `throwOnError` pour les cas ou l'appelant veut propager |

### P1 — Ameliorations

| Correction | Fichiers | Detail |
| --- | --- | --- |
| Pas d'error handling dans `PlanPriorities.handleValidate` | `frontend/src/pages/PlanPriorities.tsx` | `try/catch` + banner `saveError` affiche a l'utilisateur |
| Message technique `user_metrics` expose dans `NorthStarV2` | `frontend/src/components/dashboard-v2/NorthStarV2.tsx` | Remplace par "La North Star sera definie une fois ton plan active." |
| Items completes non affiches dans `DimensionSection` | `frontend/src/components/dashboard-v2/DimensionSection.tsx` | Section `completed` avec icone `CheckCircle2` + strikethrough |
| Pas de UI fallback/retry pour `questionnaire_setup` lent/en erreur | `frontend/src/pages/OnboardingV2.tsx` | Ecran intermediaire + bouton "Reessayer" |
| Types payload memoire dupliques entre `v2-memory-retrieval.ts` et `v2-events.ts` | `_shared/v2-memory-retrieval.ts` | Suppression des definitions locales, import/re-export depuis `v2-events.ts` |

### P2 — Optimisations

| Correction | Fichiers | Detail |
| --- | --- | --- |
| Timezone `"Europe/Paris"` hardcodee dans ~20 fichiers | `_shared/v2-constants.ts` (nouveau) + ~10 fichiers consumers | Constante `DEFAULT_TIMEZONE` centralisee |
| Documentation `v2-mvp-scope.md` en retard sur les livraisons V2.1 | `docs/v2-mvp-scope.md` | Tables V2.1 marquees "Livre", 8/9 dettes marquees "Resolu" |

### Etapes 4.0 et 4.1 du playbook

Les statuts "EN COURS" etaient obsoletes — le code, les tests et le build
passent depuis le Lot 4. Corriges en "FAIT".

### Points restant EN COURS (non traites par l'audit)

- **C.4:** le repo ne dispose pas encore d'un point unique de transition
  `user_transformations.status -> completed`. Decision produit requise.
- **D.1:** migration `20260325170000` non appliquee localement, scenarios
  de test E2E non rejoues.
- **D.2:** migration `20260325183000` non appliquee localement, fixtures
  variees non validees.
- **Confidence gates inline:** seule dette technique encore ouverte dans
  `v2-mvp-scope.md` — a resoudre quand > 3 selecteurs dupliquent la meme
  logique de confiance.
