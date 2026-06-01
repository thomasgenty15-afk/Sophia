# prepare_attack_card Runtime Contract

## Mental Model

`prepare_attack_card` est le propriétaire L5 complet du cycle carte d'attaque :
intake structuré, brouillon, reprise de brouillon, révision, explication,
annulation, confirmation, effets, écriture DB et rendu user-facing.

Le noyau global peut seulement router le tour vers le skill et appliquer les
effets observés. Il ne doit pas décider `draft_only`, `create`, `reject`,
`revise`, `explain`, `topic_change`, ni créer une carte d'attaque.

Le modèle canonique du domaine est :

```txt
contract -> structured intake -> reducer/state transition
         -> requested/allowed/blocked effects
         -> executor/persistence
         -> committed_effects
         -> renderer
         -> OperationRuntimeResult adapter
```

Une carte d'attaque n'existe côté réponse visible que si un
`committed_effect` contient l'id DB réellement créé.

## Runtime Shape

```txt
run.ts
  -> maybeRunPrepareAttackCardOperation(...)
       router.ts
         -> loadPrepareAttackCardFrameFromTempMemory(...)
         -> runPrepareAttackCardAiIntake(...)
              ai_intake.ts
                -> fillAttackCardSlotsWithAi(...)
                     slot_filler.ts
                -> generator.ts si les slots sont prêts
         -> decidePrepareAttackCardNextStep(...)
              contract.ts
         -> applyPrepareAttackCardInitialDraftDecision(...) ou pending branch
         -> executeConfirmedAttackCardDraft(...)
              executor.ts
                -> executePrepareAttackCard(...)
              persistence.ts
                -> insertAttackCardFromDraft(...)
         -> renderer.ts
         -> adaptPrepareAttackCardResultToOperationRuntime(...)
```

États mémoire actuels :

- `__active_tool_skill_intake` : collecte de slots, pas de droit d'exécution.
- `__pending_attack_card_draft_review` : brouillon consultable/révisable,
  `executable: false`.
- `__pending_tool_skill_confirmation` : pending exécutable uniquement après
  demande de création ou validation claire.
- `__pending_recommendation_operation` : offre produit à convertir par le
  skill avant tout pending.

## Dépend De L'Architecture De prepare_attack_card

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour ;
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair ;
- `Confirmation Contract` pour interpréter approve/reject/revise/explain ;
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé ;
- le contrat local de `prepare_attack_card` pour l'intake, le reducer, les
  effets et le renderer.

Utilisation actuelle dans le code :

- `UserTurnSnapshot` et `TurnAgenda` sont construits côté orchestration globale
  en trace/filtrage. `prepare_attack_card/router.ts` ne les importe pas encore
  directement ; il reçoit les projections nécessaires via `TurnFrame`,
  `RouteDecision`, `tempMemory` et `planSnapshot`.
- `TurnFrame.tool_skill_intents` sert uniquement à l'admission du tour dans
  `operationRouteIsSelected(...)`. Ces hints ne sont pas autoritaires pour le
  métier carte.
- `TurnFrame.confirmation_response` est lu par
  `detectStructuredAttackCardConfirmation(...)` seulement pour distinguer
  `yes/no` structurés dans le cas recommandation. Le skill ne fait pas de regex
  oui/non locale.
- `router/confirmation_contract.ts` est utilisé via
  `normalizeSkillConfirmationReview(...)` et
  `buildConfirmationDecisionFromSkillReview(...)`. Il fournit le vocabulaire
  commun, mais `prepare_attack_card` garde l'application métier dans
  `decidePrepareAttackCardNextStep(...)`.
- L'équivalent local de l'EffectLedger est le quatuor
  `requested_effects`, `allowed_effects`, `blocked_effects`,
  `committed_effects` dans `PrepareAttackCardSkillResult`. L'adapter
  `adaptPrepareAttackCardResultToOperationRuntime(...)` ne pose
  `executedTools: ["prepare_attack_card"]` que si
  `committed_effects.length > 0`.
- `executeConfirmedAttackCardDraft(...)` ne rend un `committed_effect` que si
  `executePrepareAttackCard(...)` retourne `status: "executed"` avec
  `attack_card_id`.

## File Ownership

- `tools/operations/prepare_attack_card/contract.ts`
  - possède `PrepareAttackCardUserIntent`,
    `PrepareAttackCardConstraint`, `PrepareAttackCardEffect`,
    `PrepareAttackCardCommittedEffect`, `PrepareAttackCardSkillResult` ;
  - normalise intent/constraints ;
  - contient le reducer métier `decidePrepareAttackCardNextStep(...)`.

- `tools/operations/prepare_attack_card/slot_filler.ts`
  - possède l'appel IA de slot filling `fillAttackCardSlotsWithAi(...)` ;
  - produit `user_intent`, `constraints`, `state_patch`,
    `draft_review_decision` ;
  - normalise la sortie via `normalizeAttackCardSlotFillerOutput(...)`.

- `tools/operations/prepare_attack_card/ai_intake.ts`
  - orchestre l'intake structuré `runPrepareAttackCardAiIntake(...)` ;
  - merge state courant + sortie slot filler ;
  - déclenche la génération de draft si les slots sont prêts ;
  - retourne `technical_blocked`, pas une création opportuniste, si l'IA ou la
    génération échoue.

- `tools/operations/prepare_attack_card/workflow.ts`
  - définit les slots et états métier (`AttackCardIntakeState`,
    `AttackCardToolSkillState`).

- `tools/operations/prepare_attack_card/router.ts`
  - possède la façade runtime `maybeRunPrepareAttackCardOperation(...)` ;
  - charge/écrit/clear le frame tempMemory ;
  - convertit le résultat canonique en `OperationRuntimeResult` ;
  - ne dépend plus de `router/run.ts` pour décider le métier carte.

- `tools/operations/prepare_attack_card/executor.ts`
  - possède `executePrepareAttackCard(...)` ;
  - vérifie token, pending compatible, safety et consommation avant tout write.

- `tools/operations/prepare_attack_card/persistence.ts`
  - possède `insertAttackCardFromDraft(...)` ;
  - écrit `user_attack_cards` et met à jour le plan item si applicable ;
  - appelle le helper partagé
    `tools/operations/_shared/operation_cycle.ts::ensureToolOperationCycle(...)`
    pour créer/récupérer le `user_cycle` technique commun aux cartes ;
  - ne construit aucune réponse user-facing.

- `tools/operations/prepare_attack_card/renderer.ts`
  - possède `renderAttackCardDraftOnlyReply(...)`,
    `renderAttackCardPendingConfirmationReply(...)`,
    `renderAttackCardExecutedReply(...)`,
    `renderAttackCardFailedReply(...)`,
    `renderAttackCardCancelledReply(...)`,
    `renderAttackCardExplanationReply(...)`.

- `tools/operations/prepare_attack_card/run_support.ts`
  - contient les helpers skill-local restants : target extraction,
    preference single-technique, keyword/recent-card guards, rendu de question
    de slot.

## Inputs

- `userMessage`, `channel`, `timezone`, `sourceMessageId`, `requestId`.
- `TurnFrame` : intents de routage et confirmation structurée.
- `RouteDecision` : sélection de handler, jamais décision métier interne.
- `tempMemory` : active intake, draft review, pending confirmation,
  recommendation.
- `planSnapshot` : liste d'items disponibles pour rattacher la cible.
- `safetyPregateOutput.risk_band` : transmis à l'executor.
- `operation_input` de recommandation ou dernier plan item résolu si présent.

## Outputs

- Question de slot (`status: "ask_question"`) sans effet durable.
- Brouillon consultable (`status: "draft_ready"`) dans
  `__pending_attack_card_draft_review`.
- Pending de création (`status: "pending_confirmation"`) dans
  `__pending_tool_skill_confirmation`.
- Annulation/rejet (`status: "cancelled"`) avec clear du frame.
- Explication (`status: "explained"`) sans commit et pending conservé.
- Révision (`status: "revised"`) qui régénère ou redemande une précision.
- Blocage technique (`status: "technical_blocked"` côté intake/runtime) sans
  `executedTools`.
- Exécution (`status: "executed"`) uniquement avec
  `committed_effects: [{ type: "create_attack_card", attack_card_id, ... }]`.

## Responsibilities

Appartient à `prepare_attack_card` :

- comprendre `draft_only`, `create`, `cancel`, `reject`, `revise`,
  `explain`, `topic_change`, `status_question`, `clarify` via JSON structuré ;
- conserver et reprendre un brouillon ;
- distinguer brouillon consultable et pending exécutable ;
- décider quels effets create sont requested/allowed/blocked ;
- créer la carte DB uniquement via executor + persistence ;
- rendre une réponse cohérente avec l'effet réellement committé ;
- nettoyer son propre frame tempMemory.

N'appartient pas à `prepare_attack_card` :

- décider le route owner global ;
- remplir des slots par regex L3/L4 ;
- confirmer un brouillon depuis `router/run.ts` ;
- créer une carte depuis `ai_intake.ts`, `generator.ts`, `slot_filler.ts` ou
  `persistence.ts` sans passer par l'executor ;
- rendre un status global durable sur toutes les cartes ;
- résoudre les conflits cross-skill génériques hors admission/clear local.

## Invariants

- `draft_only` ou contrainte `no_create` ne crée jamais de pending exécutable.
- `__pending_attack_card_draft_review` ne peut jamais produire un write DB.
- `__pending_tool_skill_confirmation` est le seul état convertible en création.
- `create` exige un pending compatible, une cible complète, un draft complet,
  safety OK et token valide.
- `reject`, `cancel`, `revise`, `explain`, `topic_change`,
  `status_question`, `clarify` n'exécutent jamais.
- Aucun insert DB hors `executePrepareAttackCard(...)` +
  `insertAttackCardFromDraft(...)`.
- Aucun `executedTools: ["prepare_attack_card"]` sans `committed_effects`.
- Aucun "C'est fait" dans le renderer failed/blocked/draft/explain/revise.
- Le writer DB ne doit jamais construire une phrase user-facing.
- Le slot filler ne doit pas avoir de fallback regex si l'IA échoue.
- Un vieux flow defense-card prioritaire bloque la prise de main attack-card.

## Integration Points

- `router/run.ts` appelle seulement `maybeRunPrepareAttackCardOperation(...)`
  dans la chaîne des operation runtimes.
- `router/turn_intent_arbitrator.ts` peut router vers le skill, mais ses
  `tool_skill_intents[].user_intent` restent des hints faibles.
- `router/confirmation_contract.ts` fournit le vocabulaire review commun ;
  l'application métier reste dans `contract.ts`.
- `confirmation/confirmation_token.ts` fournit le token vérifié par
  `executePrepareAttackCard(...)`.
- `tools/operations/prepare_defense_card/router.ts` est consulté seulement pour
  éviter de capturer un flow defense-card actif.
- `tools/operations/_shared/operation_cycle.ts` centralise uniquement la
  mécanique DB non user-facing de création/récupération du cycle. Il ne possède
  ni draft, ni confirmation, ni write de carte.
- `EffectLedger` doit consommer `toolSkillRun.committed_effects` quand
  l'adapter global est branché.

## Allowed Changes

- Ajouter un intent ou une contrainte dans `contract.ts`, puis dans le prompt
  JSON de `slot_filler.ts` et les tests.
- Ajouter un reason code `technical_blocked` si le chemin reste non-mutant.
- Améliorer `renderer.ts` sans changer les conditions de commit.
- Ajouter une technique dans `generator.ts` si les normalizers et tests suivent.
- Ajouter un helper de tempMemory skill-local si `run.ts` reste ignorant du
  détail métier.

## Forbidden Changes

- Ajouter dans `run.ts` ou L3/L4 une regex métier du type "sans créer",
  "ok crée-la", "montre le brouillon".
- Réintroduire `isAttackCardExplicitApprovalForTest` ou équivalent global.
- Ecrire `user_attack_cards` depuis `router.ts` hors wrapper executor ou depuis
  un writer qui ne vérifie pas la confirmation.
- Utiliser `confirmation_message` généré pour un état `draft_only`.
- Marquer `toolExecution: "success"` ou `executedTools` sur un échec executor.
- Transformer une question status/product-help en création de carte.
- Supprimer `__pending_attack_card_draft_review` sans raison métier
  structurée.

## Legacy Exceptions

- `run_support.ts:userExplicitlyAsksForNewAttackCard(...)` est un garde
  skill-local anti-duplication après création récente. Il protège le cas où le
  user parle de la carte active au lieu de demander une nouvelle carte. Il doit
  rester non-mutant et disparaître quand le status/product-help + TurnAgenda
  interrompent correctement ce cas sans garde textuelle.
- `run_support.ts:isAttackCardLocationOrManagementQuestion(...)` est un garde
  d'admission pour laisser product-help/status répondre aux questions
  d'emplacement ou gestion. Il doit disparaître quand le route owner global
  distingue ces questions sans heuristique locale.
- `slot_filler.ts:refineAttackCardTechniqueFit(...)` contient une logique
  déterministe de fit technique après JSON IA. Elle est tolérée en L6 comme
  garde de payload concret anti-faux-positif, avec tests dédiés. Elle ne peut
  pas décider create/draft/cancel.
- `run_support.ts:applyAttackCardSingleTechniquePreference(...)` est une
  préférence de présentation de question, pas une compréhension d'intent. Elle
  ne peut pas produire d'effet durable.

Toute nouvelle exception legacy doit être listée ici et dans
`15-chantiers-log.md` avec condition de suppression.

## Required Tests

Tests module :

- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts`
  - normalisation `user_intent=draft_only` + `no_create` ;
  - draft-only initial stocke un review draft, pas un pending exécutable ;
  - renderer draft/pending/executed/failed ;
  - approve pending compatible autorise create ;
  - pending incompatible bloque create ;
  - show/reject/revise/topic_change sans effet DB ;
  - single_proposal/no_extra_options conservés ;
  - executor token + pending guard.

- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/prepare_attack_card_fallback_test.ts`
  - AI indisponible => `technical_blocked` ;
  - aucun `committed_effects` ni `executedTools` sur fallback technique ;
  - route runtime failed/blocked ne dit pas "c'est fait".

Tests routing à maintenir :

- `supabase/functions/sophia-brain/router/turn_intent_arbitrator.test.ts`
  pour vérifier que L3 route vers le skill sans imposer le métier.
- `supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  pour status/product-help vs pending card, dès que le graphe global `run.ts`
  redevient type-checkable.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | `prepare_attack_card` possède localement `contract -> intake -> reducer -> effects -> executor -> renderer`; `run.ts` ne doit plus décider create/draft_only/cancel. | Active | `15-chantiers-log.md` prepare_attack_card ownership L5 |
| 2026-05-30 | `__pending_attack_card_draft_review` est distinct du pending exécutable ; un brouillon demandé "sans créer" ne peut pas être exécuté. | Active | `tests.ts` initial draft-only |
| 2026-05-30 | `committed_effects` est la seule preuve autorisant `executedTools` et une réponse "C'est fait". | Active | `renderer.ts`, `contract.ts`, `executor.ts` |
| 2026-05-30 | Les anciens `fallback_dashboard` du domaine doivent être représentés comme `technical_blocked` non-mutant. | Active | `prepare_attack_card_fallback_test.ts` |
| 2026-05-30 | La mécanique commune `user_cycles` peut être partagée via `_shared/operation_cycle.ts`, sans déplacer l'écriture `user_attack_cards` hors de `prepare_attack_card/persistence.ts`. | Active | J62 |
