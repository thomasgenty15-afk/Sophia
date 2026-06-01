# `demotivation_repair` Runtime Contract

## Mental Model

`demotivation_repair` est un skill conversationnel L5. Il traite un tour ou une courte séquence où l'utilisateur exprime un décrochage motivationnel : fatigue, perte de sens, accumulation d'échecs, évitement, surcharge ou demande d'un plus petit geste.

Le domaine ne doit pas transformer la démotivation en problème d'exécution trop tôt. Son rôle est de diagnostiquer l'état motivationnel, réduire la friction, protéger l'utilisateur des formulations culpabilisantes ou identitaires, puis proposer éventuellement un handoff ou une suggestion outillée avec consentement.

`demotivation_repair` ne possède aucun effet durable. Il ne crée pas de rappel, ne modifie pas un plan, n'active pas de potion et ne prépare pas de carte d'attaque directement. Il émet uniquement une décision structurée, une réponse visible, des suggestions consenties et, si l'action est réellement prête, une demande de handoff vers `execution_breakdown`.

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour;
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair;
- `Confirmation Contract` pour interpréter approve/reject/revise/explain;
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé;
- le contrat local de `demotivation_repair` pour l'intake, le reducer, les effets et le renderer.

Dans le code actuel, ces briques sont utilisées comme suit :

- `UserTurnSnapshot` : le skill ne reçoit pas encore un type unique nommé `UserTurnSnapshot`. L'équivalent opérationnel est construit dans `supabase/functions/sophia-brain/skills/demotivation_repair/context_loader.ts` par `loadDemotivationRepairContext`, puis compacté dans `supabase/functions/sophia-brain/skills/demotivation_repair/intake.ts` par `buildDemotivationRepairIntakeInput` et `compactContext`. Les champs lus sont `user_message`, `recent_messages`, `active_skill_working_state`, `turn_frame`, `plan_items`, `relevant_memory_items` et les exclusions de contexte. Aucune compréhension métier ne doit être reconstruite dans `router/run.ts`.
- `TurnAgenda` : le skill consomme le `turn_frame` transmis au `RunSkillInput`. Il lit les signaux déjà décidés en amont (`skill_signals`, `tool_skill_intents`, `tool_skill_opportunity`, safety) pour cadrer le tour, mais son diagnostic motivationnel appartient à l'intake structuré local. Les décisions reply/effects/handoff sortent ensuite dans `ConversationSkillOutput`; le routeur orchestre seulement.
- `Confirmation Contract` : `demotivation_repair` ne confirme pas et n'applique pas d'effet. Il émet des `operation_suggestions` avec `requires_user_consent: true`. L'interprétation d'un futur approve/reject/revise/explain appartient aux tool skills aval, pas à ce domaine.
- `EffectLedger` : le domaine ne commite rien dans le ledger. Les suggestions sont converties plus loin par `supabase/functions/sophia-brain/tool_skill_runtime/operation_suggestion_resolver.ts` via `resolveSkillOperationSuggestion`, puis gouvernées par les contrats et exécuteurs des opérations concernées. Le contrat local interdit donc les formulations de type "c'est fait", "créé", "programmé" ou "enregistré".
- Contrat local : `supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts` est la source de vérité. `DemotivationRepairDecision` porte `motivation_state`, `action_readiness`, `constraints`, `response_contract`, `handoff_request`, `operation_suggestions`, `memory_write_candidates`, `reply` et `state_patch`. `normalizeDemotivationRepairDecision` applique les invariants du contrat. `reduceDemotivationRepairTurn` dans `supabase/functions/sophia-brain/skills/demotivation_repair/reducer.ts` applique la transition de tour et prépare les effets conversationnels. `toConversationOperationSuggestions` et `toMemoryWriteCandidates` préparent les sorties consommables par le runtime.

## Runtime Shape

Le chemin nominal est :

1. Le routing L1/L2 sélectionne `demotivation_repair` via les signaux de skill. Il ne doit pas classifier fatigue, perte de sens, échec ou action prête en code local.
2. `supabase/functions/sophia-brain/router/run.ts` appelle `runConversationSkillForRecommendation`, puis le cas `demotivation_repair` fait seulement `await runDemotivationRepairSkill(input)`.
3. `supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts` agit comme façade publique. `runDemotivationRepairSkill` construit l'entrée d'intake, appelle l'intake structuré, puis délègue la transition de tour au reducer.
4. `supabase/functions/sophia-brain/skills/demotivation_repair/intake.ts` est le chemin de compréhension. `runDemotivationRepairStructuredIntake` appelle le modèle injectable ou `defaultIntakeModel`, qui utilise `generateWithGemini` et `getGlobalAiModel` avec `DEMOTIVATION_REPAIR_PROMPT`.
5. `supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts` applique les invariants de décision. `normalizeDemotivationRepairDecision` valide les enums, filtre les suggestions interdites, bloque les handoffs non prêts, sécurise la mémoire et nettoie la réponse visible.
6. `supabase/functions/sophia-brain/skills/demotivation_repair/reducer.ts` possède la transition de tour. `reduceDemotivationRepairTurn` transforme le résultat d'intake en `ConversationSkillOutput`, prépare `diagnosis`, `recommendation_need`, `operation_suggestions`, `memory_write_candidates`, `state_patch` et `effects` via `conversationEffectsFromCandidates`.
7. Les effets ne sont pas appliqués par ce domaine. Les suggestions consenties sont transmises au runtime. `supabase/functions/sophia-brain/tool_skill_runtime/operation_access_policy.ts` autorise explicitement les types d'opération appartenant à ce skill, puis `operation_suggestion_resolver.ts` les expose comme propositions actionnables.
8. `supabase/functions/sophia-brain/skills/demotivation_repair/renderer.ts` rend la réponse user-facing via `renderDemotivationRepairReply`. Il ne reclassifie pas le message utilisateur. Si l'intake échoue techniquement, le renderer ne fabrique pas de réponse métier et laisse le runtime gérer le fallback global.

## File Ownership

- `supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts` possède le contrat local, les enums, les invariants, le reducer-like normalizer, la conversion des suggestions et la sanitization mémoire.
- `supabase/functions/sophia-brain/skills/demotivation_repair/intake.ts` possède l'intake structuré IA, l'entrée compacte, le modèle injectable, le parsing JSON strict et le fallback technique conservateur.
- `supabase/functions/sophia-brain/skills/demotivation_repair/prompt.ts` possède `DEMOTIVATION_REPAIR_PROMPT` et `DEMOTIVATION_REPAIR_PROMPT_VERSION`. Ce prompt est un prompt d'intake JSON, pas un prompt de réponse libre.
- `supabase/functions/sophia-brain/skills/demotivation_repair/context_loader.ts` possède la politique de contexte du domaine.
- `supabase/functions/sophia-brain/skills/demotivation_repair/reducer.ts` possède la transition de tour, l'assemblage du `ConversationSkillOutput`, la préparation des effets conversationnels et les invariants de non-commit.
- `supabase/functions/sophia-brain/skills/demotivation_repair/renderer.ts` possède le rendu user-facing minimal. Il retourne `decision.reply` seulement quand l'intake est valide et ne fait aucun diagnostic.
- `supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts` possède la façade L5 et l'orchestration locale `intake -> reducer`.
- Aucun `effects.ts` ou `executor.ts` n'existe aujourd'hui pour ce domaine. C'est acceptable tant que le domaine reste conversationnel, sans effet durable direct. Si le domaine gagne des effets propriétaires, ils doivent passer par un contrat d'effet explicite, un executor dédié et l'EffectLedger, sans déplacer de sémantique vers `run.ts`.
- `supabase/functions/sophia-brain/router/run.ts` ne possède aucune sémantique de démotivation. Il orchestre et attend le skill.
- `supabase/functions/sophia-brain/recommendation/recommendation_tool.ts` ne doit pas contenir de fallback `motivation_repair`. Les recommandations doivent venir des `operation_suggestions` du skill.

## Inputs

Entrée principale : `RunSkillInput` dans `runDemotivationRepairSkill`.

L'intake reçoit une `DemotivationRepairStructuredIntakeInput` contenant :

- `user_message`;
- `recent_messages`;
- `active_skill_working_state`;
- `turn_frame`;
- `plan_items`;
- `constraints_from_dispatcher`;
- `relevant_memory_items`;
- `request_id`;
- `prompt_version`.

Le modèle injectable `DemotivationRepairIntakeModel` retourne un objet ou une chaîne JSON. La sortie est parsée puis passée à `normalizeDemotivationRepairDecision`.

## Outputs

Sortie principale : `ConversationSkillOutput`.

Le skill peut produire :

- `status: "responded"` pour une réponse de réparation motivationnelle locale;
- `status: "handoff"` uniquement si `action_readiness` vaut `ready` ou `already_chosen`;
- `response_intent`, généralement `repair`, `clarify`, `suggest_tool` ou `handoff_to_execution`;
- `reply` après normalisation;
- `operation_suggestions` consenties;
- `handoff_request` vers `execution_breakdown`;
- `state_patch.demotivation_repair.decision`;
- `memory_write_candidates` non persistantes par défaut.

## Invariants

- La démotivation n'est jamais interprétée comme de la paresse. Les réponses ne doivent pas moraliser, culpabiliser ou figer une identité.
- `no_potion` supprime toute suggestion `select_state_potion`.
- `no_tool` supprime toutes les `operation_suggestions`.
- `no_plan_edit` et `allow_plan_edit: false` suppriment toute suggestion `adjust_plan_item`.
- Un handoff vers `execution_breakdown` est interdit si `action_readiness` n'est ni `ready` ni `already_chosen`.
- `create_recurring_reminder` est autorisé seulement quand l'utilisateur demande explicitement un soutien répété.
- `adjust_plan_item` est autorisé seulement avec demande explicite d'allègement/modification ou diagnostic d'action trop lourde accompagné d'un consentement.
- Aucune suggestion ne peut prétendre être exécutée. `requires_user_consent` doit rester `true`.
- La réponse visible ne doit pas contenir de done language comme "c'est fait", "créé", "programmé" ou "enregistré".
- Les candidates mémoire sont toujours `should_persist_default: false` et `anti_identity_freeze_checked: true`.
- Les phrases identitaires négatives brutes comme "je suis incapable", "je suis flemmard", "je n'ai aucune volonté" ou "je rate toujours" doivent être redacted/dropped avant sortie.
- Le fallback technique conservateur ne produit aucun handoff, aucune suggestion tool et aucune mutation durable.

## Integration Points

- `supabase/functions/sophia-brain/router/run.ts` : point d'appel orchestration-only.
- `supabase/functions/sophia-brain/skills/execution_breakdown/skill.ts` : cible de handoff quand l'action est prête.
- `supabase/functions/sophia-brain/tool_skill_runtime/operation_access_policy.ts` : allowlist des suggestions d'opération émises par ce skill.
- `supabase/functions/sophia-brain/tool_skill_runtime/operation_suggestion_resolver.ts` : conversion des suggestions consenties en recommandations runtime.
- `supabase/functions/sophia-brain/recommendation/recommendation_tool.ts` : ne doit plus interpréter la démotivation; il doit respecter les suggestions déjà émises par le skill.

## Allowed Changes

- Ajouter un intent, une contrainte ou un type de suggestion dans `contract.ts`, à condition de mettre à jour le prompt, les normalizers et les tests.
- Faire évoluer `reducer.ts` ou `renderer.ts` si la complexité augmente, à condition de garder `contract.ts` source de vérité et de ne pas déplacer de diagnostic dans le renderer.
- Améliorer `compactContext` avec des champs structurés existants.
- Ajouter un nouveau handoff uniquement si le contrat local l'exprime et si le skill cible a un contrat compatible.
- Ajouter une opération suggérée uniquement avec consentement, policy runtime et test d'accès.

## Forbidden Changes

- Ajouter des regex métier pour classifier fatigue, perte de sens, échec, évitement ou action prête.
- Ajouter un fallback sémantique dans `router/run.ts`, `recommendation_tool.ts` ou un autre niveau L3/L4.
- Modifier un plan, activer une potion, créer un rappel ou préparer une carte directement depuis ce skill.
- Dire ou laisser entendre qu'une action durable est faite avant effet committé.
- Persister par défaut une phrase identitaire négative.
- Forcer un emoji ou un style incompatible avec le mode tunnel/sobriété.
- Transformer "je suis vidé", "ça sert à rien" ou "j'ai encore raté" en handoff execution immédiat.

## Legacy Exceptions

- `runDemotivationRepairStructuredIntake` accepte encore une décision structurée présente dans `active_skill_working_state`. Ce n'est pas un fallback sémantique; c'est une compatibilité de continuité pour un tour déjà diagnostiqué. Cette exception pourra être retirée quand l'état actif stockera une frame de décision versionnée et migrée pour tous les conversation skills.
- `conservativeDemotivationRepairDecision` reste volontairement présent pour les échecs techniques du modèle, les JSON invalides ou les décisions impossibles à normaliser. Il protège contre une compréhension inventée. Il ne doit jamais devenir un fallback par mots-clés.
- Le domaine n'a pas de fichiers séparés `effects.ts` ou `executor.ts`. L'absence d'executor est voulue parce que le domaine ne possède aucun effet durable. `reducer.ts` prépare uniquement des effets conversationnels (`conversationEffectsFromCandidates`) pour le runtime; il ne commite rien.
- Le runtime ne fournit pas encore partout un objet concret nommé `UserTurnSnapshot` ou `TurnAgenda`. Le contrat doit donc documenter l'équivalent actuel (`RunSkillInput`, `SkillContext`, `turn_frame`) sans autoriser de sémantique supplémentaire dans `run.ts`.

## Required Tests

Tests du contrat conversationnel dans `supabase/functions/sophia-brain/skills/skills_s3.test.ts` :

- `demotivation_repair fatigue_drop_no_moralizing`;
- `demotivation_repair loss_of_meaning_stays_demotivation`;
- `demotivation_repair failure_accumulation_no_identity_freeze`;
- `demotivation_repair concrete_action_ready_handoff`;
- `demotivation_repair hypothetical_action_no_handoff`;
- `demotivation_repair no_potion_blocks_potion`;
- `demotivation_repair no_tool_blocks_all_suggestions`;
- `demotivation_repair recurring_support_only_when_explicit`;
- `demotivation_repair plan_edit_only_when_explicit`;
- `demotivation_repair no_done_language`;
- `demotivation_repair uses structured intake model`;
- `demotivation_repair intake failure conservative no tool`;
- `demotivation_repair no existing state uses model when available`;
- `demotivation_repair prompt does not force emoji`;
- `demotivation_repair identity memory redacted`.

Tests runtime associés :

- `supabase/functions/sophia-brain/recommendation/recommendation_tool.test.ts` doit protéger l'absence de fallback `motivation_repair` dans la recommandation générale.
- `supabase/functions/sophia-brain/tool_skill_runtime/operation_suggestion_resolver_test.ts` doit protéger l'accès aux opérations consenties et la résolution des suggestions `demotivation_repair`.

Commandes de vérification recommandées :

```bash
deno test --allow-env --allow-net --allow-read --filter "demotivation_repair" supabase/functions/sophia-brain/skills/skills_s3.test.ts
deno check supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts supabase/functions/sophia-brain/skills/demotivation_repair/intake.ts supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts supabase/functions/sophia-brain/skills/demotivation_repair/prompt.ts supabase/functions/sophia-brain/router/run.ts
deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/recommendation/recommendation_tool.test.ts
deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tool_skill_runtime/operation_suggestion_resolver_test.ts
```

## Suivi Des Décisions Architecturales

- 2026-05-29 : `demotivation_repair` doit devenir propriétaire de son diagnostic motivationnel via un contrat local L5, sans regex métier dans le skill.
- 2026-05-30 : l'intake IA structuré devient le chemin normal de production. Le fallback conservateur reste limité aux échecs techniques et `recommendation_tool.ts` ne doit plus posséder de fallback motivationnel parallèle.
- 2026-05-30 : le domaine reste sans executor durable. Toute opération (`select_state_potion`, `prepare_attack_card`, `adjust_plan_item`, `create_recurring_reminder`) doit sortir comme suggestion consentie et passer par le runtime d'effets aval.
