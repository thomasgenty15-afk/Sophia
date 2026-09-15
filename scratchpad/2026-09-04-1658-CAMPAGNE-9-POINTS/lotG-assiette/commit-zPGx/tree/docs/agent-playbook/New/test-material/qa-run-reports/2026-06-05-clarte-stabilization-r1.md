# QA Run Report — Clarte Stabilization R1

## 1. Contexte Du Test

- Date: 2026-06-05
- Run: `2026-06-05-clarte-stabilization-1780664806311`
- Persona: user QA temporaire local cree via Auth admin local, scope `qa-clarte-stabilization-*`.
- Objectif: mesurer le nombre de tours necessaires pour stabiliser la Potion de clarté apres demande explicite ou entree via `select_state_potion`.
- Trajectoire: trois mini-runs reels, avec demande explicite claire, demande explicite vague puis claire, et demande de potion non precisee avec besoin de sens/pourquoi profond.
- Surfaces visees: global dispatcher, `select_state_potion`, router potion general, sous-flow clarté, handoff plateforme, no-chat-mutation, EffectLedger.
- Cadre IA reel: Supabase local, endpoint `http://127.0.0.1:54321/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe comme oracle, pas de staging/remote.
- Validite QA: valide. Tous les tours sont HTTP 200, avec traces runtime completes dans le raw JSON.

## 2. Tours De Conversation

### Tour 1 — Demande explicite clarté + reponse claire

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-01` — Slot fourni mais redemande

**User**
> Je veux faire une potion de clarté. Je fais les actions du plan, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui.

**Sophia**
> Quand tu regardes ton plan, qu’est-ce qui te donne le plus l’impression que ça ne rejoint plus ton pourquoi ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: `null`
- memory_plan: present, non utilise pour router
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_status: `clarifying`
- tool_reason_code: `clarte_field_missing`
- no_chat_mutation: `true`
- tool_intent: `potion_type=clarte`, reason identified as `perte de sens sur les actions du plan`
- stabilized_at_turn: `null`

**Analyse si yellow/red**
- Symptome: Sophia redemande le champ alors que le user a deja donne une formulation suffisante pour `plan_meaning_loss_reason`.
- Source amont probable: sous-flow clarté / dispatcher local. L'intent d'entree contient deja `reason.status=identified`, mais la transition initiale reste sur `clarte_field_missing`.
- Owner runtime: `select_state_potion` clarté subflow, reducer/intake bridge entre `tool_skill_intents` et `clarte_state`.
- Meilleure correction selon les guidelines: ne pas court-circuiter l'etat initial `missing` quand le message courant contient une reponse exploitable; laisser le dispatcher local IA analyser le message ou hydrater `locked_value` depuis l'intent structure.
- Pourquoi ce n'est pas un patch local: le probleme est une transition d'etat/slot fournie mais perdue, pas une phrase visible a corriger.

### Tour 2 — Demande explicite clarté vague

**Verdict du tour:** green

**User**
> Je veux faire une potion de clarté, mais là je suis en vrac et tout est flou.

**Sophia**
> Quand tu regardes ton plan, qu’est-ce qui te donne le plus l’impression que ça ne rejoint plus ton pourquoi ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: `null`
- memory_plan: present, non utilise pour router
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_status: `clarifying`
- tool_reason_code: `clarte_field_missing`
- no_chat_mutation: `true`
- stabilized_at_turn: pas encore stable

### Tour 3 — Clarification claire apres vague

**Verdict du tour:** green

**User**
> Ce qui s'est déconnecté, c'est que je fais les actions du plan, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui.

**Sophia**
> Oui, là ça ressemble bien à une Potion de clarté : le point n’est pas de savoir quoi faire, mais de retrouver pourquoi ces actions comptent.
>
> Dans la plateforme, va dans section État / Potions et choisis Potion de clarté.
>
> Pour la question :
> Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?
> Je fais les actions du plan, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui. 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_turn_unclear`
- safety: `low`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: `null`
- memory_plan: present, non utilise pour router
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_status: `handoff_delivered`
- tool_reason_code: `clarte_handoff_delivered`
- no_chat_mutation: `true`
- potion_type: `clarte`
- field_value: `Je fais les actions du plan, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui.`
- stabilized_at_turn: `2` pour ce scenario

### Tour 4 — Potion non precisee avec besoin sens/pourquoi profond

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-04` — Ambiguite non reconnue / clarification produit trop large

**User**
> Je veux une potion mais je ne sais pas laquelle. Je fais les actions, mais je ne comprends plus pourquoi elles comptent.

**Sophia**
> Entre la Potion de clarté et la Potion anti-décrochage, laquelle te parle le plus ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: `null`
- memory_plan: present, non utilise pour router
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_status: `clarifying`
- tool_reason_code: `state_potion_handoff_clarifying`
- no_chat_mutation: `true`
- tool_intent: `operation_type=select_state_potion`, target hint `potion de clarté ou sens`, input includes `potion_type=clarte`
- stabilized_at_turn: pas encore stable

**Analyse si yellow/red**
- Symptome: le router general reste en clarification entre deux noms produit alors que le message contient deja le signal central de clarté.
- Source amont probable: router potion general / intake confidence. Le besoin "actions mais je ne comprends plus pourquoi elles comptent" est assez proche de clarté, mais le flow conserve une ambiguite clarté vs anti-decrochage.
- Owner runtime: `select_state_potion` general router, avant delegation au sous-flow clarté.
- Meilleure correction selon les guidelines: renforcer le contrat du router general pour selectionner `clarte` quand le besoin porte explicitement sur le sens/pourquoi des actions, tout en gardant une clarification quand le message ne contient que "je veux une potion mais je ne sais pas laquelle".
- Pourquoi ce n'est pas un patch local: le probleme vient du seuil de selection et du contrat de routing, pas du wording de la question.

### Tour 5 — Confirmation sens/pourquoi apres clarification router

**Verdict du tour:** green

**User**
> Oui, c'est surtout le sens du plan : je fais les actions mais je ne sens plus le lien avec mon pourquoi profond.

**Sophia**
> Oui, là ça ressemble bien à une Potion de clarté : le point n’est pas de savoir quoi faire, mais de retrouver pourquoi ces actions comptent.
>
> Dans la plateforme, va dans section État / Potions et choisis Potion de clarté.
>
> Pour la question :
> Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?
> Je fais les actions mais je ne sens plus le lien avec mon pourquoi profond. 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_field_confirmation`
- safety: `none`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: `null`
- memory_plan: present, non utilise pour router
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_status: `handoff_delivered`
- tool_reason_code: `clarte_handoff_delivered`
- no_chat_mutation: `true`
- potion_type: `clarte`
- field_value: `Je fais les actions mais je ne sens plus le lien avec mon pourquoi profond.`
- stabilized_at_turn: `2` pour ce scenario

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les reponses clarté stabilisees sont naturelles et courtes.
- Le handoff final donne le bon nom produit, la bonne destination et le bon champ.
- Aucune reponse ne reprend les blocs legacy fixes "Ce que je comprends", "Je te conseille", "Pourquoi cette potion", "Petit pas immediat".
- Sophia ne pretend pas lancer ou activer la potion depuis le chat.

**Problemes**
- Tour 1: Sophia pose une question supplementaire alors que le user a deja donne la phrase utile. Famille: `BF-INTAKE-01`. Impact: le user doit repeter une information deja fournie. Severite: red pour l'invariant "clear answer locks".
- Tour 4: Sophia demande de choisir entre deux noms produit alors que le besoin "pourquoi les actions comptent" pointe fortement vers clarté. Famille: `BF-INTAKE-04`. Impact: un tour de friction supplementaire. Severite: yellow.
- Tours 3 et 5: la phrase "va dans section État / Potions" est comprehensible mais moins naturelle que "va dans État / Potions". Impact faible.

**Fix propose**
- Source amont: `select_state_potion` clarté subflow et router potion general.
- Correction recommandee: laisser le sous-flow clarté analyser le message initial quand le champ est `missing`, et ajuster le router general pour selectionner clarté sur les signaux explicites de sens/pourquoi profond.
- Tests d'invariant attendus: reponse claire explicite lock en T1; reponse vague reste en clarification; besoin non precise sans signal fort reste au router general; besoin non precise avec signal sens/pourquoi route vers clarté ou pose une question de besoin, pas seulement un choix de noms produit.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le dispatcher global choisit correctement `response_owner=tool_skill` et `selected_handler=select_state_potion` sur les cinq tours.
- Le mode reste `platform_handoff`, avec `no_chat_mutation=true` et `executable_from_chat=false`.
- Le run explicite clarté entre bien dans `select_state_potion`, mais la valeur de champ extraite au T1 n'est pas stabilisee.

**Skills / Operations / Tools**
- `executed_tools=[]` sur tous les tours.
- `direct_effects=[]` sur tous les tours.
- `requested_effects=[]`, `allowed_effects=[]`, `committed_effects=[]`, `blocked_effects=[]` sur tous les tours.
- Les handoffs clarté livres aux tours 3 et 5 contiennent `potion_type=clarte`, `potion_title=Potion de clarté`, le bon `question_id=plan_meaning_loss_reason` et la bonne destination `section État / Potions`.

**Memory / Effets durables**
- Aucun effet durable n'est commis: `EffectLedger.committed=0` sur tous les tours.
- `memory_plan` est present mais ne pilote pas le routing du run.
- Aucun claim d'activation n'est observe.

**Problemes**
- Tour 1: signal utile extrait dans `tool_skill_intents`, mais le tool skill retourne `clarte_field_missing`. Famille: `BF-INTAKE-01`. Impact systeme: le reducer/sous-flow perd une valeur suffisante avant le handoff. Severite: red.
- Tour 4: input du tool intent contient deja `potion_type=clarte`, mais le router reste en clarification entre deux potions. Famille: `BF-INTAKE-04`. Impact systeme: le router general ajoute un tour inutile sur un besoin fortement clarté. Severite: yellow.

**Fix propose**
- Source amont: `supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/clarte_flow.ts` et router general `select_state_potion`.
- Correction recommandee: supprimer ou restreindre le raccourci initial `missing` du sous-flow clarté; ne court-circuiter que les etats deja `locked/proposed` ou les actions structurees actives. Pour le router general, renforcer le contrat qui mappe "actions + pourquoi/sens profond" vers `clarte`.
- Tests d'invariant attendus: unit reducer pour initial message clear; integration real IA "je veux faire une potion de clarté + phrase claire" stabilise en T1; run generic "je veux une potion mais je ne sais pas laquelle" sans signal fort clarifie; run generic avec signal sens/pourquoi stabilise ou selectionne clarté sans choix produit inutile.

## Verdict Global

- Verdict: red
- Raison principale: le scenario explicite avec reponse claire ne stabilise pas en un tour alors que le champ est deja fourni et extrait.
- Follow-up prioritaire: corriger la transition initiale du sous-flow clarté pour ne pas perdre `plan_meaning_loss_reason` quand le message courant est suffisant.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-05-clarte-stabilization-r1-bugs.md`

