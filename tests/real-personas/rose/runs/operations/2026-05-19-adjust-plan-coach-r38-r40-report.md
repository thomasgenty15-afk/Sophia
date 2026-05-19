# QA Run Report - Adjust Plan Coach Guidance R38-R40

## 1. Contexte Du Test

- Date: 2026-05-19
- Runs:
  - `r38c-action-specific`: modification d'une action precise.
  - `r39-level-current`: modification du niveau actuel.
  - `r40-whole-plan`: modification de trajectoire globale.
- Persona: Rose, connexion locale, Auth local par login password verifie.
- Objectif: tester le flow `adjust_plan_item` avec le nouveau coach specialise active et auditable.
- Surfaces visees: routing, sous-skill action/level/whole_plan, coach guidance, draft avant validation, execution, separation de plan, cleanup DB.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `enable_adjust_plan_coach_guidance=true`, pas de renderer deterministe, pas de fallback `processMessage` direct.
- Validite QA: valide pour les runs `r38c`, `r39`, `r40`. Deux tentatives initiales `r38`/`r38b` ont retourne `500 The operation is not supported` car l'edge runtime servait encore l'ancienne implementation du flag env; la stack Supabase locale a ete redemarree sans reset DB, puis les runs exploitables ont ete relances proprement.
- Cleanup: effectue apres chaque run exploitable. Les scopes QA sont vides apres cleanup (`chat_messages=0`, `user_chat_states=0`).

## 2. Tours De Conversation

### Run R38C - Modification Action

#### Tour 1

**User**
> L'action 'Partager un point positif' me met la pression. J'ai l'impression de devoir trouver un compliment parfait, donc je ne la fais pas. Je veux modifier cette action précise, pas tout le niveau.

**Sophia**
> Si je comprends bien, tu souhaites ajuster l'action 'Partager un point positif' pour réduire la pression de devoir trouver un compliment parfait, afin de la rendre plus facile à réaliser. Est-ce que je peux te préparer une proposition pour simplifier cette action ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- executed_tools: []
- coaching_guidance_audit: `{ "scope": "action", "source": "runner", "status": "generated" }`
- coaching_guidance: recommande de simplifier l'instruction, de preserver l'intention positive, et de ne pas supprimer/pause l'habitude.
- durable_effect: aucun

#### Tour 2

**User**
> Oui, prépare un brouillon sans appliquer. Je veux garder l'idée de créer du positif, mais que ça devienne juste une phrase simple du type merci pour un truc concret, pas un compliment parfait.

**Sophia**
> Salut ! Je comprends que l'action 'Partager un point positif' te met la pression car tu as l'impression de devoir trouver un compliment parfait. Pour t'aider à la réaliser plus facilement et à maintenir l'intention de créer du positif, je te propose d'ajuster son instruction.
>
> Concrètement, l'action 'Partager un point positif' passerait de :
> - Avant : "écrire une phrase très simple, même imparfaite, plutôt que chercher un vrai point positif"
> - Après : "une phrase simple du type merci pour un truc concret"
>
> Rien d'autre ne sera touché : la fréquence de cette habitude (3 jours / semaine) reste la même, et le reste de ton plan [...] ne sera pas modifié. Qu'en penses-tu ? Rien n'est appliqué tant que tu n'as pas validé. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `execution_breakdown_absorbed_by_active_tool_skill`
- executed_tools: []
- coaching_guidance_audit: action/generated
- durable_effect: aucun

#### Tour 3

**User**
> Oui, c'est exactement ça. Applique cet ajustement seulement sur 'Partager un point positif' : garder 3 jours par semaine, mais avec la phrase simple 'merci pour un truc concret'.

**Sophia**
> C'est fait ! J'ai ajusté l'action 'Partager un point positif' pour la rendre plus simple et moins contraignante.
>
> Désormais, l'instruction de cette habitude est : "une phrase simple du type merci pour un truc concret". [...] Le reste de ton plan, y compris la fréquence de cette habitude (3 jours / semaine) et tes autres actions, reste inchangé.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- executed_tools: [`adjust_plan_item`]
- coaching_guidance_audit: action/generated
- durable_effect: patch applique puis restaure au cleanup; aucun plan/item cree.

### Run R39 - Modification Niveau

#### Tour 1

**User**
> Cette semaine le niveau actuel est trop dense pour moi. Je veux alléger le rythme du niveau, pas changer la trajectoire du plan. L'idée serait de garder le signal de pause, mais de réduire un peu la pression autour des actions positives.

**Sophia**
> Si je comprends bien, tu souhaites alléger le rythme du niveau actuel car il est trop dense, en réduisant la pression autour des actions positives, tout en conservant le signal de pause. Est-ce que je peux te préparer une proposition concrète pour cela ? 🙂

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- coaching_guidance_audit: `{ "scope": "level", "source": "runner", "status": "generated" }`
- coaching_guidance: recommande d'alleger la charge du niveau, preserver le signal de pause, ne pas changer la trajectoire globale.
- durable_effect: aucun

#### Tour 2

**User**
> Oui, prépare un brouillon sans appliquer. Je veux garder le signal de pause comme priorité, mais passer 'Partager un point positif' à 2 jours cette semaine et rendre 'Faire le point sur le signal de pause' plus léger, plutôt 5 minutes à froid.

**Sophia**
> J'ai préparé un brouillon pour alléger ton niveau actuel cette semaine [...] 1. L'habitude "Partager un point positif" : sa fréquence passerait de 3 jours par semaine à 2 jours par semaine. 2. L'action "Convenir d'un signal de pause" : [...] limiter la discussion pour définir ce signal à 5 minutes.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- coaching_guidance_audit: level/generated
- durable_effect: aucun

#### Tour 3

**User**
> Pas exactement : ne touche pas à 'Convenir d'un signal de pause'. Je veux que le 5 minutes concerne 'Faire le point sur le signal de pause', le bilan à froid. Le reste du brouillon me va.

**Sophia**
> D'accord, je comprends mieux ! Je vais ajuster le brouillon comme tu le souhaites : je ne toucherai pas à 'Convenir d'un signal de pause', et la limite de 5 minutes sera appliquée à 'Faire le point sur le signal de pause'. Je garde aussi la réduction de 'Partager un point positif' à 2 jours cette semaine. Je te prépare ça tout de suite. 🙂

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- coaching_guidance_audit: level/generated
- coaching_guidance: contient explicitement le warning "Ne pas modifier l'action 'Convenir d'un signal de pause'."
- durable_effect: aucun

#### Tour 4

**User**
> Oui, montre-moi le brouillon corrigé avant validation, sans appliquer.

**Sophia**
> Voici ce que je te propose d'ajuster, rien n'est appliqué pour l'instant : 1. Pour l'habitude 'Partager un point positif' : réduire de 3 jours par semaine à 2 jours par semaine. 2. Pour la charge globale de ton niveau actuel : l'alléger pour cette semaine.
>
> Ce qui ne sera pas touché : [...] 'Convenir d'un signal de pause' [...] 'Faire le point sur le signal de pause' [...] ne peut pas être ajustée dans le périmètre de ton niveau actuel pour le moment.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- coaching_guidance_audit: level/generated
- durable_effect: aucun

#### Tour 5

**User**
> Ok, applique seulement ce qui est possible dans ce brouillon : réduire 'Partager un point positif' à 2 jours cette semaine et garder le reste inchangé.

**Sophia**
> J'ai bien noté ta demande [...] je te propose les ajustements suivants, rien n'est appliqué tant que tu n'as pas validé : 1. Réduire la fréquence de l'habitude "Partager un point positif" [...] 2 jours par semaine [...] Ce qui ne bouge pas : l'action "Convenir d'un signal de pause" reste inchangée [...] "Faire le point sur le signal de pause" ne sera pas modifiée [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- executed_tools: []
- coaching_guidance_audit: level/generated
- durable_effect: aucun

#### Tour 6

**User**
> Oui, je valide explicitement cette proposition. Applique maintenant la réduction de 'Partager un point positif' à 2 jours cette semaine, sans toucher au reste.

**Sophia**
> C'est fait ! [...] 1. L'habitude "Partager un point positif" : sa fréquence est passée de 3 jours par semaine à 2 jours par semaine. 2. L'action "Convenir d'un signal de pause" : [...] la description de cette action a été mise à jour pour inclure une limite de 5 minutes [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- executed_tools: [`adjust_plan_item`]
- coaching_guidance_audit: level/generated
- durable_effect: 1 nouveau plan et 4 nouveaux items crees avant cleanup; tout supprime/restaure ensuite.

### Run R40 - Modification Whole Plan

#### Tour 1

**User**
> Je trouve que la suite du plan n'est plus très cohérente. Après le signal de pause, j'ai l'impression qu'on va trop vite vers l'analyse des déclencheurs. Je voudrais revoir la trajectoire globale : d'abord sécurité, ensuite positif, et seulement après analyse.

**Sophia**
> Je comprends tout à fait ton souhait de réorganiser le plan pour suivre une progression "d'abord sécurité, ensuite positif, et seulement après analyse". Pour que je puisse ajuster la trajectoire, comment imagines-tu que les actions de sécurité et de positif [...] devraient être consolidées avant de passer à l'analyse des déclencheurs ? 🙂

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- coaching_guidance_audit: `{ "scope": "whole_plan", "source": "runner", "status": "generated" }`
- coaching_guidance: recommande de reorganiser la sequence securite/positif/analyse, ne pas supprimer `Cartographier les déclencheurs`, preserver l'objectif global.
- durable_effect: aucun

#### Tour 2

**User**
> Je veux que le signal de pause soit vraiment acquis avant l'analyse, et qu'on ait au moins une petite habitude positive qui tourne. Je ne veux pas supprimer 'Cartographier les déclencheurs', seulement le mettre après sécurité + positif. Prépare un brouillon sans appliquer.

**Sophia**
> Je te propose d'ajuster la trajectoire globale de ton plan [...] d'abord la sécurité, puis une habitude positive, et seulement après l'analyse. Rien n'est encore appliqué [...] 'Cartographier les déclencheurs' ne sera pas supprimée, mais son introduction sera décalée [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- coaching_guidance_audit: whole_plan/generated
- durable_effect: aucun

#### Tour 3

**User**
> Oui, ce brouillon me convient. Applique l'ajustement global : sécurité d'abord, positif ensuite, puis analyse des déclencheurs, sans supprimer les déclencheurs et sans changer l'objectif global.

**Sophia**
> Je ne peux pas appliquer cet ajustement depuis le chat tant qu'il n'est pas rattaché proprement aux bonnes actions du plan. 🙂

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: null dans la trace courte, route_reason `normal_reply_default`
- executed_tools: []
- coaching_guidance_audit: whole_plan/generated
- durable_effect: aucun

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le coach specialise est bien actif et produit une guidance pertinente dans les trois scopes.
- Action: conversation claire, bonne preservation de l'intention, validation explicite puis execution.
- Niveau: Sophia pose le cadre correctement et explicite que la trajectoire globale ne change pas.
- Whole plan: la conversation est plus intelligente qu'avant; Sophia raisonne bien en sequence securite -> positif -> analyse.

**Problemes**
- R38C Tour 2: "Salut !" dans un brouillon de tool skill donne un ton un peu artificiel. Impact faible. Severite: yellow leger.
- R39 Tour 2: Sophia applique mentalement les 5 minutes a `Convenir d'un signal de pause` alors que le user ciblait `Faire le point sur le signal de pause`. Impact: le user doit corriger. Severite: yellow/red.
- R39 Tour 6: malgre la correction et la validation "sans toucher au reste", Sophia annonce avoir modifie `Convenir d'un signal de pause`. Impact: perte de confiance forte, demande utilisateur contredite. Severite: red.
- R40 Tour 3: le flow whole plan explique qu'il ne peut pas appliquer depuis le chat. Impact: frustration produit, meme si la discussion coaching est bonne. Severite: red cote execution.

**Fix propose**
- Faire remonter `coach_warning` et `coach_avoid` comme contraintes dures au moment de la generation/execution, pas seulement comme inspiration de writer.
- Ajouter un garde deterministe: si le dernier user dit "ne touche pas a X" ou "sans toucher au reste", toute changed_item sur X doit etre rejetee avant execution.
- Pour `whole_plan`, sortir du contrat item-centric actuel et permettre une vraie execution plan-level.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Les trois runs routent correctement au demarrage vers `adjust_plan_item`.
- Les scopes coach sont corrects:
  - action: `scope=action`, `status=generated`
  - niveau: `scope=level`, `status=generated`
  - whole plan: `scope=whole_plan`, `status=generated`
- Le champ `coaching_guidance_audit` est bien disponible dans les summaries QA.

**Skills / Operations / Tools**
- Action: execution OK, outil `adjust_plan_item` execute au tour 3.
- Niveau: outil execute au tour 6, mais le contenu execute contredit une contrainte explicite.
- Whole plan: pas d'execution, blocage identique aux runs precedents.

**Memory / Effets durables**
- R38C: patch action applique puis cleanup; pas de nouveau plan/item.
- R39: separation de plan observee avant cleanup (`durablePlans=2`, `durableItems=8`), puis cleanup supprime 1 plan et 4 items crees et restaure l'etat initial.
- R40: aucun effet durable, aucun plan/item cree.
- Tous les cleanups finaux: `afterMessages=0`, `afterStates=0`.

**Problemes**
- R39 Tour 6: `coach_guidance` contenait les bons warnings, mais le generator/executor n'en a pas fait une contrainte bloquante. Impact systeme: side effect faux malgre confirmation restrictive. Severite: red.
- R39 Tour 5: Sophia repasse en proposition au lieu d'executer alors que le user dit "applique seulement ce qui est possible". Impact: confirmation mal traitee / boucle de validation. Severite: yellow.
- R40 Tour 3: le true whole_plan reste non materialisable depuis le chat. Impact systeme: validation utilisateur non executable. Severite: red.

**Fix propose**
- Transformer la guidance coach en `hard_constraints` normalisees quand elle contient `avoid`, `preserve`, ou `warnings` relies a un item nomme.
- Ajouter une validation post-generation pre-execution: comparer `changed_items` avec les exclusions utilisateur recentes et les `coach_avoid`.
- Pour `whole_plan`, introduire un payload `plan_structure_patch` / `trajectory_change_summary` executable par le chemin de regeneration plan-level, sans exiger deux changed_items action/habit.

## Verdict Global

- Verdict: red
- Raison principale: le coach specialise est bien appele et utile, mais ses sorties ne protegent pas encore l'execution. Le run niveau applique une modification explicitement interdite, et le run whole plan reste impossible a appliquer.
- Follow-up prioritaire: convertir `coach_guidance.warnings/preserve/avoid` + les corrections utilisateur recentes en contraintes dures verifiees avant execution.

