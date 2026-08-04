# QA Run Report - Adjust Plan Whole Plan - Value Preference - R112-R122

## 1. Contexte Du Test

- Date: 2026-05-21
- Runs: `r112-value-warmth`, `r116-value-warmth-final`, `r117-value-warmth-green`, `r118-value-warmth-green2`, `r121-value-warmth-final`, `r122-value-warmth-final2`
- Persona: Rose
- Objectif: continuer à durcir le flow whole-plan end-to-end sur des demandes non encore assez explorées, notamment conflit de valeur: plan ressenti comme trop "performance / cases à cocher", réorientation vers chaleur et fiabilité, sans ajout d'actions.
- Trajectoire: routing whole-plan -> brouillon -> question pré-validation -> nuance pré-validation -> validation -> séparation du plan.
- Surfaces visées: dispatcher, `adjust_plan_item`, taxonomy whole-plan, coach spécialisé, draft review, confirmation, génération de plan versionné, cleanup DB.
- Cadre IA réel: endpoint local `/functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, pas de renderer déterministe pour fabriquer un succès.
- Validité QA: **invalide pour verdict green end-to-end**. Les runs réels ont été interrompus par `502/503` Edge Function au tour 2 après redémarrage local. Les corrections unitaires passent, mais le run conversationnel complet n'a pas pu être terminé proprement.

## 2. Tours De Conversation

### R112 - Essai exploitable avant incident

**Tour 1**

**User**
> Je viens de relire le plan et il me met un peu dans une logique de performance. J'ai l'impression que je vais surtout cocher des actions, alors que ce que je veux maintenant c'est retrouver plus de chaleur et de fiabilité dans la relation.

**Sophia**
> Je comprends ce que tu ressens. Pour que je puisse t'aider au mieux à réorienter le plan, qu'est-ce que "retrouver plus de chaleur et de fiabilité dans la relation" signifie concrètement pour toi au quotidien, et comment cela se manifesterait-il à travers les actions du plan ? 🙂

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- direct_effects: 0
- durable_effect: aucun

**Tour 2**

**User**
> Concrètement je veux que le plan mette au centre la présence fiable : prévenir quand je suis indisponible, réparer vite après une maladresse, et garder un petit moment positif même les semaines tendues. Je ne veux pas plus d'actions, plutôt changer le cap du plan.

**Sophia**
> Je comprends que tu souhaites réorienter l'ensemble du plan pour mettre l'accent sur la présence fiable, en évitant d'ajouter de nouvelles actions. (...) Est-ce que je peux te montrer un brouillon ? 🙂

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- direct_effects: 0
- durable_effect: aucun

**Tour 3**

**User**
> Oui, montre-moi le brouillon, mais ne l'applique pas encore. Je veux d'abord vérifier que ça ne transforme pas le plan en liste de tâches en plus.

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond. (...) Rien n'est encore appliqué tant que tu ne valides pas clairement. 🙂

**Trace courte**
- http_status: 200
- selected_handler: adjust_plan_item
- operation: draft_review
- direct_effects: 0
- durable_effect: aucun

**Tour 4 - bug corrigé ensuite**

**User**
> Avant validation, confirme-moi juste que ce brouillon ne rajoute pas plus d'actions et qu'il change surtout l'axe vers chaleur et fiabilité.

**Sophia**
> Répète le brouillon complet au lieu de répondre directement.

**Trace courte**
- http_status: 200
- route_reason: normal_reply_default
- operation: draft_review_updated
- direct_effects: 0
- verdict local: red UX pré-validation

**Tour 5 - après correction partielle**

**User**
> Ajoute cette nuance au brouillon : le signe de progrès principal, c'est réparer vite après une maladresse, pas réussir à tout faire parfaitement. Ne valide toujours pas.

**Sophia**
> C'est corrigé dans le brouillon: Nuance intégrée: Ajoute cette nuance au brouillon (...) Ne valide toujours pas. Je n'applique rien (...)

**Trace courte**
- operation: draft_review_updated
- direct_effects: 0
- verdict local: yellow, car l'instruction "Ne valide toujours pas" fuite dans le contenu du brouillon.

**Tour 6 - validation**

**User**
> Oui, là c'est bon. Valide et applique cet ajustement du plan global.

**Sophia**
> C'est fait: j'ai ajusté la trajectoire du plan. (...) Nuance intégrée: Ajoute cette nuance au brouillon (...) Ne valide toujours pas.

**Trace courte**
- durable_effect: plan v1 archivé, plan v2 actif créé, 4 nouveaux items attachés au v2
- verdict local: yellow/red UX, durable effect correct mais message d'exécution contaminé par instruction de brouillon.

### Incidents R116-R122

- `r116`: tour 2 échoue en `ECONNREFUSED 127.0.0.1:54321`; Supabase local était en `starting`.
- Redémarrage tenté; l'état local Rose a disparu (`plans=0`, `items=0`). Rose a été restaurée depuis un snapshot sain `r106`.
- `r118`: tour 2 échoue en `503 BOOT_ERROR`.
- `r122`: tour 2 échoue en `502`, body: `An invalid response was received from the upstream server`.
- Après cleanup et restauration ciblée: snapshot final `r123-final-state-smoke` confirme `plans=1`, `user_plan_items=4`, `entries=2`.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Sophia route bien vers `adjust_plan_item` sur la demande whole-plan.
- Elle comprend l'intention "chaleur / fiabilité / pas plus d'actions" quand le tour passe.
- Après correction, la question pré-validation "pas plus d'actions" reçoit une réponse courte côté test unitaire.

**Problemes**
- R112 tour 4: une question de confirmation pré-validation a été traitée comme une révision ou une répétition de brouillon. Impact: Sophia ne répond pas au vrai besoin du moment.
- R112 tour 5-6: l'instruction utilisateur "Ne valide toujours pas" a fuité dans la nuance puis dans le message d'exécution. Impact: message final contradictoire après application.
- R121 tour 1: "sans ajouter d'actions" a été compris comme insertion d'un niveau intermédiaire. Impact: contresens fort sur la demande.
- R116/R118/R122: incidents runtime 502/503 empêchent tout verdict green conversationnel.

**Fix appliqués**
- Distinguer question pré-validation et demande de réécriture: `confirme-moi / est-ce que` sans verbe fort répond en détail sans appliquer.
- Ajouter une réponse courte dédiée pour "ne rajoute pas plus d'actions".
- Nettoyer les nuances génériques pour retirer les consignes de non-validation avant de les stocker dans le brouillon.
- Classer `value_preference_conflict` comme whole-plan draftable.
- Élargir la détection de solution concrète: "pour moi ça veut dire", "concrètement", "prévenir", "réparer", "sans ajouter".
- Empêcher `sans ajouter` / `pas plus d'actions` de déclencher `missing_bridge_or_level`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le routing initial whole-plan est correct (`tool_skill`, `adjust_plan_item`) sur les demandes de trajectoire globale.
- Le sous-cas `value_preference_conflict` était sous-spécifié dans la couche déterministe, ce qui laissait trop de place à des clarifications répétées ou à une mauvaise famille.

**Skills / Operations / Tools**
- `adjust_plan_item` sait produire un brouillon et bloquer les side effects avant validation.
- La phase draft review avait besoin de garde-fous plus fins: question de détail vs révision de brouillon vs validation.

**Memory / Effets durables**
- Sur le seul run allé jusqu'à validation, la séparation de plan fonctionne: plan initial archivé, nouveau plan actif créé avec nouveaux items.
- Cleanup final vérifié: Rose restaurée sur 1 plan actif, 4 items, 2 entries.

**Problemes**
- Runtime local instable après redémarrage: `ECONNREFUSED`, puis `BOOT_ERROR`, puis `502 upstream`.
- Le redémarrage local a nécessité une restauration ciblée de Rose depuis snapshot sain. Les runs autour de cet incident sont invalides.

**Fix restant proposé**
- Stabiliser l'environnement local Edge Function avant nouvelle batterie QA: vérifier pourquoi le worker `test-send-message` renvoie `502/503` au second tour après redémarrage.
- Fait dans ce run: ajout d'un test unitaire explicite `value_preference_conflict + sans ajouter d'actions` pour empêcher la régression `missing_bridge_or_level`.

## Verdict Global

**red**

Code durci et tests Deno verts, y compris le nouveau cas `value_preference_conflict + sans ajouter d'actions`, mais pas de run réel end-to-end green aujourd'hui à cause des incidents runtime locaux. État Rose restauré et vérifié.
