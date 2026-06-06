# QA Run Report - adjust_plan Rule 0 R1

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `adjust-plan-rule0-r1`
- Persona: Rose, scope `qa-rose-2026-06-02-adjust-plan-whole-plan-adjust-plan-rule0-r1`
- Objectif: verifier le runtime `adjust_plan_item` handoff apres les corrections no-mutation et Rule 0, sur un cas whole-plan qui glisse vers semaine/action.
- Trajectoire: demande whole-plan ambiguë -> precision semaine/action -> tentative `ok vas-y applique` -> repeat handoff -> correction utilisateur -> demande de reformulation chaleureuse.
- Surfaces visees: dispatcher, active flow arbitration, `adjust_plan_item`, handoff state, renderer, EffectLedger, no-mutation.
- Cadre IA reel: valide. Appels locaux `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, messages choisis tour par tour apres lecture reponse/trace. Pas de fallback deterministe utilise comme resultat QA.
- Validite QA: valide. Incident de preparation: Rose Auth locale manquante, reparee par Auth Admin cible; fixture plan Rose restauree depuis un snapshot existant puis nettoyee. Aucun code modifie pendant le run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je crois que le problème n’est pas une action précise : l’ordre de mon plan me fatigue. Je veux revoir la trajectoire, mais sans tout casser.

**Sophia**
> Ce que je comprends : La demande ne vise pas une action isolée mais la lisibilité et le rythme de la trajectoire globale : l’ordre actuel fatigue, alors que l’intention n’est pas de réécrire le plan ni d’en changer la substance. Le vrai enjeu est de remettre de la cohérence dans la séquence sans casser les acquis ni les appuis déjà posés.
>
> Ma recommandation : Je te conseille un diagnostic de réordonnancement partiel : clarifier comment la trajectoire peut être recentrée, alléger les passages trop exigeants à ce stade, et préserver les éléments déjà utiles. proposer une lecture d’ensemble avec options de séquence, pas une modification locale ni une refonte complète.
>
> À reprendre dans Plan : dans la section Plan. [...] Il ne te reste plus qu'à ouvrir Plan et reprendre cette version là-bas. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: false
- executed_tools: `[]`
- durable_effect: chat/state only, no plan mutation

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-03` - Draft lifecycle casse

**User**
> En fait je crois que c’est surtout cette semaine qui me pèse. Je veux garder l’idée du signal de pause, mais le rendre moins lourd.

**Sophia**
> Ce que je comprends : La demande ne vise pas une action isolée mais la lisibilité et le rythme de la trajectoire globale [...]
>
> Ma recommandation : Rends la révision du plan plus prudente : je crois que c’est surtout cette semaine qui me pèse. Je veux garder l’idée du signal de pause, mais le rendre moins lourd. Dans Plan, utilise cette version comme un test ou un brief de révision avant de modifier durablement toute la trajectoire.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `same_operation_signal_continues_active_handoff`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: false
- executed_tools: `[]`
- durable_effect: no plan mutation

**Analyse si yellow/red**
- Symptome: le skill reste actif, mais ne revise pas vraiment le scope vers semaine/action; il recycle le draft whole-plan et copie presque le message utilisateur dans la recommandation.
- Source amont probable: reducer/revise_handoff + handoff draft generation.
- Owner runtime: `adjust_plan_item` handoff state/revision.
- Meilleure correction selon les guidelines: faire de `revise_handoff` une vraie regeneration structurée a partir du nouveau signal de scope, avec `scope.kind=current_week` ou `specific_plan_item` si le signal de pause devient cible claire.
- Pourquoi ce n'est pas un patch local: le renderer reçoit un draft deja stale; corriger la phrase visible ne corrigerait pas le mauvais draft.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-03` - Draft lifecycle casse

**User**
> Ok vas-y applique ça pour cette semaine.

**Sophia**
> Ce que je comprends : Le plan global n'est plus assez tenable dans le contexte actuel.
>
> Ma recommandation : Convenir d'un signal de pause: À placer dans la trajectoire ajustée: Une étape intermédiaire centrée sur Convenir d'un signal de pause et Faire le point sur le signal de pause.; Faire le point sur le signal de pause: À placer dans la trajectoire ajustée: Une étape intermédiaire centrée sur Convenir d'un signal de pause et Faire le point sur le signal de pause.
>
> [...] Il ne te reste plus qu'à ouvrir Plan et reprendre cette version là-bas. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_followup_stays_with_skill`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: false
- executed_tools: `[]`
- durable_effect: no plan mutation

**Analyse si yellow/red**
- Symptome: no-mutation fonctionne malgre `applique`, mais le message ne traite pas explicitement l'`apply_attempt` et produit une recommandation peu lisible.
- Source amont probable: reducer `apply_attempt` et renderer handoff.
- Owner runtime: `adjust_plan_item`.
- Meilleure correction selon les guidelines: `apply_attempt` doit repondre clairement que le chat ne modifie pas le plan, puis redonner la destination et la version courte a reprendre.
- Pourquoi ce n'est pas un patch local: il faut proteger l'etat `apply_attempt`; pas juste ajouter une phrase dans tous les rendus.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-03` - Product/status/tool mal priorises

**User**
> Redis-moi exactement quoi faire dans Plan, juste la version courte.

**Sophia**
> Plan: Le Plan est l'espace principal d'execution d'une transformation active. Il montre les niveaux, les semaines, les elements du plan et l'avancement.
>
> Comment l'utiliser: Dans le dashboard, selectionne une transformation dans la colonne de gauche puis ouvre l'onglet Plan. [...]

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_inline_resume_active_tool_skill`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: false
- executed_tools: `[]`
- durable_effect: no plan mutation

**Analyse si yellow/red**
- Symptome: le repeat handoff attendu est capture par `product_help`; Sophia donne une aide generique sur Plan au lieu de repeter la recommandation active.
- Source amont probable: arbitration active flow / product_help inline resume policy.
- Owner runtime: routers/arbitrators + active handoff policy.
- Meilleure correction selon les guidelines: si `adjust_plan_item` est actif en `platform_handoff`, les messages "redis-moi", "quoi faire dans Plan", "version courte" doivent rester au skill comme `repeat_handoff`, sauf intention produit autonome explicite.
- Pourquoi ce n'est pas un patch local: une regex locale sur "redis-moi" violerait Rule 0; la correction doit etre dans le contrat d'arbitrage et la politique d'ownership active.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-03` - Draft lifecycle casse

**User**
> Non, je veux dire : redis-moi la recommandation d’ajustement pour le signal de pause, pas l’aide générale sur Plan.

**Sophia**
> Ce que je comprends : Le plan global n'est plus assez tenable dans le contexte actuel.
>
> Ma recommandation : Rends la révision du plan plus prudente : Non, je veux dire: redis-moi la recommandation d’ajustement pour le signal de pause, pas l’aide générale sur Plan. Dans Plan, utilise cette version comme un test ou un brief de révision avant de modifier durablement toute la trajectoire.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `same_operation_signal_continues_active_handoff`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: false
- executed_tools: `[]`
- durable_effect: no plan mutation

**Analyse si yellow/red**
- Symptome: le skill recupere la main mais copie la correction utilisateur dans la recommandation au lieu de repeter/reviser le draft.
- Source amont probable: handoff draft revision/repeat policy.
- Owner runtime: `adjust_plan_item`.
- Meilleure correction selon les guidelines: separer `repeat_handoff` et `revise_handoff`; la correction utilisateur doit mettre a jour le draft, pas devenir le contenu recommandé.
- Pourquoi ce n'est pas un patch local: le probleme est le cycle de vie du draft et la transformation du signal utilisateur.

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-03` - Draft lifecycle casse

**User**
> Rends ça plus clair et plus chaleureux, comme une petite phrase que je peux reprendre dans Plan.

**Sophia**
> Ce que je comprends : Le plan global n'est plus assez tenable dans le contexte actuel.
>
> Ma recommandation : Convenir d'un signal de pause: À placer dans la trajectoire ajustée: Une étape intermédiaire centrée sur Convenir d'un signal de pause et Faire le point sur le signal de pause.; Faire le point sur le signal de pause: À placer dans la trajectoire ajustée: Une étape intermédiaire centrée sur Convenir d'un signal de pause et Faire le point sur le signal de pause.
>
> [...] Il ne te reste plus qu'à ouvrir Plan et reprendre cette version là-bas. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_followup_stays_with_skill`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: false
- executed_tools: `[]`
- durable_effect: no plan mutation

**Analyse si yellow/red**
- Symptome: le coaching guidance interne comprend la demande de phrase courte et chaleureuse, mais le rendu final ignore cette instruction et ressort un draft mecanique.
- Source amont probable: handoff draft generation/renderer integration.
- Owner runtime: `adjust_plan_item` renderer + draft revision.
- Meilleure correction selon les guidelines: le renderer doit consommer le draft revise ou la guidance finale; pour ce cas, produire une phrase courte reusable dans Plan.
- Pourquoi ce n'est pas un patch local: la trace montre que la guidance correcte existe; la perte se situe entre guidance, draft et renderer.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le premier handoff est comprehensible et rassurant: il preserve le plan, propose une redirection Plan et evite le langage "c'est fait".
- La formulation finale "Il ne te reste plus qu'a ouvrir Plan..." est plus naturelle que "je ne modifie pas ton plan depuis le chat".
- Sophia n'execute jamais malgre "ok vas-y applique".

**Problemes**
- Tour 2: Sophia ne suit pas le glissement humain vers "cette semaine / signal de pause"; elle reste sur une lecture whole-plan. Famille: `BF-STATE-03`. Impact: l'utilisateur doit corriger le systeme.
- Tour 4: "Redis-moi exactement quoi faire dans Plan" declenche une aide produit generique. Famille: `BF-ROUTE-03`. Impact: rupture conversationnelle nette.
- Tours 5-6: le skill revient mais recycle ou mecanise le draft; il n'arrive pas a produire la petite phrase chaleureuse demandee. Famille: `BF-STATE-03`. Impact: experience frustrante, handoff pas directement utilisable.

**Fix propose**
- Source amont: active handoff arbitration + reducer `repeat_handoff`/`revise_handoff` + handoff draft renderer.
- Correction recommandee: garder `adjust_plan_item` proprietaire des follow-ups courts lies au handoff actif; regenerer le draft a partir du nouveau scope et de la demande de style au lieu de reutiliser le draft initial.
- Tests d'invariant attendus: "redis-moi quoi faire dans Plan" reste `adjust_plan_item`; "rends ça plus chaleureux" produit une version courte et humaine; "plutôt cette semaine" change le scope sans copie brute du message utilisateur.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tours 1, 2, 3, 5, 6: `response_owner=tool_skill`, `selected_handler=adjust_plan_item`, pas d'execution.
- Tour 4: mauvais owner `product_help` avec `route_reason=product_help_inline_resume_active_tool_skill`. C'est contraire au comportement attendu pour un active handoff `adjust_plan_item`.

**Skills / Operations / Tools**
- `tool_execution=platform_handoff` sur les tours adjust_plan.
- `executed_tools=[]` sur tous les tours.
- `pending_confirmation=false` sur tous les tours.
- `direct_effects=[]` sur tous les tours.
- Point positif: "ok vas-y applique" ne cree ni confirmation token ni executor path.

**Memory / Effets durables**
- Avant cleanup: 1 plan fixture, 4 items fixture, 12 messages, 1 state scoped au run.
- Cleanup runner: 1 plan, 4 items, 12 messages et 1 state supprimes.
- Cleanup manuel fixture: 1 transformation et 1 cycle QA supprimes.
- Etat final verifie: plans=0, items=0, chat_messages=0, states=0, cycle_rows=0, transformation_rows=0.

**Problemes**
- Tour 4: active flow mal arbitre vers product_help. Famille: `BF-ROUTE-03`. Impact systeme: le handoff actif perd l'ownership sur une demande de repeat.
- Tours 2, 5, 6: draft stale ou copie brute du user. Famille: `BF-STATE-03`. Impact systeme: `revise_handoff` ne regenere pas la recommandation finale.
- Tous les tours adjust_plan: trace interne avec indices de slotting metier deterministe: `deterministic whole-plan fit/complexity signal`, `deterministic whole-plan mentioned plan anchors`, `deterministic whole-plan concrete trajectory proposal`. Famille: `BF-INTAKE-05`. Impact systeme: risque de violation de la charte anti-patching si ces signaux proviennent de regex/includes semantiques ou d'une couche aval qui invente le scope/slots.

**Fix propose**
- Source amont: arbitration active handoff, reducer `AdjustPlanHandoffState`, draft revision pipeline, intake/candidate compiler.
- Correction recommandee: remplacer les decisions metier deterministes par contrat structured intake/clarification; l'arbitrage doit utiliser des contraintes structurees produites par le dispatcher ou par le skill, pas des signaux metier locaux.
- Tests d'invariant attendus: active handoff capture `redis-moi`, `quoi faire dans Plan`, `rends ça plus léger`, `ok vas-y`; no confirmation token; no executor; no writer; no response_owner product_help pour repeat handoff; traces sans signaux "deterministic whole-plan..." issus d'une couche semantique locale.

## Verdict Global

- Verdict: red
- Raison principale: no-mutation est protege, mais la continuite active handoff casse au tour 4 et la revision du draft ne produit pas une recommandation actionnable/chaleureuse.
- Follow-up prioritaire: corriger l'arbitrage active handoff et le lifecycle `repeat_handoff`/`revise_handoff`, puis auditer les signaux metier deterministes contre la charte anti-patching.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-02-adjust-plan-rule0-r1-bugs.md`
