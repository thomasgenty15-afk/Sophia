# post_morning_nudge.emotional_presence Real QA R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `pmnep-real-r1`
- Persona: `qa-skill`, connexion temporaire `post_morning_nudge_emotional_presence_pmnep_real_r1`
- Objectif: valider en conditions reelles le flow local `post_morning_nudge.emotional_presence` apres injection d'un `morning_nudge_v2` emotional presence, puis verifier une sortie vers le global.
- Trajectoire: etat actif `post_morning_nudge.emotional_presence` injecte dans `user_chat_states.temp_memory`, conversation via `/functions/v1/test-send-message`, reprise apres un 502.
- Surfaces visees: local dispatcher, visible prompt IA, skip du global pendant flow local, exit vers global, `select_state_potion.clarte`, absence d'effets durables action/carte/rappel/plan.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide avec incident documente. T1-T3 et T5 sont HTTP 200 avec IA reelle et traces. T4 est un 502 upstream sans reponse Sophia, repris au T5 sans fallback.
- Artefacts: `tests/real-personas/qa-skill/runs/post_morning_nudge/2026-06-08-pmnep-real-r1.raw.json`, `summary.json`, `durable.json`.
- Nettoyage: cleanup cible effectue. Verification finale: Auth user `404`, `chat_messages=0`, `user_chat_states=0`, `scheduled_checkins=0` pour le user/scope du run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je crois que ce matin je suis surtout un peu lourd, j'ai pas envie qu'on transforme ca en mission.

**Sophia**
> Je sens que c'est un peu lourd pour toi aujourd'hui. Je voulais juste te dire qu'il n'y a aucune "mission" ou attente particulière ici, on n'a rien à accomplir.
>
> Est-ce que tu préfères qu'on laisse simplement ce constat exister, que tu m'en dises un peu plus sur ce qui pèse, ou qu'on s'accorde juste un moment de calme ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `post_morning_nudge.emotional_presence_dispatcher`
- route_reason: `active_post_morning_nudge_local_dispatcher`
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Et juste pour verifier, tu attendais une action precise de moi avec ton message ?

**Sophia**
> Il n'y avait vraiment aucune action cachée ou attente particulière derrière mon message de ce matin. Mon intention était simplement de t'offrir une porte ouverte et une présence, sans aucune pression de productivité. Je sais que les choses peuvent sembler un peu lourdes en ce moment, et je voulais juste que tu saches que je respecte ton état et ton rythme, peu importe ce qu'ils sont aujourd'hui. Je suis là, tout simplement. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `post_morning_nudge.emotional_presence_dispatcher`
- route_reason: `active_post_morning_nudge_local_dispatcher`
- flow_action: `repeat_presence_context`
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Ok. Dans ce cas donne-moi un point d'appui tres simple, pas une todo.

**Sophia**
> Peut-être pourrais-tu simplement laisser ton regard se poser un instant sur une couleur ou une forme qui t'est agréable autour de toi, sans rien attendre de plus. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `post_morning_nudge.emotional_presence_dispatcher`
- route_reason: `active_post_morning_nudge_local_dispatcher`
- flow_action: `offer_soft_next_step`
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> En fait je prefere une potion de clarte pour poser ca proprement.

**Sophia**
> Reponse vide. Le endpoint a retourne `502 {"message":"An invalid response was received from the upstream server"}`.

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: null
- operation: null
- pending_confirmation: none visible
- memory_plan: null
- executed_tools: []
- durable_effect: message user logge; etat local `post_morning_nudge` vide apres l'incident

**Analyse si yellow/red**
- Symptome: sortie globale demandee, mais le endpoint renvoie 502 sans reponse Sophia ni trace DB du tour.
- Source amont probable: runtime local `/functions/v1/test-send-message` ou upstream pendant la seconde passe globale.
- Owner runtime: test endpoint / gateway local / second pass global.
- Meilleure correction selon les guidelines: stabiliser la seconde passe apres `post_morning_nudge_local_exit_to_global_dispatcher` et garantir une trace exploitable meme en erreur upstream.
- Pourquoi ce n'est pas un patch local: le dispatcher local avait deja libere l'etat; l'echec apparait au transport/runtime global, pas dans le choix local `emotional_presence`.

### Tour 5

**Verdict du tour:** green

**User**
> Je reformule simplement: j'aimerais choisir une potion de clarte maintenant.

**Sophia**
> C'est une excellente idée d'utiliser la Potion de clarté pour mettre tout ça au clair. Qu'est-ce qui te donne le sentiment que ce que tu as prévu pour aujourd'hui a perdu son sens ou sa résonance ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.clarte`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: []
- operation: `select_state_potion.clarte` detail intake
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: active intake `select_state_potion.clarte`, no potion commit yet

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia garde une posture de presence et ne transforme pas la charge emotionnelle en mission.
- Elle repond clairement a la question "action cachee ?" sans inventer d'action cible.
- Le point d'appui propose au T3 est doux, non directif, et respecte explicitement "pas une todo".
- La reprise T5 vers la potion est naturelle apres la demande explicite.

**Problemes**
- Tour 4: interruption technique visible pour l'utilisateur si elle arrivait en production. Famille: `BF-TEST-01`. Impact: absence de reponse au moment du handoff. Severite: yellow.

**Fix propose**
- Source amont: endpoint local / seconde passe globale apres sortie du flow local.
- Correction recommandee: tracer et stabiliser le chemin d'erreur post-exit; retenter proprement la seconde passe ou rendre une erreur QA diagnostiquee sans perdre la trace.
- Tests d'invariant attendus: run integration `force_full_ai=true` ou test endpoint simule couvrant `post_morning_nudge.emotional_presence -> exit_to_global_dispatcher -> select_state_potion` sans 502 et avec trace.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1-T3: routage correct vers `post_morning_nudge.emotional_presence_dispatcher`; le global est bloque pendant le flow local.
- T2: `repeat_presence_context` confirme l'invariant "no hidden target action".
- T3: `offer_soft_next_step` reste local et ne cree pas d'action.
- T5: apres sortie/etat local vide, le global route correctement vers `select_state_potion.clarte`.

**Skills / Operations / Tools**
- `post_morning_nudge.emotional_presence_dispatcher` appele avec `ai_call_count=2` sur les tours locaux valides.
- Aucune operation engageante n'est executee dans le flow local.
- `select_state_potion.clarte` demarre en intake, sans commit durable de potion.

**Memory / Effets durables**
- T1-T3: `direct_effects=[]`, `committed_effects=[]`, `no_durable_mutation` vrai dans les metadata assistant.
- Apres T5: `temp_memory.__active_tool_skill_intake.active_subskill_id=select_state_potion.clarte`.
- Nettoyage cible verifie apres run: Auth user supprime, messages/state/checkins du scope a zero.

**Problemes**
- Tour 4: 502 sans trace DB. Famille: `BF-TEST-01`. Impact systeme: la sortie locale vers global n'est pas observable jusqu'au bout sur cette tentative; le message user est logge, mais aucune reponse assistant n'est produite. Severite: yellow.
- Durable query warning: la capture `scheduled_checkins` a tente une colonne `metadata` absente, sans impact sur le verdict du flow teste; verification post-cleanup a confirme `scheduled_checkins=0`.

**Fix propose**
- Source amont: test endpoint / gateway local / seconde passe globale.
- Correction recommandee: rendre la seconde passe post-local-exit resiliente et tracer un diagnostic structure quand upstream retourne une reponse invalide.
- Tests d'invariant attendus: T4-like direct "je veux une potion de clarte" depuis active `post_morning_nudge.emotional_presence` doit produire soit `post_morning_nudge_local_exit_to_global_dispatcher` + seconde passe `select_state_potion.clarte`, soit une trace d'erreur exploitable sans user message orphelin.

## Verdict Global

- Verdict: yellow
- Raison principale: le flow local emotional presence est valide sur les tours locaux et la reprise globale fonctionne, mais la premiere sortie vers potion a subi un 502 sans trace exploitable.
- Follow-up prioritaire: stabiliser et tracer la seconde passe globale apres `post_morning_nudge.emotional_presence` exit.
