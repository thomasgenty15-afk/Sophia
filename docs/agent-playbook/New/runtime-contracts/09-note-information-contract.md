# Note Information Contract

## Scope

`note_information` est le contrat semantique non visible transmis quand un
dispatcher transfere l'ownership du tour a un autre dispatcher.

Elle s'applique notamment a :

- flow local -> dispatcher global ;
- flow local -> `safety_crisis.local_dispatcher` ;
- flow local -> `product_help.local_dispatcher` inline ;
- flow local -> `status_recap.local_dispatcher` inline ;
- flow local -> `select_state_potion.local_dispatcher` ;
- flow local -> `verification_opportunities` ;
- tool/proactive local flow -> dispatcher global ou autre dispatcher local.

Quand le user veut arreter, fermer, annuler ou quitter un flow local actif, le
dispatcher local doit produire `exit_to_global_dispatcher` avec
`note_information.target_dispatcher="global"`.

Exception specialisee : le passage interne
`select_state_potion -> sous-skill
potion` peut conserver son contrat structure
de sous-flow. Il ne requiert pas `note_information`, parce qu'il ne change pas
de dispatcher local au sens runtime transverse.

## Canonical JSON

```json
{
  "note_information": {
    "source_flow_id": "string",
    "target_dispatcher": "global|safety_crisis|clarification|create_one_shot_reminder|create_recurring_reminder|prepare_attack_card|prepare_defense_card|adjust_plan_item|select_state_potion|track_progress_plan_item|update_coach_preferences|emotional_repair|demotivation_repair|product_help|status_recap|weekly_adaptive_review_v1|verification_opportunities|other_local",
    "handoff_reason": "clarification_resolved|topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request",
    "handoff_context_for_next_dispatcher": "string",
    "user_words": ["string"],
    "structured_context": {},
    "confidence": "low|medium|high"
  }
}
```

`confidence` est optionnel si le flow local n'a pas de notion de confiance.

`structured_context` est obligatoire. Il peut etre minimal, mais il ne doit pas
etre vide par defaut quand le dispatcher dispose d'informations utiles.

Format recommande :

```json
{
  "structured_context": {
    "user_message_summary": "string",
    "active_flow_summary": "string|null",
    "collected_state": {},
    "unresolved_questions": ["string"],
    "evidence": ["string"],
    "recommended_next_focus": "string|null"
  }
}
```

## What Is Not Part Of Note Information

Ces champs ne font pas partie du contrat semantique `note_information` :

- `source_flow_presentation` ;
- `source_flow_state_summary` comme champ obligatoire separe ;
- `target_local_dispatcher_hint` ;
- `risk_score` ;
- `no_chat_mutation` ;
- `db_write_committed`, `potion_session_created`, `scheduled_checkin_created`,
  `recurring_reminder_created`, `executable_confirmation_generated`.

Ces informations appartiennent a d'autres couches :

- risk/safety : sortie du dispatcher local, safety runtime, trace ;
- effet durable / absence d'effet : `EffectLedger`, effect boundary, runtime
  trace QA ;
- presentation du flow : documentation/catalogue, pas handoff runtime ;
- hint de prompt : `structured_context.recommended_next_focus` si necessaire.

Le runtime ne doit plus accepter ces champs comme partie du contrat
`note_information`. Un producteur qui en a besoin doit les conserver dans sa
sortie locale, ses traces ou son effect boundary, pas dans la note.

## Field Rules

`source_flow_id` : identifiant du dispatcher/flow qui rend l'ownership. Exemple
: `demotivation_repair`, `create_recurring_reminder`,
`weekly_adaptive_review_v1`.

`target_dispatcher` : dispatcher cible reel. Ce n'est pas toujours `global`.
Exemples : `global`, `safety_crisis`, `select_state_potion`, `product_help`,
`status_recap`, `verification_opportunities`.

`handoff_reason` : raison de transfert, pas diagnostic general. Utiliser
`safety` pour une preemption safety, `bridge` pour un bridge consenti,
`inline_tool` pour une question inline, `topic_change` ou
`explicit_user_request` pour une sortie vers global.

`handoff_context_for_next_dispatcher` : resume compact en langage naturel pour
le dispatcher cible. Il explique ce qui vient d'etre compris, confirme, refuse,
ou laisse ouvert. Ce n'est jamais un message visible a afficher tel quel.

`user_words` : extraits courts du message user qui justifient le handoff. Ne pas
y mettre de profil global, de DB brute, ni de longues citations.

`structured_context` : contexte exploitable minimal, obligatoire. Il doit
contenir les valeurs connues, contraintes, incertitudes, preuves et prochain
focus utile au dispatcher cible. Il ne doit pas contenir de dump DB/memoire
brut.

`confidence` : optionnel. Utiliser `high` si le handoff est clair, `medium` si
probable mais incomplet, `low` si le dispatcher cible doit clarifier.

## Runtime Responsibilities

Le reducer/runtime doit :

- refuser un changement de dispatcher sans `note_information` ;
- verifier que `target_dispatcher` correspond a l'action de sortie ;
- garantir que `structured_context` existe, meme minimal ;
- transmettre la note au dispatcher cible ;
- ne jamais transmettre la note brute a un prompt visible.

Quand le dispatcher global choisit `normal_reply` apres avoir recu une note, le
runtime peut transmettre au normal reply un contexte filtre issu de :

- `handoff_context_for_next_dispatcher` ;
- `structured_context`.

Le normal reply ne doit pas recevoir les champs techniques de la note, et ne
doit pas voir `no_chat_mutation`, `risk_score`, `target_dispatcher`, ou des
details de routing.

## Dispatcher Responsibilities

Le dispatcher local produit du JSON seulement. Quand il transfere l'ownership,
il doit remplir `note_information`.

Il doit :

- choisir le `target_dispatcher` cible reel ;
- remplir `handoff_context_for_next_dispatcher` de maniere exploitable ;
- remplir `structured_context` avec un objet minimal utile ;
- inclure les mots user probants dans `user_words` ;
- conserver les contraintes explicites du user.

Il ne doit jamais :

- produire un message visible ;
- utiliser une regex metier ou `message.includes(...)` metier ;
- router deterministiquement depuis une note recue ;
- traiter `note_information` comme un second dispatcher cache ;
- inventer un effet durable, une confirmation executable ou une mutation ;
- inclure des preuves runtime/effect boundary dans la note semantique.

## Transition Matrix

| Source flow                                          | Target dispatcher       | Note required | Source ownership | Category                    |
| ---------------------------------------------------- | ----------------------- | ------------- | ---------------- | --------------------------- |
| any active local flow                                | global                  | yes           | exits source     | `exit_to_global_dispatcher` |
| any active non-safety flow                           | safety_crisis           | yes           | suspended/closed | `safety_preempt`            |
| any active local flow with inline product question   | product_help            | yes           | preserved        | `inline_tool`               |
| any active local flow with inline DB/status question | status_recap            | yes           | preserved        | `inline_tool`               |
| emotional/demotivation repair                        | select_state_potion     | yes           | exits source     | `bridge`                    |
| flow_opportunity_verification                        | target local dispatcher | yes           | exits source     | `bridge`                    |
| proactive/tool local flow                            | global                  | yes           | exits source     | `exit_to_global_dispatcher` |

## Flow Context Guidance

`emotional_repair` : include repair summary, active emotion/tension,
constraints, selected bridge if any, missing context, and recommended next
focus.

`demotivation_repair` : include motivation source hypothesis, micro-action/state
collected, constraints/refusals, uncertainty, and recommended next focus.

`safety_crisis` : inbound notes must include source flow and deferred work if
any. Exit notes must include deescalation/resolution facts and residual
constraints without inviting automatic product/tool resumption.

`product_help` : include answered question, feature/surface involved, parent
flow if inline, and whether the question was informational only.

`status_recap` : include status/read scope, target objects, projection summary,
answer summary, and warning not to reinterpret status facts as create/modify
intent.

`tool` local flows : include collected fields, missing fields, current stage,
last platform handoff summary, explicit constraints, and recommended next focus.

## QA Invariants

- Every dispatcher change has `note_information`.
- `structured_context` is present on every note.
- `note_information` is consumed by the target dispatcher, not displayed.
- `normal_reply` receives only filtered handoff context when it is selected
  after a handoff.
- Conversation normale directe to `normal_reply` does not require a note.
- Effect boundary and no-mutation proofs live outside the note.
