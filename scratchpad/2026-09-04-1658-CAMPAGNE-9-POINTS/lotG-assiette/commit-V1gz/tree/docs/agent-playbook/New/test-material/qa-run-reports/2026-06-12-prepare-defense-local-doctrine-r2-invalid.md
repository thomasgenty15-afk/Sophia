# QA Run - prepare_defense_card Local Doctrine R2 Invalid

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `prepare-defense-local-doctrine-r2` puis tentative propre `prepare-defense-local-doctrine-r2b`
- Persona: `alex` (`tests/real-personas/alex/connection.json`, auth via `scripts/get-jwt.sh`; JWT non consigne)
- Objectif: rerun en conditions IA reelles apres correction du verrouillage `support_need` et du passage defense -> global -> attack.
- Trajectoire prevue: entree defense explicite -> confirmation -> destination courte -> revision -> tentative d'ajout -> changement explicite vers carte d'attaque.
- Surfaces visees: dispatcher global d'entree, active flow routing, `prepare_defense_card.local_dispatcher`, reducer local, visible agent local, EffectLedger, no-chat-mutation, transition vers `prepare_attack_card`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runner `scripts/qa_prepare_defense_turn.mjs`, aucun renderer deterministe, aucun fallback direct `processMessage`, aucun staging/deploy.
- Validite QA: invalide. Les deux tentatives ont echoue avant conversation exploitable avec HTTP 502 et reponse vide.
- Nettoyage: cleanup cible effectue sur les deux scopes invalides. Chaque scope avait 1 `chat_messages` et 1 `user_chat_states`, tous supprimes. Verification finale `chat_messages=0`, `user_chat_states=0`, `user_defense_cards=0`.

Artefacts:

- Attempt R2 raw: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r2.raw.json`
- Attempt R2 summary: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r2.summary.json`
- Attempt R2b raw: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r2b.raw.json`
- Attempt R2b summary: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r2b.summary.json`
- Cleanup: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r2-invalid.cleanup.json`
- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-12-prepare-defense-local-doctrine-r2-invalid-bugs.md`

## 2. Tours De Conversation

### Tentative R2 - Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> J'aimerais préparer une carte de défense pour les retours de boulot où je suis éclaté, je passe devant les restos et je finis par prendre un truc au hasard au lieu de manger correctement.

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
- durable_effect: aucun effet metier observe; cleanup a supprime 1 message et 1 state scoped

**Analyse si yellow/red**
- Symptome: echec avant toute trace Sophia exploitable.
- Source amont probable: runtime local Edge Function / environnement local `test-send-message`.
- Owner runtime: test harness local / Edge runtime.
- Meilleure correction selon les guidelines: ne pas remplacer par fallback; reprendre avec un scope propre si possible. Cette tentative est invalide.
- Pourquoi ce n'est pas un patch local: aucun comportement conversationnel ou decision `prepare_defense_card` n'a ete observe.

### Tentative R2b - Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> J'aimerais préparer une carte de défense pour les retours de boulot où je suis éclaté, je passe devant les restos et je finis par prendre un truc au hasard au lieu de manger correctement.

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
- durable_effect: aucun effet metier observe; cleanup a supprime 1 message et 1 state scoped
- diagnostic local: `supabase_edge_runtime_Sophia_2` etait `Up About a minute` apres les 502, indiquant un redemarrage recent du runtime Edge.
- logs disponibles: pas de stack exploitable; logs montrent `serving the request with supabase/functions/test-send-message`.
- verification technique: `deno check supabase/functions/test-send-message/index.ts supabase/functions/sophia-brain/index.ts supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/turn_intent_arbitrator.ts supabase/functions/sophia-brain/tools/operations/prepare_defense_card/local_flow.ts` passe.

**Analyse si yellow/red**
- Symptome: second echec identique sur un run_id propre.
- Source amont probable: runtime local Edge Function qui redemarre ou coupe la reponse upstream avant d'exposer une stack.
- Owner runtime: environnement local QA / Edge runtime.
- Meilleure correction selon les guidelines: arreter le run et documenter le blocage; ne pas utiliser de fallback technique ou test unitaire pour conclure.
- Pourquoi ce n'est pas un patch local: le chemin IA reel ne produit aucune reponse assistant ni trace de routing exploitable.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Aucun element conversationnel exploitable: Sophia n'a pas repondu.

**Problemes**
- Tentatives R2 et R2b: HTTP 502, reponse vide, pas de transcript Sophia. Famille: `BF-TEST-01`. Impact: run impossible a valider. Severite: red.

**Fix propose**
- Source amont: environnement local Edge Function / endpoint `/functions/v1/test-send-message`.
- Correction recommandee: recuperer une stack runtime exploitable ou stabiliser le service local avant rerun. Ne pas redemarrer Supabase sans autorisation explicite.
- Tests d'invariant attendus: un message simple via `/functions/v1/test-send-message` doit retourner HTTP 200 avec trace avant de relancer le scenario defense complet.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Aucun routage Sophia exploitable: `route_decision=null`, `selected_handler=null`.
- Le fix defense n'a pas pu etre valide en conditions reelles.

**Skills / Operations / Tools**
- Aucun tool ou skill n'a ete execute.
- `executed_tools=[]`, `pending_confirmation=null`.

**Memory / Effets durables**
- Chaque tentative a laisse uniquement des artefacts de test scoped: 1 `chat_messages`, 1 `user_chat_states`.
- Cleanup cible effectue: les deux scopes sont revenus a `chat_messages=0`, `user_chat_states=0`.
- `user_defense_cards=0`; aucune carte creee.

**Problemes**
- Tentatives R2 et R2b: endpoint IA reel local indisponible pour ce run. Famille: `BF-TEST-01`. Impact systeme: validation QA impossible.

**Fix propose**
- Source amont: Edge runtime local / logs runtime.
- Correction recommandee: obtenir le log de crash ou relancer le service local apres accord explicite, puis refaire un run propre avec un nouveau `run_id`.
- Tests d'invariant attendus: health check conversationnel HTTP 200, puis run defense complet.

## Verdict Global

- Verdict: red
- Raison principale: deux tentatives propres ont echoue avec HTTP 502 avant conversation exploitable; le run ne valide pas les fixes.
- Follow-up prioritaire: stabiliser ou redemarrer explicitement le runtime local Edge avec accord, puis relancer un run QA propre.
