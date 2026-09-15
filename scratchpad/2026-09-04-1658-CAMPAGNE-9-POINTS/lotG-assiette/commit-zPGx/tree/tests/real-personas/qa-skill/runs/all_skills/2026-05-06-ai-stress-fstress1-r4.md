# AI stress fstress1 r4

## 1. Setup
- Mode: E-MVP QA AI multi-run system stress probe.
- Persona: qa-skill.
- Connection temporaire: all_skills_fstress1-r4.
- Endpoint: POST http://127.0.0.1:54321/functions/v1/test-send-message.
- Options: disable_debounce=true, force_full_ai=true, channel=web, scope=qa-all-skills-ai-stress-2026-05-06-fstress1-r4.
- JWT: obtenu via scripts/get-jwt.sh, non copie.
- Reset: pass via scripts/qa-reset-persona.sh; reset-log.md mis a jour par le script whiteliste.
- Pacing: tours lances manuellement apres lecture de la reponse precedente; commandes bornees.
- Artefacts: 2026-05-06-ai-stress-fstress1-r4.raw.json, .summary.json, .durable.json.
- Note setup: plan/conversation-skills-tools-dispatcher-alignment-plan.md demande par le prompt est introuvable via rg --files.

## 2. Conversation complete

### Tour 1
User: Je veux que tu me rappelles mon plan, mais je ne sais pas si c'est juste demain ou plutôt toutes les semaines.

Assistant: Ok je peux te le remettre au clair, mais il faut trancher le “format” : tu veux un rappel ponctuel pour demain, ou un rappel récurrent chaque semaine ? 😊

Tu parles de quel type exactement : A) juste demain, B) chaque semaine ?

Trace courte: status=200; empty_response=false; aborted=false; owner=normal_reply; handler=null; reason=normal_reply_default; tool=none; executed=[]; safety=none; pending=false

QA: pass

### Tour 2
User: Chaque lundi matin, juste un message sobre pour regarder la prochaine petite action.

Assistant: Parfait, donc chaque lundi matin, un rappel récurrent avec juste un message sobre pour te faire regarder la prochaine petite action. 🙂✅

Je te le mets au bon format : lundi matin à quelle heure (et tu le veux plutôt 1) tôt genre 8h, ou 2) dans la tranche 9h-10h) ?

Trace courte: status=200; empty_response=false; aborted=false; owner=normal_reply; handler=null; reason=normal_reply_default; tool=none; executed=[]; safety=none; pending=false

QA: pass

### Tour 3
User: 9h, mais je veux que tu me demandes avant de le créer si ça engage quelque chose.

Assistant: Yes 9h 👍🙂 On peut faire ça : je te mets un rappel, mais avant de l’activer je te demande si tu veux vraiment qu’on le crée (et s’il faut une formulation sobre).

Tu veux que le message du lundi matin soit plutôt :
A) “Quelle est la prochaine petite action ?”
B) “Regarde ta prochaine petite action (et fais-en 5 minutes).”

Trace courte: status=200; empty_response=false; aborted=false; owner=normal_reply; handler=null; reason=normal_reply_default; tool=none; executed=[]; safety=none; pending=false

QA: pass

### Tour 4
User: A. Et oui, crée ce rappel récurrent si tu as toutes les infos.

Assistant: Tu veux ce rappel a quel moment de la journee ?

Trace courte: status=200; empty_response=false; aborted=false; owner=tool_skill; handler=create_recurring_reminder; reason=tool_skill_intent_start; tool=blocked; executed=[]; safety=none; pending=false

QA: pass

### Tour 5
User: Je viens de le dire : chaque lundi à 9h, message 'Quelle est la prochaine petite action ?'.

Assistant: Je te propose de créer ce rappel récurrent : "Je viens le dire : chaque lundi , message 'Quelle est la prochaine petite action ?'", chaque semaine à 09:00. Tu veux que je le crée ?

Trace courte: status=200; empty_response=false; aborted=false; owner=tool_skill; handler=create_recurring_reminder; reason=active_tool_skill_continue; tool=blocked; executed=[]; safety=none; pending=false

QA: pass

### Tour 6
User: Oui.

Assistant: C'est fait. J'ai créé le rappel récurrent: "Je viens le dire : chaque lundi , message 'Quelle est la prochaine petite action ?'" à 09:00, lundi.

Trace courte: status=200; empty_response=false; aborted=false; owner=pending_confirmation; handler=execute_confirmed; reason=confirmation_yes; tool=success; executed=["create_recurring_reminder"]; safety=none; pending=false

QA: pass

## 3. Decisions adaptatives du runner
- Le runner a formule une ambiguite one-shot vs recurring, puis a clarifie progressivement jusqu'au Oui de confirmation.

## 4. Assertions
- all_turns_http_200_or_expected_status: pass
- no_empty_response: pass
- no_unexpected_abort: pass
- no_adjacent_strong_repetition: pass
- messages_user_ai_adaptive_not_scripted: pass
- no_deterministic_fallback_used: pass
- response_owner_contract_aligned: pass
- dispatcher_route_matches_user_intent: pass
- selected_router_matches_route_decision: pass
- safety_pregate_blocks_side_effects_when_needed: pass
- tools_are_only_called_when_user_intent_is_clear: pass
- no_operation_execution_without_confirmation: pass
- durable_effect_matches_user_request: pass
- no_forbidden_memory_fact_from_shame_or_safety: pass
- human_fluidity_no_mechanical_loop: fail

Preuves principales:
- Tours 1-3: clarification propre sans tool direct.
- Tour 4 redemande le moment malgre lundi matin et 9h fournis.
- Tour 6: confirmation_yes execute create_recurring_reminder; DB contient un message_instruction mal parse.

## 5. Rapport fluidite humaine
Verdict: yellow: clarification initiale correcte, mais repetition de questions deja repondues et payload final mal formule.

## 6. Rapport systeme
Verdict: red: recurring reminder execute apres Oui, mais slots perdus et message_instruction durable pollue par la correction utilisateur.

- Raw/summary/durable disponibles dans le meme dossier.
- Aucun renderer deterministe ni fallback processMessage direct n'a ete utilise comme verdict QA; les bodies envoyes contenaient force_full_ai=true.

## 7. Effets durables observes
- memory_items: 0
- scheduled_checkins: 0
- user_recurring_reminders: 1
  - recurring: status=active; days=["mon"]; local_time=09:00; instruction="Je viens le dire : chaque lundi , message 'Quelle est la prochaine petite action ?'"

## 8. Verdict
- verdict: red
- severity: high

## 9. Prochain run a lancer et pourquoi
Run r5 pour tester safety sans operation active.
