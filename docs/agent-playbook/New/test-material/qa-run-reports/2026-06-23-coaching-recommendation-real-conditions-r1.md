# QA Run Report - Coaching Recommendation Real Conditions R1

## 1. Contexte Du Test

- Date: 2026-06-23
- Run: `coachingrec-real-conditions-20260623-r1`
- Persona: user QA temporaire `qa-normal-coachingrec-real-conditions-20260623-r1-1782237122835@example.com`
- Objectif: tester en conditions reelles locales le flow `coaching_recommendation`, surtout le cas emotion liee a action du plan + comparaison potion/carte, puis les follow-ups produit.
- Trajectoire: action du plan -> choix de levier Sophia -> incident endpoint -> retry -> comparaison potion Apaisement vs carte d'attaque -> guidance preparation -> guidance consultation.
- Surfaces visees: dispatcher global, active flow arbitration, local dispatcher `coaching_recommendation`, visible `action_plan_coaching`, product guidance, absence de side effect.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Setup: user temporaire et plan QA run-scope avec action active `Préparer le dossier mutuelle`.
- Cleanup: fixtures plan run-scope supprimees; user/messages/chat state/memory run-scopes supprimes. `user_memories` a retourne 404 pendant cleanup car table non disponible sur ce local, sans impact observe.
- Validite QA: valide, avec incident HTTP 502 documente au T2.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow; consequence `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> J'ai dans mon plan l'action Préparer le dossier mutuelle. Je bloque avant même de commencer, je vois le dossier et je pars faire autre chose. Tu me conseillerais quoi dans Sophia ?

**Sophia**
> Je te conseillerais une entrée ultra simple : ouvrir le dossier sans chercher à le finir.
>
> L’idée, c’est de casser le blocage au démarrage, pas de “faire la tâche”. Tu vises juste 2 minutes : sortir le dossier, poser les pièces à côté, puis t’arrêter si besoin. Ça réduit l’évitement. ✅

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
- skill_status: `exit`
- exit_reason: `topic_change`
- active_skill after turn: null

**Analyse si yellow/red**
- Symptome: le skill est selectionne, mais sort immediatement vers global; la reponse devient un conseil conversationnel generique, sans carte d'attaque ni levier Sophia, alors que le user demande explicitement "quoi dans Sophia" pour une action du plan.
- Source amont probable: local dispatcher / reducer `coaching_recommendation` autorise encore un `exit_to_global_dispatcher` sur un besoin initial in-scope.
- Owner runtime: `coaching_recommendation`.
- Meilleure correction selon les guidelines: interdire `exit_to_global_dispatcher` quand le message courant contient une action du plan concrete + demande de levier Sophia; forcer `action_plan_coaching`.
- Pourquoi ce n'est pas un patch local: le probleme est une transition d'etat/ownership, pas une phrase visible.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Je pensais justement à une carte d'attaque. C'est ça qu'il faudrait, ou plutôt ajuster mon plan ?

**Sophia**
> 

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non disponible
- executed_tools: []
- durable_effect: none
- assistant: reponse vide

**Analyse si yellow/red**
- Symptome: endpoint local renvoie 502 et aucune reponse assistant exploitable.
- Source amont probable: incident runtime Edge Function / LLM call / gateway local.
- Owner runtime: test/runtime local Sophia Brain.
- Meilleure correction selon les guidelines: documenter l'incident, ne pas utiliser de fallback, reprendre au point d'arret; analyser les logs runtime si l'incident se reproduit.
- Pourquoi ce n'est pas un patch local: aucune sortie metier n'a ete produite; ce n'est pas corrigeable par prompt ou reducer.

### Tour 3

**Verdict du tour:** green

**User**
> Je reformule parce que ça n'a pas répondu : est-ce que tu me conseillerais une carte d'attaque pour cette action du plan, ou plutôt ajuster le plan ?

**Sophia**
> Pour ton cas, je partirais sur une carte d’attaque, technique Préparer le terrain : ton blocage est surtout au moment de démarrer, pas un signe que l’action du plan est mauvaise.
>
> L’ajustement du plan, lui, sert si l’action “Préparer le dossier mutuelle” est vraiment trop lourde, mal calibrée ou au mauvais rythme. Ici, le plus utile est de rendre le premier geste plus simple.

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
- active_skill: `coaching_recommendation`
- local_coaching_type: `plan_action`
- last_visible_decision: `attack_card`, `variant=preparer_terrain`

### Tour 4

**Verdict du tour:** green

**User**
> Le truc c'est que j'ai une boule au ventre quand je pense au dossier mutuelle. Est-ce qu'une potion Apaisement serait plus logique que la carte d'attaque ?

**Sophia**
> La potion Apaisement sert quand la pression monte de façon plus globale. Ici, ta boule au ventre est liée à une action précise du plan, donc je resterais sur une carte d’attaque.
>
> Je partirais sur une carte d’attaque, technique Preparer le terrain : tu allèges le démarrage en préparant le contexte avant d’ouvrir le dossier, ce qui aide justement quand tu bloques avant même de commencer.

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
- skill_status: `continue`
- active_skill: `coaching_recommendation`
- local_coaching_type: `plan_action`
- last_visible_decision: `attack_card`, `variant=preparer_terrain`

### Tour 5

**Verdict du tour:** green

**User**
> Ok. Et si je veux la préparer moi-même dans Sophia sans que tu la crées depuis le chat, je vais où exactement ?

**Sophia**
> Oui : pour préparer une carte d’attaque, va dans **Dashboard > Plan**, ouvre l’action **« Préparer le dossier mutuelle »**, puis lance la préparation de la carte d’attaque depuis cette action.
>
> Comme ton blocage semble surtout venir du démarrage, je partirais sur **une carte d’attaque, technique Preparer le terrain** : ça aide à rendre le premier geste plus simple en organisant ce qu’il faut avant de commencer.

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
- active_skill: `coaching_recommendation`
- local_coaching_type: `plan_action`
- current_recommendation.feature: `attack_card`
- destination_hint: `Dashboard > Plan`

### Tour 6

**Verdict du tour:** green

**User**
> Et une fois qu'elle est préparée, je la retrouve où pour la relire quand je bloque ?

**Sophia**
> Oui : une fois préparée, tu la retrouves dans Dashboard > Ressources pour la relire quand tu bloques.
>
> Pour cette action du plan, je partirais bien sur une carte d’attaque, technique Preparer le terrain : ça aide à rendre le démarrage plus simple en organisant juste ce qu’il faut avant de t’y mettre.

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
- active_skill: `coaching_recommendation`
- local_coaching_type: `plan_action`
- current_recommendation.feature: `attack_card`
- active_turn_count: 4

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T3-T6 sont globalement fluides: Sophia choisit la carte d'attaque, nomme `Préparer le terrain`, refuse la potion car l'emotion est liee a l'action du plan, puis repond aux destinations produit sans sortir vers `product_help`.
- La distinction `Dashboard > Plan` pour preparer et `Dashboard > Ressources` pour relire est claire.
- Sophia respecte la contrainte "sans que tu la crees depuis le chat"; aucun effet durable n'est produit.

**Problemes**
- Tour 1: premiere reponse trop generique, pas de levier Sophia malgre la demande. Famille: `BF-STATE-01` avec consequence `BF-ROUTE-01`. Impact: le user doit reformuler pour obtenir le bon flow. Severite: red.
- Tour 2: incident 502 et reponse vide. Famille: `BF-TEST-01`. Impact: interruption utilisateur et run techniquement degrade. Severite: red.

**Fix propose**
- Source amont: `coaching_recommendation` local dispatcher/reducer pour T1; runtime local/test endpoint pour T2.
- Correction recommandee: ajouter un invariant d'entree initiale: action du plan concrete + demande "quoi dans Sophia / quel levier" ne peut pas sortir en `topic_change`; il doit produire `action_plan_coaching`.
- Tests d'invariant attendus: T1-like sans mention explicite "carte" doit quand meme recommander un levier Sophia et rester owner.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1: `selected_skill_id=coaching_recommendation` mais `skill_status=exit`, `route_reason=coaching_recommendation_exit_to_global`, puis `response_owner=normal_reply`. C'est une mauvaise transition interne.
- T2: HTTP 502, aucune trace metier exploitable.
- T3: entree correcte via `coaching_recommendation_signal`.
- T4-T6: maintien correct via `active_coaching_recommendation`.

**Skills / Operations / Tools**
- Skill vise: `coaching_recommendation`.
- Aucun tool ni operation engageante.
- T4 valide le fix attendu: comparaison potion Apaisement vs carte d'attaque reste `action_plan_coaching` et ne produit pas `exit_to_global`.

**Memory / Effets durables**
- Aucun effet durable attendu.
- Aucun effet durable observe.
- Cleanup run-scope effectue apres capture des traces.

**Problemes**
- Tour 1: sortie prematuree du skill sur un besoin initial in-scope. Famille: `BF-STATE-01`. Impact systeme: perte d'active flow et reponse normal_reply. Severite: red.
- Tour 2: 502 endpoint. Famille: `BF-TEST-01`. Impact systeme: tour non exploitable et necessite retry. Severite: red.

**Fix propose**
- Source amont: enforcement du local dispatcher pour T1; logs Edge Function/LLM runtime pour T2 si recurrent.
- Correction recommandee: etendre la garde qui bloque les exits in-scope aux premiers tours sans `previous_state`, pas seulement aux continuations apres recommandation stable.
- Tests d'invariant attendus:
  - Initial plan action + "tu me conseillerais quoi dans Sophia ?" -> `response_owner=coaching_recommendation`, `visible_task=action_plan_coaching`, pas `exit`.
  - Plan action + emotion liee + potion vs carte -> `active_coaching_recommendation`, pas `state_potion`, pas `product_help`.

## Verdict Global

Verdict global: **red**.

Le fix du cas principal T4-T6 est valide en conditions reelles: emotion liee a action du plan reste dans `coaching_recommendation`, et les follow-ups produit restent owned par le flow. Le run global reste red a cause d'une sortie prematuree au premier tour in-scope et d'un incident HTTP 502 au deuxieme tour.
