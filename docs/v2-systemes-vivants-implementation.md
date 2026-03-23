# Systemes Vivants V2 - Implementation Canonique

## Statut

Document de cadrage implementation/systeme pour la V2.

Il complete [onboarding-v2-canonique.md](/Users/ahmedamara/Dev/Sophia%202/docs/onboarding-v2-canonique.md) et repond a la question suivante:

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

## 13.3 Regle de retrieval

Le systeme ne doit pas tout charger.
Il doit charger selon l'intention.

Je recommande de specialiser le retrieval selon 5 intentions runtime:

- `answer_user_now`
- `nudge_decision`
- `daily_bilan`
- `weekly_bilan`
- `rendez_vous_or_outreach`

Chaque intention doit lire un sous-ensemble different.

## 13.4 Regle d'anti-bruit

Le systeme memoire V2 doit privilegier:

- stabilite
- reutilisabilite
- specificite utile

Et penaliser:

- les micro-variations sans valeur
- les reformulations cosmetiques
- le sur-stockage de petits etats passagers

## 13.5 Ce qu'il faut absolument memoriser

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

Je recommande:

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
