# QA Run - prepare_defense_card Local Doctrine R9b

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `prepare-defense-local-doctrine-r9b`
- Persona: `alex`
- Objectif: verifier en IA reelle locale les corrections recentes sur `prepare_defense_card`: rythme premier tour, handoff non-mutant, apply attempt, destination followup, puis sortie propre vers `prepare_attack_card`.
- Trajectoire: entree directe defense -> enrichissement -> proposition -> handoff -> apply attempt -> destination followup -> demande explicite de carte d'attaque.
- Surfaces visees: dispatcher global d'entree, `prepare_defense_card.local_dispatcher`, reducer local, visible agent local, active handoff state, active flow arbitration, transition vers dispatcher global, `prepare_attack_card`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runner QA local, execution hors sandbox, aucun fallback deterministe, aucun staging/deploy.
- Validite QA: valide pour `r9b`. Une tentative precedente `r9` a eu un incident technique T1 (`HTTP 409`, `prepare_defense_card_local_dispatcher_failed`, `missing_platform_handoff_contract`, pas de reponse assistant) et n'est pas utilisee pour le verdict conversationnel.
- Artefacts:
  - Raw: `tests/real-personas/alex/runs/operations/2026-06-13-prepare-defense-prepare-defense-local-doctrine-r9b.raw.json`
  - Summary: `tests/real-personas/alex/runs/operations/2026-06-13-prepare-defense-prepare-defense-local-doctrine-r9b.summary.json`
  - Durable: `tests/real-personas/alex/runs/operations/2026-06-13-prepare-defense-prepare-defense-local-doctrine-r9b.durable.json`
  - Incident raw: `tests/real-personas/alex/runs/operations/2026-06-13-prepare-defense-prepare-defense-local-doctrine-r9.raw.json`
  - Cleanup: `tests/real-personas/alex/runs/operations/2026-06-13-prepare-defense-prepare-defense-local-doctrine-r9-r9b.cleanup.json`
  - Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-13-prepare-defense-local-doctrine-r9b-bugs.md`
- Nettoyage: cleanup cible effectue sur les scopes `qa-prepare-defense-card-alex-2026-06-13-prepare-defense-local-doctrine-r9` et `qa-prepare-defense-card-alex-2026-06-13-prepare-defense-local-doctrine-r9b`. Apres cleanup: `chat_messages=0`, `user_chat_states=0` pour les deux scopes. Durable avant cleanup: `user_defense_cards=[]`.
- Correction d'analyse post-rapport: la trace finale `conversation_turn_trace` ne montrait que le runtime final `prepare_attack_card`, mais les tables locales `llm_usage_events` / `llm_raw_response_events` prouvent que `prepare_defense_card.local_dispatcher` a bien ete appele au T6 avant le dispatcher global et a retourne `exit_to_global_dispatcher`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'aimerais une carte de defense pour les soirs ou j'arrive chez moi epuise, et ou la premiere impulsion c'est d'ouvrir une appli de livraison plutot que de me preparer a manger.

**Sophia**
> C'est un moment ou l'automatisme est souvent plus fort que la volonte. Qu'est-ce que tu aimerais que ta defense t'aide a interrompre ou a preserver en priorite quand tu rentres epuise ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- safety: `risk_score=2`, `risk_band=none`
- direct_effects: `[]`
- operation: `prepare_defense_card`
- pending_confirmation: `false`
- executed_tools: `[]`
- durable_effect: aucun
- trace utile: `prepare_defense_card.local_flow` consomme la `note_information` du dispatcher global; `flow_action=answer_current_field`; `visible_task_kind=ask_defense_goal_or_response`; `support_need_status=missing`; `handoff_ready=false`; `ai_call_count=2`.

### Tour 2

**Verdict du tour:** green

**User**
> Je veux surtout interrompre le reflexe d'ouvrir l'appli avant meme d'avoir reflechi, et preserver le fait de manger quelque chose de correct sans partir dans une commande automatique.

**Sophia**
> Pour t'aider a briser ce reflexe, est-ce que cette formulation te semble juste : « quand je rentre epuise le soir et que j'ai le reflexe d'ouvrir une appli de livraison avant meme d'avoir reflechi » ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: `risk_band=none`
- direct_effects: `[]`
- operation: `prepare_defense_card`
- pending_confirmation: `false`
- executed_tools: `[]`
- durable_effect: aucun
- trace utile: global dispatcher non appele; `support_need_status=proposed`; `visible_task_kind=confirm_support_need_proposal`; `tool_execution=blocked`.

### Tour 3

**Verdict du tour:** green

**User**
> Oui, c'est exactement ca. Garde cette formulation.

**Sophia**
> Parfait. Tu peux maintenant ajouter cette carte de defense dans Ressources / Defense / Cartes de defense libres. Pour le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?, tu peux recopier cette formulation : quand je rentre epuise le soir et que j'ai le reflexe d'ouvrir une appli de livraison avant meme d'avoir reflechi. La carte n'est pas creee automatiquement depuis notre echange, il te suffit de l'ajouter manuellement dans l'application.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: `risk_band=none`
- direct_effects: `[]`
- operation: `prepare_defense_card`
- pending_confirmation: `false`
- executed_tools: `[]`
- durable_effect: aucun
- trace utile: `support_need_status=locked`; `visible_task_kind=handoff_ready`; `tool_execution=platform_handoff`; aucun writer appele.

### Tour 4

**Verdict du tour:** green

**User**
> Ok, cree-la directement alors.

**Sophia**
> Je n'ai pas la main pour creer la carte directement depuis notre echange, mais tu peux l'ajouter toi-meme dans Ressources / Defense / Cartes de defense libres. Voici la formulation a utiliser pour le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : quand je rentre epuise le soir et que j'ai le reflexe d'ouvrir une appli de livraison avant meme d'avoir reflechi.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- direct_effects: `[]`
- operation: `prepare_defense_card`
- pending_confirmation: `false`
- executed_tools: `[]`
- durable_effect: aucune carte creee
- trace utile: apply attempt gere par le flow local defense; pas de mutation, pas de pending confirmation.

### Tour 5

**Verdict du tour:** green

**User**
> Et je la mets ou dans l'app deja ?

**Sophia**
> C'est dans Ressources / Defense / Cartes de defense libres. Pour le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?, tu peux recopier : quand je rentre epuise le soir et que j'ai le reflexe d'ouvrir une appli de livraison avant meme d'avoir reflechi

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- direct_effects: `[]`
- operation: `prepare_defense_card`
- pending_confirmation: `false`
- executed_tools: `[]`
- durable_effect: aucun
- trace utile: `visible_task_kind=destination_short`; reponse courte; global dispatcher non appele.

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou observabilite incomplete

**User**
> En fait je change : j'ai plutot besoin d'une carte d'attaque pour commencer mon dossier CAF demain matin.

**Sophia**
> On se concentre sur le fait de commencer ton dossier CAF demain matin pour cette carte d'attaque ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `risk_score=2`, `risk_band=none`
- direct_effects: `[]`
- operation: `prepare_attack_card`
- pending_confirmation: `false`
- executed_tools: `[]`
- durable_effect: aucune carte creee
- trace utile: a `read_active_flow_state`, `active_tool_skill_id=prepare_defense_card` et les cles `__active_defense_card_handoff` / `__active_tool_skill_intake` existent; a `before_run_conversation_routers`, ces cles ont disparu parce que le local dispatcher defense a sorti le flow. Les tables `llm_usage_events` / `llm_raw_response_events` montrent la sequence IA reelle: `prepare_defense_card.local_dispatcher` -> `dispatcher-v2-llm` -> `prepare_attack_card.local_dispatcher` -> visible attaque.
- preuve brute complementaire: `prepare_defense_card.local_dispatcher` retourne `flow_action=exit_to_global_dispatcher`, `note_information.source_flow_id=prepare_defense_card`, `target_dispatcher=global`, `recommended_next_focus=prepare_attack_card`.

**Analyse si yellow/red**
- Symptome: la reponse visible et le chemin IA sont corrects, mais le `conversation_turn_trace` final donne l'impression d'un `no_active_flow` direct car il ne conserve pas la chaine intermediaire de sortie locale.
- Source amont probable: observabilite du turn trace / projection du runtime final. Le runtime final ecrase l'etape locale defense dans la vue courte.
- Owner runtime: trace/reporting autour de `router/run.ts` et `handleOperationRuntimeResponse`.
- Meilleure correction selon les guidelines: ajouter une trace compacte de transition multi-owner dans la reponse finale: active owner initial, local exit action, note_information source/target, global reroute, target local dispatcher.
- Pourquoi ce n'est pas un patch local: le flow est correct; c'est la trace finale qui perd la preuve.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le tour 1 ne restitue plus le champ plateforme ni la destination. Il lance une vraie passe d'enrichissement.
- La proposition arrive au tour 2, apres une reponse utilisateur utile.
- Le handoff du tour 3 est clair: destination, champ exact, valeur, et absence de creation automatique.
- L'apply attempt est correctement refuse sans mutation.
- Le followup destination est court et exploitable.
- La transition visible vers attaque au tour 6 est comprehensible pour l'utilisateur.

**Problemes**
- Aucun probleme UX bloquant observe. Le seul warning est l'observabilite du tour 6: la trace courte finale peut faire croire a un contournement du flow actif.

**Fix propose**
- Source amont: trace finale multi-owner.
- Correction recommandee: exposer la chaine `prepare_defense_card.local_dispatcher -> exit_to_global_dispatcher -> dispatcher-v2-llm -> prepare_attack_card`.
- Tests d'invariant attendus: defense active + demande explicite d'un autre tool -> trace finale contient la transition locale et la `note_information` source defense.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1: entree correcte via dispatcher global vers `prepare_defense_card`, avec `note_information`.
- T2-T5: flow actif respecte; `route_reason=active_prepare_defense_card_local_dispatcher`; global dispatcher non appele.
- T6: conforme cote routing reel apres verification des traces LLM brutes. L'etat actif defense est present a `read_active_flow_state`, puis absent avant `before_run_conversation_routers` parce que `prepare_defense_card.local_dispatcher` a retourne `exit_to_global_dispatcher`. Le global dispatcher reprend ensuite et route vers `prepare_attack_card`.

**Skills / Operations / Tools**
- `prepare_defense_card.local_dispatcher` tourne normalement T1-T6.
- T6: ordre observe dans `llm_usage_events`: `prepare_defense_card.local_dispatcher`, puis `dispatcher-v2-llm`, puis `prepare_attack_card.local_dispatcher`, puis `prepare_attack_card.visible.confirm_target_candidate`.
- Aucun writer `user_defense_cards`, aucun executor de creation, aucun pending confirmation.

**Memory / Effets durables**
- Durable avant cleanup: `user_defense_cards=[]`, `user_plan_items=[]`.
- Cleanup cible: `r9` et `r9b` supprimes uniquement par scope QA dans `chat_messages` et `user_chat_states`; apres cleanup, les deux scopes sont a `0`.

**Problemes**
- T6: observabilite incomplete. Famille: BF-TEST-01. Impact systeme: la trace courte finale affiche `route_reason=tool_skill_intent_start` / `no_active_flow`, ce qui masque la sortie locale defense pourtant reelle.

**Fix propose**
- Source amont: `router/run.ts` / `conversation_turn_trace` final.
- Correction recommandee: garder un `transition_chain` ou `owner_handoff_trace` dans la reponse finale quand un tour contient plusieurs owners. Inclure au minimum: `initial_active_owner=prepare_defense_card`, `local_exit_flow_action=exit_to_global_dispatcher`, `note_information.source_flow_id=prepare_defense_card`, `target_dispatcher=global`, `global_selected_handler=prepare_attack_card`.
- Tests requis: integration `processMessage` reproduisant T6; assertion trace finale: la chaine locale defense -> global -> attaque est visible sans devoir lire `llm_raw_response_events`.

## Verdict Global

**yellow** cote systeme, **green** cote fluidite. Le fix rythme premier tour est valide. Le passage defense -> global -> attaque est conforme en traces LLM brutes; il reste a rendre cette transition visible dans le `conversation_turn_trace` final.
