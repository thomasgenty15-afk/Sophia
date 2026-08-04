## 1. Contexte Du Test

- Date: 2026-05-21
- Run: `2026-05-21-select-state-potion-6subskills-r34-hard2-rappel`
- Variant: `hard2`
- Filtre potion: `rappel`
- Persona: `qa-skill`, 6 connexions locales temporaires dediees
- Objectif: tester les 6 sous-skills de detail du tool skill `select_state_potion` sur un flux complet routing -> collecte -> draft -> validation -> creation durable.
- Trajectoire: une conversation isolee par potion (`rappel`, `courage`, `guerison`, `clarte`, `amour`, `apaisement`), minimum 5 tours chacune.
- Surfaces visees: dispatcher, router interne potion, sous-skills detail, generation de draft, confirmation, executor, DB reminders/checkins.
- Cadre IA reel: Supabase local, `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide; erreurs HTTP observees; activation manquante sur au moins un run.

Artefacts:

- Raw: `tests/real-personas/qa-skill/runs/operations/2026-05-21-select-state-potion-6subskills-r34-hard2-rappel.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/operations/2026-05-21-select-state-potion-6subskills-r34-hard2-rappel.summary.json`
- Durable: `tests/real-personas/qa-skill/runs/operations/2026-05-21-select-state-potion-6subskills-r34-hard2-rappel.durable.json`

## 2. Tours De Conversation

### Potion rappel

Connexion: `state_potion_6subskills_state_potion_6subskills_r34_hard2_rappel_rappel`
Fixture: cycle `ec9f812d-03d3-497f-a8ca-a5700cab3ce6`, transformation `5e7fe66b-7da9-4e35-879f-1632cda7a02a`, plan item `f1c0a805-ca7b-45cb-adec-afa577b8f98d`

#### Tour 1

**User**
> Je veux une potion de rappel, mais je suis pas tres clair: mes fins de journee partent en vrille.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: none
- direct_effects: null
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)
- error: null

#### Tour 2

**User**
> Le moment a proteger, c'est quand je ferme l'ordi: soit je sors marcher dix minutes, soit je range le bureau, sinon je reporte.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: none
- direct_effects: null
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)
- error: null

#### Tour 3

**User**
> Je prefere que le rappel arrive avant que je me pose, vers 18h45. Le ton doit etre simple, pas scolaire.

**Sophia**
> C'est noté pour 18h45. Quel message veux-tu recevoir et à quelle fréquence (tous les jours, en semaine...) ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_recurring_reminder`
- route_reason: `tool_skill_intent_start`
- safety: `present`
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)

#### Tour 4

**User**
> Oui, garde ce cadre: marche ou bureau, juste un repere doux.

**Sophia**
> C'est entendu. Tu veux recevoir ce rappel à quelle fréquence ? Tous les jours, en semaine ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_recurring_reminder`
- route_reason: `active_tool_skill_continue`
- safety: `present`
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)

#### Tour 5

**User**
> Oui, active cette potion de rappel.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: none
- direct_effects: null
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)
- error: null

#### Tour 6

**User**
> Oui je confirme, lance-la.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: none
- direct_effects: null
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)
- error: null

DB observe:

- user_potion_sessions: 0; potion_type observe: `none`; status: `none`
- follow_up_strategy.duration_days: `unknown`
- user_recurring_reminders: 0; initiative_kind: `none`; source_kind: `none`
- reminder scheduled_days: `none`; local_time_hhmm: `none`
- scheduled_checkins: 0; statuses: `none`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Les 6 runs gardent un fil conversationnel dedie a la potion demandee et ne basculent pas vers un autre tool visible avant validation.
- Les messages user ne sont pas une liste fixe aveugle: chaque tour donne une precision utile pour le sous-skill cible, puis une demande de reassurance avant confirmation.

**Problemes**
- Potion rappel: activation durable manquante. Extrait: Aucune session/reminder/checkin observe.. Severite: red.
- Potion rappel tour 1: HTTP 502. Extrait: none. Severite: red.
- Potion rappel tour 1: reponse vide. Extrait: none. Severite: red.
- Potion rappel tour 2: HTTP 502. Extrait: none. Severite: red.
- Potion rappel tour 2: reponse vide. Extrait: none. Severite: red.
- Potion rappel tour 5: HTTP 502. Extrait: none. Severite: red.
- Potion rappel tour 5: reponse vide. Extrait: none. Severite: red.
- Potion rappel tour 6: HTTP 502. Extrait: none. Severite: red.
- Potion rappel tour 6: reponse vide. Extrait: none. Severite: red.

**Fix propose**
- Corriger le sous-skill ou la validation qui produit le probleme detecte, puis relancer avec au moins deux variantes.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Potion rappel: premier tour tool_skill/select_state_potion observe au tour 3.

**Skills / Operations / Tools**
- Potion rappel: executions `select_state_potion` observees: 0.

**Memory / Effets durables**
- Potion rappel: 0 session, 0 reminder, 0 checkins; type attendu observe: non; source_kind: `none`.

**Problemes**
- Au moins un tour a retourne un statut HTTP non-200. Severite: red.
- Au moins une potion n'a pas produit les side effects DB attendus. Severite: red.

**Fix propose**
- Si un sous-skill route hors `select_state_potion` ou execute deux fois, corriger le flow interne du skill, pas le dispatcher.

## Verdict Global

- Verdict: red
- Raison principale: au moins un flux ou une formulation reste non conforme.
- Follow-up prioritaire: corriger les problemes listes puis relancer.

## Nettoyage

Non effectue automatiquement. `AGENTS.md` interdit les commandes destructives DB/Auth sans demande explicite de la commande exacte dans la conversation courante. Les users QA temporaires et fixtures restent disponibles pour inspection.
