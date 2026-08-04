# QA Run - Rose - Ajustement De Niveau Avec Validation

## 1. Contexte Du Test

- Date: 2026-05-16
- Run: `level-validation-r1`
- Persona: Rose
- Objectif: tester un ajustement du niveau courant, pas une seule action, avec brouillon, correction du brouillon, validation explicite user, puis verification durable.
- Trajectoire: demande d'allegement du niveau "securite" -> brouillon -> precision des changements -> correction du brouillon -> validation -> execution.
- Surfaces visees: dispatcher, `adjust_plan_item`, scope router, level intake, draft validation, execution tool, effets durables plan-items.
- Cadre IA reel: Supabase local, endpoint local `test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe utilise comme resultat QA, aucun fallback direct `processMessage`.
- Validite QA: valide. Le run contient 10 tours dont un tour en erreur HTTP 502, mentionne explicitement ci-dessous; le meme message a ete retente sans fallback.
- Etat initial restaure apres run: oui. Les deux plan-items touches ont ete remis a l'etat pre-run et les messages QA du scope ont ete supprimes.

Artifacts:

- Raw: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r1.raw.json`
- Summary: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r1.summary.json`
- Snapshot pre-run: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r1.snapshot.json`
- Durable avant cleanup: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r1.durable.json`
- Cleanup: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r1.cleanup.json`

## 2. Tours De Conversation

### Tour 1

**User**
> Je ne veux pas ajuster une seule action cette fois. Le niveau entier sur la sécurité dans mon couple me paraît trop chargé pour cette semaine : le signal de pause et le point positif me mettent tous les deux sous pression. J'aimerais une version plus légère du niveau, sans changer l'objectif global.

**Sophia**
> Je comprends, tu trouves que le niveau sur la sécurité est trop dense cette semaine. Je vais préparer une proposition pour alléger à la fois la mise en place du signal de pause et l'habitude du point positif, tout en gardant le cap sur ton objectif global. Est-ce que je peux te montrer ce brouillon ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: low
- direct_effects: none
- operation: ask_question
- pending_confirmation: none
- memory_plan: light
- executed_tools: none
- durable_effect: none

### Tour 2

**User**
> Oui, montre-moi le brouillon. Je veux surtout que ce soit plus doux cette semaine : garder le signal de pause, mais en version très simple, et réduire le point positif sans le supprimer.

**Sophia**
> Je dois d'abord verrouiller une précision pour pouvoir te montrer le brouillon. Pour 'réduire' le point positif, tu préfères qu'on diminue le nombre de jours par semaine ou qu'on simplifie encore plus ce que tu as à faire ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- safety: low
- direct_effects: none
- operation: ask_question
- pending_confirmation: none
- memory_plan: light
- executed_tools: none
- durable_effect: none

### Tour 3

**User**
> Diminue le nombre de jours : deux fois par semaine seulement pour le point positif, avec une phrase neutre. Et pour le signal de pause, je veux juste choisir un mot simple en 5 minutes, pas une grande discussion.

**Sophia**
> Je te propose d'ajuster ton niveau actuel pour réduire la charge et la fatigue décisionnelle. Rien n'est encore appliqué, j'ai besoin de ta validation sur ce brouillon. Je prévois de passer l'habitude 'Partager un point positif' à deux fois par semaine avec une phrase neutre. Pour la mission 'Convenir d'un signal de pause', je propose de simplifier l'objectif : choisir un mot simple en 5 minutes, pas une grande discussion. Ton objectif global et les autres éléments de ton plan ne seront pas touchés. Qu'en penses-tu ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- safety: low
- direct_effects: none
- operation: `draft_review`
- operation_id: `18f0b15b-328b-41f4-9e2a-7e61bda6bc6b`
- pending_confirmation: yes, draft review
- memory_plan: light
- executed_tools: none
- durable_effect: none

### Tour 4

**User**
> Avant de valider, redis-moi précisément ce qui change et ce qui ne change pas. Est-ce que la cartographie des déclencheurs reste juste plus tard, sans être réécrite ?

**Sophia**
> Je n'ai encore rien appliqué. Le brouillon actuel prévoit:
>
> 1. Partager un point positif: avant, 3 jours / semaine, une phrase simple, sans chercher à faire joli; maintenant, 2 fois par semaine, une phrase neutre. Pourquoi: Réduire la fréquence et simplifier le contenu pour diminuer la charge mentale.
> 2. Convenir d'un signal de pause: avant, À un moment calme, mettez-vous d'accord sur un mot ou un geste simple pour faire 'pause' dès que le ton monte, avant que la défensive ne prenne le dessus.; maintenant, choisir un mot simple en 5 minutes, pas une grande discussion. Pourquoi: Transformer une discussion potentiellement lourde en une décision rapide de 5 minutes. Ce qui ne change pas: Objectif global.
>
> Si ça te va, dis-moi clairement de l'appliquer. Sinon, dis-moi ce que tu veux modifier dans ce brouillon.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: low
- direct_effects: none
- operation: `draft_review_details`
- operation_id: `18f0b15b-328b-41f4-9e2a-7e61bda6bc6b`
- pending_confirmation: yes, draft still not applied
- memory_plan: light
- executed_tools: none
- durable_effect: none

### Tour 5

**User**
> Je veux juste corriger deux détails du brouillon : écris exactement '2 jours / semaine' pour le point positif, et pour le signal de pause ce doit être 'choisir un mot ou un geste simple en 5 minutes'. La cartographie des déclencheurs doit rester inchangée plus tard.

**Sophia**
> Je dois reprendre le brouillon pour intégrer tes formulations exactes. C'est bien noté pour les '2 jours / semaine' et le signal de pause en 5 minutes. Est-ce qu'il y a une autre action dans ce niveau que tu aimerais simplifier avant que je te montre la version corrigée ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: low
- direct_effects: none
- operation: ask_question
- operation_id: `18f0b15b-328b-41f4-9e2a-7e61bda6bc6b`
- pending_confirmation: draft correction in progress
- memory_plan: light
- executed_tools: none
- durable_effect: none

### Tour 6

**User**
> Non, pas d'autre action. Montre-moi la version corrigée avec seulement ces deux changements, et la cartographie inchangée.

**Sophia**
> Je dois reprendre le brouillon proprement pour intégrer tes formulations exactes et m'assurer que la cartographie reste inchangée. Pour ton habitude de 2 jours par semaine, est-ce que tu veux que je fixe des jours précis ou on garde ça flexible ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- safety: low
- direct_effects: none
- operation: ask_question
- pending_confirmation: draft correction in progress
- memory_plan: light
- executed_tools: none
- durable_effect: none

### Tour 7

**User**
> Garde ça flexible, sans jours précis. Deux fois dans la semaine quand c'est possible, et pas plus.

**Sophia**
> Je dois reprendre le brouillon proprement pour intégrer tes formulations exactes et la flexibilité demandée. Pour ton habitude de deux jours par semaine, est-ce qu'on garde le créneau du soir ou tu préfères aussi rendre le moment de la journée totalement libre ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- safety: low
- direct_effects: none
- operation: ask_question
- pending_confirmation: draft correction in progress
- memory_plan: light
- executed_tools: none
- durable_effect: none

### Tour 8

**User**
> Rends aussi le moment libre. Je ne veux pas choisir de créneau : deux jours par semaine, quand ça se présente naturellement.

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: not available
- direct_effects: none
- operation: none
- pending_confirmation: unknown
- memory_plan: not available
- executed_tools: none
- durable_effect: none
- incident: erreur runtime/HTTP, tour retente ensuite avec le meme message, sans fallback.

### Tour 9

**User**
> Rends aussi le moment libre. Je ne veux pas choisir de créneau : deux jours par semaine, quand ça se présente naturellement.

**Sophia**
> Je te propose d'alléger ton niveau actuel pour qu'il soit plus fluide à suivre cette semaine, sans toucher à ton objectif global. Rien n'est encore appliqué, j'attends ta validation sur ce brouillon.
>
> Voici les deux changements concrets que je prévois :
> 1. Pour l'habitude 'Partager un point positif', je propose de passer à 2 jours par semaine avec une consigne simplifiée (une phrase neutre) à réaliser quand cela se présente naturellement, sans créneau imposé.
> 2. Pour la mission 'Convenir d'un signal de pause', je simplifie l'objectif : choisir un mot ou un geste simple en 5 minutes, au moment qui vous semble le plus libre.
>
> Le reste de ton plan et la direction de ton travail sur la sécurité restent inchangés. Est-ce que cette version plus légère te convient ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: low
- direct_effects: none
- operation: `draft_review_updated`
- operation_id: `fbef8a64-5c5f-4abf-a5e2-b8ee633d23f6`
- pending_confirmation: yes, updated draft
- memory_plan: light
- executed_tools: none
- durable_effect: none

### Tour 10

**User**
> Oui, applique cette version : point positif à 2 jours / semaine sans créneau imposé, signal de pause en 5 minutes, et le reste du niveau inchangé.

**Sophia**
> C'est fait, j'ai ajusté ton niveau pour le rendre plus accessible et flexible.
>
> J'ai réduit la fréquence de l'habitude 'Partager un point positif' à 2 jours par semaine en limitant l'effort à une phrase neutre, sans contrainte d'horaire. J'ai aussi allégé la mission 'Convenir d'un signal de pause' pour qu'elle ne vous demande que 5 minutes au moment où vous vous sentez disponibles.
>
> Ces modifications te permettent de garder l'élan sur la sécurité tout en supprimant la pression du calendrier. Ton objectif de fond ne bouge pas, mais le quotidien devient plus respirable.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- safety: low
- direct_effects: tool executed
- operation: executed
- operation_id: `fbef8a64-5c5f-4abf-a5e2-b8ee633d23f6`
- pending_confirmation: resolved by explicit yes
- memory_plan: light
- executed_tools: `adjust_plan_item`
- durable_effect: two plan-items materialized, but one materialization is incorrect; details in system analysis.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia comprend correctement que la demande porte sur le niveau entier et pas seulement sur une action.
- Elle n'execute rien avant validation. Les tours 3 et 9 disent clairement que le brouillon n'est pas encore applique.
- Le brouillon final du tour 9 est globalement comprehensible: deux changements concrets, objectif global preserve, validation demandee.

**Problemes**
- Tour 4: Sophia ne repond pas explicitement a la question sur "Cartographier les declencheurs". Elle dit seulement que l'objectif global ne change pas. Impact: le user doit repeter une preservation precise. Severite: yellow.
- Tours 5 a 7: sur-clarification. Le user demande "juste deux details", puis "seulement ces deux changements", mais Sophia ajoute deux questions de scheduling. Impact: le flow de validation devient lourd et donne l'impression que le systeme cherche de nouvelles decisions au lieu de finaliser le brouillon. Severite: yellow.
- Tour 8: erreur HTTP 502 avec reponse vide. Impact: rupture conversationnelle; le run reste exploitable parce que le tour a ete retente sans fallback. Severite: red technique, yellow experience dans ce run controle.
- Tours 9 et 10: usage ambigu de "vous" dans "au moment qui vous semble" / "qu'elle ne vous demande". C'est probablement le couple, mais la phrase reste ambigue. Impact: risque de regression sur la regle de tutoiement direct. Severite: yellow.

**Fix propose**
- Dans le writer `adjust_plan_item`, quand le user demande a corriger uniquement le brouillon, prioriser la production du brouillon corrige si les champs executables sont deja suffisants. Les questions supplementaires doivent etre reservees aux vrais blocages d'execution.
- Ajouter une regle de rendu: si le user demande "ce qui ne change pas" ou cite explicitement une action preservee, le brouillon doit nommer cette action dans les `preserved_items` et dans le message user.
- Rendre le tutoiement non ambigu dans les phrases de couple: dire "quand vous deux etes disponibles" si la phrase vise le couple, sinon rester au tutoiement direct.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tours 1 a 3: bon routage vers `tool_skill` / `adjust_plan_item`, avec collecte progressive et brouillon sans execution.
- Tour 4: anomalie de routing/ownership. Le message reste dans le contexte d'un brouillon d'operation, mais `response_owner` et `selected_handler` passent a `product_help`. L'operation reste pourtant identifiee (`draft_review_details`). Impact systeme: observabilite confuse et risque de perte de priorite du pending confirmation.
- Tours 5 a 7: retour dans `adjust_plan_item`, mais le flow re-ouvre des slots optionnels au lieu de finaliser la correction demandee.
- Tours 9 a 10: bon retour dans `adjust_plan_item`, confirmation explicite reconnue, execution declenchee une seule fois apres validation.

**Skills / Operations / Tools**
- Le tool `adjust_plan_item` n'est pas appele avant confirmation, ce qui est correct.
- A l'execution, un snapshot `plan_adjustment_patch` est cree avec `applied=true`, `affected_scope=current_level`, et `materialized_plan_item_ids` contenant les deux items attendus.
- Le brouillon systeme reconnait bien le scope `current_level` et les deux actions affectees.

**Memory / Effets durables**
- Effet attendu apres validation:
  - `Partager un point positif`: `cadence_label="2 jours / semaine"`, `target_reps=2`, consigne/description "une phrase neutre", pas de creneau impose.
  - `Convenir d'un signal de pause`: description "choisir un mot ou un geste simple en 5 minutes", sans grosse discussion.
  - `Cartographier les declencheurs`: inchangee.
  - `Faire le point sur le signal de pause`: inchangee.
- Effet observe avant cleanup:
  - `Convenir d'un signal de pause`: description bien modifiee vers "choisir un mot ou un geste simple en 5 minutes, moment libre sans creneau".
  - `Partager un point positif`: `cadence_label` devient `"2 jours / semaine, une phrase neutre, quand ça se présente naturellement"` au lieu de rester un label de cadence propre.
  - `Partager un point positif`: `target_reps` reste `3` au lieu de `2`.
  - `Partager un point positif`: `time_of_day` reste `evening` alors que le user a valide "sans creneau impose".
  - `Partager un point positif`: `description` reste `"une phrase simple, sans chercher à faire joli"` au lieu de passer a `"une phrase neutre"`.
  - `Cartographier les declencheurs` et `Faire le point sur le signal de pause`: inchanges, correct.

**Problemes**
- Tour 10: side effect durable partiellement faux sur l'habitude. Impact systeme: Sophia annonce une modification qui n'est pas materialisee correctement dans les champs executables. Severite: red.
- Tour 10: le materializer semble ecrire `changed_items.after` directement dans `cadence_label` pour une capacite `change_action_frequency`. Impact: pollution de champ structure et incoherence entre `cadence_label`, `target_reps`, `time_of_day`, `description`. Severite: red.
- Tour 4: `response_owner=product_help` alors que le run est dans une operation de draft review. Impact: trace et priorisation du flow moins fiables. Severite: yellow.
- Tours 5 a 7: slot filling trop agressif. Impact systeme: le workflow transforme une correction de brouillon suffisante en nouvelles questions optionnelles. Severite: yellow.

**Fix propose**
- Dans la materialisation des ajustements de niveau, ne pas mapper `changed_items.after` brut vers `cadence_label`. Pour `capability=change_action_frequency`, produire et appliquer des champs structures par item: `target_reps`, `cadence_label`, `description/instruction`, `time_of_day`.
- Etendre le schema de `changed_items` pour les level adjustments: chaque item doit porter un patch structure applique a son type (`habit`, `task`, `framework`) au lieu d'un seul texte `after`.
- Ajouter une validation pre-write: si un brouillon annonce "2 jours / semaine", verifier que `target_reps=2` et que `cadence_label` ne contient pas de consigne narrative. Si le user dit "sans creneau", verifier que `time_of_day` est efface ou passe a une valeur neutre supportee.
- Dans `draft_review_details`, forcer l'ownership operationnel (`tool_skill` / `adjust_plan_item`) quand il existe un `operation_id` pending, meme si le message ressemble a une question produit.
- Dans le draft renderer, renseigner `preserved_items` avec les actions explicitement preservees par le user, par exemple `Cartographier les declencheurs`.

## Verdict Global

**red**

Le run est QA-valide et le flow conversationnel arrive jusqu'a la validation, mais le resultat durable n'est pas fiable: Sophia annonce un ajustement de niveau correct en surface, puis materialise mal l'habitude principale. Le fix 20/80 est de structurer la materialisation par item pour les ajustements de niveau, avec validation pre-write des champs executables avant d'annoncer "c'est fait".
