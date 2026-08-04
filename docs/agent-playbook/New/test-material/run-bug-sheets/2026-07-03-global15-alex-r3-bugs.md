# Bug Sheet — Global15 Alex R3 (2026-07-03)

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-global15-alex-r3.md`
Persona: Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`), scope `qa-global15-2026-07-03-alex-r3`. Plan V2 réel préexistant (« Retrouver un sommeil réparateur », plan `a15b08a7`) utilisé comme support puis restauré (non supprimé, non créé par ce run).

Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`.

Note de tendance: run **yellow** sans tour rouge. Les deux rouges structurels de R2 — stickiness de flow (R2-B01, BF-ROUTE-02) et commit mission manquant (R2-B02, BF-EFFECT-02) — **ne se reproduisent pas** ici (T3, T4 verts en DB), cohérent avec les fixes marqués `fix_applied` en R2. Un seul bug de rendu persiste (BF-LEDGER-02, déjà vu en R2-B03).

---

## R3-B01 — Confirmation de rappel auto-contradictoire avec l'effet créé

- Tours: T5
- Famille: **BF-LEDGER-02** (secondaire **BF-STATUS-02** — effet du tour décrit comme préexistant)
- Domaine owner: renderer/confirmation `create_one_shot_reminder` + lecture EffectLedger du tour
- Source amont: le pipeline de rendu de confirmation relit l'état après création et confond le rappel qu'il vient de créer avec un rappel préexistant. `tool_skill_run=needs_clarify` est incohérent avec un effet déjà commité. Même pathologie que R2-B03 (T6) — non résolu au rendu.
- Symptôme visible: baseline 0 rappel; l'utilisateur demande « rappel demain 22h »; Sophia crée bien le rappel (04/07 22:00 Paris) mais répond « Je ne peux pas le programmer ici parce qu'un rappel identique existe déjà pour demain à 22:00 [...] le besoin est déjà couvert ». Message auto-contradictoire.
- Preuve système: `direct_effects_to_run=[create_one_shot_reminder]`; DB `scheduled_checkins` `27534f96` créé CE tour, `scheduled_for 2026-07-04 20:00Z`, status pending; T12 (recap) confirme ce rappel unique + « aucun récurrent ». L'effet est correct, seul le rendu est faux.
- Correction attendue: le message de confirmation doit dériver de l'EffectLedger du tour (« je t'ai créé un rappel pour demain 22h »), avec un invariant runtime « never render a turn-created effect as pre-existing »; aligner `tool_skill_run` sur l'effet réellement commité. Pas de patch de phrase.
- Tests requis: reminder render = effet du tour (positif); anti-« déjà existant » (baseline 0 → message ne doit pas dire « existe déjà »); anti-« je ne peux pas programmer » quand `reminder.committed=true` (miroir de la règle track_progress ajoutée en R2-B02).
- Statut: fix_applied (rerun requis)
- Fix reference: mécanisme élucidé (auto-collision, même pathologie que Nina r1 T7 et rose-r3-B01) — deux sources amont corrigées : (1) la lane weekly de `runOperationRuntimePipeline` (`operation_runtime_pipeline.ts`) tournait aussi HORS bilan hebdo dès que la route demandait un `create_one_shot_reminder`, puis la lane principale ré-exécutait le même create dans le même tour ⇒ la 2e passe voyait l'écriture de la 1re et rendait `duplicate_pending`/`needs_clarify` contredisant le commit réel. La lane weekly est désormais conditionnée à un état weekly actif ; (2) la garde `duplicate_pending` de l'exécuteur (`one_shot_reminder/executor.ts`) exclut les lignes portant le `source_message_id` du tour courant — une ré-exécution retombe sur le chemin idempotent (`createReminderFromEffect`) et re-renvoie le même committed. Invariant : exécuter la lane N fois dans un tour converge vers `committed`, jamais vers un blocage. Tests : « executes one-shot reminder exactly once per turn outside weekly » (`operation_runtime_pipeline_test.ts`), « same-turn re-execution converges to committed, never self-duplicate » + anti-faux-positif duplicate réel (`one_shot_reminder_tool_test.ts`).

## R3-B02 — Coaching non grounded sur l'item actif du plan

- Tours: T1
- Famille: **`a classifier`** (grounding coaching/plan; proche BF-INTAKE-05 sémantique aplatie, mais owner correct)
- Domaine owner: `coaching_recommendation` (sélection de technique / grounding sur plan actif)
- Source amont: le skill ne conditionne pas assez sa recommandation sur les items actifs du plan. Face à une situation couverte précisément par un item actif (« Faire un sas de coupure / déchargement avant le lit » pour « cerveau qui ne s'arrête pas, trucs à pas oublier »), il génère une carte générique parallèle (« potion d'apaisement ») au lieu de relancer l'item.
- Symptôme visible: au moment exact que traite son plan, Sophia propose une technique distincte plutôt que le sas d'Alex → impression de « réinventer » le plan (critère persona: « comprend-elle le plan actif sans le reinventer »).
- Preuve système: T1 `response_owner=coaching_recommendation`, `route_reason_code=coaching_recommendation_signal`, aucune référence à l'item actif du plan; item sas `f56793eb` actif au moment du tour.
- Correction attendue: quand un item actif couvre la situation décrite, la recommandation doit d'abord relancer cet item avant de proposer une carte parallèle; grounding sur le plan actif, pas un mot-clé de wording.
- Tests requis: « situation couverte par item actif → recommandation relance l'item » (positif); anti-faux-positif (situation non couverte → carte générique reste légitime).
- Statut: open (à trier — pas de famille BF exacte pour le grounding coaching/plan; owner clair = `coaching_recommendation`)
- Fix reference: —

## R3-INC01 — Vérification e2e memorizer bloquée (incident infra, non-Sophia)

- Tours: T10, T13 (intentions mémoire)
- Famille: `a classifier` (verification gap, hors chemin IA Sophia)
- Domaine owner: infra locale (`INTERNAL_FUNCTION_SECRET` vault ↔ `functions serve` env)
- Source amont: `trigger-memorizer-daily` renvoie `403 {"error":"Forbidden"}` — désync entre le secret chargé par `supabase functions serve` et le secret vault utilisé pour signer l'appel interne. Le run interdisant reboot/reserve d'infra, le batch n'a pas pu être déclenché.
- Symptôme visible: aucun (côté user, les accusés in-turn T10/T13 sont corrects). Impact QA: `memory_items >= 1 après batch` non vérifiable ce run.
- Preuve système: accusés T10/T13 avec `memory_write_candidates_emitted=0` (write différé attendu); `trigger-memorizer-daily` → HTTP 403; vault `INTERNAL_FUNCTION_SECRET` présent mais non aligné avec l'env de serve.
- Correction attendue: resynchroniser le secret interne local (`scripts/local_sync_internal_secret.sh` + re-serve des functions) hors run, puis re-vérifier la persistance + la résolution de conflit T13 (correction « dimanches » → « veilles de réunion »).
- Tests requis: après batch, `memory_items` contient le fait contextualisé corrigé (T13 gagne sur T10), pas d'identité figée « insomniaque ».
- Statut: open (incident d'environnement, pas un bug produit)
- Fix reference: —
