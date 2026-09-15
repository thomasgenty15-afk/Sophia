## 1. Contexte Du Test

- Date: 2026-06-22
- Run: `coachingrec-focused-20260622-r1`
- Persona: user QA local temporaire `qa-normal-coachingrec-focused-20260622-r1-1782148565619@example.com`
- Objectif: tester uniquement `coaching_recommendation` sur une action hors plan, avec explication novice, comparaison sans feature, switch attaque -> defense, guidance produit et reprise de contexte.
- Trajectoire: mail Camille hors plan -> carte d'attaque libre -> explications/coaching_only -> bascule vers defense -> guidance Ressources -> reprise coaching.
- Surfaces visees: dispatcher global, local flow `coaching_recommendation`, visible agent `no_plan_coaching`, `last_visible_decision`, ownership actif, absence d'effet durable.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe.
- Validite QA: valide avec incidents runtime documentes. Les tours 4 et 5 ont renvoye `502`; le meme message a ete retente et a reussi au tour 6.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'ai un mail à envoyer à Camille, ça fait trois jours que je l'évite. Dès que j'ouvre le brouillon je bloque, je relis deux mots et je pars faire autre chose. Tu m'aiderais comment ?

**Sophia**
> Je partirais sur une carte d’attaque libre, technique Préparer le terrain : ferme le brouillon, enlève les distractions, et ne te donne comme objectif que d’écrire la première phrase du mail. Comme tu bloques dès l’ouverture, cette technique réduit la friction avant même de relire.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- safety: none
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `free_attack_card / preparer_terrain`
- direct_effects: []
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Attends, je connais pas ces mots. C'est quoi une carte d'attaque libre et Préparer le terrain ? Je ne te demande pas encore de choisir à ma place.

**Sophia**
> Bien sûr.
>
> Une **carte d’attaque libre**, c’est juste une aide pour **rendre le démarrage plus facile** quand tu bloques avant d’ouvrir ou de reprendre le mail.
>
> **Préparer le terrain**, c’est la technique où tu **fais tomber la friction avant de commencer** : fermer les distractions, ouvrir le brouillon, laisser juste ce qu’il faut sous les yeux, et rendre le premier geste très simple.
>
> Donc ici, ça veut dire : pas “travailler le mail”, mais **préparer le contexte pour que tu puisses t’y remettre sans forcer**.
>
> Si tu veux, je peux aussi te comparer **Préparer le terrain** avec **Mot de bascule** en une phrase chacun.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `coaching_only`
- direct_effects: []
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Oui compare, mais juste pour comprendre. C'est quoi la différence entre Préparer le terrain et Mot de bascule ? Je ne prépare rien maintenant.

**Sophia**
> Bien sûr.
>
> - **Préparer le terrain** : tu agis sur l’environnement pour que commencer soit plus facile. Exemple simple : ouvrir le brouillon, fermer les onglets qui distraient, poser juste le mail sous les yeux.
> - **Mot de bascule** : tu choisis **un seul mot** qui déclenche le passage à l’action. Exemple : **Go** ou **Départ**. Ce mot sert à lancer, pas à préparer.
>
> Donc ici : si le blocage vient surtout du démarrage, **Préparer le terrain** aide à réduire la friction. Si tu veux un déclencheur ultra simple au moment d’y aller, **Mot de bascule** est plus direct.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `coaching_only`
- direct_effects: []
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Ok. En fait je me rends compte que j'arrive à ouvrir le brouillon. Le problème c'est quand je vois une phrase froide, je panique et je ferme. Là c'est encore attaque ou autre chose ?

**Sophia**
> 

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- visible_task_before_error: no_plan_coaching
- coaching_type_before_error: no_plan_action
- last_visible_decision_before_error: `coaching_only`
- direct_effects: []
- executed_tools: []
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: `502` vide, aucune reponse assistant.
- Source amont probable: incident runtime local pendant `/functions/v1/test-send-message`.
- Owner runtime: edge function locale / runner QA.
- Meilleure correction selon les guidelines: documenter l'incident, verifier absence d'effet durable, retenter le meme tour sans fallback.
- Pourquoi ce n'est pas un patch local: aucune decision IA exploitable n'a ete produite.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Ok. En fait je me rends compte que j'arrive à ouvrir le brouillon. Le problème c'est quand je vois une phrase froide, je panique et je ferme. Là c'est encore attaque ou autre chose ?

**Sophia**
> 

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- visible_task_before_error: no_plan_coaching
- coaching_type_before_error: no_plan_action
- last_visible_decision_before_error: `coaching_only`
- direct_effects: []
- executed_tools: []
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: second `502` vide sur le meme point d'arret.
- Source amont probable: incident runtime local recurrent sur ce tour.
- Owner runtime: edge function locale / runner QA.
- Meilleure correction selon les guidelines: garder le meme run, tenter une reprise raisonnable sans fabriquer de reponse.
- Pourquoi ce n'est pas un patch local: aucune sortie de flow exploitable n'a ete produite.

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok. En fait je me rends compte que j'arrive à ouvrir le brouillon. Le problème c'est quand je vois une phrase froide, je panique et je ferme. Là c'est encore attaque ou autre chose ?

**Sophia**
> Oui, là c’est plutôt une **défense** qu’une attaque.
>
> - **Attaque** = tu prépares avant d’agir, pour rendre le démarrage plus facile.
> - **Défense** = tu gères le moment où ça déraille, ici quand la phrase froide te fait paniquer et fermer.
>
> Donc ton blocage n’est pas “ouvrir le brouillon”, mais “tenir quand tu vois la phrase froide”.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- visible_task_after_turn: null
- coaching_type_after_turn: null
- last_visible_decision_after_turn: null
- direct_effects: []
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: la reponse visible est bonne, mais l'etat actif coaching n'est plus conserve apres le tour (`visible_task=null`, `coaching_type=null`).
- Source amont probable: politique de sortie/max turns ou reset d'etat apres reprise d'un tour en erreur.
- Owner runtime: `coaching_recommendation` local state lifecycle.
- Meilleure correction selon les guidelines: quand un tour actif produit une reclassification defense, conserver l'etat local avec `no_plan_action` et `last_visible_decision=free_defense_card`.
- Pourquoi ce n'est pas un patch local: le texte visible est correct; le probleme est l'etat runtime qui se vide.

### Tour 7

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-03 - Product/status/tool mal priorises

**User**
> Ok, et si je veux préparer cette défense moi-même dans Sophia, je vais où ? Ne crée rien depuis le chat.

**Sophia**
> Va dans Dashboard > Ressources. C’est là que tu peux préparer une carte de défense. Limite : ce n’est pas l’endroit pour modifier le plan.

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: product_help_signal
- safety: none
- selected_skill_id: product_help
- direct_effects: []
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: destination produit correcte pour une carte libre, mais ownership perdu vers `product_help` alors que la question est un follow-up direct du coaching actif.
- Source amont probable: state local vide apres T6, donc `readActiveFlowState` ne peut plus proteger l'ownership coaching.
- Owner runtime: active flow state / global routing.
- Meilleure correction selon les guidelines: la guidance de destination d'une feature recommandee par coaching doit rester rendue par le visible agent coaching tant que le flow possede le tour.
- Pourquoi ce n'est pas un patch local: la reponse textuelle est presque correcte; le bug est l'ownership et la conservation de contexte.

### Tour 8

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Et concrètement pour mon mail à Camille, la défense devrait m'aider sur quel moment précis ?

**Sophia**
> Plutôt le moment où tu vois la phrase froide et que tu as envie de fermer, ou un autre moment précis dans ton mail ?

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- safety: none
- visible_task: change_confirm_coaching_type
- coaching_type: plan_action
- last_visible_decision: null
- direct_effects: []
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: Sophia recupere `coaching_recommendation`, mais avec `coaching_type=plan_action` et `change_confirm_coaching_type`, alors que le mail Camille etait une action hors plan. Elle redemande aussi le moment alors qu'il a deja ete donne: "phrase froide".
- Source amont probable: re-entree globale sans contexte local fiable apres perte d'etat; mauvaise classification plan/hors-plan.
- Owner runtime: global dispatcher -> local dispatcher handoff context.
- Meilleure correction selon les guidelines: conserver ou reconstruire `no_plan_action` depuis le contexte recent; ne pas basculer en plan_action sans action du plan; utiliser le moment deja fourni.
- Pourquoi ce n'est pas un patch local: il faut corriger le contrat d'entree/reprise de flow, pas la formulation de la question.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1 recommande correctement une carte d'attaque libre pour un blocage de demarrage.
- T2 et T3 respectent bien la demande "je veux comprendre": `coaching_only`, explications claires, pas de call-to-action produit.
- T6 reclassifie correctement le probleme vers defense au niveau du texte visible.

**Problemes**
- T4-T5: deux erreurs `502` cassent la fluidite.
- T6: malgre une bonne reponse visible, le flow perd son etat actif.
- T7: la guidance produit est correcte mais rendue par `product_help`, donc l'ownership coaching est perdu.
- T8: reprise incoherente en `plan_action/change_confirm_coaching_type` et question redemandee alors que le moment est deja fourni.

**Fix propose**
- Source amont: lifecycle local `coaching_recommendation` apres tours d'erreur/retry et politique de sortie; global dispatcher re-entry quand l'etat actif est absent.
- Correction recommandee: conserver l'etat local apres une reclassification defense et ne sortir vers global qu'avec une note d'exit propre; si re-entry globale, reconstruire `no_plan_action` depuis le contexte recent et ne jamais passer `plan_action` sans action du plan.
- Tests d'invariant attendus:
  - `coaching_only` -> user apporte "j'ouvre puis je ferme quand phrase froide" -> `last_visible_decision=free_defense_card`, state actif conserve.
  - follow-up "ou preparer cette defense" -> `response_owner=coaching_recommendation`, pas `product_help`.
  - reprise "moment precis ?" -> pas de `plan_action` sans plan item.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1-T3: routage correct vers `coaching_recommendation`.
- T4-T5: incidents runtime `502`.
- T6: routage correct mais state local vide apres le tour.
- T7: `product_help` prend le tour alors que c'est une guidance de feature issue du coaching.
- T8: re-entree coaching mais mauvais type (`plan_action`) et mauvais visible (`change_confirm_coaching_type`).

**Skills / Operations / Tools**
- Skill actif attendu: `coaching_recommendation`.
- Aucun tool execute.
- Aucun direct effect.
- Aucun effet durable cree.
- Nettoyage cible effectue sur la persona QA temporaire.

**Memory / Effets durables**
- Aucun scheduled checkin cree.
- Aucun tool ou mutation durable observe.

**Problemes**
- T4-T5: `BF-TEST-01`, deux `502`.
- T6: `BF-STATE-01`, state coaching perdu apres reponse correcte.
- T7: `BF-ROUTE-03`, product_help priorise a tort.
- T8: `BF-STATE-01`, mauvais coaching_type et redemande d'un slot deja donne.

**Fix propose**
- Source amont: active flow state + reducer de continuation/retry + global dispatcher re-entry.
- Correction recommandee: proteger l'ownership coaching sur les follow-ups produit et reconstruire la classification hors-plan depuis le contexte recent si l'etat actif a ete perdu.
- Tests d'invariant attendus:
  - retry apres 502 ne doit pas vider `coaching_recommendation_local_state`.
  - guidance Ressources apres recommendation defense libre reste dans coaching.
  - action hors plan ne devient pas `plan_action` sans `plan_item_id`.

## Verdict Global

**yellow** — les visibles coaching sont meilleurs sur les demandes d'explication (`coaching_only` fonctionne aux tours 2-3), et la bascule textuelle vers defense est bonne au tour 6. Mais le flow n'est pas stable: deux `502`, perte d'etat actif apres reprise, product_help qui reprend la guidance, puis re-entree en mauvais `coaching_type`.
