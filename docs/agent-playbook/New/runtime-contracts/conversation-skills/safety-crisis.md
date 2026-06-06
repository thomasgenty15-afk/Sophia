# safety_crisis Runtime Contract

## Mental Model

`safety_crisis` est le conversation skill L5 critique qui possède le mode
sécurité. Il est prioritaire, conservateur et non-mutant.

La doctrine générale de `00-architecture-doctrine.md` reste vraie, avec une nuance
explicite pour ce domaine : les garde-fous déterministes sont autorisés quand
ils escaladent ou maintiennent la sécurité. Ils ne doivent jamais résoudre le
flow, baisser seuls le risque, déclencher un outil, créer un objet produit ou
sortir du mode sécurité.

Le modèle runtime est :

```txt
dispatcher / safety_pregate
  -> routers/skill_router.ts choisit safety_crisis si risque high/critical,
     medium safety context, ou flow safety actif
  -> router/safety_crisis_runtime.ts neutralise tools/direct effects
  -> skills/safety_crisis/skill.ts
       buildSafetySnapshot
       -> runSafetyCrisisStructuredIntake
       -> inferStructuredSafetySignals
       -> applyConservativeSafetyOverrides
       -> reduceSafetyCrisis
       -> renderSafetyReply
  -> final_response_pipeline.ts laisse la réponse visible au skill safety
  -> state patch safety uniquement
```

## Dépend De L'Architecture De X

Ce domaine dépend de :

- UserTurnSnapshot pour lire l'état complet du tour ;
- TurnAgenda pour distinguer reply/effects/status/memory/repair ;
- Confirmation Contract pour interpréter approve/reject/revise/explain ;
- EffectLedger pour ne jamais dire "c'est fait" sans effet committé ;
- le contrat local de `safety_crisis` pour l'intake, le reducer, les effets et
  le renderer.

Dans le code actuel, l'usage est le suivant :

- `safety_crisis` ne lit pas encore directement un type `UserTurnSnapshot`
  dédié. Il reçoit le snapshot opérationnel via `RunSkillInput.context`,
  construit par `router/run.ts` et les loaders de skills. Le snapshot local est
  `SafetyCrisisSnapshot` dans
  `supabase/functions/sophia-brain/skills/safety_crisis/contract.ts`, construit
  par `buildSafetySnapshot` dans `intake.ts`.
- Le rôle de `TurnAgenda` est porté en amont par `TurnFrame`,
  `runSkillRouter`, `runConversationRouters`,
  `operation_runtime_pipeline.ts` et `safety_crisis_runtime.ts` :
  `response_owner="safety"` gagne sur product/help/tools, et les direct effects
  sont vidés par `suppressToolSignalsForSafetyRoute`.
- Le Confirmation Contract n'est pas consommé par `safety_crisis`, car ce skill
  ne demande jamais une confirmation exécutable. Une réponse courte du user ne
  doit donc pas être interprétée comme validation d'un brouillon produit pendant
  un flow safety.
- L'EffectLedger est utilisé au minimum : `runSafetyCrisisSkill` émet
  `operation_suggestions: []` et crée seulement des memory candidates
  `should_persist_default=false`. `conversationEffectsFromCandidates` marque ces
  candidates comme `candidate_only_not_committed`; aucun effet durable n'est
  committé par le skill.
- Le contrat local est propriétaire des phases, risk bands, signaux,
  response contract, state patch et invariants dans `contract.ts`.

## Runtime Shape

```txt
skills/safety_crisis/contract.ts
  -> prompt.ts
  -> intake.ts
  -> signals.ts
  -> reducer.ts
  -> renderer.ts
  -> skill.ts

router/safety_crisis_runtime.ts
  -> runtime safety guards around routing/effects/visible reply
```

Le chemin normal de `runSafetyCrisisSkill` est :

1. `buildSafetySnapshot(input)` lit le message, `turn_frame.safety.risk_band`,
   `source_message_id` et le working state safety précédent.
2. `buildSafetyCrisisIntakeInput` prépare le contexte compact.
3. `runSafetyCrisisStructuredIntake` appelle l'intake IA JSON strict via
   `defaultSafetyCrisisIntakeRunner`.
4. `inferStructuredSafetySignals` normalise les signaux IA.
5. `applyConservativeSafetyOverrides` applique les garde-fous déterministes.
6. `reduceSafetyCrisis` calcule `phase`, `riskBand` et `statePatch`.
7. `renderSafetyReply` produit la seule réponse visible.
8. `baseOutput("safety_crisis", ...)` retourne `status`, `reply`,
   `diagnosis`, `state_patch`, `operation_suggestions: []` et l'effect ledger
   conversationnel.

## File Ownership

- `supabase/functions/sophia-brain/skills/safety_crisis/contract.ts`
  possède le contrat : `SafetyCrisisPhase`, `SafetyRiskBand`,
  `SafetySignal`, `SafetyCrisisWorkingState`,
  `SafetyCrisisResponseContract`, `SafetyCrisisDecision`,
  `SafetyCrisisSnapshot`, `SafetyCrisisReduction`,
  `SAFETY_CRISIS_INVARIANTS`, `emptySafetySignal`,
  `normalizeSafetyRiskBand`, `normalizeSafetyPhase` et
  `safetyResponseContract`.
- `supabase/functions/sophia-brain/skills/safety_crisis/prompt.ts`
  possède le prompt d'intake JSON strict
  `SAFETY_CRISIS_PROMPT_VERSION="safety_crisis_intake_prompt_v2"` et
  `SAFETY_CRISIS_PROMPT`. Ce prompt ne rend jamais de réponse visible.
- `supabase/functions/sophia-brain/skills/safety_crisis/intake.ts`
  possède l'intake structuré : `buildSafetySnapshot`,
  `buildSafetyCrisisIntakeInput`, `runSafetyCrisisStructuredIntake`,
  `setSafetyCrisisIntakeRunnerForTest` et le runner IA par défaut.
- `supabase/functions/sophia-brain/skills/safety_crisis/signals.ts`
  possède les overrides conservateurs :
  `detectConservativeSafetyOverrides`, `inferStructuredSafetySignals` et
  `applyConservativeSafetyOverrides`.
- `supabase/functions/sophia-brain/skills/safety_crisis/reducer.ts`
  possède les transitions d'état pures via `reduceSafetyCrisis`.
- `supabase/functions/sophia-brain/skills/safety_crisis/renderer.ts`
  possède la réponse user-facing via `renderSafetyReply`, les ressources France
  `FRANCE_SAFETY_RESOURCES`, et le contrat visible issu de
  `safetyResponseContract`.
- `supabase/functions/sophia-brain/skills/safety_crisis/skill.ts`
  est la façade publique. Elle orchestre intake/signals/reducer/renderer et
  prépare seulement un state patch safety et des memory candidates non
  persistées par défaut.
- `supabase/functions/sophia-brain/router/safety_crisis_runtime.ts`
  possède les garanties runtime transverses :
  `isSafetyRoute`, `isActiveSafetyCrisisSkillState`,
  `withActiveSafetyFlowCaution`, `runtimeSafetyPregateForTurn`,
  `selectedConversationSkillForRoute`,
  `applySafetyCrisisExitStateIfNeeded`,
  `directSafetyCrisisReplyOverride` et
  `suppressToolSignalsForSafetyRoute`.
- `supabase/functions/sophia-brain/routers/skill_router.ts`
  sélectionne `safety_crisis` quand le risque ou le contexte safety l'exige.
- `supabase/functions/sophia-brain/routers/routers.ts`
  transforme cette sélection en `response_owner="safety"` et force
  `direct_effects_to_run: []`.
- `supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`
  consomme `runtimeSafetyPregateForTurn` pour bloquer les runtimes d'opération
  pendant safety.
- `supabase/functions/sophia-brain/router/final_response_pipeline.ts`
  consomme `directSafetyCrisisReplyOverride` pour que la réponse visible vienne
  du renderer safety.
- `supabase/functions/sophia-brain/router/run.ts`
  ne doit rester qu'un câblage : appeler le skill, appeler les helpers runtime,
  persister l'état et journaliser.

## Inputs

`safety_crisis` lit :

- `input.user_message` ;
- `input.context.recent_messages` ;
- `input.context.active_skill_working_state` ;
- `input.context.turn_frame.source_message_id` ;
- `input.context.turn_frame.safety.risk_band` ;
- le working state précédent `SafetyCrisisWorkingState`.

Il ne doit pas lire :

- les surfaces produit pour proposer une aide produit ;
- les tool intents pour construire une suggestion ;
- les préférences coach pour modifier le ton safety ;
- les données plan/habitude pour optimiser une action.

## Outputs

`runSafetyCrisisSkill` retourne :

- `skill_id: "safety_crisis"` ;
- `status: "continue"` ou `status: "exit"` seulement si `phase="resolved"` ;
- `reply` rendu par `renderSafetyReply` ;
- `diagnosis.phase`, `diagnosis.risk_band`, `diagnosis.safety_signals`,
  `diagnosis.response_contract`, `diagnosis.intake_ok`,
  `diagnosis.intake_reason`, `diagnosis.intake_paraphrase` ;
- `recommendation_need.needed=false` ;
- `operation_suggestions=[]` ;
- `memory_write_candidates` minimales, sensibles, avec
  `should_persist_default=false` ;
- `effects` conversationnels sans committed effect ;
- `state_patch` safety uniquement.

## Responsabilités Qui Appartiennent À safety_crisis

- Comprendre les signaux safety du tour via JSON structuré.
- Maintenir une mémoire de travail safety courte :
  `phase`, `risk_band`, `immediate_danger`, `has_means_nearby`,
  `user_not_alone`, mentions d'aide humaine/secours,
  `consecutive_deescalated_turns`.
- Escalader ou maintenir le niveau de sécurité en cas d'incertitude.
- Demander au maximum une ou deux informations safety immédiates.
- Prioriser moyens éloignés, présence humaine, aide d'urgence et ressources
  France si risque critique/imminent.
- Rendre une réponse courte, actionnable, sans produit ni outil.
- Rendre une réponse visible contextualisée par les signaux structurés et le
  working state : si les moyens sont déjà hors de portée ou confiés à quelqu'un,
  et si un appui humain est présent/en ligne, le renderer doit reconnaître ces
  gestes au lieu de rejouer une checklist de phase.
- Sortir du mode safety uniquement après séquence stricte validée par le
  reducer.

## Responsabilités Qui N'Appartiennent Pas À safety_crisis

- Créer, modifier, annuler ou proposer un rappel.
- Activer une potion.
- Créer une carte d'attaque ou de défense.
- Ajuster un plan.
- Mettre à jour une préférence coach.
- Répondre à une question produit, dashboard, statut ou aide d'utilisation.
- Exécuter un effet durable ou écrire directement en DB.
- Interpréter une confirmation produit pendant une crise.
- Persister par défaut des détails dangereux ou sensibles.

## Effets

`safety_crisis` n'a pas de `effects.ts` ni d'`executor.ts` propriétaire parce
qu'il ne possède aucun effet durable.

Préparation des effets :

- `skill.ts` prépare uniquement des `memory_write_candidates` minimales avec
  `statementCandidate(..., shouldPersistDefault=false)`.
- `conversationEffectsFromCandidates` transforme ces candidates en effect ledger
  conversationnel `requested/allowed`, jamais `committed`.
- Si l'intake échoue, `conversationEffectsFromCandidates` bloque les effets
  durables avec `reason_code="structured_intake_failed"`.

Application des effets :

- aucun effet safety n'est appliqué par un executor de skill ;
- l'application éventuelle de memory candidates appartient au runtime mémoire
  global, et le défaut safety est de ne pas persister ;
- `safety_crisis_runtime.ts` supprime les direct effects et tool signals sur
  route safety avant les runtimes d'opération.

## Invariants

- `safety_crisis` est prioritaire sur product help, tools, plans, potions,
  rappels, cartes et préférences coach.
- `operation_suggestions` est toujours vide.
- `recommendation_need.needed` est toujours `false`.
- Le renderer ne mentionne jamais dashboard, plan, potion, carte, outil ou
  optimisation d'habitude.
- Une route safety force `tool_skill_intents=[]`, `direct_effects=[]`,
  `tool_skill_opportunity.type="none"` et `direct_effects_to_run=[]`.
- Un flow safety actif non résolu force au minimum un risque runtime `medium`
  via `withActiveSafetyFlowCaution` / `runtimeSafetyPregateForTurn`.
- Une exception de rappel de travail sûr ne peut pas downgrader un flow safety
  actif.
- `resolved` est impossible si `immediate_danger=true`.
- `resolved` est impossible si `has_means_nearby=true`.
- `resolved` est impossible si `user_currently_alone=true`.
- `resolved` exige une phase précédente `exit_check`.
- `resolved` exige au moins un tour précédent de désescalade.
- `resolved` exige danger immédiat absent, moyens éloignés/absents et aide
  humaine présente/contactée/appelable.
- `sourceRiskBand` `high` ou `critical` empêche une sortie directe.
- Tout nouveau signal de risque depuis `exit_check` rouvre le flow.
- Les overrides déterministes peuvent forcer le risque vers le haut, jamais
  résoudre seuls.
- Une sortie runtime du mode safety exige `skillOutput.status === "exit"` et
  `skillOutput.state_patch.phase === "resolved"`.
- Si risque critique ou danger immédiat, la réponse visible mentionne
  `15 ou 112` et `3114`.

## Integration Points

- `supabase/functions/sophia-brain/safety/safety_thresholds.ts` définit les
  seuils globaux : medium bloque direct effects/tool skills, high force le
  skill safety.
- `supabase/functions/sophia-brain/safety/safety_pregate.ts` produit le premier
  signal safety du tour.
- `withActiveSafetyFlowCaution` relève un flow safety actif non résolu à
  `medium`.
- `runSkillRouter` démarre/continue `safety_crisis` pour high/critical, medium
  safety context, ou active safety flow.
- `runConversationRouters` convertit `selected_skill_id="safety_crisis"` en
  `response_owner="safety"`.
- `suppressToolSignalsForSafetyRoute` nettoie les tool/direct signals après le
  routing.
- `operation_runtime_pipeline.ts` consomme le risque runtime safety avant
  d'autoriser un runtime d'opération.
- `final_response_pipeline.ts` donne priorité à
  `directSafetyCrisisReplyOverride`, donc la réponse user-facing est celle du
  renderer safety.
- `applySafetyCrisisExitStateIfNeeded` ferme le working state seulement sur
  résolution explicite.

## Allowed Changes

- Ajouter un champ structuré au contrat si le prompt, l'intake, les overrides,
  le reducer, le renderer et les tests sont mis à jour ensemble.
- Ajouter un override déterministe qui escalade ou maintient le risque.
- Ajouter une preuve de stabilisation utilisable par le reducer, sans permettre
  une résolution directe.
- Adapter le renderer pour composer une réponse depuis le contrat safety, les
  signaux structurés et l'état précédent, tant que les obligations critiques
  restent vérifiables par tests.
- Renforcer une condition de non-résolution.
- Ajouter un test de runtime safety qui empêche tools/direct effects.
- Mettre à jour les ressources de crise si les sources officielles changent,
  avec tests de renderer.

## Forbidden Changes

- Ajouter une logique safety sémantique dans `run.ts`, L3/L4 ou un router
  global au lieu du skill/runtime safety.
- Ajouter un fallback regex qui désescalade ou force `resolved`.
- Ajouter une phrase visible complète figée par phase qui ignore les preuves
  déjà produites par l'utilisateur dans le tour courant.
- Laisser l'intake IA choisir une phase, exécuter un effet ou déclarer une
  résolution.
- Proposer un outil, une potion, un rappel, une carte, un plan ou un dashboard.
- Persister par défaut des détails de moyens dangereux.
- Sortir du mode safety sur une phrase vague unique.
- Dire que l'assistant peut remplacer une aide humaine.
- Masquer les numéros France sur risque critique/imminent.
- Ajouter un `executor.ts` qui écrit en DB sans décision architecturale
  explicite.

## Legacy Exceptions

- `signals.ts` contient des regex safety conservatrices. Elles restent
  volontairement parce que ce domaine doit préférer une escalade conservatrice à
  une sortie trop rapide. Elles protègent notamment les moyens proches,
  l'absence de sécurité explicite, la solitude et les formulations suicidaires
  directes. Condition de suppression : un intake IA évalué et monitoré doit
  démontrer qu'il couvre ces cas avec au moins le même niveau de rappel, et le
  reducer doit conserver les mêmes invariants.
- `RunSkillInput.context` sert de snapshot local au lieu d'un
  `UserTurnSnapshot` typé dédié. Condition de suppression : adoption d'un
  snapshot runtime commun pour tous les conversation skills.
- Le renderer reste déterministe sur les obligations safety vérifiables
  (ressources de crise, absence de produit/tool, priorité aide humaine, nombre
  de questions), mais il ne doit pas être une table de phrases complètes par
  phase. Il doit composer une réponse contextualisée depuis les signaux
  structurés et l'état précédent, notamment pour ne pas redemander d'éloigner
  des moyens déjà confiés/éloignés. Condition de suppression : si un renderer
  IA est introduit, il devra être strictement validé par un response contract,
  des garde-fous de sortie et des tests de non-régression safety.
- Les memory candidates safety existent encore comme résumé minimal, mais
  `should_persist_default=false`. Condition de suppression : si le runtime
  mémoire décide que le mode safety ne doit jamais émettre de candidate, le
  skill pourra retourner `memory_write_candidates=[]`.

## Required Tests

Tests skill :

- `safety_crisis handles varied safety scenarios without product push` ;
- `safety_crisis owns phased safety state and exits only after deescalation` ;
- `safety_crisis deescalates when means are away and human support is present` ;
- `safety_crisis L5 contract keeps conservative safety invariants` ;
- `safety_crisis structured intake finalization cases`.
- Régression `BF-SAFETY-01` : moyens donnés/confiés à quelqu'un + support au
  téléphone doivent être reconnus comme stabilisation sans sortie directe, et
  la réponse ne doit pas relancer `Eloigne d'abord`, `Pose ou eloigne` ou
  `reponds seulement`.

Tests router/runtime :

- `safety reply override lets safety_crisis own the visible answer` ;
- `safety route suppresses tool signals and direct effects` ;
- `active safety flow caution keeps at least medium risk` ;
- `active safety flow cannot be downgraded by safe reminder exception` ;
- tests de `routers/routers.test.ts` sur `safety_crisis`,
  `active_safety_crisis_continue` et `safety_medium_context_override`.

Commandes minimales avant merge :

```bash
deno test --allow-env --allow-net --allow-read --filter "safety_crisis" supabase/functions/sophia-brain/skills/skills_s3.test.ts
deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts
deno check supabase/functions/sophia-brain/skills/safety_crisis/skill.ts supabase/functions/sophia-brain/skills/safety_crisis/contract.ts supabase/functions/sophia-brain/skills/safety_crisis/signals.ts supabase/functions/sophia-brain/skills/safety_crisis/intake.ts supabase/functions/sophia-brain/skills/safety_crisis/reducer.ts supabase/functions/sophia-brain/skills/safety_crisis/renderer.ts supabase/functions/sophia-brain/router/safety_crisis_runtime.ts
```

Si `run.ts`, `operation_runtime_pipeline.ts` ou `final_response_pipeline.ts`
changent, ajouter le `deno check` ciblé correspondant.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-29 | Safety = IA structurée + reducer déterministe conservateur. | Active | J20 safety_crisis structured intake finalization |
| 2026-05-30 | `safety_crisis` n'a pas d'executor durable propriétaire ; ses seuls effets sont des candidates mémoire non persistées par défaut et les suppressions runtime des tools/direct effects. | Active | Ce contrat runtime |
| 2026-06-02 | Le renderer safety n'est plus une exception de templates complets par phase : il compose une réponse contextualisée à partir des signaux structurés, tout en gardant les obligations safety déterministes. | Active | J78 BF-SAFETY-01 contextual safety renderer |
