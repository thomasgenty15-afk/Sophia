## 1. Contexte Du Test

- Date: 2026-06-19
- Run: `coachingrec-novice-confused-postfix-20260619-r1`
- Persona: user QA local temporaire `qa-normal-coachingrec-novice-confused-postfix-20260619-r1-1781886941896@example.com`
- Objectif: verifier apres correction que les visibles coaching repondent d'abord aux demandes novice d'explication/comparaison, sans pousser une feature par reflexe.
- Trajectoire: question produit floue -> coaching action hors plan implicite -> definitions novice -> demande concrete confuse -> comparaison sans choix -> changement de moment de blocage.
- Surfaces visees: dispatcher global, ownership actif, local flow `coaching_recommendation`, visible agent `no_plan_coaching`, decision visible `coaching_only`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe.
- Validite QA: valide avec incident runtime documente. Le tour 4 a renvoye `502` sans reponse, puis le meme message a ete retente au tour 5.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je sais pas trop comment dire. J'ai un truc à faire, j'ouvre mon ordi, je regarde, puis je referme. Et je comprends rien à vos histoires de cartes, c'est quoi exactement ?

**Sophia**
> Une carte d’attaque t’aide à démarrer une action quand c’est dur de t’y mettre. Une carte de défense t’aide à tenir quand il y a un risque de déraper, craquer ou éviter.
>
> En bref : attaque = “comment je m’y mets ?” ; défense = “qu’est-ce qui peut me faire dévier, et quoi faire à ce moment-là ?”

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: product_help_signal
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Ok. Le truc c'est mon dossier mutuelle, enfin je crois. Je dois envoyer des papiers mais dès que j'y pense je pars ailleurs. Donc je fais quoi, une carte attaque ou défense ou je sais pas ?

**Sophia**
> Je partirais sur une carte d’attaque libre, technique Preparer le terrain : elle sert à rendre le démarrage plus simple quand tu ouvres l’ordi, regardes, puis décroches. La défense, elle, sert plutôt quand tu es déjà lancé et que tu risques de partir ailleurs ou d’abandonner au mauvais moment.
>
> Là, ton blocage principal c’est d’entrer dedans.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- safety: none
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `free_attack_card / preparer_terrain`
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Attends je suis perdu. Préparer le terrain ça veut dire quoi en vrai ? Et carte libre ça veut dire quoi ?

**Sophia**
> Oui, je t’éclaire simplement :
> - carte d’attaque = pour t’aider à démarrer quand tu bloques à l’entrée
> - carte de défense = pour éviter de décrocher au moment critique
> - carte libre = une carte pour ton action à toi, sans lien avec un Plan
>
> Là, vu que tu ouvres puis tu refermes, je partirais sur une carte d’attaque libre, technique Préparer le terrain : tu mets juste tout ce qu’il faut sous la main avant d’ouvrir le dossier, pour rendre le premier geste le plus facile possible.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `free_attack_card / preparer_terrain`
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Je crois que je mélange tout. Premier geste ça veut dire quoi ? Genre là maintenant je dois ouvrir quoi, écrire quoi, faire quoi ?

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
- Symptome: erreur HTTP `502`, reponse vide, aucune trace de routage exploitable.
- Source amont probable: incident runtime local ponctuel.
- Owner runtime: edge function locale / runner QA, pas le prompt coaching.
- Meilleure correction selon les guidelines: ne pas masquer par fallback; documenter l'incident, verifier absence d'effet durable, puis retenter le meme tour.
- Pourquoi ce n'est pas un patch local: aucune sortie IA ou decision de flow n'a ete produite.

### Tour 5

**Verdict du tour:** green

**User**
> Je crois que je mélange tout. Premier geste ça veut dire quoi ? Genre là maintenant je dois ouvrir quoi, écrire quoi, faire quoi ?

**Sophia**
> Oui, ici je partirais sur une carte d’attaque libre, technique Préparer le terrain. En vrai, ça veut dire: tu mets juste le dossier devant toi, tu rassembles les papiers au même endroit, puis tu ouvres le premier document. Le but, c’est de rendre le démarrage plus simple quand tu pars ailleurs dès que tu y penses.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `free_attack_card / preparer_terrain`
- executed_tools: []
- durable_effect: none

### Tour 6

**Verdict du tour:** green

**User**
> Ok mais là je te demande pas vraiment de choisir à ma place. C'est quoi la différence entre préparer le terrain et juste me forcer deux minutes ?

**Sophia**
> Oui :
> - **Préparer le terrain** = tu rends le démarrage plus facile avant d’agir. Par exemple : ouvrir le bon fichier, poser les papiers sur la table, couper les distractions.
> - **Te forcer deux minutes** = tu n’améliores pas le contexte, tu t’engages juste à faire un tout petit bout malgré l’inconfort.
>
> En vrai, si ton blocage est de **commencer**, préparer le terrain est souvent plus simple et plus durable. Si tu veux, je peux te dire lequel colle le mieux à ton cas en une phrase.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `coaching_only`
- executed_tools: []
- durable_effect: none

### Tour 7

**Verdict du tour:** green

**User**
> En fait parfois j'arrive à ouvrir les papiers, mais après je vois un truc compliqué et je ferme direct. C'est encore le même truc ou pas ?

**Sophia**
> Oui, c’est le même type de difficulté, mais pas le même moment.
>
> - Si tu bloques avant d’ouvrir, c’est un souci de démarrage.
> - Si tu ouvres puis tu refermes dès que ça devient compliqué, c’est plutôt un moment de décrochage.
>
> Là, ce que tu décris ressemble surtout à un décrochage au moment où tu tombes sur le truc compliqué. Donc on ne travaille pas juste “ouvrir”, on travaille aussi “rester 30 secondes de plus sans fuir”.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `coaching_only`
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia explique les termes produit pour un novice avant de rentrer dans le detail.
- Le flow reste lisible pour un user qui parle de maniere floue et change de formulation.
- Tour 6: la contrainte "je te demande pas vraiment de choisir" est respectee; Sophia compare sans pousser une nouvelle carte.
- Tour 7: Sophia explique la difference de moment de blocage sans basculer automatiquement en nouvelle feature.

**Problemes**
- Tour 4: incident HTTP `502`, sans reponse visible. Famille: BF-TEST-01. Impact: incident technique ponctuel, pas un probleme conversationnel du prompt.

**Fix propose**
- Source amont: runtime local si le `502` se reproduit.
- Correction recommandee: aucune correction coaching sur ce run; surveiller la recurrence des 502.
- Tests d'invariant attendus: conserver le test "novice demande comparaison sans choix" -> `last_visible_decision.lever=coaching_only`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1 route vers `product_help`, coherent avec une demande dominante "c'est quoi les cartes".
- T2-T7 restent sous `response_owner=coaching_recommendation` apres entree dans le coaching.
- Aucun saut parasite vers product_help une fois le flow coaching actif.

**Skills / Operations / Tools**
- Skill actif: `coaching_recommendation` a partir du tour 2.
- Aucun tool ou effet durable appele.
- Nettoyage cible effectue sur la persona QA temporaire.

**Decision Visible**
- T2-T5: `last_visible_decision=free_attack_card / preparer_terrain`, coherent avec un blocage de demarrage sur action hors plan implicite.
- T6: `last_visible_decision=coaching_only`, conforme a la demande de comparaison sans choix.
- T7: `last_visible_decision=coaching_only`, conforme a une clarification de moment de blocage.

**Incident**
- T4: `502` sans reponse, puis retry identique au T5 avec succes.
- Aucun effet durable observe pendant l'incident.

## Verdict Global

**yellow** — comportement coaching conforme au point teste, mais run marque yellow a cause d'un incident runtime `502` documente. Fonctionnellement, la correction est valide sur les tours exploitables: le visible agent utilise `coaching_only` quand le user demande une comparaison/clarification sans choix de feature.
