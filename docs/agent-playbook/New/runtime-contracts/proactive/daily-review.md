# daily_action_review Runtime Contract

## Mental Model

`daily_action_review_v1` est un collecteur de preuve léger. Il choisit une ou
deux actions planifiées, pose une seule question principale, comprend la réponse
du jour, prépare un `effect_plan`, puis ne rend un message de réussite que si le
writer a produit un ledger explicite de commit.

Ce domaine n'est pas un coach complet : il ne propose pas de carte, potion,
solution, défense, ajustement de plan ou relance culpabilisante pendant la
collecte. Les données validées servent ensuite au weekly et aux autres skills.

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour ;
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair ;
- `Confirmation Contract` pour interpréter approve/reject/revise/explain ;
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé ;
- le contrat local de X pour l'intake, le reducer, les effets et le renderer.

Dans le code actuel, le daily n'est pas encore routé comme un skill complet
dans `supabase/functions/sophia-brain/skills/*`. Son équivalent opérationnel de
snapshot est le pending WhatsApp :

- `supabase/functions/process-checkins/index.ts` crée l'ouverture, persiste
  `chat_capability: "daily_action_review"` et stocke `review_state` dans le
  payload de `whatsapp_pending_actions`;
- `supabase/functions/whatsapp-webhook/handlers_pending.ts` relit le pending,
  les `targets`, le `review_state`, le texte utilisateur et les messages
  récents avant d'appeler l'intake daily.

La séparation `TurnAgenda` est appliquée localement par le contrat daily :

- `supabase/functions/_shared/daily_action_review/contract.ts` porte
  `DailyReviewIntent`, `DailyReviewDecision`, `DailyReviewEffectPlan`,
  `DailyReviewEffectsResult`, `constraints`, `missing_slots`, `stop_reason` et
  `effect_plan`;
- `supabase/functions/_shared/daily_action_review/reducer.ts` décide la
  transition d'état, le besoin de clarification et l'autorisation d'effet ;
- `supabase/functions/_shared/daily_action_review/effects.ts` prépare les
  effets autorisés sans écrire ;
- `supabase/functions/_shared/daily_action_review/executor.ts` transforme le
  plan autorisé en `committed_effects` / `failed_effects`;
- `supabase/functions/_shared/daily_action_review/renderer.ts` interdit le
  wording "noté/enregistré" quand le ledger ne prouve aucun commit.

Le `Confirmation Contract` global ne doit pas être réimplémenté par des regex
dans le daily. Les réponses "oui/non", corrections, recap, stop, off-topic et
clarifications sont représentées par l'intake structuré dans
`supabase/functions/_shared/daily_action_review/intake.ts` via
`parseDailyReviewAnswer` et `sanitizeDailyReviewDecision`. Les confirmations
globales de tools restent hors périmètre daily.

L'`EffectLedger` est l'invariant fort du domaine :

```txt
DailyReviewDecision.effect_plan
  -> executeDailyReviewEffectPlan(...)
  -> DailyReviewEffectsResult.committed_effects / failed_effects
  -> dailyReviewFinalMessageRequiresCommit(...)
```

Un daily ne peut donc pas répondre "C'est noté" ni marquer le pending comme
terminé sans écriture DB réussie ou idempotence vérifiée avec `entry_id`.

## Runtime Shape

```txt
process-checkins opening
  -> selector
  -> opening renderer
  -> pending WhatsApp payload
  -> structured intake
  -> reducer
  -> effect_plan
  -> executor
  -> DB writer adapter
  -> committed_effects ledger
  -> deterministic final renderer
  -> weekly evidence
```

## File Ownership

- `supabase/functions/_shared/daily_action_review/contract.ts` possède le
  contrat local : intents, outcomes, reason categories, constraints, decisions,
  effect plan, committed effects et effects result.
- `supabase/functions/_shared/daily_action_review/selector.ts` possède
  `selectInitialDailyActionReviewFocus` et `dailyActionReviewFocusTargets`.
  Il borne le focus à une ou deux occurrences et applique la priorité
  habit > mission > clarification.
- `supabase/functions/_shared/daily_action_review/opening.ts` possède
  `renderDailyActionReviewOpeningInstruction` et les garde-fous d'ouverture
  comme `openingHasForbiddenDailyReviewCoaching`.
- `supabase/functions/_shared/daily_action_review/intake.ts` possède
  `parseDailyReviewAnswer` et la validation JSON du LLM. Le code y normalise
  les décisions plutôt que de classer l'outcome par regex métier.
- `supabase/functions/_shared/daily_action_review/reducer.ts` possède
  `reduceDailyReviewState`, le merge des item updates, les `missing_slots`, le
  statut du flow et le recalcul de `should_apply_effects`.
- `supabase/functions/_shared/daily_action_review/effects.ts` possède
  `buildDailyReviewEffectPlan`. Il produit ce qu'on a le droit d'écrire, pas ce
  qui est déjà écrit.
- `supabase/functions/_shared/daily_action_review/executor.ts` possède
  `executeDailyReviewEffectPlan` et `dailyReviewEffectsFullyCommitted`. Il
  orchestre les writes injectés et produit le ledger de commit.
- `supabase/functions/_shared/daily_action_review/renderer.ts` possède
  `dailyReviewFinalMessageRequiresCommit` et
  `renderDailyReviewCommitFailureMessage`.
- `supabase/functions/_shared/daily_action_review.ts` reste la façade
  temporaire : `runDailyActionReviewSkill`,
  `runDailyActionReviewFollowupSkill`, `buildInitialDailyActionReviewState`,
  `buildDailyActionReviewInstruction`,
  `buildDailyActionReviewActionIntelligence` et
  `buildDailyActionReviewOpeningPlan`.
- `supabase/functions/whatsapp-webhook/handlers_pending.ts` possède encore
  l'adapter DB concret : `handleActionEveningReviewReply`,
  `applyDailyOccurrenceOutcome`, `markDailyActionReviewStructuredExtraction` et
  `sendDailyActionReviewAssistantMessage`.
- `supabase/functions/process-checkins/index.ts` possède la création proactive
  de l'ouverture et l'enregistrement du pending.
- `supabase/functions/_shared/v2-daily-bilan-decider.ts` possède la policy
  d'envoi daily (`decideDailyBilan`, `DailyBilanPolicyDecision`).
- `supabase/functions/_shared/weekly_progress_review.ts` et
  `supabase/functions/_shared/weekly_review/*` consomment l'evidence daily ;
  ils ne doivent pas réinterpréter une phrase brute déjà validée par daily.
- `supabase/functions/sophia-brain/router/run.ts` ne possède pas le daily.
  Aucun nouveau parsing daily, fallback daily ou handoff weekly daily ne doit y
  être ajouté.

## Inputs

- occurrences candidates du jour ;
- `review_state` précédent, s'il existe ;
- texte utilisateur courant ;
- targets persistées dans le pending ;
- contexte borné `action_intelligence_by_occurrence_id` ;
- messages récents uniquement pour aider l'intake à distinguer correction,
  recap, stop, off-topic ou continuation.

## Outputs

- `DailyReviewDecision` avec `intent`, `status`, `target_occurrence_ids`,
  `item_updates`, `missing_slots`, `constraints`, `next_question`,
  `stop_reason`, `should_apply_effects` et `effect_plan`;
- `DailyReviewEffectPlan` avec les effets autorisés ;
- `DailyReviewEffectsResult` avec `committed_effects` et `failed_effects`;
- evidence weekly-ready : `outcome`, `reason_category`, `reason_text`,
  `still_relevant`, `evidence_text`, `confidence`,
  `source: "daily_action_review_v1"`;
- message final déterministe aligné sur le ledger.

## Responsabilités De X

- choisir les actions cibles du daily ;
- rendre l'ouverture avec une seule question principale ;
- comprendre la réponse libre via intake JSON structuré ;
- maintenir l'état multi-tour et les slots manquants ;
- distinguer completed, partial, missed, unclear, correction, recap, stop,
  safety et off-topic ;
- préparer un `effect_plan` sans écrire ;
- exécuter le plan via un writer injecté et produire le ledger ;
- empêcher le wording de succès sans commit ;
- fournir des données propres au weekly.

## Responsabilités Hors X

- décider globalement si le daily doit partir : `v2-daily-bilan-decider.ts` et
  l'orchestration de `process-checkins/index.ts` ;
- appliquer des plans, proposer des tools, cartes, potions ou ajustements ;
- traiter une crise safety au-delà du handoff/suspension du daily ;
- interpréter les données dans le weekly ;
- router les conversations générales dans `run.ts` ;
- créer une confirmation tool globale.

## Invariants

- Ouverture : une question principale max, targets exactes, aucune target hors
  focus, pas de "déjà fait/déjà raté", pas de solution/tool/potion/plan
  adjustment.
- Intake : pas de regex métier pour classer `completed | partial | missed`.
  Le LLM remplit un JSON, puis le code valide et borne.
- Evidence : aucun effet sans `occurrence_id`, `outcome`, `evidence_text`,
  `confidence` medium/high et `missing_slots` vide.
- Ambiguïté : deux targets et "je l'ai fait" => `which_action` manquant, aucun
  effet.
- Partial : demande au minimum une raison ou un niveau de completion si c'est
  flou.
- Missed : demande la raison et `still_relevant` si inconnus.
- Stop/off-topic/safety : aucun effet, pas de relance dans le même flow.
- Mémoire : `action_intelligence` sert au ton et au contexte, jamais à
  remplacer la réponse du jour.
- Commit : `effect_plan.allowed === true` autorise seulement la tentative
  d'écriture ; seul `committed_effects` prouve le commit.
- Idempotence : une entrée existante vérifiée le même jour est représentée
  explicitement comme commit idempotent avec `entry_id`, sans duplicate insert.
- Renderer : pas de "noté/enregistré/c'est fait" si
  `committed_effects.length === 0`.

## Integration Points

- `process-checkins/index.ts` : génération proactive de l'ouverture, garde-fou
  de couverture des targets, pending `daily_action_review`.
- `whatsapp-webhook/handlers_pending.ts` : reprise du pending, intake, reducer,
  executor, writes DB, ledger, message final et completion du pending.
- `user_plan_item_entries` : table écrite pour les logs daily.
- `applyDailyOccurrenceOutcome` : side effects occurrence/plan item existants,
  encore localisés dans le handler pending.
- `weekly_progress_review.ts` : lit les entrées daily via
  `DAILY_ACTION_REVIEW_SOURCE`.
- `weekly_review/runtime.ts`, `weekly_review/evidence.ts` et
  `tools/operations/adjust_plan_item/weekly_bridge.ts` : handoff weekly de la
  progression oubliée, hors `run.ts`.

## Allowed Changes

- ajouter une reason category si le contrat, l'intake, les tests et weekly sont
  mis à jour ensemble ;
- améliorer le selector sans dépasser la limite par défaut de deux actions ;
- enrichir `DailyReviewEffectsResult` avec un statut explicite, tant que le
  renderer continue à exiger une preuve de commit ;
- migrer progressivement l'adapter DB de `handlers_pending.ts` vers un module
  dédié si l'API garde `effect_plan -> executor -> committed_effects`.

## Forbidden Changes

- écrire directement depuis l'intake ou le reducer ;
- ajouter un fallback regex qui décide l'outcome métier ;
- dire "C'est noté" sans `committed_effects` ou idempotence vérifiée ;
- marquer un pending daily done quand un effet attendu a échoué ;
- proposer outil, carte, potion, coaching ou ajustement pendant la collecte ;
- faire dépendre l'outcome de la mémoire au lieu de la réponse du jour ;
- réintroduire le daily ou son handoff weekly dans `run.ts`.

## Legacy Exceptions

- `supabase/functions/_shared/daily_action_review.ts` reste une façade
  temporaire parce que le daily n'est pas encore déplacé dans
  `sophia-brain/skills/*`. Elle est acceptable tant qu'elle délègue aux modules
  contract/selector/opening/intake/reducer/effects/executor/renderer.
- `supabase/functions/whatsapp-webhook/handlers_pending.ts` garde encore la
  logique DB concrète (`applyDailyOccurrenceOutcome`, insert
  `user_plan_item_entries`, update pending). Cette exception protège le
  lifecycle WhatsApp existant. Elle pourra être supprimée quand l'executor daily
  possédera un adapter DB versionné et testé.
- Les messages de clarification/fallback courts restent dans le handler pending
  pour préserver le flow existant si l'IA échoue. Ils ne peuvent pas appliquer
  d'effet ni utiliser du wording de commit.
- `process-checkins/index.ts` utilise encore une génération dynamique
  d'ouverture, mais elle est bornée par `buildDailyActionReviewInstruction` et
  par la vérification de couverture des targets.

## Required Tests

- `supabase/functions/_shared/daily_action_review_test.ts` :
  opening focus only, no solution/tool, completed applies effect, partial needs
  reason, missed needs still relevant, ambiguous action no effect, correction,
  recap no write, user stopped, safety, off-topic, executor no-write,
  successful commit, writer failure, partial success, idempotent existing entry,
  final done language requires commit.
- `supabase/functions/_shared/v2-daily-bilan-decider_test.ts` :
  supportive distress, repeated blocker, progress mode, silence/reactivation,
  overload suppressing progress push, no active items suppress.
- `supabase/functions/_shared/weekly_progress_review_test.ts` :
  daily evidence feeds weekly without raw reinterpretation.
- `supabase/functions/_shared/weekly_review_test.ts` :
  weekly handoff stays compatible with daily evidence.
- Checks ciblés :
  `deno check supabase/functions/_shared/daily_action_review.ts supabase/functions/_shared/daily_action_review/contract.ts supabase/functions/_shared/daily_action_review/effects.ts supabase/functions/_shared/daily_action_review/executor.ts supabase/functions/_shared/daily_action_review/renderer.ts supabase/functions/whatsapp-webhook/handlers_pending.ts`.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-29 | Daily = collecteur de preuve léger, pas coach complet. | Actif | J11 |
| 2026-05-30 | `run.ts` ne possède plus le daily ni le parsing weekly oublié ; le handoff weekly vit dans `adjust_plan_item/weekly_bridge.ts` et `weekly_review/*`. | Actif | J16 |
| 2026-05-30 | Le daily suit `effect_plan -> executor -> committed_effects -> renderer` ; "noté" exige commit ou idempotence vérifiée. | Actif | J17 |
| 2026-05-30 | Le runtime contract daily devient la source de vérité opérationnelle pour les responsabilités, invariants et fallbacks legacy du domaine. | Actif | J48 |
