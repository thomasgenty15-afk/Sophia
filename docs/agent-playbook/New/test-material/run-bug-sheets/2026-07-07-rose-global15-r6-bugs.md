# Bug Sheet — Rose global15 r6 (2026-07-07)

Rapport source : `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-07-rose-global15-r6.md`

Run yellow. Objectif du run : surfaces non couvertes les 6-7 juillet (flow potion complet, feature_opportunity/initiatives complet, flag `needs_research`, frontières d'exécution produit).

---

## R6-B01 — `needs_research` détecté mais aucun consommateur runtime

- **Bug id** : R6-B01
- **Tours** : T5 (ask explicite « vérifie sur internet »), T11 (ask implicite « les dernières infos »)
- **Famille** : `a classifier` — signal contractuel sans consommateur (analogie BF-EFFECT-02 « effet attendu absent » ; pas un effet durable, donc hors taxonomie stricte)
- **Domaine owner** : sophia-brain runtime (router/agent_exec) + `_shared/gemini`
- **Source amont** : chaîne auditée pendant le run — le dispatcher produit le signal (règle 8, conf 0.98, query exploitable) ; `router/turn_context_runtime.ts:63-71` le mappe dans `DispatcherSignals` ; **aucun code ne lit `signals.needs_research`** ensuite ; `searchWithGeminiGrounding` (`_shared/gemini.ts:2130`) n'a aucun appelant ; le companion attend `RESEARCH_CONTEXT_MARKER = "=== RECHERCHE WEB (informations fraiches) ==="` (`agents/companion.ts:16`) que rien ne produit. Les deux extrémités existent, le milieu n'a jamais été branché.
- **Symptôme visible** : sur demande explicite de vérification web, Sophia répond honnêtement « Je n'ai pas accès au web en direct ici » et donne des connaissances générales. Pas d'hallucination de recherche (pas de BF-LEDGER-01) — mais la capacité promise par le contrat TurnFrame est un cul-de-sac.
- **Preuve système** : traces T5/T11 `needs_research: {detected:true, value:true, query:…, confidence:0.98}` + réponses visibles disant l'absence d'accès web ; grep repo : 0 appelant pour `searchWithGeminiGrounding`, 0 producteur du marker.
- **Correction attendue** : décision produit puis câblage — soit (a) exécuteur de recherche gated : si `needs_research.value=true` ∧ safety le permet ∧ budget dispo → `searchWithGeminiGrounding(query)` → injecter le bloc `RESEARCH_CONTEXT_MARKER` dans le contexte companion (le pin prioritaire existe déjà, `companion.ts:132-177`) ; soit (b) retirer `needs_research` du contrat effectif dispatcher pour ne pas payer la détection d'un signal mort. L'option (a) est cohérente avec le prompt companion qui référence déjà un « CONTEXTE WEB PRIORITAIRE ».
- **Statut** : `fix_applied` — chantier V4-1 (2026-07-08, décision produit : REBRANCHER). Module dédié `router/research_grounding.ts` : signal structuré `needs_research.value=true` (+ ceinture safety high/critical) → `searchWithGeminiGrounding(query)` → bloc « RECHERCHE WEB » injecté au composeur (pin prioritaire companion existant) ; échec/timeout → directive d'honnêteté (« ne dis JAMAIS avoir vérifié, réponds de mémoire en le disant ») — le claim de fausse fraîcheur est mort dans les deux branches ; events `sophia-brain:research_grounding` ré-émis (observabilité revenue). run.ts n'orchestre que (charte cmd 4/6). + contre-exemple dispatcher : info du monde externe (santé/études/actu) sans question Sophia → jamais product_help, réponse normale + needs_research. Tests triplet 27/27. **Probes live** (Nina) : échec → « Je ne peux pas lancer une recherche web fiable ce tour-ci… de mémoire… à vérifier » ; succès → vraie recherche exécutée (event `success`), réponse groundée et nuancée.
- **Fix reference** : `router/research_grounding.ts`, `router/run.ts`, `dispatcher.prompts.ts`
- **Tests requis** : contract dispatcher (explicite + implicite + négatif « pas besoin d'infos fraîches ») ; runtime : signal true → contexte recherche injecté (mock) ; invariant honnêteté : pipeline indisponible → la réponse ne claim jamais une recherche effectuée.

## R6-B02 — Dispatcher signale `product_help` sur une question d'information santé externe

- **Bug id** : R6-B02
- **Tours** : T11
- **Famille** : BF-ROUTE-01 — mauvais owner sélectionné
- **Domaine owner** : dispatcher global (route policy / prompt)
- **Source amont** : `dispatcher/dispatcher.prompts.ts` — la doctrine product_help (« le user demande comment marche Sophia… ») n'a pas de contre-exemple pour l'information du monde externe (santé, science, actualité). Reason émis : `external_health_info_request_on_cbd_and_cannabis_with_followup_on_product_use` — le nom du reason montre la confusion (une question CBD n'est pas du produit).
- **Symptôme visible** : aucun pour l'utilisatrice (réponse finale correcte) — le skill product_help se déclare hors-périmètre et exit immédiatement (« Product_help se ferme sans répondre au fond », handoff topic_change).
- **Preuve système** : trace T11 `response_owner=product_help`, `skill_run.status=exit` immédiat ; coût : 1 LLM call de self-heal + owner de trace faux pour l'observabilité.
- **Correction attendue** : contre-exemple canonique dans la doctrine dispatcher : une demande d'infos externes/fraîches (santé, études, actualité) sans question sur Sophia → aucun skill signal, réponse normale + `needs_research` ; harmoniser avec la règle 8.
- **Statut** : `fix_applied` — chantier V4-1 (2026-07-08) : contre-exemple canonique au contrat dispatcher — une question d'information sur le MONDE EXTERNE (santé, études, actualité, CBD) sans question sur Sophia n'est JAMAIS product_help : skill_signals={}, réponse normale + needs_research (règle 8). Le sujet lié à la transformation n'en fait pas une question produit. Ancre testée.
- **Fix reference** : `dispatcher.prompts.ts`
- **Tests requis** : contract dispatcher positif (vraie question produit → product_help), paraphrases info-externe (santé/actu/science → pas de product_help), anti-faux-positif (« où je vois mes potions dans l'appli ? » reste product_help).

## R6-B03 — Doctrine de cohérence non appliquée aux types de potion (capitulation)

- **Bug id** : R6-B03
- **Tours** : T12 (contraste : T2 où la même doctrine tient sur carte↔potion)
- **Famille** : BF-INTAKE-06 — mauvais domaine sémantique (secondairement : doctrine operation-suggestion)
- **Domaine owner** : skill `coaching_recommendation` (local flow / visible decision) ; secondairement dispatcher (mapping)
- **Source amont** : la règle « technique forcée incohérente → garder un doute, expliquer la différence, proposer les options proches » est effective pour le choix carte/technique (prouvé T2) mais pas pour `CoachingVisibleDecision.potion_type` : sur « change pour une potion de courage » alors que l'état décrit toute la session est une surcharge (apaisement), le flow bascule sans doute et décrit même le cas d'usage de courage (peur/évitement avant d'agir) sans relever qu'il ne colle pas à l'état rapporté. En amont, le dispatcher mappe la demande en `coach_style_feedback` / `coaching_type=ambiguous` (+ signal parallèle feature_opportunity coach_preferences) : un choix de levier n'est pas un feedback de style.
- **Symptôme visible** : Sophia dit l'inverse de sa position de T2-T3 sans expliquer le changement ; recommandation d'état potentiellement incohérente.
- **Preuve système** : trace T12 (`coaching_type=ambiguous`, reason « feedback on accompaniment style ») ; réponse visible « Oui, là je bascule sur courage ».
- **Correction attendue** : étendre le contrat de cohérence au `potion_type` (état décrit ↔ type ; mismatch → doute + différence + options proches, comme pour les cartes). Bonus de grounding : les `user_potion_sessions` existantes (Rose a déjà une session courage complétée) peuvent nourrir l'arbitrage. Corriger aussi le mapping dispatcher (choix de levier ≠ style feedback).
- **Statut** : `fix_applied` — chantier V4-5 (2026-07-08) : `technique_coherence` (V3-4) devient LEVIER-AGNOSTIQUE — couvre le `potion_type` dans les deux sens : forçage incohérent (courage sur surcharge → doute + différence + options) ET requalification abusive d'un wording cohérent ; un changement de position vs un tour précédent s'explique toujours. + mapping dispatcher corrigé : un choix/changement de levier ('change pour une potion de courage') → coaching_recommendation, jamais coach_style_feedback. **Probe live** (Rose, scénario exact) : surcharge décrite + « change pour courage » → « Je vois pourquoi tu penches vers courage, mais… l'apaisement reste le plus juste ici ; courage serait plutôt si la peur ou l'évitement te bloquaient » — doute + différence, zéro capitulation.
- **Fix reference** : `coaching_recommendation/local_flow.ts`, `dispatcher.prompts.ts`
- **Tests requis** : forçage incohérent (état surcharge → demande courage) → doute exprimé ; forçage cohérent (blocage de seuil → demande courage) → accept ; paraphrase ; anti-faux-positif (vraie préférence de style → coach_preferences).

## R6-B04 — Récap de session sans les next-steps non exécutés

- **Bug id** : R6-B04
- **Tours** : T15
- **Famille** : BF-STATUS-02 — historique incomplet
- **Domaine owner** : recap/status projection (contexte de session)
- **Source amont** : le récap projette l'état DB (exact : plan, entry, checkin annulé, recurring baseline) mais ne relit pas les recommandations de la session fermées **sans exécution** (initiative 21h30 à créer dans Initiatives — T6/T7 ; potion à activer dans Ressources — T4/T12). Le « reste à faire de ton côté » liste les items du plan mais omet les deux to-dos nés de la conversation, ce que l'utilisatrice demandait explicitement (« pas de surprises demain »). Omission mineure associée : « une session de clarté déjà terminée » ignore la session courage également complétée en DB.
- **Symptôme visible** : récap prudent et sans sur-affirmation (bon), mais to-dos de la soirée absents ; + accord de genre raté (« tu es parti ») — friction renderer à couvrir par le grounding persona.
- **Preuve système** : réponse T15 vs contenu des flows T4/T6/T7/T12 ; DB potion_sessions (2 completed : clarte + courage).
- **Correction attendue** : le récap de session inclut les `recommendation.user_facing_next_step` des flows clos sans exécution (note_information de session), pas seulement la projection DB.
- **Statut** : `fix_applied` — chantier V4-4 (2026-07-08) : (a) fenêtre du bloc EFFETS RÉCENTS étendue à la SESSION (5→15 tours) avec lifecycle en langage user (« programmé » / « créé puis déjà déclenché » / « créé puis annulé ») et règle « un effet de session ne s'omet jamais d'un récap » ; (b) les recommandations retenues non exécutées vivent dans le bloc DÉCISIONS DE SESSION (V4-3) avec la règle « se listent en reste à faire, jamais omises » ; (c) accord de genre : règle companion durcie (genre connu → accords systématiques). **Probe live** (Nina) : récap avec initiative à créer + rappel de session + carte retenue → les trois listés.
- **Fix reference** : `context/loader.ts`, `router/session_decisions.ts`, `agents/companion.ts`
- **Tests requis** : session avec reco non exécutée → récap la liste en « reste à faire » ; session sans reco → pas de bruit ; profil féminin → accords corrects dans le récap.

## R6-B05 — Memorizer : préférence fossilisée depuis un tour unique contredit ensuite

- **Bug id** : R6-B05
- **Tours** : batch de fin de run (source T12, contredit par T13)
- **Famille** : `a classifier` — anti-fossilisation (proche BF-MEMORY, mais c'est une sur-extraction, pas une promesse non tenue)
- **Domaine owner** : memorizer (extraction/write decisions)
- **Source amont** : le batch persiste en `active` « L'utilisateur préfère les outils de motivation active (type 'courage' ou 'attaque') plutôt que les méthodes d'apaisement passif » à partir du seul T12 — un énoncé unique, impulsif, que T13 tempère aussitôt (« Ouais bof, on verra »). Une préférence durable extraite d'une occurrence unique non confirmée, avec signal de rétractation dans la même fenêtre, devrait au plus être `candidate`.
- **Symptôme visible** : risque de biais durable des futures recommandations (le runtime chargera « préfère courage/attaque » alors que l'état réel de Rose appelait l'apaisement).
- **Preuve système** : memory_items post-batch (4 items, dont celui-ci en `active`) ; transcript T12-T13.
- **Correction attendue** : règle d'extraction : les préférences de style/levier exigent récurrence ou confirmation explicite ; un marqueur de rétractation/tiédeur dans la fenêtre du batch dégrade en `candidate` ou rejette.
- **Statut** : `fix_applied` — chantier V4-6 (2026-07-08) : règle d'extraction (prompt-level, zéro regex) — une préférence de style/levier issue d'UN SEUL énoncé n'est jamais un statement active (récurrence ou confirmation exigée) ; un marqueur de rétractation/tiédeur dans la même fenêtre (« bof, on verra ») dégrade en candidate ou rejette ; anti-sur-correction : un fait personnel simple 1× reste persistable. Ancres testées.
- **Fix reference** : `_shared/memory/memorizer/extract.ts`
- **Tests requis** : préférence énoncée 1× + « bof » ensuite → pas d'item active ; préférence répétée 2 jours → active ; fait personnel simple (non-préférence) 1× → toujours persistable (ne pas sur-corriger).

## R6-B06 — Registre produit : destination potions divergente du frontend

- **Bug id** : R6-B06
- **Tours** : T4 (warning, tour green)
- **Famille** : `a classifier` — donnée de registre stale (hygiène référentiel)
- **Domaine owner** : `product_surface_registry` (surfaces_data.ts / surfaces.json)
- **Source amont** : le registre dit `user_facing_destination = « dans la section État / Potions »` (`destination_id=state_potion`) alors que le frontend réel loge les potions sous l'onglet **« Ressources »** (DashboardV2, key `lab`, `usePotions`). Au T4 le visible agent a donné la destination frontend correcte (« Dashboard > Ressources > Potions ») — donc pas d'impact utilisateur ce run — mais tout composant qui suivra le registre à la lettre donnera un chemin qui n'existe pas.
- **Symptôme visible** : aucun ce run ; risque latent de destinations fausses (famille BF-STATUS-03-like côté visible).
- **Preuve système** : `surfaces_data.ts:298-310` vs `frontend/src/pages/DashboardV2.tsx:1438` + `usePotions`.
- **Correction attendue** : réconcilier les `platform_steps`/`user_facing_destination` du registre avec la nav réelle (« Ressources ») ou renommer l'onglet — une seule source de vérité.
- **Statut** : `fix_applied` — chantier V4-7 (2026-07-08) : registre réconcilié avec le frontend réel — `state_potion` : label « Ressources / Potions », destination « dans Dashboard > Ressources, section Potions », platform_steps alignés (surfaces_data.ts + surfaces.json). Tests registre 9/9.
- **Fix reference** : `product_surface_registry/surfaces_data.ts`, `surfaces.json`
- **Tests requis** : test de cohérence registre↔routes frontend (destinations existantes) si un harness existe ; sinon checklist de release.

## R6-B07 — Batch memorizer : verrou `running` orphelin sans timeout (perte de mémorisation silencieuse)

- **Bug id** : R6-B07
- **Tours** : hors-tours (infrastructure batch, observé et reproduit pendant le run)
- **Famille** : BF-EFFECT-04 — executor/fallback technique fragile
- **Domaine owner** : memorizer runtime (`trigger-memorizer-daily` / gestion `memory_extraction_runs`)
- **Source amont** : un batch tué en plein vol (ici : worker edge tué, gateway 502) laisse `memory_extraction_runs.status='running'` ; tout batch suivant du même user est alors `skipped, reason=run_in_progress` **indéfiniment** — aucun lease/TTL ne libère le verrou. Reproduit : trigger 21:07 → 502 → run `0cf82266` bloqué `running` ; retry → `{"status":"skipped","reason":"run_in_progress"}` ; déblocage uniquement par UPDATE manuel `status='failed'`, puis retry → `completed` (15 messages, 4 persistés).
- **Symptôme visible** : aucun en chat — c'est le danger : la mémorisation nocturne du user échoue silencieusement chaque nuit tant que le verrou vit.
- **Preuve système** : réponse JSON du trigger (`skipped/run_in_progress` avec `extraction_run.status=running`, `duration_ms=null`) ; logs edge sans events memorizer Rose ; déblocage manuel documenté dans le rapport.
- **Correction attendue** : lease avec expiration sur les runs `running` (p.ex. `started_at` + TTL > durée max attendue → le run est réputé stale, marqué `failed`/repris par le batch suivant) ; à minima un log/alerte quand un skip `run_in_progress` porte sur un run vieux de plusieurs heures.
- **Statut** : `clarified + fix_applied` (observabilité) — chantier V4-6 (2026-07-08). Vérification : le lease/TTL existe DÉJÀ (X2, 2026-07-07) — un run `running` frais (< 30 min) skippe, un run périmé (> 30 min) est repris automatiquement par `recoverOrphanExtractionRuns` au batch suivant ; le « bloqué indéfiniment » observé venait de retries dans la fenêtre de 30 min. Ajouts V4 : log structuré au skip (`run_age_minutes` + `auto_recovery_after_minutes: 30`) pour que l'opérateur ne conclue jamais à un blocage définitif, et fix de la sérialisation `error_message` (« [object Object] » → message JSON lisible).
- **Fix reference** : `memorizer_async.ts` (log), `persist.ts` (failExtractionRun)
- **Tests requis** : run `running` daté de > TTL → nouveau batch le marque stale et procède ; run `running` frais → skip conservé (pas de double traitement) ; test d'intégration crash-mid-batch → reprise à J+1 sans intervention.

---

## Incidents environnement (non-produit, pour mémoire)

- 2×502 gateway sur T12 (1er essai : rien de persisté ; 2e : message user orphelin supprimé avant retry ; 3e : 200, aucun doublon). Kong `read_timeout` déjà à 600000ms — 502 d'origine upstream (edge runtime sous charge).
- Charge parallèle pendant le run : 3 autres runs QA (Nina r6, Eva r8, Alex) + crons locaux (`process-checkins` avec 1 checkin dû hors Rose, `trigger-topic-compaction`, memorizers scopés Alex/Eva/Nina). Aucune interférence sur le scope/les données Rose (0 extraction run Rose pendant les tours).
- 4 `conversation_turn_traces` Rose hors-scope (20:19-20:22 UTC, avant le run, safety×2/normal×2) issues d'une autre session — non nettoyées (pas mon état), à connaître pour les prochains audits de traces Rose.
