# Bug Sheet — normal-conversation-20t-20260613-r2-post-intervention

## R2-B01 — Opportunites implicites ignorent normal_reply_fit_score

- Bug id: `R2-B01`
- Tours: T2, T5, T18
- Famille: `BF-ROUTE-01` — Mauvais owner selectionne
- Domaine owner: global routing / `flow_opportunity_verification`
- Source amont: admission runtime `flow_opportunity` après route decision `normal_reply_default`
- Symptome visible: Sophia propose une carte ou une modification de préférences alors que le user veut parler normalement.
- Preuve systeme:
  - T2: `normal_reply_fit_score=1`, `flow_opportunity.score=0.55`, `response_owner=tool_skill`, `selected_handler=flow_opportunity_verification`.
  - T5: `normal_reply_fit_score=0.9`, `flow_opportunity.score=0.65`, `response_owner=tool_skill`.
  - T18: `normal_reply_fit_score=0.98`, `flow_opportunity.score=0.65`, `response_owner=tool_skill`.
  - Aucun `blocked_paths.reason_code=normal_reply_fit_dominates`.
- Correction attendue: appliquer l'intervention policy à `flow_opportunity` avant `maybeRunFlowOpportunityVerificationRuntime`; bloquer les opportunités implicites qui perdent face au normal score, avec diagnostics `blocked_paths`.
- Statut: `open`
- Fix reference: implémentation actuelle `normal_reply_fit_score` partielle; ce run prouve qu'elle ne couvre pas l'admission opportunity.
- Tests requis:
  - Positif: demande explicite "prépare une carte" lance le tool.
  - Paraphrase: "j'ai une mini résistance, pas une crise" reste normal.
  - Anti-faux-positif: "je veux juste comprendre / pas de carte" bloque l'opportunity.
  - Integration: 10 tours conversation simple avec signaux grignotage/résistance sans flow.

## R2-B02 — Demotivation repair capture les tours neutres et explicites

- Bug id: `R2-B02`
- Tours: T6-T12
- Famille: `BF-ROUTE-02` — Ancien flow capture une nouvelle intention
- Domaine owner: active local conversation skill arbitration / `demotivation_repair`
- Source amont: active local skill ownership avant global dispatcher/router
- Symptome visible: après entrée dans `demotivation_repair`, Sophia répond aux tours neutres, question produit et demande explicite de carte sans rendre la main.
- Preuve systeme:
  - T7-T12: `route_reason=active_demotivation_repair_local_dispatcher`.
  - `blocked_paths`: `global_dispatcher` et `global_router` bloqués par `active_local_conversation_skill_owns_turn`.
  - T10 product_help attendu mais handler `demotivation_repair`.
  - T11/T12 `prepare_defense_card` explicite attendu mais handler `demotivation_repair`, aucun tool lancé.
- Correction attendue: active local conversation skill doit appliquer une interruption policy structurée: changement de sujet, product_help/status explicite et tool explicite doivent sortir, suspendre ou handoff proprement.
- Statut: `open`
- Fix reference: aucun.
- Tests requis:
  - Positif: `demotivation_repair` continue quand le user reste dans le même besoin.
  - Paraphrase: "je change de sujet" rend la main.
  - Anti-faux-positif: repair actif ne bloque pas `prepare_defense_card` explicite.
  - Integration: mini-run active demotivation -> product_help -> tool explicit -> normal reply.

## R2-B03 — Calibration dispatcher demotivation trop agressive

- Bug id: `R2-B03`
- Tours: T6
- Famille: `BF-ROUTE-01` — Mauvais owner selectionne
- Domaine owner: dispatcher prompt / skill signal scoring
- Source amont: scoring `normal_reply_fit_score` et `skill_signals.entry.demotivation_repair`
- Symptome visible: réponse utile mais le tour passe en skill repair alors que le user demande "juste qu'on le dise simplement".
- Preuve systeme:
  - T6: `normal_reply_fit_score=0.15`.
  - `skill_signals.entry.demotivation_repair.confidence_band=high`, sans `score` numérique.
  - Message user: "Non, pas de carte d'attaque non plus. Là je veux juste qu'on le dise simplement".
- Correction attendue: une demande d'explication légère doit conserver un score normal moyen/haut sauf détresse/repair ownership fort; exiger ou préserver un `score` numérique pour demotivation.
- Statut: `open`
- Fix reference: aucun.
- Tests requis:
  - Positif: honte/détresse forte lance repair.
  - Paraphrase: "mini résistance, explique-moi simplement" reste normal.
  - Anti-faux-positif: "je n'en peux plus, j'abandonne tout" peut lancer repair.

## R2-B04 — Flow opportunity reste présent après sortie méta vers normal

- Bug id: `R2-B04`
- Tours: T13
- Famille: `BF-ROUTE-01` — Mauvais owner selectionne
- Domaine owner: dispatcher / route cleanup after active skill exit
- Source amont: génération `flow_opportunity` concurrente sur un tour de sortie normal
- Symptome visible: pas d'impact visible au tour T13, mais trace contradictoire.
- Preuve systeme:
  - T13: `response_owner=normal_reply`, mais `flow_opportunity=prepare_defense_card.explicit_retry`, confidence `high`, score `0.85`.
  - User demande explicitement de revenir au dispatcher normal et de ne lancer une carte que quand il le demande.
- Correction attendue: sur un tour de sortie méta qui rétablit normal/explicit-only, ne pas porter une opportunity implicite concurrente; attendre une nouvelle demande explicite.
- Statut: `open`
- Fix reference: aucun.
- Tests requis:
  - Sortie "stop ce mode, reviens normal" ne produit pas opportunity.
  - Demande suivante explicite produit bien tool intent.
