# Bug Sheet — Global 15 (multiflow) — Nina — R1

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-global15-nina-r1.md`

## R1-B01

- Bug id: R1-B01
- Tours: 12
- Famille: BF-STATUS-01 (projection DB mal lue) + BF-STATUS-02 (historique incomplet)
- Domaine owner: context loader / status projection pour requêtes de statut plan (en amont de `normal_reply`)
- Source amont: la réponse à « où j'en suis sur mes objectifs ? » est construite depuis le contexte conversationnel (« ce que j'ai sous la main ») au lieu d'une projection des `user_plan_items`. Aucun retrieval plan sur le tour ; l'ajustement non committé du T7 est traité comme un fait.
- Symptome visible: « le seul objectif actif clairement en cours c'est la journée sans grignotage… passée à 1 fois par semaine. Le reste n'apparaît pas comme actif ici. » — faux : 6 items actifs en DB ; l'ajustement à 1x/semaine n'a jamais été appliqué ; le progrès réel (pause 1/3 loggée au T4) est omis.
- Preuve systeme: `response_owner=normal_reply`, `reason_code=normal_reply_default`, `direct_effects=[]`, `memory_mode=light`, aucun retrieval plan. DB : `select count(*) from user_plan_items where user_id=… and status='active'` = 6 ; `user_plan_items.target_reps` (Journée sans grignotage) = 2 (inchangé) ; aucun effet durable `adjust_plan` sur le run. Rétractation au T13 confirme l'infondé.
- Correction attendue: une requête de statut/progression doit forcer le chargement de la projection plan (items actifs + reps + entries récentes) ; un ajustement recommandé mais non committé ne doit jamais être rendu comme appliqué.
- Statut: fix_applied (chantier F3, rerun requis)
- Fix reference: diagnostic — la règle companion désignait « SNAPSHOT COURT PLAN / ACTIONS ACTIVES » comme source des recaps, mais cette section n'était **construite nulle part**. Fix : `activePlanSnapshotPromptBlock` (`direct_effect_local_context.ts`) construit le bloc à chaque tour depuis le `planItemSnapshot` déjà chargé, injecté inconditionnellement au companion (run.ts) — liste exhaustive avec count réel, interdiction explicite d'inventer un item/rappel ou de présenter un ajustement non committé comme appliqué (politique default-deny du chantier O pour ce dernier point). Le « seul objectif actif » de T12 devient impossible : les 6 items actifs sont dans le contexte de chaque tour.
- Tests requis: (positif) « question statut → items actifs lus depuis `user_plan_items`, count correct » ; (anti-faux-positif) « ajustement recommandé non committé ≠ rendu appliqué » ; (intégration) « après reco `adjust_plan` sans commit, requête statut n'affirme pas le nouveau rythme ».

## R1-B02

- Bug id: R1-B02
- Tours: 7, 8, 9
- Famille: BF-ROUTE-02 (ancien flow capture une nouvelle intention) ; secondaire T9 : BF-INTAKE-06 (mauvais domaine sémantique)
- Domaine owner: dispatcher active-flow policy (re-détection de signaux pendant flow ouvert) + `skills/coaching_recommendation`
- Source amont: une fois `coaching_recommendation` actif (depuis T1), les tours suivants routent `active_coaching_recommendation` avec `skill_signals={}` — les signaux critiques (émotion, ambiguïté, intention structurelle) ne sont pas réévalués tant que le flow n'exit pas. L'intention d'ajustement explicite (T7) et la détresse émotionnelle (T8, T9) sont capturées par le flow reco au lieu d'être préemptées / re-dispatchées.
- Symptome visible: T7 « je voudrais la réduire à 1 fois par semaine pour de bon » → renvoi UI sans re-dispatch ; T8 « j'en peux plus de tout gérer toute seule » ignoré (reste sur la cadence) ; T9 « je me sens seule / laisse tomber le plan » → recommandation de potion (feature) au lieu de présence. Le comportement de présence correct n'apparaît qu'après refus explicite (T10).
- Preuve systeme: T8/T9 `reason_code=active_coaching_recommendation`, `skill_signals={}`, `skill_run.status=continue`, `safety=none` ; le flow n'exit (`status=exit`, `normal_reply`) qu'au T11 sur une intention nettement différente (mémoire).
- Correction attendue: réévaluer émotion/safety/ambiguïté à chaque tour même flow actif et autoriser un exit émotionnel/préemption ; une intention structurelle ou émotionnelle explicite pendant un flow reco doit déclencher un re-dispatch ou un handoff vers l'owner de soutien.
- Statut: open
- Fix reference: —
- Tests requis: (positif) « détresse émotionnelle explicite pendant flow coaching → owner soutien / exit, 0 reco feature au 1er tour » ; (paraphrase) variantes de « laisse tomber le plan, je me sens seule » ; (positif) « intention adjust explicite pendant flow actif → re-évaluation, pas capture silencieuse » ; (anti-faux-positif) « poursuite normale du flow reco quand aucun signal critique nouveau ».

## R1-B03

- Bug id: R1-B03
- Tours: 2, 3, 6
- Famille: BF-STATE-01 (mauvaise transition de flow — reducer local)
- Domaine owner: `skills/coaching_recommendation/local_flow.ts` (transitions d'état)
- Source amont: après acceptation explicite de l'utilisatrice (« montre-moi », « aide-moi à préciser », « prépare-moi la carte »), le reducer reste sur un step de recommandation/paraphrase au lieu de transitionner vers un accompagnement de slots OU un close net vers la surface Plan. Régime incohérent : tantôt offload UI (T2), tantôt fabrication inline (T6), jamais un aboutissement.
- Symptome visible: T2 re-recommande + pointe le Plan + re-propose ; T3 paraphrase les 4 éléments puis re-relance ; T6 produit le texte magique inline sans artefact durable ni close (typo « Ça te aide » = rendu non gardé). Boucle non convergente sur paraphrase.
- Preuve systeme: T2/T3/T6 `response_owner=coaching_recommendation`, `reason_code=active_coaching_recommendation`, `skill_run.status=continue`, `direct_effects=[]`, ledger vide sur les 3 tours.
- Correction attendue: après acceptation, choisir une trajectoire déterministe unique (guider les slots en conversation, ou close + pointer surface Plan) ; consommer les slots déjà fournis (moment critique 21h fourni au T3) au lieu de re-demander.
- Statut: open
- Fix reference: —
- Tests requis: (positif) « acceptation reco → step unique déterministe, pas de double-tête offload+relance » ; (positif) « slot fourni (moment critique) → consommé, pas re-demandé » ; (anti-faux-positif) « pas de close prématuré quand l'utilisateur pose encore une question sur la carte ».
