# QA Run Report — adjust_plan_item handoff 3 runs

## 1. Contexte Du Test

- Date: 2026-06-01
- Runs:
  - `adjust-plan-action-20260601-r1`
  - `adjust-plan-level-20260601-r1`
  - `adjust-plan-whole-20260601-r1`
- Persona: `qa-skill`
- Objectif: lancer 3 runs reels `adjust_plan_item` couvrant action, niveau/semaine et plan global.
- Trajectoire: clarification/intake -> handoff -> apply_attempt -> repeat_handoff -> revise_handoff -> apply_attempt.
- Surfaces visees: dispatcher, active flow, `adjust_plan_item`, renderer, operation runtime pipeline, EffectLedger.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, connexions temporaires QA, aucun fallback deterministe.
- Validite QA: valide. Chaque run contient 6 tours reels.

## 2. Tours De Conversation

### Run 1 — Action `adjust-plan-action-20260601-r1`

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01`

**User**
> Je veux alléger l'action Respiration du soir cette semaine, sans abandonner l'objectif.

**Sophia**
> Je dois reprendre le brouillon proprement. Pour alléger la Respiration du soir cette semaine, tu veux que je touche à quoi concrètement : la durée, le rythme, ou la simplicité du protocole ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation: `adjust_plan_item`
- pending_confirmation: null
- executed_tools: `[]`
- durable_effect: `platform_handoff`

**Analyse si yellow/red**
- Symptome: clarification utile, mais wording "reprendre le brouillon" alors qu'aucun brouillon visible n'existe.
- Source amont probable: intake response wording.
- Owner runtime: `adjust_plan_item`.
- Correction recommandee: remplacer ce wording par une clarification domaine directe.

#### Tours 2-6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03`

**User**
> La durée : passe-la en version deux minutes, tous les soirs, juste pour garder le fil.  
> Ok vas-y applique cette version.  
> Redis-moi quoi faire dans Plan, mais court.  
> Rends-la encore plus légère : seulement une minute si je suis fatigué.  
> Ok applique maintenant cette version une minute.

**Sophia**
> Ce que je comprends : Respiration du soir bloque parce que l'entree est trop lourde.  
> Ma recommandation : Respiration du soir: Version mini de 2 minutes...  
> Où le faire dans Plan : dans la section Plan...  
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- statuses: `handoff_delivered`, `apply_attempt`, `repeat_handoff`, `revise_handoff`, `apply_attempt`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Systeme: bon no-mutation sur tout le run.
- Probleme: la demande "mais court" est ignoree au tour 4, Sophia repete tout le handoff.
- Source amont probable: renderer/policy `repeat_handoff`.
- Correction recommandee: mode compact pour repeat quand le user demande court.

### Run 2 — Niveau/Semaine `adjust-plan-level-20260601-r1`

#### Tour 1

**Verdict du tour:** green

**User**
> Cette semaine est trop chargée, je veux alléger le niveau actuel sans changer l'objectif global.

**Sophia**
> Qu’est-ce que tu veux alléger en priorité dans le niveau actuel : le volume, la fréquence, l’intensité ou la complexité ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- status: `clarifying`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01`

**User**
> Le volume : garde seulement deux mini-actions prioritaires cette semaine et reporte le reste.

**Sophia**
> Je peux te guider, mais il me manque une précision avant de formuler la recommandation à reprendre dans Plan.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- status: `clarifying`
- missing_slots: `current_level.affected_items`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le user donne volume + changement concret, mais Sophia reste bloquee sur une precision non nommee.
- Source amont probable: readiness niveau/semaine et message fallback de clarification.
- Owner runtime: `adjust_plan_item`.
- Correction recommandee: produire une recommandation prudente avec `missing_decisions` non bloquantes quand le changement est assez clair.

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02`

**User**
> Les deux mini-actions sont celles qui gardent le fil ; le reste peut attendre la semaine prochaine.

**Sophia**
> OK, deux mini-actions prioritaires, et le reste attend. Il me faut juste une mini-précision...

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `central_arbitrator_status_exact_priority`
- operation: null
- durable_effect: `none`

**Analyse si yellow/red**
- Symptome: le flow actif `adjust_plan_item` est perdu vers `normal_reply`.
- Source amont probable: active flow arbitration / turn intent arbitrator.
- Owner runtime: routers/arbitrators active flow.
- Correction recommandee: conserver `adjust_plan_item` propriétaire des suites de clarification de niveau.

#### Tours 4-6

**Verdict du tour:** green

**User**
> Dans Plan, je veux reprendre ça comme recommandation de niveau : deux mini-actions prioritaires, reste reporté.  
> Ok vas-y applique.  
> Redis-moi où le faire dans Plan.

**Sophia**
> [handoff complet niveau] ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- statuses: `handoff_delivered`, `apply_attempt`, `repeat_handoff`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`

### Run 3 — Whole Plan `adjust-plan-whole-20260601-r1`

#### Tour 1

**Verdict du tour:** green

**User**
> Je crois que tout mon plan ne colle plus : je veux revoir la trajectoire globale, pas juste une action.

**Sophia**
> D’accord : je dois juste savoir quels éléments du plan tu veux toucher en priorité...

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- status: `clarifying`
- scope guidance: `whole_plan`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-TEST-01`

**User**
> Ce qui ne colle plus, c'est l'ordre : je veux d'abord consolider la base, puis seulement après accélérer.

**Sophia**
> Ce que je comprends : ...  
> Ma recommandation : Raisonner en réordonnancement global du plan...  
> Où le faire dans Plan...  
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `orientation_clarification`
- operation: `adjust_plan_item`
- tool_skill_run.selected_handler: `adjust_plan_item`
- status: `handoff_delivered`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: sortie visible et tool run corrects, mais trace `selected_handler=orientation_clarification` alors que l'operation executee est `adjust_plan_item`.
- Source amont probable: trace/route metadata apres clarification active.
- Owner runtime: route trace / arbitration metadata.
- Correction recommandee: aligner `selected_handler` de trace courte avec le runtime effectivement rendu.

#### Tours 3-6

**Verdict du tour:** green

**User**
> Ok, applique ce réordonnancement global.  
> Redis-moi quoi reprendre dans Plan.  
> Rends ça plus prudent : ne change pas tout, ajoute juste une phase de consolidation avant l'accélération.  
> Ok applique cette version prudente.

**Sophia**
> [handoff whole-plan complet puis version révisée] ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- statuses: `apply_attempt`, `repeat_handoff`, `revise_handoff`, `apply_attempt`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Les trois scopes sont compris : action, niveau/semaine, whole plan.
- Les handoffs contiennent recommandation, preservation, evitements, destination Plan et no-mutation.
- Les demandes "ok applique" n'aboutissent jamais a une execution.
- Les revisions actives ne crashent plus.

**Problemes**
- Run action tour 4: "court" ignore. Famille: `BF-INTAKE-03`.
- Run niveau tour 2: clarification generique apres slot donne. Famille: `BF-INTAKE-01`.
- Run niveau tour 3: perte de flow vers `normal_reply`. Famille: `BF-ROUTE-02`.
- Run whole tour 2: trace courte incoherente. Famille: `BF-TEST-01`.

**Fix propose**
- Source amont: `adjust_plan_item` readiness + active flow arbitrators + trace metadata.
- Correction recommandee: mode repeat compact, seuil handoff niveau plus permissif, active flow ownership pour suites de clarification, alignement trace.
- Tests d'invariant attendus: repeat compact, level follow-up stays tool_skill, trace selected_handler equals runtime selected handler.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Action: stable `tool_skill / adjust_plan_item` sur les 6 tours.
- Niveau: rupture au tour 3 vers `normal_reply`, puis recuperation.
- Whole plan: operation correcte, mais trace `selected_handler` incoherente au tour 2.

**Skills / Operations / Tools**
- Tous les tours handoff valides gardent `executed_tools=[]`.
- Tous les tours handoff valides gardent `committed_effects=[]`.
- Aucun `pending_confirmation` cree.
- `apply_attempt` reste non-mutant sur les 3 runs.

**Memory / Effets durables**
- Aucun effet durable de plan observe dans les traces.
- Les connexions etaient temporaires et ont ete nettoyees apres run.

**Problemes**
- Run niveau T3: mauvais owner. Impact systeme red local, et verdict consolide red selon la regle stricte.
- Run whole T2: incoherence metadata trace.

**Fix propose**
- Source amont: active flow arbitration et trace mapping.
- Correction recommandee: garder `adjust_plan_item` propriétaire des suites "les deux mini-actions..." quand l'etat handoff/clarifying est actif; synchroniser `route_decision.selected_handler` et `tool_skill_run.selected_handler`.
- Tests d'invariant attendus: "les deux mini-actions..." inside active adjust_plan != `normal_reply`; whole-plan clarification resolved -> selected_handler trace `adjust_plan_item`.

## Verdict Global

- Verdict: red
- Raison principale: le no-mutation est respecte sur les trois runs, mais le run niveau perd l'active flow au tour 3 vers `normal_reply`; selon la regle stricte, ce red local rend le consolide red.
- Follow-up prioritaire: corriger l'arbitrage active flow niveau et le mode compact `repeat_handoff`.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-01-adjust-plan-handoff-3runs-bugs.md`
