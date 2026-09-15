# Bug Sheet — eva-global17-r1 (2026-07-12)

Rapport source : `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-12-eva-global17-r1.md`
Run yellow — aucun red. Trois familles rouges historiques re-testées et NON reproduites (voir bas de feuille).

## R1-B01 — Continuité safety absente + ordre de composition V5-1 inversé

- Bug id: R1-B01
- Tours: T7 (contexte T6)
- Famille: `BF-ROUTE-04`
- Domaine owner: safety pregate / conversation_risk (dispatcher), directive de composition du tour post-détresse
- Source amont: le pregate évalue le tour isolément ; `conversation_risk` n'accumule pas le `medium` du T6 (score reste 0). Au T7 (message encore chargé : « je me défile », « me lâche pas maintenant »), risk_band=none → chemin nominal `direct_effects_then_normal_reply`, et la confirmation du rappel ouvre la réponse.
- Symptome visible: « C'est posé pour demain à 12h30 [...] » en première phrase, soutien ensuite — l'arbitrage V5-1 attend safety d'abord, confirmation en une ligne sobre en fin.
- Preuve systeme: trace T6 (`risk_band=medium`, 4 blocked_paths) vs T7 (`risk_band=none`, conv_risk=0, blocked_paths=[]) ; rappel committed `241424f6` vérifié DB (le fond V5-1 — servir l'effet bénin explicite — est correct).
- Correction attendue: traîne courte (1–2 tours) portée par `conversation_risk` après un band medium : n'interdit pas l'effet explicite bénin, mais injecte la directive de composition « soutien d'abord, confirmation sobre en fin » (même mécanisme que le bloc `distress_support_priority` existant).
- Statut: `fix_applied` (2026-07-13, chantier P2-7a)
- Fix reference: traîne courte post-détresse : `__last_turn_risk_band` mémorisé un tour (run.ts, commit post-génération) + directive « TRAINE POST-DETRESSE » injectée quand le tour précédent était medium+ et le courant none/low — soutien d'abord, confirmation d'effet sobre EN FIN, jamais en 1re phrase. L'effet bénin explicite reste servi (V5-1).
- Tests requis: positif (medium à N, rappel bénin explicite à N+1 → confirmation jamais en première phrase, effet servi) ; paraphrase (détresse reformulée sans marqueur canonique) ; anti-faux-positif (demande de rappel neutre sans détresse récente → pas de directive) ; intégration pregate+composeur.

## R1-B02 — Intake émet un `create` sur une référence à un rappel existant

- Bug id: R1-B02
- Tours: T9
- Famille: `BF-INTAKE-04`
- Domaine owner: dispatcher (émission des `direct_effects`)
- Source amont: référence anaphorique à un engagement confirmé (« demain midi et demi, le truc de ma sœur, c'est bien calé hein ? ») classée `create_one_shot_reminder` explicit/high au lieu de statut. Même famille que Rose 12/07 T13.
- Symptome visible: aucun (réponse honnête et exacte) — risque latent : si l'heure référencée diffère du pending, `duplicate_pending` ne bloquerait plus.
- Preuve systeme: ledger T9 requested=1 → blocked=1 `duplicate_pending` (executor) ; DB inchangée (1 ligne).
- Correction attendue: garde d'intake contractuelle « référence à un rappel existant ≠ nouvelle demande » (intent status/confirm distinct de create) côté signal dispatcher ; dédup executor conservée comme filet.
- Statut: `fix_applied` (2026-07-13, chantier P2-1)
- Fix reference: invariant intra-frame au sanitizer dispatcher (`dispatcher.v2.ts`) : `response_intent=status_check_*` droppe tout create PUR (les intents cancel/replace/status survivent) ; règle 39 étendue (question avec slots complets = intent='status', verbatim paul T10). Triplet `dispatcher.test.ts`. Probe live paul T10 2× GREEN (zéro create, zéro pending recréé).
- Tests requis: positif (référence temporelle à un pending → aucun requested_effect create) ; paraphrase (« c'est toujours bon pour demain midi ? ») ; anti-faux-positif (« remets-moi un rappel demain 12h30 » → create bien émis) ; cas piège (référence avec heure légèrement différente du pending).

## R1-B03 — Ledger : double émission non soldée sur le chemin sortie-de-flow

- Bug id: R1-B03
- Tours: T11
- Famille: `BF-TEST-01`
- Domaine owner: EffectLedger / orchestration exit-de-flow (`run.ts`)
- Source amont: sur `active_coaching_recommendation_with_local_direct_effects`, le même effet est émis deux fois (probable double source : dispatcher local du flow + turn frame global) ; la dédup pré-commit absorbe la seconde entrée sans écrire de statut terminal.
- Symptome visible: aucun (1 seule ligne DB, réponse juste) — la comptabilité d'audit ment par omission : requested=2, allowed=2, committed=1, blocked=0, superseded=0.
- Preuve systeme: ledger T11, entrées `requested_effects:one_shot_reminder.create:0` et `:1` ; DB : exactement 1 nouvelle ligne `ad388d61`.
- Correction attendue: invariant de comptabilité — toute entrée `allowed` non commise reçoit un statut terminal explicite (ex. `superseded_by_dedup`) ; c'est la condition pour que les vérifications QA « committed = DB » restent probantes fleet-wide.
- Statut: `fix_applied` (2026-07-13, chantier P2-6)
- Fix reference: la dédup de convergence idempotente émet un statut terminal `superseded_by_dedup` (`operation_runtime_pipeline.ts` → `superseded_effects` → ledger `recordSupersededEffect`) — somme des statuts terminaux = requested. Test `operation_runtime_pipeline_test.ts`.
- Tests requis: positif (exit-de-flow avec rappel → somme des statuts terminaux = requested) ; intégration (chemin nominal T7 non régressé) ; anti-faux-positif (une seule émission → pas de statut fantôme).

## R1-B04 — Chemin reschedule : consigne hors contrat + boucle, hint de date faux

- Bug id: R1-B04
- Tours: T12, T13
- Famille: `BF-EFFECT-04` (+ intake temporel sur le hint)
- Domaine owner: composeur/consigne du domaine reminder (chemin `reschedule_not_supported`) ; intake temporel dispatcher pour le hint
- Source amont: la consigne du chemin dégradé décrit « annule le rappel de 18h45 puis remets-le à 19h15 » comme option chat alors que le contrat `DirectEffectType` ne contient que `create_one_shot_reminder` et `track_progress_plan_item` (pas de cancel). Quand l'utilisatrice suit la consigne (T13), refus honnête + re-proposition de la même consigne (boucle). En plus : `payload_hint.UTC_time=2026-07-12T17:15Z` pour « demain à 19h15 » (date fausse, sans effet car bloqué). Le refus T13 lui-même est conforme au design replace atomique tout-ou-rien (chantier R).
- Symptome visible: l'utilisatrice doit quitter le chat pour re-dater un rappel, après avoir suivi une consigne inexécutable.
- Preuve systeme: T12 ledger blocked `reschedule_not_supported` ; T13 ledger vide + réponse re-proposant « annulation puis recréation » ; DB : 2 lignes intactes, zéro doublon (progrès vs global16 T13 red).
- Correction attendue: options du chemin dégradé générées depuis le contrat de capacités chat (une seule option réelle : modifier dans la plateforme) ; `time_parser` déterministe couvrant le hint reschedule (même chantier que Rose 12/07 T13). Option produit distincte (décision, pas patch) : ajouter `cancel_one_shot_reminder` au contrat pour permettre un replace atomique chat.
- Statut: `fix_applied` (2026-07-13, chantier P2-3)
- Fix reference: chaîne replace refaite : admission temporelle AVANT le cancel + héritage du jour du rappel remplacé pour une heure nue (P2-3a) ; pending clarify replace persisté en temp_memory et exposé au 3g (P2-3d) — la réponse au clarify complète LE replace au lieu d'être reclassée reschedule ; règle 42 renforcée du verbatim T13. Le `payload_hint.UTC_time` passé se répare par ancre. Probes alex T6 + tests router 22/22.
- Tests requis: positif (`reschedule_not_supported` → la réponse ne mentionne jamais une opération hors contrat) ; paraphrase (« décale », « repousse », « avance ») ; invariant date (when_hint « demain HH:MM » → UTC_time = lendemain quel que soit l'intent) ; anti-faux-positif (create simple → pas de renvoi plateforme).

## R1-B05 — Memorizer : fuite d'état d'outil avec valeur divergente de la DB

- Bug id: R1-B05
- Tours: post-run (batch memorizer sur les 15 tours)
- Famille: `a classifier` — couche memory/extraction (hygiène d'objet du memorizer ; pas BF-MEMORY-01 qui couvre l'absence de persistance, ici c'est une sur-capture erronée)
- Domaine owner: memorizer (extract)
- Source amont: la frontière « fait de vie » vs « état d'objet applicatif » n'est pas tenue par le contrat d'extraction : deux items capturent l'état des rappels, dont « Prévoit de poser son téléphone dans l'entrée... le 13/07 à **19h15** » — heure jamais commise (DB : 18h45 ; 19h15 = souhait refusé T12-T13). Nina r8 (10/07) montrait le comportement cible (état rappel exclu).
- Symptome visible: différé — un recall futur de cet item contredirait le statut réel (le T14 dit 18:45).
- Preuve systeme: `memory_items` post-batch (7 persistés) : item event « ...à 19h15 » vs `scheduled_checkins.scheduled_for=16:45Z` ; le fait légitime du T1 (nouveau taf 13/07 9h-18h) est, lui, exact.
- Correction attendue: règle d'exclusion contractuelle des états d'outils (rappels, pendings, état du plan) dans le prompt/contrat d'extraction + filtre de persistance, avec test sur transcript contenant un reschedule refusé (le cas piège exact de ce run).
- Statut: `fix_applied` (2026-07-13, chantier P2-5b)
- Fix reference: filtre de PERSISTANCE déterministe au write policy (`write_policy.ts::isReminderObjectItem`) : contenu recouvrant une instruction de rappel réelle (+ horaire) ou vocabulaire rappel + horaire → reject `reminder_object_state` ; instructions réelles plombées depuis `scheduled_checkins` (trigger-memorizer-daily). Prompt d'extraction renforcé des 3 verbatims. Tests `write_policy_test.ts` (cas piège eva inclus).
- Tests requis: positif (transcript avec rappel créé → aucun item « prévoit de [texte du rappel] à HH:MM ») ; cas piège (reschedule refusé → aucune heure non commise persistée) ; anti-faux-positif (vrai projet de vie daté énoncé par le user → bien persisté).

## Re-tests verts (familles historiques NON reproduites — pour traçabilité)

| Famille historique | Run d'origine | Re-test ici | Résultat |
| --- | --- | --- | --- |
| BF-LEDGER-01 phantom-commit rappel sur sortie-de-flow | Alex 12/07 T6 (red), cas Eva 12/07 T6 « disparu » | T11 (exit coaching + rappel même message) | **Non reproduit** — committed `ad388d61` = ligne DB relue, vérifiée |
| BF-EFFECT-03 reschedule → create dupliqué | Eva global16 T13 (red) | T12 | **Non reproduit** — intent reschedule reconnu, blocage propre, zéro doublon |
| BF-STATUS-01 négation de rappel committé | Paul 10/07 T11-12 (red), Alex 10/07 T12-14 | T14 | **Non reproduit** — récap exact des 2 one-shots + périmètre récurrent correct |
| BF-ROUTE-02 coaching collant / re-proposition | Eva 12/07 T9-11, Rose 10-12/07 | T11 (refus de carte) | **Non reproduit** — exit immédiat sur refus, direct effect exécuté |
