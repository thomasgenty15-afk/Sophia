## 1. Contexte Du Test

- Date: 2026-05-20
- Runs: r66-level-add-week, r67-whole-plan-revision, r68-whole-plan-explicit
- Persona: Rose, Supabase local, chemin IA reel Sophia, `force_full_ai=true`
- Objectif: verifier les fixes 20/80 sur ajustement de niveau a l'identique, revision de brouillon avec contrainte concrete, et whole-plan trajectoire.
- Surfaces visees: dispatcher, `adjust_plan_item`, sous-skills `level_intake` / `whole_plan_intake`, coach specialise, validation utilisateur, regeneration de plan.
- Validite QA: r66 et r68 valides. r67 techniquement nettoye mais verdict red fonctionnel sur le routage initial; le serveur est tombe avant le tour 3, puis un retry r68 explicite a ete lance.

## 2. Tours De Conversation

### r66 - Niveau: prolonger a l'identique

**Tour 1 User**
> Je veux garder le niveau actuel une semaine de plus. Ne change pas les actions ni le rythme, je veux juste consolider avant de passer a la suite.

**Sophia**
> Je te propose de prolonger le niveau actuel d'une semaine a l'identique. Ce qui change: uniquement la duree du niveau. Tu gardes les memes actions, le meme rythme et les memes reperes. Rien n'est applique tant que tu ne valides pas.

**Trace courte**
- status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- operation: draft bloque avant confirmation
- coaching_guidance: scope level, warning explicite contre allegement / changement de rythme
- durable_effect: aucun

**Tour 2 User**
> Oui exactement, memes actions, meme rythme et memes reperes. Tu peux appliquer cette prolongation maintenant.

**Sophia**
> C'est fait: j'ai prolonge le niveau actuel d'une semaine a l'identique. Les actions, le rythme et les reperes restent inchanges. Le plan global n'est pas refait.

**Trace courte**
- status: 200
- response_owner: tool_skill
- executed_tools: adjust_plan_item
- durable_effect: success, nouveau plan cree puis cleanup OK
- cleanup: OK, ancien plan et 4 items restaures, nouveau plan/items/messages supprimes

### r67 - Whole Plan Naturel: prochaine etape trop rapide

**Tour 1 User**
> En regardant la suite du plan, je trouve que la prochaine etape arrive trop vite. Avant les conversations sensibles, je voudrais une etape intermediaire plus securisante.

**Sophia**
> Sophia comprend le besoin et propose A/B/C/D pour preciser le type d'etape intermediaire.

**Trace courte**
- status: 200
- response_owner: normal_reply
- selected_handler: null
- tool_skill_run: null
- durable_effect: aucun

**Tour 2 User**
> Plutot C, mais concretement je veux une mission ponctuelle pour definir un protocole de retour au calme, puis une petite habitude de reparation simple avant les conversations sensibles.

**Sophia**
> Sophia reformule correctement, mais reste en normal_reply et demande confirmation conceptuelle.

**Trace courte**
- status: 200
- response_owner: normal_reply
- selected_handler: null
- tool_skill_run: null
- durable_effect: aucun
- incident: serveur local tombe avant le tour 3; cleanup DB OK

### r68 - Whole Plan Explicite: trajectoire globale

**Tour 1 User**
> Je veux ajuster le plan global: la direction ne me convient plus. Avant les conversations sensibles, ajoute une etape intermediaire avec une mission ponctuelle de protocole de retour au calme, puis une petite habitude de reparation simple. Garde le meme objectif global.

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond. Ce qui changerait: insertion d'une etape intermediaire avant les conversations sensibles, centree sur le signal de pause et une reparation simple. Rien n'est applique tant que tu ne valides pas.

**Trace courte**
- status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- operation: draft whole_plan bloque avant confirmation
- coaching_guidance: scope whole_plan, preservation de l'objectif global, warning contre inversion mission/habitude
- durable_effect: aucun

**Tour 2 User**
> Oui, et concretement je veux que la mission soit ponctuelle, puis seulement apres une petite habitude de reparation. Pas appliquer tout de suite, montre-moi la version ajustee.

**Sophia**
> Sophia repropose un brouillon whole-plan et n'applique rien.

**Trace courte**
- status: 200
- response_owner: tool_skill
- draft_review_decision: revise
- apply_after_revision: false
- durable_effect: aucun

**Tour 3 User**
> Oui, applique maintenant cette version globale.

**Sophia**
> C'est fait: j'ai ajuste la trajectoire du plan. Le plan garde le meme objectif, mais la suite est regeneree pour ralentir la transition et consolider le signal de pause avec une reparation simple avant les conversations plus sensibles.

**Trace courte**
- status: 200
- response_owner: tool_skill
- executed_tools: adjust_plan_item
- durable_effect: success, plan regenere et active
- cleanup: OK, ancien plan et items restaures, nouveau plan/items/messages supprimes

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- r66 est maintenant net: Sophia comprend que la demande est une prolongation a l'identique, pas un allegement.
- r68 est coherent en coaching: elle preserve l'objectif global, parle de trajectoire, bloque avant validation, puis execute seulement apres accord explicite.
- La revision "oui + contrainte concrete + pas appliquer" ne declenche plus d'execution directe.

**Problemes**
- r67 tour 1-2: conversation humainement bonne, mais Sophia reste en coaching normal alors que le user parle deja de structure du plan. Impact: le user doit finir par dire "ajuste le plan global" pour entrer dans le flow. Severite: yellow/red selon attente produit.
- r68 tour 2: la reponse regeneree est proche du brouillon initial; la trace a bien `revise`, mais le texte utilisateur ne rend pas assez visible l'ordre "mission ponctuelle puis habitude". Severite: yellow.
- Latence d'execution longue sur r66/r68 validation, liee a regeneration de plan. Severite: yellow.

**Fix propose**
- 20/80 restant: renforcer le dispatcher/tool-intent pour que "la prochaine etape arrive trop vite", "avant les conversations sensibles", "ajouter une etape intermediaire" route vers `adjust_plan_item` meme sans verbe "ajuster".
- Ameliorer le writer whole-plan revision pour refléter explicitement les nouvelles contraintes dans le `confirmation_message`, pas seulement dans la trace.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- r66: green, `tool_skill` + `adjust_plan_item`, scope `level`.
- r68: green quand le user dit explicitement "ajuster le plan global".
- r67: red sur routage naturel, `normal_reply` alors que les signaux structurels whole-plan etaient presents.

**Skills / Operations / Tools**
- Le coach specialise est bien logue sur r66 et r68, avec `coaching_guidance_audit.status=generated`.
- r66 utilise les contraintes `extend_current_level_same_plan`, `preserve_action_content`, `preserve_cadence`; le texte ne contient plus d'allegement.
- r68 tour 2 produit `draft_review_decision=revise` et `apply_after_revision=false`, donc le fix "oui + nouvelle contrainte concrete" est fonctionnel.

**Memory / Effets durables**
- r66 et r68 appliquent seulement apres confirmation.
- r68 whole-plan regenere bien un nouveau plan actif et archive l'ancien avant cleanup, donc le split de plan via chat est en place.
- Cleanups r66/r67/r68 OK: Rose est restauree apres chaque run.

**Problemes**
- r67: le dispatcher ne transforme pas une intention structurelle implicite en tool skill. Impact systeme: le flow adjust_plan n'est pas teste ni active tant que le user ne nomme pas explicitement le plan global. Severite: red pour ce scenario.
- r68: le message revise ne materialise pas assez clairement la contrainte "mission ponctuelle puis habitude", meme si le coach et la trace l'ont. Severite: yellow.

**Fix propose**
- P1: ajouter dans le dispatcher/tool-intent des exemples et criteres forts pour les signaux whole-plan structurels implicites: "prochaine etape", "avant les conversations sensibles", "etape intermediaire", "la suite arrive trop vite", "direction du plan".
- P2: dans le writer whole-plan, imposer que toute contrainte nouvelle issue de `draft_review_decision=revise` apparaisse textuellement dans `confirmation_message`.

## Verdict Global

**yellow**

Les fixes principaux passent: niveau a l'identique green, whole-plan explicite green, validation/revision sans execution directe green. Le prochain 20/80 est le routage des formulations naturelles de trajectoire globale vers `adjust_plan_item`.
