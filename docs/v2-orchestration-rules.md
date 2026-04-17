# V2 Orchestration Rules

## Statut

Document canonique de regles d'orchestration pour la V2.

Ce document complete:

- [onboarding-v2-canonique.md](/Users/ahmedamara/Dev/Sophia%202/docs/onboarding-v2-canonique.md)
- [v2-systemes-vivants-implementation.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-systemes-vivants-implementation.md)
- [v2-technical-schema.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md)
- [v2-mvp-scope.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-mvp-scope.md)
- [v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)

Il repond a une question simple:

`Qui decide quoi, quand, avec quelle priorite, quels garde-fous, quels cooldowns et quels fallbacks ?`

Le but est d'eviter:

- les collisions entre moteurs
- les doubles decisions
- les messages incoherents
- les etats runtime contradictoires
- les redesigns "beaux sur le papier" mais fragiles en production

## 1. Principe directeur

La V2 doit fonctionner comme une orchestration hierarchisee.

Pas comme plusieurs systemes intelligents qui decident en parallele sans
coordination.

Ordre de logique ideal:

1. `les etats stables` disent ce qui existe
2. `les vues runtime` disent ce qui est vivant maintenant
3. `les moteurs d'analyse` lisent ces vues
4. `les moteurs de decision` proposent une posture ou une action
5. `les rails d'execution` appliquent ou programment
6. `les events` journalisent le resultat

## 2. Couches d'orchestration

## 2.1 Couche metier stable

Source de verite:

- cycle
- transformation
- plan
- plan_items
- metrics
- aspects
- rendez_vous persistés

Cette couche ne fait pas de decision proactive a elle seule.

## 2.2 Couche runtime

Objets runtime:

- `active_transformation_runtime`
- `plan_item_runtime`
- `active_load`
- `conversation_pulse`
- `momentum_state_v2`
- `proactive_runtime_context`

Cette couche reconstruit la situation courante.

## 2.3 Couche d'analyse

Moteurs:

- watcher
- conversation_pulse builder
- momentum classifier
- load engine
- memory retrieval by intent

Cette couche observe et consolide. Elle ne doit pas envoyer directement des
messages.

## 2.4 Couche de decision

Moteurs:

- daily bilan decision
- weekly bilan decision
- coaching selector
- proactive windows engine

Cette couche tranche.

## 2.5 Couche d'execution

Rails:

- router / companion response
- scheduled_checkins
- process-checkins
- dashboard surfaces

Cette couche execute.

## 3. Ownerships canoniques

## 3.1 Onboarding / cycle

Responsable:

- onboarding frontend + fonctions onboarding V2

Decide:

- creation du cycle
- validation des aspects
- cristallisation des transformations
- priorisation
- lancement du questionnaire
- creation du plan initial

Ne decide pas:

- momentum
- coaching runtime
- proactive messaging

## 3.2 Watcher

Responsable:

- observation asynchrone
- consolidation de signaux faibles
- production ou rafraichissement de certains snapshots

Decide:

- qu'un recalcul est pertinent
- qu'un signal doit etre consolide

Ne decide pas:

- d'envoyer un message
- de programmer seul un checkin
- de faire un coaching visible

## 3.3 Momentum engine

Responsable:

- classifier l'etat executionnel et relationnel
- produire une posture recommandee

Decide:

- `current_state`
- `recommended_posture`
- `plan_fit`
- `load_balance`

Ne decide pas:

- le contenu conversationnel final
- le scheduling concret

## 3.4 Daily bilan engine

Responsable:

- choisir si un daily est pertinent
- choisir son mode
- choisir ses cibles

Decide:

- `daily_bilan_v2` input/output

Ne decide pas:

- une reconfiguration lourde du plan
- une campagne proactive

## 3.5 Weekly bilan engine

Responsable:

- recalibrage hebdomadaire
- ajustements limites
- consolidation des wins / blocages

Decide:

- `hold / expand / consolidate / reduce`
- max 3 ajustements

Ne decide pas:

- une regeneration complete du plan
- plusieurs changements contradictoires

## 3.6 Coaching selector

Responsable:

- choisir si une intervention concrete est pertinente
- selectionner une technique ou conclure qu'il faut simplifier

Decide:

- `micro-coaching`
- `structural coaching`
- `skip`

Ne decide pas:

- le budget proactif global
- la politique de rendez-vous

## 3.7 Proactive windows engine

Responsable:

- centraliser les decisions de contact proactif hors reponse immediate

Decide:

- `create_window`
- `reschedule_window`
- `cancel_window`
- `downgrade_to_soft_presence`
- `skip`

Ne decide pas:

- le contenu final de chaque message seul
- la classification momentum

## 3.8 Router / companion

Responsable:

- la reponse immediate en conversation
- l'utilisation du contexte
- le rendu final de coaching si applicable

Decide:

- le wording final
- l'appel outil si necessaire

Ne decide pas seul:

- les rendez-vous
- les windows proactives
- les recalibrages weekly

## 3.9 Scheduled checkins / process-checkins

Responsable:

- execution temporelle
- delivery
- defer / annulation / reprise

Decide:

- si la fenetre planifiee est encore executable au moment reel

Ne decide pas en amont:

- quelle posture est la meilleure
- quelle strategie proactive est la bonne

## 3.10 Memory retrieval engine

Responsable:

- charger le bon contexte memoire selon l'intention runtime
- respecter les contrats de budget tokens par intention
- filtrer par couche (cycle/transformation/execution/coaching/relational/event)

Decide:

- quelles couches charger pour l'intention active
- combien de tokens allouer par couche
- quel ranking appliquer au retrieval

Ne decide pas:

- ce que le consommateur fait avec le contexte (c'est le router, le coaching
  selector, le nudge engine, etc.)
- quand le retrieval doit etre declenche (c'est le moteur consommateur qui le
  demande)

Voir
[v2-technical-schema.md section 5.7](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md)
pour les contrats canoniques par intention.

## 4. Priorite entre moteurs

## 4.1 Priorite absolue

Les priorites de protection doivent toujours ecraser les autres.

Ordre:

1. `pause_consentie`
2. `repair mode`
3. `soutien_emotionnel`
4. `proactive budget exceeded`
5. `cooldown block`

Tant qu'un de ces verrous est actif, les moteurs plus offensifs ne doivent pas
pousser.

## 4.2 Priorite de posture

Quand plusieurs lectures sont plausibles, prioriser:

1. proteger
2. alleger
3. soutenir
4. reouvrir
5. pousser legerement

Le systeme doit etre conservateur par defaut.

## 4.3 Priorite de temporalite

Quand plusieurs opportunites concurrentes existent:

1. `pre_event_grounding`
2. `repair`
3. `weekly bilan`
4. `daily bilan`
5. `morning presence`
6. `generic outreach`

Regle:

- un evenement reel et proche doit battre un rappel generique
- une reparation de lien doit battre un pilotage d'action

## 5. Sequence de recalcul recommandee

## 5.1 Apres message utilisateur

Sequence ideale:

1. persist message
2. update user_chat_state basic
3. retrieval contextuel
4. event / memory enrichments eventuels
5. recompute `conversation_pulse` si signal fort ou fenetre pertinente
6. recompute `momentum_state_v2`
7. evaluer coaching trigger
8. produire reponse compagnon
9. log events

## 5.2 Sur job asynchrone watcher

Sequence ideale:

1. lire activite recente
2. consolider memory/event signals
3. recompute `conversation_pulse` si utile
4. recompute `momentum_state_v2`
5. evaluer si une reevaluation proactive est necessaire
6. si oui, envoyer contexte au proactive windows engine
7. logguer decisions

## 5.3 Sur cron daily

Sequence ideale:

1. refresh runtime views
2. recompute `active_load`
3. recompute `conversation_pulse`
4. recompute `momentum_state_v2`
5. evaluer `daily_bilan_v2`
6. evaluer `proactive windows engine`
7. materialiser les checkins programmables

## 5.4 Sur cron weekly

Sequence ideale:

1. recompute weekly snapshot
2. build weekly digest
3. recompute momentum + active load
4. produire `weekly_bilan_v2`
5. materialiser ajustements retenus
6. evaluer rendez-vous / handoff si pertinent

## 6. Garde-fous de concurrence

## 6.1 Regle generale

Un meme user ne doit pas subir plusieurs decisions runtime contradictoires sur
une meme fenetre courte.

Il faut donc raisonner avec:

- idempotency keys
- dedupe keys
- freshness windows
- last_decision snapshots

## 6.2 Dedupe keys recommandees

Exemples:

- `daily_bilan:{user_id}:{local_date}`
- `weekly_bilan:{user_id}:{week_start}`
- `proactive_window:{user_id}:{window_kind}:{bucket}`
- `rendez_vous:{user_id}:{kind}:{source_ref}`
- `coaching:{user_id}:{turn_id}:{blocker_type}`

## 6.3 Freshness windows

Je recommande:

- `conversation_pulse`: stale apres 12h pour proactive, 24h pour weekly
- `momentum_state_v2`: stale apres 6h pour proactive, 12h pour dashboard
- `active_load`: stale apres toute modification de plan_item ou weekly
  adjustment

## 6.4 Lock logique

Au niveau orchestration, il faut au moins un verrou logique par user pour:

- generer une decision proactive
- appliquer un recalibrage weekly
- activer ou desactiver des items

Le verrou ne doit pas etre long. Il doit juste empecher les doubles executions
concurrentes.

## 7. Budget proactif et cooldowns

## 7.1 Budget proactif canonique

Le budget proactif doit distinguer 3 classes:

- `silent`
- `light`
- `notable`

Definitions:

- `silent` = aucune sortie proactive user-facing, ou simple effet
  systeme/dashboard
- `light` = presence legere, tres peu engageante
- `notable` = contact qui sollicite reellement l'attention du user

Classification recommandee:

- `silent`
  - recalculs runtime
  - dashboard surfaces passives
  - logs et snapshots
- `light`
  - `morning_presence`
  - `support_softly`
  - `open_door`
  - `celebration_ping`
- `notable`
  - `daily_bilan_v2` envoye proactivement
  - `weekly_bilan_v2` envoye proactivement
  - `pre_event_grounding`
  - `midday_rescue`
  - `rendez-vous`
  - `outreach`

Par defaut, pour les classes `notable`:

- max `1` proactive notable / jour
- max `3` proactives notables / 7 jours
- pas de cumul `morning + outreach + rendez-vous` le meme jour sauf raison forte

Pour les classes `light`:

- max `1` proactive light / jour
- pas de proactive light si une proactive notable a deja ete envoyee dans la
  meme fenetre locale, sauf exception forte

## 7.2 Cooldowns canoniques

- meme posture morning: 48h si aucune reaction
- meme item rappele explicitement: 72h
- meme technique coach jugee inutile: 14 jours
- nouveau rendez-vous apres refus explicite: 7 jours
- nouvelle tentative reactivation_window apres silence: 72h minimum

## 7.3 Exceptions

Les exceptions possibles doivent rester rares:

- evenement temporel important
- risque fort
- vraie reparation relationnelle

Ces exceptions doivent etre logguees comme telles.

## 8. Confidence gates

## 8.1 Regle generale

Aucune intervention proactive V2 ne doit partir sans niveau de confiance
explicite.

## 8.2 Politique

- `low_confidence` -> `skip` ou `soft_presence_only`
- `medium_confidence` -> posture legere, pas de rendez-vous engageant
- `high_confidence` -> proactivite normale autorisee

## 8.3 Sources de confiance

La confiance doit se baser sur:

- clarté du signal conversationnel
- recence du signal
- coherences avec event memory
- historicite similaire
- absence de contradictions recentes

## 9. Regles de fallback

## 9.1 Si `conversation_pulse` manque

Fallback:

- utiliser le dernier snapshot recent si dispo
- sinon, comportement conservateur
- pas de proactive ambitieuse

## 9.2 Si `momentum_state_v2` manque

Fallback:

- recompute immediat si possible
- sinon `state=unknown` + `posture=hold`
- pas de proactive forte

## 9.3 Si `active_load` manque

Fallback:

- interdire `expand`
- privilegier `hold` ou `consolidate`

## 9.4 Si `event_memory` est ambigu

Fallback:

- pas de `pre_event_grounding`
- transformer en presence legere ou skip

## 9.5 Si le LLM de synthese echoue

Fallback:

- conserver la derniere synthese valide
- reduire l'ambition de la decision
- jamais inventer un contexte riche incertain

## 10. Regles de daily bilan

## 10.1 Quand autoriser

Autoriser si:

- pas de `pause_consentie`
- pas de budget depasse
- pas de daily recent sur la meme fenetre
- au moins un item actif ou une question utile

## 10.2 Quand bloquer

Bloquer si:

- aucun item vivant
- silence prolonge + signaux de fermeture
- soutien_emotionnel recent non stabilise
- weekly ou rendez-vous plus prioritaire sur la meme fenetre

## 10.3 Rendu

Le daily doit:

- viser `1` item par defaut
- poser `1 a 2` questions la plupart du temps
- ne jamais avoir l'air d'un mini formulaire

## 11. Regles de weekly bilan

## 11.1 Quand autoriser

Autoriser si:

- une semaine de matiere suffisante existe
- le user n'est pas en fermeture forte
- on a un runtime suffisamment frais

## 11.2 Quand bloquer ou simplifier

Simplifier si:

- peu de matiere
- charge emotionnelle recente elevee
- relation fragile

Bloquer si:

- `pause_consentie`
- situation de reparation prioritaire

## 11.3 Resultat attendu

Le weekly doit sortir:

- une decision principale
- peu d'ajustements
- un sens clair pour la semaine suivante

## 12. Regles de coaching

## 12.1 Quand autoriser

Autoriser si:

- blocage plausible
- momentum autorise une intervention
- pas de cooldown sur technique equivalente

## 12.2 Quand conclure `simplify`

Conclure `simplify` plutot qu'une technique si:

- surcharge forte
- plan_fit faible
- meme blocage persiste malgre plusieurs techniques

## 12.3 Quand demander clarification

Demander clarification si:

- confiance moyenne
- plusieurs blockers plausibles
- mauvais cout d'une mauvaise technique

## 13. Regles du proactive windows engine

## 13.1 Inputs minimum

Le moteur doit lire:

- `momentum_state_v2`
- `conversation_pulse`
- `active_load`
- `relation_preferences`
- `recent_proactive_history`
- `event_memory`
- `repair_mode`

Quand `relation_preferences` est disponible:

- bloquer une fenetre proactive si le `day_part` vise est explicitement dislike
- ne pas emettre de morning nudge si `preferred_contact_windows` exclut
  `morning`
- capper l'intensite proactive a `light` si `max_proactive_intensity = low`
- injecter `preferred_tone` / `preferred_message_length` au moment du rendu du
  message, pas au moment de la decision pure

## 13.2 Decision tree canonique

Ordre recommande:

1. verifier verrous absolus
2. verifier budget et cooldown
3. verifier confidence
4. appliquer les garde-fous `relation_preferences`
5. identifier besoin dominant
6. choisir `window_kind`
7. choisir posture
8. soit `skip`, soit `create/reschedule/cancel`

## 13.3 Si plusieurs windows sont candidates

Prioriser:

1. event-based
2. repair-based
3. weekly-related
4. daily-related
5. generic presence

## 14. Regles des rendez-vous

## 14.1 Quand creer

Creer un rendez-vous si:

- un vrai contexte le justifie
- la confiance est au moins medium
- aucun veto relationnel fort

## 14.2 Quand annuler

Annuler si:

- le besoin a disparu
- un autre proactive plus pertinent occupe deja la fenetre
- un refus explicite est apparu

## 14.3 Quand convertir

Un rendez-vous peut etre converti en:

- simple morning presence
- outreach plus doux
- note dashboard

si la confiance baisse ou si la situation se simplifie.

## 15. Repair mode

## 15.1 Conditions d'entree

Entrer en `repair` si:

- plusieurs proactives sans echo
- refus explicite ou implicite repete
- message utilisateur montrant que la pression est mal calibree

## 15.2 Effets

Pendant `repair`:

- pas de proactive offensive
- pas de coaching non demande
- pas de daily insistant
- seulement presence douce ou silence

Source de verite canonique:

- `user_chat_states.temp_memory.__repair_mode_v1`

Le `repair mode` ne doit pas etre deduit uniquement depuis la posture momentum.
C'est un etat runtime explicite, pas une posture derivee.

Note V2.0: en V2.0, le repair mode formel peut etre reporte si
`pause_consentie` + cooldowns + posture conservative couvrent le besoin minimal.
Mais la cible reste un etat runtime explicite.

## 15.3 Conditions de sortie

Sortir de `repair` si:

- reouverture claire
- nouveau consentement
- temperature relationnelle redevenue saine

## 16. Transformation handoff

## 16.1 Quand declencher

Declencher lors du passage:

- `active -> completed`
- ou juste avant activation de la transformation suivante

## 16.2 Ce que le handoff produit

- wins retenues
- supports a garder
- habitudes a maintenir
- techniques inefficaces a eviter
- signaux relationnels utiles

## 16.3 Ce que le handoff alimente

- transformation suivante
- conversation_pulse
- victory ledger
- coaching memory

## 17. Regles de surface et de canal

## 17.1 Principe

Une bonne decision sur le mauvais canal reste une mauvaise experience.

## 17.2 Heuristique

- ajustement structurel -> weekly / dashboard
- rappel tres leger -> morning presence
- preparation avant evenement -> proactive window / rendez-vous
- reparation relationnelle -> canal le plus doux
- coaching concret -> conversation immediate si contexte vivant

## 18. Observabilite minimum obligatoire

Chaque decision importante doit logguer:

- ses inputs clefs
- son niveau de confiance
- ses verrous rencontres
- sa raison
- son outcome

Sans observabilite:

- pas de tuning fiable
- pas de debug fiable
- pas de redesign fiable

## 19. Sources de verite transverses

Ces decisions sont tranchees et canoniques. Voir
[v2-technical-schema.md section 1bis](/Users/ahmedamara/Dev/Sophia%202/docs/v2-technical-schema.md)
pour le detail.

- `user_plan_items` = source de verite d'execution. `user_plans_v2.content` =
  snapshot read-only.
- North Star = metric canonique cycle-level dans `user_metrics`, pas une entite
  separee.
- State shapes runtime = lazy migration on read via `migrateIfNeeded`.
- Metrics = table unique `user_metrics` avec `scope` + `transformation_id`
  nullable.

## 20. Check-list avant implementation

Avant de coder massivement, verifier que:

1. les ownerships sont figes
2. les invariants sont testes
3. les dedupe keys sont definies
4. les freshness windows sont definies
5. les cooldowns sont definis
6. les fallbacks sont definis
7. les events canoniques sont definis
8. les vues runtime minimales sont definies

## 21. Conclusion

Le systeme V2 devient robuste si:

- chaque moteur a un role clair
- aucune couche n'usurpe la decision d'une autre
- les verrous de protection gagnent toujours
- les decisions proactives sont rares, confiantes et tracees
- les fallbacks sont conservateurs
- le runtime est unique

La bonne question de chaque couche doit etre:

- `qu'est-ce que je suis seule autorisee a decider ?`

Si cette question a une reponse floue, il y a encore un trou d'orchestration.
