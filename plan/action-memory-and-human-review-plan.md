# Action Memory + Human Review - Implementation Plan

## Objectif

Rendre Sophia plus vivante dans les bilans daily/weekly tout en construisant une memoire structurée par action, sans creer une deuxieme source de verite concurrente.

Le but est double :

- ameliorer le ton de Sophia dans les reviews : feliciter quand une action est faite, rassurer quand une action est ratee, etre plus attentive quand un blocage se repete ;
- donner a Sophia une intelligence cumulative sur chaque action : historique recent, patterns de blocage, signaux de progression, interpretation weekly, fraicheur de la donnee.

La direction produit est :

> Daily = capteur structuré + reaction humaine courte.
> Weekly = analyse + consolidation.
> Memorizer = memoire durable et fiche action.
> Retrieval/injection = contexte utile au bon moment.

## Probleme A Eviter

Il ne faut pas que le daily ecrive une memoire long terme en parallele du memorizer.

Sinon le systeme aurait deux sources de verite :

- les entries structurees du daily ;
- les souvenirs crees directement depuis les messages de chat.

Cela creerait des doublons, des interpretations contradictoires, et des injections incoherentes.

La regle centrale :

> Le daily et le weekly produisent des observations structurees canoniques. Le memorizer les consomme et consolide la memoire action durable.

## Sources Existantes

Le systeme a deja plusieurs briques utiles :

- `user_plan_item_entries` : journal structure des actions, avec `metadata.source = daily_action_review_v1`.
- `user_habit_week_occurrences` : statut occurrence par occurrence.
- `chat_messages.metadata` : contexte de flow, source, purpose, pending, scheduled checkin.
- Memory V2 / memorizer : extraction, consolidation, retrieval.
- Weekly adaptive review : futur consommateur des entries daily et producteur d'interpretations hebdomadaires.

Le nouveau chantier doit reutiliser ces briques.

## Principe D Architecture

### Couche 1 - Event Log Canonique

Le daily action review continue d'ecrire les faits dans `user_plan_item_entries`.

Chaque event doit rester factuel :

- `plan_item_id`
- `occurrence_id`
- `local_date`
- `week_start_date`
- `dimension`
- `outcome`
- `reason_category`
- `reason_text`
- `matched_user_text`
- `still_relevant`
- `reschedule_decision`
- `rescheduled_to`
- `pending_action_id`
- `scheduled_checkin_id`
- `source = daily_action_review_v1`

Le weekly produira aussi des observations structurees, par exemple :

- decision hebdo ;
- cause dominante ;
- interpretation de pattern ;
- action a surveiller ;
- action a simplifier ;
- action a ne plus reporter ;
- signal de progression.

Ces observations weekly doivent etre sourcees avec un identifiant explicite, par exemple `weekly_adaptive_review_v1`.

### Couche 2 - Memorizer / Consolidation Action

Le memorizer devient responsable de transformer les observations daily/weekly en memoire durable.

Il ne doit pas re-extraire naivement depuis le texte du chat si une entry structuree existe deja pour le meme evenement.

Il doit plutot :

- consommer les entries structurees daily/weekly ;
- detecter si l'evenement a deja ete traite ;
- mettre a jour une fiche action existante ;
- creer ou renforcer un pattern ;
- ignorer les faits trop ponctuels ou trop faibles ;
- lier la preuve au texte source quand utile.

### Couche 3 - Action Profile

Une fiche action est une memoire compacte, injectable, lisible par Sophia.

Elle doit contenir deux niveaux :

1. Faits recents.
2. Patterns consolides.

Exemple conceptuel :

```json
{
  "action_profile_key": "transformation:72a...:plan_item:b0f...",
  "action_title": "Faire une session de travail focus (2h)",
  "action_type": "habit",
  "recent_observations": [
    {
      "date": "2026-05-21",
      "outcome": "completed",
      "signal": "a eu du mal a demarrer mais a tenu presque 2h",
      "freshness": "high"
    },
    {
      "date": "2026-05-23",
      "outcome": "missed",
      "reason_category": "fatigue",
      "freshness": "high"
    }
  ],
  "patterns": [
    {
      "summary": "Le demarrage est plus difficile que l'execution une fois lancee.",
      "confidence": "medium",
      "last_confirmed_at": "2026-05-23"
    }
  ],
  "suggested_tone": "supportive_investigate",
  "do_not_overreact": false
}
```

Cette structure est conceptuelle. L'implementation doit s'aligner sur les schemas Memory V2 existants.

### Couche 4 - Injection Contextuelle

Quand Sophia parle d'une action, le retrieval doit injecter un bloc `action_context`.

Ce bloc peut etre donne :

- au daily skill ;
- au weekly skill ;
- a la conversation normale si le user parle d'une action ;
- aux operation suggestions, sans permettre d'execution automatique.

Le bloc doit etre court et trie :

```json
{
  "action_context": {
    "plan_item_id": "...",
    "occurrence_id": "...",
    "recent_observations": [],
    "recurring_patterns": [],
    "last_weekly_interpretation": null,
    "freshness_summary": "recent_data_available",
    "suggested_tone": "encouraging|gentle|supportive_investigate|neutral",
    "risk_of_overcoaching": "low|medium|high"
  }
}
```

## Identite Des Actions

Le point cle est que l'identite n'est pas la meme selon le type d'action.

### Missions Et Clarifications

Pour une mission ou clarification, l'identite principale est souvent :

- `plan_item_id`
- `occurrence_id` pour l'evenement du jour
- `transformation_id`
- `plan_id`

Une mission non faite puis reportee reste le meme `plan_item_id`, mais change d'occurrence / jour.

### Habitudes

Pour une habitude, l'action revient de semaine en semaine.

La fiche action ne doit donc pas se limiter a une occurrence.

Mais il faut distinguer deux niveaux :

1. Les metriques exactes de l'action.
2. La memoire d'execution partagee du niveau.

Les metriques exactes restent attachees a l'action / occurrence :

- target de cette semaine ;
- nombre de repetitions faites ;
- occurrence done / partial / missed ;
- report eventuel ;
- score hebdomadaire de cette habitude precise.

La memoire d'execution, elle, peut etre mutualisee entre les habitudes d'un meme niveau quand elles reposent sur la meme mecanique comportementale.

Dans la logique produit, les habitudes d'un niveau sont souvent des variations d'une meme base :

- difficulte differente ;
- repetition differente ;
- version plus simple ;
- version plus dure ;
- meme comportement sous une cible hebdomadaire differente.

Donc le systeme ne doit pas chercher a isoler trop strictement chaque habitude si, dans les faits, elles partagent le meme apprentissage d'execution.

Regle recommandee :

> Dans un meme niveau, les habitudes gardent leurs metriques separees, mais partagent par defaut une memoire d'execution de niveau, sauf preuve claire qu'elles appartiennent a des mecaniques totalement differentes.

Identite recommandee :

- `transformation_id`
- `plan_id` ou niveau courant
- `plan_item_id`
- `action_type = habit`

Et pour la memoire d'execution partagee :

- `transformation_id`
- niveau / phase courant ;
- `habit_execution_context_key` ou `action_family_key` ;
- signaux d'execution communs : demarrage, fatigue, oubli, planning, surcharge, evitement, contexte.

Pour les habitudes crescendo, la fiche doit aussi garder la cible hebdomadaire :

- target de la semaine ;
- target precedente ;
- taux de tenue ;
- raison des echecs ;
- signal de fatigue ou de difficulte quand la cible augmente.

Le weekly est le bon endroit pour enrichir cette lecture.

## Fraicheur Et Pondération

Toutes les infos action ne se valent pas.

Une observation d'il y a deux jours doit peser plus qu'une observation d'il y a trois semaines, sauf si l'ancienne observation fait partie d'un pattern confirme.

Il faut distinguer :

- observation recente : evenement ponctuel, fort a court terme ;
- pattern consolide : plusieurs signaux coherents dans le temps ;
- info ancienne : utile seulement si elle recoupe le recent.

Regle produit :

> Sophia ne doit pas reagir fortement a une vieille info isolee.

Exemple :

- il y a 3 semaines : "l'action etait trop abstraite" ;
- cette semaine : action faite deux fois sans probleme.

Dans ce cas, l'ancienne info doit etre faible.

Autre exemple :

- il y a 3 semaines : "fatigue le soir" ;
- il y a 2 jours : "encore trop fatigue le soir" ;
- hier : "report car fatigue".

Dans ce cas, le pattern redevient fort.

## Anti Doublon Memorizer

Le memorizer doit avoir une strategie d'idempotence.

Pour les observations daily, une cle d'evenement peut etre derivee de :

- `source`
- `occurrence_id`
- `plan_item_id`
- `local_date`
- `pending_action_id`
- `scheduled_checkin_id`

Pour les observations weekly :

- `source`
- `week_start_date`
- `plan_id`
- `plan_item_id`
- `weekly_review_id` ou pending weekly id

Le memorizer doit pouvoir dire :

- deja consomme ;
- nouveau fait ;
- mise a jour d'un pattern existant ;
- evidence supplementaire pour un pattern.

Il ne doit pas creer une nouvelle memoire textuelle si une observation structuree equivalente existe deja.

## Ton Plus Humain

Le daily skill doit recevoir des consignes de ton, mais pas des phrases hardcodees.

Il doit raisonner par intention :

### Action Faite

Intentions possibles :

- reconnaitre l'effort ;
- feliciter brievement ;
- valoriser le fait que le user a tenu l'action ;
- rester sobre si plusieurs actions sont traitees.

Exemple d'intention :

> completed + action importante + pas de friction majeure -> acknowledgement positif court.

### Action Partielle

Intentions possibles :

- valoriser la partie faite ;
- demander la raison seulement si elle manque ;
- ne pas faire comme si c'etait un echec complet.

### Action Non Faite - Premiere Fois

Intentions possibles :

- rassurer ;
- normaliser sans banaliser ;
- demander si l'action reste utile avant report ;
- ne pas surcoacher.

### Action Non Faite - Blocage Repete

Intentions possibles :

- etre supportive ;
- signaler doucement que le blocage se repete ;
- demander comment Sophia peut aider ;
- ne pas lancer d'operation automatiquement.

Exemple d'intention :

> missed + repeated_recently + still_relevant=true -> supportive_investigate.

Le message visible pourrait avoir l'esprit de :

> Je note que cette action bloque encore. On peut juste comprendre ce qui rend le passage a l'action difficile, si tu veux.

Mais le texte exact doit rester genere par le skill, pas hardcode.

## Important : Pas D Operation Automatique

Meme si l'action profile detecte :

- friction de demarrage ;
- sabotage ;
- action trop grosse ;
- besoin de portion ;
- besoin de carte d'attaque ;

Le daily review ne doit pas prendre la place du flow operation.

Il peut poser une question humaine courte, mais il ne doit pas proposer directement une operation sauf demande explicite ou signal systeme tres fort gere par les regles existantes.

Dans le daily, l'objectif reste :

- collecter ;
- comprendre ;
- reporter si confirme ;
- preparer le weekly.

## Role Du Weekly

Le weekly doit enrichir la fiche action avec des interpretations plus stables.

Le daily voit des evenements.

Le weekly voit des patterns.

Exemples d'interpretations weekly :

- "La target d'habitude augmente plus vite que l'energie disponible."
- "La mission n'est pas rejetee, elle est repoussee quand elle arrive apres une journee chargee."
- "La clarification est trop abstraite et devrait etre transformee en action concrete."
- "Le user avance malgre des missions non faites, car l'habitude principale tient."
- "Le user ne fait pas l'action, mais il progresse autrement."

Ces interpretations doivent etre sourcees et injectables dans les futurs daily.

## Memoire Legere De Fin De Niveau

Quand un niveau est termine, le systeme doit creer automatiquement une memoire legere de handoff de niveau.

Cette memoire n'est pas un besoin dispatcher separe.

Elle est une source de memoire consultable quand le systeme a besoin de memoire de niveau.

Regle :

> `level_execution_handoff` = type de memoire cree automatiquement a la fin d'un niveau.
> `need_level_memory` = besoin dispatcher / retrieval pour charger ce type de contexte quand il est pertinent.

Il ne faut donc pas creer de `need_execution_handoff`.

### Moment De Creation

La memoire de niveau est creee apres validation du questionnaire de fin de niveau, quand le niveau est clos et que le nouveau niveau peut demarrer.

Elle doit prendre en compte :

- les donnees daily du niveau ;
- les weekly reviews du niveau ;
- les decisions de repeat / bridge / advance ;
- les habitudes qui ont tenu ;
- les habitudes qui ont casse quand la target a augmente ;
- les missions ou clarifications qui ont ete utiles ou abandonnees ;
- les reponses explicites du user dans le questionnaire de fin de niveau ;
- les signaux de progression ressentie ;
- les signaux d'etat general du user.

### Contenu

La memoire doit etre legere, pas exhaustive.

Elle peut contenir :

- ce qui a aide le user a executer ;
- ce qui a bloque de maniere recurrente ;
- les conditions de reussite ;
- les conditions d'echec ;
- les patterns d'execution a surveiller au niveau suivant ;
- ce qui ne doit pas etre surinterprete ;
- les adaptations qui ont marche ;
- les points d'attention pour le prochain niveau.

Exemple conceptuel :

```json
{
  "memory_type": "level_execution_handoff",
  "completed_level_id": "level_1",
  "next_level_id": "level_2",
  "summary": "Le user execute mieux quand les actions sont planifiees tot. Les echecs repetes venaient surtout de fatigue le soir. La montee de target a cree un peu d'evitement.",
  "carry_forward_patterns": [
    {
      "pattern": "fatigue du soir = risque de report",
      "scope": "habit_execution",
      "confidence": "high"
    },
    {
      "pattern": "planification en amont facilite l'execution",
      "scope": "planning",
      "confidence": "medium"
    }
  ],
  "do_not_overweight": [
    "un oubli isole sur une clarification ancienne"
  ],
  "next_level_attention": [
    "surveiller la montee de target",
    "eviter de placer les actions lourdes trop tard"
  ]
}
```

### Injection

Cette memoire peut etre injectee :

- au daily du nouveau niveau, en version tres courte ;
- au weekly du nouveau niveau, avec un peu plus de detail ;
- dans la conversation normale si le user parle du niveau, de la progression ou d'un pattern qui revient.

Elle ne doit pas etre injectee systematiquement dans toutes les reponses.

Elle doit rester moins prioritaire que les observations recentes du niveau courant.

### Nouveau Niveau

Quand un nouveau niveau commence, on ne repart pas totalement a zero.

Mais on ne transporte pas non plus toute la memoire brute de l'ancien niveau.

Regle recommandee :

> Le nouveau niveau herite d'un contexte faible mais utile via `level_execution_handoff`.
> Les daily/weekly du nouveau niveau deviennent prioritaires des qu'ils produisent des signaux recents.

## Contrat D Injection Pour Les Skills

Le daily skill devrait recevoir, pour chaque target, un bloc optionnel :

```json
{
  "action_intelligence": {
    "occurrence_id": "...",
    "plan_item_id": "...",
    "recent_daily_events": [],
    "weekly_interpretations": [],
    "patterns": [],
    "suggested_tone": "neutral",
    "freshness": {
      "has_recent_data": true,
      "last_observation_days_ago": 2,
      "stale_patterns_present": false
    }
  }
}
```

Le skill ne doit pas recalculer toute l'histoire. Il doit utiliser ce bloc pour adapter :

- le ton ;
- la question ;
- le niveau d'attention ;
- la decision de demander une aide plus fine.

## Dispatcher Hors Daily / Weekly

Le daily et le weekly ne sont pas les seuls moments ou Sophia parle d'une action.

Dans une conversation normale, le user peut dire :

- "j'ai encore rate mes sessions focus" ;
- "la mission agenda me gonfle" ;
- "j'arrive pas a faire la marche" ;
- "pour l'audit d'attention, je crois que j'ai compris le probleme" ;
- "cette habitude devient trop lourde".
- "ce niveau me rappelle le precedent" ;
- "j'ai l'impression que le meme probleme revient" ;
- "dans le niveau d'avant, ca bloquait deja" ;
- "ce nouveau niveau est plus dur que le dernier".

Dans ces cas, le point d'entree doit etre le dispatcher.

### Etat Existant

Le systeme a deja une base technique :

- le dispatcher peut produire un `memory_plan.targets` avec `type = action` ;
- le prompt dispatcher autorise la copie d'un `plan_item_id` depuis `plan_snapshot` si la cible est claire ;
- le memory runtime sait recuperer des memories par `plan_item_id` exact ;
- le loader sait ensuite etendre a une famille d'action via `action_family_key` ;
- `action_family.ts` contient deja une logique de construction d'`action_family_key`.

Donc le besoin n'est pas de creer le retrieval action from scratch.

Le besoin est de formaliser un contrat produit plus explicite :

> Le dispatcher doit identifier quand le user parle d'une action active ou d'une famille d'habitude, puis demander un `action_context` adapte.
> Le dispatcher doit aussi identifier quand le user parle du niveau, de la progression ou d'un pattern inter-niveau, puis demander une memoire de niveau.

### Besoins Memoire Dispatcher

Hors daily/weekly, le dispatcher doit distinguer deux besoins principaux :

- `need_action_memory` : le user parle d'une action precise, d'une mission, d'une clarification, ou d'une famille d'habitude.
- `need_level_memory` : le user parle du niveau, du plan courant, du niveau precedent, d'une transition, d'un pattern global d'execution, ou d'un probleme qui revient d'un niveau a l'autre.

Il n'y a pas de `need_execution_handoff`.

Le handoff de niveau est une source consultable par `need_level_memory`, pas un besoin separe.

### Action Reference Dispatcher

Le dispatcher devrait produire un signal structure, en plus ou en extension du `memory_plan`.

Contrat conceptuel :

```json
{
  "action_reference": {
    "status": "identified|ambiguous|none",
    "reference_type": "specific_action|habit_family|past_action|unknown",
    "action_type": "habit|mission|clarification|unknown",
    "plan_item_id": "string|null",
    "occurrence_id": "string|null",
    "action_family_key": "string|null",
    "target_hint": "string|null",
    "confidence": "high|medium|low",
    "evidence": ["string"]
  }
}
```

Ce champ ne doit pas executer d'effet.

Il sert uniquement a :

- mieux charger la memoire ;
- mieux resoudre les pronoms et references implicites ;
- injecter le bon contexte action dans la reponse.

### Level Memory Reference Dispatcher

Le dispatcher doit aussi pouvoir produire une cible de memoire de niveau.

Contrat conceptuel :

```json
{
  "level_reference": {
    "status": "identified|ambiguous|none",
    "reference_type": "current_level|previous_level|level_transition|global_execution_pattern|unknown",
    "level_id": "string|null",
    "previous_level_id": "string|null",
    "target_hint": "string|null",
    "confidence": "high|medium|low",
    "evidence": ["string"]
  }
}
```

Ou, si on garde tout dans `memory_plan`, une target dediee :

```json
{
  "type": "level",
  "key": "current_level|previous_level|level_transition",
  "query_hint": "meme probleme que le niveau precedent",
  "retrieval_policy": "semantic_first",
  "expansion_policy": "include_level_execution_handoff"
}
```

Cette cible doit permettre au loader de recuperer :

- le handoff du niveau precedent ;
- les interpretations weekly de niveau ;
- les patterns d'execution globaux du niveau courant ;
- les decisions recentes de trajectoire.

### Missions Et Clarifications

Pour une mission ou clarification, le loader doit prioriser :

- memoire exacte du `plan_item_id` ;
- occurrences recentes de cette action ;
- reports recents ;
- raisons de non-execution ;
- interpretation weekly liee a cette action.

La logique reste centree sur l'action precise.

Exemple :

> "la mission agenda me gonfle"

Le dispatcher identifie `Bloquer tes creneaux de la semaine`.

Le runtime charge :

- les derniers daily sur cette mission ;
- les reports ;
- les raisons ;
- l'interpretation weekly si elle existe.

### Habitudes Et Familles D Habitudes

Pour une habitude, le loader ne doit pas se limiter au `plan_item_id` actif.

Une habitude peut etre representee dans le systeme par plusieurs versions ou variantes :

- meme habitude avec 2 repetitions ;
- meme habitude avec 4 repetitions ;
- meme habitude avec 6 repetitions ;
- meme habitude avec 9 repetitions ;
- meme habitude dans une autre semaine du niveau.
- version plus facile ;
- version plus difficile ;
- action soeur du meme niveau qui teste la meme capacite d'execution.

Produitement, c'est souvent la meme base d'execution qui evolue.

Donc si le dispatcher identifie une habitude active, le runtime doit charger :

- memoire exacte du `plan_item_id` actif ;
- memoire de la `action_family_key` ;
- memoire d'execution partagee du niveau ;
- versions recentes de cette habitude ;
- habitudes-soeurs recentes du meme niveau si elles partagent la meme mecanique ;
- targets hebdomadaires proches ;
- interpretations weekly recentes ;
- anciens patterns seulement s'ils recoupent les signaux recents.

Important :

- les stats brutes ne doivent pas etre fusionnees ;
- les apprentissages d'execution peuvent etre mutualises.

Exemple :

- "Faire 6 sessions focus" et "Faire 9 sessions focus" gardent leurs scores separes ;
- mais les deux peuvent partager le pattern "le demarrage est difficile quand les creneaux ne sont pas bloques avant midi".

Autre exemple :

- "Marche 20 min" et "Session focus 2h" peuvent rester separees si leurs mecanismes sont differents ;
- mais si le weekly detecte un pattern global "les habitudes longues echouent le soir par fatigue", ce pattern peut vivre dans la memoire d'execution du niveau.

### Fraicheur Dans Les Habitudes

La fraicheur est critique.

Exemple :

- semaine 1 : target 2 repetitions ;
- semaine 2 : target 4 repetitions ;
- semaine 3 : target 6 repetitions.

En semaine 3, la version 6 repetitions est prioritaire.

La version 4 repetitions reste pertinente.

La version 2 repetitions devient moins pertinente, sauf si le meme blocage revient.

Le loader devrait donc ponderer :

- item actif : tres fort ;
- semaine precedente : fort ;
- deux semaines avant : moyen/faible ;
- ancien pattern confirme : moyen ;
- vieille observation isolee : faible ou ignoree.

### Extension De Memory Plan

Le `memory_plan.targets[type=action]` peut rester le vehicule de retrieval, mais il devrait porter plus d'information.

Exemple conceptuel :

```json
{
  "type": "action",
  "plan_item_id": "active-item-id",
  "key": "habit:session_focus_2h",
  "query_hint": "sessions focus",
  "action_type": "habit",
  "retrieval_policy": "semantic_first",
  "expansion_policy": "exact_then_action_family_recent"
}
```

Pour mission / clarification :

```json
{
  "type": "action",
  "plan_item_id": "mission-id",
  "query_hint": "bloquer mes creneaux",
  "action_type": "mission",
  "expansion_policy": "exact_action_only"
}
```

### Pourquoi Le Dispatcher Est Important

Sans ce signal, Sophia peut charger une memoire trop generale.

Avec ce signal, elle peut repondre avec une vraie continuite :

- "tu avais deja mentionne que cette action bloque surtout le soir" ;
- "la derniere fois, quand tu l'as faite tot, c'etait plus simple" ;
- "la target a augmente cette semaine, donc ce raté n'a pas la meme signification qu'un oubli ponctuel" ;
- "sur cette mission precise, le blocage revient deux fois : on peut comprendre ce qui rend le passage difficile."

Le dispatcher ne doit pas produire l'analyse finale.

Il doit seulement flaguer :

- quelle action est visee ;
- quel type d'action ;
- si c'est une famille d'habitude ;
- quel contexte memoire charger.

## Gating Daily / Weekly

La memoire action du dispatcher doit etre desactivee pendant les flows daily et weekly.

Raison :

- le daily skill recoit deja son `action_intelligence` en amont ;
- le weekly skill recoit deja son contexte action/semaine en amont ;
- ce contexte doit rester stable pendant toute la duree du skill ;
- refaire un retrieval action dispatcher a chaque tour peut injecter une version differente du contexte ;
- cela peut creer des contradictions entre l'etat du skill et le contexte conversationnel ;
- cela augmente le risque que Sophia sorte du flow de collecte/analyse.

Regle produit :

> Hors daily/weekly, le dispatcher peut identifier une action active et demander un `action_context`.
> Pendant daily/weekly, le dispatcher ne fait pas de retrieval action additionnel : le skill utilise le contexte action embarque dans son state.

### Comportement Attendu

Si `active_skill_state.skill_id` correspond a un flow daily ou weekly :

- ne pas produire d'`action_reference` dispatcher, ou le mettre a `status = none` ;
- ne pas produire de `level_reference` dispatcher, ou le mettre a `status = none`, sauf sortie explicite du flow ;
- ne pas ajouter de `memory_plan.targets[type=action]` pour le tour courant ;
- ne pas ajouter de `memory_plan.targets[type=level]` pour le tour courant ;
- continuer le skill actif si le user reste dans le flow ;
- laisser le skill utiliser son `action_intelligence` / weekly context deja charge ;
- ne pas proposer d'operation sauf demande explicite du user.

Les flows concernes :

- `daily_action_review_v1` ;
- `weekly_adaptive_review_v1` ;
- futurs skills de review qui portent deja leur propre contexte action.

### Sortie De Flow

Le dispatcher peut reprendre son retrieval action normal seulement si :

- le skill est termine ;
- le user quitte explicitement le flow ;
- le message est une demande claire hors review ;
- un signal safety prioritaire impose de sortir.

Dans ce cas, le dispatcher peut a nouveau identifier une action active et charger un `action_context`.

### Effet Sur Tool Skill Opportunity

Pendant daily/weekly, les opportunites operationnelles doivent rester encore plus conservatrices.

Par defaut :

- pas d'offre de carte d'attaque ;
- pas d'offre de carte de defense ;
- pas d'offre de potion ;
- pas d'offre d'ajustement de plan ;
- sauf demande explicite du user.

Le daily/weekly peut poser une question humaine de comprehension, mais ne doit pas etre remplace par un flow operationnel.

## Plan D Implementation

### S0 - Audit De L Existant

Objectif : comprendre exactement ce que Memory V2 sait deja faire sur les actions.

A verifier :

- comment les `chat_messages.metadata` flaguent daily/weekly ;
- comment les `user_plan_item_entries` sont exposees au memorizer ;
- comment le memorizer gere deja les action observations ;
- quelles cles d'idempotence existent ;
- comment le retrieval injecte les memories liees aux actions ;
- si les entries daily sont deja exclues de l'extraction libre depuis chat.
- comment `memory_plan.targets[type=action]` est produit par le dispatcher ;
- comment le loader utilise aujourd'hui `plan_item_id` exact puis `action_family_key`.
- comment la fin de niveau et le questionnaire de niveau sont stockes ;
- ou creer le `level_execution_handoff` sans doublon.

DoD :

- documenter le flux actuel daily -> chat message -> memorizer -> memory ;
- identifier les doublons possibles ;
- choisir la source canonique par type de donnee.

### S1 - Contrat Event Canonique

Objectif : verrouiller le contrat des observations daily/weekly.

Travail :

- lister les champs obligatoires des daily entries ;
- definir les champs weekly ;
- definir les champs du `level_execution_handoff` ;
- definir les cles d'idempotence ;
- definir les metadata chat utiles pour relier message, pending, entry et flow.

DoD :

- un event daily peut etre consomme une seule fois par le memorizer ;
- le memorizer peut retrouver la preuve texte ;
- le weekly peut distinguer fait brut, interpretation, et decision.
- le niveau termine produit une memoire legere idempotente.

### S2 - Memorizer Action Consolidation

Objectif : faire du memorizer le point unique de consolidation.

Travail :

- consommer les observations `daily_action_review_v1` ;
- consommer ensuite les observations `weekly_adaptive_review_v1` ;
- consommer / creer les observations `level_execution_handoff` ;
- creer ou mettre a jour une action profile ;
- eviter la creation de souvenirs doublons depuis le transcript ;
- renforcer un pattern seulement avec evidence suffisante.

DoD :

- deux daily identiques ne creent pas deux memories ;
- une action ratee deux fois renforce un pattern ;
- une action faite apres un vieux blocage reduit le poids du vieux blocage.
- un niveau termine cree un handoff sans dupliquer les memories daily/weekly.

### S3 - Retrieval Action Context

Objectif : injecter aux skills un contexte action court, frais, et utile.

Travail :

- construire un loader `action_context` par `plan_item_id` / `occurrence_id` ;
- construire un loader `level_context` pour niveau courant / precedent / transition ;
- trier par fraicheur et pertinence ;
- separer recent observations, patterns, weekly interpretations ;
- limiter la taille injectee.

DoD :

- daily skill recoit un contexte par action ciblee ;
- weekly skill recoit une synthese par action importante ;
- conversation normale peut recuperer le contexte si le user parle d'une action.
- conversation normale peut recuperer un `level_execution_handoff` si le user parle du niveau ou d'un pattern inter-niveau.

### S4 - Dispatcher Action Reference

Objectif : permettre l'injection d'action memory et level memory hors daily/weekly.

Travail :

- ajouter ou formaliser un signal `action_reference` dans le TurnFrame ;
- ajouter ou formaliser un signal `level_reference` ou une target `memory_plan.targets[type=level]` ;
- faire detecter par le dispatcher les references a une action active depuis `plan_snapshot` ;
- faire detecter par le dispatcher les references au niveau courant, au niveau precedent, ou a une transition de niveau ;
- distinguer `specific_action` et `habit_family` ;
- distinguer `need_action_memory` et `need_level_memory` dans la partie memory du dispatcher ;
- pour mission/clarification, produire une cible exacte ;
- pour habitude, produire la cible active + `action_family_key` si disponible ;
- enrichir `memory_plan.targets[type=action]` avec une `expansion_policy` ;
- enrichir `memory_plan.targets` pour supporter le niveau / handoff si besoin ;
- ajouter le gating daily/weekly : pas de retrieval action dispatcher pendant un skill review actif ;
- ne jamais declencher d'effet depuis ce signal.

DoD :

- "j'ai encore rate mes sessions focus" identifie l'habitude active et sa famille ;
- "la mission agenda me gonfle" identifie la mission precise ;
- "j'ai l'impression que le meme probleme revient que dans le niveau precedent" produit `need_level_memory` ;
- une reference ambigue reste `ambiguous` ;
- le loader charge exact action pour mission/clarification ;
- le loader charge exact + famille recente pour habitude ;
- le loader charge `level_execution_handoff` pour une reference au niveau precedent ;
- les vieilles observations isolees sont de-priorisees.
- avec `active_skill_state.skill_id=daily_action_review_v1`, le dispatcher ne produit pas de cible action supplementaire ;
- avec `active_skill_state.skill_id=weekly_adaptive_review_v1`, le dispatcher ne produit pas de cible action supplementaire.

### S5 - Human Tone In Daily Skill

Objectif : rendre Sophia plus vivante sans casser la mission de collecte.

Travail :

- ajouter des instructions d'intention de ton au skill ;
- utiliser `suggested_tone` si present ;
- feliciter les actions faites ;
- rassurer les echecs ponctuels ;
- etre plus attentive aux echecs repetes ;
- ne pas proposer d'operation automatiquement.

DoD :

- completed -> acknowledgement positif court ;
- first missed -> rassurant + confirmation d'utilite si necessaire ;
- repeated missed -> question supportive plus fine ;
- aucun texte hardcode ;
- aucun flow operation declenche sans demande explicite.

### S6 - Weekly Enrichment

Objectif : faire du weekly le producteur d'interpretations stables.

Travail :

- agreger les daily entries de la semaine ;
- identifier patterns par action ;
- enrichir les action profiles ;
- marquer les interpretations avec fraicheur/confiance ;
- injecter ces interpretations dans les futurs daily.

DoD :

- une habitude crescendo garde son historique d'une semaine a l'autre ;
- le weekly distingue raté ponctuel et difficulte structurelle ;
- les prochaines daily reviews utilisent cette comprehension.

### S7 - QA Conversationnelle

Objectif : verifier que le systeme est vivant, coherent, et non redondant.

Scenarios minimum :

- action faite apres un ancien blocage ;
- action ratee une premiere fois ;
- meme action ratee une deuxieme fois ;
- habitude crescendo ratee quand target augmente ;
- mission reportee plusieurs fois puis abandonnee ;
- clarification trop abstraite transformee en discussion weekly ;
- 4 actions / 2 plans avec action context par groupe.
- conversation normale qui mentionne une mission active ;
- conversation normale qui mentionne une habitude avec versions 2/4/6 repetitions ;
- dispatcher action_reference ambiguous quand plusieurs actions peuvent matcher.
- daily actif : verifier que le dispatcher ne reinjecte pas action memory pendant une clarification ;
- weekly actif : verifier que le dispatcher garde le contexte weekly stable.
- nouveau niveau : daily recoit un resume leger du niveau precedent si pertinent ;
- conversation normale : reference au niveau precedent declenche `need_level_memory`, pas `need_action_memory`.

DoD :

- transcript naturel ;
- pas de doublon memorizer ;
- contexte injecte correct ;
- Sophia ne surreagit pas aux vieilles infos ;
- Sophia devient plus attentive quand les signaux recents convergent.

## Risques Et Edge Cases

### Sortie Explicite D Un Daily / Weekly

Pendant un daily ou weekly actif, le dispatcher action memory est desactive.

Mais le user peut vouloir sortir clairement du flow.

Exemples :

- "attends, oublie le bilan, je veux parler de cette action maintenant" ;
- "stop le weekly, j'ai besoin de comprendre pourquoi cette action bloque" ;
- "on reprendra le bilan apres".

Regle :

- tant que le user reste dans le flow, le dispatcher ne reinjecte pas de memoire action ;
- si le user demande explicitement de quitter ou mettre en pause le flow, le skill doit etre suspendu ou cloture proprement ;
- seulement apres cette sortie, le dispatcher peut reactiver `need_action_memory` ou `need_level_memory`.

DoD :

- une clarification daily normale ne declenche pas de retrieval action dispatcher ;
- une sortie explicite du flow permet de reprendre le routing normal ;
- le state du skill indique s'il est paused / stopped / completed.

### Correction D Une Observation Action

Le user peut corriger une information deja enregistree.

Exemples :

- "en fait je l'avais faite hier, pas ratee" ;
- "je me suis trompe, ce n'etait pas la marche mais l'audit" ;
- "ne garde pas fatigue comme raison, c'etait surtout un imprevu".

Regle :

- ne pas ajouter simplement une nouvelle memoire contradictoire ;
- relier la correction a l'observation source ;
- affaiblir, corriger ou superseder l'observation precedente ;
- garder une trace de correction si necessaire pour l'audit.

Le memorizer doit donc supporter une logique de correction :

- `supersedes_event_id` ou equivalent ;
- `corrected_observation_ref` ;
- `confidence_delta` ;
- `correction_reason`.

DoD :

- une correction ne cree pas deux patterns contradictoires ;
- le contexte injecte montre la version corrigee ;
- l'ancien signal n'est plus utilise comme evidence forte.

### Memoire Partagee Vs Statistiques Separees

Ce point doit rester strict.

Pour les habitudes :

- les apprentissages d'execution peuvent etre mutualises ;
- les statistiques ne doivent pas etre fusionnees.

Exemples :

- pattern partage : "les actions longues echouent le soir" ;
- statistique separee : "session focus 4/6" vs "marche 2/3".

DoD :

- aucun score hebdomadaire n'est calcule en fusionnant deux habitudes differentes ;
- les patterns partages sont marques comme `execution_pattern`, pas comme metrique ;
- le weekly peut citer un pattern commun sans melanger les targets.

### Budget D Injection

Le risque principal est de surcharger Sophia avec trop de memoire.

Budget recommande pour `action_context` :

- 2 ou 3 observations recentes maximum ;
- 1 ou 2 patterns maximum ;
- 1 interpretation weekly maximum ;
- 1 signal de niveau / handoff maximum si pertinent ;
- aucune vieille observation isolee sans recoupement recent.

Budget recommande pour `level_context` :

- 1 handoff de niveau maximum ;
- 2 patterns de niveau maximum ;
- 1 decision weekly recente maximum ;
- resume court, pas de transcript brut.

DoD :

- le contexte injecte reste court ;
- chaque element injecte a une raison de presence ;
- le loader peut expliquer pourquoi un item a ete inclus ou ignore.

### Actions Qui Changent De Sens

Deux actions peuvent avoir le meme titre mais un objectif different.

Exemples :

- "Faire une marche" dans un niveau energie ;
- "Faire une marche" dans un niveau anxiete ;
- "Session focus" pour construire une habitude ;
- "Session focus" pour tester une strategie differente.

Regle :

- le niveau / phase / transformation doit etre dans la cle de contexte ;
- les memories d'un autre niveau ne doivent etre injectees que via `level_execution_handoff` ou pattern transversal faible ;
- une action de meme titre dans un autre objectif ne doit pas etre traitee comme la meme action exacte.

DoD :

- exact action memory reste scoped au niveau / plan item ;
- cross-level memory passe par handoff ou pattern transversal faible ;
- Sophia ne dit pas "comme d'habitude" sur la base d'un vieux titre similaire hors contexte.

### Privacy Et Sensibilite

Certaines raisons d'echec peuvent etre sensibles :

- honte ;
- conflit relationnel ;
- sante ;
- addiction ;
- trauma ;
- detresse emotionnelle.

Regle :

- ne pas injecter brutalement un vieux signal sensible dans un daily banal ;
- preferer une formulation abstraite ou douce ;
- respecter les niveaux de sensibilite Memory V2 ;
- ne pas exposer un detail sensible si un signal plus general suffit.

Exemple :

- mauvais : "la derniere fois tu avais dit que tu avais honte apres ton conflit avec X" ;
- meilleur : "je garde en tete que certains soirs sont plus charges emotionnellement".

DoD :

- les action profiles conservent la sensibilite ;
- le loader filtre ou generalise les details sensibles ;
- les daily/weekly restent humains sans etre intrusifs.

### Observabilite

Le systeme doit etre inspectable.

Evenements a logger :

- `action_reference_detected` ;
- `level_reference_detected` ;
- `action_context_loaded` ;
- `level_context_loaded` ;
- `action_context_ignored_active_daily` ;
- `action_context_ignored_active_weekly` ;
- `exact_action_memory_loaded` ;
- `action_family_memory_loaded` ;
- `level_handoff_loaded` ;
- `memory_item_included_with_freshness` ;
- `memory_item_ignored_stale` ;
- `memory_item_ignored_sensitive` ;
- `daily_weekly_context_embedded_in_skill_state`.

Chaque log utile doit inclure :

- user_id ;
- turn_id / request_id ;
- action_reference status ;
- plan_item_id si disponible ;
- action_family_key si disponible ;
- level_id si disponible ;
- source memory ids ;
- freshness bucket ;
- reason included / ignored.

DoD :

- on peut expliquer pourquoi Sophia a eu telle memoire ;
- on peut verifier que le dispatcher n'a pas reinjecte d'action memory pendant daily/weekly ;
- on peut diagnostiquer exact vs family memory ;
- on peut verifier que les infos sensibles ou trop anciennes ne sont pas injectees.

## Decisions Recommandees

### 1. Nature De `action_profile`

`action_profile` ne doit pas commencer comme une nouvelle table metier.

Decision recommandee :

- utiliser les memory items existants ;
- ajouter un `memory_type` dedie, par exemple `action_profile` ou `action_execution_profile` ;
- materialiser une table separee seulement si les requetes ou les besoins d'indexation deviennent trop lourds.

Raison :

> Le systeme garde une memoire unifiee au lieu de creer une deuxieme architecture parallele.

### 2. Cle `action_profile_key` Pour Les Habitudes

Pour une habitude qui traverse les semaines, la cle doit representer la famille comportementale, pas seulement l'occurrence.

Decision recommandee :

- `user_id`
- `transformation_id`
- `level_id` ou `plan_id`
- `habit_base_key` / `action_family_key`

La cle ne doit pas etre seulement le titre.

Exemple logique :

> Une meme habitude avec target 2x, 4x, 6x partage une famille d'execution. Deux habitudes differentes dans le meme niveau ne fusionnent pas.

### 3. Consommation Des Entries Par Le Memorizer

Le memorizer ne doit pas consommer `user_plan_item_entries` comme un flux live non controle.

Decision recommandee :

- garder `user_plan_item_entries` comme log canonique brut ;
- creer un job dedie de consolidation ;
- lire les nouvelles entries non consolidees ;
- produire / mettre a jour les memory items ;
- marquer la source comme traitee de maniere idempotente.

### 4. Message Daily Deja Extrait

Un message daily qui a produit une extraction structuree canonique ne doit pas etre rememorise comme une simple conversation.

Decision recommandee :

- lier le message a son extraction avec `source_message_id`, `source_skill_run_id`, `structured_extraction_id` ou equivalent ;
- faire en sorte que le memorizer voie ce lien et privilegie l'entry structuree.

Regle :

> Si une extraction daily canonique existe, elle devient la source principale. Le texte du chat peut servir de preuve, pas de deuxieme memoire.

### 5. Budget Maximal Pour `action_context`

Le daily skill doit recevoir un contexte court.

Budget recommande :

- 2 ou 3 observations recentes maximum ;
- 1 ou 2 patterns maximum ;
- 1 interpretation weekly maximum ;
- 1 signal de niveau / handoff maximum si le contexte le justifie.

Regle :

> Le contexte doit aider Sophia a etre fine, pas lui donner un dossier complet.

### 6. Expiration Des Interpretations Weekly

Une vieille interpretation weekly doit s'affaiblir par ponderation, pas disparaitre brutalement.

Decision recommandee :

- reduire son poids avec le temps ;
- reduire son poids apres changement de niveau ;
- reduire son poids si des daily recents montrent un pattern different ;
- ne plus l'injecter par defaut quand elle passe sous un seuil de fraicheur / confiance.

Elle peut rester disponible en audit.

### 7. Contradiction Entre Weekly Et Daily Recents

Une interpretation weekly peut etre contredite par des daily recents, mais ne doit pas etre effacee silencieusement.

Decision recommandee :

- creer une nouvelle interpretation plus fraiche ;
- marquer l'ancienne comme `weakened`, `possibly_outdated` ou equivalent ;
- garder la contradiction tracable.

### 8. `action_reference`

A terme, `action_reference` doit devenir un champ dedie du TurnFrame.

Transition recommandee :

- conserver la compatibilite avec `memory_plan.targets[type=action]` ;
- faire evoluer le dispatcher vers un champ explicite qui distingue :
  - la detection d'une action active ;
  - la decision de charger de la memoire.

### 9. `expansion_policy` Pour Les Habitudes

Le loader d'habitude doit charger peu, mais bien.

Policy recommandee :

- action exacte actuelle ;
- versions de la meme habitude dans le niveau courant sur 2 ou 3 semaines recentes ;
- 1 interpretation weekly recente ;
- niveau precedent seulement avec poids faible si nouveau niveau ou transition pertinente.

Par defaut, ne pas charger plus large.

### 10. Fallback Quand `action_family_key` Est Absent

Le fallback doit etre deterministe mais considere comme moins fiable qu'une cle explicite.

Fallback recommande :

- `level_id`
- titre normalise ;
- `action_type`
- axe / objectif / dimension si disponible.

Regle d'implementation :

> Idealement, le plan generator doit produire un `habit_base_key` explicite. Le fallback ne sert que de filet de securite.

### 11. Stockage De `action_intelligence` Dans Le State Daily / Weekly

`action_intelligence` doit vivre dans le state du skill pendant le flow, pas devenir une memoire durable directe.

Decision recommandee :

- stocker le contexte injecte dans `skill_state.action_intelligence_by_occurrence_id` ou equivalent ;
- enrichir ce state pendant la conversation ;
- produire a la fin des observations structurees canoniques ;
- laisser le memorizer consolider ensuite.

### 12. `level_reference`

A terme, `level_reference` doit devenir un champ dedie du TurnFrame.

Transition recommandee :

- conserver `memory_plan.targets[type=level]` comme mecanisme de retrieval ;
- ajouter une representation explicite dans le TurnFrame quand le user parle :
  - du niveau courant ;
  - du niveau precedent ;
  - d'une transition de niveau ;
  - d'un pattern global de plan.

### 13. Volume De `level_execution_handoff`

Le `level_execution_handoff` injecte dans un daily du nouveau niveau doit rester tres court.

Budget recommande :

- 3 a 5 lignes maximum ;
- ou 3 bullets internes maximum.

Contenu attendu :

- ce qui aide le user ;
- ce qui bloque souvent ;
- la vigilance principale pour le nouveau niveau.

Pas de transcript brut, pas de bilan complet.

### 14. Correction / Superseding Des Observations

Le modele doit etre append-only.

Decision recommandee :

- creer une nouvelle observation de correction ;
- lier cette correction avec `supersedes_observation_id` ou equivalent ;
- marquer l'ancienne observation comme `corrected`, `weakened` ou non fiable ;
- recalculer le profil action a partir de la version corrigee.

Regle :

> On ne supprime pas l'ancienne donnee sans trace. On la rend non fiable pour les decisions futures.

### 15. Sensibilite Qui Bloque L Injection Dans Un Daily Banal

Certaines informations ne doivent pas etre reinjectees directement dans un daily ordinaire.

Categories a bloquer ou generaliser fortement :

- sante mentale lourde ;
- trauma ;
- conflits familiaux ou relationnels intimes ;
- sexualite ;
- addiction ;
- finances tres sensibles ;
- honte personnelle forte ;
- information explicitement marquee privee par le user.

Regle :

> Une info sensible peut rester en memoire protegee, mais elle ne doit pas ressortir dans un daily banal sauf si le user la remet lui-meme dans la conversation ou si le contexte est explicitement approprie.

## Definition Of Done Globale

Le chantier est termine quand :

- le daily reste un capteur structure, pas une memoire parallele ;
- le memorizer consolide les observations action sans doublon ;
- les skills recoivent un `action_context` frais ;
- Sophia adapte son ton selon l'historique recent ;
- les habitudes conservent une intelligence semaine apres semaine ;
- le weekly enrichit les fiches action ;
- le dispatcher identifie les references a des actions actives hors daily/weekly ;
- le dispatcher identifie les references au niveau / niveau precedent via `need_level_memory` ;
- les habitudes chargent une memoire de famille ponderee par fraicheur ;
- les transitions de niveau produisent un `level_execution_handoff` leger et idempotent ;
- le dispatcher action memory est desactive pendant daily/weekly actifs ;
- les skills daily/weekly gardent un contexte action stable pendant toute la session ;
- les corrections utilisateur affaiblissent ou remplacent les observations fausses ;
- les statistiques restent separees meme quand les patterns d'execution sont mutualises ;
- le budget d'injection est borne et observable ;
- les informations sensibles sont filtrees ou generalisees avant injection ;
- les decisions de retrieval sont loguees avec raison d'inclusion ou d'exclusion ;
- les operations ne sont pas declenchees automatiquement depuis le daily ;
- les tests conversationnels prouvent que Sophia est plus humaine sans devenir intrusive.
