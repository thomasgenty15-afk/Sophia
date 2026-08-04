# QA Run - prepare_defense_card Local Doctrine R3 Invalid

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `prepare-defense-local-doctrine-r3`
- Persona: `alex` (`tests/real-personas/alex/connection.json`, auth via `scripts/get-jwt.sh`; JWT non consigne)
- Objectif: relancer un run IA reel apres les tentatives R2/R2b invalides pour verifier les fixes `prepare_defense_card`.
- Trajectoire prevue: entree defense explicite -> confirmation -> destination courte -> revision -> tentative d'ajout -> changement explicite vers carte d'attaque.
- Surfaces visees: dispatcher global d'entree, active flow routing, `prepare_defense_card.local_dispatcher`, reducer local, visible agent local, EffectLedger, no-chat-mutation, transition vers `prepare_attack_card`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runner `scripts/qa_prepare_defense_turn.mjs`, aucun renderer deterministe, aucun fallback direct `processMessage`, aucun staging/deploy.
- Validite QA: invalide. Le premier tour a retourne HTTP 502 avec reponse vide, avant toute trace Sophia exploitable.
- Nettoyage: cleanup cible effectue sur le scope `qa-prepare-defense-card-alex-2026-06-12-prepare-defense-local-doctrine-r3`. Verification finale `chat_messages=0`, `user_chat_states=0`, `user_defense_cards=0`.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r3.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r3.summary.json`
- Cleanup: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r3-invalid.cleanup.json`
- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-12-prepare-defense-local-doctrine-r3-invalid-bugs.md`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Je voudrais préparer une carte de défense pour le moment où je sors du bureau crevé, je passe près des fast-foods et je bascule dans un achat impulsif au lieu de rentrer manger simplement.

**Sophia**
> Reponse vide. Le endpoint a retourne HTTP 502 avec body `{"message":"An invalid response was received from the upstream server"}`.

**Trace courte**
- http_status: 502
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- safety: `null`
- direct_effects: `null`
- operation: `null`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun effet metier observe
- diagnostic local: juste apres le 502, `supabase_edge_runtime_Sophia_2` etait `Up 4 seconds`, ce qui indique un redemarrage du runtime Edge.
- logs disponibles: logs edge recents sans stack exploitable; seulement le demarrage du runtime.

**Analyse si yellow/red**
- Symptome: echec avant toute conversation et avant toute trace de routing Sophia.
- Source amont probable: runtime local Edge Function / environnement local `test-send-message`.
- Owner runtime: test harness local / Edge runtime.
- Meilleure correction selon les guidelines: ne pas utiliser de fallback; arreter le run comme invalide; stabiliser le runtime local avant nouveau rerun.
- Pourquoi ce n'est pas un patch local: aucun comportement `prepare_defense_card` n'a ete observe.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Aucun element conversationnel exploitable.

**Problemes**
- Tour 1: HTTP 502, reponse vide, pas de transcript Sophia. Famille: `BF-TEST-01`. Impact: impossible de valider les fixes. Severite: red.

**Fix propose**
- Source amont: environnement local Edge Function / endpoint `/functions/v1/test-send-message`.
- Correction recommandee: recuperer la stack de crash ou stabiliser explicitement le runtime local avant nouveau run.
- Tests d'invariant attendus: un health check conversationnel simple doit retourner HTTP 200 avec trace avant de relancer le scenario defense complet.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Aucun routage Sophia exploitable: `route_decision=null`, `selected_handler=null`.
- Les fixes defense ne sont pas validates par ce run.

**Skills / Operations / Tools**
- Aucun skill ou tool execute.
- `executed_tools=[]`, `pending_confirmation=null`.

**Memory / Effets durables**
- Cleanup cible: `chat_messages=0`, `user_chat_states=0`, `user_defense_cards=0` apres cleanup.
- Aucun effet durable non consenti observe.

**Problemes**
- Tour 1: endpoint IA reel local indisponible. Famille: `BF-TEST-01`. Impact systeme: validation QA impossible.

**Fix propose**
- Source amont: Edge runtime local / logs runtime.
- Correction recommandee: obtenir un runtime local stable, puis refaire un run propre avec nouveau `run_id`.
- Tests d'invariant attendus: HTTP 200 sur `/functions/v1/test-send-message`, puis run complet defense.

## Verdict Global

- Verdict: red
- Raison principale: HTTP 502 avant conversation exploitable; le conteneur Edge a redemarre juste apres l'appel.
- Follow-up prioritaire: stabiliser ou redemarrer explicitement le runtime local avec accord, puis relancer un run QA propre.
