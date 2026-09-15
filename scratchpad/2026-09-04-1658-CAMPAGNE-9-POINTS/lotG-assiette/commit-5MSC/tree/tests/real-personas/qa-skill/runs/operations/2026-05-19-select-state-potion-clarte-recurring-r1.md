## 1. Contexte Du Test

- Date: 2026-05-19
- Run: `2026-05-19-select-state-potion-clarte-recurring-r1`
- Persona: `qa-skill`, connexion locale temporaire dediee
- Objectif: verifier qu'une potion de clarte peut etre calee sur une action recurrente mardi/jeudi a 8h30.
- Trajectoire: demande directe d'une potion de clarte pour les reunions du mardi et jeudi matin.
- Surfaces visees: dispatcher, tool skill `select_state_potion`, sous-skill `clarte`, schedule planner action-aware, binding action recurrente, side effects DB.
- Cadre IA reel: Supabase local, `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: invalide pour validation fonctionnelle. Les POST IA reelle retournent `504 {"message":"The upstream server is timing out"}` avant trace applicative.

Artefacts:

- Raw: `tests/real-personas/qa-skill/runs/operations/2026-05-19-select-state-potion-clarte-recurring-r1.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/operations/2026-05-19-select-state-potion-clarte-recurring-r1.summary.json`
- Durable: `tests/real-personas/qa-skill/runs/operations/2026-05-19-select-state-potion-clarte-recurring-r1.durable.json`

## 2. Tours De Conversation

### Tour 1

**User**
> Sophia, je veux une potion de clarté pour mes réunions du mardi et du jeudi à 8h30. J'arrive souvent flou ; j'ai besoin d'identifier le point prioritaire et la décision à faire avancer avant d'entrer en réunion.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 504
- gateway_body: `{"message":"The upstream server is timing out"}`
- response_owner: null
- selected_handler: null
- direct_effects: none
- executed_tools: none
- durable_effect: 0 session potion, 0 reminder, 0 scheduled checkin

### Tour 2

**User**
> Je retente après redémarrage : je veux une potion de clarté pour mes réunions du mardi et du jeudi à 8h30. J'arrive souvent flou ; je veux identifier le point prioritaire et la décision à faire avancer avant chaque réunion.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 504
- gateway_body: `{"message":"The upstream server is timing out"}`
- response_owner: null
- selected_handler: null
- direct_effects: none
- executed_tools: none
- durable_effect: 0 session potion, 0 reminder, 0 scheduled checkin
- incident: retry effectue apres redemarrage local de `supabase functions serve`; le 504 persiste.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Aucun comportement conversationnel exploitable: Sophia ne repond jamais.

**Problemes**
- Tours 1-2: timeout gateway avant reponse. Impact: impossible de juger le ton, la collecte des deux champs, la confirmation ou l'explication du reminder.

**Fix propose**
- Stabiliser le chemin IA local, puis relancer le meme scenario avec lecture tour par tour.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Aucun routage observable: pas de `conversation_turn_trace`, pas de `response_owner`, pas de `selected_handler`.

**Skills / Operations / Tools**
- `select_state_potion` n'est jamais atteint de maniere observable.
- Aucun executor ni fallback direct n'a ete utilise.

**Memory / Effets durables**
- Snapshot DB apres retries: 0 `user_potion_sessions`, 0 `user_recurring_reminders`, 0 `scheduled_checkins`.
- Les fixtures QA non destructives existent: user test avec cycle actif, transformation active, plan actif et habitude active "Préparer mes réunions du mardi et jeudi".

**Problemes**
- Tous les tours retournent `504 {"message":"The upstream server is timing out"}` avant trace applicative. Impact systeme: run invalide pour verifier le binding recurrent mardi/jeudi.

**Fix propose**
- Diagnostiquer le runtime local Supabase/Edge/LLM: la panne est en amont du router observable. Refaire le run seulement quand un tour simple `force_full_ai=true` produit une trace.

## Verdict Global

- Verdict: red
- Raison principale: run techniquement invalide, aucun tour n'atteint Sophia.
- Verification durable: aucune potion ni aucun reminder n'a ete cree.

