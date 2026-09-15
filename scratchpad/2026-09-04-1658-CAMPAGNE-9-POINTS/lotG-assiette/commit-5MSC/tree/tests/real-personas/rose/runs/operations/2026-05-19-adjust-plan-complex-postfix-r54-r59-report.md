# Adjust Plan Complex Postfix QA - r54-r59

## 1. Contexte Du Test

- Date: 2026-05-19
- Runs: `r54-level-add-week`, `r55-level-reduce-rhythm`, `r57-level-increase-rhythm`, `r58-whole-plan-direction`, `r59-whole-plan-next-step`
- Persona: Rose, Supabase local, endpoint local `test-send-message`, `force_full_ai=true`
- Objectif: simuler des demandes user realistes sur ajustement de niveau et whole plan, avec au moins 5 tours quand possible.
- Surfaces visees: routing `adjust_plan_item`, sous-scope niveau vs whole plan, coach specialise, brouillon, confirmation, execution, separation/regen du plan.
- Correctif pre-run: `writePlanAdjustmentPatch` accepte maintenant plusieurs changements materiels sur un meme item reel, afin que "changer la frequence + garder/modifier la version mini" n'echoue plus comme s'il manquait un second item.
- Validite QA: partielle. Les runs `r55` et `r57` sont valides et executes. `r54` est valide conversationnellement mais red. `r58` est valide jusqu'au crash du tour 5. `r59` est incomplet apres interruption runtime/retry.
- Incidents infra: `r52` et `r53` invalides avant vraie conversation a cause de variables serveur manquantes; `r56` invalide car lance avant cleanup de `r55`; non retenus dans le verdict produit.
- Cleanup: snapshots restaures pour `r54`, `r55`, `r57`, `r58`, `r59`; serveur QA local arrete.

## 2. Tours De Conversation

### Run r54 - Ajouter Une Semaine Au Niveau

**Objectif**
Ajouter une semaine au niveau actuel, sans changer le rythme ni les actions.

**Tour 1**

**User**
> Je sens que le niveau actuel est juste, mais il me faudrait une semaine de plus dessus. Je ne veux pas changer la direction du plan, seulement prolonger ce niveau pour consolider.

**Sophia**
> Je te propose un ajustement limite au niveau actuel [...] Je changerais deux actions ciblees pour alleger la charge [...]

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- durable_effect: none
- probleme: Sophia transforme "prolonger" en "alleger deux actions".

**Tour 2**

**User**
> Non, je ne veux pas alleger ces actions ni changer leurs consignes. Ce que je demande c'est surtout d'ajouter une semaine au niveau actuel, avec le meme rythme [...]

**Sophia**
> Ok, je n'applique pas cet ajustement. On garde ton plan tel quel pour l'instant [...]

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- probleme: correction interpretee comme rejet/cancel au lieu de revision.

**Tours 3-7**

**User**
> Je ne rejette pas l'idee d'ajuster [...] prolonger le niveau d'une semaine [...]
> La raison principale c'est que je commence a mieux utiliser le signal de pause [...]
> Oui, prepare-moi la proposition concrete [...]
> Oui, c'est ca [...]
> Oui, je confirme exactement ca [...]

**Sophia**
> D'accord, je peux prolonger [...]
> Est-ce que je peux te preparer une proposition concrete ?
> Pour que je puisse te preparer cette proposition, peux-tu me confirmer [...]
> Je comprends que tu souhaites voir le brouillon [...] peux-tu me confirmer [...]
> Il semble que le brouillon n'ait pas ete genere correctement [...] peux-tu me confirmer [...]

**Trace courte**
- http_status: 200 sur tous les tours
- response_owner: `tool_skill`, puis `product_help` au tour 5
- executed_tools: none
- durable_effect: none
- verdict run: red

### Run r55 - Reduire Le Rythme Du Niveau

**Objectif**
Passer `Partager un point positif` de 3 a 2 jours cette semaine, preserver le signal de pause, ne pas toucher au plan global.

**Tours 1-2**

**User**
> Cette semaine le niveau est trop dense [...]
> C'est surtout Partager un point positif [...] Cartographier les declencheurs [...] Le signal de pause doit rester central.

**Sophia**
> Quelles sont les actions les plus denses [...]
> Je peux proposer de reduire la frequence de "Partager un point positif" [...] je ne peux pas modifier directement cette clarification [...]

**Trace courte**
- routing: `adjust_plan_item`
- scope: niveau
- coach: utile, preserve signal de pause

**Tours 3-5**

**User**
> Pour Partager un point positif, je veux passer a 2 jours cette semaine [...]
> Je veux etre sur que ce n'est pas tout le plan [...]
> Oui, applique ce brouillon [...]

**Sophia**
> Je te propose [...] ramener sa frequence a 2 jours cette semaine [...]
> Je n'ai encore rien applique. Le brouillon actuel prevoit [...]
> C'est note ! J'ai bien ajuste ton plan [...]

**Trace courte**
- tour 5 tool_execution: `success`
- executed_tools: `adjust_plan_item`
- durable_effect: nouveau plan versionne cree, cleanup restaure ensuite
- verdict run: green/yellow. Le flow aboutit correctement, mais regen de plan complet pour une baisse temporaire de niveau reste a surveiller.

### Run r57 - Augmenter Le Rythme Du Niveau

**Objectif**
Passer `Partager un point positif` de 3 a 4 jours cette semaine, garder la version mini, ne pas accelerer tout le plan.

**Tours 1-3**

**User**
> Je me sens plus solide [...]
> Passer de 3 a 4 jours cette semaine [...] garder la version mini [...]
> Je veux aussi ton avis coaching [...]

**Sophia**
> Tu penses a quoi concretement ?
> Je peux te preparer une proposition [...]
> Je propose [...] 3 a 4 jours par semaine [...] version mini maintenue [...] reste attentif a tes sensations [...]

**Trace courte**
- routing: `adjust_plan_item`
- scope: niveau
- coach: bon, nuance le risque de pression

**Tours 4-5**

**User**
> Resume-moi le brouillon final [...]
> Oui, applique ce brouillon maintenant.

**Sophia**
> OK, je te resume le brouillon final [...]
> C'est fait ! J'ai ajuste ton plan [...]

**Trace courte**
- tour 5 tool_execution: `success`
- executed_tools: `adjust_plan_item`
- durable_effect: application OK, cleanup restaure ensuite
- regression corrigee: le cas "frequence + version mini sur meme item" n'est plus bloque.
- verdict run: green/yellow. Le tour 4 passe en `normal_reply`, mais la confirmation suivante execute correctement.

### Run r58 - Whole Plan Direction

**Objectif**
Modifier la trajectoire globale: ajouter une vraie etape de reparation apres conflit, avec solutions concretes.

**Tours 1-3**

**User**
> La direction du plan ne me convient plus [...] travailler aussi la reparation apres conflit.
> Une vraie etape apres le desamorcage [...]
> Apres une dispute, chacun dit une chose qu'il regrette [...]

**Sophia**
> Comment imagines-tu que ca s'articulerait [...]
> Peux-tu donner un ou deux exemples concrets [...]
> Comment formuler "une chose qu'il regrette" de facon constructive ?

**Trace courte**
- routing: `adjust_plan_item`
- scope attendu: whole plan
- coach: questions pertinentes, mais trop de clarification avant brouillon.

**Tour 4**

**User**
> Je veux eviter les accusations [...] regarde si ca change la trajectoire complete du plan et propose un brouillon.

**Sophia**
> Je te propose d'ajuster la trajectoire globale [...] l'action "Convenir d'un signal de pause" (ID: ...) [...]

**Trace courte**
- http_status: 200
- probleme: fuite d'IDs techniques dans le message user.
- probleme: whole plan reduit a l'enrichissement de deux actions, pas une vraie trajectoire globale.

**Tour 5**

**User**
> L'idee me va, mais je ne veux pas voir des IDs techniques [...] je veux que la trajectoire globale ait une etape reparation [...]

**Sophia**
> Reponse vide, HTTP 500.

**Trace courte**
- http_status: 500
- server_error: `SyntaxError: Expected ',' or '}' after property value in JSON`
- durable_effect: none observe, cleanup effectue
- verdict run: red

### Run r59 - Whole Plan Next Step

**Objectif**
Changer la prochaine etape du plan: inserer une etape intermediaire securite emotionnelle / retour au calme.

**Tours 1-3**

**User**
> La prochaine etape ne me parait pas bonne [...] securite emotionnelle et retour au calme.
> Pause de 20 minutes, puis revenir avec une phrase simple.
> Mission ponctuelle puis habitude legere [...]

**Sophia**
> Que veux-tu concretement pour cette etape ?
> Quel format ideal: habitude quotidienne, mission ponctuelle, cadre de reflexion ?
> Est-ce que la phrase calme est pour toi seul(e) ou une attente mutuelle ?

**Trace courte**
- http_status: 200 sur le retry du tour 3
- routing: `adjust_plan_item`
- durable_effect: none, cleanup effectue
- verdict run: incomplete/yellow-red. Les questions sont pertinentes mais le flow n'a pas atteint le brouillon en 3 tours; run interrompu apres incidents/retry.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Les demandes de baisse et hausse de rythme sont comprises quand l'action cible est explicite.
- Le coach specialise apporte des warnings utiles: garder la version mini, ne pas accelerer tout le plan, preserver le signal de pause.
- Les confirmations avant application sont globalement respectees sur `r55` et `r57`.

**Problemes**
- `r54`: Sophia ne sait pas traiter "ajouter une semaine au niveau sans modifier les actions". Elle bifurque vers alleger, puis boucle sur la meme confirmation.
- `r58`: Sophia affiche des IDs techniques dans un message conversationnel, ce qui casse l'experience user.
- `r58`: whole plan est trop vite ramene a "modifier deux actions", alors que le user demande une nouvelle direction/etape globale.
- `r59`: trop de questions successives avant brouillon pour un user deja concret.

**Fix propose**
- Ajouter un chemin explicite "prolonger le niveau sans changer les actions": brouillon de prolongation, sans exiger `changed_items` de contenu/frequence.
- Interdire explicitement les IDs techniques dans tous les writers user-facing.
- Pour whole plan, forcer une structure de brouillon trajectoire: "ce qui change dans la direction", "nouvelle etape", "ce qui reste fondation", "impact sur les actions".

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Niveau: routing correct vers `adjust_plan_item` pour reduire/augmenter le rythme.
- Whole plan: routing correct vers `adjust_plan_item`, mais materialisation et writer ne respectent pas encore assez le scope global.
- Ajout de semaine: routing correct, mais sous-skill incapable de produire un draft executable.

**Skills / Operations / Tools**
- `r55`: execution OK, `adjust_plan_item` applique le changement.
- `r57`: execution OK apres correction du cas plusieurs changes sur meme item.
- `r54`: `draft_generation_retry_needed` implicite et boucle de clarification.
- `r58`: writer whole-plan produit une sortie user-facing avec IDs, puis crash JSON au tour suivant.

**Memory / Effets durables**
- Tous les runs avec side effects ont ete restaures via cleanup.
- `r55` et `r57` ont provoque une regeneration/activation de plan versionne, puis cleanup a supprime les nouveaux plans/items et restaure le plan original.

**Problemes prioritaires 20/80**
- P1: supporter "prolonger niveau X semaine(s) sans changer les actions" comme type d'ajustement niveau distinct.
- P1: filtre deterministic user-facing pour supprimer/masquer `id`, UUID, `plan_item_id`, et labels techniques dans `confirmation_message` / `execution_message`.
- P1: durcir le writer JSON whole-plan contre les quotes non echappees et ajouter retry/fallback si parse fail.
- P2: whole-plan doit materialiser une trajectoire, pas seulement deux changed_items.
- P2: reduire les clarifications repetitives quand le user a deja donne une solution concrete.

## Verdict Global

**red**

La correction appliquee a debloque un cas important de niveau (`frequence + version mini` sur le meme item), et les flows reduire/augmenter le rythme passent jusqu'a l'execution. En revanche, l'ajout d'une semaine au niveau et le whole-plan restent insuffisamment fiables pour etre consideres prets.

