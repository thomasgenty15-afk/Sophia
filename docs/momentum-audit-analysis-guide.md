# Guide d'Audit Momentum Sophia

## Objectif

Ce document explique comment exporter, lire, analyser et exploiter un bundle d'audit momentum Sophia pour evaluer la qualite reelle du systeme de pilotage proactif sur une fenetre temporelle donnee.

L'objectif n'est pas seulement de "voir ce qu'il s'est passe", mais de rendre possible une analyse rigoureuse de toute la chaine momentum:

- ce que le systeme a percu sur les dimensions `engagement`, `progression`, `charge_emotionnelle`, `consentement`
- quels blockers d'action ont ete appris, confirms, laisses refroidir ou laisses devenir chroniques
- quel etat utilisateur a ete derive
- quelles transitions ont ete proposees, confirmees ou rejetees
- quels bilans ont ete autorises ou bloques
- quels morning nudges ont ete envoyes, deferes, bloques ou transformes en soutien
- quels outreachs ont ete planifies, deferes, envoyes ou annules
- comment l'utilisateur a reagi apres ces interventions
- quelles branches sont utiles, inutiles, trop frequentes ou mal calibrees

En pratique, ce guide sert a produire un fichier local suffisamment riche pour qu'un modele ou un humain puisse ensuite auditer et proposer des optimisations concretes sans devoir deviner ce qui s'est passe dans le systeme.

## Ce que doit permettre un bon bundle d'audit

Un bon bundle d'audit momentum doit permettre de repondre aux questions suivantes:

- Quel etait le contexte conversationnel reel sur la fenetre analysee ?
- Quel etat momentum etait actif a chaque moment important ?
- Les dimensions du user ont-elles ete estimees de facon plausible ?
- Le systeme a-t-il appris les vrais blockers ou repose-t-il la meme question a vide ?
- L'evolution temporelle des blockers a-t-elle ete comprise ou ignoree ?
- Les transitions d'etat ont-elles ete stables ou trop nerveuses ?
- Des etats prioritaires comme `soutien_emotionnel` ou `pause_consentie` ont-ils bien ecrase les autres ?
- Les bilans quotidiens ou hebdos ont-ils ete bloques quand ils devaient l'etre ?
- Les morning nudges ont-ils ete juges pertinents au moment reel de l'envoi ?
- Un contexte sensible recent a-t-il bien bloque le nudge d'actions ou l'a-t-il transforme en soutien ?
- Les outreachs programmes etaient-ils adaptes a l'etat reel du user ?
- La pression relationnelle etait-elle trop forte, trop faible ou bien calibree ?
- L'utilisateur s'est-il reengage apres l'outreach ou l'intervention a-t-elle aggrave le retrait ?
- Certaines branches produit sont-elles jamais prises ou au contraire sur-utilisees ?

Si le bundle permet de repondre a ces questions, alors il est suffisamment riche pour faire un vrai travail d'optimisation.

## Ce que le bundle exporte contient

La commande d'export momentum produit deux fichiers:

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

- quel etat momentum etait actif
- quels blockers etaient deja connus
- pourquoi un bilan a ete bloque
- quel outreach a ete choisi
- quel morning nudge a ete choisi, ou pourquoi il a ete bloque
- si l'etat a change apres la reaction utilisateur

Le JSON seul ne suffit pas toujours non plus, car:

- la dynamique relationnelle saute souvent plus vite aux yeux dans un transcript lineaire
- certaines erreurs de calibration se voient d'abord dans le ton ou la temporalite des messages

La meilleure pratique est donc:

1. lire le transcript pour sentir la dynamique relationnelle
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

- on pense auditer une periode de reactivation alors que la fenetre commence trop tard
- on melange `web` et `whatsapp`
- on evalue une transition sans voir les signaux qui l'ont preparee

## La section `trace`

La section `trace` est le coeur du bundle.

Elle contient:

- la fenetre auditee
- un resume global
- les messages
- les turns reconstruits
- la timeline des etats
- les decisions proactives
- les outreachs
- les morning nudges
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
- `state_timeline_total`
- `proactive_decisions_total`
- `outreachs_total`
- `observability_events_total`

Quelques interpretations utiles:

- peu de `observability_events_total` peut signaler un probleme d'instrumentation
- beaucoup de `proactive_decisions_total` avec peu de `outreachs_total` peut etre normal si la machine bloque souvent les interventions
- beaucoup de `outreachs_total` avec peu de `user_messages` peut signaler une pression trop forte ou un faible reengagement

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
- le ton
- la charge emotionnelle
- les signaux de consentement ou de retrait
- les moments ou un outreach etait adapte ou deplace

Point important:

Quand tu audites la qualite momentum, les messages utilisateur sont la verite source.  
Si le systeme derive un etat non soutenu par les messages et les evenements, c'est un probleme.  
Si au contraire des signaux clairs apparaissent dans les messages et ne changent jamais l'etat, c'est aussi un probleme.

### `trace.turns`

Chaque `turn` est une reconstruction logique d'un echange pilote par le routeur.

Un turn contient typiquement:

- `turn_id`
- `request_id`
- `started_at`
- `scope`
- `user_message`
- `assistant_messages`
- `state_events`
- `proactive_decision_events`
- `reaction_events`

Cette section est fondamentale, car elle permet de suivre la chaine de decision sur un tour precis:

- quel signal est apparu
- quel etat a ete applique
- quelle intervention a suivi ou non
- quelle reaction utilisateur est revenue ensuite

### `trace.state_timeline`

Cette section reconstruit la chronologie des etats momentum.

Chaque entree contient typiquement:

- `at`
- `source`
- `event_name`
- `state_before`
- `state_after`
- `dimensions`
- `blocker_summary`
- `reason`
- `request_id`
- `turn_id`

Cette section sert a verifier:

- si l'etat applique est coherent
- si les dimensions supportent la classification
- si les blockers connus sont pris en compte dans la decision
- si l'ordre de priorite produit a bien ete respecte
- si les transitions sont trop frequentes ou trop lentes

### `trace.proactive_decisions`

Cette section regroupe les decisions prises par les triggers.

On y trouve notamment:

- `daily_bilan_momentum_decision`
- `weekly_bilan_momentum_decision`
- `momentum_morning_nudge_decision`
- `momentum_outreach_decision`
- `momentum_outreach_schedule_skipped`
- `momentum_outreach_scheduled`

Cette section sert a juger:

- si les bilans sont correctement bloques
- si les morning nudges sont correctement bloques, maintenus ou transformes en soutien
- si le type d'intervention choisi colle a l'etat
- si l'outreach reutilise un blocker deja connu au lieu de recommencer a zero
- si une friction chronique est bien escaladee vers preparation + dashboard
- si des branches produit ne sont jamais utilisees

### `trace.outreachs`

Chaque `outreach` reconstruit le cycle de vie d'une intervention proactive.

Un outreach contient typiquement:

- `scheduled_checkin_id`
- `outreach_state`
- `event_context`
- `scheduled_at`
- `scheduled_for`
- `sent_at`
- `final_status`
- `events`
- `reaction`

Cette section permet de juger:

- ce qui a ete programme
- ce qui a ete vraiment envoye
- ce qui a ete differe ou throttle
- si une reaction utilisateur est arrivee ensuite
- si cette reaction a valide ou invalide la branche choisie
- si le systeme a evite les questions circulaires sur le meme blocker

### `trace.unassigned_events`

Cette section contient les evenements observabilite momentum non rattaches proprement a un turn ou a un outreach.

On y retrouve souvent:

- les deliveries `momentum_morning_nudge_sent`
- les defer `momentum_morning_nudge_deferred`
- les annulations `momentum_morning_nudge_cancelled`
- les echecs `momentum_morning_nudge_failed`

Il faut la surveiller car:

- trop d'evenements non assignes rend l'audit moins fiable
- cela peut signaler un probleme de correlation `request_id`, `turn_id` ou `scheduled_checkin_id`

## La section `scorecard`

La `scorecard` est une vue agregee pour aller vite sur les signaux importants.

Elle contient notamment:

- `coverage`
- `states`
- `transitions`
- `decisions`
- `morning_nudges`
- `outreach`
- `alerts`

### `scorecard.coverage`

Cette section sert a verifier si l'export est exploitable.

Elle permet de voir:

- combien d'evenements ont ete corriges ou laisses non assignes
- si la fenetre semble suffisamment couverte pour un audit serieux

### `scorecard.states`

Cette section agrege:

- la distribution des etats
- l'etat courant de fin de fenetre

Interpretations utiles:

- `soutien_emotionnel` tres dominant peut signaler un sur-classement emotionnel
- `momentum` dominant avec peu d'actions reelles peut signaler une machine trop optimiste
- `evitement` quasi absent sur une base pourtant peu repondante peut signaler un angle mort
- beaucoup de blockers actifs/chronic sans changement de branche peut signaler un mauvais traitement de la friction

### `scorecard.transitions`

Cette section contient:

- le nombre total de transitions
- une matrice `from->to`

Elle permet de repérer:

- des oscillations trop rapides entre deux etats
- des transitions attendues jamais observees
- des transitions surprenantes vers `momentum` sans signal suffisant

### `scorecard.decisions`

Cette section synthétise:

- les decisions `daily_bilan`
- les decisions `weekly_bilan`
- les decisions `morning_nudge`
- les decisions `outreach`

Elle est utile pour verifier:

- le taux de blocage des bilans
- le taux de blocage des morning nudges
- les politiques les plus actives
- les etats qui provoquent le plus d'outreach

### `scorecard.morning_nudges`

Cette section agrege:

- `sent_total`
- `deferred_total`
- `cancelled_total`
- `failed_total`

Elle sert a juger:

- si le morning nudge part vraiment ou se fait souvent bloquer au dernier moment
- si le moteur de pertinence coupe correctement les matins non pertinents
- si un contexte sensible recent transforme bien le morning en soutien ou en silence

### `scorecard.outreach`

Cette section agrege:

- `scheduled_total`
- `schedule_skipped_total`
- `sent_total`
- `deferred_total`
- `cancelled_total`
- `failed_total`
- `throttled_total`
- `reply_total`
- `reply_rate_on_sent`
- `average_reply_delay_hours`

Elle sert a juger:

- si le systeme planifie beaucoup mais envoie peu
- si les envois sont throttles ou annules trop souvent
- si les users repondent reellement apres outreach
- si certaines branches convertissent mieux que d'autres
- si les outreachs de friction changent vraiment de registre quand le blocker est deja connu ou chronique

### `scorecard.alerts`

Cette section ne prouve pas un bug, mais attire l'attention.

Elle peut remonter:

- `branches_never_used`
- `oscillating_transitions`

Ces alertes sont un point de depart pour l'audit, pas une conclusion.

## Comment auditer correctement un bundle momentum

La bonne methode est:

1. Lire le transcript texte du debut a la fin.
2. Identifier les moments de bascule relationnelle.
3. Ouvrir `trace.turns` pour ces moments.
4. Verifier `trace.state_timeline` autour de ces turns.
5. Verifier `trace.proactive_decisions`, `trace.outreachs` et les evenements morning dans `trace.unassigned_events`.
6. Finir par la `scorecard` pour voir si le pattern local se repete globalement.

## Checklist d'audit

Pour chaque cas interessant, verifier:

- l'etat derive etait-il juste ?
- les dimensions supportaient-elles vraiment cet etat ?
- les blockers connus etaient-ils exacts, a jour et relies a la bonne action ?
- le systeme a-t-il tenu compte de l'evolution temporelle du blocker ?
- la priorite produit a-t-elle ete respectee ?
- le bilan a-t-il ete bloque ou autorise correctement ?
- le morning nudge etait-il pertinent ce matin-la ?
- un contexte sensible recent aurait-il du transformer le morning en soutien ou en silence ?
- l'outreach etait-il adapte au contexte ?
- la frequence d'intervention etait-elle raisonnable ?
- la reaction utilisateur a-t-elle confirme ou infirme la branche ?
- la frontiere produit "chat = tracking only" a-t-elle ete respectee ?
- aurait-il fallu ne rien envoyer ?

## Patterns de bugs frequents

Quelques patterns a surveiller en priorite:

- `soutien_emotionnel` declenche sur un simple message fatigue non durable
- `pause_consentie` non respectee apres un stop explicite
- `reactivation` declenchee alors que le user etait encore present sur un autre canal ou scope
- `friction_legere` traitee comme `momentum`
- `evitement` jamais detecte alors que les reports et esquives s'accumulent
- blocker connu ignore, puis meme question generique reposee
- blocker chronique traite comme un blocker nouveau
- changement de blocker non detecte alors que la raison a evolue
- outreach envoye alors que le consentement est fragile ou ferme
- morning nudge d'actions envoye malgre un contexte emotionnel recent incompatible
- morning nudge qui repete un angle de friction sans tenir compte du blocker actif
- systeme qui reste trop longtemps en `momentum` malgre absence de progression
- systeme qui degrade trop vite sur un seul tour faible
- reponse qui laisse entendre qu'une action a ete creee/modifiee depuis le chat

## Comment juger la qualite d'une decision proactive

Une bonne decision proactive respecte quatre conditions:

- le bon etat a ete lu
- le bon niveau de connaissance blocker a ete reutilise
- le bon niveau de pression a ete choisi
- le bon moment a ete retenu
- la reaction utilisateur ne montre pas de friction additionnelle evidente

Une mauvaise decision proactive prend en general l'une de ces formes:

- elle pousse alors qu'il fallait se taire
- elle ralentit alors qu'il fallait relancer legerement
- elle choisit le mauvais registre relationnel
- elle repete un geste deja inefficace
- elle traite comme nouveau un blocker deja etabli
- elle propose dans le chat une modification d'action qui devrait aller au dashboard

## Comment utiliser l'audit pour tuner le systeme

Quand un pattern revient, la bonne question n'est pas seulement "quel message etait mauvais ?", mais:

- le probleme vient-il de la classification d'etat ?
- de la memoire de blocker ou de son vieillissement ?
- du mapping `etat -> intervention` ?
- du cooldown ?
- de la correlation des evenements ?
- d'un manque de signaux en entree ?

Les leviers de tuning les plus probables sont:

- seuils de transition
- hysteresis
- priorites entre etats
- detection et taxonomie des blockers
- logique de vieillissement / resolution des blockers
- politique de blocage des bilans
- frequence max d'outreach
- copy ou famille d'outreach par etat
- formulation et fermete de la frontiere "tracking only"

## Commande d'export

Le bundle momentum peut etre exporte avec:

```bash
node scripts/export_momentum_audit_bundle.mjs --user-id <uuid> --hours 72
```

Exemples utiles:

```bash
node scripts/export_momentum_audit_bundle.mjs --user-id <uuid> --hours 168
node scripts/export_momentum_audit_bundle.mjs --user-id <uuid> --from 2026-03-10T00:00:00Z --to 2026-03-17T00:00:00Z
node scripts/export_momentum_audit_bundle.mjs --user-id <uuid> --hours 168 --scope whatsapp
```

## Bonnes pratiques de fenetre

Choisir la bonne fenetre est crucial:

- 24h pour un incident ponctuel
- 72h pour une transition ou une mauvaise relance
- 7 jours pour juger la stabilite des etats et la pression proactive
- 14 jours si on veut voir une sequence complete `momentum -> friction -> evitement -> reactivation`

## Conclusion

Un bon audit momentum ne juge pas seulement les messages envoyes.  
Il juge la qualite de la perception, de la classification, de la politique proactive et de la reaction observee ensuite.

Si le bundle permet de suivre cette chaine de bout en bout, alors il devient possible de corriger le systeme de maniere precise, sans intuition floue ni debugging a l'aveugle.
