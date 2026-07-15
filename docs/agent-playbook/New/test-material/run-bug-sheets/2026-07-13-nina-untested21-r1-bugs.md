# Bug Sheet — nina-untested21-r1 — 2026-07-13

Rapport associé: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-13-nina-untested21-r1.md`
Persona: Nina (`e5630c78-447e-452c-b7d6-e4b475cd22fd`) · Branche: `clean-v2-redesign` (working tree WIP)

## Résumé

- 15/15 tours valides (IA réelle, HTTP 200, DB vérifiée par tour, memorizer end-to-end scope Nina, reset baseline complet).
- Verdict global: **red** (2 effets durables de rappel faux, racine commune neuve).
- 2 red, 3 yellow, 10 green.
- **Positif majeur** : 3 reds de global20 re-validés **corrigés** sur la branche WIP (draft T8/global20-T4, dates composites T10/global20-T6, verify groundé T13/global20-T14).

## Bugs

### R1-B01 — Instruction durable de rappel corrompue sur replace « même chose »

- Bug id: `R1-B01`
- Tours: T3 (exposé au T15)
- Famille: `BF-EFFECT-03` (payload durable faux) · racine `BF-INTAKE-02` (extraction/anaphore)
- Domaine owner: `tools/always_on/create_one_shot_reminder` (héritage d'instruction sur replace) + intake (résolution d'anaphore)
- Source amont: résolution d'anaphore d'invariance de contenu sur replace/reschedule — « même chose » extrait comme `reminder_instruction` littéral au lieu d'hériter l'instruction du rappel annulé.
- Symptome visible: réponse re-cite le bon texte (« préparer ta gamelle »), mais le rappel de demain 19:00 délivrera « à propos de: même chose ».
- Preuve systeme: DB `b4a80ec7` — `event_context=one_shot_reminder:meme_chose`, `message_payload.reminder_instruction="même chose"`, `event_grounding="…à propos de: même chose."` ; ledger committed=2 (cancel+create atomiques, horaire correct 19:00/jour hérité).
- Correction attendue: sur replace/reschedule, toute anaphore d'invariance (« même chose », « pareil », « le même », « idem », « même texte ») **hérite** l'instruction du rappel ciblé. Généralise P3-F (qui ne couvre que « même texte »).
- Tests requis: positif « annule X, remets à H, **même chose** » → `reminder_instruction` = instruction de X ; paraphrases « pareil »/« idem »/« le même texte » → héritées ; anti-régression P3-F « même texte » reste vert ; anti-faux-positif « remets-le à H **et remplace le texte par Y** » → Y (pas d'héritage).
- Statut: `fix_applied` (chantier P6, 2026-07-13) — P6-A: `isReminderInstructionInvarianceAnaphora` (« même chose/pareil/idem… », queues politesse+temporelles retirées) + héritage P3-F étendu; probe live P6-1 (2× ALL GREEN build final).

### R1-B02 — Objet de rappel perdu à travers un clarify (past-time) → instruction = qualificatif

- Bug id: `R1-B02`
- Tours: T6 (exposé au T15)
- Famille: `BF-EFFECT-03` (payload durable faux) · racine `BF-INTAKE-02` (objet non hérité à travers clarify)
- Domaine owner: `tools/always_on/create_one_shot_reminder` (héritage d'instruction à travers clarify) + intake
- Source amont: la finalisation d'un rappel après un clarify past-time recompile l'instruction depuis le **seul tour de résolution** au lieu d'hériter l'`instruction_hint` du tour d'origine ; le qualificatif temporel résiduel « avant ma garde » est pris comme instruction.
- Symptome visible: **non rattrapable** — la réponse « C'est calé pour demain soir à 20:00, avant ta garde » ne re-cite pas l'objet (« me peser »).
- Preuve systeme: DB `3bee3a61` — `event_context=one_shot_reminder:avant_ma_garde`, `reminder_instruction="avant ma garde"`, `event_grounding="…à propos de: avant ma garde."` ; heure correcte (20:00 Paris demain). Objet « monter sur la balance/me peser » posé au T5, perdu.
- Correction attendue: porter l'objet/`instruction_hint` du tour d'origine dans l'état pending du clarify et l'**hériter** à la finalisation ; un tour de résolution ne portant qu'heure+qualificatif ne doit jamais réécrire l'instruction. **Racine commune avec R1-B01** (héritage d'instruction quand le tour de suivi ne répète pas l'objet).
- Tests requis: « rappelle-moi ce soir 20h de me peser » (passé) → « alors demain 20h » → `reminder_instruction="monter sur la balance/me peser"` ; idem à travers un clarify de créneau (« du matin ou du soir ? » → « du soir ») ; anti-faux-positif où le tour de résolution redéfinit explicitement l'objet.
- Statut: `fix_applied` (chantier P6, 2026-07-13) — P6-A: le clarify past_time persiste `pending_clarification` (instruction_hint du tour d'origine) et la finalisation hérite; probe live P6-2.

### R1-B03 — Ambiguïté de méridiem non reconnue sur heure numérique

- Bug id: `R1-B03`
- Tours: T1
- Famille: `BF-INTAKE-04` (ambiguïté non reconnue)
- Domaine owner: intake temporel (ceinture `hour_meridiem_ambiguous`)
- Source amont: la ceinture d'ambiguïté de méridiem flag « huit heures » (en lettres, validé Eva P4-D) mais **pas** « 7 heures » (numérique) → résolution directe à 07:00.
- Symptome visible: « rappel demain à 7 heures » (Nina travaille de nuit, part le soir) créé à 07:00 sans clarify.
- Preuve systeme: `direct_effect_time_context` sans flag d'ambiguïté ; `UTC_time=2026-07-14T05:00:00Z` committé direct (`b2b9bf44`).
- Correction attendue: étendre la ceinture aux heures numériques basses (1-11) sans marqueur de méridiem (« du matin/du soir/h précisé ») → clarify léger OU résolution justifiée, cohérente entre « 7 heures » et « sept heures ».
- Tests requis: « à 7 heures » sans méridiem → clarify ou résolution justifiée ; cohérence « 7 heures » ≡ « sept heures » ; anti-faux-positif « à 7h du matin »/« à 19h » → pas de clarify.
- Statut: `fix_applied` (chantier P6, 2026-07-13) — P6-H: ceinture `hour_meridiem_ambiguous` étendue au numérique + mot entier (« 7 heures » ≡ « sept heures »); anti-FP méridiem explicite/heure ≥ 12 committent direct (tests triplet).

### R1-B04 — Admission reschedule fragile : intent compris mais bloqué, workaround imposé

- Bug id: `R1-B04`
- Tours: T2
- Famille: `BF-EFFECT-04` (executor/admission fragile)
- Domaine owner: `tools/always_on/create_one_shot_reminder` (admission reschedule) + garde d'effet
- Source amont: `intent=reschedule` parsé avec cible unique et heure correcte (19:00), mais la lane bloque `reschedule_not_supported` et renvoie la charge au user.
- Symptome visible: « je ne peux pas corriger ce rappel tel quel ; fais plutôt annule-le et remets-le à 19:00 » — friction alors que le système a tout compris.
- Preuve systeme: tool_skill_run status `blocked` reason `reschedule_not_supported` ; payload_hint `intent=reschedule, UTC_time=2026-07-14T17:00Z` ; ledger blocked=1.
- Correction attendue: quand intent=reschedule + cible unique + heure parsés en haute confiance, exécuter la séquence atomique cancel+create (comme le replace), sans dégrader vers un workaround manuel.
- Tests requis: « corrige l'heure à 19h » sur rappel unique frais → reschedule atomique appliqué ; anti-faux-positif cible ambiguë (plusieurs rappels) → clarify de cible.
- Statut: `fix_applied` (chantier P6, 2026-07-13) — P6-H (décision actée 13/07, renverse V1): reschedule haute confiance (cible unique + heure parseable) exécuté en replace atomique avec héritage d'instruction; ambigu → blocage honnête inchangé; probe live P6-9 + harness rappels 5/5.

### R1-B05 — Question de vérification résolue par une création de suivi

- Bug id: `R1-B05`
- Tours: T12
- Famille: `BF-ROUTE-03` (status/mutation mal priorisés) · adjacent [[status-question-silent-create]]
- Domaine owner: dispatcher (arbitrage status-check vs create) + intake `track_progress_plan_item`
- Source amont: tour à acte de parole dominant « vérification » (« ça me fait bien 3, c'est ça ? ») embarquant un report implicite (« que j'ai fait aussi ») → classé create explicit/high, commit d'une nouvelle complétion.
- Symptome visible: une 3e entry eau (2026-07-13) créée ; réponse « avec aujourd'hui, ça te fait bien 3 » (transparente).
- Preuve systeme: direct_effects `track_progress_plan_item` explicit/high ; ledger committed=1 ; DB `current_reps` 2→3.
- Correction attendue: un tour de vérification ne commit un track qu'avec un marqueur d'action explicite (« note aussi », « compte celui d'aujourd'hui »), sinon reflète le compte DB et propose de logger.
- Tests requis: « ça fait bien N ? » (question) → compte DB + offre, pas de commit ; « note aussi aujourd'hui » → commit ; anti-régression du grounding T13.
- Statut: `fix_applied` (chantier P6, 2026-07-13) — P6-F: `isTrackProgressStatusQuestion` + dominance vérification sans marqueur d'écriture explicite → status_question (readout DB, zéro write); probe live P6-7.

## Re-validations positives (branche WIP) — pour mémoire, pas des bugs

| Ref global20 | Surface | Résultat untested21 | Statut |
| --- | --- | --- | --- |
| global20-T4 (red BF-STATE-03) | Draft lifecycle rappel | T8 green — draft rendu, 0 création | `verified` (run réel) |
| global20-T6 (red BF-EFFECT-03) | Track plage de dates composite | T10 green — 2 entries aux 2 dates | `verified` (run réel) |
| global20-T14 (red BF-STATUS-01) | Verify groundé DB sous doute | T13 green — corrige un faux compte (5→3) sur DB | `verified` (run réel) |
