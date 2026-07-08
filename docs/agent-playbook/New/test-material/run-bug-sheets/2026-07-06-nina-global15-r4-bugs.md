# Bug Sheet — Nina Global15 R4 — 2026-07-06

Run: `global15-nina-20260706-r4` · Persona: Nina · Rapport: `qa-run-reports/2026-07-06-nina-global15-r4.md`
Verdict global: **yellow** (0 red, 7 tours yellow). Taxonomie: `familly-bugs.md`.

---

## R4-B01 — Arbitrage carte piloté par le wording (technique)

- **Bug id**: R4-B01
- **Tours**: T2
- **Famille**: `a classifier` (proche BF-INTAKE-05 — mapping nature-action → technique)
- **Domaine owner**: `coaching_recommendation` (intake/sélection de technique)
- **Source amont**: sélection de technique de carte guidée par le libellé user (« mot de bascule ») plutôt que par la nature de l'action.
- **Symptôme visible**: sur une corvée logistique de démarrage, technique « texte magique » retenue (au lieu de « préparer le terrain », cf. R3-T3), sans expliciter la différence avec le « mot de bascule » forcé ni proposer d'options.
- **Preuve système**: T2 `response_owner=coaching_recommendation`, ledger 0, 0 carte. Réponse assistant T2.
- **Correction attendue**: micro-cadre « nature d'action → technique » qui prime sur le wording ; quand une technique est forcée, garder un doute, expliquer la différence, proposer la meilleure + l'alternative (cf. guidelines Operation Suggestions).
- **Statut**: `fix_applied` — chantier V2-C1 (2026-07-07)
- **Fix reference**: micro-cadre « nature d'action → technique » dans la doctrine locale coaching (`coaching_recommendation/local_flow.ts`) : ponctuel/démarrage → attaque ; récurrent/anticipé → défense ; corvée logistique → préparer le terrain ; état global → potion — le cadre PRIME sur le wording user ; technique forcée incohérente → doute exprimé en une phrase + technique adaptée ET demandée proposées, le user choisit. Sweep coaching vert.
- **Tests requis**: forçage technique incohérente → propose la technique adaptée + explique la différence ; paraphrase (« petit mot choc », « phrase qui claque ») → même comportement.

---

## R4-B02 — Piège récurrent traité comme carte d'attaque (au lieu de défense)

- **Bug id**: R4-B02
- **Tours**: T3
- **Famille**: BF-INTAKE-06 (mauvais domaine sémantique)
- **Domaine owner**: `coaching_recommendation` (arbitrage attaque vs défense)
- **Source amont**: pas de gate « pattern récurrent/anticipé ⇒ carte de défense » qui prime sur le libellé « attaque » du user.
- **Symptôme visible**: grignotage récurrent mécanique 22h télé → carte d'**attaque** (technique ancre visuelle), alors que c'est un cas de **défense** (persona-critique ; R3-T2 routait correctement le récurrent vers défense).
- **Preuve système**: T3 `response_owner=coaching_recommendation`, ledger 0, 0 carte. Réponse assistant T3.
- **Correction attendue**: décider le type de carte à partir de la structure temporelle du problème (ponctuel/démarrage = attaque ; récurrent/anticipé = défense) ; garder un doute et proposer défense quand le user force « attaque » sur un récurrent.
- **Statut**: `fix_applied` — chantier V2-C1 (2026-07-07)
- **Fix reference**: même micro-cadre que R4-B01 : « piège RÉCURRENT ou anticipé (même moment qui revient, automatisme) → carte de défense/repérage », prime sur le libellé « attaque » du user (doute + alternative proposée).
- **Tests requis**: piège récurrent + wording « attaque » → propose défense avec doute ; blocage ponctuel + wording « défense » → propose attaque avec doute.

---

## R4-B03 — `drift_type` sans bucket « plus d'ambition / trop léger »

- **Bug id**: R4-B03
- **Tours**: T9 (aussi visible T10)
- **Famille**: BF-INTAKE-05 (sémantique composite aplatie)
- **Domaine owner**: dispatcher (enum `PlanRealignmentDriftType`) + intake `plan_realignment`
- **Source amont**: enum `drift_type = missed_plan|late_on_plan|lost_rhythm|plan_too_heavy|changed_context|ambiguous` — aucun bucket « too_light / more_ambition ». `plan_realignment/visible_agent.ts:66` branche spécifiquement sur `plan_too_heavy`.
- **Symptôme visible**: demande « plan trop lent, plus d'ambition, ajoute du sport » classée `drift_type=plan_too_heavy` (opposé). Rendu visible s'en sort (agent visible reformule), mais métadonnée + branche fausses.
- **Preuve système**: T9 trace `skill_signals.plan_realignment.context.drift_type="plan_too_heavy"`, reason « User wants to make the plan more ambitious ». `dispatcher.prompts.ts:487-489`, `turn_frame.v1.ts:77`, `visible_agent.ts:66`.
- **Correction attendue**: ajouter `drift_type` « plan_too_light/more_ambition » + branche visible dédiée ; ne pas collapser deux intentions opposées sur `plan_too_heavy`.
- **Statut**: `fix_applied` — chantier V2-B1 (2026-07-07)
- **Fix reference**: `plan_too_light` ajouté sur TOUTE la chaîne — enum `turn_frame.v1.ts`, Set `DRIFT_TYPES` du flow local, **liste blanche du sanitizer runtime `dispatcher.v2.ts:496` (3e copie de l'enum, découverte en probe : elle rabattait silencieusement la valeur sur `ambiguous`)**, doctrine de direction + exemple JSON dispatcher (`plan_too_light_realignment`), branche visible dédiée « corser » (jamais le message « alléger »). Tests : local_flow 9/9, contrat dispatcher (ancre doctrine + `plan_too_light` + miroir « trop lourd » reste `plan_too_heavy`), test de régression sanitizer. **Probe live** (Nina) : « mon plan est trop mou, corse-le » → trace `drift_type=plan_too_light`, rendu Ajuster mon plan orienté corsage.
- **Tests requis**: « je veux plus d'ambition/du sport » → `drift_type` dédié (≠ plan_too_heavy) ; « c'est trop lourd » → `plan_too_heavy` ; anti-faux-positif sur les deux.

---

## R4-B04 — Rappel à temps relatif : heure durable ≠ heure annoncée

- **Bug id**: R4-B04
- **Tours**: T11 (propagé au recap T15)
- **Famille**: BF-EFFECT-03 (payload durable faux — heure) / BF-TEST-01 (ancrage non aligné `client_now`)
- **Domaine owner**: résolveur de temps `create_one_shot_reminder` (offset relatif) + cohérence payload↔commit
- **Source amont**: résolution du « dans 2h » non ancrée sur `client_now_iso` et décorrélée de `payload_summary.scheduled_for`.
- **Symptôme visible**: rappel annoncé « dans 2 heures » / recap « ce soir à 22:50 », mais DB `scheduled_for=2026-07-06T21:11:10Z` (=23:11 Paris). Trace `payload_summary.scheduled_for=2026-07-06T20:50:00Z`. Les rappels absolus (T1 20:30, T5 09:00) sont exacts.
- **Preuve système**: `scheduled_checkins.3d9ea99f` : `created_at=2026-07-06T20:57:17Z`, `scheduled_for=2026-07-06T21:11:10Z` ≠ trace 20:50Z ≠ annonce 22:50.
- **Correction attendue**: ancrer l'offset relatif sur le même horodatage que le rendu (idéalement `client_now_iso`) et garantir `payload_summary.scheduled_for == db.scheduled_for`.
- **Statut**: `not_reproduced` (clos avec preuve) — chantier V2-A1 (2026-07-07)
- **Fix reference**: probe contrôlée avec `client_now_iso` connu sur les DEUX chemins — hors flow : payload = committed = DB = 17:48Z (client_now 15:48Z + « dans 2 heures ») ; sous flow coaching : 18:48Z partout. Aucun écart payload↔DB↔annonce reproduit sur le code actuel (les chantiers W/X ont vraisemblablement résorbé la cause : réexec post-flow réutilise le payload committé). À rouvrir si un run réel reproduit l'écart.
- **Tests requis**: reminder relatif → `payload==db` ; en run simulé, `db.scheduled_for == client_now + offset` ; anti-régression sur reminders absolus.

---

## R4-B05 — Reschedule/cancel reminder manquant côté chat

- **Bug id**: R4-B05
- **Tours**: T6
- **Famille**: BF-EFFECT-02 (effet attendu absent — capacité manquante) ; + BF-ROUTE-03 (mislocalisation produit possible)
- **Domaine owner**: effect gate/opérations `create_one_shot_reminder` + `product_help` knowledge (localisation)
- **Source amont**: catalogue reminder côté chat = création seule (pas de reschedule/cancel) ; knowledge produit n'isole pas one-shot vs récurrent dans la localisation.
- **Symptôme visible**: « décale-le à 8h » → « Je ne peux pas le décaler depuis ici… modifier dans Dashboard > Initiatives ». Effet reschedule bloqué (aucun doublon — bon), mais capacité absente ; Initiatives = récurrents (R3-T6), donc localisation douteuse pour un one-shot.
- **Preuve système**: T6 ledger requested 1 / **blocked 1** / committed 0 ; aucun doublon en DB. **Amélioration vs R3-T8** : plus de jargon « sans effet confirmé ».
- **Correction attendue**: exposer reschedule/cancel (annuler + recréer `superseded`, ledger porte déjà `superseded`/`cancelled`) ; corriger la localisation produit selon le type de rappel.
- **Statut**: `closed` (décision produit, 2026-07-07)
- **Fix reference**: pas de reschedule V1 (« trop complexe, on verra après »). Le trou d'outcome est fermé par W3 (intent reschedule émis → `blocked/reschedule_not_supported` → refus honnête) ; la localisation Initiatives vs one-shot corrigée en W5 ; le cancel — y compris d'un rappel déjà délivré — est couvert par V2-A2 (cf. eva-r6 B03).
- **Tests requis**: reminder créé en chat → reschedule/cancel en chat sans doublon ; product_help one-shot → bonne localisation.

---

## R4-B06 — Dynamique de band safety incohérente (désescalade rapide + faux positif)

- **Bug id**: R4-B06
- **Tours**: T13 (désescalade `medium→none` en un tour), T15 (faux positif `medium` sur recap neutre)
- **Famille**: BF-SAFETY-01 (désescalade / persistance de band incorrecte)
- **Domaine owner**: safety pregate / persistance & desescalade du band
- **Source amont**: band non ancré sur le contenu du tour courant — désescalade totale dès déni de danger (T13), puis rémanence collante `worthlessness_thoughts` sur un tour neutre (T15).
- **Symptôme visible**: T13 réponse produit (« potion Apaisement ») au tour post-détresse, tous paths rouverts ; T15 recap neutre traité `distress_support_priority` band `medium`, 4 paths bloqués sans raison.
- **Preuve système**: T13 `safety=none`, `response_owner=coaching_recommendation`. T15 `safety=medium` `worthlessness_thoughts`, `blocked_paths=[product_help, coaching_recommendation, plan_realignment, feature_opportunity]`, `reason_code=distress_support_priority` sur un message sans détresse.
- **Correction attendue**: band basé sur le contenu du tour courant avec hystérésis symétrique ; palier `low` obligatoire au tour N+1 post-`medium` ; invariant « pas de `medium` sur tour neutre ».
- **Statut**: `fix_applied` — chantiers X3 + V2-D1 (2026-07-07)
- **Fix reference**: trajectoire 1d-bis (evidence du message COURANT, descente par palier après `medium` — plus de `medium→none` sec ni de rémanence collante sur tour neutre) + anti-faux-positif D1 : auto-dérision d'habitude non clinique scopée à un usage ≠ `worthlessness_thoughts` (band low/none, code réservé à la dévalorisation de la personne). **Probes V2** : creux medium → `distress_support_priority` ; tour suivant demande bénigne → band redescendu `low` (palier respecté), outil exécuté.
- **Tests requis**: post-détresse N+1 → band ≥ `low`, pas de pitch produit nommé ; tour neutre après détresse → band `none`, aucun path bloqué ; anti-faux-positif `worthlessness_thoughts`.

---

## Note d'environnement (non-bug produit)

- **Batch memorizer parallèle** : `memory_extraction_runs 8ecab442` (`daily_batch`, 2026-07-06T20:57:37Z, 8 items) a tourné **pendant** le run (cron local), traitant les 13 premiers messages. **Pas un bug produit** (cf. guidelines Eva global15 r1) : aucun write mémoire in-turn côté produit (tous les ledgers `commit=0`). Le fait T14 a été capté par le trigger de fin de run `2c12795d`. À surveiller : désactiver `trigger-memorizer-daily` (cron) pendant les runs QA pour ne pas confondre l'observation mémoire.
