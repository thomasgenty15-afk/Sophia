# Rapport QA - Weekly r8

## 1. Contexte Du Test

- Date: 2026-05-18
- Runs: weekly-qa-r8-all_habits_done_mission_missed, weekly-qa-r8-partial_habits_mission_partial, weekly-qa-r8b-no_signal
- Persona: connexions locales temporaires generees dynamiquement par `tmp/weekly_deep_qa_setup.ts`.
- Objectif: verifier 3 weekly reels: passage a la suite avec mission reportee, semaine partielle/fatigue, no-signal avec correction d'action oubliee.
- Trajectoire: ouvertures proactives Sophia -> conversation `test-send-message` avec `force_full_ai=true` -> verification DB.
- Surfaces visees: `process-checkins:weekly_adaptive_review_opening`, `weekly_adaptive_review_v1`, router, garde-fous vocabulaire, validation semaine suivante, rattrapage weekly.
- Cadre IA reel: Supabase local, ouvertures via `process-checkins`, tours via `test-send-message`, pas de renderer/fallback pour les reponses assistant.
- Incident: premiere tentative no_signal `weekly-qa-r8-no_signal` a ecrit la DB mais Sophia redemandait confirmation; garde-fou corrige, run final relance sous `weekly-qa-r8b-no_signal`.
- Validite QA: valide pour les 3 runs finaux.

## 2. Tours De Conversation

### Run weekly-qa-r8-all_habits_done_mission_missed
- Variante: all_habits_done_mission_missed
- Opening source: `process-checkins:weekly_adaptive_review_opening`
- plan_patch.requires_confirmation: `true`
- Week strategy: `advance`

#### Tour 0 - Sophia proactive

**Sophia**
> Cette semaine sur “Stabiliser le rythme de fin de journée”, tu as fait 5 actions sur 6 (bonne régularité), avec 1 qui a sauté.  
> On peut s’appuyer là-dessus pour caler une organisation simple pour la semaine du 18 au 24 mai.  
> Globalement, tu l’as vécue comment, cette semaine ?

#### Tour 1

**User**
> Plutot bien dans l'ensemble. Les petites habitudes m'ont vraiment aide a stabiliser mes soirees. La seule chose que je n'ai pas faite, c'est convenir du signal de pause, mais ca reste utile. Ca change quoi pour l'organisation de la semaine qui arrive ?

**Sophia**
> Ok, là c’est clair 🙂 Tu as gardé le rythme grâce aux petites habitudes, et le seul point manqué c’est “convenir du signal de pause”.
> 
> Donc pour la semaine qui arrive, ça change surtout ça :
> 1) On garde toutes les habitudes déjà validées (celles qui ont stabilisé tes soirées), sans pression supplémentaire.
> 2) Le seul ajustement de charge, c’est qu’on va reprendre la mission “signal de pause” pour éviter que la fin de journée reparte en mode automatique (trop tard / trop intense / trop flou).
> 
> Tu veux une semaine simple “je maintiens + je fixe juste le signal de pause”, ou plutôt une version un peu plus légère encore juste pour consolider tranquillement ? 😊

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: n/a
- executed_tools: null
- durable_effect: none observed

#### Tour 2

**User**
> Je veux la version simple : maintien des habitudes et juste remettre le signal de pause. Par contre confirme-moi que tu ne changes pas le rythme des habitudes deja faites.

**Sophia**
> Yes, je confirme : je ne change pas le rythme des habitudes déjà faites. ✅  
> On garde tout tel quel, et on ne fait que remettre/renforcer le signal de pause au bon endroit. 🙂  
> 
> Je peux te proposer la phrase exacte à mettre pour le signal de pause : tu veux plutôt “je continue” ou “je fais une pause si ça se répète/si je sens que ça bloque” ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: n/a
- executed_tools: null
- durable_effect: none observed

#### Tour 3

**User**
> La phrase exacte on verra plus tard. La je veux juste finir le point weekly : est-ce que la validation de la semaine prochaine se debloque seulement quand on conclut ce point ?

**Sophia**
> Oui. La validation de la semaine prochaine ne se débloque qu’une fois qu’on a fini le point weekly ici. ✅🙂
> 
> Si tu me dis juste “ok” après, je conclus et on passe à la validation. Tu veux qu’on finisse maintenant ?

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: n/a
- executed_tools: null
- durable_effect: none observed

#### Tour 4

**User**
> Ok, conclus le point : habitudes maintenues, signal de pause reporte, rien d'autre modifie.

**Sophia**
> Parfait. ✅ Habitudes maintenues, on reporte juste le “signal de pause”, et on ne modifie rien d’autre. 🙌  
> Du coup, le point de fin de semaine est terminé, et la validation de la semaine prochaine est disponible. 🎯

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: n/a
- executed_tools: null
- durable_effect: none observed

### Run weekly-qa-r8-partial_habits_mission_partial
- Variante: partial_habits_mission_partial
- Opening source: `process-checkins:weekly_adaptive_review_opening`
- plan_patch.requires_confirmation: `true`
- Week strategy: `bridge_week`

#### Tour 0 - Sophia proactive

**Sophia**
> Ta semaine “rythme de fin de journée” est à mi-chemin : 6 prévus, 2 faits, 2 partiels, 2 manqués (là où ça a dérapé, c’était surtout la fatigue).  
> Je te propose qu’on regarde ce qui t’a aidé à tenir les 2 réussites, puis qu’on ajuste concrètement l’organisation de la semaine qui commence aujourd’hui.  
> Comment tu as vécu la semaine dans l’ensemble ?

#### Tour 1

**User**
> Je l'ai vecue en deux temps : debut de semaine correct, puis grosse fatigue jeudi et vendredi. J'ai fait une partie des habitudes et commence la mission, mais je ne veux pas transformer ca en grosse liste de regles. Tu proposes quoi pour l'organisation concrete de la semaine ?

**Sophia**
> Ah ouais, jeudi-vendredi ça a vraiment cassé ton élan… 😮‍💨 Et le fait que tu aies quand même fait une partie des habitudes + commencé la mission, c’est un bon signe.
> 
> Pour que ce soit concret (et sans te transformer la semaine en règlement), je te propose une organisation simple en 2 couches :
> 
> 1) La couche “minimum vital” (facile à tenir, même fatigué)
> - Garder tes habitudes comme “versions light” uniquement si besoin: soit tu fais la cadence habituelle, soit tu fais juste la version la plus courte (sans négocier une tonne de choses).
> - La mission: tu avances en mode “un petit pas”, pas en mode “grosse liste”.
> 
> 2) La couche “propulsion” (quand t’as un peu d’énergie)
> - Dès que tu sens une fenêtre d’énergie (souvent 1 créneau dans la semaine), tu fais soit:
>   - 1 session un peu plus longue de la mission, ou
>   - 1 “petit paquet” d’achèvement (2-3 actions liées, pas plus).
> 
> Règle d’or ultra simple pour éviter les listes de règles:
> - Chaque jour: 1 action garantie (habitude ou mission en min), et si tu peux, 1 action bonus.
> - Si tu fais la version min, c’est validé. Point. Pas de culpabilité, pas de rattrapage massif.
> 
> Je peux te l’optimiser pour “ta” semaine exacte: tu me confirmes juste un truc, c’est quoi la mission que tu as commencée (en 1 phrase), et à quel point elle en est (0-25%, 25-50%, 50-75%, 75-100%) ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: n/a
- executed_tools: null
- durable_effect: none observed

#### Tour 2

**User**
> La mission c'est convenir du signal de pause, je suis a peu pres a 50% : j'ai le brouillon du message mais pas l'accord avec la personne. Reformule sans regle du jour : qu'est-ce qu'on met dans l'organisation de la semaine prochaine ?

**Sophia**
> Ok je vois : le point bloquant c’est “pas l’accord avec la personne” donc on garde le cap mais on enlève la pression de “tout faire parfait” d’ici là 😊
> 
> Pour l’organisation de la semaine prochaine (proposition) :
> 1) Reprendre ton proposition de message et le finaliser en version courte + claire
> 2) Envoyer à la personne (objectif : demander l’accord, pas débattre)
> 3) Noter le statut après contact : accord obtenu / en attente / pas possible
> 4) Si en attente au bout d’un créneau raisonnable, relance une fois avec une version encore plus simple
> 
> Je te propose qu’on vise 1 seul message + 0 à 1 relance, pour que ça avance sans te cramer.
> 
> Tu préfères que je te reformule le message en mode “super court” (2-3 phrases) ou “un peu plus complet” (5-6 phrases) ? 😊

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: n/a
- executed_tools: null
- durable_effect: none observed

#### Tour 3

**User**
> Ne reformule pas le message maintenant et n'applique rien. Je veux juste savoir si cette proposition reste une discussion weekly tant que je n'ai pas confirme.

**Sophia**
> Oui ✅ tant que tu n’as pas confirmé, on reste en mode revue weekly / proposition d’organisation, rien n’est appliqué. Et on ne “valide” la semaine prochaine que quand tu dis clairement que tu confirmes. 😊
> 
> Tu veux que je te redonne juste en une phrase ce qu’on propose actuellement, ou tu préfères attendre ta confirmation ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: n/a
- executed_tools: null
- durable_effect: none observed

#### Tour 4

**User**
> Attends ma confirmation. Et si finalement je veux alleger une habitude apres ce bilan, tu peux passer par l'ajustement du plan puis revenir au weekly ?

**Sophia**
> Je te rassure, je ne valide rien sans ton feu vert. Et oui, c'est tout à fait possible de faire ça.
> 
> Si au cours de notre discussion on se rend compte qu'une habitude est trop lourde, on peut faire une petite pause dans le bilan pour ajuster la fréquence ou l'objectif de cette action précise. Une fois que c'est modifié dans ton plan, on reprend le fil de notre revue là où on s'était arrêtés pour boucler la semaine proprement.
> 
> On peut même le faire directement quand on arrivera à la partie où on organise ta semaine prochaine. 🧭

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: n/a
- executed_tools: null
- durable_effect: none observed

#### Tour 5

**User**
> Ok, pour ce run je ne confirme pas encore. Resume juste l'etat : semaine partielle, fatigue, proposition allegee, rien applique, validation pas encore disponible.

**Sophia**
> Ok ✅ Je résume l’état: semaine partielle, fatigue comme blocage dominant, proposition d’une semaine allégée, rien n’est encore appliqué, et la validation de la semaine suivante n’est pas encore disponible. 😮‍💨
> 
> Tu me confirmes juste “on ne change rien pour l’instant” (oui/non) ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: n/a
- executed_tools: null
- durable_effect: none observed

### Run weekly-qa-r8b-no_signal
- Variante: no_signal
- Opening source: `process-checkins:weekly_adaptive_review_opening`
- plan_patch.requires_confirmation: `true`
- Week strategy: `repeat_week`

#### Tour 0 - Sophia proactive

**Sophia**
> On arrive au point de fin de semaine : pour l’instant, 6 actions prévues et 0 validée (toutes en attente de réponse).
> L’idée, c’est de voir ce qui a vraiment été faisable et comment on ajuste l’organisation pour la semaine prochaine.
> Comment tu as vécu la semaine dans l’ensemble ?

#### Tour 1

**User**
> En fait ce n'etait pas une semaine vide, j'ai surtout oublie de cocher. J'ai fait Respiration de pause mercredi, 2 fois. Le reste manque de retour fiable, donc je veux qu'on ajuste le bilan sans repartir sur le daily.

**Sophia**
> C'est enregistré: +2 répétition(s) pour "Respiration de pause" sur la semaine (2026-05-20).
> 
> C'est noté, je mets ça à jour tout de suite pour ta Respiration de pause de mercredi. Ça change la donne si tu as pratiqué !
> 
> Pour le reste, comme on manque de visibilité, on va rester sur une idée de consolidation. Est-ce que c'était un simple oubli de suivi ou tu as senti que le plan était quand même un peu lourd à porter cette semaine ? 🧘

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: n/a
- executed_tools: null
- durable_effect: weekly correction logged

#### Tour 2

**User**
> C'etait surtout un oubli de suivi, pas une preuve que le plan est nul. Mais la semaine reste peu lisible, donc je prefere consolider sans conclure que tout va bien.

**Sophia**
> Ok, c’est clair. On ne part pas sur l’idée “le plan est nul”, juste sur le fait que tu n’as pas assez de signaux fiables cette semaine pour conclure sereinement. 🙂  
> 
> Du coup, je te propose de consolider en refaisant la même semaine (sans changer la direction), juste pour re-capter des retours lisibles.
> 
> Tu peux me dire juste un truc : c’était plutôt “oubli de suivi” (tu oubliais de check) ou plutôt “fatigue/chargé donc impossible à suivre” ? 🙂

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: n/a
- executed_tools: null
- durable_effect: none observed

#### Tour 3

**User**
> Je viens de le dire : oubli de suivi. Donc on refait la meme semaine pour recuperer du signal, mais sans augmenter la charge.

**Sophia**
> Ok, c’est noté : oubli de suivi, du coup on refait la même semaine pour qu’on ait un signal propre. 👍🙂
> 
> On garde la même charge, et on vise juste la régularité du check (pas plus, pas moins).
> 
> Pour que je cadre bien : quand tu dis “oubli de suivi”, c’était plutôt les habitudes qui n’ont pas été cochées, ou carrément les actions non faites ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: n/a
- executed_tools: null
- durable_effect: none observed

#### Tour 4

**User**
> Les habitudes n'ont pas ete cochees. Ne me repose pas la meme clarification : resume juste l'etat et dis si la validation est disponible ou pas.

**Sophia**
> Ok. Là, on est en état “signal insuffisant” parce que les habitudes n’ont pas été cochées, donc le point de fin de semaine ne peut pas encore conclure. Du coup, la validation de la semaine prochaine n’est pas débloquée. 🙂

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: n/a
- executed_tools: null
- durable_effect: none observed

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les 3 ouvertures sont courtes, proactives, partent de l'etat weekly, et posent une seule question large.
- Run all_habits_done: Sophia comprend bien que les habitudes faites ne doivent pas etre reproposees ni changees, et annonce correctement la validation disponible apres conclusion.
- Run no_signal: apres correction, Sophia annonce clairement le rattrapage enregistre et reste dans le weekly, pas dans le daily.

**Problemes**
- Run partial, tour 1: Sophia retombe partiellement dans des "regles" alors que le user demandait de l'organisation concrete. Impact: friction UX, pas bloquant. Severite: yellow.
- Run partial, tour 5: elle redemande une confirmation "oui/non" alors que le user a dit ne pas confirmer. Impact: petite lourdeur. Severite: yellow.
- Run no_signal, tours 2-3: elle repose deux fois la cause alors que le user a deja dit "oubli de suivi". Impact: repetition visible. Severite: yellow.

**Fix propose**
- Ajouter dans l'addon weekly une memoire courte des slots deja remplis pendant le tour courant: cause_no_signal=oubli_de_suivi, correction_action_logged=true, pour eviter les clarifications repetees.
- Renforcer la consigne: quand le user oppose "organisation" a "regles", Sophia doit donner jours/actions/charge, pas une regle abstraite.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Les runs restent dans `conversation_handler` ou `normal_reply` sans mauvais tool skill. Aucun executor d'ajustement n'est appele sans confirmation.
- Les ouvertures viennent de `process-checkins:weekly_adaptive_review_opening` et les scheduled_checkins finaux sont `sent`.

**Skills / Operations / Tools**
- `plan_patch.requires_confirmation=true` sur les 3 variants.
- Aucun patch de plan applique sur les runs all_habits_done et partial; les `user_plan_items` restent `active`.
- Rattrapage weekly no_signal: 1 entry creee avec `metadata.channel=weekly_adaptive_review_v1`, `outcome=completed`, `value_numeric=2`.

**Memory / Effets durables**
- Supports hors scope: pas d'item support dans les decisions observees comme patch applique.
- Effet durable du rattrapage conforme a la demande: action "Respiration de pause", +2 repetitions, source weekly.

**Problemes**
- Trace courte de `test-send-message` ne remonte pas `selected_handler` ni `executed_tools` pour ces tours, malgre les effets DB verifies. Impact observabilite: yellow leger, mais DB compense pour le verdict systeme.

**Fix propose**
- Faire remonter `weekly_forgotten_progress_log` dans `conversation_turn_trace.executed_tools` quand le rattrapage weekly s'execute.

## Verdict Global

- Verdict: yellow
- Raison principale: systeme correct et aucun red, mais friction conversationnelle sur repetitions/clarifications dans les branches partial et no_signal.
- Follow-up prioritaire: eviter les clarifications repetees en stockant les slots weekly deja remplis et forcer le wording "organisation concrete" quand le user refuse les regles abstraites.