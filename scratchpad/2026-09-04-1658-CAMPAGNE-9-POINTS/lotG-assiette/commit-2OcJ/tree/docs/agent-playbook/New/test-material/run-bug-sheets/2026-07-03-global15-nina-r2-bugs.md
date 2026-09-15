# Feuille De Suivi Bugs — global15-nina-r2

Rapport associé: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-global15-nina-r2.md`
Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`

Run **valide** (16 échanges IA réels, `force_full_ai`, Supabase local, effets durables vérifiés + restaurés, mémoire e2e vérifiée). Verdict global **yellow** : un seul tour yellow (recap T12), cause dominante = artefact d'environnement. Aucun tour rouge, aucun effet durable erroné.

## R2-B01 — Recap nie le rappel du jour (contamination cron temps-réel)

- Bug id: `R2-B01`
- Tours: T12
- Famille: **BF-TEST-01** (trace/test/testabilité) — hypothèse secondaire à écarter: **BF-STATUS-01/02** (projection recap).
- Domaine owner: testabilité runtime (cron local `process-checkins` + endpoint `test-send-message`). Owner recap (`status`/projection) **seulement si** l'hypothèse BF-STATUS se confirme au rerun.
- Source amont: le cron `process-checkins` (`*/3 * * * *`, actif en local) tourne sur l'**horloge réelle serveur** ; le rappel one-shot du T6 avait un `scheduled_for` (20:30 UTC) dérivé du **`client_now` simulé** du soir. Temps réel > `scheduled_for` → le cron a fait passer le checkin en `awaiting_user` avant le recap. La réponse « aucun rappel de prévu » est cohérente avec l'état DB post-fire.
- Symptôme visible: user crée un rappel « ce soir 22h30 » (T6), puis le recap (T12) répond « aucun rappel de prévu ».
- Preuve système: checkin `62472f69` créé T6 (`scheduled_for 2026-07-03 20:30Z`, pending) → observé `status=awaiting_user` au moment du recap ; `now()` serveur ≈ 21:57 UTC (postérieur au `scheduled_for`) ; `cron.job` liste `process-checkins` actif `*/3 * * * *`. 0 recurring. Route T12: `normal_reply`/`normal_reply_default`. Contraste: Alex R4-T12 recap correct quand temps réel antérieur au fire.
- Correction attendue (architecture, pas wording):
  1. Isolation testabilité — garantir qu'aucun `process-checkins` ne tourne pendant un run QA (pause cron local pendant le run), OU aligner le `client_now` des tours créant des rappels datés sur le temps réel serveur, pour ne pas fabriquer un `scheduled_for` déjà passé.
  2. Rerun ciblé du recap **crons-off** (ou `client_now` = temps réel) : si le recap ignore alors un checkin réellement pending/futur du jour → requalifier en **BF-STATUS-01/02** (owner projection recap) ; sinon clore comme artefact.
- Statut: `open`
- Fix reference: —
- Tests requis:
  - Invariant positif: « rappel one-shot pending/futur pour aujourd'hui → recap le liste » (crons-off, `client_now` cohérent).
  - Anti-faux-positif: « rappel déjà fired/awaiting_user (passé) → recap peut légitimement dire aucun rappel *à venir* ».
  - Intégration testabilité: « run QA n'a aucun cron `process-checkins` actif concurrent » (hygiène inter-runs).

## Incidents d'environnement (non-produits, notés pour hygiène — pas des bugs Sophia)

### R2-E01 — Collision de run parallèle sur Alex
- Un run QA concurrent (`qa-phase3-alex-r1-…`) conversait avec Alex en parallèle et écrivait des effets durables sur le même `user_id` (traces + 3 `user_plan_item_entries` en < 20 min). `conversation_turn_traces`/`memory_items`/`scheduled_checkins`/compteurs de plan étant per-`user_id`, la vérification et le cleanup auraient été contaminés → bascule décidée vers Nina (baseline propre). Rappel guidelines: connexion/persona temporaire par run pour les probes parallèles.
- Action: aucune correction produit ; hygiène inter-runs (ne pas lancer deux runs concurrents sur la même persona).

### R2-E02 — Crash-loop OOM du edge-runtime sur tours lourds
- `docker events`: `container die … exitCode=137 signal=9` sur le container `supabase_edge_runtime_Sophia_2` à chaque tour lourd (dispatcher complet + coaching + prompts ~13k tokens) tant que le run parallèle Alex tenait la mémoire ; VM Docker limitée à 8 GB (`docker info TotalMem≈8.2 GB`), pas de limite mémoire par container. Un message trivial passait (HTTP 200) ; les tours lourds étaient SIGKILL. T1 (4 tentatives) et T3 (3 tentatives) retentés au point d'arrêt sans fallback, orphelins nettoyés, aucun effet dupliqué. Résolu une fois le run parallèle terminé + historique gardé concis (mém. totale retombée ~1.6 Go).
- Action: aucune correction produit ; outillage — augmenter la RAM Docker Desktop ou la limite mémoire worker edge-runtime pour les runs QA, et éviter les runs concurrents.

## Non-régressions confirmées (positif, pour suivi)

- `R1-B01` (récurrent → initiatives, pas de one-shot parasite): **tient** (T8).
- Fidélité de slot horaire dans draft d'initiative (yellow Alex R4-T11): **non reproduit** (T8, « 21h » préservé).
- Distinction carte de défense vs carte d'attaque (miss Alex R4-T6): **correcte** (T1 défense / T15 attaque).
- Résolution de conflit mémoire + pas d'identité figée: **correcte** e2e (memorizer run `fbdaf119`, version corrigée seule persistée, découragement capté comme état transitoire sensible).
