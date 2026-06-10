# UserTurnSnapshot Contract

## Mental Model

`UserTurnSnapshot` repond a la question : "dans quel etat exact est ce tour ?"
Il capture le message courant, le `TurnFrame`, la `RouteDecision`,
`tempMemory`, les flows actifs, le pending de confirmation, le durable state
minimal et les contraintes explicites deja exprimees par les couches amont.

Le snapshot ne decide pas quelle operation executer. Il ne bloque pas les
writes, ne cree pas de handoff, ne rend pas de texte et n'alimente pas le
ledger par lui-meme.

## Source De Verite

- `TurnFrame` porte les signaux structurés du dispatcher.
- `RouteDecision` porte l'owner selectionné pour le tour.
- Les local dispatchers/reducers decident des actions propres a leur domaine.
- Les writers locaux sont la seule porte vers les mutations DB.
- `EffectLedger` enregistre les effets réellement demandes, bloques, echoues ou
  committes par les runtimes.

## Fichiers

- `supabase/functions/sophia-brain/router/user_turn_snapshot.ts`
- `supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts`

## Invariants

- Ne pas parser la semantique utilisateur dans `UserTurnSnapshot`.
- Ne pas executer d'effet depuis le snapshot.
- Ne pas utiliser le snapshot comme preuve de commit.
- Ne pas stocker de draft ou de contenu sensible complet dans le snapshot.
