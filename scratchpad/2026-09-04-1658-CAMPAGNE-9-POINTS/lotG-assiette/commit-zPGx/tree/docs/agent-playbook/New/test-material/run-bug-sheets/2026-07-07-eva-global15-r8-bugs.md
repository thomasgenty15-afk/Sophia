# Bug Sheet — 2026-07-07 — Eva global15 r8

Rapport source : `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-07-eva-global15-r8.md`
Verdict global du run : yellow (aucun red ; 3 findings nouveaux, 1 récurrence, 1 reproduction known-issue).

## R8-B01 — Altitude d'entrée : potion nommée au premier message minimisé

- **Bug id:** R8-B01
- **Tours:** T1
- **Famille:** `BF-ROUTE-01` (altitude/pacing du flow coaching — récurrence du finding eva-multiflow-r1 T1)
- **Domaine owner:** skill `coaching_recommendation`, visible agent `emotion_coaching`
- **Source amont:** `supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/emotion_coaching.ts` — le stage « recommend » est choisi dès le premier tour du flow, même quand le user minimise (« c'est sûrement rien »)
- **Symptome visible:** sur une première divulgation émotionnelle minimisée, Sophia nomme et recommande « la potion d'apaisement » sans un seul tour d'exploration ; le levier produit arrive comme un réflexe.
- **Preuve systeme:** trace T1 — dispatcher `emotional_state_coaching_need` (0.91, correct), skill_run `continue`, réponse visible = recommandation immédiate. Aucun tour `understand_need`.
- **Correction attendue:** règle de pacing dans le contrat du visible agent emotional : signal minimisé + premier tour du flow → reflet/une question d'exploration avant de nommer une feature. Contrat + test de contrat, pas de phrase codée en dur.
- **Statut:** `fix_applied` — chantier V4-5 (2026-07-08) : règle de pacing au contrat du visible agent emotion_coaching — premier tour du flow + divulgation MINIMISÉE (« c'est sûrement rien ») → reflet + UNE question d'exploration, aucune potion/feature nommée ce tour ; demande explicite de levier → directe (anti-faux-positif).
- **Fix reference:** `coaching_recommendation/visible_agents/emotion_coaching.ts`
- **Tests requis:** positif (signal minimisé 1er tour → pas de feature nommée), paraphrase (autres formulations de minimisation), anti-faux-positif (demande explicite de levier au 1er tour → recommandation directe reste OK).

## R8-B02 — Chaîne `needs_research` orpheline + claim de fausse fraîcheur

- **Bug id:** R8-B02
- **Tours:** T8 (symptôme fort), T12 (même trou de câblage, sans symptôme d'honnêteté)
- **Famille:** `BF-EFFECT-02` (effet attendu absent — executor jamais invoqué depuis le signal)
- **Domaine owner:** sophia-brain runtime pipeline / composer (`normal_reply`)
- **Source amont:**
  - `dispatcher.v2.ts` pose correctement `turn_frame.needs_research` (T8 : value=true, query complète, confidence 0.98) ✅
  - `_shared/gemini.ts:2130` `searchWithGeminiGrounding` (tool `google_search`) : **aucun appelant dans toute la codebase**
  - `agents/companion.ts:16,139` : marqueur `=== RECHERCHE WEB (informations fraiches) ===` + « CONTEXTE WEB PRIORITAIRE » consommés mais **jamais produits par personne**
  - → la chaîne signal → recherche → contexte épinglé est câblée aux deux extrémités et plus reliée au milieu.
  - **Cause racine (établie par le run parallèle paul-r8 du même soir)** : le refactor `3de0b9a2` (2026-06-30, -8417 lignes `router/run.ts`) a supprimé le consommateur research (`needs_research_forces_normal_reply`) ; le signal et le côté companion ont survécu au refactor. C'est une **régression**, pas une feature jamais construite.
- **Symptome visible:** T8 : « tu peux chercher sur internet... ? » → « Oui. En 2026, la moyenne mondiale tourne autour de 2 h 20 à 2 h 30... », avec offre d'affiner par pays/âge — statistique paramétrique présentée comme donnée fraîche vérifiée. Risque direct de perte de confiance si le user vérifie.
- **Preuve systeme:** trace T8 (`needs_research.value=true` sans aucun executed_tool ni contexte research), grep exhaustif des appelants/producteurs (zéro), réponse visible.
- **Correction attendue:** décision produit puis l'un des deux chemins, au niveau runtime :
  1. **Brancher la chaîne** : si `needs_research.value=true` et band safety < high → `searchWithGeminiGrounding(query)` → injection sous le marqueur research du companion (le pipeline existant est déjà prêt des deux côtés) ;
  2. **À défaut**, contrat d'honnêteté de capacité du composer : interdiction de confirmer « oui je cherche » et d'affirmer des chiffres frais datés quand aucun contexte research n'est présent (formulation « de mémoire / à vérifier »).
  L'état actuel (flag posé + claim de fraîcheur) est le pire des deux mondes.
- **Croisement:** même bug relevé indépendamment par `2026-07-07-paul-global15-r8-bugs.md` R8-B02 (classé `BF-LEDGER-01` variante informationnelle — les deux lectures pointent la même source amont : consommateur supprimé par `3de0b9a2`). Confirmé sur 2 personas le même soir ; une seule correction attendue.
- **Statut:** `fix_applied` — chantier V4-1 (2026-07-08, décision produit : REBRANCHER). Exécuteur `router/research_grounding.ts` (signal structuré → recherche Gemini grounding gatée safety → bloc « RECHERCHE WEB » injecté ; échec → directive d'honnêteté interdisant tout claim de vérification) ; events `research_grounding` ré-émis ; contre-exemple product_help au dispatcher. Probes live : voie succès (vraie recherche, event `success`) ET voie échec (« de mémoire, à vérifier ») vertes. Cf. rose-r6 B01 (fiche détaillée). Le « pire des deux mondes » est fermé : bloc présent → réponse groundée ; bloc absent → directive interdisant chiffres frais et « oui je cherche ».
- **Fix reference:** `router/research_grounding.ts`, `router/run.ts`, `dispatcher.prompts.ts`
- **Tests requis:** positif (question fraîcheur → contexte research injecté OU réponse sans claim de fraîcheur chiffrée), intégration (needs_research=true + band medium → recherche autorisée ; band high → signal forcé false, déjà couvert par `dispatcher.test.ts:426-457`), anti-faux-positif (question de coaching sans demande de fraîcheur → pas de recherche).

## R8-B03 — Compteur/statut d'habitude non mis à jour à l'atteinte de cible (reproduction known-issue V1)

- **Bug id:** R8-B03
- **Tours:** T9
- **Famille:** `BF-EFFECT-04` (write technique fragile) → conséquence `BF-STATUS-01`
- **Domaine owner:** tool `track_progress_plan_item` (writer) + triggers DB — voir feuille Rose r3 (`2026-07-06-rose-global15-r3-bugs.md`, R3-B01)
- **Source amont:** conflit `guard_unlocked_principles_update` vs `unlock_v2_principles_from_item_transition` sous rôle `authenticated` quand la transition maintenance est déclenchée.
- **Symptome visible:** track « coupure écran hier » (3e complétion, cible 3) → entry commitée, mais item resté `current_reps=2/3`, `active_building`, pas de transition maintenance ; le dashboard divergera.
- **Preuve systeme:** entry `user_plan_item_entries` (outcome=completed, effective_at=2026-07-06, metadata `item_patch_prior.current_reps=2`) ; item inchangé post-tour ; log structuré `[TrackProgress] item_patch_failed (entry committed, counter/status NOT updated) ... "Direct modification of unlocked_principles is not allowed", code P0001`.
- **Correction attendue:** aucune nouvelle proposée par ce run — reproduction exacte du known-issue arbitré. **Point positif vérifié par ce run : l'observabilité W5 fonctionne** (console.error structuré émis, plus d'échec avalé en warn).
- **Croisement:** le run parallèle `2026-07-07-paul-global15-r8-bugs.md` (R8-B01) a reproduit le même bug le même soir sur Paul, avec une preuve supplémentaire (rollback-test DB : le guard raise **même en service_role SQL**, seul le claim JWT passe) et **re-qualifie la ligne en `open`** avec fix trigger proposé (SECURITY DEFINER + `pg_trigger_depth()`/GUC) + rerun requis. L'arbitrage won't fix 2026-07-06 mérite donc réévaluation : 3 reproductions en 2 jours (rose r3, eva r8, paul r8) sur le cas « atteinte de cible via chat ».
- **Statut:** `fix_applied` via paul-r8 B01 — chantier V4-2 (2026-07-08, won't-fix RÉOUVERT sur décision utilisateur) : marqueur GUC de cascade légitime reconnu par le guard + `item_patch_applied` remonté en outcome (cmd 15). Probe live : 3e rep via chat → 3/3 + maintenance + principe débloqué ; update direct toujours rejeté.
- **Fix reference:** observabilité chantier W5 (2026-07-06) — vérifiée ici en conditions réelles.
- **Tests requis:** ceux listés dans R3-B01 / paul-r8 R8-B01 restent valides pour la réévaluation.

## R8-B04 — Récap final sans projection des effets du jour

- **Bug id:** R8-B04
- **Tours:** T15
- **Famille:** `BF-STATUS-02` (historique incomplet)
- **Domaine owner:** composer `normal_reply` (récap) / status projection
- **Source amont:** le récap est composé depuis le contexte conversationnel récent, sans lecture de la projection des effets durables du jour (entries commitées, créations/annulations) ; les derniers tours écrasent le début de session.
- **Symptome visible:** à « qu'est-ce qu'on a concrètement mis en place **ou enregistré** ce soir ? », le récap liste 3 moments de conversation et le contenu du plan, mais omet le seul effet enregistré du soir (track coupure écran d'hier, T9) et les deux recommandations ouvertes (potion à faire ce soir, carte de défense acceptée). Aucun faux claim en revanche (les non-créations ne sont pas présentées comme créées — le red nina r5 ne se reproduit pas).
- **Preuve systeme:** trace T15 (owner normal_reply, aucun accès projection), entry T9 présente en DB au moment du récap, réponse visible.
- **Correction attendue:** sur intention de récap d'effets, alimenter le composer avec la projection des effets durables de la fenêtre courante (EffectLedger/entries du jour + suggestions ouvertes du flow). Correction de projection, pas de wording.
- **Statut:** `fix_applied` — chantier V4-4 (2026-07-08) : fenêtre EFFETS RÉCENTS étendue à la session (5→15 tours), usage élargi aux intentions de récap, règle « un effet de session ne s'omet jamais » ; recommandations ouvertes au bloc DÉCISIONS DE SESSION (« reste à faire », jamais omises). Probe live verte.
- **Fix reference:** `context/loader.ts`, `router/session_decisions.ts`
- **Tests requis:** positif (track commité en début de session → présent dans le récap de fin), paraphrase (« on a fait quoi ce soir », « t'as noté quoi »), anti-faux-positif (rien d'enregistré → le récap ne doit rien inventer).

## R8-B05 — Persistance memorizer non résiliente : un item invalide perd tout le batch

- **Bug id:** R8-B05
- **Tours:** hors tours (batch nocturne de fin de run)
- **Famille:** `BF-MEMORY-01` (promesse mémoire non persistée — cause writer/persist)
- **Domaine owner:** memorizer nocturne (`trigger-memorizer-daily` → `_shared/memory/memorizer/persist.ts`)
- **Source amont:** persistance batch sans validation temporelle par item ni isolation par item : un item événement extrait avec `event_start=2026-07-06 22:30 > event_end=2026-07-06 22:00` viole `chk_memory_items_event_end_after_start` (23514) et **fait échouer l'écriture de tout le batch** (0/7 items persistés, y compris le fait explicite « vendredi soir » du T13). Un retry (extraction non déterministe) est passé : 3 persistés / 4 rejetés proprement — l'échec est donc intermittent mais total quand il survient. À rapprocher du chantier en cours sur `extract.ts` / `temporal_resolution.ts` (fichiers modifiés dans le working tree).
- **Symptome visible:** aucun in-chat (l'accusé « je retiens » du T13 est légitime) — perte silencieuse : la mémoire de toute la journée n'existe pas le lendemain.
- **Preuve systeme:** log `trigger-memorizer-daily request_failed` avec la failing row complète (event 22:30→22:00), `memory_extraction_runs` en échec, `memory_items=0` après le premier batch abouti ; deuxième batch 200 avec 3 accepted / 4 rejected.
- **Correction attendue:** au niveau persist du memorizer : (1) validation/clamp `event_end >= event_start` par item avant insert (drop ou réparation de l'item fautif avec raison de rejet loggée), (2) insert par item ou par sous-transaction pour isoler un rejet DB au lieu de perdre le batch, (3) remonter le rejet dans `rejection_reasons` de l'extraction run. Vérifier aussi l'amont (`temporal_resolution.ts`) : l'inversion start/end vient probablement de la résolution d'une heure de soirée à cheval sur le fuseau (22h30 Paris → UTC).
- **Statut:** `fix_applied` — chantier V4-6 (2026-07-08). Deux étages : (a) AMONT — fenêtre inversée réparée à la validation (event_end abandonné + metadata) ; (b) CEINTURE — persist par item (log structuré `item_persist_failed`, la boucle continue) : un item rejeté ne perd plus le batch. + `error_message` lisible (fini `[object Object]`). Test e2e : batch avec fenêtre inversée → tout persisté, end abandonné.
- **Fix reference:** `memorizer/validate.ts`, `memorizer/persist.ts`
- **Tests requis:** positif (item événement avec end<start proposé → item rejeté seul, reste du batch persisté, raison loggée), intégration (batch complet avec 1 item invalide → N-1 persistés), anti-faux-positif (événements valides multi-fuseaux → pas de sur-rejet), régression temporal_resolution (heure de soirée locale → intervalle cohérent en UTC).

## Incidents d'environnement (hors bugs produit)

- **Edge runtime local instable pendant le batch memorizer** : deux redémarrages du runtime ont tué des batchs en vol (502/500 gateway), laissant une ligne `memory_extraction_runs` bloquée en `running` qui faisait skipper tout retrigger (`run_in_progress`). Déblocage manuel documenté (statut `failed` posé), puis batch complet obtenu. Même profil que l'incident nina r2 (2026-07-06). Suggestion robustesse produit (à trier séparément si souhaité) : lease/timeout sur les runs `running` pour qu'un crash ne bloque pas les batchs suivants.
- **Mineur observabilité** : la réponse JSON de `trigger-memorizer-daily` sérialise `extraction_run.error_message` en `"[object Object]"` — perte d'information de debug côté opérateur.

## Récapitulatif

| Bug id | Tours | Famille | Owner | Statut |
| --- | --- | --- | --- | --- |
| R8-B01 | T1 | BF-ROUTE-01 | coaching_recommendation / emotion_coaching | open (récurrence) |
| R8-B02 | T8, T12 | BF-EFFECT-02 | runtime pipeline / composer | open (confirmé multi-personas, cf. paul-r8 B02, régression `3de0b9a2`) |
| R8-B03 | T9 | BF-EFFECT-04 → BF-STATUS-01 | track_progress writer + triggers DB | known-issue V1 wont_fix (obs W5 vérifiée ; ré-ouverture proposée par paul-r8 B01) |
| R8-B04 | T15 | BF-STATUS-02 | composer récap / status projection | open (nouveau) |
| R8-B05 | batch | BF-MEMORY-01 | memorizer persist (+ temporal_resolution) | open (nouveau) |
