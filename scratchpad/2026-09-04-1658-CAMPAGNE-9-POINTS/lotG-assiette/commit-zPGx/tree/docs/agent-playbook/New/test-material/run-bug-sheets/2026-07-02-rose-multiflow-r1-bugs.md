# Bug Sheet — 2026-07-02-rose-multiflow-r1

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-02-rose-multiflow-r1.md`
Persona: Rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`), plan « Libération progressive du cannabis ».
Cadre: IA réelle locale, `test-send-message` + `force_full_ai=true`. Run **non reset** (effets durables conservés à la demande).

---

## R1-B01 — Sur-escalade safety d'une urge de substance vers protocole crise vitale

- **Bug id:** R1-B01
- **Tours:** T2 (+ conséquences T3–T6)
- **Famille:** BF-SAFETY-01
- **Domaine owner:** safety skill (classifieur risk_band) + renderer crise
- **Source amont:** matrice de bandes de risque safety : `imminent_relapse_risk` / `time_critical_urge` mappés sur le palier `high` → `safety_crisis / acute_grounding`, renderer émettant 15/112/3114.
- **Symptome visible:** « envie de fumer un joint, pas craquer dans les 5 min » → « Appelle tout de suite le 15 ou 112, ou le 3114 ».
- **Preuve systeme:** `response_owner=safety`, `selected_handler=safety_crisis`, `reason_code=safety_high_critical_priority`, `safety.risk_band=high` reason_codes `imminent_relapse_risk,time_critical_urge`, `blocked_paths` = tous safety_priority.
- **Correction attendue:** séparer le palier « urge de consommation / rechute » du palier « danger imminent pour la vie ». Une urge de substance route vers support anti-rechute/co-régulation (mot de bascule, grounding, contact optionnel), jamais vers hotlines d'urgence vitale.
- **Statut:** fix_applied (à revérifier par run QA réel)
- **Fix reference:** doctrine risk_band dans `sophia-brain/dispatcher/dispatcher.prompts.ts` (règles 1b/1c : urge de substance plafonnée à medium, high/critical réservés au danger vital) + bump `DISPATCHER_V2_PROMPT_VERSION` ; tests `dispatcher_prompt_contract_test.ts` (« caps substance urge below safety high »).
- **Tests requis:** positif (substance urge ⇒ owner ≠ safety_crisis, 0 hotline vitale) ; paraphrase (« j'ai envie de boire/fumer/craquer ») ; anti-faux-positif (idéation suicidaire réelle ⇒ safety_crisis conservé) ; intégration runtime.

## R1-B02 — Flow safety non relâché sur désescalade explicite (+ rendu vide)

- **Bug id:** R1-B02
- **Tours:** T3, T4, T5, T6
- **Famille:** BF-SAFETY-01
- **Domaine owner:** safety flow reducer + renderer safety
- **Source amont:** `__active_skill_state` (`local_safety_flow` / `safety_crisis`) latché : ne libère pas malgré `risk_band=none` + corrections explicites répétées ; `flow_action=exit_to_global_dispatcher` sans effet sur le rendu ; 1 réponse vide (T3, HTTP 409).
- **Symptome visible:** même question de confirmation répétée 4×, 1 réponse vide, impossible de sortir du mode crise.
- **Preuve systeme:** `reason=active_safety_crisis` sur T3–T6 ; post-run `status=resolving`, phase `exit_check`, `working_state.risk_band=high`, `immediate_danger=false`, `consecutive_deescalated_turns=5` ; T3 essai 1 `empty_response=true`.
- **Correction attendue:** release borné du flow safety dès correction explicite + `risk_band=none` (pas au bout de `max_turns`) ; invariant anti-empty sur le rendu safety ; cohérence `flow_action=exit` ⇒ hand-off réel.
- **Statut:** fix_applied (à revérifier par run QA réel ; le state latché `scope=web` de Rose peut servir de cas réel)
- **Fix reference:** `sophia-brain/skills/safety_crisis/reducer.ts` (release `explicitCorrectionRelease` : clarification explicite + band none + ≥1 tour désescaladé ⇒ resolved ; dé-cliquet : `previousRiskBand` retiré du `maxRisk` quand désescalade attestée sans nouveau signal de risque) ; invariant anti-vide dans `skill.ts` + `visible_agent.ts` (`safetyCrisisDeterministicVisibleMessage`, `visible_fallback_used=true` observable) ; tests dans `local_flow_test.ts`.
- **Tests requis:** « correction + risk_band=none ⇒ flow released tour suivant » ; « rendu safety jamais vide » ; anti-régression (vraie crise reste active tant que non désescaladée).

## R1-B03 — Lecture du plan routée en mutation + projection non lue

- **Bug id:** R1-B03
- **Tours:** T7
- **Famille:** BF-ROUTE-03 (source amont) ; symptôme status BF-STATUS-01
- **Domaine owner:** dispatcher / route policy (read vs write) + status projection plan
- **Source amont:** « rappelle-moi mes actions en cours » classé `plan_realignment_signal` ; pas de chemin de lecture grounded sur `user_plan_items`.
- **Symptome visible:** « Je ne peux pas te lister tes actions depuis le chat… va dans Ajuster mon plan », alors que 7 items actifs existent.
- **Preuve systeme:** `response_owner=plan_realignment`, `action_reference.detected=false (semantic_inference_unavailable)`, effect_ledger 0.
- **Correction attendue:** distinguer lecture (« mes actions actives » ⇒ status/recap grounded) de mutation (« ajuster mon plan »). La lecture ne déclenche pas le flow de realignment.
- **Statut:** fix_applied (à revérifier par run QA réel)
- **Fix reference:** doctrine read-vs-write dans `sophia-brain/dispatcher/dispatcher.prompts.ts` (règle 6 : lecture/rappel du plan ⇒ jamais plan_realignment, réponse normale avec memory_plan actions ; exemples ajoutés au fallback) ; le companion ground déjà sur « SNAPSHOT COURT PLAN / ACTIONS ACTIVES » ; test contrat « routes plan reading away from plan_realignment ».
- **Tests requis:** « demande lecture plan ⇒ owner status, items réels cités, 0 realignment flow » ; paraphrase ; anti-faux-positif (« change mon plan » ⇒ realignment conservé).

## R1-B04 — Track-progress avalé par plan_realignment, effet durable absent

- **Bug id:** R1-B04
- **Tours:** T8
- **Famille:** BF-ROUTE-02 + BF-EFFECT-02
- **Domaine owner:** active-flow/interruption policy + track/effects executor + action_reference resolver
- **Source amont:** flow `plan_realignment` latché (`active_plan_realignment`) capte l'intention de tracking ; pas de résolution de l'item réel ni d'écriture d'entry.
- **Symptome visible:** « j'ai rangé mon matériel, note-le » → renvoi vers « Ajuster mon plan », rien d'enregistré.
- **Preuve systeme:** `response_owner=plan_realignment`, `action_reference.detected=false`, effect_ledger 0, `user_plan_item_entries=0` en DB.
- **Correction attendue:** track-progress = chemin de première classe (résoudre l'item actif → entry `user_plan_item_entries` / occurrence `done`), non absorbé par realignment ; interruption policy qui libère le flow tiers.
- **Statut:** fix_applied partiel (capture par le latch supprimée ; à revérifier par run QA réel que le chemin track-progress écrit bien l'entry hors latch)
- **Fix reference:** `sophia-brain/skills/plan_realignment/local_flow.ts` — plan_realignment devient one-shot : `status=complete` dès le message de redirection rendu, le flow ne latche plus (`__active_skill_state` nettoyé par le runtime), le tour suivant repart en dispatch global où `direct_effects.track_progress_plan_item` peut s'exécuter ; test « completes as one-shot after rendering guidance ».
- **Tests requis:** « report de complétion d'un item actif ⇒ 1 entry/occurrence done liée au bon item » ; anti-faux-positif (« je n'ai pas fait X » ⇒ pas d'entry done) ; intégration.

## R1-B05 — Reminder exécuté sous mauvais owner, rendu contaminé

- **Bug id:** R1-B05
- **Tours:** T9
- **Famille:** BF-ROUTE-02 + BF-LEDGER-02
- **Domaine owner:** interruption policy + final response composer
- **Source amont:** `create_one_shot_reminder` exécuté comme direct-effect sous `plan_realignment` latché ; final response agrège l'effet avec le boilerplate « Ajuster mon plan ».
- **Symptome visible:** « Le rappel 21h est bien pris en compte. Pour refaire le point sur ton plan, va dans Ajuster mon plan… » (tail parasite).
- **Preuve systeme:** `response_owner=plan_realignment` reason `active_plan_realignment_with_local_direct_effects` ; effect_ledger committed 1 ; `scheduled_checkins` id `45d61e4c`, `scheduled_for=2026-07-02T19:00:00Z` (=21h Paris, correct). **Effet durable correct**, rendu/owner incorrects.
- **Correction attendue:** effet direct explicite exécuté sous owner tool/effect dédié, rendu propre sans narratif d'un flow tiers.
- **Statut:** fix_applied (même fix que R1-B04 : sans latch plan_realignment, le reminder T9 se serait exécuté sous la lane direct-effect globale, sans boilerplate « Ajuster mon plan » ; à revérifier par run QA réel)
- **Fix reference:** `sophia-brain/skills/plan_realignment/local_flow.ts` (one-shot, cf. R1-B04).
- **Tests requis:** « reminder explicite ⇒ owner tool/effect, rendu sans boilerplate realignment » ; heure correcte (tz-aware).

## R1-B06 — Intention mémoire reconnue mais non persistée + mauvais owner

- **Bug id:** R1-B06
- **Tours:** T11
- **Famille:** BF-MEMORY-01 + BF-ROUTE-01
- **Domaine owner:** memory planner/writer + dispatcher/route policy
- **Source amont:** memory planner reconnaît `remember_recurrent_trigger_for_future_support` mais `targets=[]` (0 écriture) ; intention captée par `feature_opportunity`.
- **Symptome visible:** « garde-le en tête » → pitch d'« initiative » ; aucun accusé de mémorisation.
- **Preuve systeme:** `response_owner=feature_opportunity`, `memory_plan.targets=[]`, effect_ledger 0, `memory_items=0` en DB.
- **Correction attendue (révisée):** l'écriture `memory_items` est portée par le memorizer quotidien (`trigger-memorizer-daily` → extraction batch des messages du jour), pas par un chemin in-turn — pas de double écriture. Le fix in-turn se limite à : owner correct (pas feature_opportunity) + accusé de mémorisation véridique.
- **Statut:** fix_applied (à revérifier par run QA réel ; l'invariant `memory_items ≥ 1` doit se vérifier **après le passage du memorizer**, pas immédiatement après le tour)
- **Fix reference:** frontière feature_opportunity dans `sophia-brain/dispatcher/dispatcher.prompts.ts` (demande explicite de mémorisation ⇒ jamais feature_opportunity, réponse normale + accusé) + règle d'accusé sobre dans `sophia-brain/agents/companion.ts` (CONTEXT_RULES) ; tests contrat dispatcher (« keeps explicit memorization out of feature_opportunity ») et companion (« acknowledges explicit memorization requests »).
- **Tests requis:** « intention remember_* ⇒ memory_items ≥ 1 avec contenu correct » ; paraphrase ; anti-faux-positif (bavardage non-mémoire ⇒ 0 écriture) ; rétention cross-scope.

## R1-B07 — Entrée produit-first en fenêtre de rupture émotionnelle (secondaire)

- **Bug id:** R1-B07
- **Tours:** T1
- **Famille:** BF-ROUTE-01
- **Domaine owner:** route policy / handoff companion↔coaching
- **Source amont:** owner `coaching_recommendation` privilégié sur une phase de présence quand safety=medium avec `immediate_risk_of_relapse`.
- **Symptome visible:** « Je partirais sur une carte de défense » d'emblée, sans co-régulation, dans un moment aigu.
- **Preuve systeme:** `response_owner=coaching_recommendation`, `safety.risk_band=medium (substance_use_urge, immediate_risk_of_relapse)`, effect_ledger 0.
- **Correction attendue:** dans une fenêtre de risque de rechute, présence/ancrage court (mot de bascule) avant proposition d'outil de repérage ; arbitrage owner ajusté.
- **Statut:** fix_applied (à revérifier par run QA réel)
- **Fix reference:** doctrine « fenêtre de rupture en cours » dans `sophia-brain/dispatcher/dispatcher.prompts.ts` : craving/urge aigu décrit sans demande de levier ⇒ pas de signal coaching_recommendation, réponse normale (présence/co-régulation/ancrage court) d'abord ; renforcement de la priorité 5 ; test contrat « keeps presence-first during acute craving windows ». Anti-faux-positif conservé : une vraie demande de levier (« tu me proposes quoi ? », cf. T10) reste coaching_recommendation.
- **Tests requis:** « urge aiguë medium ⇒ présence/ancrage d'abord, outil ensuite » ; distinction mot-de-bascule (fenêtre de rupture) vs carte de défense (repérage pattern).
