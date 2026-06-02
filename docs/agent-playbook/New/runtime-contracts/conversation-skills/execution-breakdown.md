# execution_breakdown Runtime Contract

## Mental Model

`execution_breakdown` est un conversation skill L5. Il possède le diagnostic
d'exécution d'un tour : cible, type de blocage, readiness, dominance
émotionnelle, contraintes de réponse, handoff éventuel vers `emotional_repair`,
et suggestions d'opérations consenties.

Il ne possède aucun effet durable. Il ne crée pas de carte, ne modifie pas de
plan, n'écrit pas en base et ne dit jamais qu'un effet est fait. Quand une carte
ou un ajustement de plan est pertinent, il produit uniquement une
`operation_suggestion` avec `requires_user_consent: true`; l'exécution
appartient au tool skill concerné.

## Runtime Shape

```txt
router/run.ts
  -> runConversationSkillForRecommendation(...)
  -> case "execution_breakdown": await runExecutionBreakdownSkill(input)

skills/execution_breakdown/skill.ts
  -> buildExecutionBreakdownIntakeInput(...)
  -> runExecutionBreakdownStructuredIntake(...)
  -> reduceExecutionBreakdownTurn(...)

skills/execution_breakdown/intake.ts
  -> defaultExecutionBreakdownIntakeModel(...) via generateWithGemini(...)
  -> normalizeExecutionDecision(...)
  -> conservativeExecutionDecision(...) seulement si echec technique

skills/execution_breakdown/reducer.ts
  -> applyExecutionInvariants(...)
  -> toConversationOperationSuggestions(...)
  -> toMemoryWriteCandidates(...)
  -> conversationEffectsFromCandidates(...)
  -> baseOutput(...)

skills/execution_breakdown/renderer.ts
  -> renderExecutionBreakdownReply(...)
```

Le chemin normal est donc :

```txt
structured intake IA -> contract validation -> invariants -> reducer/output -> renderer
```

Il n'y a pas de fallback lexical métier dans le chemin normal. Un échec d'IA
produit un fallback technique conservateur, sans suggestion tool ni reply
skill-authored métier.

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour ;
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair ;
- `Confirmation Contract` pour garantir qu'un handoff complexe n'est pas une
  confirmation exécutable ;
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé ;
- le contrat local de X pour l'intake, le reducer, les effets et le renderer.

Usage concret dans le code actuel :

- `UserTurnSnapshot` n'est pas encore matérialisé comme objet unique dans ce
  skill. Son équivalent opérationnel est construit par
  `buildExecutionBreakdownIntakeInput(...)` dans
  `supabase/functions/sophia-brain/skills/execution_breakdown/intake.ts` à
  partir de `RunSkillInput.context` : `recent_messages`,
  `active_skill_working_state`, `turn_frame`, `plan_items`, préférences runtime
  et `user_id`.
- `TurnAgenda` est consommé indirectement via `turn_frame` compacté dans
  `compactTurnFrame(...)` : `skill_signals`, `tool_skill_opportunity`,
  `direct_effects`, `memory_plan`, `safety` et `action_reference`. Le skill ne
  réinterprète pas le message brut dans `run.ts`; l'agenda métier est porté par
  `ExecutionDecision.phase`, `response_contract`, `handoff_request`,
  `operation_suggestions` et `memory_write_candidates`.
- `Confirmation Contract` n'est pas interprété par `execution_breakdown`. Ce
  skill ne reçoit pas une confirmation de création/modification : il suggère
  seulement `prepare_attack_card`, `prepare_defense_card` ou `adjust_plan_item`
  comme platform handoff skills. Les suites `approve/reject/revise/explain`
  appartiennent au handoff actif propriétaire et ne deviennent pas des
  confirmations exécutables.
- `EffectLedger` est respecté par absence de mutation durable. Dans
  `reducer.ts`, `conversationEffectsFromCandidates(...)` expose des candidats
  (`operation_suggestions`, `memory_write_candidates`, `handoff_request`) mais
  aucun `committed_effect` de création/modification n'est produit par ce skill.
  `contract.ts` bloque le done language via `sanitizeReply(...)`.
- Le contrat local est `ExecutionDecision` dans
  `skills/execution_breakdown/contract.ts`. Il est le seul format autorisé pour
  target, blocker, readiness, emotional dominance, constraints,
  response_contract, handoff, suggestions consenties, memory candidates, reply
  et `state_patch`.

## File Ownership

- `supabase/functions/sophia-brain/skills/execution_breakdown/contract.ts`
  possède les types `ExecutionDecision`, `ExecutionTarget`, `ExecutionBlocker`,
  `ExecutionConstraint`, `ExecutionResponseContract`,
  `ExecutionOperationSuggestion`, `ExecutionMemoryCandidate`, ainsi que
  `normalizeExecutionDecision(...)`, `applyExecutionInvariants(...)`,
  `conservativeExecutionDecision(...)`,
  `toConversationOperationSuggestions(...)` et `toMemoryWriteCandidates(...)`.
- `supabase/functions/sophia-brain/skills/execution_breakdown/intake.ts` possède
  l'intake structuré L5 : `ExecutionBreakdownStructuredIntakeInput`,
  `ExecutionBreakdownIntakeModel`, `buildExecutionBreakdownIntakeInput(...)`,
  `runExecutionBreakdownStructuredIntake(...)` et
  `defaultExecutionBreakdownIntakeModel(...)`.
- `supabase/functions/sophia-brain/skills/execution_breakdown/prompt.ts` possède
  `EXECUTION_BREAKDOWN_PROMPT` et `EXECUTION_BREAKDOWN_PROMPT_VERSION`. Le
  prompt rappelle les priorités : cible avant diagnostic, geste concret avant
  question, phrase exacte, handoff émotionnel seulement si l'émotion domine, et
  suggestions tool consenties.
- `supabase/functions/sophia-brain/skills/execution_breakdown/reducer.ts`
  possède la transition du tour via `reduceExecutionBreakdownTurn(...)`. Il
  applique les invariants, convertit les suggestions/candidats mémoire et
  construit le `ConversationSkillOutput`.
- `supabase/functions/sophia-brain/skills/execution_breakdown/renderer.ts`
  possède le rendu user-facing minimal via `renderExecutionBreakdownReply(...)`.
  Il ne classifie pas le message user.
- `supabase/functions/sophia-brain/skills/execution_breakdown/context_loader.ts`
  possède le chargement de contexte via `loadExecutionBreakdownContext(...)` :
  plan inclus, produit exclu, mémoire sensible et safety memory exclues.
- `supabase/functions/sophia-brain/router/run.ts` ne possède pas la logique
  métier. Il appelle seulement `await runExecutionBreakdownSkill(input)` dans
  `runConversationSkillForRecommendation(...)`.
- Les recommandations complexes appartiennent aux platform handoff skills :
  `tools/operations/prepare_attack_card`,
  `tools/operations/prepare_defense_card` et
  `tools/operations/adjust_plan_item`.

## Inputs

- `user_message` du tour courant.
- `recent_messages` pour contexte court.
- `active_skill_working_state` si le skill continue un état en cours.
- `turn_frame` produit par L1/L2 : signaux, opportunités tool, effets directs,
  mémoire, safety et référence d'action.
- `plan_items` chargés par `loadExecutionBreakdownContext(...)`.
- préférences runtime disponibles dans `turn_frame.skill_signals`.
- `intake_model` optionnel pour tests stubbés.

## Outputs

- `reply` courte, issue de la décision structurée puis sanitizée par le contrat.
- `diagnosis.execution_decision` quand l'intake est OK.
- `diagnosis.intake_status` : `"ok"` ou `"technical_fallback"`.
- `handoff_request` vers `emotional_repair` si l'émotion domine.
- `operation_suggestions` consenties, jamais exécutées.
- `memory_write_candidates` en `should_persist_default: false`.
- `effects` conversationnels construits depuis les candidats, sans effet durable
  committé par ce skill.
- `state_patch` limité à l'état conversationnel du skill.

## Responsibilities That Belong To X

- Décider explicitement quelle action est ciblée, avec `target.kind`,
  `plan_item_id`, `title`, `raw_label` et `confidence_band`.
- Décider le `blocker` : flou, friction de démarrage, énergie, peur,
  environnement, action trop grande, risque de rechute, relationnel ou inconnu.
- Décider `action_readiness`, `emotional_dominance`, `constraints` et
  `response_contract`.
- Produire une micro-action ou une phrase exacte quand le user la demande.
- Demander une seule cible courte si la cible est floue.
- Demander un handoff vers `emotional_repair` quand l'émotion domine.
- Suggérer, avec consentement, le bon type d'opération parmi attack card,
  defense card ou adjust plan.
- Filtrer les suggestions incompatibles avec les contraintes contractuelles.

## Responsibilities That Do Not Belong To X

- Router globalement une nouvelle intention : c'est L1/L2/L3.
- Ajouter une exception métier dans `run.ts`.
- Exécuter un tool, créer une carte, modifier un plan ou écrire en base.
- Interpréter une confirmation utilisateur pour un handoff complexe.
- Produire un `committed_effect` durable.
- Persister une mémoire par défaut : les candidats mémoire restent
  `should_persist_default: false`.
- Deviner la cible depuis le premier `plan_item` hors décision structurée.
- Réintroduire un matching lexical pour choisir target, blocker, handoff ou tool
  suggestion.

## Invariants

- Cible avant diagnostic : si `target.confidence_band === "low"`, la phase est
  `resolve_target`, sans suggestion card ou plan edit.
- Geste concret avant question : si la contrainte `concrete_before_question` est
  présente, `response_contract` force `must_start_with_concrete_action`.
- `no_questions` force `max_questions: 0`; `one_question_max` empêche toute
  réponse à plusieurs questions.
- `exact_phrase_requested` autorise et exige une phrase prête à envoyer.
- `emotional_dominance: "high"` force le handoff `handoff_to_emotional_repair`
  et bloque les suggestions tool.
- `no_tool` supprime toutes les `operation_suggestions`.
- `do_not_edit_plan` supprime `adjust_plan_item`.
- `allow_card_suggestion: false` supprime `prepare_attack_card` et
  `prepare_defense_card`.
- Toutes les suggestions conservées sortent avec `requires_user_consent: true`.
- Le done language est interdit : pas de "c'est fait", "créé", "programmé" ou
  "enregistré" dans la reply.
- Un échec technique d'intake ne produit pas de reply métier, pas de tool
  suggestion, pas de handoff métier et pas d'effet durable.

## Integration Points

- `emotional_repair` reçoit uniquement un `handoff_request` structuré quand
  `ExecutionDecision` et les invariants concluent que l'émotion domine.
- `prepare_attack_card`, `prepare_defense_card` et `adjust_plan_item` peuvent
  recevoir une opportunité future via `operation_suggestions`; ils restent
  propriétaires de leurs handoffs, brouillons, destinations plateforme et
  renderers.
- La mémoire reçoit seulement des `MemoryWriteCandidate` conservateurs via
  `toMemoryWriteCandidates(...)`, jamais une écriture directe.
- `run.ts` reste mince : pas d'addon local `execution_breakdown`, pas de regex
  cible/blocage, pas de fallback relationnel ou émotionnel.

## Allowed Changes

- Étendre `ExecutionDecision` si une nouvelle dimension de diagnostic est
  nécessaire et testée.
- Améliorer `EXECUTION_BREAKDOWN_PROMPT` sans déplacer la compréhension dans le
  code déterministe.
- Ajouter des invariants qui filtrent ou normalisent le contrat sans refaire la
  sémantique métier.
- Renforcer `renderer.ts` pour mieux appliquer le `response_contract`, tant que
  le renderer ne classifie pas le message user.
- Ajouter des tests stubbés avec `intake_model` pour couvrir une nouvelle règle.

## Forbidden Changes

- Ajouter une regex ou une liste de mots pour choisir target, blocker, handoff,
  attack/defense/adjust ou plan item.
- Retomber sur une heuristique métier après échec IA.
- Ajouter un if sémantique dans `router/run.ts`, `routers/routers.ts` ou
  l'arbitre global pour corriger `execution_breakdown`.
- Exécuter directement `prepare_attack_card`, `prepare_defense_card` ou
  `adjust_plan_item`.
- Modifier un plan depuis ce skill.
- Dire qu'un effet durable est fait sans `committed_effect` produit par le
  propriétaire de l'effet.
- Marquer une suggestion comme consentie implicitement.

## Legacy Exceptions

- Aucun fallback lexical métier ne reste dans le chemin normal de production.
  `defaultDecision()`, `hasAny(...)` et les listes de mots target/blocker/tool
  ont été supprimés.
- `conservativeExecutionDecision(...)` reste comme fallback technique. Il
  protège les tours quand l'IA d'intake échoue ou retourne un JSON invalide :
  target inconnue, une question max, pas de suggestion tool, pas de reply métier
  dans `ConversationSkillOutput`.
- `safeReplyFor(...)` et `sanitizeReply(...)` dans `contract.ts` restent comme
  fallback de forme/sûreté, pas comme moteur de diagnostic. Ils existent pour
  supprimer le done language, limiter les questions/bullets et garantir une
  phrase exacte ou un geste concret quand le contrat l'exige. Ils pourront être
  réduits quand le renderer portera toute la validation de forme sans fallback
  textuel métier.

## Required Tests

Tests propriétaires dans
`supabase/functions/sophia-brain/skills/skills_s3.test.ts` :

- `execution_breakdown uses structured intake model`
- `execution_breakdown model failure is conservative and non-mutating`
- `execution_breakdown contract owns target blocker constraints and tool suggestions`
- `execution_breakdown prompt contract includes priority rules`

Vérifications attendues pour tout changement runtime :

```bash
deno test --allow-env --allow-net --allow-read --filter "execution_breakdown" supabase/functions/sophia-brain/skills/skills_s3.test.ts
deno check supabase/functions/sophia-brain/skills/execution_breakdown/skill.ts supabase/functions/sophia-brain/skills/execution_breakdown/intake.ts supabase/functions/sophia-brain/skills/execution_breakdown/contract.ts supabase/functions/sophia-brain/skills/execution_breakdown/reducer.ts supabase/functions/sophia-brain/skills/execution_breakdown/renderer.ts supabase/functions/sophia-brain/router/run.ts
```

## Suivi Des Décisions Architecturales

| Date       | Décision                                                                                                                                                                           | Statut    | Référence                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------ |
| 2026-05-29 | Execution breakdown doit porter target + blocker contract.                                                                                                                         | Remplacée | Plan execution_breakdown |
| 2026-05-30 | Le chemin normal devient un intake IA JSON strict suivi de `normalizeExecutionDecision`, `applyExecutionInvariants`, reducer et renderer; le fallback lexical métier est interdit. | Active    | J19 / contrat runtime    |
| 2026-05-30 | `execution_breakdown` reste sans mutation durable : il ne produit que des suggestions consenties et des candidats conversationnels.                                                | Active    | EffectLedger / J19       |
