# Bug Sheet — Clarification Skills Real

Cadre: Supabase local, `/functions/v1/test-send-message`,
`force_full_ai=true`, users QA temporaires, cleanup ciblé effectué.

Rapport:
`docs/agent-playbook/New/test-material/qa-run-reports/2026-06-01-clarification-skills-real.md`

## CSR-20260601-B01 — Clarification Visible Mais Owner Dispatcher

- Bug id: `CSR-20260601-B01`
- Tours:
  - `clarification-skills-real-20260601-r1-product-help` Tour 1
  - `clarification-skills-real-20260601-r2-active-product-help` Tour 2
- Famille: `BF-ROUTE-01` — mauvais owner sélectionné / owner trop global.
- Domaine owner: router clarification arbitration + conversation skills.
- Source amont: `maybeStartDispatcherClarification` préempte l'ambiguïté avant
  que le skill actif puisse appeler `runSkillClarification`.
- Symptome visible: la question de clarification est correcte, mais le run ne
  valide pas la capacité skill-level demandée.
- Preuve systeme:
  - `response_owner=orientation_clarification`
  - `selected_handler=orientation_clarification`
  - `route_reason=clarification_required`
  - `__clarification_state_v1.owner=dispatcher`
  - candidats `product_help`, `prepare_attack_card`
  - `executed_tools=[]`, `tool_execution=none`, aucun scheduled checkin.
- Correction attendue: quand un conversation skill actif garde l'ownership et
  rencontre une ambiguïté interne, construire les candidats côté skill et
  appeler `runSkillClarification` avec `owner=<skill_id>`. Le dispatcher doit
  rester responsable des ambiguïtés hors flow ou pré-skill.
- Statut: `open`.
- Fix reference: aucun.
- Tests requis:
  - unit: adapter skill avec owner product/emotional/execution/weekly.
  - integration runtime: active `product_help` ambigu -> state owner
    `product_help`.
  - integration runtime: active `emotional_repair` ambigu -> state owner
    `emotional_repair`.
  - réel: `/functions/v1/test-send-message`, `force_full_ai=true`, aucun
    executor, aucun effet durable.

## CSR-20260601-B02 — `product_help` Répond Trop Pauvrement À Une Explication

- Bug id: `CSR-20260601-B02`
- Tours: `clarification-skills-real-20260601-r2-active-product-help` Tour 1.
- Famille: `BF-ROUTE-01` — owner correct mais rendu skill insuffisant.
- Domaine owner: `product_help`.
- Source amont: intake/renderer `product_help`.
- Symptome visible: à "Explique-moi à quoi sert une carte d'attaque", Sophia
  répond seulement "Je ne l'ai pas modifié."
- Preuve systeme:
  - `response_owner=product_help`
  - `selected_handler=product_help`
  - `route_reason=skill_entry_signal`
  - `selected_skill_id=product_help`
  - aucun effet durable.
- Correction attendue: conserver le blocage de mutation quand "sans rien créer"
  est explicite, mais rendre une explication produit utile au lieu d'une simple
  phrase anti-claim.
- Statut: `open`.
- Fix reference: aucun.
- Tests requis:
  - unit product_help: demande d'explication + `sans rien créer` doit produire
    une explication non-mutante.
  - réel product_help: owner product_help, contenu substantiel, aucun executor.

## CSR-20260601-B03 — Runs Émotionnels En 502

- Bug id: `CSR-20260601-B03`
- Tours:
  - `clarification-skills-real-20260601-r3-active-emotional` Tour 1
  - retry `clarification-skills-real-20260601-r3b-active-emotional` Tour 1
- Famille: `BF-TEST-01` — run réel invalide par erreur runtime/edge.
- Domaine owner: testability / Edge runtime / route émotionnelle.
- Source amont: erreur upstream non observable depuis la trace courte.
- Symptome visible: réponse vide, HTTP 502.
- Preuve systeme:
  - `http_status=502`
  - raw error `An invalid response was received from the upstream server`
  - pas de `response_owner`, pas de `selected_handler`, pas de trace utile.
- Correction attendue: exposer une trace d'erreur exploitable ou corriger
  l'erreur upstream qui empêche `emotional_repair` de répondre en réel.
- Statut: `open`.
- Fix reference: aucun.
- Tests requis:
  - réel emotional_repair simple: HTTP 200, owner skill émotionnel.
  - réel emotional_repair ambigu: clarification interne ou dispatcher explicite,
    aucun effet durable.
