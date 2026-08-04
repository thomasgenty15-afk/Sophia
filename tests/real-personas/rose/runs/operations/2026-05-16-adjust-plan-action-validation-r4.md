# QA Run - Rose - Adjust Plan Action Validation r4

## 1. Contexte Du Test

- Date: 2026-05-16
- Run: `qa-rose-2026-05-16-adjust-plan-action-validation-r4`
- Persona: Rose, connexion locale `tests/real-personas/rose/connection.json`
- Objectif: retester le flow routing vers action, ajustement d'une action, puis validation utilisateur apres correction de materialisation.
- Trajectoire: action existante trop lourde -> intake `adjust_plan_item` -> brouillon de validation -> demande d'explication -> revision du brouillon -> confirmation explicite -> verification DB.
- Surfaces visees: endpoint local `test-send-message`, dispatcher/tool skill, `adjust_plan_item`, draft review, confirmation pending, side effect `user_plan_items`.
- Cadre IA reel: Supabase local, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Etat Rose restaure avant run: action cible remise a `6 jours / semaine`, `target_reps=6`, description originale, payload d'ajustement nettoye, `user_chat_states` nettoye, messages QA precedents nettoyes.

Tentatives precedentes:

- `r1`: invalide, `403 Forbidden: user is not marked is_test_persona`; resolution: flag Auth local `is_test_persona=true`.
- `r2`: valide mais red; la frequence annoncee n'etait pas materialisee dans les champs principaux.
- `r3`: run intermediaire apres premier fix; frequence materialisee, mais consigne encore stockee seulement dans le draft/payload. Etat restaure puis `r4`.

Grounding DB avant `r4`:

- Plan actif: `fe37bd40-6721-4de5-bfb0-b8998d8b7b3e`, "Retrouver l'harmonie dans mon couple".
- Action cible: `9dd77821-b33c-45b3-be5c-ae2766549a6c`, `Partager un point positif`, status `active`, cadence `6 jours / semaine`, `target_reps=6`.
- Action preservee attendue: `3f7b6192-4335-4c4b-8f4e-72ac39f7b6f5`, `Convenir d'un signal de pause`.

## 2. Tours De Conversation

### Tour 1

**User**
> Je viens de regarder mon plan, et l'action 'Partager un point positif' me met un peu la pression. Six jours par semaine, dans l'état actuel avec mon copain, ça me paraît trop.

**Sophia**
> Je comprends tout à fait, 6 jours par semaine peut devenir pesant si le climat est tendu. Pour que cet exercice reste un moteur positif sans te mettre la pression, quelle fréquence te semblerait plus juste pour commencer ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: `risk_band=none`
- direct_effects: none
- operation: `ask_question`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: aucun changement DB attendu ni observe

### Tour 2

**User**
> Deux fois par semaine, ça me semble déjà plus respirable. Et je voudrais que ce soit vraiment léger: juste une phrase neutre ou un merci concret, pas un grand compliment.

**Sophia**
> Je vous propose d'ajuster l'habitude « Partager un point positif » pour qu'elle soit plus légère. Rien n'est encore appliqué, j'attends votre validation.
>
> Concrètement, je prévois de passer la fréquence de 6 jours à 2 jours par semaine et de simplifier le contenu : au lieu d'un compliment, vous pourrez simplement partager un merci concret ou une phrase neutre. Cela permet de garder l'intention sans la pression du quotidien. Les autres éléments, comme la mise en place du signal de pause, restent inchangés. Est-ce que cela vous convient ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- safety: `risk_band=none`
- direct_effects: none
- operation: `draft_review`, operation_id `77263da9-327b-4a34-b9e5-4f1a055d19c3`
- pending_confirmation: draft review in temp memory
- executed_tools: `[]`
- durable_effect: aucun changement DB avant validation

### Tour 3

**User**
> Avant de valider, tu peux me redire exactement ce qui changerait et ce qui ne bougerait pas ?

**Sophia**
> Je n'ai encore rien appliqué. Le brouillon actuel prévoit:
>
> 1. Partager un point positif: avant, 6 jours / semaine, gratitude ou compliment; maintenant, 2 jours / semaine, une phrase neutre ou un merci concret. Pourquoi: La fréquence initiale était jugée excessive et le contenu trop lourd, créant un blocage. Ce qui ne change pas: Convenir d'un signal de pause.
>
> Si ça te va, dis-moi clairement de l'appliquer. Sinon, dis-moi ce que tu veux modifier dans ce brouillon.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: `risk_band=none`
- direct_effects: none
- operation: `draft_review_details`, operation_id `77263da9-327b-4a34-b9e5-4f1a055d19c3`
- pending_confirmation: conserve
- executed_tools: `[]`
- durable_effect: aucun changement DB avant validation

### Tour 4

**User**
> Je préfère finalement 3 fois par semaine, mais avec la même règle: une phrase simple, sans chercher à faire joli. Tu peux ajuster le brouillon comme ça ?

**Sophia**
> Je te propose d'ajuster l'habitude 'Partager un point positif' pour qu'elle soit plus légère et moins stressante. Rien n'est encore appliqué pour le moment. Je prévois de passer la fréquence à 3 fois par semaine (au lieu de 6) et de simplifier la consigne : 'une phrase simple, sans chercher à faire joli'. L'objectif est de garder l'intention sans la pression. Les autres actions, comme la mise en place du signal de pause, restent inchangées. Est-ce que ce changement te convient ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: `risk_band=none`
- direct_effects: none
- operation: `draft_review_updated`, new operation_id `a3262339-0648-40f6-953d-362dba77ca67`
- pending_confirmation: brouillon remplace, ancien operation_id supersede
- executed_tools: `[]`
- durable_effect: aucun changement DB avant validation

### Tour 5

**User**
> Donc ça ne touche pas au signal de pause, et ça remplace bien seulement l'habitude du point positif ? Je ne veux pas refaire tout le niveau.

**Sophia**
> Je n'ai encore rien appliqué. Le brouillon actuel prévoit:
>
> 1. Partager un point positif: avant, 6 jours / semaine. Chaque jour, exprime une gratitude ou souligne un point positif auprès de ton partenaire.; maintenant, 3 fois par semaine. Une phrase simple, sans chercher à faire joli.. Pourquoi: Réduire la friction et la fatigue décisionnelle en limitant la fréquence et l'exigence de forme. Ce qui ne change pas: Convenir d'un signal de pause.
>
> Si ça te va, dis-moi clairement de l'appliquer. Sinon, dis-moi ce que tu veux modifier dans ce brouillon.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: `risk_band=none`
- direct_effects: none
- operation: `draft_review_details`, operation_id `a3262339-0648-40f6-953d-362dba77ca67`
- pending_confirmation: conserve
- executed_tools: `[]`
- durable_effect: aucun changement DB avant validation

### Tour 6

**User**
> Oui, applique cet ajustement: 3 fois par semaine, phrase simple, et le reste du niveau inchangé.

**Sophia**
> C'est fait, j'ai ajusté ton plan pour enlever la pression. L'habitude 'Partager un point positif' est désormais fixée à 3 fois par semaine avec une consigne simplifiée : une phrase simple, sans chercher à faire joli. Cela permet de maintenir le lien sans que cela devienne une charge mentale. Tes autres missions, notamment celle sur le signal de pause, restent identiques. Je suis convaincu que cet allègement facilitera ta régularité.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: `risk_band=none`
- direct_effects: none
- operation: `executed`, operation_id `a3262339-0648-40f6-953d-362dba77ca67`, plan_patch_id `d0692661-8234-4aac-b6e8-f03fcc4b1f9f`
- pending_confirmation: cleared
- executed_tools: `["adjust_plan_item"]`
- durable_effect: `Partager un point positif` mis a jour en DB: `cadence_label=3 jours / semaine`, `target_reps=3`, `description=une phrase simple, sans chercher à faire joli`; `Convenir d'un signal de pause` inchange.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1: Sophia comprend la pression et demande le slot manquant au lieu d'executer.
- Tours 2 et 4: elle rappelle clairement que rien n'est encore applique et donne le perimetre de changement.
- Tour 6: l'ack final correspond maintenant a l'effet durable observe.

**Problemes**
- Tour 2: Sophia passe au vouvoiement, puis revient au tutoiement. Impact: petite rupture de voix/persona. Severite: yellow.
- Tour 5: rendu encore rugueux (`partenaire.; maintenant`, double point final). Impact: comprehensible mais peu soigne. Severite: yellow.

**Fix propose**
- Polir `draft_review_details` avec un renderer structure: `Avant`, `Apres`, `Inchange`, sans concatener les phrases du draft.
- Stabiliser le tutoiement pour Rose dans les templates/LLM constraints du flow.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Pass: Tour 1 route vers `tool_skill` / `adjust_plan_item`.
- Pass: Tour 2 continue le flow actif via `active_tool_skill_continue`.
- Pass: Tours 3 et 5 priorisent le draft review et n'ouvrent pas un autre flow.
- Pass: Tour 4 remplace le brouillon et cree un nouvel `operation_id`, donc le brouillon obsolete a 2 jours n'est pas execute.
- Pass: Tour 6 execute seulement apres confirmation explicite.

**Skills / Operations / Tools**
- `adjust_plan_item` collecte la cible `Partager un point positif`, la frequence, puis la revision a 3 fois/semaine.
- Aucun executor appele avant le tour 6.
- Au tour 6, `executed_tools=["adjust_plan_item"]`, `operation_flow_run.status=executed`, `plan_patch_id=d0692661-8234-4aac-b6e8-f03fcc4b1f9f`.

**Memory / Effets durables**
- DB apres execution:
  - `user_plan_items[Partager un point positif].cadence_label = 3 jours / semaine`
  - `user_plan_items[Partager un point positif].target_reps = 3`
  - `user_plan_items[Partager un point positif].description = une phrase simple, sans chercher à faire joli`
  - `payload.active_operation_adjustment.patch` contient `difficulty`, `instruction`, `target_reps`, `cadence_label`
  - `Convenir d'un signal de pause` reste inchange.
- Aucun side effect avant confirmation.

**Problemes**
- Aucun probleme systeme bloquant observe sur le bug cible.
- Observation non bloquante: aucun snapshot `system_runtime_snapshots` `plan_adjustment_patch` retrouve par la requete de verification pour ce run. L'effet durable principal est toutefois materialise dans `user_plan_items`.

**Fix propose**
- Ajouter une assertion integration durable dans le harness conversationnel: confirmation d'une baisse de frequence -> `target_reps/cadence_label/description` changent dans `user_plan_items`.
- Garder le test unitaire ajoute sur les contraintes de frequence comme garde de regression.

## Verdict Global

- Verdict: yellow
- Raison principale: le workflow systeme est maintenant aligne et materialise le changement demande; il reste une friction UX de rendu/tutoiement dans le draft review.
- Follow-up prioritaire: polir le renderer `draft_review_details` et stabiliser le tutoiement.
