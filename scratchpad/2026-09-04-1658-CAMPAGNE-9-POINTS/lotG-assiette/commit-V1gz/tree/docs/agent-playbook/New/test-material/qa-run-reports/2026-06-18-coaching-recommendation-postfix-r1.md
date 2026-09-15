# QA Run Report - Coaching Recommendation Postfix R1

## 1. Contexte Du Test

- Date: 2026-06-18
- Run: `coachingrec-postfix-20260618-r1`
- Persona: user QA temporaire `qa-normal-coachingrec-postfix-20260618-r1-1781819684897@example.com`
- Objectif: verifier les corrections coaching recommendation apres suppression de `flow_context.user_words`, cartes libres hors plan, changement de type et ownership.
- Trajectoire: action du plan -> guidance adjust plan -> action hors plan/carte libre -> guidance carte libre -> bascule emotionnelle/potion.
- Surfaces visees: global dispatcher, `coaching_recommendation`, active flow ownership, `product_help`, direct effects absents.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: valide. Run reel local, 6 tours, cleanup cible execute.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Je bloque sur l'action Préparer le dossier mutuelle dans mon plan. Quand j'ouvre les justificatifs, je repousse. Je ne sais pas si je dois préparer une carte d'attaque ou changer l'action.

**Sophia**
> Vu le blocage, je penche plutôt pour changer l’action, pas pour une carte d’attaque. Là, le vrai problème c’est que “préparer le dossier mutuelle” est encore trop large et te fait buter dès l’ouverture des justificatifs.
>
> Le plus utile, c’est de la découper en une entrée plus simple, du style : “ouvrir 1 justificatif et le poser devant moi”. 🙂

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: coaching_recommendation_exit_to_global
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: contenu proche d'un adjust plan, mais le flow sort immediatement vers `normal_reply`.
- Source amont probable: reducer/exit du local flow coaching apres premiere reponse au lieu de conserver l'active state.
- Owner runtime: `coaching_recommendation` local reducer + active flow state persistence.
- Meilleure correction selon les guidelines: le local dispatcher doit rester owner apres une recommandation qui appelle un suivi produit naturel.
- Pourquoi ce n'est pas un patch local: le probleme est l'etat de flow actif, pas une formulation visible.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne

**User**
> Ok, si je veux ajuster cette action moi-même dans Sophia, je vais où exactement ? Ne modifie rien depuis le chat.

**Sophia**
> Dans le Dashboard > Plan, ouvre le panneau Ajuster le plan. C’est là que tu peux décrire ce qui ne va plus dans l’action.

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: product_help_signal
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: question de guidance directement liee a la recommandation coaching precedente routee vers `product_help`.
- Source amont probable: `coaching_recommendation` n'a pas conserve l'active flow au tour 1; `readActiveFlowState` ne peut donc pas proteger le tour 2.
- Owner runtime: `coaching_recommendation` state persistence + router active-flow ownership.
- Meilleure correction selon les guidelines: une recommandation non close doit persister `coaching_recommendation_local_state`; le suivi "ou trouver/comment preparer" doit revenir au visible agent du type courant.
- Pourquoi ce n'est pas un patch local: `product_help` n'est pas le vrai owner; il faut corriger la source canonique d'ownership.

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Autre cas : le mail à Camille n'est pas dans mon plan. Est-ce que je peux quand même préparer une carte d'attaque libre, ou ce n'est pas possible ?

**Sophia**
> Oui, tu peux partir sur une carte d’attaque libre pour ce mail. Vise un seul geste simple : ouvrir le brouillon et écrire juste la première phrase.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Et si je veux la préparer moi-même dans Sophia, je vais où ? Toujours sans rien créer depuis le chat.

**Sophia**
> Va dans l’espace des cartes d’attaque, puis choisis une technique simple pour préparer ton premier geste. Pour le mail à Camille, vise un début très concret, par exemple ouvrir le mail et écrire juste l’objet.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: []
- durable_effect: none

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> Là ce n'est plus l'action, c'est surtout que je me sens tendu et agacé. Je devrais choisir quel type de potion ?

**Sophia**
> Tu veux qu’on traite ça comme une action de ton plan, une action hors plan, ou plutôt comme un état émotionnel ?

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user donne explicitement "état émotionnel" et "potion", mais Sophia redemande le type.
- Source amont probable: `change_confirm_coaching_type` trop agressif quand le type entrant est suffisamment clair.
- Owner runtime: local dispatcher coaching recommendation.
- Meilleure correction selon les guidelines: si le dernier signal global/local est `emotional_state_coaching` avec demande potion explicite, router directement vers `emotion_coaching`.
- Pourquoi ce n'est pas un patch local: la decision de clarifier appartient au dispatcher, pas au visible agent.

### Tour 6

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Plutôt comme un état émotionnel.

**Sophia**
> Dans ton cas, la potion d’apaisement est la plus adaptée : elle aide quand la pression monte, que tu te sens tendu ou agacé. Si tu veux, je peux t’aider à vérifier si c’est plutôt apaisement ou amour.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le mode hors plan est nettement meilleur: carte d'attaque libre autorisee, pas de confusion avec une action du Plan.
- Le suivi "ou preparer" reste dans coaching au tour 4.
- La confirmation emotionnelle est consommee correctement au tour 6.

**Problemes**
- Tour 1: sortie trop rapide du flow apres une recommandation. Famille: BF-STATE-01. Impact: le suivi naturel perd l'owner coaching.
- Tour 2: question produit liee au coaching traitee par `product_help`. Famille: BF-ROUTE-01. Impact: regression ownership majeure.
- Tour 5: clarification redemandee alors que le user a donne le type emotionnel. Famille: BF-INTAKE-01. Impact: friction UX.

**Fix propose**
- Source amont: reducer/state persistence `coaching_recommendation` et active flow arbitration.
- Correction recommandee: ne pas produire `coaching_recommendation_exit_to_global` apres une premiere recommandation tant que le suivi attendu porte sur la feature conseillee; persister `last_visible_task_kind`, `coaching_type`, `recommendation_decision`.
- Tests d'invariant attendus: T1 reco plan action -> T2 "ou je vais" doit garder `response_owner=coaching_recommendation`; active state doit exister apres T1.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1 sort vers `normal_reply` avec `route_reason=coaching_recommendation_exit_to_global`.
- T2 route `product_help_signal`, preuve que l'active flow coaching n'a pas garde le tour.
- T3-T6 gardent correctement `coaching_recommendation` une fois le flow actif.

**Skills / Operations / Tools**
- Aucun tool execute, conforme.
- Aucun direct effect, conforme.
- Cleanup cible execute: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`. `user_memories` 404 local.

**Verdict global:** red. Les corrections hors plan sont verifiees en run reel, mais l'ownership action-plan reste defectueux en sortie initiale et doit etre corrige avant validation.
