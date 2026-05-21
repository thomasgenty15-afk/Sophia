## 1. Contexte Du Test

- Date: 2026-05-21
- Run: `2026-05-21-select-state-potion-6subskills-r45-hard2-rappel`
- Variant: `hard2`
- Filtre potion: `rappel`
- Persona: `qa-skill`, 6 connexions locales temporaires dediees
- Objectif: tester les 6 sous-skills de detail du tool skill `select_state_potion` sur un flux complet routing -> collecte -> draft -> validation -> creation durable.
- Trajectoire: une conversation isolee par potion (`rappel`, `courage`, `guerison`, `clarte`, `amour`, `apaisement`), minimum 5 tours chacune.
- Surfaces visees: dispatcher, router interne potion, sous-skills detail, generation de draft, confirmation, executor, DB reminders/checkins.
- Cadre IA reel: Supabase local, `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide; aucune erreur HTTP bloquante; 1 activation(s) durable(s) observee(s).

Artefacts:

- Raw: `tests/real-personas/qa-skill/runs/operations/2026-05-21-select-state-potion-6subskills-r45-hard2-rappel.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/operations/2026-05-21-select-state-potion-6subskills-r45-hard2-rappel.summary.json`
- Durable: `tests/real-personas/qa-skill/runs/operations/2026-05-21-select-state-potion-6subskills-r45-hard2-rappel.durable.json`

## 2. Tours De Conversation

### Potion rappel

Connexion: `state_potion_6subskills_state_potion_6subskills_r45_hard2_rappel_rappel`
Fixture: cycle `c8e17a81-8487-4fbb-86e5-a9e1fec61ed7`, transformation `ad510de4-5011-4c28-b41b-87668fb7268a`, plan item `47e17639-0897-41a8-9248-fc6a9c6b6f02`

#### Tour 1

**User**
> Je veux une potion de rappel, mais je suis pas tres clair: mes fins de journee partent en vrille.

**Sophia**
> Je vois, tes fins de journée glissent. Et ça se passe comment concrètement, tu te laisses plutôt déborder par des imprévus ou c'est l'élan qui retombe ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `present`
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)

#### Tour 2

**User**
> Le moment a proteger, c'est quand je ferme l'ordi: soit je sors marcher dix minutes, soit je range le bureau, sinon je reporte.

**Sophia**
> Le moment où tu fermes l'ordinateur est celui où tout peut basculer vers le report. Pour t'aider à garder le cap sur ta marche ou le rangement du bureau, je peux t'envoyer un signe chaque soir à 18h00 pendant une semaine. C'est ce qu'il te faut pour marquer la transition ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_select_state_potion_kept_in_tool_skill`
- safety: `present`
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: 0 session(s), 0 reminder(s), 0 checkin(s)

#### Tour 3

**User**
> Je prefere que le rappel arrive avant que je me pose, vers 18h45. Le ton doit etre simple, pas scolaire.

**Sophia**
> On décale à 18h45 pour attraper le moment juste avant que tu ne t'installes. Je t'enverrai un mot chaque soir pendant une semaine pour t'aider à basculer vers ta marche ou le rangement du bureau sans que ça devienne une corvée. C'est ce qu'il te faut pour garder l'élan ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_select_state_potion_kept_in_tool_skill`
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
> Je garde ce repère doux à 18h45 pour t'aider à fermer l'ordinateur et basculer vers ta marche ou le rangement du bureau. Je t'enverrai un mot chaque soir pendant une semaine pour protéger ce pivot sans ajouter de pression. Dis-moi si c'est bien ce qu'il te faut pour garder l'élan. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_select_state_potion_kept_in_tool_skill`
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
> C'est normal de sentir l'élan retomber au moment de la transition. On va juste s'assurer que ce passage ne devienne pas un poids. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_select_state_potion_kept_in_tool_skill`
- safety: `present`
- direct_effects: `[object Object]`
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: `select_state_potion`
- durable_effect: 1 session(s), 1 reminder(s), 7 checkin(s)

DB observe:

- user_potion_sessions: 1; potion_type observe: `rappel`; status: `completed`
- follow_up_strategy.duration_days: `7`
- user_recurring_reminders: 1; initiative_kind: `potion_follow_up`; source_kind: `potion_generated`
- reminder scheduled_days: `fri,sat,sun,mon,tue,wed,thu`; local_time_hhmm: `18:45`
- scheduled_checkins: 7; statuses: `pending`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Les 6 runs gardent un fil conversationnel dedie a la potion demandee et ne basculent pas vers un autre tool visible avant validation.
- Les messages user ne sont pas une liste fixe aveugle: chaque tour donne une precision utile pour le sous-skill cible, puis une demande de reassurance avant confirmation.
- Le scan automatique ne detecte aucune signature de template, aucune option interne visible, aucune reponse vide et aucune activation manquante.

**Problemes**
- Aucun probleme de fluidite detecte automatiquement. Severite: green.

**Fix propose**
- Aucun fix requis pour ce run.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Potion rappel: premier tour tool_skill/select_state_potion observe au tour 1.

**Skills / Operations / Tools**
- Potion rappel: executions `select_state_potion` observees: 1.

**Memory / Effets durables**
- Potion rappel: 1 session, 1 reminder, 7 checkins; type attendu observe: oui; source_kind: `potion_generated`.

**Problemes**
- Aucun probleme systeme bloquant detecte automatiquement sur activation et effets durables. Severite: green.

**Fix propose**
- Si un sous-skill route hors `select_state_potion` ou execute deux fois, corriger le flow interne du skill, pas le dispatcher.

## Verdict Global

- Verdict: green
- Raison principale: les 6 flux sont techniquement complets et le scan de fluidite automatique est propre.
- Follow-up prioritaire: conserver ce run comme baseline hard et relancer une variante distincte pour eviter l'overfit.

## Nettoyage

Non effectue automatiquement. `AGENTS.md` interdit les commandes destructives DB/Auth sans demande explicite de la commande exacte dans la conversation courante. Les users QA temporaires et fixtures restent disponibles pour inspection.
