# prepare_defense_card Runtime Contract

## Mental Model

`prepare_defense_card` prépare un handoff plateforme pour une carte qui protège
un moment de risque déjà identifié ou en cours d'identification. Une carte de
défense ne sert pas à démarrer une action; elle sert à protéger un moment où le
user risque de déraper, éviter, scroller, abandonner, répondre trop vite, ou
casser une action déjà importante.

Le skill possède tout le workflow métier :

- déterminer si le besoin est vraiment défense, attaque, ou ambigu;
- rattacher la carte à une action, un contexte libre ou un plan item;
- collecter `risk_situation`, `trigger`, `defense_goal`,
  `defense_response_hint`;
- produire un brouillon;
- gérer `draft_only`, `no_create`, `cancel`, `revise`, `explain`,
  `topic_change`, `repeat_handoff`, `apply_attempt`;
- produire un brouillon exploitable;
- livrer la destination plateforme et les étapes de reprise;
- rendre la réponse visible uniquement depuis l'état du skill et le brouillon
  de handoff.

Phrase d'invariant : **`prepare_defense_card` ne crée jamais la carte depuis le
chat. Son succès nominal est un `platform_handoff` avec
`no_chat_mutation=true`, `executedTools=[]` et `committed_effects=[]`.**

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
- `tools/operations/prepare_defense_card/contract.ts` définit l'état de
  handoff, le brouillon de handoff, les contraintes et
  `PrepareDefenseCardSkillResult`;
- `tools/operations/prepare_defense_card/executor.ts` et `persistence.ts` sont
  legacy hors chemin nominal; le router ne doit pas les appeler;
- `tools/operations/prepare_defense_card/renderer.ts` produit le wording visible
  avec `renderDefenseCardHandoff`, les rendus bloqués techniques et les guards
  anti-succès sans mutation;
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
      -> collecting / clarifying / handoff_ready / handoff_delivered
      -> repeat_handoff / revise_handoff / apply_attempt / cancelled
      -> platform_handoff draft
      -> requested_effects=[] / allowed_effects=[] / committed_effects=[]
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
  - prépare l'état actif `platform_handoff`;
  - force `requested_effects=[]`, `allowed_effects=[]`,
    `committed_effects=[]`;
  - adapte le résultat local en `OperationRuntimeResult` non-mutant.

- `tools/operations/prepare_defense_card/executor.ts` et
  `persistence.ts`
  - legacy hors chemin nominal;
  - ne doivent pas être appelés depuis le router runtime
    `prepare_defense_card`;
  - aucune écriture `user_defense_cards` ne doit être déclenchée par ce skill
    depuis le chat.

- `tools/operations/prepare_defense_card/renderer.ts`
  - seule couche dédiée au wording visible handoff/blocage/fallback;
  - rend la situation comprise, le risque, la stratégie, le brouillon, les
    éléments à préserver/éviter, la destination plateforme et la phrase finale
    de non-mutation.

- `tools/operations/prepare_defense_card/tests.ts`
  - protège le contrat IA, le router handoff, draft-only/no-create, repeat,
    apply_attempt, reject, revise, tool-fit unclear, absence de pending
    confirmation exécutable, absence de DB writer et wording no-mutation.

## Inputs

- `userMessage`;
- `RouteDecision` / `TurnFrame` déjà produits par les couches globales;
- `tempMemory` avec frame défense éventuelle:
  `__active_tool_skill_intake`, `active_tool_skill_intake`,
  `__pending_recommendation_operation`;
- `planSnapshot` pour rattacher une défense à un plan item;
- état handoff actif ou recommandation pending;
- sortie structurée de `runPrepareDefenseCardAiIntake`.

## Outputs

- `PrepareDefenseCardSkillResult` interne:
  - `status`;
  - `user_intent`;
  - `requested_effects=[]`;
  - `allowed_effects=[]`;
  - `committed_effects=[]`;
  - `platform_handoff`;
  - `debug.reason_code`.
- `OperationRuntimeResult` attendu par `run.ts`:
  - `content`;
  - `nextTempMemory`;
  - `toolExecution`;
  - `executedTools`;
  - `toolSkillRun`.
- Aucun effet durable. Sortie nominale :
  `toolExecution="platform_handoff"`, `executedTools=[]`,
  `committed_effects=[]`, `platform_handoff.operation_type="prepare_defense_card"`.

## Invariants

- Pas de carte créée depuis le chat.
- Pas de confirmation token pour ce flow.
- Pas de DB write `user_defense_cards`.
- Pas de `executedTools=["prepare_defense_card"]`.
- Pas de `committed_effects`.
- Pas de wording “C'est fait”, “j'ai créé”, “j'ai ajouté”.
- `draft_only` et contrainte `no_create` peuvent produire un brouillon et un
  handoff, mais jamais un pending exécutable.
- `apply_attempt` répète la destination plateforme; il n'exécute jamais.
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
  - ne doit pas connaître les détails du handoff défense.

- `router/turn_intent_arbitrator.ts`
  - peut protéger les flows card actifs contre un status global;
  - ne doit pas ajouter de compréhension métier défense par regex.

- `router/handoff_flow_arbitration.ts`
  - protège les suites `repeat_handoff`, `revise_handoff` et `apply_attempt`
    contre product_help/status trop tôt;
  - laisse sortir safety, one-shot explicite, progress clair, status clair et
    changement de sujet.

- `product_surface_registry`
  - fournit la destination canonique des cartes de défense et les étapes à
    afficher.

- `clarification_tool`
  - clarifie attaque vs défense, product help vs préparation, risque ponctuel vs
    risque récurrent, action existante vs situation libre.

- Effect ledger global
  - trace `platform_handoff.prepare_defense_card`, sans `committed` et sans
    `executedTools`.

## Allowed Changes

- Ajouter un slot métier dans `workflow.ts`, `slot_filler.ts` et
  `contract.ts`, avec tests de normalisation.
- Améliorer `renderer.ts` si le wording dépend uniquement du résultat
  contractuel et des `committed_effects`.
- Extraire progressivement le reducer hors `router.ts`, à condition de garder
  les mêmes effets et invariants.
- Ajouter de nouveaux `reason_code` dans `debug` / `blocked_effects` s'ils
  correspondent à un état structuré.
- Améliorer les helpers legacy dans `executor.ts` / `persistence.ts` seulement
  s'ils restent hors chemin nominal, avec tests structurels prouvant qu'ils ne
  sont pas appelés par le runtime handoff.

## Forbidden Changes

- Ajouter une regex L3/L4 pour décider qu'un message est une défense.
- Ajouter un fallback regex dans `slot_filler.ts` ou `ai_intake.ts` pour remplir
  `risk_situation`, `trigger`, `defense_goal` ou `defense_response_hint`.
- Dire “C'est fait” dans le renderer, l'executor ou dans `run.ts`.
- Ajouter `executedTools=["prepare_defense_card"]`.
- Appeler directement ou indirectement un writer `user_defense_cards` depuis le
  runtime handoff.
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

- `reviewToolSkillConfirmationWithAi` peut rester utilisé pour relire une
  intention de suite, mais son résultat ne peut plus autoriser une exécution. Il
  doit être adapté en `repeat_handoff`, `revise_handoff`, `apply_attempt`,
  `cancelled`, `topic_change` ou clarification.

## Required Tests

Le contrat est protégé par :

- `tools/operations/prepare_defense_card/tests.ts`
  - intake structuré sans fallback regex;
  - slot filler normalise `draft_only` + `no_create`;
  - handoff complet avec contenu renderer;
  - aucun confirmation token, aucun executor, aucun writer défense dans le
    router;
  - draft-only/no-create produit un handoff sans pending exécutable;
  - `apply_attempt` n'exécute jamais;
  - `repeat_handoff` répète le brouillon plateforme;
  - `revise_handoff` régénère la recommandation;
  - reject/cancel clear le handoff actif;
  - `tool_fit=unclear` pose clarification;
  - failed intake ne marque jamais `executedTools`;
  - wording interdit absent et destination plateforme présente.

Tests minimaux à lancer après modification :

```bash
deno test --allow-env --allow-net --allow-read \
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts

deno check \
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/router.ts \
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/contract.ts \
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/renderer.ts \
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts

deno check supabase/functions/sophia-brain/router/run.ts
```

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-06-01 | `prepare_defense_card` devient un coaching handoff plateforme : pas de confirmation token, pas d'executor, pas de DB writer, `executedTools=[]`, `committed_effects=[]`. | Active | J75 |
| 2026-05-30 | `prepare_defense_card` était contract-driven avec création DB après commit. | Superseded | J15 / J44 |
| 2026-05-30 | Persistence et renderer étaient séparés de l'executor; l'executor retournait un résultat technique. | Superseded pour le chemin nominal | J15 / J44 |
| 2026-05-30 | Les clés tempMemory legacy restent supportées temporairement pour compatibilité cross-turn. | Legacy temporaire | À supprimer après frame tool-skill versionnée |
| 2026-05-30 | La mécanique commune `user_cycles` peut être partagée via `_shared/operation_cycle.ts`, sans déplacer l'écriture `user_defense_cards` hors de `prepare_defense_card/persistence.ts`. | Active | J62 |
