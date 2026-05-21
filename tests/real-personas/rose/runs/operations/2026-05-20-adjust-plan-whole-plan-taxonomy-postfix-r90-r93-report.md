## 1. Contexte Du Test

- Date: 2026-05-20
- Runs: `r90-whole-plan-success-criteria`, `r91-whole-plan-style-method`, `r93-whole-plan-split-merge`
- Persona: Rose, Supabase local, connexion locale, mot de passe local `1234567`
- Objectif: valider la nouvelle structuration whole-plan sur trois familles peu couvertes: changement des criteres de reussite, changement de methode/style, separation/fusion de phases.
- Trajectoire: demandes whole-plan vagues puis clarifiees, correction avant validation, validation explicite, verification DB, cleanup.
- Surfaces visees: `adjust_plan_item`, sous-skill `whole_plan_intake`, coach specialise, draft validation, confirmation, execution adjust plan depuis le chat, separation du plan en version archivee + version active.
- Cadre IA reel: `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe comme resultat QA, pas d'appel direct executor.
- Validite QA: valide. Tentatives partielles `r86`, `r89`, `r92` ont revele des bugs, ont ete nettoyees, puis les runs exploitables `r90`, `r91`, `r93` ont ete menes apres correction.

## 2. Tours De Conversation

### Run r90 - Criteres de reussite

#### Tour 1

**User**
> Je me rends compte que mesurer le plan avec juste moins de disputes ou faire les actions ne me parle plus trop. J aimerais que la reussite du plan soit plutot autour de la qualite du lien : est-ce qu on arrive a se sentir proches apres un echange, meme si tout n est pas regle. Je ne sais pas si c est un ajustement global ou juste une note.

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond.
>
> Ce qui changerait: je change les critères de réussite du plan, avec Une mesure de réussite centrée sur la compréhension mutuelle et le lien qui reste présent après un échange.
>
> Ce qui reste stable: l'objectif global, les actions actuelles et le signal de pause. On change surtout la façon de reconnaître le progrès.
>
> Ce que ça implique: si tu valides, je régénère le plan dans ce sens. Rien n'est appliqué tant que tu ne valides pas clairement. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- direct_effects: 0
- durable_effect: aucun

#### Tour 2

**User**
> Oui c est la bonne direction, mais je veux garder moins de disputes comme repere secondaire, pas comme critere principal. Et la formulation precise serait : apres une discussion tendue, chacun peut dire ce qu il a compris de l autre et je ne finis pas avec l impression d avoir perdu le lien. Ne l applique pas encore, montre-moi juste la version ajustee.

**Sophia**
> Je dois reprendre le brouillon proprement avant de te le montrer. Tu veux que je garde ta formulation exacte telle quelle, ou tu préfères une version plus courte de ce critère ? 🙂

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- direct_effects: 0
- pending: revision sans application
- warning: question utile mais encore un peu couteuse.

#### Tour 3

**User**
> Garde une version courte, mais avec ces idees : lien preserve apres tension, comprehension mutuelle, et moins de disputes seulement comme indicateur secondaire.

**Sophia**
> Je te propose de recentrer la boussole du plan pour qu’elle mesure d’abord si, après une tension, vous vous comprenez mieux et si le lien reste senti comme préservé, avec moins de disputes seulement comme repère secondaire. Rien n’est encore appliqué; c’est une proposition avant validation. Pour rendre ça concret sans toucher à la direction du plan, je suggère aussi de garder un signal simple pour faire pause quand le ton monte, et de conserver un point positif très simple comme soutien à l’échange. Le reste resterait inchangé: l’intention de sécurité dans le lien, le fait que tout ne soit pas réglé pour qu’un échange soit utile, et les autres actions déjà en place comme moyens, pas comme fin. 🙂

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- direct_effects: 0
- durable_effect: aucun

#### Tour 4

**User**
> Oui, cette version me va. Tu peux valider l ajustement du plan dans ce sens.

**Sophia**
> C’est en place: la réussite du plan est maintenant lue d’abord à travers la compréhension mutuelle après une tension et le sentiment que le lien reste préservé, tandis que moins de disputes reste un repère secondaire. Concrètement, j’ai aussi gardé un signal simple pour faire pause quand le ton monte, et un point positif très simple pour soutenir les échanges; ces deux appuis changent de place dans la lecture du plan, mais ils ne changent pas sa nature. Le plan garde sa sécurité relationnelle, et le fait que tout ne soit pas réglé reste compatible avec un échange utile. Je suis sur une confiance moyenne: la direction est claire, même si certains repères pratiques pourront encore être affinés ensuite. 🙂

**Trace courte**
- response_owner: `tool_skill`
- route_reason: `normal_reply_default`
- direct_effects: 1
- durable_effect: ancien plan archive, nouveau plan actif v2 cree, 4 nouveaux items crees.

### Run r91 - Methode / Style

#### Tour 1

**User**
> J ai une impression bizarre sur le plan global : la direction me va, mais la methode ne me ressemble pas. C est tres cadrage, discussion, analyse. Moi j aurais besoin que les prochaines etapes passent plus par de petites experiences legeres et des gestes concrets, sinon je vais me braquer.

**Sophia**
> Je peux partir là-dessus, mais il me manque une précision pour faire un vrai brouillon : sur quelles prochaines étapes du plan tu veux que je bascule en petites expériences concrètes, et sous quelle forme ? 🙂

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- missing_slots: `draft_generation_confirmation`
- direct_effects: 0

#### Tour 2

**User**
> Je veux surtout que le prochain niveau commence par tester dans le quotidien, pas par discuter longtemps. Par exemple une mini experience de 10 minutes sur un sujet simple, puis seulement apres on observe ce que ca a produit. Le but reste le meme, je veux juste changer la methode.

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond.
>
> Ce qui changerait: je change la méthode de progression du plan, avec Un principe de progression: petite expérience concrète, observation de ce que ça produit, puis discussion seulement si ça ouvre quelque chose.
>
> Ce qui reste stable: l'objectif global et la charge du plan. On change surtout la méthode d'entrée dans chaque étape.
>
> Ce que ça implique: si tu valides, je régénère le plan dans ce sens. Rien n'est appliqué tant que tu ne valides pas clairement. 🙂

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- direct_effects: 0

#### Tour 3

**User**
> Oui, mais je ne veux pas que ca baisse le niveau. Je veux que ca reste ambitieux, juste moins mental. Garde la discussion, mais apres l experience, pas avant.

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond.
>
> Ce qui changerait: je change la méthode de progression du plan, avec Un principe de progression: petite expérience concrète, observation de ce que ça produit, puis discussion seulement si ça ouvre quelque chose.
>
> Ce qui reste stable: l'objectif global et la charge du plan. On change surtout la méthode d'entrée dans chaque étape.
>
> Ce que ça implique: si tu valides, je régénère le plan dans ce sens. Rien n'est appliqué tant que tu ne valides pas clairement. 🙂

**Trace courte**
- direct_effects: 0
- warning: redit le brouillon presque identique au lieu d'integrer explicitement "ambitieux, pas moins exigeant".

#### Tour 4

**User**
> Ok, valide cette version : experience concrete d abord, observation ensuite, discussion seulement apres, sans baisser l ambition du plan.

**Sophia**
> C'est fait: j'ai ajusté la trajectoire du plan.
>
> Le plan garde le même objectif, mais la suite est régénérée pour le plan garde son objectif, mais chaque niveau part davantage du vécu concret avant de passer à l'analyse ou à la discussion.. 🙂

**Trace courte**
- direct_effects: 1
- durable_effect: ancien plan archive, nouveau plan actif v2 cree, 4 nouveaux items crees.
- warning: execution_message grammaticalement degradee.

### Run r93 - Separation / Fusion

#### Tour 1

**User**
> J ai relu la trajectoire du plan et je me demande si deux morceaux ne se marchent pas dessus : apprendre a exprimer mes besoins, puis ensuite aborder les sujets sensibles. J ai peur que ca fasse deux niveaux qui repetent la meme chose. Est-ce qu on devrait fusionner, ou separer autrement ?

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond.
>
> Ce qui changerait: je clarifie la séparation entre deux étapes du plan, avec Une marche plus nette entre les petits sujets du quotidien et les sujets sensibles comme l'argent, la famille ou l'intimité.
>
> Ce qui reste stable: l'objectif global et l'idée de progresser par étapes. On rend surtout la frontière entre deux étapes plus nette.
>
> Ce que ça implique: si tu valides, je régénère le plan dans ce sens. Rien n'est appliqué tant que tu ne valides pas clairement. 🙂

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- direct_effects: 0

#### Tour 2

**User**
> Ca me va, mais je veux eviter une etape pont en plus si ce n est pas necessaire. Je prefere garder deux niveaux distincts : besoins simples du quotidien, puis sujets sensibles. Si tu penses qu un pont est vraiment utile, explique-le avant de l ajouter.

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond.
>
> Ce qui changerait: je clarifie la séparation entre deux étapes du plan, avec Une marche plus nette entre les petits sujets du quotidien et les sujets sensibles comme l'argent, la famille ou l'intimité.
>
> Ce qui reste stable: l'objectif global et l'idée de progresser par étapes. On rend surtout la frontière entre deux étapes plus nette.
>
> Ce que ça implique: si tu valides, je régénère le plan dans ce sens. Rien n'est appliqué tant que tu ne valides pas clairement. 🙂

**Trace courte**
- direct_effects: 0
- behavior: le systeme ne bascule plus vers ajout de pont; correction validee.

#### Tour 3

**User**
> Ok, valide cette version, mais sans ajouter de niveau pont. Je veux juste que la separation soit plus lisible : besoins simples avant, sujets sensibles apres.

**Sophia**
> C'est fait: j'ai ajusté la trajectoire du plan.
>
> Le plan garde le même objectif, mais la suite est régénérée pour le plan garde deux étapes distinctes, mais les différencie par la difficulté du contenu: besoins simples d'abord, sujets sensibles ensuite.. 🙂

**Trace courte**
- direct_effects: 1
- durable_effect: ancien plan archive, nouveau plan actif v2 cree, 4 nouveaux items crees.
- warning: execution_message grammaticalement degradee.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le routage whole-plan est bon sur les trois familles: criteres de reussite, methode/style, separation/fusion.
- Sophia preserve l'objectif global et signale clairement que rien n'est applique avant validation.
- La partie coaching est meilleure: elle raisonne sur boussole du plan, methode de progression, frontiere entre phases, pas seulement sur deux actions locales.
- La correction "pas de pont" est respectee apres fix: r93 reste sur separation nette, pas ajout d'etape.

**Problemes**
- r90 Tour 2: Sophia demande encore une preference exacte/courte alors que le user a deja donne une formulation exploitable. Impact: friction legere, mais pas bloquant.
- r91 Tour 3: Sophia repete presque le meme brouillon au lieu d'integrer explicitement "ambitieux, juste moins mental". Impact: UX un peu mecanique.
- r91/r93 execution: phrase degradee "pour le plan garde..." avec double point. Impact: sortie finale peu professionnelle, severite yellow.
- Quelques formulations ont une majuscule maladroite apres "avec Une mesure..." ou "avec Un principe...". Impact: polish yellow.

**Fix propose**
- P1 polish writer/execution deterministic whole-plan: normaliser `familyCopy.after` et `familyCopy.inserted` pour ne pas produire "pour le plan garde..." ni "avec Une...".
- P2 reduire encore les clarifications quand le user donne deja une formulation concrete et une contrainte de validation.
- Note post-run: P1 a ete corrige apres redaction du constat et verifie par `deno check` + `deno test` adjust_plan_item. Les transcripts ci-dessus restent ceux du run reel avant ce polish.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tous les tours d'entree passent par `response_owner=tool_skill` et `selected_handler=adjust_plan_item`.
- Les confirmations finales declenchent bien un effet direct unique.
- Les corrections intermediaires ne produisent aucun effet durable avant validation.

**Skills / Operations / Tools**
- `whole_plan_intake` materialise les familles attendues:
  - r90: `success_criteria_change`
  - r91: `style_or_method_mismatch`
  - r93: `split_merge_restructure`
- Le coach specialise est appele et visible dans les traces summary/raw.
- Les guardrails corriges ont fonctionne:
  - readiness `diagnose` peut etre upgradee en `draft_ready` quand le user donne une solution concrete.
  - les familles whole-plan concretes n'exigent plus que le user nomme deux actions.
  - une mention negative de "pont" ne declenche plus `missing_bridge_or_level`.

**Memory / Effets durables**
- r90/r91/r93: avant validation, aucun side effect.
- Apres validation, la DB montre bien la separation attendue: ancien plan `version=1` archive, nouveau plan `version=2` actif, nouveaux items rattaches au nouveau plan.
- Cleanup cible confirme:
  - `remaining_scope_messages: 0`
  - `remaining_created_plan_ids: []`
  - `remaining_created_item_ids: []`
- Aucune suppression large ni reset DB.

**Problemes**
- Aucun probleme systeme bloquant restant sur les trois familles testees.
- Warning non bloquant: `conversation_turn_traces` REST ne retourne pas de lignes dans les durables, mais la trace utile est presente dans les responses brutes et summaries du runner.

**Fix propose**
- Garder le prochain fix centre sur le writer user-facing/execution, pas sur le routage: le systeme est maintenant aligne, le polish textuel est le principal residu.

## Verdict Global

- Verdict: yellow
- Raison principale: systeme green et DB correcte, mais UX encore yellow a cause de clarifications/repetitions et messages d'execution grammaticalement maladroits.
- Follow-up prioritaire: relancer un petit run de non-regression r91/r93 apres le polish post-run, puis reduire les clarifications restantes.
