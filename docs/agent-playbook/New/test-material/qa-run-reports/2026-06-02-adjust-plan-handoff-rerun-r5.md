# QA Run Report — Adjust Plan Handoff R5

## 1. Contexte Du Test

- Date: 2026-06-02
- Runs:
  - `adjust-plan-action-20260602-r5`
  - `adjust-plan-level-20260602-r5`
  - `adjust-plan-whole-20260602-r5`
- Persona: `qa-skill`, connexions temporaires dediees:
  - `adjust_plan_handoff_action20260601_r5_action`
  - `adjust_plan_handoff_level20260601_r5_level`
  - `adjust_plan_handoff_whole20260601_r5_whole`
- Objectif: relancer 3 runs full AI de minimum 6 tours chacun sur les scopes action, niveau/semaine et whole plan, sans correction de code pendant les runs.
- Trajectoire: intake/clarification -> handoff Plan -> apply_attempt no-mutation -> repeat/destination -> revise_handoff -> repeat.
- Surfaces visees: dispatcher, active handoff arbitration, `adjust_plan_item` intake/handoff/renderer/state, no-mutation traces.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe.
- Validite QA: valide. Les 3 runs ont 6 tours reels chacun. Les connexions temporaires ont isole l'etat.

Artefacts:

- `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-action-20260602-r5/summary.json`
- `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-level-20260602-r5/summary.json`
- `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-whole-20260602-r5/summary.json`

## 2. Tours De Conversation

### Run Action — `adjust-plan-action-20260602-r5`

#### Tour 1

**Verdict du tour:** green

**User**
> Je veux alléger l’action Respiration de pause cette semaine : la garder, mais elle me coûte trop à lancer.

**Sophia**
> Pour alléger le démarrage de « Respiration de pause », qu’est-ce qui le rend le plus coûteux pour toi cette semaine : le moment, l’effort mental, le contexte, la durée, ou autre ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation/status: `adjust_plan_item` / `clarifying`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` — Slot fourni mais redemande

**User**
> C’est surtout l’effort mental du démarrage et la durée : je veux une version deux minutes, une seule fois les jours chargés.

**Sophia**
> Pour le régénérer, qu’est-ce qu’il faut garder absolument dans « Respiration de pause » dans sa version 2 minutes ?

**Trace courte**
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `clarifying`
- missing_slots: `["draft_generation_retry_needed"]`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le user donne le levier, la duree, la frequence et le contexte, mais le skill redemande une clarification supplementaire.
- Source amont probable: readiness gate action trop exigeant pour un handoff no-mutation.
- Owner runtime: `adjust_plan_item` intake/handoff readiness.
- Meilleure correction selon les guidelines: accepter `target + levier + changement concret` comme suffisant pour generer un handoff action.

#### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — Contrainte/qualite de draft degradee

**User**
> À garder absolument : une respiration lente, un minuteur de deux minutes, et le fait que ce soit une vraie pause, pas une performance.

**Sophia**
> Ce que je comprends : Respiration de pause bloque parce que l'entree est trop lourde.
>
> Ma recommandation : Respiration de pause: Version deux minutes : une vraie pause respirée, avec une respiration lente et un minuteur de deux minutes, sans exigence de performance, à utiliser une seule fois les jours chargés.
>
> À préserver : Le reste du plan
>
> À éviter : L’objectif global, Les autres actions du plan, La structure complète du plan
>
> Où le faire dans Plan : dans la section Plan. ouvre la section Plan; Ouvre Respiration de pause; Applique l'ajustement recommandé seulement à cette cible.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `handoff_delivered`
- reason_code: `platform_handoff_no_chat_mutation`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le handoff arrive, mais `preserve` est pauvre et `avoid` contient des objets a eviter de modifier plutot que des risques utilisateur; la destination utilise aussi `Applique`.
- Source amont probable: handoff draft mapping action-level / renderer wording.
- Owner runtime: `adjust_plan_item` handoff draft + renderer.
- Meilleure correction selon les guidelines: mapper les listes preserve/avoid depuis la guidance action, et remplacer le verbe operationnel par `reprends` ou `ajuste dans Plan`.

#### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03`

**User**
> Ok vas-y applique cette version mini.

**Sophia**
> [Repete le handoff action, avec la meme recommandation et la phrase] Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_apply_attempt`
- operation/status: `adjust_plan_item` / `apply_attempt`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

**Analyse si yellow/red**
- Symptome: le comportement systeme est correct, mais le contenu repete le draft faible du tour 3.
- Source amont probable: repeat/apply_attempt reprend le draft actif sans enrichissement ni sanitation.
- Owner runtime: `adjust_plan_item` active handoff renderer.
- Meilleure correction selon les guidelines: garder le no-mutation, mais renderer l'apply_attempt avec une phrase explicite de redirection et un draft nettoye.

#### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03`

**User**
> Rends-la encore plus légère : trente secondes seulement les jours vraiment saturés.

**Sophia**
> Ma recommandation : Passe Respiration de pause sur une version plus légère : trente secondes seulement les jours vraiment saturés. Garde l'intention de l'action et ajuste seulement cette cible dans Plan.
>
> [Puis repete les memes blocs preserve/avoid faibles.]

**Trace courte**
- route_reason: `active_handoff_revise_handoff`
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: la revision semantique fonctionne, mais conserve les listes faibles et le verbe `ajuste` reste un peu operationnel.
- Source amont probable: revisionDetail/revisedRecommendation ne regenere pas preserve/avoid depuis la nouvelle demande.
- Owner runtime: `adjust_plan_item` handoff revision.
- Meilleure correction selon les guidelines: regeneration ou merge de preserve/avoid lors de `revise_handoff`.

#### Tour 6

**Verdict du tour:** green

**User**
> Redis-moi la version courte à reprendre dans Plan.

**Sophia**
> À reprendre dans Plan : Passe Respiration de pause sur une version plus légère : trente secondes seulement les jours vraiment saturés. Garde l'intention de l'action et ajuste seulement cette cible dans Plan.
>
> Où : dans la section Plan. ouvre la section Plan; Ouvre Respiration de pause.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_repeat_handoff`
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

### Run Niveau — `adjust-plan-level-20260602-r5`

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — Texte interne rendu au user

**User**
> Mon niveau actuel est trop chargé cette semaine. Je veux garder le niveau, mais alléger le volume.

**Sophia**
> Ce que je comprends : La demande exprime une contrainte de capacité ponctuelle sur le niveau en cours...
>
> Ma recommandation : Orienter la réponse vers un allègement temporaire et proportionné du niveau courant... Le sous-skill doit surtout distinguer ce qui peut être réduit...
>
> Point à clarifier avant de le reprendre dans Plan : Cette baisse de volume est-elle seulement pour cette semaine ou doit-elle durer sur plusieurs semaines ?
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `tool_skill_intent_start`
- operation/status: `adjust_plan_item` / `handoff_delivered`
- reason_code: `current_level_partial_scope_platform_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: la recommandation expose `Le sous-skill doit`, formulation interne deja observee en R4.
- Source amont probable: `coaching_guidance.recommendation` passe au renderer sans transformation user-facing.
- Owner runtime: handoff draft generation / renderer.
- Meilleure correction selon les guidelines: transformer les instructions meta en conseil direct utilisateur avant rendu.

#### Tour 2

**Verdict du tour:** green

**User**
> Seulement cette semaine. Garde deux actions prioritaires, et mets le reste en maintien léger.

**Sophia**
> Ma recommandation : Limite l'allègement à la période concernée : Seulement cette semaine. Garde deux actions prioritaires, et mets le reste en maintien léger. Garde le niveau comme repère et ajuste seulement le volume actuel dans Plan.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 3

**Verdict du tour:** green

**User**
> Ok vas-y, applique ça pour cette semaine.

**Sophia**
> [Repete la recommandation de limitation a cette semaine et la destination Plan.]
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
> Redis-moi juste où le faire dans Plan.

**Sophia**
> Dans Plan : dans la section Plan.
>
> - ouvre la section Plan
> - Ouvre le niveau ou la semaine concernée
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_repeat_handoff`
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 5

**Verdict du tour:** green

**User**
> Plutôt cette semaine seulement, pas tout le niveau.

**Sophia**
> Ma recommandation : Limite l'allègement à la période concernée : cette semaine seulement, pas tout le niveau. Garde le niveau comme repère et ajuste seulement le volume actuel dans Plan.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_revise_handoff`
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 6

**Verdict du tour:** green

**User**
> Redis-moi la version courte à reprendre dans Plan.

**Sophia**
> À reprendre dans Plan : Limite l'allègement à la période concernée : cette semaine seulement, pas tout le niveau. Garde le niveau comme repère et ajuste seulement le volume actuel dans Plan.
>
> Où : dans la section Plan. ouvre la section Plan; Ouvre le niveau ou la semaine concernée.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_repeat_handoff`
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

### Run Whole Plan — `adjust-plan-whole-20260602-r5`

#### Tour 1

**Verdict du tour:** green

**User**
> Je pense que l’ordre global de mon plan est mauvais ; je veux le réordonner sans jeter les blocs.

**Sophia**
> Envoie-moi simplement les blocs de ton plan actuel, dans leur ordre actuel, pour que je puisse le régénérer sans inventer.

**Trace courte**
- route_reason: `tool_skill_intent_start`
- operation/status: `adjust_plan_item` / `clarifying`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-01` — Slot fourni mais redemande

**User**
> Aujourd’hui l’ordre est : chantier créatif, routine énergie, clarification du cap. Je veux tester : clarification du cap, routine énergie, chantier créatif.

**Sophia**
> Le brouillon doit être repris proprement. Donne-moi les intitulés exacts des blocs du plan, dans leur ordre actuel, pour que je le régénère sans inventer.

**Trace courte**
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `clarifying`
- missing_slots: `["draft_generation_retry_needed"]`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le user fournit explicitement l'ordre actuel et l'ordre cible, mais Sophia redemande les blocs et l'ordre actuel.
- Source amont probable: intake whole-plan ne lit pas la paire `ordre actuel / ordre test`.
- Owner runtime: `adjust_plan_item` whole-plan intake/readiness.
- Meilleure correction selon les guidelines: reconnaitre les listes inline comme inventaire suffisant et passer en handoff.

#### Tour 3

**Verdict du tour:** green

**User**
> Les intitulés exacts sont : 1. Chantier créatif ; 2. Routine énergie ; 3. Clarification du cap. Je veux les reprendre dans cet ordre test : 1. Clarification du cap ; 2. Routine énergie ; 3. Chantier créatif.

**Sophia**
> Ce que je comprends : La demande ne porte pas sur le contenu des blocs, mais sur leur séquence globale...
>
> Ma recommandation : Traiter cela comme un réordonnancement confirmé à l’état de brouillon : préserver les trois blocs, comparer l’ordre actuel et l’ordre testé...
>
> Où le faire dans Plan : dans la section Plan. Ouvre la vue du plan global...
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `handoff_delivered`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 4

**Verdict du tour:** green

**User**
> Ok vas-y applique ce nouvel ordre.

**Sophia**
> [Repete le handoff whole-plan et la destination Plan.]
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_apply_attempt`
- operation/status: `adjust_plan_item` / `apply_attempt`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

#### Tour 5

**Verdict du tour:** green

**User**
> Rends ça plus prudent : je veux tester cet ordre une semaine avant de le modifier durablement.

**Sophia**
> Ma recommandation : Rends la révision du plan plus prudente : tester cet ordre une semaine avant de le modifier durablement. Dans Plan, utilise cette version comme un test ou un brief de révision avant de modifier durablement toute la trajectoire.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_revise_handoff`
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 6

**Verdict du tour:** green

**User**
> Redis-moi la version courte à reprendre dans Plan.

**Sophia**
> À reprendre dans Plan : Rends la révision du plan plus prudente : tester cet ordre une semaine avant de le modifier durablement. Dans Plan, utilise cette version comme un test ou un brief de révision avant de modifier durablement toute la trajectoire.
>
> Où : dans la section Plan. ouvre la section Plan; Ouvre la vue du plan global.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_repeat_handoff`
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les trois runs restent conversationnels et continuables apres handoff.
- `ok vas-y` / `applique` ne produit pas de fausse promesse d'application; Sophia repete la recommandation et rappelle la destination Plan.
- Les demandes `redis-moi` restent dans `adjust_plan_item` au lieu de partir en recap DB ou product help.
- Les revisions sont prises en compte sur les trois scopes.

**Problemes**
- Action T2: sur-clarification apres un changement concret deja fourni. Famille: `BF-INTAKE-01`. Impact: le user doit parler comme un test pour obtenir le handoff. Severite: yellow.
- Action T3-T5: les listes `À préserver` / `À éviter` sont trop pauvres et peu user-facing. Famille: `BF-INTAKE-03`. Impact: recommandation moins utile que la guidance interne. Severite: yellow.
- Niveau T1: langage interne `Le sous-skill doit`. Famille: `BF-INTAKE-03`. Impact: casse la qualite percue. Severite: yellow.
- Whole-plan T2: Sophia redemande les blocs alors que l'ordre actuel et l'ordre cible sont donnes. Famille: `BF-INTAKE-01`. Impact: friction forte et repetition. Severite: red sur le tour, yellow global car le run recupere ensuite.

**Fix propose**
- Source amont: `adjust_plan_item` intake/readiness et handoff draft generation.
- Correction recommandee: rendre les slots de handoff moins executables et plus semantiques; nettoyer les textes meta avant renderer; regenerer `preserve/avoid` lors d'un handoff action ou d'une revision.
- Tests d'invariant attendus: action target + lever + concrete change -> handoff; whole-plan inline current/target order -> handoff; no `sous-skill`; action preserve/avoid contient l'intention action, pas seulement `le reste du plan`.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tous les tours sont routes vers `response_owner=tool_skill`, `selected_handler=adjust_plan_item`.
- Les active handoff signals sont correctement captures:
  - `active_handoff_apply_attempt` sur action T4, niveau T3, whole-plan T4.
  - `active_handoff_revise_handoff` sur action T5, niveau T5, whole-plan T5.
  - `active_handoff_repeat_handoff` sur action T6, niveau T4/T6, whole-plan T6.

**Skills / Operations / Tools**
- `operation_type=adjust_plan_item` sur les 18 tours.
- `durable_effect=platform_handoff` seulement.
- `executed_tools=[]` sur les 18 tours.
- `committed_effects=[]` sur les 18 tours.
- `pending_confirmation=null` sur les 18 tours.
- Aucun wording interdit observe: pas de `c'est fait`, `j'ai modifié`, `je l'ai appliqué`.

**No-mutation**
- Les apply attempts ne creent aucun token de confirmation.
- Aucun executor ou writer DB n'apparait dans les traces courtes.
- Les traces exposent bien `no_chat_mutation=true` dans `platform_handoff`.

**Risques restants**
- Un `operation_id` non-null apparait en action T3 alors que le mode est handoff. Il ne conduit a aucun effet durable, mais il vaut mieux verifier que cet id n'est pas interpretable comme operation executable ailleurs.
- Le renderer utilise encore `Applique l'ajustement recommandé` dans les steps action, alors que la doctrine prefere `reprends` / `ajuste dans Plan`.

## Verdict Global

**yellow**

Le chantier no-mutation est valide sur les 18 tours full AI: aucun outil execute, aucun committed effect, aucune confirmation pending, et `ok vas-y` reste un handoff. Le run reste jaune a cause de bugs d'intake et de rendu: sur-clarification action/whole-plan, texte interne visible au niveau, et handoff action trop pauvre dans `À préserver` / `À éviter`.
