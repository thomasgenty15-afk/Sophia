# Bug Sheet — Paul Global 15 (r5)

- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-06-paul-global15-r5.md`
- Date: 2026-07-06
- Persona: Paul (`d265435c-4be5-4b39-a0c6-12f18fa8bfff`), canal web, TZ Europe/Paris
- Plan actif: `00b918c9` (« Sortir de la sédentarité »)
- Verdict global du run: **red** (système red)
- Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`

## Synthèse

| Bug id | Tours | Famille | Severite | Statut |
| --- | --- | --- | --- | --- |
| R5-B01 | T5, T14 | BF-LEDGER-02 (+ BF-STATUS-01) | red | open |
| R5-B02 | T14, T15 | BF-STATE-02 (+ BF-EFFECT-02) | red | open |
| R5-B03 | T6 | BF-ROUTE-01 | yellow | open |
| R5-B04 | T12 | BF-PREF-01 (+ BF-ROUTE-01) | yellow | open |
| R5-B05 | T9 | BF-SAFETY-01 | yellow | open |
| R5-B06 | T4 | BF-LEDGER-01 | yellow | open |

---

## R5-B01 — Rappel one-shot créé mais nié (rendu + statut)

- **Tours**: T5 (rendu), T14 (projection statut)
- **Famille**: BF-LEDGER-02 (Commit réel mal rendu) ; source secondaire BF-STATUS-01 (projection DB mal lue)
- **Domaine owner**: EffectLedger final-response guard + status/reminders projection (loader durable effects) + gestion `handoff_context_for_next_dispatcher`
- **Source amont**: le renderer et la projection statut ne sont pas grondés sur
  l'EffectLedger / la table `scheduled_checkins`. Au T5, le handoff context hérité
  du flow `feature_opportunity` relâché au T4 (`priority_reason: "…never
  create_one_shot_reminder"`) contamine le rendu, qui affirme « pas créé » alors
  que l'effet direct a committé. Au T14, la projection « ai-je un rappel ? » ne
  voit pas le `scheduled_checkins` one-shot (origin `rendez_vous`).
- **Symptome visible**:
  - T5: « Le rappel ponctuel n'a pas été créé ici. »
  - T14: « Pour l'appel à Karim demain 18h : je ne vois pas de rappel confirmé comme enregistré. »
- **Preuve systeme**:
  - Ledger T5: `create_one_shot_reminder` req/allowed/**committed**; `executed_tools=["track_progress_plan_item","create_one_shot_reminder"]`.
  - DB: `scheduled_checkins:d6ec54f1` — `status=pending`, `scheduled_for=2026-07-07T16:00Z` (18h Paris), origin `rendez_vous`, event_context `one_shot_reminder:appeler_karim_et_caler_une_seance`. Toujours présent au T14.
- **Correction attendue** (architecture, pas phrase): le final-response guard doit
  réconcilier chaque claim d'action avec l'EffectLedger du tour — interdiction de
  rendre « pas créé » si l'effet est `committed`. Le `handoff_context` d'un flow
  relâché ne doit pas surcharger la description des effets du tour suivant. La
  projection rappels doit lire **tous** les `scheduled_checkins` pending du user
  (one-shot inclus) et se réconcilier au ledger des tours précédents.
- **Statut**: `fix_applied` (doctrine, à confirmer au prochain run) — chantier W2 (2026-07-06). (1) Rendu : règle (5) du contrat de confirmation — DIRECT_EFFECT_CONFIRMATION_CONTEXT PRIME sur toute note de flow/handoff (« une note "never create X" décrit le scope du flow, jamais les outcomes du tour ; un committed EST réel ») ; (2) Projection : le bloc ÉTAT DURABLE (déjà complet : tous les pending sans filtre origin + récurrents actifs) porte désormais sa priorité explicite (« cette liste PRIME sur tout ce que la conversation a dit avant, y compris un ancien tour niant une création »). La cause T14 n'était pas un trou de données mais l'historique (le « pas créé » du T5) qui battait le bloc DB.
- **Fix reference**: chantier W (2026-07-06)
- **Tests requis**:
  - positif: tour créant un one-shot reminder (commit) ⇒ le rendu ne contient pas
    « pas créé » / nie l'effet (guard ledger sur `create_one_shot_reminder`).
  - anti-contamination: un one-shot demandé au tour N après un flow
    `feature_opportunity` « never create_one_shot_reminder » relâché au tour N-1 ⇒
    l'effet est créé ET rendu comme créé.
  - projection: tour « est-ce que j'ai un rappel pour X ? » avec un
    `scheduled_checkins` pending one-shot ⇒ la réponse liste ce rappel.
  - anti-faux-positif: aucun rappel en DB ⇒ la projection dit « aucun ».

## R5-B02 — Correction d'un check-in same-day impossible malgré confirmation

- **Tours**: T14 (offre de confirmation), T15 (confirmation non honorée)
- **Famille**: BF-STATE-02 (Pending confirmation cible perdue / non honorée) ; source secondaire BF-EFFECT-02 (effet de réversion attendu absent)
- **Domaine owner**: reducer `track_progress` (Confirmation Contract) + effect gate (admission override same-day) + executor (supersede/reverse d'entry)
- **Source amont**: le gate `contradicts_same_day_evidence` bloque à la fois la
  demande initiale de correction ET l'override explicitement confirmé par l'user.
  Aucune branche « supersede d'un check-in same-day sur confirmation ». Sophia
  **offre** au T14 une confirmation (« confirme si tu veux que je la passe en
  raté ») que l'executor ne sait pas exécuter → boucle morte.
- **Symptome visible**:
  - T14: « …je te demande juste de confirmer si tu veux que je la passe en raté. »
  - T15 (après « oui, confirme »): « je ne peux pas la marquer en raté ici parce
    que l'état du jour est déjà contradictoire… elle reste considérée comme faite. »
- **Preuve systeme**: T15 ledger `track_progress_plan_item` req 1 → **blocked 1**
  (`contradicts_same_day_evidence`), committed 0, `tool_execution=blocked`. DB:
  entry erronée `f4ecd919` (`fad299cb` completed) **inchangée**.
- **Correction attendue**: soit ne pas offrir de confirmation non tenable (rediriger
  vers la surface qui corrige), soit implémenter l'override — une confirmation
  explicite doit permettre de superséder l'entry `completed` par une entry
  `missed`/annulation, avec preuve ledger. L'offre de confirmation et la capacité
  executor doivent être couplées (pas d'offre sans branche d'exécution).
- **Statut**: `fix_applied` — chantier W4 (2026-07-06), arbitrage produit « pas d'override same-day en chat » : le blocage `contradicts_same_day_evidence` passe de needs_clarify (qui invitait une confirmation inexécutable → boucle morte) à **blocked honnête** — reply sans offre (« déjà noté comme X — je ne peux pas changer ça depuis le chat ; correction sur l'action dans Dashboard > Plan », vérité produit vérifiée : le dashboard corrige via entries/décrément) + guidance registry « ne propose JAMAIS de confirmer une bascule ». Tests contrat mis à jour. **Probe live** (Paul) : track completed → « passe-la en raté » → blocked, réponse sans offre, aucune boucle possible.
- **Fix reference**: chantier W (2026-07-06)
- **Tests requis**:
  - positif: check-in same-day `completed` + user demande « passe-la en raté » +
    confirme ⇒ entry supersédée en `missed`/annulée, ledger `committed`.
  - contrat: si l'override n'est pas supporté, le tour N ne doit **pas** offrir de
    confirmation (pas de dead-loop) et doit rediriger vers la surface de correction.
  - anti-faux-positif: un simple « ok » ambigu ne doit pas superséder sans intention
    de réversion explicite.

## R5-B03 — Demande de technique-outil non routée vers la doctrine operation-suggestion

- **Tours**: T6
- **Famille**: BF-ROUTE-01 (Mauvais owner)
- **Domaine owner**: dispatcher / route policy + skill operation-suggestion
- **Source amont**: une demande explicite de technique (« un mot de bascule pour
  comprendre/analyser mes rechutes ») est ownée par `normal_reply` en réponse
  libre. Le skill operation-suggestion — qui porte la doctrine « si le wording
  force une technique incohérente, garder un doute, expliquer la différence,
  proposer le plus proche » (`14-qa-test-guidelines.md`) — n'est jamais engagé.
- **Symptome visible**: « Mot de bascule : déraillement. » — technique forcée
  appliquée telle quelle, sans réserve ni reframe vers un repérage / carte de
  défense (le besoin réel est analytique, pas une fenêtre de rupture).
- **Preuve systeme**: T6 `response_owner=normal_reply`, reason `normal_reply_default`,
  `skill_signals=[]`, ledger 0.
- **Correction attendue**: router une demande explicite de technique/mot/carte vers
  le skill operation-suggestion qui applique la doctrine de cohérence technique. La
  doctrine ne peut pas s'appliquer si le tour n'est pas routé vers elle ; ne pas la
  dupliquer dans le prompt `normal_reply`.
- **Statut**: `fix_applied` — chantier W5 (2026-07-06): règle dispatcher « demande explicite de CARTE ou de TECHNIQUE = coaching_recommendation, prioritaire sur feature_opportunity/product_help » (anti-FP : retrouver une carte existante = product_help ; récurrent = FO) + doctrine visible « doute de cohérence technique ». **Probe live** (Paul) : « je veux une carte à sortir le soir… fais-moi ça » → owner `coaching_recommendation` du premier coup (vs 3 tours chez alex-r3).
- **Tests requis**:
  - positif: « donne-moi un mot de bascule / une carte » ⇒ owner operation-suggestion.
  - cohérence: demande d'analyse/repérage formulée comme « mot de bascule » ⇒ Sophia
    garde le doute, explique la différence, propose repérage/carte.

## R5-B04 — Préférence de ton non capturée durablement

- **Tours**: T12 (set), T13 (adhérence en-contexte seulement)
- **Famille**: BF-PREF-01 (Préférence non appliquée runtime) ; contributif BF-ROUTE-01
- **Domaine owner**: route policy (préférence-set vs feature-discovery) + `update_coach_preferences`
- **Source amont**: instruction comportementale durable (« sans emojis, plus cash, à
  partir de maintenant ») routée vers `feature_opportunity` (qui n'exécute aucun
  outil) → **aucune écriture**. L'adhérence T13 (sans emoji) repose sur la mémoire
  de conversation, pas sur une préférence persistée.
- **Symptome visible**: T12 « …sans emojis à partir de maintenant. Si tu veux, tu
  peux aussi régler ça dans Preferences coach… » — Sophia promet un changement
  durable mais ne persiste rien.
- **Preuve systeme**: T12 `response_owner=feature_opportunity`, `coach_preferences_opportunity`,
  ledger 0, aucune écriture de préférence. T13 respecte le no-emoji (en-contexte).
- **Correction attendue**: router une instruction de préférence explicite vers un
  skill qui **persiste** la préférence et l'applique au runtime de rendu ; le
  pointeur produit reste secondaire. L'invariant BF-PREF-01 exige que la préférence
  survive à la fenêtre de contexte.
- **Statut**: `fix_applied` (partiel — arbitrage produit) : la persistance conversationnelle des préférences est actée « version prochaine » ; doctrine FO bornée (application immédiate en session, engagement de SESSION explicite, jamais « à partir de maintenant » ; durable = Preferences coach). Le volet cross-mode en session est fermé — chantier V2-F3 (2026-07-07) : règle companion « une préférence de style exprimée en session s'applique à TOUS les tours suivants, y compris en mode soutien » (compression companion incluse, budget < 13000, contrat 15/15), voir eva-r5 B03.
- **Tests requis**:
  - positif: « arrête les emojis / parle plus direct » ⇒ écriture durable de
    préférence + application au rendu des tours suivants (y compris après reset de
    contexte).
  - anti-régression: après persistance, un nouveau tour sans rappel explicite reste
    sans emoji.

## R5-B05 — Faux positif safety sur idiomes humoristiques

- **Tours**: T9
- **Famille**: BF-SAFETY-01 (Classification / priorité safety incorrecte)
- **Domaine owner**: safety pregate / classifier de bande
- **Source amont**: match lexical brut du vocabulaire canonique (règle 1d) sans
  pondération de registre — « m'a achevé », « j'allais y rester », « jambes mortes »
  classés `medium [emotional_distress, demoralization]` sur un message d'humour de
  courbatures (« mdr », domaine effort physique).
- **Symptome visible**: aucun côté user ce tour (rendu physique correct,
  `normal_reply`, pas de préemption) — défaut interne de classification.
- **Preuve systeme**: T9 safety `medium ["emotional_distress","demoralization"]`,
  evidence idiomatique ; `response_owner=normal_reply`, `blocked_paths=[]` ;
  `user_chat_states.web.risk_level=0` post-tour (pas de contamination durable).
- **Correction attendue**: intégrer les marqueurs de registre/contexte (humour,
  effort physique) au scoring de bande pour éviter le faux positif idiomatique.
  Risque latent: sur un tour légèrement différent, un `medium` idiomatique pourrait
  préempter à tort un moment léger.
- **Statut**: `fix_applied` (doctrine) — chantier W5 (2026-07-06): règle 1d étendue — pondération de REGISTRE (« idiomes sombres en contexte humour/effort physique ne sont pas de la détresse — band low/none, aucun code du cluster »). À confirmer au prochain run.
- **Tests requis**:
  - anti-faux-positif: message de courbatures avec idiomes sombres + « mdr » ⇒
    safety `low/none`.
  - non-régression: détresse réelle (hopelessness/worthlessness/idéation) ⇒ bande et
    préemption correctes (cf. r4 T11–T13).

## R5-B06 — Wording claim d'existence sur une initiative non créée

- **Tours**: T4
- **Famille**: BF-LEDGER-01 (Claim/wording suggérant un commit/existence sans commit)
- **Domaine owner**: `skills/feature_opportunity/visible_agent` (contrat de rendu)
- **Source amont**: langage d'existence non conditionnel dans le visible agent
  `feature_opportunity` — « Tu peux **la retrouver** dans Dashboard > Initiatives »
  juste avant « Si tu veux **la préparer** ». Contraste avec `coaching_recommendation`
  (T7) qui tient le langage conditionnel correct (« Si tu la crées, tu pourras
  ensuite la retrouver »).
- **Symptome visible**: T4, l'user peut aller dans Initiatives s'attendant à trouver
  un rappel déjà posé, et ne rien trouver.
- **Preuve systeme**: T4 `response_owner=feature_opportunity`, ledger 0, aucune
  ligne `user_recurring_reminders` créée.
- **Correction attendue**: aligner le contrat de rendu de `feature_opportunity` sur
  la politique claim-d'existence déjà tenue par `coaching_recommendation` (langage
  de création **conditionnel** uniquement).
- **Statut**: `fix_applied` (doctrine) — chantier W5 (2026-07-06): règle visible FO « langage d'existence » alignée sur coaching — un artefact proposé non créé n'existe pas, « si tu la crées, tu la retrouveras… », jamais « tu peux la retrouver » inconditionnel.
- **Tests requis**:
  - positif: proposition d'initiative non créée ⇒ langage conditionnel (« si tu la
    crées… »), aucun « tu peux la retrouver » inconditionnel.

---

## Notes de non-régression (verts notables)

- T2: exit propre `coaching_recommendation → product_help` (topic_change).
- T3: track + contrainte « ne me relance pas » honorée (BF-INTAKE-03 ok).
- T7: frontière carte de défense + langage de création conditionnel correct.
- T8: `plan_realignment` sur **retrait** d'habitude, plan intact (Y1 ok, variante r4).
- T10: ton proactif sobre sur signal faible.
- T11: contrat memorizer (0 write in-turn, persistance post-batch, 13 reports
  plan-state rejetés).
- T13: recap cross-dimension exact + préférence no-emoji respectée en-contexte.
