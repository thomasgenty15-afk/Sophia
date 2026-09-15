# daily_action_review Visible Context Contracts

Ce document definit ce que le dispatcher local daily doit transmettre au visible
agent pour chaque `visible_task.kind`.

Le dispatcher ne redige jamais le message visible. Il choisit le stage et donne
une intention visible structuree. Le runtime enrichit ensuite avec l'etat daily
valide, les targets, les items, la question courante et les effets commit.

Ce contrat s'ajoute au pack commun
`../Common_blocks /All dispacthers/visible-agent-mandatory-context-pack.md` :
chaque visible daily recoit aussi `VISIBLE_OUTPUT_STYLE_RULES` et les 5 derniers
messages user filtres par le runtime.

## Principes

Le dispatcher local daily doit fournir un contexte sparse mais intentionnel :

```json
{
  "visible_task": {
    "kind": "clarify_outcome",
    "conversation_context": {
      "field_or_stage": "clarify_outcome",
      "known_values": {
        "visible_goal": "ask_binary_outcome",
        "selected_occurrence_ids": [],
        "slot_to_collect": "outcome"
      },
      "missing_or_weak_values": [],
      "selected_candidate": {},
      "tone_constraints": [],
      "do_not_say": [],
      "context_summary": "string",
      "evidence_used": []
    }
  }
}
```

Le dispatcher peut omettre les champs vides. Le runtime reconstruit les champs
stables depuis l'etat valide.

## Runtime-Owned Context

Le dispatcher ne doit pas inventer ces donnees. Le runtime les ajoute ou les
repare :

- `known_values.status`
- `known_values.targets`
- `known_values.items`
- `known_values.action_intelligence_by_occurrence_id`
- `known_values.current_daily_question`
- `known_values.committed_effects`
- `known_values.failed_effects`
- titres, ids, plan ids et plan item ids canoniques
- `VISIBLE_OUTPUT_STYLE_RULES`
- les 5 derniers messages user filtres, pour continuite de ton seulement
- `selected_candidate` si derivable depuis la target courante
- `missing_or_weak_values` si derivable depuis les item slots

Le dispatcher peut seulement ajouter des champs d'intention dans
`known_values`, par exemple :

- `visible_goal`
- `selected_occurrence_ids`
- `slot_to_collect`
- `why_this_question`
- `answer_format`
- `coverage_status`
- `recap_focus`

## Common Required Fields

Pour tous les `kind` visibles, le dispatcher doit fournir quand c'est possible :

- `field_or_stage`: meme valeur que `visible_task.kind`.
- `known_values.visible_goal`: objectif visible court.
- `known_values.selected_occurrence_ids`: ids concernes, si connus.
- `tone_constraints`: contraintes de ton vraiment utiles.
- `do_not_say`: interdits specifiques au tour.
- `evidence_used`: preuves semantiques courtes.

Interdits communs :

- ne pas mettre de DB brute ;
- ne pas mettre de memoire brute ;
- ne pas mettre `note_information` brute ;
- ne pas demander au visible de choisir la route ;
- ne pas demander au visible de decider un outcome ;
- ne pas confirmer un commit sans `committed_effects`.

## Visible Kinds Autorises

Les seuls `visible_task.kind` daily autorises sont :

- `clarify_which_action`
- `clarify_outcome`
- `clarify_reason`
- `clarify_still_relevant`
- `explain_target`
- `recap_daily_state`
- `clarify_daily_question`
- `commit_success`

Il n'y a pas de visible daily pour :

- stop/refus/report du daily ;
- `exit_to_global_dispatcher` ;
- `safety_preempt` ;
- incident commit.

Ces cas sortent via `note_information` ou sont traites comme incident runtime.

## Contract: clarify_which_action

Objectif : lever une ambiguite entre plusieurs targets.

Le dispatcher doit transmettre :

```json
{
    "kind": "clarify_which_action",
    "conversation_context": {
    "field_or_stage": "clarify_which_action",
    "known_values": {
      "visible_goal": "ask_which_action",
      "selected_occurrence_ids": ["occ-1", "occ-2"],
      "ambiguity_type": "multiple_targets_same_answer",
      "answer_format": "choose_one_or_all"
    },
    "missing_or_weak_values": ["which_action"],
    "tone_constraints": ["short"],
    "do_not_say": [
      "do not guess which action",
      "do not mark anything as done"
    ],
    "evidence_used": ["je l'ai fait"]
  }
}
```

Le visible doit pouvoir citer les titres depuis `known_values.targets`, ajoute
par le runtime.

## Contract: clarify_outcome

Objectif : obtenir `faite` ou `pas faite` pour une target.

Le visible doit rester binaire et humain :

- demander uniquement si l'action est faite ou pas faite ;
- ne jamais proposer `partiel`, `partiellement` ou `en partie` ;
- ne jamais remplacer la question par `faisable aujourd'hui ?` ;
- si une action vient d'être manquée, reconnaître brièvement avant de passer à
  la suivante : `Je vois. Du coup, pour ...`.

Le dispatcher doit transmettre :

```json
{
    "kind": "clarify_outcome",
    "conversation_context": {
    "field_or_stage": "clarify_outcome",
    "known_values": {
      "visible_goal": "ask_binary_outcome",
      "selected_occurrence_ids": ["occ-1"],
      "slot_to_collect": "outcome",
      "answer_format": "done_or_not_done"
    },
    "missing_or_weak_values": ["outcome"],
    "tone_constraints": ["short", "low_pressure"],
    "do_not_say": [
      "do not ask for reason yet",
      "do not use partial wording",
      "do not say en partie",
      "do not say faisable aujourd'hui",
      "do not propose a solution"
    ],
    "evidence_used": ["outcome unclear"]
  }
}
```

Si le focus courant est complet mais qu'il reste une target non demandee, le
dispatcher doit viser cette target restante et mettre
`known_values.coverage_status="remaining_target_unasked"`.

## Contract: clarify_reason

Objectif : obtenir la raison d'une target pas faite.

Precondition :

- l'item cible a `outcome=missed` ;
- le slot `reason` manque ou est trop flou.

Le dispatcher doit transmettre :

```json
{
    "kind": "clarify_reason",
    "conversation_context": {
    "field_or_stage": "clarify_reason",
    "known_values": {
      "visible_goal": "ask_missed_reason",
      "selected_occurrence_ids": ["occ-1"],
      "slot_to_collect": "reason",
      "known_outcome": "missed"
    },
    "missing_or_weak_values": ["reason"],
    "tone_constraints": ["short", "non_judgmental"],
    "do_not_say": [
      "do not propose a fix",
      "do not adjust the plan",
      "do not guilt"
    ],
    "evidence_used": ["pas fait"]
  }
}
```

Le visible doit demander une raison utile, pas une justification longue.

## Contract: explain_target

Objectif : expliquer brièvement une action cible sans quitter le daily, puis
reprendre la collecte.

Le visible doit :

- expliquer l'action depuis le contexte filtre ;
- ne rien marquer comme fait ou pas fait ;
- terminer avec une question binaire et rétrospective : `est-ce que tu l'as
  faite aujourd'hui ?` ;
- ne jamais dire `faisable aujourd'hui ?` ;
- ne jamais proposer `en partie`, `partiel` ou `partiellement`.

## Contract: clarify_still_relevant

Objectif : savoir si une target pas faite reste pertinente.

Precondition :

- l'item cible a `outcome=missed` ;
- une raison est deja connue ou le reducer a decide que `still_relevant` manque.

Le dispatcher doit transmettre :

```json
{
    "kind": "clarify_still_relevant",
    "conversation_context": {
    "field_or_stage": "clarify_still_relevant",
    "known_values": {
      "visible_goal": "ask_still_relevant",
      "selected_occurrence_ids": ["occ-1"],
      "slot_to_collect": "still_relevant",
      "known_outcome": "missed"
    },
    "missing_or_weak_values": ["still_relevant"],
    "tone_constraints": ["short", "neutral"],
    "do_not_say": [
      "do not propose carry over",
      "do not modify the plan",
      "do not recommend a lever"
    ],
    "evidence_used": ["missed action"]
  }
}
```

## Contract: explain_target

Objectif : expliquer une target daily sans muter l'etat.

Le dispatcher doit transmettre :

```json
{
    "kind": "explain_target",
    "conversation_context": {
    "field_or_stage": "explain_target",
    "known_values": {
      "visible_goal": "explain_target_then_resume_binary_collection",
      "selected_occurrence_ids": ["occ-1"],
      "question_type": "target_meaning",
      "resume_after_answer": true,
      "answer_format": "brief_explanation_plus_done_or_not_done"
    },
    "missing_or_weak_values": ["outcome"],
    "tone_constraints": ["short", "plain_language"],
    "do_not_say": [
      "do not mark done or missed",
      "do not propose a solution",
      "do not exit daily"
    ],
    "evidence_used": ["c'est quoi le sas"]
  }
}
```

Le visible peut utiliser `known_values.targets` et
`known_values.action_intelligence_by_occurrence_id`, ajoutes par le runtime.

## Contract: recap_daily_state

Objectif : redire l'etat compris dans le daily courant.

Le dispatcher doit transmettre :

```json
{
    "kind": "recap_daily_state",
    "conversation_context": {
    "field_or_stage": "recap_daily_state",
    "known_values": {
      "visible_goal": "recap_current_daily_state",
      "recap_focus": "current_daily_only",
      "include_commit_status_only_if_present": true
    },
    "tone_constraints": ["short"],
    "do_not_say": [
      "do not give global DB status",
      "do not say registered unless committed_effects are present"
    ],
    "evidence_used": ["recap request"]
  }
}
```

Le runtime fournit `known_values.items` et `known_values.committed_effects`.

## Contract: clarify_daily_question

Objectif : clarifier, reformuler ou redire la question daily courante.

Le dispatcher doit transmettre :

```json
{
    "kind": "clarify_daily_question",
    "conversation_context": {
    "field_or_stage": "clarify_daily_question",
    "known_values": {
      "visible_goal": "clarify_current_daily_question",
      "answer_format": "clarified_or_same_question_simple"
    },
    "tone_constraints": ["short"],
    "do_not_say": [
      "do not change targets",
      "do not add coaching",
      "do not ask a different slot"
    ],
    "evidence_used": ["repeat request"]
  }
}
```

Le runtime fournit `known_values.current_daily_question`.

## Contract: commit_success

Objectif : confirmer uniquement les effets effectivement commit.

Precondition runtime :

- `executeDailyReviewEffectPlan` a reussi ;
- `committed_effects` est non vide ;
- aucun `failed_effects` bloquant.

Le dispatcher peut demander `commit_success` seulement quand sa decision daily
est complete pour toutes les targets. Il ne doit pas pretendre que le commit est
deja fait.

Le dispatcher doit transmettre :

```json
{
    "kind": "commit_success",
    "conversation_context": {
    "field_or_stage": "commit_success",
    "known_values": {
      "visible_goal": "confirm_committed_daily_entries",
      "selected_occurrence_ids": ["occ-1", "occ-2"],
      "expected_outcome": "completed"
    },
    "tone_constraints": ["short"],
    "do_not_say": [
      "do not mention uncommitted targets",
      "do not ask a new question",
      "do not propose anything else"
    ],
    "evidence_used": ["les deux sont faites"]
  }
}
```

Le runtime remplace la precondition conversationnelle par la realite commit :
`known_values.committed_effects` et `known_values.failed_effects`.

Si le commit echoue, le visible daily n'est pas appele. Le runtime loggue un
incident et marque le pending comme failed.
