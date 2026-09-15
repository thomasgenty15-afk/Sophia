# QA Run Report — Bridge Repairs Vers Potions R1

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `bridge-potions-repair-r1`
- Persona: `qa-skill`, 4 users QA temporaires créés par le runner local puis nettoyés.
- Objectif: tester en IA réelle les chemins conversationnels vers potions sans mentionner explicitement une potion au départ.
- Trajectoire: `demotivation_repair -> courage`, `demotivation_repair -> clarte`, `emotional_repair -> guerison`, `emotional_repair -> amour`.
- Surfaces visées: dispatcher, orientation clarification, `demotivation_repair`, `emotional_repair`, operation suggestions, `select_state_potion`.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer déterministe.
- Validité QA: valide. Les tours ont été pilotés après lecture des réponses Sophia. Aucun restart Supabase, aucun reset DB, cleanup ciblé par `user_id`.

## 2. Tours De Conversation

### Run A — Demotivation Vers Courage

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 — mauvais owner sélectionné

**User**
> Je décroche complètement de mon plan. En vrai je crois que je n'ose pas envoyer le message important parce que j'ai peur d'être jugé, donc je reporte et je me sens nul.

**Sophia**
> Est-ce que tu veux qu'on s'occupe de ce que tu ressens par rapport au jugement, ou qu'on trouve un moyen concret de débloquer l'envoi de ce message ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- skill_entry_ids: `emotional_repair`, `execution_breakdown`
- tool_skill_intents: []
- opportunity: `none`
- executed_tools: []

**Analyse**
- Symptôme: le décrochage motivationnel par peur/évitement n'expose pas `demotivation_repair` comme option de clarification.
- Source amont probable: dispatcher/arbitrage des signaux conversationnels.
- Owner runtime: dispatcher + orientation clarification.
- Meilleure correction: faire apparaître `demotivation_repair` dans les candidats quand le user parle de décrochage/élan avec peur ou évitement, sans router par regex locale.

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 — mauvais owner sélectionné

**User**
> Plutôt le décrochage derrière tout ça. Je ne veux pas découper l'envoi maintenant ; je veux comprendre comment retrouver l'élan alors que la peur du regard me fait éviter.

**Sophia**
> Ah oui… donc c’est pas “tu bloques”, c’est ton cerveau qui t’épargne une souffrance possible...

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- skill_entry_ids: `demotivation_repair`
- selected_skill_id: `emotional_repair`
- opportunity: `none`

**Analyse**
- Symptôme: le signal `demotivation_repair` est présent, mais le handler effectif reste `emotional_repair`.
- Source amont probable: résolution de clarification vers le mauvais conversation skill.
- Owner runtime: orientation clarification / active skill arbitration.
- Meilleure correction: quand la clarification résout vers démotivation, `selected_skill_id` doit suivre le candidat résolu.

#### Tours 3-4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 — mauvais owner sélectionné

**User T3**
> C'est surtout la peur de paraître faible ou ridicule. Là je sens que ça devient clair : j'ai besoin d'un appui durable pour traverser cette peur, pas d'un découpage de l'action.

**Sophia T3**
> Ok, c’est hyper clair là. Donc ce qui te manque, c’est un appui durable contre la peur...

**User T4**
> B, l'ancrage mental. Et comme le besoin durable est clair maintenant, est-ce que tu as un support dans Sophia à me proposer pour soutenir ce courage dans les prochains jours ?

**Sophia T4**
> Est-ce que tu veux qu'on ajoute cet ancrage à ton plan pour les prochains jours, ou tu préfères qu'on continue à apaiser ton émotion ? 🙂

**Trace courte**
- T3 selected_handler: `emotional_repair`
- T4 selected_handler: `orientation_clarification`
- tool_skill_intents: []
- opportunity: `none`
- no `select_state_potion`

**Analyse**
- Symptôme: aucun bridge `courage`; Sophia repart vers plan vs émotion.
- Source amont probable: le bridge `demotivation_repair -> select_state_potion(courage)` n'est pas exercé car l'owner conversationnel est déjà faux.
- Owner runtime: orientation clarification puis `demotivation_repair`.

### Run B — Demotivation Vers Clarté

#### Tour 1

**Verdict du tour:** green

**User**
> Je continue mes actions mais je ne sais plus pourquoi je les fais. Le plan tourne mécaniquement et je ne vois plus le lien avec ce qui compte pour moi.

**Sophia**
> Je comprends que tes actions tournent à vide et que tu ne vois plus ce qui les relie à ce qui est important pour toi. Y a-t-il un domaine particulier où ce sentiment est le plus fort ? 🙂

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- skill_entry_ids: `demotivation_repair`
- opportunity: `none`
- executed_tools: []

#### Tours 2-4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-01 — slot fourni mais redemandé

**User T2**
> C'est surtout sur mon plan santé. Au départ je voulais retrouver de l'énergie et de la présence, mais maintenant je coche des actions sans sentir ce cap.

**Sophia T2**
> Est-ce que tu veux qu'on redonne du sens à ton objectif santé ou est-ce qu'on modifie tes actions ? 🙂

**User T3**
> Redonner du sens, pas modifier les actions tout de suite. Je veux retrouver le fil : santé voulait dire présence, énergie, et respect de moi, pas juste cocher des cases.

**Sophia T3**
> Je comprends que tes actions tournent à vide... Y a-t-il un domaine particulier où ce sentiment est le plus fort ? 🙂

**User T4**
> Le domaine, c'est santé, comme je disais : présence, énergie et respect de moi. Maintenant que le fil est posé, est-ce que tu as un support dans Sophia à me proposer pour garder cette clarté ?

**Sophia T4**
> Veux-tu continuer à explorer ce qui donne du sens à ta santé ou préfères-tu qu'on voie comment adapter ton plan pour y afficher ces priorités ? 🙂

**Trace courte**
- T2/T4 response_owner: `orientation_clarification`
- T3 selected_handler: `demotivation_repair`
- operation_suggestions: []
- `allow_potion_suggestion=false` dans les traces de décision
- no `select_state_potion`

**Analyse**
- Symptôme: le domaine et le choix "redonner du sens" sont fournis mais redemandés/reclarifiés.
- Source amont probable: state/clarification recovery de `demotivation_repair`; l'intake ne réutilise pas les réponses de clarification.
- Owner runtime: `demotivation_repair` intake + orientation clarification state.
- Meilleure correction: persister et réinjecter les slots clarifiés avant de produire la suggestion de support durable.

### Run C — Emotional Repair Vers Guérison

#### Tours 1-3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 — mauvais owner/opportunity voisin

**User T1**
> J'ai craqué hier soir et j'ai honte. Là je me traite comme si j'avais tout gâché, et j'ai besoin d'abord de redescendre sans me juger.

**Sophia T1**
> Ah merde… Ça va, respire. La honte te donne l’impression que “tu as tout gâché”, mais ce n’est pas un verdict sur ta valeur...

**Trace courte**
- selected_handler: `emotional_repair`
- opportunity: `defense_card`
- opportunity_operation: `prepare_defense_card`
- executed_tools: []

**User T2-T3**
> A, phrase courte pour maintenant...
> Oui, une version encore plus courte. Je me sens déjà un peu moins happé par la honte.

**Trace courte T2-T3**
- selected_handler: `emotional_repair`
- opportunity: `none`

**Analyse**
- Ce qui marche: soutien émotionnel d'abord, pas de potion immédiate.
- Warning: T1 expose une opportunity `defense_card` pendant un état de honte/réparation, ce qui reste un croisement avec la logique repair.

#### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-06 — mauvais domaine sémantique

**User**
> B, je la garde comme ça. L'émotion est redescendue ; est-ce que tu as un support dans Sophia à me proposer pour m'aider à réparer cet épisode sans me punir ?

**Sophia**
> Pour “réparer sans te punir”, je te propose un mini-support simple, en 3 lignes à faire maintenant...

**Trace courte**
- selected_handler: `emotional_repair`
- route_reason: `active_flow_defers_tool_skill_opportunity`
- opportunity: `defense_card`
- operation_suggestions: []
- trace: `invalid_allow_potion_suggestion` présent dans la décision normalisée
- no `select_state_potion`

**Analyse**
- Symptôme: le besoin stabilisé "réparer cet épisode sans me punir" ne devient pas `guerison`; il devient mini-support conversationnel et opportunity défense.
- Source amont probable: contrat/intake `emotional_repair` ne sort pas un `operation_suggestions.select_state_potion` valide, et le dispatcher garde une opportunity défense concurrente.
- Owner runtime: `emotional_repair` intake/contract + dispatcher opportunity policy.
- Meilleure correction: renforcer la décision structurée post-stabilisation et tester que le payload `guerison` sort avec `handoff_summary`.

### Run D — Emotional Repair Vers Amour

#### Tours 1-3

**Verdict du tour:** green

**User**
> Je suis très dur avec moi depuis ce matin...

**Sophia**
> ...on va faire simple et concret, pour casser la boucle dès maintenant...

**Trace courte**
- selected_handler: `emotional_repair`
- opportunity: `none`
- no mutation

#### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-03 — product/status/tool mal priorisés

**User**
> Un peu. La chaleur revient, et j'aimerais garder ça plus qu'une minute. Est-ce que tu as un support dans Sophia à me proposer pour soutenir cette douceur envers moi ?

**Sophia**
> Clarifications: Les clarifications sont des elements guides du plan pour comprendre une situation...

**Trace courte**
- selected_handler: `product_help`
- route_reason: `skill_handoff_requested`
- skill_entry_ids: `product_help`
- opportunity: `none`
- no `select_state_potion`

**Analyse**
- Symptôme: "support dans Sophia pour soutenir cette douceur" est traité comme aide produit générique sur les clarifications, pas comme bridge émotionnel vers `amour`.
- Source amont probable: arbitration product_help vs active emotional repair; le contexte actif et le besoin durable ne sont pas conservés comme owner.
- Owner runtime: active skill arbitration + `emotional_repair` suggestion policy.

## 3. Analyse De Fluidité Humaine

**Verdict: red**

**Ce qui marche**
- Les potions ne sont plus proposées immédiatement en opportunity implicite depuis les états initiaux.
- Les premiers tours émotionnels répondent d'abord au besoin de réparation/stabilisation.
- Aucun effet durable n'est exécuté.

**Problèmes**
- Courage: le user choisit le décrochage motivationnel, mais Sophia reste côté émotion et finit par reclarifier plan vs émotion. Famille: BF-ROUTE-01.
- Clarté: Sophia redemande des slots déjà fournis et n'utilise pas le cap clarifié. Famille: BF-INTAKE-01.
- Guérison: le besoin stabilisé de réparation n'ouvre pas le bridge guérison et expose une carte défense. Famille: BF-INTAKE-06 / BF-ROUTE-01.
- Amour: le bridge attendu part en product_help "Clarifications". Famille: BF-ROUTE-03.

**Fix proposé**
- Source amont: owners conversationnels et operation suggestions, pas `select_state_potion` directement.
- Correction recommandée: faire sortir les suggestions potion depuis `demotivation_repair` et `emotional_repair` quand le besoin durable est clarifié, avec `operation_input_hint.context.handoff_summary`.
- Tests d'invariant attendus: positif, paraphrase et anti-faux-positif pour chaque bridge; run IA réel post-fix.

## 4. Analyse Système

**Verdict: red**

**Routage**
- Le blocage des `state_potion` implicites fonctionne: toutes les opportunities `state_potion` restent `none` sans demande explicite de potion.
- Les bridges structurés ne sont pas atteints en run réel.
- `product_help` capture un besoin émotionnel durable dans le run amour.

**Skills / Operations / Tools**
- `demotivation_repair` fonctionne au premier tour clarté, mais ne conserve pas les réponses de clarification.
- `emotional_repair` stabilise correctement, mais ne produit pas de suggestion potion valide.
- `operation_suggestions` reste vide dans les quatre chemins.
- `select_state_potion` n'est jamais lancé.

**Effets**
- `executed_tools=[]` sur tous les tours.
- Aucun effet durable indésirable observé.
- Cleanup ciblé exécuté: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` et `auth.users` supprimés pour les 4 users du runner. `user_memories` retourne 404 car table absente localement.

## Verdict Global

Red. Les tests contractuels/unitaires protègent la nouvelle architecture, mais le run IA réel ne valide pas les bridges repair -> potion. Le prochain fix doit rester chez les owners amont: orientation clarification, active skill arbitration, `demotivation_repair` intake et `emotional_repair` intake/contract.
