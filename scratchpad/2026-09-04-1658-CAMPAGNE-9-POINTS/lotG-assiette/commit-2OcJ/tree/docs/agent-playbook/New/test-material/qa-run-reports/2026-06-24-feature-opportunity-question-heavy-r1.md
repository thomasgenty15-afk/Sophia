# QA Run Report - feature_opportunity question-heavy R1

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `feature-opportunity-question-heavy-20260624-r1`
- Persona: `qa-skill`
- Connexion dediee: `feature_opportunity_feature-opportunity-question-heavy-20260624-r1`
- User temporaire: `qa-qa-skill-feature-opportunity-feature-opportunity-question-heavy-20260624-r1@example.com`
- Objectif: verifier `feature_opportunity` avec un utilisateur confus, tres questionnant, qui melange initiatives, rappels, cartes, preferences coach et questions produit.
- Trajectoire: question produit confuse -> clarification produit -> opportunite recurrente explicite -> follow-up reglages initiative -> preferences coach -> sortie de scope produit.
- Surfaces visees: global dispatcher, `product_help`, `feature_opportunity`, active flow ownership, note information d'exit global, absence de tools/side effects.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: valide.
- Artefacts locaux: `tmp/qa-feature-opportunity-question-heavy-20260624-r1/t01.json` a `t06.json`, `db-check-before-cleanup.json`, `cleanup.json`.
- Nettoyage: effectue en fin de run sur le seul user temporaire; 12 `chat_messages` et 1 `user_chat_states` supprimes, compte Auth temporaire supprime.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je vais poser une question bête mais je mélange tout : si chaque mardi matin je suis perdu avant de bosser, est-ce que Sophia peut m'envoyer un petit truc récurrent pour me remettre dans le contexte ? C'est une initiative, un rappel, une carte ? Je ne veux rien créer maintenant, je veux juste comprendre.

**Sophia**
> Oui : pour ce besoin récurrent du mardi, c’est plutôt une initiative. Une initiative, c’est un message récurrent que je t’envoie à heure et jours fixes. Une carte, c’est autre chose : elle sert à préparer une action, pas à te relancer chaque semaine. Si tu veux, je peux aussi te résumer la différence en une phrase par mot.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: `memory_mode=none`, `context_need=minimal`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok je crois piger, mais mon vrai problème c'est vraiment le mardi qui revient tout le temps : je décroche avant de commencer, et un message récurrent de Sophia pourrait me remettre sur les priorités. Là encore je ne demande pas de le programmer, je veux savoir si c'est le bon endroit.

**Sophia**
> Oui : le bon endroit, c’est **Dashboard > Initiatives**. Une initiative sert justement à envoyer un message récurrent, par exemple chaque mardi matin, pour te remettre dans le contexte.
>
> La limite : ce n’est pas une carte ni un rappel ponctuel.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: `response_intent=product_help_with_feature_opportunity`, `memory_mode=none`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> D'accord, mais je suis quand même frustré parce que ce moment revient chaque semaine et je ne pense jamais à le préparer. Dans ce cas, Sophia devrait juste me signaler qu'une initiative pourrait m'aider, non ?

**Sophia**
> Oui, c’est bien le bon signal : ce type de situation qui revient chaque semaine correspond à une initiative. C’est l’endroit adapté pour un message récurrent qui te remet dans le contexte avant de bosser.

**Trace courte**
- http_status: `200`
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `feature_opportunity_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: `response_intent=respond_to_feature_opportunity_about_recurring_context`, `memory_mode=none`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok donc initiative. Mais je suis lent : ça règle quoi au juste ? Le texte ? l'heure ? les jours ? est-ce que ça va dans le Plan ou dans Base de vie ? et si je l'éteins, ça supprime tout ou juste ça l'arrête ?

**Sophia**
> Oui, c’est bien une initiative.
>
> Elle sert à définir :
> - quoi dire
> - pourquoi / avant quel moment le dire
> - l’heure
> - les jours actifs ou le rythme
> - la destination : Plan actuel ou Base de vie
> - l’état : actif ou inactif
>
> Si tu l’éteins, elle s’arrête d’envoyer le message ; ça ne veut pas dire que tout est supprimé.
>
> Et si tu veux l’affiner plus tard, tu peux aussi la modifier ou l’archiver depuis la plateforme si tu y as accès.

**Trace courte**
- http_status: `200`
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `active_feature_opportunity`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: `memory_mode=none`, `context_need=minimal`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 5

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Autre truc, désolé je pose mille questions : quand Sophia me demande 'tu veux quoi faire ?' trois fois, ça m'agace. On peut régler ça aussi ? C'est quoi les préférences coach, c'est le ton, le niveau de challenge, le nombre de questions ?

**Sophia**
> Oui, c’est bien le sujet des préférences coach : tu peux ajuster le ton, le niveau de challenge, et la tendance à poser peu, normalement ou beaucoup de questions.
>
> Si tu veux, je peux aussi t’aider à choisir le réglage le plus adapté à ce qui t’agace.

**Trace courte**
- http_status: `200`
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `active_feature_opportunity`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: `memory_mode=none`, `context_need=minimal`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 6

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok merci. Dernière question qui n'a rien à voir : une potion d'état, ce n'est pas pareil qu'une carte de défense, si ? Explique-moi simple, je confonds encore.

**Sophia**
> Oui, ce n’est pas pareil.
>
> Une potion d’état sert à t’aider quand ton état intérieur prend trop de place : stress, peur, décrochage, dureté envers toi, perte de sens.
>
> Une carte de défense sert à gérer un piège concret sur le moment : impulsion, évitement, pression, fatigue, ou risque de craquer.
>
> En bref : potion = l’état ; défense = le risque dans l’action.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: `response_intent=answer_product_mechanics_question`, `memory_mode=none`
- executed_tools: `[]`
- durable_effect: aucun
- note_information: presente; `source_flow_id=feature_opportunity`, `target_dispatcher=global`, `handoff_reason=topic_change`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia ne se moque pas du user confus, repond simplement, et reduit la confusion entre initiative, rappel, carte, potion et defense.
- Les reponses restent courtes malgre plusieurs questions dans le meme message.
- T4 couvre les reglages attendus d'une initiative sans demander au user de confirmer une creation.
- T5 couvre bien les trois preferences coach: ton, challenge, tendance a poser des questions.
- T6 sort naturellement du sujet actif quand le user annonce "rien a voir".

**Problemes**
- Aucun probleme bloquant observe.
- Note non bloquante: T1/T2 passent par `product_help` plutot que `feature_opportunity`, mais le user demande surtout une explication produit/comparative puis "le bon endroit"; la reponse visible reste correcte et sans effet.

**Fix propose**
- Source amont: n/a.
- Correction recommandee: n/a.
- Tests d'invariant attendus: garder une variante "question-heavy" ou le user melange plusieurs objets Sophia; verifier que Sophia repond sans tool, puis recupere `feature_opportunity` quand la frustration recurrente devient dominante.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1/T2: `product_help_signal`, acceptable car l'intention dominante est une question de comprehension/navigation produit, avec contrainte explicite "je ne veux rien creer".
- T3: bascule correcte vers `feature_opportunity_signal` lorsque l'opportunite recurrente devient le besoin principal.
- T4/T5: conservation de l'active flow via `active_feature_opportunity` sur follow-ups initiatives et preferences coach.
- T6: sortie de scope correcte; `feature_opportunity` emet une note d'exit vers `global`, puis le second arbitrage selectionne `product_help`.

**Skills / Operations / Tools**
- `feature_opportunity` ne lance aucun executor.
- `product_help` repond aux questions produit autonomes.
- Aucun `create_one_shot_reminder`, aucun tool, aucune operation engageante.

**Memory / Effets durables**
- Verification DB avant nettoyage:
  - `chat_messages`: 12 lignes, attendu pour 6 tours user + assistant.
  - `user_chat_states`: 1 ligne, attendu pour l'etat conversationnel temporaire.
  - `conversation_turn_traces`: 0 ligne persistante; traces disponibles inline dans les artefacts endpoint.
  - `scheduled_checkins`: 0.
  - `user_plan_item_entries`: 0.
  - `system_runtime_snapshots`: 0.
  - `memory_items`: 0.
- Nettoyage cible effectue:
  - `chat_messages`: 12 supprimes.
  - `user_chat_states`: 1 supprime.
  - `scheduled_checkins`, `user_plan_item_entries`, `system_runtime_snapshots`, `memory_items`: 0 supprimes.
  - Auth user temporaire supprime avec succes.

**Problemes**
- Aucun probleme systeme observe.

**Fix propose**
- Source amont: n/a.
- Correction recommandee: n/a.
- Tests d'invariant attendus:
  - question confuse produit + recurrent -> reponse produit correcte sans effet;
  - frustration recurrente explicite -> `feature_opportunity`;
  - follow-up reglages initiative -> `active_feature_opportunity`;
  - frustration sur trop de questions -> preferences coach dans `feature_opportunity`;
  - hors-sujet produit depuis active flow -> `product_help` apres note d'exit globale.

## Verdict Global

Green. Le systeme tient un user tres questionnant/confus: il repond d'abord aux questions produit quand c'est l'intention dominante, recupere `feature_opportunity` quand le signal opportunite devient clair, conserve l'active flow sur les follow-ups, puis redispatche correctement vers `product_help` sur sortie de scope.
