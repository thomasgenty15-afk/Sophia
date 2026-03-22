# Machine de momentum utilisateur - Weekly blockers Phase 3

## Objectif

Realigner le flow `weekly_bilan` avec la regle produit `chat = tracking only`.

Le weekly peut :

- recommander un ajustement
- clarifier l'intention
- retenir une decision pour le recap
- preparer une redirection vers le dashboard

Le weekly ne peut plus :

- activer une action dans le chat
- mettre en pause une action dans le chat
- remplacer une action dans le chat
- modifier le plan en base depuis une validation conversationnelle

## Changements

- les suggestions weekly sont maintenant formulees comme des recommandations a retenir pour le dashboard
- l'acceptation d'une suggestion ne passe plus par `applySuggestionProposal`
- une acceptation produit maintenant un outcome `accepted`
- le recap hebdo garde une note de decision orientee dashboard
- la copy weekly rappelle explicitement que le changement se fait dans le dashboard, pas dans le chat

## Invariants

- accepter une suggestion weekly ne doit pas muter `user_actions`
- accepter une suggestion weekly ne doit pas muter `user_framework_tracking`
- accepter une suggestion weekly ne doit pas muter `user_plans`
- la seule ecriture runtime restante dans cette branche est le log `weekly_bilan_suggestion_events`

## Verification

- test de wording sur la queue de suggestions
- test de description dashboard-only
- test de branche `accept` confirmant l'absence de mutation du plan
