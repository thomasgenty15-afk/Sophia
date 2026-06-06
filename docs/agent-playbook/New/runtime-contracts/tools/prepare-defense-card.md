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
- collecter l'unique champ UI de la plateforme, `support_need`, dont le libellé
  visible est: "Avec quelle situation / contexte / environnement / pulsion
  as-tu besoin d'aide ?";
- gérer `draft_only`, `no_create`, `cancel`, `revise`, `explain`,
  `topic_change`, `repeat_handoff`, `apply_attempt`;
- produire un handoff d'inputs plateforme exploitable;
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
  sortie IA du skill en décision runtime; il peut convertir
  `TurnFrame.tool_skill_intents` en graine structurée `operation_input`
  (`target_hint`, `operation_input`, `payload_hint`) sans analyser le texte brut
  du user;
- `tools/operations/prepare_defense_card/ai_intake.ts`, `slot_filler.ts` et
  `platform_field_filler.ts` portent la compréhension structurée :
  `slot_filler.ts` garde les gros slots métier (`tool_fit`, cible, risque,
  trigger, réponse de défense), puis `platform_field_filler.ts` remplit les
  champs UI de la plateforme sans générer de carte finale; pour la défense, il
  n'y a qu'un champ UI nominal: `support_need`;
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
          -> fillDefenseCardPlatformFieldsWithAi(...)
  -> reducer local dans router.ts
      -> collecting / clarifying / handoff_ready / handoff_delivered
      -> repeat_handoff / revise_handoff / apply_attempt / cancelled
      -> platform_handoff fields
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
    intake des champs plateforme;
  - accepte une graine `operation_input` structurée produite en amont, mais ne
    remplit pas les slots métier depuis une regex sur le message brut;
  - si des slots restent manquants sur une demande directe et que le slot filler
    n'a pas fourni de phrase, produit une clarification courte déterminée par le
    slot manquant au lieu d'un blocage technique générique;
  - `technicalFailure` renvoie une sortie technique bloquée avec
    `committed_effects: []`;
  - `generateDefenseCardDraftWithAi` appelle le generator.

- `tools/operations/prepare_defense_card/platform_fields.ts`
  - catalogue canonique du vrai champ UI à renseigner;
  - helpers de création, normalisation et merge de `platform_fields`;
  - `support_need` est requis pour `free_card` et `plan_item_card`;
  - les anciens identifiants `entry_need`, `risk_moment`, `first_signal`,
    `defense_response`, `fallback_plan` sont legacy et ne doivent pas être
    exposés comme champs plateforme.

- `tools/operations/prepare_defense_card/platform_field_filler.ts`
  - sous-skill IA dédié au champ UI `support_need`;
  - peut utiliser plusieurs éléments utilisateur dans un même tour pour formuler
    la réponse au champ unique;
  - distingue `missing`, `proposed` et `locked`;
  - ne génère jamais de titre, brouillon, stratégie, plan B ou modèle de carte.

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
  - rend uniquement la destination plateforme, les champs à remplir et la phrase
    finale de non-mutation;
  - évite de répéter en résumé les mêmes informations déjà présentes dans les
    champs UI.

- `tools/operations/prepare_defense_card/tests.ts`
  - protège le contrat IA, le router handoff, draft-only/no-create, repeat,
    apply_attempt, reject, revise, tool-fit unclear, absence de pending
    confirmation exécutable, absence de DB writer et wording no-mutation.

## Inputs

- `userMessage`;
- `RouteDecision` / `TurnFrame` déjà produits par les couches globales;
  `TurnFrame.tool_skill_intents[].target_hint` et `operation_input` peuvent
  amorcer l'attache libre ou le risque seulement comme contexte structuré;
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
- `draft_only` et contrainte `no_create` peuvent produire un handoff d'inputs
  plateforme, mais jamais un pending exécutable.
- `apply_attempt` répète la destination plateforme; il n'exécute jamais.
- `apply_attempt` ne réaffiche pas tout le handoff si celui-ci vient d'être
  livré; il répond brièvement que la création chat est impossible et rappelle
  seulement où reprendre les champs dans la plateforme.
- `explain`, `reject/cancel`, `revise`, `topic_change`, `ask_question` ne
  créent jamais de carte.
- `tool_fit="attack_better"` ne doit pas produire un mauvais brouillon défense;
  le skill clarifie ou handoff.
- `tool_fit="unclear"` pose une clarification courte.
- Si le slot filler signale des slots manquants mais omet
  `generated_user_message`, `ai_intake.ts` pose une clarification locale basée
  sur le slot manquant; ce n'est pas un remplissage métier de slots.
- Le chemin nominal ne doit pas appeler `generateDefenseCardDraftWithAi` ni
  `draft_generator`; le handoff est construit depuis `platform_fields`.
- Le champ UI `support_need` ne passe `locked` que si la situation, le contexte,
  l'environnement ou la pulsion sont clairs ou validés par le user; une valeur
  utile mais non explicite reste `proposed`.
- `risk_moment`, `first_signal`, `defense_response` et `fallback_plan` peuvent
  rester des indices internes d'intake, mais ne sont pas affichés comme champs
  plateforme.
- Le renderer de handoff ne doit pas afficher “version à reprendre”,
  “brouillon”, “champs finaux à recopier”, “à préserver” ou “à éviter”.
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
- Modifier le champ UI canonique dans `platform_fields.ts` seulement si l'UI
  plateforme change réellement, puis mettre à jour `platform_field_filler.ts`,
  le renderer et les tests field-aware.
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
- Construire le champ UI final depuis un draft IA.
- Afficher `risk_moment`, `first_signal`, `defense_response`, `fallback_plan`,
  "promesse", "moment", "signal" ou "geste" comme champs plateforme.
- Afficher un brouillon ou un modèle de carte dans le handoff nominal.
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
  - field intake verrouille `support_need` quand la situation/contexte/pulsion
    sont explicites;
  - field intake ne verrouille pas une valeur vague ou déduite;
  - correction met à jour `support_need`;
  - route plan item utilise aussi le champ unique `support_need`;
  - chemin nominal n'appelle pas `draft_generator`;
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
| 2026-06-02 | Le router peut transmettre les signaux structurés du `TurnFrame` comme graine `operation_input`; l'intake clarifie localement quand seule la phrase de question manque, sans regex métier ni mutation. | Active | J75 |
| 2026-06-03 | Le handoff nominal `prepare_defense_card` est field-aware sur l'unique champ UI réel `support_need`; le renderer n'affiche plus de brouillon ni de pseudo-formulaire multi-champs, et `draft_generator` est hors chemin nominal. | Active | J76 / J78 |
| 2026-05-30 | `prepare_defense_card` était contract-driven avec création DB après commit. | Superseded | J15 / J44 |
| 2026-05-30 | Persistence et renderer étaient séparés de l'executor; l'executor retournait un résultat technique. | Superseded pour le chemin nominal | J15 / J44 |
| 2026-05-30 | Les clés tempMemory legacy restent supportées temporairement pour compatibilité cross-turn. | Legacy temporaire | À supprimer après frame tool-skill versionnée |
| 2026-05-30 | La mécanique commune `user_cycles` peut être partagée via `_shared/operation_cycle.ts`, sans déplacer l'écriture `user_defense_cards` hors de `prepare_defense_card/persistence.ts`. | Active | J62 |
