# QA Run — Product Help Normal R2

## 1. Contexte Du Test

- **Date:** 2026-06-24
- **Run:** `product_help_normal_20260624_r2`
- **Persona:** `qa-skill`, connexion temporaire `product_help_normal_product_help_normal_20260624_r2`
- **Objectif:** verifier un deuxieme run product_help normal, sans create one-shot reminder, sans creation/modification, avec focus sur Ressources, cartes libres vs cartes liees au Plan, potions et frontiere produit/coaching.
- **Trajectoire:** Ressources -> carte libre vs carte liee au Plan -> potions -> regle produit vs coaching -> resume de consultation -> cloture naturelle.
- **Surfaces visees:** global dispatcher, product_help local skill, active flow arbitration, visible product help, direct effects, DB durable.
- **Cadre IA reel:** Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, messages choisis tour par tour apres lecture des reponses et traces. Pas de staging, pas de fallback deterministe.
- **Validite QA:** valide. Cleanup cible de la connexion temporaire effectue en fin de run.
- **Artefacts:** `tests/real-personas/qa-skill/runs/product_help/product_help_normal_20260624_r2.raw.json`, `...summary.json`, `...trace-summary.json`, `...db-check.json`, `...db-check-after-close.json`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis un peu perdu dans Sophia : à quoi sert l'onglet Ressources exactement ? Je veux juste comprendre, sans lancer d'action.

**Sophia**
> L’onglet Ressources sert à regrouper les appuis utiles autour de ton plan : cartes de défense, cartes d’attaque, potions et ressources liées aux missions ou habitudes. L’idée, c’est de retrouver plus vite ce qui t’aide sans le laisser dispersé dans le chat.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- skill_status: `continue`
- safety: null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Une carte libre et une carte liée à une action du Plan, c'est la même chose ou il y a une différence ?

**Sophia**
> Non, ce n’est pas la même chose.
>
> Une carte libre vit dans Ressources, indépendamment d’une action précise. Une carte liée au Plan est rattachée à une mission ou une habitude, donc elle sert un contexte concret.
>
> En bref : libre = générique, liée au Plan = contextualisée.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `active_product_help`
- active_flow_arbitration: `continue_active`
- skill_status: `complete`
- safety: null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Et les potions, je les trouve aussi dans Ressources ? Elles servent à quoi par rapport aux cartes ?

**Sophia**
> Oui, les potions sont aussi dans **Ressources**.
>
> La différence, c’est surtout le rôle :
> - **Cartes d’attaque / de défense** : elles aident pour une action concrète ou un risque précis.
> - **Potions** : elles servent quand ton état intérieur prend trop de place, par exemple peur, décrochage, manque de clarté ou stress.
>
> En bref : cartes = l’action ; potions = l’état.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- skill_status: `complete`
- safety: null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Si je demande juste la règle générale pour savoir quand utiliser une carte d'attaque, une défense ou une potion, tu restes en explication produit ou tu passes en coaching ?

**Sophia**
> Ici, je reste en explication produit tant que tu parles des cartes et des potions. Dès que tu me demandes comment t’y prendre pour ton cas précis, je bascule dans du coaching.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- skill_status: `complete`
- safety: null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none

### Tour 5

**Verdict du tour:** green

**User**
> Ok, résume-moi juste où consulter ces éléments, sans me proposer d'en créer.

**Sophia**
> Oui : tu consultes ça dans **Dashboard > Ressources**. C’est là que tu retrouves les cartes, les potions et les ressources liées au Plan quand elles existent. Le **Dashboard > Plan** sert surtout à voir le lien avec une mission ou une habitude, pas à modifier le Plan.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- skill_status: `continue`
- safety: null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none

**Observation**
- Apres T5, la DB contenait un `__active_skill_state` product_help ouvert. Le tour de cloture T6 l'a ferme proprement. Pas de fuite durable apres cloture.

### Tour 6

**Verdict du tour:** green

**User**
> Merci, c'est bon pour moi.

**Sophia**
> Bien noté, je te laisse là-dessus.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `active_product_help`
- active_flow_arbitration: `continue_active`
- skill_status: `complete`
- safety: null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Les reponses sont naturelles, courtes et centrees sur le produit.
- Sophia respecte les contraintes "sans lancer d'action" et "sans proposer d'en creer".
- La frontiere product_help / coaching est bien formulee au T4.
- Le tour de cloture est sobre et ne relance pas inutilement.

**Problemes**
- Aucun probleme conversationnel bloquant observe. T5 contient une formulation un peu generale sur `Dashboard > Plan`, mais reste acceptable dans le contexte "où consulter".

**Fix propose**
- Aucun fix requis sur la fluidite pour ce run.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Les 6 tours routent vers `response_owner=product_help` et `selected_handler=product_help`.
- T2 et T6 montrent que l'active flow product_help peut reprendre localement quand c'est pertinent.
- T3/T4/T5 repassent par `product_help_signal`, ce qui reste coherent pour des questions produit autonomes.

**Skills / Operations / Tools**
- Aucun tool appele.
- Aucun direct effect detecte.
- Aucun pending confirmation.
- Aucun create one-shot reminder.

**Memory / Effets durables**
- DB check apres T5 : aucun effet durable ; `product_help` actif temporairement.
- DB check apres T6 :
  - `user_attack_cards`: 0
  - `user_defense_cards`: 0
  - `user_support_cards`: 0
  - `user_recurring_reminders`: 0
  - `scheduled_checkins`: 0
  - `user_chat_states.temp_memory`: `{}`
- Cleanup de la connexion temporaire effectue.

**Problemes**
- Aucun probleme systeme bloquant observe. Observation non bloquante : T5 laisse un active state product_help jusqu'au merci de cloture ; T6 le ferme correctement.

**Fix propose**
- Aucun fix requis. A surveiller dans un futur run : si un sujet non-product arrive apres un T5 similaire, verifier que l'active product_help n'avale pas la nouvelle intention.

## Verdict Global

**GREEN.** Product help fonctionne correctement sur ce deuxieme run normal : bon owner, frontiere produit/coaching propre, aucun reminder, aucun effet durable, DB nettoyee apres cloture.

