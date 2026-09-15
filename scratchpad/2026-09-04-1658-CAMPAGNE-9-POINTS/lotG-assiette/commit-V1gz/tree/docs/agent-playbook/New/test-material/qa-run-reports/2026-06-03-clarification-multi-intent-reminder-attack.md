# QA Run — Multi-Intent Reminder + Attack Card

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `clarification-multi-intent-reminder-attack-20260603-r2`
- Persona: utilisateur temporaire QA dédié, créé via Auth local puis nettoyé
- Objectif: observer la réaction réelle de Sophia à une demande composite rappel + carte d'attaque
- Trajectoire: un tour réel via `/functions/v1/test-send-message`, `force_full_ai=true`, `client_now_iso=2026-06-03T15:18:00.000+02:00`
- Surfaces visees: dispatcher, TurnFrame, direct effects, one-shot reminder, operation/tool arbitration, multi-intent agenda
- Cadre IA reel: Supabase local, Edge Function locale, pas de renderer déterministe, pas de fallback direct
- Validite QA: valide. Incident: un premier run `r1` a utilisé le `client_now_iso` par défaut du runner (`2026-05-22T10:00+02:00`), donc il a été nettoyé et non retenu pour le verdict temporel.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-AGENDA-01 — Multi-intention incomplete ; BF-INTAKE-02 — Extraction trop large ou polluee

**User**
> J'aimerais que tous me rappelle dans 10 minutes de prendr mes médicaments, et là tout de suite j'aimerais qu'on crée une carte d'attaque

**Sophia**
> C'est programmé pour mercredi 03 juin à 15:28. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `low`
- direct_effects: `["create_one_shot_reminder"]`
- operation: `create_one_shot_reminder`
- pending_confirmation: none
- memory_plan: pas de `__clarification_state_v1`
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: `scheduled_checkins[0].scheduled_for=2026-06-03T13:28:00+00:00`, `event_context=one_shot_reminder:attaque`, aucun `prepare_attack_card`

**Analyse si yellow/red**
- Symptome: Sophia exécute seulement le rappel, ne traite pas la demande immédiate de carte d'attaque, et le rappel porte un contexte pollué par `attaque` au lieu de médicament.
- Source amont probable: TurnAgenda / arbitration n'organise pas les deux intentions ; l'intake du rappel absorbe une partie du second intent.
- Owner runtime: dispatcher agenda + one-shot reminder intake/direct effect compiler.
- Meilleure correction selon les guidelines: représenter la demande comme multi-intent structurée rappel + tool skill, isoler le payload rappel sur “prendre mes médicaments”, puis soit séquencer le rappel et ouvrir la carte, soit demander une clarification d'ordre si le runtime ne peut pas enchaîner.
- Pourquoi ce n'est pas un patch local: le défaut vient de l'agenda et du contrat d'extraction, pas d'une phrase exacte ni d'un wording renderer.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- La réponse est courte et confirme un rappel à +10 minutes avec une date cohérente avec `client_now_iso`.

**Problemes**
- Tour 1: Sophia ignore complètement “là tout de suite j'aimerais qu'on crée une carte d'attaque”. Famille: BF-AGENDA-01. Impact: l'utilisateur perd la moitié de sa demande. Severite: red.
- Tour 1: la réponse dit “C'est programmé” mais ne précise pas le contenu du rappel, alors que la DB montre un contexte pollué par `attaque`. Famille: BF-INTAKE-02. Impact: risque de rappel incorrect. Severite: red.

**Fix propose**
- Source amont: agenda multi-intent + intake one-shot reminder.
- Correction recommandee: découper les intentions avant exécution et empêcher le payload du rappel d'inclure le second intent tool.
- Tests d'invariant attendus: rappel + carte attaque dans un même message ; rappel seul “médicaments” ; carte attaque seule ; paraphrase avec fautes ; anti-faux-positif product help “explique carte d'attaque”.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le routeur sélectionne `create_one_shot_reminder` uniquement.
- Aucun signal visible de `prepare_attack_card`.
- Pas de `orientation_clarification`, pas de séquencement multi-intent.

**Skills / Operations / Tools**
- `create_one_shot_reminder` est exécuté avec succès.
- `prepare_attack_card` n'est pas lancé et n'est pas mis en handoff.
- Aucun executor de carte n'est appelé.

**Memory / Effets durables**
- Un `scheduled_checkins` est créé puis nettoyé en fin de run.
- Le scheduled checkin retenu avant cleanup avait `event_context=one_shot_reminder:attaque`, signe que l'extraction du rappel est polluée.
- Cleanup ciblé OK pour `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`. `user_memories` retourne 404 car table absente localement.

**Problemes**
- Tour 1: seconde intention perdue. Famille: BF-AGENDA-01. Impact systeme: workflow incomplet. Severite: red.
- Tour 1: payload rappel contaminé par le domaine carte d'attaque. Famille: BF-INTAKE-02. Impact systeme: effet durable faux ou ambigu. Severite: red.

**Fix propose**
- Source amont: TurnAgenda / direct effect compiler / one-shot reminder intake.
- Correction recommandee: agenda composite avant admission executor, puis payload compiler borné au segment rappel.
- Tests d'invariant attendus: aucun second intent ne doit polluer `event_context` du rappel ; les tool intents concurrents doivent être conservés ou clarifiés.

## Verdict Global

- Verdict: red
- Raison principale: Sophia exécute un effet durable partiel et pollué, tout en perdant la demande immédiate de carte d'attaque.
- Follow-up prioritaire: corriger la gestion multi-intent rappel + tool skill et l'isolation du payload one-shot reminder.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-03-clarification-multi-intent-reminder-attack-bugs.md`
