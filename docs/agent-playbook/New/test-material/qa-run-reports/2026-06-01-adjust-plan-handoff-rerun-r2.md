# QA Run Report - adjust_plan_item handoff rerun R2

## 1. Contexte Du Test

- Date: 2026-06-01
- Runs:
  - `adjust-plan-action-20260601-r2`
  - `adjust-plan-level-20260601-r2`
  - `adjust-plan-whole-20260601-r2`
- Persona: `qa-skill`
- Connexions dediees:
  - `adjust_plan_action_20260601_r2` / user `70c60097-7aa3-4584-b47d-261d5e3ccdf1`
  - `adjust_plan_level_20260601_r2` / user `3f27e976-3664-4fb1-b7da-535761f187bf`
  - `adjust_plan_whole_20260601_r2` / user `eb035934-c822-44bf-b390-2de619b57106`
- Objectif: verifier apres correctifs que `adjust_plan_item` reste un handoff coaching no-mutation sur action, niveau courant et whole plan.
- Trajectoire: intake/clarification -> handoff -> apply_attempt -> repeat_handoff -> revise_handoff -> apply_attempt/repeat.
- Surfaces visees: dispatcher, active handoff arbitration, `adjust_plan_item`, renderer handoff, traces, EffectLedger.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, 6 tours par run, pas de renderer deterministe ni fallback.
- Validite QA: valide. Les 18 tours ont renvoye `http_status=200` avec reponses Sophia et traces courtes.

## 2. Tours De Conversation

### Run 1 - Action `adjust-plan-action-20260601-r2`

#### Tour 1

**Verdict du tour:** green

**User**
> J’ai besoin de rendre l’action Respiration du soir plus légère cette semaine, sans lâcher l’objectif.

**Sophia**
> Qu’est-ce qui doit être allégé exactement pour Respiration du soir : la durée, l’intensité, la fréquence ou les conditions d’exécution ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: null
- direct_effects: `[]`
- operation: `adjust_plan_item`
- pending_confirmation: null
- executed_tools: `[]`
- durable_effect: `platform_handoff`

#### Tour 2

**Verdict du tour:** green

**User**
> La durée surtout : je veux une version deux minutes, tous les soirs, juste pour garder le fil.

**Sophia**
> Ce que je comprends : Respiration du soir bloque parce que l'entree est trop lourde.
>
> Ma recommandation : Respiration du soir, en version de 2 minutes, tous les soirs, pour cette semaine.
>
> Où le faire dans Plan : dans la section Plan. Ouvre Respiration du soir.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `same_operation_signal_continues_active_handoff`
- operation: `adjust_plan_item`
- status: `handoff_delivered`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

#### Tour 3

**Verdict du tour:** green

**User**
> Ok vas-y applique cette version deux minutes.

**Sophia**
> [Répète le handoff action complet] ... Où le faire dans Plan : dans la section Plan. Ouvre Respiration du soir. Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_handoff_apply_attempt`
- operation: `adjust_plan_item`
- status: `apply_attempt`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

#### Tour 4

**Verdict du tour:** green

**User**
> Redis-moi quoi faire dans Plan, mais court.

**Sophia**
> À reprendre dans Plan : Respiration du soir, en version de 2 minutes, tous les soirs, pour cette semaine.
>
> Où : dans la section Plan.
>
> - ouvre la section Plan
> - Ouvre Respiration du soir
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_handoff_repeat_handoff`
- operation: `adjust_plan_item`
- status: `repeat_handoff`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

#### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - contrainte/revision rendue trop brute

**User**
> Rends-la encore plus légère : une minute les soirs où je suis fatigué.

**Sophia**
> Ce que je comprends : Respiration du soir bloque parce que l'entree est trop lourde.
>
> Ma recommandation : Version révisée demandée : Rends-la encore plus légère : une minute les soirs où je suis fatigué. Reprends cette version dans Plan en réduisant seulement la charge concernée, sans transformer l'objectif global.
>
> Où le faire dans Plan : dans la section Plan. Ouvre Respiration du soir.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_handoff_revise_handoff`
- operation: `adjust_plan_item`
- status: `revise_handoff`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

**Analyse si yellow/red**
- Symptome: la revision est bien non-mutante, mais le renderer recopie la demande avec le prefixe mecanique `Version révisée demandée`.
- Source amont probable: `reviseAdjustPlanHandoffDraft` / renderer revision.
- Owner runtime: `adjust_plan_item`.
- Meilleure correction selon les guidelines: regenerer une recommandation revisee lisible, pas une simple enveloppe de la phrase user.
- Pourquoi ce n'est pas un patch local: le probleme touche la policy de revision du handoff, pas une phrase unique.

#### Tour 6

**Verdict du tour:** green

**User**
> Ok applique maintenant la version une minute.

**Sophia**
> [Répète la version révisée] ... Où le faire dans Plan : dans la section Plan. Ouvre Respiration du soir. Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_handoff_apply_attempt`
- operation: `adjust_plan_item`
- status: `apply_attempt`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

### Run 2 - Niveau `adjust-plan-level-20260601-r2`

#### Tour 1

**Verdict du tour:** green

**User**
> Cette semaine je suis trop chargé : je veux alléger le niveau en cours, pas revoir tout mon objectif.

**Sophia**
> Ce que je comprends : la demande ne remet pas en cause l’objectif global ; elle signale une surcharge temporaire.
>
> Ma recommandation : rester sur un ajustement de charge à l’intérieur du niveau actuel.
>
> Point à clarifier avant de le reprendre dans Plan : choisir dans Plan les actions prioritaires à garder sur la période concernée.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation: `adjust_plan_item`
- status: `handoff_delivered`
- missing_slots: `["current_level.affected_items"]`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

#### Tour 2

**Verdict du tour:** green

**User**
> Ok vas-y applique cet allègement du niveau.

**Sophia**
> [Répète le handoff niveau complet] ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_handoff_apply_attempt`
- operation: `adjust_plan_item`
- status: `apply_attempt`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

#### Tour 3

**Verdict du tour:** green

**User**
> Redis-moi où le faire dans Plan, mais très court.

**Sophia**
> À reprendre dans Plan : rester sur un ajustement de charge à l’intérieur du niveau actuel.
>
> À trancher dans Plan : choisir dans Plan les actions prioritaires à garder sur la période concernée.
>
> Où : dans la section Plan.
>
> - ouvre la section Plan
> - Ouvre le niveau ou la semaine concernée
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_handoff_repeat_handoff`
- operation: `adjust_plan_item`
- status: `repeat_handoff`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

#### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - revision rendue trop brute

**User**
> Rends ça plus concret : garde deux mini-actions qui maintiennent le fil, et reporte le reste à la semaine suivante.

**Sophia**
> Ma recommandation : Version révisée demandée : Rends ça plus concret : garde deux mini-actions qui maintiennent le fil, et reporte le reste à la semaine suivante. Reprends cette version dans Plan en réduisant seulement la charge concernée, sans transformer l'objectif global.
>
> Où le faire dans Plan : dans la section Plan. Ouvre le niveau ou la semaine concernée.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_handoff_revise_handoff`
- operation: `adjust_plan_item`
- status: `revise_handoff`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

**Analyse si yellow/red**
- Symptome: revision utile et non-mutante, mais la phrase est recopiee au lieu d'etre transformee en recommandation propre.
- Source amont probable: revision handoff draft.
- Owner runtime: `adjust_plan_item`.
- Meilleure correction selon les guidelines: produire une `recommended_change` reformulee et actionnable.
- Pourquoi ce n'est pas un patch local: meme defaut que l'action T5, donc source commune de revision.

#### Tour 5

**Verdict du tour:** green

**User**
> Ok applique cette version concrète.

**Sophia**
> [Répète la version révisée] ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_handoff_apply_attempt`
- operation: `adjust_plan_item`
- status: `apply_attempt`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

#### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - contrainte explicite perdue

**User**
> Redis-moi juste la destination Plan.

**Sophia**
> [Répète le handoff complet niveau] ... Où le faire dans Plan : dans la section Plan. Ouvre le niveau ou la semaine concernée. Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_handoff_repeat_handoff`
- operation: `adjust_plan_item`
- status: `repeat_handoff`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

**Analyse si yellow/red**
- Symptome: le user demande seulement la destination; Sophia renvoie le handoff complet.
- Source amont probable: detection de repeat compact limitee a certains mots, pas a l'intention "juste la destination".
- Owner runtime: `adjust_plan_item` renderer/repeat policy.
- Meilleure correction selon les guidelines: le repeat doit conserver le handoff actif tout en respectant la contrainte de sortie courte.
- Pourquoi ce n'est pas un patch local: il faut traiter la contrainte de format dans la policy de repeat, pas ajouter une phrase fixe.

### Run 3 - Whole Plan `adjust-plan-whole-20260601-r2`

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - wording brouillon avant draft

**User**
> Je crois que la trajectoire globale du plan n’est plus dans le bon ordre ; je veux revoir le whole plan plutôt qu’une action isolée.

**Sophia**
> Je dois d’abord verrouiller la dernière précision pour reprendre le brouillon proprement : peux-tu me donner l’ordre actuel des phases du plan ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation: `adjust_plan_item`
- status: `clarifying`
- missing_slots: `["draft_generation_retry_needed"]`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

**Analyse si yellow/red**
- Symptome: la clarification est dans le bon domaine, mais parle de "brouillon" alors qu'aucun brouillon visible n'existe.
- Source amont probable: question writer / generation retry wording, pas le sanitizer du chemin standard.
- Owner runtime: `adjust_plan_item` question generation.
- Meilleure correction selon les guidelines: supprimer le langage de draft invisible dans toutes les clarifications whole plan.
- Pourquoi ce n'est pas un patch local: le wording vient d'un chemin de clarification different de celui corrige precedemment.

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - sur-clarification

**User**
> Aujourd’hui j’ai d’abord une phase d’accélération, puis seulement après une base de consolidation. Je veux inverser : consolider d’abord, accélérer ensuite.

**Sophia**
> Quelle partie du plan doit rester inchangée quand j’inverse l’ordre : la consolidation, l’accélération, ou les deux en gardant leur contenu ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `same_operation_signal_continues_active_handoff`
- operation: `adjust_plan_item`
- status: `clarifying`
- missing_slots: `["draft_generation_retry_needed"]`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

**Analyse si yellow/red**
- Symptome: le user donne une solution concrete whole plan, mais le skill reste en clarification.
- Source amont probable: readiness whole plan / draft generation retry.
- Owner runtime: `adjust_plan_item`.
- Meilleure correction selon les guidelines: si le user fournit ordre actuel + ordre cible, produire un handoff prudent avec `preserve`/`avoid`, sans exiger une precision supplementaire sauf contradiction.
- Pourquoi ce n'est pas un patch local: il faut ajuster le reducer readiness whole plan.

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - ancien/active flow perdu

**User**
> Les deux phases doivent garder leur contenu ; je veux seulement l’ordre base de consolidation d’abord, accélération ensuite.

**Sophia**
> Parfait : on garde le contenu tel quel, et on inverse juste l’ordre. Donc ça donne :
> 1) consolidation d’abord
> 2) accélération ensuite
>
> Tu veux que l’interface/“whole plan” soit réécrit comme une simple liste de phases, ou tu préfères que je garde aussi le même style de wording que l’ancienne version ?

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `central_arbitrator_status_exact_priority`
- operation: null
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: n/a
- durable_effect: `none`

**Analyse si yellow/red**
- Symptome: le flow actif `adjust_plan_item` est perdu au moment exact ou le user repond au slot manquant whole plan.
- Source amont probable: active handoff arbitration / turn intent arbitration pour suites whole plan.
- Owner runtime: router active flow.
- Meilleure correction selon les guidelines: conserver `adjust_plan_item` proprietaire des reponses de clarification whole plan tant qu'il n'y a pas d'intention concurrente explicite.
- Pourquoi ce n'est pas un patch local: c'est une erreur d'ownership runtime, pas une phrase de renderer.

#### Tour 4

**Verdict du tour:** green

**User**
> Dans Plan, je veux reprendre ça comme recommandation whole plan : garder le contenu, mais placer consolidation avant accélération.

**Sophia**
> Ce que je comprends : la demande porte sur un réordonnancement global du plan, pas sur une modification de contenu.
>
> Ma recommandation : préserver le contenu des phases et réordonner la trajectoire pour que la consolidation serve de prérequis à l’accélération.
>
> Où le faire dans Plan : dans la section Plan. Ouvre la vue du plan global.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `same_operation_signal_continues_active_handoff`
- operation: `adjust_plan_item`
- status: `handoff_delivered`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

#### Tour 5

**Verdict du tour:** green

**User**
> Ok applique ce réordonnancement global.

**Sophia**
> [Répète le handoff whole plan complet] ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_handoff_apply_attempt`
- operation: `adjust_plan_item`
- status: `apply_attempt`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

#### Tour 6

**Verdict du tour:** green

**User**
> Redis-moi quoi reprendre dans Plan, en version courte.

**Sophia**
> À reprendre dans Plan : traiter la demande comme un problème de séquence whole_plan ; préserver le contenu des phases et réordonner la trajectoire pour que la consolidation serve de prérequis à l’accélération.
>
> Où : dans la section Plan.
>
> - ouvre la section Plan
> - Ouvre la vue du plan global
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_handoff_repeat_handoff`
- operation: `adjust_plan_item`
- status: `repeat_handoff`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les runs action et niveau sont globalement fluides: clarification utile, handoff complet, apply_attempt non-mutant, repeat compact quand "court" est explicite.
- Le handoff whole plan final est utile apres recuperation: il preserve le contenu, recommande le reordonnancement et donne la destination Plan.
- Les phrases "ok applique" ne produisent pas de "c'est fait" ni de claim de modification.

**Problemes**
- Run action T5: revision mecanique avec `Version révisée demandée`. Famille: `BF-INTAKE-03`. Impact: sortie moins coach, mais utilisable. Severite: yellow.
- Run niveau T4: meme revision mecanique. Famille: `BF-INTAKE-03`. Impact: recommandation moins professionnelle. Severite: yellow.
- Run niveau T6: "juste la destination Plan" ignore, handoff complet rendu. Famille: `BF-INTAKE-03`. Impact: contrainte de concision partiellement perdue. Severite: yellow.
- Run whole T1-T2: whole plan sur-clarifie et parle de brouillon invisible. Famille: `BF-INTAKE-01`. Impact: friction conversationnelle. Severite: yellow.
- Run whole T3: reponse normale hors handoff, sans destination Plan ni no-mutation explicite. Famille: `BF-ROUTE-02`. Impact: rupture visible du flow. Severite: red.

**Fix propose**
- Source amont: `adjust_plan_item` revision handoff, question writer whole plan, active handoff arbitration pour suites whole plan.
- Correction recommandee: transformer la revision en recommandation propre; etendre le compact repeat aux intentions "juste la destination"; garantir que les reponses de clarification whole plan restent proprietaires du skill.
- Tests d'invariant attendus: "les deux phases gardent leur contenu..." inside active whole-plan handoff reste `tool_skill/adjust_plan_item`; "juste la destination Plan" produit une reponse destination-only; revision ne contient pas `Version révisée demandée`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Action: `tool_skill / adjust_plan_item` stable sur les 6 tours.
- Niveau: `tool_skill / adjust_plan_item` stable sur les 6 tours.
- Whole plan: T1-T2 restent `tool_skill / adjust_plan_item`, T3 tombe a `normal_reply`, T4-T6 recuperent `tool_skill / adjust_plan_item`.

**Skills / Operations / Tools**
- Tous les tours handoff valides ont `operation=adjust_plan_item`.
- Les `apply_attempt` action/niveau/whole plan ne declenchent pas d'executor.
- Les `repeat_handoff` action et whole plan respectent la forme compacte quand "court" est explicite.
- Le run whole plan T3 n'a pas de `tool_skill_run`, donc pas de renderer handoff ni destination Plan.

**Memory / Effets durables**
- `executed_tools=[]` sur tous les tours.
- `committed_effects=[]` sur tous les tours `tool_skill`.
- `pending_confirmation=null` sur tous les tours.
- Aucun `durable_effect` plan n'est observe; les tours handoff restent `platform_handoff`.

**Problemes**
- Run whole T3: mauvais owner `normal_reply` au lieu de `adjust_plan_item`. Famille: `BF-ROUTE-02`. Impact systeme: active flow casse, verdict red.
- Run whole T1-T2: readiness/clarification whole plan trop conservative apres solution concrete. Famille: `BF-INTAKE-01`. Impact systeme: trop de tours avant handoff.
- Run niveau T6: repeat policy ne mappe pas "juste la destination Plan" vers un compact destination-only. Famille: `BF-INTAKE-03`. Impact systeme: contrainte de rendu perdue.

**Fix propose**
- Source amont: `handoff_flow_arbitration`, `adjust_plan_item` whole-plan readiness, `renderAdjustPlanHandoffDraft`/repeat policy.
- Correction recommandee: traiter les suites de clarification whole plan comme continuation forte du handoff; rendre `draft_generation_retry_needed` moins bloquant quand le user donne ordre actuel + ordre cible + preserve; ajouter un mode repeat destination-only.
- Tests d'invariant attendus: whole-plan clarification answer stays `adjust_plan_item`; concrete reorder reaches `handoff_delivered`; repeat destination-only does not render full handoff; no executor/no confirmation/no committed effects restent garantis.

## Verdict Global

- Verdict: red
- Raison principale: no-mutation tient sur les trois runs, mais le run whole plan perd le flow actif au tour 3 vers `normal_reply`.
- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-01-adjust-plan-handoff-rerun-r2-bugs.md`
- Artefacts bruts: `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-*-20260601-r2/summary.json`
