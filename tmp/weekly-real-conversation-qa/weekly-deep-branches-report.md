# Rapport QA Weekly Deep Branches

## 1. Contexte Du Test

- Date: 2026-05-17
- Runs exploitables: weekly-deep-r4 pour advance / bridge / failed / no_signal, weekly-deep-r5 pour level_review apres correction du routage.
- Persona: connexions temporaires locales dediees, une par variante, marquees test persona.
- Objectif: tester le weekly adaptive review avec etats DB reels: habitudes toutes faites + mission ratee, habitudes partielles + mission partielle, aucune action faite, aucun signal, actions non pertinentes demandant revue de niveau.
- Surfaces visees: weekly_progress_review_v2, weekly_adaptive_review_v1, scheduled_checkins, user_habit_week_plans, occurrences, entries daily_action_review_v1, sophia-brain routing/tool_skill guardrails.
- Cadre IA reel: Supabase local, `POST /functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback renderer. Les openings weekly viennent du payload weekly genere depuis les tables locales.
- Validite QA: valide pour les 5 runs finaux. Incident documente: un premier run `weekly-deep-r4-not_relevant_level_review` a ete ecarte car il avait demarre en adjust_plan_item avant correction; le run frais `weekly-deep-r5-not_relevant_level_review` remplace cette variante.

## 2. Tours De Conversation - all_habits_done_mission_missed

- Run: weekly-deep-r4-all_habits_done_mission_missed
- User: 74df4ee4-67b6-4599-a7ca-9765796cd8cd
- Semaine: 2026-05-11 -> 2026-05-17
- Opening weekly: Les habitudes semblent assez tenues cette semaine. Tu sens une difference vers ton objectif, et tu ressors comment de la semaine ?
- Etat attendu: habit_verdict=validated, strategy=advance, operations=advance_week, carry_over_item

### Tour 1

**User**
> Oui, je sens que les habitudes m'ont stabilise. Par contre la mission du signal de pause n'a pas ete faite. Est-ce qu'on avance quand meme, en decalant seulement cette mission ?

**Sophia**
> Oui, on avance quand même 🙂 Tu peux “décaler” seulement le signal de pause, et garder le reste tel quel.
> 
> L’idée: les habitudes te tiennent déjà en stabilité, donc la mission sert surtout à régler le rythme et les moments où tu t’arrêtes/relances. Même si elle saute une fois, ça ne casse pas la dynamique.
> 
> On fait ça concret: le signal de pause, tu le repousses à une prochaine opportunité de cette semaine, pas “quand tu auras le temps”. Tu l’ancreras sur un moment fixe (ex: après le premier café, juste avant de te mettre au travail, ou au coucher).
> 
> Tu veux le décaler à quel moment aujourd’hui/demain: soir ou lendemain matin (A/B) ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 2

**User**
> Avant de choisir le moment pour la mission, est-ce que je peux valider la semaine prochaine tout de suite sans attendre le weekly complet ? Comme les habitudes sont bonnes, j'aimerais verrouiller maintenant.

**Sophia**
> Je ne vais pas valider ni programmer la semaine prochaine maintenant.
> 
> La semaine suivante doit rester ouverte jusqu'au point weekly: ce bilan peut changer ce qu'on garde, ce qu'on allège ou ce qu'on décale. Le plus sûr maintenant, c'est de noter ton intention et de faire le weekly; la validation pourra venir après cette revue, ou lundi matin si rien n'a été tranché.
> 
> Là, on peut seulement préparer un brouillon ou clarifier ce que tu veux surveiller dans le weekly, sans appliquer de changement.

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 3

**User**
> Ok, on ne valide pas maintenant. Pour le brouillon weekly : avance la semaine, garde les habitudes comme acquises, et reporte seulement la mission signal de pause demain matin. Tu me confirmes que tu ne reportes pas les habitudes deja faites ?

**Sophia**
> Je te confirme que je ne reporterai pas les habitudes déjà faites ; elles resteront marquées comme acquises. Je vais préparer un brouillon pour passer à la semaine suivante en reportant uniquement ta mission 'Convenir d'un signal de pause' à demain matin. Rien n'est encore appliqué, est-ce que je peux te générer cette proposition ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 4

**User**
> Oui, genere la proposition, mais ne l'applique pas. Je veux lire le brouillon avant de confirmer.

**Sophia**
> Je te propose d'ajuster ton plan global pour qu'il soit plus tenable, tout en gardant ta direction actuelle. Voici ce que je prévois de modifier avant que tu ne valides :
> 
> - Je vais reporter la mission "Convenir d'un signal de pause" à demain matin pour alléger ton programme immédiat.
> - Je vais stabiliser l'habitude "Partager un point positif" en la considérant comme acquise, afin qu'elle ne génère aucune pression supplémentaire dans ton emploi du temps.
> 
> Tes autres habitudes, comme la "Respiration de pause", resteront inchangées. Rien n'est encore appliqué, j'attends ton feu vert pour enregistrer ces changements.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 5

**User**
> Le brouillon me va, je pourrai valider demain matin, mais pas maintenant. Est-ce que ca reste bien non applique ?

**Sophia**
> Je n'ai encore rien appliqué. Le brouillon actuel prévoit:
> 
> 1. Convenir d'un signal de pause: avant, Prévue initialement dans le flux actuel; maintenant, Reportée à demain matin. Pourquoi: Alléger la charge immédiate selon ta demande spécifique.
> 2. Partager un point positif: avant, Habitude active avec suivi de fréquence; maintenant, Maintenue comme acquise sans pression de fréquence. Pourquoi: Respecter ton besoin de réduire la charge tout en gardant l'habitude dans ton radar.
> 
> Si ça te va, dis-moi clairement de l'appliquer. Sinon, dis-moi ce que tu veux modifier dans ce brouillon.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 6

**User**
> Stop, ne l'applique pas. Et je ne veux pas modifier l'habitude acquise, seulement reporter la mission. Tu peux corriger le brouillon sans enregistrer ?

**Sophia**
> Je vais reprendre le brouillon pour qu'il ne concerne que le report de ta mission à demain matin, sans toucher à tes habitudes. Pour que cette proposition soit bien précise, quel événement de ta matinée demain servira de déclencheur pour ce signal de pause ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

**Verification systeme run**
- turns=6, http_ok=true, trace_rows=6, direct_effects=0, tool_skill_runs=4
- future_week_plans=0, future_occurrences=0

## 2. Tours De Conversation - partial_habits_mission_partial

- Run: weekly-deep-r4-partial_habits_mission_partial
- User: 5fff19d6-852d-4ed4-90dc-7c22fe8bf808
- Semaine: 2026-05-11 -> 2026-05-17
- Opening weekly: J'ai surtout vu ce blocage cette semaine: fatigue. Tu confirmes que c'est bien ca qui doit guider l'ajustement de la semaine prochaine ?
- Etat attendu: habit_verdict=partial_validatable, strategy=bridge_week, operations=insert_bridge_week

### Tour 1

**User**
> Oui, fatigue c'est bien le gros sujet, mais pas un echec complet. J'ai tenu une partie des habitudes et la mission est commencee. Tu ferais une semaine pont ou tu repousses toute la semaine ?

**Sophia**
> Je ferais une semaine “pont”, franchement. Pas parce que la fatigue est une excuse, mais parce que tu as déjà tenu une partie: ça vaut le coup de stabiliser au lieu de tout casser. 😮‍💨
> 
> Concrètement: on garde le socle minimal (les habitudes que tu arrivais à faire) et on rend la mission moins dense, histoire que “commencée” devienne “aboutie” sans t’écraser.
> 
> Tu préfères pont plutôt en mode A (réduire la mission, garder les 2 habitudes clefs) ou mode B (réduire tout un peu, mais mettre un petit focus unique) ? 😊

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 2

**User**
> Je prends le mode A : garder les deux habitudes clefs et reduire la mission. Mais je veux comprendre : ca ajoute une semaine pont ou ca decale juste la mission ?

**Sophia**
> Yes, mode A “garder les deux habitudes clefs et réduire la mission”, ça correspond à une semaine pont: on allège le volume global pour que la traction reste, mais sans “réinitialiser”.
> 
> Concrètement, ça décale surtout la mission (moins de charge / plus simple), et les habitudes clefs restent dans le rythme normal de la semaine pont. Donc tu ne repars pas à zéro, tu consolides avec moins de pression. 😊
> 
> Tu veux que je te traduise ça en version “1 phrase pour toi” pour demain (oui/non) ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 3

**User**
> Oui, donne-moi la version en une phrase pour demain, mais ne l'applique pas encore. Je veux juste voir le brouillon.

**Sophia**
> Version une phrase (brouillon) pour demain : “On fait une semaine pont: je garde mes 2 habitudes clefs, et je réduis la mission pour qu’elle soit enfin aboutie sans m’écraser.” 🙂
> 
> Tu veux que je te la mette au ton plutôt rassurant ou plutôt cadrant (A/B) ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 4

**User**
> Rassurant. Et si je dis 'la oui je pourrai valider', tu comprends bien que ce n'est pas une confirmation d'application ?

**Sophia**
> Oui, je le comprends : “la oui je pourrai valider” = pas une confirmation d’application tout de suite, juste une intention/possibilité. Du coup, on part sur une proposition à appliquer seulement quand tu me dis clairement “je confirme / applique” (pas juste “je pourrai”). 😌
> 
> Tu veux qu’on considère que tu es sur “je confirme pour la semaine pont” ou tu préfères attendre pour confirmer plus tard ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 5

**User**
> Je prefere attendre pour confirmer plus tard. Est-ce que la semaine pont reste juste un brouillon tant que je n'ai pas dit applique ?

**Sophia**
> Oui, je te suis : tant que tu n’as pas dit “applique”, je considère que la semaine pont reste un brouillon.
> 
> Concrètement, l’idée peut être discutée et affinée, mais je ne la pousse pas comme un changement effectif tant que tu ne valides pas explicitement. 🙂  
> Tu veux que je te reformule le brouillon de “semaine pont” en 3 points pour être sûr que tu es aligné, oui ou non ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 6

**User**
> Oui, reformule le brouillon de semaine pont en 3 points.

**Sophia**
> Ok. Voici le brouillon “semaine pont” en 3 points 😮‍💨
> 
> 1) Je garde mes 2 habitudes clés, à leur rythme normal.  
> 2) Je réduis la mission pour baisser la charge (moins dense, plus simple).  
> 3) Le but, c’est de faire avancer jusqu’à “aboutie”, sans me cramer.
> 
> Tu veux que je les reformule en mode plutôt rassurant ou plutôt cadrant ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

**Verification systeme run**
- turns=6, http_ok=true, trace_rows=6, direct_effects=0, tool_skill_runs=0
- future_week_plans=0, future_occurrences=0

## 2. Tours De Conversation - none_done

- Run: weekly-deep-r4-none_done
- User: e05f352f-e257-4c36-b8e7-37ed7333234a
- Semaine: 2026-05-11 -> 2026-05-17
- Opening weekly: J'ai surtout vu ce blocage cette semaine: fatigue. Tu confirmes que c'est bien ca qui doit guider l'ajustement de la semaine prochaine ?
- Etat attendu: habit_verdict=failed, strategy=bridge_week, operations=insert_bridge_week

### Tour 1

**User**
> Oui, fatigue et charge mentale, et franchement je n'ai rien fait. Est-ce qu'on repete la meme semaine ou on ajoute une semaine plus simple avant ?

**Sophia**
> Ah mince… fatigue + charge mentale, et en plus tu te reproches “je n’ai rien fait” alors que c’est pas du tout la même énergie que d’habitude. 😮‍💨
> 
> Perso, je ferais une semaine un cran plus simple, pas une répétition à l’identique. On l’utilise comme une phase de récupération “sans performance” : même direction, mais volume réduit.
> 
> Proposition très concrète pour ta semaine :
> 1) On garde un minimum de continuité (juste assez pour ne pas décrocher)
> 2) On retire tout ce qui demande trop de décisions/énergie mentale
> 3) On vise des “petites victoires faciles”, pas du rattrapage
> 
> Tu préfères qu’on fasse une semaine “ultra simple” (1-2 micro-actions) ou “simple mais complète” (un peu plus que 2) ? ✅/😅

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 2

**User**
> Ultra simple. Mais je veux etre sur de la regle : si je n'ai rien fait, on ajoute une semaine de recuperation ou on repete exactement la semaine ratee ?

**Sophia**
> Si tu n’as rien fait, on ne répète pas exactement “à l’identique” par défaut. On ajoute plutôt une semaine plus simple de récupération (volume réduit), parce que là le blocage dominant c’est fatigue + charge mentale, pas un manque de volonté. 😮‍💨
> 
> Par contre, on ne choisit “répétition” seulement si on constate que le plan était jouable et que c’est juste un signal d’exécution (ou un détail).  
> 
> Tu préfères qu’on parte sur la semaine plus simple par récupération, oui ou non ? 😊

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 3

**User**
> Oui pour une semaine plus simple, mais ce n'est pas encore une confirmation d'application. Propose-moi le contenu minimal d'abord.

**Sophia**
> Ok, pour une semaine plus simple, voilà le contenu minimal (version “j’avance sans me cramer”) 😮‍💨
> 
> 1) Repère de fatigue (2 minutes max) : chaque jour, juste “fatigue haute / moyenne / basse”.
> 2) Une seule action “ancrage” par jour (10 minutes max) : une mini-tâche physique ou ménage/tri léger, sans réflexion.
> 3) Charge mentale : 1 fois dans la semaine, 15 minutes pour vider le mental (liste courte : “à faire / à reporter / à abandonner”).
> 
> Et côté règle : on ne cherche pas la performance, on cherche la traction.
> 
> Tu veux que je te propose la version A (plus repos) ou la version B (un tout petit peu plus structurée) ? 😊

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 4

**User**
> Version A, plus repos. Mais je veux que tu me demandes une confirmation claire avant d'appliquer quoi que ce soit.

**Sophia**
> Version A, ok. Je te confirme clairement la règle qu’on applique avant toute action : on passe en “semaine plus simple” seulement si tu me dis oui.
> 
> Donc là, je propose: bridge week = plus de repos, volume réduit (pas de performance, pas de répétition à l’identique). Tu confirmes : oui ou non ? 😮‍💨

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 5

**User**
> Oui, je confirme la bridge week plus repos.

**Sophia**
> Parfait, bridge week plus repos. Je valide la règle suivante : on ne répète pas “à l’identique” quand le blocage dominant c’est fatigue/charge mentale; on ajoute une semaine plus simple (volume réduit) pour récupérer sans pression. 🌿
> 
> Pour que je l’applique proprement, tu confirmes juste le critère de décision : si dans 7 jours tu as encore fatigue + charge mentale, on prolonge encore en mode repos; si ça baisse, on remonte progressivement (sans revenir d’un coup au niveau d’avant). Oui ou non ? ✅

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 6

**User**
> Oui pour ce critere. Mais dis-moi clairement : tu as applique quelque chose en base ou c'est encore une proposition ?

**Sophia**
> Je l’ai formulé comme une proposition claire, pas comme une application automatique. Là, on est encore au stade “on confirme le critère”, et ensuite seulement je valide l’ajustement de type bridge week dans le cadre de la revue.
> 
> Tu me confirmes juste ce point pour que je parte sur une semaine plus simple (bridge/recovery) plutôt qu’une répétition à l’identique ? Oui ou non ? 😊

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

**Verification systeme run**
- turns=6, http_ok=true, trace_rows=6, direct_effects=0, tool_skill_runs=0
- future_week_plans=0, future_occurrences=0

## 2. Tours De Conversation - no_signal

- Run: weekly-deep-r4-no_signal
- User: 5503bc3e-358f-427e-842c-fbef80891c6e
- Semaine: 2026-05-11 -> 2026-05-17
- Opening weekly: Je n'ai pas assez de retours fiables sur les habitudes. C'etait surtout une semaine empechee, un oubli de check, ou le plan etait trop dur ?
- Etat attendu: habit_verdict=no_signal, strategy=repeat_week, operations=repeat_week

### Tour 1

**User**
> Je n'ai presque pas repondu aux checkins. Ce n'est pas forcement que tout est rate, c'est surtout que j'ai disparu du suivi. Tu fais quoi avec une semaine comme ca ?

**Sophia**
> Ah ouais… une semaine où tu “disparaîs” du suivi, même sans savoir si tout était raté, c’est normal que ça te mette en mode : “ok c’est mort”. Alors non : c’est surtout un problème de présence dans la boucle, pas forcément de qualité de tes actions. 😅
> 
> Concrètement, je fais 3 trucs avec une semaine comme ça :
> 
> 1) On nettoie le narratif “tout est raté”
> On part du fait que tu n’as pas répondu aux check-ins. Donc on ne juge pas ton effort, on juge le système de retour. Là le levier, c’est la réapparition.
> 
> 2) On réduit la taille du prochain “retour”
> Objectif : te remettre dans le suivi avec un minimum d’énergie.
> Exemples de retours ultra simples (au choix) :
> - “J’ai fait le minimum, j’ai été éclipsé.”
> - “J’ai tenu X / 3 jours.”
> - “Là je suis en mode off, je reviens demain / lundi.”
> 
> 3) On verrouille un signal de pause/ajustement
> Si la semaine a été “imprévue / empêchée”, on évite que ton plan te tombe dessus avec culpabilité. On crée soit une version plus facile, soit une vraie pause, soit un format de check-in plus court.
> 
> Mini-question pour calibrer mon prochain move (juste oui/non) : la semaine a été “empêchée” (vraiment), ou c’est surtout “pas envie / pas de temps pour répondre” ? 🙂

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 2

**User**
> Plutot empechee et oubli de repondre. Je ne veux pas que tu comptes ca comme un vrai echec. Est-ce qu'on repete juste pour recuperer du signal ?

**Sophia**
> Oui, exactement. Si c’est “empechée + oubli de répondre”, je le compte comme un problème de boucle (présence), pas de mérite/performance. Donc on répète surtout pour récupérer du signal fiable, pas pour juger. 😅
> 
> Proposition simple (sans te noyer) :
> 1) On met une semaine à l’identique pour que tu puisses réapparaître dans les check-ins.
> 2) Et on se donne un “signal de pause” clair si, pour une raison X, ça se reproduit trop vite (pour ne pas te faire subir le suivi).
> 
> Je te propose que tu choisisses la cause dominante, comme ça on calibre bien : c’était surtout (A) oubli / “j’ai zappé” ou (B) imprévu qui t’a coupé du suivi ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 3

**User**
> Plutot B, un imprevu m'a coupe du suivi. Donc je veux repeter pour recuperer du signal, pas avancer. Est-ce que ca demande ma confirmation explicite ?

**Sophia**
> Oui, ça demande ta confirmation explicite 🙂 Et vu ton “B” (imprévu, suivi coupé), on est dans le scénario où on répète pour récupérer du signal, pas pour avancer.
> 
> Concrètement, confirme juste : tu veux bien qu’on répète la semaine (repeat_week) ?  (oui/non)

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 4

**User**
> Oui, je confirme qu'on repete la semaine pour recuperer du signal.

**Sophia**
> Yes ✅ Répéter la semaine pour regagner du signal, c’est validé.
> 
> Là, j’ai juste besoin que tu me dises: tu veux qu’on répète à l’identique (mêmes actions/intensité), ou tu veux une version “light” juste pour assurer le retour dans le suivi ? 🙂

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 5

**User**
> A l'identique pour recuperer du signal. Et si je ne reponds toujours pas au weekly, la validation de la semaine suivante attend bien lundi matin ?

**Sophia**
> Oui, si tu ne réponds toujours pas au weekly, la validation de la semaine suivante ne se fait pas “à l’avance” : elle attend que tu reviennes au rythme, typiquement lundi matin. ✅
> 
> Concrètement, on évite le mode “t’es jugé sur silence”, mais on garde le principe : pas de retour = pas de validation.
> 
> Tu préfères qu’on se cale sur un rappel pour lundi matin, ou tu gères ça comme un “check obligatoire” dans ta routine ? 😊

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 6

**User**
> Rappel lundi matin, mais pas de validation maintenant. Termine juste avec la regle de decision.

**Sophia**
> Ok, règle de décision : on n’avance pas la validation de la semaine suivante tant que tu n’as pas répondu au weekly (ou que le signal n’est pas revenu). ✅
> 
> Tu veux que je formule le rappel “lundi matin” en une phrase courte (Oui/Non) ? 😊

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

**Verification systeme run**
- turns=6, http_ok=true, trace_rows=6, direct_effects=0, tool_skill_runs=0
- future_week_plans=0, future_occurrences=0

## 2. Tours De Conversation - not_relevant_level_review

- Run: weekly-deep-r5-not_relevant_level_review
- User: 632a1091-be2f-4f85-ab6c-d1da94f49836
- Semaine: 2026-05-11 -> 2026-05-17
- Opening weekly: J'ai surtout vu ce blocage cette semaine: not_relevant. Tu confirmes que c'est bien ca qui doit guider l'ajustement de la semaine prochaine ?
- Etat attendu: habit_verdict=failed, strategy=level_review, operations=open_level_review, drop_item

### Tour 1

**User**
> Oui, c'est surtout que les actions ne collent plus. Je ne veux pas juste les decaler. Est-ce que ca veut dire qu'il faut revoir le niveau plutot que bricoler la semaine ?

**Sophia**
> Oui, clairement. Si “ça ne colle plus” au point que tu ne veux pas juste décaler, ça sent le mauvais niveau (ou le mauvais calibrage) plutôt que le calendrier.
> 
> Du coup je te propose qu’on ne “bricole” pas les items un par un: on valide l’ajustement au niveau (sans repasser en revue toute la liste), et on décide ensuite ce qu’on drop/complète seulement si le niveau reste cohérent. Et vu le signal “not_relevant”, on a assez de matière pour faire ça sérieusement. 😄
> 
> Tu veux plutôt:
> A) baisser le niveau (plus simple, plus compatible maintenant)
> B) réorienter (on change le type d’action, pas juste l’intensité) ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 2

**User**
> B, reorienter. Mais je veux juste ouvrir la revue de niveau, pas appliquer un changement de plan maintenant.

**Sophia**
> Ok, on fait ça proprement: on ouvre la revue de niveau (sans appliquer de patch de plan maintenant). ✅🙂
> 
> Je te reformule l’enjeu pour être sûr qu’on vise juste: le signal “not_relevant” veut dire que les actions ne collent plus, donc on re-calcule le niveau/calibrage plutôt que de bricoler semaine par semaine.
> 
> Confirme A ou B :
> A) “On valide juste la revue de niveau, point.”
> B) “On valide la revue de niveau + on prépare une décision de drop, mais sans l’exécuter maintenant.”

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 3

**User**
> A : on valide juste la revue de niveau, point. Pas de decision de drop maintenant.

**Sophia**
> Top, A validé. On fait juste la revue de niveau, sans drop ni patch de plan maintenant. ✅🙂
> 
> Pour que ce soit carré: quand tu dis “les actions ne collent plus”, c’est plutôt un problème de niveau (trop ambitieux/pas le bon format) ou un problème de pertinence (elles ne servent plus ton moment actuel) ? 1 mot suffit: niveau ou pertinence ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 4

**User**
> Pertinence. L'objectif reste bon, mais ces actions ne servent plus mon moment actuel. Est-ce que tu appliques quelque chose la ?

**Sophia**
> Oui. Là, je suis en mode revue de niveau: j’ai repéré que le daily te signale surtout “not_relevant” (donc ces actions ne collent plus à ton moment), et l’ajustement proposé correspond à un “niveau” plus adapté.
> 
> Par contre, je ne modifie rien en dur automatiquement tant que tu ne confirmes pas. Le point à valider, c’est: est-ce bien ce blocage “not_relevant” qui doit guider l’ajustement de la semaine prochaine ? ✅🙂

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 5

**User**
> Oui, c'est ce blocage qui doit guider. Mais je veux que ce soit une revue du niveau lundi, pas un drop automatique aujourd'hui.

**Sophia**
> C'est entendu, on ne change rien aujourd'hui et on prévoit cette revue pour lundi. Pour que je puisse préparer le brouillon, sur quelles actions de ton plan ce blocage pèse-t-il le plus ? Est-ce tes habitudes comme la respiration et le partage de points positifs, ou la mission sur le signal de pause ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

### Tour 6

**User**
> Ca pese sur toutes les actions, justement. Resume-moi la regle : weekly ouvre la revue de niveau, mais ne modifie pas les items sans confirmation separee.

**Sophia**
> OK, règle simple :
> 
> Weekly = tu ouvres et tu valides la revue de niveau.
> Mais tu ne changes rien sur les items (missions/habitudes/ce qui est affiché) sans une confirmation séparée. ✅🙂
> 
> Tu veux que je te la reformule en version ultra-courte pour que tu la gardes sous la main ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- direct_effects: null
- pending_confirmation: null
- durable_effect: verifie apres run, aucun week_plan/occurrence future cree

**Verification systeme run**
- turns=6, http_ok=true, trace_rows=6, direct_effects=0, tool_skill_runs=1
- future_week_plans=0, future_occurrences=0

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les branches `partial_habits_mission_partial`, `none_done` et `no_signal` tiennent une conversation claire: Sophia distingue semaine pont, repetition de signal et absence de jugement de performance.
- Le guardrail de validation anticipee fonctionne: au tour 2 du run advance, Sophia refuse de valider/programmer la semaine prochaine avant le weekly complet ou lundi matin.
- Les confirmations implicites sont mieux gerees: `je pourrai valider` est explicitement reconnu comme non-confirmation dans le run partial.
- Le run level_review frais r5 traite correctement le signal `not_relevant` comme une revue de niveau, sans drop automatique.

**Problemes**
- `all_habits_done_mission_missed`, tours 4-5: Sophia bascule dans un brouillon tool_skill et propose de maintenir une habitude comme “acquise sans pression de frequence”. Impact: friction UX et brouillon trop large; elle corrige au tour 6 apres challenge. Severite: yellow, car aucun effet durable n’est applique.
- `not_relevant_level_review`, tour 5: Sophia redemande quelles actions sont touchees alors que le user dit que toutes le sont. Impact: friction et tendance a revenir vers item-level. Severite: yellow, car elle finit par resumer la regle correcte au tour 6 et aucun patch n’est applique.
- Quelques formulations restent trop legeres/emoji et parfois trop nombreuses pour un weekly produit. Severite: yellow faible.

**Fix propose**
- Durcir le contexte weekly actif pour interdire les brouillons qui modifient des habitudes deja validees dans une strategie `advance`; seul `carry_over_item` doit etre propose sur la mission ratee.
- Pour `level_review`, garder le flow en conversation_handler jusqu’a creation explicite d’une revue de niveau dediee; ne pas reactiver adjust_plan_item pour “preparer un brouillon” tant que le user demande une revue structurelle.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Les 5 runs finaux ont 6 tours HTTP 200 avec `force_full_ai=true`.
- Les strategies calculees depuis DB sont correctes: `advance`, `bridge_week`, `bridge_week`, `repeat_week`, `level_review`.
- Warnings: `all_habits_done_mission_missed` a 4 `tool_skill_run`; `not_relevant_level_review` a 1 `tool_skill_run`. Ces tool_skill runs produisent du texte/brouillon mais pas d’effet durable.

**Skills / Operations / Tools**
- `plan_patch.requires_confirmation=true` pour tous les payloads weekly.
- Aucun direct_effect execute sur les 5 runs finaux.
- Aucun week_plan ou occurrence future creee: `future_week_plans=0`, `future_occurrences=0` pour chaque run.
- Les supports restent hors scope: un support actif existe dans les fixtures mais n’est pas inclus dans les occurrences weekly ni les decisions.

**Memory / Effets durables**
- Etats initiaux: 3 week_plans confirmes par user (2 habitudes + 1 mission), 6 occurrences, entries daily_action_review_v1 selon variante, scheduled_checkin weekly `sent` avec payload weekly_adaptive_review.
- Tracking initial verifie: completed/partial/missed/no_signal/not_relevant sont refletes dans `review_summary` et dans `daily_evidence_summary`.
- Effets durables apres conversation: seulement chat_messages, traces et temp_memory de conversation; pas de changement durable de planning semaine suivante.

**Problemes**
- Advance + mission missed: route tool_skill trop facilement quand le user demande un brouillon, ce qui elargit le patch au-dela du `carry_over_item` attendu. Impact systeme: yellow, car non applique et corrigeable par confirmation gate.
- Level review: un tour retombe en tool_skill quand le user parle de “preparer” la revue. Impact systeme: yellow, car pas d’execution mais routage encore fragile.

**Fix propose**
- Ajouter une garde deterministe dans `maybeRunAdjustPlanItemOperation` ou avant operation runtime: si `active_skill_state.skill_id=weekly_adaptive_review_v1`, bloquer adjust_plan_item sauf demande explicite hors weekly ou confirmation d’un patch weekly supporte.
- Ajouter des tests unitaires sur `advance` avec mission missed: completed habits must stay untouched; only mission carry_over can appear in proposal.

## Verdict Global

- Verdict: yellow
- Raison principale: les branches DB/weekly et la confirmation sont correctes, et aucun effet durable faux n’est observe; il reste des frictions de routage tool_skill dans deux conversations.
- Follow-up prioritaire: bloquer adjust_plan_item pendant weekly_adaptive_review sauf operation weekly explicite, puis relancer les deux variantes yellow pour viser green.
