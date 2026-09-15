# Bug Sheet — bridge-potions-repair-r1

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, 4 runs QA conversationnels pilotés tour par tour. Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-bridge-potions-repair-r1.md`.

## R1-B01 — Demotivation courage résout vers emotional_repair

- Tours: Run A T1-T4
- Famille: `BF-ROUTE-01`
- Domaine owner: dispatcher + orientation clarification / active skill arbitration.
- Source amont: résolution de clarification entre `emotional_repair`, `execution_breakdown` et `demotivation_repair`.
- Symptôme visible: le user choisit le décrochage motivationnel lié à la peur du regard, mais Sophia répond comme `emotional_repair` puis reclarifie plan vs émotion.
- Preuve système: T2 `skill_entry_ids=["demotivation_repair"]` mais `selected_skill_id="emotional_repair"`; T4 `selected_handler="orientation_clarification"`.
- Correction attendue: quand le user clarifie "décrochage / élan / évitement" après une orientation, la résolution doit sélectionner `demotivation_repair`; le bridge `courage` doit ensuite être possible seulement depuis ce skill.
- Statut: `open`
- Fix reference: J79 pour la décision architecture; 2026-06-03 taxonomy/bridge
  contract renforcés dans `demotivation_repair`, rerun IA réel requis.
- Tests requis: positif peur/évitement -> `demotivation_repair`; paraphrase peur du regard; anti-faux-positif honte aiguë -> `emotional_repair`; integration full AI vers suggestion `courage` avec `handoff_summary`.

## R1-B02 — Demotivation clarté redemande les slots clarifiés

- Tours: Run B T2-T4
- Famille: `BF-INTAKE-01`
- Domaine owner: `demotivation_repair` intake + orientation clarification state.
- Source amont: reprise du contexte clarifié après `orientation_clarification`.
- Symptôme visible: le user donne le domaine santé et choisit "redonner du sens"; Sophia redemande le domaine puis redemande exploration vs adaptation plan.
- Preuve système: T3 `selected_handler="demotivation_repair"` avec réponse qui répète la question T1; T4 `selected_handler="orientation_clarification"`; `operation_suggestions=[]`.
- Correction attendue: les réponses de clarification doivent alimenter le working state/intake de `demotivation_repair`; une fois le cap posé, le skill peut suggérer `select_state_potion` `clarte` avec résumé.
- Statut: `open`
- Fix reference: J79 pour la décision architecture; 2026-06-03 taxonomy/bridge
  contract renforcés dans `demotivation_repair`, mais reprise des slots encore
  à vérifier en run réel.
- Tests requis: positif perte de sens -> domaine fourni -> clarté; paraphrase "actions mécaniques"; anti-faux-positif "je ne sais pas par où commencer" -> execution/breakdown, pas clarté.

## R1-B03 — Emotional guérison ne sort pas de suggestion potion et croise defense_card

- Tours: Run C T1 et T4
- Famille: `BF-INTAKE-06`
- Domaine owner: `emotional_repair` intake/contract, avec garde dispatcher opportunity à vérifier.
- Source amont: décision structurée post-stabilisation et filtrage d'operation suggestions.
- Symptôme visible: après stabilisation, le user demande un support Sophia pour réparer l'épisode sans se punir; Sophia propose un mini-support conversationnel et expose `prepare_defense_card`.
- Preuve système: T4 `operation_suggestions=[]`, `opportunity="defense_card"`, traces `invalid_allow_potion_suggestion`.
- Correction attendue: après émotion redescendue, `emotional_repair` doit pouvoir produire une suggestion `select_state_potion` `guerison` consentie avec `operation_input_hint.context.handoff_summary`; aucune opportunity defense concurrente ne doit prendre cette place.
- Statut: `open`
- Fix reference: J79 pour la décision architecture; 2026-06-03 taxonomy/bridge
  contract renforcés dans `emotional_repair`, rerun IA réel requis.
- Tests requis: positif honte redescendue -> guérison; paraphrase craquage/réparation; anti-faux-positif honte aiguë -> pas de potion; integration full AI.

## R1-B04 — Emotional amour part en product_help Clarifications

- Tours: Run D T4
- Famille: `BF-ROUTE-03`
- Domaine owner: active skill arbitration + `emotional_repair` suggestion policy.
- Source amont: priorité product_help vs skill actif quand le user demande un "support dans Sophia" depuis un contexte émotionnel stabilisé.
- Symptôme visible: Sophia explique les clarifications produit au lieu de proposer un support amour/douceur.
- Preuve système: T4 `selected_handler="product_help"`, `route_reason="skill_handoff_requested"`, `skill_entry_ids=["product_help"]`, no `select_state_potion`.
- Correction attendue: pendant un `emotional_repair` actif, une demande de support Sophia reliée au besoin émotionnel durable doit rester chez le skill actif et produire éventuellement `select_state_potion` `amour`.
- Statut: `open`
- Fix reference: J79 pour la décision architecture; 2026-06-03 taxonomy/bridge
  contract renforcés dans `emotional_repair`, mais arbitration product_help
  encore à corriger/vérifier.
- Tests requis: positif douceur stabilisée -> amour; paraphrase chaleur envers soi; anti-faux-positif "où trouver les clarifications dans l'app ?" -> product_help; integration full AI.
