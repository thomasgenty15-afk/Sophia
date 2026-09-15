## 1. Contexte Du Test

- Date: 2026-05-21
- Runs: r97-whole-plan-style-method-postfix, r98-whole-plan-split-merge-postfix, r99-whole-plan-split-merge-postfix2
- Persona: Rose, connexion locale dediee, Supabase local
- Objectif: verifier les ameliorations du flow `adjust_plan_item` sur `whole_plan`, surtout revision de brouillon sans application, classification des familles whole-plan, validation finale, et separation de plan en nouvelle version.
- Trajectoire: demandes whole-plan concretes mais realistes: changement de methode, separation besoins simples / sujets sensibles, critere de passage.
- Surfaces visees: dispatcher, routing tool skill, `adjust_plan_item`, coach specialise whole-plan, generation de brouillon, confirmation, direct effects, DB `user_plans_v2` / `user_plan_items`.
- Cadre IA reel: chemin `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe utilise comme resultat QA, pas de fallback direct.
- Validite QA: valide. Les runs ont ete joues tour par tour, en lisant les reponses Sophia et les traces courtes. Les artefacts DB crees par r99 ont ete supprimes et Rose a ete restauree.

## 2. Tours De Conversation

### Run r97 - style / methode

### Tour 1

**User**
> Je trouve que la suite du plan part trop vite dans des discussions et de l'analyse. Je pense que pour nous ce serait plus utile que les prochains niveaux commencent par une petite experience concrete, puis qu'on observe ce que ca produit avant d'en discuter. Tu peux ajuster la trajectoire dans ce style ?

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond. Ce qui changerait: je change la méthode de progression du plan, avec un principe de progression: petite expérience concrète, observation de ce que ça produit, puis discussion seulement si ça ouvre quelque chose. Ce qui reste stable: l'objectif global, l'ambition et la charge du plan. On change surtout la méthode d'entrée dans chaque étape. Ce que ça implique: si tu valides, je régénère le plan dans ce sens. Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- route_reason: tool_skill_intent_start
- direct_effects: 0
- durable_effect: aucun

### Tour 2

**User**
> Oui, mais je ne veux pas que ca baisse le niveau. Je veux que ca reste ambitieux, juste moins mental. Garde la discussion apres l'experience, pas avant, et ne l'applique pas encore.

**Sophia**
> Je te propose un réajustement de trajectoire, sans rien appliquer pour l’instant : le plan garderait son ambition et sa direction, mais il démarrerait par l’expérience concrète avant la discussion. Concrètement, je propose de rendre plus net le "faire d’abord, discuter ensuite" autour du signal de pause et de garder l’étape de retour à froid comme deuxième temps. Cela aide à alléger la charge mentale sans baisser le niveau, et ça ne toucherait ni l’objectif global ni l’exigence du plan. Si tu veux, je peux préparer cette version pour validation.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: null
- route_reason: normal_reply_default
- direct_effects: 0
- durable_effect: aucun

### Tour 3

**User**
> Oui prepare cette version pour validation, mais ne l'applique toujours pas. Je veux juste voir le brouillon final avant de dire oui.

**Sophia**
> Je ne peux pas appliquer cet ajustement depuis le chat tant qu'il n'est pas rattaché proprement aux bonnes actions du plan.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: null
- route_reason: normal_reply_default
- direct_effects: 0
- durable_effect: aucun
- Verdict local: red. Le fond coaching etait bon au tour 2, mais la reprise du brouillon a perdu le flow.

### Run r98 - split / merge avant correctif final

### Tour 1

**User**
> J'ai lu les niveaux plus loin dans le plan et j'ai l'impression que la partie besoins simples et la partie sujets sensibles se chevauchent trop. Je veux une vraie marche entre les deux, pas deux phases floues. Tu peux ajuster la structure globale ?

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond. Ce qui changerait: je clarifie la séparation entre deux étapes du plan, avec une marche plus nette entre les petits sujets du quotidien et les sujets sensibles comme l'argent, la famille ou l'intimité. Ce qui reste stable: l'objectif global et l'idée de progresser par étapes. On rend surtout la frontière entre deux étapes plus nette. Ce que ça implique: si tu valides, je régénère le plan dans ce sens. Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- route_reason: tool_skill_intent_start
- direct_effects: 0
- durable_effect: aucun

### Tour 2

**User**
> Ca me va, mais je veux eviter une etape pont en plus si ce n'est pas necessaire. Je prefere garder deux niveaux distincts : besoins simples, puis sujets sensibles. Ne l'applique pas encore.

**Sophia**
> Je dois reprendre le brouillon proprement. Pour garder deux niveaux sans étape-pont, tu veux que la séparation soit marquée par quoi : un critère de passage, une règle de fin du niveau « besoins simples », ou une consigne d’entrée dans les sujets sensibles ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: null
- route_reason: normal_reply_default
- direct_effects: 0
- durable_effect: aucun

### Tour 3

**User**
> Marque la separation par un critere de passage : on passe aux sujets sensibles seulement quand on arrive a faire une demande simple sans tension forte deux fois de suite. Ne l'applique pas encore, montre-moi le brouillon.

**Sophia**
> Je dois reprendre le brouillon proprement avant de te le montrer. Pour la règle de passage, tu veux que les 2 demandes simples sans tension forte soient comptées sur 2 fois d’affilée, ou sur 2 réussites dans une même période ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- route_reason: tool_skill_intent_start
- direct_effects: 0
- durable_effect: aucun

### Tour 4

**User**
> Deux fois d'affilee. C'est exactement ce que je voulais dire. Maintenant prepare le brouillon de modification sans l'appliquer.

**Sophia**
> Je dois reprendre le brouillon proprement avant de te le montrer. Pour le critère de passage, tu veux compter les 2 demandes simples sans tension forte sur 2 fois d’affilée, ou sur 2 réussites dans une même période ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- route_reason: tool_skill_intent_start
- direct_effects: 0
- durable_effect: aucun
- Verdict local: red. Le systeme sur-clarifiait un slot deja donne.

### Run r99 - split / merge apres correctif final

### Tour 1

**User**
> J'ai lu les niveaux plus loin dans le plan et j'ai l'impression que la partie besoins simples et la partie sujets sensibles se chevauchent trop. Je veux une vraie marche entre les deux, pas deux phases floues. Tu peux ajuster la structure globale ?

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond. Ce qui changerait: je clarifie la séparation entre deux étapes du plan, avec une marche plus nette entre les petits sujets du quotidien et les sujets sensibles comme l'argent, la famille ou l'intimité. Ce qui reste stable: l'objectif global et l'idée de progresser par étapes. On rend surtout la frontière entre deux étapes plus nette. Ce que ça implique: si tu valides, je régénère le plan dans ce sens. Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- route_reason: tool_skill_intent_start
- direct_effects: 0
- durable_effect: aucun

### Tour 2

**User**
> Ca me va, mais je veux eviter une etape pont en plus si ce n'est pas necessaire. Je prefere garder deux niveaux distincts : besoins simples, puis sujets sensibles. Ne l'applique pas encore.

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond. Ce qui changerait: je clarifie la séparation entre deux étapes du plan, avec une marche plus nette entre les petits sujets du quotidien et les sujets sensibles comme l'argent, la famille ou l'intimité. Ce qui reste stable: l'objectif global et l'idée de progresser par étapes. On rend surtout la frontière entre deux étapes plus nette. Ce que ça implique: si tu valides, je régénère le plan dans ce sens. Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- route_reason: tool_skill_intent_start
- direct_effects: 0
- durable_effect: aucun

### Tour 3

**User**
> Marque la separation par un critere de passage : on passe aux sujets sensibles seulement quand on arrive a faire une demande simple sans tension forte deux fois d'affilee. Ne l'applique pas encore, montre-moi le brouillon.

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond. Ce qui changerait: je clarifie la séparation entre deux étapes du plan, avec une marche plus nette entre les petits sujets du quotidien et les sujets sensibles: on passe aux sujets sensibles seulement après deux demandes simples d'affilée sans tension forte. Ce qui reste stable: l'objectif global et l'idée de progresser par étapes. On rend surtout la frontière entre deux étapes plus nette. Ce que ça implique: si tu valides, je régénère le plan dans ce sens. Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- route_reason: tool_skill_intent_start
- direct_effects: 0
- durable_effect: aucun

### Tour 4

**User**
> Oui, valide cet ajustement et applique-le au plan.

**Sophia**
> C'est fait: j'ai ajusté la trajectoire du plan. Le plan garde deux étapes distinctes, et leur frontière devient observable: deux demandes simples d'affilée sans tension forte avant d'ouvrir les sujets sensibles.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: null
- route_reason: normal_reply_default
- direct_effects: 1
- durable_effect: v1 archivee, v2 active creee, 4 nouveaux items rattaches a v2.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- r99 donne une proposition lisible, en tutoyant, sans IDs techniques, et sans appliquer avant validation.
- Le brouillon whole-plan preserve l'objectif global et explique ce qui change / ce qui reste stable.
- Le critere de passage donne par le user est repris exactement au tour 3 de r99.
- La validation finale est claire et courte.

**Problemes**
- r97 tour 2: Sophia donne une bonne reponse coaching mais sort du handler explicite, puis r97 tour 3 produit une limite fausse. Impact: le user peut avoir l'impression que Sophia sait raisonner mais ne sait plus materialiser. Severite: red pour cette variante.
- r98 tours 3-4: clarification repetitive sur un detail deja donne. Impact: friction forte, impression de boucle. Severite: red avant correctif.
- r99 tour 2: Sophia re-propose le meme brouillon general au lieu d'integrer explicitement "pas d'etape pont". Impact faible a moyen, car le brouillon reste compatible avec la demande mais moins satisfaisant qu'une vraie reformulation. Severite: yellow.

**Fix propose**
- Deja applique: ne plus classer "ne l'applique pas encore" comme annulation whole-plan, et traiter "critere de passage / deux fois d'affilee" comme `split_merge_restructure`, pas `success_criteria_change`.
- Prochain petit fix utile: enrichir la copie split/merge quand le user refuse une etape pont, pour dire explicitement "sans ajouter de niveau pont".

## 4. Analyse Systeme

**Verdict: green avec warning UX**

**Routage**
- r99 tours 1-3: `response_owner=tool_skill`, `selected_handler=adjust_plan_item`, bon routing whole-plan.
- r99 tour 4: `selected_handler=null` dans la trace courte, mais `response_owner=tool_skill` et `direct_effects=1`; l'execution a bien ete declenchee par la validation.
- r97/r98 montrent les deux regressions corrigees: reprise conversationnelle fragile et mauvaise interpretation du critere de passage.

**Skills / Operations / Tools**
- Le coach specialise whole-plan a produit des guidances pertinentes: preserver deux niveaux distincts, eviter une phase-pont automatique, ne pas appliquer sans validation.
- Le draft deterministic whole-plan sert de filet de securite quand le writer AI est fragile, sans exposer d'IDs.
- Tests unitaires apres correctif: `deno check` OK; `deno test --allow-env --allow-net supabase/functions/sophia-brain/tools/operations/adjust_plan_item/tests.ts` OK, 38 passed.

**Memory / Effets durables**
- Avant validation r99: aucun effet durable.
- Apres validation r99: DB conforme au comportement attendu du front adjust-plan:
  - plan v1 `fe37bd40-6721-4de5-bfb0-b8998d8b7b3e` archive;
  - plan v2 `d03008f4-0d3a-4619-952b-60cc37c94519` actif;
  - 4 nouveaux items rattaches a v2;
  - message d'execution coherent avec le brouillon.
- Cleanup r99: 4 `user_plan_items` supprimes, 1 plan supprime, messages scope supprimes, 4 snapshots supprimes, Rose restauree sur v1 active avec les 4 items initiaux.

**Problemes**
- r99 tour 2: le systeme n'a pas assez materialise la contrainte "pas d'etape pont" dans le texte user-facing. Impact systeme faible, car l'effet final ne cree pas de pont; impact UX yellow.
- Les traces courtes affichent encore `has_pending_confirmation=false` pour des brouillons en attente, probablement parce que l'etat est porte par le draft review interne plutot que `pending_tool_skill_confirmation`. Impact QA: lisibilite trace imparfaite, pas un bug fonctionnel observe.

**Fix propose**
- Ajouter une contrainte/copie user-facing explicite `split_merge_no_bridge_step` quand le user refuse l'etape pont.
- Harmoniser la trace courte pour exposer les pending drafts whole-plan comme pending confirmation QA-visible.

## Verdict Global

**yellow-green**

Le flow whole-plan est nettement meilleur apres le correctif: r99 route correctement, evite la boucle, produit un brouillon coherent, valide sans 502, et cree bien une nouvelle version de plan en archivant l'ancienne. Il reste une friction UX sur la reformulation "sans etape pont", mais le comportement systeme end-to-end du scenario critique est maintenant valide.
