# QA Run Report — Adjust Plan Handoff R3

## 1. Contexte Du Test

- Date: 2026-06-01
- Runs:
  - `adjust-plan-action-20260601-r3`
  - `adjust-plan-level-20260601-r3`
  - `adjust-plan-whole-20260601-r3`
- Persona: `qa-skill`, connexions dediees existantes `adjust_plan_handoff_action20260601`, `adjust_plan_handoff_level20260601`, `adjust_plan_handoff_whole20260601`
- Objectif: rerun post-correction du flow `adjust_plan_item` handoff: action, niveau/semaine, whole plan.
- Trajectoire: clarification si besoin -> recommandation -> handoff Plan -> repeat/revise/apply_attempt sans mutation.
- Surfaces visees: dispatcher, active handoff arbitration, `adjust_plan_item` router/intake/renderer/state, no-mutation traces.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe.
- Validite QA: valide. Les plans locaux des connexions QA etaient vides (`user_plan_items=[]`), donc les cibles sont portees par les messages utilisateur. Les invariants no-mutation restent verifiables par trace.

Artefacts:

- `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-action-20260601-r3/summary.json`
- `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-level-20260601-r3/summary.json`
- `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-whole-20260601-r3/summary.json`

## 2. Tours De Conversation

### Run Action — `adjust-plan-action-20260601-r3`

#### Tour 1

**Verdict du tour:** green

**User**
> Je veux alleger l’action Respiration de pause cette semaine, elle me parait trop lourde.

**Sophia**
> Qu’est-ce que tu veux alleger exactement pour "Respiration de pause" cette semaine : la duree, la frequence, le moment, ou l’effort pour la demarrer ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation/status: `adjust_plan_item` / `clarifying`
- executed_tools: `[]`
- durable_effect: `platform_handoff`
- committed_effects: `[]`
- pending_confirmation: `null`

#### Tour 2

**Verdict du tour:** green

**User**
> C’est surtout l’effort de demarrage et la duree. Je veux la garder, mais en version deux minutes, une seule fois les jours charges.

**Sophia**
> Ce que je comprends : Respiration de pause bloque parce que l'entree est trop lourde.
>
> Ma recommandation : Respiration de pause: Cette semaine : version de deux minutes, une seule fois les jours charges, en gardant l’intention de pause/regulation.
>
> ... Où le faire dans Plan : dans la section Plan. ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `handoff_delivered`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

#### Tour 3

**Verdict du tour:** green

**User**
> Redis-moi juste la destination Plan, sans refaire toute la reco.

**Sophia**
> Dans Plan : dans la section Plan.
>
> - ouvre la section Plan
> - Ouvre Respiration de pause
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_handoff_repeat_handoff`
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 4

**Verdict du tour:** green

**User**
> Ok vas-y applique cette version.

**Sophia**
> [Repete la recommandation complete avec destination Plan.]
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_apply_attempt`
- operation/status: `adjust_plan_item` / `apply_attempt`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

#### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — Contrainte explicite mal integree dans la revision

**User**
> En fait rends-la encore plus legere : juste une respiration de trente secondes avant de reprendre le travail.

**Sophia**
> Ma recommandation : Ajuster Respiration de pause avec cette contrainte : En fait rends-la encore plus legere : juste une respiration de trente secondes avant de reprendre le travail.. Reprends cette version dans Plan...
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_revise_handoff`
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: la revision ne dit plus `Version revisee demandee`, mais recycle encore la phrase user de facon mecanique avec double ponctuation.
- Source amont probable: `reviseAdjustPlanHandoffDraft` transforme la contrainte en phrase visible sans recomposition coaching.
- Owner runtime: `tools/operations/adjust_plan_item/handoff.ts` + renderer handoff.
- Meilleure correction: produire une recommandation revisee semantique, pas une enveloppe "avec cette contrainte".

#### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03`

**User**
> Redis-moi quoi faire dans Plan, en une version courte.

**Sophia**
> A reprendre dans Plan : Ajuster Respiration de pause avec cette contrainte : En fait rends-la encore plus legere...

**Trace courte**
- route_reason: `active_handoff_repeat_handoff`
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le repeat propage le draft revise mecanique.
- Source amont probable: draft revise stocke dans l'etat actif.
- Owner runtime: handoff draft revision.

### Run Niveau — `adjust-plan-level-20260601-r3`

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03`

**User**
> Cette semaine est trop chargee au niveau actuel. Je ne veux pas abandonner le niveau, juste l’alleger.

**Sophia**
> Ce que je comprends : ... techniquement, il manque encore le contenu precis a alleger.
>
> Ma recommandation : Rester sur une logique d’allegement temporaire du niveau actuel...
>
> Point a clarifier avant de le reprendre dans Plan : Quelles parties de la semaine te paraissent les plus lourdes a alleger ?
>
> ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation/status: `adjust_plan_item` / `handoff_delivered`
- reason_code: `current_level_partial_scope_platform_handoff`
- missing_slots: `["current_level.affected_items"]`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: utile, mais formulation trop interne ("techniquement") et handoff livre une reco tout en gardant un point de clarification.
- Source amont probable: draft handoff current-level partial scope garde trop la trace du diagnostic slot.
- Owner runtime: handoff draft generation / renderer.

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03`

**User**
> Le plus lourd c’est le volume : je veux garder deux actions seulement et mettre le reste en maintien pour cette semaine.

**Sophia**
> Ma recommandation : Alleger la periode concernee avec cette contrainte : Le plus lourd c’est le volume : je veux garder deux actions seulement...

**Trace courte**
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: meme pattern mecanique de revision.
- Source amont probable: revision handoff deterministe trop litterale.

#### Tour 3

**Verdict du tour:** green

**User**
> Ok applique ca pour cette semaine.

**Sophia**
> [Repete la recommandation handoff niveau.]
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_apply_attempt`
- operation/status: `adjust_plan_item` / `apply_attempt`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

#### Tour 4

**Verdict du tour:** green

**User**
> Ou est-ce que je dois le faire dans Plan, juste la destination ?

**Sophia**
> Dans Plan : dans la section Plan.
>
> - ouvre la section Plan
> - Ouvre le niveau ou la semaine concernee
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `product_help_inline_resume_active_tool_skill`
- selected_handler: `adjust_plan_item`
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03`

**User**
> Plutot cette semaine seulement, pas le niveau complet.

**Sophia**
> Ma recommandation : Alleger la periode concernee avec cette contrainte : Plutot cette semaine seulement, pas le niveau complet..

**Trace courte**
- route_reason: `active_handoff_revise_handoff`
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03`

**User**
> Redis-moi la version courte a reprendre.

**Sophia**
> A reprendre dans Plan : Alleger la periode concernee avec cette contrainte : Plutot cette semaine seulement, pas le niveau complet..

**Trace courte**
- route_reason: `active_handoff_repeat_handoff`
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

### Run Whole Plan — `adjust-plan-whole-20260601-r3`

#### Tour 1

**Verdict du tour:** green

**User**
> Je crois que tout mon plan est dans le mauvais ordre. Je ne veux pas tout jeter, mais il faut revoir la trajectoire globale.

**Sophia**
> Je dois d’abord savoir quelles parties du plan tu veux considerer dans ce reordonnancement : quelles sont les grandes etapes actuelles, dans leur ordre actuel ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation/status: `adjust_plan_item` / `clarifying`
- missing_slots: `["whole_plan.affected_items"]`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 2

**Verdict du tour:** green

**User**
> Aujourd’hui c’est : gros chantier creatif, ensuite routine energie, puis clarifier mon cap. Je voudrais plutot commencer par clarifier le cap, ensuite routine energie, et garder le chantier creatif apres.

**Sophia**
> Ce que je comprends : ... l’ordre actuel place le chantier creatif trop tot...
>
> Ma recommandation : ... preserver les trois blocs, deplacer la clarification du cap en premier, garder la routine energie comme appui intermediaire, et laisser le chantier creatif en dernier.
>
> ... Où le faire dans Plan : dans la section Plan. ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_adjust_plan_followup_stays_with_skill`
- operation/status: `adjust_plan_item` / `handoff_delivered`
- reason_code: `platform_handoff_from_coaching_guidance`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 3

**Verdict du tour:** green

**User**
> Ok vas-y applique ce nouvel ordre.

**Sophia**
> [Repete la recommandation whole-plan et la destination Plan.]
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_apply_attempt`
- operation/status: `adjust_plan_item` / `apply_attempt`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

#### Tour 4

**Verdict du tour:** green

**User**
> Redis-moi juste ou le faire dans Plan.

**Sophia**
> Dans Plan : dans la section Plan.
>
> - ouvre la section Plan
> - Ouvre la vue du plan global
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_repeat_handoff`
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03`

**User**
> Rends la reco plus prudente : je veux tester cet ordre une semaine avant de tout reorganiser.

**Sophia**
> Ma recommandation : Reviser la trajectoire globale avec cette contrainte : Rends la reco plus prudente : je veux tester cet ordre une semaine avant de tout reorganiser.. Reprends cette version dans Plan...

**Trace courte**
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03`

**User**
> Redis-moi la version courte a reprendre dans Plan.

**Sophia**
> A reprendre dans Plan : Reviser la trajectoire globale avec cette contrainte : Rends la reco plus prudente...

**Trace courte**
- route_reason: `active_handoff_repeat_handoff`
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le skill reste proprietaire du flow pendant les follow-ups.
- La destination-only marche sur les trois scopes.
- Les apply attempts ("ok applique") ne pretendent pas appliquer et rappellent la destination Plan.
- Le whole-plan ne redemande plus une clarification apres l’ordre concret donne au tour 2.

**Problemes**
- Action T5/T6, niveau T2/T5/T6, whole-plan T5/T6: les revisions sont encore trop mecaniques. Famille: `BF-INTAKE-03`. Impact: la reco reste exploitable mais sonne comme un template, avec double ponctuation.
- Niveau T1: le handoff expose une phrase interne ("techniquement, il manque...") au lieu d’un wording utilisateur. Famille: `BF-INTAKE-03`. Impact: friction UX faible a moyenne.

**Fix propose**
- Source amont: `reviseAdjustPlanHandoffDraft` et construction du draft handoff revise.
- Correction recommandee: recomposer une `recommended_change` semantique par scope, en integrant la contrainte comme decision de coaching et non comme citation brute.
- Tests d'invariant attendus: revision action/niveau/whole-plan avec paraphrases, aucune phrase `avec cette contrainte : <message user>`, pas de double ponctuation, repeat reprend la version semantique.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tous les tours restent `response_owner=tool_skill`, `selected_handler=adjust_plan_item`.
- Les follow-ups actifs sont captures: `repeat_handoff`, `revise_handoff`, `apply_attempt`.
- Un tour niveau destination-only a `route_reason=product_help_inline_resume_active_tool_skill`, mais reste bien rendu par `adjust_plan_item`.

**Skills / Operations / Tools**
- `toolExecution/durable_effect=platform_handoff`.
- `executed_tools=[]` sur tous les tours.
- `committed_effects=[]` sur tous les tours.
- `pending_confirmation=null` sur tous les tours.
- Pas de confirmation token visible en trace.

**Memory / Effets durables**
- Aucun effet durable plan observe.
- Pas de cleanup DB necessaire pour des mutations plan, car aucun write n’a ete declenche.
- Les connexions QA avaient un plan vide; la validation couvre le runtime handoff/no-mutation, pas une verification de projection d’items DB existants.

**Problemes**
- Tours de revision: le draft handoff actif stocke une recommandation mecanique, puis le repeat la propage. Famille: `BF-INTAKE-03`. Impact systeme: reducer/state corrects, mais generation de draft revise insuffisante.

**Fix propose**
- Source amont: handoff draft revision, pas dispatcher ni executor.
- Correction recommandee: remplacer le template de revision par un reducer/coaching policy de revision qui produit `summary` et `recommended_change` propres par scope.
- Tests d'invariant attendus: no executor/no writer/no token inchanges + tests de wording revision sur action, current_level, whole_plan.

## Verdict Global

**yellow** — Le terminal no-mutation est solide et les bugs critiques precedents sont verifies comme corriges: no executor, no commit, destination-only OK, whole-plan T2 handoff OK. Il reste un bug UX/runtime sur la generation de revision: elle ne dit plus "Version revisee demandee", mais elle reste trop litterale et doit etre corrigee avant verdict green.
