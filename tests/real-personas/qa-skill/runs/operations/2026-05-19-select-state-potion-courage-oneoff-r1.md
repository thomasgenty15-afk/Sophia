## 1. Contexte Du Test

- Date: 2026-05-19
- Run: `2026-05-19-select-state-potion-courage-oneoff-r1`
- Persona: `qa-skill`, connexion locale temporaire dediee
- Objectif: verifier qu'une potion de courage peut etre calee sur un evenement ponctuel, sans creer une serie 7 jours inutile.
- Trajectoire: demande directe d'une potion de courage pour un appel client le mercredi 20 mai 2026 a 10h.
- Surfaces visees: dispatcher, tool skill `select_state_potion`, sous-skill `courage`, schedule planner action-aware, side effects DB.
- Cadre IA reel: Supabase local, `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: invalide pour validation fonctionnelle. Tous les POST IA reelle retournent `504 {"message":"The upstream server is timing out"}` avant trace applicative.

Artefacts:

- Raw: `tests/real-personas/qa-skill/runs/operations/2026-05-19-select-state-potion-courage-oneoff-r1.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/operations/2026-05-19-select-state-potion-courage-oneoff-r1.summary.json`
- Durable: `tests/real-personas/qa-skill/runs/operations/2026-05-19-select-state-potion-courage-oneoff-r1.durable.json`

## 2. Tours De Conversation

### Tour 1

**User**
> Sophia, je veux une potion de courage pour mon appel client de mercredi 20 mai 2026 à 10h. J'ai peur d'être jugé et la première marche c'est juste d'appuyer sur appeler puis dire la première phrase.

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
> Je relance : j'aimerais une potion de courage pour mon appel client mercredi 20 mai 2026 à 10h. Ce qui me bloque c'est le regard de l'autre ; mon premier pas, c'est appuyer sur appeler et dire la première phrase.

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

### Tour 3

**User**
> Je retente : je veux une potion de courage pour l'appel client de mercredi 20 mai 2026 à 10h. Le blocage, c'est le regard de l'autre ; le premier pas, c'est appuyer sur appeler et dire ma première phrase.

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

### Tour 4

**User**
> Après redémarrage du runtime local, je retente : je veux une potion de courage pour l'appel client de mercredi 20 mai 2026 à 10h. Le blocage, c'est le regard de l'autre ; le premier pas, c'est appuyer sur appeler et dire ma première phrase.

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
- incident: `supabase functions serve` local redemarre avant ce retry; le 504 persiste.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Aucun comportement conversationnel exploitable: Sophia ne repond jamais.

**Problemes**
- Tours 1-4: timeout gateway avant reponse. Impact: experience inutilisable, aucun moyen de juger le ton, la collecte, la confirmation ou le message potion.

**Fix propose**
- Stabiliser le chemin IA local avant nouveau run: regarder pourquoi le POST `test-send-message` depasse le timeout upstream alors que le endpoint repond vite en `OPTIONS`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Aucun routage observable: pas de `conversation_turn_trace`, pas de `response_owner`, pas de `selected_handler`.

**Skills / Operations / Tools**
- `select_state_potion` n'est jamais atteint de maniere observable.
- Aucun executor ni fallback direct n'a ete utilise.

**Memory / Effets durables**
- Snapshot DB apres retries: 0 `user_potion_sessions`, 0 `user_recurring_reminders`, 0 `scheduled_checkins`.
- Les fixtures QA non destructives existent: user test avec cycle actif, transformation active, plan actif et action "Appeler le client important".

**Problemes**
- Tous les tours retournent `504 {"message":"The upstream server is timing out"}` avant trace applicative. Impact systeme: run invalide pour verifier le schedule planner action-aware.

**Fix propose**
- Diagnostiquer le runtime local Supabase/Edge/LLM: la panne est en amont du router observable. Refaire le run seulement quand un tour simple `force_full_ai=true` produit une trace.

## Verdict Global

- Verdict: red
- Raison principale: run techniquement invalide, aucun tour n'atteint Sophia.
- Verification durable: aucune potion ni aucun reminder n'a ete cree.

