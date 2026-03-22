# Guide d'Audit Coaching Intervention Sophia

## Objectif

Ce document explique comment exporter, lire, analyser et exploiter un bundle d'audit coaching intervention Sophia pour evaluer la qualite reelle de la couche coach concrete sur une fenetre temporelle donnee.

L'objectif n'est pas seulement de "voir quels conseils sont sortis", mais de rendre possible une analyse rigoureuse de toute la chaine coach:

- est-ce qu'un vrai trigger de blocage etait present
- est-ce que `momentum` autorisait une intervention concrete a ce moment-la
- quel blocage a ete suspecte
- quelle technique a ete choisie, ou au contraire sautee
- si une clarification etait necessaire
- si le conseil a ete reellement formule dans la reponse finale
- si un suivi utile a ete capte ensuite
- si la technique a aide, echoue, ou n'a jamais ete testee
- si le systeme a evite de reproposer trop vite une technique deja inefficace
- si le weekly a bien consolide ce qui a aide ou non

En pratique, ce guide sert a produire un fichier local suffisamment riche pour qu'un modele ou un humain puisse ensuite auditer et proposer des optimisations concretes sans devoir deviner ce qui s'est passe dans le systeme.

## Ce que doit permettre un bon bundle d'audit

Un bon bundle d'audit coaching doit permettre de repondre aux questions suivantes:

- Y avait-il vraiment un `trigger` de blocage ou le systeme a-t-il sur-reacti ?
- Le gate `momentum` etait-il coherent avec l'etat reel du user ?
- Le `blocker_type` choisi etait-il plausible ?
- Le selecteur a-t-il choisi une technique adaptee parmi les bonnes candidates ?
- Le systeme a-t-il demande une clarification quand la confiance etait trop faible ?
- Le conseil a-t-il ete assez concret et bien adapte au contexte reel ?
- La technique choisie a-t-elle ete effectivement rendue dans la reponse finale de Sophia ?
- Un suivi exploitable a-t-il ete capture ensuite ?
- Le resultat du suivi montre-t-il `not_tried`, `tried_helpful`, `tried_not_helpful` ou `behavior_changed` ?
- Le systeme a-t-il bien devalorise une technique deja inefficace ?
- Le weekly a-t-il restitue sobrement ce qui marche ou ce qu'il faut changer ?

Si le bundle permet de repondre a ces questions, alors il est suffisamment riche pour faire un vrai travail d'optimisation.

## Ce que le bundle exporte contient

La commande d'export coaching produit deux fichiers:

- un fichier JSON principal
- un fichier transcript texte

Le JSON principal contient:

- `trace`
- `scorecard`
- `annotations`
- quelques metadonnees de contexte sur l'export

Le transcript texte contient:

- la chronologie brute des messages
- les roles
- le scope
- les eventuels `request_id`

Le transcript est utile pour une lecture humaine rapide.  
Le JSON est la source d'audit complete.

## Pourquoi il faut les deux fichiers

Le transcript seul ne suffit pas, car il ne dit pas:

- quel trigger a ete detecte
- quel gate `momentum` a bloque ou autorise l'intervention
- quelle technique a ete choisie parmi quelles candidates
- si la technique a ete depriorisee plus tard
- si le weekly a retenu une technique utile ou un switch necessaire

Le JSON seul ne suffit pas toujours non plus, car:

- certaines erreurs de calibration se voient d'abord dans la formulation concrete du conseil
- le transcript lineaire montre plus vite si Sophia a vraiment dit quelque chose d'actionnable ou si elle est restee trop abstraite

La meilleure pratique est donc:

1. lire le transcript pour sentir la qualite concrete du coaching
2. utiliser le JSON pour comprendre la mecanique interne
3. faire la synthese en croisant les deux

## Structure generale du JSON exporte

Le bundle exporte contient en haut niveau:

- `ok`
- `exported_at`
- `source`
- `request`
- `trace`
- `scorecard`
- `annotations`

### `source`

Cette section permet de savoir d'ou vient l'export:

- URL Supabase utilisee
- type de connexion (`local` ou `env`)
- base URL des functions

Elle sert surtout a eviter les confusions entre local, staging et prod.

### `request`

Cette section documente la fenetre reellement demandee:

- `user_id`
- `scope`
- `from`
- `to`
- `used_hours`

Elle est importante car une mauvaise fenetre temporelle mene a des conclusions fausses.

Exemples de problemes frequents:

- on croit auditer un blocage repete mais la fenetre commence apres la premiere proposition
- on melange `web` et `whatsapp`
- on lit un weekly sans voir les interventions coach qui l'ont precede

## La section `trace`

La section `trace` est le coeur du bundle.

Elle contient:

- la fenetre auditee
- un resume global
- les messages
- les turns reconstruits
- les runs selecteur
- les interventions
- les suivis
- les surfaces weekly
- les evenements non assignes

### `trace.window`

Cette section contient:

- `from`
- `to`
- `scope`

C'est la verite de la fenetre analysee.  
Il faut toujours la verifier avant de tirer des conclusions.

### `trace.summary`

Cette section resume le volume global:

- `messages_total`
- `user_messages`
- `assistant_messages`
- `turns_total`
- `selector_runs_total`
- `interventions_total`
- `follow_ups_total`
- `weekly_surfaces_total`
- `observability_events_total`

Quelques interpretations utiles:

- beaucoup de `selector_runs_total` avec peu de `interventions_total` peut etre normal si le gate bloque souvent
- beaucoup de `interventions_total` avec peu de `follow_ups_total` peut signaler une boucle d'apprentissage encore faible
- beaucoup de `weekly_surfaces_total` sans interventions resolues peut signaler un weekly trop declaratif

### `trace.messages`

Cette section contient les messages bruts:

- `id`
- `role`
- `content`
- `scope`
- `created_at`
- `metadata`

Cette section sert a comprendre:

- le contenu reel de la conversation
- si le blocage etait explicite ou ambigu
- si Sophia a donne un conseil concret ou est restee dans le soutien general
- si le suivi utilisateur parlait vraiment de la technique testee

Point important:

Quand tu audites la qualite coach, les messages utilisateur sont la verite source.  
Si le systeme deduit un blocage non soutenu par les messages, c'est un probleme.  
Si un vrai blocage concret apparait dans les messages et que le systeme ne propose rien, c'est aussi un probleme.

### `trace.turns`

Chaque `turn` est une reconstruction logique d'un echange pilote par le routeur.

Un turn contient typiquement:

- `turn_id`
- `request_id`
- `started_at`
- `scope`
- `channel`
- `user_message`
- `assistant_messages`
- `selector_runs`
- `intervention_events`
- `follow_up_events`
- `events`

Cette section permet de suivre la chaine coach sur un tour precis:

- quel signal est apparu
- si le gate a laisse passer l'intervention
- si le selecteur a choisi une technique
- si cette technique a ete rendue dans la reponse
- si un suivi est revenu plus tard

### `trace.selector_runs`

Cette section contient les executions structurees du selecteur coach.

Chaque entree contient typiquement:

- `trigger_type`
- `momentum_state`
- `blocker_type`
- `confidence`
- `eligible`
- `skip_reason`
- `recommended_technique`
- `candidate_techniques`
- `follow_up_needed`
- `customization_context`
- `payload`

Cette section sert a verifier:

- si le selecteur a lu le bon type de blocage
- si les candidates etaient coherentes
- si la technique choisie etait defensable
- si la personnalisation venait bien du contexte reel
- si un skip venait d'un bon gate ou d'un faux negatif

### `trace.interventions`

Cette section contient les propositions coach effectives.

Chaque intervention contient typiquement:

- `intervention_id`
- `proposed_at`
- `trigger_type`
- `momentum_state`
- `blocker_type`
- `confidence`
- `recommended_technique`
- `candidate_techniques`
- `follow_up_needed`
- `follow_up_due_at`
- `customization_context`
- `proposal`
- `render`
- `follow_up`

Cette section sert a juger:

- si la technique choisie a bien ete proposee
- si le rendu final etait coherent avec la decision structuree
- si la meme intervention a ensuite recu un vrai retour utilisateur

### `trace.follow_ups`

Cette section contient les resolutions de suivi.

Chaque entree contient typiquement:

- `intervention_id`
- `recommended_technique`
- `blocker_type`
- `follow_up_outcome`
- `helpful`

Elle sert a verifier:

- si le systeme capte bien les retours utilisateur
- si les outcomes utiles sont bien classes
- si l'apprentissage est base sur de vrais signaux

### `trace.weekly_surfaces`

Cette section contient les syntheses coach emises au moment du weekly.

Chaque entree contient typiquement:

- `weekly_recommendation`
- `summary`
- `payload`

Elle sert a verifier:

- si le weekly renforce un levier qui aide vraiment
- s'il recommande un switch quand une technique echoue
- s'il evite de surinterpreter des signaux faibles

### `trace.unassigned_events`

Cette section contient les evenements coaching non rattaches a un turn.

Il faut la surveiller car:

- trop d'evenements non assignes rend l'audit moins fiable
- cela peut signaler un probleme de correlation `request_id` ou `turn_id`

## La section `scorecard`

La `scorecard` est une vue agregee pour aller vite sur les signaux importants.

Elle contient notamment:

- `coverage`
- `triggers`
- `gating`
- `blockers`
- `techniques`
- `effectiveness`
- `weekly`
- `alerts`

### `scorecard.coverage`

Cette section sert a verifier si l'export est exploitable.

Elle permet de voir:

- combien de turns et d'evenements sont presents
- si le volume de selecteurs, interventions et suivis est suffisant pour un audit serieux

### `scorecard.triggers`

Cette section agrege la distribution des triggers detectes.

Elle permet de reperer:

- les triggers sur-utilises
- les familles de blocages jamais ou presque jamais prises
- un detecteur trop sensible sur certains signaux verbaux

### `scorecard.gating`

Cette section agrege:

- les interventions eligibles
- les interventions bloquees
- la distribution par gate
- les skips

Elle sert a juger:

- si `momentum` bloque trop ou pas assez
- si `soutien_emotionnel` et `pause` ecrasent correctement les conseils performance
- si le systeme force du coaching la ou il devrait rester en soutien

### `scorecard.blockers`

Cette section agrege:

- la distribution des `blocker_type`
- la distribution des niveaux de `confidence`

Elle sert a juger:

- quels blocages sont le plus souvent proposes
- si la machine reste trop souvent en faible confiance
- si certains blocages sont sous-utilises alors qu'ils devraient exister dans les conversations

### `scorecard.techniques`

Cette section agrege par technique:

- `proposed_by_technique`
- `tried_by_technique`
- `helpful_by_technique`
- `not_helpful_by_technique`
- `behavior_changed_by_technique`

Elle sert a juger:

- quelles techniques sortent souvent
- lesquelles sont essayees
- lesquelles semblent produire un vrai changement
- lesquelles sont trop proposees pour peu d'effet

### `scorecard.effectiveness`

Cette section contient notamment:

- `proposal_total`
- `tried_total`
- `helpful_total`
- `behavior_changed_total`
- `proposal_to_try_rate`
- `try_to_helpful_rate`
- `behavior_change_rate`
- `repeat_failed_technique_rate`

Elle sert a juger:

- si les propositions sont reellement testees
- si les essais aident
- si certaines techniques changent vraiment le comportement
- si le systeme repete trop souvent des techniques deja fragilisees

### `scorecard.weekly`

Cette section agrege les recommandations weekly.

Elle sert a juger:

- si le weekly renforce surtout des techniques utiles
- s'il recommande souvent des switches
- s'il bascule trop souvent en `keep_testing`

### `scorecard.alerts`

Cette section ne prouve pas un bug, mais attire l'attention.

Elle peut remonter:

- `techniques_never_used`
- `low_confidence_selector_runs`
- `repeated_failed_technique_signals`
- `unresolved_proposals`

Ces alertes sont un point de depart pour l'audit, pas une conclusion.

## Comment auditer correctement un bundle coaching

La bonne methode est:

1. Lire le transcript texte du debut a la fin.
2. Identifier les moments ou un conseil concret aurait du partir.
3. Ouvrir `trace.turns` pour ces moments.
4. Verifier `trace.selector_runs` et `trace.interventions`.
5. Regarder `trace.follow_ups` pour voir si l'apprentissage repose sur un vrai signal.
6. Finir par la `scorecard` pour voir si le pattern local se repete globalement.

## Checklist d'audit

Pour chaque cas interessant, verifier:

- y avait-il un vrai trigger de blocage ?
- le gate `momentum` etait-il juste ?
- le blocage choisi etait-il plausible ?
- la technique choisie etait-elle la bonne parmi les candidates ?
- la personnalisation etait-elle assez concrete ?
- fallait-il clarifier plutot que proposer ?
- la reponse finale a-t-elle bien rendu la technique ?
- le suivi a-t-il ete capte correctement ?
- la technique a-t-elle aide, echoue, ou n'a-t-elle pas ete testee ?
- le systeme a-t-il bien evite de reproposer trop vite une technique faible ?
- le weekly a-t-il consolide sobrement ce qui marche ou ce qu'il faut changer ?

## Patterns de bugs frequents

Quelques patterns a surveiller en priorite:

- trigger detecte alors que le user ne demandait pas vraiment d'aide concrete
- gate `momentum` trop permissif en contexte emotionnel fragile
- gate trop dur qui bloque des conseils utiles en `friction_legere`
- blocage mal classe
- technique trop abstraite pour le contexte reel
- technique correcte en theorie mais mal rendue dans le message final
- clarification manquante alors que la confiance est faible
- suivi non capte alors que le user donne un retour exploitable
- meme technique reproposee malgre un `tried_not_helpful`
- weekly qui surinterprete un seul essai faible

## Comment juger la qualite d'une intervention coach

Une bonne intervention coach respecte cinq conditions:

- le bon trigger a ete lu
- le bon gate a ete respecte
- le bon blocage a ete choisi
- la bonne technique a ete proposee
- le rendu final est resté concret, simple et adapte
- le suivi montre ensuite un signal utile ou au minimum non bruyant

Une mauvaise intervention coach prend en general l'une de ces formes:

- elle conseille alors qu'il fallait surtout soutenir
- elle choisit un blocage mal pose
- elle propose une technique trop generique
- elle reste vague dans la formulation finale
- elle ne laisse aucune trace exploitable pour apprendre ensuite
- elle repete une technique deja fragile

## Comment utiliser l'audit pour tuner le systeme

Quand un pattern revient, la bonne question n'est pas seulement "quel conseil etait mauvais ?", mais:

- le trigger etait-il mal detecte ?
- le gate `momentum` etait-il mal calibre ?
- le mapping `blockage -> technique` est-il mauvais ?
- le selecteur abuse-t-il du faible niveau de confiance ?
- la personnalisation est-elle trop faible ?
- la classification de suivi est-elle trop stricte ou trop lache ?
- le weekly consolide-t-il trop ou pas assez ?

Les leviers de tuning les plus probables sont:

- heuristiques de trigger
- gating `momentum -> coaching`
- taxonomie des blocages
- mapping `blockage -> techniques`
- priorisation selon l'historique d'efficacite
- regles de depriorisation apres echec
- micro-copy de rendu final
- regles de synthese weekly

## Commande d'export

Le bundle coaching peut etre exporte avec:

```bash
npm run coaching:audit:export -- --user-id <uuid> --hours 72 --scope whatsapp
```

Exemples utiles:

```bash
npm run coaching:audit:export -- --user-id <uuid> --hours 168 --scope whatsapp
npm run coaching:audit:export -- --user-id <uuid> --from 2026-03-10T00:00:00Z --to 2026-03-17T00:00:00Z --scope whatsapp
npm run coaching:audit:export -- --user-id <uuid> --hours 72 --scope-all
```

## Bonnes pratiques de fenetre

Choisir la bonne fenetre est crucial:

- 24h pour verifier un cas ponctuel de mauvaise technique
- 72h pour une sequence `trigger -> intervention -> suivi`
- 7 jours pour juger la stabilite d'une technique et la qualite du weekly
- 14 jours si on veut voir si le systeme apprend vraiment quoi reproposer ou abandonner

## Note sur `annotations`

Le bundle exporte contient un champ `annotations`, mais il est reserve pour une phase ulterieure.  
Dans la version actuelle, il est renvoye vide.

## Conclusion

Un bon audit coaching ne juge pas seulement les messages envoyes.  
Il juge la qualite de la detection, du gating, de la selection de technique, du rendu final, du suivi et de l'apprentissage ensuite.

Si le bundle permet de suivre cette chaine de bout en bout, alors il devient possible de corriger le systeme de maniere precise, sans intuition floue ni debugging a l'aveugle.
