# Implementation Agent Prompt - flow_opportunity_verification

```txt
Mission : implementer `flow_opportunity_verification`, un flow local de
verification d'opportunities, avec dispatcher local, ancre de confirmation,
appel inline a `product_help`, lancement du flow cible, et sortie explicite vers
le dispatcher global.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Document source principal a respecter :

/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/conversation-skills/flow-opportunity-verification-prompts.md

Docs a lire avant de coder :

1. Architecture globale runtime :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/01-global-runtime.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/02-run-thin-orchestrator.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/03-user-turn-snapshot.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/05-effect-ledger.md

2. Conversation skills concernes :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/conversation-skills/flow-opportunity-verification-prompts.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/conversation-skills/status-recap.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/conversation-skills/emotional-repair.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/conversation-skills/demotivation-repair.md

3. Tool flows qui peuvent etre target_flow :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/update-coach-preferences.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/prepare-attack-card.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/prepare-defense-card.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/select-state-potion.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/one-shot-reminder.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/create-recurring-reminder.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/adjust-plan-item.md

4. Patterns locaux deja existants :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/conversation-skills/status-recap-local-dispatcher-implementation-agent-prompt.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/morning-nudge-v2-local-flow-architecture.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/post-morning-nudge-action-implementation-agent-prompt.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/prepare-attack-card-local-dispatcher-prompts.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/prepare-defense-card-local-dispatcher-prompts.md

Code a inspecter avant de coder :

- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/router/run.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/router/local_reducer.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/router/turn_intent_arbitrator.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/router/user_turn_snapshot.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/router/recommendation_runtime_support.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/router/handoff_flow_arbitration.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/dispatcher/active_skill_descriptions.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/context/types.ts
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/skills/product_help/
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/skills/status_recap/
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/skills/emotional_repair/
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/skills/demotivation_repair/
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/tools/operations/update_coach_preferences/
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/tools/operations/prepare_attack_card/
- /Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/tools/operations/prepare_defense_card/

Objectif

Aujourd'hui, les "opportunities" sont traitees comme des suggestions ou des
add-ons et restent liees historiquement a `flow_opportunity`. Le nouveau
comportement attendu est plus large : les opportunities doivent devenir des
`flow_opportunities`, parce qu'elles concernent aussi des conversation skills
comme `status_recap`, `emotional_repair` et `demotivation_repair`.

Le flow cible :

```txt
message user
-> dispatcher global
-> si demande explicite : direct_skill / direct tool flow / product_help / status_recap
-> sinon si opportunite implicite : pick top flow_opportunity
-> creation etat local flow_opportunity_verification
-> dispatcher local flow_opportunity_verification
-> prompt visible d'offre
-> user followup
-> dispatcher global SKIPPED tant que flow actif
-> dispatcher local flow_opportunity_verification
-> eventuellement appel inline product_help
-> retour au flow local avec confirmation_anchor conservee
-> si acceptation : launch target_flow avec target_context
-> si refus/cancel : close
-> si topic change/safety/unsupported : sortie explicite avec exit_memo
```

Regle critique :

Pendant un flow actif `flow_opportunity_verification`, le dispatcher global ne
doit pas fonctionner. Il ne reprend la main que si le dispatcher local retourne
explicitement `exit_to_global_dispatcher`.

Distinction obligatoire :

```txt
"Elle dit quoi ma carte d'attaque ?"
-> demande explicite de status
-> direct status_recap
-> pas opportunity

"Je sais plus ce qu'il y a dans ma carte d'attaque"
-> besoin implicite de status
-> flow_opportunity status_recap
-> proposition de recap

"C'est quoi une carte d'attaque ?"
-> demande explicite d'explication produit
-> direct product_help si aucun flow opportunity actif
-> call product_help inline si flow opportunity actif

"Prepare-moi une carte d'attaque"
-> demande explicite tool
-> direct prepare_attack_card
-> pas opportunity
```

Contraintes absolues

Ne pas faire :

- regex metier ;
- `message.includes(...)` metier ;
- classifier durable/status/help/tool par TypeScript lexical ;
- renderer visible deterministe dans le chemin nominal opportunity ;
- prompt visible qui decide le flow ;
- reducer qui interprete le message user ;
- second decideur cache ;
- modele additionnel non declare ;
- global dispatcher pendant flow actif ;
- pending confirmation token legacy ;
- confirmation executable legacy ;
- claim visible de lancement ou mutation sans flow cible reel ;
- write DB depuis `flow_opportunity_verification` ;
- convertir `product_help` en owner final ;
- perdre `target_flow`, `target_context` ou `confirmation_anchor` apres une explication produit ;
- repicker toutes les opportunities dans le dispatcher local.

Ne pas lancer :

- `supabase db reset`
- commande destructive Supabase non demandee explicitement.

Decision model policy

Les decideurs autorises sont :

1. Dispatcher global structure :
   - detecte demande explicite vs opportunity implicite ;
   - selectionne la top `flow_opportunity` ;
   - fournit `opportunity_id`, `target_flow`, `seed_context`, `reason`,
     `evidence`.

2. Dispatcher local `flow_opportunity_verification` :
   - gere accept/refuse/explain/revise/direct_command/topic_change/safety ;
   - garde l'ancre ;
   - ne repick pas librement toutes les opportunities.

3. `product_help` intake :
   - explique le produit depuis son catalogue ;
   - ne choisit pas le flow final ;
   - ne lance rien.

4. Flow cible :
   - valide et execute son propre metier apres lancement.

Aucun autre modele ou fallback semantique ne doit etre ajoute sans contrat
explicite.

Scope recommande

Implementer une premiere version complete et testee pour :

- `status_recap` opportunity ;
- `update_coach_preferences` opportunity ;
- passage inline par `product_help` ;
- acceptation tardive apres plusieurs questions produit ;
- sortie explicite vers dispatcher global.

Brancher les autres target flows de facon structurelle si le code le permet,
mais ne pas refondre tous les flows metier dans cette mission.

Si un renommage complet de `flow_opportunity` vers `flow_opportunity`
est trop invasif, introduire un champ canonique `flow_opportunity` avec une
compatibilite temporaire pour les anciens champs. Documenter l'exception et
ajouter des tests de non-regression.

Etape 1 - Cartographier l'existant

Lire et documenter rapidement dans tes notes de travail :

- ou `flow_opportunity` est produit ;
- ou il est lu ;
- comment il devient une recommendation visible ;
- comment `product_help` est appele ;
- comment les active skill states sont stockes ;
- comment `status_recap` est arme aujourd'hui ;
- comment les flows locaux existants skip le dispatcher global ;
- quelles traces/logs existent deja.

Ne modifie pas encore le code tant que cette cartographie n'est pas claire.

Etape 2 - Ajouter / adapter le contrat de types

Creer les types de `flow_opportunity_verification` dans un emplacement coherent
avec les patterns existants, par exemple :

```txt
supabase/functions/sophia-brain/skills/flow_opportunity_verification/
  contract.ts
  prompt.ts
  reducer.ts
  visible_agent.ts
  runtime.ts
  state.ts
  tests.ts
```

Si le repo prefere un emplacement router/tool_skill_runtime pour les
opportunities, respecter le pattern local, mais garder le skill id :

```txt
flow_opportunity_verification
```

Enums minimum a implementer selon le doc source :

```txt
FlowOpportunityLocalAction =
  offer_opportunity
  accept_opportunity
  decline_opportunity
  get_info_product
  return_from_get_info_product
  repeat_offer
  revise_focus
  correct_target_flow
  launch_target_flow
  get_info_db
  direct_command_interrupt
  unsupported_request_inside_flow
  stale_or_already_answered
  cancel_flow
  exit_to_global_dispatcher
  safety_preempt

FlowOpportunityVisibleTaskKind =
  offer_status_recap
  offer_preference_update
  offer_emotional_repair
  offer_demotivation_repair
  offer_target_flow_generic
  reanchor_offer_after_product_help
  accept_and_launch_status_recap
  accept_and_launch_target_flow
  decline_ack
  repeat_offer
  revise_focus_question
  correct_target_flow_ack
  unsupported_inside_flow
  stale_or_already_answered
  cancel_or_exit
  handoff_to_global
  safety
  none
```

Contrat JSON local attendu :

```json
{
  "local_action": "offer_opportunity|accept_opportunity|decline_opportunity|get_info_product|return_from_get_info_product|repeat_offer|revise_focus|correct_target_flow|launch_target_flow|get_info_db|direct_command_interrupt|unsupported_request_inside_flow|stale_or_already_answered|cancel_flow|exit_to_global_dispatcher|safety_preempt",
  "confidence": "low|medium|high",
  "risk_score": 0,
  "opportunity": {
    "opportunity_id": "string",
    "target_flow": "status_recap|update_coach_preferences|emotional_repair|demotivation_repair|prepare_attack_card|prepare_defense_card|select_state_potion|one_shot_reminder|create_recurring_reminder|adjust_plan_item|unknown",
    "target_action": "string",
    "confirmation_anchor_still_valid": true,
    "reason": "string"
  },
  "target_flow_input": {
    "focus": ["string"],
    "surface": "string|null",
    "seed_context": {},
    "origin_evidence": ["string"]
  },
  "subskill_call": {
    "needed": false,
    "skill_id": "product_help|status_recap|null",
    "reason": "string|null",
    "context_for_subskill": {}
  },
  "visible_task": {
    "kind": "string",
    "instruction": "string"
  },
  "state_patch": {
    "status": "offered|explaining|waiting_confirmation|accepted|declined|launched|cancelled|exit|blocked",
    "target_flow": "string",
    "target_context": {},
    "confirmation_anchor": {},
    "subskill_history_append": {}
  },
  "exit_memo": {
    "needed": false,
    "reason": "topic_change|cancelled|direct_command_other_flow|unsupported|stale|safety|none",
    "flow_summary": "string|null",
    "original_opportunity_id": "string|null",
    "target_flow": "string|null",
    "target_context": {},
    "handoff_hint_for_global_dispatcher": "string|null",
    "same_user_message_should_be_reprocessed": false
  },
  "evidence": ["string"]
}
```

Etape 3 - Ajouter l'etat local

Ajouter un etat local tempMemory ou active_skill_state selon le pattern runtime :

```txt
__flow_opportunity_verification_state_v1
```

Structure :

```json
{
  "skill_id": "flow_opportunity_verification",
  "mode": "local_verification_flow",
  "status": "offered|explaining|waiting_confirmation|accepted|declined|launched|cancelled|exit|blocked",
  "opportunity_id": "status_recap.attack_card_uncertainty",
  "target_flow": "status_recap",
  "target_action": "run_status_recap",
  "target_context": {
    "focus": ["attack_card"],
    "surface": "attack_card"
  },
  "origin": {
    "user_message": "Je sais plus ce qu'il y a dans ma carte d'attaque",
    "evidence": ["je sais plus ce qu'il y a dans ma carte d'attaque"],
    "created_at": "iso"
  },
  "confirmation_anchor": {
    "meaning": "accept target_flow status_recap with focus attack_card",
    "target_flow": "status_recap",
    "target_context": {
      "focus": ["attack_card"]
    },
    "must_not_reinterpret_acceptance_as": [
      "product_help",
      "normal_reply",
      "prepare_attack_card"
    ]
  },
  "subskill_history": [],
  "recent_user_messages": [],
  "turn_count": 1,
  "max_turns": 6,
  "created_at": "iso",
  "updated_at": "iso"
}
```

Etat requis :

- conserve `target_flow` sur toute la duree du flow ;
- conserve `target_context` sur toute la duree du flow ;
- conserve `confirmation_anchor` apres chaque appel `product_help` ;
- garde `subskill_history` ;
- expire proprement apres `max_turns` ou stale context ;
- ne contient pas de pending executable legacy.

Etape 4 - Integrer le dispatcher global

Le dispatcher global doit distinguer :

1. Direct status :

```txt
"Tu peux me dire mes preferences coach actives ?"
"Elle dit quoi ma carte d'attaque ?"
"Quelles potions sont actives ?"
-> direct_skill status_recap
```

2. Direct product help :

```txt
"C'est quoi une carte d'attaque ?"
"A quoi sert une potion ?"
"Ou je retrouve mes cartes ?"
-> direct_skill product_help
```

3. Direct tool/action :

```txt
"Prepare-moi une carte d'attaque"
"Change mes preferences coach pour poser moins de questions"
"Active une potion de clarte"
-> flow/tool proprietaire direct
```

4. Opportunity implicite :

```txt
"Je sais plus ce que j'ai comme carte d'attaque"
-> flow_opportunity status_recap

"Tu me poses trop de questions"
-> flow_opportunity update_coach_preferences

"Je suis en train de decrocher"
-> flow_opportunity demotivation_repair
```

Le global doit produire au minimum :

```json
{
  "route_kind": "flow_opportunity",
  "direct_skill": null,
  "normal_reply_allowed": false,
  "flow_opportunity": {
    "opportunity_id": "string",
    "target_flow": "string",
    "confidence": "low|medium|high",
    "priority": 0,
    "reason": "string",
    "evidence": ["string"],
    "seed_context": {}
  },
  "exit_memo": null
}
```

Important :

- Le global pick la top opportunity. Il ne lance pas une clarification entre
  opportunities concurrentes.
- Si hesitation entre opportunities, choisir la plus probable. Le flow local de
  verification corrigera si le user refuse ou corrige.
- `status_recap` doit etre integre dans les opportunities quand la demande de
  statut est implicite, mais rester route directe quand la demande est explicite.
- `product_help` doit rester route directe quand le user demande une explication
  produit hors flow actif, et sub-skill inline quand un flow opportunity est
  actif.

Etape 5 - Suspendre le dispatcher global pendant flow actif

Ajouter le guard runtime :

```txt
if flow_opportunity_verification active:
  skip global dispatcher
  call local dispatcher
```

Logger :

```txt
flow_opportunity_verification.global_dispatcher_skipped_due_active_flow
```

Exception :

```txt
local_action = exit_to_global_dispatcher
```

Dans ce cas :

- clear ou memo l'etat local ;
- transmettre `exit_memo` ;
- si `same_user_message_should_be_reprocessed=true`, reprocess le meme message
  par le dispatcher global ;
- eviter une double reponse visible.

Etape 6 - Ajouter le prompt dispatcher local

Implementer le prompt du doc source :

/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/conversation-skills/flow-opportunity-verification-prompts.md

Le prompt doit recevoir :

- message user courant ;
- etat local actif ;
- payload initial du dispatcher global ;
- resume des 5 derniers messages user ;
- historique des appels sub-skill ;
- surfaces disponibles du flow cible ;
- contraintes safety/risk ;
- flows cibles supportes.

Le prompt retourne uniquement JSON strict.

Cas que le prompt doit distinguer :

- acceptation de l'offre ;
- refus ;
- demande d'explication produit ;
- retour apres explication produit ;
- repetition de l'offre ;
- revision du focus ;
- correction du target flow ;
- demande explicite de status pendant le flow ;
- commande explicite tool pendant le flow ;
- demande unsupported ;
- flow stale/deja servi ;
- cancel ;
- topic change ;
- safety.

Etape 7 - Reducer / validator

Le reducer doit :

- parser et valider le JSON local dispatcher ;
- valider enums ;
- bloquer si `confidence=low` pour `launch_target_flow`, sauf sortie/cancel ;
- bloquer si `risk_score` depasse le seuil safety ;
- exiger `opportunity_id`, `target_flow`, `target_context` et
  `confirmation_anchor` pour tout flow actif ;
- exiger `exit_memo` pour `exit_to_global_dispatcher`;
- exiger `subskill_call.skill_id="product_help"` pour `get_info_product`;
- exiger `subskill_call.skill_id="status_recap"` pour `get_info_db`;
- empecher `product_help` de devenir owner final ;
- empecher `status_recap` de devenir owner final pendant cet aller-retour ;
- conserver `confirmation_anchor` apres `get_info_product`;
- conserver `confirmation_anchor` apres `get_info_db`;
- incrementer `turn_count`;
- fermer proprement si max turns atteint ;
- ne jamais creer de `executedTools`;
- ne jamais creer de `committed_effects`;
- ne jamais ecrire en DB.

Checks deterministes autorises :

- validation contrat ;
- validation enum ;
- validation safety/risk ;
- validation max turns ;
- validation exit_memo ;
- validation target_flow supporte ;
- validation no mutation ;
- validation no duplicate/stale state ;
- validation que `confirmation_anchor` reste present.

Checks deterministes interdits :

- classifier le message user par regex ;
- mapper un texte user vers une opportunity ;
- mapper un "oui" par mots-cles hors decision dispatcher local ;
- choisir status vs product_help par string matching ;
- remplir des slots metier du flow cible.

Etape 8 - Appel inline a product_help

Quand le local dispatcher retourne :

```txt
local_action=get_info_product
subskill_call.needed=true
subskill_call.skill_id=product_help
```

Le runtime doit :

- appeler `product_help` avec le contexte inline ;
- passer `origin_flow=flow_opportunity_verification`;
- passer `opportunity_id`, `target_flow`, `target_context`,
  `confirmation_anchor`;
- passer la question produit user ;
- passer `preserve_active_flow=true`;
- rendre la reponse `product_help`;
- conserver l'etat local actif ;
- append `subskill_history`;
- revenir ensuite a `waiting_confirmation`.

Contexte minimal :

```json
{
  "origin_flow": "flow_opportunity_verification",
  "opportunity_id": "status_recap.attack_card_uncertainty",
  "target_flow": "status_recap",
  "target_context": {
    "focus": ["attack_card"],
    "surface": "attack_card"
  },
  "confirmation_anchor": {
    "meaning": "accept target_flow status_recap with focus attack_card"
  },
  "user_question": "C'est quoi une carte d'attaque ?",
  "recent_user_messages": [],
  "preserve_active_flow": true
}
```

Important :

- `product_help` ne doit pas lancer le flow cible.
- `product_help` ne doit pas convertir son bridge en effet.
- `product_help` ne doit pas clear l'etat local.
- Apres 4 questions produit, un "oui" doit encore accepter l'offre initiale.

Etape 9 - Lancer le flow cible

Quand le local dispatcher/reducer valide :

```txt
local_action=launch_target_flow
```

Le runtime doit lancer le flow cible avec `target_flow_input`.

Cas `status_recap` :

- appeler le runtime `status_recap` avec focus/target_context ;
- DB-grounded read-only ;
- `toolExecution="none"`;
- `executedTools=[]`;
- `committed_effects=[]`;
- `toolSkillRun.selected_handler="status_recap"`.

Cas `update_coach_preferences` :

- appeler le flow local `update_coach_preferences` avec seed context ;
- le flow cible reste proprietaire de la validation durable/support/value ;
- pas de write depuis `flow_opportunity_verification`;
- pas de claim visible de preference sauvegardee avant commit du flow cible.

Cas `emotional_repair` / `demotivation_repair` :

- passer le contexte d'origine ;
- le skill cible devient owner de la suite.

Cas tool platform handoff :

- ne pas inventer d'effet chat ;
- respecter les contrats existants du target flow.

Etape 10 - Prompts visibles

Brancher les visible prompts du doc source. Ils doivent etre stage-specific et
ne pas decider de flow :

1. `offer_status_recap`
2. `offer_preference_update`
3. `offer_emotional_repair`
4. `offer_demotivation_repair`
5. `offer_target_flow_generic`
6. `reanchor_offer_after_product_help`
7. `accept_and_launch_status_recap`
8. `accept_and_launch_target_flow`
9. `decline_ack`
10. `repeat_offer`
11. `revise_focus_question`
12. `correct_target_flow_ack`
13. `unsupported_inside_flow`
14. `stale_or_already_answered`
15. `cancel_or_exit`
16. `handoff_to_global`
17. `safety`
18. `none`

Contraintes visibles :

- Pas de template fixe deterministe.
- Pas de mapping metier.
- Pas de claim de succes durable.
- Pas de "j'ai lance / j'ai applique / c'est fait" sans lancement reel du flow
  cible ou commit du flow cible.
- `product_help` visible est rendu par `product_help`, pas par ces prompts.
- `handoff_to_global` peut etre invisible si le meme message est reprocess
  immediatement.

Etape 11 - Sorties vers dispatcher global

Implementer les sorties documentees :

- topic change ;
- direct command other flow ;
- cancelled ;
- unsupported ;
- stale ;
- safety.

Chaque sortie doit contenir :

```json
{
  "needed": true,
  "reason": "topic_change|cancelled|direct_command_other_flow|unsupported|stale|safety",
  "flow_summary": "string",
  "original_opportunity_id": "string",
  "target_flow": "string|null",
  "target_context": {},
  "handoff_hint_for_global_dispatcher": "string|null",
  "same_user_message_should_be_reprocessed": true
}
```

Si `same_user_message_should_be_reprocessed=true`, ne pas produire de reponse
finale intermediaire qui bloquerait le traitement du global.

Etape 12 - Logs / trace

Ajouter logs structures :

- `flow_opportunity_verification.global_opportunity_selected`
- `flow_opportunity_verification.local_state_created`
- `flow_opportunity_verification.global_dispatcher_skipped_due_active_flow`
- `flow_opportunity_verification.local_dispatcher_called`
- `flow_opportunity_verification.local_action`
- `flow_opportunity_verification.visible_task.kind`
- `flow_opportunity_verification.confirmation_anchor`
- `flow_opportunity_verification.get_info_product_called`
- `flow_opportunity_verification.get_info_product_returned_to_flow`
- `flow_opportunity_verification.get_info_db_called`
- `flow_opportunity_verification.get_info_db_returned_to_flow`
- `flow_opportunity_verification.target_flow_launched`
- `flow_opportunity_verification.exit_to_global_dispatcher`
- `flow_opportunity_verification.exit_memo`
- `flow_opportunity_verification.write_blocked_no_mutation_owner`

Trace QA attendue :

- un tour actif normal ne fait pas tourner le dispatcher global ;
- un appel `product_help` inline conserve l'etat actif ;
- un "oui" apres explications lance le bon `target_flow`;
- `status_recap` direct reste direct quand la demande est explicite ;
- `status_recap` opportunity propose quand la demande est implicite.

Etape 13 - Tests unitaires

Ajouter tests du dispatcher global / snapshot / agenda :

1. Direct status :
   - "Tu peux me dire mes preferences coach actives maintenant ?"
   - attendu : direct `status_recap`, pas opportunity.

2. Direct product help :
   - "C'est quoi une carte d'attaque ?"
   - attendu : direct `product_help`, pas opportunity.

3. Direct tool :
   - "Prepare-moi une carte d'attaque pour mes mails"
   - attendu : `prepare_attack_card`, pas opportunity.

4. Implicite status :
   - "Je sais plus ce qu'il y a dans ma carte d'attaque"
   - attendu : `flow_opportunity.status_recap.attack_card_uncertainty`.

5. Implicite preferences :
   - "Tu me poses trop de questions en ce moment"
   - attendu : `flow_opportunity.update_coach_preferences...`.

6. Implicite demotivation :
   - "Je suis en train de decrocher completement"
   - attendu : `flow_opportunity.demotivation_repair...`.

Ajouter tests du dispatcher local :

1. Initial opportunity -> `offer_status_recap`.
2. "C'est quoi une carte d'attaque ?" pendant flow actif -> `get_info_product`.
3. Apres product_help, state conserve `confirmation_anchor`.
4. "Et la difference avec la defense ?" -> `get_info_product`, meme anchor.
5. "Oui je veux bien" apres plusieurs product_help -> `launch_target_flow`
   vers `status_recap` focus `attack_card`.
6. "Non, ma carte de defense plutot" -> `revise_focus` focus `defense_card`.
7. "En fait cree-moi une carte d'attaque" -> direct command interrupt ou
   sortie structuree vers `prepare_attack_card`.
8. "Non laisse tomber" -> `decline_opportunity`, no target flow.
9. "Au fait aide-moi a revoir mon plan" -> `exit_to_global_dispatcher` avec
   memo.
10. Safety message -> `safety_preempt`.

Ajouter tests reducer/runtime :

1. Active flow skip global dispatcher.
2. `exit_to_global_dispatcher` reprocess le meme message si demande.
3. `get_info_product` ne clear pas le flow.
4. `product_help` ne produit aucun `executedTools`.
5. `launch_target_flow=status_recap` produit `toolSkillRun.selected_handler=status_recap`.
6. `launch_target_flow=update_coach_preferences` passe le seed context mais ne
   write pas depuis opportunity.
7. `confidence=low` bloque `launch_target_flow`.
8. `exit_memo` obligatoire pour sortie global.
9. `confirmation_anchor` obligatoire apres product_help.
10. Max turns ferme ou sort proprement.

Ajouter tests visibles :

1. `offer_status_recap` ne rend pas le recap.
2. `offer_preference_update` ne dit pas que la preference est modifiee.
3. `reanchor_offer_after_product_help` rappelle l'offre initiale.
4. `accept_and_launch_status_recap` ne rend pas le status lui-meme.
5. `decline_ack` ne relance pas une autre proposition.
6. `handoff_to_global` peut etre vide/invisible si reprocess immediat.
7. `safety` ne propose rien.

Etape 14 - Tests integration / QA

Rerun tests pertinents existants :

```txt
deno check supabase/functions/sophia-brain/index.ts \
  supabase/functions/sophia-brain/router/run.ts \
  supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts
```

Puis lancer les suites ciblees pertinentes selon les fichiers modifies :

```txt
deno test supabase/functions/sophia-brain/skills/status_recap/status_recap.test.ts
deno test supabase/functions/sophia-brain/skills/status_recap/status_recap_runtime_test.ts
deno test supabase/functions/sophia-brain/skills/skills_s3.test.ts
deno test supabase/functions/sophia-brain/router/local_reducer.test.ts
deno test supabase/functions/sophia-brain/router/turn_intent_arbitrator.test.ts
```

Si une suite est trop large ou deja flaky, isoler d'abord les tests ajoutes et
documenter ce qui n'a pas ete lance.

QA reel recommande apres implementation :

1. Direct status :
   User : "Tu peux me dire mes preferences coach actives maintenant ?"
   Attendu : direct `status_recap`, pas opportunity.

2. Implicite status opportunity :
   User : "Je sais plus ce qu'il y a dans ma carte d'attaque."
   Attendu : opportunity `status_recap`, offre visible, no recap direct.

3. Product help inline :
   User dans flow actif : "C'est quoi une carte d'attaque ?"
   Attendu : global skipped, `product_help` inline, anchor conservee.

4. Acceptation tardive :
   User apres 2-4 questions produit : "Oui je veux bien."
   Attendu : launch `status_recap` focus attack_card.

5. Correction focus :
   User : "Non, plutot ma carte de defense."
   Attendu : focus defense_card, target_flow status_recap.

6. Direct product help hors flow :
   User : "C'est quoi une carte d'attaque ?"
   Attendu : direct product_help, pas opportunity.

7. Preference opportunity :
   User : "Tu me poses trop de questions."
   Attendu : opportunity `update_coach_preferences`, offre visible, no write.

8. Preference accept :
   User : "Oui."
   Attendu : launch `update_coach_preferences` avec seed context, puis ce flow
   valide et commit seulement si demande durable/supportee/locked.

9. Topic change :
   User pendant flow actif : "Au fait aide-moi a revoir mon plan."
   Attendu : `exit_to_global_dispatcher`, same message reprocessed.

10. Safety :
    User safety/risk.
    Attendu : safety preempt, no product_help, no target flow.

Critere d'acceptation

- `status_recap` est direct pour les demandes explicites de status.
- `status_recap` est une opportunity pour les besoins implicites de rappel.
- `product_help` est direct hors flow actif pour les explications produit.
- `product_help` est un sub-skill inline pendant `flow_opportunity_verification`.
- Le dispatcher global est skippe pendant le flow local actif.
- `confirmation_anchor` survit a plusieurs appels `product_help`.
- Un "oui" tardif lance le bon `target_flow`.
- Les sorties globales sont explicites et portent un `exit_memo`.
- Aucun write DB n'est fait par `flow_opportunity_verification`.
- Aucun claim visible de succes durable ne sort sans commit du flow cible.
- Pas de regex metier, pas de `includes` metier, pas de renderer decideur.
- Les tests unitaires et checks Deno pertinents passent ou les exceptions sont
  documentees.
```
