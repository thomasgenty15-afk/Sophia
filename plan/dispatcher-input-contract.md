# Dispatcher Input Contract

## Objectif

Ce document decrit les champs envoyes au dispatcher Sophia a chaque tour.

Le dispatcher ne repond pas au user. Il produit un `TurnFrame` de routage :
skill, operation, confirmation, side effects directs et `memory_plan`.

Le but de ce contrat est d'eviter les ambiguites suivantes :

- faire croire qu'une memoire a deja ete chargee avant le dispatcher ;
- laisser le dispatcher inventer des IDs ;
- confondre un etat actif avec une nouvelle intention utilisateur ;
- confondre tool direct, tool skill et skill conversationnel.

## Input actuel

```json
{
  "prompt_version": "dispatcher_v2_prompt_2026_05_s8",
  "user_message": "...",
  "recent_messages": [],
  "safety_risk_band": "low",
  "active_skill_state": null,
  "active_tool_skill_intake": null,
  "pending_tool_skill_confirmation": null,
  "active_topic_state": null,
  "flow_state_context": null,
  "plan_snapshot": null
}
```

## Sens des champs

### `prompt_version`

Version du prompt dispatcher.

Sert au trace/debug et a comparer les comportements entre versions.
Le dispatcher ne doit pas en deduire une intention utilisateur.

### `user_message`

Dernier message utilisateur a router.

C'est la source principale de decision du dispatcher.

### `recent_messages`

Messages recents de la conversation.

Sert a comprendre :

- les reponses courtes comme "oui", "non", "ok", "vas-y" ;
- les pronoms ou references implicites ;
- les continuations naturelles apres une reponse Sophia ;
- les changements de sujet.

Ce champ ne remplace pas la memoire durable.

### `safety_risk_band`

Risque deja detecte par le safety pregate avant le dispatcher.

Regle importante :

- le dispatcher peut elever le risque ;
- il ne doit jamais l'abaisser.

Exemple : si le pregate donne `medium`, le dispatcher ne doit pas sortir `low`.

### `active_skill_state`

Skill conversationnel deja actif.

Exemples :

- `emotional_repair` apres un moment de honte ;
- `execution_breakdown` pendant une aide a la micro-action ;
- `product_help` pendant une explication produit.

Ce champ aide a savoir si le user continue le meme mode conversationnel ou s'il change clairement d'intention.

Il ne doit pas bloquer une intention plus prioritaire. Exemple : si une operation est en attente de confirmation et que le user dit "ok fais-le", la confirmation/operation passe avant la continuation du skill.

### `active_tool_skill_intake`

Tool skill deja en train de collecter des informations.

Exemples :

- ajustement d'un item de plan ;
- creation d'un rappel recurrent ;
- preparation d'une carte.

Le dispatcher doit utiliser ce champ pour distinguer :

- une clarification de slots ;
- une correction ;
- un abandon ;
- une nouvelle demande.

### `pending_tool_skill_confirmation`

Operation prete mais en attente d'un Oui/Non utilisateur.

C'est prioritaire pour les reponses courtes.

Exemples :

- "oui" => confirmation ;
- "ok fais-le" => confirmation ;
- "non merci" => refus ;
- "oui mais plus court" => correction, pas execution directe.

Ce champ doit seulement exister quand une confirmation est vraiment en attente.

### `active_topic_state`

Sujet conversationnel actif.

Sert surtout a aider les references implicites et le `memory_plan`.

Exemple :

- si le sujet actif est le sommeil et que le user dit "hier c'etait encore pareil", le dispatcher peut demander une memoire ciblee sur ce sujet/evenement.

Ce champ ne doit pas forcer un skill a lui seul.

### `flow_state_context`

Flow produit ou onboarding actif.

Sert a ne pas casser un parcours en cours.

Exemple :

- si l'onboarding WhatsApp est actif, le dispatcher ne doit pas router par defaut vers le plan/action du jour sans intention claire.

### `plan_snapshot`

Vue courte des items de plan utilisateur disponibles au tour courant.

Usage principal :

- resoudre un `target_item_id` pour un tool direct comme `track_progress_plan_item` ;
- aider une operation comme `adjust_plan_item` a savoir si la cible est claire, ambigue ou absente.

Regle anti-hallucination :

- le dispatcher peut recopier un ID uniquement s'il existe dans `plan_snapshot` ;
- il ne doit jamais inventer un ID.

Exemple :

```json
{
  "items": [
    {
      "id": "item_123",
      "title": "Faire 10 minutes de marche"
    }
  ]
}
```

Si le user dit :

```text
j'ai fait ma marche
```

Le dispatcher peut sortir :

```json
{
  "effect_type": "track_progress_plan_item",
  "target_status": "identified",
  "payload_hint": {
    "target_item_id": "item_123",
    "target_title": "Faire 10 minutes de marche",
    "status_hint": "completed"
  }
}
```

Si la cible n'est pas claire, il doit sortir `ambiguous` ou `missing`, pas inventer un ID.

## Ce qui n'est plus dans l'input

### `memory_pre_route_snapshot`

Supprime.

Raison : le dispatcher doit d'abord produire un `memory_plan`, puis le retrieval memoire charge le contexte utile apres coup.

Ancien modele a eviter :

```text
memoire chargee avant dispatcher -> dispatcher route avec ce snapshot
```

Modele attendu :

```text
message user
-> dispatcher
-> memory_plan
-> retrieval memoire
-> reponse Sophia
```

## Output memoire attendu

Le dispatcher doit toujours sortir un `memory_plan`.

Ce plan ne decide pas quoi memoriser durablement. Il decide seulement quoi recuperer maintenant pour repondre correctement.

Champs attendus :

```json
{
  "memory_mode": "none",
  "context_need": "minimal",
  "context_budget_tier": "tiny",
  "targets": [],
  "retrieval_policy": "semantic_first"
}
```

Quand aucune memoire n'est utile :

```json
{
  "memory_mode": "none",
  "context_need": "minimal",
  "context_budget_tier": "tiny",
  "targets": [],
  "retrieval_policy": "semantic_first"
}
```

Quand une memoire ciblee est utile :

```json
{
  "memory_mode": "light",
  "context_need": "targeted",
  "context_budget_tier": "small",
  "targets": [
    {
      "type": "domain_key",
      "value": "sante.sommeil"
    }
  ],
  "retrieval_policy": "taxonomy_first"
}
```

## Points a travailler

- Ajouter ces explications directement dans le prompt dispatcher, en version courte.
- Verifier que chaque champ d'input est encore utile au runtime.
- Verifier que `active_topic_state` ne devient pas un pre-retrieval memoire deguise.
- Verifier que `plan_snapshot` contient juste assez d'information pour resoudre les IDs sans exposer trop de contexte.
- Ajouter des tests ou snapshots de prompt pour proteger ce contrat.
- Verifier que les traces QA affichent l'input dispatcher et l'output `TurnFrame` de facon lisible, sans secrets.

