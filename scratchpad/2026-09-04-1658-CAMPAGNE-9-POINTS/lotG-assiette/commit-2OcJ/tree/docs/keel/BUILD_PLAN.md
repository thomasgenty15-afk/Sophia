# KEEL — Plan de construction A→Z

> **Ce document est le plan d'exécution technique.** La doctrine vit dans [CONTRACT.md](CONTRACT.md),
> le modèle dans [SCHEMA.md](SCHEMA.md), les ceintures dans [BELT_AUDIT.md](BELT_AUDIT.md).
> Ici : QUI fait QUOI, dans quel ORDRE, avec quels fichiers, et comment on VÉRIFIE.
>
> Notation : `[∥]` = parallélisable (agent autonome), `[S]` = séquentiel (dépend du lot précédent),
> `[HUMAIN]` = action que seul Ahmed peut faire (db push, deploy, secrets, Meta, Stripe).
> Chaque lot (WP) est dimensionné pour UN agent avec un périmètre de fichiers exclusif —
> deux agents ne touchent jamais le même fichier dans la même vague.

---

## État réel au 27/07 (ce qui existe déjà — vague 0, faite)

| Fait | Où | Vérifié |
|---|---|---|
| Contrat produit (R1-R7, non-inputs, refus) | `docs/keel/CONTRACT.md` | — |
| Schéma + 3 fixtures d'acceptation | `docs/keel/SCHEMA.md` | — |
| Audit des 74 ceintures FR | `docs/keel/BELT_AUDIT.md` | — |
| Tokens fail-loud + parseurs | `_shared/keel/tokens.ts` (+relations.ts) | 26 tests ✓ |
| Lint CI des tokens | `scripts/ci/token-lint.mjs` (`npm run lint:keel-tokens`) | ✓ |
| **Migration P0 (16 tables) — ÉCRITE, PAS APPLIQUÉE** | `supabase/migrations/20260727090000_keel_p0_commitments.sql` | syntaxe relue |
| Client vision multimodal | `_shared/vision.ts` | tests ✓ |
| i18n backend + frontend | `_shared/keel/locale.ts`, `labels.en.ts`, `frontend/src/keel/i18n/` | tsc ✓ |
| Render (digest dominical, dégradation provenance) | `_shared/keel/render.ts` | tests ✓ |
| Prompt d'import Classe A | `_shared/keel/prompts/plan_import.en.ts` | live ✓ |
| **plan-import-v1 (texte 13 s / PDF 61 s)** | `supabase/functions/plan-import-v1/` | curl 200 ✓ |
| Écran d'import coach (lecture seule) | `frontend/src/keel/pages/PlanImportPage.tsx`, route `/keel/import` | navigateur ✓ |

**Ce qui N'EXISTE PAS encore** (c'est tout le reste de ce document) : aucune table en base,
aucune suppression du legacy, pas d'évaluateur, pas de boucle élève, pas d'espace coach au-delà
de l'import lecture-seule, pas de tenancy, pas de photo WhatsApp, pas de safety TCA, pas de
billing, pas d'anglais hors surfaces keel.

---

## Arbitrages structurants (décidés ici, à ne pas re-litiger en cours de route)

1. **Pas de double écriture legacy↔KEEL.** Pour un élève KEEL, `plan_versions`/`plan_commitments`
   remplacent `user_plans_v2`/`user_plan_items`. On ne matérialise PAS de cycle/transformation
   fantôme pour nourrir les 147 fichiers legacy : on **re-câble les 5 surfaces consommatrices**
   (contexte plan du dispatcher, `track_progress_plan_item`→`record_adherence`, cibles du bilan
   du soir, bilan hebdo, ancres de rappels) pour lire `plan_commitments`. Les tables legacy
   restent en base, vides pour les utilisateurs KEEL, vivantes pour la branche FR.
2. **`advance-phase-v2` est CONSERVÉ** malgré son nom : c'est l'activation des items dont la
   semaine commence, pas une génération de niveau. Renommage logique en W4 (rollover).
3. **Web/PWA est le canal par défaut, WhatsApp l'option que le coach active.** L'app élève
   `/app/today` fonctionne seule ; WhatsApp reste le canal d'engagement privilégié du pilote
   (conviction du coach) mais aucune fonctionnalité n'est WhatsApp-only. (Meta : messages de
   service facturés au 01/10/2026, pas de BAA, 32 % d'adoption US.)
4. **`DashboardV2.tsx` (4113 l.) n'est PAS adapté.** La vue élève KEEL est neuve et petite.
   Le dashboard legacy reste monté pour la branche FR, invisible pour un utilisateur KEEL.
5. **`OnboardingV2.tsx` (3697 l.) n'est PAS adapté.** L'onboarding élève KEEL = invitation →
   compte → profil nutritionnel structuré + questionnaire du coach. ~10 % de la taille.
6. **Le parrainage B2C disparaît comme produit, survit comme infrastructure.** La page
   `/parrainage` est supprimée ; la mécanique token-dans-metadata → `handle_new_user` → RPC
   d'attribution est réutilisée telle quelle par l'invitation coach→élève.
7. **La mémoire conversationnelle n'est PAS internationalisée.** Couche sémantique FR gelée
   derrière `locale.startsWith('fr')` ; pour les élèves KEEL, la mémoire qui compte est
   structurée (`student_safety_constraints`, `protocol_events`) donc sans langue. Une taxonomie
   `domain_keys` v2 minimale (~10 clés protocole) en W9, pas plus.
8. **Les cartes (défense/attaque) ne sont pas dans la migration P0** (16 tables vérifiées) —
   elles arrivent en W8 avec leur propre migration, une fois le moteur d'évaluation stable.
9. **`intake-to-transformations-v2`, `draft-transformation-from-text-v1`, `cycle-draft`,
   `generate-plan-v2`** : conservés en code (branche FR + « semaine recommandée » future),
   déroutés pour les utilisateurs KEEL. Aucune suppression de la colonne vertébrale.
10. **Un seul modèle de rôle** : `profiles.keel_role ∈ {student, coach, null}` (null = legacy FR).
    Pas de refonte du système de tiers legacy ; l'entitlement KEEL est calculé depuis
    `coach_clients` (accès hérité), voir W10.

---

## Vue d'ensemble des vagues

```
W1  Fondations DB + bugs latents        [GATE HUMAIN: db reset]        ~5 j
W2  Démolition contrôlée (A→B→C)        [GATE HUMAIN: db push phase C] ~8 j
W3  Safety d'abord                                                     ~6 j
W4  Boucle élève (évaluateur + runtime)                                ~12 j
W5  Photo (WhatsApp + web)                                             ~6 j
W6  Espace coach complet                                               ~10 j
W7  Bilans (soir + hebdo réécrits)                                     ~7 j
W8  Cartes templates                                                   ~5 j
W9  Anglais total + i18n runtime        [GATE HUMAIN: templates Meta]  ~10 j
W10 Billing per-active-student          [GATE HUMAIN: Stripe]          ~6 j
W11 QA + harness + CI                                                  ~8 j
W12 Lancement pilote                    [GATE HUMAIN: deploy prod]     ~4 j
```

Parallélisme réel : W3∥W4 partiellement, W5∥W6∥W7∥W8 largement, W9 transverse à partir de W6.
À ~20 agents, le chemin critique est W1→W2A→W4→W6→W12 ; le reste se plie autour.

---

## W1 — Fondations DB + bugs latents (~5 j)

### W1.0 [HUMAIN] Appliquer la migration P0
Relire `20260727090000_keel_p0_commitments.sql`, puis **local uniquement** :
`npx supabase db reset`. Vérifier : 16 tables, seeds (`slot_vocabulary` 11, `food_groups` 30,
`substance_limits`, `substance_interactions`), RLS activé partout.
**Gate : rien de W1.2+ ne part avant.**

### W1.1 [∥] Migration tenancy
Nouveau fichier `supabase/migrations/<ts>_keel_tenancy.sql` (spec complète déjà produite) :
- `coaches`, `coach_clients` (CHECK `active ⇒ consent_granted_at NOT NULL`, index unique partiel
  1-coach-vivant-par-élève, **seat facturable = status='active'**), `coach_invitations`
  (`invite_token_hash` sha256 seulement, expiry, index unique partiel 1-pending-par-email),
  `coach_access_events` (écriture serveur only, lisible par l'élève).
- `profiles.keel_role text CHECK (student|coach) NULL` + `profiles.display_unit_system`.
- `coached_student_ids()` SECURITY DEFINER STABLE → `uuid[]`, usage
  `user_id = ANY((SELECT public.coached_student_ids()))` (InitPlan, jamais EXISTS par ligne).
- Policies **Tier A** (SELECT coach) sur : plan_versions, plan_commitments, protocol_events,
  commitment_evaluations, planned_deviations, weekly_reviews, contract_change_requests,
  student_safety_constraints (lecture), upcoming_contexts. **Aucune policy d'écriture coach.**
- Vues **Tier B** SECURITY DEFINER à allowlist de colonnes : `coach_student_directory`
  (profiles sans email/phone/birth_date/stripe), `coach_student_events` (protocol_events sans
  `student_note`). PostgREST = droits par rôle → les colonnes ne se restreignent QUE par vue.
- Index manquants (sinon seq scan à chaque écran coach) : `user_plan_items(user_id, status)`,
  `user_plan_item_entries(user_id, effective_at desc)`, `user_metrics(user_id)`,
  `user_victory_ledger(user_id, created_at desc)` — en `CREATE INDEX CONCURRENTLY`, migration dédiée.
- FK `ON DELETE CASCADE` vers `auth.users` sur toutes les tables neuves (purge RGPD).
**Vérif** : test SQL négatif — coach A lisant un élève de coach B = 0 ligne PAR RLS.

### W1.2 [∥] Buckets + RGPD
`<ts>_keel_storage.sql` : buckets privés `plan-documents`, `meal-photos` (policies : owner +
coach du owner via `coached_student_ids()`, service_role). Puis :
- `account-export-v1/index.ts` : étendre l'allowlist `SCOPE` (piège documenté : allowlist en dur)
  avec les 16+4 tables KEEL + les chemins storage.
- `purge-deleted-accounts/index.ts` : purge des 2 buckets **avec pagination** (piège documenté :
  `storage.list()` limite 100 — le pattern gdpr-exports ne suffit pas pour N photos).
- `account-deletion-v1` : cas nouveau « un COACH supprime son compte » → `coach_clients.status='ended'`
  pour tous ses élèves, notification élève, les données de l'élève restent SA propriété.

### W1.3 [∥] Les 4 bugs latents (bloquants US, indépendants de KEEL)
1. Rappels récurrents morts après 1 semaine : cron hebdo qui rappelle
   `seedReminderUntilNextSunday()` (`classify-recurring-reminder/index.ts:403`) pour tous les
   reminders actifs (aujourd'hui appelée uniquement depuis `RemindersSection.tsx`).
2. Planificateur cassé hors Europe : `schedule-whatsapp-v2-checkins` (cron `5 0 * * *` UTC) →
   provisionnement par fuseau (boucle sur les timezones distinctes des users, ou cron horaire
   qui provisionne les fuseaux dont la journée locale commence).
3. `logSafetyBandEvent` ignore `critical` (`_shared/guard-log.ts:60`) : inclure `critical`.
4. `planSchedule.ts:289-290` retourne `[]` silencieusement : brancher sur les tokens `mon..sun`
   (la base est déjà saine — CHECK + normaliseur) et **throw** sur token inconnu (R7).
**Vérif** : test unitaire par bug + un run de `schedule-whatsapp-v2-checkins` simulé America/New_York.

---

## W2 — Démolition contrôlée (~8 j) — l'ordre A→B→C est STRICT

> Doctrine : on désactive avant de supprimer, on supprime le code avant les tables,
> et chaque bloc part avec ses tests. La spec détaillée (graphe de dépendances vérifié,
> 4 points de couture depuis du code gardé) existe — la suivre.

### W2.A [S] Désactivation (1 migration + ~12 fichiers, réversible)
- Migration `<ts>_pivot_disable_legacy_surfaces.sql` : `cron.unschedule` de
  `trigger-level-review-transitions-v1` et `cleanup-architect-draft-scopes` ; DROP des 8 triggers
  Architecte (`on_profile_created_init_modules` — il seede le parcours identitaire FR à CHAQUE
  signup —, `on_week_completed_identity`, `on_module_*`, `on_forge_level_progression`, …).
- **AVANT de toucher au dispatcher** : extraire `session_style_commitment` de
  `feature_opportunity` vers `sophia-brain/skills/_shared/` (mécanisme transverse réinjecté dans
  TOUS les composeurs, y compris presence et safety — vérifié).
- Dispatcher (`dispatcher.prompts.ts`, `dispatcher.v2.ts`, `routers/routers.ts`,
  `router/active_flow_state.ts`) : retirer les signaux `feature_opportunity` ; débrancher le sas
  potion local et `potion_support_admission` ; retirer `state_potion` du contrat
  `coaching_recommendation` (attention : `Exclude<CoachingFeatureSuggestion,'state_potion'>` dans
  `contract.ts` — c'est un changement de TYPE, pas une branche) ; retirer l'entrée
  `PotionSupportPresenceEntryContext` de `presence/state.ts`.
- `generate-plan-v2` : neutraliser les appels `classifyAndPersistProfessionalSupport` et
  `classifyAndPersistLevelToolRecommendations` (couture n°1 vérifiée).
- Frontend : démonter les routes `/architecte/*`, `/grimoire/*`, `/modules`, `/formules`,
  `/l-architecte`, `/tdah`, `/parrainage`, `/transformations/new` (les fichiers restent, W2.B les supprime).
**Vérif** : `deno test` sophia-brain vert, un tour de chat complet local sans potion/feature_opportunity,
signup ne seede plus `user_week_states`.

### W2.B [S] Suppression du code (~6 000 l. de skills + pages)
Périmètres exclusifs (un agent chacun, en parallèle une fois W2.A mergée) :
- **[∥] Edge functions** : `adjust-plan-v1` (4499 l.), `activate-potion-v1`,
  `archive-potion-session-v1`, `schedule-potion-follow-up-v1`, `generate-next-level-v1`,
  `complete-level-v1`, `classify-professional-support-v2`, `classify-level-tools-v1`,
  `prepare-phase-1-deep-why-v1`, `prepare-phase-1-story-v1`, `save-phase-1-deep-why-answer-v1`,
  `update-phase-1-runtime-v1`, `update-core-identity`, `complete-module`, `create-module-memory`,
  `generate-inspiration-v1`, `trigger-level-review-transitions-v1`, `complete-transformation-v1`.
  + purge des branches correspondantes de `process-checkins/index.ts` (6786 l. : potions ~125
  occurrences, level review, weekly-planning auto-validation) et de `whatsapp-send` (purposes level_*).
- **[∥] Machine de validation hebdo** (remplacée par le digest, décision actée) :
  `habit-week-planning-v1` (1613 l.), `_shared/weekly_planning_lifecycle.ts`,
  `weekly_planning_confirmation.ts`, `weekly_planning_ai.ts` (1 appel Gemini/user/semaine
  supprimé), `week_day_distribution.ts`, `onboarding_week1_validation.ts`,
  `schedule-onboarding-week1-validation`, les 3 event contexts et 2 templates.
  **Prérequis dans la même PR** : re-loger `activateDueWeekItemsForUser`
  (`weekly_planning_lifecycle.ts:247`, seul appelant) sur le cron de rollover hebdo,
  sinon le déblocage des semaines casse en silence.
- **[∥] Skills sophia-brain** : dossiers `feature_opportunity/`, `potion_support_admission/`,
  la branche potion de `coaching_recommendation/visible_agents/emotion_coaching.ts`,
  `_shared/v2-potions.ts`, `_shared/potion-*`, `_shared/professional-support.ts`,
  `_shared/level-tool-recommendations-v1.ts`, `_shared/level_review_checkins.ts`,
  `_shared/v2-next-level-generation.ts`, `_shared/v2-level-completion.ts`.
- **[∥] Frontend pages** : `IdentityArchitect.tsx`, `IdentityEvolution.tsx`,
  `ProductArchitect.tsx`, `Grimoire.tsx`, `ModulesPage.tsx`, `Formules.tsx`, `LandingTDAH.tsx`,
  `Parrainage.tsx`, `AddTransformationPage.tsx`, `components/architect/`, hooks associés
  (`useArchitect*`, `useModules`, `useEvolution*`, `usePotions`, `useInspirations`).
  **Chirurgie** (pas suppression) : `LabCardsPanel.tsx` (2406 l., 132× « potion ») → extraire
  les cartes d'attaque dans `frontend/src/keel/components/AttackCards.tsx`, supprimer le reste ;
  `BaseDeVieSection.tsx` → extraire `RemindersSection` (gardé), supprimer le reste.
**Vérif** : build frontend + deno check global + le test de couverture
`coverage-guard.int.test.ts` **mis à jour** (sa liste est périmée : 27/73 — la rafraîchir fait
partie de ce lot, c'est lui le filet des vagues suivantes).

### W2.C [S] [HUMAIN] Drop des tables (après W2.B déployée + dump pris)
Migration écrite par agent, appliquée par Ahmed : FK `user_recurring_reminders.source_potion_session_id`
d'abord (seule FK gardée→droppée, vérifiée) + CHECK cleanup (`initiative_kind`, `source_kind`),
puis DROP : tables architecte (7), potions, level reviews/generation events, professional support (2),
modules/week_states (3), `user_habit_week_plans`, colonnes de planning de
`user_habit_week_occurrences`, `user_inspiration_items`, `user_level_tool_recommendation*`.

---

## W3 — Safety d'abord (~6 j) — AVANT toute relance alimentaire

### W3.1 [∥] Pregate déterministe
`sophia-brain/safety/safety_context.ts` : remplacer le stub (`initialSafetyContext` retourne
`'none'` en dur, vérifié) par un vrai pregate : lexique EN + FR (idéation, automutilation,
détresse aiguë) posant un **plancher** que le LLM peut monter mais jamais descendre ;
écrire la colonne de trace `safety_pregate` (re-NOT NULL à terme).

### W3.2 [∥] TCA / disordered eating
- Plancher `restriction_flag` **déterministe, non contournable** (module
  `_shared/keel/restriction_guard.ts`) : perte >1,2 %/sem sur 2 sem glissantes OU ≥3 j
  consécutifs `energy` observée < cible−25 % OU token compensatoire dans
  `protocol_events.student_note`/chat (`skip`, `make up for`, `burn off`, `purge`,
  `fast to compensate`) OU auto-éval ≥8 avec coverage <3/7 et perte accélérée.
- Effet : **toute pression d'adhérence suspendue** (plus aucun rappel de conformité, plus aucun
  score affiché à l'élève), `contract_change_requests` `urgency='immediate'` hors digest,
  et flow `disordered_eating_guard` (nouveau skill, sortie **clinique**, distincte de la crise
  suicidaire — pas la hotline 988 par défaut, mais NEDA/BEAT + escalade coach).
- Ceinture B2 de BELT_AUDIT (UL sans signoff ⇒ dégradé) branchée au rendu.

### W3.3 [∥] Ressources par pays + contraintes structurées
- Table `crisis_resources(country, kind, label, contact)` seedée US (988/911), UK (999/116 123),
  FR (3114/15) ; remplacer les numéros FR en dur (`safety_crisis/reducer.ts:472`,
  `visible_agent.ts:70`, `agents/sentry.ts:211`) par une résolution par pays, fallback **bruyant**.
- Chargement de `student_safety_constraints` À CHAQUE TOUR (hors mémoire LLM) dans le contexte
  du composeur + **validateur déterministe post-génération** : toute sortie contenant un token
  `severity='medical'` de l'élève est rejetée et régénérée.
- Étendre `direct_effect_gate` : le vocabulaire d'effets s'ouvre à `log_protocol_event` et
  `declare_deviation` (W4) — la safety les bloque en bande ≥ medium comme les 2 existants.
**Vérif** : scénarios adversariaux TCA (3 personas EN, W11 les industrialise) + test que le
plancher n'est pas descendable par un frame LLM.

---

## W4 — Boucle élève : l'évaluateur et le runtime (~12 j) — le cœur

### W4.1 [S] L'évaluateur (`supabase/functions/_shared/keel/evaluator.ts` + `evaluate-adherence-v1`)
Pur, sans I/O, testé sur les fixtures de SCHEMA.md (fixture = définition de done) :
- Branches nommées (CONTRACT R6) : `do`/`avoid` (défaut inversé)/`capture` ;
  `dose` (somme des prises de LA préparation) ; `micronutrient` (somme des quantités
  **explicitement reportées**, jamais déduites d'un aliment — non-input n°3) ;
  `food_group_ref` (match + résolution `class_equivalent` via `swap_policy`) ;
  `nominal` (pré-semé) vs `opportunistic` (naît du fait) ; `auto_source` muet ⇒ `unknown`
  jamais `missed` ; `counts_toward_adherence=false` ⇒ hors adhérence.
- Sortie double `status × timing_status`.
- Formule d'adhérence normalisée (contribution max `w(priority)`/jour, poids effectif
  `w × coverage`) + `coverage` séparée + gate `<4/7 ⇒ insufficient_data`.
- **Interdits testés** : n'importe pas `relations.ts`, ne lit pas `content` (tests d'import
  ceintures B1/B4).

### W4.2 [S] provision-day + balayage de fin de journée
`provision-day-v1` (cron par fuseau, réutilise le fix W1.3-2) : pré-seme les évaluations
`nominal` du jour en `unknown` ; balayage 23:59 local : `nominal` non résolu ⇒ `missed`.
Republication d'une `plan_version` ⇒ **invalide et re-sème** les évaluations et
`scheduled_checkins` en vol (classe phantom-commit, payée en P0 legacy).

### W4.3 [S] Effets durables `log_protocol_event` + `declare_deviation`
Chaîne doctrinale complète, calquée sur `track_progress_plan_item` (fork, pas mutation) :
contract (`contracts/turn_frame.v1.ts` : union `DirectEffectType` +2) → gate (W3.3) →
executor (write-through : `protocol_events` inséré et RELU, idempotence
`(user_id, source_message_id)`) → ledger → renderer (accusé grounded uniquement sur commit).
Fixe au passage la sémantique « item tué à la 1ʳᵉ entrée du jour » : le chargement des cibles
du jour devient slot-aware (un petit-déj loggé ne fait pas disparaître le dîner).

### W4.4 [∥] Dispatcher re-câblé + flow plan_question
- Contexte plan du dispatcher : pour `keel_role='student'`, le bloc plan est construit depuis
  `plan_commitments` (nouveau `context/keel_plan_context.ts`), plus `user_plan_items`.
- Nouveau signal/flow léger `plan_question` : « je peux remplacer X par Y ? » → résolution
  **Tier 0 déterministe** par `swap_policy`+`food_groups` (les deux sont `STARCH` ⇒ oui,
  2 secondes, zéro escalade) ; hors politique ⇒ `contract_change_requests` (l'IA remonte,
  le coach décide — `suggested_option` = brouillon jamais appliqué).
- `weekly_review` skill : ses 2 sorties mortes (adjust plan / niveau suivant) remplacées par
  la synthèse coach (W7).

### W4.5 [∥] App élève web
`frontend/src/keel/pages/` : `TodayPage.tsx` (créneaux du jour groupés par slot, cocher,
photo, bouton « declare a deviation » de première classe), `ProgressPage.tsx` (régularité,
séries, jamais le poids en premier), routes `/app/today`, `/app/progress` gardées par
`keel_role='student'`. Réutilise `t()`/`en.ts`.

### W4.6 [∥] Rappels par créneau + digest dominical branché
- `scheduled_checkins` : nouveaux `event_contexts` `keel_slot_reminder:<slot>` dérivés des
  commitments `nominal` de la journée (provisionnés par W4.2) ; combler le trou proactif
  10:00–16:45 pour les slots lunch/snack_am (nouvelles fenêtres) ; le plafond 2/jour ne
  s'applique qu'aux nudges non sollicités, pas aux rappels de slot opt-in.
- Digest dominical : `render.ts::renderSundayDigest` branché sur un `event_context`
  `keel_sunday_digest`, réponse élève en texte libre → élicitation `planned_deviations`.

---

## W5 — Photo (~6 j) — spec détaillée existante, la suivre

- W5.1 [S] `whatsapp-webhook/wa_parse.ts:26-31` : CONSERVER `m.image` (id, mime, sha) au lieu
  de le jeter ; `_shared/whatsapp_graph.ts` : `fetchWhatsAppMedia(mediaId)` (GET metadata + GET
  binaire lookaside avec Bearer, **dans le même invoke** — URL courte durée, pas de différé) ;
  honorer `isMegaTestMode()`/`__SOPHIA_WA_LOOPBACK` sinon les runs QA appellent Meta en vrai.
- W5.2 [S] `whatsapp-webhook/handlers_meal_photo.ts` : rate-limit par user, gate tier recopié
  (le gating vit APRÈS le point d'insertion — sans recopie, une photo contourne le paywall),
  upload bucket `meal-photos`, insert `protocol_events(source='photo')` RELU, puis analyse.
- W5.3 [∥] `_shared/keel/meal_analysis.ts` + `analyze-meal-photo-v1` : verdict de **conformité
  au plan en contexte** (groupes présents/absents, portion approximative, match du commitment) —
  **jamais de calories affichées** ; filtre anti-hallucination : tout
  `matched_commitment_id` hors de la liste des commitments du jour est rejeté.
- W5.4 [∥] `meal-photo-upload-v1` (web) + bouton photo dans `TodayPage`.
- W5.5 [∥] Benchmark interne : 100-150 photos réelles annotées, métrique = **taux de faux
  positifs « conforme »** (c'est lui qui détruit la confiance du coach, pas le rappel).
Coût vérifié : ~0,0015 $/photo (~0,12 $/élève/mois).

---

## W6 — Espace coach complet (~10 j)

- W6.1 [S] **Auth coach** : signup sans téléphone obligatoire (débrancher la normalisation +33
  et le champ requis pour `keel_role='coach'`), `CoachRoute` (garde : ligne `coaches` active),
  page `/coach` (liste élèves + compteur de sièges actifs).
- W6.2 [S] **plan-publish-v1** : template → clone+diff par élève → `plan_versions(status='published')`
  (supersede l'ancienne, index unique partiel), copie des commitments avec `student_instruction`
  verbatim, **re-seed des checkins en vol** (W4.2), clic d'approbation par section horodaté
  dans `coach_access_events` (trace réglementaire).
- W6.3 [S] **Écran de relecture complet** (upgrade de `PlanImportPage`) : édition inline de
  chaque commitment (tous les axes), file « à vérifier » (needs_review d'abord — déjà fait),
  file « à compléter » (gaps → une ligne `auto_generated=true, priority='secondary'` que le
  coach accepte/édite/supprime au clavier), badge UL/signoff (gate provenance), bouton
  « Approve & publish » → W6.2.
- W6.4 [∥] **Templates** : CRUD `plan_templates`, bibliothèque du coach, `default_swap_policy`
  cochée une fois au niveau du template.
- W6.5 [∥] **Invitation** : `coach-invite-student-v1` (token 32B, sha256 stocké, email via le
  pipeline Resend de `send-welcome-email` — idempotence `communication_logs`), page `/join?token`
  (RPC anon `preview_coach_invitation` : prénom coach + email pré-rempli seulement),
  acceptation au signup via metadata (pattern parrainage, try/catch : un bug d'invitation ne
  casse jamais un signup) + RPC `accept_coach_invitation` pour compte existant.
- W6.6 [∥] **Vue élève côté coach** : `/coach/clients/:id` en lecture seule (JWT coach + RLS,
  jamais d'impersonation), chaque ouverture loggée dans `coach_access_events`, révocation de
  consentement par l'élève dans `/account` (ferme l'accès au tour suivant via
  `coached_student_ids()`).
- W6.7 [S après W7] **Le lundi matin** : file de triage par `risk_band` (matrice), 3 décisions
  pré-instruites, `coach_draft_reply` grounded sur les faits, `contract-change-decide-v1`
  (le coach répond aux `contract_change_requests` → applied/declined).

---

## W7 — Bilans réécrits (~7 j)

- W7.1 [S] **Bilan du soir** : cibles chargées depuis `commitment_evaluations` du jour ;
  « j'ai aussi mangé X » pendant le bilan crée un `protocol_events` opportuniste (le maillon
  manquant documenté du legacy devient natif) ; arbitrage de preuve (`evidence_validity`)
  conservé.
- W7.2 [S] **Bilan hebdo** : calcul **déterministe SQL** (pas LLM) de coverage/adhérence par la
  formule W4.1 ; `risk_band` matrice (adhérence × outcome, `disengaged` prioritaire,
  `restriction_flag` écrase tout) ; capture outcomes (poids moyen 7 j, biofeedback
  faim/énergie/sommeil/digestion 0-10) ; `plan_version_changed_midweek` ⇒ deux segments,
  jamais une moyenne de deux contrats ; conversation de bilan = restitution + élicitation,
  les chiffres viennent du SQL (la trace « récap confabulé » du legacy est structurellement
  éteinte).
- W7.3 [∥] **Winback recalé sur la coverage** (fenêtre S8-S12, le moment documenté du décrochage) :
  seuils sur `logging_coverage` et non sur les réponses aux bilans ; ton = porte ouverte,
  jamais culpabilisant (mécanisme documenté : la honte précède le silence).

---

## W8 — Cartes templates (~5 j)

- W8.1 [S] Migration `<ts>_keel_cards.sql` : `card_templates` (owner_scope global|coach,
  `trigger_spec` {slot, contexts[], time_bucket}, `variables` typées [{key,label,type,options}],
  `body_template` à slots), `student_cards` (variable_values, rendered, keyword normalisé,
  coach_approved), `card_wins`.
- W8.2 [S] **Unifier les 6 techniques d'attaque** : le catalogue est codé en dur à DEUX endroits
  qui ont déjà divergé (`generate-attack-card-v1/index.ts:37-127` et
  `frontend/.../attackTechniquePreviews.ts`) → une seule source seedée dans `card_templates`
  (owner_scope='global'), FE et BE lisent la table.
- W8.3 [∥] Rendu **déterministe** des cartes (variables → body, zéro LLM sur le chemin
  d'écriture — leçon defense-card-ui-qa : l'enrichissement LLM réécrivait le texte de
  l'utilisateur ; ici l'édition coach/élève est sacrée), 8-10 templates nutrition/protocole
  seedés (restaurant, craving du soir, meal prep, rattrapage après écart, faim entre repas,
  déplacement, hydratation, fenêtre de jeûne sociale).
- W8.4 [∥] **Armement contextuel** : `upcoming_contexts` + `planned_deviations` déclenchent la
  carte pertinente **3 h avant** l'événement (le flex déclaré à l'avance arme la défense —
  après le repas c'est inutile). `card_wins` loggé depuis la conversation (le signal existait
  en legacy mais n'écrivait rien — cette fois l'executor écrit).

---

## W9 — Anglais total + i18n runtime (~10 j, transverse dès W6)

- W9.1 [S] **Prompts par classe** (doctrine actée) : Classe A (dispatcher, extracteurs, juges)
  réécrits UNE fois en anglais — la langue y est invisible ; Classe B (composeur, digest,
  bilans) : anglais + voice pack. Le prompt dispatcher (878 l.) se réécrit en purgeant les
  32/38/17/9 mentions des flows supprimés **sans toucher aux règles safety entrelacées**
  (relecture croisée obligatoire).
- W9.2 [∥] `resolveResponseLocale()` branché dans le composeur (bloc RESPONSE_LANGUAGE en
  dernière instruction) + `conversation_locale` persisté sur le fil.
- W9.3 [∥] **Ceintures** : exécuter BELT_AUDIT — geler les SURFACE_FORM derrière
  `locale.startsWith('fr')`, remonter les BUSINESS_INVARIANT dans la couche sans langue AVANT le gel.
- W9.4 [∥] **WhatsApp** : catalogue `(purpose, lang)` + `resolveTemplate` (jamais de repli
  silencieux vers une autre langue — incident `global_reach` ×3) ; corps EN des ~3 templates
  indispensables (door-opener, check-in, bilan) ; **[HUMAIN]** soumission Meta (1 semaine d'avance).
  La fenêtre 24 h est vérifiée appliquée → tout le reste passe en texte libre.
- W9.5 [∥] Surfaces existantes minimales en EN : Auth, Account, Chat (les pages KEEL naissent EN).
  Landing EN « the runtime of the protocol you wrote » (nouvelle page, la FR reste sur sa branche).
- W9.6 [∥] Mémoire : `domain_keys` v2 minimal (~10 clés protocole EN), seuils cosinus du topic
  router recalibrés sur un échantillon EN, le reste gelé (arbitrage n°7).

---

## W10 — Billing per-active-student (~6 j)

- W10.1 [S] Modèle : 49 $/mois plateforme + 12 $/élève **actif** (≥3 interactions/mois,
  compté sur `protocol_events`+`chat_messages`, défini contractuellement). Stripe :
  subscription 2 items (flat + metered/quantity), job mensuel de réconciliation depuis
  `coach_clients.status='active'` + activité. **[HUMAIN]** : produits/prix Stripe, webhooks.
- W10.2 [S] **Entitlement hérité** (bloquant vérifié : sans ça l'élève voit « ton essai est
  terminé ») : `recompute_profile_access_tier` étendue — un user avec `coach_clients.active`
  et un coach solvable a accès, sans abonnement propre. Attention aux 4 endroits où les tiers
  sont en dur (`_shared/billing-tier.ts`, `frontend/src/lib/entitlements.ts`, 2 CHECK SQL).
- W10.3 [∥] Essai coach 14 j / 3 élèves / plafond de messages ; page billing coach avec
  compteur de sièges ; PAS de tier gratuit permanent (COGS ~6 $/élève actif).
- W10.4 [∥] **Zéro pixel** Meta/Google/TikTok sur toute surface authentifiée (risque
  d'enforcement n°1 — FTC HBNR), vérification automatisée dans la CI (grep des SDK).

---

## W11 — QA + harness + CI (~8 j)

- W11.1 [∥] Personas EN : 2 coachs (prescriptif / protocole), 4 élèves dont **3 adversariaux
  TCA** (restricteur, binge-purge, orthorexique) ; scénarios golden : les 6 scénarios produit
  (upload 4 pages, resto mardi soir, silence 5 jours, changement de plan mi-semaine, signal
  restrictif, mi-plan-mais-objectif-atteint).
- W11.2 [∥] Fixtures de route replay (40-60) sur le dispatcher re-câblé ; **un vrai juge LLM**
  (l'actuel `llm_as_judge` est un tas de regex FR sans appel modèle, vérifié).
- W11.3 [∥] Tests de propriété de l'évaluateur : l'honnête ne score jamais sous le cachottier ;
  capteur muet ≠ missed ; `unknown` hors dénominateur ; les 3 fixtures SCHEMA passent.
- W11.4 [∥] E2E Playwright : coach (import→review→publish→invite) et élève (join→today→log→photo).
- W11.5 [S] CI complète : `lint:keel-tokens` + deno tests + tsc + coverage-guard à jour +
  test RLS négatif + grep anti-pixel.

---

## W12 — Lancement pilote (~4 j)

- W12.1 [HUMAIN] Runbook de déploiement : `supabase db push` (relu), `functions deploy`
  (liste exacte), secrets (`KEEL_VISION_MODEL`, clés), Vercel env, templates Meta approuvés.
- W12.2 [∥] Monitoring : coût LLM par élève (les vues `llm_usage_events` existent),
  santé du pipeline d'évaluation (jours sans provision = alerte), `cache_read_input_tokens`
  vérifié en prod (l'échec du prompt caching est silencieux).
- W12.3 [∥] Légal : disclaimers (« not a medical device… » — formulation store littérale),
  consentement granulaire à l'intake, DPA coach (controller/processor), CGU EN.
- W12.4 [HUMAIN] Onboarder LE coach : créer son compte, importer ses vrais plans (P−1 aura déjà
  eu lieu), inviter 15 élèves, prix pilote 49 $/mois 8 semaines avec engagement écrit.
- Métriques de sortie (instrumentées dès W6/W7) : ratio Tier 0/Tier 1 réel, temps de check-in
  avant/après, taux de correction sur l'écran de relecture.

---

## Carte de parallélisation (l'armée d'agents)

```
Vague    Agents parallèles max   Périmètres exclusifs
W1       3                       tenancy / storage+RGPD / bugs latents
W2.A     1 (séquentiel strict)   dispatcher+migration
W2.B     4                       edge fns / validation hebdo / skills / frontend
W3       3                       pregate / TCA / ressources+contraintes
W4       2 puis 4                évaluateur+provision (S) puis effets/dispatcher/app/rappels
W5       2 puis 3                webhook+handler (S) puis analysis/web/benchmark
W6       2 puis 4                auth+publish (S) puis review/templates/invitation/vue coach
W7       2                       soir / hebdo+winback
W8       1 puis 2                migration+unification puis rendu/armement
W9       5                       prompts / locale / ceintures / whatsapp / surfaces+mémoire
W10      2                       stripe+entitlement / essai+pixel
W11      4                       personas / replay+juge / propriétés / e2e
W12      2 + humain              monitoring / légal
```

Règles pour chaque agent : lire CONTRACT.md + SCHEMA.md d'abord ; périmètre de fichiers
exclusif ; `deno check` + tests + `npm run lint:keel-tokens` avant de rendre ; jamais de
`db push`/`deploy`/`secrets` (gates humains) ; toute divergence avec le contrat se résout
en faveur du contrat ; une vérification croisée (agent dédié) clôt chaque vague.

## Ce qu'on refuse de construire (rappel, pour couper court en cours de route)

Ontologie nutritionnelle / table de composition aliment→nutriment ; auto-évaluation du jeûne ;
notation des écarts de timing d'absorption ; carnet d'entraînement détaillé ; white-label ;
impersonation ; palier illimité ; tier gratuit permanent ; validation hebdo par l'élève sous
toute forme ; segment macros-pur en v1 (intégration MFP/Cronometer = post-pilote).
