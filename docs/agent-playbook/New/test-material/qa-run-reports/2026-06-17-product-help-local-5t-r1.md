# QA Run Report - Product Help Local 5T R1

## 1. Contexte Du Test

- Date: 2026-06-17
- Run: `product-help-local-5t-20260617-r1`
- Scope: `qa-normal-conversation-product-help-local-5t-20260617-r1`
- Persona: user QA temporaire `qa-normal-product-help-local-5t-20260617-r1-1781718255946@example.com`, `is_test_persona=true`, user id `3738dea8-402e-4baa-beb3-4632a7fd1619`
- Objectif: tester `product_help` sur au moins 5 tours, avec explication produit, comparaison Plan/cartes, navigation produit, sortie vers ajustement de Plan et frontiere no-mutation.
- Trajectoire: question produit non mutante -> exemple comparatif -> navigation produit -> demande operationnelle `adjust_plan_item` -> question de frontiere produit/effet.
- Surfaces visees: `product_help`, dispatcher global minimal, frontiere product/tool, `adjust_plan_item` platform handoff, EffectLedger/no mutation, DB snapshots.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `include_debug=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct, execution hors sandbox.
- Validite QA: valide. Les 5 tours ont retourne HTTP 200 et ont ete conduits tour par tour apres lecture des reponses/traces.
- Artefacts: `tmp/qa-normal-conversation/product-help-local-5t-20260617-r1/state.json`
- Cleanup cible: execute apres run. `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` nettoyes en 204; `auth.users` nettoye en 200; `user_memories` a retourne 404 car table absente/non disponible.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis un peu perdue dans Sophia : c'est quoi la difference entre une carte d'attaque, une carte de defense et une action du Plan ? Explique-moi juste le principe, sans creer ni modifier quoi que ce soit.

**Sophia**
> En bref :
> - carte d'attaque = t'aider a demarrer ou preparer l'action
> - carte de defense = t'aider quand il y a un risque de deraper sur le moment
> - action du Plan = l'action concrete a faire dans le Plan, ou a revoir si elle ne colle plus
>
> Si tu veux, je peux aussi te faire un exemple tres concret avec un meme objectif.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: `[]`
- operation: aucune
- pending_confirmation: aucun
- memory_plan: non inspecte en detail, pas de write observe
- executed_tools: `[]`
- durable_effect: aucun; `scheduled_checkins` count 0

### Tour 2

**Verdict du tour:** green

**User**
> Oui, prends l'exemple 'ranger mes papiers'. Je veux comprendre quand Sophia me proposerait une carte et quand elle me dirait plutot de clarifier l'action du Plan. Toujours sans rien creer.

**Sophia**
> Oui : si ton action de Plan existe deja mais qu'elle est trop floue, mal placee ou plus adaptee, je t'orienterai vers l'ajustement du Plan. Si au contraire tu as besoin d'aide pour lancer l'action ou te proteger d'un blocage precis, la une carte est plus pertinente. Par exemple, "ranger mes papiers" peut demander un ajustement si le Plan est mal cadre, ou une carte d'attaque si tu veux juste rendre le premier geste plus simple.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: `[]`
- operation: aucune
- pending_confirmation: aucun
- memory_plan: non inspecte en detail, pas de write observe
- executed_tools: `[]`
- durable_effect: aucun; `scheduled_checkins` count 0

### Tour 3

**Verdict du tour:** green

**User**
> Et si j'ai deja une carte ou un rappel plus tard, je les retrouve ou dans l'app ? Je veux juste le chemin produit, pas un etat de mes trucs a moi.

**Sophia**
> Pour une carte, regarde dans Dashboard > Ressources. Si elle est liee a ton plan, tu peux aussi la retrouver depuis Dashboard > Plan, puis dans Ressources par niveau.
> Pour un rappel recurrent, c'est dans Dashboard > Initiatives.
> Pour un rappel ponctuel, je n'ai pas de chemin unique confirme ici.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: `[]`
- operation: aucune
- pending_confirmation: aucun
- memory_plan: non inspecte en detail, pas de write observe
- executed_tools: `[]`
- durable_effect: aucun; `scheduled_checkins` count 0

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Ok. Maintenant aide-moi a ajuster l'action du Plan 'Ranger mes papiers' : elle est trop vague, je veux la rendre plus concrete pour samedi matin, sans ajouter une nouvelle action.

**Sophia**
> Oui - pour la rendre concrete, garde la meme action mais precise le resultat et le premier geste. Par exemple :
>
> Ranger mes papiers : trier et classer les papiers accumules sur le bureau, puis les mettre dans le bon dossier samedi matin.
>
> Si tu veux, je peux te proposer une version encore plus nette et courte.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `none`
- direct_effects: `[]`
- operation: aucune
- pending_confirmation: aucun
- memory_plan: non inspecte en detail
- executed_tools: `[]`
- durable_effect: aucun; pas de mutation Plan, pas de `scheduled_checkins`

**Analyse si yellow/red**
- Symptome: la demande explicite "aide-moi a ajuster l'action du Plan" ne demarre pas `adjust_plan_item` et ne produit pas de `platform_handoff`. Sophia donne une proposition dans le chat via `normal_reply`.
- Source amont probable: dispatcher global minimal / policy d'admission des platform handoff skills. Le prompt actuel indique que les questions/adaptations du Plan tombent en reponse normale, alors que le contrat `adjust_plan_item` decrit un demarrage par dispatcher global vers le flow local.
- Owner runtime: dispatcher global + admission `adjust_plan_item`.
- Meilleure correction selon les guidelines: clarifier et aligner la frontiere du dispatcher global minimal avec les platform handoff skills. Une demande explicite d'ajustement d'action Plan doit produire un owner `adjust_plan_item` ou un handoff non-mutant equivalent, pas `normal_reply`.
- Pourquoi ce n'est pas un patch local: le probleme arrive avant le skill `adjust_plan_item`; ajouter une phrase au visible agent ou une regex sur "ajuster l'action" contournerait la chaine dispatcher -> owner -> reducer.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-03` - Product/status/tool mal priorises

**User**
> Donc la, est-ce que mon Plan a ete modifie, ou est-ce que je dois copier cette version moi-meme quelque part ? Dis-moi juste la frontiere produit.

**Sophia**
> Non, rien n'a ete modifie dans ton Plan depuis ce chat. La version que je t'ai proposee est juste un texte ici : si tu veux qu'elle existe dans le produit, tu dois la recopier ou la mettre a jour dans le dashboard toi-meme.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `none`
- direct_effects: `[]`
- operation: aucune
- pending_confirmation: aucun
- memory_plan: non inspecte en detail
- executed_tools: `[]`
- durable_effect: aucun; DB snapshot sans effet durable

**Analyse si yellow/red**
- Symptome: le contenu visible corrige bien la frontiere no-mutation, mais la question produit/frontiere reste routee en `normal_reply` et la destination produit reste vague ("dashboard") au lieu d'un handoff/destination Plan plus contractuel.
- Source amont probable: consequence du mauvais owner T4, puis arbitration product/tool/status trop faible pour une question explicite de frontiere produit apres une pseudo-proposition Plan.
- Owner runtime: dispatcher global + policy product/tool; secondairement `adjust_plan_item` si le flow avait ete actif.
- Meilleure correction selon les guidelines: une fois T4 route vers `adjust_plan_item`, ce tour devrait etre gere comme `explain_handoff` / destination Plan par le flow actif, ou comme `product_help` inline si la question est strictement produit.
- Pourquoi ce n'est pas un patch local: la reponse visible est acceptable, mais l'etat runtime n'a jamais cree le handoff actif qui permettrait au bon owner de repondre.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1-T3 sont naturels, courts et utiles. Sophia explique les differences produit sans creer, modifier ou consulter un statut personnel.
- T2 corrige un ancien risque de confusion: elle distingue bien action du Plan trop floue et carte d'attaque.
- T3 ne bascule pas vers status recap et n'invente pas de chemin pour le rappel ponctuel quand il n'est pas confirme.
- T5 ne ment pas sur l'effet durable: Sophia dit clairement que le Plan n'a pas ete modifie.

**Problemes**
- Tour 4: Sophia repond comme un coach generaliste au lieu de demarrer le flow produit attendu. Famille: `BF-ROUTE-01`. Impact: l'utilisateur obtient un texte utile mais pas le parcours produit contractuel; il ne sait pas exactement ou appliquer la proposition. Severite: red.
- Tour 5: la frontiere no-mutation est bonne, mais la destination reste vague et le bon owner n'est pas restaure. Famille: `BF-ROUTE-03`. Impact: utilisable, mais moins guide qu'un `adjust_plan_item.explain_handoff`. Severite: yellow.

**Fix propose**
- Source amont: dispatcher global minimal + admission des platform handoff skills.
- Correction recommandee: aligner la politique globale avec les contrats `platform_handoff_skill`: les demandes explicites "aide-moi a ajuster une action du Plan / rendre cette action plus concrete / sans ajouter une nouvelle action" doivent demarrer `adjust_plan_item` en `platform_handoff`, `no_chat_mutation=true`, `executable_from_chat=false`.
- Tests d'invariant attendus: positif "ajuste l'action X du Plan" -> `adjust_plan_item`; paraphrase "rends cette action plus concrete sans changer le reste" -> `adjust_plan_item`; anti-faux-positif "explique-moi le principe d'ajuster une action" -> `product_help`; anti-faux-positif "je veux juste ton avis sur cette phrase" -> `normal_reply`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1-T3: `product_help` est correctement selectionne par `product_help_signal`.
- T4: mauvais owner final. `normal_reply_default` prend une demande operationnelle Plan qui devrait relever du platform handoff `adjust_plan_item` selon le contrat runtime.
- T5: `normal_reply` reste owner. La reponse no-mutation est correcte, mais le runtime n'a pas d'etat actif `adjust_plan_item` pour produire une destination/explication de handoff propre.

**Skills / Operations / Tools**
- `product_help`: conforme sur T1-T3, non-mutant, aucun tool, aucune DB write.
- `adjust_plan_item`: attendu au T4, absent. Aucun `mode=platform_handoff`, aucun `no_chat_mutation=true`, aucun `executable_from_chat=false`, aucun `toolExecution=platform_handoff`.
- `normal_reply`: produit une aide conversationnelle utile mais hors owner contractuel pour T4.

**Effets**
- Aucun effet durable execute.
- Aucun `scheduled_checkins`.
- Aucun claim "c'est fait".
- Cleanup cible effectue apres run.

**Memory / DB**
- `user_chat_states` existe pendant le run.
- Apres T4-T5, `temp_memory.companion_question_rhythm` apparait, ce qui confirme que les tours sont passes par companion/normal reply plutot que par un flow `adjust_plan_item`.
- Pas de mutation Plan observee dans les snapshots disponibles.

**Fix propose**
- Source amont: dispatcher global minimal et route/admission des platform handoff skills.
- Correction recommandee: restaurer un chemin structure vers `adjust_plan_item` pour les demandes explicites d'ajustement Plan. Ne pas corriger par regex metier dans le runner, le renderer ou `run.ts`; la decision doit venir d'une sortie structuree du dispatcher/admission et etre consommee par l'owner `adjust_plan_item`.
- Tests d'invariant attendus: unit/contract dispatcher pour `adjust_plan_item`; integration locale `/functions/v1/test-send-message` avec `force_full_ai=true`; mini-run product_help -> demande adjust -> question frontiere.

## Verdict Global

**red**

`product_help` est vert sur les trois premiers tours: explication produit, comparaison et navigation sont non-mutantes et bien routees. Le run echoue sur la transition hors product_help: la demande explicite d'ajustement d'une action du Plan part en `normal_reply` au lieu de `adjust_plan_item`, donc le platform handoff attendu n'est pas teste ni respecte.
