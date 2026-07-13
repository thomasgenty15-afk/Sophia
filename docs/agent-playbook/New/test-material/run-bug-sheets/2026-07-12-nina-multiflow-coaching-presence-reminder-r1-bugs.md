# Feuille De Suivi Bugs — Nina Multiflow r1 (2026-07-12)

Run: `nina-multiflow-coaching-presence-reminder-r1` · Persona: Nina (`e5630c78-447e-452c-b7d6-e4b475cd22fd`)
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-12-nina-multiflow-coaching-presence-reminder-r1.md`

Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`

---

## R1-B01 — Rappel one-shot ne persiste pas (disparition post-commit)

- Bug id: `R1-B01`
- Tours: T8, T10 (racine du symptôme T8/T13)
- Famille: **BF-EFFECT-02** (effet durable attendu absent)
- Domaine owner: pipeline `create_one_shot_reminder` (post-commit) / effect ledger / chemin app de suppression `scheduled_checkins`
- Source amont: chemin app post-création (les inserts DB bruts survivent, les créations via app disparaissent en ~2 min)
- Symptôme visible: le rappel confirmé au T4 (« programmé pour 8h ») a disparu au T8 ; idem le rappel recréé au T10, disparu avant le T13.
- Preuve système: `scheduled_checkins` `2a86dbff` créé 18:14:39 (vérifié pending) → 0 ligne à 18:17–18:19 ; `e70c5925` créé 18:24:19 (vérifié 18:24:35) → 0 ligne à 18:26:16. **Exonérations**: `process-checkins` (pas de tick dans 18:24:19→18:26:16 ; n'update que le statut ; la **sentinelle brute `de7b1699` survit** à son tick 18:30:00), trigger `min_gap_1h` (exempte `one_shot_reminder:%`, ne delete jamais), `classify-recurring-reminder` (delete `recurring_reminder:%` seulement, non déclenché). Aucune fonction delete-capable n'a tourné dans la fenêtre.
- Correction attendue: invariant de durabilité — après commit, aucun chemin app ne supprime un `scheduled_checkins` one-shot sans annulation explicite utilisateur. Identifier et couper le chemin app fautif (culprit exact non confirmé par analyse statique).
- Statut: `resolu_environnement` (2026-07-12, chantier P0-2) — le trigger d'audit AFTER DELETE (posé ce jour) a identifié la purge : `delete from scheduled_checkins where user_id=$1 and event_context like 'one_shot_reminder%' and created_at >= $2` par des backends `deno_postgres` (cleanups de runs/harness QA CONCURRENTS, cf. feuille Rose E1) — pas un chemin produit. Ceintures posées quand même : exemption `one_shot_reminder:%` des deux cancels de masse WhatsApp (`process-checkins`, `schedule-whatsapp-v2-checkins`) + audit permanent ; consigne : ne jamais lancer deux runs/cleanups QA en parallèle sur les mêmes personas
- Fix reference: —
- Tests requis: (positif) create→read au tour N+1 = même rappel présent ; (intégration) rappel one-shot survit à N ticks `process-checkins` ; (anti-régression) sentinelle brute et rappel app ont la même durabilité.

---

## R1-B02 — Re-demande explicite de rappel bloquée (reschedule_not_supported)

- Bug id: `R1-B02`
- Tours: T9 (contraste T10)
- Famille: **BF-EFFECT-04** (executor bloque une demande explicite) ; secondaire **BF-INTAKE-05** (sémantique composite aplatie « remets » → reschedule)
- Domaine owner: intake `create_one_shot_reminder` (canonical mapping) + effect gate / executor admission
- Source amont: intake mappe « remettre/remets » → `intent=reschedule` ; executor sans capacité reschedule → `reschedule_not_supported` → block, même sans rappel cible existant.
- Symptôme visible: « tu peux me le remettre ? » (explicit, high conf) → bloqué + consigne de contournement auto-contradictoire (« annule puis remets » ce qui n'existe pas). Débloqué seulement au T10 via paraphrase-test « annule et recale-en un neuf ».
- Preuve système: effect_ledger T9 `one_shot_reminder.create` requested (`reason_code=reschedule`) → `blocked` (`reason_code=reschedule_not_supported`, source=executor) ; `direct_effects` explicitness=explicit, confidence=high, UTC_time=2026-07-13T06:00:00Z.
- Correction attendue: « remets/recale » sans cible résoluble = create ; executor dégrade reschedule→create quand target absent au lieu de bloquer ; supprimer la consigne contradictoire.
- Statut: `fix_applied` (2026-07-12, chantier P0-4) — intent=reschedule avec ZÉRO pending à recibler → dégradé en CREATE quand le payload est complet (l'intention réelle est de (re)poser le rappel) ; payload incomplet → needs_clarify `reschedule_no_target` SANS proposer « annule-le et remets-le » (consigne inexécutable sans cible) ; un pending existant garde le blocage honnête (non-régression eva-r5 B01). Triplet testé (`one_shot_reminder_tool_test.ts`) + guidance dédiée
- Fix reference: —
- Tests requis: (positif) « remets-moi le rappel de 8h » sans cible = create réussi ; (paraphrase) « remets » / « recale » / « refais » convergent ; (anti-faux-positif) un vrai reschedule d'un rappel existant ne crée pas de doublon.

---

## R1-B03 — Statut rappel halluciné (rappel fantôme « sortir le chien »)

- Bug id: `R1-B03`
- Tours: T13 (résiduel T14)
- Famille: **BF-STATUS-01** (projection DB mal lue / inventée)
- Domaine owner: `read_one_shot_reminder_status` (projection statut) + composeur final
- Source amont: sur lecture vide, la projection/composeur renvoie un item inventé (« sortir le chien à 21:35 ») absent de toute la DB, au lieu de « aucun rappel en attente ».
- Symptôme visible: Sophia affirme un rappel inexistant appartenant à personne, tout en niant le rappel réel demandé.
- Preuve système: DB Nina = 0 ligne à 18:25:57 ; `ilike '%chien%'` et `'%21%35%'` sur toute la table `scheduled_checkins` → 0 ; aucun « chien » dans le code de l'outil rappel grepé. `read_one_shot_reminder_status` exécuté, effect_counts=0.
- Correction attendue: statut strictement dérivé des lignes DB de l'utilisateur ; lecture vide = « aucun rappel en attente », jamais d'exemple/placeholder. Garde déterministe sur la sortie du lecteur (doctrine: routing déterministe depuis sorties structurées).
- Statut: `fix_applied` (2026-07-12, chantier P0-3)
- Fix reference: cause identifiée — le bloc « Rappels ponctuels en attente » de l'ÉTAT DURABLE listait TOUS les `scheduled_checkins` pending SANS filtre `event_context` : un checkin cron (night-prep 21:35, reviews) y apparaissait comme un « rappel » SANS instruction, que le composeur baptisait (« sortir le chien » = confabulation sur créneau anonyme 21:35 ; « chien/21h35 » figure aussi dans un exemple de doctrine dispatcher, remplacé par « lessive/18h05 » par prudence). Fix : filtre `event_context like 'one_shot_reminder:%'` sur la requête du loader (`context/loader.ts`) — plus aucun checkin cron ne peut se présenter comme rappel user. Guidance status inchangée (liste vide = « aucun », zéro invention)
- Tests requis: (anti-faux-positif) DB vide → réponse « aucun rappel », zéro item inventé ; (positif) un rappel réel présent est lu exactement (heure/instruction) ; (intégration) aucun libellé cross-persona ne fuit dans la lecture.

---

## R1-B04 — track_progress négatif non consenti sur tour de blocage

- Bug id: `R1-B04`
- Tours: T2
- Famille: **BF-EFFECT-01** (effet durable non consenti) ; secondaire **BF-EFFECT-03** (payload durable faux — mauvaise action)
- Domaine owner: `track_progress_plan_item` (router parallèle `router_parallel_tracking_v2`) + effect gate admission
- Source amont: un signal de blocage (« je repousse », « je bloque ») est traité comme un report de progression et admet un effet durable négatif ; l'appariement d'action est fait au plus proche (« Préparer une option saine à portée ») alors que Nina parle de vider ses placards.
- Symptôme visible: Sophia annonce « Préparer une option saine à portée est marqué comme raté » — marquage négatif non demandé, sur une action non nommée par l'utilisatrice.
- Preuve système: `user_plan_item_entries` inséré (18:12:03) `entry_kind=skip`, `outcome=missed`, `plan_item_id=74783025`, `source=router_parallel_tracking_v2`, `status_hint=missed` ; ledger `plan_item_progress.track` committed.
- Correction attendue: l'admission d'un track négatif exige un report de progression explicite (persona: blocage → aide à exécuter, pas modifier le plan auto). Garde d'explicitness côté effect gate, transverse.
- Statut: `fix_applied` (2026-07-12, chantier P1-1)
- Fix reference: double garde — (1) doctrine dispatcher 3d étendue : un blocage au PRÉSENT (« je repousse », « je bloque ») n'est jamais un report `missed` (verbatim du tour ajouté en contre-exemple) ; (2) garde runtime G1 durcie pour le négatif : `progress_status=missed` exige une cible nommée via `strict_aliases` (aliases structurés sans description, `track_progress_plan_item/router.ts`) — l'appariement « au plus proche » ne suffit plus. Tests triplet (`track_progress_plan_item_tool_test.ts`). Probe live 12/07 : « je repousse » → zéro write ; anti-FP « hier c'est raté pour <item nommé> » → write missed accepté (2 passes GREEN)
- Tests requis: (anti-faux-positif) « je bloque / je repousse » n'écrit aucun `missed` ; (positif) « je ne l'ai pas fait aujourd'hui » explicite écrit bien un skip ; (paraphrase) blocage vs report distingués.

---

## Notes (non-bugs / incidents)

- **T14 HTTP 502 Kong** (« invalid response from upstream ») : incident infra transitoire (`BF-TEST-01`), retry OK. Un message user orphelin loggé, nettoyé. Non-produit.
- **T14 « à 7h »** : contamination diagnostique — rappel **sentinelle** inséré en DB brute (18:27:43, 07:00 Paris) pour tester la persistance ; la lecture l'a trouvé mais mislabellisé. À ne pas compter comme comportement produit pur.
- **T11 soft-miss** : `coaching_recommendation` sous-détecté sur un pattern récurrent (rattrapé au T12). À surveiller, pas de ligne bug ouverte.
- **`current-plan.md` de Nina périmé** : drift doc vs DB (plan actif réel différent). Hygiène doc, hors runtime.

---

## Nettoyage effectué (fin de run, autorisation explicite)

- `scheduled_checkins` Nina: supprimés (dont sentinelle `de7b1699`) → 0.
- `user_plan_item_entries` du run (T2 skip/missed): supprimé.
- `chat_messages` web du run: supprimés (31 lignes, dont l'orphelin 502).
- `user_chat_states.temp_memory` (web): réinitialisé `{}`.
- Vérif finale: 0 checkin / 0 message run / 0 entry. Item `74783025` reste `active` (inchangé).
- Memorizer: aucun déclenchement (pas d'intention mémoire explicite « retiens que… » dans le run).
