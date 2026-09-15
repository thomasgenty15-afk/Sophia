# Bug Sheet — Nina Global15 R5 — 2026-07-07

Run: `global15-nina-20260707-r5` · Persona: Nina · Rapport: `qa-run-reports/2026-07-07-nina-global15-r5.md`
Verdict global: **red** (2 tours red : T12, T15 ; 1 tour yellow : T13). Taxonomie: `familly-bugs.md`.

---

## R5-B01 — Claim de complétion sans commit (« c'est fait ✅ » sur track bloqué)

- **Bug id**: R5-B01
- **Tours**: T12 (propagé au récap T15 → voir R5-B02)
- **Famille**: `BF-LEDGER-01` (claim sans commit) ; secondaire `BF-EFFECT-02` (gate `target_not_evidenced` bloque un track pourtant ciblé)
- **Domaine owner**: final response pipeline / EffectLedger guard (rendu) ; executor admission gate `track_progress_plan_item`
- **Source amont**: le guard de rendu ne dérive pas la formulation d'issue du `status` réel de chaque effet — un track `blocked` produit quand même « ranger les produits pièges hors de vue est bien fait ✅ ». Secondairement, sur input **contradictoire** (« je m'en occupe ce soir » + « c'est déjà fait aujourd'hui »), l'executor bloque le track (`target_not_evidenced`, cible pourtant résolue `e205079e`) sans porter la contradiction au rendu ni clarifier.
- **Symptôme visible**: Sophia affirme qu'un item de plan est fait alors qu'aucune entry n'existe et que l'item reste `active`.
- **Preuve système**: T12 `response_owner=normal_reply (direct_effects_then_normal_reply)`, ledger requested 2 / allowed 1 / **blocked 1** / committed 1 ; cancel `one_shot_reminder` committed (DB `0405ceb1`→`cancelled`, aucun doublon) ; `plan_item_progress.track` **blocked `target_not_evidenced`** (payload requested portait `target_item_id=e205079e`, `completed`) ; DB : `user_plan_items.e205079e` reste `active`, 0 entry.
- **Correction attendue**: contrat rendu↔ledger — interdire toute formulation de complétion (« c'est fait/rangé/validé/enregistré ») sans une entrée ledger `committed` correspondante ; l'issue visible dérive du `status` par effet. Sur input contradictoire, router vers une **clarification déterministe** (« tu l'as déjà rangé, ou tu comptes le faire ce soir ? ») plutôt qu'un claim.
- **Statut**: `fix_applied` — chantier V3-1 (2026-07-07)
- **Fix reference**: (a) directive déterministe MIXED_OUTCOMES_DIRECTIVE injectée au composeur quand un tour porte des issues DIVERGENTES (≥1 committed + ≥1 non-committed) : énumération par effet de ce qui peut être affirmé, vocabulaire de complétion réservé aux cibles committed — donnée d'entrée, jamais une réécriture de sortie ; (b) question de clarification dédiée sur `target_not_evidenced` couvrant le cas contradictoire (« c'est déjà fait ou tu comptes le faire ? »). Tests contrat 14/14 (divergent + anti-faux-positif). **Probe live** (Nina) : cancel + track ambigu dans le même tour → « Le rappel est supprimé. Pour "le machin", je n'ai pas assez de précision — dis-moi lequel » : le cancel confirmé SEUL, question pour le track, zéro claim généralisé.
- **Tests requis**: positif (track committed → « c'est fait » autorisé) ; anti-faux-positif (track `blocked`/`failed` → le visible ne contient jamais « c'est fait/rangé/validé ») ; paraphrase (input contradictoire « je le fais ce soir mais c'est déjà fait » → clarification, pas de claim) ; intégration (rendu multi-effets : cancel committed + track blocked → n'affirmer que le cancel).

---

## R5-B02 — Récap affirme une complétion non commitée (projection non grounde DB)

- **Bug id**: R5-B02
- **Tours**: T15
- **Famille**: `BF-STATUS-01` (projection DB mal lue) — propagation de R5-B01
- **Domaine owner**: status/recap projection
- **Source amont**: le récap lit l'historique conversationnel (le claim de T12) au lieu de la vérité DB (`user_plan_item_entries` + statut item + ledger) ; pas de garde « n'affirmer fait que si entry/commit existe ».
- **Symptôme visible**: le récap liste « rangé les produits pièges hors de vue » et « Ranger les produits pièges hors de vue : fait aujourd'hui » alors que l'item est `active` sans entry.
- **Preuve système**: T15 `response_owner=normal_reply`, safety band `none` (pas de faux positif tour neutre, R4-B06 OK), ledger 0 ; DB de contrôle : `e205079e` `active` 0 entry, seule entry réelle `f3cc336b` (pause), rappel actif `3745da4c` (19:09), `0405ceb1` `cancelled`. Reste du récap exact.
- **Correction attendue**: le récap se grounde sur la projection DB (entries + statut item + ledger), pas sur les claims conversationnels. Une complétion revendiquée mais non commitée doit apparaître « à faire » (ou explicitement « dit fait, non enregistré »).
- **Statut**: `fix_applied` — chantier V3-1c (2026-07-07)
- **Fix reference**: règle ancrée DANS le bloc snapshot (la donnée que le composeur lit) : « une complétion revendiquée en CONVERSATION qui n'apparaît pas dans les coches n'est PAS enregistrée — présente-la "à faire" (ou "annoncé, pas encore enregistré"), jamais comme faite, même si un message assistant précédent l'a affirmée ». Complété par l'invariant de complétude « reste à faire = TOUS les items non complétés » (V3-6, paul-r7 B03).
- **Tests requis**: positif (item avec entry `completed` → « fait ») ; anti-faux-positif (item sans entry mais revendiqué fait en conversation → « à faire ») ; intégration (récap post-run = miroir exact de `user_plan_item_entries` + `scheduled_checkins`).

---

## R5-B03 — Préférence de ton/relance non persistée (owner feature_opportunity)

- **Bug id**: R5-B03
- **Tours**: T13 (application vérifiée sur T14/T15)
- **Famille**: `BF-PREF-01` (préférence non appliquée runtime) + `BF-ROUTE-01` (mauvais owner)
- **Domaine owner**: dispatcher (route policy préférence vs feature_opportunity) + effect/executor de préférence coach (`update_coach_preferences`→`user_relation_preferences`)
- **Source amont**: une préférence sur le ton/la relance est routée vers `feature_opportunity` (détection d'opportunité produit) et n'écrit **rien** dans le store structuré `user_relation_preferences` (`preferred_tone`, `max_proactive_intensity`). La préférence n'est captée que par la mémoire nocturne + appliquée in-context.
- **Symptôme visible**: préférence acquittée « sur cette conversation » ; comportement corrigé dans le fil mais pas de garantie hors session.
- **Preuve système**: T13 `response_owner=feature_opportunity`, `reason_code=feature_opportunity_signal`, ledger 0 ; DB : `user_relation_preferences` **vide** pour Nina ; memory_item persisté (« préfère que les réponses aillent droit au but, sans relance systématique ») ; T14/T15 sans relance (in-context OK). T14 ensuite capté par le flow feature_opportunity résiduel (`active_feature_opportunity_with_local_direct_effects`, léger BF-ROUTE-02).
- **Correction attendue**: router une préférence de ton/relance/proactivité vers un update durable `user_relation_preferences` (confirmation légère) ; ne pas faire de la mémoire nocturne le seul dépôt d'une préférence runtime ; éviter que le flow feature_opportunity reste actif et capte les tours suivants.
- **Statut**: `closed` (arbitrage produit) — la persistance durable des préférences (`user_relation_preferences`) est actée « version prochaine » ; le comportement observé (engagement de session + application in-context + renvoi Préférences coach) est le comportement VOULU (doctrine W5). Nouveau depuis V3-6 : l'engagement de session est maintenant porté par l'état (`session_style_commitment`) et réinjecté à CHAQUE tour, soutien compris — cf. eva-r7 B01.
- **Tests requis**: « va droit au but / arrête de me relancer » → ligne `user_relation_preferences` créée (tone direct + intensité relance) ; paraphrase (« sois plus directe », « moins de questions ») → même owner ; anti-régression (le flow préférence ne capte pas le tour suivant non lié).

---

## Notes (non-bug produit / observations)

- **T1 incident environnement**: premier essai `502` gateway (upstream) — pipeline IA avait tourné (dispatcher + companion 200) mais aucun effet durable ni trace persistée ; **retry à l'identique → 200 en 4 s**, aucun doublon. Incident gateway transitoire, pas un bug produit.
- **Mémoire batch (hors périmètre in-turn)**: un item conflate la **demande** de réduction de cadence à 3 j/sem (T4, non appliquée — hand-off adjust plan) en **fait actuel**. À surveiller côté extraction memorizer (statement-as-fact sur un changement de plan non confirmé). Non gradé (hors chemin in-turn).
- **Positifs confirmés (pas de régression)**: R4-B03 (`drift_type` inversion) non reproduit — T4 `plan_too_heavy` correct ; R4-B04 (heure rappel relatif) non reproduit — T14 payload==DB==annonce ; R4-B06 (band collant/faux positif tour neutre) non reproduit — T11 `medium→low`, T15 `none` ; V2-A2 (cancel one-shot) OK — T12 cancel sans doublon ; arbitrage carte récurrent→défense / ponctuel→attaque+technique (T2/T3) correct.
