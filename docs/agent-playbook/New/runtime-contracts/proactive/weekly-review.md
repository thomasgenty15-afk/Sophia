# weekly_adaptive_review Runtime Contract

## Mental Model

`weekly_adaptive_review_v1` est un workflow proactif de décision
hebdomadaire. Il lit des preuves, produit une lecture stratégique, clarifie si
le signal humain est faible, puis propose un handoff plateforme si la semaine
doit être allégée ou réorganisée.

Il ne modifie plus le plan depuis le chat.

Chemin canonique V1 :

```txt
weekly_progress_review projection
  -> weekly_review evidence
  -> weekly_review reducer
  -> strategy / coaching recommendation
  -> clarification si signal faible
  -> optional adjust_plan platform_handoff
  -> renderer no-mutation
```

Le weekly peut recommander :

- garder la semaine ;
- répéter une habitude ;
- alléger une action ;
- déplacer une charge ;
- ouvrir une revue du niveau ;
- créer un handoff `adjust_plan_item` vers la section Plan.

Mais il ne prépare plus de patch applicable, ne crée plus de pending
confirmation exécutable et ne marque plus un ajustement comme appliqué depuis
le chat.

## Dépend De L'Architecture De X

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour ;
- `TurnAgenda` pour distinguer `reply`, `effect`, `platform_handoff`,
  `clarification`, `status`, `memory` et `repair` ;
- `clarification_tool` quand la fatigue, le sens de la demande ou le scope
  weekly est ambigu ;
- `Active Handoff Arbitration` quand un handoff `adjust_plan_item` est actif ;
- `Product Surface Registry` pour obtenir la destination canonique `plan` ;
- `EffectLedger` pour tracer le handoff weekly sans commit ;
- le contrat local de `weekly_adaptive_review` pour l'evidence, le reducer,
  les bridges et le renderer.

Utilisation concrète dans le code actuel :

- `UserTurnSnapshot`/`TurnAgenda` ne sont pas encore branchés directement dans
  tout le module weekly. Leur rôle est encore partiellement simulé par
  `TurnFrame` + `RouteDecision` dans `sophia-brain/router/run.ts`.
- Le maintien du skill actif passe par
  `shouldKeepWeeklyAdaptiveReviewInConversation(...)` dans
  `sophia-brain/skills/weekly_review/bridges.ts`.
- Les fonctions historiques autour de `weeklyReviewAllowsAdjustPlanBridge`,
  `directWeeklyAdjustPlanRuntime` ou
  `hasPendingOrActiveAdjustPlanOperation` doivent être réinterprétées comme
  handoff Plan, pas comme exécution.
- `sophia-brain/tools/operations/adjust_plan_item/weekly_bridge.ts` peut
  continuer à préparer le contexte weekly pour `adjust_plan_item`, mais son
  résultat nominal est un `platform_handoff`, jamais un patch committé.

## Runtime Shape

```txt
process-checkins/index.ts
  -> loadWeeklyProgressReview(...)
  -> buildWeeklyAdaptiveReview(...)
  -> generateWeeklyAdaptiveReviewOpening(...)
  -> active skill state weekly_adaptive_review_v1

conversation turn
  -> dispatcher / routeDecision
  -> skills/weekly_review/runtime.ts facade
  -> evidence / reducer / state / bridges / renderer
  -> optional clarification_tool
  -> optional adjust_plan_item handoff
  -> EffectLedger platform_handoff / clarification
  -> final response guards
```

`sophia-brain/skills/weekly_review/runtime.ts` reste une façade mince. Il ne
doit pas redevenir un fichier de logique métier massif.

## File Ownership

- `_shared/weekly_review/contract.ts`
  possède les types stables :
  `WeeklyReviewDecision`, `WeeklyReviewIntent`, `WeeklyReviewStatus`,
  `WeeklyEvidenceSummary`, `WeeklyHumanSignals`, contraintes et stratégies.
- `_shared/weekly_progress_review.ts`
  possède la projection factuelle :
  `loadWeeklyProgressReview(...)`,
  `buildWeeklyProgressReviewFromRows(...)`,
  `buildWeeklyProgressReviewGrounding(...)`.
- `_shared/weekly_review/evidence.ts`
  transforme la projection en preuves exploitables.
- `_shared/weekly_review/reducer.ts`
  possède la stratégie hebdomadaire.
- `_shared/weekly_review/plan_patch.ts`
  est legacy pour le chemin ancien. En V1 handoff, il ne doit pas produire de
  patch applicable depuis le chat.
- `_shared/weekly_review/confirmation.ts`
  est legacy pour l'ancien pending patch. En V1 handoff, une confirmation
  courte devient `apply_attempt`, pas application.
- `_shared/weekly_review/effects.ts`
  peut encore servir aux effets weekly directs non-plan si ceux-ci restent
  explicitement autorisés, mais l'ajustement plan n'en fait plus partie.
- `_shared/weekly_review/renderer.ts`
  possède le rendu contractuel de la décision et du handoff.
- `sophia-brain/skills/weekly_review/state.ts`
  possède l'état actif runtime.
- `sophia-brain/skills/weekly_review/bridges.ts`
  arbitre les sorties vers `adjust_plan_item` handoff.
- `sophia-brain/skills/weekly_review/evidence.ts`
  gère la correction "j'avais oublié de cocher" pendant le weekly via
  `track_progress_plan_item`, qui reste un direct effect exécutable seulement
  si le tool retourne un commit.
- `sophia-brain/tools/operations/adjust_plan_item/weekly_bridge.ts`
  transforme les demandes weekly explicites en handoff Plan. Il ne doit jamais
  être l'executor durable.
- `sophia-brain/router/run.ts`
  reste orchestrateur.

## Inputs

- Projection factuelle `WeeklyProgressReviewV2` issue de
  `_shared/weekly_progress_review.ts`.
- Evidence daily conservée avec `source`, `reason_category`, `reason_text`,
  `still_relevant`, `reschedule_decision` et `confidence`.
- État dashboard/planning hebdomadaire confirmé.
- Réponse humaine pendant le weekly.
- État actif weekly et éventuel handoff `adjust_plan_item`.
- Corrections de progression oubliée, traitées via
  `track_progress_plan_item`.

## Outputs

- `WeeklyReviewDecision` structuré avec `evidence`, `habit_verdict`,
  `human_signals`, `week_strategy`, `question`, `item_decisions`,
  `constraints`, `state_patch`.
- Message d'ouverture proactive weekly.
- Question bloquante si le signal est faible.
- Recommandation de semaine suivante.
- `platform_handoff.adjust_plan_item` quand le weekly recommande un changement
  de plan.
- `clarification` quand la demande weekly est ambiguë.
- Réponse user-facing nettoyée des labels internes et des faux claims de
  succès.

Sortie handoff attendue :

```txt
toolExecution="platform_handoff"
executedTools=[]
committed_effects=[]
platform_handoff.operation_type="adjust_plan_item"
platform_handoff.surface_id="plan"
no_chat_mutation=true
```

## Invariants

- `weekly_review_v1` est la source de vérité stratégique.
- `weekly_progress_review.ts` reste une projection factuelle ; il ne décide pas
  `advance`, `repeat_week`, `bridge_week`, `level_review`, `carry_over` ou
  `drop`.
- Toute décision stratégique passe par `reduceWeeklyReview(...)`.
- Aucun changement durable de plan ne s'applique depuis weekly chat.
- Weekly ne crée pas de pending confirmation exécutable pour ajuster le plan.
- `approve` / `ok vas-y` pendant un handoff weekly devient `apply_attempt`
  non-mutant.
- Low/none daily coverage ou low confidence pose une question ou recommande
  prudemment, sans appliquer.
- Une mission/clarification déjà faite ne peut jamais être `carry_over`,
  `drop` ou `repeat_with_week`.
- Une habitude déjà faite est comptabilisée, pas replanifiée comme tâche.
- Weekly ne modifie pas directement l'objectif du niveau ni l'architecture
  profonde du niveau. Il propose `open_level_review` ou un handoff Plan.
- Les supports/fiches ne sont pas des items weekly à reporter ou alléger.
- Les labels internes `bridge_week`, `plan_patch`, `carry_over`,
  `item_decision`, `level_review`, `not_relevant` ne doivent pas sortir dans
  la réponse visible.
- Aucun wording "appliqué", "validé", "corrigé", "reporté", "enregistré" ne
  peut être visible pour un ajustement plan.

## Integration Points

- `process-checkins/index.ts`
  construit la projection, crée la décision, génère l'ouverture proactive puis
  installe l'état actif `weekly_adaptive_review_v1`.
- `whatsapp-webhook/handlers_pending.ts`
  active l'état weekly à partir du payload proactif.
- `sophia-brain/router/run.ts`
  appelle les fonctions du runtime weekly, mais ne possède pas leur logique.
- `adjust_plan_item/router.ts`
  possède le handoff Plan. Le bridge weekly lui fournit le contexte; il ne lui
  demande pas d'appliquer un patch.
- `track_progress_plan_item/router.ts`
  possède l'écriture d'une correction de progression oubliée pendant le weekly.
- `EffectLedger`
  trace `platform_handoff.adjust_plan_item`, sans `committed` et sans
  `executedTools`.
- `Product Surface Registry`
  fournit la destination `plan`.

## Allowed Changes

- Ajouter un champ au contrat local dans `_shared/weekly_review/contract.ts` si
  le reducer, le renderer et les tests sont mis à jour ensemble.
- Renforcer la projection factuelle sans y ajouter de stratégie.
- Améliorer `reduceWeeklyReview(...)` avec une règle testée.
- Ajouter une recommandation `adjust_plan_item` seulement si elle sort comme
  `platform_handoff`.
- Déplacer des guards legacy de `runtime.ts` vers `guards.ts`, `renderer.ts`,
  `confirmation.ts`, `bridges.ts`, `state.ts` ou `evidence.ts`.
- Ajouter des tests ciblés sous `skills/weekly_review/*_test.ts` ou
  `_shared/weekly_review_test.ts`.

## Forbidden Changes

- Ajouter une regex weekly dans `run.ts`.
- Réintroduire une stratégie parallèle dans `_shared/weekly_adaptive_review.ts`,
  `weekly_adaptive_review_opening.ts`, `run.ts` ou `weekly_bridge.ts`.
- Appliquer un patch weekly depuis un "ok" global.
- Utiliser `adjust_plan_item/weekly_bridge.ts` comme executor.
- Faire dire "c'est appliqué/enregistré/validé/corrigé/reporté" pour un
  ajustement Plan.
- Modifier directement l'objectif du niveau depuis weekly.
- Reporter une action déjà faite.
- Masquer des labels internes uniquement par un guard final sans corriger le
  renderer ou l'instruction propriétaire.
- Ajouter une proposition tool/carte/potion pendant l'ouverture weekly sans
  passer par handoff ou clarification explicite.

## Legacy Exceptions

- `weekly_adaptive_review_opening.ts` génère encore une ouverture par IA à
  partir de grounding + instruction, puis valide avec
  `weeklyAdaptiveReviewOpeningLooksValid(...)`.
- `sophia-brain/skills/weekly_review/confirmation.ts` garde des helpers
  historiques pour l'ancien modèle de patch. Ils doivent être migrés vers
  `apply_attempt` / `revise_handoff` / `repeat_handoff` pour le plan.
- `sophia-brain/skills/weekly_review/guards.ts` et `renderer.ts` contiennent
  encore des nettoyages lexicaux. Ils restent uniquement pour empêcher une
  fuite visible de labels internes ou de claims sans commit.
- `maybeLogWeeklyForgottenProgressParallel(...)` accepte une correction
  "action faite mais oubliée" dans le weekly. Elle reste car elle passe par
  `track_progress_plan_item`, un direct effect autorisé.
- `v2-weekly-bilan-engine.ts` reste testé pour l'ancien bilan V2, mais
  `materializeWeeklyAdjustments(...)` est legacy et ne doit pas être utilisé
  pour `weekly_review_v1`.

## Required Tests

- `_shared/weekly_review_test.ts`
  - stratégie hebdomadaire à partir des preuves ;
  - low coverage / low confidence pose une question ;
  - completed mission never carried over ;
  - habit done counted not rescheduled ;
  - no done language for plan adjustment.
- `sophia-brain/skills/weekly_review/weekly_review_state_test.ts`
  protège l'état actif et la mémoire de synthèse.
- `sophia-brain/skills/weekly_review/weekly_review_renderer_test.ts`
  protège le nettoyage des labels internes et le langage handoff.
- `sophia-brain/skills/weekly_review/weekly_review_confirmation_test.ts`
  protège `apply_attempt`, `revise_handoff`, `repeat_handoff`, cancel et
  unrelated.
- `sophia-brain/skills/weekly_review/weekly_review_bridges_test.ts`
  protège le bridge adjust-plan comme `platform_handoff`, pas comme patch.
- `sophia-brain/skills/weekly_review/weekly_review_evidence_test.ts`
  protège les corrections de progression oubliée.
- `sophia-brain/tools/operations/adjust_plan_item/router_test.ts`
  doit inclure `weekly_adjust_plan_bridge_creates_platform_handoff_no_commit`.
- Tests transverses :
  - weekly surcharge -> handoff Plan ;
  - aucun `writePlanAdjustmentPatch` ;
  - aucun `executedTools=["adjust_plan_item"]` ;
  - aucun `committed_effects` plan ;
  - destination Plan présente ;
  - "ok vas-y" répète le handoff et n'applique pas.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | `weekly_review_v1` est la source de vérité stratégique ; `_shared/weekly_adaptive_review.ts` reste une façade compatible qui délègue au reducer et au renderer du contrat. | Active | `15-chantiers-log.md` J22 |
| 2026-05-30 | Le runtime weekly est documenté comme façade de sous-modules `state`, `confirmation`, `effects`, `renderer`, `bridges`, `guards`, `evidence`; `run.ts` ne doit pas reprendre ces responsabilités. | Active | `15-chantiers-log.md` J55 |
| 2026-06-01 | Weekly ne modifie plus le plan depuis le chat; ses ajustements deviennent `platform_handoff.adjust_plan_item` vers Plan. | Active | Architecture handoff V1 |
