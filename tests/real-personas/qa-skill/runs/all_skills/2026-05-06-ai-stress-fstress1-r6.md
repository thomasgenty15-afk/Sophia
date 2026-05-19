# AI stress fstress1 r6

## 1. Setup
- Mode: E-MVP QA AI multi-run system stress probe.
- Persona: qa-skill.
- Connection temporaire: all_skills_fstress1-r6.
- Endpoint: POST http://127.0.0.1:54321/functions/v1/test-send-message.
- Options: disable_debounce=true, force_full_ai=true, channel=web, scope=qa-all-skills-ai-stress-2026-05-06-fstress1-r6.
- JWT: obtenu via scripts/get-jwt.sh, non copie.
- Reset: pass via scripts/qa-reset-persona.sh; reset-log.md mis a jour par le script whiteliste.
- Pacing: tours lances manuellement apres lecture de la reponse precedente; commandes bornees.
- Artefacts: 2026-05-06-ai-stress-fstress1-r6.raw.json, .summary.json, .durable.json.
- Note setup: plan/conversation-skills-tools-dispatcher-alignment-plan.md demande par le prompt est introuvable via rg --files.

## 2. Conversation complete

### Tour 1
User: Comment je modifie une action de mon plan si elle est trop grosse ? Je ne veux pas refaire tout le plan.

Assistant: Je vois le souci : si l’action est trop grosse, tu veux surtout la “découper” sans tout casser. 💡

1) Tu vas dans le dashboard sur l’action concernée (section Habitudes ou Missions selon son type).
2) Tu la mets à jour en mode “plus petit” : réduire la durée, le nombre de fois, ou remplacer par une version allégée (ex : “30 min” → “10 min”, “préparer tout” → “faire la 1re étape”).
3) Si tu veux éviter de toucher au reste : tu ne modifies que cette action-là (pas de replan global).

Tu me dis juste : c’est une mission ponctuelle ou une habitude quotidienne/hebdo ? (A/B)

Trace courte: status=200; empty_response=false; aborted=false; owner=product_help; handler=product_help; reason=product_signal; tool=none; executed=[]; safety=none; pending=false

QA: pass

### Tour 2
User: Mission ponctuelle : 'ranger tous mes papiers'. Je veux que tu proposes un ajustement plus petit et que tu me demandes avant de l'appliquer.

Assistant: Je peux l'ajuster, mais il me manque la cible exacte. Donne-moi le nom de l'action du plan a clarifier.

Trace courte: status=200; empty_response=false; aborted=false; owner=tool_skill; handler=adjust_plan_item; reason=tool_skill_intent_start; tool=blocked; executed=[]; safety=none; pending=false

QA: pass

### Tour 3
User: Le nom exact est 'ranger tous mes papiers'. Je veux la réduire à 'trier seulement trois documents'.

Assistant: Parfait. On transforme “ranger tous mes papiers” en une version plus petite et tenable : “trier seulement trois documents” 📄✅

Je te la propose comme nouvelle action :
- Nom : trier seulement trois documents
- Mission (petite) : choisir 3 documents au hasard ou selon priorité, et ne faire que le tri (garder / jeter / classeur)

Tu confirmes que tu veux bien que je l’applique telle quelle, ou tu préfères que je précise lesquels (ex: factures 2025, papiers d’identité, assurance) avant d’appliquer ? 😊

Trace courte: status=200; empty_response=false; aborted=false; owner=conversation_handler; handler=execution_breakdown; reason=skill_entry_signal; tool=none; executed=[]; safety=none; pending=false

QA: pass

### Tour 4
User: Oui, applique-la telle quelle.

Assistant: Top, c’est validé ✅

Je te la propose à appliquer tout de suite dans ton dashboard : dans l’action “ranger tous mes papiers”, remplace/ajuste en “trier seulement trois documents” avec la mission “choisir 3 documents et ne faire que le tri (garder/jeter/classeur)”.

Tu veux que je te guide pour le faire en 2 clics ? 😄

Trace courte: status=200; empty_response=false; aborted=false; owner=conversation_handler; handler=execution_breakdown; reason=active_skill_continue; tool=none; executed=[]; safety=none; pending=false

QA: pass

## 3. Decisions adaptatives du runner
- Le runner a demarre par une question produit sur l'ajustement de plan, puis a demande une proposition d'ajustement avec confirmation explicite.

## 4. Assertions
- all_turns_http_200_or_expected_status: pass
- no_empty_response: pass
- no_unexpected_abort: pass
- no_adjacent_strong_repetition: pass
- messages_user_ai_adaptive_not_scripted: pass
- no_deterministic_fallback_used: pass
- response_owner_contract_aligned: fail
- dispatcher_route_matches_user_intent: fail
- selected_router_matches_route_decision: pass
- safety_pregate_blocks_side_effects_when_needed: pass
- tools_are_only_called_when_user_intent_is_clear: pass
- no_operation_execution_without_confirmation: fail
- durable_effect_matches_user_request: n/a
- no_forbidden_memory_fact_from_shame_or_safety: pass
- human_fluidity_no_mechanical_loop: fail

Preuves principales:
- Tour 2: adjust_plan_item demande le nom exact alors que le message contenait deja la cible.
- Tours 3-4: confirmation naturelle traitee comme conversation, pas pending_confirmation.

## 5. Rapport fluidite humaine
Verdict: yellow/red: explication produit correcte, puis operation trop fragile et confirmation Oui non priorisee comme pending.

## 6. Rapport systeme
Verdict: red: adjust_plan_item demarre mais perd la cible fournie, sort vers execution_breakdown, puis confirme sans pending_tool_skill_confirmation ni execution durable.

- Raw/summary/durable disponibles dans le meme dossier.
- Aucun renderer deterministe ni fallback processMessage direct n'a ete utilise comme verdict QA; les bodies envoyes contenaient force_full_ai=true.

## 7. Effets durables observes
- memory_items: 0
- scheduled_checkins: 0
- user_recurring_reminders: 0

## 8. Verdict
- verdict: red
- severity: high

## 9. Prochain run a lancer et pourquoi
Arret famille apres 6 runs: synthese et follow-ups requis.
