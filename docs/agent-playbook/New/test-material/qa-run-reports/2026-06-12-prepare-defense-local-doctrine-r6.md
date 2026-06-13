## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `prepare-defense-local-doctrine-r6`
- Persona: Alex, connexion locale, runner officiel `scripts/qa_prepare_defense_turn.mjs`
- Objectif: verifier le correctif de persistance post-handoff `prepare_defense_card`.
- Trajectoire: entree defense -> confirmation -> destination -> apply attempt -> changement explicite vers carte d'attaque.
- Surfaces visees: dispatcher global initial, active flow local defense, handoff state dedie, sortie vers global, activation attack.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback direct.
- Validite QA: valide. Le run R5 precedent est invalide/contamine et nettoye; R6 utilise le runner officiel.
- Cleanup fin de run: scope exact nettoye (`chat_messages=10`, `user_chat_states=1` supprimes), `user_defense_cards=0` avant et apres.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Je veux préparer une carte de défense pour les soirs où je rentre vidé, je vois les applis de livraison et je commande trop vite au lieu de manger un truc simple.

**Sophia**
> C'est souvent là que tout se joue, quand la fatigue prend le dessus sur l'envie de cuisiner simple. Est-ce que cette formulation te convient pour « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? » : les soirs où je rentre vidé, que je vois les applis de livraison et que je risque de commander trop vite au lieu de manger simple ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- direct_effects: []
- operation: none
- pending_confirmation: false
- executed_tools: []
- durable_effect: aucune carte creee
- local_trace: `flow_action=confirm_proposed_field`, `visible_task.kind=confirm_support_need_proposal`, `support_need=proposed`, `ai_call_count=2`

**Analyse si yellow/red**
- Symptome: trop rapide humainement; Sophia propose deja le champ plateforme au premier tour.
- Source amont probable: prompt dispatcher local / invariant de rythme non encore ajoute.
- Owner runtime: `prepare_defense_card.local_flow`.
- Meilleure correction selon les guidelines: ajouter une passe conversationnelle d'eclaircissement avant proposition plateforme.
- Pourquoi ce n'est pas un patch local: il faut une regle de flow, pas une phrase fixe.

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, ça me convient.

**Sophia**
> C'est parfait. Pour finaliser ta carte de défense, rends-toi dans Ressources / Défense / Cartes de défense libres. Comme elle n'est pas créée directement depuis notre échange, tu peux l'ajouter toi-même en utilisant cette formulation pour le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : les soirs où je rentre vidé, que je vois les applis de livraison et que je risque de commander trop vite au lieu de manger simple

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- direct_effects: []
- operation: none
- pending_confirmation: false
- executed_tools: []
- durable_effect: aucune carte creee

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Tu peux me redire où je dois la mettre ?

**Sophia**
> Tu peux l'ajouter dans Ressources / Défense / Cartes de défense libres. Dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?, tu peux recopier : les soirs où je rentre vidé, que je vois les applis de livraison et que je risque de commander trop vite au lieu de manger simple.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- direct_effects: []
- pending_confirmation: false
- durable_effect: aucune carte creee

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok, ajoute-la pour moi.

**Sophia**
> Je ne peux pas créer la carte à ta place depuis le chat, mais tu peux le faire toi-même dans Ressources / Défense / Cartes de défense libres. Une fois là-bas, choisis Ajouter une carte et utilise cette formulation pour le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : les soirs où je rentre vidé, que je vois les applis de livraison et que je risque de commander trop vite au lieu de manger simple

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- direct_effects: []
- pending_confirmation: false
- executed_tools: []
- durable_effect: aucune carte creee, aucun pending executable

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne

**User**
> En fait je change : j’ai plutôt besoin d’une carte d’attaque pour me lancer sur mon dossier CAF demain matin.

**Sophia**
> On passe à l'offensive pour ton dossier CAF demain matin. Qu'est-ce qui a tendance à te faire dérailler ou à te bloquer au moment précis où tu dois t'y mettre ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- direct_effects: []
- pending_confirmation: false
- executed_tools: []
- durable_effect: aucune carte creee
- debug critique: `user_state_loaded` et `read_active_flow_state` voient `__active_defense_card_handoff` + `__active_tool_skill_intake`; `active_tool_skill_id=prepare_defense_card`; puis `before_run_conversation_routers` n'a plus que `__conversation_risk_history` et `__conversation_risk_last`; la decision finale indique `active_flow_arbitration.reason_code=no_active_flow`.

**Analyse si yellow/red**
- Symptome: la cle dediee defense est bien ecrite et lue au debut du tour, mais elle est nettoyee avant que le local defense prenne la main.
- Source amont probable: une etape de clear/reconciliation entre `after_pending_confirmation_reload` et `before_run_conversation_routers`, probablement avant le bloc local `prepare_defense_card`.
- Owner runtime: lifecycle active flow / clear machine state, pas le dispatcher local.
- Meilleure correction selon les guidelines: identifier l'appel qui supprime `__active_defense_card_handoff` pendant le tour et le rendre incapable de nettoyer un flow local actif sans `exit_to_global_dispatcher`, `cancel_flow`, `safety_preempt` ou expiration explicite.
- Pourquoi ce n'est pas un patch local: le dispatcher defense n'est jamais appele au tour 5; renforcer son prompt ne peut pas corriger cette perte d'owner.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tours 2-4 sont lisibles, non mutants, et restent dans `prepare_defense_card`.
- La destination et le label exact sont corrects.
- Le refus d'ajout depuis le chat est clair.

**Problemes**
- Tour 1: trop rapide; pas de vraie discussion avant proposition du champ. Famille: BF-STATE-01. Impact: experience formulaire.
- Tour 5: visible correct pour l'utilisateur, mais la transition systeme est non doctrinale. Famille: BF-ROUTE-01. Impact utilisateur faible ici, risque systeme fort.

**Fix propose**
- Source amont: runtime de nettoyage active flow.
- Correction recommandee: tracer et bloquer la suppression de `__active_defense_card_handoff` entre `after_pending_confirmation_reload` et `before_run_conversation_routers`; maintenir defense owner jusqu'a sortie locale explicite.
- Tests d'invariant attendus: tour avec `__active_defense_card_handoff` present + intention attack explicite doit appeler `prepare_defense_card.local_flow` et produire `exit_to_global_dispatcher` avant toute activation attack.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: global dispatcher admissible pour activation initiale.
- T2-T4: active flow defense respecte.
- T5: violation persistante; `prepare_defense_card` est actif au chargement mais disparait avant arbitration globale.

**Skills / Operations / Tools**
- Aucun writer defense, aucun executor, aucun pending confirmation.
- `prepare_attack_card` demarre au T5 sans trace prealable `prepare_defense_card.local_exit_to_global_dispatcher`.

**Memory / Effets durables**
- `user_defense_cards=[]`.
- Cleanup cible OK: `chat_messages=10`, `user_chat_states=1`, cartes defense `0 -> 0`.

**Problemes**
- Tour 5: perte d'owner actif malgre cle dediee visible dans la trace. Famille: BF-ROUTE-01. Severite: red.

**Fix propose**
- Source amont: code qui clear `tempMemory` avant `runConversationRouters`.
- Correction recommandee: ajouter instrumentation temporaire ou audit ciblé sur tous les appels `clearActiveToolFlow`, `clearToolSkillFlow`, `clearMachineStateTempMemory`, `clearDefenseCardFrame`, `clearToolSkillFlowForDirectReminder`, puis restreindre celui qui s'execute dans ce tour.
- Tests d'invariant attendus: unit test de la portion runtime qui conserve `__active_defense_card_handoff` jusqu'au dispatch local; real QA R7 doit montrer `prepare_defense_card.local_flow` au tour de switch.

## Verdict Global

- Verdict: red
- Raison principale: le state dedie defense est bien cree, mais une couche runtime le supprime avant que le dispatcher local defense puisse emettre `exit_to_global_dispatcher`.
- Follow-up prioritaire: trouver et corriger le clear intermédiaire avant de relancer.
