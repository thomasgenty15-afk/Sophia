# QA Run Report - adjust_plan input coach r2

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `adjust-plan-input-coach-r2`
- Persona: `rose`, scope dedie `qa-rose-2026-06-03-adjust-plan-whole-plan-adjust-plan-input-coach-r2`
- Objectif: verifier le nouveau comportement `adjust_plan_item` simplifie en coaching d'input plateforme, sans mutation chat.
- Trajectoire: demande d'ajustement de plan global/semaine -> revision de la phrase -> repeat -> correction utilisateur -> apply attempt.
- Surfaces visees: dispatcher, arbitration active flow, `adjust_plan_item`, renderer handoff Plan, state temporaire, effets durables.
- Cadre IA reel: valide. Run local Supabase via `/functions/v1/test-send-message`, `force_full_ai=true`, messages choisis tour par tour apres lecture des reponses et traces courtes. Aucun renderer deterministe ni fallback technique utilise comme verdict QA.
- Validite QA: valide, 5 tours completes. Cleanup scoped effectue apres inspection durable.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Aide-moi à écrire une demande d’ajustement à coller dans Plan : cette semaine le plan me paraît trop lourd, mais je veux garder le cap.

**Sophia**
> Je vois l'idée : Le plan de cette semaine est perçu comme trop lourd.
>
> Tu peux reprendre cette phrase dans Plan :
>
> “Cette semaine, le plan me paraît trop lourd, mais je veux garder le cap.”
>
> À préserver :
> - garder le cap
> - maintenir les objectifs
>
> À éviter :
> - surcharge
> - plan trop lourd
>
> Va dans Plan, ouvre l'élément ou la zone que tu veux ajuster, puis colle cette demande dans l'encart d'ajustement.
>
> Il ne te reste plus qu'à reprendre ça dans Plan pour faire l'ajustement au bon endroit. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: low
- direct_effects: `[]`
- operation: `adjust_plan_item`, `mode=platform_input_coaching`, `status=draft_delivered`
- pending_confirmation: `null`
- memory_plan: targeted/light
- executed_tools: `[]`
- durable_effect: aucun effet durable observe

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Rends-la plus précise : je veux alléger l’entrée de la semaine, pas abandonner l’objectif.

**Sophia**
> Je vois l'idée : L'entrée de la semaine est perçue comme trop lourde, mais l'objectif doit être maintenu.
>
> Tu peux reprendre cette phrase dans Plan :
>
> “Je veux alléger l'entrée de la semaine, sans abandonner l'objectif.”
>
> À préserver :
> - garder le cap
> - maintenir les objectifs
>
> À éviter :
> - surcharge
> - plan trop lourd
>
> Va dans Plan, ouvre l'élément ou la zone que tu veux ajuster, puis colle cette demande dans l'encart d'ajustement.
>
> Il ne te reste plus qu'à reprendre ça dans Plan pour faire l'ajustement au bon endroit. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: low
- direct_effects: `[]`
- operation: `adjust_plan_item`, `mode=platform_input_coaching`, `status=revise_draft`
- pending_confirmation: `null`
- memory_plan: null
- executed_tools: `[]`
- durable_effect: aucun effet durable observe

**Analyse si yellow/red**
- Symptome: la reponse visible revise correctement la phrase, mais la route globale reste marquee `tool_skill_intent_start` au lieu de representer clairement une continuation active.
- Source amont probable: arbitration active flow / mapping entre state actif et route decision.
- Owner runtime: route/arbitration + contrat d'etat `adjust_plan_item`.
- Meilleure correction selon les guidelines: faire porter les suites `revise`, `repeat`, `apply_attempt` par le contrat du handoff actif, pas par une detection locale de phrase.
- Pourquoi ce n'est pas un patch local: le contenu est correct ; le probleme est la representation du flow actif dans les traces et la priorisation des tours suivants.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-03 - Product/status/tool mal priorises

**User**
> Redis-moi juste la phrase courte à coller dans Plan.

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
- safety: low
- direct_effects: `[]`
- operation: none
- pending_confirmation: `null`
- memory_plan: null
- executed_tools: `[]`
- durable_effect: aucun effet durable observe

**Analyse si yellow/red**
- Symptome: le user demande explicitement de repeter la phrase du handoff actif ; `product_help` capture le mot "Plan" et remplace le contexte par une aide produit generale.
- Source amont probable: arbitration product/status/tool ne protege pas assez le handoff actif quand le message courant est une continuation/repeat de l'objet prepare.
- Owner runtime: active flow arbitration + contrat de priorite `adjust_plan_item` vs `product_help`.
- Meilleure correction selon les guidelines: ajouter une decision structuree d'arbitrage active-flow qui donne priorite au handoff quand le message demande de repeter/reprendre l'artefact actif, tout en laissant les vraies questions produit explicites partir a `product_help`.
- Pourquoi ce n'est pas un patch local: une regex sur "redis-moi" ou "Plan" serait du routing metier interdit. La correction doit etre une regle de responsabilite entre owner actif et skill produit, basee sur l'etat actif et l'intention structuree.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Non, pas l’aide générale sur Plan : redis-moi la phrase d’ajustement qu’on vient de préparer.

**Sophia**
> Je vois l'idée : L'entrée de la semaine est perçue comme trop lourde, mais l'objectif doit être maintenu.
>
> Tu peux reprendre cette phrase dans Plan :
>
> “Je veux alléger l'entrée de la semaine, sans abandonner l'objectif.”
>
> À préserver :
> - garder le cap
> - maintenir les objectifs
>
> À éviter :
> - surcharge
> - plan trop lourd
>
> Va dans Plan, ouvre l'élément ou la zone que tu veux ajuster, puis colle cette demande dans l'encart d'ajustement.
>
> Il ne te reste plus qu'à reprendre ça dans Plan pour faire l'ajustement au bon endroit. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `normal_reply_default`
- safety: low
- direct_effects: `[]`
- operation: `adjust_plan_item`, `mode=platform_input_coaching`, `status=revise_draft`
- pending_confirmation: `null`
- memory_plan: null
- executed_tools: `[]`
- durable_effect: aucun effet durable observe

**Analyse si yellow/red**
- Symptome: Sophia recupere le bon owner apres correction utilisateur, mais traite la demande comme revision par defaut et rend tout le bloc au lieu de seulement la phrase courte.
- Source amont probable: lifecycle du draft actif ne distingue pas assez `repeat_handoff` / `repeat_phrase_only` / `revise_draft`.
- Owner runtime: reducer/state `adjust_plan_item` + renderer du handoff actif.
- Meilleure correction selon les guidelines: enrichir l'intention structuree interne du handoff actif pour representer la demande de repetition sans regenerer tout le bloc.
- Pourquoi ce n'est pas un patch local: le besoin est une transition de draft reutilisable, pas une phrase speciale pour ce tour.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok vas-y applique cette version.

**Sophia**
> Je vois l'idée : L'entrée de la semaine est perçue comme trop lourde, mais l'objectif doit être maintenu.
>
> Tu peux reprendre cette phrase dans Plan :
>
> “Je veux alléger l'entrée de la semaine, sans abandonner l'objectif.”
>
> À préserver :
> - garder le cap
> - maintenir les objectifs
>
> À éviter :
> - surcharge
> - plan trop lourd
>
> Va dans Plan, ouvre l'élément ou la zone que tu veux ajuster, puis colle cette demande dans l'encart d'ajustement.
>
> Il ne te reste plus qu'à reprendre ça dans Plan pour faire l'ajustement au bon endroit. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `normal_reply_default`
- safety: low
- direct_effects: `[]`
- operation: `adjust_plan_item`, `mode=platform_input_coaching`, `status=revise_draft`
- pending_confirmation: `null`
- memory_plan: null
- executed_tools: `[]`
- durable_effect: aucun effet durable observe

**Analyse si yellow/red**
- Symptome: le systeme n'execute rien, ce qui est correct, mais l'intention "applique" n'est pas tracee comme `apply_attempt` et la reponse ne dit pas clairement que l'application ne se fait pas depuis le chat.
- Source amont probable: contrat d'etat actif et reducer de handoff ne modelisent pas encore assez l'apply attempt.
- Owner runtime: `adjust_plan_item` active handoff state + renderer.
- Meilleure correction selon les guidelines: faire de `apply_attempt` une transition explicite du skill actif, avec message de redirection Plan et `no_chat_mutation=true`, sans ouvrir de chemin executor.
- Pourquoi ce n'est pas un patch local: il ne faut pas matcher "vas-y" par regex d'application ; il faut que le handoff actif comprenne structurellement qu'une demande d'application sur un artefact non executable devient une redirection plateforme.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le demarrage est utile : Sophia comprend que le besoin est d'aider a formuler une demande a coller dans Plan.
- La reformulation T2 est concrete et garde bien l'intention "alleger sans abandonner".
- Le ton est plus chaleureux que l'ancien "je ne modifie pas ton plan depuis le chat".

**Problemes**
- Tour 3: Sophia oublie le contexte actif et donne une aide generale sur Plan. Famille: BF-ROUTE-03. Impact: le user doit corriger Sophia pour revenir au draft. Severite: red.
- Tour 4: la demande "juste la phrase" aboutit a un bloc complet. Famille: BF-STATE-01. Impact: experience plus lourde que necessaire, mais exploitable. Severite: yellow.
- Tour 5: "Ok vas-y applique" n'est pas accueilli comme impossibilite d'application chat ; Sophia redonne la consigne sans expliciter la limite. Famille: BF-STATE-01. Impact: no-mutation preservee, mais contrat conversationnel incomplet. Severite: yellow.

**Fix propose**
- Source amont: arbitration active flow et reducer `adjust_plan_item`.
- Correction recommandee: quand un handoff `adjust_plan_item` est actif, les intentions structurees `repeat`, `revise`, `phrase_only` et `apply_attempt` doivent rester au skill, sauf nouvelle intention concurrente explicite. Le renderer doit pouvoir rendre une reponse courte quand le user demande seulement la phrase.
- Tests d'invariant attendus: `redis-moi la phrase` reste `adjust_plan_item`; `ou est Plan ?` peut rester `product_help`; `ok applique` reste no-mutation et trace `apply_attempt`; `rends-la plus precise` trace `revise_draft`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1 et T2 demarrent correctement sur `response_owner=tool_skill`, `selected_handler=adjust_plan_item`.
- T3 est le defaut bloquant : `product_help` gagne sur un repeat du handoff actif parce que le mot "Plan" declenche une entree produit.
- T4/T5 reviennent a `adjust_plan_item`, mais via `route_reason=normal_reply_default`, ce qui signale une continuation mal representee.

**Skills / Operations / Tools**
- `adjust_plan_item` fonctionne comme `platform_input_coaching`.
- Aucun executor, aucun outil durable, aucun token de confirmation n'est observe pendant les 5 tours.
- Les statuts internes ne representent pas assez finement `repeat_handoff` et `apply_attempt`.

**Memory / Effets durables**
- Snapshot initial: 1 plan actif, 5 `user_plan_items`.
- Inspection durable apres T5: 1 plan, 5 items, 0 `user_plan_item_entries`, `executed_tools=[]`, `committed_effects=[]`.
- Etat temporaire observe: `__adjust_plan_handoff_state`, `mode=platform_input_coaching`, `status=revise_draft`, `no_chat_mutation=true`, draft conserve.
- Cleanup scoped: 5 items restaures, 1 plan actif restaure, 10 messages QA supprimes, 1 `user_chat_state` scoped supprime.

**Problemes**
- Tour 3: BF-ROUTE-03. Impact systeme: active handoff non priorise face a `product_help`. Severite: red.
- Tours 2/4/5: BF-STATE-01. Impact systeme: lifecycle actif insuffisamment trace ; continuation/repeat/apply attempt rabattus vers start/default/revise. Severite: yellow.

**Fix propose**
- Source amont: active flow arbitration + contrat `adjust_plan_item` active state.
- Correction recommandee: representer les suites du handoff dans une sortie structuree du skill actif et dans l'arbitrage, sans regex metier. Le dispatcher peut detecter l'opportunite, mais le handoff actif doit posseder les clarifications et demandes de reprise tant que le user ne change pas explicitement de sujet.
- Tests d'invariant attendus: no `product_help` sur repeat actif ; no executor/no writer/no confirmation token ; `apply_attempt` redirige vers Plan ; vrai product help explicite reste possible hors artefact actif.

## Verdict Global

**red**

Le run est valide et le no-mutation est respecte. Le chantier n'est pas encore acceptable en experience complete parce qu'un repeat actif est capture par `product_help` au tour 3, et parce que les suites `repeat` / `apply_attempt` ne sont pas encore representees proprement dans le lifecycle du handoff.
