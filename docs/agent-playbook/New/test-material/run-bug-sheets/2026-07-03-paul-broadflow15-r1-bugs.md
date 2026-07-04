# Bug Sheet — paul-broadflow15-r1 (2026-07-03)

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-paul-broadflow15-r1.md`
Persona: Paul (`d265435c-4be5-4b39-a0c6-12f18fa8bfff`), scope web, plan actif `00b918c9…` « Sortir de la sédentarité ».
Verdict global du run: **red** (4 red, 3 yellow, 8 green).

---

## R1-B01 — Recap/status sans projection DB

- Bug id: `R1-B01`
- Tours: T3, T15
- Famille: `BF-STATUS-01` (T3 aussi `BF-ROUTE-02`)
- Domaine owner: dispatcher / route policy + status-recap projection owner
- Source amont: aucun owner ne lit la projection `user_plan_items` (active/pending) sur une intention « qu'est-ce que j'ai à faire dans mon plan ». À T3 le flow `coaching_recommendation` actif capture l'intention (`continue_active`) et improvise ; à T15 `normal_reply_default` improvise depuis le contexte conversationnel (le rappel sac).
- Symptome visible: T3 → 1 item cité sur 5 actifs **+ rappel inventé** (« sac de sport demain vers 18h ») ; T15 → « une seule action active : préparer le sac à 19h » (en fait le rappel ponctuel confondu avec une action, item « sac » réellement `completed`).
- Preuve systeme: DB = 5 items actifs, item « Préparer mon sac de sport la veille » `completed`, 0 rappel au moment de T3. Traces: T3 `active_flow_arbitration=continue_active` owner `coaching_recommendation` ; T15 `route_reason=normal_reply_default`, `direct_effects=[]`.
- Correction attendue: câbler un owner status/recap qui lit `user_plan_items` et rend la liste réelle ; préempter le flow actif quand l'intention devient un status explicite ; interdire à `normal_reply`/skills d'improviser un recap de plan.
- Statut: `fix_applied` (chantier F3+F5, rerun requis)
- Fix reference: diagnostic — la règle companion pointait vers une section « SNAPSHOT COURT PLAN / ACTIONS ACTIVES » **qui n'était construite nulle part** (source fantôme → improvisation). Fix : (1) le bloc est désormais construit à chaque tour depuis le `planItemSnapshot` déjà chargé (`activePlanSnapshotPromptBlock`, injecté inconditionnellement au companion via run.ts) — liste exhaustive, count réel, interdiction d'inventer item/rappel ; (2) les visible agents coaching reçoivent `active_plan_items` (fin du « je n'ai pas la liste ») ; (3) doctrine d'exit « demande d'information » dans les dispatchers locaux coaching + feature_opportunity : « montre-moi mon plan / mes actions / où j'en suis » ⇒ `exit_to_global_dispatcher` → normal_reply qui possède la projection.
- Tests requis: positif (recap = items actifs exacts de la DB) ; anti-faux-positif (aucun item `completed` ni rappel présenté comme action active) ; paraphrase (« où j'en suis », « liste complète », « rappelle-moi mes actions ») ; intégration (préemption du flow coaching actif sur intention status).

## R1-B02 — Claim « c'est noté » sans commit sur suivi ambigu

- Bug id: `R1-B02`
- Tours: T6
- Famille: `BF-LEDGER-01` + `BF-INTAKE-04`
- Domaine owner: final response guard / EffectLedger + gate de confiance intake
- Source amont: cible de suivi ambiguë (« j'ai bougé un peu ») ni clarifiée ni mappée ; aucun garde n'empêche l'accusé « c'est noté » quand `direct_effects` est vide sur une demande de suivi.
- Symptome visible: « C'est noté : tu as bougé un peu aujourd'hui 👍 » alors qu'aucune entrée n'est créée.
- Preuve systeme: `direct_effects=[]`, `route_reason=normal_reply_default`, `user_plan_item_entries` inchangé (1 entry, celle de T4). Contraste T7 (cible explicite → commit correct).
- Correction attendue: sur intention track explicite + cible ambiguë → clarification déterministe OU refus d'accusé de commit ; garde EffectLedger interdisant « c'est noté » sans effet durable sur une demande de suivi.
- Statut: `fix_applied` partiel (chantier O, rerun requis)
- Fix reference: volet claim résolu — politique default-deny (companion : « Écritures: DIRECT_EFFECT_CONFIRMATION_CONTEXT est la seule vérité. Sans committed (ou sans contexte), jamais "c'est fait/noté/enregistré/programmé" ») + contrat d'outcome total : un `needs_clarify` porte sa question jusqu'au composeur avec interdiction d'accusé, et l'état pending est ré-exposé une fois au dispatcher (doctrine 3g) pour committer quand le user désambiguïse. Volet restant OUVERT (constaté en probe réel post-fix) : le dispatcher local désobéit encore à 3f et assert une cible devinée `identified/high` sur un report vague — le commit part alors sur un item non nommé (famille fabrication de cible). Le claim devient honnête (commit réel) mais le grounding de cible reste à traiter côté dispatcher.
- Tests requis: positif (cible explicite → commit + accusé) ; anti-faux-positif (cible ambiguë → pas d'accusé de commit) ; clarification (ambiguïté → question de désambiguïsation) ; ledger (accusé « noté » ⟺ effet durable présent).

## R1-B03 — Annulation de one-shot reminder routée en création (pas de cancel)

- Bug id: `R1-B03`
- Tours: T14
- Famille: `BF-ROUTE-03` + `BF-EFFECT-02`
- Domaine owner: classification d'opération dispatcher (create vs cancel) + tool skill one-shot reminder
- Source amont: pas de capacité d'annulation de one-shot reminder ; « annule-le » classé en `create_one_shot_reminder`, stoppé uniquement par le garde `duplicate_pending`.
- Symptome visible: « Je ne peux pas annuler ce rappel depuis ici … passe par la plateforme » ; le rappel reste actif.
- Preuve systeme: `direct_effects_to_run=[create_one_shot_reminder]`, `tool_skill_run.status=needs_clarify reason=duplicate_pending`, `scheduled_checkins ae04dab6…` toujours `pending`. Contamination aval: memory_item « Rappel de 19h … annulé » écrit par le memorizer alors que l'annulation a échoué.
- Correction attendue: ajouter une opération cancel/deactivate ciblée sur le pending existant + règle de classification distinguant create/cancel ; à défaut de cancel, ne jamais router une annulation vers create.
- Statut: `fix_applied` (validé en conditions réelles 2026-07-03)
- Fix reference: capacité cancel complète (chantier F4) — (1) contrat dispatcher : `payload_hint.intent="cancel"` sur toute demande d'annulation, jamais une création ; (2) garde structurelle dans le router (`one_shot_reminder/router.ts`) : intent=cancel ne touche JAMAIS le chemin create ; (3) exécution réelle (`executor.ts`) : le pending visé (ciblé par heure locale) passe en `status=cancelled` ; ambiguïté (plusieurs pending, pas d'heure) → clarification, jamais de devinette (l'ancien code aurait annulé TOUS les pending — bug latent corrigé) ; (4) rendu gaté sur le commit cancel prouvé (contrat O). **Probe réel** : « finalement annule le rappel de 18h » → `intent:"cancel"` émis, handler `cancel_one_shot_reminder` committé, DB `status=cancelled`, réponse « C'est annulé pour samedi 4 juillet à 18h ». Contamination memorizer traitée dans le même chantier : exclusion des états produit de l'extraction (`extract.ts` v2).
- Tests requis: positif (« annule le rappel de 19h » → pending désactivé en DB) ; anti-faux-positif (annulation ne crée jamais de rappel) ; intégration (cohérence memorizer: pas de fait « annulé » si l'effet a échoué).

## R1-B04 — Besoin émotionnel traité en productivité (coaching collant)

- Bug id: `R1-B04`
- Tours: T11, T12, T13
- Famille: `BF-INTAKE-06` + `BF-ROUTE-02`
- Domaine owner: dispatcher (arbitrage domaine émotionnel vs coaching action) + exit policy `coaching_recommendation`
- Source amont: signal émotionnel/relationnel explicite (solitude, « à plat ») classé `coaching_type=plan_action` ; le flow coaching reste actif (`continue_active`) et re-canalise chaque tour émotionnel en reco de feature.
- Symptome visible: T11 ignore « seul et à plat » et vend une carte ; T12 reconnaît via question méta (« vérifier le cadre ») ; T13 attuné mais repivote en « potion d'amour ». Le user doit pousser deux fois.
- Preuve systeme: T11 owner `coaching_recommendation` reason `coaching_recommendation_signal` ; T12/T13 `active_flow_arbitration=continue_active`.
- Correction attendue: prioriser la reconnaissance du ressenti avant tout outil ; sortir du flow « recommander une feature » sur pivot émotionnel clair ; ne proposer l'outil qu'après reconnaissance + confirmation du besoin.
- Statut: `open`
- Fix reference: —
- Tests requis: positif (message émotionnel → owner de présence, pas coaching collant) ; anti-faux-positif (le user n'a pas à répéter son besoin pour être entendu) ; paraphrase (variantes de solitude/découragement) ; exit policy (pivot émotionnel fait sortir `coaching_recommendation`).

---

## Récap effets durables du run (pour reset)

| Effet | Table | Id | Créé au tour | Action reset |
| --- | --- | --- | --- | --- |
| Entry track « 10 min mouvement » | `user_plan_item_entries` | `ee1af107…` | T4 | delete |
| Entry track « marche active » | `user_plan_item_entries` | `ebdb497c…` | T7 | delete + `current_reps` de `fad299cb` → 0 |
| One-shot reminder « sac 19h » | `scheduled_checkins` | `ae04dab6…` | T5 | delete (pending) |
| 7 memory_items + sources/actions/processing/run | `memory_*` | run `1ee81882…` | batch fin de run | delete |
| 30 messages web du run | `chat_messages` | scope web ≥ 02:50Z | T1–T15 | delete |
| État skill résiduel | `user_chat_states.temp_memory` (web) | `__track_progress_plan_item_runtime` | run | strip |

> Reset autorisé explicitement par `14-qa-test-guidelines.md`. Tous les effets ci-dessus ont une baseline pré-run vérifiée à 0 (aucune donnée pré-existante détruite). Reset en attente de validation (bloqué par le classifieur auto sur suppression multi-tables).
