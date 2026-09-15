# Adjust Plan Postfix Rerun 2 - r63-r65

## 1. Contexte Du Test

- Date: 2026-05-20
- Runs: `r63-whole-plan-direction`, `r64-whole-plan-next-step`, `r65-level-add-week`
- Persona: Rose
- Objectif: relancer les runs apres les fixes de rendu `trajectory_change`, maintien du routing `adjust_plan_item` pendant intake active, et reduction des clarifications quand le user donne une solution concrete.
- Trajectoire: whole-plan direction globale, whole-plan prochaine etape, niveau prolonge d'une semaine.
- Surfaces visees: `test-send-message`, dispatcher IA reel, `adjust_plan_item`, whole-plan writer, level intake, confirmation, execution, regeneration/separation de plan, cleanup DB.
- Cadre IA reel: Supabase local, serveur Deno local `test-send-message`, `force_full_ai=true`, `enable_adjust_plan_coach_guidance=true`, pas de renderer deterministe comme resultat QA, pas de fallback `processMessage` direct.
- Validite QA: valide. Les messages user ont ete choisis tour par tour apres lecture des reponses et traces courtes.
- Cleanup: OK pour les 3 runs. Apres cleanup: 1 plan, 4 items, 0 message du scope, 0 `user_chat_state` du scope.

## 2. Tours De Conversation

### Run r63 - Whole Plan Direction

**Objectif**
Verifier que Sophia traite une demande de trajectoire globale comme whole-plan, puis que la demande de detail ne retombe pas en "deux actions".

#### Tour 1

**User**
> Je trouve que le plan passe trop vite du signal de pause aux conversations sensibles. Je veux garder l objectif, mais ajouter une vraie etape de reparation simple apres conflit avant de reprendre les discussions plus profondes.

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond.
>
> Ce qui changerait: j'insere une etape intermediaire avant les conversations plus sensibles, centree sur le signal de pause et une reparation simple apres conflit.
>
> Ce qui reste stable: l'objectif global du plan, le role du signal de pause, et les actions de soutien qui restent utiles.
>
> Ce que ca implique: si tu valides, je regenere le plan pour reordonner la suite autour de cette etape de consolidation. Rien n'est applique tant que tu ne valides pas.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- tool_execution: `blocked`
- executed_tools: []

#### Tour 2

**User**
> Avant de valider, je veux etre sure: tu vas vraiment changer la trajectoire du plan, pas juste reformuler deux actions isolees ?

**Sophia**
> Je n'ai encore rien applique. Le brouillon porte sur la trajectoire du plan, pas seulement sur deux actions.
>
> Avant: Le plan avance du desamorcage vers des conversations plus sensibles.
>
> Apres: Le plan garde ce cap, mais ajoute d'abord une etape de consolidation pour securiser le retour au calme et la reparation simple.
>
> Etape ajoutee: Une etape intermediaire de securite emotionnelle et de reparation simple apres conflit.
>
> Ce qui reste stable: L'objectif global du plan et l'apprentissage du desamorcage restent la base.
>
> Pourquoi ca aide: La reparation apres conflit devient plus realiste si le couple a d'abord un protocole de pause et de reprise calme.
>
> Reperes du plan utilises pour ancrer ce changement: Convenir d'un signal de pause, Faire le point sur le signal de pause.
>
> Si ca te va, dis-moi clairement de l'appliquer. Sinon, dis-moi ce que tu veux modifier dans ce brouillon.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- tool_execution: `none`
- executed_tools: []
- correction observee: le detail rend bien la trajectoire en premier; les actions sont seulement des reperes.

#### Tour 3

**User**
> Oui, applique cette version globale: meme objectif, mais etape intermediaire de reparation simple avant les conversations sensibles.

**Sophia**
> C'est fait: j'ai ajuste la trajectoire du plan.
>
> Le plan garde le meme objectif, mais la suite est regeneree pour ralentir la transition et consolider le signal de pause avec une reparation simple avant les conversations plus sensibles.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- tool_execution: `success`
- executed_tools: [`adjust_plan_item`]
- durable avant cleanup: 2 plans / 8 items
- cleanup: OK, nouveau plan et nouveaux items supprimes, plan/items initiaux restaures.

**Verdict run: green**

### Run r64 - Whole Plan Next Step

**Objectif**
Retester l'ancien cas `r61`: prochaine etape structurelle + proposition concrete, avec risque de sortie vers `product_help`.

#### Tour 1

**User**
> En regardant la suite du plan, je pense que la prochaine etape arrive trop tot. Avant les conversations sensibles, je veux une etape intermediaire sur la securite emotionnelle et le retour au calme.

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond.
>
> Ce qui changerait: j'insere une etape intermediaire avant les conversations plus sensibles, centree sur le signal de pause et une reparation simple apres conflit.
>
> Ce qui reste stable: l'objectif global du plan, le role du signal de pause, et les actions de soutien qui restent utiles.
>
> Ce que ca implique: si tu valides, je regenere le plan pour reordonner la suite autour de cette etape de consolidation. Rien n'est applique tant que tu ne valides pas.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- tool_execution: `blocked`
- executed_tools: []

#### Tour 2

**User**
> Oui, et concretement je veux que cette etape soit une mission ponctuelle pour definir un protocole de retour au calme, puis une petite habitude de reparation simple avant de reprendre les conversations sensibles.

**Sophia**
> J'ai reorganise le plan dans le sens que tu voulais: la securite passe d'abord, puis la reprise devient plus douce. Concretement, "Convenir d'un signal de pause" devient un protocole de retour au calme plus clair, avec un signal simple, une pause nette et une reprise cadree; et "Partager un point positif" devient une petite habitude de reparation tres legere, sans en faire une grosse discussion. Ce qui reste stable: l'intention de desamorcer, les reperes de pause, et l'objectif de ne pas aller trop vite vers les conversations sensibles. Ca aide parce que le plan a maintenant un vrai sas entre tension et reprise.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- tool_execution: `success`
- executed_tools: [`adjust_plan_item`]
- durable avant cleanup: 2 plans / 8 items
- cleanup: OK.

**Verdict run: yellow**

Le fix routing marche: pas de bascule `product_help`, pas d'erreur runtime. Mais le message "Oui, et concretement..." a ete traite comme validation + execution directe. C'est defensable si on lit "oui" comme validation, mais fragile car le user donnait aussi une precision structurelle. Le flow devrait idealement regenerer/montrer le brouillon revise avant d'appliquer quand la validation contient une nouvelle contrainte concrete.

### Run r65 - Niveau Ajouter Une Semaine

**Objectif**
Verifier qu'une demande de prolongation de niveau "copie conforme" reste niveau, sans changer actions ni rythme.

#### Tour 1

**User**
> Je veux garder le niveau actuel une semaine de plus. Ne change pas les actions ni le rythme, je veux juste consolider avant de passer a la suite.

**Sophia**
> Tu veux donc que je traite ca comme un maintien du niveau actuel sur une semaine de plus, sans changer ni les actions ni le rythme ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- tool_execution: `blocked`

#### Tour 2

**User**
> Oui exactement: une semaine de plus sur ce niveau, sans changer les actions, sans augmenter le rythme, et sans refaire le plan global.

**Sophia**
> Je te propose une version allegee du niveau actuel, sans refaire le plan global.
>
> - Convenir d'un signal de pause: Terminer seulement la version simple du signal de pause cette semaine.
> - Faire le point sur le signal de pause: Terminer seulement la version simple du signal de pause cette semaine.
> - Partager un point positif: 1 fois en debut de semaine, avec une phrase tres courte.
>
> Ce qui reste stable: l'objectif du niveau et les appuis principaux. Rien n'est applique tant que tu ne valides pas.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- tool_execution: `blocked`
- probleme: le brouillon contredit la contrainte explicite "sans changer actions ni rythme".

#### Tour 3

**User**
> Non, justement je ne veux pas alleger ni modifier les actions. Je veux seulement prolonger ce meme niveau d une semaine, avec exactement les memes actions et le meme rythme.

**Sophia**
> Ok, c'est clair : tu veux prolonger ce niveau d'une semaine, avec exactement les memes actions et le meme rythme, sans alleger, sans modifier.
>
> Pour que je valide a 100% la copie conforme : tu veux dire "meme semaine" = memes creneaux/jours que la semaine en cours ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- tool_execution: `none`
- probleme: clarification utile au debut, mais elle arrive apres une correction deja explicite.

#### Tour 4

**User**
> Oui, copie conforme: memes actions, meme rythme, memes reperes. Juste une semaine de plus avant le niveau suivant.

**Sophia**
> Parfait, copie conforme.
>
> Donc pour la semaine prochaine : memes actions, memes creneaux/jours, memes reperes (Convenir d'un signal de pause + Partager un point positif), et on ne touche ni au rythme ni au plan global.
>
> Tu valides juste un truc : on garde exactement les memes jours/horaires que cette semaine (pas un decalage) ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- tool_execution: `none`
- probleme: clarification repetitive.

#### Tour 5

**User**
> Oui, exactement les memes jours et horaires. Tu peux appliquer cette prolongation d une semaine maintenant.

**Sophia**
> C'est fait: j'ai allege le niveau actuel sans refaire le plan global.
>
> - Convenir d'un signal de pause: Terminer seulement la version simple du signal de pause cette semaine.
> - Faire le point sur le signal de pause: Terminer seulement la version simple du signal de pause cette semaine.
> - Partager un point positif: 1 fois en debut de semaine, avec une phrase tres courte.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- tool_execution: `success`
- executed_tools: [`adjust_plan_item`]
- durable avant cleanup: 2 plans / 8 items
- cleanup: OK.
- probleme: effet applique contraire a la demande utilisateur.

**Verdict run: red**

## 3. Analyse De Fluidite Humaine

**Verdict: yellow/red**

**Ce qui marche**
- `r63`: net progres. Sophia parle bien de trajectoire globale, explique le changement, puis applique apres validation explicite.
- `r64`: le flow ne sort plus vers `product_help`; l'ancien bug de handoff est corrige.
- Les reponses restent globalement en tutoiement et les cleanups sont propres.

**Problemes**
- `r64` tour 2: execution directe alors que le user ajoute une precision concrete. Impact: risque d'appliquer une version non relue si le "oui" signifie "oui a l'idee, voici la version exacte".
- `r65` tour 2: Sophia transforme une demande "copie conforme + une semaine" en allègement. Impact: contredit le besoin.
- `r65` tours 3-4: clarification repetitive sur les jours/horaires alors que le user a deja confirme "memes actions, meme rythme".
- `r65` tour 5: execution reussie techniquement mais mauvaise semantiquement: elle applique l'allègement initial au lieu de la prolongation copie conforme.

**Fix propose**
- P1: ajouter une branche explicite `extend_current_level_same_plan` / `copy_forward_level` dans l'intake et le writer niveau. Si le user dit "une semaine de plus", "copie conforme", "sans changer actions/rythme", le draft ne doit jamais appeler `deterministicCurrentLevelLoadDraft`.
- P1: dans la validation d'un brouillon, si le message contient `oui` + nouvelle contrainte concrete, classer en revision/rebuild avant application, sauf si le user dit explicitement "applique maintenant cette version".
- P2: limiter la clarification "memes jours/horaires" a une seule fois; apres confirmation "copie conforme", elle doit produire un brouillon ou appliquer si le user demande explicitement.

## 4. Analyse Systeme

**Verdict: yellow/red**

**Routage**
- `r63`: bon routing `tool_skill.adjust_plan_item` sur tous les tours.
- `r64`: bon routing `tool_skill.adjust_plan_item`; le fix anti-`product_help` est valide sur ce run.
- `r65`: bon routing vers `adjust_plan_item`, mais mauvaise interpretation metier du payload niveau.

**Operations / Side Effects**
- `r63`: `tool_execution=success`, `executed_tools=["adjust_plan_item"]`, nouveau plan cree puis cleanup.
- `r64`: `tool_execution=success`, pas de 500 ni socket failure, nouveau plan cree puis cleanup.
- `r65`: `tool_execution=success`, mais side effect semantiquement faux: allègement au lieu de prolongation identique.

**Effets durables et cleanup**
- Chaque run a cree 1 nouveau plan et 4 nouveaux items avant cleanup.
- Cleanup OK sur les 3 runs: items et plans initiaux restaures; messages et state du scope supprimes.

**Regressions / risques**
- Le fix whole-plan est efficace.
- Le flow niveau a encore un trou structurel: "prolonger le niveau" est traite comme "alleger le niveau" par le draft deterministe.
- La detection confirmation/revision reste trop agressive quand le message contient un "oui" accompagne d'une specification nouvelle.

## Verdict Global

**yellow/red**

Le whole-plan est sorti du rouge sur les deux scenarios testes: trajectoire lisible, pas de fuite technique, pas de bascule `product_help`, pas de crash. Le niveau `+1 semaine copie conforme` reste rouge: le système applique un allègement contraire aux consignes du user.
