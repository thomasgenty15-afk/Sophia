# Confirmation Contract

## Mental Model

Le Confirmation Contract est le vocabulaire commun qui repond a la question :
ce tour user confirme-t-il, rejette-t-il, corrige-t-il, demande-t-il une
preview, demande-t-il une explication, demande-t-il un status, ou parle-t-il
d'autre chose ?

Il ne possede aucun brouillon metier et n'execute aucun effet. Il produit une
decision ciblee et typée que le skill L5 proprietaire convertit ensuite en
transition de workflow. Une confirmation courte comme `ok` ne valide donc rien
par elle-meme : elle ne peut autoriser l'execution que si elle cible un pending
precis, compatible, unique et non contredit par une correction, une demande de
preview, une explication, un status ou une nouvelle intention.

## Dépend De L'Architecture De X

Ce domaine depend de :

- `UserTurnSnapshot` pour lire l'etat complet du tour. Dans le code actuel,
  `decideConfirmation(...)` accepte encore des snapshots partiels
  (`pending`, `active_operation`, `agenda_tasks`,
  `turn_frame_confirmation`) plutot qu'un objet `UserTurnSnapshot` complet.
  Les snapshots complets sont construits dans
  `router/user_turn_snapshot.ts` et exposes par `router/run.ts`, mais cette
  brique n'est pas encore le seul input du contrat confirmation.
- `TurnAgenda` pour distinguer reply, effects, status, memory et repair. Le
  contrat accepte deja `agenda_tasks` et les utilise pour rendre `approve`
  ambigu quand plusieurs cibles compatibles existent. La construction de
  l'agenda vit dans `router/turn_agenda.ts`; l'integration confirmation est
  encore partielle.
- `Confirmation Contract` lui-meme, possede par
  `router/confirmation_contract.ts`. La fonction canonique est
  `decideConfirmation(...)`.
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committe. Le
  Confirmation Contract ne ledgerise pas; il expose `should_execute`,
  `should_clear_pending`, `should_revise` et `should_explain` pour que le tool
  L5 produise ensuite des `requested_effects`, `allowed_effects`,
  `blocked_effects` ou `committed_effects`. Le ledger courant vit dans
  `router/effect_ledger.ts` et est orchestre depuis `router/run.ts`.
- le contrat local du tool L5 pour l'intake, le reducer, les effets et le
  renderer. Exemple : `prepare_attack_card` appelle
  `decidePrepareAttackCardNextStep(...)` dans
  `tools/operations/prepare_attack_card/contract.ts`; le contrat global ne
  remplace pas cette decision metier.

## Runtime Shape

```txt
TurnFrame + pending/active/agenda snapshot + user message
  -> router/confirmation_contract.ts::decideConfirmation
  -> tool L5 owner router
  -> tool local intake/reducer/effect plan
  -> executor only when the local tool allows it
  -> renderer / status reply grounded in committed or read-only state
  -> EffectLedger / final response guard
```

Le contrat global est une decision de ciblage et de securite, pas un troisieme
appel IA. Il peut utiliser `turn_frame.confirmation_response` comme signal, mais
ne l'execute jamais aveuglement sans target compatible.

## File Ownership

- Contrat global :
  `supabase/functions/sophia-brain/router/confirmation_contract.ts`.
  Fonctions/types proprietaires :
  `decideConfirmation`, `ConfirmationDecision`,
  `ConfirmationDecisionKind`, `PendingConfirmationSnapshot`,
  `ConfirmationTarget`.
- Tests du contrat global :
  `supabase/functions/sophia-brain/router/confirmation_contract.test.ts`.
- Integration `update_coach_preferences` :
  `tools/operations/update_coach_preferences/router.ts` appelle
  `decideConfirmation(...)` quand
  `loadCoachPreferenceFrameFromTempMemory(...).pending` est une operation
  `update_coach_preferences`.
- Integration `prepare_attack_card` :
  `tools/operations/prepare_attack_card/router.ts` appelle
  `decideConfirmation(...)` quand `isPendingAttackCardOperation(pendingRaw)` est
  vrai.
- Legacy confirmation IA partagee :
  `tools/operations/_shared/confirmation_review.ts` et sa fonction
  `reviewToolSkillConfirmationWithAi(...)`.
- Legacy reviews draft locales :
  `tools/operations/_shared/draft_review.ts`,
  `tools/operations/update_coach_preferences/intake.ts`,
  `tools/operations/prepare_attack_card/ai_intake.ts`,
  `tools/operations/prepare_defense_card/ai_intake.ts`.

## Inputs

`decideConfirmation(...)` lit :

- `message` : dernier message user brut, normalise localement dans le contrat ;
- `pending` : `PendingConfirmationSnapshot` avec `operation_id`,
  `operation_type`, `effect_type`, `summary`, `draft`,
  `expires_after_turns` ;
- `active_operation` : contexte actif optionnel, utilise surtout quand il n'y a
  pas de pending executable ;
- `agenda_tasks` : taches concurrentes optionnelles pour detecter plusieurs
  cibles compatibles ;
- `turn_frame_confirmation` : signal L1 optionnel
  `TurnFrame.confirmation_response`.

Inputs metier qui restent hors contrat :

- slots de preference coach, carte, rappel ou potion ;
- contenu complet du brouillon ;
- contraintes comme `draft_only` / `no_create` au-dela de leur traduction en
  decision `preview` ou `revise` ;
- safety gates et droits d'ecriture DB.

## Outputs

`ConfirmationDecision` expose :

- `decision` :
  `approve | reject | revise | explain | preview | status | unrelated | ambiguous` ;
- `applies_to_pending_effect` : vrai seulement si la cible correspond au
  pending courant ;
- `target` : operation/effect/source ciblee ;
- `confidence` : `low | medium | high` ;
- `evidence` et `reason_code` ;
- flags d'orchestration :
  `should_execute`, `should_clear_pending`, `should_revise`,
  `should_explain`.

Seul `approve` peut porter `should_execute=true`, et seulement si la cible
pending est compatible. Tous les autres outputs doivent produire zero effet
committe.

## Responsibilities

Le Confirmation Contract possede :

- la classification commune approve/reject/revise/explain/preview/status/
  unrelated/ambiguous ;
- la normalisation de ciblage minimal entre pending, active flow et agenda ;
- la regle de precedence : status/explain/preview/revise/reject bloquent toute
  execution avant approve ;
- la protection contre les confirmations incompatibles, par exemple pending
  attack card + `programme le rappel` => `unrelated` ;
- les flags utilisables par l'EffectLedger et les routers L5.

Le Confirmation Contract ne possede pas :

- la generation d'un brouillon ;
- la validation metier d'un draft ;
- l'intake structure d'un tool ;
- le reducer/state machine local ;
- la preparation exacte des effets metier ;
- l'execution DB ;
- la reponse user-facing finale.

## Intake Structuré

Le Confirmation Contract n'a pas d'intake IA propre. Il depend de deux sources
structurees existantes :

- L1 dispatcher :
  `contracts/turn_frame.v1.ts::TurnFrame.confirmation_response` avec
  `kind: yes | no | correction_to_pending | topic_change | unknown` et
  `confidence_band` ;
- L5 skill/tool intake :
  chaque tool lit le message dans son contexte metier, par exemple
  `runUpdateCoachPreferencesIntake(...)` dans
  `tools/operations/update_coach_preferences/intake.ts` ou
  `runPrepareAttackCardAiIntake(...)` dans
  `tools/operations/prepare_attack_card/ai_intake.ts`.

Le contrat global peut filtrer un `yes` L1, mais il ne doit pas devenir un
troisieme classifier IA entre dispatcher et skill.

## Reducer / State Transition

Le reducer n'est pas dans `confirmation_contract.ts`.

- `update_coach_preferences` fait la transition dans
  `tools/operations/update_coach_preferences/router.ts` :
  `approve.should_execute` appelle `executeConfirmedCoachPreferenceDraft(...)`,
  `reject` clear le frame via `clearCoachPreferenceFrame(...)`, `revise`
  repasse par `runUpdateCoachPreferencesIntake(...)`, `preview`/`explain`/
  `status` restent read-only.
- `prepare_attack_card` fait la transition dans
  `tools/operations/prepare_attack_card/router.ts` puis dans
  `decidePrepareAttackCardNextStep(...)` :
  `preview` devient `draft_ready`, `reject` devient `cancelled`,
  `explain/status` deviennent read-only, `revise` force
  `draft_review_decision=revise` pour empecher une execution.
- Les tools non branches (`prepare_defense_card`, reminders,
  `select_state_potion`) gardent leurs transitions locales jusqu'a migration.

## Effects

Le contrat ne prepare pas les effets metier complets. Il autorise ou bloque
l'idee d'executer un pending.

- `update_coach_preferences/router.ts` convertit une approval compatible en
  `UpdateCoachPreferencesCommittedEffect` seulement apres retour `executed` de
  `executeUpdateCoachPreferences(...)`.
- `prepare_attack_card/contract.ts` prepare un `PrepareAttackCardEffect` via
  `decidePrepareAttackCardNextStep(...)` quand le pending est compatible et que
  l'intention locale est `create`.
- `prepare_attack_card/router.ts` appelle ensuite
  `executeConfirmedAttackCardDraft(...)`, qui passe par
  `executePrepareAttackCard(...)` et `insertAttackCardFromDraft(...)`.

## Executor

Executors proprietaires :

- `tools/operations/update_coach_preferences/executor.ts` :
  `executeUpdateCoachPreferences(...)` est le seul chemin d'ecriture durable
  preference coach.
- `tools/operations/prepare_attack_card/executor.ts` :
  `executePrepareAttackCard(...)` est le guard token/safety/idempotence avant
  ecriture.
- `tools/operations/prepare_attack_card/persistence.ts` :
  `insertAttackCardFromDraft(...)` fait l'insertion DB.

Le Confirmation Contract ne doit jamais importer Supabase ni appeler un
executor.

## Renderer

Le rendu user-facing reste proprietaire du tool ou du status reader :

- `update_coach_preferences/router.ts` rend les reponses pending/read-only
  simples et appelle `buildCoachPreferencesStatusReply(...)` dans
  `tools/operations/update_coach_preferences/status.ts` pour status DB-grounded.
- `prepare_attack_card/router.ts` utilise
  `renderAttackCardDraftOnlyReply(...)`,
  `renderAttackCardCancelledReply(...)`,
  `renderAttackCardExplanationReply(...)` et
  `renderAttackCardPendingConfirmationReply(...)` depuis
  `tools/operations/prepare_attack_card/renderer.ts`.

Le contrat global ne doit pas contenir de phrase finale metier.

## Invariants

- `approve` ne peut jamais executer sans `pending`.
- `approve.should_execute=true` exige :
  pending compatible, cible unique, confidence `medium` ou `high`, aucun marker
  revise/reject/preview/explain/status.
- `revise`, `preview`, `explain`, `status`, `reject`, `unrelated` et
  `ambiguous` ne commitent jamais.
- `oui mais...` est toujours `revise`, jamais `approve`.
- `montre-moi`, `brouillon`, `avant de creer`, `prepare sans creer` sont
  read-only (`preview`).
- Une demande status (`tu l'as deja garde ?`, `c'est deja cree ?`) est read-only
  et ne consomme pas le pending.
- Une intention explicite incompatible avec le pending retourne `unrelated` et
  laisse la main au router/tool concerne.
- Un pending ne doit pas etre cleared par une intention de cancel qui cible un
  objet existant incompatible, par exemple carte pending + `annule le rappel de
  16h`.
- Le contrat peut utiliser des detecteurs deterministes centralises, mais un
  agent ne doit pas ajouter de nouvelles regex metier dans chaque tool.

## Integration Points

- `router/run.ts` orchestre le tour et garde les protections globales, mais ne
  doit pas recevoir de nouvelles confirmations metier ad hoc.
- `router/turn_intent_arbitrator.ts` peut encore router/clear dans certains cas
  legacy, mais ne doit pas reclassifier localement `ok`/`oui` en execution
  metier.
- `tools/operations/update_coach_preferences/router.ts` est le premier tool L5
  branche completement sur les pending confirmations.
- `tools/operations/prepare_attack_card/router.ts` est branche pour les pending
  create/draft review les plus risques : preview, reject, explain/status,
  unrelated, revise no-execute.
- `router/effect_ledger.ts` et les guards de reponse finale restent la preuve
  aval : le contrat confirmation n'est pas une preuve de commit.

## Allowed Changes

- Ajouter un `reason_code` ou de l'evidence dans
  `confirmation_contract.ts`.
- Ajouter un champ de target si un nouveau runtime global l'exige, tant que
  `should_execute` reste conservateur.
- Brancher un nouveau tool L5 en convertissant `ConfirmationDecision` vers son
  reducer local.
- Ajouter un test de regression dans `confirmation_contract.test.ts` avant de
  changer une classification.
- Ajouter un test d'integration dans le tool branche.

## Forbidden Changes

- Faire de `ok`, `oui`, `vas-y` une validation universelle.
- Executer un pending sans target compatible.
- Traiter `oui mais...` comme approve.
- Commit sur `preview`, `explain` ou `status`.
- Ajouter une nouvelle regex confirmation dans `run.ts`, L3 ou un tool alors
  qu'elle appartient au contrat global ou a l'intake structure du skill.
- Deplacer les regles metier du skill dans `confirmation_contract.ts`.
- Faire dire "c'est fait" a partir de `should_execute`; seul un effet committe
  ou une lecture DB peut fonder cette phrase.

## Legacy Exceptions

- `tools/operations/update_coach_preferences/route_guards.ts` garde
  `isCoachPreferenceExplicitApprovalForTest(...)`. Il reste utilise pour des
  chemins de compatibilite hors pending deja branche. Condition de suppression :
  tous les chemins d'approval preference passent par `decideConfirmation` ou par
  l'intake L5 structure, et les tests `update_coach_preferences/tests.ts`
  couvrent les confirmations directes et pending.
- `tools/operations/_shared/confirmation_review.ts` garde
  `reviewToolSkillConfirmationWithAi(...)`. Il protege encore des flows non
  branches directement au contrat global, notamment des confirmations de
  recommendation/draft review. Condition de suppression : `prepare_defense_card`,
  reminders, `select_state_potion` et recommendations utilisent
  `ConfirmationDecision` avec tests d'integration equivalents.
- Les draft reviews locales IA restent autorisees quand elles relisent un
  brouillon dans le contexte du skill proprietaire. Elles ne doivent pas
  contredire le contrat global : si `decideConfirmation` dit `revise`,
  `preview`, `explain`, `status`, `reject` ou `unrelated`, le tool ne doit pas
  executer meme si une review legacy retourne approve.

## Required Tests

Contrat global :

- `supabase/functions/sophia-brain/router/confirmation_contract.test.ts`
  couvre approve/reject/revise/preview/explain/status/unrelated/ambiguous,
  target incompatible, plusieurs targets compatibles et signal
  `turn_frame.confirmation_response`.

Tools branches :

- `tools/operations/update_coach_preferences/tests.ts` couvre pending pref +
  `ok applique` => execute, `oui mais plus doux` => revise no write,
  `explique`/status => read-only, preview-only no write, writer failure no
  committed effect.
- `tools/operations/prepare_attack_card/tests.ts` couvre draft-only no create,
  pending preview no create, pending reminder command => unrelated/null, create
  through executor/token, renderer states.

Regression globale :

- `tools/operations/prepare_defense_card/tests.ts` protege les flows defense
  non branches.
- `router/run_product_help_guard.test.ts` protege no done language, product
  help/status et claims sans commit.
- `router/turn_intent_arbitrator.test.ts` protege routage explicit reminder,
  product help, status et pending flow.

## Suivi Des Décisions Architecturales

| Date | Decision | Statut | Reference |
| --- | --- | --- | --- |
| 2026-05-29 | ConfirmationContract devient le vocabulaire commun, pas un executor global. | Active | `15-chantiers-log.md` J24 |
| 2026-05-30 | Le contrat runtime confirmation documente explicitement ses dependances UserTurnSnapshot, TurnAgenda, EffectLedger et les reducers L5 proprietaires; `tools/operations/_shared/confirmation_adapter.ts` n'est pas un fichier reel et ne doit plus etre cite. | Active | Mise a jour runtime-contracts confirmation |
