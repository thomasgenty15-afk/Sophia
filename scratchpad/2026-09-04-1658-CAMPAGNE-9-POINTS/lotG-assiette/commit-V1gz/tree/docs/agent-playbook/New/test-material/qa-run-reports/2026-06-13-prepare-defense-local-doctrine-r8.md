# QA Run - prepare_defense_card Local Doctrine R8

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `prepare-defense-local-doctrine-r8`
- Persona: `alex`
- Objectif: verifier en IA reelle locale les fixes recents sur `prepare_defense_card`: rythme premier tour, handoff non-mutant, apply attempt, destination followup, puis sortie propre vers carte d'attaque.
- Trajectoire: entree directe defense -> enrichissement -> handoff -> confirmation -> apply attempt -> destination followup -> demande explicite de `prepare_attack_card`.
- Surfaces visees: dispatcher global d'entree, `prepare_defense_card.local_dispatcher`, reducer local, visible agent local, active handoff state, handoff arbitration, transition vers dispatcher global, `prepare_attack_card`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runner `scripts/qa_prepare_defense_turn.mjs`, execution hors sandbox, aucun fallback deterministe, aucun staging/deploy.
- Validite QA: valide. Le worker boote, les 6 tours retournent HTTP 200 et les reponses viennent du chemin IA reel Sophia.
- Artefacts:
  - Raw: `tests/real-personas/alex/runs/operations/2026-06-13-prepare-defense-prepare-defense-local-doctrine-r8.raw.json`
  - Summary: `tests/real-personas/alex/runs/operations/2026-06-13-prepare-defense-prepare-defense-local-doctrine-r8.summary.json`
  - Durable: `tests/real-personas/alex/runs/operations/2026-06-13-prepare-defense-prepare-defense-local-doctrine-r8.durable.json`
  - Cleanup: `tests/real-personas/alex/runs/operations/2026-06-13-prepare-defense-prepare-defense-local-doctrine-r8.cleanup.json`
  - Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-13-prepare-defense-local-doctrine-r8-bugs.md`
- Nettoyage: cleanup cible effectue sur le scope `qa-prepare-defense-card-alex-2026-06-13-prepare-defense-local-doctrine-r8`. Avant: `chat_messages=12`, `user_chat_states=1`, `user_defense_cards=0`. Apres: `chat_messages=0`, `user_chat_states=0`, `user_defense_cards=0`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> J’aimerais préparer une carte de défense pour les soirs où je rentre vidé, que je n’ai plus de filtre, et que je finis par commander n’importe quoi au lieu de me faire un vrai repas.

**Sophia**
> C'est un moment classique où la fatigue prend le dessus sur tes intentions. Pour ton champ **Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?**, tu peux utiliser cette formulation : *Les soirs où je rentre vidé et sans filtre, pour éviter de commander n'importe quoi et réussir à me faire un vrai repas.* Pour ta carte dans tes **Cartes de défense** (situées dans Ressources / Défense / Cartes de défense libres), quelle action simple pourrais-tu faire dès ton arrivée pour éviter d'ouvrir une application de livraison ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- safety: `risk_score=2`, `risk_band=none`
- direct_effects: `[]`
- operation: `prepare_defense_card`
- pending_confirmation: `false`
- memory_plan: non pertinent
- executed_tools: `[]`
- durable_effect: aucun
- trace utile: `prepare_defense_card.local_flow` appelle bien le dispatcher local; `visible_task_kind` dispatcher=`ask_trigger_or_signal`, reducer=`ask_defense_goal_or_response`, `support_need_status=proposed`, `handoff_ready=false`, `ai_call_count=2`.

**Analyse si yellow/red**
- Symptome: le premier tour expose deja le champ plateforme, une formulation a copier et la destination produit. C'est exactement le rythme trop rapide signale avant le patch.
- Source amont probable: reducer/conversation_context du premier tour. Le reducer bloque le handoff, mais laisse assez de contexte plateforme pour que le visible agent parle deja du champ et de la destination.
- Owner runtime: `prepare_defense_card.local_flow` / visible context stage-specific.
- Meilleure correction selon les guidelines: sur le premier tour d'enrichissement, filtrer `support_need.candidate_value`, destination et label plateforme hors `visible_task.conversation_context`, et ajouter un invariant stage-specific interdisant tout wording de handoff pendant `ask_trigger_or_signal`, `ask_defense_goal_or_response` ou `ask_risk_situation`.
- Pourquoi ce n'est pas un patch local: le probleme vient de la frontiere reducer -> visible context. Changer une phrase du prompt ne garantit pas que le visible agent ne repetera pas le champ si le contexte le lui donne.

### Tour 2

**Verdict du tour:** green

**User**
> Le signal, c’est vraiment quand je pose mon sac et que je me dis que je suis trop fatigué pour réfléchir. Je veux surtout éviter d’ouvrir l’appli de livraison par automatisme.

**Sophia**
> C'est un signal très précis : ce moment où tu poses ton sac et où la fatigue court-circuite ta réflexion. Pour construire ta carte de défense, voici la synthèse que tu peux copier dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? :
>
> "Les soirs où je rentre vidé et sans filtre, pour éviter de commander n'importe quoi et réussir à me faire un vrai repas."
>
> Tu peux maintenant te rendre dans Ressources / Défense / Cartes de défense libres pour créer ta carte (elle ne se crée pas automatiquement depuis notre discussion). Est-ce que cette description te semble fidèle à ce que tu ressens ?

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
- trace utile: global dispatcher bloque par `active_prepare_defense_card_uses_local_dispatcher`; `tool_execution=platform_handoff`; no chat mutation.

### Tour 3

**Verdict du tour:** green

**User**
> Oui, cette formulation me va.

**Sophia**
> C'est parfait. Pour finaliser ta démarche, tu peux maintenant te rendre dans Ressources / Défense / Cartes de défense libres. En choisissant d'ajouter une carte, il te suffira de recopier cette phrase dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : Les soirs où je rentre vidé et sans filtre, pour éviter de commander n'importe quoi et réussir à me faire un vrai repas. Pense bien à faire cette étape manuellement, car la carte n'est pas créée automatiquement depuis notre échange.

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

### Tour 4

**Verdict du tour:** green

**User**
> Ok vas-y crée-la maintenant.

**Sophia**
> Je n'ai pas la main pour créer la carte directement d'ici, mais voici comment faire. Rends-toi dans Ressources / Défense / Cartes de défense libres et choisis Ajouter une carte. Pour le champ « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? », tu n'as plus qu'à recopier cette phrase : Les soirs où je rentre vidé et sans filtre, pour éviter de commander n'importe quoi et réussir à me faire un vrai repas.

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

### Tour 5

**Verdict du tour:** green

**User**
> Je la mets où exactement déjà ?

**Sophia**
> Tu peux la placer dans Ressources / Défense / Cartes de défense libres. Dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?, tu n'as plus qu'à recopier : Les soirs où je rentre vidé et sans filtre, pour éviter de commander n'importe quoi et réussir à me faire un vrai repas.

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

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention / active flow policy contourne le flow actif

**User**
> En fait je change : j’ai plutôt besoin d’une carte d’attaque pour me lancer demain matin sur mon dossier CAF.

**Sophia**
> On change de stratégie pour s'attaquer à ce dossier CAF dès demain matin. Qu'est-ce qui, d'habitude, te fait le plus hésiter ou dérailler au moment de commencer ce genre de paperasse ?

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
- trace utile: a `read_active_flow_state`, `active_tool_skill_id=prepare_defense_card` et `flow_keys=[__active_defense_card_handoff,__active_tool_skill_intake,...]`; a `before_run_conversation_routers`, ces cles ont disparu; `active_flow_arbitration.reason_code=no_active_flow`; aucun event `prepare_defense_card.local_dispatcher decision exit_to_global_dispatcher`.

**Analyse si yellow/red**
- Symptome: la reponse visible est bonne pour l'utilisateur, mais le chemin systeme ne respecte pas la doctrine. `prepare_attack_card` demarre directement comme si aucun flow defense n'etait actif.
- Source amont probable: active flow lifecycle dans `router/run.ts` avant les conversation routers. L'etat `prepare_defense_card` est lu, puis nettoye avant que le dispatcher local puisse produire `exit_to_global_dispatcher`.
- Owner runtime: active flow state / routing orchestration.
- Meilleure correction selon les guidelines: quand `active_tool_skill_id=prepare_defense_card` est observe a `read_active_flow_state`, court-circuiter les routers globaux et appeler le local runtime defense avant toute mutation/clear de l'etat actif. Le clear ne doit venir que de la sortie structuree locale.
- Pourquoi ce n'est pas un patch local: le prompt defense ne peut pas aider si le dispatcher local n'est pas appele. Il faut un invariant runtime autour de l'ownership actif.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia comprend correctement le besoin defense.
- Les tours 2 a 5 sont globalement naturels, non-mutants, et utiles.
- L'apply attempt est bien refuse sans claim de creation.
- La destination followup est courte et exploitable.
- Le passage visible vers attaque au tour 6 est fluide pour l'utilisateur.

**Problemes**
- Tour 1: trop rapide. Sophia donne deja la formulation plateforme et la destination avant une vraie passe d'echange. Famille: BF-STATE-01. Impact: experience trop mecanique et pas assez accompagnee. Severite: red pour le flow attendu.
- Tour 1: la question finale demande une "action simple", ce qui peut rigidifier la defense en plan d'action. Impact: derive legere vers conseil/action plutot que clarification du moment de risque.

**Fix propose**
- Source amont: `prepare_defense_card` reducer / `visible_task.conversation_context`.
- Correction recommandee: masquer les donnees de handoff et le champ plateforme pendant les stages d'enrichissement du premier tour; le visible agent doit recevoir uniquement le risque, le trigger, le contexte, et une question courte.
- Tests d'invariant attendus: premier tour riche defense -> pas de label plateforme, pas de destination, pas de "recopier", pas de "champ", pas de formulation finale; seulement une question d'enrichissement.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: entree correcte via dispatcher global vers `prepare_defense_card`.
- T2-T5: flow actif respecte; `global_dispatcher` bloque par `active_prepare_defense_card_uses_local_dispatcher`.
- T6: echec doctrine. Le flow actif est detecte puis perdu avant arbitration finale; route directe vers `prepare_attack_card` avec `no_active_flow`, sans `exit_to_global_dispatcher` local defense.

**Skills / Operations / Tools**
- `prepare_defense_card.local_dispatcher` tourne normalement T1-T5.
- `prepare_attack_card` tourne au T6, mais sans preuve de sortie propre depuis defense.
- Aucun writer `user_defense_cards`, aucun executor de creation, aucun pending confirmation.

**Memory / Effets durables**
- Pas d'effet durable carte.
- Cleanup cible effectue: `chat_messages=0`, `user_chat_states=0`, `user_defense_cards=0` apres run.

**Problemes**
- T1: rythme premier tour non respecte. Famille: BF-STATE-01. Impact systeme: le reducer empeche le handoff mais le visible context expose quand meme les donnees de handoff. Severite: red pour l'objectif teste.
- T6: active flow perdu avant local exit. Famille: BF-ROUTE-02. Impact systeme: la doctrine "local dispatcher owns active flow" n'est pas garantie dans `processMessage`. Severite: red.

**Fix propose**
- Source amont T1: `prepare_defense_card.local_flow` conversation context + visible guard stage-specific.
- Correction recommandee T1: pour le premier tour, ne pas transmettre `support_need.candidate_value`, destination, platform field label ou platform steps au prompt visible d'enrichissement; si le visible stage est enrichissement, rejeter toute reponse qui expose le handoff.
- Source amont T6: `router/run.ts` / active flow lifecycle.
- Correction recommandee T6: traiter `activeLocalFlowOperationType === prepare_defense_card` immediatement apres `readActiveFlowState`, avant tout clear/suspension/reconciliation qui peut supprimer `__active_defense_card_handoff`; ajouter un test integration `processMessage` qui reproduit T6.
- Tests d'invariant attendus:
  - active defense + demande attaque -> trace `prepare_defense_card.local_dispatcher decision exit_to_global_dispatcher`;
  - puis global dispatcher route vers `prepare_attack_card`;
  - jamais `route_reason=tool_skill_intent_start` avec `active_flow_arbitration=no_active_flow` si `read_active_flow_state` avait `active_tool_skill_id=prepare_defense_card`;
  - premier tour defense riche -> enrichissement uniquement, pas de handoff visible.

## Verdict Global

Red. Le worker refonctionne et les tours defense non-mutants sont bons, mais les deux criteres critiques demandes ne sont pas encore valides: rythme premier tour et exit propre defense -> global -> attaque.
