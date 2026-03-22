# Guide d'Audit Mémoire Sophia

## Objectif

Ce document explique comment exporter, lire, analyser et exploiter un bundle d'audit mémoire Sophia pour évaluer la qualité réelle du système mémoire sur une fenêtre temporelle donnée.

L'objectif n'est pas seulement de "voir ce qu'il s'est passé", mais de rendre possible une analyse rigoureuse de toute la chaîne mémoire:

- ce que le système a observé
- ce que le mémorizer a extrait
- ce qu'il a validé ou rejeté
- ce qu'il a persisté
- ce que le dispatcher a demandé
- ce que le retrieval a remonté
- ce qui a été réellement injecté dans le contexte
- ce qui a été poussé côté surfaces produit
- ce qui semble pertinent, inutile, bruyant, incomplet ou raté

En pratique, ce guide sert à produire un fichier local suffisamment riche pour qu'un modèle puisse ensuite auditer et proposer des optimisations concrètes sans devoir deviner ce qui s'est passé dans le système.

## Ce que doit permettre un bon bundle d'audit

Un bon bundle d'audit doit permettre de répondre à toutes les questions suivantes:

- Qu'a réellement dit l'utilisateur pendant la fenêtre étudiée ?
- Qu'a répondu Sophia ?
- Sur quels tours le dispatcher a-t-il demandé de la mémoire ?
- Quel `memory_plan` a été choisi ?
- Quel `surface_plan` a été choisi ?
- Le `surface_state` a-t-il escaladé correctement ou tourné en boucle ?
- Le mémorizer a-t-il bien identifié les faits importants ?
- A-t-il sur-stocké des micro-variations sans valeur ?
- A-t-il raté un signal important qui aurait dû devenir `topic`, `event` ou `global memory` ?
- Les memories persistées ont-elles été réutilisées plus tard ?
- Le retrieval a-t-il retrouvé les bons éléments ?
- Le loader a-t-il injecté le bon contexte, au bon niveau de détail ?
- Le prompt final contenait-il du bruit évitable ?
- Les surfaces produit poussées étaient-elles pertinentes ou intrusives ?

Si le bundle permet de répondre à ces questions, alors il est suffisamment riche pour faire un vrai travail d'optimisation.

## Ce que le bundle exporté contient

La commande d'export mémoire produit deux fichiers:

- un fichier JSON principal
- un fichier transcript texte

Le JSON principal contient:

- `trace`
- `scorecard`
- `annotations`
- quelques métadonnées de contexte sur l'export

Le transcript texte contient:

- la chronologie brute des messages
- les rôles
- le scope
- les éventuels `request_id`

Le transcript est utile pour une lecture humaine rapide.  
Le JSON est la source d'audit complète.

## Pourquoi il faut les deux fichiers

Le transcript seul ne suffit pas, car il ne dit pas:

- ce que le dispatcher a décidé
- ce que la mémoire a tenté de retrouver
- ce qui a été injecté
- ce que le mémorizer a fait hors du tour conversationnel

Le JSON seul ne suffit pas toujours non plus pour un audit qualitatif, car:

- la lecture brute des messages est moins naturelle
- certaines nuances conversationnelles sautent aux yeux plus vite dans un transcript linéaire

La meilleure pratique est donc:

1. lire le transcript pour sentir la dynamique conversationnelle
2. utiliser le JSON pour comprendre la mécanique interne
3. faire la synthèse en croisant les deux

## Structure générale du JSON exporté

Le bundle exporté contient en haut niveau:

- `ok`
- `exported_at`
- `source`
- `request`
- `trace`
- `scorecard`
- `annotations`

### `source`

Cette section permet de savoir d'où vient l'export:

- URL Supabase utilisée
- type de connexion (`local` ou `env`)
- base URL des functions

Elle sert surtout à éviter les confusions entre local, staging et prod.

### `request`

Cette section documente la fenêtre réellement demandée:

- `user_id`
- `scope`
- `from`
- `to`
- `used_hours`

Elle est importante car une mauvaise fenêtre temporelle mène à des conclusions fausses.

Exemples de problèmes fréquents:

- on pense analyser 24h, mais la fenêtre réelle était plus courte
- on mélange `web` et `whatsapp`
- on lit des signaux mémoriels incomplets parce qu'on a pris une fenêtre trop étroite

## La section `trace`

La section `trace` est le coeur du bundle.

Elle contient:

- la fenêtre auditée
- un résumé global
- les messages
- les turns reconstruits
- les runs memorizer
- les événements non assignés

### `trace.window`

Cette section contient:

- `from`
- `to`
- `scope`

C'est la vérité de la fenêtre analysée.  
Il faut toujours vérifier cette section avant de tirer des conclusions.

### `trace.summary`

Cette section résume le volume global:

- `messages_total`
- `user_messages`
- `assistant_messages`
- `turns_total`
- `memorizer_runs_total`
- `observability_events_total`

Cette vue est utile pour se faire une idée de la densité du matériau à analyser.

Quelques interprétations utiles:

- `turns_total` élevé avec peu de `memorizer_runs_total` peut signaler une ingestion mémoire peu fréquente
- `observability_events_total` très bas peut signaler un problème d'observabilité ou de gating
- `messages_total` élevé avec `turns_total` faible peut révéler une conversation dense avec peu de vraie segmentation côté routeur

### `trace.messages`

Cette section contient les messages bruts:

- `id`
- `role`
- `content`
- `scope`
- `created_at`
- `agent_used`
- `metadata`

Cette section sert à comprendre:

- le contenu réel de la conversation
- le ton
- le niveau de répétition
- les moments où l'utilisateur explicite quelque chose qui aurait dû être mémorisé

Point important:

Quand tu audites la qualité mémoire, les messages utilisateur sont la vérité source.  
Si le système conclut quelque chose qui n'est pas suffisamment supporté par les messages, c'est un problème.  
Si au contraire un signal durable apparaît clairement dans les messages et n'est jamais capté, c'est aussi un problème.

### `trace.turns`

Chaque `turn` est une reconstruction logique d'un échange piloté par le routeur.

Un turn contient typiquement:

- `turn_id`
- `request_id`
- `started_at`
- `scope`
- `channel`
- `user_message`
- `assistant_messages`
- `dispatcher`
- `surface`
- `retrieval`
- `injection`
- `model_selection`
- `turn_summary`
- `events`

Cette section est fondamentale, car elle permet de suivre la chaîne complète de décision sur un tour précis.

### `turn.user_message`

Contient le message utilisateur principal du tour.

Il faut toujours l'utiliser comme point d'entrée d'analyse:

- qu'est-ce que l'utilisateur demandait vraiment ?
- fallait-il de la mémoire ?
- si oui, quel type de mémoire ?
- fallait-il une surface produit ?
- quelle profondeur de contexte était réellement nécessaire ?

### `turn.assistant_messages`

Contient les réponses assistant rattachées à ce tour.

Cette section permet de juger:

- si la réponse a bien utilisé la mémoire
- si la réponse est cohérente avec le retrieval
- si la réponse pousse ou non une surface de manière pertinente
- si le tour a été trop lourd, trop vague ou trop intrusif

### `turn.dispatcher`

Cette section contient:

- `memory_plan`
- `surface_plan`

#### `memory_plan`

Le `memory_plan` dit ce que le dispatcher a estimé nécessaire pour répondre correctement.

Il peut contenir des éléments comme:

- `response_intent`
- `reasoning_complexity`
- `context_need`
- `memory_mode`
- `model_tier_hint`
- `context_budget_tier`
- `targets`
- `plan_confidence`

Cette section sert à évaluer si le dispatcher comprend bien le besoin de mémoire.

Questions d'audit utiles:

- Le `memory_mode` est-il cohérent avec le message ?
- Le système a-t-il demandé trop de mémoire pour une question simple ?
- A-t-il au contraire sous-estimé une demande de type inventaire ?
- Les `targets` sont-ils bien choisis ?
- Le choix de `global_theme` vs `global_subtheme` est-il pertinent ?

#### `surface_plan`

Le `surface_plan` dit quelles surfaces du produit semblaient pertinentes sur ce tour.

Il ne faut pas le confondre avec ce qui a été réellement poussé.

Cette section sert à auditer:

- la détection d'opportunités produit
- la qualité du raisonnement sur les surfaces
- le risque de push trop agressif

Questions d'audit utiles:

- La surface proposée correspond-elle au besoin réel du message ?
- Est-ce un push pertinent ou opportuniste mais inutile ?
- Une surface essentielle a-t-elle été manquée ?
- Le niveau suggéré était-il trop fort ?

### `turn.surface`

Cette section contient:

- `state_transition`
- `addon`

#### `state_transition`

Le `surface_state` sert à éviter que les surfaces soient poussées sur un seul message isolé.

Il permet de suivre:

- l'évolution du score latent
- le niveau courant
- la fatigue
- les compteurs d'acceptation / d'ignorance
- les cooldowns

Cette section est très importante pour détecter les boucles.

Questions d'audit utiles:

- La même surface remonte-t-elle trop vite ?
- Le système interprète-t-il trop facilement un `ok` comme une acceptation ?
- Y a-t-il alternance artificielle entre deux surfaces proches ?
- Une surface entre-t-elle bien en cooldown après un rejet implicite ?

#### `addon`

L'`addon` correspond à ce qui a réellement été injecté côté surface dans ce tour.

Exemples:

- `dashboard.north_star`
- `dashboard.reminders`
- `dashboard.preferences`
- `architect.coaching`
- `architect.stories`
- `architect.reflections`
- `architect.quotes`

Questions d'audit utiles:

- La surface réellement poussée est-elle naturelle ?
- Son niveau est-il proportionné ?
- Le contenu choisi est-il trop tôt, trop tard, trop faible ou trop lourd ?

### `turn.retrieval`

Cette section contient les retrievals mémoire effectivement exécutés:

- `events`
- `globals`
- `topics`

Chaque bloc peut inclure:

- la requête ou l'intention
- les résultats
- les scores
- parfois les causes de filtrage

Cette section est essentielle pour comprendre si la bonne mémoire est remontée.

Questions d'audit utiles:

- Est-ce que les bons `global_subthemes` sont remontés ?
- Est-ce que les `topics` de support sont pertinents ?
- Est-ce que des éléments bruyants apparaissent trop souvent ?
- Est-ce qu'un souvenir évident manque du top-k ?

### `turn.injection`

Cette section contient ce qui a réellement été injecté dans le contexte final.

En pratique, c'est souvent l'un des points les plus importants de tout l'audit, parce que retrieval et injection ne sont pas la même chose.

Le système peut:

- bien retrouver mais mal injecter
- retrouver trop de choses et en couper les plus utiles
- injecter du bruit parce qu'un budget a été mal alloué

Éléments utiles:

- `estimated_tokens`
- `memory_blocks`
- `chars`
- indicateurs `loaded`

Questions d'audit utiles:

- Ce qui a été injecté est-il vraiment ce qui devait l'être ?
- Le budget mémoire a-t-il été bien utilisé ?
- Y a-t-il trop de mémoire injectée par rapport à la demande ?
- Y a-t-il au contraire une injection trop pauvre ?

### `turn.model_selection`

Cette section permet de vérifier si le modèle choisi était cohérent avec la difficulté du tour.

Exemples:

- `flash-lite` pour un tour simple, sans mémoire lourde
- `flash` pour un tour moyen avec mémoire ciblée
- `pro` pour un tour dossier ou synthèse complexe

Questions d'audit utiles:

- Le modèle choisi est-il surdimensionné ?
- Est-il sous-dimensionné pour la charge mémoire ?
- Le choix du modèle est-il cohérent avec le `memory_plan` ?

### `turn.turn_summary`

Ce bloc donne une vue plus opérationnelle du tour:

- latences
- profil de contexte
- éléments de contexte
- tokens
- cible finale
- modèle agent

Il sert à relier qualité mémoire et coût opérationnel.

## La section `trace.memorizer_runs`

Cette section est indispensable pour auditer le système mémoire en amont du retrieval.

Chaque run mémorizer contient:

- `run_id`
- `started_at`
- `request_id`
- `source_component`
- `source_type`
- `stages`
- `events`

### Pourquoi cette section est critique

Si tu ne regardes que le retrieval, tu peux croire que la mémoire est mauvaise alors que le vrai problème vient du fait que l'information n'a jamais été persistée.  
À l'inverse, tu peux croire que le mémorizer est mauvais alors qu'il a correctement persisté, mais que le dispatcher ou le retrieval ne l'ont jamais demandé ensuite.

Cette section permet donc de séparer les problèmes.

### `stages.extraction`

Cette section dit ce que le mémorizer a extrait du matériau source.

Typiquement:

- `durable_topics`
- `event_candidates`
- `global_memory_candidates`
- compteurs d'extraction

Questions d'audit utiles:

- Les bons signaux ont-ils été extraits ?
- Y a-t-il trop de candidats faibles ?
- Le système extrait-il trop de choses éphémères ?
- Des patterns durables sont-ils ratés ?

### `stages.validation`

Cette section dit ce qui a été accepté ou rejeté.

Questions d'audit utiles:

- Les règles de validation sont-elles trop strictes ?
- Trop permissives ?
- Le système laisse-t-il passer des items faibles ?
- Rejette-t-il des éléments pourtant réutilisables ?

### `stages.persistence`

Cette section dit ce qui a réellement été écrit:

- `create`
- `enrich`
- `update`
- `noop`
- flags de compaction
- embedding refresh

Questions d'audit utiles:

- Est-ce qu'on enrichit intelligemment ou est-ce qu'on duplique ?
- Y a-t-il trop de `noop` ?
- Les global memories s'accumulent-elles sans jamais être réutilisées ?
- Les topics deviennent-ils des fourre-tout ?

## La section `trace.unassigned_events`

Cette section contient des événements d'observabilité qui n'ont pas pu être reliés proprement à un turn ou à un run.

Elle est importante car elle peut signaler:

- un problème de corrélation `request_id`
- un event émis sans `turn_id`
- un flux mémoire partiellement hors routeur

Si cette section grossit trop, l'audit devient moins fiable.

## La section `scorecard`

La scorecard est une vue agrégée de la fenêtre.

Elle sert à:

- repérer rapidement les zones problématiques
- comparer plusieurs fenêtres entre elles
- suivre l'évolution des réglages mémoire

Elle ne remplace pas la lecture détaillée, mais elle donne un tableau de bord très utile.

### `scorecard.coverage`

Mesure le volume global:

- nombre de turns
- nombre de messages
- nombre de runs memorizer
- nombre d'événements observabilité

Cette section répond à la question:

"Ai-je suffisamment de matière pour auditer sérieusement cette fenêtre ?"

### `scorecard.identification`

Mesure la qualité d'identification amont:

- volume extrait
- volume accepté
- taux d'acceptation

Interprétations utiles:

- extraction élevée + acceptation très faible = extraction probablement trop bruitée
- extraction faible sur une fenêtre riche = mémorizer potentiellement trop conservateur
- acceptance rate très haute sur tout = validation peut-être trop permissive

### `scorecard.persistence`

Mesure ce qui change réellement en base:

- topics créés/enrichis/noop
- events créés/mis à jour/noop
- globals créés/mis à jour/noop/pending_compaction
- change rate

Interprétations utiles:

- beaucoup de `noop` = soit le système a déjà la bonne mémoire, soit il reprocess trop souvent la même matière
- beaucoup de créations topic avec peu d'enrichissements = fragmentation possible
- beaucoup de globals en `pending_compaction` = risque d'inflation du contexte sémantique

### `scorecard.retrieval`

Mesure la qualité du retrieval:

- turns avec `memory_plan`
- turns demandant vraiment de la mémoire
- turns avec retrieval
- turns avec hit
- hit rate global
- hit rate par type
- distribution des `memory_mode`

Interprétations utiles:

- `turns_requesting_memory` élevé mais `turns_with_any_retrieval` faible = problème de chargement
- retrieval élevé mais hit faible = query / ranking / taxonomy mal calibrés
- trop de `dossier` = dispatcher probablement trop gourmand

### `scorecard.injection`

Mesure la qualité d'injection:

- nombre de turns avec mémoire injectée
- taux d'injection sur turns qui demandaient de la mémoire
- moyenne des tokens mémoire
- moyenne des chars mémoire
- usage par bloc (`identity`, `events`, `globals`, `topics`)

Interprétations utiles:

- injection rate faible malgré retrieval réussi = problème de budgeting ou de loader
- chars élevés sur des tours simples = bruit probable
- `identity` surutilisé = risque de retomber dans un mode trop global/synthétique

### `scorecard.surface`

Mesure l'utilisation des surfaces:

- turns avec `surface_plan`
- turns avec vrai `surface_addon`
- taux de push
- niveau moyen
- événements d'acceptation
- événements d'ignorance
- distribution par surface

Interprétations utiles:

- plan élevé mais addon faible = le système hésite ou réprime beaucoup les pushes
- addon élevé mais acceptation faible = pushes probablement peu pertinents
- niveau moyen trop haut = système possiblement trop intrusif

### `scorecard.reuse`

Mesure le délai approximatif entre:

- persistance
- puis réutilisation en retrieval

Cette section est très précieuse pour comprendre si la mémoire vit vraiment ou si elle se contente de s'accumuler.

Interprétations utiles:

- reuse count très bas malgré forte persistance = mémoire mal réexploitée
- reuse très rapide et très fréquente = souvent bon signe si le contexte est juste
- reuse quasi nul sur globals = taxonomie ou queries peut-être mal branchées

### `scorecard.annotations`

Contient les annotations humaines éventuelles:

- total
- distribution par dimension
- distribution par label

Cette section est importante si tu commences à constituer un dataset d'évaluation plus rigoureux.

## La section `annotations`

Les annotations servent à ajouter un jugement humain sur:

- une fenêtre entière
- ou un turn particulier

Dimensions disponibles:

- `overall`
- `identification`
- `persistence`
- `retrieval`
- `injection`
- `surface`

Labels disponibles:

- `good`
- `partial`
- `miss`
- `harmful`

Ces annotations sont utiles pour transformer l'audit qualitatif en dataset d'amélioration.

## Ce qu'un modèle doit regarder pour bien évaluer

Quand tu me donnes un bundle à analyser, les éléments minimaux à prendre en compte sont:

- le transcript complet
- `trace.turns`
- `trace.memorizer_runs`
- `trace.unassigned_events`
- `scorecard`
- les éventuelles `annotations`

Si un de ces blocs manque, l'analyse devient moins fiable.

## Méthode d'analyse recommandée

Voici la méthode que je recommande pour faire une vraie analyse utile.

### Étape 1: comprendre la conversation humaine

Commencer par le transcript:

- quels sont les sujets réellement abordés ?
- quels patterns reviennent ?
- quelles infos sont clairement durables ?
- quelles infos sont juste circonstancielles ?
- quels moments semblent devoir produire une mémoire ?

Sans cette étape, on risque de juger le système sur la base de ses propres abstractions au lieu de juger sa fidélité à la conversation.

### Étape 2: évaluer l'identification

Ensuite, regarder les `memorizer_runs`.

Questions utiles:

- Est-ce que le système a identifié les vraies nouveautés ?
- A-t-il raté des signaux forts ?
- A-t-il sur-identifié des détails triviaux ?
- Les `global_memory_candidates` correspondent-ils vraiment à des patterns durables ?

### Étape 3: évaluer la persistance

Après l'extraction, regarder:

- ce qui a été créé
- enrichi
- noopé
- compacté

Questions utiles:

- La mémoire persiste-t-elle les bons objets ?
- Le système enrichit-il au bon niveau ?
- Y a-t-il de la duplication ?
- Les contradictions sont-elles absorbées intelligemment ?

### Étape 4: évaluer le dispatcher

Sur chaque turn important, regarder le `memory_plan` et le `surface_plan`.

Questions utiles:

- Le dispatcher a-t-il compris le besoin de mémoire ?
- Le niveau de contexte demandé est-il juste ?
- Les surfaces identifiées sont-elles cohérentes ?
- Le système demande-t-il trop souvent du contexte lourd ?

### Étape 5: évaluer le retrieval

Comparer:

- ce qui existait déjà
- ce qui a été demandé
- ce qui a été remonté

Questions utiles:

- Les bons éléments ont-ils été retrouvés ?
- Le ranking est-il bon ?
- Un faux positif sémantique revient-il souvent ?
- Le système ignore-t-il des global memories pertinentes ?

### Étape 6: évaluer l'injection

Regarder ce qui a été réellement injecté dans le contexte final.

Questions utiles:

- Le contexte injecté aide-t-il vraiment ?
- Est-il trop large ?
- Est-il trop pauvre ?
- Y a-t-il trop de résumé abstrait et pas assez de concret ?

### Étape 7: évaluer la réponse finale

Enfin, comparer:

- ce qui a été injecté
- ce que la réponse dit réellement

Questions utiles:

- La réponse utilise-t-elle la bonne mémoire ?
- Ignore-t-elle une mémoire utile pourtant injectée ?
- La mémoire injectée a-t-elle pollué la réponse ?
- L'utilisateur a-t-il dû se répéter alors que le système avait déjà l'info ?

## Ce que signifie "système mémoire performant"

Un système mémoire performant n'est pas simplement un système qui stocke beaucoup de choses.

Il doit:

- identifier les bons signaux
- persister au bon niveau d'abstraction
- retrouver la bonne mémoire au bon moment
- injecter un contexte utile et pas bruyant
- soutenir la réponse sans l'alourdir
- réutiliser la mémoire au fil du temps

Autrement dit:

- mémoire utile > mémoire abondante
- contexte précis > contexte massif
- stabilité exploitable > accumulation brute

## Signaux positifs à rechercher

Quand le système fonctionne bien, on voit souvent:

- des topics enrichis progressivement au lieu d'une prolifération de topics voisins
- des global memories qui capturent de vrais patterns durables
- des retrievals ciblés cohérents avec la question
- une injection mémoire modérée mais utile
- des surfaces poussées peu souvent mais au bon moment
- des réponses qui évitent à l'utilisateur de tout réexpliquer

## Signaux de dérive ou de faiblesse

Voici les grandes catégories de dérives à surveiller.

### 1. Sous-mémorisation

Symptômes:

- l'utilisateur répète plusieurs fois les mêmes éléments importants
- peu de persistence malgré des conversations riches
- reuse quasi nul
- scorecard retrieval faible

Causes probables:

- extraction trop conservatrice
- validation trop stricte
- mauvais découpage topic/global

### 2. Sur-mémorisation

Symptômes:

- inflation des topics
- beaucoup de globals faibles ou trop spécifiques
- trop de `pending_compaction`
- contexte mémoire lourd pour des tours simples

Causes probables:

- validation trop permissive
- mauvais seuils de durabilité
- confusion entre fait local et pattern durable

### 3. Mauvais retrieval

Symptômes:

- la bonne mémoire existe mais ne remonte pas
- le top-k contient du bruit
- les queries implicites ratent les bons sous-thèmes

Causes probables:

- targets dispatcher mal choisis
- ranking lexical/vectoriel mal calibré
- taxonomy pas assez bien utilisée

### 4. Mauvaise injection

Symptômes:

- contexte trop long sans gain qualitatif
- injection faible alors que retrieval est bon
- trop de mémoire globale là où un topic suffisait

Causes probables:

- budgets mal calibrés
- loader trop générique
- mauvais arbitrage entre blocks

### 5. Mauvaise orchestration des surfaces

Symptômes:

- push répétitif
- surfaces non pertinentes
- escalade trop rapide
- surfaces ignorées qui reviennent trop vite

Causes probables:

- `surface_state` mal calibré
- détection d'opportunité trop optimiste
- règles de cooldown/fatigue insuffisantes

## Questions d'audit très utiles à poser au modèle

Quand tu me donnes un bundle, voici le type de questions qui produisent les meilleurs audits:

- Quelles infos durables n'ont pas été mémorisées ?
- Quelles memories ont été persistées mais semblent inutiles ou redondantes ?
- Quelles réponses ont manqué de mémoire utile ?
- Quels retrievals remontent du bruit ?
- Quels sous-thèmes globaux semblent mal choisis ou mal utilisés ?
- Où le dispatcher surestime-t-il ou sous-estime-t-il le besoin de contexte ?
- Les surfaces poussées étaient-elles pertinentes ?
- Quelles règles de persistance/retrieval/injection faudrait-il modifier ?

## Questions moins utiles

Ces formulations sont souvent trop vagues:

- "Est-ce que c'est bien ?"
- "Tu en penses quoi ?"
- "La mémoire est-elle bonne ?"

Elles donnent souvent des réponses trop floues.

Il vaut mieux demander:

- des ratés précis
- des patterns de bruit
- des hypothèses de causes
- des propositions de tuning

## Ce qu'il faut idéalement me fournir en plus du bundle

Le bundle suffit pour beaucoup de choses, mais certaines analyses deviennent encore meilleures si tu ajoutes:

- l'objectif de l'audit
- le type de problème suspecté
- le scope exact voulu (`whatsapp` la plupart du temps)
- si tu soupçonnes un bug d'ingestion, de retrieval ou d'injection
- si la fenêtre choisie correspond à une conversation problématique connue

Exemples:

- "Je soupçonne que le système n'a pas retenu un pattern psychologique important"
- "Je veux savoir si le dispatcher charge trop de global memory sur les tours simples"
- "Je pense que les surfaces sont trop poussées"

## Workflow recommandé

Le workflow idéal est:

1. exporter le bundle
2. lire rapidement le transcript
3. me donner le bundle JSON
4. préciser le but de l'audit
5. me demander un diagnostic détaillé
6. me demander ensuite un plan d'optimisation concret

## Ce qu'il ne faut pas oublier

### Le scope

Pour auditer les vraies conversations utilisateur de Sophia, le scope à utiliser est en général:

- `whatsapp`

Le scope `web` est utile pour les interactions site/app, mais si ton but est d'auditer Sophia conversationnelle telle qu'elle vit au quotidien avec l'utilisateur, c'est très souvent `whatsapp` qu'il faut prendre.

### La fenêtre temporelle

Une fenêtre trop petite:

- peut masquer un pattern mémoire
- peut donner l'impression qu'une memory n'a pas été réutilisée alors qu'elle l'a été plus tard

Une fenêtre trop grande:

- peut rendre l'analyse confuse
- mélanger plusieurs sujets sans rapport

Le bon point de départ est souvent:

- 24h
- ou une séquence de conversation clairement délimitée

### Le mode d'analyse

Il faut toujours distinguer:

- identification
- persistence
- retrieval
- injection
- usage final

Sinon, on voit un problème sans savoir à quel étage il se produit.

## Limitations actuelles à garder en tête

Le bundle est déjà très riche, mais il ne faut pas lui attribuer plus qu'il ne donne réellement.

Quelques limites possibles:

- les raisons fines de rejet validation ne sont pas toujours explicitées
- certains événements non corrélés peuvent finir dans `unassigned_events`
- la notion de "mémoire effectivement utilisée par le modèle" reste indirecte
- certaines conclusions sur la réponse finale restent qualitatives et non strictement mesurées

Malgré cela, le bundle est déjà largement suffisant pour un audit sérieux et une optimisation utile.

## Ce que doit faire le modèle quand tu lui donnes un bundle

Quand tu me donnes un bundle, le bon comportement attendu est:

1. lire la fenêtre et le scope
2. comprendre le transcript
3. analyser la scorecard pour repérer les zones faibles
4. zoomer sur les turns problématiques
5. comparer retrieval/injection/réponse
6. identifier les ratés structurels
7. proposer des hypothèses de cause
8. proposer des ajustements précis

## Résultat attendu d'un bon audit

À la fin d'un bon audit, on doit pouvoir sortir quelque chose comme:

- les 5 ratés mémoire les plus importants de la fenêtre
- les 3 causes structurelles probables
- les endroits où le dispatcher est trop agressif ou trop faible
- les surfaces qui poussent bien et celles qui poussent mal
- les réglages les plus prioritaires à changer

Si l'audit ne produit qu'une impression vague, alors il n'est pas assez bon.

## Commandes

### Export standard sur WhatsApp avec borne début/fin

```bash
npm run memory:audit:export -- \
  --user-id 123e4567-e89b-12d3-a456-426614174000 \
  --from 2026-03-19T01:00:00+01:00 \
  --to 2026-03-20T01:00:00+01:00 \
  --scope whatsapp
```

### Export standard sur WhatsApp avec fenêtre glissante

```bash
npm run memory:audit:export -- \
  --user-id 123e4567-e89b-12d3-a456-426614174000 \
  --hours 24 \
  --scope whatsapp
```

### Export sans filtrer le scope

```bash
npm run memory:audit:export -- \
  --user-id 123e4567-e89b-12d3-a456-426614174000 \
  --from 2026-03-19T01:00:00+01:00 \
  --to 2026-03-20T01:00:00+01:00 \
  --scope-all
```

### Export avec fichier de sortie explicite

```bash
npm run memory:audit:export -- \
  --user-id 123e4567-e89b-12d3-a456-426614174000 \
  --from 2026-03-19T01:00:00+01:00 \
  --to 2026-03-20T01:00:00+01:00 \
  --scope whatsapp \
  --out tmp/audits/user_123_memory_audit_24h.json
```

### Aide intégrée

```bash
npm run memory:audit:export -- --help
```

### Exemple staging / prod avec secrets explicites

```bash
SUPABASE_URL="https://<project-ref>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
INTERNAL_FUNCTION_SECRET="<internal-function-secret>" \
npm run memory:audit:export -- \
  --user-id 123e4567-e89b-12d3-a456-426614174000 \
  --from 2026-03-19T01:00:00+01:00 \
  --to 2026-03-20T01:00:00+01:00 \
  --scope whatsapp
```

### Exemple local simple

```bash
npm run memory:audit:export -- \
  --user-id 123e4567-e89b-12d3-a456-426614174000 \
  --hours 24 \
  --scope whatsapp
```
