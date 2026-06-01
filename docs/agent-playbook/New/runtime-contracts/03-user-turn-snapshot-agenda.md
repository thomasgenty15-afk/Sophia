# UserTurnSnapshot + TurnAgenda Contract

## Mental Model

`UserTurnSnapshot` repond a la question : "dans quel etat exact est ce tour ?"
Il capture le message courant, le `TurnFrame`, la `RouteDecision`, la
`tempMemory`, les flows actifs, le pending de confirmation et les contraintes
explicites deja exprimees par les couches amont.

`TurnAgenda` repond a la question : "quelles taches ce tour demande-t-il, meme
s'il y en a plusieurs ?" Il represente les intentions concurrentes sous forme de
tasks `reply`, `effect`, `status`, `memory` ou `repair`. Il encadre
`route_decision`, mais ne remplace pas encore tout le routage.

Le domaine TurnAgenda est un contrat global d'orchestration, pas un tool skill.
Il ne remplit pas les slots metier, ne cree pas de brouillon, n'ecrit pas en DB
metier et ne rend pas de texte user-facing.

## Depend De L'Architecture De TurnAgenda

Ce domaine depend de :

- `UserTurnSnapshot` pour lire l'etat complet du tour ;
- `TurnAgenda` pour distinguer `reply` / `effect` / `status` / `memory` /
  `repair` ;
- `Confirmation Contract` pour interpreter approve/reject/revise/explain ;
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committe ;
- les contrats locaux des tools pour l'intake, le reducer, les effets et le
  renderer.

Dans le code actuel :

- `router/user_turn_snapshot.ts` possede le contrat `UserTurnSnapshot` et la
  fonction `buildUserTurnSnapshot`. Elle lit les donnees deja produites par
  l'architecture globale : `TurnFrame`, `RouteDecision`, `tempMemory`, flows
  actifs, pending confirmation, durable state minimal et contraintes explicites.
- `router/turn_agenda.ts` possede le contrat `TurnAgenda`, les types
  `AgendaTask*`, `buildTurnAgenda`, `selectPrimaryAgendaTask`,
  `findAgendaTasks` et `summarizeTurnAgenda`. Il transforme les
  `tool_skill_intents`, `direct_effects`, `direct_effects_to_run`, pending
  confirmations et status routes en tasks typables.
- `router/turn_interruption_policy.ts` applique les regles cross-skill
  strictement globales via `resolveFlowInterruptions` : interruption d'un vieux
  flow par une nouvelle intention explicite, confirmation incompatible avec le
  pending, blocages `status_only`, `no_mutation`, `preview_only`, `draft_only`,
  `no_potion` et `no_tool`.
- `router/confirmation_contract.ts` et
  `tools/operations/_shared/confirmation_adapter.ts` restent la source commune
  pour normaliser les confirmations. TurnAgenda ne decide pas seul qu'un "oui"
  execute un pending ; il verifie seulement la compatibilite entre la task
  courante et le pending snapshotte.
- `router/effect_ledger.ts` et `router/effect_ledger_adapter.ts` recoivent les
  tasks agenda via `recordAgendaEffectsInLedger`. Une task `effect` devient une
  entree `requested` ou `blocked`; les commits reels viennent ensuite des
  executors L5 et sont verifies par `rewriteUncommittedEffectClaims`.
- `router/run.ts` integre ces briques apres le routage et l'arbitrage : il
  construit le snapshot, construit l'agenda, appelle `resolveFlowInterruptions`,
  filtre les effets bloques de `routeDecision.direct_effects_to_run`,
  `turnFrame.direct_effects` et `turnFrame.tool_skill_intents`, clear les flows
  demandes par la policy, enregistre les tasks dans l'EffectLedger puis expose
  `turn_agenda_summary` dans les traces.

## Runtime Shape

```txt
Dispatcher L1 -> TurnFrame
Routers L2/L3/L4 -> RouteDecision + tempMemory courante
  -> buildUserTurnSnapshot
  -> buildTurnAgenda
  -> resolveFlowInterruptions
  -> run.ts applique seulement les clears/blocks globaux
  -> recordAgendaEffectsInLedger
  -> L5 tool/conversation skills executent ou rendent selon leur contrat
  -> EffectLedger + final response pipeline protegent les claims visibles
```

Le flux actuel est partiellement branche : l'agenda peut deja bloquer un effet
selectionne et nettoyer un active/pending incompatible. Il ne possede pas
l'execution metier elle-meme.

## File Ownership

- Contrat snapshot :
  `supabase/functions/sophia-brain/router/user_turn_snapshot.ts`
  (`UserTurnSnapshot`, `ActiveFlowSnapshot`, `DurableStateSnapshot`,
  `ExplicitTurnConstraints`, `buildUserTurnSnapshot`).
- Contrat agenda :
  `supabase/functions/sophia-brain/router/turn_agenda.ts`
  (`AgendaTask`, `TurnAgenda`, `buildTurnAgenda`,
  `selectPrimaryAgendaTask`, `findAgendaTasks`, `summarizeTurnAgenda`).
- Reducer/policy globale d'interruption :
  `supabase/functions/sophia-brain/router/turn_interruption_policy.ts`
  (`resolveFlowInterruptions`).
- Integration orchestrateur :
  `supabase/functions/sophia-brain/router/run.ts`
  (construction snapshot/agenda, application des clears et blocks, trace
  `turn_agenda_summary`).
- Integration ledger :
  `supabase/functions/sophia-brain/router/effect_ledger_adapter.ts`
  (`recordAgendaEffectsInLedger`).
- Contrats voisins :
  `supabase/functions/sophia-brain/router/confirmation_contract.ts`,
  `supabase/functions/sophia-brain/router/effect_ledger.ts`.

## Intake Structure

TurnAgenda n'a pas d'intake IA propre. Son intake structure est compose de :

- `TurnFrame` produit par `dispatcher/dispatcher.v2.ts` ;
- `RouteDecision` produit par `routers/routers.ts` puis ajuste par
  `router/turn_intent_arbitrator.ts` et les guards L4 encore presents dans
  `router/run.ts` ;
- `tempMemory` chargee depuis l'etat utilisateur ;
- `active_tool_skill_intake`, `__active_tool_skill_intake`,
  `pending_tool_skill_confirmation`, `__pending_tool_skill_confirmation`,
  `active_skill_state`, `__active_skill_state` ;
- contraintes deja structurees dans `__turn_constraints` ou
  `__explicit_turn_constraints`, plus certains signaux non semantiques deja
  presents dans `RouteDecision.reason_code`, `selected_handler` et
  `blocked_paths`.

Toute nouvelle comprehension semantique doit rester en L1 dispatcher ou dans le
slot filler L5 du tool concerne. Il est interdit d'ajouter ici une regex metier
sur le message brut.

## Reducer / State Transition

Le reducer global est `buildTurnAgenda(snapshot)` :

- transforme `turn_frame.tool_skill_intents[]` en tasks `effect` ou `reply`
  quand l'intent devient `preview` ;
- transforme `turn_frame.direct_effects[]` en tasks `effect` ;
- ajoute les effets presents dans `route_decision.direct_effects_to_run` qui ne
  sont pas deja representes ;
- ajoute une task `pending_confirmation` si un pending existe ;
- ajoute une task `active_flow` si un flow actif existe et n'est pas deja
  couvert ;
- ajoute une task `status` si la route ou les contraintes indiquent
  `status_only` ;
- ajoute une task `reply:fallback` si le tour n'a aucune task user-facing
  claire.

`resolveFlowInterruptions({ snapshot, agenda })` est la transition globale qui
produit un nouvel agenda et des flags de nettoyage :

- `clear_active_tool_flow` ;
- `clear_pending_confirmation` ;
- `reason_codes[]`.

Ce reducer ne modifie pas l'etat metier d'un skill. Il ne fait que proteger les
frontieres entre tasks concurrentes.

## Effects Preparation

TurnAgenda prepare des effets au sens orchestration, pas au sens payload metier.

- Une task `effect` avec `status: "pending"` devient une intention demandee.
- Une task `effect` avec `status: "blocked"` devient un blocage explicite.
- `requires_confirmation` indique qu'un workflow durable devra passer par le
  contrat du tool proprietaire avant commit.
- Les operations reconnues au niveau agenda incluent au minimum :
  `create_one_shot_reminder`, `cancel_one_shot_reminder`,
  `update_coach_preferences`, `prepare_attack_card`, `prepare_defense_card`,
  `select_state_potion`, `create_recurring_reminder`,
  `track_progress_plan_item`.

La preparation payload reste dans les modules L5/L6 :

- reminders : `tools/always_on/one_shot_reminder/*` ;
- preferences : `tools/operations/update_coach_preferences/*` ;
- cartes : `tools/operations/prepare_attack_card/*` et
  `tools/operations/prepare_defense_card/*` ;
- potion : `tools/operations/select_state_potion/*` ;
- recurring reminder : `tools/operations/create_recurring_reminder/*` ;
- track progress : `tools/always_on/track_progress_plan_item/*`.

## Effects Application

TurnAgenda n'applique aucun effet durable.

Ce que TurnAgenda peut appliquer dans `run.ts` :

- supprimer un vieux flow actif quand `resolveFlowInterruptions` retourne
  `clear_active_tool_flow` ;
- supprimer un pending incompatible quand `clear_pending_confirmation` est
  retourne ;
- retirer des effets bloques de `routeDecision.direct_effects_to_run`,
  `turnFrame.direct_effects` et `turnFrame.tool_skill_intents` ;
- transformer un `selected_handler` bloque en `normal_reply` avec
  `reason_code: "turn_agenda_blocked_selected_effect"`.

Ce que TurnAgenda ne peut jamais appliquer :

- insert/update/delete dans une table metier ;
- consommation irreversible d'un token de confirmation ;
- creation d'une carte, preference, rappel, potion ou progress log ;
- mutation de l'etat interne d'un tool au-dela du nettoyage global de flow.

Les commits reels restent dans les executors L5. Le ledger observe ensuite
`committed_effects` via `recordToolSkillEffectsInLedger`.

## Renderer / User-Facing Response

TurnAgenda ne rend pas la reponse visible.

- `summarizeTurnAgenda` produit uniquement un resume compact de trace :
  nombre de tasks, owners, operation types, contraintes et statuts.
- Les renderers user-facing restent dans les skills/tools proprietaires
  (`renderer.ts`, composer conversationnel, `final_response_pipeline.ts`).
- `EffectLedger` et `final_response_pipeline.ts` restent responsables de
  neutraliser les claims visibles du type "c'est fait" sans commit.

## Inputs

- `turn_id`, `user_id`, `source_message_id`, `message`, `channel`,
  `timezone` ;
- `TurnFrame | null` ;
- `RouteDecision | null` ;
- `temp_memory` ;
- active flows et pending confirmations derives de `temp_memory` ;
- durable state minimal si deja disponible ;
- recent effects si deja disponibles.

## Outputs

- `UserTurnSnapshot` ;
- `TurnAgenda` ;
- `AgendaTask[]` avec `kind`, `owner`, `operation_type`, `intent`, `priority`,
  `requires_confirmation`, `source`, `status`, `reason_code`, `evidence` ;
- `TurnAgendaSummary` pour traces ;
- `resolveFlowInterruptions` output : agenda ajuste, clear flags, reason codes ;
- entrees EffectLedger `requested` / `blocked` via
  `recordAgendaEffectsInLedger`.

## Responsibilities

TurnAgenda est responsable de :

- conserver les intentions secondaires au lieu de les ecraser par un owner
  unique ;
- representer un tour `status + action` comme deux tasks ;
- representer un tour `cancel + create reminder` comme deux tasks ;
- rendre visible un pending confirmation sans l'executer par defaut ;
- detecter l'incompatibilite entre confirmation courte et nouveau pending ;
- bloquer les effects quand les contraintes globales l'exigent :
  `status_only`, `no_mutation`, `preview_only`, `draft_only`, `no_potion`,
  `no_tool` ;
- prioriser une nouvelle intention explicite face a un vieux flow actif ;
- fournir a l'EffectLedger une projection requested/blocked observable.

TurnAgenda n'est pas responsable de :

- comprendre le message brut par regex ;
- remplir les slots metier ;
- choisir le contenu exact d'une carte, d'un rappel, d'une preference ou d'une
  potion ;
- executer un write DB ;
- rendre un message final ;
- remplacer le Confirmation Contract ;
- remplacer l'EffectLedger ;
- devenir un deuxieme dispatcher.

## Invariants

- Une task secondaire ne doit pas disparaitre parce que `RouteDecision` a un
  `response_owner` unique.
- Une confirmation courte ne peut s'appliquer qu'a un pending compatible.
- `status_only` et `no_mutation` bloquent les tasks `effect`; ils ne doivent pas
  supprimer la capacite a repondre.
- `preview_only` et `draft_only` ne creent pas de pending write executable.
- `no_potion` bloque `select_state_potion` et laisse une task `reply`
  concrete.
- `no_tool` bloque les nouvelles tasks `effect`, sauf confirmation explicitement
  compatible.
- L'agenda peut bloquer ou retirer un effet avant execution, mais ne peut jamais
  marquer un effet comme committe.
- Tout claim visible d'effet durable doit etre protege par EffectLedger et les
  commits reels du tool proprietaire.
- Toute nouvelle regle cross-skill doit etre exprimee en termes de
  `UserTurnSnapshot` + `TurnAgenda`, pas en regex locale dans `run.ts`.

## Integration Points

- `router/run.ts` : integration runtime actuelle. Applique les clear flags,
  filtre les blocked effects, log `turn_agenda_summary`.
- `router/effect_ledger_adapter.ts` : `recordAgendaEffectsInLedger` transforme
  les tasks agenda en ledger requested/blocked.
- `router/effect_ledger.ts` : `rewriteUncommittedEffectClaims` et
  `summarizeEffectLedgerForTrace`.
- `router/confirmation_contract.ts` : vocabulaire commun des confirmations.
- `tools/operations/_shared/confirmation_adapter.ts` : adapter commun pour les
  confirmations tool.
- `routers/effect_gate_orchestrator.ts` : garde directe des effects; TurnAgenda
  ne doit pas dupliquer ses checks safety, seulement representer les tasks et
  blocks globaux.

## Allowed Changes

- Ajouter un nouveau `AgendaTaskKind` si le besoin est transversal et teste.
- Ajouter une operation reconnue si elle correspond a un tool existant.
- Ajouter un reason code de blocage cross-skill documente.
- Enrichir `DurableStateSnapshot` uniquement avec des projections compactes,
  non sensibles et deja chargees par le tour.
- Ajouter une trace compacte ou un test d'invariant.
- Deplacer une regle legacy L4 vers `resolveFlowInterruptions` si elle peut
  etre exprimee sans regex metier.

## Forbidden Changes

- Ajouter une regex semantique sur `message`.
- Ajouter un fallback metier qui fabrique une intention absente du `TurnFrame`
  ou des contrats L5.
- Executer un effect depuis `turn_agenda.ts` ou
  `turn_interruption_policy.ts`.
- Generer du texte user-facing depuis TurnAgenda.
- Stocker un draft complet sensible dans `TurnAgendaSummary` ou dans les
  payloads ledger issus de l'agenda.
- Appliquer un pending confirmation sans compatibilite operationnelle.
- Deplacer une regle metier propre a un tool dans TurnAgenda.

## Legacy Exceptions

- `RouteDecision` reste mono-owner. TurnAgenda l'encadre en conservant les tasks
  secondaires, mais le pipeline n'est pas encore entierement agenda-first.
  Suppression possible quand les operation/conversation pipelines consommeront
  directement `TurnAgenda` comme source d'execution.
- `router/run.ts` contient encore des guards L4 et des helpers `*ForTest`
  transitionnels. TurnAgenda peut absorber seulement les regles globales
  exprimables depuis snapshot + agenda. Suppression possible quand les tests QA
  montrent que les signaux viennent du dispatcher ou des contrats L5.
- `buildUserTurnSnapshot` derive encore certaines contraintes depuis
  `RouteDecision.reason_code`, `selected_handler` et `blocked_paths`. C'est
  temporaire pour rester compatible avec l'architecture actuelle. Suppression
  possible quand le dispatcher et les L5 exposent toutes les contraintes dans
  des champs structures.
- Le durable state du snapshot est minimal et opportuniste. Il ne doit pas etre
  utilise comme source DB complete tant que les loaders dedies ne fournissent pas
  une projection stable.

## Required Tests

Tests contractuels du domaine :

- `supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts`
- `supabase/functions/sophia-brain/router/turn_agenda.test.ts`

Ces tests doivent couvrir au minimum :

- capture active flow + pending confirmation + contraintes explicites ;
- message cancel + create reminder -> deux tasks `effect` ;
- `status_only` -> task `status` et effects bloques ;
- pending confirmation + nouvelle intention incompatible -> pending non
  consomme ;
- vieux flow attack card + nouveau reminder explicite -> interruption du vieux
  flow ;
- `no_potion` -> `select_state_potion` bloque + task reply ;
- `preview_only update_coach_preferences` -> preview sans commit/pending write ;
- `no_tool` -> nouvelles effects bloquees, pending compatible conserve ;
- `status + action` -> les deux tasks restent presentes ;
- owner unique route_decision ne supprime pas les tasks secondaires.

Tests d'integration voisins a lancer quand `run.ts`, `EffectLedger` ou les
confirmations sont touches :

- `supabase/functions/sophia-brain/router/turn_intent_arbitrator.test.ts`
- `supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
- `supabase/functions/sophia-brain/router/effect_ledger_adapter_test.ts`
- `supabase/functions/sophia-brain/router/effect_ledger.test.ts`
- `supabase/functions/sophia-brain/router/confirmation_contract.test.ts`

Si `run_product_help_guard.test.ts` echoue au type-check pour une dette globale
preexistante de `run.ts`, documenter les erreurs exactes dans le chantier log et
verifier les modules purs separement.

## Suivi Des Decisions Architecturales

| Date | Decision | Statut | Reference |
| --- | --- | --- | --- |
| 2026-05-29 | Agenda introduit comme verite des intentions concurrentes du tour. | Active | `15-chantiers-log.md` UserTurnSnapshot + TurnAgenda trace-only |
| 2026-05-30 | TurnAgenda devient une barriere runtime partiellement branchee : il peut bloquer/retirer des effects incompatibles et alimenter EffectLedger, sans posseder les workflows L5 ni les commits DB. | Active | `15-chantiers-log.md` runtime contract turnagenda |
