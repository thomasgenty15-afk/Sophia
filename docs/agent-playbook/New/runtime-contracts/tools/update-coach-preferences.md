# update_coach_preferences Runtime Contract

## Mental Model

`update_coach_preferences` est un Tool Skill L5 multi-tour. Il decide si un
tour parle d'une preference coach durable, d'une demande ponctuelle, d'une
preview, d'une verification/status, d'une correction, d'une annulation ou d'une
explication.

Le scope produit durable est volontairement limite aux trois reglages visibles
et modifiables dans le front :

- `coach.tone`
- `coach.challenge_level`
- `coach.question_tendency`

Toute autre demande de style ou de format, comme "sans emoji", "3 lignes max",
"pas de question finale", "action concrete avant les questions" ou une regle
conditionnelle cachee, ne peut pas devenir une preference durable. Le skill peut
la traiter comme demande ponctuelle, proposer une compilation partielle honnete
vers les trois cles supportees, ou demander clarification.

Le workflow cardinal est :

```txt
router/run.ts
-> update_coach_preferences/router.ts
-> intake.ts + slot_filler.ts
-> generator.ts
-> state.ts pending confirmation
-> executor.ts
-> status.ts DB write
-> committed_effects
-> renderer.ts
```

Aucune reponse "c'est applique/enregistre" n'est autorisee sans
`committed_effects.length > 0`.

## Dépend De L'Architecture De X

Ce domaine depend de :

- `UserTurnSnapshot` pour lire l'etat complet du tour. Dans le code actuel,
  `router/run.ts` construit le snapshot global, puis appelle
  `maybeRunUpdateCoachPreferencesOperation`. Le skill consomme le `TurnFrame`,
  la `RouteDecision`, `tempMemory`, le contexte utilisateur et les preferences
  courantes; il ne doit pas relire ni reinventer les flows globaux.
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair. Le dispatcher
  et l'agenda peuvent seulement indiquer que le tour semble concerner
  `update_coach_preferences`; la decision durable vs ponctuel, preview,
  verification, reject, revise, explain et commit appartient au skill. Dans le
  code actuel, `routeIsSelected` dans
  `tools/operations/update_coach_preferences/router.ts` accepte la route depuis
  `RouteDecision`, `TurnFrame.tool_skill_intents` ou un pending local.
- `Confirmation Contract` pour interpreter approve/reject/revise/explain. Le
  router local importe `buildConfirmationDecisionFromSkillReview` et
  `normalizeSkillConfirmationReview` depuis `router/confirmation_contract.ts`.
  `reviewUpdateCoachPreferencesDraft` classe le message utilisateur, puis
  `executeConfirmedCoachPreferenceDraft` cree un token de confirmation via
  `createConfirmationToken` avant d'appeler l'executor. Le guard regex
  `isCoachPreferenceExplicitApproval` reste un support transitionnel interne au
  skill; il ne doit pas ecrire ni fabriquer de patch.
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet commite.
  `contract.ts` expose `requested_effects`, `allowed_effects`,
  `blocked_effects` et `committed_effects`. `skillResultToRuntimeResult` met
  `executedTools: ["update_coach_preferences"]` uniquement quand
  `committed_effects.length > 0`; sur echec technique, le resultat reste
  `toolExecution: "failed"` avec `executedTools: []`. Quand une approbation
  executable appelle l'executor, le router expose aussi l'effet
  `update_coach_preferences` dans `requested_effects` et `allowed_effects`,
  même si le writer échoue ensuite.
- le contrat local de `update_coach_preferences`, dans
  `tools/operations/update_coach_preferences/contract.ts`, pour l'intake, les
  intents utilisateur, les effets demandes/autorises/committes, le reducer
  local et le renderer.

Ces briques se completent ainsi : `UserTurnSnapshot` et `TurnAgenda` bornent le
tour, le contrat local produit un draft verifiable, le `Confirmation Contract`
decide si ce draft peut etre approuve/rejete/revise/explique, l'executor applique
seulement les effets autorises, et l'`EffectLedger` rend le commit observable.

## Runtime Shape

```txt
router/run.ts
  -> maybeRunUpdateCoachPreferencesOperation
  -> state.ts: loadCoachPreferenceFrameFromTempMemory
  -> intake.ts: runUpdateCoachPreferencesIntake
  -> slot_filler.ts: fillCoachPreferencesSlotsWithAi / normalize...
  -> generator.ts: runCoachPreferencesPatchBuilder / validate...
  -> router.ts: buildSkillResult
  -> state.ts: writeCoachPreferencePendingConfirmation
  -> router.ts: executeConfirmedCoachPreferenceDraft
  -> executor.ts: executeUpdateCoachPreferences
  -> status.ts: upsertCoachPreferencesFromDraft
  -> router.ts: skillResultToRuntimeResult
  -> renderer.ts: renderCoachPreferencesSkillResult
```

Status et runtime suivent deux chemins separes :

```txt
status question
  -> status.ts: buildCoachPreferencesStatusReply

runtime composer constraints
  -> runtime_policy.ts: loadCoachPreferenceRuntimePolicy
  -> router/run.ts: loadCoachPreferenceRuntimeContext
```

Le chemin runtime ne produit pas de regles conditionnelles cachees. Il traduit
uniquement les trois preferences UI supportees en contraintes composer.

## File Ownership

- `tools/operations/update_coach_preferences/contract.ts`
  - possede `UpdateCoachPreferenceUserIntent`,
    `UpdateCoachPreferencesEffect`, `UpdateCoachPreferencesCommittedEffect` et
    `UpdateCoachPreferencesSkillResult`;
  - source locale de verite pour `requested_effects`, `allowed_effects`,
    `committed_effects` et `blocked_effects`.
- `tools/operations/_shared/operation_payload_builder.ts`
  - possede `CoachPreferenceKey`;
  - doit contenir seulement `coach.tone`, `coach.challenge_level`,
    `coach.question_tendency`.
- `tools/operations/update_coach_preferences/workflow.ts`
  - possede les valeurs autorisees par cle via `COACH_PREFERENCE_VALUES`;
  - ne doit pas exposer de cle backend-only.
- `tools/operations/update_coach_preferences/slot_filler.ts`
  - possede le prompt IA, le shape JSON et
    `normalizeCoachPreferencesSlotFillerOutput`;
  - peut detecter `preview_only`, `status_question`, `reject`, `revise`,
    `explain`, mais ne doit jamais produire de cle hors UI.
- `tools/operations/update_coach_preferences/intake.ts`
  - possede `runUpdateCoachPreferencesIntake`,
    `reviewUpdateCoachPreferencesDraft` et la transition intake structuree;
  - merge le slot filling, les contraintes et l'etat actif sans ecrire en DB.
- `tools/operations/update_coach_preferences/generator.ts`
  - possede `runCoachPreferencesPatchBuilder`,
    `normalizeCoachPreferenceValue` et `validateCoachPreferencePatch`;
  - rejette tout patch contenant une cle ou une valeur non supportee.
- `tools/operations/update_coach_preferences/state.ts`
  - possede les cles `tempMemory` du flow via
    `loadCoachPreferenceFrameFromTempMemory`,
    `writeCoachPreferenceActiveIntake`,
    `writeCoachPreferencePendingConfirmation`,
    `clearCoachPreferenceFrame`;
  - `run.ts` ne doit pas connaitre le detail de ces cles.
- `tools/operations/update_coach_preferences/router.ts`
  - possede `maybeRunUpdateCoachPreferencesOperation`;
  - agit comme reducer local : non-handled, preview, ask_question, pending,
    cancelled, revised, explained, verified, executed, failed;
  - construit le `UpdateCoachPreferencesSkillResult`, puis l'adapte en
    `OperationRuntimeResult` via `skillResultToRuntimeResult`.
- `tools/operations/update_coach_preferences/executor.ts`
  - possede `executeUpdateCoachPreferences`;
  - applique le guard de confirmation/token et appelle le writer injecte.
- `tools/operations/update_coach_preferences/status.ts`
  - possede `SUPPORTED_COACH_PREFERENCE_KEYS`,
    `upsertCoachPreferencesFromDraft`, `coachPreferenceStatusLabel` et
    `buildCoachPreferencesStatusReply`;
  - lit/ecrit `user_profile_facts` uniquement pour les trois cles supportees et
    ignore les valeurs `system_default` dans le status user-facing.
- `tools/operations/update_coach_preferences/runtime_policy.ts`
  - possede `loadCoachPreferenceRuntimePolicy` et
    `loadCoachQuestionTendencyLow`;
  - traduit les trois cles UI en contraintes composer, sans
    `conditional_rules` ni `rule_metadata` runtime.
- `tools/operations/update_coach_preferences/route_guards.ts`
  - possede les guards d'admission et les shims de tests:
    `isRuntimeCoachPreferenceRequest`,
    `shouldRuntimeCoachPreferenceOverrideRoute`,
    `isCoachPreferenceVerificationRequest`,
    `isCoachPreferenceExplicitApproval`,
    `detectsCoachPreferenceDirectionContradictionForSkill`;
  - ces guards ne doivent pas creer de draft ni ecrire en DB.
- `tools/operations/update_coach_preferences/renderer.ts`
  - possede `renderCoachPreferencesSkillResult`,
    `renderCoachPreferencesExecuted` et `renderCoachPreferencesFailed`;
  - rend les phrases user-facing depuis le resultat contractuel.
- `router/run.ts`
  - orchestre seulement : routing, safety, chargement runtime context,
    invocation du skill, composition finale;
  - importe `maybeRunUpdateCoachPreferencesOperation` et
    `loadCoachPreferenceRuntimePolicy`;
  - ne doit pas contenir de comprehension semantique des preferences coach.
- `frontend/src/components/dashboard-v2/PreferencesSection.tsx`
  - source produit des reglages visibles cote UI;
  - toute nouvelle preference durable doit d'abord y etre visible/modifiable.

## Inputs

- Message utilisateur courant.
- `TurnFrame` et `RouteDecision` produits par le dispatcher/agenda.
- `tempMemory` avec intake actif ou pending confirmation charge par `state.ts`.
- Preferences courantes supportees, issues de `user_profile_facts`.
- Sortie safety pregate pour bloquer l'execution si necessaire.
- `sourceMessageId`, `requestId`, `userId`, client Supabase.
- Slot filler injecte ou IA pour produire l'intake structure.

## Outputs

- `UpdateCoachPreferencesSkillResult` avec :
  - `status`: ask_question, preview_only, pending_confirmation, cancelled,
    revised, explained, verified, blocked, executed, failed;
  - `user_intent`: set_preference, preview_only, verify_preference, cancel,
    reject, revise, explain, topic_change, status_question, clarify, unknown;
  - `requested_effects`, `allowed_effects`, `committed_effects`,
    `blocked_effects`;
  - `reply` user-facing ou `pending_confirmation`.
- `OperationRuntimeResult` adapte par `skillResultToRuntimeResult`.
- Lignes `user_profile_facts` `source_type: "explicit_user"` apres commit.
- Contraintes composer runtime via `loadCoachPreferenceRuntimePolicy`.

## Invariants

- Les seules cles durables autorisees sont `coach.tone`,
  `coach.challenge_level`, `coach.question_tendency`.
- Une preference durable doit etre visible/modifiable dans le front, avoir une
  valeur canonique validee, etre verifiable en status, et influencer le runtime
  seulement via sa cle canonique.
- Aucune cle backend-only ne peut etre generee, validee, ecrite, listee en
  status ou appliquee runtime.
- Pas de DB write sans confirmation explicite et token valide.
- Toute ecriture passe par `executeUpdateCoachPreferences`.
- `preview_only`, `status_question`, `reject`, `revise`, `explain` et
  `ask_question` ne produisent pas de `committed_effects`.
- `executedTools: ["update_coach_preferences"]` est autorise seulement si
  `committed_effects.length > 0`.
- Sur approbation executable, le runtime result expose l'effet preference
  demandé puis autorisé; les branches failed gardent `committed_effects=[]` et
  `executedTools=[]`.
- Sur echec technique du writer, le skill retourne `failed`/`blocked_effects`
  et ne pretend jamais que la preference est appliquee.
- Un patch multi-cle doit exposer toutes les cles ecrites dans
  `committed_effects[].preference_keys`.
- Le status ne presente pas les valeurs `system_default` comme choix utilisateur
  explicite.
- La runtime policy ne produit pas de `conditional_rules`, ne lit pas de
  metadata conditionnelle, et ignore toute ancienne cle invisible.
- `run.ts` ne doit pas ajouter de regex metier pour comprendre les preferences
  coach.

## Integration Points

- `router/confirmation_contract.ts`
  - normalise les decisions approve/reject/revise/explain autour d'un pending.
- `confirmation/confirmation_token.ts`
  - cree le token utilise par `executeUpdateCoachPreferences`.
- `router/effect_ledger.ts`,
  `router/effect_ledger_adapter.ts`,
  `router/final_response_guards.ts`
  - les claims user-facing d'application doivent rester alignes avec les
    `committed_effects`.
- `router/run.ts`
  - charge le runtime context depuis `user_profile_facts` puis ajoute les
    contraintes composer issues de `loadCoachPreferenceRuntimePolicy`.
- `tools/operations/prepare_defense_card/router.ts`
  - peut consommer `loadCoachQuestionTendencyLow` pour adapter son style, mais
    ne doit pas lire d'ancienne preference backend-only.
- `frontend/src/components/dashboard-v2/PreferencesSection.tsx`
  - borne le produit durable a trois controles UI.

## Allowed Changes

- Ajouter une valeur a une des trois cles existantes si elle est visible dans le
  front, validee dans `workflow.ts`, normalisee dans `slot_filler.ts` et
  `generator.ts`, rendue en status, appliquee dans `runtime_policy.ts`, et
  couverte par tests.
- Ajouter une nouvelle preference durable seulement si le front l'expose et si
  `CoachPreferenceKey`, `workflow.ts`, `slot_filler.ts`, `generator.ts`,
  `status.ts`, `runtime_policy.ts`, tests et docs sont modifies ensemble.
- Renforcer le renderer si les phrases restent derivees de
  `UpdateCoachPreferencesSkillResult`.
- Ajouter des reason codes de blocage s'ils apparaissent dans
  `blocked_effects` et sont testes.
- Remplacer les guards transitionnels par des signaux structurés du dispatcher
  ou du `Confirmation Contract`.

## Forbidden Changes

- Reintroduire des preferences durables cachees pour emoji, longueur max,
  question finale, action-first ou regle conditionnelle.
- Stocker `rule_metadata`, `trigger_text`, `behavior_contract` ou une policy
  runtime conditionnelle comme effet durable cache.
- Compiler "sans emoji", "3 lignes max", "pas de question finale" ou
  "action concrete avant questions" en preference durable invisible.
- Ecrire directement dans `user_profile_facts` depuis `run.ts`, `intake.ts`,
  `generator.ts`, `renderer.ts` ou un route guard.
- Mettre `executedTools` a `update_coach_preferences` sans committed effect.
- Dire "c'est applique/enregistre" depuis une branche preview/status/reject/
  revise/explain/failed.
- Ajouter une nouvelle regex metier dans `run.ts` ou dans le dispatcher pour
  decoder une valeur de preference.
- Faire du fallback deterministe le chemin principal de comprehension.

## Legacy Exceptions

- `intake.ts` conserve un fallback `deterministicPatchFromMessage` marque
  transitionnel. Il est desactive par defaut et ne s'active que si
  `__enable_transition_regex_fallback === true`. Il reste uniquement comme
  filet de rollback local et doit produire exclusivement les trois cles UI
  supportees. Il pourra etre supprime quand les tests slot filler et router
  couvrent durablement les formulations QA sans fallback.
- `route_guards.ts` contient encore des guards regex d'admission,
  verification, approval explicite et contradiction de direction. Ils sont dans
  le perimetre du skill, pas dans `run.ts`, et ne produisent ni patch ni write.
  Leur role est d'eviter que le dispatcher rate un tour evident ou approuve une
  confirmation active. Ils doivent disparaitre quand `TurnAgenda` et le
  `Confirmation Contract` transportent ces intents de facon structuree.
- `run.ts` contient encore `loadCoachPreferenceRuntimeContext`, un adapter
  d'integration qui lit `user_profile_facts` puis appelle
  `loadCoachPreferenceRuntimePolicy`. Cette exception est acceptable tant que
  `run.ts` ne decide pas la semantique des preferences. A terme, ce chargement
  doit rejoindre un registry central de policies runtime.

## Required Tests

- `tools/operations/update_coach_preferences/tests.ts`
  - cles autorisees exactement `tone/challenge/question_tendency`;
  - cles unsupported rejetees;
  - mode tunnel compile seulement vers `tone=direct` et
    `question_tendency=low` quand durable;
  - action-first, no-emoji, no-final-question et max-lines ne creent pas de
    preference durable;
  - preview_only ne cree ni pending write ni DB write;
  - approve ecrit uniquement via executor;
  - write failed donne `executedTools: []` et aucun committed effect;
  - status lit la DB et ignore `system_default`;
  - runtime policy traduit les trois cles en contraintes composer.
- `router/run_product_help_guard.test.ts`
  - `update_coach_preferences` explicite bat les routes non pertinentes;
  - preview/status ne mutent pas.
- `router/turn_intent_arbitrator.test.ts`
  - l'arbitrage peut selectionner le skill sans interpreter la valeur.
- Verifications architecture :
  - `rg "coach.response_max_lines|coach.emoji_policy|coach.final_question_policy|coach.action_first_policy" supabase/functions/sophia-brain -g "*.ts"` ne doit trouver aucune reference active;
  - `deno check` doit passer sur les fichiers touches ou documenter une dette
    preexistante hors perimetre.

## Suivi Des Decisions Architecturales

- 2026-05-30 - Decision active : `update_coach_preferences` ne persiste que les
  trois preferences UI visibles (`tone`, `challenge_level`,
  `question_tendency`). Les demandes de format/style hors scope restent
  ponctuelles ou donnent une clarification honnete.
- 2026-05-30 - Decision active : le router local produit un
  `UpdateCoachPreferencesSkillResult` avec `committed_effects`, puis l'adapte en
  `OperationRuntimeResult`. `executedTools` depend du commit, pas de la simple
  tentative d'execution.
- 2026-05-30 - Decision transitionnelle : les guards regex restants vivent dans
  `route_guards.ts` et le fallback deterministe dans `intake.ts` reste desactive
  par defaut. Aucune de ces exceptions ne peut creer une cle hors UI ni
  contourner l'executor.
