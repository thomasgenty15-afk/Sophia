# Global Runtime Contract

## Mental Model

Sophia Brain est un noyau d'orchestration mince autour de skills propriétaires.
Le runtime global ne comprend pas les détails métier des skills. Il sélectionne
le propriétaire du tour, applique les garanties globales, journalise les effets
et persiste l'état.

## Runtime Shape

```txt
processMessage
  -> load user state/context
  -> dispatcher produces TurnFrame
  -> routers choose owner
  -> clarification / active handoff arbitration when needed
  -> UserTurnSnapshot + Agenda resolve competing intents
  -> operation_runtime_pipeline OR conversation_runtime_pipeline
  -> EffectLedger records durable effects + non-mutating handoffs/clarifications
  -> final_response_pipeline guards visible reply
  -> persist state/logs
```

## File Ownership

- `router/run.ts` : façade IO et orchestration globale.
- `dispatcher/*` : première compréhension globale du tour.
- `routers/*` : choix déterministe du propriétaire depuis `TurnFrame`.
- `router/user_turn_snapshot.ts` : snapshot canonique du tour.
- `router/turn_agenda.ts` : agenda multi-intention.
- `router/handoff_flow_arbitration.ts` : continuité/interruption des handoffs
  actifs depuis `TurnFrame`, confirmations et état actif, sans détection métier
  depuis le texte brut.
- `router/effect_ledger.ts` : vérité d'exécution du tour.
- `product_surface_registry/*` : destinations plateforme canoniques pour les
  handoffs.
- `skills/*` et `tools/*` : workflows propriétaires.

## Inputs

- message user courant ;
- historique récent ;
- `tempMemory` ;
- projections DB utiles ;
- `TurnFrame` ;
- `RouteDecision` ;
- active/pending skill state.

## Outputs

- réponse visible ;
- state patch ;
- tool runtime result ;
- effect ledger ;
- trace conversation turn ;
- logs observabilité.

## Invariants

- Pas de DB write hors executor propriétaire.
- Pas de "c'est fait" sans `committed_effect`.
- Pas de confirmation globale qui applique un brouillon dont le skill n'est pas
  propriétaire.
- Pas de fallback regex métier quand l'IA de compréhension échoue.
- Pas de patch sémantique L3/L4 : le runtime global arbitre des signaux
  structurés, il ne reclassifie pas le texte brut.
- Les opérations complexes V1 ne sont plus exécutables depuis le chat :
  `adjust_plan_item`, `prepare_attack_card`, `prepare_defense_card`,
  `select_state_potion`, `create_recurring_reminder` et
  `update_coach_preferences` doivent sortir en `platform_handoff` ou en
  `clarification`.
- Seuls `create_one_shot_reminder` et `track_progress_plan_item` restent des
  effets mutatifs chat nominaux. `status_recap` reste read-only.
- Tout changement d'ownership entre dispatchers doit transporter une
  `note_information` conforme a `09-note-information-contract.md`.
- Un stop local sans nouveau sujet ne rappelle pas le dispatcher global sur le
  meme tour : le reducer local choisit une `visible_task` d'acknowledgement et
  ferme ou differe l'etat actif.

## Integration Points

- `UserTurnSnapshot + Agenda` bloquent les effets incompatibles.
- `ConfirmationContract` normalise approve/reject/revise/explain.
- `EffectLedger` autorise ou réécrit les claims visibles.
- `handoff_flow_arbitration` protège un handoff actif contre product_help/status
  trop tôt, tout en laissant sortir safety, direct effects et tool intents quand
  ces signaux existent déjà dans `TurnFrame` ou `RouteDecision`.
- `note_information` transmet le contexte non visible lors d'une sortie locale
  valide; le runtime global peut la passer au dispatcher cible mais ne doit pas
  l'utiliser comme classifieur ou table de routing.
- `product_surface_registry` fournit les destinations et étapes user-facing des
  handoffs; les renderers ne doivent pas inventer les chemins UI.
- `status_recap` lit DB + traces, mais ne mute jamais.

## Allowed Changes

- Extraire une responsabilité de `run.ts` vers un module propriétaire.
- Ajouter un invariant global s'il ne comprend pas de sémantique métier brute.
- Ajouter une trace ou un test d'architecture.
- Ajouter une nouvelle opération `platform_handoff` si elle possède un contrat
  de domaine, une destination produit canonique et des tests no-mutation.

## Forbidden Changes

- Ajouter dans le runtime global une règle `if message contains ...`.
- Faire écrire un reducer ou renderer en DB.
- Faire dépendre un test métier standard d'une vraie clé IA.
- Faire d'un fallback technique un brouillon métier.
- Réintroduire un executor, writer DB ou pending confirmation exécutable pour
  une opération V1 classée `platform_handoff`.
- Mapper un handoff plateforme en effet durable bloqué ou échoué pour faire
  passer les tests.

## Legacy Exceptions

Il n'y a plus d'exception sémantique autorisée dans L3/global routing. Un ancien
guard peut rester exporté temporairement pour compatibilité de tests, mais il ne
doit pas être appelé par `run.ts`, `turn_intent_arbitrator.ts`,
`operation_runtime_pipeline.ts` ou `handoff_flow_arbitration.ts` pour choisir
une intention métier.

## Required Tests

- agenda interruption ;
- confirmation contract ;
- effect ledger claims ;
- platform handoff no-mutation ;
- active handoff arbitration ;
- product surface registry ;
- no tool without consent ;
- no done language without commit ;
- central `run_test.ts` déterministe.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | Le runtime global orchestre mais ne possède pas les règles métier des skills. | Active | `00-architecture-doctrine.md` |
| 2026-05-30 | Renuméroter le contrat global de `00-global-runtime.md` vers `01-global-runtime.md` pour réserver `00` à la doctrine. | Active | J59 |
| 2026-06-01 | Les complex tools V1 deviennent des handoffs plateforme non-mutants; le runtime global doit les représenter, pas les exécuter. | Active | Architecture handoff V1 |
