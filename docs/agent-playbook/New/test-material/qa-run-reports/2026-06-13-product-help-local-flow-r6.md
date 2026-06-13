# QA Run Report - Product Help local flow r6

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `product-help-local-flow-20260613-r6`
- Persona: connexion temporaire locale `qa-normal-product-help-local-flow-20260613-r6-1781310400182@example.com`, auth verifiee `200`
- Objectif: verifier en IA reelle que Product Help oriente correctement une question "action du Plan trop vague" vers `adjust_plan_item`, sans Carte d'attaque, sans execution durable, et avec reprise locale correcte.
- Trajectoire: question produit informative -> demande d'ajustement -> revision de la proposition -> question frontiere DB/effect -> question produit comparative depuis le flow actif.
- Surfaces visees: `/functions/v1/test-send-message`, `force_full_ai=true`, dispatcher global, `product_help.local_dispatcher`, bridge Product Help -> `adjust_plan_item`, `adjust_plan_item.local_dispatcher`, visible agents, raw LLM traces, effect boundary.
- Cadre IA reel: Supabase local, endpoint local, hors sandbox, `force_full_ai=true`, `disable_debounce=true`, pas de staging, pas de renderer deterministe, pas de fallback `processMessage`.
- Validite QA: valide. Les 5 tours ont ete choisis tour par tour apres lecture de la reponse precedente et des traces courtes.

Artefacts:

- State/transcript brut: `tmp/qa-normal-conversation/product-help-local-flow-20260613-r6/state.json`
- Dump observabilite: `tmp/qa-normal-conversation/product-help-local-flow-20260613-r6/db-observability.json`
- Cleanup: effectue apres collecte des traces. `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` et `auth.users` nettoyes/supprimes. `user_memories` a retourne `404` car table absente localement.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis un peu perdue dans Sophia : si une action de mon Plan est trop vague, comment je la rends plus concrete sans creer une carte d'attaque ni toucher au reste du Plan ? Explique-moi juste le principe.

**Sophia**
> Pour rendre une action plus concrète sans créer de carte d'attaque, tu peux utiliser l'outil **Ajuster le plan** dans ton Dashboard. Il te suffit d'expliquer que l'étape actuelle est trop floue ; je pourrai alors analyser ton besoin et te proposer une modification directe de ton plan pour qu'il soit plus précis et actionnable.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: aucune
- pending_confirmation: aucune
- memory_plan: route sans memoire
- executed_tools: `[]`
- durable_effect: aucun

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-02` - Extraction trop large ou polluee

**User**
> Ok. Alors aide-moi maintenant a ajuster l'action 'Ranger mes papiers administratifs' : elle est trop vague, je veux une version plus concrete pour demain matin, sans ajouter de nouvelle action.

**Sophia**
> Comme ton action 'Ranger mes papiers administratifs' te semble un peu trop floue, l'idée est de la remplacer par une version plus concrète pour demain matin. Pour effectuer cette modification, rends-toi dans ton Plan : juste sous le niveau actif, tu trouveras l'option 'Ajuster mon plan'. Tu n'auras qu'à y saisir : Remplacer 'Ranger mes papiers administratifs' par une version concrète (ex: Trier les factures du mois) prévue pour demain matin.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `product_help_handoff_to_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: `adjust_plan_item`
- pending_confirmation: aucune
- memory_plan: route sans memoire
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le bridge est correct, mais la reponse visible ajoute l'exemple concret "Trier les factures du mois" sans preuve utilisateur.
- Source amont probable: `adjust_plan_item` local dispatcher / visible context apres handoff sparse. Le flow transforme une demande encore incomplete en handoff avec exemple invente au lieu de demander une precision ou de rester generique.
- Owner runtime: `adjust_plan_item`.
- Meilleure correction selon les guidelines: renforcer le contrat local `adjust_plan_item` pour que les propositions post-handoff ne remplissent pas les details concrets absents. Si la demande est trop vague, demander le contenu concret; sinon proposer une formulation sans exemple invente.
- Pourquoi ce n'est pas un patch local Product Help: Product Help a correctement produit le handoff et la `note_information`; l'invention apparait dans la reponse owned par `adjust_plan_item`.

### Tour 3

**Verdict du tour:** green

**User**
> Non, evite l'exemple des factures du mois. Je veux plutot : mettre tous les papiers dans une seule pile, separer urgent / a classer / a jeter, et m'arreter apres 15 minutes.

**Sophia**
> C'est noté, on affine pour que ce soit moins vague. Voici la formulation à reprendre pour remplacer "Ranger mes papiers administratifs" : "Mettre tous les papiers en une pile, trier (urgent/classer/jeter) pendant 15 min max", prévu pour demain matin. Tu peux saisir cette consigne dans "Ajuster mon plan", que tu trouveras sur la plateforme dans ton Plan, juste sous le niveau actif.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: `adjust_plan_item`
- pending_confirmation: aucune
- memory_plan: route sans memoire
- executed_tools: `[]`
- durable_effect: aucun

### Tour 4

**Verdict du tour:** green

**User**
> Donc la, est-ce que tu as deja modifie mon Plan, ou je dois encore aller le faire moi-meme dans Ajuster mon plan ?

**Sophia**
> Non, je ne modifie pas ton plan directement. Pour que ton action 'Ranger mes papiers administratifs' soit plus efficace, je te suggère de la remplacer par une consigne plus précise : mettre tous tes papiers en une seule pile et trier (urgent, à classer ou à jeter) pendant 15 minutes maximum demain matin. Pour enregistrer ce changement, rends-toi dans ton Plan et utilise l'option 'Ajuster mon plan' située juste sous le niveau actif.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: `adjust_plan_item`
- pending_confirmation: aucune
- memory_plan: route sans memoire
- executed_tools: `[]`
- durable_effect: aucun

### Tour 5

**Verdict du tour:** green

**User**
> Ok, et pendant qu'on y est, c'est quoi la difference entre ajuster mon plan et preparer une carte de defense ? Je veux juste comprendre, pas lancer une carte.

**Sophia**
> C'est simple : l'ajustement modifie la structure de ton plan si une action ne te convient plus (trop lourde ou mal placée). La carte de défense, elle, ne change pas le plan, mais te prépare un « Plan B » pour ne pas dévier face à un piège précis au moment d'agir. On reprend pour l'ajustement de « Ranger mes papiers » ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_adjust_plan_item_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: Product Help inline via active `adjust_plan_item`
- pending_confirmation: aucune
- memory_plan: route sans memoire
- executed_tools: `[]`
- durable_effect: aucun

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1 repond bien au besoin produit et ne propose pas Carte d'attaque.
- T2 fait le bon bridge Product Help -> `adjust_plan_item`.
- T3 accepte la correction utilisateur sans friction et conserve les contraintes utiles.
- T4 repond clairement que le Plan n'a pas ete modifie depuis le chat.
- T5 explique la difference ajustement / carte de defense sans lancer de carte, puis propose de reprendre le flow actif.

**Problemes**
- Tour 2: Sophia invente "Trier les factures du mois" alors que le user n'a donne aucun type de papier. Famille: `BF-INTAKE-02`. Impact: leger risque de perte de confiance; le user doit corriger une supposition inutile. Severite: yellow.

**Fix propose**
- Source amont: `adjust_plan_item.local_dispatcher` ou `adjust_plan_item.visible.plan_handoff_ready`.
- Correction recommandee: lorsque le handoff Product Help fournit seulement une action vague et un timing, le flow doit soit demander la precision concrete manquante, soit formuler une proposition generique sans exemple invente.
- Tests d'invariant attendus: une demande "rendre X plus concret" sans details ne doit pas ajouter de contenu specifique absent du message ou de la DB.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1: `response_owner=product_help`, `selected_handler=product_help`, pas de tool.
- T2: `product_help_handoff_to_local_dispatcher` vers `adjust_plan_item` avec `note_information` presente.
- T3-T5: `active_adjust_plan_item_local_dispatcher`; le `global_dispatcher` est bloque pendant le flow actif.
- T5: la question produit comparative est traitee inline sans lancer `prepare_defense_card`.

**Skills / Operations / Tools**
- Product Help ne repond pas par renderer deterministe et ne cree aucun effet.
- `adjust_plan_item` reste en `platform_handoff` pour les tours de preparation/revision/frontiere d'effet.
- Aucun executor n'est appele directement.

**Memory / Effets durables**
- `executed_tools=[]` sur les 5 tours.
- `direct_effects_to_run=[]` sur les 5 tours.
- Aucun effet durable observe.
- Observabilite DB: `llm_raw_response_events` par request id QA = `36`, `llm_usage_events` = `9`, `chat_messages` avant cleanup = `10`.
- Les raw Product Help locaux sont retrouves dans l'observabilite par request ids internes UUID, notamment pour T1 et T5; le dump temporel contient aussi des runs concurrents et ne doit pas etre utilise seul pour juger ce run.

**Problemes**
- Aucun probleme systeme bloquant. Le warning T2 est conversationnel/contractuel dans la proposition visible, pas un mauvais owner ni un effet durable.

**Fix propose**
- Source amont: `adjust_plan_item` local contract visible.
- Correction recommandee: interdire les exemples specifiques non fournis dans le `conversation_context`; preferer clarification ou formulation neutre.
- Tests d'invariant attendus: Product Help -> Adjust Plan conserve `global_dispatcher` bloque pendant flow actif, `note_information` presente, aucun `executed_tools`, aucun exemple concret invente.

## Verdict Global

**yellow**

Le flow fonctionne nettement mieux cote systeme: Product Help route vers `adjust_plan_item`, pas vers Carte d'attaque, le global ne reprend pas pendant le flow actif, aucun effet durable n'est claim ou execute. Le seul point jaune est conversationnel: T2 invente un exemple concret non fourni. Le correctif doit se faire dans `adjust_plan_item`, pas dans Product Help.
