# Bug Sheet — rose-global15-r4 (2026-07-03)

Run: `rose-global15-r4` — Persona Rose — scope isolé `qa-rose-global15-r4-iso` — Supabase local, IA réelle (`force_full_ai=true`).
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-rose-global15-r4.md`
Bilan tours: 8 green, 6 yellow, 1 red. Verdict global: **red**.

Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`.

---

## R4-B01 — Effet durable non consenti hors EffectLedger (`router_parallel_tracking_v2`)

- Bug id: R4-B01
- Tours: T14
- Famille: **BF-EFFECT-01** (effet durable non consenti) + **BF-TEST-01** (trace/ledger incohérent : effet durable absent du ledger du tour)
- Domaine owner: `router_parallel_tracking_v2` (admission d'effet, garde de consentement, intégration EffectLedger, observabilité)
- Source amont: chemin de tracking parallèle au router principal qui committe un `plan_item_progress` par **inférence de contexte résiduel** (framework « Cartographier les envies » cité aux T8/T13 comme *à faire*), hors du contrat EffectLedger du tour.
- Symptome visible: aucun (silencieux côté user) ; la conversation T14 porte sur une préférence de ton.
- Preuve systeme: `user_plan_item_entries` `6dd054bf` (`plan_item_id=525c8e06`, `outcome=completed`, `metadata.source=router_parallel_tracking_v2`, `source_message_id=fdf0923f` **inexistant dans `chat_messages`**), créée `03:03:22` (fenêtre T14, avant tout trigger memorizer) ; item `525c8e06` status `active`→`completed` (`updated_at=03:03:22`) ; **`effect_ledger` du tour T14 vide** (0 requested / 0 committed), owner `feature_opportunity`, `direct_effects=[]`.
- Correction attendue: tout effet durable DOIT transiter par l'EffectLedger du tour + garde de consentement ; un `track_progress` ne se committe que sur signal de complétion explicite pour l'item ciblé (jamais par inférence de contexte) ; observabilité : tout write durable visible dans la trace.
- Tests requis: (positif) complétion explicite d'un item → 1 entry visible au ledger ; (anti-faux-positif) tour sans intention de complétion → 0 entry, ledger cohérent ; (invariant) « aucune écriture `user_plan_item_entries` sans entrée committed correspondante dans l'EffectLedger du tour » ; (paraphrase) mention d'un item comme *à faire/rappel* ne déclenche jamais de complétion.
- Statut: `open`
- Fix reference: —

---

## R4-B02 — Compteur `current_reps` non incrémenté pour `tracking_type=count`

- Bug id: R4-B02
- Tours: T2
- Famille: **BF-EFFECT-02** (effet durable attendu absent)
- Domaine owner: writer `track_progress_plan_item` / `plan_item_progress` executor (mise à jour compteur)
- Source amont: le writer met à jour `current_reps` pour `boolean` (T1) et le `status` pour `task` (T6) mais n'incrémente pas `current_reps` pour `count`.
- Symptome visible: Sophia affirme « comptée ✅ / tu continues sur une vraie série » alors que le décompte ne bouge pas.
- Preuve systeme: entry `40241360` committée (`plan_item_id=d62d828a`, `progress/completed`), mais `Journée 100%` reste `current_reps=1/2`, `updated_at` item inchangé (pré-run `01:02`). Caveat: baseline compteur/entries déjà découplée avant run.
- Correction attendue: incrément cohérent de `current_reps` pour les 3 `tracking_type` (dérivé des entries ou incrément explicite), invariant couvrant `count`.
- Tests requis: (positif) log d'un jour count → `current_reps+1` ; (invariant) cohérence compteur/entries par `tracking_type` ; (intégration) recap lit un décompte juste.
- Statut: `open`
- Fix reference: —

---

## R4-B03 — Framework de plan nommé non routé vers un tool skill

- Bug id: R4-B03
- Tours: T3
- Famille: **BF-ROUTE-01** (mauvais owner) — gap de couverture
- Domaine owner: dispatcher / route policy + registre des tool skills framework
- Source amont: aucun flow actif à blâmer (T1/T2 `normal_reply`) ; un item `kind=framework` explicitement nommé (`Cibler le joint réflexe`, `bd2ef2a9`) ne déclenche aucun skill structuré → retombe en `normal_reply`.
- Symptome visible: réponse générique correcte mais aucun intake structuré, l'item de framework ne progresse pas.
- Preuve systeme: owner `normal_reply` / `normal_reply_default`, `skill_signals={}`, `tool_skill_run` absent, `direct_effects=none`.
- Correction attendue: prioriser le tool skill dédié quand un item de plan actif est nommé ; si le framework n'a pas de skill, câbler la couverture (gap documenté), pas un wording.
- Tests requis: (positif) « faisons le framework X maintenant » → activation du skill/intake ; (paraphrase) formulations variées nommant l'item ; (anti-faux-positif) mention non-actionnable du framework ne déclenche pas d'intake.
- Statut: `open`
- Fix reference: —

---

## R4-B04 — Fait mémoire personnel explicite non persisté

- Bug id: R4-B04
- Tours: T7
- Famille: **BF-MEMORY-01** (promesse mémoire non persistée) — **caveat environnement**
- Domaine owner: memory-v2 memorizer (extraction / write decision + robustesse batch)
- Source amont: fait personnel explicite (« retiens que le matin avant le café… ») traité par le memorizer mais non persisté ; batch cross-scope + échecs d'extraction transitoires `memory_v2_extraction_invalid_shape`.
- Symptome visible: accusé in-turn correct (« c'est noté, je le garde en tête ») — conforme à l'invariant ; la persistance différée manque.
- Preuve systeme: message T7 `f731f04a` → `memory_message_processing.processing_status=completed` (run `2c84c752`) ; aucun `memory_item` avec ce contenu après batch (les items persistés portent sur d'autres sujets) ; `trigger-memorizer-daily` a renvoyé `memory_v2_extraction_invalid_shape` (2×) avant succès.
- Correction attendue: (1) memorizer ne doit pas 500 tout un user sur `invalid_shape` (dégrader/retry par item) ; (2) un fait personnel explicitement demandé doit franchir le filtre de pertinence. **Re-vérifier en compte isolé** avant de figer la famille comme bug produit.
- Tests requis: (positif isolé) « retiens que … » → `memory_items>=1` avec le bon contenu post-batch ; (robustesse) extraction `invalid_shape` sur un item n'échoue pas tout le batch.
- Statut: `open`
- Fix reference: —

---

## R4-B05 — Multi-intention incomplète (annulation silencieusement abandonnée)

- Bug id: R4-B05
- Tours: T9
- Famille: **BF-AGENDA-01** (multi-intention incomplète)
- Domaine owner: TurnAgenda / pipeline de réponse finale
- Source amont: sur un tour à deux intentions (annuler rappel + question produit), un signal `product_help` fort capte le tour et l'intention d'annulation est droppée.
- Symptome visible: Sophia répond seulement à la question produit ; l'annulation n'est ni traitée ni accusée. Régression vs r3 T8.
- Preuve systeme: owner `product_help`, `effect_ledger` vide, rappel `92c0af7b` toujours `pending`.
- Correction attendue: couvrir chaque intention détectée, ou accuser explicitement celle non honorable (« je ne peux pas annuler ce rappel depuis ici »).
- Tests requis: (positif) tour bi-intention → deux réponses/accusés ; (invariant) aucune intention détectée n'est droppée en silence.
- Statut: `open`
- Fix reference: —

---

## R4-B06 — Séquence technique-first sur moment aigu (`time_critical_urge`)

- Bug id: R4-B06
- Tours: T11
- Famille: **BF-ROUTE-01** (owner/séquence sur moment sensible) — borde **BF-SAFETY-01**
- Domaine owner: safety pregate / route policy + contrat interne `coaching_recommendation`
- Source amont: sur `time_critical_urge`, l'owner reste `coaching_recommendation` (pitch cognitif « pense une carte avec 4 idées ») ; le grounding actionnable n'arrive qu'au 3e paragraphe.
- Symptome visible: réponse trop cognitive/lente au moment le plus aigu (« dans 2 minutes je roule »).
- Preuve systeme: owner `coaching_recommendation`, `safety.risk_band=medium` (`time_critical_urge`), `direct_effects=none` (correct : pas de side effect). Contraste r3 T10 (action immédiate d'emblée, owner `normal_reply`).
- Correction attendue: sur `time_critical_urge`, imposer séquence **action-immédiate d'abord**, préparation cognitive ensuite ; ou router vers l'owner de désescalade.
- Tests requis: (positif) message `time_critical_urge` → 1re phrase = geste immédiat ; (invariant) aucun side effect pendant le pic (déjà respecté).
- Statut: `open`
- Fix reference: —

---

## R4-B07 — Recap de plan déconnecté de l'état durable

- Bug id: R4-B07
- Tours: T13
- Famille: **BF-STATUS-01** (projection DB mal lue)
- Domaine owner: status/recap projection (plan snapshot runtime)
- Source amont: la projection de recap ne lit pas `user_plan_items.current_reps` / `user_plan_item_entries` ; se rabat sur le fil conversationnel + `scheduled_checkins`.
- Symptome visible: recap omet les validations d'habitudes du run (Journée 100% absente, sas sans décompte) et présente les rappels pending comme « ce qui reste à faire ».
- Preuve systeme: owner `normal_reply`, texte listant les 5 rappels (dont 4 résidus baseline) en « il te reste » ; aucune mention de `current_reps`/entries.
- Correction attendue: construire le recap depuis l'état plan réel (items, compteurs, entries récentes) ; ne pas confondre rappels et items de plan restants.
- Tests requis: (positif) après 2 validations → recap les reflète ; (anti-confusion) rappels non listés comme travail de plan ; (invariant) item loggé fait n'apparaît jamais « prévu ».
- Statut: `open`
- Fix reference: —

---

## R4-B08 — Préférence de coaching accusée mais non persistée

- Bug id: R4-B08
- Tours: T14
- Famille: **BF-LEDGER-01** (claim sans commit) + **BF-ROUTE-01** (persistance captée par `feature_opportunity`)
- Domaine owner: route policy (`feature_opportunity` vs tool d'écriture de préférence)
- Source amont: demande explicite d'enregistrement traitée comme opportunité produit ; « C'est noté, je le garde en tête » sans effet durable.
- Symptome visible: l'utilisateur croit son réglage enregistré ; il ne l'est pas.
- Preuve systeme: owner `feature_opportunity`, `effect_ledger` vide, 0 ligne `user_relation_preferences` pour Rose, aucun memory item de préférence de ton après batch.
- Correction attendue: si la préférence de ton est écrivable → router vers le tool (avec confirmation) ; si UI-only par design → le dire clairement plutôt que laisser croire à un enregistrement. (Distinguer de la tolérance memorizer, qui ne couvre que les faits personnels.)
- Tests requis: (positif) demande d'enregistrement → écriture DB **ou** message d'orientation UI explicite ; (invariant) pas de claim « c'est enregistré » sans effet.
- Statut: `open`
- Fix reference: —

---

### Note transverse (non-régressions confirmées ce run)

- `create_one_shot_reminder` : commit unique, pas de double-exécution / faux doublon → **`BF-LEDGER-02` de r3 non reproduit** (T8).
- `coaching_recommendation.action_context.plan_item_id` : `null` propre, **pas d'UUID blend halluciné** (contraste r3 T4/T9) (T5, T11).
- Relâche de flow sur clôture : owner `normal_reply` sur « bonne nuit », **pas d'owner résiduel `feature_opportunity`** (contraste r3 T15) (T15).
- Accueil émotionnel avant technique sur moment de culpabilité (T10) — amélioration vs r3 T9.
