# Systemes Vivants V2 - Implementation Canonique

## Statut

Document de cadrage implementation/systeme pour la V2.

Il complete:

- [onboarding-v2-canonique.md](/Users/ahmedamara/Dev/Sophia%202/docs/onboarding-v2-canonique.md) — fondation produit
- [v2-technical-schema.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md) — source de verite pour les types (ne pas redefinir ici)
- [v2-orchestration-rules.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-orchestration-rules.md) — regles de coordination entre moteurs
- [v2-mvp-scope.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-mvp-scope.md) — scope V2.0 vs V2.1
- [v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md) — strategie d'audit et guides de verification par lot

Il repond a la question suivante:

Comment faire fonctionner correctement, de maniere fiable et tres qualitative, les systemes vivants autour du plan V2:

- machine momentum
- coaching interventions
- memoire
- bilan quotidien
- weekly bilan
- morning nudges
- rendez-vous et interventions proactives

Le but n'est pas seulement d'avoir "des briques qui marchent". Le but est d'obtenir un systeme:

- fiable
- pertinent
- fluide
- peu robotique
- capable de surprise utile
- defendable techniquement
- auditable

## 1. Idee directrice

La V2 change le coeur du produit:

- l'utilisateur part d'un texte libre
- le systeme structure en transformations
- chaque transformation a son propre plan
- le plan n'est plus un enchainement de phases
- le plan est structure en `support`, `missions`, `habits`
- la progression se fait par traction reelle et debloquage conditionnel

Donc les systemes vivants ne doivent plus etre penses comme des "couches autour d'un plan statique".
Ils doivent devenir des systemes d'orchestration qui repondent a 4 questions permanentes:

1. `Ou en est reellement la personne ?`
2. `Qu'est-ce qui est faisable maintenant ?`
3. `Qu'est-ce qu'il faut activer, alleger, soutenir ou differer ?`
4. `Comment rester humain, utile et non intrusif ?`

## 2. Regle d'architecture generale

La meilleure architecture V2 est la suivante:

- `onboarding` produit une structure claire
- `plan` fournit les items et les regles de debloquage
- `momentum` estime l'etat executionnel et relationnel du user
- `coaching` propose des interventions concretes quand un vrai blocage apparait
- `memory` assure la continuite et evite la repetitivite
- `daily/weekly` servent d'interfaces de recalibration
- `nudges/outreach/rendez-vous` sont des manifestations ponctuelles de cette orchestration

Autrement dit:

- le `plan` dit ce qui compte
- le `momentum` dit ce qui est possible
- le `coaching` dit quoi faire face au blocage
- la `memoire` dit ce qu'il faut se rappeler
- les `bilans` disent comment ajuster
- les `nudges` disent comment contacter

## 3. Ce qu'il faut absolument conserver de l'existant

Il ne faut pas jeter tout le systeme actuel. Plusieurs briques sont deja tres bonnes et doivent etre conservees conceptuellement.

### A garder

- la discipline d'observabilite et d'audit
- la logique de `momentum_state` basee sur des dimensions explicites
- le gate `momentum` avant les interventions proactives
- la memoire de blockers par action/technique
- la distinction entre message conversationnel, trigger systeme, decision proactive, reaction utilisateur
- les bundles d'audit momentum / coaching / memory
- l'idee de `memory_plan` et `surface_plan`
- l'existence de `event memory`

### A refondre

- la dependance aux `phases`
- la dependance a la separation dure `actions/frameworks/vital_signs`
- la logique des bilans basee sur `phase actuelle / phase suivante`
- le morning nudge base sur des listes d'items trop mecaniques
- le weekly comme simple review d'avancement

### A supprimer comme primitives V2

- `current_phase` comme colonne vertebrale
- le raisonnement "ouvrir la phase suivante"
- la logique d'un systeme qui pousse les memes gestes sans lire la semaine reelle

## 4. Regle produit majeure

Le systeme vivant V2 doit etre pilote par `transformation active + plan actif + charge active`, et non plus simplement par "ce qu'il y a dans le plan".

La vraie question n'est pas:

- "Quelles actions existent ?"

La vraie question est:

- "Parmi ce qui existe, qu'est-ce qui est vivant maintenant ?"

Donc toutes les briques aval doivent raisonner a partir de:

- `cycle actif`
- `transformation active`
- `plan actif`
- `items actuellement recommandes`
- `items actuellement en maintenance`
- `items en attente de debloquage`
- `charge reelle`
- `etat momentum`
- `memoire recente`

## 5. Modele cible pour les systemes vivants

### 5.1 Entites runtime a considerer

Pour que le systeme soit fiable, les systemes vivants doivent tous lire le meme socle runtime:

- `cycle`
- `transformation`
- `plan`
- `plan_items`
- `momentum_state`
- `coaching_memory`
- `memory_context`
- `conversation_pulse`

### 5.2 `conversation_pulse`

Je recommande fortement d'introduire une entite logique, meme si elle n'est pas d'abord une table separee.

Le `conversation_pulse` est un resume court et vivant des 7 derniers jours, mis a jour regulierement.

Il doit contenir:

- tonalite dominante
- signes de traction
- signes de surcharge
- signaux de consentement
- moments de fierte / soulagement
- blocage le plus reel
- evolution de la semaine
- evenements a venir importants

Ce `conversation_pulse` devient extremement utile pour:

- morning nudges
- outreach
- weekly bilan
- rendez-vous intelligents
- ton non robotique

## 6. Machine Momentum V2

## 6.1 Raison d'etre

La machine momentum ne doit pas devenir un simple "thermometre emotionnel".
Elle doit devenir le systeme central de faisabilite.

Elle doit repondre a:

- la personne est-elle disponible pour etre poussee ?
- le plan est-il trop lourd ou bien dose ?
- la traction actuelle est-elle reelle ou apparente ?
- faut-il activer, alleger, soutenir ou ouvrir une porte ?

## 6.2 Ce qu'il faut garder

Je garderais les grands etats actuels car ils sont deja lisibles et utiles:

- `momentum`
- `friction_legere`
- `evitement`
- `pause_consentie`
- `soutien_emotionnel`
- `reactivation`

Je ne recommande pas d'exploser tout de suite le nombre d'etats.
Pour la fiabilite, il vaut mieux garder peu d'etats publics et enrichir les sous-signaux.

## 6.3 Ce qu'il faut ajouter

Le momentum V2 doit lire des dimensions plus proches du plan V2.

Je recommande 6 dimensions internes:

- `engagement`
- `execution_traction`
- `emotional_load`
- `consent`
- `plan_fit`
- `load_balance`

### Definitions

- `engagement`
  - qualite et frequence du lien conversationnel
- `execution_traction`
  - evidence reelle de progression sur les items actifs
- `emotional_load`
  - charge interne detectee dans les messages et bilans
- `consent`
  - ouverture ou fermeture a la relation proactive
- `plan_fit`
  - adequation entre le plan actif et la situation reelle du user
- `load_balance`
  - surcharge ou sous-activation entre support / missions / habits

## 6.4 Pourquoi `plan_fit` et `load_balance` sont critiques

Dans la V2, beaucoup d'echecs ne viendront pas d'un manque de volonte.
Ils viendront d'un mauvais calibrage de ce qui est actif.

Exemples:

- trop de missions en meme temps
- habitudes encore fragiles mais nouvelles couches activees trop vite
- support utile non utilise
- trop peu de support pour une mission emotionnellement couteuse

Sans `plan_fit` et `load_balance`, la machine momentum risque d'accuser le user alors que le systeme est mal dose.

## 6.5 Regle canonique

La machine momentum V2 doit pouvoir conclure:

- `l'utilisateur est en friction`
- mais aussi
- `le plan est peut-etre trop charge`

Cette distinction est fondamentale pour la qualite produit.

## 6.6 Inputs canoniques de la machine momentum

Elle doit agreger:

- messages user recents
- reponses assistant recentes
- logs sur plan items
- bilans quotidiens
- weekly outcomes
- blockers memorises
- supports utilises ou ignores
- habitudes en `active_building` ou `in_maintenance`
- ecarts entre charge recommandee et charge active reelle
- proximite d'un evenement memoire important

## 6.7 Output canonical de la machine momentum

Au minimum:

- `state`
- `dimensions`
- `state_reason`
- `top_blockers`
- `load_assessment`
- `plan_fit_assessment`
- `recommended_posture`

Exemple de `recommended_posture`:

- `push_lightly`
- `simplify`
- `hold`
- `support`
- `reopen_door`
- `reduce_load`

Je recommande d'ajouter cette posture meme si l'etat public ne change pas.
Ca simplifiera beaucoup les decisions downstream.

## 7. Active Load Engine

Le systeme V2 a besoin d'un vrai `active load engine`.

Sans lui:

- le plan devient vite trop lourd
- momentum est injuste
- daily et weekly deviennent flous

## 7.1 Regles canoniques de charge

Je recommande:

- max `1 mission principale` active
- max `1 mission secondaire` active si la charge est soutenable
- max `1 a 2 supports recommended_now`
- max `2 habits` en `active_building`
- les autres habitudes passent en `in_maintenance` ou `pending`

## 7.2 Fonction du moteur de charge

Il doit calculer:

- `current_load_score`
- `dimension_balance_score`
- `unlock_readiness_score`
- `need_reduce`
- `need_consolidate`

Le weekly, le momentum et les nudges doivent tous le lire.

## 7.3 Regle forte

Une baisse d'execution ne doit pas automatiquement produire plus de pression.
Elle doit d'abord verifier:

- est-ce un manque de traction ?
- ou un excès de charge ?

## 8. Bilan Quotidien V2

## 8.1 Role

Le daily bilan ne doit plus etre pense comme un petit questionnaire de suivi generique.

Il doit servir a:

- capter de la preuve executionnelle
- detecter les micro-frictions
- ajuster le plan sans drama
- enrichir le momentum
- alimenter le coaching si un blocage se repete

## 8.2 Structure recommandee

Le daily doit etre court et variable.

Il doit interroger en priorite:

- la mission active
- l'habitude la plus fragile
- le support recommande si pertinent

Et pas tout le plan.

## 8.3 Logique de questionnement

Le daily doit d'abord choisir son mode:

- `check_light`
- `check_supportive`
- `check_blocker`
- `check_progress`

### `check_light`

Pour les jours ou l'essentiel est juste de garder le lien et la preuve minimale.

### `check_supportive`

Quand la charge emotionnelle ou la fragilite est plus elevee.

### `check_blocker`

Quand un meme item coince plusieurs fois et qu'on a besoin d'un signal plus clair.

### `check_progress`

Quand on veut verifier si un debloquage devient possible.

## 8.4 Daily ideal

Le meilleur daily est:

- tres court
- tres concret
- lie au vivant
- jamais mecanique

Il ne doit pas demander "tout va bien ?" ou "as-tu fait tes actions ?" de maniere plate.

Il doit plutot formuler:

- le geste du jour
- le point de friction
- la preuve d'ancrage
- ou la mise en pause legitime

## 8.5 Ce que le daily doit produire

Au minimum:

- `item progress evidence`
- `felt difficulty`
- `blocker hint`
- `support usefulness`
- `consent signal`

## 9. Habitudes V2

## 9.1 Regle majeure

Les habitudes ne doivent pas etre traitees comme des taches binaires finies.

Je recommande 3 etats metier principaux:

- `active_building`
- `in_maintenance`
- `stalled`

## 9.2 Debloquage

La regle canonique V1 reste:

- `3 reussites sur 5 opportunites pertinentes`

Cette formulation est meilleure que `3 jours d'affilee` car:

- elle est moins punitive
- elle marche pour des habitudes non quotidiennes
- elle mesure mieux la traction reelle

## 9.3 Maintenance

Une habitude qui passe en `in_maintenance`:

- ne bloque plus la suite
- ne disparait pas
- ne doit plus monopoliser l'attention

Le daily ne doit l'interroger qu'episodiquement.
Le weekly peut la revisiter si elle redescend.

## 10. Weekly Bilan V2

## 10.1 Role

Le weekly n'est plus une revue de phase.
C'est une revue de calibrage.

Il doit aider a decider:

- `hold`
- `expand`
- `consolidate`
- `reduce`

## 10.2 Questions auxquelles il doit repondre

- Qu'est-ce qui a vraiment avance ?
- Qu'est-ce qui a coince ?
- Qu'est-ce qui a aide ?
- Qu'est-ce qui fatigue trop ?
- Qu'est-ce qui peut maintenant etre debloque ?
- Qu'est-ce qui doit rester en maintenance ?

## 10.3 Ce qu'il doit lire

Le weekly doit lire:

- traction par dimension
- blockers recurrent
- supports utiles ou ignores
- habitudes en construction
- micro-signaux de consentement
- charge conversationnelle
- conversation_pulse de la semaine

## 10.4 Ce qu'il doit pouvoir faire

Le weekly V2 doit pouvoir:

- recommander un allegement
- recommander une consolidation
- recommander un nouvel item debloquable
- faire remonter un support manquant
- proposer un changement de posture
- identifier qu'un item doit etre remplace

## 10.5 Sorties canoniques

Je recommande explicitement:

- `hold`
- `expand`
- `consolidate`
- `reduce`

### `hold`

On maintient le calibrage actuel.

### `expand`

La traction est suffisante pour ouvrir un nouvel item.

### `consolidate`

On ne rajoute rien. On stabilise ce qui a commence.

### `reduce`

Le systeme estime que la charge est trop haute ou mal ajustee.

## 10.6 Weekly conversationnel

Le weekly doit etre plus intelligent que "on fait le point".

Il doit savoir:

- celebrer sobrement
- nommer la vraie friction
- retenir ce qui aide reellement
- proposer peu de changements mais les bons

Donc le weekly V2 est un outil de decision, pas juste un recap.

## 11. Morning Nudges V2

## 11.1 Ce qu'il faut garder

Il faut conserver:

- le gate momentum
- le respect du consentement
- le blocage des nudges en cas de `pause_consentie`
- la transformation en soutien en cas de charge emotionnelle haute

## 11.2 Ce qui doit changer

Le morning nudge ne doit plus etre principalement "voici tes items du jour".

Il doit etre un contact tres leger, contextualise, et choisi parmi plusieurs postures.

## 11.2bis Aller plus loin: passer d'un "morning nudge" a un `proactive windows engine`

Je pense que c'est mieux que de raisonner uniquement en "morning nudge".

Le meilleur systeme est:

- un moteur de `fenetres proactives`
- dont le `morning` n'est qu'un cas

Mais il ne faut pas comprendre ce moteur comme une nouvelle couche parallele aux checkins existants.

La bonne articulation est:

- le `watcher` observe et consolide
- le `proactive windows engine` decide
- `scheduled_checkins` et `process-checkins` executent

Autrement dit:

- le `watcher` detecte qu'un moment peut etre pertinent
- le `proactive windows engine` tranche s'il faut creer, transformer, deplacer ou annuler une fenetre proactive
- le rail `scheduled_checkins` porte l'envoi concret quand un contact doit etre programme

Donc le `proactive windows engine` ne remplace pas completement les checkins existants.
Il devient plutot la couche de decision au-dessus d'eux.

Fenetres recommandees:

- `morning_presence`
- `pre_event_grounding`
- `midday_rescue`
- `evening_reflection_light`
- `reactivation_window`

### Pourquoi c'est meilleur

Parce qu'un bon contact n'est pas toujours meilleur le matin.

Exemples:

- avant un rendez-vous important, le meilleur moment est souvent `avant evenement`
- en cas de craving recurrent, un `midday_rescue` peut etre plus utile qu'un morning
- apres une journee rude, un `evening_reflection_light` peut mieux proteger le lien

Donc:

- `morning_nudge` reste une surface importante
- mais l'architecture cible devrait etre un `proactive windows engine`
- et ce moteur doit reutiliser le rail `scheduled_checkins/process-checkins` au lieu d'introduire un systeme concurrent

## 11.2ter Positionnement exact par rapport a l'existant

Pour eviter la duplication conceptuelle, je recommande de positionner les briques comme suit:

### `watcher`

Role:

- observer asynchronement
- consolider des signaux faibles
- alimenter momentum, memory, event memory et conversation_pulse

Le `watcher` ne doit pas devenir le systeme de delivery.

### `proactive windows engine`

Role:

- moteur de decision proactive
- determine `si`, `quand`, `pourquoi` et `sous quelle posture` un contact doit exister

Il peut conclure:

- `create_window`
- `reschedule_window`
- `cancel_window`
- `downgrade_to_soft_presence`
- `skip`

### `scheduled_checkins`

Role:

- couche de planification concrète
- porte les fenetres decidees par le moteur
- reste la file d'execution temporelle

### `process-checkins`

Role:

- couche d'execution/delivery
- applique les gates finaux
- envoie, differe, annule ou journalise

### Consequence architecturale

Le bon modele n'est donc pas:

- `watcher` d'un cote
- `checkins` d'un cote
- `proactive windows engine` encore a cote

Le bon modele est:

- `watcher` comme couche d'observation
- `proactive windows engine` comme couche de decision
- `scheduled_checkins/process-checkins` comme couche d'orchestration et d'envoi

## 11.3 Postures recommandees

Je recommande ces families:

- `focus_today`
- `simplify_today`
- `support_softly`
- `open_door`
- `protective_pause`
- `celebration_ping`
- `pre_event_grounding`

### Nouvelles postures interessantes

#### `celebration_ping`

Petit message qui reconnait un acquis recent ou une traction reelle.

Tres utile pour:

- casser la sensation robotique
- renforcer l'energie
- montrer que Sophia remarque le positif

#### `pre_event_grounding`

Quand un evenement memoire important approche:

- rendez-vous medical
- discussion difficile
- deadline sensible
- contexte de tentation connu

Le message sert a preparer, pas a pousser une action generique.

#### `protective_pause`

Quand la meilleure intervention du matin est de ne pas piloter.
Ce n'est pas un non-message. C'est un message de protection du lien, tres sobre, ou parfois un vrai skip.

## 11.4 Regle d'or du morning

Le morning nudge doit repondre a:

- "Quel est le meilleur type de presence ce matin ?"

Pas seulement a:

- "Quel item rappeler ?"

## 11.5 Pour qu'il soit moins robotique

Il faut injecter dans sa decision:

- momentum state
- active load
- top blocker
- conversation_pulse
- event memory proche
- dernier type de nudge envoye
- reponse utilisateur aux precedents nudges

Il faut aussi limiter les repetitions de posture.

Je recommande:

- pas plus de `2` morning nudges consecutifs dans la meme posture
- pas de rappel brut d'item 3 jours d'affilee
- si un nudge n'a produit aucun echo plusieurs fois, changer de posture ou se taire

## 11.6 Surprise utile

La surprise ne doit pas etre du hasard cosmetique.

Elle doit venir de:

- la justesse du moment
- la memoire d'un detail humain
- une celebration inattendue mais legitime
- une reformulation tres ajustee

Exemples:

- rappeler un petit cap en s'appuyant sur une victoire recente
- envoyer un pre-event grounding la veille d'un vrai moment sensible
- faire un message tres doux au lieu d'un rappel quand la semaine a ete rude

## 12. Coaching Interventions V2

## 12.1 Role

Le coaching n'est pas le plan.
Le coaching est la reponse concrete a un blocage vivant.

Il doit rester:

- rare
- concret
- adapte
- suivi dans le temps

## 12.2 Ce qu'il faut garder

L'existant est deja bon sur plusieurs points:

- registre de blockers
- registre de techniques
- gate via momentum
- memoire des techniques essayees
- suivi utile ou non

## 12.3 Ce qu'il faut ajouter

Le coaching V2 doit etre `dimension-aware`.

Ca veut dire qu'il doit savoir si le blocage touche:

- une `mission`
- une `habit`
- un `support`

Et la reponse doit changer selon le type d'item.

### Exemple

- sur une mission: clarifier, reduire, pre-engager, decouper
- sur une habitude: reduire la friction, soutenir la repetition, proteger l'opportunite
- sur un support: verifier son utilite, son timing, ou son mode d'acces

## 12.4 Deux niveaux de coaching

Je recommande de distinguer:

- `micro-coaching`
- `structural coaching`

### `micro-coaching`

Intervention tres courte pour debloquer un geste proche.

### `structural coaching`

Intervention plus metta sur:

- charge trop haute
- mauvais support
- mauvaise formulation de l'item
- besoin de pivoter une habitude

Le weekly peut faire du `structural coaching`.
Le compagnon quotidien doit surtout faire du `micro-coaching`.

## 12.5 Critere de qualite

Un bon coaching V2:

- detecte le bon blocage
- choisit peu de techniques
- ne repropose pas vite une technique inefficace
- sait aussi conclure que `le plan doit etre simplifie`

Point essentiel:

Parfois la meilleure intervention coach n'est pas une technique.
C'est:

- reduire la charge
- retirer une mission secondaire
- basculer une habitude en maintenance

## 13. Memoire V2

## 13.1 Problematique

Avec la V2, la memoire ne peut plus etre un simple reservoir conversationnel.
Elle doit soutenir une transformation dans le temps.

## 13.2 Couches memoire recommandees

Je recommande 6 couches:

- `cycle memory`
- `transformation memory`
- `execution memory`
- `coaching memory`
- `relational memory`
- `event memory`

### `cycle memory`

Ce qui vaut pour l'ensemble du cycle:

- North Star
- grands enjeux
- contexte global
- priorites
- sujets deferes

### `transformation memory`

Ce qui vaut pour une transformation precise:

- synthese interne
- synthese user-ready
- questionnaire answers
- contraintes reelles
- definition de reussite

### `execution memory`

Ce qui evolue dans le plan vivant:

- items debloques
- items actifs
- habitudes en maintenance
- supports utiles
- friction recurrente

### `coaching memory`

- blockers recurrent
- techniques essayees
- techniques utiles / non utiles
- formulations qui marchent

### `relational memory`

- style de soutien prefere
- tolerance a la pression
- signaux de fermeture
- styles de formulation qui rassurent ou irritent

### `event memory`

- rendez-vous
- epreuves a venir
- contextes sensibles
- dates importantes

## 13.3 Mapping des couches sur les tables existantes

Les tables memoire V1 sont reutilisees en V2. Ce qui change, c'est le tagging et le retrieval, pas le stockage.

| Couche V2 | Table(s) existante(s) | Adaptation V2 |
|---|---|---|
| `cycle memory` | `user_global_memories` | tagger avec `scope=cycle`, `cycle_id` |
| `transformation memory` | `user_global_memories` | tagger avec `scope=transformation`, `transformation_id` |
| `execution memory` | `user_topic_memories` | tagger avec `transformation_id`, enrichir avec `plan_item_id` si pertinent |
| `coaching memory` | `user_chat_states.temp_memory` (coaching history existant) | garder tel quel, deja bien structure |
| `relational memory` | `user_core_identity` + `user_global_memories` | les preferences relationnelles vont dans `user_core_identity`, les patterns observes dans globals avec `scope=relational` |
| `event memory` | `user_event_memories` | garder tel quel, deja bien structure |

### Regle V2.0

Les tables memoire restent V1. Seuls le tagging (`scope`, `cycle_id`, `transformation_id`) et le retrieval changent. Pas de migration de schema memoire en V2.0.

## 13.4 Contrats de retrieval par intention

Le systeme ne doit pas tout charger. Il doit charger selon l'intention.

5 intentions runtime, chacune avec un sous-ensemble different:

### `answer_user_now`

Contexte: reponse immediate en conversation.

Couches lues:
- `cycle memory` (North Star, enjeux globaux)
- `transformation memory` (synthese, contraintes)
- `execution memory` (items actifs, friction recente)
- `coaching memory` (techniques en cours)
- `relational memory` (ton, preferences)
- `event memory` (evenements proches)

Budget: complet, c'est l'intention la plus riche. Budget tokens adapte au `memory_mode` du dispatcher.

### `nudge_decision`

Contexte: decision de morning nudge ou proactive.

Couches lues:
- `execution memory` (items actifs, friction recente)
- `relational memory` (tolerance a la pression, signaux de fermeture)
- `event memory` (evenements proches)
- `coaching memory` (dernier blocker connu)

Budget: leger. Le nudge doit decider vite, pas charger un dossier.

### `daily_bilan`

Contexte: decision de mode et cibles du daily.

Couches lues:
- `execution memory` (items actifs, derniere difficulte)
- `coaching memory` (blocker actif)
- `event memory` (evenement du jour)

Budget: minimal. Le daily doit rester ultra-court.

### `weekly_bilan`

Contexte: recalibrage hebdomadaire.

Couches lues:
- `cycle memory` (North Star, enjeux)
- `transformation memory` (contraintes, definition de reussite)
- `execution memory` (traction par item, supports utiles)
- `coaching memory` (techniques efficaces / inefficaces)
- `event memory` (evenements de la semaine)

Budget: moyen. Le weekly doit etre informe mais pas noye.

### `rendez_vous_or_outreach`

Contexte: decision de rendez-vous ou outreach cible.

Couches lues:
- `event memory` (evenement declencheur)
- `relational memory` (preferences de contact)
- `execution memory` (item concerne si applicable)

Budget: cible. Seulement ce qui justifie le contact.

### Regle

Le retrieval ne charge jamais toutes les couches. Il charge seulement celles de l'intention active. C'est un invariant technique (voir [v2-technical-schema.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md) section 8.7).

Les definitions de types completes sont dans [v2-technical-schema.md section 5.7](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md).

## 13.5 Adaptation du memorizer

Le memorizer existant doit etre adapte pour V2:

### Tagging par couche

Quand le memorizer persiste un fait, il doit determiner a quelle couche il appartient:

- fait qui concerne l'ensemble du cycle (ex: "je veux retrouver confiance en moi") → `scope=cycle`
- fait qui concerne une transformation precise (ex: "mon plus gros frein c'est la fatigue du soir") → `scope=transformation`
- fait d'execution (ex: "la coherence cardiaque m'aide vraiment le matin") → topic memory avec `transformation_id`
- fait relationnel (ex: "je prefere les messages courts") → `scope=relational`

### Regle de tagging

- par defaut, un fait est `scope=transformation` (le cas le plus frequent)
- les faits qui transcendent une transformation sont `scope=cycle`
- les faits sur les preferences de la personne sont `scope=relational`
- en cas de doute, `scope=transformation` est le choix le plus sur

### Ce qui ne change pas

- le pattern `memory_plan` / `surface_plan` du dispatcher reste
- les mecanismes d'extraction, validation, persistence restent
- l'architecture event_memory reste
- la compaction des globals reste

## 13.6 Regles de handoff memoire

Quand une transformation se termine et qu'on passe a la suivante:

### Ce qui migre

- `cycle memory` → reste accessible (c'est cycle-level)
- `coaching memory` → les techniques efficaces/inefficaces sont portees dans le `handoff_payload`
- `relational memory` → reste accessible (c'est user-level)
- `event memory` → reste accessible

### Ce qui reste local

- `transformation memory` → reste attachee a la transformation terminee, consultable mais plus injectee par defaut
- `execution memory` → reste attachee a la transformation terminee

### Ce qui est resume

- le `handoff_payload` (voir onboarding-v2-canonique.md) capture: wins, supports a garder, habits en maintenance, techniques echouees, signaux relationnels

### Regle

Le handoff ne copie pas la memoire. Il la resume et la porte. La memoire detaillee de la transformation precedente reste consultable si besoin mais n'est pas chargee par defaut.

## 13.7 Regle d'anti-bruit

Le systeme memoire V2 doit privilegier:

- stabilite
- reutilisabilite
- specificite utile

Et penaliser:

- les micro-variations sans valeur
- les reformulations cosmetiques
- le sur-stockage de petits etats passagers

## 13.8 Ce qu'il faut absolument memoriser

Je recommande de considerer comme prioritaires:

- les blockers qui se repetent
- les techniques qui aident vraiment
- les modes de soutien preferes
- les sujets reportes dans `Pour plus tard`
- les evenements futurs importants
- les succes qui ont demande un vrai effort

Les succes sont importants. Sinon la machine devient trop focalisee sur les problemes.

## 14. Analyse conversationnelle de semaine

## 14.1 Oui, il faut la faire

Je pense que c'est une tres bonne idee d'analyser la conversation de la semaine.
Pas pour faire un resume gadget.
Pour alimenter l'orchestration.

## 14.2 Ce que doit produire cette analyse

Je recommande un `weekly conversation digest` avec:

- tonalite dominante
- meilleurs moments de traction
- moments de fermeture ou fatigue
- blocage le plus reel
- soutien qui a aide
- risque principal de la semaine suivante
- evenement / rendez-vous proche
- opportunite relationnelle

## 14.3 A quoi il sert

Il peut alimenter:

- weekly bilan
- morning nudges des jours suivants
- outreach de reprise
- proposition de rendez-vous
- recalibrage momentum

## 14.4 Proposition de `rendez-vous`

Je recommande d'introduire un concept leger de `rendez-vous`, mais pas comme une mecanique lourde.

Un `rendez-vous` est un point de contact intentionnel, contextualise, et lie a un moment precis.

Exemples:

- avant un moment sensible
- apres une semaine dure
- veille d'une mission exposee
- reprise d'une transformation suivante
- sortie d'evitement

## 14.5 Regle

Le systeme ne doit pas proposer un rendez-vous par routine.
Il doit le faire quand il y a une vraie raison.

Je recommande de ne proposer un rendez-vous que si au moins une de ces conditions est vraie:

- evenement important detecte
- blocage saillant persistant
- semaine emotionnellement chargee
- grande mission a venir
- transition de transformation

## 14.6 Forme ideale

Le rendez-vous doit ressembler a:

- une proposition sobre
- un moment pour faire le point
- une preparation courte
- un ton humain

Pas a:

- une convocation
- un rituel systematique
- une feature rigide

## 15. Comment rendre l'experience moins robotique

Le risque numero un de ce genre de systeme est de devenir predictible.

Pour l'eviter, il faut travailler 5 choses.

### 15.1 Variabilite de posture, pas de template

Le systeme doit varier:

- le type d'intervention
- le ton
- l'angle

Mais a partir d'une posture claire, pas d'un random de surface.

### 15.2 Memoire des choses qui ont compte

Le systeme doit se souvenir:

- d'une victoire importante
- d'un blocage qui revient
- d'un evenement proche
- d'une formulation qui a deja aide

La sensation "Sophia se souvient" cree beaucoup plus de naturel que la simple variation de wording.

### 15.3 Surprise meritee

Je recommande d'introduire de petites surprises seulement quand elles sont fondees.

Exemples:

- reconnaitre une progression a laquelle l'utilisateur ne s'attend pas
- rappeler un detail significatif
- proposer un support au bon moment sans qu'il ait ete explicitement demande

### 15.4 Droit au silence

Un systeme non robotique sait aussi:

- ne pas envoyer de nudge
- ne pas demander un bilan
- ne pas pousser un conseil

Le silence pertinent fait partie de l'intelligence produit.

### 15.5 Micro-rituels, pas routines lourdes

Le produit peut avoir des micro-rituels:

- morning touch tres simple
- weekly recap
- pre-event grounding

Mais ils doivent rester:

- legers
- variables
- sensibles au contexte

## 16. Fiabilite et auditabilite

Si on veut un systeme tres intelligent, il faut aussi qu'il soit tres explicable.

Je recommande que chaque decision proactive importante logge:

- son type
- ses inputs
- son gate
- sa raison
- son contexte source
- son outcome

## 16.1 A auditer systematiquement

- transitions momentum
- blocages daily/weekly
- morning nudges envoyes / skips
- outreach programmes / annules / replies
- coaching interventions proposes / rendues / suivies
- retrieval memoire utilise
- suggestions weekly retenues ou non

## 16.2 Regle implementation

Toute nouvelle intelligence V2 doit etre:

- observable
- testable
- auditable

Sinon elle ne doit pas entrer en prod.

## 16.3 Regle de budget proactif

Pour rester smooth et non robotique, il faut aussi un budget proactif.

Je recommande de distinguer:

- `silent`
- `light`
- `notable`

Avec la logique suivante:

- `silent` = pas de sollicitation user-facing reelle
- `light` = presence legere, peu engageante
- `notable` = contact qui demande une vraie attention

Je recommande ensuite:

- max `1` intervention proactive notable par jour par defaut
- pas de cumul `morning + outreach + rendez-vous` le meme jour sauf raison forte
- en cas de semaine chargee, preferer moins d'interventions mais mieux ciblees

Le meilleur systeme n'est pas celui qui parle souvent.
C'est celui qui parle juste.

## 17. Mapping implementation avec l'existant

Cette section sert a raccorder la V2 a ce qui existe deja.

### 17.1 Momentum

Fichiers existants a reutiliser/refondre:

- `supabase/functions/sophia-brain/momentum_state.ts`
- `supabase/functions/sophia-brain/momentum_policy.ts`
- `supabase/functions/sophia-brain/momentum_proactive_selector.ts`
- `supabase/functions/sophia-brain/momentum_morning_nudge.ts`
- `supabase/functions/sophia-brain/momentum_outreach.ts`

Direction:

- garder la structure d'etat et les etats publics
- enrichir les dimensions et metrics avec `plan_fit` et `load_balance`
- remplacer les inputs centres `actions/frameworks/vitals` par une vue unifiee `plan_items runtime`
- faire lire a `momentum_morning_nudge.ts` un `conversation_pulse` et une vue `active_load`
- faire converger les decisions `morning_nudge` dans le futur `proactive windows engine`

### 17.2 Coaching

Fichiers existants a reutiliser/refondre:

- `supabase/functions/sophia-brain/coaching_interventions.ts`
- `supabase/functions/sophia-brain/coaching_intervention_selector.ts`
- `supabase/functions/sophia-brain/coaching_intervention_tracking.ts`
- `supabase/functions/sophia-brain/coaching_intervention_observability.ts`

Direction:

- garder le registre de techniques
- ajouter une lecture `dimension + kind` sur l'item bloque
- distinguer `micro-coaching` et `structural coaching`
- garder le tracking des techniques utiles/non utiles

### 17.3 Memoire

Fichiers existants a reutiliser/refondre:

- `supabase/functions/sophia-brain/router/dispatcher.ts`
- `supabase/functions/sophia-brain/router/run.ts`
- `supabase/functions/sophia-brain/event_memory.ts`
- `supabase/functions/sophia-brain/topic_memory.ts`
- `supabase/functions/sophia-brain/global_memory.ts`
- `supabase/functions/sophia-brain/architect_memory.ts`

Direction:

- garder le pattern `memory_plan` / `surface_plan`
- specialiser les intentions runtime V2
- ajouter une couche `cycle/transformation/execution` plus nette
- faire de `event_memory.ts` une brique centrale des `pre_event_grounding` et `rendez-vous`

### 17.4 Weekly

Fichiers existants a reutiliser/refondre:

- `supabase/functions/sophia-brain/agents/investigator-weekly/*`
- `trigger-weekly-bilan/payload.ts`

Direction:

- sortir du modele `activate/deactivate/swap` centre uniquement sur les actions
- raisonner en `hold / expand / consolidate / reduce`
- faire lire le weekly a travers `dimensions + active load + conversation_pulse`

### 17.4bis Watcher / Checkins / proactive delivery

Fichiers existants a reutiliser/refondre:

- `supabase/functions/trigger-watcher-batch/index.ts`
- `supabase/functions/schedule-recurring-checkins/index.ts`
- `supabase/functions/process-checkins/index.ts`
- `supabase/functions/trigger-daily-bilan/index.ts`

Direction:

- garder `trigger-watcher-batch` comme moteur d'observation asynchrone
- ne pas lui confier la logique complete de decision proactive
- faire des `scheduled_checkins` le rail canonique de livraison des fenetres proactives
- faire de `process-checkins` le point d'application final des gates, des defer, des annulations et de l'observabilite delivery
- faire emerger un `proactive windows engine` qui centralise les decisions aujourd'hui dispersees entre morning nudge, outreach, recurring reminders et events

### 17.5 State manager / dashboard glue

Fichiers existants a reutiliser/refondre:

- `supabase/functions/sophia-brain/state-manager.ts`
- `frontend/src/pages/Dashboard.tsx`
- la couche dashboard qui lit les plans/actions/frameworks/north stars

Direction:

- enlever les hypotheses `current_phase`
- remplacer les vues separees par une vue runtime `transformation / dimensions / active load / metrics`
- garder la North Star mais la repositionner au niveau cycle

## 18. Strategy implementation recommandee

Je recommande un deploiement en 4 couches.

### Couche 1 - Runtime commun V2

Construire d'abord le socle:

- `cycle_id`
- `transformation_id`
- `plan_id`
- `plan_item runtime view`
- `active load engine`
- `conversation_pulse`

Sans ce socle, les autres briques risquent de diverger.

### Couche 2 - Momentum + Bilans

Ensuite:

- refonte `momentum_state`
- refonte du daily
- refonte du weekly

Parce que ce sont les briques qui regalent le reste.

### Couche 3 - Coaching + Memory

Puis:

- coaching dimension-aware
- retrieval memoire specialise par intention
- digestion conversationnelle hebdo

### Couche 4 - Nudges + Rendez-vous + surprise engine

Enfin:

- morning nudges V2
- proactive windows engine
- outreach V2
- rendez-vous intelligents
- regles de variabilite et anti-robotisme

## 19. Keep / Refactor / Delete

### Keep

- observability momentum/coaching/memory
- audit bundles existants
- logique de state gate avant proactive
- event memory
- technique history coaching

### Refactor

- `supabase/functions/sophia-brain/momentum_state.ts`
- `supabase/functions/sophia-brain/momentum_morning_nudge.ts`
- `supabase/functions/sophia-brain/momentum_proactive_selector.ts`
- couche weekly investigator
- retrieval memory par intention
- integration dashboard et bilans avec `plan_items`

### Delete or deprecate

- dependance a `current_phase`
- suggestions weekly centrees phase/action uniquement
- nudges trop bases sur listes d'items
- logique aval qui suppose `user_actions + frameworks + vitals` comme grille principale

## 20. Decision finale

La meilleure direction V2 n'est pas de rendre chaque sous-systeme plus complexe independamment.
La meilleure direction est:

- un socle runtime unique
- un momentum plus juste
- des bilans plus calibres
- une memoire mieux structuree
- un coaching plus concret
- des nudges plus contextuels
- des rendez-vous plus intentionnels

Et surtout:

- plus de silence quand il faut
- plus de soutien quand c'est le bon moment
- plus de precision quand l'utilisateur est disponible

Le systeme doit donner l'impression suivante:

- "Sophia comprend ou j'en suis"
- "elle ne pousse pas au mauvais moment"
- "elle m'aide a debloquer la suite, pas juste a cocher"
- "elle se souvient de ce qui compte"
- "elle ne ressemble pas a une machine qui boucle"

## 21. Priorites a trancher juste apres ce document

Pour passer a la spec technique detaillee, il faut maintenant trancher:

1. la forme exacte du `conversation_pulse`
2. la structure exacte du nouvel `momentum_state`
3. les inputs/sorties canoniques du `daily_bilan_v2`
4. les inputs/sorties canoniques du `weekly_bilan_v2`
5. le modele runtime des `rendez-vous`
6. la politique precise des `morning nudges`
7. la cartographie `keep / refactor / delete` fichier par fichier

## 22. Optimisations finales retenues

Apres revue UX / pertinence / fiabilite, je recommande d'ajouter 6 briques de finesse.

### 22.1 Relation preferences

Il faut introduire une couche explicite de preferences relationnelles.

Elle doit contenir:

- `preferred_contact_windows`
- `disliked_contact_windows`
- `preferred_tone`
- `max_proactive_intensity`
- `preferred_message_length`
- `soft_no_contact_rules`

Exemples:

- prefere ne pas etre sollicite tot le matin
- accepte les messages tres courts mais pas les messages longs
- supporte bien les rappels concrets mais pas les relances trop emotionnelles

Cette couche doit moduler:

- morning nudges
- rendez-vous
- outreach
- style de coaching

### 22.2 Confidence gate

Toute decision proactive V2 doit passer par un `confidence gate`.

Niveaux recommandes:

- `low_confidence`
- `medium_confidence`
- `high_confidence`

Regle:

- `low_confidence` -> `skip` ou `soft_presence_only`
- `medium_confidence` -> posture legere uniquement
- `high_confidence` -> creation ou maintien d'une fenetre proactive possible

### 22.3 Cooldown engine

Il faut un moteur de cooldown transverse.

Il doit eviter:

- meme posture repetee trop souvent
- meme item rappele en boucle
- meme technique coach reproposee trop vite
- trop d'interventions rapprochées

Cooldowns minimum recommandes:

- meme posture proactive: 48h si aucune reaction utile
- meme item rappele explicitement: 72h
- meme technique coach jugee inefficace: 14 jours
- nouveau rendez-vous apres refus explicite: 7 jours minimum

### 22.4 Victory ledger

Il faut une memoire positive canonique.

Le `victory_ledger` doit stocker:

- petites victoires significatives
- reprises apres friction
- habitudes qui commencent a tenir
- missions enfin lancees
- retours coach utiles

Cette brique sert a:

- nourrir `celebration_ping`
- renforcer la precision humaine
- ne pas faire un systeme uniquement centre sur les blocages

### 22.5 Repair mode

Il faut un vrai mode `repair`.

Il s'active quand:

- Sophia a pousse au mauvais moment
- plusieurs nudges restent sans echo
- un refus explicite ou implicite se repete
- le lien devient fragile

Posture:

- pas de pilotage
- pas de conseil concret d'emblee
- reouverture sobre
- validation du rythme
- porte ouverte simple

Source de verite recommandee:

- runtime explicite dans `user_chat_states.temp_memory.__repair_mode_v1`

Le `repair mode` ne doit pas rester un simple effet de posture ou une inference implicite.

Note V2.0: en V2.0, le repair mode formel complet peut etre reporte si `pause_consentie` + cooldowns + posture conservative couvrent le besoin minimal. Mais la cible canonique reste un etat runtime explicite.

### 22.6 Transformation handoff

Le passage entre transformations doit etre une brique explicite.

Le `handoff` doit produire:

- ce qui a vraiment marche
- ce qui reste en maintenance
- ce qui ne marche pas pour cette personne
- ce qu'on garde en memoire pour la transformation suivante

Sans ca, le cycle peut paraitre fragmente.

## 23. Forme exacte du `conversation_pulse`

Le `conversation_pulse` doit etre une synthese courte, stable et exploitable, mise a jour par fenetre glissante.

Je recommande une version courte par defaut, sur 7 jours, avec un sous-resume 72h pour les decisions proactives.
Il ne doit pas devenir une mini memoire riche ni un weekly cache.
Sa fonction canonique est la `decision`, pas l'archivage.

### 23.1 Structure canonique

La definition complete du type `ConversationPulse` est dans [v2-technical-schema.md section 5.2](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md).

Resume: objet court avec `tone`, `trajectory`, `highlights`, `signals`, `evidence_refs`.

### 23.2 Regles de construction

- maximum `1` tonalite dominante
- maximum `3` wins
- maximum `3` friction_points
- maximum `2` supports utiles
- maximum `1` upcoming_event prioritaire
- maximum `1` likely_need

Le `conversation_pulse` ne doit jamais devenir un pavé.

### 23.2bis Version mentale simplifiee

Pour garder un objet tres lisible, il faut pouvoir le resumer mentalement comme:

- `tone`
- `trajectory`
- `top_win`
- `top_friction`
- `best_support_signal`
- `upcoming_event`
- `likely_need`

Si l'objet commence a contenir beaucoup plus, il perd son role.

### 23.3 Usages

- `momentum_state` lit `tone`, `trajectory`, `signals`
- `morning nudges` lisent `likely_need`, `upcoming_event`, `relational_openness`
- `weekly bilan` lit l'ensemble
- `rendez-vous` lit surtout `upcoming_event`, `unresolved_tensions`, `proactive_risk`

## 24. Structure exacte du nouvel `momentum_state`

Je recommande de garder les etats publics existants et d'ajouter une structure interne plus riche.
Point important: il faut separer clairement `ce que le systeme observe` de `ce que le systeme decide`.

### 24.1 Structure canonique

La definition complete du type `MomentumStateV2` est dans [v2-technical-schema.md section 5.3](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md).

Resume: `current_state` (6 etats publics) + `dimensions` (6 axes internes) + `assessment` + `active_load` + `posture` + `blockers` + `memory_links`.

### 24.2 Regles de derivation

- `pause_consentie` ecrase tout
- `soutien_emotionnel` ecrase `friction_legere` et `momentum`
- `repair` n'est pas un etat public, c'est une posture recommandee
- `poor plan_fit` ou `overloaded load_balance` doivent pouvoir tirer vers `simplify` ou `reduce_load` meme si l'engagement reste bon
- `assessment` decrit la meilleure lecture synthesee du moment
- `posture` decrit la meilleure reponse systeme a partir de cette lecture

### 24.3 Decision produit importante

Ne pas multiplier les etats publics.
Multiplier les sous-signaux est plus stable et plus fiable.

## 25. Inputs / sorties canoniques du `daily_bilan_v2`

Le `daily_bilan_v2` doit etre un micro-outil de lecture, pas un formulaire.
Et idealement, il ne doit presque jamais ressembler a un "bilan" du point de vue du user.
Il doit ressembler a un micro check-in naturel.

### 25.1 Inputs

Le daily lit: `cycle_id`, `transformation_id`, `plan_id`, `momentum_state`, `conversation_pulse`, les items actifs avec urgency/fragility scores, et l'historique recent par item.

La definition complete du type `DailyBilanInput` est dans [v2-technical-schema.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md).

### 25.2 Sortie canonique

La definition complete du type `DailyBilanOutput` est dans [v2-technical-schema.md section 5.4](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md).

Resume: `mode` (4 modes) + `target_items` + `prompt_shape` + `expected_capture` + `next_actions`.

### 25.3 Regles

- max `3` questions
- max `2` items cibles
- par defaut: `1` item cible
- la plupart du temps: `1 a 2` questions seulement
- si charge haute -> ton `supportive`
- si plusieurs jours sans reponse -> pas de daily insistant
- si une habitude est en `in_maintenance`, ne pas la demander trop souvent

### 25.4 Formats UX recommandes

Le moteur interne peut garder les 4 modes:

- `check_light`
- `check_supportive`
- `check_blocker`
- `check_progress`

Mais cote user, il vaut mieux penser en formats tres courts:

- `proof_ping`
- `friction_ping`
- `support_ping`
- `unlock_ping`

Exemples:

- `proof_ping` -> verifier une preuve d'avancee simple
- `friction_ping` -> identifier le vrai point dur du jour
- `support_ping` -> verifier si le support aide reellement
- `unlock_ping` -> verifier si un debloquage devient possible

La meilleure experience est:

- tres courte
- tres concrete
- centree sur un seul angle clair
- jamais percue comme un mini questionnaire

## 26. Inputs / sorties canoniques du `weekly_bilan_v2`

Le weekly est un instrument de recalibrage, pas un gros audit.
Du point de vue UX, il doit ressembler a un point intelligent de recalibrage, pas a un rituel lourd.

### 26.1 Inputs

Le weekly lit: `cycle_id`, `transformation_id`, `plan_id`, `momentum_state`, `conversation_pulse`, `active_load`, un snapshot par item (traction, support_value, unlock_candidate), blockers_summary, victory_ledger_entries.

La definition complete du type `WeeklyBilanInput` est dans [v2-technical-schema.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md).

### 26.2 Sortie canonique

La definition complete du type `WeeklyBilanOutput` est dans [v2-technical-schema.md section 5.5](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md).

Resume: `decision` (hold/expand/consolidate/reduce) + `reasoning` + `load_adjustments` (max 3) + `suggested_posture_next_week`.

### 26.3 Regles

- max `3` changements proposes
- si `reduce`, jamais proposer en plus une activation
- si `expand`, il faut au moins un signal de traction solide
- `support_value` faible peut justifier remplacement ou retrait d'un support

### 26.4 Regles UX

Le weekly doit:

- partir du reel avant de proposer
- celebrer sobrement avant de corriger
- retenir peu de choses mais les bonnes
- proposer des ajustements tres lisibles

Il ne doit pas:

- reparcourir tout le plan
- faire un recap exhaustif
- proposer une pluie de changements

### 26.5 Cadre optimal de proposition

Je recommande:

- `1` decision principale
- `0 a 2` ajustements secondaires
- `1` note coach maximum

Le meilleur weekly ressemble a:

- "voila ce qui a compte cette semaine"
- "voila ce qu'on garde"
- "voila ce qu'on ajuste"

Et pas a:

- "voici un rapport complet"

## 27. Modele runtime des `rendez-vous`

Le `rendez-vous` doit etre un objet runtime leger, contextuel et rare.
Il ne doit jamais ressembler a une couche produit lourde ou a un agenda artificiel.

### 27.1 Structure canonique

La definition complete du type `RendezVousRuntime` est dans [v2-technical-schema.md section 5.6](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md).

Resume: `kind` (5 types) + `state` (6 etats) + `trigger_reason` + `confidence` + `posture`.

Note V2.0: le rendez-vous peut etre implemente comme un enrichissement des `scheduled_checkins` existants plutot que comme table dediee. La table `user_rendez_vous` complete peut venir en V2.1 quand le pattern est valide en production.

### 27.2 Regles

- pas de rendez-vous si `confidence=low`
- pas de nouveau rendez-vous si un autre a ete refuse trop recemment
- pas de rendez-vous si un proactive notable a deja eu lieu dans la meme fenetre
- un rendez-vous doit toujours avoir une `trigger_reason` claire

### 27.3 Regle UX

Un `rendez-vous` n'est pas une "feature de meeting".
C'est une intention de contact contextuel.

Donc il doit etre:

- rare
- motive
- simple a comprendre
- facile a ignorer sans friction

### 27.4 Priorite de declenchement

Je recommande cet ordre:

1. `pre_event_grounding`
2. `post_friction_repair`
3. `mission_preparation`
4. `transition_handoff`
5. `weekly_reset`

Pourquoi:

- les evenements reels et la reparation du lien ont plus de valeur que les rituels
- les rendez-vous systematiques sont les plus susceptibles d'avoir l'air robotiques

## 28. Politique precise des `morning nudges`

Je recommande une politique stricte et simple.

### 28.1 Pre-conditions

Un morning nudge ne part que si:

- pas de `pause_consentie`
- pas de `repair` prioritaire
- budget proactif disponible
- pas de cooldown bloqueur
- au moins `medium_confidence`

### 28.2 Ordre de priorite des postures

1. `protective_pause`
2. `support_softly`
3. `pre_event_grounding`
4. `open_door`
5. `simplify_today`
6. `focus_today`
7. `celebration_ping`

### 28.3 Regles de selection

- si charge emotionnelle haute -> `support_softly` ou `protective_pause`
- si evenement important proche -> `pre_event_grounding`
- si reactivation fragile -> `open_door`
- si friction sur item connu -> `simplify_today`
- si bonne traction recente -> `focus_today` ou `celebration_ping`

### 28.4 Regles UX

- 1 idee par message
- ton court
- jamais de multi-consignes
- pas de culpabilisation
- pas de rappel brut repetitif
- si aucun bon angle n'emerge -> `skip`

### 28.5 Optimisation recommandee

Le `morning nudge` ne doit pas etre la posture proactive par defaut.

Le moteur doit d'abord se demander:

- faut-il vraiment parler ce matin ?

Puis seulement:

- si oui, quelle est la meilleure posture ?

Donc la cascade de decision ideale est:

1. `skip_or_speak`
2. `if speak -> choose posture`
3. `if posture chosen -> validate cooldown + confidence`
4. `if validated -> generate one-idea message`

### 28.6 Regle d'elegance

Le meilleur `morning nudge` est souvent celui qui:

- rappelle tres peu
- comprend beaucoup
- et n'exige presque rien

Il faut donc privilegier:

- les formulations qui ouvrent
- les formulations qui allegent
- les formulations qui reconnaissent

Avant:

- les formulations qui pilotent
- les formulations qui enumerent
- les formulations qui rappellent plusieurs choses

## 29. Cartographie `keep / refactor / delete` fichier par fichier

### 29.1 Keep presque tel quel

- `supabase/functions/sophia-brain/momentum_policy.ts`
- `supabase/functions/sophia-brain/coaching_interventions.ts`
- `supabase/functions/sophia-brain/coaching_intervention_tracking.ts`
- `supabase/functions/sophia-brain/coaching_intervention_observability.ts`
- `supabase/functions/sophia-brain/event_memory.ts`
- `supabase/functions/sophia-brain/topic_memory.ts`
- `supabase/functions/sophia-brain/global_memory.ts`
- `supabase/functions/sophia-brain/architect_memory.ts`

### 29.2 Refactor fort

- `supabase/functions/sophia-brain/momentum_state.ts`
- `supabase/functions/sophia-brain/momentum_morning_nudge.ts`
- `supabase/functions/sophia-brain/momentum_outreach.ts`
- `supabase/functions/sophia-brain/momentum_proactive_selector.ts`
- `supabase/functions/sophia-brain/router/dispatcher.ts`
- `supabase/functions/sophia-brain/router/run.ts`
- `supabase/functions/sophia-brain/state-manager.ts`
- `supabase/functions/sophia-brain/agents/investigator-weekly/types.ts`
- `supabase/functions/sophia-brain/agents/investigator-weekly/suggestions.ts`
- `supabase/functions/sophia-brain/agents/investigator-weekly/run.ts`
- `supabase/functions/trigger-daily-bilan/index.ts`
- `supabase/functions/trigger-weekly-bilan/payload.ts`
- `supabase/functions/trigger-weekly-bilan/index.ts`
- `supabase/functions/schedule-recurring-checkins/index.ts`
- `supabase/functions/process-checkins/index.ts`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/hooks/useDashboardData.ts`
- `frontend/src/hooks/useDashboardLogic.ts`
- `frontend/src/lib/planActions.ts`
- `frontend/src/types/dashboard.ts`
- `frontend/src/types/plan.ts`
- `frontend/src/components/dashboard/PlanPhaseBlock.tsx`
- `frontend/src/components/dashboard/PlanActionCard.tsx`
- `frontend/src/components/dashboard/PersonalActionsSection.tsx`
- `frontend/src/components/dashboard/StrategyCard.tsx`
- `frontend/src/components/dashboard/NorthStarSection.tsx`
- `frontend/src/components/dashboard/RemindersSection.tsx`

### 29.3 Delete ou deprecate ciblee

- toute logique runtime basee sur `current_phase`
- suggestions weekly centrees `activate/deactivate/swap` sans lecture dimensionnelle
- toute vue dashboard qui suppose `phases` comme structure primaire
- tout pipeline qui traite `actions/frameworks/vital_signs` comme source canonique au lieu des `plan_items`

## 30. Strategie de migration des state shapes runtime

Les state shapes stockes dans `user_chat_states.temp_memory` (`MomentumStateV2`, `ConversationPulse`, `RepairModeState`) doivent rester evolvables sans batch migration.

### 30.1 Regle canonique

- chaque shape porte un champ `version`
- toute lecture passe par un helper `migrateIfNeeded(payload, currentVersion)`
- la migration se fait lazily au moment du read
- les anciennes versions sont migrees en place (mise a jour du document apres read)
- jamais de batch migration sur toute la table

### 30.2 Cas de migration

- ajout d'un nouveau champ: le helper l'initialise a sa valeur par defaut
- renommage d'un champ: le helper copie l'ancienne cle vers la nouvelle
- suppression d'un champ: le helper le retire au prochain read

### 30.3 Regle de compatibilite

- un shape de version N doit pouvoir etre lu par un code qui attend version N+1
- un shape de version N+1 ne doit jamais casser le code qui attend version N
- en cas de doute, preferer ajouter plutot que renommer

## 31. Decision finale mise a jour

La version optimale du systeme V2 est donc:

- un runtime unifie
- un `conversation_pulse` court et actionnable
- un `momentum_state` riche mais avec peu d'etats publics
- un `daily_bilan_v2` ultra-court et contextuel
- un `weekly_bilan_v2` centre calibrage
- des `rendez-vous` rares mais tres intentionnels
- des `morning nudges` soumis a budget, confiance et cooldown
- une couche relationnelle plus fine avec preferences, repair mode et victoire memoire

Le but final n'est pas que Sophia fasse plus.
Le but final est qu'elle fasse moins, mais beaucoup mieux.
