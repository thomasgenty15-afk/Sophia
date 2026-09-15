# QA Run Report — Adjust Plan Blockers R6

## 1. Contexte Du Test

- Date: 2026-06-02
- Runs:
  - `adjust-plan-blockers-action-20260602-r6`
  - `adjust-plan-blockers-level-20260602-r6`
  - `adjust-plan-blockers-whole-20260602-r6`
- Persona: `qa-skill`, connexions temporaires dediees:
  - `adjust_plan_blockers_action20260602_r6_action`
  - `adjust_plan_blockers_level20260602_r6_level`
  - `adjust_plan_blockers_whole20260602_r6_whole`
- Objectif: verifier les blocages R5 apres correction, sans relancer une campagne complete.
- Trajectoire: cas bloqueur -> handoff/revision/apply_attempt -> verification no-mutation.
- Surfaces visees: `adjust_plan_item` intake/handoff/renderer/state, active handoff arbitration, no-mutation traces.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe.
- Validite QA: valide. 3 runs cibles, 3 tours chacun, conversation pilotee tour par tour.

Artefacts:

- `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-blockers-action-20260602-r6/summary.json`
- `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-blockers-level-20260602-r6/summary.json`
- `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-blockers-whole-20260602-r6/summary.json`

## 2. Tours De Conversation

### Run Action — `adjust-plan-blockers-action-20260602-r6`

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — Clarification fragmentee

**User**
> Je veux alléger l’action Respiration de pause cette semaine : la garder, mais elle me coûte trop à lancer.

**Sophia**
> avant de te le montrer. Quelle partie du lancement coûte le plus : y penser, trouver le bon moment, ou passer à l’exécution ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation/status: `adjust_plan_item` / `clarifying`
- pending_confirmation: `null`
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: `platform_handoff`

**Analyse si yellow/red**
- Symptome: la question de clarification est utile, mais elle commence par un fragment visible.
- Source amont probable: clarification sanitizer ne couvre pas `avant de te le montrer`.
- Owner runtime: `adjust_plan_item` clarification renderer/sanitizer.
- Meilleure correction selon les guidelines: produire une question autonome, sans fragment dependu d'une phrase supprimee.

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-01` — Slot fourni mais redemande

**User**
> C’est surtout l’effort mental du démarrage et la durée : je veux une version deux minutes, une seule fois les jours chargés.

**Sophia**
> Je vois : le point dur, c’est le démarrage et la durée. Pour te faire un ajustement propre, tu veux que je simplifie surtout le déclencheur, le moment où tu décides de le faire, ou la façon de lancer l’exercice ?

**Trace courte**
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `clarifying`
- missing_slots: `specific_plan_item.action_request_category`, `specific_plan_item.reason`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

**Analyse si yellow/red**
- Symptome: le blocage principal R5 persiste. Le user donne cible, levier, duree, frequence et contexte, mais Sophia redemande encore un choix de levier.
- Source amont probable: readiness gate reste lie aux slots executables `action_request_category/reason`, et la guidance AI garde une question de clarification malgre le changement concret.
- Owner runtime: `adjust_plan_item` intake/readiness + coach guidance contract.
- Meilleure correction selon les guidelines: handoff des que `specific_plan_item + concrete lighter version + timebox/context` sont connus; ne pas attendre un slot executable non necessaire au handoff.

#### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — Qualite de draft degradee

**User**
> La façon de lancer : je veux juste un minuteur de deux minutes, une respiration lente, puis je reprends. Pas de préparation.

**Sophia**
> Ce que je comprends : Respiration de pause bloque parce que l'entree est trop lourde.
>
> Ma recommandation : Respiration de pause: Un minuteur de deux minutes, une respiration lente, puis tu reprends, sans préparation.
>
> À préserver : L’intention de pause et de respiration; le fait de garder l’action cette semaine; le bénéfice principal...
>
> À éviter : Éviter de proposer un abandon déguisé; ... Éviter de Je te conseille de traiter cela comme un manque de motivation globale...
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `handoff_delivered`
- operation_id: `null`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le handoff arrive et `preserve/avoid` est nettement meilleur que R5, mais le sanitizer introduit une phrase incoherente: `Éviter de Je te conseille de traiter...`.
- Source amont probable: sanitation ordre `Ne pas...` puis meta-transform `traiter cela comme`.
- Owner runtime: handoff list sanitizer.
- Meilleure correction selon les guidelines: normaliser les bullets `avoid` avant transformation meta, ou special-caser `Ne pas traiter cela comme...` -> `Éviter de traiter cela comme...`.

### Run Niveau — `adjust-plan-blockers-level-20260602-r6`

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — Wording user-facing maladroit

**User**
> Mon niveau actuel est trop chargé cette semaine. Je veux garder le niveau, mais alléger le volume.

**Sophia**
> Ma recommandation : Je te conseille de une baisse temporaire et ciblée du rythme, en conservant le cœur du niveau...
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- operation/status: `adjust_plan_item` / `handoff_delivered`
- reason_code: `current_level_partial_scope_platform_handoff`
- operation_id: `null`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le wording interne `sous-skill` n'apparait plus, mais la transformation produit `Je te conseille de une...`.
- Source amont probable: sanitizer meta `Orienter la réponse vers` -> `Je te conseille de` sans accord grammatical.
- Owner runtime: `handoff.ts` userFacingRecommendation.
- Meilleure correction selon les guidelines: transformer `Orienter la réponse vers une baisse...` en `Je te conseille une baisse...`.

#### Tour 2

**Verdict du tour:** green

**User**
> Seulement cette semaine. Garde deux actions prioritaires, et mets le reste en maintien léger.

**Sophia**
> Ma recommandation : Limite l'allègement à la période concernée : Seulement cette semaine. Garde deux actions prioritaires, et mets le reste en maintien léger. Garde le niveau comme repère et ajuste seulement le volume actuel dans Plan.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_adjust_plan_followup_stays_with_skill`
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 3

**Verdict du tour:** green

**User**
> Ok vas-y applique ça pour cette semaine.

**Sophia**
> [Repete le handoff niveau.]
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_apply_attempt`
- operation/status: `adjust_plan_item` / `apply_attempt`
- operation_id: `null`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

### Run Whole Plan — `adjust-plan-blockers-whole-20260602-r6`

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — Wording user-facing maladroit

**User**
> Je pense que l’ordre global de mon plan est mauvais ; je veux le réordonner sans jeter les blocs.

**Sophia**
> Ma recommandation : Je te conseille de un travail de réorganisation séquentielle à périmètre constant...
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- operation/status: `adjust_plan_item` / `handoff_delivered`
- reason_code: `platform_handoff_from_coaching_guidance`
- missing_slots: `[]`
- operation_id: `null`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: plus de clarification fragmentee ou redemande de blocs; par contre le wording `Je te conseille de un...` est maladroit.
- Source amont probable: sanitizer meta commun.
- Owner runtime: handoff renderer/sanitizer.
- Meilleure correction selon les guidelines: transformer les recommendations meta en phrases conseillees grammaticales.

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-05` — Semantique composite aplatie

**User**
> Aujourd’hui l’ordre est : chantier créatif, routine énergie, clarification du cap. Je veux tester : clarification du cap, routine énergie, chantier créatif.

**Sophia**
> [Repete la recommandation generique de réorganisation séquentielle à périmètre constant, sans reprendre l'ordre actuel ni l'ordre cible.]

**Trace courte**
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `repeat_handoff`
- missing_slots: `[]`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le bug R5 de redemande des blocs est corrige, mais le skill ne revise pas le handoff avec l'ordre concret donne. Il traite le message comme repeat/continue au lieu de `revise_handoff`.
- Source amont probable: active handoff intent classifier ne reconnait pas une specification d'ordre comme revision.
- Owner runtime: active handoff arbitration + revise_handoff.
- Meilleure correction selon les guidelines: classifier `ordre actuel / je veux tester` comme `revise_handoff`, puis regenerer `recommended_change` avec l'ordre cible.

#### Tour 3

**Verdict du tour:** green

**User**
> Ok vas-y applique ce nouvel ordre.

**Sophia**
> [Repete le handoff whole-plan generique.]
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_apply_attempt`
- operation/status: `adjust_plan_item` / `apply_attempt`
- operation_id: `null`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Aucun tour ne promet d'appliquer depuis le chat.
- `ok vas-y applique` reste un handoff no-mutation.
- Niveau: le wording interne `Le sous-skill doit...` n'est plus visible.
- Action T3: le handoff final est plus utile que R5 sur `À préserver` et `À éviter`.

**Problemes**
- Action T2: le blocage principal persiste. Famille: `BF-INTAKE-01`. Impact: le user doit donner trois fois la meme intention avant handoff. Severite: red.
- Action T1: clarification fragmentee `avant de te le montrer`. Famille: `BF-INTAKE-03`. Impact: rendu non professionnel. Severite: yellow.
- Niveau/whole: transformation grammaticale `Je te conseille de une/un`. Famille: `BF-INTAKE-03`. Impact: qualite percue degradee. Severite: yellow.
- Whole T2: plus de redemande, mais l'ordre concret est ignore. Famille: `BF-INTAKE-05`. Impact: la reco ne sert pas le besoin precis. Severite: red.

**Fix propose**
- Source amont: `adjust_plan_item` active handoff intent classifier, handoff sanitizer, action readiness.
- Correction recommandee:
  - action: ne pas attendre `action_request_category/reason` quand le user fournit une version concrete;
  - whole-plan: traiter `ordre actuel / je veux tester` comme revision active;
  - sanitizer: corriger les fragments et les constructions `Je te conseille de un/une`, `Éviter de Je te conseille`.
- Tests d'invariant attendus:
  - action T2 version deux minutes -> handoff;
  - whole-plan T2 ordre actuel + cible -> revise_handoff avec ordre cible;
  - no fragment `avant de te le montrer`;
  - no `Je te conseille de un/une`;
  - no mutation invariants inchanges.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tous les tours restent sous `response_owner=tool_skill`, `selected_handler=adjust_plan_item`.
- Active flow protege bien `ok vas-y applique` sur niveau et whole-plan.

**Skills / Operations / Tools**
- `executed_tools=[]` sur 9/9 tours.
- `committed_effects=[]` sur 9/9 tours.
- `pending_confirmation=null` sur 9/9 tours.
- `operation_id=null` sur 9/9 tours.
- `durable_effect=platform_handoff` sur 9/9 tours.

**Risques restants**
- Le systeme est no-mutation, mais l'intake action reste trop proche d'un flow executable a slots obligatoires.
- Le whole-plan active handoff ne revise pas quand le user donne l'ordre concret apres un handoff generique.

## Verdict Global

**red**

Le no-mutation est confirme. Les corrections ont ameliore certains points de rendu et de trace, mais les deux blocages conversationnels importants ne sont pas resolus en run reel: action sur-clarifie encore au T2, et whole-plan ignore l'ordre concret donne au T2.
