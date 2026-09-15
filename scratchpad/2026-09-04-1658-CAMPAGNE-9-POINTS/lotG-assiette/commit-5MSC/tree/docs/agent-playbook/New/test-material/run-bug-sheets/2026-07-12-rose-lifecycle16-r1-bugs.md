# Bug Sheet — 2026-07-12 rose-lifecycle16-r1

Run: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-12-rose-lifecycle16-r1.md`
Verdict global: red. Raw turns: `tests/real-personas/rose/runs/lifecycle-20260712/`.

## R1-B01 — Reçu de tracking mécanique sur aveu émotionnel

- Bug id: R1-B01
- Tours: T1
- Famille: `BF-ROUTE-01`
- Domaine owner: dispatcher + final response pipeline (ordre de composition)
- Source amont: priorité distress_support non levée sur auto-dévalorisation (« ça me saoule de moi ») ; gabarit tracking rendu en première phrase, pitch carte enchaîné
- Symptome visible: « C'est noté : … est marqué comme raté. » + pitch carte de défense, zéro accueil
- Preuve systeme: `t01.raw.json` — owner coaching_recommendation, committed skip/missed légitime (report explicite), mais aucune phrase d'accueil
- Correction attendue: invariant d'ordre : marqueur émotionnel négatif dans le message → accueil humain d'abord, reçu de tracking en une ligne sobre ensuite (même mécanique que l'ordre safety-d'abord acté V5-1)
- Statut: `fix_applied` (2026-07-13, chantier P2-7)
- Fix reference: invariant d'ordre porté par la guidance committed (donnée de tour, pas une règle companion) : message chargé émotionnellement + reçu de tracking → accueil humain en 1re phrase, reçu sobre ensuite, jamais de pitch enchaîné (verbatim T1).
- Tests requis: positif (report négatif + auto-dévalorisation → accueil en 1re phrase), anti-faux-positif (report négatif neutre → reçu direct OK), paraphrase

## R1-B02 — Cible replace non résolue malgré slot instruction

- Bug id: R1-B02
- Tours: T7
- Famille: `BF-INTAKE-01`
- Domaine owner: tool skill one_shot_reminder — résolution de cible
- Source amont: le matching de cible (replace/cancel) ne score pas le contenu d'instruction ; « celui de la carto demain matin » = match unique mais `replace_target_ambiguous`
- Symptome visible: « celui de 9h ou l'autre ? » alors que la cible était nommée
- Preuve systeme: `t07.raw.json` — needs_clarify `replace_target_ambiguous`, 2 pending dont un seul « carto » + matin
- Correction attendue: résolution de cible sur (instruction ⊕ fenêtre temporelle) avec seuil ; clarify seulement si ≥2 candidats au-dessus du seuil ; partagée cancel/replace/status
- Statut: `fix_applied` (2026-07-13, chantier P2-3c)
- Fix reference: résolution de cible par CONTENU D'INSTRUCTION (`maybeCancelOneShotReminder`) : sans heure dans le message, un recouvrement de tokens qui désigne UN SEUL pending résout ; ≥2 candidats positifs = vraie ambiguïté (clarify inchangé). Partagée cancel/replace. Tests triplet (« celui de la carto » + anti-FP deux cartos).
- Tests requis: positif (label unique → résolution directe), ambiguïté réelle (2 rappels similaires → clarify), paraphrase

## R1-B03 — Pending clarify replace perdu → boucle reschedule

- Bug id: R1-B03
- Tours: T6→T8 (rouge au T8)
- Famille: `BF-STATE-02`
- Domaine owner: tool skill reducer / Confirmation Contract
- Source amont: la réponse à `replace_target_ambiguous` repasse par l'intake comme énoncé neuf → reclassée intent=reschedule → blocage honnête P0-4 → consigne circulaire (« annule puis recrée » = ce que l'utilisatrice vient de faire). Le replace atomique fonctionne pourtant en énoncé auto-porté (T9 vert).
- Symptome visible: l'utilisatrice suit la suggestion de Sophia, répond à la clarification, et se fait re-bloquer ; opération supportée inatteignable en dialogue naturel
- Preuve systeme: `t06/t07/t08.raw.json` — blocked `reschedule_not_supported` → needs_clarify `replace_target_ambiguous` → blocked `reschedule_not_supported` ; DB intacte
- Correction attendue: persister le pending clarify (intent replace, heure cible, candidats) en temp_memory comme état adressable, consommé AVANT re-classification d'intent au tour suivant — même mécanique que les pending confirmations
- Statut: `fix_applied` (2026-07-13, chantier P2-3d)
- Fix reference: pending clarify replace persisté (`__one_shot_reminder_pending_clarification`, mécanique 3g) : exposé UNE fois au dispatcher au tour suivant avec les known_slots du NOUVEAU rappel — la réponse complète CE replace (règle 3g étendue, « ne reclasse JAMAIS en reschedule ») ; supersédé par toute exécution de lane. Tests (persisté/exposé une fois/supersédé).
- Tests requis: positif (clarify → réponse courte → replace committed atomique), abandon (réponse hors-sujet → pending relâché), paraphrase, anti-faux-positif (nouvelle demande indépendante après clarify)

## R1-B04 — Cancel affirmé jamais émis (multi-intention aplatie + claim sans commit)

- Bug id: R1-B04
- Tours: T14
- Famille: `BF-LEDGER-01` (amont : TurnFrame multi-intention)
- Domaine owner: TurnFrame builder + final response pipeline
- Source amont: message bi-intention (cancel explicite + question statut) → `turn_frame.direct_effects=[]`, `response_intent=status_check_reminder` ; le composeur affirme l'annulation avec un EffectLedger à 0. Résiduel documenté à la clôture P0 (« politique default-deny à renforcer si la prochaine vague le revoit ») — reproduit.
- Symptome visible: « Oui, le rappel de 12h30 pour appeler ta soeur est annulé. » ; DB : `ef38051a` toujours pending → rappel indésirable livré le lendemain 12h30
- Preuve systeme: `t14.raw.json` — route `normal_reply_default`, effect_ledger counts tous à 0, aucun tool_skill_run ; SELECT scheduled_checkins = pending
- Correction attendue: (1) garde default-deny contractuelle au composeur : aucune affirmation d'effet (annulé/créé/modifié) sans commit correspondant dans l'EffectLedger du tour — extension de P0-1 aux cancels ; (2) extraction multi-intention au TurnFrame (cancel + status dans le même message)
- Statut: `fix_applied` (2026-07-13, chantiers P2-1/P2-2)
- Fix reference: double volet : règle 46 MULTI-INTENTION (verbatim T14 : la question de statut n'absorbe JAMAIS le cancel — cancel émis, la réponse liste le reste depuis la DB) + invariant intra-frame P2-1 (le status_check ne fabrique pas de create). Probe live rose T14 : cancel RÉEL en DB (0 pending), 2× GREEN.
- Tests requis: positif (multi-intention → cancel committed + status exact), garde (ledger vide → le composeur dit qu'il n'a PAS annulé), paraphrases, intégration runtime

## R1-B05 — Verify affirme depuis l'historique, ignore la lane et la DB

- Bug id: R1-B05
- Tours: T15
- Famille: `BF-STATUS-01` (+ BF-LEDGER-01 maintenu sous confrontation)
- Domaine owner: status projection (verify) + final response pipeline
- Source amont: intent `verify_reminder_cancellation` sans lecture de projection DB ; la lane tool a levé needs_clarify `cancel_target_ambiguous` et le rendu l'ignore, ré-affirmant l'annulation depuis le fil de conversation. Symétrique de Paul triflow r1 T11-12 (verify niait un rappel committé ; ici verify affirme un cancel jamais committé) → même fix : source de vérité unifiée.
- Symptome visible: « Oui : le rappel … est bien annulé. » en réponse à « vérifie, j'ai pas confiance » ; DB pending
- Preuve systeme: `t15.raw.json` — tool needs_clarify `cancel_target_ambiguous`, frame détecte le cancel, réponse affirme l'état annulé ; SELECT = pending
- Correction attendue: verify/status = lecture projection DB obligatoire avant composition (invariant P0-3 étendu) ; le rendu doit refléter l'issue de la lane (needs_clarify ≠ affirmation)
- Statut: `fix_applied` (2026-07-13, chantier P2-2)
- Fix reference: invariant de rendu structurel `ensureClarifyQuestionVisible` (run.ts, point unique finalVisibleText) : un outcome needs_clarify sans question dans le texte final ré-injecte la question contractuelle de la lane — le verify ne peut plus « affirmer » par-dessus un needs_clarify muet. Probe live rose T15 : réponse alignée DB, 2× GREEN.
- Tests requis: verify après faux claim → réponse corrective basée DB ; verify après vrai cancel → confirmation ; anti-faux-positif (verify d'un rappel réellement annulé ne doit pas douter)

## Watch-points / incidents (non comptés comme bugs)

- **W01 (T4)** — `create_one_shot_reminder` émis 2× dans requested/allowed, 1 commit (convergence idempotente P0 OK). Famille BF-TEST-01 si ça dérive. Statut: watch.
- **W02 (T11)** — tenue du style session par la présence approximative en longueur (4 paragraphes vs « réponses courtes ») ; les commitments survivent au tour (pas de clobber). Borne d'altitude présence toujours non posée. Statut: watch (note récurrente Paul/Alex).
- **W03 (T6)** — blocage reschedule conforme P0-4 mais la suggestion de contournement pointe vers le chemin cassé par R1-B03 et ne nomme pas la cible (« ce rappel » avec 2 pending). Se résout avec B03. Statut: lié à B03.
- **E1 (environnement)** — batch memorizer `daily_batch` (`memorizer_v2_async: true`) exécuté à 21:26:24 UTC pendant le run, non déclenché par l'agent QA ni par pg_cron (cron `trigger-memorizer-daily` désactivé pendant le run, aucune entrée `cron.job_run_details`). La branche courante modifie `memorizer_async.ts` : vérifier si un déclenchement async post-tour a été introduit (→ mettre à jour la doctrine « aucun write mémoire in-turn » des guidelines) ou si un process parallèle a appelé la fonction. Items vérifiés puis nettoyés ; sans impact sur les verdicts. Statut: à investiguer.
