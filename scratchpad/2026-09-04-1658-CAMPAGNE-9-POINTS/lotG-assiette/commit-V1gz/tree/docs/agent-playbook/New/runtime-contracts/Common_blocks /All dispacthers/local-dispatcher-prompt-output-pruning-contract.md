# Local Dispatcher Prompt / Output Pruning Contract

Ce bloc est commun a tous les dispatchers locaux.

Objectif : alleger les prompts et les JSON de sortie pour garder uniquement ce
qui aide vraiment la decision, le reducer, le handoff ou le visible agent.

Un dispatcher local ne doit pas remplir une structure lourde par reflexe. Il
retourne une decision sparse, utile et verifiable. Le runtime/reducer complete,
derive, valide et persiste.

## Regle Centrale

```txt
Si un champ est null, generique, runtime-owned, derive, ou inutile pour le tour
courant, il doit etre absent.
```

Un champ absent ne veut pas dire suppression. Le contrat de preservation des
champs stables est gere par :

```txt
dispatcher-output-patch-runtime-state.md
```

## A Garder Dans Le JSON Minimal

Champs generalement utiles :

- `flow_action` : decision locale principale du tour.
- `confidence` : confiance de la decision principale.
- `target_resolution.resolved_*` : ids que le message courant touche.
- `target_resolution.ambiguous` : utile pour les clarifications de cible.
- `item_updates` ou equivalent metier : patch local stabilise par id connu.
- `visible_task.kind` : uniquement quand un visible agent du flow source doit
  parler.
- `visible_task.conversation_context` : sparse, uniquement les indices que le
  visible ne peut pas deriver seul.
- `note_information` : uniquement pour sortie vers un autre dispatcher.
- `evidence` : indices courts reellement utilises.

Le reste doit etre justifie par un besoin concret du reducer, du visible ou du
handoff.

## A Rendre Optionnel Ou Derive

Ces champs ne doivent pas etre requis dans un contrat minimal :

- `risk_score` quand il vaut `0`.
- `target_resolution.why` sauf debug/trace utile.
- `intent.summary` quand il repete `flow_action`, `evidence` ou `user_words`.
- `state_updates.status_hint` si le reducer peut le deriver.
- `state_updates.close_after_visible` quand il vaut `false`.
- `visible_task.instruction` si le stage visible a deja une spec/prompt dedie.
- `visible_task.conversation_context.state_summary` si le runtime peut le
  construire.
- `visible_task.conversation_context.field_or_stage` si identique a
  `visible_task.kind` et derivable.
- `visible_task.conversation_context.known_values` quand le runtime connait deja
  les valeurs canoniques.
- `visible_task.conversation_context.selected_candidate` si derivable depuis les
  ids selectionnes.
- `visible_task.conversation_context.handoff_data` quand il n'y a pas de
  handoff.
- listes vides comme `missing_slots: []`, `missing_or_weak_values: []`,
  `evidence_used: []`, sauf si leur presence change vraiment le comportement.

## A Supprimer Des Sorties Normales

Ne jamais produire ces champs dans une continuation normale :

- `note_information: null`
- `exit_memo.needed=false`
- `risk_score: 0`
- `turn_count_increment: 1`
- `close_after_visible: false`
- `handoff_hint_for_global_dispatcher` sans handoff
- `committed_effects: []` si aucun commit n'existe
- `failed_effects: []` si aucun incident n'existe
- champs `null` qui n'ajoutent aucune information
- champs de contraintes generiques qui repetent le system prompt

Exemple a eviter :

```json
{
  "note_information": null,
  "exit_memo": {
    "needed": false,
    "reason": "none",
    "handoff_hint_for_global_dispatcher": {
      "likely_intent": "unknown"
    }
  }
}
```

Version attendue :

```json
{}
```

## Contraintes Et Handoff

Les contraintes de type :

- "ne considere pas l'effet comme commit" ;
- "ne mute pas sans executor" ;
- "ne marque pas complete sans DB commit" ;
- "ne relance pas le dispatcher global sur le meme message" ;

ne doivent pas etre repetees dans chaque sortie normale.

Elles appartiennent :

- au system prompt ;
- au reducer/runtime ;
- au contrat de note_information ;
- a `exit_memo` seulement quand `needed=true`.

Si `exit_memo.needed=false`, il ne doit pas y avoir de
`handoff_hint_for_global_dispatcher`.

## Visible Task Sparse

Le dispatcher local choisit le visible stage et donne une direction metier. Il
ne doit pas recopier tout l'etat visible.

Forme recommandee :

```json
{
  "visible_task": {
    "kind": "clarify_outcome",
    "conversation_context": {
      "tone_constraints": ["short"],
      "do_not_say": ["do not propose a solution"]
    }
  }
}
```

Le runtime ajoute :

- `VISIBLE_OUTPUT_STYLE_RULES` ;
- les messages recents filtres ;
- les targets/stage targets ;
- les items et valeurs canoniques ;
- les effets commit-proof ;
- les champs visibles derives.

Le visible agent ne doit jamais recevoir de dump DB, memoire brute ou
`note_information` brute.

## Item Updates Sparse

Pour un item ou objet metier :

Garder :

- id connu ;
- `update_mode` si utile ;
- valeur metier stabilisee ;
- evidence courte ;
- confidence si elle varie ou aide le reducer.

Omettre :

- `reason_category: "none"` pour un outcome positif si derivable ;
- `reason_text: null` ;
- `still_relevant: true` quand la pertinence n'est pas le sujet ;
- `matched_user_text` si `evidence_text` et le message courant suffisent ;
- `missing_slots: []`.

Ne jamais transformer une hypothese en fait pour remplir le JSON.

## Prompt Pruning Checklist

Quand un agent revise un prompt dispatcher local, il doit verifier :

- Le JSON attendu est sparse.
- Les champs `null`, `false`, `0`, listes vides et objets vides sont absents
  sauf s'ils changent le comportement.
- Les champs runtime-owned sont retires du schema attendu.
- Les champs derives sont decrits comme runtime/reducer-owned.
- Les contraintes generiques ne sont pas repetees dans chaque sortie.
- `note_information` et `exit_memo` sont limites aux vraies sorties/handoffs.
- Les visible agents ont des specs/prompt dedies ; le dispatcher ne redige pas
  le message visible.
- `visible_task.conversation_context` contient seulement le contexte utile que
  le runtime ne peut pas reconstruire.
- Les ids viennent uniquement du contexte runtime.
- Les exemples JSON montrent la forme minimale attendue, pas une structure
  exhaustive.

## Exemple Minimal

Continuation avec une valeur metier stabilisee :

```json
{
  "flow_action": "answer_review",
  "confidence": "high",
  "target_resolution": {
    "resolved_occurrence_ids": ["occ-1"],
    "ambiguous": false
  },
  "item_updates": {
    "occ-1": {
      "update_mode": "set",
      "outcome": "completed",
      "evidence_text": "je l ai fait 20 minutes"
    }
  },
  "visible_task": {
    "kind": "commit_success",
    "conversation_context": {
      "tone_constraints": ["short"]
    }
  },
  "evidence": ["completed action evidence"]
}
```

Exit vers un autre dispatcher :

```json
{
  "flow_action": "exit_to_global_dispatcher",
  "confidence": "high",
  "target_resolution": {
    "resolved_occurrence_ids": [],
    "ambiguous": false
  },
  "note_information": {
    "source_flow_id": "local_flow_id",
    "handoff_reason": "topic_change",
    "target_dispatcher": "global",
    "handoff_context_for_next_dispatcher": "User changed topic; source flow did not commit anything.",
    "structured_context": {
      "recommended_next_focus": "normal_conversation"
    }
  },
  "exit_memo": {
    "needed": true,
    "reason": "normal_coaching"
  },
  "evidence": ["topic change evidence"]
}
```

## Anti-Patterns

- Un schema "retourne exactement ce JSON" avec tous les champs possibles.
- Des exemples qui montrent `note_information:null`.
- Des exemples qui montrent `exit_memo.needed=false`.
- Des visible tasks qui contiennent tout l'etat DB.
- Des contraintes generic runtime repetees dans chaque sortie.
- Des champs `summary` qui paraphrasent seulement le champ precedent.
- Des listes vides partout pour "respecter le schema".
- Un dispatcher qui demande au visible agent de choisir une route ou une valeur
  metier.
