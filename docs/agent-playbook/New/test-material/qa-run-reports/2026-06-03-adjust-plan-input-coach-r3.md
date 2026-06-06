# QA Run Report - adjust_plan input coach r3

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `adjust-plan-input-coach-r3`
- Persona: `rose`, scope dedie `qa-rose-2026-06-03-adjust-plan-whole-plan-adjust-plan-input-coach-r3`
- Objectif: verifier apres correction que `adjust_plan_item` ne rend plus un modele fixe et reste no-mutation.
- Trajectoire: formulation input Plan -> revision -> repeat phrase courte -> apply attempt -> vraie question produit Plan.
- Surfaces visees: dispatcher, active flow arbitration, writer IA `adjust_plan_item`, renderer guard, state temporaire, effets durables.
- Cadre IA reel: valide. Run local Supabase via `/functions/v1/test-send-message`, `force_full_ai=true`, messages choisis tour par tour.
- Validite QA: valide. 5 tours completes. Cleanup scoped effectue.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J’ai besoin d’un coup de main pour écrire ce que je veux demander dans Plan : la semaine me semble trop chargée, mais je veux garder l’objectif.

**Sophia**
> Je comprends tout à fait, c'est important de trouver le bon équilibre pour ta semaine tout en restant fidèle à tes objectifs ! Voici une suggestion de phrase que tu pourrais utiliser : "La semaine me semble trop chargée, peux-tu m'aider à l'alléger tout en gardant l'objectif ?" Pour l'utiliser, il te suffit d'aller dans Plan, d'ouvrir l'élément ou la zone que tu veux ajuster, puis de coller cette demande dans l'encart d'ajustement. Cela aidera la plateforme à comprendre précisément ce dont tu as besoin. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- direct_effects: `[]`
- operation: `adjust_plan_item`, `mode=platform_input_coaching`, `status=draft_delivered`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun effet durable observe

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Rends-la plus concrète : je veux alléger l’entrée de cette semaine sans lâcher le cap de fond.

**Sophia**
> Super, je vois ce que tu veux dire ! Pour que ce soit bien clair pour Plan, tu pourrais coller cette phrase : "Je veux alléger l'entrée de cette semaine sans lâcher le cap de fond." C'est une formulation prête à l'emploi. Pour l'utiliser, il te suffit d'aller dans Plan, d'ouvrir l'élément ou la zone que tu veux ajuster, puis de coller cette demande dans l'encart d'ajustement. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- direct_effects: `[]`
- operation: `adjust_plan_item`, `mode=platform_input_coaching`, `status=revise_draft`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun effet durable observe

**Analyse si yellow/red**
- Symptome: reponse visible bonne, mais la route globale reste `tool_skill_intent_start` alors que le skill trace une revision.
- Source amont probable: mapping route decision / active flow lifecycle.
- Owner runtime: arbitration + state/trace `adjust_plan_item`.
- Meilleure correction selon les guidelines: remonter la continuation structuree dans la route globale, sans regex locale.
- Pourquoi ce n'est pas un patch local: le contenu est bon ; la representation de transition est incomplete.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-03 - Product/status/tool mal priorises

**User**
> Redis-moi seulement la phrase courte à coller dans Plan.

**Sophia**
> Je veux alléger l’entrée de cette semaine sans lâcher le cap de fond. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- direct_effects: `[]`
- operation: none
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun effet durable observe

**Analyse si yellow/red**
- Symptome: la reponse visible est maintenant correcte et courte, mais le mauvais owner (`product_help`) reste selectionne.
- Source amont probable: product/help arbitration capture le mot Plan malgre le handoff actif.
- Owner runtime: active flow arbitration.
- Meilleure correction selon les guidelines: le repeat de l'artefact actif doit rester au handoff `adjust_plan_item`, sauf vraie question produit distincte.
- Pourquoi ce n'est pas un patch local: la correction doit venir de l'arbitrage structurel, pas d'un match texte sur "redis-moi".

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok vas-y, applique cette phrase dans mon plan.

**Sophia**
> Super ! La phrase est bien prête pour ton Plan. Voici ce que tu peux y coller : "Je veux alléger l'entrée de cette semaine sans lâcher le cap de fond." Pour l'utiliser, il te suffit d'aller dans Plan, d'ouvrir l'élément ou la zone que tu veux ajuster, puis de coller cette demande dans l'encart d'ajustement. C'est toi qui as le contrôle pour l'intégrer exactement là où tu le souhaites ! 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `normal_reply_default`
- direct_effects: `[]`
- operation: `adjust_plan_item`, `mode=platform_input_coaching`, `status=revise_draft`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun effet durable observe

**Analyse si yellow/red**
- Symptome: aucune mutation, mais "applique" n'est toujours pas trace comme `apply_attempt`.
- Source amont probable: confirmation/active-flow structured continuation non exposee au skill pour cette formulation.
- Owner runtime: active flow arbitration + reducer `adjust_plan_item`.
- Meilleure correction selon les guidelines: `apply_attempt` doit etre une transition explicite no-mutation, pas une revision par defaut.
- Pourquoi ce n'est pas un patch local: il ne faut pas matcher "applique" en regex locale ; l'intention doit venir du contrat de confirmation/continuation.

### Tour 5

**Verdict du tour:** green

**User**
> Et concrètement, je trouve où l’endroit pour coller ça dans Plan ?

**Sophia**
> Plan: Le Plan est l'espace principal d'execution d'une transformation active. Il montre les niveaux, les semaines, les elements du plan et l'avancement.
>
> Comment l'utiliser: Dans le dashboard, selectionne une transformation dans la colonne de gauche puis ouvre l'onglet Plan. Tu y vois le niveau actif, les semaines, les missions, habitudes, clarifications et elements a venir. Les bilans hebdomadaires ne se saisissent pas dans le Plan: ils se font par message WhatsApp le dimanche pour faire le point sur la semaine. Il n'existe pas d'endroit pour ajouter librement une action dans le dashboard.
>
> Ce que ca apporte:
> - Donne une vue claire de ce qui est a faire maintenant.
> - Evite de melanger les actions du moment avec toute la transformation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- direct_effects: `[]`
- operation: none
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun effet durable observe

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le modele visible reproche au run precedent a disparu.
- Les tours 1 et 2 sont naturels, chaleureux, et donnent une phrase utile.
- Le tour 3 repond enfin exactement a "juste la phrase".
- Le tour 4 ne pretend pas avoir applique ni modifie le plan.

**Problemes**
- Tour 4: l'apply attempt pourrait etre plus explicite sur le fait que Sophia ne l'applique pas depuis le chat. Famille: BF-STATE-01. Impact: faible cote UX, moyen cote contrat. Severite: yellow.

**Fix propose**
- Source amont: continuation/confirmation active flow.
- Correction recommandee: expliciter `apply_attempt` dans le lifecycle et renderer une phrase no-mutation chaleureuse.
- Tests d'invariant attendus: `ok applique` -> `status=apply_attempt`, `executed_tools=[]`, `committed_effects=[]`, destination Plan.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1/T2 demarrent et continuent sur `adjust_plan_item`, mais la route globale T2 reste `tool_skill_intent_start`.
- T3 donne le bon contenu mais passe par `product_help`, ce qui reste un mauvais owner pour un repeat de handoff actif.
- T5 est un anti-faux-positif correct : une vraie question produit va bien a `product_help`.

**Skills / Operations / Tools**
- Aucun executor appele.
- Aucun token de confirmation cree.
- Le mode reste `platform_input_coaching`.
- Le status actif final reste `revise_draft`, pas `apply_attempt`.

**Memory / Effets durables**
- Avant cleanup: 1 plan, 5 items, 10 messages scoped, 1 state scoped, 0 entries.
- State observe: `__adjust_plan_handoff_state.mode=platform_input_coaching`, `status=revise_draft`, `no_chat_mutation=true`.
- Cleanup scoped: 5 items restaures, 1 plan actif restaure, 10 messages supprimes, 1 state scoped supprime.

**Problemes**
- Tour 3: BF-ROUTE-03. Impact systeme: mauvais owner malgre bonne reponse visible. Severite: yellow.
- Tour 4: BF-STATE-01. Impact systeme: `apply_attempt` non modelise dans la trace. Severite: yellow.

**Fix propose**
- Source amont: active flow arbitration + confirmation/continuation contract.
- Correction recommandee: garder les repeats d'artefact actif dans `adjust_plan_item`, mais laisser les vraies questions produit partir a `product_help`; modeliser `apply_attempt` comme transition explicite.
- Tests d'invariant attendus: repeat actif owner `tool_skill`; question produit explicite owner `product_help`; apply attempt status `apply_attempt`.

## Verdict Global

**yellow**

Le correctif du template visible est valide : l'ancien gabarit n'apparait plus et les reponses sont nettement plus naturelles. Le no-mutation est respecte. Il reste deux problemes systeme a corriger avant de declarer vert : mauvais owner au repeat actif et apply attempt non trace.
