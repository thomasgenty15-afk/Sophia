# Checklist de revue pre-merge — Refonte V2

> A utiliser avant chaque merge de lot V2 dans `v2-redesign`.
> Chaque point doit etre coche manuellement. Un seul point non coche = merge bloque.
> Derniere mise a jour: 2026-03-23

---

## 1. Conformite au schema technique

- [ ] Les types et enums sont conformes a `docs/v2-technical-schema.md` (sections 2-4)
- [ ] Les state shapes JSON respectent les definitions canoniques (section 5)
- [ ] Les state shapes dans `temp_memory` portent un champ `version`
- [ ] Toute lecture de state shape passe par `migrateIfNeeded(payload, currentVersion)` (lazy migration, jamais batch)
- [ ] Les foreign keys respectent la hierarchie `cycle → transformation → plan → plan_items`

## 2. Source de verite

- [ ] `user_plan_items` est utilise comme source de verite d'execution (pas le JSON plan)
- [ ] `user_plans_v2.content` n'est jamais relu pour piloter l'execution runtime
- [ ] Les ajustements runtime (weekly, coaching, deactivation) modifient `user_plan_items`, jamais le JSON
- [ ] Aucune dependance a `current_phase` comme source de verite
- [ ] Aucune dependance a `user_goals` comme coeur metier des transformations
- [ ] Aucune logique qui lit `user_actions` / `user_framework_tracking` / `user_vital_signs` comme grille primaire

## 3. Invariants metier (section 8.1)

- [ ] Maximum 1 cycle actif par user
- [ ] Maximum 1 transformation active par cycle
- [ ] Maximum 1 plan actif par transformation
- [ ] Maximum 1 North Star active par cycle (dans `user_metrics`, `scope="cycle"`, `kind="north_star"`)
- [ ] Maximum 3 transformations par cycle
- [ ] Maximum 2 `generation_attempts` par transformation

## 4. Invariants d'execution (section 8.2)

- [ ] Maximum 1 mission principale active
- [ ] Maximum 1 mission secondaire active si surcharge
- [ ] Maximum 2 habits en `active_building`
- [ ] Un item `completed` ne redevient pas `active` sans event explicite
- [ ] `in_maintenance` ne bloque pas un unlock

## 5. Invariants proactifs (section 8.3)

- [ ] Aucun proactive notable si `pause_consentie`
- [ ] Aucun morning nudge si `confidence=low`
- [ ] Aucun rendez-vous sans `trigger_reason`
- [ ] Aucun `expand` weekly si `needs_reduce=true`
- [ ] Respect du cooldown engine pour tout proactive

## 6. Invariants plan (section 8.5)

- [ ] Le plan est structure en 3 dimensions (`support`, `missions`, `habits`), pas en phases
- [ ] `activation_condition` est utilise (pas `unlock_rule`)
- [ ] Les plan items ont un `kind` parmi les valeurs de l'enum `plan_item_kind`

## 7. Events et observabilite

- [ ] Les nouveaux events suivent les conventions V2 (section 6 du technical schema)
- [ ] Chaque mutation metier significative produit un event d'observabilite
- [ ] Les payloads d'events contiennent les champs requis (cf. section 6.6)
- [ ] Entree/sortie de repair mode produit un event d'observabilite
- [ ] Les events sont suffisamment compacts et stables pour le replay

## 8. Orchestration (cf. `v2-orchestration-rules.md`)

- [ ] Les couches d'orchestration sont respectees (metier stable → runtime → analyse → decision → execution → events)
- [ ] Pas de decision proactive prise directement depuis la couche metier stable
- [ ] Les vues runtime sont utilisees pour reconstruire la situation courante (pas de lecture de 10 tables brutes)

## 9. Memoire (section 8.7)

- [ ] Le retrieval ne charge jamais toutes les couches simultanement (seulement l'intention active)
- [ ] Chaque retrieval respecte le `budget_tier` et `max_tokens_hint` de son contrat
- [ ] Le tagging `scope` (cycle/transformation/relational) est present sur les nouvelles global memories
- [ ] La memoire d'une transformation terminee n'est pas chargee par defaut dans la suivante

## 10. Modules geles

- [ ] Aucun fichier de `docs/FROZEN_MODULES.md` n'a ete modifie (sauf bugfix critique approuve)
- [ ] Si un module gele a du etre modifie, la raison est documentee dans le PR

## 11. Compatibilite legacy

- [ ] Les tables legacy ne sont pas modifiees destructivement
- [ ] Aucun `DROP TABLE`, `DROP SCHEMA`, `TRUNCATE` sur des tables existantes
- [ ] Les tables legacy coexistent avec les nouvelles tables V2
- [ ] Pas de `supabase db reset` ou commande destructive

## 12. Hygiene de code

- [ ] Les fichiers de test associes aux modules modifies passent
- [ ] Pas de secrets ou credentials commites (.env, tokens, etc.)
- [ ] Le guide d'audit du lot concerne est a jour (cf. `docs/audit-v2/`)
