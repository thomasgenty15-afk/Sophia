# QA Run — Multi-Intent Reminder + Attack Card — Postfix R7

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `clarification-multi-intent-reminder-attack-20260603-postfix-r7`
- Persona: utilisateur temporaire QA dédié, créé via Auth local puis nettoyé
- Objectif: vérifier la correction du cas composite rappel ponctuel + demande immédiate de carte d'attaque
- Trajectoire: un tour réel via `/functions/v1/test-send-message`, `force_full_ai=true`, `client_now_iso=2026-06-03T15:18:00.000+02:00`
- Surfaces visees: dispatcher, TurnFrame, one-shot reminder, TurnAgenda, rendu post-opération multi-intent
- Cadre IA reel: Supabase local, Edge Function locale, runtime rechargé, pas de renderer déterministe, pas de fallback direct
- Validite QA: valide

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-AGENDA-01 — Multi-intention incomplete

**User**
> J'aimerais que tous me rappelle dans 10 minutes de prendr mes médicaments, et là tout de suite j'aimerais qu'on crée une carte d'attaque

**Sophia**
> C'est programmé pour mercredi 03 juin à 15:28.
>
> Je garde aussi la suite : « et là tout de suite j'aimerais qu'on crée une carte d'attaque ». Tu veux qu'on la traite maintenant ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `low`
- direct_effects: `["create_one_shot_reminder"]`
- operation: `create_one_shot_reminder`
- pending_confirmation: none
- memory_plan: no clarification state
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: `scheduled_checkins[0].scheduled_for=2026-06-03T13:28:00+00:00`, `event_context=one_shot_reminder:prendr_mes_medicaments`

**Analyse si yellow/red**
- Symptome: Sophia ne perd plus la deuxième demande dans le transcript, mais `tool_skill_intents` reste vide et l'agenda ne porte pas encore `prepare_attack_card`.
- Source amont probable: dispatcher/TurnFrame ne produit pas encore de second signal structuré exploitable pour l'agenda malgré le repair LLM.
- Owner runtime: dispatcher composite coverage + TurnAgenda.
- Meilleure correction selon les guidelines: garder le fallback conversationnel comme garde non-mutant, puis stabiliser la production structurée du second intent dans le dispatcher sans regex métier.
- Pourquoi ce n'est pas un patch local: le rendu protège l'expérience, mais le contrat owner/runtime multi-intent reste incomplet tant que l'agenda ne voit pas la deuxième tâche.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia confirme le rappel à l'heure attendue.
- Sophia tutoie.
- Sophia fait explicitement le lien avec la suite au lieu de l'ignorer.
- Elle n'exécute pas la carte d'attaque depuis le chat.

**Problemes**
- Tour 1: la reprise reste générique et cite la suite, au lieu d'ouvrir directement une clarification métier du type action cible de la carte. Famille: BF-AGENDA-01. Impact: l'utilisateur doit confirmer/reformuler un peu plus. Severite: yellow.

**Fix propose**
- Source amont: dispatcher composite intent coverage.
- Correction recommandee: produire `prepare_attack_card` comme signal structuré quand le LLM identifie explicitement la deuxième demande, puis laisser l'agenda/rendu poser la question métier dédiée.
- Tests d'invariant attendus: rappel + carte attaque, rappel + ajustement plan, rappel seul avec action concrète, carte attaque seule.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le routeur sélectionne `create_one_shot_reminder` et exécute uniquement l'effet atomique.
- Le second intent n'est pas présent dans `tool_skill_intents`.
- Le fallback post-opération détecte que le `raw_text` du direct effect ne couvre pas tout le message et garde la suite visible sans mutation.

**Skills / Operations / Tools**
- `create_one_shot_reminder` est exécuté avec succès.
- Aucun tool skill complexe n'est lancé.
- `prepare_attack_card` n'est pas lancé et n'est pas encore représenté comme handoff agenda.

**Memory / Effets durables**
- Un `scheduled_checkins` a été créé puis nettoyé.
- L'effet durable est maintenant centré sur les médicaments: `event_context=one_shot_reminder:prendr_mes_medicaments`.
- Cleanup ciblé OK pour `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`. `user_memories` retourne 404 car table absente localement.

**Problemes**
- Tour 1: deuxième intention visible côté transcript mais absente du TurnFrame/agenda. Famille: BF-AGENDA-01. Impact système: reprise conversationnelle non structurée. Severite: yellow.

**Fix propose**
- Source amont: dispatcher repair / structured output contract.
- Correction recommandee: renforcer la sortie structurée du repair ou exposer un champ agenda non-mutant pour les segments non couverts, sans routing métier par regex.
- Tests d'invariant attendus: le transcript ne perd jamais une suite non couverte ; quand le second intent est structuré, le fallback générique ne doit pas s'afficher.

## Verdict Global

- Verdict: yellow
- Raison principale: le problème utilisateur immédiat est mitigé et le rappel durable est corrigé, mais le second intent n'est pas encore structuré dans l'agenda.
- Follow-up prioritaire: transformer la reprise conversationnelle en tâche agenda structurée quand le dispatcher LLM identifie explicitement la deuxième demande.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-03-clarification-multi-intent-reminder-attack-bugs.md`
