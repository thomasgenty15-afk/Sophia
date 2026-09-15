# Local Dispatcher Exit / Note Information Contract

Ce bloc est commun a tous les dispatchers locaux.

## Principe

Un flow local actif possede le tour tant que le message utilisateur reste dans
son perimetre.

Des que le message doit etre rendu au dispatcher global, le flow source ne
produit pas de message visible. Il rend l'ownership via :

```json
{
  "flow_action": "exit_to_global_dispatcher",
  "note_information": {}
}
```

Le dispatcher global recoit la note et decide quoi faire ensuite.

```txt
local dispatcher source
-> exit decision
-> note_information obligatoire
-> runtime transmet au dispatcher global
-> global produit la prochaine decision / reponse visible
```

Important: ce contrat ne couvre pas les handoffs parent -> child flow.

Pour lancer un autre flow local temporaire, par exemple
`daily_action_review_v1` -> `coaching_recommendation`, il faut utiliser
`handoff_to_child_flow` selon le contrat dedie :

`local-dispatcher-child-flow-handoff-contract.md`

Ne jamais utiliser `exit_to_global_dispatcher` pour demarrer un autre flow
local.

## Regle Centrale

```txt
Exit reason is not a visible stage.
Safety is not a visible stage.
Stop/cancel/refusal is not a visible stage.
Topic change is not a visible stage.
The source flow does not confirm the exit.
The global dispatcher owns the visible answer.
```

Un `visible_task.kind` ne doit representer que les messages visibles que le flow
local source est encore autorise a formuler dans son propre perimetre.

## Critere D'Exit

Le dispatcher local doit sortir quand le message courant contient un de ces
signaux.

### 1. Safety

Le message contient un signal safety reel.

Action :

```json
{
  "flow_action": "exit_to_global_dispatcher",
  "note_information": {
    "handoff_reason": "safety",
    "target_dispatcher": "global"
  }
}
```

Regles :

- pas de visible agent du flow source ;
- pas de recap du flow source ;
- pas de collecte restante ;
- pas de commit metier non deja prouve ;
- le dispatcher global reprend le meme message avec la note ;
- le dispatcher global route ensuite vers la pipeline safety si le signal est
  confirme.

### 2. Stop Flow / Refusal

Le user demande d'arreter le flow local, refuse la collecte, dit qu'il ne veut
pas continuer, ou demande de laisser tomber.

Action :

```json
{
  "flow_action": "exit_to_global_dispatcher",
  "note_information": {
    "handoff_reason": "flow_interruption",
    "target_dispatcher": "global"
  }
}
```

Regles :

- pas de `stop_close` visible dans le flow source ;
- pas de confirmation locale ;
- le global / normal conversation formule l'accuse de reception si besoin ;
- le flow source transmet ce qui etait deja collecte et ce qui n'est pas commit.

### 3. Cancel Flow

Le user annule explicitement le flow actif ou indique que ce n'est plus
necessaire.

Action :

```json
{
  "flow_action": "exit_to_global_dispatcher",
  "note_information": {
    "handoff_reason": "flow_interruption",
    "target_dispatcher": "global"
  }
}
```

Regles :

- `cancel_flow` ne doit pas etre un visible stage ;
- si un ancien dispatcher produit `cancel_flow`, le runtime peut le normaliser
  en `exit_to_global_dispatcher` ;
- la note doit expliquer que le user annule le flow actif.

### 4. Report / Later / Pause

Le user dit "pas maintenant", "plus tard", "on verra apres", ou equivalent.

Action :

```json
{
  "flow_action": "exit_to_global_dispatcher",
  "note_information": {
    "handoff_reason": "flow_interruption",
    "target_dispatcher": "global"
  }
}
```

Regles :

- pas de `defer_flow` dans le contrat actif sauf compat legacy ;
- le flow source ne programme rien ;
- si le user demande explicitement un rappel, utiliser la politique direct
  effect / global selon le contrat du flow ;
- sinon le global gere la reponse normale.

### 5. Topic Change

Le user change de sujet clairement et le nouveau sujet n'appartient plus au
flow local.

Action :

```json
{
  "flow_action": "exit_to_global_dispatcher",
  "note_information": {
    "handoff_reason": "topic_change",
    "target_dispatcher": "global"
  }
}
```

Exemples :

- question produit ;
- demande de status global ;
- preference coach ;
- ajustement de plan ;
- autre demande conversationnelle hors flow.

Regles :

- pas de visible source ;
- pas de reponse inline source sauf contrat explicite ;
- le global reanalyse le meme message avec la note.

### 6. Explicit Tool / Product / Status Request

Le user demande explicitement une capacite hors flow : produit, status, plan,
outil, preference, rappel recurrent, etc.

Action :

```json
{
  "flow_action": "exit_to_global_dispatcher",
  "note_information": {
    "handoff_reason": "explicit_user_request",
    "target_dispatcher": "global"
  }
}
```

Regles :

- le dispatcher source ne lance pas le sous-flow lui-meme ;
- le dispatcher source ne confirme pas l'execution ;
- le global choisit le dispatcher ou outil cible.

### 7. Local Child Flow Handoff

Le user exprime un blocage, une difficulte d'action, une hesitation sur le bon
levier Sophia, un risque de decrochage, ou une friction qui doit etre traitee
par `coaching_recommendation`, tout en restant dans le contexte du flow parent.

Ce n'est pas un exit global.

Action interdite :

```json
{
  "flow_action": "exit_to_global_dispatcher",
  "note_information": {
    "target_dispatcher": "coaching_recommendation"
  }
}
```

Action correcte :

```json
{
  "flow_action": "handoff_to_child_flow",
  "child_flow": "coaching_recommendation",
  "return_to_parent": {
    "parent_flow_id": "daily_action_review_v1",
    "return_focus": "resume_daily_after_coaching_recommendation",
    "preserve_parent_state": true
  },
  "child_flow_context": {
    "bridge_reason": "action_blocker",
    "parent_state_summary": "string"
  }
}
```

Regles :

- `exit_to_global_dispatcher` ne doit jamais lancer `coaching_recommendation` ;
- daily -> coaching et weekly -> coaching sont des handoffs parent -> child ;
- le parent conserve son etat et doit etre repris apres le child flow ;
- le child flow recommande, puis retourne un memo au parent ;
- aucune mutation durable n'est faite par le parent au moment du handoff ;
- le detail est defini dans
  `local-dispatcher-child-flow-handoff-contract.md`.

### 8. Other / Unknown Exit

Le message semble sortir du flow, mais le dispatcher n'est pas sur de
l'intention cible.

Action :

```json
{
  "flow_action": "exit_to_global_dispatcher",
  "note_information": {
    "handoff_reason": "topic_change",
    "target_dispatcher": "global"
  }
}
```

Regles :

- confidence medium ou low ;
- expliquer l'incertitude dans `structured_context`;
- ne pas inventer de dispatcher cible specialise.

## Note Information Obligatoire

Tout exit doit contenir une `note_information` non vide.

Shape minimal :

```json
{
  "source_flow_id": "string",
  "handoff_reason": "safety|flow_interruption|topic_change|explicit_user_request",
  "target_dispatcher": "global",
  "handoff_context_for_next_dispatcher": "string",
  "structured_context": {
    "source_flow_id": "string",
    "exit_reason": "safety|stop_flow|cancel_flow|pause_or_later|topic_change|explicit_tool_request|other",
    "active_flow_summary": "string",
    "collected_state": {},
    "unresolved_questions": [],
    "committed_effects": [],
    "recommended_next_focus": "string"
  },
  "confidence": "low|medium|high"
}
```

## Structured Context Minimum

`structured_context` doit etre succinct mais exploitable.

Champs recommandes :

- `source_flow_id`
- `exit_reason`
- `active_flow_summary`
- `collected_state`
- `unresolved_questions`
- `committed_effects`
- `recommended_next_focus`

Ne pas mettre :

- dump DB brut ;
- memoire brute ;
- prompt complet ;
- historique complet ;
- risk_score hors safety ;
- champs internes inutiles au dispatcher global.

## Visible Task Policy

Pour un exit :

```txt
visible_task must be absent or ignored.
```

Les valeurs suivantes ne doivent pas exister comme visible agents du flow
source :

- `safety`
- `safety_transition`
- `exit_or_cancel`
- `stop_close`
- `cancel_close`
- `defer_close`
- `commit_failed`

Si elles existent dans un ancien contrat, elles doivent etre considerees comme
legacy et remplacees par :

- `exit_to_global_dispatcher` + `note_information` pour stop/cancel/defer/topic
  change/safety ;
- incident runtime pour commit failed.

## Runtime Handling

Le runtime doit :

1. verifier que `note_information` est presente pour tout exit ;
2. refuser ou bloquer un exit sans note ;
3. ne pas appeler le visible agent du flow source pour un exit ;
4. transmettre la note au dispatcher global ;
5. persister un memo d'exit si utile ;
6. ne pas retraiter le message dans le flow source.

## Legacy Normalization

Un runtime peut accepter temporairement d'anciens tokens pour compatibilite :

```txt
user_stopped -> exit_to_global_dispatcher
cancel_flow -> exit_to_global_dispatcher
defer_flow -> exit_to_global_dispatcher
exit_or_cancel visible -> ignored / legacy
stop_close visible -> ignored / legacy
safety visible -> ignored / legacy
safety_preempt -> exit_to_global_dispatcher
safety_crisis target -> global
commit_failed visible -> incident runtime
```

Mais ces tokens ne doivent pas apparaitre dans les nouveaux prompts ou contrats
actifs.

## Checklist Dispatcher

Avant de retourner un exit, verifier :

- Est-ce que le message appartient encore au flow local ?
- Si non, quelle est la raison exacte d'exit ?
- Le dispatcher global doit-il reprendre ce message ?
- La note contient-elle 1 a 3 fragments du message user ?
- La note contient-elle l'etat local utile ?
- La note dit-elle clairement ce qui n'a pas ete commit ?
- Le flow source evite-t-il tout message visible ?

## Formule Courte

```txt
Continuation local flow -> visible agent source possible.
Exit source flow -> note_information obligatoire, no visible source.
Safety -> exit_to_global_dispatcher target global, note_information, no visible source.
Stop/cancel/defer -> exit_to_global_dispatcher, note_information, no visible source.
Commit failed -> runtime incident, no visible source.
```
