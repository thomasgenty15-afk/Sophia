# QA Run Report — Clarification Dispatcher Fix

## 1. Contexte Du Test

- Date: 2026-06-01.
- Runs: `clarification-dispatcher-real-20260601-fix-r1c`,
  `clarification-dispatcher-real-20260601-fix-r2b`.
- Persona: users temporaires QA locaux, nettoyés en fin de run.
- Objectif: vérifier que les ambiguïtés dispatcher hors flow passent par
  `orientation_clarification`.
- Trajectoire: rappel ponctuel vs récurrent; explication produit vs préparation
  carte d'attaque.
- Surfaces visees: dispatcher L1, `TurnFrame`, clarification arbitrator,
  `clarification_tool`, rendu final, temp memory.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`,
  `force_full_ai=true`, pas de renderer déterministe.
- Validite QA: valide.

## 2. Tours De Conversation

### Tour 1 — Rappel Ponctuel Vs Récurrent

**Verdict du tour:** green

**User**
> Je veux que Sophia me relance demain matin, enfin peut-être tous les matins, je ne suis pas sûr de la forme.

**Sophia**
> Souhaitez-vous que ce rappel soit ponctuel pour demain matin ou qu'il se répète tous les matins ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: none; `scheduled_checkins_count=0`
- clarification_state: present, owner `dispatcher`, ambiguity `timing`,
  candidats `create_one_shot_reminder`, `create_recurring_reminder`,
  `no_chat_mutation=true`

### Tour 1 — Product Help Vs Carte D'attaque

**Verdict du tour:** green

**User**
> Je ne sais pas si je veux juste comprendre les cartes d’attaque ou en préparer une pour mon action du matin.

**Sophia**
> Souhaitez-vous obtenir des explications sur le fonctionnement des cartes d'attaque ou en préparer une dès maintenant ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: none; `scheduled_checkins_count=0`
- clarification_state: present, owner `dispatcher`, ambiguity `intent`,
  candidats `product_help`, `prepare_attack_card`, `no_chat_mutation=true`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Les deux réponses posent une seule question discriminante.
- Sophia ne prétend pas avoir créé, préparé ou modifié quelque chose.
- La question est compréhensible sans termes internes.

**Problemes**
- Aucun problème bloquant observé sur les runs verts.

**Fix propose**
- Aucun nouveau fix requis pour ces deux scénarios.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Les deux runs aboutissent à `response_owner=orientation_clarification` et
  `selected_handler=orientation_clarification`.
- `product_help`, `tool_skill_router`, `operation_runtime_pipeline` et
  `direct_effects` sont bloqués pendant la clarification.

**Skills / Operations / Tools**
- Aucun tool skill complexe n'est lancé.
- Aucun executor n'est appelé.

**Memory / Effets durables**
- `__clarification_state_v1` est écrit avec `no_chat_mutation=true`.
- Aucun scheduled checkin n'est créé.
- Les users temporaires et données de run ont été nettoyés de façon ciblée.
  `user_memories` retourne 404 dans cet environnement local, les autres tables
  et `auth.users` ont été nettoyés avec succès.

**Problemes**
- Aucun problème bloquant observé sur les runs verts.

**Fix propose**
- Aucun nouveau fix requis pour ces deux scénarios.

## Verdict Global

- Verdict: green
- Raison principale: les deux ambiguïtés dispatcher sont clarifiées par
  `orientation_clarification`, sans mutation ni exécution d'outil.
- Follow-up prioritaire: brancher progressivement l'adapter de clarification
  dans les conversation skills ciblés.

## Feuille De Suivi Bugs

- Bug sheet:
  `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-01-clarification-dispatcher-real-bugs.md`
