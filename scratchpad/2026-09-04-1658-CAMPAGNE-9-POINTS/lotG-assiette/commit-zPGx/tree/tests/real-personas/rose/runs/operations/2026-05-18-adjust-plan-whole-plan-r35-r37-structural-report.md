# QA Run Report - Adjust Plan Whole Plan R35-R37

## 1. Contexte Du Test

- Date: 2026-05-18
- Runs:
  - `r35-third-part-structural`
  - `r36-next-step-structural`
  - `r37-incoherent-plan-structural`
- Persona: Rose, connexion locale dediee, Auth local verifie par login password.
- Objectif: tester trois demandes differentes de vrai `whole_plan` structurel apres la correction de routing `whole_plan` vs `current_level`.
- Trajectoires:
  - R35: "la troisieme partie du plan ne me va pas".
  - R36: "la prochaine etape du plan n'est pas la bonne".
  - R37: "le plan n'est plus coherent / revoir l'architecture globale".
- Surfaces visees: dispatcher, routing `adjust_plan_item`, scope `whole_plan`, brouillon avant application, confirmation explicite, side effects plan, cleanup.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucune reponse reconstruite, aucun fallback deterministe.
- Validite QA: valide. Les 3 runs ont 5 tours, aucune reponse vide, aucun abort, aucun timeout persistant.
- Cleanup: effectue apres chaque run. Les messages et `user_chat_states` du scope QA ont ete supprimes; aucun `user_plan` ou `user_plan_item` cree par les runs n'est reste en base.

## 2. Tours De Conversation

### Run R35 - Troisieme Partie Structurelle

#### Tour 1

**User**
> J'ai regardé la troisième partie du plan et elle ne me va pas. J'ai l'impression qu'on saute trop vite vers des discussions profondes alors que la sécurité entre nous n'est pas encore solide. Je ne veux pas juste alléger cette semaine, je crois que la trajectoire du plan est à revoir.

**Sophia**
> Je comprends parfaitement : tu souhaites revoir la trajectoire globale pour ne pas brûler les étapes et bien consolider votre sécurité avant d'aborder des sujets plus profonds. Rien n'est encore modifié, mais je peux préparer une proposition pour réorganiser la suite du plan, notamment la troisième partie. Est-ce que je lance ça ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: none, side effects allowed
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

#### Tour 2

**User**
> Oui, prépare seulement un brouillon. Ce que je veux préserver, c'est l'objectif couple et le travail sur le signal de pause. Ce que je veux revoir, c'est l'ordre des étapes futures: je veux plus de stabilisation avant les discussions de fond.

**Sophia**
> C'est entendu, je vais préparer ce brouillon en protégeant vos priorités actuelles. Pour que je puisse bien réorganiser la suite, peux-tu me préciser quelles sont les étapes ou les thèmes que tu considères comme des 'discussions de fond' à repousser ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

#### Tour 3

**User**
> Je parle des thèmes argent, famille et reproches anciens. Je préfère que la troisième partie ajoute d'abord une étape de sécurité: vérifier que le signal de pause est respecté et que les points positifs reviennent, avant de toucher à ces sujets lourds.

**Sophia**
> Je te propose d'ajuster la trajectoire globale de votre plan pour y intégrer l'étape de sécurité que tu as demandée avant d'aborder les sujets sensibles. Rien n'est encore appliqué, c'est une proposition pour m'assurer que cela te convient. Je prévois de transformer l'action « Faire le point sur le signal de pause » en un verrou de sécurité indispensable : vous devrez valider que le signal fonctionne avant d'ouvrir les thèmes de l'argent ou de la famille. De même, l'habitude « Partager un point positif » servira d'indicateur de stabilité pour garantir que le climat est apaisé avant de toucher aux reproches anciens. Les thèmes lourds ne sont pas supprimés, mais simplement décalés après ces vérifications. Est-ce que cette nouvelle organisation te semble plus rassurante ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

#### Tour 4

**User**
> Avant de valider, détaille-moi ce qui change vraiment dans la trajectoire et ce qui ne change pas. Je veux être sûre que tu ne supprimes pas les sujets lourds, tu les repousses juste après un vrai sas de sécurité.

**Sophia**
> Je n'ai encore rien appliqué. Le brouillon actuel prévoit:
>
> 1. Faire le point sur le signal de pause: avant, Action de bilan prévue de manière isolée dans la suite du plan.; maintenant, Positionnée comme étape de sécurité obligatoire avant d'aborder les thèmes de l'argent et de la famille.. Pourquoi: S'assurer que l'outil de régulation est maîtrisé avant d'entamer les discussions à haut risque de conflit.
> 2. Partager un point positif: avant, Habitude de maintien du lien positif (3 fois par semaine).; maintenant, Maintenue comme indicateur de stabilité émotionnelle requis avant de traiter les reproches anciens.. Pourquoi: Garantir que le climat de confiance est restauré avant de revenir sur le passé.
>
> Si ça te va, dis-moi clairement de l'appliquer. Sinon, dis-moi ce que tu veux modifier dans ce brouillon. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

#### Tour 5

**User**
> Oui, c'est bien ça. Je valide explicitement ce brouillon: applique l'ajustement de trajectoire globale, avec les sujets lourds repoussés après le sas de sécurité.

**Sophia**
> Je ne peux pas appliquer cet ajustement depuis le chat tant qu'il n'est pas rattaché proprement aux bonnes actions du plan. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun changement durable de plan

### Run R36 - Prochaine Etape Structurelle

#### Tour 1

**User**
> Je pense que la prochaine étape du plan n'est pas la bonne. Après le signal de pause, je ne veux pas aller tout de suite vers des discussions difficiles; il faudrait peut-être une étape intermédiaire pour reconstruire de la confiance. Je veux revoir la trajectoire, pas seulement le niveau actuel.

**Sophia**
> C'est très clair. Je vais retravailler la trajectoire globale pour insérer une phase de reconstruction de la confiance entre le signal de pause et les discussions plus sensibles. Rien n'est encore modifié, mais est-ce que je peux préparer une proposition concrète pour ce nouveau séquençage ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

#### Tour 2

**User**
> Oui, prépare un brouillon sans appliquer. Je veux que la prochaine étape soit centrée sur des preuves de confiance simples: respecter le signal, garder deux ou trois interactions positives, puis seulement après ouvrir un sujet sensible.

**Sophia**
> Je te propose un brouillon pour rééquilibrer ta trajectoire globale. L'idée est de réduire la pression immédiate pour te permettre de reconstruire de la confiance avant d'aborder des sujets plus complexes. Pour l'instant, rien n'est encore appliqué ou enregistré. Je suggère notamment de simplifier l'action "Convenir d'un signal de pause" pour qu'elle ne te prenne que 5 minutes et de mettre en pause le bilan prévu sur ce signal afin de ne pas surcharger tes prochaines étapes. Tes interactions positives, comme le partage de points positifs, restent inchangées pour stabiliser votre relation. Est-ce que cette approche te convient ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

#### Tour 3

**User**
> Pas exactement: je ne demande pas de rendre le signal en 5 minutes ni de mettre le bilan en pause. Je parle de la prochaine étape après ce bloc: ajouter une étape de confiance simple avant les sujets sensibles. Reformule le brouillon dans ce sens, sans appliquer.

**Sophia**
> Je vais reprendre le brouillon pour intégrer cette phase de confiance sans toucher à tes missions actuelles. Pour que je puisse caler la suite de la trajectoire, quel serait le premier 'sujet sensible' concret que tu voudrais traiter une fois cette étape de confiance validée ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

#### Tour 4

**User**
> Le premier sujet sensible serait l'argent, mais seulement après avoir vérifié pendant une semaine que le signal de pause est respecté et qu'on arrive à se dire des choses positives sans tension. C'est cette étape intermédiaire que je veux insérer dans le plan.

**Sophia**
> Je te propose de rééquilibrer ta trajectoire globale pour alléger la pression immédiate. L'idée est d'insérer une étape intermédiaire de reconstruction de la confiance avant d'aborder les sujets sensibles comme l'argent. Pour cela, je prévois de sanctuariser l'action « Convenir d'un signal de pause » et l'habitude « Partager un point positif » comme des prérequis indispensables. Rien n'est encore appliqué pour le moment, j'attends ta validation. Concrètement, je vais repositionner le signal de pause comme ta priorité absolue et m'assurer que le partage de points positifs serve de test de climat pendant une semaine avant d'aller plus loin. Le reste de tes objectifs et l'identité de ton plan ne seront pas touchés. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

#### Tour 5

**User**
> Oui, je valide ce brouillon. Applique l'ajustement de trajectoire globale: insérer cette étape intermédiaire de confiance avant le sujet argent.

**Sophia**
> Je ne peux pas appliquer cet ajustement depuis le chat tant qu'il n'est pas rattaché proprement aux bonnes actions du plan. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun changement durable de plan

### Run R37 - Architecture Globale Incoherente

#### Tour 1

**User**
> Je trouve que le plan n'est plus très cohérent. On dirait qu'il mélange apaiser les disputes, créer du positif et analyser les déclencheurs, mais je ne vois plus la logique de progression. J'aimerais revoir l'architecture globale du plan, pas juste modifier une action.

**Sophia**
> Je comprends, le mélange entre la gestion des disputes, le positif et l'analyse peut donner une impression de flou. Pour redonner une logique de progression à ton plan, comment souhaites-tu que j'organise ces priorités : préfères-tu qu'on se concentre sur un seul de ces piliers pour commencer, ou qu'on les enchaîne différemment ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

#### Tour 2

**User**
> Je pense qu'il faut les enchaîner autrement: d'abord sécurité en cas de tension, ensuite reconstruire un minimum de positif, ensuite seulement analyser les déclencheurs. Là j'ai l'impression que tout est posé au même niveau.

**Sophia**
> C'est très clair. Je vais réorganiser ton plan pour qu'il suive cette progression : d'abord la sécurité avec le signal de pause, puis le renforcement du positif, et enfin l'analyse des déclencheurs. Rien n'est encore appliqué, est-ce que je peux te préparer une proposition concrète avec ce nouvel enchaînement ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

#### Tour 3

**User**
> Oui, prépare une proposition sans l'appliquer. Je veux relire avant. Garde l'objectif couple, mais rends la progression plus lisible: sécurité, positif, analyse.

**Sophia**
> Je te propose de réorganiser l'architecture de ton plan pour qu'elle soit plus lisible et tenable. Pour l'instant, rien n'a été modifié. Ma proposition suit la logique que tu as demandée : d'abord sécuriser vos échanges, puis reconstruire du positif, et enfin analyser ce qui se passe.
>
> Concrètement, je prévois de :
> 1. Placer l'action 'Convenir d'un signal de pause' en priorité absolue pour assurer votre sécurité émotionnelle immédiate.
> 2. Positionner l'habitude 'Partager un point positif' juste après, pour nourrir votre lien avant d'entamer toute réflexion de fond.
>
> L'objectif de votre couple et la nature de vos actions restent inchangés, c'est uniquement l'ordre de progression qui est clarifié. Est-ce que cela te convient ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

#### Tour 4

**User**
> Il manque la troisième étape dans ton brouillon: l'analyse des déclencheurs doit venir après sécurité et positif, pas disparaître. Peux-tu me redonner le brouillon complet avec les trois étapes, toujours sans appliquer ?

**Sophia**
> Je te propose une nouvelle organisation pour l'architecture globale de ton plan afin de retrouver une progression logique et lisible. Comme tu l'as demandé, rien n'est encore appliqué : c'est une proposition pour que nous puissions valider ensemble la structure avant toute écriture.
>
> Je suggère de réordonner les étapes pour suivre ta logique en trois temps :
> 1. D'abord la sécurité, avec l'action 'Convenir d'un signal de pause' pour stabiliser vos échanges.
> 2. Ensuite le positif, en maintenant l'habitude 'Partager un point positif' pour nourrir votre lien.
> 3. Enfin l'analyse, en plaçant 'Cartographier les déclencheurs' après ces deux premières phases de sécurisation.
>
> Ce changement permet de clarifier la trajectoire sans modifier le contenu de vos actions ni vos horaires. Qu'en penses-tu ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

#### Tour 5

**User**
> Oui, je valide cette structure en trois temps. Applique l'ajustement global du plan: sécurité, positif, puis analyse des déclencheurs.

**Sophia**
> Je ne peux pas appliquer cet ajustement depuis le chat tant qu'il n'est pas rattaché proprement aux bonnes actions du plan. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun changement durable de plan

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les trois scenarios sont compris comme des demandes structurelles, pas comme des baisses temporaires de niveau.
- Sophia pose des questions utiles quand la demande est large ou quand elle doit identifier les sujets sensibles.
- Sophia preserve bien le principe "brouillon avant application" pendant la phase de discussion.
- R35 est humainement le plus solide: elle comprend que les sujets lourds doivent etre repousses, pas supprimes.

**Problemes**
- R35 Tour 2: "vos priorités actuelles" utilise `vos` pour s'adresser directement a Rose. Impact: petit ecart avec la regle de tutoiement direct. Severite: yellow leger.
- R36 Tour 2: Sophia introduit des modifications non demandees sur le signal de pause: reduction a 5 minutes et mise en pause du bilan. Impact: le user doit corriger Sophia alors que sa demande portait sur la prochaine etape, pas sur le bloc actuel. Severite: yellow fort.
- R37 Tour 3: Sophia annonce trois etapes mais ne liste que les deux premieres; l'analyse des declencheurs disparait du brouillon initial. Impact: perte de confiance sur la coherence du brouillon. Severite: yellow.
- Tours finaux R35/R36/R37: apres validation explicite, Sophia dit qu'elle ne peut pas appliquer. Impact: experience frustrante, le flow conversationnel echoue au moment attendu de concretisation. Severite: red cote experience produit.

**Fix propose**
- Renforcer le writer `whole_plan` pour qu'il ne propose pas de modifier les actions courantes quand le user parle de phase future ou de prochaine etape.
- Obliger le writer a enumerer toutes les composantes explicitement citees par le user dans un brouillon structurel.
- Remplacer le message de blocage final par un vrai chemin d'application pour `whole_plan`, ou au minimum une explication produit claire avec alternative actionnable. Le vrai fix doit etre systeme, pas seulement redactionnel.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Les 3 scenarios routent vers `response_owner=tool_skill` et `selected_handler=adjust_plan_item`.
- Le comportement confirme que les demandes structurelles restent dans le scope `whole_plan` attendu:
  - "troisieme partie du plan" reste structurel.
  - "prochaine etape du plan" reste structurel.
  - "architecture globale / plan incoherent" reste structurel.
- La correction recente de routing apporte donc de la valeur: les demandes de trajectoire globale ne sont pas retrogradees en `current_level`.

**Skills / Operations / Tools**
- Aucun tool d'ecriture n'est execute pendant les brouillons, ce qui est correct.
- Apres validation explicite, aucun tool d'application n'est execute non plus. C'est le probleme majeur.
- `operation_flow_run` reste null dans les traces. Le flow reste dans `adjust_plan_item` conversationnel, mais ne materialise pas le patch structural.
- Les confirmations utilisateur sont bien formulees et explicites aux tours 5, mais elles ne debouchent sur aucun effet durable.

**Memory / Effets durables**
- Durable apres chaque run: 1 plan actif, 4 items, pas de separation de plan observee.
- Aucun `user_plan` ou `user_plan_item` nouveau n'est cree.
- Cleanup:
  - R35: 10 messages QA supprimes, 1 `user_chat_state` supprime, 0 plan/item cree a supprimer.
  - R36: 10 messages QA supprimes, 1 `user_chat_state` supprime, 0 plan/item cree a supprimer.
  - R37: 10 messages QA supprimes, 1 `user_chat_state` supprime, 0 plan/item cree a supprimer.
- Etat initial de Rose restaure / conserve: aucun changement durable du run ne reste.

**Problemes**
- R35/R36/R37 Tour 5: validation explicite non appliquee. Impact systeme: le flow `whole_plan` est incapable de concretiser une demande structurelle valide depuis le chat. Severite: red.
- Cause probable: le chemin d'application `adjust_plan_item` reste trop centre sur des `changed_items` rattaches a des actions existantes. Un vrai `whole_plan` structurel vise la trajectoire, l'ordre des phases, les prerequis ou les etapes futures; il ne se rattache pas toujours proprement a un item existant.
- R36 Tour 2: le writer compense l'absence de modele structural en proposant des edits d'items actuels. Impact systeme: derive vers un patch item-level non demande. Severite: yellow/red selon application.
- R37 Tour 3: le brouillon n'est pas complet malgre une structure utilisateur simple. Impact systeme: le payload/brouillon ne garde pas assez fortement toutes les contraintes utilisateur. Severite: yellow.

**Fix propose**
- 20/80 recommande: separer explicitement l'execution `whole_plan` de l'execution item/level.
- Pour `whole_plan`, accepter un payload de type `plan_structure_patch` ou `trajectory_change_summary` sans exiger que chaque changement soit rattache a un `user_plan_item` courant.
- Au moment de la validation, appeler le chemin de transformation plan-level deja utilise par l'ajustement front, afin de creer la separation du plan en deux versions.
- Garder le contrat item-centric uniquement pour `single_action`, `multi_action` et certains ajustements `current_level`.
- Ajouter une garde dans le writer: si le user parle de prochaine etape, troisieme partie, architecture, coherence ou trajectoire, le brouillon doit parler de sequencing/prerequis/future phases, pas de simplification arbitraire des actions actuelles.

## Verdict Global

**Red.**

Le routing vers `whole_plan` est maintenant beaucoup meilleur: les trois demandes structurelles sont bien prises comme des ajustements de trajectoire globale. En revanche, le flow echoue dans 3/3 runs au moment le plus important: apres validation explicite du user, Sophia ne sait pas appliquer l'ajustement parce que le patch n'est pas rattache a des actions concretes. Le prochain fix a fort impact n'est donc plus le routing; c'est le contrat d'execution `whole_plan`, qui doit pouvoir creer une nouvelle version du plan a partir d'une intention structurelle, comme le flow front d'ajustement complet.

