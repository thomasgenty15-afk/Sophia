# Bug Sheet — alex-untested24-r1 (2026-07-15)

Rapport source : `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-15-alex-untested24-r1.md`
Run : IA réelle locale, 22 tours, persona Alex. Verdict global red.

## R1-B01 — Date du contenu écrase l'ancre temporelle résolue

- Bug id: R1-B01
- Tours: T5
- Famille: `BF-EFFECT-03` (source amont `BF-INTAKE-02`)
- Domaine owner: one_shot_reminder — intake/time_parser (exécuteur)
- Source amont: `operation_runtime_pipeline`/`time_parser` re-parse le texte et laisse « pour demain » (token du CONTENU, `instruction_hint`) écraser l'ancre déjà résolue par le dispatcher (frame : `UTC_time=2026-07-15T20:00Z`, `local_label="aujourd'hui à 22:00"` ; commit : 2026-07-16). `parse_source="payload_utc_time"` est en plus mensonger.
- Symptome visible: « à 22h ce soir » annoncé « ce soir », committé demain 22:00.
- Preuve systeme: frame vs ledger du turn 4db83c47 ; DB `scheduled_checkins` 5876c0f0 `2026-07-16 22:00` Paris ; slug `preparer_mon_sac_de_sport_pour_demain`.
- Correction attendue: la résolution temporelle ne consomme que le segment temporel désigné (`when_hint`) ; les tokens de date de `instruction_hint` sont inertes ; en conflit, l'ancre frame résolue prime ; `parse_source` doit refléter la vraie source. Rendu asservi au `local_label` committé.
- Statut: fix_applied
- Fix reference: P12-A (scope temporel : jetons de date du CONTENU inertes pour les couches P3-B + parse_source fidèle)
- Tests requis: positif (« ce soir 22h » + contenu « pour demain » ⇒ aujourd'hui) ; paraphrase (« demain 9h pour préparer la réunion de vendredi » ⇒ demain) ; anti-faux-positif (« pour demain 9h » sans autre ancre ⇒ demain) ; intégration commit+label.

## R1-B02 — « Celui du soir » à 2 candidats : clarify nominative jamais émise

- Bug id: R1-B02
- Tours: T7
- Famille: `BF-INTAKE-04` (+ `BF-INTAKE-02` : anaphore stockée en `instruction_hint="le soir"`)
- Domaine owner: one_shot_reminder — router/intake (résolution d'entité par créneau nominal, P10-E)
- Source amont: P10-E ne couvre que le cas 1 candidat ; à N=2 dans la fenêtre, la résolution n'est pas tentée, l'intent reschedule dégrade en create → blocked `missing_instruction` → question générique (« Il me manque ce qu'il faut rappeler »), rendue en double.
- Preuve systeme: frame turn c94d7939 (`intent=reschedule`, `instruction_hint="le soir"`) ; ledger blocked `missing_instruction` ; guards `commit_claim_stripped` sur ce turn.
- Correction attendue: extension P10-E multi-candidats → ambiguïté structurée avec candidats nommés, branchée sur la clarify nominative P10-B (« ton rappel étirements de 19:00 ou ton sac de sport de 22:00 ? ») ; invariant renderer anti-duplication de `clarify_question`.
- Statut: fix_applied
- Fix reference: P12-D5 (clarify nominative énumérant les candidats)
- Tests requis: positif (2 pendings soir ⇒ clarify nommant les deux) ; réponse au clarify par contenu ⇒ replace de la bonne cible ; anti-FP (1 seul pending soir ⇒ résolution directe, pas de clarify).

## R1-B03 — Cul-de-sac clarify : fusion absente + ré-arm sur rétractation

- Bug id: R1-B03
- Tours: T8, T9, T11 (T10 co-affecté, voir R1-B04)
- Famille: `BF-STATE-02` + `BF-INTAKE-01`
- Domaine owner: one_shot_reminder — reducer/pending clarification + dispatcher (exposition du pending)
- Source amont: le tour-réponse au clarify n'hérite jamais de l'intent pendant (fusion P7-C limitée au méridiem) : T8 (cible+20h30 fournis) re-classé create avec `when_hint="à 19h00"` (heure de désignation) ; T9 `when_hint="à 20h30"` présent au frame et POURTANT blocked `missing_time` (le parseur échoue quand le raw_text porte plusieurs jetons horaires) ; T11 (« laisse tomber ») ré-arme le pending au lieu de le purger, et la question pendante est concaténée après l'acquiescement. `clarification_exposed_to_dispatcher=false` en permanence dans `__one_shot_reminder_pending_clarification`.
- Symptome visible: 4 tours de suite « Il me manque le moment exact… », jargon interne (« l'effet de modification confirmé »), auto-contradictions.
- Preuve systeme: frames/ledgers turns T8/T9/T11 ; snapshots `temp_memory.__one_shot_reminder_pending_clarification` (raw_text mis à jour à chaque tour, mode inchangé).
- Correction attendue: (1) fusion généralisée à tous les reason_codes : slots du pending + slots du tour ⇒ tentative d'exécution avant tout re-clarify ; (2) condition de désarmement (doctrine P9) : rétractation/no-op ⇒ pending purgé, zéro question résiduelle ; (3) parser le segment `when_hint`, pas le raw_text multi-jetons ; (4) exposer le pending au dispatcher (flag existant jamais mis à true à investiguer).
- Statut: fix_applied
- Fix reference: P12-D1 (fusion généralisée tous reason_codes, when_hint isolé parsé) + P12-D2a (« laisse tomber » purge le pending)
- Tests requis: clarify missing_time + réponse « à 20h30 » ⇒ commit ; réponse cible+heure ⇒ replace bonne cible ; « laisse tomber » ⇒ pending purgé + aucune clarify rendue ; prémisse multi-jetons (« à 20h30… plus à 19h ») ⇒ 20:30.

## R1-B04 — Composite « annule X et remets à Y » aplati sous clarify actif (régression P4-B)

- Bug id: R1-B04
- Tours: T10
- Famille: `BF-INTAKE-05`
- Domaine owner: dispatcher direct effects (cardinalité) + reducer clarify
- Source amont: sous pending clarify actif, le composite bi-partie n'émet qu'UN effet create avec `when_hint="à 19h00"` (heure de l'ancien) → blocked `missing_time`. Le chemin P4-B validé (2 effets, transaction) n'est pas emprunté quand une clarify est armée.
- Preuve systeme: frame turn T10 : 1 seul `create_one_shot_reminder`, quand la même phrase hors-clarify (T16) émet le create (avec d'autres bugs).
- Correction attendue: une nouvelle demande explicite composite désarme le pending et est lue à neuf (cardinalité 2 au frame) ; c'est la condition de désarmement manquante de cette ceinture.
- Statut: fix_applied
- Fix reference: P12-D2b (composite sous clarify désarme + relit à neuf, fallback scheduled_for-seul sur segment elliptique)
- Tests requis: composite sous clarify actif ⇒ 2 effets frame + transaction ; anti-FP : réponse partielle au clarify (slot nu) ⇒ fusion, pas re-lecture.

## R1-B05 — « Avance d'une heure » : replace committé en silence vers now+1h

- Bug id: R1-B05
- Tours: T12 (dégâts constatés T13-T20)
- Famille: `BF-LEDGER-02` (commit réel rendu « rien fait ») + `BF-EFFECT-03` (sémantique du relatif fausse)
- Domaine owner: dispatcher direct effects (relatif) + final response pipeline (parité)
- Source amont: (1) « avance [le rappel des courses] d'une heure » → `when_hint="dans une heure"` : le décalage relatif est résolu contre MAINTENANT (09:46+1h=10:46) au lieu de cible−1h (16:00), direction inversée en prime ; (2) ledger committed 2 effets (cancel 17:00 + create 10:46) mais la réponse visible nie tout et demande « l'heure cible exacte » — le contrat P7-B (N commits ⇒ N annoncés) n'a pas de garde déterministe côté composer.
- Symptome visible: l'utilisateur croit que rien n'a été fait ; son rappel sonnera à 10:46 ; il découvre l'état réel par hasard à T19 ; à T20 Sophia requalifie ce commit en « erreur d'affichage ».
- Preuve systeme: ledger turn e5b2c3ad (committed cancel e2922d2e + create 17da7de3 `2026-07-15 08:46+00`) ; `direct_effect_confirmation_context` portait le committed avec guidance « un effet committé ne reste JAMAIS silencieux » — ignorée au rendu ; aucune ligne guards.
- Correction attendue: (a) contrat intake relatif : delta appliqué à `target.scheduled_for` uniquement ; sans cible résolue ⇒ clarify, jamais now±delta ; « avance » = plus tôt ; (b) garde déterministe miroir de P8-F : `committed>0` sans accusé mappé ⇒ rendu corrigé + ligne guards `commit_omitted_in_render` ; (c) T20-bis : ne jamais requalifier un commit en erreur d'affichage (projection historique, voir R1-B09).
- Statut: fix_applied
- Fix reference: P12-A (delta relatif ancré CIBLE, « avance » = plus tôt) + P12-C (garde commit_omitted_in_render : déni retiré + commits accusés depuis le ledger)
- Tests requis: « avance le rappel de 17h d'une heure » ⇒ 16:00 même jour (ou clarify honnête, zéro commit) ; « recule d'une heure » ⇒ 18:00 ; garde : tour avec commit + rendu sans accusé ⇒ bloqué ; ligne guards émise.

## R1-B06 — Gate reschedule incohérent inter-tours (contredit P6-H)

- Bug id: R1-B06
- Tours: T13 (vs T12)
- Famille: `BF-STATE-02`
- Domaine owner: admission des effets one_shot_reminder (parité des chemins)
- Source amont: T12 (reschedule relatif, cible nommée) est EXÉCUTÉ en replace ; T13 (reschedule absolu « à 16h au lieu de 17h », cible nommée, UTC_time résolu) est blocked `reschedule_not_supported` avec guidance V1 (« annule-le et remets-le… ou Dashboard > Initiatives »). Deux politiques opposées sur deux tours consécutifs ; la décision P6-H (reschedule haute-confiance = replace atomique, V1 renversée) n'est appliquée que sur certains chemins.
- Preuve systeme: ledgers T12 (committed×2) vs T13 (blocked `reschedule_not_supported`) ; guidance runtime embarquée dans `direct_effect_confirmation_context` T13.
- Correction attendue: politique d'admission unique conforme à P6-H sur les 3 chemins (router/pipeline/lane) ; supprimer l'issue `reschedule_not_supported` pour un intent à cible résoluble + heure haute-confiance ; mettre à jour la guidance V1 résiduelle.
- Statut: fix_applied
- Fix reference: P12-D6 (politique P6-H unique, blocage sans consigne circulaire)
- Tests requis: « mets-le à 16h au lieu de 17h » (cible unique) ⇒ replace atomique committé ; parité : même intent via les 3 chemins ⇒ même issue.

## R1-B07 — Replace : cible nommée re-demandée, « heure de départ » slot obligatoire à tort

- Bug id: R1-B07
- Tours: T14, T15
- Famille: `BF-INTAKE-04`
- Domaine owner: one_shot_reminder — résolution de cible replace
- Source amont: la résolution replace exige l'heure actuelle de la cible même quand le contenu la discrimine de façon unique (« les courses » : 1 seul pending) — contraire au principe P5-E (cible = évidence nommée) déjà appliqué côté track. Boucle aggravée : T15 dicte la formule exacte que T14 vient d'employer, et le doublon de contenu (fantôme 10:46 créé par R1-B05) déclenche un dialogue DÉPLACER/AJOUTER sans nommer les heures des candidats.
- Preuve systeme: transcripts T14/T15, 0 mutation, 3 pendings dont 1 seul « courses ».
- Correction attendue: résolution par évidence nommée : contenu unique ⇒ cible résolue sans ancre horaire ; si doublon de contenu, clarify nominative avec les heures des deux candidats (jamais une consigne circulaire).
- Statut: fix_applied
- Fix reference: P12-D7 (cible par évidence nommée sans ancre horaire, clarify avec les heures si doublon)
- Tests requis: « annule le rappel des courses et remets-le à 16h » avec 1 seul pending courses ⇒ transaction sans question ; avec 2 pendings courses ⇒ clarify nommant 10:46 et 17:00.

## R1-B08 — Claim « j'ai annulé » sans commit + commande stockée comme contenu du rappel

- Bug id: R1-B08
- Tours: T16
- Famille: `BF-LEDGER-01` + `BF-INTAKE-02` (récidive famille « reminder instruction inheritance », nina-untested21)
- Domaine owner: intake replace (héritage d'instruction) + final response guard (parité par-effet)
- Source amont: sur « annule-le et remets-le à 16h » (tour elliptique, cible anaphorique) : (1) l'instruction n'est pas héritée de la cible → `reminder_instruction="annule-le et remets-le à 16h"` committé tel quel (event_context `one_shot_reminder:annule_le_et_remets_le_a_16h`) ; (2) la moitié cancel est droppée sans dégrader l'annonce → « j'ai annulé le rappel des courses de 17:00 et je l'ai remis à 16:00 » avec 1 seul commit create et 0 cancel (le fantôme 10:46 reste pending).
- Preuve systeme: ledger turn 415d1853 (1 committed create, 0 cancel) ; DB 9b0d5044 ; aucune ligne guards.
- Correction attendue: héritage P6-A étendu au chemin sans pending explicite (cible résolue ⇒ instruction copiée de la cible ; un texte fait uniquement de verbes de commande n'est jamais un `reminder_instruction` valide — garde d'écho de commande P6 déjà actée à généraliser) ; parité par-effet au rendu : « annulé » exige un commit cancel, sinon formulation honnête + ligne guards.
- Statut: fix_applied
- Fix reference: P12-D8 (héritage écho-de-commande généralisé) + P12-C (parité par-type : « annulé » sans commit cancel ⇒ strip + guards)
- Tests requis: « annule-le et remets-le à 16h » avec cible résolue ⇒ cancel+create, instruction héritée ; garde : verbe « annulé » sans commit cancel ⇒ strip + guards ; anti-FP : « rappelle-moi d'annuler mon abonnement » ⇒ contenu légitime.

## R1-B09 — Commit silencieux requalifié « erreur d'affichage » (historique réécrit)

- Bug id: R1-B09
- Tours: T20
- Famille: `BF-STATUS-02`
- Domaine owner: status/récap — projection historique des effets
- Source amont: sans accès à l'historique des commits du tour T12 (jamais accusés), le composeur invente une explication (« je viens de me tromper en te sortant 10:46 ») pour la divergence constatée par l'utilisateur. L'effet exécuté (cancel du 10:46) est correct.
- Correction attendue: la projection status doit exposer « créé puis annulé/déplacé » depuis le ledger/DB (BF-STATUS-02 canonique) ; interdiction de requalifier un commit en erreur d'affichage ; dépend de R1-B05 (si le commit avait été accusé, pas de divergence à expliquer).
- Statut: fix_applied
- Fix reference: P12-C (doctrine RECIT D'HISTORIQUE au contrat rappels : jamais « erreur d'affichage » sur un commit passé)
- Tests requis: après replace committé, question « pourquoi 10:46 ? » ⇒ récit exact (déplacé au tour X), jamais « erreur d'affichage ».

## R1-B10 — « Celui de la nuit » sans pending nocturne : supposition au lieu d'un constat

- Bug id: R1-B10
- Tours: T17
- Famille: `BF-INTAKE-04` (yellow)
- Domaine owner: one_shot_reminder — résolution par créneau nominal (P10-E)
- Source amont: fenêtre 0-5h vide ⇒ au lieu de « aucun rappel dans la nuit » + inventaire, Sophia devine le récurrent 09:00 (« je suppose ») et renvoie vers Initiatives. Pièges durs évités (0 mutation, pas de retarget soir, pas de « celui de la nuit » stocké).
- Correction attendue: fenêtre nominale vide ⇒ constat honnête groundé inventaire + liste des pendings réels ; jamais de supposition de cible hors-fenêtre.
- Statut: fix_applied
- Fix reference: P12-D5 (fenêtre vide ⇒ constat honnête + inventaire)
- Tests requis: « celui de la nuit » sans pending 0-5h ⇒ négation + inventaire ; avec 1 pending 2h ⇒ résolution directe.

## R1-B11 — Fait explicite « garde ça en tête » jamais persisté (event_missing_date) ni servi en session

- Bug id: R1-B11
- Tours: T2, T22, post-run (memorizer)
- Famille: `BF-MEMORY-01`
- Domaine owner: memorizer — gate event (extract/write_policy) + loader recall in-session
- Source amont: (1) extraction correcte (« L'utilisateur prépare un déménagement à Lyon pour septembre 2026 ») puis rejet `event_missing_date` (« event requires event_start_at and time_precision ») : le gate V3-2 (« résout la date absolue avant de rejeter ») ne résout pas une précision mois (« septembre » ⇒ event_start_at=2026-09-01, time_precision=month) ; l'exemption C4 des intentions explicites ne couvre pas ce rejet aval ; (2) le récap T22 ne consulte pas `__session_memory_intents` (les 2 textes y étaient) ⇒ « pas d'autre projet explicitement chargé » 80 minutes après « garde ça en tête ». Volet rétractation (vélo absent) conforme mais trivial (persisted_count=0 global).
- Preuve systeme: `memory_extraction_runs` b13c7bfa (rejected_observations, `event_missing_date`, item_index 0, source_message T2) ; `memory_items` 54=baseline ; transcript T22.
- Correction attendue: (1) gate event : résoudre mois/saison futurs en event_start_at + time_precision au lieu de rejeter — a minima pour les items issus d'une intention explicite (parité avec l'exemption C4) ; (2) récap « ce que tu sais de moi/mes projets » consulte le buffer session en plus de memory_items (P10-D côté loader, variante intents non encore batchés).
- Statut: fix_applied
- Fix reference: P12-E (gate event mois/jour + bloc CONFIÉ EN SESSION au loader)
- Tests requis: « garde en tête : déménagement en septembre » + batch ⇒ memory_item event précision mois ; rétracté ⇒ absent ; récap in-session avant batch ⇒ fait restitué ; les deux faits + 1 rétractation ⇒ seul le non-rétracté restitué.

## R1-B12 — Observabilité P11 : pas d'événement pour commit-sans-claim ni claim-sans-commit-par-type

- Bug id: R1-B12
- Tours: T12, T16 (fenêtre P11)
- Famille: `BF-TEST-01` (observabilité) — yellow
- Domaine owner: guards runtime (P11)
- Source amont: `commit_claim_stripped` (émis à T7, correct) ne couvre que claim-avant-clarify. T12 (2 commits rendus « rien fait ») et T16 (« j'ai annulé » sans commit cancel, create committé au même tour) n'ont laissé AUCUNE trace guards : les deux violations vérité-d'exécution les plus graves du run sont invisibles au log admin. Sémantique `mass_cancel_executed` vérifiée correcte par ailleurs (T1 : 0 exécuté ⇒ 0 ligne).
- Correction attendue: événements guards `commit_omitted_in_render` (commit sans accusé mappé) et parité par-type (verbe d'accusé sans commit du même type), branchés sur la même garde composer que R1-B05/R1-B08.
- Statut: fix_applied
- Fix reference: P12-C (guards commit_omitted_in_render + cancel_claim_without_commit_stripped + retracted_mention_stripped)
- Tests requis: tour avec commit non accusé ⇒ ligne guards ; claim cancel sans commit cancel (avec create committé) ⇒ ligne guards ; T1-like (0 exécuté) ⇒ 0 ligne.
