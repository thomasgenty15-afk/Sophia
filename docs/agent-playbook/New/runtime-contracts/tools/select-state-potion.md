# select_state_potion Runtime Contract

## Mental Model

`select_state_potion` est désormais un `platform_handoff_skill`.

Il aide Sophia à comprendre l'état actuel du user, clarifier le shift souhaité,
recommander une potion ou une option d'état, puis rediriger vers la surface
produit correspondante. Il ne lance plus de potion depuis le chat.

Forme cible :

```txt
contract -> structured intake + subskills
         -> reducer/coaching policy
         -> handoff draft -> platform destination -> renderer
         -> active handoff state
```

Phrase d'invariant : **`select_state_potion` ne crée aucune session potion,
aucun rappel récurrent et aucun check-in depuis le chat. Son succès nominal est
un `platform_handoff` avec `no_chat_mutation=true`, `executedTools=[]` et
`committed_effects=[]`.**

## Dépend De L'Architecture De select_state_potion

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour ;
- `local reducer contract` pour représenter `select_state_potion` comme
  `platform_handoff`, pas comme `effect` exécutable ;
- `clarification_tool` pour les ambiguïtés internes : soutien émotionnel vs
  potion, apaisement vs activation, potion vs rappel/suivi, handoff prêt vs
  encore trop flou ;
- `handoff_flow_arbitration` pour conserver les suites de handoff dans le skill
  actif sans capturer safety, one-shot clair, progress clair ou status clair ;
- `Product Surface Registry` pour obtenir la destination canonique
  `state_potions` / Etat-Potions ;
- `EffectLedger` pour tracer le handoff non-mutant et bloquer tout wording
  d'activation sans commit ;
- le contrat local de `select_state_potion` pour l'intake, les sous-skills, le
  reducer, l'état et le renderer.

Dans le code cible :

- `router/operation_runtime_pipeline.ts` ne doit plus appeler un runtime
  d'activation potion. S'il reçoit un signal `select_state_potion`, il doit
  router vers le handoff ou retourner un résultat `platform_handoff`
  non-mutant.
- `tools/operations/select_state_potion/handoff.ts` possède le runtime handoff :
  start/continue/clarify/produce/revise/repeat/apply_attempt/cancel/topic_change.
- `tools/operations/select_state_potion/subskills/local_flow_dispatcher.ts`
  possède l'interprétation locale d'un message quand le flow potion est actif.
- `tools/operations/select_state_potion/intake.ts` et `subskills/*` conservent
  la compréhension structurée utile. Ils ne produisent plus un draft activable
  ni un pending confirmation exécutable.
- `tools/operations/select_state_potion/state.ts` possède un état handoff
  distinct des anciens pending exécutables.
- `tools/operations/select_state_potion/renderer.ts` est la seule source du
  message visible handoff. Le ledger ne rend jamais le contenu.
- `tools/operations/select_state_potion/router.ts`, `draft_validation.ts`,
  `executor.ts` et `persistence.ts` ne possèdent plus le chemin nominal. Le
  runtime V1 handoff ne doit pas les importer ni les appeler.

## Runtime Shape

```txt
router/operation_runtime_pipeline.ts
  -> select_state_potion handoff route
      -> loadStatePotionHandoffState(tempMemory)
      -> runSelectStatePotionIntake(...) / subskills si besoin
      -> clarification_tool si ambiguïté interne
      -> reducer handoff
          -> collecting / clarifying / handoff_ready / handoff_delivered
          -> revise_handoff / repeat_handoff / apply_attempt
          -> cancelled / topic_change / blocked
      -> Product Surface Registry target
      -> renderStatePotionHandoff(...)
      -> OperationRuntimeResult:
          toolExecution="platform_handoff"
          executedTools=[]
          committed_effects=[]
          platform_handoff.operation_type="select_state_potion"
```

Il ne doit plus exister de chemin nominal :

```txt
draft -> confirmation token -> executeActivateStatePotion -> writeStatePotionActivation
```

## File Ownership

- `tools/operations/select_state_potion/contract.ts`
  - types `StatePotionHandoffStatus`, `StatePotionHandoffDraft`,
    contraintes `no_potion`, `no_followup`, `instant_support_only`,
    résultat skill non-mutant ;
  - ne doit pas exposer d'effet durable activable dans le chemin nominal.

- `tools/operations/select_state_potion/intake.ts`
  - intake structuré et merge des sous-skills ;
  - lit l'état émotionnel, le shift souhaité, les contraintes et les slots de
    recommandation ;
  - ne doit pas contenir de regex métier ni de fallback keyword.

- `tools/operations/select_state_potion/subskills/*`
  - sélection IA de l'état, shortlist et détails de potion ;
  - restent propriétaires de la compréhension fine du domaine.

- `tools/operations/select_state_potion/handoff.ts`
  - runtime handoff local ;
  - orchestre le dispatcher local, l'intake, le reducer d'état, le renderer et
    les follow-ups non-mutants ;
  - ne possède aucun writer DB ;
  - ne crée aucun pending confirmation exécutable.

- `tools/operations/select_state_potion/subskills/local_flow_dispatcher.ts`
  - décide localement `field_answer`, `field_confirmation`,
    `revise_collected_field`, `platform_destination_followup`,
    `apply_attempt`, `repeat_handoff`, `cancel_flow`,
    `exit_to_global_dispatcher`, `safety_preempt` ou `unclear` ;
  - ne produit jamais la valeur plateforme finale d'un champ.

- `tools/operations/select_state_potion/state.ts`
  - lit/écrit/clear l'état `StatePotionHandoffState` ;
  - garde quelques tours le handoff actif pour révision/répétition/apply attempt ;
  - ne réutilise pas les clés de pending exécutable pour le chemin nominal.

- `tools/operations/select_state_potion/policy.ts`
  - conserve seulement les hard consent guards qui bloquent ou annulent, jamais
    des décisions de slot ;
  - les legacy semantic detectors doivent être documentés et ne pas grandir.

- `tools/operations/select_state_potion/generator.ts`
  - produit une recommandation user-ready, pas un objet activable.

- `tools/operations/select_state_potion/renderer.ts`
  - rend la compréhension de l'état, le shift recommandé, la potion suggérée, les
    éléments à préserver/éviter, la destination plateforme et la phrase finale de
    non-mutation ;
  - interdit tout langage d'activation.

- `tools/operations/select_state_potion/router.ts`, `draft_validation.ts`,
  `executor.ts` et `persistence.ts`
  - legacy désactivé ou hors chemin nominal ;
  - ne doivent pas être importés par le runtime handoff.

## Inputs

Le skill consomme :

- `userMessage`, `history`, `channel`, `userTimezone`, `requestId`,
  `sourceMessageId` ;
- `TurnFrame` et `RouteDecision` déjà structurés ;
- l'état handoff actif dans `tempMemory` ;
- les contraintes globales : safety, no-tool, no-potion, no-followup ;
- le contexte prompt-only nécessaire à la recommandation ;
- `operation_input.context.handoff_summary` quand l'entrée vient d'une
  suggestion structurée émise par un skill conversationnel. Ce résumé est un
  contexte déjà clarifié, pas une instruction de routage vers un autre skill ;
- les sorties structurées des sous-skills ;
- la destination canonique du Product Surface Registry.

Le contexte DB ne doit jamais devenir un second cerveau déterministe pour
choisir la potion.

Entrées autorisées :

- demande explicite utilisateur de potion ou d'aide d'état maintenant ;
- suite d'un handoff actif `select_state_potion` ;
- suggestion structurée consentie via `operation_suggestions`, avec payload
  `operation_input_hint` et consentement utilisateur avant handoff plateforme.

Les états implicites seuls (`honte`, pression, perte de sens, décrochage,
panique légère, flou d'exécution) ne doivent pas être transformés en opportunity
`select_state_potion` par le dispatcher.

## Outputs

Sortie nominale :

- `toolExecution="platform_handoff"` ;
- `executedTools=[]` ;
- `committed_effects=[]` ;
- `platform_handoff.operation_type="select_state_potion"` ;
- `platform_handoff.surface_id="state_potions"` ;
- `no_chat_mutation=true` ;
- `reply` rendu par `renderer.ts`.

Statuts handoff canoniques :

- `collecting` ;
- `clarifying` ;
- `handoff_ready` ;
- `handoff_delivered` ;
- `revise_handoff` ;
- `repeat_handoff` ;
- `apply_attempt` ;
- `cancelled` ;
- `topic_change` ;
- `blocked`.

## Invariants

- Pas d'activation potion depuis le chat.
- Pas de `user_potion_sessions` créée depuis ce flow.
- Pas de `user_recurring_reminders` ou `scheduled_checkins` créé comme follow-up.
- Pas de confirmation token.
- Pas de pending confirmation exécutable.
- Pas de `executedTools=["select_state_potion"]`.
- Pas de `committed_effects`.
- Pas de wording "activé", "lancé", "programmé", "je te relance" ou équivalent.
- `apply_attempt` répète la destination plateforme et refuse l'exécution chat.
- `repeat_handoff` réaffiche la recommandation plateforme.
- `revise_handoff` régénère la recommandation depuis le skill.
- `no_potion` annule ou bloque proprement le handoff.
- `no_followup` doit apparaître dans la recommandation comme contrainte, jamais
  comme follow-up caché.
- Si `context.handoff_summary` est fourni, les sous-skills l'utilisent pour
  choisir/proposer le champ courant et éviter de repartir de zéro; ils ne
  doivent pas en déduire un remplissage massif de tous les champs.
- Une demande one-shot explicite peut interrompre le handoff et sortir vers le
  direct effect `create_one_shot_reminder`.
- Safety préempte toujours.
- `intake.ts` ne reçoit pas de regex métier, de fallback keyword, ni de choix
  déterministe depuis le contexte DB.

## Renderer Contract

Un handoff potion complet doit contenir :

1. ce que Sophia comprend de l'état ;
2. le shift recommandé ;
3. pourquoi cette potion ou option d'état ;
4. à préserver ;
5. à éviter ;
6. destination plateforme depuis le Product Surface Registry ;
7. phrase finale no-mutation.

La phrase no-mutation est une ligne de clôture. Elle ne doit jamais remplacer
le contenu utile.

## Active Handoff Continuation

Pendant un handoff actif, ces messages restent dans le skill sauf intention
concurrente très explicite :

- "plutôt apaisement" ;
- "plus doux" ;
- "pas de suivi" ;
- "redis-moi" ;
- "où je la lance ?" ;
- "ok vas-y" ;
- "active-la" ;
- "pas de potion".

Mappage attendu :

- précision ou variation -> `revise_handoff` ;
- "redis-moi", "où je la lance ?" -> `repeat_handoff` ;
- `active_handoff_action.type="handoff_apply_attempt"` produit par le
  dispatcher ou le contrat active handoff -> statut local `apply_attempt` ;
- "ok vas-y", "active-la" doivent arriver par ce signal structure, pas par une
  regex locale ;
- "pas de potion" -> `cancelled` ou `blocked`.

Sorties autorisées du handoff :

- safety ;
- one-shot reminder explicite ;
- track progress explicite ;
- status DB clair ;
- changement de sujet explicite.

## Integration Points

- `router/handoff_flow_arbitration.ts` protège la continuité du handoff actif.
- `clarification_tool` clarifie les ambiguïtés internes au domaine.
- `product_surface_registry` fournit `surface_id`, destination et étapes.
- `router/operation_runtime_pipeline.ts` empêche tout runtime d'activation
  potion et retourne un handoff non-mutant.
- `router/effect_ledger_adapter.ts` trace `platform_handoff.select_state_potion`
  sans `committed`.
- `router/final_response_pipeline.ts` autorise le wording handoff honnête et
  bloque tout claim d'activation.

## Allowed Changes

- Améliorer les sous-skills, l'intake ou le generator si le résultat reste un
  handoff non-mutant.
- Ajouter une nouvelle potion au catalogue si la recommandation, le renderer et
  les tests sont mis à jour ensemble.
- Déplacer des legacy guards vers l'intake IA ou `clarification_tool`.
- Ajouter des reason codes de handoff ou de blocage.
- Améliorer les destinations via Product Surface Registry.

## Forbidden Changes

- Réintroduire `executeActivateStatePotion` dans le runtime nominal.
- Appeler `writeStatePotionActivation`, `user_potion_sessions`,
  `user_recurring_reminders` ou `scheduled_checkins` depuis le chat.
- Créer un pending confirmation exécutable.
- Dire "c'est activé", "j'ai lancé", "je t'ai programmé un suivi".
- Transformer `apply_attempt` en exécution.
- Ajouter des regex métier dans `intake.ts`, `router.ts`, `run.ts` ou
  `operation_runtime_pipeline.ts`.
- Hardcoder une destination produit si le Product Surface Registry expose une
  surface canonique.

## Legacy Exceptions

- `executor.ts` et `persistence.ts` peuvent rester dans le repo pour référence
  legacy tant qu'ils ne sont pas importés par le runtime V1 handoff.
- `policy.ts` peut conserver des hard consent guards qui bloquent ou annulent :
  no-potion, refus follow-up, exit potion. Ces guards ne remplissent pas de
  slots et ne créent aucun effet.
- Les clés tempMemory historiques peuvent rester supportées pendant la
  migration, mais le chemin nominal doit écrire un état handoff dédié.

## Required Tests

Tests propriétaires :

- handoff complet avec renderer : état compris, recommandation, préserver,
  éviter, destination, no-mutation ;
- aucun confirmation token ;
- aucun appel `executeActivateStatePotion` ;
- aucun appel `writeStatePotionActivation` ;
- aucune création `user_potion_sessions`, `user_recurring_reminders` ou
  `scheduled_checkins` ;
- `apply_attempt` ne mute pas et répète la destination plateforme ;
- `apply_attempt` rend une réponse courte : refus de créer/lancer depuis le
  chat, chemin `État / Potions`, potion recommandée et champs utiles à
  renseigner, sans régénérer toute l'analyse ;
- `repeat_handoff` répète la recommandation ;
- `revise_handoff` régénère la recommandation ;
- `no_potion` annule ou bloque proprement ;
- `no_followup` est respecté dans le wording ;
- "redis-moi" dans un handoff actif n'est pas status recap ;
- "ok vas-y" dans un handoff actif n'est pas exécution ;
- one-shot explicite sort proprement vers `create_one_shot_reminder` ;
- safety préempte.

Tests transverses :

```bash
deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/select_state_potion/tests.ts
deno check supabase/functions/sophia-brain/tools/operations/select_state_potion/router.ts
deno check supabase/functions/sophia-brain/tools/operations/select_state_potion/contract.ts
deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/operation_runtime_pipeline_test.ts
deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts
```

QA réelle minimale :

- "Je suis tendu, je veux peut-être une potion, mais pas un suivi."
- "Ok vas-y active-la." après handoff.
- "Redis-moi laquelle choisir."
- "Non, pas de potion, donne-moi juste une phrase pour me poser."

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-29 | No-potion doit être porté par le skill, pas seulement par L4. | Conservé comme contrainte de handoff | `15-chantiers-log.md` |
| 2026-05-30 | `select_state_potion` raisonnait en `SelectStatePotionSkillResult` avec contraintes, effets, ledger local et renderer protégé par `committed_effects`. | Superseded pour le chemin nominal | J46 |
| 2026-06-01 | `select_state_potion` devient un handoff plateforme no-mutation : pas d'activation, pas de follow-up, pas de writer DB depuis le chat. | Active | Architecture handoff V1 |
