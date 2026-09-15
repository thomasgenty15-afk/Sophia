# QA Run Report - Coaching Recommendation Ownership Product Guidance R1

## 1. Contexte Du Test

- Date: 2026-06-22
- Run: `coachingrec-ownership-product-guidance-20260622-r1`
- Persona: user QA temporaire `qa-normal-coachingrec-ownership-product-guidance-20260622-r1-1782155278267@example.com`
- Objectif: verifier que `coaching_recommendation` garde l'ownership quand le user demande ou trouver/preparer une feature deja recommandee dans le flow.
- Trajectoire: action du plan -> explication novice -> guidance produit in-scope -> tension emotionnelle liee a l'action -> question de consultation -> action hors plan -> guidance produit carte libre.
- Surfaces visees: dispatcher global, `readActiveFlowState`, local dispatcher `coaching_recommendation`, visible agents `action_plan_coaching` et `no_plan_coaching`, product guidance, absence de side effect.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Setup: plan QA run-scope avec action active `Préparer le dossier mutuelle`.
- Cleanup: fixtures plan run-scope supprimees; user/messages/chat state/memory run-scopes supprimes. `user_memories` a retourne 404 pendant cleanup car table non disponible sur ce local, sans effet observe sur le run.
- Validite QA: valide.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis un peu perdu. Dans mon plan j'ai l'action Préparer le dossier mutuelle, mais dès que je l'ouvre je bloque et je fais autre chose. Sophia peut m'aider comment ?

**Sophia**
> Je partirais sur une carte d’attaque, technique Preparer le terrain : tu réduis le frottement avant d’ouvrir le dossier, pour que le démarrage soit plus simple et tu aies moins envie de partir faire autre chose.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- active_skill: `coaching_recommendation`, `turn_count=1`, `last_visible_decision.lever=attack_card`, `variant=preparer_terrain`

### Tour 2

**Verdict du tour:** green

**User**
> Attends, je connais pas du tout ces mots. Une carte d'attaque c'est quoi, et Préparer le terrain ça veut dire quoi concrètement ?

**Sophia**
> Une carte d’attaque, c’est un petit appui pour t’aider à démarrer une action du plan quand le premier pas bloque. Ici, “Préparer le terrain” veut dire : rendre le démarrage plus facile en avançant un peu l’environnement avant d’ouvrir le dossier, par exemple sortir ce qu’il faut, fermer ce qui distrait, et garder seulement l’étape suivante visible.
>
> Dans ton cas, je partirais sur une carte d’attaque, technique Préparer le terrain : elle colle bien parce que tu bloques dès l’ouverture, donc l’objectif est de rendre le départ plus simple, pas de changer le plan.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- active_skill: `coaching_recommendation`, `turn_count=2`, `last_visible_decision.lever=attack_card`, `variant=preparer_terrain`

### Tour 3

**Verdict du tour:** green

**User**
> Ok, si je veux la préparer moi-même dans Sophia, je vais où exactement ? Ne crée rien depuis le chat.

**Sophia**
> Tu vas dans **Dashboard > Plan**, puis tu ouvres l’action **Préparer le dossier mutuelle**. C’est depuis cette action que tu peux préparer une **carte d’attaque**. Pas depuis le chat.
>
> Si tu veux, je peux aussi te dire quelle technique choisir pour ce blocage.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- active_skill: `coaching_recommendation`, `turn_count=3`, `last_visible_decision.lever=attack_card`, `variant=preparer_terrain`

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Le truc c'est que je suis tendu avant d'ouvrir ce dossier, j'ai peur de découvrir un problème. Du coup une potion serait mieux ou je reste sur la carte ?

**Sophia**
> Reste sur la carte d’attaque. Pour ce blocage, elle colle mieux qu’une potion: elle t’aide à démarrer malgré la tension, là où la potion sert plutôt à changer ton état global. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `coaching_recommendation_exit_to_global`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- selected_skill_id: `coaching_recommendation`
- active_skill after turn: null
- exit_memo observed after turn: null

**Analyse si yellow/red**
- Symptome: la reponse visible est correcte, mais le flow se vide alors que le user continue explicitement le coaching sur la meme action et la meme recommandation.
- Source amont probable: reducer/local flow `coaching_recommendation` ou limite de tours qui produit `coaching_recommendation_exit_to_global` sans note exploitable ni persistance active.
- Owner runtime: `coaching_recommendation` local flow state management.
- Meilleure correction selon les guidelines: ne pas clore le flow quand le dernier tour reste une comparaison in-scope entre feature deja recommandee et alternative liee au meme blocage. La cloture doit attendre un vrai signal de fin, un changement de sujet clair, ou une reponse dont le dispatcher peut produire une note d'exit utile.
- Pourquoi ce n'est pas un patch local: le probleme n'est pas une phrase visible; c'est la transition d'etat qui retire la source canonique d'ownership.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow; consequence `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Et après l'avoir préparée, je la retrouve où pour la relire quand je bloque ?

**Sophia**
> Tu la retrouves dans Dashboard > Ressources, rangée par niveau. Si tu pars du plan, ouvre la mission ou l’habitude concernée puis Ressources.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- active_skill before/after: null

**Analyse si yellow/red**
- Symptome: la reponse produit est acceptable isolee, mais le tour aurait du rester sous `coaching_recommendation` car il demande ou relire la carte d'attaque recommandee dans le flow.
- Source amont probable: consequence directe du T4: l'etat actif a ete vide, donc `readActiveFlowState` ne peut plus proteger l'ownership coaching au T5.
- Owner runtime: `coaching_recommendation` local flow state management, puis arbitration globale par absence d'active flow.
- Meilleure correction selon les guidelines: garder `coaching_recommendation` actif pour les follow-ups produit sur une recommandation stable, y compris apres comparaison carte/potion/adjust plan tant que le user parle du meme blocage.
- Pourquoi ce n'est pas un patch local: ajouter une phrase dans `product_help` masquerait le symptome; la source est la perte d'ownership avant arbitration.

### Tour 6

**Verdict du tour:** green

**User**
> Autre cas : j'ai aussi un mail à Camille qui n'est pas dans mon plan, et je bloque pareil dès que j'ouvre le brouillon. Là tu me conseillerais quoi ?

**Sophia**
> Je partirais sur une carte d’attaque libre, technique Preparer le terrain : avant d’ouvrir le brouillon, tu mets tout ce qui te rassure à portée de main pour rendre le démarrage plus simple. Tu la retrouveras ensuite dans Dashboard > Ressources.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- active_skill: `coaching_recommendation`, `turn_count=1`, `last_visible_decision.lever=free_attack_card`, `variant=preparer_terrain`

### Tour 7

**Verdict du tour:** green

**User**
> Et cette carte libre, je la prépare où exactement ? Je suis encore un peu paumé dans l'interface.

**Sophia**
> Tu la prépares dans **Dashboard > Ressources**.
>
> Ici, je partirais sur une **carte d’attaque libre**, technique **Préparer le terrain** : tu ranges juste ce qui bloque l’entrée dans le mail avant d’ouvrir le brouillon, comme ça le démarrage devient plus simple.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: none
- active_skill: `coaching_recommendation`, `turn_count=2`, `last_visible_decision.lever=free_attack_card`, `variant=preparer_terrain`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia comprend correctement le blocage de demarrage sur action du plan.
- Elle explique bien la carte d'attaque et la technique a un user novice.
- Elle respecte "Ne cree rien depuis le chat"; aucun effet durable n'est cree.
- Elle distingue correctement tension liee a l'action vs potion d'etat global.
- Le mode hors plan fonctionne bien: carte d'attaque libre + destination `Dashboard > Ressources`.

**Problemes**
- Tour 4: la reponse est bonne, mais elle sonne comme une fin implicite de flow alors que le user continue son besoin. Famille: `BF-STATE-01`. Impact: le prochain tour perd le contexte coaching. Severite: yellow.
- Tour 5: Sophia repond via `product_help`; humainement c'est comprehensible, mais la continuite "on parle de ta carte pour ce blocage" est moins nette. Famille: `BF-STATE-01` avec consequence `BF-ROUTE-01`. Impact: risque de reponses produit generiques ou contradictoires. Severite: yellow.

**Fix propose**
- Source amont: reducer/local state `coaching_recommendation`, en particulier les criteres de completion et la persistance apres reponse in-scope.
- Correction recommandee: considerer comme `continue` les tours ou le user compare une alternative produit/emotionnelle a la recommandation stable ou demande une guidance produit liee a cette recommandation.
- Tests d'invariant attendus: run local ou integration ou T1 plan action -> T2 explication novice -> T3 destination Plan -> T4 comparaison potion/action-linked emotion -> T5 destination/consultation reste `active_coaching_recommendation`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1-T3: routage correct vers `coaching_recommendation`.
- T4: `selected_skill_id=coaching_recommendation`, mais `response_owner=normal_reply` et `route_reason=coaching_recommendation_exit_to_global`; l'etat actif est vide apres le tour.
- T5: faute d'active flow, le global route vers `product_help_signal`.
- T6-T7: re-entree et maintien corrects en `coaching_recommendation` pour action hors plan.

**Skills / Operations / Tools**
- Skill principal: `coaching_recommendation`.
- Aucun tool, aucune operation engageante.
- Les visibles `action_plan_coaching` et `no_plan_coaching` produisent les destinations attendues quand le flow reste actif.

**Memory / Effets durables**
- Aucun effet durable attendu ou observe.
- Cleanup run-scope effectue apres capture du rapport.

**Problemes**
- Tour 4: le local flow clot trop vite sans laisser de note d'exit exploitable. Famille: `BF-STATE-01`. Impact systeme: `readActiveFlowState` n'a plus de source canonique au tour suivant. Severite: yellow.
- Tour 5: product_help devient owner par absence d'active state. Famille: `BF-STATE-01` upstream, `BF-ROUTE-01` consequence. Impact systeme: perte d'ownership coaching pour une question produit in-scope. Severite: yellow.

**Fix propose**
- Source amont: `coaching_recommendation` reducer/completion policy.
- Correction recommandee: remplacer la cloture max-turn/in-scope par une regle de maintien quand `last_visible_decision` ou `recommendation_decision` est stable et que le dernier message user reste dans le meme objet de coaching.
- Tests d'invariant attendus: test local ciblant le passage T4-like et QA rerun reel avec T5-like.

## Verdict Global

Verdict global: **yellow**.

Le fix recent fonctionne pour les follow-ups produit quand l'etat actif est conserve, notamment T3 et T7. Il reste un bug de transition: un tour de comparaison in-scope peut clore `coaching_recommendation`, ce qui laisse `product_help` reprendre le tour suivant.
