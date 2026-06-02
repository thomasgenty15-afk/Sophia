# Product Surface Registry Contract

## Mental Model

Le Product Surface Registry est la source canonique des destinations plateforme
utilisées par les `platform_handoff_skill`.

Un renderer handoff ne doit pas inventer une destination produit. Il doit lire
un `surface_id`, un label user-facing et des étapes depuis le registry, puis
adapter son contenu métier autour de cette destination.

Le registry ne route pas le tour. Il ne comprend pas le message user. Il
convertit seulement une opération déjà structurée en destination produit.

## Runtime Shape

```txt
skill handoff draft
  -> getHandoffTargetForOperation(operation_type)
  -> renderer uses destination + platform_steps
  -> TurnAgenda / EffectLedger trace platform_handoff.surface_id
```

## File Ownership

- `product_surface_registry/surfaces.json`
  - possède la table canonique operation -> surface.
- `product_surface_registry/contract.ts`
  - types `ProductSurfaceId`, `ProductSurfaceHandoffTarget`,
    et helper `getHandoffTargetForOperation(operationType)`.
- `product_surface_registry/registry.ts`
  - valide `surfaces.json`, les surfaces legacy et les targets
    `platform_handoff`.
- Renderers des handoff skills
  - consomment le registry et ne hardcodent les destinations qu'en fallback
    générique "dans la plateforme" si la surface est inconnue.
- Tests registry
  - protègent les surfaces principales et `can_execute_from_chat=false`.

## Mapping Canonique V1

| Operation type | Surface id | Destination user-facing | Chat behavior |
| --- | --- | --- | --- |
| `adjust_plan_item` | `plan` | dans la section Plan | `platform_handoff` |
| `prepare_attack_card` | `attack_cards` | dans la section Cartes d’attaque | `platform_handoff` |
| `prepare_defense_card` | `defense_cards` | dans la section Cartes de défense | `platform_handoff` |
| `select_state_potion` | `state_potions` | dans la section État / Potions | `platform_handoff` |
| `create_recurring_reminder` | `recurring_reminders` | dans la section Rappels | `platform_handoff` |
| `update_coach_preferences` | `coach_preferences` | dans les Préférences coach | `platform_handoff` |

Les opérations suivantes ne sont pas des platform handoffs :

- `create_one_shot_reminder` : direct effect chat exécutable ;
- `track_progress_plan_item` : direct effect chat exécutable ;
- `status_recap` : read-only DB-grounded.

## Type Cible

```ts
export type ProductSurfaceHandoffTarget = {
  surface_id: string;
  operation_type: string;
  label: string;
  short_destination_label: string;
  user_facing_destination: string;
  platform_steps: string[];
  can_execute_from_chat: false;
  chat_behavior: "platform_handoff";
};
```

## Inputs

- `operation_type` déjà structuré par le dispatcher, TurnAgenda ou le skill
  propriétaire.
- Metadata optionnelle du skill : `source`, `reason_code`,
  `user_goal_summary`.

Le registry ne reçoit pas le message brut utilisateur.

## Outputs

- `ProductSurfaceHandoffTarget | null`.
- `surface_id` stable.
- destination user-facing.
- étapes plateforme sobres.
- `can_execute_from_chat=false`.
- `chat_behavior="platform_handoff"`.

## Responsibilities

Le registry possède :

- la table operation -> surface ;
- les labels de destination ;
- les étapes génériques de reprise dans la plateforme ;
- le flag no-execution pour les complex operations V1.

Le registry ne possède pas :

- le routing d'intention ;
- le contenu métier du draft ;
- la décision de clarification ;
- le rendu complet du skill ;
- la vérification DB de l'existence d'une surface.

## Invariants

- Les six complex operations V1 doivent avoir une surface registry.
- Chaque target handoff doit avoir `can_execute_from_chat=false`.
- Chaque target handoff doit avoir `chat_behavior="platform_handoff"`.
- Chaque target handoff doit avoir `user_facing_destination` et
  `platform_steps`.
- Les renderers handoff doivent utiliser le registry pour la destination.
- Le registry ne lit jamais le message user.
- Le registry ne choisit jamais entre deux opérations.
- Un changement de label frontend doit être répercuté dans le registry et les
  tests.

## Allowed Changes

- Ajouter une nouvelle surface si une feature plateforme existe.
- Renommer un label si le frontend a changé.
- Ajouter des étapes plus précises si elles sont vérifiées dans le produit.
- Ajouter des deeplinks ou route IDs si le front les expose.

## Forbidden Changes

- Utiliser le registry pour router une intention.
- Marquer une complex operation V1 `can_execute_from_chat=true`.
- Hardcoder une destination contradictoire dans un renderer.
- Inventer un bouton, écran ou chemin qui n'existe pas dans le frontend.
- Faire dépendre le registry d'une requête DB ou d'un appel IA.

## Integration Points

- `TurnAgenda` peut copier `surface_id` dans les tasks `platform_handoff`.
- `EffectLedger` peut persister `surface_id` dans les entries handoff.
- Les renderers handoff lisent destination + étapes depuis le registry.
- `final_response_pipeline` autorise le wording honnête de redirection vers une
  surface registry.

## Legacy Exceptions

- Un renderer peut garder un fallback générique "dans la plateforme" si une
  operation inconnue arrive, mais ce fallback doit être testé et ne doit pas
  inventer une feature.

## Required Tests

- `adjust_plan_item` -> `plan`, `can_execute_from_chat=false`.
- `prepare_attack_card` -> `attack_cards`.
- `prepare_defense_card` -> `defense_cards`.
- `select_state_potion` -> `state_potions`.
- `create_recurring_reminder` -> `recurring_reminders`.
- `update_coach_preferences` -> `coach_preferences`.
- `create_one_shot_reminder` n'est pas `platform_handoff`.
- `track_progress_plan_item` n'est pas `platform_handoff`.
- unknown operation returns null.
- toutes les surfaces handoff ont destination et étapes.
- chaque renderer handoff inclut la destination canonique.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-06-01 | Centraliser les destinations des platform handoffs dans Product Surface Registry. | Active | Architecture handoff V1 |
