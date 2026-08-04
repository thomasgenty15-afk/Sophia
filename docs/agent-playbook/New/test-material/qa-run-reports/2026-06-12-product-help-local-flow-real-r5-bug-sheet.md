# Bug Sheet - Product Help Local Flow - Run r5

## Bug 1 - T3 Selectionne Prepare Attack Card Sans Executer Le Nouveau Dispatcher Local

- Run ID : `product-help-local-flow-20260612-r5`
- Tour : T3
- Severite : high
- Statut : open

### Message User

> D'accord. Alors prepare-moi une carte d'attaque pour ranger mes papiers demain matin.

### Comportement Observe

Sophia repond avec une carte d'attaque courte directement dans le chat :

> OK. Je te prepare une carte d'attaque claire pour "ranger tes papiers" demain matin.

Puis elle donne un contenu structure comme une carte :
- but ;
- premier geste ;
- piles ;
- regle anti-blocage ;
- fin facile ;
- question 5 ou 15 minutes.

### Trace Observee

La trace indique :

```json
{
  "response_owner": "tool_skill",
  "selected_handler": "prepare_attack_card",
  "route_reason": "tool_skill_intent_start",
  "tool_execution": "none"
}
```

Elle indique aussi que `product_help` a bien quitte vers le global :

```json
{
  "blocked_path": "product_help.local_visible_reply",
  "reason_code": "local_exit_to_global_dispatcher_blocks_local_reply",
  "local_flow_exit_handoff": {
    "source_flow_id": "product_help",
    "target_dispatcher": "global",
    "consumed_by": "global_dispatcher_second_pass",
    "selected_handler": "prepare_attack_card"
  }
}
```

### Trace Attendue

Le tour aurait du montrer l'execution effective du nouveau runtime local `prepare_attack_card` :

```json
{
  "toolSkillRun": {
    "selected_handler": "prepare_attack_card",
    "operation_type": "prepare_attack_card",
    "mode": "platform_handoff",
    "no_chat_mutation": true,
    "executable_from_chat": false,
    "runtime_trace": [
      {
        "component": "prepare_attack_card.local_flow",
        "event": "local_dispatcher start"
      },
      {
        "component": "prepare_attack_card.local_flow",
        "event": "local_dispatcher decision"
      },
      {
        "component": "prepare_attack_card.local_flow",
        "event": "reducer reduced"
      },
      {
        "component": "prepare_attack_card.local_flow",
        "event": "visible_stage complete"
      }
    ]
  }
}
```

### Contrat Attendu

Le nouveau flow `prepare_attack_card` ne doit pas creer ni simuler une carte depuis le chat.

Il doit :
- passer par son dispatcher local ;
- produire une sortie structuree ;
- passer par son reducer ;
- donner uniquement un `visible_task.conversation_context` au visible agent ;
- rester non mutant ;
- indiquer `mode=platform_handoff`, `no_chat_mutation=true`, `executable_from_chat=false`.

### Impact

Le fix `product_help` est seulement partiel :
- `product_help -> global` fonctionne ;
- la reprise effective par le nouveau `prepare_attack_card` n'est pas prouvee sur T3 ;
- Sophia donne une reponse visible contraire au contrat attendu du nouveau flow.

### Hypothese Technique

Le second pass global selectionne bien `prepare_attack_card`, mais le tour retombe sur un ancien chemin `tool_skill_intent_start` ou sur une reponse visible hors runtime local au lieu de forcer `maybeRunPrepareAttackCardOperation` via le pipeline runtime.

### Correction Attendue

- Forcer le chemin `product_help exit_to_global_dispatcher -> global second pass -> prepare_attack_card` a appeler le runtime local `prepare_attack_card` sur le meme tour.
- Ajouter un test d'integration ou de pipeline qui verifie, pour ce scenario :
  - `selected_handler=prepare_attack_card` ;
  - `toolSkillRun.mode=platform_handoff` ;
  - `toolSkillRun.no_chat_mutation=true` ;
  - `toolSkillRun.executable_from_chat=false` ;
  - presence de `prepare_attack_card.local_flow` dans `runtime_trace` ;
  - absence de brouillon de carte visible construit hors visible agent local.

### Verdict Bug

Open.

Le run `r5` ne peut pas etre considere green tant que ce chemin n'est pas corrige puis revalide en conditions reelles.
