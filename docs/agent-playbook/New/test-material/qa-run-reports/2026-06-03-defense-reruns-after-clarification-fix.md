# QA Run Report — defense-reruns-after-clarification-fix

## 1. Contexte Du Test

- Date: 2026-06-03
- Runs: `defense-ambiguous-clarification-r3`, `defense-explicit-single-field-r2`, `defense-unknown-field-defense-r1`
- Persona: Alex
- Objectif: verifier apres correction que `prepare_defense_card` clarifie les cas attaque/defense ambigus, produit un handoff mono-champ quand la defense est choisie, et ne cree jamais de carte depuis le chat.
- Trajectoire: ambiguite attaque/defense -> choix defense -> apply_attempt; demande defense explicite -> apply_attempt; demande defense avec champ inconnu -> repeat_handoff.
- Surfaces visees: dispatcher, `orientation_clarification`, `prepare_defense_card`, active handoff, renderer defense, EffectLedger, DB `user_defense_cards`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runner `scripts/qa_prepare_defense_turn.mjs`, pas de renderer deterministe ni fallback `processMessage`.
- Validite QA: valide. Runs menes tour par tour apres lecture des reponses et traces courtes. Aucun changement de code pendant les runs.

## 2. Tours De Conversation

### Run A — ambiguite attaque/defense

### Tour A1

**Verdict du tour:** green

**User**
> Je ne sais pas si je dois préparer une carte d'attaque ou une carte de défense. Ce soir j'ai mes mails client à traiter et j'ai peur de finir sur YouTube après. Tu m'aides à choisir ?

**Sophia**
> Tu veux préparer une carte d'attaque pour t'aider à traiter tes mails ou une carte de défense pour éviter de finir sur YouTube ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: none in trace
- direct_effects: `[]`
- operation: `tool_execution=none`
- pending_confirmation: `null`
- memory_plan: `null`
- executed_tools: `[]`
- durable_effect: aucune carte defense creee

### Tour A2

**Verdict du tour:** green

**User**
> Défense plutôt : je veux surtout éviter le décrochage YouTube juste après les mails.

**Sophia**
> Où aller : dans Ressources / Défense / Cartes de défense libres / Ajouter une carte
> Dans la plateforme, le champ à préparer est :
> « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? »
> Je te proposerais d'écrire :
> « éviter le décrochage YouTube juste après les mails »
> Je ne crée pas la carte depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: none in trace
- direct_effects: `[]`
- operation: `tool_execution=platform_handoff`
- pending_confirmation: `null`
- memory_plan: `null`
- executed_tools: `[]`
- durable_effect: `user_defense_cards=[]`

### Tour A3

**Verdict du tour:** green

**User**
> Ok crée-la.

**Sophia**
> Je ne crée pas la carte depuis le chat.
> Va dans Ressources / Défense / Cartes de défense libres / Ajouter une carte; reprends la phrase préparée juste au-dessus dans la plateforme. 🙂

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

### Run B — defense explicite sans creation

### Tour B1

**Verdict du tour:** green

**User**
> Prépare-moi une carte de défense libre, sans la créer. Le truc où j'ai besoin d'aide, c'est quand je ferme l'ordi après mes mails du soir et que je glisse vers YouTube.

**Sophia**
> Où aller : dans Ressources / Défense / Cartes de défense libres / Ajouter une carte
> Dans la plateforme, le champ à préparer est :
> « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? »
> Je te proposerais d'écrire :
> « Quand je ferme l'ordi après mes mails du soir et que je glisse vers YouTube. »
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

### Tour B2

**Verdict du tour:** green

**User**
> Ok crée-la.

**Sophia**
> Je ne crée pas la carte depuis le chat.
> Va dans Ressources / Défense / Cartes de défense libres / Ajouter une carte; reprends la phrase préparée juste au-dessus dans la plateforme. 🙂

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

### Run C — defense explicite, user ne sait pas quoi remplir

### Tour C1

**Verdict du tour:** green

**User**
> Je veux faire une carte de défense, mais je ne sais pas quoi écrire dans la plateforme. C'est pour ne pas partir sur YouTube après mes mails du soir.

**Sophia**
> Où aller : dans Ressources / Défense / Cartes de défense libres / Ajouter une carte
> Dans la plateforme, le champ à préparer est :
> « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? »
> Je te proposerais d'écrire :
> « Ne pas partir sur YouTube après mes mails du soir. »
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

### Tour C2

**Verdict du tour:** green

**User**
> Redis-moi quoi mettre.

**Sophia**
> Où aller : dans Ressources / Défense / Cartes de défense libres / Ajouter une carte
> Dans la plateforme, le champ à préparer est :
> « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? »
> Je te proposerais d'écrire :
> « Ne pas partir sur YouTube après mes mails du soir. »
> Je ne crée pas la carte depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_handoff_repeat_handoff`
- safety: none in trace
- direct_effects: `[]`
- operation: `tool_execution=platform_handoff`
- pending_confirmation: `null`
- memory_plan: `null`
- executed_tools: `[]`
- durable_effect: `user_defense_cards=[]`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le cas ambigu commence bien par une clarification metier attaque vs defense.
- Une fois la defense choisie, Sophia aide uniquement a formuler le champ UI reel, sans brouillon de carte, plan B, moment/signal/geste ou promesse de creation.
- "Ok cree-la" ne lance pas d'execution; la reponse rappelle la destination plateforme.
- "Redis-moi quoi mettre" reste dans l'active handoff defense et ne bascule pas en status recap.

**Problemes**
- Warning non bloquant: le handoff garde une structure tres stable (`Où aller`, `Dans la plateforme`, `Je te proposerais d'ecrire`). Elle est claire et courte, mais encore assez formulaire. Aucune famille `BF-*` ouverte car les tours restent verts et le comportement attendu est respecte.

**Fix propose**
- Source amont: aucun fix requis pour valider les corrections testees.
- Correction recommandee: si on veut encore naturaliser, le faire au niveau renderer/handoff copy en gardant les invariants no-mutation et mono-champ.
- Tests d'invariant attendus: conserver clarification sur intents concurrents, handoff mono-champ, `executed_tools=[]`, `user_defense_cards=[]`.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Run A tour 1: `orientation_clarification` capture l'ambiguite attaque/defense.
- Run A tour 2: le choix defense est transfere vers `prepare_defense_card`.
- Runs B et C: les demandes defense explicites vont directement au skill defense.
- Les tours "Ok cree-la" et "Redis-moi quoi mettre" restent dans l'active handoff defense.

**Skills / Operations / Tools**
- Handoffs defense: `tool_execution=platform_handoff`.
- Aucun tour ne cree de pending confirmation executable.
- Tous les tours ont `executed_tools=[]`.
- Aucun `defense_card_id` n'est produit.

**Memory / Effets durables**
- Verification durable avant cleanup:
  - `defense-ambiguous-clarification-r3`: `user_defense_cards=0`, `user_plan_items=0`, `chat_messages=6`.
  - `defense-explicit-single-field-r2`: `user_defense_cards=0`, `user_plan_items=0`, `chat_messages=4`.
  - `defense-unknown-field-defense-r1`: `user_defense_cards=0`, `user_plan_items=0`, `chat_messages=4`.
- Cleanup cible effectue apres run:
  - `defense-ambiguous-clarification-r3`: 6 `chat_messages` supprimes, 1 `user_chat_states` supprime, `after_messages=0`.
  - `defense-explicit-single-field-r2`: 4 `chat_messages` supprimes, 1 `user_chat_states` supprime, `after_messages=0`.
  - `defense-unknown-field-defense-r1`: 4 `chat_messages` supprimes, 1 `user_chat_states` supprime, `after_messages=0`.

**Problemes**
- Aucun probleme systeme observe.

**Fix propose**
- Source amont: aucun fix requis.
- Correction recommandee: garder les tests unitaires et QA reel sur ce triptyque ambiguite -> handoff -> apply/repeat.
- Tests d'invariant attendus: QA reel incertain -> clarification; defense explicite -> handoff; repeat/apply_attempt -> no mutation.

## Verdict Global

- Verdict: green
- Raison principale: les corrections tiennent sur les trois variantes relancees. Le routing est bon, le handoff reste mono-champ, et aucune creation DB/chat executable n'est observee.
