# prepare_attack_card Runtime Contract

## Mental Model

`prepare_attack_card` est un skill de coaching + handoff plateforme. Il comprend
l'intention, clarifie la cible et la technique, génère un brouillon utile, puis
livre une destination produit. Il ne crée plus de carte depuis le chat.

Forme canonique :

```txt
intent / target routing
  -> intake carte
  -> clarification si besoin
  -> coaching draft
  -> platform handoff
  -> active handoff state
  -> renderer no-mutation
```

Un tour est réussi quand Sophia fournit une carte exploitable à reprendre dans
la destination canonique `attack_cards` du Product Surface Registry, avec
`no_chat_mutation=true`, sans pending confirmation exécutable, sans executor et
sans write DB.

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` / `TurnFrame` / `RouteDecision` pour détecter
  l'opportunité `prepare_attack_card` sans choisir les slots internes ;
- `local reducer contract` pour représenter l'intention comme `platform_handoff`, pas comme
  effet durable ;
- `clarification_tool` pour product help vs préparation de carte, attaque vs
  défense, action existante vs contexte libre ;
- `Active Handoff Arbitration` pour repeat/revise/apply active ;
- `Product Surface Registry` pour fournir la destination canonique
  `attack_cards` ;
- `EffectLedger` pour tracer `platform_handoff.prepare_attack_card`, sans
  commit.

## Runtime Shape

```txt
run.ts / operation_runtime_pipeline.ts
  -> maybeRunPrepareAttackCardOperation
  -> attack_card/router.ts
     -> state.ts load/write/clear handoff frame
     -> slot_filler.ts / ai_intake.ts structured intake
     -> generator draft
     -> renderer.ts no-mutation handoff
  -> OperationRuntimeResult
     toolExecution="platform_handoff"
     executedTools=[]
     committed_effects=[]
```

## File Ownership

- `contract.ts` possède les intents, contraintes, statuts de handoff,
  `AttackCardHandoffDraft` et le reducer non-mutant.
- `state.ts` possède `AttackCardHandoffState`.
- `slot_filler.ts` possède l'intake IA structuré, y compris validation,
  révision, répétition et apply attempt du handoff actif.
- `ai_intake.ts` conserve la génération de draft et les fallbacks techniques,
  mais son résultat doit être adapté en handoff, pas en création.
- `router.ts` possède la façade runtime, l'état local multi-tour et l'adapter
  `OperationRuntimeResult`.
- `renderer.ts` possède le rendu propriétaire no-mutation.
- `executor.ts` et `persistence.ts` sont legacy hors chemin runtime nominal de
  `prepare_attack_card`.

## Handoff Contract

Le draft livré au renderer suit :

```ts
export type AttackCardHandoffDraft = {
  operation_type: "prepare_attack_card";
  mode: "platform_handoff";
  no_chat_mutation: true;
  executable_from_chat: false;
  target_summary: string;
  blocker_summary: string;
  recommendation: {
    technique_label: string;
    why_this_technique: string;
    card_draft_summary: string;
    preserve: string[];
    avoid: string[];
    platform_destination: string;
    platform_steps: string[];
  };
  missing_decisions: string[];
};
```

L'état actif est `AttackCardHandoffState` avec `mode: "platform_handoff"` et
`no_chat_mutation: true`.

## Inputs

- Message utilisateur courant.
- `TurnFrame` / `RouteDecision` et agenda handoff.
- Snapshot plan/action si disponible.
- État actif `AttackCardHandoffState`.
- Résultat de clarification éventuel.
- Destination `attack_cards` issue du Product Surface Registry.

## Outputs

- `AttackCardHandoffDraft`.
- État actif `mode="platform_handoff"`.
- `toolExecution="platform_handoff"`.
- `executedTools=[]`.
- `committed_effects=[]`.
- `platform_handoff.operation_type="prepare_attack_card"`.
- `platform_handoff.surface_id="attack_cards"`.
- Réponse visible no-mutation.

## Router

Le router gère :

- `start_handoff` : intake puis génération du brouillon ;
- `continue_collecting` / `clarify_target` : questions de slots ;
- `produce_handoff` : rendu complet et état actif ;
- `revise_handoff` : régénère la recommandation ;
- `repeat_handoff` : répète la version plateforme ;
- `apply_attempt` : ne fait jamais d'exécution ;
- `cancel` : clear du state local ;
- `topic_change` : laisse un owner concurrent explicite reprendre.

`apply_attempt` répond avec la destination plateforme et la ligne :

```txt
Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes d’attaque.
```

## Invariants

- Aucun insert `user_attack_cards` dans le chemin nominal.
- Aucun appel `executePrepareAttackCard(...)` dans le chemin nominal.
- Aucun appel `insertAttackCardFromDraft(...)` depuis le router.
- Aucun confirmation token créé.
- Aucun pending confirmation exécutable créé.
- `draft_only`, `no_create` et `single_proposal` restent non-mutants.
- `ok crée-la` devient `apply_attempt`, jamais `executed`.
- `redis-moi` en handoff actif reste dans le skill et devient `repeat_handoff`.
- `pas de carte` annule le handoff.
- Un rappel explicite peut sortir du handoff.

## Integration Points

- `local reducer contract` transforme `prepare_attack_card` en `platform_handoff`.
- `handoff_flow_arbitration` protège repeat/revise/apply active.
- `clarification_tool` clarifie attaque vs défense ou aide produit vs action.
- `Product Surface Registry` fournit `surface_id="attack_cards"`.
- `EffectLedger` trace `platform_handoff.prepare_attack_card`, sans commit.
- `prepare_defense_card` reste le owner si le besoin est de protéger un moment
  de risque plutôt que démarrer l'action.

## Renderer

Le rendu propriétaire doit toujours contenir :

1. cible/action comprise ;
2. obstacle ou piège identifié ;
3. technique recommandée ;
4. brouillon de carte ;
5. à préserver ;
6. à éviter ;
7. destination plateforme ;
8. ligne finale no-mutation.

Wording interdit hors tests négatifs :

- `c'est créé` ;
- `j'ai créé` ;
- `je l'ai ajoutée` ;
- `dis oui et je la crée`.

## Allowed Changes

- Ajouter une technique de carte si elle reste dans le draft handoff.
- Améliorer l'intake structuré sans fallback regex métier.
- Améliorer le renderer si la destination et la phrase no-mutation restent
  obligatoires.
- Extraire un reducer dédié si les transitions handoff restent identiques.

## Forbidden Changes

- Réintroduire un insert `user_attack_cards` dans le chemin nominal.
- Créer une pending confirmation exécutable ou un token.
- Transformer `ok crée-la` en execution.
- Faire décider attaque vs défense par regex dans le runtime global.
- Dire "j'ai créé", "c'est ajouté" ou équivalent.

## Legacy Exceptions

- `executor.ts` et `persistence.ts` peuvent rester dans le repo pour référence
  ou migration, mais ils sont hors chemin nominal V1.
- `ai_intake.ts` peut conserver des fallbacks techniques tant qu'ils ne créent
  pas de carte et ne contournent pas le handoff.
- Les clés tempMemory legacy peuvent être lues pour reprendre ou nettoyer un
  ancien flow actif.

## Required Tests

- handoff complet avec tous les blocs renderer ;
- aucun token de confirmation ;
- aucun appel executor ;
- aucun appel writer DB ;
- `apply_attempt` non-mutant ;
- `repeat_handoff` depuis handoff actif ;
- `revise_handoff` régénère la recommandation ;
- `draft_only` / `no_create` sans pending exécutable ;
- `ok crée-la` sans exécution ;
- wording no-mutation et destination plateforme.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-06-01 | `prepare_attack_card` devient un coaching handoff plateforme : brouillon utile, destination `attack_cards`, aucun insert DB depuis le chat. | Active | Architecture handoff V1 |
