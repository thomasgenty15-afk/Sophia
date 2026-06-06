# QA Run Report — defense-single-field-runs-r1

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `defense-single-field-r1` + `defense-uncertain-single-field-rerun-r1`
- Persona: Alex
- Objectif: verifier que `prepare_defense_card` produit un handoff plateforme mono-champ, sans brouillon de carte, sans pseudo-formulaire moment/signal/geste, et sans creation chat.
- Trajectoire: variante explicite avec champ formulable, puis replay du cas incertain attaque/defense + champs inconnus; dans les deux variantes, tentative "Ok cree-la" apres handoff.
- Surfaces visees: dispatcher, `prepare_defense_card`, active handoff, renderer, EffectLedger, DB `user_defense_cards`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runner `scripts/qa_prepare_defense_turn.mjs`, pas de renderer deterministe ni fallback `processMessage`.
- Validite QA: valide. Runs menes tour par tour apres lecture des reponses et traces courtes. Aucun changement de code pendant les runs.

## 2. Tours De Conversation

### Variante A — demande explicite mono-champ

### Tour A1

**Verdict du tour:** green

**User**
> Prépare une carte de défense libre, sans la créer depuis le chat. J’ai besoin d’aide pour le moment où je termine mes mails du soir vers 22h30, que je suis fatigué, et que j’ouvre YouTube en me disant juste cinq minutes.

**Sophia**
> Où aller : dans Ressources / Défense / Cartes de défense libres / Ajouter une carte
> Champ à remplir :
> - Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : Le moment où je termine mes mails du soir vers 22h30, que je suis fatigué, et que j’ouvre YouTube en me disant juste cinq minutes.
> Je ne crée pas la carte depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- safety: none in trace
- direct_effects: `[]`
- operation: `tool_execution=platform_handoff`
- pending_confirmation: `null`
- memory_plan: `null`
- executed_tools: `[]`
- durable_effect: `user_defense_cards=[]`

### Tour A2

**Verdict du tour:** green

**User**
> Ok crée-la.

**Sophia**
> Je ne crée pas la carte depuis le chat.
> Va dans Ressources / Défense / Cartes de défense libres / Ajouter une carte; reprends les réponses préparées juste au-dessus dans la plateforme. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_handoff_apply_attempt`
- safety: none in trace
- direct_effects: `[]`
- operation: `tool_execution=platform_handoff`
- pending_confirmation: `null`
- memory_plan: `null`
- executed_tools: `[]`
- durable_effect: `user_defense_cards=[]`

### Variante B — replay user incertain

### Tour B1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-04` — ambiguïté non reconnue

**User**
> Je ne sais pas si je dois faire une carte d'attaque ou de défense, ni quels champs remplir. Demain j'ai mes mails du soir à faire et je veux éviter de finir sur YouTube après. Tu me guides ?

**Sophia**
> Où aller : dans Ressources / Défense / Cartes de défense libres / Ajouter une carte
> Champ à remplir :
> - Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : Éviter de finir sur YouTube après avoir fait mes mails du soir.
> Je ne crée pas la carte depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `central_arbitrator_defense_card_structured_intent`
- safety: none in trace
- direct_effects: `[]`
- operation: `tool_execution=platform_handoff`
- pending_confirmation: `null`
- memory_plan: `null`
- executed_tools: `[]`
- durable_effect: `user_defense_cards=[]`

**Analyse si yellow/red**
- Symptome: le user dit explicitement qu'il ne sait pas s'il lui faut une carte d'attaque ou de defense, mais Sophia choisit directement `prepare_defense_card`.
- Source amont probable: `turn_intent_arbitrator` / bypass orientation clarification, sur signaux structures `prepare_attack_card` + `prepare_defense_card`.
- Owner runtime: arbitration / orientation clarification.
- Meilleure correction selon les guidelines: si les deux intents carte existent dans le même `TurnFrame`, router vers `orientation_clarification` et demander le choix metier attaque vs defense.
- Pourquoi ce n'est pas un patch local: le bug concerne la famille des ambiguïtés entre deux tool skills, pas une phrase exacte.

### Tour B2

**Verdict du tour:** green

**User**
> Ok crée-la.

**Sophia**
> Je ne crée pas la carte depuis le chat.
> Va dans Ressources / Défense / Cartes de défense libres / Ajouter une carte; reprends les réponses préparées juste au-dessus dans la plateforme. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_handoff_apply_attempt`
- safety: none in trace
- direct_effects: `[]`
- operation: `tool_execution=platform_handoff`
- pending_confirmation: `null`
- memory_plan: `null`
- executed_tools: `[]`
- durable_effect: `user_defense_cards=[]`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Variante A: Sophia donne directement le chemin plateforme et le seul champ a remplir quand la demande est explicite.
- Le rendu ne fabrique pas de carte finale, de plan B, de promesse, ni de pseudo-formulaire moment/signal/geste.
- "Ok cree-la" ne repete pas tout le handoff; Sophia rappelle simplement qu'elle ne cree pas depuis le chat et ou reprendre les informations.

**Problemes**
- Tour B1: Sophia saute la clarification attaque vs defense alors que le user exprime explicitement son incertitude. Famille: `BF-INTAKE-04`. Impact: handoff premature et experience robotique. Severite: red.
- Warning mineur: un emoji final est ajoute par la couche de reponse globale, pas par le renderer defense.

**Fix propose**
- Source amont: `turn_intent_arbitrator` et bypass orientation clarification.
- Correction recommandee: quand `prepare_attack_card` et `prepare_defense_card` sont tous deux presents comme intents structures routeables, forcer `orientation_clarification`.
- Tests d'invariant attendus: competing attack/defense intents -> clarification; single defense explicite -> handoff; apply_attempt non-mutant.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Variante A: `prepare_defense_card` selectionne des le depart via `tool_skill_intent_start`.
- Variante B: le cas incertain est capture a tort par `prepare_defense_card` via `central_arbitrator_defense_card_structured_intent`.
- Les tours "Ok cree-la" sont captures par l'active handoff comme `active_handoff_apply_attempt`.

**Skills / Operations / Tools**
- `tool_execution=platform_handoff` sur tous les tours.
- `executed_tools=[]` sur tous les tours.
- Le handoff contient `platform_fields.fields[0].field_id=support_need`, `status=locked`, `missing_field_ids=[]`.
- `platform_flow.questionnaire_answers=[]`, donc pas de formulaire multi-champs.
- `pending_confirmation=null`.

**Memory / Effets durables**
- `user_defense_cards=[]` apres les deux runs.
- Cleanup cible effectue sur les scopes:
  - `qa-prepare-defense-card-alex-2026-06-03-defense-single-field-r1`: 4 `chat_messages` supprimes, 1 `user_chat_states` supprime, `after_messages=0`.
  - `qa-prepare-defense-card-alex-2026-06-03-defense-uncertain-single-field-rerun-r1`: 4 `chat_messages` supprimes, 1 `user_chat_states` supprime, `after_messages=0`.

**Problemes**
- Tour B1: mauvais passage direct au tool skill malgre deux intents structures concurrents `prepare_attack_card` et `prepare_defense_card`. Famille: `BF-INTAKE-04`. Impact systeme: la clarification tool est contournee. Severite: red.

**Fix propose**
- Source amont: `turn_intent_arbitrator` + `shouldBypassOrientationClarificationForExplicitToolRoute`.
- Correction recommandee: conserver les deux intents et router vers `orientation_clarification`, sans execution ni handoff.
- Tests d'invariant attendus: L3 competing card intents; bypass orientation false; QA reel B1 demande clarification.

## Verdict Global

- Verdict: red
- Raison principale: la variante B saute la clarification attaque vs defense et livre un handoff premature.
- Follow-up prioritaire: corriger l'arbitrage des intents concurrents `prepare_attack_card` / `prepare_defense_card`.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-03-defense-single-field-runs-r1-bugs.md`
