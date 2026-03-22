# Machine de momentum utilisateur - Morning nudges

## Objectif

Aligner les `morning nudges` avec la machine momentum, au plus proche du moment reel d'envoi.

Le morning ne doit plus etre un simple rappel d'actions genere a l'avance pour toute la semaine.
Il devient une decision de derniere minute:

- est-ce pertinent d'envoyer quelque chose ce matin ?
- si oui, faut-il envoyer un nudge d'actions, un message tres leger, un soutien sobre, ou rien ?

## Principes

- le cron morning ne prepare plus une semaine complete de messages
- il provisionne seulement le prochain slot local du matin
- le contenu est decide au moment du send dans `process-checkins`
- la decision lit le `momentum_state`, les blockers actifs et les items du jour
- un contexte sensible recent peut bloquer le nudge d'actions ou le transformer en soutien

## Branches produit

- `momentum` -> nudge de cap / focus du jour
- `friction_legere` -> nudge de simplification / faisable aujourd'hui
- `evitement` -> nudge tres basse pression
- `soutien_emotionnel` -> soutien doux, sans accountability
- `reactivation` -> porte ouverte legere
- `pause_consentie` -> silence

## Effet attendu

- plus de contexte recent pris en compte
- moins de morning nudges inappropries
- meilleure coherence entre momentum, blockers et actions du jour
- meilleur audit de la pertinence reellement choisie au moment de l'envoi
