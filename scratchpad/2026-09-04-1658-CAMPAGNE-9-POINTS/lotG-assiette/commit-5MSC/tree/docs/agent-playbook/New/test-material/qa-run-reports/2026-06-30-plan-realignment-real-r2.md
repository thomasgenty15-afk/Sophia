# QA Run Report - plan_realignment_real_r2

## 1. Contexte Du Test

- Date: 2026-06-30
- Run: `plan_realignment_real_r2`
- Persona: `qa-skill`, connexion temporaire `plan_realign_planrealign_r2`
- Objectif: verifier le fix produit du flow `plan_realignment`: le visible doit guider vers `Dashboard > Plan > Ajuster mon plan`, expliquer quoi ecrire dans le cadre, et ne pas presenter de suppression/decalage/allegement direct.
- Trajectoire: decrochage du plan -> demande d'execution depuis le chat -> aide a formuler l'input -> question produit "ou trouver le cadre" -> texte court a coller.
- Surfaces visees: dispatcher global, active flow ownership, local flow `plan_realignment`, visible agent, absence d'effet durable.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, appels tour par tour, aucun renderer/fallback deterministe.
- Validite QA: valide. Trace exportee dans `tmp/planrealign_r2_trace.json`; 10 `chat_messages`, 0 `system_error_logs`, 0 effet durable. Connexion temporaire nettoyee apres run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J’ai complètement perdu le rythme de mon plan cette semaine. Je suis en retard partout et je ne sais pas quoi dire à Sophia pour repartir proprement.

**Sophia**
> Tu n’as pas besoin de tout expliquer parfaitement : l’important, c’est de dire franchement ce qui n’a pas tenu et pourquoi. Va dans Dashboard > Plan > Ajuster mon plan, puis écris par exemple :
> - j’ai perdu le rythme cette semaine
> - je suis en retard sur plusieurs actions
> - cette semaine est trop lourde / j’ai moins d’énergie / mon contexte a changé
> - je veux un rythme plus tenable
>
> Si tu veux, je peux aussi t’aider à formuler un texte très court à copier.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `plan_realignment_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`, `response_intent=repair_plan_drift_and_redirect_to_adjustment`
- executed_tools: []
- durable_effect: none
- skill_run: `selected_skill_id=plan_realignment`, `status=continue`

### Tour 2

**Verdict du tour:** green

**User**
> Tu peux le faire toi ici ? Genre ajuster mon plan automatiquement depuis ce chat.

**Sophia**
> Non, je ne peux pas le faire ici. Le réalignement se fait dans Dashboard > Plan > Ajuster mon plan.
>
> Tu peux y écrire simplement :
> - ce qui n’a pas tenu cette semaine
> - pourquoi tu as perdu le rythme
> - ce qui est devenu trop lourd ou irréaliste
> - ce que tu veux garder comme priorité
> - le niveau de retard
> - le rythme que tu peux tenir maintenant
>
> Si tu veux, je peux t’aider à formuler ce texte en 3 lignes.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `active_plan_realignment`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: []
- durable_effect: none
- skill_run: `selected_skill_id=plan_realignment`, `status=continue`

### Tour 3

**Verdict du tour:** green

**User**
> Ok mais je dois écrire quoi exactement ? Je veux pas faire un roman ni me justifier pendant vingt lignes.

**Sophia**
> Oui — écris juste 3 à 5 lignes simples dans Dashboard > Plan > Ajuster mon plan :
> - ce qui n’a pas tenu cette semaine
> - pourquoi ça a dérapé
> - ce qui est devenu trop lourd ou irréaliste
> - le rythme que tu peux tenir maintenant
>
> Exemple : “Cette semaine, j’ai perdu le rythme et je suis en retard sur plusieurs actions. Mon agenda et mon énergie n’ont pas tenu. Le plan est trop chargé pour le moment. J’ai besoin d’un rythme plus simple et tenable.”

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `active_plan_realignment`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: []
- durable_effect: none
- skill_run: `selected_skill_id=plan_realignment`, `status=continue`

### Tour 4

**Verdict du tour:** green

**User**
> Et je le trouve où ce cadre Ajuster mon plan ? Je suis un peu perdu dans Sophia.

**Sophia**
> Ouvre Sophia, puis va dans Dashboard > Plan > Ajuster mon plan.
>
> Tu peux y écrire simplement, par exemple :
> - j’ai perdu le rythme cette semaine
> - je suis en retard sur plusieurs actions
> - mon contexte a changé / j’ai eu moins de temps
> - j’ai besoin d’un rythme plus tenable
> - je veux garder surtout les priorités importantes
>
> Pas besoin d’un long texte.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `active_plan_realignment`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: []
- durable_effect: none
- skill_run: `selected_skill_id=plan_realignment`, `status=continue`

### Tour 5

**Verdict du tour:** green

**User**
> Ok fais-moi juste une version courte que je peux mettre dans ce cadre, sans que tu changes le plan ici.

**Sophia**
> Va dans Dashboard > Plan > Ajuster mon plan, puis colle simplement ça :
>
> « Cette semaine, j’ai perdu le rythme et je suis en retard sur plusieurs actions. Mon contexte a changé et le plan est trop lourd pour le moment. J’ai besoin d’un rythme plus tenable et de prioriser l’essentiel. »
>
> Si tu veux, je peux aussi te faire une version encore plus courte.

**Trace courte**
- http_status: 200
- response_owner: `plan_realignment`
- selected_handler: `plan_realignment`
- route_reason: `active_plan_realignment`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `memory_mode=none`
- executed_tools: []
- durable_effect: none
- skill_run: `selected_skill_id=plan_realignment`, `status=continue`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia repond au besoin humain sans culpabiliser: elle normalise le decrochage et reduit la pression.
- Le chemin produit est clair et repete sans lourdeur: `Dashboard > Plan > Ajuster mon plan`.
- Le visible aide vraiment le user a savoir quoi ecrire dans le cadre, avec des exemples courts et actionnables.
- A aucun moment Sophia ne pretend supprimer, decaler, diminuer, reprioriser ou appliquer elle-meme le plan.

**Problemes**
- Aucun probleme bloquant observe sur ce run.

**Fix propose**
- Aucun fix requis pour le flow `plan_realignment` teste ici.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1 entre correctement via `plan_realignment_signal`.
- T2-T5 restent sous `response_owner=plan_realignment` avec `route_reason=active_plan_realignment`.
- La question produit T4 reste owned par le flow actif et ne saute pas vers `product_help`.

**Skills / Operations / Tools**
- Skill actif: `plan_realignment`.
- Aucun tool appele.
- Aucun effet durable, aucune operation, aucune confirmation pending.

**Memory / Effets durables**
- `memory_mode=none` sur tout le run, coherent avec un guidage court.
- `effect_ledger.committed=0` a chaque tour.
- Export DB: `chat_messages=10`, `system_error_logs=0`, `conversation_eval_events=0`.
- Connexion temporaire nettoyee apres export.

**Problemes**
- Aucun probleme systeme observe sur ce run.

**Fix propose**
- Aucun fix requis.

## Verdict Global

- Verdict: green
- Raison principale: le flow `plan_realignment` utilise maintenant le bon parcours produit, garde l'ownership actif, refuse l'execution depuis le chat et aide le user a remplir `Ajuster mon plan`.
- Follow-up prioritaire: aucun pour ce fix. Le bug separe du run precedent sur `coaching_recommendation` (`plan_action` avec `plan_item_id=null`) reste hors scope de ce rerun.
