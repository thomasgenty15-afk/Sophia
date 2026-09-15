## 1. Contexte Du Test

- Date: 2026-06-20
- Run: `coachingrec-novice-confused-rerun-20260620-r1`
- Persona: user QA local temporaire `qa-normal-coachingrec-novice-confused-rerun-20260620-r1-1781910148101@example.com`
- Objectif: verifier si la correction "ne pas pousser une feature quand le user demande seulement a comprendre" tient sur un user novice confus.
- Trajectoire: demande floue et vocabulaire inconnu -> action mutuelle implicite -> questions de definition -> correction explicite du user -> changement vers decrochage pendant l'action.
- Surfaces visees: dispatcher global, local flow `coaching_recommendation`, visible agent `no_plan_coaching`, `last_visible_decision=coaching_only`, ownership actif.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe.
- Validite QA: valide avec incident runtime documente. Le tour 6 a renvoye `502`, puis le meme message a ete retente au tour 7.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-03 - Product/status/tool mal priorises

**User**
> Je sais pas, j'ai un truc administratif qui traîne, j'ouvre mon ordi puis je fais autre chose. Et les cartes Sophia là, je comprends même pas ce que c'est.

**Sophia**
> Le blocage ressemble surtout à de l’évitement par flou : tant que le truc administratif reste vague, ton cerveau le repousse. Et pour les cartes, en simple, c’est des éléments de suivi/action visibles dans la plateforme, pas un concept à comprendre pour avancer.
>
> Le plus utile là, c’est de clarifier en une phrase ce dossier administratif précis, puis de le traiter en version minuscule.

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: product_help_exit_to_global
- selected_skill_id: product_help
- safety: none
- direct_effects: []
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le tour contient un signal coaching clair ("j'ouvre mon ordi puis je fais autre chose") mais finit en `normal_reply` apres `product_help_exit_to_global`.
- Source amont probable: arbitrage product_help vs coaching trop favorable a l'explication produit quand le message contient aussi une difficulte concrete.
- Owner runtime: global dispatcher / active flow creation depuis signal composite.
- Meilleure correction selon les guidelines: en multi-intention "je bloque + je ne comprends pas les cartes", entrer dans coaching si la difficulte concrete est exploitable, tout en demandant au visible d'expliquer les termes.
- Pourquoi ce n'est pas un patch local: le visible coaching ne peut pas agir si le global ne cree pas le flow.

### Tour 2

**Verdict du tour:** green

**User**
> Le dossier c'est sûrement la mutuelle. Je dois envoyer des papiers, mais je sais pas par où commencer, donc je ferme. Tu ferais quoi là ?

**Sophia**
> C'est tout à fait normal d'être un peu perdue face à ces nouveaux termes. Pour faire simple, une carte Sophia est un petit outil concret pour t'aider à agir. Une carte d'attaque, par exemple, sert justement quand on bloque avant même de commencer, comme pour tes papiers de mutuelle.
>
> Je te conseille la technique **Préparer le terrain** : l'idée n'est pas d'envoyer les papiers tout de suite, mais juste de préparer ton environnement (ouvrir l'onglet de la mutuelle, sortir le dossier sur ton bureau) pour que le démarrage soit automatique plus tard. Ça permet de lever le flou sans te mettre la pression du résultat final.
>
> On regarde comment mettre ça en place ?

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `free_attack_card / preparer_terrain`
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Je comprends pas trop. Préparer le terrain, c'est juste ranger mon bureau ? Et carte d'attaque ça veut dire que je dois créer un truc dans Sophia ?

**Sophia**
> Oui : “préparer le terrain”, c’est surtout rendre le démarrage plus facile, pas juste ranger ton bureau. Par exemple : ouvrir le bon dossier, sortir les papiers utiles, fermer ce qui distrait.
>
> Et une carte d’attaque, ce n’est pas créer un truc compliqué dans Sophia : c’est une aide simple pour te lancer.
>
> Je partirais sur une carte d’attaque libre, technique Préparer le terrain : tu mets juste devant toi la mutuelle, les papiers à envoyer et une enveloppe, pour enlever le flou au moment de commencer.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `free_attack_card / preparer_terrain`
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue

**User**
> Non mais attends, je demande pas encore quoi choisir. Je veux juste comprendre la différence entre une carte d'attaque et me dire 'allez je le fais 2 minutes'.

**Sophia**
> Oui : “je le fais 2 minutes”, c’est juste une règle pour te lancer tout de suite. Une carte d’attaque, elle, te prépare avant de démarrer pour que le premier geste soit moins dur.
>
> Ici, je partirais sur une carte d’attaque libre, technique Préparer le terrain : tu poses juste ce qu’il faut à portée de main, tu ouvres le bon dossier, et tu enlèves le reste pour ne pas repartir ailleurs. C’est adapté parce que ton blocage est surtout au démarrage.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `free_attack_card / preparer_terrain`
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user dit explicitement "je demande pas encore quoi choisir", mais Sophia recommande encore une carte d'attaque libre.
- Source amont probable: prompt `no_plan_coaching` encore trop permissif quand l'explication est suivie d'un contexte de blocage deja connu.
- Owner runtime: visible agent `no_plan_coaching` / decision visible fine.
- Meilleure correction selon les guidelines: dans ce cas, `last_visible_decision.lever` doit etre `coaching_only`, sans "je partirais sur".
- Pourquoi ce n'est pas un patch local: c'est une regle de priorisation d'intention visible, pas une phrase a blacklister.

### Tour 5

**Verdict du tour:** green

**User**
> Tu vois, là tu recommandes encore. Moi je suis juste en train d'essayer de comprendre les mots, pas de préparer quoi que ce soit.

**Sophia**
> Oui — c’est pas la même chose.
>
> - Dire « allez, je le fais 2 minutes », c’est un mini-élan: tu te donnes une petite durée pour démarrer.
> - Une carte d’attaque, c’est un appui préparé avant: par exemple une phrase, un mot, ou un petit rituel qui te rend le démarrage plus facile quand tu bloques.
>
> Donc ici, la différence simple: le 2 minutes, c’est toi qui pousses; la carte d’attaque, c’est un support qui t’aide à pousser.
>
> Si tu veux, je peux aussi te donner un exemple ultra concret sur ton dossier mutuelle.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `coaching_only`
- executed_tools: []
- durable_effect: none

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Ok. Et si en fait j'arrive à ouvrir le dossier, mais dès que je vois une ligne compliquée je panique et je ferme, c'est encore attaque ou c'est autre chose ?

**Sophia**
> 

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: []
- executed_tools: []
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: erreur HTTP `502`, reponse vide, aucune trace exploitable.
- Source amont probable: incident runtime local ponctuel.
- Owner runtime: edge function locale / runner QA.
- Meilleure correction selon les guidelines: documenter et retenter le meme tour sans fallback.
- Pourquoi ce n'est pas un patch local: aucun raisonnement IA exploitable n'a ete produit.

### Tour 7

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok. Et si en fait j'arrive à ouvrir le dossier, mais dès que je vois une ligne compliquée je panique et je ferme, c'est encore attaque ou c'est autre chose ?

**Sophia**
> Oui, là c’est encore une logique d’attaque, mais pas au même endroit : le blocage n’est plus au démarrage, il est au moment de friction. ⚡
>
> Donc en simple :
> - “je n’arrive pas à ouvrir” = démarrage
> - “j’ouvre puis je ferme quand ça devient flou” = point de résistance en cours d’action
>
> Autrement dit, tu n’as pas juste besoin d’un élan pour commencer, tu as besoin de tenir quand ça devient compliqué.

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: coaching_recommendation_exit_to_global
- selected_skill_id: coaching_recommendation
- visible_task_before_exit: no_plan_coaching
- coaching_type_before_exit: no_plan_action
- last_visible_decision_before_exit: `coaching_only`
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le flow sort vers `normal_reply` alors que le user continue le meme coaching; la reponse dit "encore attaque" mais explique ensuite un besoin de tenir pendant l'action.
- Source amont probable: `max_turns` / exit local trop agressif apres un tour `coaching_only`, sans reclassification fine de la nouvelle difficulte.
- Owner runtime: local flow `coaching_recommendation` exit policy + normal reply de sortie.
- Meilleure correction selon les guidelines: une nouvelle difficulte actionable dans le meme coaching doit relancer un visible agent cible, ici probablement `no_plan_coaching` avec `free_defense_card`, au lieu de produire un exit global.
- Pourquoi ce n'est pas un patch local: il faut corriger la transition d'etat et la politique de continuation, pas seulement la phrase "attaque".

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T2 explique mieux les cartes et nomme la technique.
- T5 montre que la correction peut fonctionner: Sophia respecte enfin "je veux juste comprendre" et passe en `coaching_only`.
- Le ton reste globalement accessible pour un novice.

**Problemes**
- T1: le signal coaching initial est absorbe par product_help/normal reply.
- T4: Sophia ignore la contrainte explicite "je demande pas encore quoi choisir".
- T7: Sophia donne une reponse contradictoire: "attaque" alors que le contenu de la difficulte indique plutot tenir pendant l'action.

**Fix propose**
- Source amont: global dispatcher pour T1; `no_plan_coaching` visible decision pour T4; local flow exit/max_turns pour T7.
- Correction recommandee: renforcer le mapping "explanation only -> coaching_only" des le premier signal explicite, et permettre au flow de continuer/reclassifier quand une nouvelle difficulte actionable arrive apres `coaching_only`.
- Tests d'invariant attendus:
  - "je demande pas encore quoi choisir" -> `last_visible_decision.lever=coaching_only`.
  - apres `coaching_only`, "j'ouvre puis je ferme quand ca devient complique" -> `no_plan_coaching` continue et peut recommander `free_defense_card`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1: `normal_reply` apres `product_help_exit_to_global`, alors que le message contient aussi un signal coaching.
- T2-T5: ownership correct `coaching_recommendation`.
- T7: sortie `coaching_recommendation_exit_to_global` alors que le user poursuit le meme probleme avec une nouvelle information actionable.

**Skills / Operations / Tools**
- Skill actif: `coaching_recommendation` T2-T7.
- Aucun tool ou effet durable appele.
- Nettoyage cible effectue sur la persona QA temporaire.

**Decision Visible**
- T4: `last_visible_decision=free_attack_card / preparer_terrain` malgre une contrainte explicite de non-choix.
- T5: `last_visible_decision=coaching_only`, comportement attendu.
- T7: l'etat avant sortie reste `coaching_only`; le nouveau signal n'est pas reduit vers defense.

**Incident**
- T6: `502` sans reponse, retry identique au T7.
- Aucun effet durable observe.

## Verdict Global

**yellow** — c'est mieux qu'avant sur le cas ou le user corrige explicitement Sophia (T5 passe bien en `coaching_only`), mais pas encore robuste. Le visible agent pousse encore une feature trop tot au T4, et le flow sort trop vite au T7 au lieu de traiter une nouvelle difficulte pendant l'action.
