# QA Run Report — adjust_plan_item handoff fix

## 1. Contexte Du Test

- Date: 2026-06-01
- Run: `adjust-plan-handoff-fix-20260601-r3`
- Persona: `qa-skill`
- Connexion: `connection_adjust-plan-handoff-fix-20260601-r3`
- Objectif: verifier que `adjust_plan_item` reste un skill de coaching + handoff plateforme, sans execution chat.
- Trajectoire: scope ambigu -> clarification -> recommandation -> apply_attempt -> repeat_handoff -> revise_handoff -> apply_attempt.
- Surfaces visees: dispatcher, active flow, `adjust_plan_item`, renderer, EffectLedger, operation runtime pipeline.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe pour produire les reponses QA.
- Validite QA: valide avec incident documente. Les tours 6 et 7 ont revele un crash 502, corrige pendant le run puis reverifie aux tours 8 a 10.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je veux alléger mon plan, mais je ne sais pas si c'est une action précise ou toute ma semaine.

**Sophia**
> Tu veux alléger quoi exactement : une action précise, un moment de la semaine, ou toute la charge du niveau actuel ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation: `adjust_plan_item`
- pending_confirmation: null
- executed_tools: `[]`
- durable_effect: `platform_handoff`
- committed_effects: `[]`

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` — slot fourni mais redemande / clarification trop lourde

**User**
> Plutôt toute cette semaine : j'ai moins d'énergie, mais je veux garder l'objectif.

**Sophia**
> Je dois reprendre le brouillon proprement. Pour régénérer l’ajustement de toute la semaine, dis-moi quels éléments concrets de ce niveau je dois alléger en premier.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- operation: `adjust_plan_item`
- pending_confirmation: null
- executed_tools: `[]`
- durable_effect: `platform_handoff`

**Analyse si yellow/red**
- Symptome: la reponse comprend le scope semaine, mais formule une demande de precision comme une regeneration de brouillon.
- Source amont probable: intake/guidance readiness, seuil de passage vers handoff.
- Owner runtime: `adjust_plan_item`.
- Meilleure correction: produire plus vite une recommandation niveau courant quand le user a deja donne scope + raison + contrainte de preservation.
- Pourquoi ce n'est pas un patch local: le probleme est le seuil reducer/coaching, pas une phrase isolee.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-TEST-01` — renderer formatting a classifier comme famille renderer dediee

**User**
> Allège d'abord les actions longues : je veux les réduire au minimum viable cette semaine, pas les supprimer.

**Sophia**
> Ce que je comprends : ...  
> Ma recommandation : Rester sur un cadrage de niveau...  
> À préserver : L’objectif principal.; Le cadre de la semaine en cours.; ...  
> Où le faire dans Plan : va dans section Plan. Va dans la section Plan...
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- operation status: `handoff_delivered`
- reason_code: `platform_handoff_from_coaching_guidance`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: bon fond et bon no-mutation, mais rendu trop verbeux, ponctuation maladroite et destination Plan dupliquee.
- Source amont probable: `adjust_plan_item/renderer.ts`.
- Owner runtime: renderer proprietaire adjust plan.
- Meilleure correction: rendre les listes en bullets et ne pas repeter la destination.
- Pourquoi ce n'est pas un patch local: correction appliquee dans le renderer canonique, pas dans le texte du run.

### Tour 4

**Verdict du tour:** green

**User**
> Ok vas-y applique.

**Sophia**
> [repete le handoff complet] ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- operation status: `apply_attempt`
- reason_code: `active_handoff_apply_attempt_no_chat_mutation`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — contrainte explicite perdue

**User**
> Redis-moi quoi faire dans Plan, en version courte.

**Sophia**
> [repete le handoff complet long] ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- operation status: `repeat_handoff`
- reason_code: `active_handoff_repeat`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le flow reste au bon skill, mais ignore "version courte".
- Source amont probable: repeat_handoff renderer/policy ne transmet pas la contrainte de format du follow-up.
- Owner runtime: `adjust_plan_item` active handoff renderer.
- Meilleure correction: ajouter un rendu compact pour repeat quand le user demande court, sans changer le draft stocke.
- Pourquoi ce n'est pas un patch local: c'est une variante de mode renderer active-flow, pas une formulation precise.

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` — mauvaise transition de flow actif

**User**
> Rends ça plus léger : plutôt deux mini-actions de 10 minutes cette semaine.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- operation: null
- executed_tools: `[]`
- durable_effect: null

**Analyse si yellow/red**
- Symptome: 502 vide sur `revise_handoff`.
- Source amont probable: `revise_handoff` relancait l'intake IA complet avec un gros handoff actif.
- Owner runtime: `adjust_plan_item/router.ts`.
- Meilleure correction: reviser le draft actif localement en no-mutation, sans relancer l'ancien terminal d'intake.
- Pourquoi ce n'est pas un patch local: correction faite dans le reducer actif `revise_handoff`.

### Tour 7

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` — mauvaise transition de flow actif

**User**
> Je reformule : garde seulement deux mini-actions de 10 minutes cette semaine, c'est la version plus légère.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- operation: null
- executed_tools: `[]`
- durable_effect: null

**Analyse si yellow/red**
- Symptome: retry du meme objectif toujours en 502.
- Source amont probable: meme transition active `revise_handoff`.
- Correction: appliquee apres ce tour avec `reviseAdjustPlanHandoffDraft`.

### Tour 8

**Verdict du tour:** green

**User**
> Je reformule : garde seulement deux mini-actions de 10 minutes cette semaine, c'est la version plus légère.

**Sophia**
> Ma recommandation : Version révisée demandée : ... deux mini-actions de 10 minutes cette semaine...  
> Où le faire dans Plan : ...  
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- operation status: `revise_handoff`
- reason_code: `active_handoff_revise`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`

### Tour 9

**Verdict du tour:** green

**User**
> Ok, applique cette version maintenant.

**Sophia**
> [repete la version revisee] ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- operation status: `apply_attempt`
- reason_code: `active_handoff_apply_attempt_no_chat_mutation`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`

### Tour 10

**Verdict du tour:** green

**User**
> Redis-moi la version à reprendre dans Plan.

**Sophia**
> Ce que je comprends : ...  
> Ma recommandation : Version révisée demandée : ... deux mini-actions de 10 minutes...  
> À préserver :
> - L’objectif principal
> - Le cadre de la semaine en cours
> ...
> Où le faire dans Plan : section Plan.
> - Va dans la section Plan
> - Ouvre le niveau ou la semaine concernée
> - Reprends cette recommandation en allégeant seulement la période concernée
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- operation status: `repeat_handoff`
- reason_code: `active_handoff_repeat`
- pending_confirmation: null
- executed_tools: `[]`
- committed_effects: `[]`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia garde le sujet `adjust_plan_item` sur les suites courtes.
- Elle clarifie l'ambiguite action/semaine au lieu d'inventer une cible.
- Elle donne une recommandation utilisable et une destination Plan.
- Elle ne dit jamais "c'est fait" et repete la no-mutation.

**Problemes**
- Tour 2: clarification trop procedurale. Famille: `BF-INTAKE-01`. Impact: friction.
- Tour 3: rendu initial trop compact/mal ponctue. Famille: `BF-TEST-01` faute de famille renderer dediee. Impact: lisibilite.
- Tour 5: "version courte" ignoree. Famille: `BF-INTAKE-03`. Impact: repetition lourde.
- Tours 6-7: 502 sur revision active avant fix. Famille: `BF-STATE-01`. Impact: blocage dur.

**Fix propose**
- Source amont: `adjust_plan_item` reducer + renderer.
- Correction recommandee: seuil handoff moins tardif, renderer compact pour repeat, revision de draft actif sans relancer intake lourd.
- Tests d'invariant attendus: repeat compact, revise no-crash, no executor/no token/no DB write.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tous les tours valides restent sur `response_owner=tool_skill` et `selected_handler=adjust_plan_item`.
- Les suites "ok applique", "redis-moi" et "rends ca plus leger" ne partent pas vers status/product/reminder.

**Skills / Operations / Tools**
- `toolExecution=platform_handoff`.
- `executed_tools=[]` sur tous les tours valides.
- `pending_confirmation=null`.
- `committed_effects=[]`.
- `apply_attempt` n'execute rien.

**Memory / Effets durables**
- Aucun effet durable de plan observe dans les traces.
- Le handoff actif reste continuable.
- Les 502 des tours 6-7 ont ete corriges et verifies par les tours 8-10.

**Problemes**
- Tours 6-7: crash revise_handoff. Famille: `BF-STATE-01`. Corrige par revision locale du handoff actif.
- Tour 3/10: renderer corrige pendant le run; tour 10 verifie le rendu liste.

**Fix propose**
- Source amont: `adjust_plan_item/router.ts`, `handoff.ts`, `renderer.ts`, `operation_runtime_pipeline.ts`.
- Correction recommandee: ne jamais laisser le handoff generique capturer `adjust_plan_item`; `revise_handoff` doit rester dans le state handoff; renderer proprietaire unique.
- Tests d'invariant attendus: tests architecture no imports executor/writer/token, tests active followups, QA full AI.

## Verdict Global

- Verdict: yellow
- Raison principale: le no-mutation et l'active flow sont verifies, mais le run a revele deux 502 sur revision active et des frictions renderer/intake. Les 502 et le renderer ont ete corriges et reverifies dans le meme run.
- Follow-up prioritaire: ajouter un rendu compact pour `repeat_handoff` quand le user demande explicitement "court".

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-01-adjust-plan-handoff-fix-bugs.md`
