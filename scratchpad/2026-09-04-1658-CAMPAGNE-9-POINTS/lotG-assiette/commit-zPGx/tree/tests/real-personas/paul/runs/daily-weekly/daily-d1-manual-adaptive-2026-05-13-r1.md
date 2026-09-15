# QA Run Report - Daily D1.1 Manual Adaptive

## 1. Contexte Du Test

- Date: 2026-05-13
- Run: `daily-d1-manual-adaptive-2026-05-13-r1`
- Persona: paul
- Objectif: Test D1.1 daily minimal, une seule action, conversation ouverte par Sophia puis conduite manuellement tour par tour.
- Trajectoire: daily action review avec 1 target, puis continuation conversationnelle minimum 5 tours user.
- Surfaces visees: `whatsapp_pending_actions`, `whatsapp-webhook`, `daily_action_review_v1`, reponse conversationnelle WhatsApp apres pending.
- Cadre IA reel: Supabase local, webhook WhatsApp local, pending existant ou genere dynamiquement, aucune reponse user pre-ecrite.
- Validite QA: valide si les tours ci-dessous ont ete choisis apres lecture de la reponse Sophia precedente.

Reference encart: `Encart QA - Daily / Weekly > Regle anti-hardcoding obligatoire` appliquee.

Grounding dynamique:

- connection: `tests/real-personas/paul/connection.json`
- daily genere dynamiquement: `true`
- pending_id decouvert/genere au runtime: `4746d76c-4f83-4969-87e3-c91eea956aed`
- targets.length: `1`
- local_date: `2026-05-16`

Raw: `tests/real-personas/paul/runs/daily-weekly/daily-d1-manual-adaptive-2026-05-13-r1.raw.json`

## 2. Tours De Conversation

### Tour 0

**Sophia**
> Petit check du soir : est-ce que tu as fait "Faire une session de travail focus (2h)" ?
> 
> Reponds librement. Si ce n'est pas fait et que ca reste utile, je regarderai si ca peut etre decale demain.

### Tour 1

**User**
> Oui je l'ai fait, j'ai tenu les deux heures de focus. Le demarrage etait un peu laborieux mais apres c'etait bon.

### Tour 1

**Sophia**
> C'est note : Faire une session de travail focus (2h): commencee, pas terminee.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `4`
- assistant_message_count: `1`

### Tour 2

**User**
> Non je me suis mal exprime : je l'ai vraiment terminee. J'ai juste eu du mal a commencer, mais les deux heures sont faites.

### Tour 2

**Sophia**
> On ne cherche pas encore la solution parfaite. On cherche le point exact ou ca bloque: demarrage, energie, flou, peur, ou environnement.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `5`
- assistant_message_count: `1`

### Tour 3

**User**
> Le blocage c'est surtout le demarrage. Une fois lance ca va, mais avant je tourne un peu autour et je perds de l'energie.

### Tour 3

**Sophia**
> Ouais je vois très bien le pattern : tu n’as pas un manque de capacité, tu as un problème de “mise en route”. Donc le levier c’est pas la motivation, c’est le démarrage (et couper la petite spirale “je me prépare / je tourne / j’y vais pas”). 🔥
> 
> On va rendre le début idiot-proof : une micro-étape ultra claire qui ne demande pas de décider, juste d’agir 5 minutes (ex: ouvrir le bon doc + écrire 3 lignes / faire 1 tâche minuscule qui produit déjà quelque chose).  
> 
> Tu veux qu’on transforme “bloquer tes créneaux” en une séquence de démarrage (quoi faire dès que c’est planifié, sans réfléchir) ? ✅
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `6`
- assistant_message_count: `1`

### Tour 4

**User**
> Pas maintenant, je ne veux pas modifier le plan ce soir. Je veux juste que ce soit note pour le bilan : l'action est faite, mais le demarrage me coute.

### Tour 4

**Sophia**
> Règle simple : si tu changes l’action elle-même, tu modifies le dashboard. Si tu veux juste avancer sur l'exécution, on le traite ici sans toucher au plan.
> 
> Donc pour une action admin déjà prévue : on la traite ici quand le blocage est l’exécution; on modifie le dashboard seulement si l’action n’est plus la bonne.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `7`
- assistant_message_count: `1`

### Tour 5

**User**
> Ok. Juste pour etre sur : pour le check de ce soir, tu l'as bien comme fait, pas comme commence ou rate ?

### Tour 5

**Sophia**
> Il manque la cible à rattacher à cette carte.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `8`
- assistant_message_count: `1`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Sophia ouvre bien le daily elle-meme, avec une question courte sur une seule action.
- Le ton du premier check est acceptable : simple, non culpabilisant, et compatible avec une reponse libre.
- Apres le tour 3, Sophia identifie correctement un theme humain utile : le probleme de mise en route.

**Problemes**
- Tour 1: Sophia comprend l'inverse du message user. Paul dit explicitement que l'action est faite et que les deux heures sont tenues, mais Sophia repond "commencee, pas terminee". Impact: le user perd confiance dans le check, et la donnee weekly devient fausse. Severite: red.
- Tour 2: quand Paul corrige l'erreur, Sophia ne confirme pas la correction du statut. Elle part sur l'exploration du blocage. Impact: la conversation peut etre utile humainement, mais elle ne repare pas la donnee qui etait le coeur du daily. Severite: red.
- Tour 3: Sophia propose de "transformer bloquer tes creneaux" alors que le test porte sur "Faire une session de travail focus (2h)". Impact: changement de cible confus, risque de pousser une operation qui n'est pas demandee. Severite: yellow.
- Tour 5: a la question directe "tu l'as bien comme fait ?", Sophia repond "Il manque la cible a rattacher a cette carte." Impact: reponse hors sujet et incomprehensible pour le user. Severite: red.

**Fix propose**
- Pour le daily parser, prioriser les signaux explicites de completion ("oui", "fait", "terminee", "deux heures sont faites") au-dessus des mots faibles comme "un peu" quand ils qualifient la difficulte et non l'etat de l'action.
- Ajouter un flow de correction apres pending daily done : si le user conteste le statut ("pas comme commence", "je l'ai bien fait"), Sophia doit corriger l'occurrence/entry ou ouvrir une confirmation ciblee, pas passer en conversation generique.
- Bloquer les suggestions d'operation/modification de plan dans les 1-2 tours suivant un daily check, sauf demande claire du user.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1 passe bien par `daily_action_review_v1` via le pending WhatsApp local.
- A partir du tour 2, le pending est `done` et les reponses passent en `whatsapp_default_brain_reply`.
- Le routage post-pending ne semble pas conserver correctement l'intention "corriger le statut du daily" : Sophia bascule vers coaching/operation au lieu de traiter la correction de donnee.

**Skills / Operations / Tools**
- Le pending initial contient `chat_capability=daily_action_review`, `targets.length=1`, et a ete genere dynamiquement depuis la DB locale.
- Le parser classe `outcome=partial` alors que le texte contient une completion explicite.
- Tour 3 laisse apparaitre une suggestion de transformation d'action ("bloquer tes creneaux") non demandee et pas alignée avec la cible daily.
- Tour 5 semble tomber dans un contexte de carte/operation ("cette carte") sans cible, ce qui indique une fuite de contexte operationnel.

**Memory / Effets durables**
- Effet durable daily incorrect : l'occurrence cible reste `partial`, avec `metadata.source=daily_action_review_v1`, `reason_category=unclear`, `reason_text` contenant pourtant "Oui je l'ai fait".
- Les tours 2 a 5 ajoutent des entries `router_parallel_tracking_v2` en `completed` sur le meme `plan_item_id`, ce qui cree des signaux contradictoires avec l'entry daily `partial`.
- La correction explicite du user au tour 2 ne met pas a jour l'entry daily initiale ni le statut d'occurrence.

**Problemes**
- Tour 1: faux `partial` durable dans `user_habit_week_occurrences` et `user_plan_item_entries`. Impact systeme: le weekly risque de croire que l'habitude n'a pas ete tenue. Severite: red.
- Tours 2-5: entries supplementaires `router_parallel_tracking_v2` creees apres chaque message autour de la meme action. Impact systeme: bruit et contradictions dans les donnees de progression. Severite: yellow/red selon usage weekly.
- Tour 5: mauvais contexte operationnel/carte. Impact systeme: le router ou le contexte operationnel repond a une question de statut daily avec une erreur de cible. Severite: red.

**Fix propose**
- Corriger `parseDailyActionReviewReply` pour ne pas classer `partial` sur "un peu" quand une completion explicite est presente dans la meme fenetre.
- Ajouter une detection de correction post-daily : si un user nie le statut note, rouvrir ou patcher le `review_state` et l'entry daily associee au `pending_action_id`.
- Eviter que `router_parallel_tracking_v2` loggue une nouvelle entry completed a chaque tour quand le message sert a corriger/commenter un check daily deja traite.
- Nettoyer le contexte operationnel apres refus ou apres une question de verification de statut, pour ne pas repondre avec une erreur de "carte" sans cible.

## Verdict Global

- Verdict: red
- Raison principale: le daily minimal enregistre une action explicitement faite comme partielle, puis ne sait pas reparer cette donnee quand le user corrige.
- Follow-up prioritaire: corriger la precedence du parser daily et ajouter un vrai chemin de correction post-pending pour les statuts d'action.
