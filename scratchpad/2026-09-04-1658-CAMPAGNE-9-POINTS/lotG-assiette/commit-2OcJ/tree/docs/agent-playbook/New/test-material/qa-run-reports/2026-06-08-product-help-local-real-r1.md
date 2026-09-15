# 2026-06-08 - product_help local real r1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `2026-06-08-product-help-local-real-r1`
- Persona: Alex local (`alex12@gmail.com`, user id documente dans raw; JWT non affiche)
- Objectif: verifier en conditions reelles le nouveau `product_help` local flow standalone: question produit, resolution apres clarification, follow-up destination pendant flow actif.
- Trajectoire: question carte d'attaque -> clarification produit/action -> reponse product_help -> follow-up "ou dans l'app".
- Surfaces visees: dispatcher global, orientation clarification, `product_help.local_dispatcher`, reducer local, visible agent, active product_help state, final response pipeline.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, login password local, aucun renderer/test unitaire comme preuve QA.
- Validite QA: partiellement valide puis red technique. Tours 1-2 exploitables; tour 3 echoue en HTTP 502 repete sans trace exploitable.

Artifacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-06-08-product-help-local-real-r1.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-06-08-product-help-local-real-r1.summary.json`
- Cleanup DB: effectue sur `chat_messages` et `user_chat_states` du scope `qa-product-help-local-2026-06-08-product-help-local-real-r1`; verification post-cleanup `[]`.

Incidents techniques avant/apres tours:

- Pre-run: helper Node temporaire ne pouvait pas appeler `supabase status` sous sandbox Docker; resolution par injection des infos gateway locales.
- Tour 2 tentative invalide: HTTP 401 cause cle anon locale mal recopiee dans l'environnement; non envoye a Sophia, retire de l'historique local, retry OK.
- Tour 3: HTTP 502 `An invalid response was received from the upstream server`, retry meme message avec meme resultat.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-03 - Product/status/tool mal priorises

**User**
> J'ai vu la mention carte d'attaque dans Sophia, concrètement ça sert à quoi ?

**Sophia**
> Cherches-tu à comprendre à quoi sert une carte d'attaque ou veux-tu en préparer une pour ton action ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- memory_plan: `minimal / none`
- executed_tools: `[]`
- durable_effect: `[]`

**Analyse si yellow/red**
- Symptome: le message est formule comme une question produit ("ça sert à quoi") mais le routeur demande une clarification produit vs preparation.
- Source amont probable: arbitration product/tool ou orientation clarification trop prudente sur "carte d'attaque".
- Owner runtime: dispatcher / orientation clarification policy.
- Meilleure correction selon les guidelines: prioriser `product_help` direct quand l'intention explicite est l'explication produit, sans exiger de clarification action.
- Pourquoi ce n'est pas un patch local: le probleme est une decision de routing/clarification, pas une phrase visible.

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Juste comprendre pour l'instant, pas en préparer une.

**Sophia**
> C'est un outil pour t'aider à démarrer quand tu bloques sur une tâche. Concrètement, une carte d'attaque transforme une action qui te semble lourde ou intimidante en une version 'minimale' et très concrète. Le but est de réduire la friction au maximum pour que tu puisses enfin te lancer sans trop d'effort. 🙂

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- memory_plan: `minimal / none`
- executed_tools: `[]`
- durable_effect: `[]`
- skill_run_id: `product_help`
- skill_status: `continue`
- skill_intent: `explain_feature`
- product_flow_action: `answer_product_question`
- product_visible_task: `answer_product_question`
- product_mode: `standalone`
- product_return_to_parent: `false`

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Et si j'en ai une, je la retrouve où dans l'app ?

**Sophia**
> An invalid response was received from the upstream server

**Trace courte**
- http_status: `502`
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- safety: `null`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- memory_plan: `null`
- executed_tools: `[]`
- durable_effect: `[]`
- trace_error: `null`

**Analyse si yellow/red**
- Symptome: le follow-up attendu pour active `product_help` retourne HTTP 502 sans `conversation_turn_trace`.
- Source amont probable: runtime local endpoint / Edge Function / upstream model response; impossible de confirmer `product_help.local_dispatcher` faute de trace.
- Owner runtime: test-send-message / sophia-brain runtime observability, avec suspicion sur chemin active product_help follow-up.
- Meilleure correction selon les guidelines: rendre l'erreur upstream observable avec trace/error payload minimal et corriger la cause runtime avant rerun; ne pas masquer par fallback renderer.
- Pourquoi ce n'est pas un patch local: sans trace, patcher `product_help` serait aveugle; il faut d'abord obtenir l'erreur runtime ou la stack Edge Function.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 2: la reponse product_help est courte, utile, non-mutante, et ne lance aucune operation.
- Le refus implicite de preparer une carte est respecte quand le user dit "juste comprendre".

**Problemes**
- Tour 1: clarification probablement inutile pour une question produit claire. Famille: BF-ROUTE-03. Impact: friction UX avant l'explication. Severite: yellow.
- Tour 3: interruption technique visible "upstream server". Famille: BF-TEST-01. Impact: conversation inutilisable au moment du follow-up principal. Severite: red.

**Fix propose**
- Source amont: orientation clarification / route policy pour Tour 1; runtime endpoint observability ou active product_help path pour Tour 3.
- Correction recommandee: router directement vers product_help quand le user demande "ça sert à quoi"; pour le 502, capturer et exposer la cause Edge Function dans un trace_error QA exploitable, puis corriger le chemin actif.
- Tests d'invariant attendus: run reel `product_help` direct sans clarification pour question explicative; run reel follow-up destination avec `active_product_help` et `response_owner=product_help`, sans 502.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1: `orientation_clarification` au lieu de `product_help`, sans side effect.
- Tour 2: `response_owner=product_help`, `selected_handler=product_help`, `product_flow_action=answer_product_question`, `mode=standalone`.
- Tour 3: aucun routage observable a cause du HTTP 502.

**Skills / Operations / Tools**
- Tour 2 prouve que le chemin nominal local `product_help` peut repondre via skill run, avec `skill_status=continue`.
- Aucune operation/tool n'est executee sur les tours exploitables.
- Le follow-up actif, pourtant le coeur de la migration, n'est pas valide.

**Memory / Effets durables**
- Aucun `direct_effect`, aucun `executed_tools`, aucun `durable_effect` observe dans les traces exploitables.
- Cleanup cible effectue: 5 lignes `chat_messages` et 1 ligne `user_chat_states` du scope QA supprimees; verification REST post-cleanup vide.
- Aucune ligne `conversation_turn_traces` trouvee par `source_message_id` du run.

**Problemes**
- Tour 1: mauvais owner initial. Famille: BF-ROUTE-03. Impact systeme: product_help local n'est pas appele directement sur une question explicative. Severite: yellow.
- Tour 3: endpoint 502 sans trace. Famille: BF-TEST-01. Impact systeme: impossible de valider active product_help follow-up; observabilite insuffisante. Severite: red.

**Fix propose**
- Source amont: route policy/orientation clarification et runtime error handling du endpoint local.
- Correction recommandee: ajuster la priorisation product_help vs tool clarification pour demandes explicatives; ajouter un trace/error envelope minimal pour les erreurs upstream puis investiguer la stack Edge Function du follow-up actif.
- Tests d'invariant attendus: test integration active `product_help` follow-up destination; test QA reel qui prouve `product_help.local_dispatcher_called` puis `answer_destination`, sans global dispatcher.

## Verdict Global

- Verdict: red
- Raison principale: le chemin nominal `product_help` passe au Tour 2, mais le follow-up standalone actif retourne un HTTP 502 repete sans trace, donc le scenario cle n'est pas valide.
- Follow-up prioritaire: investiguer le 502 du Tour 3 avec logs Edge Function, puis rerun le scenario destination active product_help.

