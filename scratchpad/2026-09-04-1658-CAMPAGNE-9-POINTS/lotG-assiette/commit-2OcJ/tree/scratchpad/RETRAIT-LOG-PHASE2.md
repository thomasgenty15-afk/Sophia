# Retrait des résidus grand public — journal (phase 2 : suppression autorisée)

Autorité : `docs/keel/RETRAIT-RESIDUS-GRAND-PUBLIC.md` · `docs/keel/MODEL.md`
Branche `ff-001-quotidien-du-coach`. Démarré le 2026-08-08 ~01:05 CEST.

## Le fait qui gouverne cette phase

**Décision humaine du 2026-08-08** (session « quotidien du coach », AskUserQuestion) :

1. Le produit B2C « coach de vie » (autre projet Supabase) a **0 utilisateur** —
   « on peut supprimer tout ça ». R-AUTRE-PROJET et R-BRANCHE-FR tombent.
2. Attaque/potions : **retirer les deux**, travail non déployé compris. R-CASCADE tombe.
3. Rappels récurrents : **retirer**.

Cette décision renverse les verdicts « GARDÉ » de la phase 1
(`be1ac89e`, migration `20260808060000_retrait_residus_raisons_de_conservation.sql`)
et les arbitrages BUILD_PLAN n°1 / `App.tsx:187` / `dispatcher.prompts.ts:59`.
Mémoire : `b2c-zero-users-full-removal-authorized.md`.

## Contexte d'exécution

- Phase 1 exécutée par la session « Retrait résidus produit grand public »
  (terminée 00:52) : lot 6 architecte parti (`1f4666a9`), user_metric_entries
  (table jamais existée) débranchée (`72421e3d`), week_plan_lifecycle.ts doublon
  parti (`62f44278`), bloc dashboard-capabilities coupé pour KEEL (`46d9d8ba`),
  raisons posées (`be1ac89e`).
- Sessions ACTIVES pendant cette phase : « Chantier chat FF-008 à FF-013 »
  (working tree partagé — je ne stage que mes fichiers, jamais de stash/reset)
  et « campagne QA chat conditions réelles » (base locale partagée — dans chaque
  lot le CODE part d'abord, la table n'est droppée qu'une fois plus rien ne la lit).
- Rouges préexistants connus (prouvés par la phase 1 sur worktree détaché) :
  `run_keel_conversation_loop_test.ts:166` (antérieur, commité) ;
  `meal_declaration_floor_test.ts:217` (causé par le working tree de FF-008/013).

## Baseline budget de prompt (HEAD be1ac89e, harnais measure_context.ts)

| Scénario | chars | tokens |
|---|---|---|
| A · companion nu | 4601 | 1151 |
| B · + plan V2 actif | 6528 | 1632 |
| A-keel · élève KEEL | 3278 | 820 |
| E · message contenant « rappel » | 5352 | 1338 |
| D · surface dashboard.reminders | 4773 | 1194 |

## Tableau des concepts

| Concept | Verdict | import/appel | type seul | comm. seul | prosrc | vues | cron | export RGPD | commit | prompt |
|---|---|---|---|---|---|---|---|---|---|---|
| `planned_deviations` | 🟢 GARDÉ (KEEL) | 3 lecteurs → 2 après lot 1 | — | — | keel_sweep_day_evaluations | — | — | exportée | — | — |
| chaîne 1:1 | 🟢 GARDÉE EXPRÈS | — | — | — | — | — | — | exportée | — | — |
| architecte | ✅ PARTI (phase 1) | 0 | 0 | 0 | 0 | 0 | 0 | — | `1f4666a9` | réel : 0 |
| cartes KEEL | ✅ PARTI | 0 (2 comm. JSX datés) | 0 | 2 | 0 | 0 | keel-arm-cards absent | 3 branches → motif vide-sans-sonde | ⚠️ dans `9bc9e6b8` (voir incident) | inchangé (6 tours, mesuré) |
| rappels récurrents | ✅ PARTI | 0 | 0 | comm. datés | 0 exéc. (2 comm.) | 0 | aucun dédié | jamais exportée | `f543fcc6` | E: 5352→4544 · D: 4773→3221 · tous tours: −57 |

## Lot 2 — rappels récurrents ✅ `f543fcc6`

Parti : classify-recurring-reminder/ (zéro appelant), pipeline process-checkins
(~380 l., chemin template DÉJÀ cassé — RPC quota inexistantes), bloc prompt
« RAPPELS RÉCURRENTS CONFIGURÉS », lecture E6, surface dashboard.reminders,
signal dispatcher jamais lu, follow-ups checkin_scope, colonne
scheduled_checkins.recurring_reminder_id, table (0 ligne).

**La bombe attrapée par R4 (prosrc)** : le trigger
`scheduled_checkins_enforce_min_gap_1h` lisait `new.recurring_reminder_id` —
colonne droppée = chaque insert de scheduled_checkins en erreur. Corrigé dans
la même migration + 3 autres fonctions SQL. Incident secondaire : première
réécriture de `cleanup_scheduling_for_user` trop large (aurait annulé les
bilans KEEL au changement de tier) — corps original restauré depuis
20260804140000, moins les clauses récurrentes. Fenêtre d'exposition locale
~01:29–01:35 (si la campagne QA a des erreurs d'insert scheduled_checkins ou
un tier-change bizarre dans cette fenêtre, c'est ce lot).

## Lot 1 — cartes KEEL ✅ (contenu dans `9bc9e6b8`, voir incident)

Retiré : `keel-cards-v1/` (5 fichiers), `CardsPage.tsx`, `keel/api/cards.ts`,
`card_render_test.sql`, entrée config.toml, entrée wiring-check, 3 branches
export RGPD (motif recurring_meals : clé de bundle conservée, vide, zéro sonde),
3 entrées + seed + assertion de `keel_gdpr_lifecycle_test.ts`.
Migration `20260808070000_drop_keel_cards.sql` : 4 tables (RESTRICT, enfants
d'abord) + 4 fonctions SQL. Appliquée localement, version enregistrée.

Épreuves après retrait : code = 0 appelant (2 commentaires JSX datés) ·
prosrc = 0 · vues = 0 · cron absent · 0 ligne élève en local.
Gardés : `planned_deviations` (2 lecteurs restants), `slot_vocabulary`,
`upcoming_contexts`, la redirection `/app/cards`.
Piège rencontré : `student_cards_render` doit RESTER dans l'acquittement du
coverage-guard (le scanner lit l'historique des migrations — précédent
`meal_plan_entries_touch`).
Vérif : Deno 3548 passed / 1 failed (= rouge antérieur connu) · vitest 508 ·
tsc vert · wiring-check : 2 unwired préexistants (prouvés à HEAD détaché,
chantier repas). Budget : INCHANGÉ sur les 6 tours (mesuré, attendu).

### ⚠️ INCIDENT de commit — collision d'index entre sessions

Entre mon `git add` et mon `git commit`, la session « Chantier chat FF-008 à
FF-013 » (active en parallèle sur le même working tree) a commité son journal
en emportant TOUT l'index partagé : mes 16 fichiers du lot 1 (3 910 suppressions)
sont dans `9bc9e6b8` (« le journal du chantier chat, avec ce qui a echoue »),
avec son message et son Co-Authored-By, pas les miens. Le CONTENU est intègre
et vérifié (`git show --stat`) ; les preuves du lot vivent dans l'en-tête de la
migration, qui fait partie du commit. Pas de réécriture d'histoire tant que des
sessions écrivent. Réparation possible plus tard (scission en deux commits),
proposée dans le rendu final.

Protocole adopté ensuite : add + commit en UN SEUL geste shell, index jamais
laissé chargé, `git show --stat` de contrôle après chaque commit.
| attaque/potions | ✅ PARTI | 0 | AttackCardContent→lots 5/6 | comm. datés | 0 | 0 | 0 | jamais exportées | `c1924a77` | tous tours: −181 (A-keel 3221→3040) |

## Lot 3 — attaque & potions ✅ `c1924a77`

Découverte : le sas potion et le catalogue étaient DÉJÀ supprimés (W2.A/W2.B,
démolition B2C 2026-08-06) ; l'import attack-keyword de run.ts était mort ;
les mémoires « chantier en attente de deploy » étaient périmées. Parti : le
module attack-keyword + utilitaire orphelin + helper QA, lectures du récap
durable, teaser potion du catalogue, source potion de checkin_scope, colonne
user_plan_items.attack_card_id, 3 tables (attack, support_cards, potions).
Lignes VIVANTES corrigées : le prompt companion FR (servi aux élèves KEEL
francophones — sélection par locale) vendait encore « Ressources: cartes
d'attaque/défense, potions/état » ; le contrat de test vérifie désormais
l'ABSENCE. Gardes survivantes listées dans l'en-tête de migration.
| habitudes + plans (fusion) | ✅ PARTI | 0 exéc. hors chokes datés | v2-types→reste | comm. datés | 0 | 0 | rollover déprogrammé | motif vide-sans-sonde | `2692655c`+`fd5a2a4e`+`0269bc30` | B: 6290→4363 |
| colonne vertébrale + satellites (21 tables) | ✅ PARTIE | chokes datés | v2-types→reste | comm. datés | 0 | 0 | 20 jobs restants sains | motif vide-sans-sonde | `fd5a2a4e`+`0269bc30` | — |

## Fin de chantier (04:00) — état final

- Migration `20260808100000_drop_plan_transformation_cascade.sql` : 21 tables
  (cœur 10 + 11 satellites révélés par la carte FK), cron rollover déprogrammé,
  4 fonctions SQL, FK de system_runtime_snapshots (colonnes conservées).
  Appliquée localement, version enregistrée après exit-0 seulement (incident :
  un `| tail` avait masqué un échec psql et enregistré une version annulée —
  purgée puis rejouée). RESTRICT a attrapé 2 défauts d'ordre (victory avant
  items ; FK circulaire cycles⇄transformations).
- Suite finale : Deno 3418/1 (rouge antérieur connu), vitest 508, tsc vert,
  prosrc ZÉRO, vues ZÉRO, insert scheduled_checkins OK.
- Budget final (6 tours types) : A/B/E = 4363 · A-keel/C/D = 3040.

## RESTES NOMMÉS (chantiers suivants, pas des oublis)

1. **Dépose fine de la lane track** — 38 fichiers du routeur (contrats
   turn_frame, dispatcher.v2/prompts, gates, ledger adapter, visibility, outil
   track_progress_plan_item/, off_schedule_credit) : NEUTRALISÉE par
   court-circuit daté (`track_progress_lane_removed`), pas encore déposée. Le
   prompt dispatcher porte encore son vocabulaire.
2. **Le membre B2C du prompt companion FR** — PLATFORM_SKETCH (Plan/
   Inspirations), dashboardCapabilities(Lite)Addon, dispatcher legacy : servis
   à personne (KEEL les saute, B2C=0), à déposer avec l'audience legacy.
3. **Le système de surfaces** — 2 surfaces inertes restantes
   (dashboard.personal_actions, dashboard.preferences), aucun écrivain.
4. **momentum/rendez-vous decision machinery** — tourne sur données vides ;
   module rendez_vous_decision, momentum_state à disséquer.
5. **v2-types.ts / frontend types/v2.ts** — vocabulaire legacy massif, types
   seulement.
6. **Pages frontend legacy W2.B** + `frontend-site-map.ts` (trouvé phase 1).
7. **Incident `9bc9e6b8`** : le lot 1 (cartes KEEL) vit dans le commit journal
   de la session FF (collision d'index) — scission possible à froid.
8. **Docs `docs/keel/RETRAIT-*.md`** : encore non suivis (??) — à commiter et
   à mettre à jour avec les verdicts renversés.

## Architecture des lots restants (décidée ~02:05)

Les modules du lot 6 lisent aussi les tables des lots 4/5 → dropper les données
par lot casserait le suivant. Découpe retenue, conforme à « des tables liées
partent ensemble » :
- **Commit A** — machinerie d'exécution du plan : v2-weekly-bilan-engine (0
  importeur), review-plan-v1 (0 appelant, dit par deploy-manifest-check),
  keel-week-rollover-v1 (rollover du plan V2 malgré son nom ; CRON ACTIF à
  déprogrammer en C), branches de schedule-checkins-v2 + process-checkins
  (weekly review, occurrences, signal plan_entry du winback),
  trigger-memorizer-daily, memory/runtime/loader (loadActiveActionSignals),
  blocs loader (E6 plan, currentWeekPlanContext, planItemIndicators, surface
  dashboard.personal_actions), LA LANE track_progress_plan_item du routeur
  (38 fichiers : dispatcher, turn_frame, gates, ledger, visibility),
  plan_snapshot_runtime + 4 importeurs, action_occurrences, off_schedule_credit,
  weekly_progress_review + prompts companion plan. PAS de drop de table.
- **Commit B** — colonne vertébrale : momentum_state (9 importeurs), momentum_v2,
  v2-runtime, v2-week-activation, v2-plan-distribution, v2-phase1,
  v2-lab-context, v2-transformation-materialization, v2-intake-unified,
  transformation_handoff, momentum_morning_nudge, rendez_vous_decision,
  lectures pulse_builder, surfaces restantes + système de surfaces. PAS de drop.
- **Commit C** — UNE migration : cascade complète (user_plans_v2, plan_items,
  entries, 3 tables habitudes, transformations, cycles, victory_ledger,
  metrics) + unschedule keel-week-rollover-v1 + épreuves globales + mesure.
