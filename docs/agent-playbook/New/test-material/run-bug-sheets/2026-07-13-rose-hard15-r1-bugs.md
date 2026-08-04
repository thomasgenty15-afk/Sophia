# Feuille de suivi bugs — rose-hard15-r1 (2026-07-13)

Run: `rose-hard15-r1` — persona Rose — verdict global **red**.
Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`.

## Synthèse

Fil rouge système = **instabilité du « today » de référence** pour les dates
relatives (parse ↔ commit ↔ rendu non alignés) : produit 1 effet durable faux
(T11, red) + 2 messages de date trompeurs (T3, T13, yellow). S'y ajoutent :
arbitrage safety V5-1 non porté (T10), recall mémoire inter-session non
fonctionnel (T16), lacune KB product_help (T12), handoff advisory tardif (T7).

Re-vérifs de fixes Rose du 13/07 : **BF-LEDGER-01 (T14) tient**, phantom-create
status-à-slots **évité (T13)**, accueil-first **tient (T1/T10)**.

## Lignes de suivi

| Tour | Famille | Owner runtime | Source amont probable | Correction recommandée | Test d'invariant | Statut |
|---|---|---|---|---|---|---|
| T11 | BF-INTAKE-04 | time_parser / lane create_one_shot_reminder | « demain matin » committé le 13/07 (aujourd'hui) au lieu du 14/07 ; incohérent avec le parse T10 (14/07) et T8 (« demain 18h »→14/07). « today » de réf. instable (13→12→14 selon les tours). | Une seule source `now` déterministe partagée parse→commit→rendu ; « demain » = now+1j. Vérifier si régression du fix P0-5. | `demain` résout à now+1j sur tous les tours d'un même run ; reminder DB = date annoncée. | `fix_applied` (2026-07-13, P3-B) — parseur déterministe prioritaire (ancré client_now, when_hint isolé) + « demain » forcé à J+1 même quand le parseur ne résout pas l'heure. Probe live 2× GREEN (02h49 → J+1). |
| T3 | BF-STATUS-03 | composeur reçu track_progress | Confirmation « au 13 juillet » alors que `effective_at`=12/07. Date verbalisée = `now`, pas `effective_at`. | Verbaliser depuis `effective_at` résolu, pas `now`. | date de confirmation track == `effective_at` de l'entry. | `fix_applied` (2026-07-13, P3-B rendu) — guidance DATES : la date énoncée = la date enregistrée de l'outcome, jamais now par défaut. |
| T13 | BF-INTAKE-04 | composeur / time base de rendu | « le 14 juil, donc pas demain » alors que now=13/07 → 14 EST demain ; faux doute induit. | Dériver demain/aujourd'hui d'un unique `now` déterministe ; ne pas comparer date DB à un « today » divergent. | comparaison date DB vs demain cohérente avec now. | `fix_applied` (2026-07-13, P3-B rendu) — guidance : demain/aujourd'hui dérivés UNIQUEMENT de user_local_datetime ; en doute, date absolue sans qualificatif (le « donc pas demain » nommé verbatim). |
| T10 | BF-ROUTE-04 | router safety/direct-effect (V5-1) + composeur | `risk_band=medium` + create explicite/haute-conf/bénin → bloqué par `distress_support_priority` (carve-out V5-1 non appliquée) ET rendu en négation de status (« tu n'as pas ce rappel »). | Servir le rappel bénin en medium non-escalade avec confirmation sobre en fin ; sinon différer explicitement. Jamais transformer un create en lookup nié. | create bénin explicite + risk medium (non-escalade) → servi ; sinon message « je le garde pour après ». | `fix_applied` (2026-07-13, P3-A) — la route distress_support admet la lane rappel malgré le seuil de band (carve-out V5-1 dans le bon sens) ; le tour ne se rend plus par la reply cannée (composeur + soutien d'abord, confirmation en fin). Probe live rose T10 : servi + ordre correct, 2× GREEN. En crise : différé `safety_crisis_deferred`, jamais un lookup nié. |
| T16 | BF-MEMORY | memorizer (embedding création) + planner retrieval + loader | Fait persisté « dimanche soir seule = point faible » non remonté sur un tour week-end ; `embedding=NULL` (différé cron compaction, `persist.ts:153`) + `memory_plan.targets=[]`. | Embedding à la création des memory_items (ou backfill synchrone fin de batch) + émettre targets taxonomiques quand le tour matche un domaine mémorisé. | fait domaine X mémorisé au tour N remonté au tour N+1 matchant X (scope neuf). | `fix_applied` (2026-07-13, P3-E) — embedding généré à la CRÉATION des memory_items (best-effort, cron en filet de backfill) : le recall sémantique inter-session ne dépend plus de la compaction différée. Volet targets taxonomiques planner : non traité, à surveiller. |
| T12 | BF-KB | KB product_help | Réponse procédurale : n'énonce jamais les différences de formule/features (même lacune que Paul untested15 T9). | Alimenter la KB paliers/features/pricing, ou assumer explicitement l'absence de détail tarifaire. | product_help sur facturation cite au moins les paliers ou dit clairement ne pas les détailler. | `fix_applied` (2026-07-13, P3-F) — KB abonnement enrichie des 3 formules réelles (System/Alliance/Architecte, groundées frontend) + honnêteté explicite : fonctionnalités et prix affichés sur la page Upgrade, jamais détaillés en chat. |
| T7 | BF-ROUTE-02 | coaching_recommendation flow / contrat handoff advisory | 2× « crée-la » → renvoi manuel tardif vers Ressources ; T5 laissait croire à une création assistée. | Annoncer la frontière chat=reco / création=Ressources dès l'intention de création explicite, au lieu de continuer la collecte de slots. | intention de création explicite dans un flow advisory → énoncé de frontière au 1er tour. | `fix_applied` (2026-07-13, P3-F) — règle « FRONTIÈRE ADVISORY DÈS L'INTENTION DE CRÉATION » (dispatcher local coaching) : la frontière s'énonce au tour même, avant de continuer la collecte. |

## Notes de validité / hygiène

- Run IA réel local : `force_full_ai=true`, dispatcher-v2-llm + companion (gpt-5.4-mini) + Gemini (research_grounding, embeddings) observés dans `llm_usage_events`. Aucun fallback.
- Memorizer déclenché **scopé `user_id` Rose** (1 seul user traité) — pas de balayage flotte.
- Isolation : scopes dédiés `qa-rose-hard15-20260713` et `…-recall-…`. Pas de run concurrent détecté (`conversation_runtime_events` = uniquement `brain:turn_complete`).
- État durable réinitialisé en fin de run (entries plan, scheduled_checkins, memory_items, chat_messages, temp_memory) — autorisation explicite guidelines §« reset état fin de run ».
