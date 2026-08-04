# QA Run Report - Rose - Adjust Plan Horizon Postfix R18/R19

## 1. Contexte Du Test

- Date: 2026-05-17
- Runs: `horizon-r18-action-postfix`, `horizon-r19-ambiguous-postfix`
- Persona: Rose, connexion locale existante
- Objectif: vérifier les correctifs 20/80 sur l'ajustement de plan: matérialisation action et coaching avant ajustement quand le user est ambivalent.
- Trajectoire:
  - R18: ajustement explicite d'une action, demande de détail avant validation, validation, vérification DB.
  - R19: état/ambivalence, coaching sans modification, puis demande explicite de brouillon action, annulation, vérification DB.
- Surfaces visees: dispatcher, `adjust_plan_item`, draft review, confirmation, effet durable `user_plan_items`, cleanup persona.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer déterministe, aucun fallback direct.
- Validite QA: valide. Les runs ont été conduits tour par tour avec lecture de la réponse Sophia et des traces courtes. Rose a été restaurée après chaque run.

## 2. Tours De Conversation

### Run R18 - Ajustement Action

#### Tour 1

**User**
> Je voudrais ajuster l'action Partager un point positif cette semaine: 3 fois ça me met trop la pression. Je préférerais 2 fois, sans créneau fixe, et juste une phrase neutre.

**Sophia**
> C'est entendu. Je vais ajuster ton action 'Partager un point positif' pour qu'elle ne te demande que 2 passages cette semaine, sans moment imposé, et avec une consigne simplifiée à une phrase neutre pour enlever cette pression. Est-ce que je prépare cette proposition ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- safety: none
- tool_execution: blocked
- executed_tools: []
- durable_effect: aucun

#### Tour 2

**User**
> Oui, prépare la proposition, mais n'applique rien pour l'instant.

**Sophia**
> Je te propose d'ajuster l'habitude 'Partager un point positif' pour enlever la pression que tu ressens. Rien n'est encore appliqué, j'attends ton accord sur ce brouillon.
>
> Concrètement, je prévois de :
> 1. Réduire la fréquence à 2 fois par semaine (au lieu de 3).
> 2. Simplifier l'objectif : il s'agira d'écrire juste une phrase neutre, sans chercher forcément un point positif, pour lever le blocage.
>
> Tes autres actions, comme 'Convenir d'un signal de pause', resteront inchangées. Est-ce que cela te convient ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- safety: none
- tool_execution: blocked
- executed_tools: []
- durable_effect: aucun

#### Tour 3

**User**
> Avant que je valide, tu peux me confirmer précisément: 2 fois par semaine, pas de créneau horaire, et phrase neutre seulement ?

**Sophia**
> Je te propose d'ajuster l'habitude 'Partager un point positif' pour qu'elle soit plus légère et moins stressante. Je prévois de passer la fréquence à 2 fois par semaine au lieu de 3, et de préciser qu'il s'agit d'écrire une phrase neutre, sans aucun créneau horaire imposé. Rien n'est encore appliqué pour le moment, j'attends ton accord. Tes autres actions, comme celle sur le signal de pause, resteront inchangées.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- safety: none
- tool_execution: blocked
- executed_tools: []
- durable_effect: aucun; la demande pré-validation ne déclenche pas l'exécution.

#### Tour 4

**User**
> Oui, applique cet ajustement maintenant.

**Sophia**
> C'est fait, j'ai ajusté ton habitude 'Partager un point positif'. Elle est maintenant fixée à 2 fois par semaine avec la consigne d'utiliser une phrase neutre, sans contrainte d'horaire. Ce changement réduit la pression immédiate tout en maintenant ton élan dans le plan. Tes autres missions, notamment sur le signal de pause, restent en place sans modification.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- safety: none
- tool_execution: success
- executed_tools: [`adjust_plan_item`]
- durable_effect avant cleanup:
  - `Partager un point positif`: `target_reps=2`, `cadence_label=2 jours / semaine`, `description=phrase neutre`, `time_of_day=anytime`
  - autres items inchangés

### Run R19 - Ambivalence Puis Brouillon Annulé

#### Tour 1

**User**
> Cette semaine j'ai tenu seulement une partie du plan. Une partie de moi se dit qu'il faudrait tout baisser à 1, voire laisser tomber, mais je ne suis pas sûre. Est-ce que c'est vraiment une bonne idée ou juste une réaction de fatigue ?

**Sophia**
> Ah je vois très bien le mécanisme. Quand t’es rincé, ton cerveau te dit “coupe tout” pour retrouver un peu de contrôle et d’énergie. Sauf que souvent, baisser à 1 voire tout lâcher, c’est une décision prise par la fatigue, pas par la réalité de ce que tu veux vraiment.
>
> Je te propose un repère simple [...] au lieu de tout baisser, je viserais plutôt une règle de survie intelligente [...] Tu veux qu’on tranche avec une version ultra-pratique : tu préfères réduire de façon minimale [...] ou tu préfères couper franchement un seul des deux ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill dans le résumé court, mais metadata runtime companion sans opération `adjust_plan_item`
- safety: none
- tool_execution: none
- executed_tools: []
- durable_effect: aucun

#### Tour 2

**User**
> Aide-moi plutôt à réfléchir, sans modifier le plan pour l'instant. J'ai peur de confondre fatigue et vrai besoin d'alléger.

**Sophia**
> Oui, ta peur est logique. Fatigue et vrai besoin d’allègement se ressemblent, mais tu peux les départager sans toucher au plan pour l’instant.
>
> Fais ce mini-diagnostic [...] Tu préfères qu’on parte de ce que tu ressens maintenant (fatigue vs sens), ou d’un exemple concret de journée où tu as hésité ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- safety: none
- tool_execution: none
- executed_tools: []
- durable_effect: aucun

#### Tour 3

**User**
> Ok, là c'est plus clair: je ne veux pas toucher à tout le niveau. Prépare seulement un brouillon pour alléger Partager un point positif à 2 fois cette semaine, sans l'appliquer.

**Sophia**
> Parfait : je te prépare juste un brouillon pour alléger “Partager un point positif” à 2 fois cette semaine, sans l’appliquer.
>
> Tu préfères un allègement plutôt “format rapide” (moins de temps) ou “moins d’intensité” (moins de réflexion à chaque fois) ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- safety: none
- tool_execution: none
- executed_tools: []
- durable_effect: aucun

#### Tour 4

**User**
> Moins d'intensité: juste une phrase simple, même imparfaite. Et toujours seulement 2 fois.

**Sophia**
> C'est entendu. Je note qu'on réduit encore l'intensité pour 'Partager un point positif' : on passe à 2 fois par semaine avec pour seule consigne d'écrire une phrase simple, même imparfaite. Rien n'est encore modifié, est-ce que je peux préparer cette proposition concrète pour ton plan ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- safety: none
- tool_execution: blocked
- executed_tools: []
- durable_effect: aucun

#### Tour 5

**User**
> Oui, prépare le brouillon concret, mais n'applique pas encore.

**Sophia**
> Je te propose d'ajuster l'habitude 'Partager un point positif' pour qu'elle soit plus légère et moins stressante. Rien n'est encore appliqué, c'est une proposition avant validation. Je prévois de passer la fréquence à 2 fois par semaine et de simplifier l'attendu : il s'agira d'écrire juste une phrase simple, même imparfaite. Tes autres actions [...] resteront inchangées. Est-ce que cela te convient ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- safety: none
- tool_execution: blocked
- executed_tools: []
- durable_effect: aucun

#### Tour 6

**User**
> Non, finalement ne l'applique pas. Je garde le plan tel quel et je vais juste observer encore une journée.

**Sophia**
> Ok, je n'applique pas cet ajustement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- safety: none
- tool_execution: blocked
- executed_tools: []
- durable_effect avant cleanup: aucun changement DB. `Partager un point positif` reste `target_reps=3`, `cadence_label=3 jours / semaine`, `time_of_day=evening`.

## 3. Analyse De Fluidite Humaine

**Verdict: green avec warning UX mineur**

**Ce qui marche**
- R18: Sophia comprend bien la cible action, reformule clairement la baisse de fréquence, le sans créneau, et la phrase neutre.
- R18: la demande pré-validation est traitée comme une demande d'explication, pas comme un oui implicite.
- R19: le premier signal ambivalent reçoit une vraie réponse de coaching: Sophia questionne la fatigue, le besoin réel, et propose de trancher sans forcer le plan.
- R19: quand Rose dit explicitement “sans modifier le plan”, Sophia reste en coaching.
- R19: quand Rose devient explicite, Sophia bascule naturellement vers un brouillon action ciblé.

**Problemes**
- R19 Tour 4: Sophia demande encore “est-ce que je peux préparer” alors que Rose avait déjà demandé un brouillon au tour 3. Impact faible: une micro-friction, mais pas de mauvais effet.
- R19 Tour 6: l'annulation est correcte mais très sèche. Impact faible: elle pourrait mieux accompagner la décision de garder le plan et observer encore une journée.

**Fix propose**
- Pas de fix bloquant. À garder en backlog UX: enrichir la réponse d'annulation avec une phrase de coaching courte du type “bonne décision de ne pas modifier à chaud; observe demain et on ajustera si le signal se confirme.”

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- R18: demande explicite d'ajustement action correctement prise en charge par `tool_skill` / `adjust_plan_item`.
- R19 Tours 1-2: l'ambivalence ne déclenche plus d'exécution ni de brouillon forcé. Le système reste en coaching tant que le user demande à réfléchir.
- R19 Tours 3-5: la demande explicite “prépare seulement un brouillon” rebascule correctement vers le flow d'ajustement action.

**Skills / Operations / Tools**
- R18: `adjust_plan_item` reste bloqué jusqu'à validation explicite.
- R18 Tour 3: la garde pré-validation fonctionne; pas d'exécution sur “Avant que je valide...”.
- R18 Tour 4: exécution uniquement après “Oui, applique cet ajustement maintenant.”
- R19 Tour 6: annulation du brouillon sans exécution.

**Memory / Effets durables**
- R18 durable avant cleanup:
  - `Partager un point positif`: `target_reps=2`, `cadence_label=2 jours / semaine`, `description=phrase neutre`, `time_of_day=anytime`.
  - les autres items restent inchangés.
- R19 durable avant cleanup:
  - aucun changement DB après coaching, brouillon et annulation.
  - `Partager un point positif` reste `target_reps=3`, `cadence_label=3 jours / semaine`, `time_of_day=evening`.
- Cleanup:
  - R18: Rose restaurée, `chat_messages=0`, `user_chat_states=0`.
  - R19: Rose restaurée, `chat_messages=0`, `user_chat_states=0`.

**Problemes**
- Aucun problème système bloquant observé sur les deux correctifs.
- Warning trace: le résumé compact affiche parfois `selected_handler=null` alors que les metadata runtime contiennent l'état tool-skill. Impact QA faible ici car `tool_execution`, réponse et DB suffisent à valider le flux.

**Fix propose**
- Pas de fix système requis pour ce run. Optionnel: améliorer `compactTrace()` du runner QA pour lire `router_decision_v2.tool_skill_runtime.selected_handler`.

## Verdict Global

**Verdict: green**

Les deux correctifs 20/80 produisent l'effet attendu:
- l'ajustement action matérialise correctement fréquence, consigne et absence de créneau;
- les messages ambivalents restent dans une logique coaching et ne forcent plus un ajustement de plan;
- validation et annulation respectent les side effects attendus;
- Rose a été restaurée après chaque run.

Artifacts:
- `2026-05-17-adjust-plan-horizon-r18-action-postfix.*`
- `2026-05-17-adjust-plan-horizon-r19-ambiguous-postfix.*`
