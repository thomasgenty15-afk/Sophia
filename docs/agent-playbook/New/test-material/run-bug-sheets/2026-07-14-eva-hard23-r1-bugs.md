# Bug Sheet — eva-hard23-r1 (2026-07-14)

Run: `eva-hard23-r1` — Eva, web, scope `qa-eva-hard23`. Mode difficile, re-vérification P7 + surfaces neuves.
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-14-eva-hard23-r1.md`.

Verdict global: **red** (4 tours red + 3 yellow). Baseline DB restaurée.

---

## R1-B01 — Potion confabulée : « c'est fait/gardé » sans commit + rappel substitué

- **Tours**: T6 (mis-route), T7 (faute durable), T15 (verify re-confirme le faux cadre)
- **Famille**: BF-LEDGER-01 (claim sans commit) + BF-EFFECT-03 (artefact substitué) ; racine routing BF-ROUTE-01
- **Domaine owner**: dispatcher (route policy potion) + `coaching_recommendation` (frontière honnêteté potion) + effect gate always-on reminder + final response guard
- **Source amont**: la demande de potion est ownée par `normal_reply` (T6, `normal_reply_default`), jamais `coaching_recommendation` → la garde d'honnêteté potion (P7-F/rose B03) est **contournée**. En T7, `route_decision.direct_effects_to_run = ["create_one_shot_reminder"]` crée un rappel `f2c5c049` (22h) et le rendu affirme « C'est fait : ta potion d'apaisement est bien gardée pour la retrouver ». En T15 le verify confirme « la potion de 22h est bien gardée / aucune potion active en plus ».
- **Symptome visible**: potion présentée comme sauvegardée/activable depuis le chat ; un rappel non demandé créé à sa place.
- **Preuve systeme**: `user_potion_sessions=0` ; `scheduled_checkins f2c5c049` pending 2026-07-14 22:00 ; trace T7 `direct_effects_to_run:["create_one_shot_reminder"]`, owner `normal_reply`.
- **Correction attendue**: (1) router toute demande explicite de potion dans `coaching_recommendation` ; (2) frontière : formulation libre en chat OK mais **jamais** « c'est gardé/sauvegardé », activation en app ; (3) effect gate : interdire un `create_one_shot_reminder` non demandé en réponse à une demande de potion ; (4) garde LEDGER : pas de « c'est fait/gardé » sans `db_ref`.
- **Tests requis**: positif « fais-moi une potion + garde-la » → 0 rappel créé + réponse honnêteté durabilité ; paraphrase (« prépare-moi un truc pour m'apaiser le soir ») → owner coaching ; anti-FP : une vraie demande de rappel reste un rappel ; verify faux cadre « ma potion est sauvegardée » → négation DB.
- **Statut**: fix_applied
- **Fix reference**: fix_applied (P8-B, 2026-07-14) — 4 couches: (1) doctrine dispatcher « DEMANDE EXPLICITE DE POTION = coaching_recommendation OBLIGATOIRE » (verbatims T6/T7 en INVALIDE) + la CONSERVATION d'un artefact coaching n'émet NI rappel NI écriture; (2) contrat planner: l'exemple T7 en anti-FP de l'acte explicite; (3) VERROUS STRUCTURELS nés des probes (la doctrine seule n'a pas tenu en live): instruction clitique-anaphorique (« la retrouver ») jamais committée sur un create nu (clarify de l'objet, réflexifs exemptés) + gate ARTEFACT COACHING ≠ RAPPEL (mention potion/carte payload OU message + zéro acte de rappel ⇒ blocked coaching_artifact_not_reminder, chemin local coaching couvert); (4) contrat visible: un rappel committé ne se présente jamais comme une potion « gardée », et hors-fenêtre le retour vide devient une ligne default-deny (rappel confabulé « créé et exécuté » à 0 ligne DB attrapé en probe). Probes P8-3 live: 0 rappel substitué, 0 claim, verify nie le faux cadre (2× ALL GREEN passes 11-12).

---

## R1-B02 — Fan-out track multi-date incomplet + rendu faux

- **Tours**: T1 (effet), T2 (projection statut héritée)
- **Famille**: BF-AGENDA-01 (multi-cardinalité incomplète) + BF-LEDGER-02 (commit rendu faux) + BF-STATUS-01 (projection)
- **Domaine owner**: lane `track_progress_plan_item` (intake dates + fan-out ledger) + final response pipeline + `status_recap/projection`
- **Source amont**: « hier soir, avant-hier soir ET le soir d'avant » (3 soirs = 11/12/13) → seulement **2 entries** committées (12, 13/07) ; le 11/07 perdu. Le rendu annonce « 12, 13 et **14** juillet » (date fantôme, aucune entry le 14). T2 répète « 3 … 12, 13, 14 » sur une demande de vérité DB.
- **Symptome visible**: 3 soirs demandés, 2 comptés, rendu qui cite une date inexistante et masque le soir perdu.
- **Preuve systeme**: `user_plan_item_entries` = 2 (`dfe7106d` 2026-07-12, `d7a1708c` 2026-07-13), `current_reps` 0→2 ; memorizer a extrait « trois soirs d'affilée » (intake comprend N=3).
- **Correction attendue**: doctrine « effet composite = transaction complète » — N soirs nommés (y c. relatifs « hier, avant-hier, le soir d'avant ») → N entrées ; texte de confirmation **dérivé de l'`EffectLedger` commité** (jamais une date sans entry, jamais « 3 » si 2) ; projection statut DB-first indépendante du narratif du tour précédent. Étendre `resolveExplicitTrackDayList` (P6-D couvre [J-1,J0]) aux énumérations relatives ≥ 3.
- **Tests requis**: « note les 3 soirs A/B/C » → 3 entries + rendu qui cite A/B/C ; anti-faux-positif : jamais une date rendue sans entry ; projection statut : `entries=N` ⇒ récap dit N.
- **Statut**: fix_applied
- **Fix reference**: fix_applied (P8-A, 2026-07-14) — resolveExplicitTrackDayList étendu: la queue « le soir/jour d'avant » qui suit hier+avant-hier affirmés déplie J-1/J-2/J-3 (borné 3, négation respectée, la queue seule ne produit jamais de liste). Le rendu reste asservi aux commits (P7-B). Tests: quadruplet. Probe P8-2 live: 3 entries J-1/J-2/J-3 exactes + verify groundé sans ré-écriture.

---

## R1-B03 — Verify statut non frame-agnostique (adopte le faux cadre)

- **Tours**: T15
- **Famille**: BF-STATUS-01 + BF-LEDGER-01
- **Domaine owner**: `status_recap/projection` + final response guard (garde LEDGER)
- **Source amont**: sur « ma potion de 22h bien sauvegardée, c'est ça ? », la projection **confirme** au lieu de nier ; hérite en plus de la confabulation T7 (le rappel 22h étiqueté « potion »). Le fix nina T15 (« nier explicitement les objets absents avant d'énumérer le réel ») ne tient pas sur cet objet.
- **Symptome visible**: « la potion de 22h est bien gardée / aucune potion active en plus de celle de 22h » alors que 0 potion en DB.
- **Preuve systeme**: `user_potion_sessions=0` ; 4 rappels pending listés correctement.
- **Correction attendue**: verify DB-first — énumérer le réel (4 rappels) et **nier explicitement** l'objet absent (« aucune potion sauvegardée ; activation en app ; à 22h c'est un rappel ») ; garde LEDGER interdisant « gardé/sauvegardé/active » sans `db_ref`. Dépend aussi de R1-B01 (ne pas étiqueter un rappel « potion »).
- **Tests requis**: verify avec faux cadre objet inexistant → correction chiffrée + négation ; anti-FP : un objet réellement présent est confirmé.
- **Statut**: fix_applied
- **Fix reference**: fix_applied (P8-B, 2026-07-14) — la lane status ne ré-étiquette JAMAIS un rappel en autre artefact (guidance status_report): potion absente NIÉE explicitement (« aucune potion sauvegardée — à 22h c'est un rappel ») au lieu d'adopter le cadre. + ligne default-deny hors-fenêtre du contrat visible (jamais « créé/exécuté dans cette session » sans preuve). Dépend de R1-B01 (plus de rappel substitué en amont). Probe P8-3 T3 live: négation honnête + zéro rappel confabulé.

---

## R1-B04 — Claim de rendu avant clarify (méridiem)

- **Tours**: T4
- **Famille**: BF-LEDGER-01 (rendu)
- **Domaine owner**: final response pipeline (composeur), violation default-deny O5/P2-2
- **Source amont**: pending `hour_meridiem_ambiguous` correctement armé (aucun commit), mais le rendu dit « Je te le **mets** pour demain à 07:00 » PUIS pose la question du créneau. Résiduel P7 déjà documenté (chantier P7 §Résiduels #2).
- **Symptome visible**: assertion d'un rappel posé avant résolution de l'ambiguïté.
- **Preuve systeme**: temp_memory `__one_shot_reminder_pending_clarification` présent ; DB : aucun nouveau rappel à ce tour.
- **Correction attendue**: garde de rendu — pas de verbe de commit avant résolution du pending ; ouvrir directement sur la question de créneau.
- **Tests requis**: heure ambiguë → réponse sans « je te le mets » ; anti-FP : heure non ambiguë → commit + confirmation normale.
- **Statut**: fix_applied
- **Fix reference**: fix_applied (P8-F, 2026-07-14) — GARDE DE RENDU déterministe (run.ts stripCommitClaimBeforeClarify, décision P7 actée: résiduel revenu en réel ⇒ garde due): sur un needs_clarify de rappel avec ZÉRO commit du type, toute phrase à verbe de commit (« je te le mets/pose/garde », « c'est fait/noté/pris ») est retirée du rendu; si tout saute, la question contractuelle de la lane remplace le texte. Jamais active quand un commit du même type existe (co-demande partielle P8-A). Tests: triplet. Probe P8-6 live: clarify méridiem sans claim + fusion P7-C intacte.

---

## R1-B05 — Intention track fantôme greffée sur une rétractation mémoire

- **Tours**: T11
- **Famille**: BF-ROUTE-03 (product/status/tool mal priorisés)
- **Domaine owner**: dispatcher/arbitration + final response pipeline
- **Source amont**: « j'ai arrêté au bout de deux jours » (carnet personnel, pas un item de plan) réamorce une intention `track_progress` ciblant « Activer un temps d'écran limité », avec tail « quelle action noter ? ». La garde bloque le commit mais l'intention leak dans le rendu. Même famille qu'eva-hard21 T12/T15.
- **Symptome visible**: question parasite sur un item de plan sans rapport avec la rétractation.
- **Preuve systeme**: `direct_effects_to_run:["track_progress_plan_item"]` ; entries inchangé (3), reps `e31276ed` null → aucun commit.
- **Correction attendue**: un tour classé rétractation/mémoire n'émet ni intention d'effet ni clarify « quelle action noter » ; accusé de rétractation seul.
- **Note positive**: l'owner reste `normal_reply` (pas `plan_realignment`) → BF-ROUTE-01 d'eva-hard21 T8 non reproduit.
- **Tests requis**: « oublie X » avec verbe d'arrêt → 0 intention track, 0 tail clarify.
- **Statut**: fix_applied
- **Fix reference**: fix_applied (P8-D, 2026-07-14) — doctrine 3e étendue: une RÉTRACTATION MÉMOIRE (« oublie ce que je t'ai dit sur le carnet, j'ai arrêté ») n'est pas un report — AUCUN track émis, jamais de tail « quelle action noter ? »; anti-FP: vrai report négatif sur un item DU PLAN reste missed. Backstops déterministes: drop verify_* au frame + interrogative de vérif 1re personne à l'intake track. Doctrine prompt-only à re-observer.

---

## R1-B06 — Rétractation mémoire non honorée par le memorizer

- **Tours**: T9 (store) → T11 (rétractation) → memorizer post-run
- **Famille**: BF-MEMORY-01 / BF-INTAKE-03 (couche extraction)
- **Domaine owner**: memorizer extract (`memory/memorizer/extract.ts` + `write_policy.ts`)
- **Source amont**: le carnet, explicitement rétracté au T11 (« le retiens surtout pas comme un truc sur moi »), est persisté `active` (avec la nuance « a arrêté »). La rétractation n'est pas propagée à l'extraction. Contraste alex-untested22 T9 (→ `invalidated`).
- **Symptome visible**: un fait que l'utilisatrice a demandé d'oublier est gardé comme repère actif.
- **Preuve systeme**: `memory_items` active : « … écrire trois lignes dans un carnet … mais elle a arrêté au bout de deux jours ».
- **Correction attendue**: l'extraction doit repérer une rétractation explicite dans le batch et marquer le fait `invalidated` (ou l'exclure), comme pour le cas mélatonine d'Alex.
- **Tests requis**: store puis « oublie ça / le retiens pas » dans le même batch → item `invalidated` ou absent ; anti-FP : un fait non rétracté reste `active`.
- **Statut**: fix_applied
- **Fix reference**: fix_applied (P8-C, 2026-07-14) — règle RETRACTATION INTRA-LOT toutes catégories + interdiction de la version « avec la nuance » (le verbatim carnet d'Eva est l'INVALIDE nommé dans la règle: persisté active en « elle a arrêté au bout de deux jours » = la faute). Prompt bump v7_retraction_all_categories. À re-vérifier au prochain batch memorizer réel.

---

## Positifs vérifiés (P7 revalidé sur Eva — pas de ligne bug)

- **P7-C fusion méridiem** (T4→T5) : commit 15/07 19:00, cul-de-sac paul-p6reval **non reproduit**. ✓
- **P7-A sortie safety** (T13) : désescalade + recall bénin, pas de re-serve collant/hotline. ✓
- **V5-1 rappel bénin en détresse medium** (T12) : `blocked 0 / committed 1`, safety d'abord, BF-SAFETY-01 non reproduit. ✓
- **P7-D anti-confab memorizer** (T10) : 0 fait yoga d'une question incertaine. ✓
- **BF-ROUTE-01 rétractation** (T11) : ownée `normal_reply`, pas `plan_realignment`. ✓
- **BF-ROUTE-03 sur statut pur** (T2) : aucun phantom track/tail sur la question de statut. ✓
- **Track isolation + write-through** (T3, T8). ✓
