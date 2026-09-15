# Bug Sheet — Rose Global 15 — 2026-07-06 R4

Run: `global15-rose-20260706-r4` — scope `qa-global15-rose-2026-07-06-r4`
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-06-rose-global15-r4.md`
Persona: Rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`) — transformation « Arrêter le cannabis », plan V2 `05393e65`.
Verdict global: **yellow** (fluidité green, système yellow).

## Régressions R3 confirmées corrigées (contexte)

- **R3-B01 (BF-EFFECT-04/STATUS-01)** : non déclenché ici — T4 track une habitude boolean **sans atteindre la cible** (0/3 → 1/3), donc pas de transition → pas de conflit de trigger → compteur incrémenté OK. Confirme que le bug R3 est **conditionné à l'atteinte de cible**, pas au track. (Le bug de fond reste ouvert côté « cible atteinte via chat », statut R3 = won't-fix V1.)
- **R3-B02 (BF-STATUS-02)** : **corrigé** — T6 recap rappels exhaustif (récurrent actif `98a417ff` + one-shot).
- **R3-B03 (BF-MEMORY-01)** : **corrigé** — T13 fait personnel explicite persisté après batch (`068d9f38`, `63ef471a`).

## Bugs

### R4-B01 — Levier de coaching nommé rendu par `normal_reply` (skill coaching contourné)

- **Bug id:** R4-B01
- **Tours:** T1
- **Famille:** `BF-ROUTE-01` (mauvais owner sélectionné) ; accessoirement cohérence de technique (doctrine operation-suggestion, guidelines §Operation Suggestions)
- **Domaine owner:** dispatcher / route policy (owner selection) ; secondairement skill `coaching_recommendation` (logique de cohérence défense/attaque/mot-de-bascule, jamais atteinte)
- **Source amont:** arbitrage dispatcher — un signal coaching (`memory_plan.response_intent=coaching_recommendation`) est rendu par `normal_reply` (`reason_code=normal_reply_default`) quand l'utilisateur **nomme lui-même la technique** (« file-moi un mot de bascule »).
- **Symptôme visible:** sur un automatisme récurrent SUBI (joint réflexe du retour à la maison), Sophia produit directement un mot de bascule (« pause d'abord ») en réponse libre, **sans** ouvrir le cadre coaching (moment critique / signal de retour / plan B) et **sans garder de doute** sur la pertinence de la technique pour un automatisme.
- **Preuve système:** T1 `response_owner=normal_reply`, `reason_code=normal_reply_default`, `memory_plan.response_intent=coaching_recommendation`, ledger 0. Contraste T2 : dès « construis-moi un truc solide », owner bascule correctement `coaching_recommendation` (carte de défense) → le système sait router, il **sous-route T1**.
- **Correction attendue:** router les demandes de **levier de coaching nommé** (« mot de bascule », « une carte », « une technique pour… ») vers `coaching_recommendation`, afin que la logique de cohérence de technique s'applique (garder un doute si le wording force une technique incohérente, expliquer la différence, proposer les options proches). Un mot de bascule reste un **objet de coaching**, pas une réponse de conversation libre. Pas un patch regex « mot de bascule → texte » (figerait la mauvaise couche).
- **Statut:** `fix_applied` — chantier V2-C1 (2026-07-07)
- **Fix reference:** exemple sous-routé ajouté à la doctrine dispatcher (« file-moi un mot de bascule pour le joint réflexe du retour » → `skill_signals.coaching_recommendation`, JAMAIS une réponse normale directe : le skill porte la doctrine de cohérence de technique, une réponse libre la court-circuite) + micro-cadre local « nature d'action → technique » (un mot de bascule forcé sur un automatisme récurrent → doute exprimé + défense proposée à côté ; une vraie fenêtre de rupture demandée comme mot de bascule reste servie sans doute). Sweep dispatcher + coaching verts.
- **Tests requis:**
  - Positif : « donne-moi un mot de bascule / une carte / une technique pour <situation> » → owner `coaching_recommendation` (pas `normal_reply`).
  - Cohérence : technique nommée incohérente avec la situation (mot de bascule sur automatisme/repérage) → Sophia garde un doute, explique, propose défense/attaque.
  - Non-régression : demande de coaching sans technique nommée (« aide-moi sur ce moment ») → toujours `coaching_recommendation`.

### R4-B02 — Memorizer nocturne : sur-persistance (14 memory_items pour 7 rapportés, quasi-doublons)

- **Bug id:** R4-B02
- **Tours:** transverse (surface à la vérification du T13, mais concerne tout le batch)
- **Famille:** `à classifier` — BF-MEMORY, sous-type « sur-persistance / double-write ». La taxonomie n'a pas de code dédié : `BF-MEMORY-01` couvre l'**omission** (« garde ce repère » → `memory_items=0`), pas la **duplication**. À ajouter comme `BF-MEMORY-02` (mémoire sur-persistée / double-write) si validé.
- **Domaine owner:** memorizer nocturne — `trigger-memorizer-daily` + pipeline d'extraction/write mémoire (`supabase/functions/_shared/memory/memorizer/`).
- **Source amont probable:** double exécution de l'étape de persistance dans **un seul run** (idempotence manquante entre extraction et write), et/ou `canonical_key` dérivé du phrasé re-généré (deux passages produisent des clés divergentes pour un même fait → la dédup canonique ne collapse pas).
- **Symptôme visible:** un batch pour un fait personnel confié (T13) persiste correctement le fait — mais le run écrit **le double** de ce qu'il rapporte, avec des quasi-doublons actifs qui polluent le retrieval.
- **Preuve système:**
  - Batch `trigger-memorizer-daily` (user Rose) : réponse `persisted_count=7`, `accepted_item_count=7`, `durable_writes.memory_items=7`, `rejected_item_count=9`, `extraction_run_id=afee6401`.
  - DB : **14** `memory_items` rattachés au **même** `extraction_run_id=afee6401`, en **2 vagues** de 7 (`created_at` 2026-07-06 20:57:36 puis 20:57:47, ~11s d'écart).
  - Quasi-doublons sous `canonical_key` divergents (non collapsés) : automatisme retour-travail (`0fd5efa8` vs `cf8c15e3`), grinder-déclencheur (`91455d56` vs `9f47d3a6`), absence-idées-noires (`34aa6251` vs `d538ea95`) ; fait « sport matinal » stocké sous **2 domaines** (`addictions.cannabis…course_pied` `068d9f38` + `sante.activite_physique…sport_matin` `63ef471a`). Aucun `superseded_by_item_id`.
  - `run_id` identique ⇒ **pas** un trigger externe concurrent (qui porterait un autre `extraction_run_id`, cf. guidelines §Mémoire) ⇒ double exécution **interne** du write, hors comptabilité (le batch ne connaît que 7).
- **Correction attendue:** (a) idempotence du write mémoire par `(extraction_run_id, source_hash)` ou `canonical_key` normalisé **indépendant du phrasé** ; (b) réconcilier `durable_writes.memory_items` avec le nombre réel de lignes écrites (un écart 7 vs 14 doit lever une alerte d'observabilité).
- **Statut:** `fix_applied` — chantier X2 (2026-07-07), source identifiée : deux exécutions simultanées du même batch (cron local + trigger QA), la 2e réutilisant le run `running` de la 1re (mécanisme de reprise Z1) et persistant une 2e vague sous le même run_id — le marquage-après-persist de Z1 avait retiré le verrou implicite. Fix à la source : **verrou d'exécution** — un run `running` FRAIS (< 30 min) = exécution en cours, la 2e invocation s'écarte (`skipped/run_in_progress`) ; seul un `running` périmé est repris (territoire du balayage d'orphelins, inchangé). Test de concurrence par ré-entrance vert (1 seule vague écrite, N faits = N items).
- **Fix reference:** chantier X (2026-07-07)
- **Tests requis:**
  - Positif : un run de memorizer produisant N faits acceptés écrit **exactement N** `memory_items` (pas 2N).
  - Dédup : deux faits sémantiquement identiques du même run partagent un `canonical_key` et **un seul** survit `active`.
  - Observabilité : écart entre `durable_writes.memory_items` rapporté et lignes réelles → alerte.
  - Non-régression : le fait personnel explicite (T13) reste persisté (≥1 item actif), sans duplication.

## Notes

- Effets durables du run (nettoyés en fin de run) : entry `ca0c418a` (T4, sas), checkin `a5e8773e` (T5, one-shot demain 7h30), 14 `memory_items` + 15 `memory_message_processing` + extraction_run `afee6401` (batch de test), compteur `3db6278b` remis à 0.
- Aucune mutation de plan, aucune carte créée en chat, safety jamais contournée, aucune claim LEDGER sans commit, aucun double comptage (track fantôme T15 bloqué par l'executor).
- Baseline restaurée et vérifiée en fin de run (0 memory, 0 entry, sas 0/3, checkins 13/8/3, scope purgé, traces run supprimées). `updated_at` du sas rafraîchi par un trigger `BEFORE UPDATE` au reset — sans incidence sur `current_reps=0`.
