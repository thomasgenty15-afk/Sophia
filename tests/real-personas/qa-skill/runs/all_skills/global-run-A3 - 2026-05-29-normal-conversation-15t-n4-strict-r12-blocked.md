# Global Run A3 - 2026-05-29 - Normal Conversation 15T - N4 - Strict R12 Blocked

## 1. Contexte Du Test

- Date: 2026-05-29
- Run: `global_run_A3_20260529_n4_strict_r12`
- Persona: connexion temporaire QA dediee, user cree puis supprime (`d51611d5-c1c5-4e2f-a270-b3a120835a44`)
- Objectif: rejouer le meme perimetre que le run precedent N4/A3 pour verifier les corrections sur potion, sortie de mode, product help, rappel, preference coach, memoire et recap final.
- Trajectoire prevue: 15 tours libres, choisis tour par tour apres lecture des reponses Sophia.
- Surfaces visees: dispatcher, skills potion/product help, scheduled checkins, update coach preferences, memory, routing, traces.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe.
- Validite QA: invalide. Le run a ete bloque avant le tour 1 par la couche de securite locale car l'appel IA reel pouvait envoyer le contexte QA Sophia vers une API IA externe.

## 2. Tours De Conversation

Aucun tour conversationnel exploitable n'a ete execute.

### Tentative Tour 1

**User**
> Je sors d'un appel client et je me sens eparpille. Je dois repondre sans m'enflammer, mais je ne veux pas un plan complet. Donne-moi juste un premier geste.

**Sophia**
> Non execute. L'appel local `test-send-message` a ete refuse avant execution.

**Trace courte**
- http_status: non applicable
- response_owner: non applicable
- selected_handler: non applicable
- route_reason: non applicable
- safety: non applicable
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucun
- memory_plan: aucun
- executed_tools: aucun
- durable_effect: aucun

**Incident**
- Premier essai refuse: export potentiel du contexte QA Sophia vers une API IA externe.
- Deuxieme essai refuse malgre justification explicite mentionnant l'autorisation utilisateur.
- Message de policy: refus d'envoyer le contexte Sophia QA a une API IA externe, meme avec approbation utilisateur.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Rien a evaluer cote conversation: Sophia n'a pas repondu.

**Problemes**
- Tour 1: run bloque avant reponse. Impact: impossible de juger fluidite, clarifications, transitions ou sortie de mode. Severite: red.

**Fix propose**
- Executer ce run dans un environnement ou le chemin IA reel Sophia autorise explicitement le provider externe requis, ou configurer un provider local/approuve compatible avec le playbook.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Non evalue: le dispatcher Sophia n'a pas ete atteint.

**Skills / Operations / Tools**
- Non evalue: aucune skill, operation ou tool n'a ete appele.

**Memory / Effets durables**
- Aucun effet durable Sophia observe.
- Nettoyage cible effectue apres blocage:
  - `chat_messages`: 204
  - `scheduled_checkins`: 204
  - `user_chat_states`: 204
  - `user_topic_memories`: 204
  - `memory_items`: 204
  - `auth.users`: 200
  - `user_memories`: 404 attendu dans cet environnement

**Problemes**
- Tentative tour 1: blocage policy local sur appel IA externe. Impact systeme: run strict impossible depuis cette session. Severite: red.

**Fix propose**
- Ne pas utiliser de fallback non-IA ou scripted.
- Relancer depuis une session/environnement dont la policy autorise le provider IA reel, puis produire un vrai rapport conversationnel 15 tours.

## Verdict Global

- Verdict: red
- Raison principale: run strict invalide, bloque avant le tour 1 par la policy locale d'appel IA externe.
- Follow-up prioritaire: relancer le meme scenario A3/N4 dans un environnement autorise pour le chemin IA reel Sophia.
