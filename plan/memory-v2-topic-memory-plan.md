# Plan Memoire V2 - Topics Vivants, Trace Legere, Memorizer Relie

## Introduction - Comprendre la memoire Sophia

Sophia est un coach conversationnel relie a WhatsApp, au dashboard, aux plans d'action et a une memoire durable. La memoire ne sert pas seulement a "se souvenir" de faits. Elle doit permettre a Sophia de garder une continuite relationnelle, de comprendre le fil d'un sujet, de retrouver les bonnes informations au bon moment, et de relier ce que le user dit a ce qu'il fait reellement dans son plan.

Le probleme principal n'est pas seulement le stockage. C'est l'orchestration : a chaque tour, Sophia doit savoir quelles informations charger sans tout injecter dans le prompt. La memoire doit donc etre organisee, typée, datée, reliée, et stabilisée d'un tour à l'autre.

### Les couches de memoire

La memoire Sophia doit etre comprise comme plusieurs couches complementaires.

1. Historique conversationnel

`chat_messages` reste la source de verite brute de ce qui a ete dit. Chaque message porte son contenu, sa date, son scope (`whatsapp`, `web`, etc.) et des metadata. C'est aussi dans ces metadata qu'on veut stocker la trace du topic actif via `metadata.topic_context`.

2. Topics conversationnels

Les topics sont les anciens "threads" dont on parlait. Un topic represente un sujet vivant dans la relation : une rupture, l'arret du cannabis, une difficulte au travail, un conflit familial, un blocage d'action, etc.

Un topic n'est pas juste un tag. C'est un dossier vivant avec :

- un titre ;
- des alias/keywords ;
- un resume vivant (`synthesis`) ;
- un `search_doc` riche pour le retrieval ;
- une etape de lifecycle (`candidate`, `ephemeral`, `durable`, `dormant`, `archived`) ;
- des liens vers events, global memories, user statements, actions, skills ;
- des pending updates qui seront compactees.

Le topic sert a maintenir le fil conversationnel. Par defaut, Sophia doit rester sticky sur le topic actif et ne switcher que si le nouveau sujet devient clairement le centre de gravite.

3. Memories atomiques

Les donnees atomiques sont les pieces de preuve ou d'information fine. Elles ne doivent pas toutes etre fondues directement dans un resume.

Categories principales :

- facts : faits explicites ou quasi explicites sur le user ;
- events : evenements dates ou quasi dates ;
- action memory signals : signaux issus du plan, des occurrences, des checks et des resultats d'action ;
- user statements : formulations fortes du user conservees comme paroles, pas comme verites objectives.

Ces objets atomiques gardent la granularite, la provenance et les dates.

4. Global memories / global profile

Les global memories sont des vues transversales par theme : psychologie, travail, relations, discipline, addictions, projets, etc. Elles servent quand le user pose une question large comme "tu peux me parler de ma psychologie ?" ou "qu'est-ce que tu sais de mon rapport au travail ?".

Elles ne remplacent pas les topics. Un topic comme "arret du cannabis" peut alimenter plusieurs global memories : addiction, discipline, environnement social, controle des impulsions. La global memory est donc une synthese transversale derivee de plusieurs preuves atomiques et topics.

5. Liens/provenance

Les links ne sont pas des souvenirs en soi. Ce sont les relations entre les objets :

- ce fact supporte tel topic ;
- cet event est lie a tel topic ;
- ce user statement nourrit telle global memory ;
- cette action est liee a tel blocage ;
- tel skill a ete lance dans tel topic.

Les links sont essentiels pour eviter que les summaries deviennent des textes flottants sans preuve. Ils permettent aussi de faire du retrieval par intersection : topic -> events/facts/global memories/actions lies.

6. Syntheses vivantes

Les topics et global memories ont une version synthetique :

- `topic.synthesis` pour le resume vivant du sujet ;
- `global_memory.canonical_summary` pour la vue transversale ;
- `search_doc` pour retrouver efficacement le topic.

Ces syntheses sont derivees de la couche atomique. Elles doivent etre mises a jour progressivement, avec pending updates et compaction quand un seuil est atteint.

### Runtime vs Memorizer

Il faut separer ce qui se passe pendant la conversation et ce qui se passe apres.

Le runtime conversationnel doit etre rapide :

- enregistrer le message ;
- choisir un `retrieval_mode` ;
- maintenir le topic actif via le topic router ;
- charger un payload memoire stable ;
- donner au modele les bonnes sections de contexte ;
- repondre au user.

Le memorizer travaille en asynchrone :

- il lit un batch limite de nouveaux messages et signaux ;
- il extrait facts/events/user statements/action-derived facts/topic updates/global updates ;
- il retrouve des candidats passes par RAG/shortlist ;
- il cree des liens fiables ;
- il ajoute des pending updates ;
- il compacte les summaries quand les seuils sont atteints.

Le memorizer ne doit pas relire toute la memoire. Le RAG propose des candidats ; l'IA tranche seulement sur une shortlist.

### Retrieval modes

Le topic-first est utile pour garder le fil, mais il ne suffit pas. Sophia doit choisir une porte d'entree memoire selon l'intention du message.

Modes principaux :

- `topic_first` : conversation courante autour d'un sujet vivant ;
- `global_profile_first` : question large sur le profil ou un domaine transversal ;
- `event_first` : rappel ou question sur un evenement date ;
- `plan_action_first` : action, planning, execution, blocage ou validation ;
- `safety_first` : crise, danger, detresse forte, auto-flagellation importante.

Chaque mode peut avoir des hints secondaires. Exemple : `topic_first + dated_reference` si le user dit "vendredi dernier" dans le fil courant. Si le resultat n'est pas fiable, le loader fallback vers un autre mode.

### Payload memoire stable

Sophia ne doit pas recevoir une memoire differente a chaque tour. Sinon elle devient incoherente. Il faut donc un payload stable :

- noyau constant : topic actif, resume du topic, derniers messages, global memories stables pertinentes ;
- modules temporaires : event/date, action specifique, safety, skill context, global profile query ;
- TTL court pour les memories injectees ;
- trace de ce qui a ete injecte au tour precedent ;
- budget fixe.

Cette stabilite est stockee dans `user_chat_states.temp_memory.__memory_payload_state_v1`.

### Objectif de la refonte

L'objectif n'est pas de construire un graphe parfait et omniscient. L'objectif est de rendre la memoire suffisamment structuree pour etre fiable, evolutive et utilisable dans une conversation naturelle.

La direction cible :

- topic comme fil conversationnel ;
- memories atomiques comme preuves ;
- global memories comme vues transversales ;
- links comme systeme de relation ;
- summaries comme vues compactes ;
- retrieval modes comme portes d'entree ;
- memorizer comme rangeur asynchrone ;
- payload stable comme garde-fou de coherence.

## Resume

On ne cree pas une memoire parallele de "threads". On fait evoluer `user_topic_memories` pour que les topics deviennent les dossiers vivants de conversation : sujet courant, continuite, historique compact, liens avec events/global memories/actions/skills, et retrieval cible.

Le runtime garde un topic actif leger, sticky par defaut. Le memorizer fait l'analyse lourde en differe : il enrichit les topics, cree les liens, met a jour le `search_doc`, et decide ce qui merite de rester.

Decisions verrouillees :

- pas de nouvelle table `conversation_topic_trace` au MVP ;
- trace topic par message dans `chat_messages.metadata.topic_context` ;
- etat courant dans `user_chat_states.temp_memory.__active_topic_state_v1` ;
- liens durables dans une nouvelle table `topic_memory_links` ;
- ajout d'une couche explicite `retrieval_mode` pour eviter que le topic-first devienne une prison ;
- pas de reactivation de `core_identity` pour l'instant ;
- pas d'appel IA topic router a chaque tour : IA seulement si suspicion de switch, nouveau sujet ou rappel memoire explicite.

## Changements Cles

### 1. Faire evoluer les topics existants

Ajouter a `user_topic_memories` les champs necessaires pour transformer les topics en dossiers vivants :

- `lifecycle_stage` : `candidate`, `ephemeral`, `durable`, `dormant`, `archived`.
- `importance_score` : score simple pour prioriser les topics.
- `active_days_count`, `last_active_at` : suivi d'usage reel.
- `search_doc` : texte riche de retrieval, construit progressivement.
- `search_doc_embedding` : embedding du `search_doc`.

Ne pas remplacer `status` existant : il reste le statut technique (`active`, `archived`, `merged`). `lifecycle_stage` porte la logique produit.

Backfill initial :

- topics existants `status='active'` -> `lifecycle_stage='durable'`.
- `search_doc` initial = titre + synthese + metadata utile + keywords existants.
- pas de suppression historique.

### 2. Ajouter les liens memoire-topic

Creer `topic_memory_links` pour relier un topic a ce qui a ete identifie dans son contexte :

- `topic_memory` vers autre topic ;
- `event_memory` ;
- `global_memory` ;
- `user_statement` ;
- `plan_item` ;
- `skill_run` ;
- plus tard : `scheduled_checkin`, `action_occurrence`.

Champs minimum :

- `user_id`, `topic_id`, `target_type`, `target_id`.
- `relation_type` : `mentioned_in`, `supports`, `caused_by`, `related_to`, `created_during`, `blocks`, `helps`.
- `confidence`.
- `first_observed_at`, `last_observed_at`, `observed_count`.
- `evidence_start_at`, `evidence_end_at`.
- `metadata`.

Contrainte d'unicite : un meme lien ne doit pas etre duplique pour le meme user/topic/target/relation.

### 3. Ajouter les user statements importants

Ajouter une categorie atomique dediee aux formulations fortes du user. Un `user_statement` n'est pas un fact abstrait : c'est une phrase ou une formulation que Sophia doit pouvoir retrouver parce que les mots exacts ont une valeur relationnelle, emotionnelle ou identitaire.

Exemples :

- "J'ai l'impression de toujours tout gacher."
- "Je veux vraiment arreter le cannabis, mais j'ai peur de perdre mes potes."
- "Mon pere m'a toujours fait sentir que je n'etais jamais assez."
- "Quand je rentre chez moi le soir, je lache tout."

Creer une table dediee, par exemple `user_memory_statements` :

- `id`
- `user_id`
- `statement_text`
- `normalized_summary`
- `statement_type` : `self_belief`, `fear`, `desire`, `boundary`, `relationship`, `pattern`, `other`
- `emotional_weight`
- `confidence`
- `source_message_id`
- `source_scope`
- `observed_at`
- `last_retrieved_at`
- `metadata`
- `created_at`
- `updated_at`

Regles :

- ne pas extraire toutes les phrases du user ;
- garder seulement les formulations fortes, recurrentes, utiles pour la continuite ou explicitement memorables ;
- ne pas transformer automatiquement un statement en verite objective ;
- un statement peut supporter un fact, un topic ou une global memory via `topic_memory_links`.

Dans le prompt, les statements doivent etre presentes comme paroles du user, pas comme facts. Exemple : "Le user a formule : ..." plutot que "Le user est ...".

### 4. Ajouter l'etat runtime du topic actif

Stocker dans `user_chat_states.temp_memory.__active_topic_state_v1` :

```ts
{
  active_topic_id,
  active_topic_title,
  lifecycle_stage,
  confidence,
  stickiness_score,
  switch_suspicion_score,
  previous_topic_id,
  candidate_topic_ids,
  last_decision,
  last_decision_reason,
  last_switched_at,
  updated_at,
  router_version
}
```

Cet etat est par `user_id + scope`. Donc WhatsApp et web peuvent avoir une continuite separee si necessaire.

### 5. Ajouter la trace par message

Apres decision du topic router, mettre a jour le message user deja insere dans `chat_messages` :

```ts
metadata.topic_context = {
  active_topic_id,
  active_topic_title,
  decision,
  confidence,
  previous_topic_id,
  candidate_topic_ids,
  skill_id,
  plan_item_id,
  router_version
}
```

Ajouter le meme `topic_context` au message assistant quand possible.

Utiliser `memory_observability_events` uniquement comme debug optionnel avec `event_name='topic_router.decision'`.

### 6. Topic Router Sticky

Creer un module runtime leger, appele apres debounce/state load et avant le chargement du contexte memoire.

Role unique : maintenir le fil conversationnel. Le topic router repond a la question "dans quel sujet sommes-nous maintenant ?". Il ne remplace pas le dispatcher, le retrieval mode, le loader ou le memorizer.

Entrees :

- message user ;
- topic actif actuel ;
- resume/search_doc du topic actif ;
- derniers messages recents ;
- `retrieval_mode` choisi par le dispatcher ;
- signaux date/action/safety/skill ;
- signaux de rupture explicite.

Deroule operationnel :

1. Appliquer les regles rapides.
   - messages courts, boutons, confirmations, "ok", "merci" : garder le topic actif ou ne rien changer.
2. Calculer la compatibilite avec le topic actif.
   - similarite semantique, lexical, entites, continuite, intention, rupture explicite.
3. Decider s'il faut chercher ailleurs.
   - compatibilite haute : `stay_current`.
   - compatibilite moyenne : rester sticky et surveiller.
   - compatibilite basse ou rupture : suspicion de switch.
4. Si suspicion, recuperer 3 a 5 candidats.
   - `search_doc_embedding`, title, keywords, synthesis, topics recents/dormants, topic precedent.
5. Trancher.
   - candidat evident : `switch_existing` ou `reopen_dormant`.
   - aucun candidat mais sujet important : `create_candidate`.
   - micro-digression : `side_note` ou `mark_trivial`.
   - ambigu : petit appel IA avec message + topic actif + candidats.
6. Ecrire l'etat.
   - `user_chat_states.temp_memory.__active_topic_state_v1`.
   - `chat_messages.metadata.topic_context`.
   - debug optionnel dans `memory_observability_events`.
7. Laisser le memorizer consolider.
   - le topic router peut creer un candidate, mais il ne decide pas seul qu'un topic est durable.

Regle d'or : rester sticky par defaut. Ne switcher que si le nouveau sujet devient clairement le centre de gravite.

Fonctionnement :

- par defaut : `stay_current`.
- pas d'IA pour les messages courts, confirmations, boutons, "ok", "merci".
- pas d'IA si le message reste clairement compatible avec le topic actif.
- suspicion de switch si :
  - changement explicite de sujet ;
  - rappel memoire explicite ;
  - faible compatibilite avec topic actif ;
  - nouveau sujet emotionnellement ou pratiquement dominant.
- si suspicion : retrieval de 3-5 candidats via keywords/title/search_doc, puis appel IA court qui choisit :
  - `stay_current`
  - `switch_existing`
  - `reopen_dormant`
  - `create_candidate`
  - `mark_trivial`
  - `side_note`

Si `create_candidate`, creer un topic leger `lifecycle_stage='candidate'`. Le memorizer decidera ensuite s'il devient durable, ephemeral ou trivial.

#### Compatibilite avec le topic actif

Le topic router ne doit pas dependre uniquement des keywords. Il doit d'abord mesurer si le nouveau message reste compatible avec le topic actif.

Signaux de comparaison :

- similarite semantique : embedding du message ou mini-contexte recent vs `search_doc_embedding` du topic actif ;
- recouvrement lexical : mots, alias, expressions ou entites deja associes au topic ;
- continuite conversationnelle : le message repond-il naturellement aux derniers tours ;
- entites/personnes : memes personnes, lieux, actions, objets ou relations ;
- intention : meme type de probleme, emotion, demande de conseil, souvenir, execution d'action ;
- rupture explicite : "sinon", "rien a voir", "au fait", changement brutal de cadre.

Interpretation :

- score haut : rester sur le topic actif ;
- score moyen : rester sticky mais surveiller, ou lancer un appel IA court si le risque d'erreur est important ;
- score bas avec rupture : suspecter un switch et chercher des candidats ;
- score bas sans candidat fiable : creer un `candidate topic` seulement si le nouveau sujet semble non trivial.

### 7. Ajouter les retrieval modes

Le topic est le fil vivant de la conversation, mais il ne doit pas devenir l'unique porte d'entree memoire. Certaines demandes doivent transcender le topic courant.

Le dispatcher doit donc produire un `retrieval_mode` avant le chargement memoire :

- `topic_first` : conversation courante autour d'un sujet vivant.
  - Exemple : "mon pere m'a encore enerve hier".
  - Strategie : chercher/maintenir le topic actif, puis charger ses links.
- `global_profile_first` : question large sur un domaine stable du profil.
  - Exemple : "tu peux me parler de ma psychologie ?".
  - Strategie : charger `user_global_memories` par theme/subtheme, puis les topics/events qui les supportent.
- `event_first` : rappel ou question sur un evenement date.
  - Exemple : "tu te souviens de mon entretien ?".
  - Strategie : chercher dans `user_event_memories`, puis remonter les topics/global memories lies.
- `plan_action_first` : demande liee aux actions, planning, objectifs ou execution.
  - Exemple : "j'ai pas fait mon action aujourd'hui".
  - Strategie : charger occurrences/actions/planning, puis topic/global memories utiles.
  - Note : `plan/action` n'est pas une memoire psychologique supplementaire. C'est une source structuree produit : plan items, occurrences datees, entries fait/partiel/pas fait, modifications, streaks et planning confirme.
- `safety_first` : danger, crise, auto-flagellation forte, risque eleve.
  - Exemple : message de crise ou detresse forte.
  - Strategie : priorite securite, contexte minimal fiable, pas de retrieval large non necessaire.

Regles de decision :

- `topic_first` est le mode par defaut pour une conversation naturelle.
- `global_profile_first` prime si le user demande une synthese transversale.
- `event_first` prime si la demande contient un rappel date ou un evenement identifiable.
- `plan_action_first` prime si le message concerne une action, un planning, une validation ou un blocage d'execution.
- `safety_first` prime sur tous les autres modes.

Le topic router continue de maintenir le fil actif meme quand le retrieval mode n'est pas `topic_first`. Exemple : une question "parle-moi de ma psychologie" peut etre `global_profile_first`, tout en gardant le topic courant en contexte secondaire.

Chaque `retrieval_mode` peut aussi porter des hints secondaires. Exemple : `topic_first` avec `dated_reference` si le user dit "vendredi dernier", ou `plan_action_first` avec `emotional_blocker` si le user parle d'une action non faite et d'un blocage affectif.

Le loader doit donc appliquer une logique progressive :

1. utiliser le mode principal ;
2. tester les hints secondaires ;
3. calculer une confiance sur les resultats ;
4. declencher un fallback controle si la confiance est trop faible.

La confiance ne doit pas dependre d'un seul score. Elle combine :

- score semantique : proximite embedding (`search_doc_similarity`, `event_similarity`, etc.) ;
- score lexical : mots/alias importants retrouves ;
- score temporel : coherence entre les dates mentionnees et les dates stockees ;
- score de continuite : compatibilite avec le topic actif et les derniers messages ;
- score de rupture : presence de signaux comme "rien a voir", "sinon", "au fait" ;
- score de provenance : lien existant via `topic_memory_links` ou simple match RAG.

Interpretation :

- confiance haute : utiliser le resultat directement ;
- confiance moyenne : utiliser avec prudence ou formuler une reponse qui laisse la porte ouverte ;
- confiance basse : fallback vers un autre mode ;
- conflit fort : appel IA court ou clarification naturelle.

Exemple : "vendredi dernier c'etait cool".

- Si le topic actif a un event lie autour de vendredi dernier : `topic_first + dated_reference`, confiance haute.
- Si aucun event lie au topic actif mais un event date ressort ailleurs : fallback `event_first`.
- Si plusieurs events plausibles existent : demander une clarification ou utiliser un appel IA court.

#### Resolution temporelle

Les references temporelles ne doivent pas etre devinees uniquement par le LLM. Ajouter une brique deterministe de resolution temporelle avant le retrieval event/date.

Entrees :

- `chat_messages.created_at` comme date d'ancrage du message ;
- timezone user si connue, sinon fallback `Europe/Paris` ;
- expression temporelle detectee : "vendredi dernier", "vendredi il y a deux semaines", "hier", "ce matin", "la semaine derniere", etc.

Sortie :

```ts
{
  raw_expression: string,
  resolved_start_at: string,
  resolved_end_at: string,
  time_precision: "instant" | "day" | "evening" | "week" | "approximate",
  confidence: number,
  timezone: string
}
```

Regles :

- produire une fenetre temporelle plutot qu'un instant unique ;
- "vendredi dernier" -> vendredi precedent en local, journee entiere ;
- "vendredi il y a deux semaines" -> vendredi de la semaine visee, journee entiere ;
- "vendredi soir" -> vendredi local, fenetre soir ;
- "la semaine derniere" -> semaine locale complete ;
- si plusieurs interpretations restent plausibles, demander clarification ou utiliser un appel IA court.

Cette resolution alimente ensuite :

- le score temporel dans la confiance retrieval ;
- la recherche `event_first` autour de la fenetre ;
- la recherche `topic_first + dated_reference` dans les events lies au topic actif ;
- le stockage futur dans `user_event_memories.time_precision`.

### 8. Adapter le chargement memoire

Le dispatcher ne doit pas porter toute la memoire. Il doit seulement produire/recevoir un plan memoire.

Le loader/orchestrator applique d'abord le `retrieval_mode`, puis charge les donnees dans un ordre stable.

Ordre par defaut en `topic_first` :

1. topic actif + synthese + search_doc court ;
2. memories directement liees au topic actif ;
3. derniers messages recents ;
4. event/global memories demandees par le dispatcher ou le skill ;
5. candidats topic seulement si switch suspecte.

Ordre par defaut en `global_profile_first` :

1. global memories du theme/subtheme demande ;
2. topics qui supportent ces global memories ;
3. events/facts directement lies ;
4. topic actif en contexte secondaire si utile.

Ordre par defaut en `event_first` :

1. event memories candidates ;
2. topics lies aux events retenus ;
3. global memories liees ;
4. messages recents si necessaire.

Ordre par defaut en `plan_action_first` :

1. action/planning/occurrence concernee ;
2. entries/events d'execution ;
3. momentum/action history utile ;
4. topics/global memories lies si pertinents.

Les donnees `plan/action` peuvent ensuite produire des facts ou patterns via le memorizer. Exemple : une occurrence ratee trois fois le soir peut devenir un fact du type "le soir semble fragile pour cette action", rattache au topic pertinent.

Ordre par defaut en `safety_first` :

1. signaux safety et etat de risque ;
2. derniers messages strictement utiles ;
3. topic actif si clairement utile ;
4. pas de retrieval large sauf necessite explicite.

Les skills declarent un `memory_profile` :

- `needs_current_topic`
- `needs_linked_events`
- `needs_linked_global_memories`
- `needs_plan_context`
- `can_request_extra_retrieval`

Un skill ne relance pas un gros retrieval a chaque tour. Il demande un complement seulement s'il manque une info concrete.

### 9. Stabiliser le memory payload

Sophia ne doit pas recevoir une memoire completement differente d'un tour a l'autre. Sinon elle peut paraitre incoherente : un souvenir apparait, disparait, puis revient sans logique.

Le loader doit donc construire un payload memoire stable, compose de deux parties.

Noyau constant :

- topic actif ;
- resume vivant du topic actif ;
- derniers messages recents ;
- global memories stables deja pertinentes ;
- contexte plan/action si une action est active dans la conversation ;
- etat skill si un skill est en cours.

Modules temporaires :

- event/date si reference temporelle ;
- action specifique si check, blocage ou modification ;
- safety si risque ou crise ;
- global profile query si demande transversale ;
- candidats topic si suspicion de switch ;
- contexte supplementaire demande par un skill.

Regles de stabilite :

- une memory injectee avec confiance suffisante reste disponible quelques tours, par defaut 3 tours ou 15 minutes ;
- une memory peut sortir plus vite si rupture forte de sujet, safety prioritaire, ou budget depasse ;
- les nouveaux modules temporaires ne doivent pas remplacer le noyau constant sans raison ;
- deux tours consecutifs ne doivent pas charger des souvenirs totalement differents sans decision explicite de switch/retrieval mode ;
- le budget total reste fixe pour eviter l'inflation de contexte.

Stocker l'etat leger dans `user_chat_states.temp_memory.__memory_payload_state_v1` :

```ts
{
  injected_items: [
    {
      type,
      id,
      reason,
      retrieval_mode,
      confidence,
      injected_at,
      ttl_turns_remaining,
      expires_at
    }
  ],
  core_items: [],
  temporary_items: [],
  last_retrieval_mode,
  last_topic_id,
  updated_at,
  version
}
```

Cet etat ne remplace pas la memoire durable. Il sert uniquement a maintenir une continuite de contexte entre les tours.

### 10. Structurer le payload memoire dans le prompt

Le prompt conversationnel ne doit pas recevoir un seul bloc flou de "memoire". Le payload doit etre type par section pour que le modele distingue resume, preuves, contexte global, events dates et donnees produit.

Sections recommandees :

- topic courant : resume vivant du sujet actuel, etat du fil, questions ouvertes, derniers changements ;
- memories liees au topic : facts, events, user statements, global memories et action signals directement rattaches au topic courant ;
- global profile : vues transversales utiles comme psychologie, travail, relations, discipline, addiction, uniquement si pertinentes ou demandees ;
- events dates : evenements proches, rappeles ou lies a une reference temporelle ;
- plan/action context : actions prevues, resultats, blocages, planning, momentum, si le message touche au plan ;
- conversation recente : derniers messages verbatim ou resumes courts ;
- skill context : etat, objectif et contraintes du skill actif.

Chaque item injecte doit porter au minimum :

- type ;
- id si disponible ;
- source/provenance ;
- fraicheur ou date ;
- confidence ;
- raison d'injection.

Objectif : le modele doit savoir si une information est un resume de topic, un fait atomique, un event date, une vue globale, une donnee action ou un etat de skill. Cela evite que Sophia transforme des hypotheses faibles en verites.

### 11. Adapter le memorizer

Le memorizer V2 est le rangeur asynchrone de la memoire. Il ne repond pas au user et ne doit pas bloquer la conversation. Son role est d'observer ce qui vient de se passer, extraire ce qui compte, creer les bons liens, puis mettre a jour les syntheses vivantes.

Fonctionnement global :

1. Recevoir un batch limite, pas tout l'historique.
2. Extraire les objets utiles : facts, events, user statements, action-derived facts, updates de topic et updates de global memories.
3. Valider ce qui merite d'etre garde : rejeter le banal, le redondant, le trop incertain ou le trop ephemere.
4. Retrouver les candidats passes via RAG/shortlist : topic actif, topics recents, topics proches, events proches, global memories par taxonomie, actions/plans concernes.
5. Creer les liens fiables entre objets : topic, global memory, event, action, user statement, skill.
6. Ajouter des pending updates aux topics/global memories touches.
7. Compacter seulement quand un seuil est atteint : topic synthesis, global canonical summary, search_doc et embeddings.
8. Gerer le lifecycle : candidate, ephemeral, durable, dormant, archived.

Principe central :

- le runtime garde la conversation fluide ;
- le memorizer range apres coup ;
- les objets atomiques gardent la preuve ;
- les topics/global memories gardent les vues synthetiques ;
- les links font le pont entre tout.

Le memorizer recoit desormais, en plus du transcript :

- topic actif au moment des messages ;
- `topic_context` des messages ;
- `retrieval_mode` utilise par le tour ;
- skill actif ;
- plan item/action concerne si disponible ;
- action memory signals issus du plan et des occurrences ;
- signaux safety/momentum ;
- decision topic router.

#### User statements

Le memorizer doit extraire les `user_statements` importants en plus des facts/events/global memories.

Processus :

1. Identifier les phrases du user dont la formulation exacte apporte de la valeur.
2. Verifier qu'elles ne sont pas simplement des small talks ou des reactions banales.
3. Persister la phrase originale dans `user_memory_statements`.
4. Ajouter un `normalized_summary` court pour retrieval et affichage.
5. Relier le statement au topic actif, a un event, a une global memory ou a une action si pertinent.
6. L'utiliser ensuite comme evidence ou tonalite, sans le presenter comme une verite objective.

Un statement peut nourrir :

- un fact : "le user associe les soirees a une perte de controle" ;
- un topic : "arret du cannabis" ;
- une global memory : "addictions / peur de perdre le lien social" ;
- un skill : crise, demotivation, auto-flagellation, blocage action.

#### Pipeline de linking memorizer

Le memorizer ne doit jamais injecter toute la memoire utilisateur pour creer les bons liens. Il doit fonctionner comme un moteur de recherche suivi d'un juge.

Pipeline cible :

1. Recevoir un batch limite :
   - nouveaux messages depuis le dernier run ;
   - `topic_context` des messages ;
   - `retrieval_mode` et hints ;
   - action memory signals ;
   - skill actif ;
   - dates resolues si disponibles.
2. Extraire les objets atomiques :
   - facts ;
   - events ;
   - user statements ;
   - action-derived facts ;
   - candidats global memory ;
   - updates de topic.
3. Recuperer des candidats passes, sans lire toute la memoire :
   - topic actif ;
   - topic precedent ou recemment actif ;
   - topics trouves via `search_doc`, title, keywords, synthesis ;
   - events proches via date + embedding ;
   - global memories via taxonomie `full_key` ;
   - actions/plan items concernes ;
   - liens existants autour des candidats.
4. Scorer les candidats :
   - similarite semantique ;
   - matching lexical/alias ;
   - proximite temporelle ;
   - coherence avec topic actif ;
   - provenance et liens existants ;
   - confiance du signal extrait.
5. Decider les liens :
   - si le score est evident, creer le lien sans IA ;
   - si plusieurs candidats sont proches, lancer un petit appel IA avec l'objet extrait + 3 a 8 candidats ;
   - si la confiance reste faible, ne pas forcer le lien.
6. Persister :
   - creer ou mettre a jour l'objet atomique ;
   - creer les `topic_memory_links` utiles ;
   - ajouter des pending updates aux topics/global memories touches.
7. Mettre a jour les vues synthetiques seulement si necessaire :
   - topic synthesis ;
   - global canonical summary ;
   - search_doc ;
   - embeddings associes.

Budget d'appels :

- extraction batch : IA ;
- validation batch : IA ;
- retrieval candidats : embeddings/RPC ;
- linking : IA seulement si ambigu ;
- compaction : asynchrone, seulement si seuil atteint.

Principe central : le RAG propose les candidats, l'IA tranche sur une shortlist. Pas d'injection massive de memoire.

#### Action memory signals

La memoire V2 ne doit pas etre construite uniquement a partir des mots du user. Le memorizer doit aussi recevoir des signaux structures issus des actions/plans, surtout quand la conversation parle d'une action, d'un blocage, d'une reussite ou d'un changement de planning.

Ces signaux ne sont pas une nouvelle memoire psychologique brute. Ce sont des inputs structures pour aider le memorizer a produire des memories fiables.

Inputs possibles :

- action officielle (`plan_item`) ;
- occurrence datee concernee ;
- statut d'execution : fait, partiel, pas fait ;
- historique recent de l'action sur la semaine ;
- streak ou rupture de streak ;
- action deplacee, reduite, modifiee ou supprimee ;
- commentaire WhatsApp lie a l'action ;
- heure/jour recurrent ou l'action bloque ;
- lien avec momentum ou baisse d'engagement.

Processus :

1. Le user parle d'une action ou repond a un check.
2. Le runtime rattache le message a l'action/occurrence si possible.
3. Le memorizer recoit le transcript + le topic actif + les action memory signals.
4. Il croise ce que le user dit avec les donnees reelles du plan.
5. Il decide quoi persister :
   - fact : "la fatigue du soir bloque souvent la marche" ;
   - event : "semaine difficile sur l'action marche" ;
   - global memory : "les actions en soiree sont plus fragiles" ;
   - topic link : rattacher au topic "difficulte a tenir le plan sante" ;
   - action link : rattacher au `plan_item` ou a l'occurrence concernee.

Exemple :

Le user dit : "j'ai pas reussi a faire la marche cette semaine, j'etais creve le soir."

Le memorizer voit aussi que l'action marche etait prevue trois fois, avec deux `missed` et un `partial`. Il peut alors produire une memoire plus fiable qu'avec le transcript seul : "la fatigue du soir semble etre un obstacle recurrent pour l'action marche", liee au topic pertinent et au `plan_item`.

Il continue d'extraire :

- durable topics ;
- event memories ;
- global memories.

Mais il ajoute maintenant :

- rattachement au topic courant si confiance haute ;
- creation de `topic_memory_links` pour events/global/plan/skill ;
- enrichissement du `search_doc` ;
- promotion `candidate -> durable/ephemeral` ;
- passage `durable -> dormant` si inactif ;
- archivage des triviaux/ephemeres inutiles.

Regle importante : ne pas forcer un lien topic si la confiance est faible. Mieux vaut une memoire non liee qu'un mauvais rattachement.

## Tests Et Scenarios

Ajouter des tests Deno pour :

- topic router : continuite simple, detail lateral, vrai switch, rappel ancien, trivial, skill actif.
- trace : `chat_messages.metadata.topic_context` est ajoute apres decision.
- retrieval : topic actif charge ses links avant les autres memories.
- memorizer : event/global memory extrait depuis un topic cree bien un lien date.
- lifecycle : candidate promu durable, candidate trivial archive, dormant rouvert.
- non-regression : core identity reste desactive.
- fallback : si topic router echoue, la conversation continue sans topic ou avec topic precedent.

Scenarios manuels WhatsApp a valider :

- "je reparle de ma rupture" apres plusieurs jours retrouve le bon topic.
- "mon chien me manque aussi" reste un detail lateral si le sujet principal est la rupture.
- "rien a voir, au travail..." switch correctement.
- un skill crise/demotivation garde la memoire utile sans ecraser le topic courant.
- un mini sujet logistique ne pollue pas les topics durables.

## Assumptions

- Les topics sont la nouvelle forme officielle des "threads".
- `chat_messages` reste la source de verite de l'historique conversationnel.
- `memory_observability_events` reste du debug, pas un etat produit.
- La memoire lourde reste asynchrone via memorizer/watcher.
- Le runtime doit rester rapide : pas d'appel IA topic router sur chaque message.
- Le retrieval mode est choisi par le dispatcher, applique par le loader, puis exploite par les skills/memorizer.
- Les anciennes tables `user_topic_memories`, `user_event_memories`, `user_global_memories` sont conservees et enrichies, pas remplacees.

## Points ouverts a challenger

Cette refonte est encore une phase R&D. Les points ci-dessous doivent etre explicitement analyses avant implementation complete.

### 1. Correction, oubli et contestation par le user

Le user doit pouvoir corriger Sophia :

- "non ce n'est pas ca" ;
- "tu as mal compris" ;
- "oublie ca" ;
- "ne retiens pas cette information" ;
- "ce n'est plus vrai".

Questions a trancher :

- comment detecter une correction explicite ;
- comment retrouver la memory ciblee ;
- faut-il supprimer, archiver, baisser la confiance ou ajouter une correction datee ;
- comment propager la correction vers topic synthesis, global summary, search_doc et links ;
- comment eviter que Sophia reutilise une memory invalidee.

Proposition initiale :

- ne jamais effacer brutalement sans demande claire ;
- ajouter un statut `invalidated` / `superseded` ou une confidence tres basse ;
- creer un audit trail de correction ;
- declencher une recompaction des summaries touchees.

### 2. Conflits memoire

Une nouvelle information peut contredire une ancienne.

Exemples :

- avant : "le soir est le moment le plus difficile" ;
- maintenant : "en fait le soir ca va mieux, c'est le matin qui bloque" ;
- avant : "il veut arreter le cannabis" ;
- maintenant : "il ne veut plus en faire un objectif central".

Questions :

- quand remplacer une memory ;
- quand garder les deux comme evolution datee ;
- comment marquer une ancienne memory comme obsolete ;
- comment le prompt doit presenter une evolution sans contradiction apparente.

Proposition initiale :

- garder les contradictions importantes comme evolution datee ;
- preferer `superseded_by` / `valid_until` plutot que supprimer ;
- faire porter aux summaries la formulation "auparavant..., recemment..." quand utile.

### 3. Privacy, sensibilite et retention

La memoire peut contenir des informations tres sensibles : addiction, sante, sexualite, famille, trauma, crise, auto-flagellation, relations, travail.

Questions :

- quelles categories sont sensibles ;
- quelles memories ne doivent pas etre injectees sauf besoin direct ;
- quelles memories doivent avoir une retention courte ;
- comment permettre suppression/export plus tard ;
- comment traiter les user statements tres crus ou vulnerables.

Proposition initiale :

- ajouter `sensitivity_level` sur les objets atomiques et links ;
- limiter l'injection prompt des memories sensibles au besoin conversationnel direct ;
- ne jamais afficher une formulation sensible comme fait objectif ;
- logger la provenance et permettre invalidation.

### 4. Memory verifier asynchrone

Ajouter une brique optionnelle de verification memoire, non bloquante.

Role :

- verifier si le topic actif etait probablement correct ;
- detecter une memory evidente manquante ;
- detecter un lien douteux ;
- detecter un summary stale ;
- signaler un besoin de compaction ;
- creer des hints pour le prochain memorizer run.

Contraintes :

- pas a chaque message ;
- seulement sur signaux : switch, fallback, faible confiance, conversation longue, skill important, contradiction, weekly review ;
- petit modele ;
- output limite : `ok`, `missing_memory`, `wrong_topic`, `stale_memory`, `needs_link`, `needs_compaction`.

Le verifier ne doit pas devenir un second dispatcher. Il audite et cree des taches/hints, il ne repond pas au user.

### 5. Evaluation et corpus de tests

Il faut un corpus dedie memoire, pas seulement des tests unitaires.

Scenarios a couvrir :

- continuité topic simple ;
- faux switch a eviter ;
- vrai switch sans keyword explicite ;
- rappel ancien dormant ;
- question globale type "parle-moi de ma psychologie" ;
- event date type "vendredi dernier" ;
- correction user ;
- oubli explicite ;
- contradiction ancienne/nouvelle ;
- topic lie a action signal ;
- user statement fort ;
- safety/skill prioritaire ;
- mauvais candidat RAG a refuser.

Metriques :

- taux de bon `stay_current` ;
- faux switchs ;
- faux creates ;
- links corrects ;
- memories injectees pertinentes ;
- taille du payload ;
- cout et latence memorizer ;
- taux de corrections necessaires.

### 6. Cout, frequence et budget d'appels

La refonte peut devenir couteuse si chaque tour lance trop d'appels.

Questions :

- quand lancer le memorizer ;
- combien de messages par batch ;
- quand lancer le linker IA ;
- quand lancer la compaction ;
- quand lancer le verifier ;
- quels appels peuvent etre heuristiques/embedding-only.

Proposition initiale :

- memorizer en batch async, pas sur chaque message ;
- extraction et validation batch ;
- RAG/embeddings pour shortlist ;
- IA linking seulement si ambigu ;
- compaction seulement sur seuil ;
- verifier opportuniste seulement sur signaux.

### 7. Ou vivent les facts atomiques ?

Le plan parle de facts atomiques, mais le repo actuel a plusieurs formes de facts :

- `user_global_memories.facts` dans une global memory ;
- `user_profile_facts` pour certains facts profil/conversation ;
- facts extraits dans `topic_memory.ts` comme partie d'un global candidate.

Question ouverte majeure :

- faut-il creer une table atomique dediee `user_memory_facts` ?
- ou garder les facts dans les global memories et les relier via links/provenance ?

Option A : pas de nouvelle table au MVP.

- Plus simple.
- Les facts vivent dans `user_global_memories.facts`.
- Les topics sont lies aux global memories.
- Risque : granularite/provenance faible.

Option B : creer `user_memory_facts`.

- Chaque fact devient un objet atomique date, source, confident, sensible, linkable.
- Les global memories deviennent vraiment des syntheses derivees.
- Plus robuste, mais plus complexe.

Recommendation provisoire :

- demander un avis externe sur ce point.
- Si l'objectif est une memoire tres fiable et auditable, `user_memory_facts` devient probablement necessaire.
- Si l'objectif est un MVP rapide, garder les facts dans global memories mais renforcer provenance et links.

## Exemples architecture memoire

Ces exemples servent a comprendre comment les couches interagissent.

### Exemple 1 - Topic cannabis vers global memories

Conversation :

Le user parle de son arret du cannabis, de la peur de perdre ses amis fumeurs, et du fait que les soirees sont difficiles.

Objets crees ou enrichis :

- topic : `arret_cannabis`
  - synthesis : "Le user travaille sur l'arret du cannabis. Le risque principal semble se concentrer dans les soirees et dans la peur de perdre le lien social avec certains amis."
  - search_doc : inclut cannabis, weed, amis fumeurs, soirees, peur de perdre le groupe, controle des impulsions.
- user statement :
  - "Je veux vraiment arreter le cannabis, mais j'ai peur de perdre mes potes."
- facts :
  - "Les soirees avec des amis fumeurs sont un contexte a risque."
  - "La peur de perdre le lien social rend l'arret plus difficile."
- global memories alimentees :
  - `addictions.cannabis`
  - `psychologie.discipline`
  - `relations.appartenance_sociale`
- links :
  - statement -> topic `arret_cannabis`
  - facts -> topic `arret_cannabis`
  - topic `arret_cannabis` -> global memory `addictions.cannabis`
  - topic `arret_cannabis` -> global memory `relations.appartenance_sociale`

### Exemple 2 - Action ratee vers fact puis topic/global

Donnees plan :

- action : "marcher 20 minutes"
- occurrences de la semaine : lundi missed, mercredi partial, vendredi missed

Conversation :

Le user dit : "J'ai pas reussi a faire la marche cette semaine, j'etais creve le soir."

Action memory signals :

- plan_item : marche 20 minutes ;
- 3 occurrences recentes ;
- 2 missed, 1 partial ;
- moment recurrent : soir ;
- commentaire WhatsApp : fatigue.

Objets produits :

- action-derived fact :
  - "La fatigue du soir semble bloquer l'action marche."
- event :
  - "Semaine difficile sur l'action marche."
- topic :
  - `tenir_plan_sante` ou topic actif lie a l'execution sante.
- global memory :
  - `psychologie.discipline` ou `habitudes.execution`
- links :
  - fact -> plan_item marche ;
  - fact -> topic `tenir_plan_sante` ;
  - topic -> global memory `habitudes.execution`.

### Exemple 3 - User statement et estime de soi

Conversation :

Le user dit : "J'ai l'impression de toujours tout gacher."

Traitement :

- ne pas transformer directement en fact objectif du type "le user gache tout" ;
- conserver comme `user_statement` ;
- relier au topic actif si la conversation porte sur rupture, echec, travail ou auto-flagellation ;
- eventuellement alimenter une global memory prudente.

Objets :

- user statement :
  - statement_text : "J'ai l'impression de toujours tout gacher."
  - statement_type : `self_belief`
  - emotional_weight : eleve
- global memory possible :
  - `psychologie.estime_de_soi`
  - inference prudente : "Le user formule parfois une croyance de soi tres dure dans les moments d'echec."
- links :
  - statement -> topic actif ;
  - statement -> global memory `psychologie.estime_de_soi`.

### Exemple 4 - Reference temporelle "vendredi dernier"

Contexte A :

- topic actif : `rendez_vous_galant`
- topic lie a un event vendredi dernier.

Message :

"C'est vrai que vendredi dernier c'etait cool."

Strategie :

- retrieval mode : `topic_first`
- hint : `dated_reference`
- resolution temporelle : vendredi precedent en timezone user, fenetre journee ou soir selon contexte.
- recherche d'abord dans les events lies au topic actif.
- si event trouve avec confiance haute, rester dans le topic.

Contexte B :

- topic actif : `travail_manager`
- aucun event lie au topic actif autour de vendredi dernier.

Strategie :

- tentative `topic_first + dated_reference` faible ;
- fallback `event_first` ;
- recherche events autour de vendredi dernier ;
- si plusieurs events plausibles, clarification naturelle.

### Exemple 5 - Question transversale global profile

Message :

"Tu peux me parler de ma psychologie ?"

Strategie :

- retrieval mode : `global_profile_first`
- ne pas se limiter au topic actif ;
- charger les global memories du theme `psychologie` ;
- charger les topics qui supportent ces global memories si utiles ;
- charger seulement quelques statements/facts/events tres representatifs.

Payload possible :

- global profile :
  - `psychologie.discipline`
  - `psychologie.estime_de_soi`
  - `psychologie.evitement`
- supporting topics :
  - `arret_cannabis`
  - `tenir_plan_sante`
  - `rupture_amoureuse`
- user statements representatifs :
  - "J'ai l'impression de toujours tout gacher."
- events/facts :
  - seulement ceux qui supportent la synthese.

### Exemple 6 - Payload prompt structure

Au lieu d'injecter un bloc "memoire" unique, le prompt recoit des sections :

```text
[Topic courant]
Topic: arret_cannabis
Resume: Le user travaille sur l'arret du cannabis...
Questions ouvertes: comment maintenir le lien social sans contexte fumeur.

[Memories liees au topic]
- Fact: Les soirees avec amis fumeurs sont a risque. Source: chat, confiance 0.82.
- Statement: "Je veux vraiment arreter le cannabis, mais j'ai peur de perdre mes potes." Source: WhatsApp, 2026-04-30.
- Event: Soiree difficile vendredi dernier. Precision: day, confiance 0.74.

[Global profile]
- addictions.cannabis: L'arret du cannabis est lie a la fois au controle des impulsions et a l'appartenance sociale.
- relations.appartenance_sociale: Le user craint parfois de perdre le lien en changeant d'habitudes.

[Plan/action context]
- Action: eviter le cannabis en soiree.
- Recent: 2 echecs, 1 partiel cette semaine.

[Conversation recente]
- derniers messages utiles.

[Skill context]
- aucun skill actif / ou skill demotivation actif.
```

Objectif : le modele voit ce qui est resume, preuve atomique, event date, global profile, donnees action et contexte conversationnel.












NB : 
Dispatcher
Il comprend l’intention du message :

conversation courante ;
question transversale ;
événement daté ;
action/plan ;
skill nécessaire.

Retrieval mode
Il choisit la porte d’entrée :

topic first ;
global/profile first ;
event first ;
plan/action first ;
safety first.

Topic router
Il maintient le fil vivant :

est-ce qu’on reste dans le même sujet ?
est-ce qu’on switch ?
est-ce qu’on crée un nouveau topic ?

Memory loader
Il charge les bonnes infos selon le mode.

Skill
Il utilise le contexte reçu, et demande un complément seulement si nécessaire.

Memorizer
Il range après coup :

topic ;
global memory ;
event ;
liens entre eux.
