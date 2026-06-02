# update_coach_preferences Runtime Contract

## Mental Model

`update_coach_preferences` est désormais un `platform_handoff_skill`.

Il comprend une demande de préférence coach, clarifie si elle est durable ou
ponctuelle, vérifie si elle correspond aux réglages visibles supportés, prépare
une recommandation de réglage et redirige vers les Préférences coach de la
plateforme.

Il ne crée plus de préférence durable depuis le chat.

Forme cible :

```txt
preference intent
-> clarification durable vs ponctuel si besoin
-> preference handoff draft / preview
-> handoff plateforme
-> renderer no-mutation
```

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` / `TurnFrame` / `RouteDecision` pour détecter l'opportunité
  préférence sans parser les valeurs dans `run.ts` ;
- `TurnAgenda` pour représenter `update_coach_preferences` comme
  `platform_handoff`, pas comme effet durable ;
- `clarification_tool` pour durable vs ponctuel, réglage supporté vs non
  supporté, ou préférence vs aide produit ;
- `Active Handoff Arbitration` pour continuer un handoff actif ;
- `Product Surface Registry` pour fournir la destination canonique
  `coach_preferences` ;
- `EffectLedger` pour tracer le handoff non-mutant ;
- `status.ts` et `runtime_policy.ts` pour les lectures read-only des préférences
  existantes.

## Scope Produit

Les seuls réglages durables supportés sont les réglages visibles dans le front :

- `coach.tone`
- `coach.challenge_level`
- `coach.question_tendency`

Les demandes hors de ces réglages, par exemple longueur exacte, emoji, question
finale, ordre action-avant-question ou règle conditionnelle cachée, ne sont pas
stockées depuis le chat. Le skill peut les expliquer, les classer comme demande
ponctuelle ou proposer un mapping partiel honnête vers les trois réglages.

## Runtime Shape

```txt
router/run.ts
  -> operation_runtime_pipeline.ts
  -> maybeRunUpdateCoachPreferencesOperation
  -> state.ts: load active handoff/intake
  -> intake.ts + slot_filler.ts: structured understanding
  -> generator.ts: CoachPreferenceHandoffDraft
  -> state.ts: writeCoachPreferenceHandoffState
  -> renderer.ts: render handoff/no-mutation reply
```

Chemins read-only séparés :

```txt
status question
  -> status.ts: buildCoachPreferencesStatusReply

runtime composer constraints
  -> runtime_policy.ts: loadCoachPreferenceRuntimePolicy
```

`status.ts` et `runtime_policy.ts` peuvent continuer à lire les préférences
existantes en DB. Le flow chat ne doit pas écrire `user_profile_facts`.

## File Ownership

- `tools/operations/update_coach_preferences/contract.ts` possède les types
  stables, le draft handoff et les statuts.
- `tools/operations/update_coach_preferences/intake.ts` et `slot_filler.ts`
  possèdent la compréhension structurée.
- `tools/operations/update_coach_preferences/generator.ts` produit
  `CoachPreferenceHandoffDraft`.
- `tools/operations/update_coach_preferences/state.ts` possède l'état actif
  handoff et les clés tempMemory legacy.
- `tools/operations/update_coach_preferences/router.ts` possède la façade
  runtime et l'adapter `OperationRuntimeResult`.
- `tools/operations/update_coach_preferences/renderer.ts` possède le wording
  no-mutation.
- `tools/operations/update_coach_preferences/status.ts` lit les préférences
  existantes.
- `tools/operations/update_coach_preferences/runtime_policy.ts` traduit les
  préférences existantes en contraintes composer.
- `executor.ts`, token et writer legacy sont hors chemin nominal.

## Inputs

- Message utilisateur courant.
- `TurnFrame` et `RouteDecision`.
- `tempMemory` avec handoff actif éventuel.
- Préférences courantes supportées, en lecture seulement.
- Contexte produit des préférences visibles.
- Résultat de clarification éventuel.

## Outputs

Le résultat nominal contient :

- `toolExecution="platform_handoff"`
- `executedTools=[]`
- `requested_effects=[]`
- `allowed_effects=[]`
- `committed_effects=[]`
- `pending_confirmation=null`
- `platform_handoff.operation_type="update_coach_preferences"`
- `platform_handoff.no_chat_mutation=true`

Le draft canonique est `CoachPreferenceHandoffDraft` :

- `mode="platform_handoff"`
- `no_chat_mutation=true`
- `executable_from_chat=false`
- résumé de la demande utilisateur
- classification durable supportée / durable non supportée / ponctuelle /
  ambiguë
- réglages supportés recommandés
- parties non supportées éventuelles
- destination plateforme et étapes sobres
- décisions manquantes éventuelles

## Invariants

- Les seules clés durables supportées sont `coach.tone`,
  `coach.challenge_level`, `coach.question_tendency`.
- Aucune préférence durable n'est créée/modifiée depuis le chat.
- Pas de pending confirmation exécutable.
- Pas de confirmation token.
- Pas de writer `user_profile_facts`.
- Pas de `executedTools=["update_coach_preferences"]`.
- `committed_effects=[]` sur toutes les branches handoff.
- `apply_attempt` est non-mutant.
- Les préférences existantes peuvent être lues pour status/runtime policy, mais
  pas modifiées par ce flow.
- Les demandes hors réglages visibles sont expliquées ou transformées en
  recommandation partielle, jamais stockées comme règle cachée.

## Router

Le router gère :

- `start_handoff`
- `clarify_durable_vs_punctual`
- `produce_handoff`
- `revise_handoff`
- `repeat_handoff`
- `apply_attempt`
- `punctual_instruction`
- `unsupported_preference`
- `cancel`
- `topic_change`

Pendant un handoff actif, ces messages restent dans le skill sauf intention
concurrente claire :

- "plutôt plus doux"
- "moins de questions"
- "redis-moi quoi changer"
- "ok applique"
- "juste pour cette réponse"

`apply_attempt` ne doit jamais exécuter. Réponse attendue :

```txt
Je ne peux pas l’appliquer directement depuis ce chat. Le réglage est prêt :
<réglage recommandé>. Il ne reste qu’à aller dans les Préférences coach pour
le mettre à jour.
```

## Renderer

Le renderer doit inclure ces informations, mais pas sous forme de fiche
déterministe à libellés fixes. Il doit parler naturellement à l’utilisateur.

1. ce que l’utilisateur veut changer ;
2. durable ou ponctuel ;
3. réglage supporté recommandé ;
4. parties non supportées éventuelles ;
5. destination plateforme ;
6. no-mutation formulé naturellement.

Formulation attendue pour la clôture :

```txt
Il ne reste qu’à aller dans les Préférences coach pour le mettre à jour.
```

Éviter les sorties en style formulaire comme :

```txt
Ce que je comprends :
Durable ou ponctuel :
Réglage supporté recommandé :
Destination plateforme :
Je ne modifie pas tes préférences depuis le chat.
```

Wording interdit dans ce flow :

- "préférence enregistrée"
- "je le garde"
- "c’est modifié"
- "je l’ai appliqué"
- tout succès durable sans mutation produit.

## Forbidden Runtime Paths

Le chemin nominal ne doit plus appeler :

- `executeUpdateCoachPreferences`
- `createConfirmationToken`
- `upsertCoachPreferencesFromDraft`
- `writeCoachPreferencePendingConfirmation`

Aucun pending confirmation exécutable, aucun token d’exécution, aucun writer
`user_profile_facts` et aucun `committed_effects` ne doivent être produits par
ce flow.

## Integration Points

- `router/handoff_flow_arbitration.ts` protège repeat/revise/apply active.
- `product_surface_registry` fournit la destination `coach_preferences`.
- `clarification_tool` clarifie durable vs ponctuel si nécessaire.
- `EffectLedger` trace `platform_handoff.update_coach_preferences`.
- `status_recap` ou product help peuvent lire les préférences existantes sans
  mutation.

## Allowed Changes

- Ajouter un réglage durable seulement s'il existe dans le front et dans le
  registry produit des préférences.
- Améliorer l'intake IA structuré sans ajouter de regex métier.
- Améliorer le renderer si la phrase no-mutation reste obligatoire.
- Extraire le reducer local si les transitions handoff restent identiques.

## Forbidden Changes

- Réintroduire des préférences durables cachées pour emoji, longueur, question
  finale, action-first ou règles conditionnelles.
- Écrire directement dans `user_profile_facts` depuis ce flow.
- Mettre `executedTools` à `update_coach_preferences`.
- Dire "c'est appliqué/enregistré/modifié" depuis ce flow.
- Ajouter une regex métier dans `run.ts` pour décoder une préférence.
- Transformer `ok applique` en execution.

## Legacy Exceptions

- Les chemins historiques d'executor/writer peuvent rester dans le repo pour
  référence ou migration, mais ils sont hors chemin nominal V1.
- `runtime_policy.ts` reste read-only et peut continuer à influencer le style à
  partir des préférences déjà enregistrées.
- `status.ts` peut continuer à lire les anciennes préférences supportées.

## Required Tests

- handoff renderer complet ;
- aucun token ou pending confirmation ;
- aucun appel executor ;
- aucun write `user_profile_facts` ;
- `apply_attempt` non-mutant ;
- `repeat_handoff` répète le réglage recommandé ;
- `revise_handoff` met à jour la recommandation ;
- contrainte ponctuelle sans handoff durable inutile ;
- préférence non supportée expliquée sans write ;
- status des préférences existantes read-only ;
- runtime policy lit toujours les préférences existantes.

## Suivi Des Décisions Architecturales

| Date       | Décision                                                                                                                                    | Statut                    | Référence               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------- |
| 2026-05-30 | `update_coach_preferences` ne persiste que les préférences UI visibles (`tone`, `challenge_level`, `question_tendency`).                    | Active pour la plateforme | J45                     |
| 2026-06-01 | `update_coach_preferences` devient un handoff plateforme no-mutation; le chat prépare une recommandation mais n'écrit plus les préférences. | Active                    | Architecture handoff V1 |
