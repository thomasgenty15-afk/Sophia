# Weekly Review Local Dispatcher — Doctrine Audit And Correction Plan

Flow audite : `weekly_adaptive_review_v1`

Doctrine lue en entier avant ce plan :
`docs/agent-playbook/New/runtime-contracts/11-local-dispatcher-doctrine.md`.

## 0. Brainstorming Usage Produit

### But exact du flow

`weekly_adaptive_review_v1` est le point strategique de fin de semaine. Il part
de preuves daily / dashboard deja calculees, ajoute le signal humain manquant,
puis aide l'utilisateur a conclure la semaine et preparer la suivante.

Le flow doit :

- expliquer une lecture hebdo courte ;
- confirmer ou corriger les signaux humains ;
- produire une proposition d'ajustement a reprendre dans Plan ;
- refuser toute mutation de plan depuis le chat ;
- distinguer une correction de progression oubliee d'un ajustement Plan ;
- quitter proprement vers un autre dispatcher si le user change de besoin.

Il ne doit pas :

- refaire le daily action par action ;
- creer une carte, une potion, un rappel ou une preference depuis le weekly ;
- appliquer un patch de plan ;
- laisser le dispatcher global normal arbitrer tant que le flow est actif.

### Etats possibles

Etats conversationnels :

- `opening` : l'ouverture proactive vient d'etre envoyee.
- `collecting_human_signal` : il manque ressenti, progression vecue, cause ou
  confirmation humaine.
- `strategy_ready` : la lecture weekly est stabilisee.
- `plan_handoff` : une proposition Plan existe ou est en cours de revision.
- `closing` : le flow se ferme, s'arrete ou passe la main.

Etats de statut :

- `open`
- `proposal_discussed`
- `handoff_ready`
- `completed`
- `stopped`
- `deferred`
- `exit_to_global`
- `handoff_to_local_flow`
- `safety`

### Champs et decisions a stabiliser

- `week_start_date`, `week_end_date`
- `weekly_progress_review` compact, deja calcule, source de verite factuelle
- `weekly_adaptive_review` compact, issu du reducer strategique
- `human_signals.objective_delta`
- `human_signals.felt_state`
- `dominant_blocker_confirmation`
- `week_strategy`
- `item_decisions` avec `plan_id`, `plan_title`, `plan_item_id`
- `validation_unlock_status`
- `plan_handoff.scope`
- `plan_handoff.summary`
- `forgotten_progress.target`
- `forgotten_progress.outcome`
- `last_visible_summary`
- `last_handoff_summary`

Chaque champ structure doit porter `source`, `evidence`, `confidence` et
`status` quand il peut etre verrouille ou propose.

### Reponses user possibles

- Reponse a la question weekly : fatigue, energie, progression, blocage.
- Reponse vague : "oui", "bof", "je sais pas".
- Confirmation de la lecture : "oui c'est ca".
- Rejet de la lecture : "non c'est plutot X".
- Demande de recap : "redis-moi le bilan".
- Demande d'explication : "pourquoi tu dis ca ?".
- Demande de proposition Plan : "on allege comment ?".
- Revision de proposition : "plutot deux soirs, pas trois".
- Repetition de handoff : "je fais quoi dans Plan deja ?".
- Tentative d'application : "ok applique".
- Progression oubliee : "tu as oublie que je l'ai fait mardi".
- Question produit : "ou je clique ?".
- Question status DB : "qu'est-ce qui est deja actif ?".
- Demande autre outil : carte, potion, rappel, preference coach.
- Arret local : "pas maintenant", "laisse tomber".
- Changement de sujet clair : "autre chose, aide-moi a prioriser".
- Safety : ideation, danger, panique aigue, mise en danger.

### Signaux d'exit

- `exit_to_global_dispatcher` : le user veut arreter ou repousser le weekly, sans
  nouveau sujet clair. Reponse locale courte, pas de global.
- `exit_to_global_dispatcher` : le user change clairement de sujet sans cible
  locale documentee. `note_information` obligatoire.
- `handoff_to_local_flow` : la cible locale est claire : `prepare_attack_card`,
  `prepare_defense_card`, `select_state_potion`, `update_coach_preferences`,
  `adjust_plan_item`, `track_progress_plan_item`. `note_information`
  obligatoire.
- `inline_tool_roundtrip` : question produit/status temporaire pendant weekly.
  Parent weekly conserve son etat.
- `safety_preempt` : passage prioritaire vers `safety_crisis.local_dispatcher`,
  jamais vers le dispatcher global normal.

### Signaux safety

Le dispatcher local doit retourner `safety_preempt` si le message contient un
signal de risque prioritaire selon le contexte safety du tour. Il ne continue
pas le weekly et ne propose pas d'ajustement produit. La note cible
`safety_crisis` avec le resume du weekly uniquement comme arriere-plan.

### Inline tools possibles

V1 utile :

- `product_help` inline : "ou je retrouve la proposition dans Plan ?",
  "c'est quoi l'onglet Plan ?".
- `status_recap` inline : "quelles cartes/actions sont deja actives pour cet
  item ?" ou "qu'est-ce qui est deja note ?".

V1 a eviter dans weekly core :

- Creation/modification directe de rappels.
- Creation directe de carte.
- Mutation directe de preference coach.

### Passages vers un autre dispatcher

- `prepare_attack_card` : demande explicite de carte d'attaque.
- `prepare_defense_card` : demande explicite de carte de defense.
- `adjust_plan_item` : demande Plan plus large que la proposition weekly locale
  ou continuation structurante dans le flow d'ajustement.
- `track_progress_plan_item` : progression oubliee avec cible claire.
- `select_state_potion` : demande de potion ou soutien d'etat explicite.
- `update_coach_preferences` : preference coach durable explicite.
- `safety_crisis` : safety preempt.
- `global` : seulement autre sujet clair sans dispatcher local cible fiable.

### Passages depuis un autre flow

- Ouverture proactive systeme : evenement typed equivalent a
  `note_information`, avec projection weekly et contexte source.
- Dispatcher global vers weekly : possible seulement si global produit une
  activation locale avec `note_information`.
- Daily review vers weekly : possible pour "bilan semaine" apres plusieurs
  daily, avec note sur les preuves deja collectees.
- Adjust plan ou product help vers weekly : rare ; requires note, sinon le
  weekly ne doit pas demarrer nu.

### Prompts conversationnels stage-specific necessaires

Le flow n'est pas trivial. Il lui faut des prompts visibles separes :

- `opening_weekly_review`
- `ack_human_signal`
- `ask_missing_human_signal`
- `present_weekly_reading`
- `recap_weekly`
- `explain_weekly_reasoning`
- `plan_handoff_ready`
- `revise_plan_handoff`
- `repeat_plan_handoff`
- `apply_attempt`
- `forgotten_progress_clarify`
- `forgotten_progress_ack`
- `forgotten_progress_blocked`
- `inline_tool_return`
- `stop_or_cancel`
- `complete_no_change`
- `exit_ack`
- `safety_transition`

### Contexte DB utile

Le dispatcher n'a pas besoin d'un dump DB. Il a besoin d'un pack compact :

- projection weekly calculee ;
- plans / transformations concernees ;
- actions hebdo avec ids et titres ;
- preuves daily agregees ;
- etat du handoff Plan ;
- validation unlock ;
- surfaces produit utiles ;
- dernier resume weekly / handoff.

Les cartes, potions, rappels et preferences ne sont charges que pour une
question inline/status ou pour le dispatcher cible apres handoff.

### Micro-memory utile ou non

Oui, mais optionnelle et minimale. Weekly est dans la matrice doctrine des flows
qui peuvent beneficier d'une micro-memoire, car elle peut eviter de redemander
un blocage recent ou relier une correction a une action active.

Budget cible : 0 a 3 items, jamais plus de 4.

Sources autorisees :

- memoire liee aux plan items de la semaine ;
- observation recente de progression ou blocage ;
- thread recent strictement lie au point weekly ;
- evenement/item deja relie par le TurnFrame.

Exclusions :

- pas de profil global ;
- pas de memoire safety hors `safety_crisis` ;
- pas de memoire brute dans le prompt visible ;
- memoire seule = candidat ou contexte, jamais fait verrouille.

## 1. Diagnostic Du Flow Actuel

### Ce qui respecte deja la doctrine

- Le flow a un dispatcher local IA JSON :
  `runWeeklyReviewLocalDispatcher(...)`.
- Quand un state weekly actif existe, `router/run.ts` skip le dispatcher global
  avant le local.
- Le dispatcher ne produit pas directement le message visible.
- Le reducer valide des enums, statuts et contraintes de sortie.
- Les actions Plan sont non mutantes : `platform_handoff`, `executedTools=[]`,
  `committed_effects=[]`.
- `apply_attempt` refuse l'application depuis le chat.
- Les tests actuels couvrent le handoff Plan, le blocage d'exit sans memo, et
  l'unlock de validation.
- Les docs listent deja plusieurs prompts visibles stage-specific.

### Ce qui diverge

- Le contrat de sortie utilise encore `exit_memo`, pas `note_information`
  canonique en sortie dispatcher/reducer.
- Le router fabrique une `note_information` apres coup depuis le memo. C'est un
  pont legacy, pas le contrat local strict.
- `safety_preempt` est traite dans le meme embranchement que
  `exit_to_global_dispatcher` et marque `exit_to_global_dispatcher=true`.
  La doctrine veut une preemption vers `safety_crisis.local_dispatcher`, pas un
  chemin global normal.
- Les demandes explicites vers un autre flow local, par exemple carte
  d'attaque, sortent vers global. Le run reel R2 a montre que le global peut
  retomber en `normal_reply`.
- Le visible agent est un seul agent generaliste avec un switch d'instruction.
  Les prompts stage-specific existent dans la doc mais ne sont pas modelises
  comme prompts separes dans le runtime.
- Le visible agent recoit `weekly_state`, `weekly_progress_review`,
  `weekly_adaptive_review` et `dispatcher_output` bruts. La doctrine demande
  `visible_task.conversation_context` filtre.
- `visible_task` contient surtout `kind` + `instruction`, sans
  `conversation_context`.
- Le dispatcher ne recoit pas un input standard `db_context_pack` /
  `micro_memory_context` ; il recoit le state weekly brut.
- Il reste un fallback visible deterministe (`fallbackWeeklyVisibleMessage`) qui
  construit des messages metier. La doctrine accepte une clarification safe
  minimale en cas d'echec, pas des templates visibles metier dans le chemin
  nominal.
- Les inline product/status roundtrips ne sont pas formellement representes
  dans le contrat weekly.
- Le vieux surface legacy existe encore autour de `renderer.ts`, `guards.ts`,
  `bridges.ts`, `confirmation.ts`. Certains guards peuvent rester en safety
  guard, mais ils ne doivent plus posseder la conversation nominale.

### Legacy a supprimer ou contenir

- `exit_memo` comme contrat principal.
- `visible_task.instruction` comme substitut a `conversation_context`.
- Unique `visible_agent` generaliste pour tous les stades.
- Fallbacks visibles metier construits par code.
- Second pass global pour des cibles locales explicites.
- Toute reprise de renderer weekly comme wording nominal.
- Confirmation helpers legacy qui lisent le message user si le dispatcher local
  est actif.

### Risques

- Mauvais owner apres sortie weekly : deja observe sur "carte d'attaque".
- Fuite de contexte brut vers le visible agent, qui peut refaire des decisions.
- Safety routee comme exit global au lieu de preemption locale.
- Trace QA incomplete si un changement de dispatcher n'a pas
  `note_information_created` / `note_information_consumed`.
- Handoff Plan ambigu dans les semaines multi-plans.
- Promesses de correction de progression sans commit verifie.

## 2. Architecture Cible

### Schema runtime

```txt
message user
-> safety pregate context
-> active weekly state detected
-> global dispatcher skipped
-> load db_context_pack weekly
-> load optional micro_memory_context weekly
-> weekly_adaptive_review.local_dispatcher
-> reducer weekly
-> visible_task.kind + visible_task.conversation_context
-> prompt conversationnel weekly stage-specific
-> message visible
```

Transitions :

```txt
weekly local dispatcher
-> flow_action=handoff_to_local_flow | inline_tool_roundtrip | safety_preempt | exit_to_global_dispatcher
-> note_information
-> dispatcher cible
-> reducer cible
-> conversation_context cible
-> prompt cible
```

### Dispatcher local

Responsabilites :

- interpreter le message dans le weekly actif ;
- choisir `flow_action` ;
- produire les mises a jour structurees ;
- produire `visible_task.kind` et les donnees candidates pour le reducer ;
- produire `note_information` pour tout changement de dispatcher ;
- produire `risk_score` et `safety` ;
- ne jamais ecrire le message visible.

Input standard :

```json
{
  "current_user_message": "string",
  "recent_messages": [],
  "active_flow_state": {},
  "note_information_inbound": {},
  "db_context_pack": {},
  "micro_memory_context": {},
  "platform_context": {},
  "risk_context": {},
  "available_inline_tools": ["product_help", "status_recap"],
  "parent_flow_context": {},
  "timezone": "Europe/Paris",
  "channel": "web|whatsapp"
}
```

### Reducer

Responsabilites :

- valider JSON, enums, ids, statuts et `note_information` ;
- mettre a jour les signaux humains ;
- recalculer la decision weekly si autorise ;
- construire `visible_task.conversation_context` filtre ;
- bloquer toute mutation de plan ;
- produire `platform_handoff` local si aucun dispatcher cible n'est appele ;
- router vers dispatcher cible uniquement si `flow_action` le demande ;
- garder le parent weekly sur inline roundtrip ;
- stopper localement sans global sur `exit_to_global_dispatcher`.

### Conversation context

Le prompt visible recoit uniquement :

```json
{
  "state_summary": "string",
  "week_window": {
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD"
  },
  "field_or_stage": "string|null",
  "known_values": {},
  "missing_or_weak_values": [],
  "weekly_reading": {
    "strategy_label_human": "string",
    "reason_human": "string",
    "confidence": "low|medium|high"
  },
  "plan_contexts": [],
  "item_summaries": [],
  "handoff_data": {},
  "forgotten_progress": {},
  "inline_result": {},
  "tone_constraints": [],
  "do_not_say": [],
  "evidence_used": []
}
```

Le prompt visible ne recoit jamais :

- `db_context_pack` brut ;
- `micro_memory_context` brut ;
- `dispatcher_output` complet ;
- tables DB ;
- labels internes `bridge_week`, `plan_patch`, `item_decision`, etc.

### Transitions vers autres dispatchers

- `handoff_to_local_flow(target=prepare_attack_card)` pour une demande explicite
  de carte d'attaque.
- `handoff_to_local_flow(target=prepare_defense_card)` pour carte de defense.
- `handoff_to_local_flow(target=adjust_plan_item)` pour un vrai flow Plan
  structure, si la proposition weekly locale ne suffit plus.
- `handoff_to_local_flow(target=track_progress_plan_item)` pour correction de
  progression avec cible claire.
- `handoff_to_local_flow(target=select_state_potion)` pour potion explicite.
- `handoff_to_local_flow(target=update_coach_preferences)` pour preference coach
  durable.
- `inline_tool_roundtrip(target=product_help)` pour aide produit temporaire.
- `inline_tool_roundtrip(target=status_recap)` pour statut DB temporaire.
- `exit_to_global_dispatcher` seulement pour sujet clair sans dispatcher cible.
- `safety_preempt(target=safety_crisis)` pour safety.

## 3. Contrat JSON Du Dispatcher Local

### Actions possibles

```json
{
  "flow_action": "answer_current_stage|missing_info|confirm_weekly_reading|reject_weekly_reading|recap_weekly|explain_weekly_reasoning|prepare_plan_handoff|revise_plan_handoff|repeat_plan_handoff|apply_attempt|forgotten_progress_correction|clarify_forgotten_progress|inline_tool_roundtrip|handoff_to_local_flow|complete_flow|exit_to_global_dispatcher|defer_flow|exit_to_global_dispatcher|safety_preempt",
  "confidence": "low|medium|high",
  "risk_score": 0,
  "safety": {
    "action": "none|safety_preempt",
    "reason_codes": [],
    "evidence": []
  },
  "weekly_intent": {
    "kind": "weekly_answer|weekly_confirmation|weekly_rejection|weekly_recap|weekly_explain|plan_handoff_request|plan_handoff_revision|apply_attempt|forgotten_progress|inline_product|inline_status|local_tool_request|stop|defer|off_topic|safety|unclear",
    "summary": "string",
    "source": "user_message|note_information|db_context|memory|inference",
    "evidence": [],
    "confidence": "low|medium|high"
  },
  "field_updates": {
    "human_signals": {},
    "handoff": {},
    "forgotten_progress": {}
  },
  "target_dispatcher": "none|global|safety_crisis|product_help|status_recap|prepare_attack_card|prepare_defense_card|adjust_plan_item|track_progress_plan_item|select_state_potion|update_coach_preferences",
  "visible_task": {
    "kind": "stage_specific_kind",
    "conversation_context_seed": {}
  },
  "note_information": {
    "needed": false
  },
  "no_chat_mutation": {
    "db_write_committed": false,
    "potion_session_created": false,
    "scheduled_checkin_created": false,
    "recurring_reminder_created": false,
    "executable_confirmation_generated": false
  },
  "evidence": []
}
```

### `visible_task.kind`

- `ack_human_signal`
- `ask_missing_human_signal`
- `present_weekly_reading`
- `recap_weekly`
- `explain_weekly_reasoning`
- `plan_handoff_ready`
- `revise_plan_handoff`
- `repeat_plan_handoff`
- `apply_attempt`
- `forgotten_progress_clarify`
- `forgotten_progress_ack`
- `forgotten_progress_blocked`
- `inline_tool_return`
- `complete_no_change`
- `stop_or_cancel`
- `exit_ack`
- `safety_transition`

### `note_information`

Obligatoire si :

- `flow_action=exit_to_global_dispatcher`
- `flow_action=safety_preempt`
- `flow_action=handoff_to_local_flow`
- `flow_action=inline_tool_roundtrip`

Champs requis :

- `source_flow_id`
- `source_flow_presentation`
- `source_flow_state_summary`
- `handoff_reason`
- `target_dispatcher`
- `handoff_context_for_next_dispatcher`
- `target_local_dispatcher_hint`
- `structured_context`
- `risk_score`
- `no_chat_mutation`

La note ne va jamais directement au prompt visible cible.

## 4. Prompts Conversationnels Necessaires

| Prompt | Quand il est appele | Contexte recu | Sortie attendue | Ne doit jamais faire |
| --- | --- | --- | --- | --- |
| `opening_weekly_review` | ouverture proactive | synthese weekly, question initiale, plans concernes | message d'ouverture court | proposer outil, appliquer plan |
| `ack_human_signal` | user repond au signal humain | signal reconnu, lecture actualisee, prochaine etape | acknowledgement + suite | refaire daily action par action |
| `ask_missing_human_signal` | signal insuffisant | champ manquant, pourquoi il manque | une question unique | demander deux dimensions |
| `present_weekly_reading` | lecture stabilisee | strategie humaine, preuves compactes, plans | lecture claire | labels internes, mutation |
| `recap_weekly` | user demande recap | dernier resume filtre | recap court | nouvelle decision |
| `explain_weekly_reasoning` | user demande pourquoi | preuves, blockers, ressentis | explication sobre | rapport technique |
| `plan_handoff_ready` | proposition Plan locale prete | handoff_data, scope, destination Plan | quoi reprendre dans Plan | dire applique/modifie |
| `revise_plan_handoff` | user corrige proposition | ancienne/nouvelle version | version remplacee | garder ancienne valeur principale |
| `repeat_plan_handoff` | user demande de redire | handoff_data | rappel court | refaire tout le bilan |
| `apply_attempt` | user demande appliquer | handoff_data, no_chat_mutation | refus doux + chemin Plan | creer confirmation executable |
| `forgotten_progress_clarify` | progression oubliee ambiguë | candidats, manque | une question cible | dire corrige |
| `forgotten_progress_ack` | commit progression reussi | committed_effect filtre | acknowledgement | parler d'ajustement Plan |
| `forgotten_progress_blocked` | commit progression bloque | raison, cible manquante | explication courte | promettre une correction |
| `inline_tool_return` | product/status inline revient | reponse inline filtree, etat weekly parent | reponse + retour weekly si utile | effacer parent flow |
| `complete_no_change` | flow conclu sans transition | resume, unlock status | cloture courte | proposer autre outil |
| `stop_or_cancel` | arret/defer local | intention stop, statut | ack court | relancer global, question finale |
| `exit_ack` | rare ack visible avant sortie | raison de sortie, cible | ack minimal si necessaire | traiter la nouvelle demande |
| `safety_transition` | safety preempt demande transition | note safety minimale | transition minimale | conseil clinique, weekly |

Implementation : remplacer le switch d'instructions d'un agent unique par un
registry de prompts stage-specific. Un helper commun peut appeler Gemini, mais
chaque `visible_task.kind` doit avoir son prompt system/user propre et un
schema de `conversation_context` propre.

## 5. Contexte A Injecter

### `db_context_pack` necessaire

```json
{
  "source": "weekly_review_runtime",
  "freshness": "current_turn",
  "confidence": "high",
  "week_window": {},
  "weekly_progress_review_summary": {
    "planned_count": 0,
    "done_count": 0,
    "partial_count": 0,
    "missed_count": 0,
    "dominant_blockers": [],
    "coverage": "partial|full|low"
  },
  "plans": [
    {
      "plan_id": "string",
      "plan_title": "string",
      "transformation_id": "string",
      "actions": []
    }
  ],
  "weekly_adaptive_review_summary": {},
  "validation_unlock": {},
  "last_weekly_summary": "string|null",
  "last_handoff_summary": "string|null",
  "product_surfaces": ["Plan"],
  "evidence": []
}
```

Ne pas injecter par defaut :

- cartes detaillees ;
- potions ;
- rappels ;
- preferences coach ;
- memoire globale ;
- tables DB brutes.

Ces contextes sont charges par le dispatcher cible ou par un inline tool.

### `micro_memory_context`

Utile : oui, minimal et conditionnel.

Budget :

- `max_items=3` par defaut ;
- `max_items=4` uniquement si plusieurs plan items sont explicitement en jeu ;
- chaque item a `summary`, `source`, `linked_object`, `freshness`,
  `confidence`, `evidence`, `sensitivity`.

Cas de chargement :

- message user mentionne une action active ou une correction ;
- weekly projection a faible coverage ;
- progression/blocage recent est lie a l'action cible ;
- incoming note_information mentionne un item ou un thread recent.

Cas de non chargement :

- recap simple ;
- apply_attempt ;
- stop local ;
- product_help/status inline ;
- safety sauf passage vers `safety_crisis`.

La micro-memoire aide le dispatcher a proposer ou clarifier. Elle n'est jamais
transmise brute au prompt visible.

## 6. Invariants QA

- Global dispatcher skipped while weekly flow active.
- No regex routing in weekly local dispatcher.
- No `message.includes(...)` business routing.
- No deterministic renderer in nominal visible path.
- No single generic conversation agent for all weekly stages.
- Every `flow_action` has exact continuation.
- Every `visible_task.kind` has stage-specific prompt.
- `visible_task.conversation_context` is non-empty for every visible response.
- Conversation agent only uses `conversation_context`.
- `db_context_pack` is compact and source/evidence/confidence annotated.
- `micro_memory_context` is minimal, 0-4 items max, and not leaked raw to visible prompt.
- `exit_to_global_dispatcher` does not call global.
- `defer_flow` does not call global.
- `exit_to_global_dispatcher` includes canonical `note_information`.
- `handoff_to_local_flow` includes canonical `note_information`.
- `safety_preempt` routes to safety local dispatcher with `note_information`.
- Inline product/status preserves parent weekly state.
- Explicit attack-card request after weekly handoff routes to `prepare_attack_card`, not `normal_reply`.
- Apply attempt never mutates Plan and never creates executable confirmation.
- Plan handoff preserves `plan_id` and `plan_item_id`.
- Multi-plan handoff groups by plan.
- Forgotten progress success requires committed effect.
- No "applique/modifie/valide/enregistre le plan" wording without commit.
- Note information is traced on creation and consumption.

## 7. Plan D'Implementation

### Fichiers a modifier

- `supabase/functions/sophia-brain/skills/weekly_review/local_flow.ts`
  - introduire input standard `db_context_pack`, `micro_memory_context`,
    `note_information_inbound`;
  - remplacer `exit_memo` par `note_information` canonique ;
  - ajouter `inline_tool_roundtrip`, `handoff_to_local_flow`,
    `exit_to_global_dispatcher`, `defer_flow` ;
  - produire `conversation_context_seed`, pas `instruction` visible.

- `supabase/functions/sophia-brain/skills/weekly_review/visible_agent.ts`
  - remplacer l'agent unique par registry stage-specific ;
  - chaque prompt recoit seulement `conversation_context`.

- Nouveau fichier possible :
  `supabase/functions/sophia-brain/skills/weekly_review/conversation_context.ts`
  - builder filtre depuis reducer state + dispatcher output.

- Nouveau fichier possible :
  `supabase/functions/sophia-brain/skills/weekly_review/context_pack.ts`
  - builder `db_context_pack` et micro-memory pack minimal.

- `supabase/functions/sophia-brain/router/run.ts`
  - ne plus fabriquer la note weekly apres coup sauf compat legacy temporaire ;
  - router `safety_preempt` vers safety local dispatcher ;
  - router `handoff_to_local_flow` directement vers dispatcher local cible ;
  - garder global uniquement sur `exit_to_global_dispatcher`.

- `supabase/functions/sophia-brain/tools/operations/inline_info_tools.ts`
  - reutiliser pour product/status inline avec parent weekly preserve.

- `docs/agent-playbook/New/runtime-contracts/proactive/weekly-review-local-dispatcher-prompts.md`
  - aligner le contrat sur `note_information`, `conversation_context` et les
    actions doctrine.

- `docs/agent-playbook/New/runtime-contracts/proactive/weekly-review-local-flow-architecture.md`
  - documenter direct local handoffs, inline roundtrip et micro-memory policy.

### Ordre de modification

1. Mettre a jour le contrat TypeScript du dispatcher weekly.
2. Ajouter les builders `db_context_pack` / `conversation_context`.
3. Migrer le reducer pour produire `visible_task.conversation_context`.
4. Remplacer le visible agent par prompts stage-specific.
5. Ajouter `note_information` canonique en sortie reducer.
6. Brancher les handoffs locaux directs et inline tools dans `router/run.ts`.
7. Contenir les fallbacks visibles a une clarification safe minimale.
8. Garder les guards no-mutation / no-internal-labels comme garde-fous finaux,
   pas comme renderer nominal.
9. Elargir les tests unitaires.
10. Lancer un run IA reel local.

### Tests unitaires

- Dispatcher output normalization accepts canonical note.
- Exit without note is blocked.
- Stop local does not request global.
- Safety preempt targets `safety_crisis`.
- Attack-card request returns `handoff_to_local_flow` target
  `prepare_attack_card`.
- Product question returns inline product roundtrip.
- Status question returns inline status roundtrip.
- Apply attempt returns no mutation and stage `apply_attempt`.
- Vague answer stays local with `ask_missing_human_signal`.
- Revision updates handoff summary.
- Repeat handoff does not recompute weekly.
- Multi-plan scope ambiguity asks clarification.
- Conversation context builder never includes raw `weekly_state` or
  `micro_memory_context`.
- Visible registry has one prompt per `visible_task.kind`.
- Fallback visible path is safe-minimal only.

### Tests IA reels

Run local Supabase, `/functions/v1/test-send-message`,
`force_full_ai=true`.

Scenarios minimum :

- Reponse weekly -> clarification -> handoff Plan -> apply_attempt.
- Handoff Plan puis "je veux plutot une carte d'attaque" -> `prepare_attack_card`.
- Stop local : "pas maintenant" -> no global, ack court.
- Product inline : "ou je clique dans Plan ?" -> product_help inline then weekly preserved.
- Status inline : "qu'est-ce qui est deja actif pour cette action ?" -> status_recap inline.
- Safety : signal safety -> safety local dispatcher, no product.
- Multi-plan : demande "le deuxieme plan" ambigu -> clarification.
- Forgotten progress : target clear -> commit path, target ambiguous -> clarify.

### Logs / traces a ajouter

- `local_dispatcher_called`
- `local_dispatcher_result`
- `flow_action`
- `visible_task.kind`
- `conversation_context_built`
- `db_context_pack_loaded`
- `micro_memory_context_loaded`
- `note_information_created`
- `note_information_consumed`
- `global_dispatcher_skipped`
- `handoff_to_local_flow`
- `inline_tool_roundtrip`
- `exit_to_global_dispatcher`
- `safety_preempt`
- `risk_score`

### Criteres de validation

- Tous les invariants QA ci-dessus passent en unit.
- `deno check` passe sur weekly + router touches.
- Run IA reel local green sur le coeur weekly.
- Aucun tour actif weekly ne route vers `normal_reply` sauf
  `exit_to_global_dispatcher` explicite puis decision globale justifiee.
- Une demande explicite de carte apres weekly ne passe plus par global : elle
  arrive au dispatcher local `prepare_attack_card` avec `note_information`.
- Le visible agent ne recoit jamais de contexte brut.
- Les artefacts QA documentent cleanup et absence de mutation hors scope.
