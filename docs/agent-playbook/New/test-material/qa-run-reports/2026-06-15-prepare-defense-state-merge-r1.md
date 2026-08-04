# QA Run Report - prepare-defense-state-merge-r1

## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `prepare-defense-state-merge-r1`
- Persona: `qa-skill`, connexion temporaire `prepare_defense_state_merge_r1`, user local `0ae5e856-ee2a-49a2-a6db-fac51d5669e6`
- Objectif: verifier en conditions reelles locales que `prepare_defense_card` respecte le flow local stateful, conserve les champs server-owned, supporte revision/destination/apply, et sort proprement vers un autre outil.
- Trajectoire: entree explicite defense -> enrichissement -> handoff -> revision -> destination follow-up -> apply attempt -> demande explicite carte d'attaque.
- Surfaces visees: dispatcher global, ownership flow actif, `prepare_defense_card` local dispatcher/reducer/visible agent, temp memory/active state, effect ledger, table `user_defense_cards`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, pas de renderer deterministe, pas de fallback direct `processMessage`.
- Validite QA: valide. Tous les tours ont repondu HTTP `200`, aucune reponse vide, aucun abort. Le verdict global est `red` a cause d'une violation d'ownership au tour 6.
- Artefacts: `tests/real-personas/qa-skill/runs/operations/2026-06-15-prepare-defense-state-merge-r1.raw.json`, `.summary.json`, `.durable.json`
- Cleanup: effectue via `scripts/qa-cleanup-run-connection.sh qa-skill prepare_defense_state_merge_r1`, puis suppression de `tests/real-personas/qa-skill/connection.json`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je veux preparer une carte de defense pour les soirs ou je rentre vide, j'ouvre Deliveroo sans reflechir et je finis par commander n'importe quoi.

**Sophia**
> Je comprends tout a fait ce reflexe qui s'installe quand on est epuise. Pour t'aider a interrompre cette impulsion, qu'est-ce que tu aimerais faire ou te dire a la place au moment ou tu rentres ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- status: `collecting`
- tool_execution: `blocked`
- executed_tools: `[]`
- pending_confirmation: `null`
- committed_effects: `[]`
- state_mutation_audit: present; applied `tool_fit_state`, `attachment_state`, `risk_state`, `trigger_state`, `defense_goal_state`, `support_need_state`; no rejected changes
- ai_call_count: `2`
- durable_effect: none

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow

**User**
> Je voudrais poser mon sac, boire un verre d'eau, puis sortir un truc simple du frigo avant meme de regarder mon telephone.

**Sophia**
> C'est une excellente idee de ritualiser ton retour en posant ton sac et en buvant un verre d'eau avant de regarder ton telephone, je garde ca precieusement pour la suite. Ta preparation est terminee !
>
> Comme la carte n'est pas creee automatiquement depuis notre echange, tu peux aller l'ajouter toi-meme dans Ressources / Defense / Cartes de defense libres.
>
> Voici les elements que j'ai prepares pour toi :
> - **Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?** : les soirs ou je rentre vide et que j'ouvre Deliveroo sans reflechir pour commander n'importe quoi
> - **Contexte de risque** : Le moment ou la fatigue declenche l'ouverture automatique de l'application de livraison.
> - **Action de defense** : casser l'automatisme d'ouverture de l'appli

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- status: `handoff_delivered`
- reason_code: `platform_handoff_delivered`
- tool_execution: `platform_handoff`
- committed_effects: `[]`
- ledger: delivered `1`, committed `0`
- state_mutation_audit: restored `defense_response_hint_state`; rejected `defense_response_hint_state` with reason `blocked_by_constraint`, attempted_action `confirm_proposed_field`
- ai_call_count: `2`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user donne une reponse defensive concrete, mais le premier handoff remplace cette action par une formule generique (`casser l'automatisme d'ouverture de l'appli`).
- Source amont probable: merge reducer/server-owned de `prepare_defense_card` trop restrictif pour `defense_response_hint_state` sur la transition `confirm_proposed_field`.
- Owner runtime: `prepare_defense_card` local reducer, avec impact visible dans `handoff_ready`.
- Meilleure correction selon les guidelines: autoriser la mise a jour de `defense_response_hint_state` quand la transition courante stabilise un hint concret donne par le user, ou faire produire au dispatcher une action de continuation/handoff qui permet explicitement ce champ.
- Pourquoi ce n'est pas un patch local: le visible agent recoit deja un etat ou le hint a ete restaure/rejete; corriger seulement la phrase masquerait une perte d'etat.

### Tour 3

**Verdict du tour:** green

**User**
> Reformule plutot le champ comme ca : les retours tardifs ou je suis vide, et ou je veux eviter d'ouvrir l'appli de livraison avant d'avoir mange quelque chose de simple.

**Sophia**
> Voici la formulation a recopier dans Ressources / Defense / Cartes de defense libres.
>
> Pour le champ **Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?** :
> *les retours tardifs ou je suis vide, et ou je veux eviter d'ouvrir l'appli de livraison avant d'avoir mange quelque chose de simple.*
>
> Pour le contexte de risque : *Vouloir eviter d'ouvrir l'appli de livraison avant d'avoir mange quelque chose de simple.*
> Pour l'action de defense : *poser le sac, boire de l'eau, manger un truc simple du frigo*
>
> Je te laisse creer la carte dans l'application, car elle n'est pas ajoutee automatiquement depuis notre echange.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- status: `handoff_delivered`
- reason_code: `platform_handoff_delivered`
- tool_execution: `platform_handoff`
- committed_effects: `[]`
- state_mutation_audit: applied `tool_fit_state`, `attachment_state`, `risk_state`, `trigger_state`, `defense_goal_state`, `defense_response_hint_state`, `support_need_state`; no rejected changes
- ai_call_count: `2`
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-03` - draft lifecycle casse

**User**
> Ok, je la mets ou exactement ?

**Sophia**
> Tu peux l'ajouter dans Ressources / Defense / Cartes de defense libres.
>
> Pour le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?, tu peux copier : les retours tardifs ou je suis vide, et ou je veux eviter d'ouvrir l'appli de livraison avant d'avoir mange quelque chose de simple.
>
> Pour le contexte de risque, utilise : Vouloir eviter d'ouvrir l'appli de livraison avant d'avoir mange quelque chose de simple.
> Et pour l'action de defense : poser le sac, boire de l'eau, manger un truc simple du frigo.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- status: `handoff_delivered`
- reason_code: `destination_short`
- tool_execution: `platform_handoff`
- committed_effects: `[]`
- state_mutation_audit: no applied/restored/rejected changes
- ai_call_count: `2`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le dispatcher/reducer choisit bien `destination_short`, mais la reponse rederoule quasiment tout le handoff.
- Source amont probable: prompt visible ou `conversation_context` de `destination_short` trop large.
- Owner runtime: `prepare_defense_card` visible agent stage `destination_short`.
- Meilleure correction selon les guidelines: contraindre ce stage a repondre courtement avec le chemin et, au maximum, le champ canonique deja verrouille si utile.
- Pourquoi ce n'est pas un patch local: la trace systeme est correcte; le bug est un contrat de prompt visible stage-specific.

### Tour 5

**Verdict du tour:** green

**User**
> Parfait, cree-la maintenant du coup.

**Sophia**
> Je ne peux pas creer la carte directement depuis notre discussion, mais tu peux l'ajouter toi-meme dans Ressources / Defense / Cartes de defense libres.
>
> Voici les elements a copier :
>
> Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : les retours tardifs ou je suis vide, et ou je veux eviter d'ouvrir l'appli de livraison avant d'avoir mange quelque chose de simple.
>
> Contexte de risque : Vouloir eviter d'ouvrir l'appli de livraison avant d'avoir mange quelque chose de simple.
>
> Action de defense : poser le sac, boire de l'eau, manger un truc simple du frigo

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- status: `apply_attempt`
- reason_code: `apply_attempt_not_executable_from_chat`
- tool_execution: `platform_handoff`
- blocked_effects: `create_defense_card / chat_creation_disabled_platform_handoff`
- executed_tools: `[]`
- pending_confirmation: `null`
- committed_effects: `[]`
- ledger: delivered `1`, committed `0`
- state_mutation_audit: no applied/restored/rejected changes
- ai_call_count: `2`
- durable_effect: none

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - ancien flow capture ou contourne une nouvelle intention

**User**
> En fait rien a voir, j'ai plutot besoin d'une carte d'attaque pour lancer mon dossier CAF demain matin.

**Sophia**
> Je suis ravie de t'aider pour tes Cartes d'attaque. Est-ce que l'objectif est bien de lancer ton dossier CAF demain matin ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- active_flow_arbitration: `decision=none`, `active_owner=none`, `selected_owner=none`, `reason_code=no_active_flow`
- active_flow_debug: `read_active_flow_state` voit `active_tool_skill_id=prepare_defense_card`, puis `before_run_conversation_routers` ne voit plus que `__conversation_risk_history` et `__conversation_risk_last`
- blocked_paths: `[]`
- note_information: source `global_dispatcher`, target `prepare_attack_card`, reason `explicit_user_request`
- prepare_attack_card flow_action: `confirm_candidate`
- tool_execution: `blocked`
- committed_effects: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le message est finalement bien dirige vers `prepare_attack_card`, mais il ne passe pas par la sortie locale obligatoire de `prepare_defense_card`.
- Source amont probable: ownership runtime/active state; l'etat actif defense existe au moment de `read_active_flow_state`, puis est efface avant les conversation routers.
- Owner runtime: routeur active flow / temp memory reconciliation, pas le prompt visible defense.
- Meilleure correction selon les guidelines: faire de la lecture canonique d'active flow la source d'ownership du tour. Si `prepare_defense_card` est actif, appeler son dispatcher local d'abord; ne vider/switcher qu'apres `exit_to_global_dispatcher` produit par ce dispatcher avec `note_information`.
- Pourquoi ce n'est pas un patch local: le dispatcher defense n'est pas appele sur ce tour; renforcer son prompt ne peut pas corriger un bypass amont.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le tour 1 respecte enfin le rythme attendu: pas de restitution immediate, Sophia demande un enrichissement utile.
- La revision du tour 3 est prise naturellement et remplace bien le champ principal.
- L'apply attempt du tour 5 est sain cote produit: pas de creation pretendue, pas de mutation, chemin plateforme fourni.

**Problemes**
- Tour 2: l'action concrete donnee par le user est perdue dans le premier handoff. Famille: `BF-STATE-01`. Impact: la carte conseillee devient moins fidele a l'intention utilisateur. Severite: yellow.
- Tour 4: reponse trop longue pour une simple question de destination. Famille: `BF-STATE-03`. Impact: friction UX faible a moyenne. Severite: yellow.
- Tour 6: experience visible acceptable, mais le systeme viole la doctrine d'ownership. Famille: `BF-ROUTE-02`. Impact: risque fort de comportements incoherents sur d'autres exits. Severite: red systeme.

**Fix propose**
- Source amont: `prepare_defense_card` reducer pour le hint d'action, visible prompt `destination_short`, routeur active flow pour l'exit.
- Correction recommandee: assouplir la transition valide de `defense_response_hint_state`, reduire le prompt `destination_short`, puis corriger l'ownership actif pour que `prepare_defense_card.local_dispatcher` produise toujours `exit_to_global_dispatcher` avant tout passage global.
- Tests d'invariant attendus: hint d'action conserve au premier handoff; destination follow-up court; active defense + demande explicite attaque -> appel defense local `exit_to_global_dispatcher`, puis seulement global -> attack.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: entree globale correcte vers `prepare_defense_card`.
- T2-T5: flow actif correctement route vers `prepare_defense_card`; `global_dispatcher` bloque dans les traces.
- T6: violation. L'etat actif defense est detecte dans `read_active_flow_state`, mais disparait avant `before_run_conversation_routers`; le global route directement vers `prepare_attack_card`.

**Skills / Operations / Tools**
- `prepare_defense_card` local dispatcher + visible agent restent a deux appels IA sur les tours actifs normaux observes.
- Aucun renderer legacy visible n'a ete observe dans les traces courtes.
- `prepare_attack_card` est lance au tour 6, mais par le mauvais chemin de transition.

**Memory / Effets durables**
- Aucun writer `user_defense_cards` appele.
- `user_defense_cards` post-run: `0` ligne pour la connexion QA.
- Aucun `committed_effect`.
- `apply_attempt` bloque correctement `create_defense_card` avec `chat_creation_disabled_platform_handoff`.
- Cleanup cible effectue.

**Observabilite**
- Les traces exposent bien `state_mutation_audit`, `blocked_effects`, `blocked_paths`, `active_flow_arbitration` et `active_flow_debug`.
- L'observabilite a permis d'isoler le point exact du tour 6: perte d'active flow entre `read_active_flow_state` et `before_run_conversation_routers`.

**Commandes lancees**
- `supabase status --output json`
- `bash scripts/qa-create-run-connection.sh qa-skill prepare_defense state_merge_r1`
- `cp tests/real-personas/qa-skill/connections/prepare_defense_state_merge_r1.json tests/real-personas/qa-skill/connection.json`
- `QA_PERSONA=qa-skill QA_DATE=2026-06-15 QA_RUN_ID=state-merge-r1 QA_TURN=1 QA_CONTENT="..." node scripts/qa_prepare_defense_turn.mjs`
- `QA_PERSONA=qa-skill QA_DATE=2026-06-15 QA_RUN_ID=state-merge-r1 QA_TURN=2 QA_CONTENT="..." node scripts/qa_prepare_defense_turn.mjs`
- `QA_PERSONA=qa-skill QA_DATE=2026-06-15 QA_RUN_ID=state-merge-r1 QA_TURN=3 QA_CONTENT="..." node scripts/qa_prepare_defense_turn.mjs`
- `QA_PERSONA=qa-skill QA_DATE=2026-06-15 QA_RUN_ID=state-merge-r1 QA_TURN=4 QA_CONTENT="..." node scripts/qa_prepare_defense_turn.mjs`
- `QA_PERSONA=qa-skill QA_DATE=2026-06-15 QA_RUN_ID=state-merge-r1 QA_TURN=5 QA_CONTENT="..." node scripts/qa_prepare_defense_turn.mjs`
- `QA_PERSONA=qa-skill QA_DATE=2026-06-15 QA_RUN_ID=state-merge-r1 QA_TURN=6 QA_CONTENT="..." node scripts/qa_prepare_defense_turn.mjs`
- `bash scripts/qa-cleanup-run-connection.sh qa-skill prepare_defense_state_merge_r1`
- `rm -f tests/real-personas/qa-skill/connection.json`

**Fix propose**
- Priorite 1: corriger l'ownership actif T6 avant de considerer le flow conforme.
- Priorite 2: corriger la transition reducer qui rejette `defense_response_hint_state` au T2.
- Priorite 3: resserrer le prompt visible `destination_short`.

## Verdict Global

**RED.** Le coeur defense progresse mieux qu'avant: rythme T1 correct, revision OK, apply non mutant OK. Mais le run n'est pas deploy-safe: le tour 6 prouve encore qu'un flow actif `prepare_defense_card` peut etre contourne sans `exit_to_global_dispatcher` local.
