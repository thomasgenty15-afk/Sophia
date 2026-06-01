# prepare_defense_card Runtime Contract

## Mental Model

`prepare_defense_card` prépare une carte qui protège un moment de risque déjà
identifié ou en cours d'identification. Une carte de défense ne sert pas à
démarrer une action; elle sert à protéger un moment où le user risque de
déraper, éviter, scroller, abandonner, répondre trop vite, ou casser une action
déjà importante.

Le skill possède tout le workflow métier :

- déterminer si le besoin est vraiment défense, attaque, ou ambigu;
- rattacher la carte à une action, un contexte libre ou un plan item;
- collecter `risk_situation`, `trigger`, `defense_goal`,
  `defense_response_hint`;
- produire un brouillon;
- gérer `draft_only`, `create`, `reject/cancel`, `revise`, `explain`,
  `topic_change`;
- préparer les effets;
- créer la carte uniquement après confirmation exploitable;
- rendre la réponse visible uniquement depuis l'état du skill et les effets
  commités.

Phrase d'invariant : **une carte de défense n'existe que si
`committed_effects[0].defense_card_id` prouve l'écriture DB.**

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour;
- `TurnAgenda` pour distinguer `reply`, `effects`, `status`, `memory`,
  `repair`;
- `Confirmation Contract` pour interpréter `approve`, `reject`, `revise`,
  `explain`;
- `EffectLedger` pour ne jamais dire “c'est fait” sans effet commité;
- le contrat local de `prepare_defense_card` pour l'intake, le reducer, les
  effets et le renderer.

Dans le code actuel :

- le dispatcher / agenda global peut orienter le tour vers
  `prepare_defense_card`, mais ne doit pas décider les slots internes ni la
  validation du brouillon;
- `router/run.ts` appelle `maybeRunPrepareDefenseCardOperation` et reçoit un
  `OperationRuntimeResult`; il ne doit pas créer la carte, interpréter
  `approve/reject/revise/explain`, ni écrire la DB;
- `tools/operations/prepare_defense_card/router.ts` lit la frame de tour via
  `loadDefenseCardFrameFromTempMemory`, puis transforme l'état courant + la
  sortie IA du skill en décision runtime;
- `tools/operations/prepare_defense_card/ai_intake.ts` et
  `slot_filler.ts` portent la compréhension métier structurée, notamment
  `tool_fit`, `user_intent`, `constraints`, `draft_review_decision` et les
  slots de défense;
- `tools/operations/prepare_defense_card/contract.ts` définit les effets
  `requested`, `allowed`, `committed`, les contraintes et
  `PrepareDefenseCardSkillResult`;
- `tools/operations/prepare_defense_card/executor.ts` vérifie la confirmation
  avec `verifyExecutorConfirmation` et appelle le writer; il ne produit pas la
  phrase visible de succès;
- `tools/operations/prepare_defense_card/persistence.ts` possède l'écriture
  `user_defense_cards` via `writeDefenseCardFromDraft`;
- `tools/operations/_shared/operation_cycle.ts` centralise uniquement la
  mécanique DB non user-facing de création/récupération du cycle, sans posséder
  le draft défense, la confirmation ou le write `user_defense_cards`;
- `tools/operations/prepare_defense_card/renderer.ts` produit le wording visible
  avec `renderDefenseCardExecuted`, `renderDefenseCardBlocked`,
  `renderDefenseCardFallbackFailed` et `renderDefenseCardSkillResult`;
- l'adaptation vers le runtime global passe par `defenseSkillResult` puis
  `toRuntimeResult` dans `router.ts`.

## Runtime Shape

```txt
router/run.ts
  -> maybeRunPrepareDefenseCardOperation(args)
      -> loadDefenseCardFrameFromTempMemory(tempMemory)
      -> runPrepareDefenseCardAiIntake(...)
          -> fillDefenseCardSlotsWithAi(...)
          -> normalizeDefenseCardSlotFillerOutput(...)
          -> generateDefenseCardDraftWithAi(...)
      -> reducer local dans router.ts
          -> pending / active / recommendation / draft_review
          -> requested_effects / allowed_effects / blocked_effects
      -> executePendingDefenseDraft(...)
          -> createConfirmationToken(...)
          -> executePrepareDefenseCard(...)
              -> verifyExecutorConfirmation(...)
              -> writeDefenseCardFromDraft(...)
      -> committed_effects
      -> renderDefenseCardSkillResult(...)
      -> OperationRuntimeResult pour run.ts
```

Le reducer n'est pas encore extrait dans un fichier `reducer.ts`; il vit dans
`router.ts`. C'est acceptable tant que `run.ts` reste hors métier défense.

## File Ownership

- `tools/operations/prepare_defense_card/contract.ts`
  - source de vérité locale des types `PrepareDefenseCardUserIntent`,
    `PrepareDefenseCardConstraint`, `PrepareDefenseCardEffect`,
    `PrepareDefenseCardCommittedEffect`, `PrepareDefenseCardSkillResult`;
  - helpers de normalisation des intents/constraints.

- `tools/operations/prepare_defense_card/workflow.ts`
  - état métier de l'intake : `DefenseCardIntakeState`,
    `DefenseCardToolSkillState`, `tool_fit`, slots d'attachement, risque,
    trigger, goal et response hint.

- `tools/operations/prepare_defense_card/slot_filler.ts`
  - prompt et normalisation JSON IA;
  - décide `tool_fit.status = "defense" | "attack_better" | "unclear"`;
  - remplit `user_intent`, `constraints`, `draft_review_decision`;
  - aucun fallback regex ne doit y être ajouté.

- `tools/operations/prepare_defense_card/ai_intake.ts`
  - `runPrepareDefenseCardAiIntake` orchestre slot filler + merge d'état +
    génération du brouillon;
  - `technicalFailure` renvoie une sortie technique bloquée avec
    `committed_effects: []`;
  - `generateDefenseCardDraftWithAi` appelle le generator.

- `tools/operations/prepare_defense_card/generator.ts`
  - `runDefenseCardGenerator` produit `DefenseCardDraftV1`.

- `tools/operations/prepare_defense_card/router.ts`
  - propriétaire de la frame tempMemory défense:
    `loadDefenseCardFrameFromTempMemory`, `writeDefenseCardFrameToTempMemory`,
    `clearDefenseCardFrame`;
  - propriétaire de `maybeRunPrepareDefenseCardOperation`;
  - reducer actuel du workflow;
  - prépare `requested_effects`, `allowed_effects`, `blocked_effects`;
  - produit `committed_effects` uniquement après succès executor;
  - adapte le résultat local via `toRuntimeResult`.

- `tools/operations/prepare_defense_card/executor.ts`
  - `executePrepareDefenseCard` vérifie token, pending confirmation, safety et
    consommation du token;
  - appelle uniquement le writer injecté;
  - retourne un résultat technique, pas un message user-facing long.

- `tools/operations/prepare_defense_card/persistence.ts`
  - `writeDefenseCardFromDraft` écrit `user_defense_cards`;
  - crée/récupère le cycle via le helper partagé
    `tools/operations/_shared/operation_cycle.ts::ensureToolOperationCycle(...)`;
  - met à jour `user_plan_items.defense_card_id` quand la carte protège un plan
    item.

- `tools/operations/prepare_defense_card/renderer.ts`
  - seule couche dédiée au wording visible de succès/blocage/fallback;
  - `renderDefenseCardExecuted` ne dit “C'est fait” que si un
    `committed_effect` contient `defense_card_id`.

- `tools/operations/prepare_defense_card/tests.ts`
  - protège le contrat IA, executor, router, `committed_effects`, draft-only,
    explain, reject, revise, tool-fit unclear, et absence de done language sans
    commit.

## Inputs

- `userMessage`;
- `RouteDecision` / `TurnFrame` déjà produits par les couches globales;
- `tempMemory` avec frame défense éventuelle:
  `__pending_tool_skill_confirmation`, `pending_tool_skill_confirmation`,
  `__active_tool_skill_intake`, `active_tool_skill_intake`,
  `__pending_recommendation_operation`;
- `planSnapshot` pour rattacher une défense à un plan item;
- pending draft ou pending recommendation;
- sortie structurée de `runPrepareDefenseCardAiIntake`.

## Outputs

- `PrepareDefenseCardSkillResult` interne:
  - `status`;
  - `user_intent`;
  - `requested_effects`;
  - `allowed_effects`;
  - `committed_effects`;
  - `blocked_effects`;
  - `pending_confirmation`;
  - `debug.reason_code`.
- `OperationRuntimeResult` attendu par `run.ts`:
  - `content`;
  - `nextTempMemory`;
  - `toolExecution`;
  - `executedTools`;
  - `toolSkillRun`.
- DB durable uniquement via `writeDefenseCardFromDraft`.

## Invariants

- Pas de carte créée sans confirmation compatible et token valide.
- Pas de DB write hors `executePrepareDefenseCard` + writer injecté.
- Pas de `executedTools=["prepare_defense_card"]` sans
  `committed_effects[0].defense_card_id`.
- Pas de “C'est fait” sans `committed_effects[0].defense_card_id`.
- `draft_only` et contrainte `no_create` peuvent produire un brouillon et un
  `requested_effect`, mais jamais un `allowed_effect` ni un `committed_effect`.
- `explain`, `reject/cancel`, `revise`, `topic_change`, `ask_question` ne
  créent jamais de carte.
- `tool_fit="attack_better"` ne doit pas produire un mauvais brouillon défense;
  le skill clarifie ou handoff.
- `tool_fit="unclear"` pose une clarification courte.
- Si l'intake IA échoue, le skill bloque techniquement; il ne remplit pas les
  slots par regex.
- `run.ts` ne lit pas les slots défense et ne décide pas approve/reject/revise.

## Integration Points

- `router/run.ts`
  - appelle `maybeRunPrepareDefenseCardOperation`;
  - ne doit pas connaître les détails de pending draft défense.

- `router/turn_intent_arbitrator.ts`
  - peut protéger les flows card actifs contre un status global;
  - ne doit pas ajouter de compréhension métier défense par regex.

- `contracts/confirmation_token.v1.ts` et
  `confirmation/confirmation_token.ts`
  - utilisés via `createConfirmationToken` et `verifyExecutorConfirmation`.

- `tools/operations/_shared/confirmation_review.ts`
  - `reviewToolSkillConfirmationWithAi` sert à relire une confirmation
    pending/recommendation; le sens final reste appliqué dans le router du
    skill.

- `tools/operations/_shared/operation_cycle.ts`
  - centralise uniquement la mécanique DB non user-facing de création/récupération
    du cycle;
  - ne possède ni draft défense, ni confirmation, ni write `user_defense_cards`.

- Effect ledger global
  - le runtime global doit considérer `committed_effects` comme preuve, pas le
    texte de réponse ni le simple `executedTools`.

## Allowed Changes

- Ajouter un slot métier dans `workflow.ts`, `slot_filler.ts` et
  `contract.ts`, avec tests de normalisation.
- Améliorer `renderer.ts` si le wording dépend uniquement du résultat
  contractuel et des `committed_effects`.
- Extraire progressivement le reducer hors `router.ts`, à condition de garder
  les mêmes effets et invariants.
- Ajouter de nouveaux `reason_code` dans `debug` / `blocked_effects` s'ils
  correspondent à un état structuré.
- Améliorer la persistence dans `persistence.ts` sans déplacer l'écriture dans
  `run.ts`.

## Forbidden Changes

- Ajouter une regex L3/L4 pour décider qu'un message est une défense.
- Ajouter un fallback regex dans `slot_filler.ts` ou `ai_intake.ts` pour remplir
  `risk_situation`, `trigger`, `defense_goal` ou `defense_response_hint`.
- Dire “C'est fait” dans l'executor ou dans `run.ts`.
- Ajouter `executedTools=["prepare_defense_card"]` sans `committed_effects`.
- Appeler directement `supabase.from("user_defense_cards").insert(...)` depuis
  `router.ts` ou `run.ts`.
- Confondre défense et attaque: un démarrage d'action appartient à
  `prepare_attack_card`, sauf si le user clarifie qu'il veut protéger un moment
  de risque.
- Effacer une pending confirmation défense depuis un autre domaine sans raison
  d'arbitrage globale documentée.

## Legacy Exceptions

- Les clés tempMemory legacy restent supportées:
  `__pending_tool_skill_confirmation`, `pending_tool_skill_confirmation`,
  `__active_tool_skill_intake`, `active_tool_skill_intake`,
  `__pending_recommendation_operation`.
  Elles restent pour compatibilité cross-turn. Suppression possible quand la
  frame tool-skill globale sera versionnée et migrée.

- Le reducer vit encore dans `router.ts`.
  Ce n'est pas une exception comportementale, mais une dette de structure.
  Suppression possible quand un `reducer.ts` testable portera toutes les
  branches pending/recommendation/active/fresh start.

- `renderDefenseCardSlotQuestion` reste local dans `router.ts` pour les
  questions de slot. Suppression possible quand `renderer.ts` couvrira aussi
  toutes les questions intermédiaires.

- `reviewToolSkillConfirmationWithAi` est encore appelé directement par le
  router pour relire une confirmation/recommandation. Il reste acceptable car il
  renvoie une classification structurée; il ne doit pas devenir un fallback
  regex.

## Required Tests

Le contrat est protégé par :

- `tools/operations/prepare_defense_card/tests.ts`
  - intake structuré sans fallback regex;
  - executor écrit seulement après token;
  - slot filler normalise `draft_only` + `no_create`;
  - draft-only ne crée jamais et ne commit rien;
  - pending draft + create passe par executor;
  - success contient `committed_effects[0].defense_card_id`;
  - explain ne crée pas;
  - reject clear pending;
  - revise préserve attachment/risk;
  - `tool_fit=unclear` pose clarification;
  - failed intake ne marque jamais `executedTools`;
  - writer failure ne dit jamais “C'est fait”;
  - executor retourne un succès technique sans wording long;
  - adapter contract -> runtime mappe `committed_effects` vers
    `executedTools`.

Tests minimaux à lancer après modification :

```bash
deno test --allow-env --allow-net --allow-read \
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts

deno check \
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/router.ts \
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/contract.ts \
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/executor.ts \
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/renderer.ts \
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/persistence.ts \
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts

deno check supabase/functions/sophia-brain/router/run.ts
```

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | `prepare_defense_card` est contract-driven : `committed_effects` est la seule preuve de création et conditionne `executedTools` + “C'est fait”. | Active | J15 / J44 |
| 2026-05-30 | Persistence et renderer sont séparés de l'executor; l'executor retourne un résultat technique. | Active | J15 / J44 |
| 2026-05-30 | Les clés tempMemory legacy restent supportées temporairement pour compatibilité cross-turn. | Legacy temporaire | À supprimer après frame tool-skill versionnée |
| 2026-05-30 | La mécanique commune `user_cycles` peut être partagée via `_shared/operation_cycle.ts`, sans déplacer l'écriture `user_defense_cards` hors de `prepare_defense_card/persistence.ts`. | Active | J62 |
