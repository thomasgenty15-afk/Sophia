# QA Run - Post Morning Nudge Stateful Real R1

## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `pmns-stateful-real-1781553797` + variante `pmns-handoff-real-1781554025`
- Persona: Alex, user local `aac76fd6-a688-4027-951a-fa79c628fac5`
- Objectif: verifier en conditions reelles que le flow post-morning-nudge reste robuste apres les changements state runtime / server-owned fields / mutation audit.
- Trajectoire: ancien active state post-morning-nudge emotional presence, reponse de cloture locale, nouveau sujet apres cloture, puis variante avec changement explicite de sujet pendant active state.
- Surfaces visees: `/functions/v1/test-send-message`, active skill state, dispatcher local post-morning-nudge, global router, handoff vers `prepare_attack_card` et `select_state_potion`, traces, DB cleanup.
- Cadre IA reel: Supabase local, `force_full_ai=true`, pas de renderer deterministe, pas de fallback direct `processMessage`, messages choisis tour par tour apres lecture de la reponse precedente.
- Validite QA: valide. Le run utilise le chemin IA reel local Sophia. Verdict global: `yellow`.

## 2. Tours De Conversation

### Tour 1 - Cloture locale depuis ancien active state

**Verdict du tour:** green

**User**
> Merci, je veux juste garder ca doux ce matin, pas besoin d'en faire une action.

**Sophia**
> Je comprends tout a fait. On garde cette douceur pour ton debut de journee. Je te souhaite une tres belle matinee.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `post_morning_nudge.emotional_presence_dispatcher`
- route_reason: `active_post_morning_nudge_local_dispatcher`
- safety: aucun signal safety
- direct_effects: aucun
- operation: aucune
- pending_confirmation: none
- executed_tools: none
- durable_effect: aucun
- flow_action: `presence_ack_close`
- visible_task: `presence_close`
- state_mutation_audit:
  - server_owned_fields: `skill_id`, `flow_kind`, `source_nudge`, `activation_note_information`, `status`, `turn_count`, `max_turns`, `created_at`, `updated_at`, `local_assessment`, `active_state`
  - applied_fields: `local_assessment`, `turn_count`, `updated_at`, `status`
  - preserved_fields: `skill_id`, `flow_kind`, `source_nudge`, `activation_note_information`, `max_turns`, `created_at`
  - cleared_fields: `active_state`
  - rejected_changes: none
- DB apres tour: `__post_morning_nudge_active_state_v1=false`, `__active_skill_state=false`

### Tour 2 - Nouveau sujet apres cloture

**Verdict du tour:** green

**User**
> Ok, autre chose: prepare-moi une carte d'attaque pour garder mon calme cet apres-midi.

**Sophia**
> Je suis ravie de t'accompagner pour ca. Est-ce que ton objectif est bien de garder ton calme cet apres-midi ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- active_flow_arbitration: `no_active_flow`
- safety: aucun signal safety
- direct_effects: aucun commit durable
- operation: `prepare_attack_card` intake
- pending_confirmation: none
- executed_tools: none
- durable_effect: aucun
- note_information: `global_dispatcher -> prepare_attack_card`, reason `explicit_user_request`, confidence `high`
- state_mutation_audit du flow cible present; aucun rejected change
- DB avant cleanup: le scope contient un state `__active_attack_card_handoff`, pas de state post-morning-nudge

### Variante 1 - Changement explicite pendant active state

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne

**User**
> En fait je veux une potion de clarte, pas continuer le message du matin.

**Sophia**
> C'est entendu, on laisse de cote le message du matin pour se concentrer sur ta Potion de clarte. Pour commencer, qu'est-ce qui s'est deconnecte entre ton plan initial et ce qui compte vraiment pour toi au fond ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.clarte`
- route_reason: `tool_skill_intent_start`
- active_flow_arbitration: `no_active_flow`
- safety: aucun signal safety
- direct_effects: aucun commit durable
- operation: `select_state_potion`, platform_handoff `delivered`, `executable_from_chat=false`
- pending_confirmation: none
- executed_tools: none
- durable_effect: aucun commit durable observe
- trace active state: les snapshots `active_flow_debug` montrent `raw_active_skill.skill_id=post_morning_nudge` et `__post_morning_nudge_active_state_v1` avant la decision finale.
- note_information visible dans le turn frame: `global_dispatcher -> select_state_potion`, reason `explicit_user_request`, confidence `high`
- signal exit observe: `skill_signals.exit.post_morning_nudge.detected=true`, reason `explicit_refusal_of_morning_flow`
- warning: le tour a reussi humainement, mais la trace ne montre pas le dispatcher local post-morning-nudge produisant lui-meme `exit_to_global_dispatcher`. Le global dispatcher semble avoir repris directement malgre un active state present.

**Analyse si yellow/red**
- Symptome: handoff fonctionnel en surface, mais owner runtime non conforme a la doctrine stricte des dispatchers locaux.
- Source amont probable: active flow arbitration / route policy avant execution du dispatcher local.
- Owner runtime: router Sophia Brain / active flow arbitration autour de `post_morning_nudge`.
- Meilleure correction selon les guidelines: faire passer l'intention par le dispatcher local actif, obtenir `flow_action=exit_to_global_dispatcher` avec `note_information`, puis seulement autoriser le second pass global.
- Pourquoi ce n'est pas un patch local: la reponse visible est bonne; le probleme est la politique d'ownership et la trace runtime, pas une phrase ni un pattern utilisateur.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le tour 1 respecte le besoin humain: le user refuse une action, Sophia garde une presence douce et cloture sans pousser.
- Le nouveau sujet apres cloture est fluide: Sophia ne reste pas accrochee au morning nudge et demarre une carte d'attaque.
- La variante potion est naturelle en surface: Sophia reconnait le changement de sujet et enchaine sur la Potion de clarte.

**Problemes**
- Aucun probleme visible majeur. Le warning est systeme, pas UX.

**Fix propose**
- Source amont: route policy / active flow arbitration.
- Correction recommandee: garantir que tout active state post-morning-nudge est d'abord remis au dispatcher local; si le user change clairement de sujet, ce dispatcher local doit produire la note d'exit.
- Tests d'invariant attendus: run reel ou test integration montrant `post_morning_nudge.*_dispatcher -> exit_to_global_dispatcher -> global second pass`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tour 1: green. Le handler local `post_morning_nudge.emotional_presence_dispatcher` est bien selectionne via `active_post_morning_nudge_local_dispatcher`.
- Tour 2: green. Apres cloture DB, le global router peut reprendre; `prepare_attack_card` est selectionne proprement.
- Variante handoff: yellow. La trace finale indique `selected_handler=select_state_potion.clarte` avec `source_flow_id=global_dispatcher`, alors que les snapshots montrent encore un active state post-morning-nudge avant arbitration. Selon la doctrine, le global normal ne devrait reprendre qu'apres `exit_to_global_dispatcher` produit par le dispatcher local actif.

**Skills / Operations / Tools**
- `post_morning_nudge.emotional_presence_dispatcher`: produit `presence_ack_close`, nettoie l'active state, aucune mutation durable.
- `prepare_attack_card`: demarre son intake, pas de commit durable.
- `select_state_potion.clarte`: demarre la clarification, livre un platform handoff non executable depuis chat, pas de commit durable.

**State / Reducer / Audit**
- L'audit post-morning-nudge est present au tour 1 et conforme: champs server-owned preserves, `active_state` clear uniquement sur transition de cloture.
- Ancien active state sans `activation_note_information` reste lisible: le tour 1 a ete route au dispatcher local et cloture proprement.
- Les flows cibles exposent aussi un `state_mutation_audit`.

**Effets Durables**
- Aucun effet durable cree dans les trois tours.
- Aucun commit sans confirmation.
- Le platform handoff potion est livre comme handoff non executable depuis chat; pas de mutation DB durable observee.

**DB / Cleanup**
- Avant cleanup, les scopes contenaient uniquement les states temporaires issus du run (`__active_attack_card_handoff` et `__active_tool_skill_intake`), pas de state post-morning-nudge residuel.
- Cleanup cible effectue sur les deux scopes QA:
  - `chat_messages`: 6 lignes supprimees, verification finale 0
  - `user_chat_states`: 2 lignes supprimees, verification finale 0

**Commandes de validation**
- Real QA setup:
  - `deno run --allow-env --allow-net --allow-read tmp/pulse-v2-real-qa/setup_post_morning_nudge_real_qa.ts "$RUN_ID" "$SCOPE"`
- Real QA endpoint:
  - `POST http://127.0.0.1:54321/functions/v1/test-send-message`
  - `force_full_ai=true`
  - `disable_debounce=true`
  - headers locaux avec `apikey` anon et `x-user-authorization` user token Alex
- Tests unitaires:
  - `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/post_morning_nudge_test.ts supabase/functions/sophia-brain/post_morning_nudge_action_test.ts supabase/functions/sophia-brain/post_morning_nudge_suppressed_action_test.ts supabase/functions/sophia-brain/post_morning_nudge_emotional_presence_test.ts`
  - Resultat: `56 passed | 0 failed`
- Type check:
  - `deno check supabase/functions/sophia-brain/post_morning_nudge.ts supabase/functions/sophia-brain/post_morning_nudge_test.ts supabase/functions/sophia-brain/post_morning_nudge_action_test.ts supabase/functions/sophia-brain/post_morning_nudge_suppressed_action_test.ts supabase/functions/sophia-brain/post_morning_nudge_emotional_presence_test.ts`
  - Resultat: OK

## Verdict Global

`yellow`.

Le comportement conversationnel et les effets durables sont bons, et les tests ciblés passent. Mais la variante handoff pendant active state revele une non-conformite d'ownership: le global dispatcher semble reprendre directement via un signal d'exit alors que le dispatcher local post-morning-nudge aurait du produire explicitement `exit_to_global_dispatcher` avec note_information avant le second pass global.
