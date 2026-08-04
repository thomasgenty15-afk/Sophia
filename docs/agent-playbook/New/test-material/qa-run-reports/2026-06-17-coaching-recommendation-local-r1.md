# QA Run Report - Coaching Recommendation Local R1

## 1. Contexte Du Test

- Date: 2026-06-17
- Run: `coachingrec-20260617-r1`
- Persona: persona QA temporaire locale `4f9d3ada-38c7-4e88-9505-a9e80c6e7bfd`, email `qa-normal-coachingrec-20260617-r1-1781718250542@example.com`
- Objectif: tester le skill `coaching_recommendation` sur au moins 5 tours, avec hesitation entre ajustement de plan, carte et rappel.
- Trajectoire: oubli recurrent d'une action du soir -> comparaison `adjust_plan` / `defense_card` -> contrainte "ne rien creer" -> revision vers `recurring_reminder` -> conseil de timing sans programmation.
- Surfaces visees: dispatcher global, router conversationnel, skill `coaching_recommendation`, active skill state, absence d'outils et d'effets durables.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Les 5 messages utilisateur ont ete choisis tour par tour apres lecture de Sophia et de la trace courte precedente. Aucun code applicatif modifie pendant le run. Cleanup cible execute a la fin; `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` et `auth.users` ok, `user_memories` a retourne `404`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis un peu perdu avec Sophia. J'ai une action du soir que j'oublie deux fois sur trois, et quand j'y pense je la trouve trop lourde. Je ne sais pas si je dois demander une carte, un rappel, ou changer le plan.

**Sophia**
> Je te recommande d'abord **adjust_plan** : le souci principal, c'est que l'action du soir parait trop lourde pour etre tenue regulierement. Commence par alleger le plan pour la rendre plus realiste. En secondaire, **recurring_reminder** peut aider si tu veux un coup de pouce pour ne pas l'oublier.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: non expose dans la trace courte
- executed_tools: []
- durable_effect: aucun; `scheduled_checkins=[]`

### Tour 2

**Verdict du tour:** green

**User**
> Pourquoi tu mettrais adjust_plan avant une carte de defense ? Le moment ou ca casse, c'est surtout quand j'ouvre le canape et que je me dis 'je le ferai demain'.

**Sophia**
> Entre les deux, je te conseille surtout adjust_plan : si le blocage vient d'une action du soir trop lourde, alleger le plan traite la cause a la source. En second, defense_card peut aider si tu veux preparer le moment precis ou tu bascules en mode "je le ferai demain". Si tu dois n'en garder qu'une, prends adjust_plan.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: non expose dans la trace courte
- executed_tools: []
- durable_effect: aucun; `scheduled_checkins=[]`

### Tour 3

**Verdict du tour:** green

**User**
> Ok, ne cree rien pour l'instant. Si je suis ton conseil, c'est quoi le premier pas concret a faire dans Sophia sans me retrouver avec un truc trop gros ?

**Sophia**
> Commence par **adjust_plan** : c'est le plus utile pour alleger l'action du soir a la source. Garde la meme intention, mais reduis-la a une version tres petite, faisable en 1 a 3 minutes, pour qu'elle soit plus simple a lancer.
>
> En second, si l'oubli reste le vrai souci apres ca, ajoute **recurring_reminder** dans l'espace Sophia pour te le rappeler chaque soir.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: non expose dans la trace courte
- executed_tools: []
- durable_effect: aucun; contrainte "ne cree rien" respectee; `scheduled_checkins=[]`

### Tour 4

**Verdict du tour:** green

**User**
> En fait en y repensant, l'action n'est pas si enorme. Le probleme principal c'est que je zappe completement jusqu'a ce qu'il soit trop tard. Tu changerais ta recommandation ?

**Sophia**
> Oui, je changerais : je te recommande d'abord recurring_reminder, parce que ton vrai blocage est l'oubli au mauvais moment. En secondaire, attack_card peut aider si tu veux preparer le moment ou tu risques de zapper. Si tu veux, je peux t'aider a choisir le meilleur timing pour le rappel.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: non expose dans la trace courte
- executed_tools: []
- durable_effect: aucun; active skill state ferme apres ce tour (`temp_memory={}`)

### Tour 5

**Verdict du tour:** green

**User**
> Oui, propose-moi le bon timing, mais ne le programme pas encore. Je veux juste savoir lequel choisir.

**Sophia**
> Le plus adapte ici, c'est un rappel recurrent. Le vrai sujet, c'est le timing : vise juste avant le moment ou tu decroches d'habitude, par exemple 10 a 30 minutes avant. Si tu veux, je peux t'aider a le caler plus precisement.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: non expose dans la trace courte
- executed_tools: []
- durable_effect: aucun; `scheduled_checkins=[]`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia identifie rapidement le vrai axe de decision au lieu de lister toutes les features.
- Le flow reste comprehensible: recommandation principale, alternative secondaire, puis revision quand le diagnostic utilisateur change.
- La contrainte "ne cree rien" est respectee humainement et systemiquement.
- Les reponses sont courtes, non mecaniques, et evitent de transformer la recommandation en execution.

**Problemes**
- Aucun probleme bloquant observe. Le choix de `attack_card` en secondaire au tour 4 est discutable mais acceptable: Sophia le cadre comme aide de preparation au moment de decrochage, sans le mettre devant `recurring_reminder`.

**Fix propose**
- Aucun fix requis pour ce run. Garder ce scenario comme regression: la recommandation doit pouvoir changer de `adjust_plan` vers `recurring_reminder` quand le besoin passe de "action trop lourde" a "oubli pur".

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tour 1: detection initiale correcte via `coaching_recommendation_signal`.
- Tours 2 a 4: maintien correct du flow actif via `active_coaching_recommendation`.
- Tour 5: apres cloture du flow au tour 4, le dispatcher redetecte correctement le signal `coaching_recommendation` depuis la demande de timing.

**Skills / Operations / Tools**
- `selected_skill_id=coaching_recommendation` sur les 5 tours.
- Aucun ancien outil operationnel appele.
- `executed_tools=[]` et `tool_execution=none` sur les 5 tours.
- `direct_effects=[]` et `direct_effects_to_run=[]` sur les 5 tours, y compris quand le sujet devient rappel.

**Memory / Effets durables**
- `user_chat_states.temp_memory.__active_skill_state.skill_id=coaching_recommendation` jusqu'au tour 3, puis flow ferme au tour 4, puis reouvert au tour 5.
- Aucun scheduled checkin cree: `scheduled_checkins=[]` a chaque snapshot.
- Cleanup cible execute en fin de run pour la persona QA temporaire.

**Problemes**
- Aucun bug systeme observe.

**Fix propose**
- Aucun fix requis.

## Verdict Global

Green. Run QA valide: le skill `coaching_recommendation` route correctement, recommande sans executer, revise sa recommandation quand le signal utilisateur change, et respecte l'absence d'effet durable.
