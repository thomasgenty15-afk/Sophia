# QA Run — select_state_potion 6 flows handoff r2

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `select-state-potion-r2-{rappel,courage,clarte,guerison,amour,apaisement}`
- Persona: `qa-skill`, connexion temporaire `state_potion_handoff_20260603-r2`, user `14ccd792-eeb4-44b6-9a37-2509d988169e`
- Objectif: verifier les 6 sous-flows conversationnels potion apres corrections anti-patching, avec minimum 3 tours par flow.
- Trajectoire: routing explicite potion, intake incrementale, handoff plateforme no-mutation, continuations `apply_attempt`, `repeat_handoff`, `revise_handoff`, destination plateforme.
- Surfaces visees: dispatcher, clarification transverse, active handoff arbitration, select_state_potion handoff runtime, renderer, DB no-mutation.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback direct `processMessage`, aucune modification de code pendant les runs.
- Validite QA: valide. Incident technique initial: Node fetch localhost bloque par sandbox; resolution par execution hors sandbox des runners QA locaux. Aucun restart Supabase, aucun `supabase db reset`.

## 2. Tours De Conversation

### Flow Rappel / Anti-Decrochage

#### Tour 1

**Verdict du tour:** green

**User**
> Je veux preparer une potion anti-decrochage. Je sens que je laisse filer mon sport depuis une semaine, je repousse a chaque fois.

**Sophia**
> Et comment ça se manifeste, ce décrochage ? 🙂

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: tool_skill_intent_start
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

#### Tour 2

**Verdict du tour:** green

**User**
> Ce n est pas que j oublie vraiment. Je repousse, puis je laisse filer. C est surtout mon sport du soir qui saute.

**Sophia**
> Ce que je comprends : mon sport ; repousse  
> Je te conseille de choisir une potion de rappel.  
> ...  
> À mettre dans la plateforme : Potion : Potion anti-decrochage  
> - Par rapport a quoi tu sens que tu decroches ? mon sport  
> - Tu decroches plutot comment ? Je repousse  
> ...  
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_turn_unclear
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

#### Tour 3

**Verdict du tour:** green

**User**
> Ok, cree-la maintenant alors.

**Sophia**
> Je ne peux pas le créer/lancer depuis le chat. Tu peux le faire toi-même dans la plateforme, dans la section État / Potions. Choisis : Potion anti-decrochage. À renseigner :
> - Par rapport a quoi tu sens que tu decroches ? mon sport
> - Tu decroches plutot comment ? Je repousse

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_apply_attempt
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

### Flow Courage

#### Tour 1

**Verdict du tour:** green

**User**
> Je veux preparer une potion de courage. J evite d envoyer un message important a mon associe, et je crois que c est surtout la peur du conflit.

**Sophia**
> Est-ce que ce qui bloque le plus est la peur du conflit ? 🙂

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: tool_skill_intent_start
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

#### Tour 2

**Verdict du tour:** green

**User**
> Oui, c est bien la peur du conflit. Ce que j evite, c est ce message a mon associe pour poser une limite.

**Sophia**
> Ce que je comprends : envoyer un message important à ton associé ; conflit  
> Je te conseille de choisir une potion de courage.  
> ...  
> À mettre dans la plateforme : Potion : Potion de courage  
> - Qu'est-ce que tu evites en ce moment ? envoyer un message important à ton associé  
> - Qu'est-ce qui bloque le plus ? La peur du conflit  
> ...  
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_turn_unclear
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

#### Tour 3

**Verdict du tour:** green

**User**
> Redis-moi juste quoi mettre dans la plateforme.

**Sophia**
> [Repete la recommandation complete courage avec les deux champs plateforme et la cloture no-mutation.]

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_repeat_handoff
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

### Flow Clarte

#### Tour 1

**Verdict du tour:** green

**User**
> Je veux une potion de clarte. Mon plan commence a perdre son sens : je ne vois plus le lien entre mes actions et mon pourquoi profond.

**Sophia**
> Ce que je comprends : Je ne vois plus le lien entre mes actions et mon pourquoi profond.  
> Je te conseille de choisir une potion de clarté.  
> ...  
> À mettre dans la plateforme : Potion : Potion de clarte  
> - Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ? Je ne vois plus le lien entre mes actions et mon pourquoi profond.  
> ...  
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: tool_skill_intent_start
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-03 — Draft lifecycle casse

**User**
> Formule-le plutot comme ca : je fais les actions, mais je ne sens plus pourquoi elles comptent pour moi aujourd hui.

**Sophia**
> Ce que je comprends : Je ne vois plus le lien entre mes actions et mon pourquoi profond.  
> Je te conseille de choisir une potion de clarté.  
> Pourquoi cette potion : Tu as l'impression de faire tes actions mécaniquement et de ne plus voir le lien avec ton pourquoi profond.  
> ...  
> À mettre dans la plateforme :  
> - Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ? Je ne vois plus le lien entre mes actions et mon pourquoi profond.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_revise_handoff
- active_handoff_action: revise_handoff high
- operation: platform_handoff
- executed_tools: []
- committed_effects: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: la revision est comprise dans `why_this_potion`, mais `user_state_summary` et `platform_inputs.answers[0].value` restent sur l'ancienne formulation.
- Source amont probable: lifecycle de revision handoff select_state_potion; le draft visible est regenere partiellement mais l'intake_state/detail answer qui alimente `platform_inputs` n'est pas mis a jour.
- Owner runtime: `select_state_potion` handoff/revision state.
- Meilleure correction selon les guidelines: quand `active_handoff_action.type=revise_handoff`, propager la revision structuree vers le champ plateforme courant ou regenerer le draft handoff depuis un intake_state revise, sans regex locale.
- Pourquoi ce n'est pas un patch local: la famille concerne toutes les revisions de handoff qui changent une valeur plateforme, pas une phrase clarté exacte.

#### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-03 — Draft lifecycle casse

**User**
> Ok active celle-la.

**Sophia**
> Je ne peux pas le créer/lancer depuis le chat. Tu peux le faire toi-même dans la plateforme, dans la section État / Potions. Choisis : Potion de clarte. À renseigner :
> - Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ? Je ne vois plus le lien entre mes actions et mon pourquoi profond.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_apply_attempt
- tool_skill_run.status: apply_attempt
- operation: platform_handoff
- executed_tools: []
- committed_effects: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: apply_attempt correct et non-mutant, mais il repete l'ancienne valeur plateforme issue du bug T2.
- Source amont probable: meme source que T2, draft/platform_inputs stale apres revision.
- Owner runtime: `select_state_potion` handoff/revision state.
- Meilleure correction selon les guidelines: corriger le cycle revision -> platform_inputs, puis verifier apply_attempt qui reuse le draft revise.
- Pourquoi ce n'est pas un patch local: l'apply_attempt doit reutiliser le draft courant; il ne doit pas tenter de reparer lui-meme le texte.

### Flow Guerison

#### Tour 1

**Verdict du tour:** green

**User**
> Je veux preparer une potion de guerison. Hier j ai craque sur un truc que je voulais tenir, et depuis je ressens surtout de la honte et de la culpabilite.

**Sophia**
> Est-ce que tu veux préparer une potion pour changer ton état ou est-ce que tu cherches un soutien émotionnel pour ce que tu ressens ? 🙂

**Trace courte**
- http_status: 200
- response_owner: orientation_clarification
- selected_handler: orientation_clarification
- route_reason: clarification_required
- direct_effects: []
- operation: none
- executed_tools: []
- durable_effect: none

#### Tour 2

**Verdict du tour:** green

**User**
> Je veux bien preparer la potion de guerison, pas juste parler de l emotion. Ce qui a fait mal : j ai craque hier, et le sentiment dominant c est la honte.

**Sophia**
> Ok, tu as craqué hier. Tu confirmes que le sentiment dominant est la honte ? 🙂

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: orientation_clarification_resolved_tool_skill
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

#### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 — Mauvaise transition de flow

**User**
> Oui, c est la honte surtout.

**Sophia**
> Ce que je comprends : j'ai craqué hier ; honte  
> Je te conseille de choisir une potion de réparation.  
> ...  
> À mettre dans la plateforme : Potion : Potion de guerison  
> - Qu'est-ce qui t'a fait mal ou t'a fait retomber recemment ? j'ai craqué hier  
> - Tu ressens surtout quoi ? De la honte  
> ...  
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_apply_attempt
- active_handoff_action: handoff_apply_attempt high
- tool_skill_run.status: handoff_delivered
- operation: platform_handoff
- executed_tools: []
- committed_effects: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: la reponse visible est correcte, mais le dispatcher/turn_frame classe "Oui, c'est la honte" en `handoff_apply_attempt` alors que c'est une confirmation de champ courant.
- Source amont probable: contrat `active_handoff_action` / arbitrage active handoff ne distingue pas assez confirmation de champ detail intake vs demande d'application. Le runtime compense avec son guard et livre le handoff au lieu d'executer.
- Owner runtime: dispatcher active_handoff_action + active handoff arbitration contract.
- Meilleure correction selon les guidelines: renforcer le contrat structurel de confirmation de champ courant quand `active_tool_skill_intake.phase=detail_intake` et champ proposé, pas ajouter de regex sur "oui".
- Pourquoi ce n'est pas un patch local: le probleme est transversal aux platform_handoff_skill avec champs incrementaux.

### Flow Amour

#### Tour 1

**Verdict du tour:** green

**User**
> Je veux une potion d amour. Je me sens en manque d amour par rapport a mon ecriture, je me parle durement et je trouve tout nul.

**Sophia**
> Veux-tu choisir une potion pour changer ton état d'esprit ou cherches-tu un soutien émotionnel pour ton écriture ? 🙂

**Trace courte**
- http_status: 200
- response_owner: orientation_clarification
- selected_handler: orientation_clarification
- route_reason: clarification_required
- direct_effects: []
- operation: none
- executed_tools: []
- durable_effect: none

#### Tour 2

**Verdict du tour:** green

**User**
> Je choisis la potion d amour. A mettre : par rapport a mon ecriture, et je me sens surtout tres dure avec moi.

**Sophia**
> Tu te sens surtout dure avec toi, c'est bien ça ? 🙂

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: orientation_clarification_resolved_tool_skill
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

#### Tour 3

**Verdict du tour:** green

**User**
> Oui, dure avec moi.

**Sophia**
> Ce que je comprends : mon écriture ; dur  
> Je te conseille de choisir une potion d'amour envers soi.  
> ...  
> À mettre dans la plateforme : Potion : Potion d'amour  
> - Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ? mon écriture  
> - Tu te sens surtout comment ? Dur avec moi  
> ...  
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_turn_unclear
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

### Flow Apaisement

#### Tour 1

**Verdict du tour:** green

**User**
> Je veux une potion d apaisement, pas un suivi. Ce qui me met sous pression la, c est une discussion qui tourne dans ma tete, et je suis tres stresse.

**Sophia**
> Tu te sens stressé ? 🙂

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: orientation_clarification_resolved_tool_skill
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

#### Tour 2

**Verdict du tour:** green

**User**
> Oui, tres stresse. Et je veux vraiment garder ca ponctuel, sans suivi.

**Sophia**
> Ce que je comprends : une discussion qui tourne dans ma tete ; stresse  
> Je te conseille de choisir une potion d'apaisement court.  
> ...  
> À mettre dans la plateforme : Potion : Potion d'apaisement  
> - Qu'est-ce qui te met le plus sous pression la ? une discussion qui tourne dans ma tete  
> - Tu te sens plutot comment ? Tres stresse  
> ...  
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_turn_unclear
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

#### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-03 — Product/status/tool mal priorises

**User**
> Et je la lance ou exactement dans la plateforme ?

**Sophia**
> [Repete la recommandation complete apaisement avec les champs plateforme, la destination et la cloture no-mutation.]

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: select_state_potion
- route_reason: active_handoff_action_unclear
- active_handoff_action: clarify_handoff high
- tool_skill_run.status: handoff_delivered
- direct_effects: []
- operation: platform_handoff
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le bon owner garde la main, mais la question "où exactement ?" devrait rendre une redirection courte. Le renderer repete tout le handoff.
- Source amont probable: contrat active_handoff_action / renderer handoff ne mappe pas assez `platform_destination_followup` vers un rendu court.
- Owner runtime: active handoff arbitration + select_state_potion renderer.
- Meilleure correction selon les guidelines: ajouter une action structuree de destination/repeat path dans le contrat active handoff, puis renderer court reutilisant le draft; pas de regex locale sur "où".
- Pourquoi ce n'est pas un patch local: cas transversal aux platform_handoff_skill; le user demande le chemin d'activation, pas une nouvelle recommandation.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les 6 flows restent dans `select_state_potion` ou passent par une clarification pertinente quand l'emotion peut dominer.
- Les handoffs contiennent recommandation, raison, champs plateforme, destination et cloture no-mutation.
- Les demandes "cree-la maintenant" / "active celle-la" ne creent rien et redonnent le chemin plateforme.
- Aucun placeholder interne du type `current_user_message`, `User explicitly`, `user_message_describes` n'apparait.

**Problemes**
- Tour clarté 2-3: revision comprise dans le rationale mais pas dans la valeur plateforme. Famille: BF-STATE-03. Impact: le user risque de copier l'ancienne formulation dans l'UI. Severite: yellow.
- Tour guérison 3: trace/action active classe une confirmation de champ en apply_attempt, meme si le rendu final est correct. Famille: BF-STATE-01. Impact: risque systeme futur sur les handoffs incrementaux. Severite: yellow.
- Tour apaisement 3: "où exactement ?" repete tout le handoff au lieu d'un chemin court. Famille: BF-ROUTE-03. Impact: friction UX, pas bloquant. Severite: yellow.
- Plusieurs summaries visibles restent un peu fragmentaires ("mon sport ; repousse", "mon écriture ; dur"). Impact faible mais experience encore mecanique.

**Fix propose**
- Source amont: lifecycle `revise_handoff`, contrat `active_handoff_action`, renderer active handoff.
- Correction recommandee: rendre la revision responsable des `platform_inputs`; distinguer confirmation de champ vs apply_attempt par sortie structuree; ajouter un rendu court pour destination plateforme active.
- Tests d'invariant attendus: positif revision champ plateforme, paraphrase correction, anti-faux-positif apply_attempt explicite; positif "où je la lance" -> chemin court, anti-faux-positif product_help general.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Routing explicite potion: green sur rappel, courage, clarté, apaisement.
- Clarification emotion vs potion: green sur guérison et amour; resolution vers tool skill correcte.
- Active continuation: apply_attempt et repeat_handoff fonctionnels; warning sur confirmation de champ classée apply_attempt en trace guérison T3.

**Skills / Operations / Tools**
- `select_state_potion` fonctionne en mode `platform_handoff`.
- `executed_tools=[]` sur tous les tours.
- `tool_execution=platform_handoff` pour les tours tool skill; `tool_execution=none` pour les tours de clarification.
- Aucun executor potion ou writer DB observe.

**Memory / Effets durables**
- Verification DB post-run avant cleanup:
  - `user_potion_sessions=0`
  - `user_recurring_reminders=0`
  - `scheduled_checkins=0`
- Durable files par flow: `scheduled_checkins=0`, `user_recurring_reminders=0`, `memory_items=0`.

**Problemes**
- Clarté T2-T3: platform_inputs stale apres revision. Famille: BF-STATE-03. Impact systeme: draft courant incoherent entre rationale et champs UI. Severite: yellow.
- Guérison T3: `active_handoff_action=handoff_apply_attempt` pour une confirmation de champ. Famille: BF-STATE-01. Impact systeme: contrat/action trop large, heureusement neutralise par runtime. Severite: yellow.
- Apaisement T3: `active_handoff_action=clarify_handoff` pour une demande de destination. Famille: BF-ROUTE-03. Impact systeme: bonne ownership mais mauvaise action structurée/rendu trop large. Severite: yellow.

**Fix propose**
- Source amont: handoff revision reducer/state, dispatcher active_handoff_action contract, renderer destination follow-up.
- Correction recommandee: corriger les owners structurels ci-dessus, sans regex metier locale.
- Tests d'invariant attendus: voir bug sheet.

## Verdict Global

- Verdict: yellow
- Raison principale: no-mutation et routing globalement bons, mais revision clarté laisse une valeur plateforme stale et deux continuations active handoff sont mal classées/rendues.
- Follow-up prioritaire: corriger le lifecycle `revise_handoff -> platform_inputs`, puis rerun clarté revision + apply_attempt.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-03-select-state-potion-6flows-handoff-r2-bugs.md`
