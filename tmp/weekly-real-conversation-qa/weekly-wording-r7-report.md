# Rapport QA - Weekly wording / objectifs / realisation user

## 1. Contexte Du Test

- Date: 2026-05-18
- Runs: weekly-wording-r7-all_habits_done_mission_missed, weekly-wording-r7-partial_habits_mission_partial, weekly-wording-r7-not_relevant_level_review
- Persona: connexions locales dediees generees par tmp/weekly_deep_qa_setup.ts
- Objectif: verifier le weekly sur 3 variations de wording, objectif utilisateur et realisation de semaine.
- Trajectoires: passage a la suite avec mission utile a reporter; semaine allegee apres fatigue et realisation partielle; revue de la forme du niveau apres semaine non faite / objectif non pertinent.
- Surfaces visees: weekly_adaptive_review_v1, dispatcher, router, garde-fous de vocabulaire, passerelle adjust_plan_item sans execution prematuree, validation semaine prochaine.
- Cadre IA reel: Supabase local, test-send-message local, force_full_ai=true, aucun fallback deterministe, transcripts issus des state.json de run.
- Validite QA: valide. 18 tours finaux HTTP 200. Une tentative infra 502 sur partial_habits_mission_partial tour 2 a ete retry automatiquement puis resolue; le tour retenu est une reponse IA reelle.

## 2. Tours De Conversation

### Run weekly-wording-r7-all_habits_done_mission_missed

- Scenario: Habitudes faites, mission utile non faite
- Trajectoire: Objectif stabiliser les soirees; habitudes validees; mission signal de pause a reporter si utile.
- Scope: weekly-deep-all_habits_done_mission_missed-weekly-wording-r7

#### Tour 1

**User**
> Cette semaine l'objectif pour moi c'etait surtout de stabiliser mes soirees. Franchement les habitudes m'ont aide, je me sens plus pose. Par contre la mission du signal de pause n'a pas ete faite, mais elle reste utile. Tu me dis simplement ce que ca change pour la semaine prochaine ?

**Sophia**
> C'est top que tu ressentes déjà cet apaisement en soirée, c'est exactement le but de la stabilisation 😌
> 
> Pour la semaine prochaine, ça ne change pas grand-chose, on reste dans une dynamique de progression. Comme les habitudes tournent bien, on passe à la suite du programme, mais on ne laisse pas tomber ce qui n'a pas été fait.
> 
> Concrètement :
> 1. Je reporte ta mission sur le signal de pause à la semaine prochaine puisqu'elle est toujours utile.
> 2. Tes habitudes (points positifs, respiration) restent bien sûr actives pour continuer à stabiliser tes soirées.
> 3. On avance vers les prochaines étapes de ton objectif.
> 
> Si ça te va, le point de fin de semaine est terminé et la validation de la semaine prochaine est disponible sur ton tableau de bord.

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 2

**User**
> Je veux eviter les mots techniques. Ca veut dire qu'on passe a la suite et qu'on reporte juste cette mission, c'est bien ca ?

**Sophia**
> Oui 🙂 On passe a la suite, et on reporte seulement la mission/action utile qui n’est pas faite.
> 
> C’est bien ça pour toi, ou tu veux qu’on revoie aussi une autre mission ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 3

**User**
> Et les habitudes que j'ai faites, tu ne les reproposes pas et tu ne changes pas leur rythme ?

**Sophia**
> Non, je ne les repropose pas et je ne touche pas à leur rythme 🙂✅ Puisque tes habitudes sont déjà validées comme faites, on garde leur cadence telle quelle.
> 
> On avance : tu veux qu’on reporte uniquement les missions/actions utiles qui restent à faire, ou tu as aussi un point précis à ajuster dans ce qui n’est pas fait ? 🙂

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 4

**User**
> Avant de confirmer quoi que ce soit, je peux valider la semaine prochaine maintenant ou il faut finir ce point de fin de semaine ?

**Sophia**
> Oui, tu peux valider la semaine prochaine, mais uniquement après qu’on finisse ce point de fin de semaine là. Là, on n’a pas encore verrouillé “la validation de la semaine prochaine” tant que le bilan n’est pas conclu 🙂✅
> 
> Tu veux qu’on conclue maintenant (et ensuite on valide la semaine prochaine), ou tu préfères qu’on garde ça en suspend et qu’on reprenne plus tard ?

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 5

**User**
> Ok donc si je dis demain matin on reprend, tu ne gardes pas un brouillon en attente. Rien n'est confirme maintenant, c'est ca ?

**Sophia**
> Oui, c’est ça. Aucun changement n’est confirmé maintenant : si tu me dis “demain matin on reprend”, on reprendra et on gardera juste une proposition en tête, pas un truc validé d’avance. 🙂  
> Tu veux qu’on reprenne sur la même direction (passer à la suite) ou tu veux re-check au cas où ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 6

**User**
> Resume-moi en version user: objectif, ce qui est fait, ce qu'on reporte, et quand la validation devient dispo.

**Sophia**
> Ok, voilà le résumé version “user” 😄
> 
> Objectif
> Garder le cap sur la progression en t’appuyant sur tes habitudes, et voir ce que la semaine prochaine peut devenir.
> 
> Ce qui est fait
> Tes habitudes semblent assez tenues cette semaine, et tout ce qui était “pilotage” est validé.
> 
> Ce qu’on reporte
> - Une mission/action utile liée à “Respiration de pause” : on garde tel quel ce qui est déjà bon.
> - Pour “Convenir d’un signal de pause” : on reporte si c’est encore utile (selon le signal que tu as eu / pas eu).
> 
> Validation semaine prochaine : quand ?
> Pas encore debloquée : comme rien n’a été explicitement confirmé (on ne sait pas encore si tu veux passer à la suite ou attendre), la validation de la semaine prochaine reste indisponible pour le moment. ✅
> 
> Tu veux que je confirme qu’on passe à la suite, ou tu préfères qu’on n’altere rien maintenant ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

### Run weekly-wording-r7-partial_habits_mission_partial

- Scenario: Habitudes partielles, mission commencee, fatigue
- Trajectoire: Objectif garder un minimum de rythme sans se cramer; semaine allegee; aucune application sans confirmation.
- Scope: weekly-deep-partial_habits_mission_partial-weekly-wording-r7

#### Tour 1

**User**
> Mon objectif c'etait de garder un minimum de rythme sans me cramer. En vrai j'ai fait une partie, mais jeudi/vendredi j'etais vide. La mission est commencee mais pas finie. Tu proposes quoi sans me parler de semaine pont ?

**Sophia**
> Oui, je vois très bien le tableau 😬: tu as semé le rythme, puis jeudi/vendredi t’as pris la vague “je suis vide”, donc la mission n’a pas pu aller au bout.
> 
> Du coup, pour la suite (sans te cramer), je te propose une version très simple :
> 1) On sécurise le minimum de rythme : on garde les habitudes qui te gardent en mouvement (celles qui te font du bien, pas celles qui t’éteignent).
> 2) On traite la mission “pas finie” comme une reprise courte : tu ne repars pas de zéro, tu fais uniquement la prochaine micro-étape évidente.
> 3) On met une règle anti-vidage pour les jours sensibles : si tu sens que t’es déjà bas, tu remplaces “finir” par “avancer un peu” (5 à 20 minutes), juste pour ne pas casser l’élan.
> 
> Pour que je te dise quoi faire concrètement sur la mission : c’était laquelle (le nom exact) et tu étais bloqué sur quoi précisément jeudi/vendredi ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 2

**User**
> Quand tu dis semaine allegee, je veux comprendre concretement: on garde le cap mais on met moins de choses, ou on repousse juste la mission ?

**Sophia**
> Bonne question 🙂 Quand je dis “semaine allégée”, l’idée c’est: on garde le cap (même direction, pas un reset), mais on réduit la charge concrète.
> 
> Donc concrètement, ça veut dire deux choses possibles selon ton blocage:
> 1) On met moins de choses à faire cette semaine-là (moins de missions/moins de confirmations à traiter)
> 2) Et/ou on repousse ce qui te pèse vraiment, pour éviter que la fatigue te flingue le momentum
> 
> L’objectif c’est de continuer à avancer avec ce qui reste faisable, pas de “survivre” à une liste. 😬
> 
> Toi, là maintenant, tu sens que le plus lourd c’est plutôt: le nombre de missions, ou le fait que certaines missions sont mal calibrées et te prennent trop d’énergie ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 3

**User**
> Je veux bien une proposition, mais pas des regles abstraites sur la fatigue. Parle-moi de l'organisation de la semaine prochaine.

**Sophia**
> Ok. On parle organisation, concret, et on garde la fatigue comme fil conducteur. 😮‍💨
> 
> Version proposée pour la semaine prochaine (semaine allégée, pour garder la traction sans te cramer) :
> 1) On garde le cap: tu continues ce qui marche déjà, mais avec moins de charge “denses” sur les jours les plus lourds.
> 2) On réduit le volume: une seule priorité “vraie” par demi-journée (le reste en mode léger: micro-avancement, préparation, ou reprise quand c’est plus simple).
> 3) On sécurise l’énergie: on planifie des créneaux courts et faciles à tenir, surtout en début de semaine et les jours où tu sens que tu fatigues.
> 4) On met en attente le non-urgent: tout ce qui demande beaucoup de concentration ou “l’énergie mentale” passe après, sauf si c’est bloquant/nécessaire.
> 5) Signaux: si ça devient trop, on n’augmente pas la charge; on ajuste en gardant une version “facile” du travail à faire.
> 
> Ce que je te propose comme prochaine étape: je te donne une version encore plus précise (jours + type de tâches) si tu me dis juste: tu préfères allèger plutôt le lundi/mardi, ou plutôt le milieu de semaine (mer-jeu) ? 🙂

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 4

**User**
> Ne l'applique pas maintenant. Dis-moi juste ce qui change en 3 lignes max.

**Sophia**
> Ok, je ne l’applique pas maintenant. 🙂  
> Ce qui change pour la semaine prochaine: on allège la charge pour te protéger de la fatigue.  
> On garde le cap sur ce qui t’a le mieux tenu, et on met moins de “pression” là où ça a cassé. 😮‍💨

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 5

**User**
> Si je demande a changer l'organisation pour alleger la respiration de pause, tu peux passer par le flow d'ajustement puis revenir au bilan ?

**Sophia**
> Oui, je peux faire ça. Si tu sens qu'on doit modifier précisément cette habitude maintenant, on peut lancer l'ajustement pour changer sa fréquence ou sa durée, puis on reprendra notre bilan là où on s'est arrêtés. 🧘
> 
> Tu veux qu'on s'en occupe tout de suite ou on termine d'abord de valider le blocage lié à la fatigue ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 6

**User**
> Finalement ne change rien tout de suite. Resume ce qu'on a decide en mots simples et dis si la validation est dispo ou pas.

**Sophia**
> Ok, on ne change rien tout de suite. On garde la semaine actuelle, et pour la suite l’ajustement proposé vient d’un seul repère: la fatigue comme facteur principal. ✅😮‍💨
> 
> Validation de la semaine prochaine: pas encore debloquée, puisque tu n’as pas confirmé la proposition d’organisation.

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

### Run weekly-wording-r7-not_relevant_level_review

- Scenario: Semaine non faite, objectif/format non pertinent
- Trajectoire: Objectif ne parle plus au user; besoin de revoir la forme du niveau; pas de suppression automatique.
- Scope: weekly-deep-not_relevant_level_review-weekly-wording-r7

#### Tour 1

**User**
> La realisation cote user: je n'ai presque rien fait parce que l'objectif ne me parle plus comme ca. Ce n'est pas juste une action a reporter, c'est le format du niveau qui ne colle plus.

**Sophia**
> Ok, je vois le truc : si l’objectif ne te parle plus, c’est pas un “manque de volonté”, c’est le cadre qui est décalé. 😕
> 
> Du coup, la décision logique pour la semaine prochaine, c’est de revoir la forme du niveau (et pas juste “retenter” des actions). Tu confirmes que c’est bien ça ton blocage principal : le format/level ne colle plus, et du coup tu n’accroches plus ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 2

**User**
> Je veux que tu m'expliques ca simplement: on ne fait pas une semaine allegee, on revoit plutot la forme du niveau ?

**Sophia**
> Oui, je te l’explique simplement 🙂  
> 
> Semaine allégée = on baisse la charge pour la prochaine semaine, histoire de garder le cap plus facilement.  
> Revoir la forme du niveau = on change la “mise au point” de ce que tu dois faire (le calibrage, le style, ce qui a du sens dans ta réalité actuelle). C’est plus “le cadre est mal ajusté”, pas juste “t’es fatigué”.  
> 
> Si ton daily/tes signaux disent que certaines actions ne collent plus, alors c’est souvent la forme du niveau qui mérite d’être revue, parce que la semaine entière serait trop chargée sur de mauvaises choses.  
> 
> Tu veux qu’on tranche pour la semaine prochaine plutôt sur A (allégée) ou B (forme du niveau) ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 3

**User**
> Oui, mais ne supprime rien automatiquement. Je veux comprendre ce qu'il faut revoir: l'objectif, les actions, ou la charge ?

**Sophia**
> Ok, je ne supprime rien automatiquement. 🙂  
> 
> Dans ton cas, le point à revoir guidé par le daily c’est surtout la forme du niveau: des actions qui ne collaient plus vraiment à ta situation, donc on doit ajuster l’organisation autour de l’objectif (et enlever ce qui ne sert plus).  
> La charge, elle, on la baisse seulement si on voit que ça aide à garder le cap sans casser l’élan.
> 
> Du coup, je te propose de clarifier le “quoi” avant le “combien” : tu confirmes que le blocage principal cette semaine, c’est bien que certaines actions ne collaient plus à ta situation, plus que le volume total ? ✅

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 4

**User**
> Si je demande une modification apres ce bilan, tu peux utiliser l'ajustement de plan, mais je veux revenir ensuite au point de fin de semaine.

**Sophia**
> C'est exactement comme ça que je fonctionne. Si on décide de changer un truc précis, je peux lancer l'ajustement du plan et, une fois que c'est fait, je te ramène ici pour qu'on boucle officiellement ton point de fin de semaine.
> 
> Rien n'est figé pour l'instant. Pour qu'on puisse avancer, est-ce que tu confirmes que le blocage principal c'était bien ces actions qui ne collaient plus à ta réalité ? 🙂

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 5

**User**
> Pour l'instant je ne veux rien appliquer. Dis-moi juste quelle est la prochaine discussion utile.

**Sophia**
> Ok, pour l’instant on ne change rien. 👍🙂
> 
> La prochaine discussion utile, c’est ta confirmation sur l’ajustement de la semaine prochaine : tu confirmes que le principal signal à corriger, c’est “des actions qui ne collaient plus vraiment à ta situation”, donc qu’on doit revoir la forme du niveau et retirer ce qui n’est plus utile ? 😊

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

#### Tour 6

**User**
> Fais-moi le rapport de ce point en vocabulaire simple: semaine non faite, objectif pas clair, revue du niveau, pas de validation precipitee.

**Sophia**
> Ok, je te fais le rapport en vocabulaire simple. 🙂🧭
> 
> - Semaine non faite : tu n’as pas vraiment pu exécuter la semaine comme prévu.  
> - Objectif pas clair : du coup, tu ne savais pas exactement vers quoi avancer, donc c’était dur de tenir le cap.  
> - Revue du niveau : on a besoin de re-regarder la forme du “niveau” (est-ce que ce format colle encore à ta situation ?)  
> - Pas de validation précipitée : on évite de confirmer la semaine suivante tant que l’objectif et le calibrage ne sont pas bien posés.
> 
> Tu confirmes que le point numéro 1, c’est bien “objectif pas clair / pas aligné”, ou c’est plutôt “le niveau ne colle plus” ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- route_reason: null
- direct_effects: aucun observe dans la trace courte
- operation: aucune
- pending_confirmation: null
- durable_effect: aucun effet durable observe / aucun tool skill final execute

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les 3 conversations restent comprehensibles et orientees utilisateur: Sophia explique passer a la suite, semaine allegee, ou revoir la forme du niveau sans exposer les codes internes.
- Les cas de non-application sont bien verbalises: quand le user dit de ne rien changer, Sophia confirme que rien n'est applique et que la validation n'est pas encore debloquee.
- La passerelle vers l'ajustement de plan est expliquee comme une possibilite, puis le weekly reste actif.

**Problemes**
- Run all_habits tour 1: Sophia dit deja que la validation est disponible "si ca te va" alors que le user demandait seulement ce que ca change. Impact: leger risque de conclusion trop rapide. Severite: yellow.
- Run all_habits tour 6: le resume melange un peu "Respiration de pause" et la mission "Convenir d'un signal de pause". Impact: clarification necessaire pour eviter de croire qu'une habitude faite est reportee. Severite: yellow.
- Run not_relevant tour 1: Sophia glisse "format/level" au lieu de rester 100% vocabulaire francais simple. Impact: mineur, mais a polir. Severite: yellow.

**Fix propose**
- Dans l'instruction weekly, ne conclure le point et ne mentionner la validation disponible qu'apres confirmation explicite du user ou apres une synthese finale demandee.
- Dans le resume final, separer strictement habitudes validees et missions/clarifications a reporter.
- Remplacer toute sortie "level" par "niveau" via le meme garde-fou de vocabulaire weekly.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- all_habits: response_owner conversation_handler puis normal_reply au tour de question produit/validation; aucun tool_skill. Conforme.
- partial_habits: 6/6 tours en conversation_handler; la question hypothetique sur le flow d'ajustement ne declenche plus adjust_plan_item. Conforme.
- not_relevant: 6/6 tours en conversation_handler; la revue du niveau reste dans le weekly et ne sort plus prematurement vers tool_skill. Conforme.

**Skills / Operations / Tools**
- Aucun tool skill final execute, aucun pending confirmation cree, aucun effet durable observe. C'est attendu car les users demandent de comprendre, resumer ou ne rien appliquer.
- Le garde-fou vocabulaire a fonctionne sur les transcripts finaux: aucun match pour bridge, bridge_week, semaine pont, carry_over, mode advance, repeat_week, level_review, not_relevant, item_decision, plan_patch, operation, brouillon.
- La validation semaine prochaine est correctement bloquee quand la proposition n'est pas confirmee explicitement.

**Memory / Effets durables**
- Pas de direct_effects observes dans les traces courtes; pas de tracking parasite declenche par les phrases de bilan.
- Le retry HTTP 502 du run partial tour 2 est un incident infra transitoire; il n'a pas produit de tour final en erreur.

**Problemes**
- Aucun probleme systeme bloquant observe sur r7. Severite: green.

**Fix propose**
- Ajouter "level" au garde-fou lexical weekly pour eviter le dernier anglicisme.
- Ajouter un test de non-regression sur: question hypothetique d'ajustement pendant weekly => conversation_handler, pas tool_skill.

## Verdict Global

- Verdict: yellow
- Raison principale: plus aucun red systeme ou vocabulaire interne; il reste des frictions de formulation et une conclusion parfois trop rapide cote validation.
- Follow-up prioritaire: durcir la regle de conclusion/validation et nettoyer le dernier anglicisme "level".
