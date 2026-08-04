# Bug Sheet — nina-hard23-r1 — 2026-07-14

Run: `nina-hard23-r1` (Nina, web, 15 tours, mode difficile). Verdict global: **yellow** (aucun red ; 2 frictions d'intake yellow + nits memorizer). Report: `qa-run-reports/2026-07-14-nina-hard23-r1.md`.

Re-checks **verts** confirmés sur branche courante `clean-v2-redesign` (non re-ouverts) : composite-flatten (global20 T6) → T11 vert ; faux-cadre status/carte inexistante (hard22 T15) → T13 vert ; reschedule pur atomique (untested21 T2) → T14 vert.

---

## R1-B01 — Anaphore de style lue comme ancre temporelle (clarify erroné)

- **Tours**: T2 (résolu T3)
- **Famille**: `BF-INTAKE-01` (slot fourni mais redemandé) — aggravé `BF-INTAKE-02` (extraction polluée)
- **Domaine owner**: `sophia-brain/tools/always_on/one_shot_reminder/intake.ts` + `time_parser.ts`
- **Source amont**: le time_parser traite l'anaphore de style « pareil qu'avant / le même style » comme une **référence à l'heure d'un rappel antérieur** (résolution d'ancre) ; l'extraction de l'heure absolue explicite « 21h » n'est pas prioritaire, d'où `needs_clarify` / `missing_time`.
- **Symptome visible**: user donne « rappel à 21h, pareil qu'avant, pour préparer mes dîners » → Sophia redemande « le moment exact du rappel précédent » alors que 21h est explicite.
- **Preuve systeme**: `tool_skill_run.status=needs_clarify`, `reason=missing_time` ; ledger requested 1 / blocked 1 / committed 0. Après désambiguïsation T3 : commit propre `5a10557f` 21h, instruction « préparer mes deux dîners de la semaine » (anaphore écartée).
- **Correction attendue**: hiérarchie d'extraction — une **heure absolue explicite** court-circuite la résolution d'anaphore ; « pareil/même style » = marqueur de format non contraignant, pas un slot temporel manquant.
- **Statut**: `fix_applied`
- **Fix reference**: fix_applied (P8-D, 2026-07-14) — double fix: (1) doctrine planner « ANAPHORE DE STYLE ≠ REFERENCE TEMPORELLE » (one_shot_reminder_prompt_contract.ts): heure absolue explicite ⇒ UTC_time calculé, l'anaphore « pareil qu'avant » est un marqueur de format; (2) complétion structurelle BORNÉE du create nu (one_shot_reminder/router.ts): instruction propre + zéro marqueur reschedule + heure absolue NON ambiguë ⇒ le parseur résout le créneau au lieu du clarify missing_time (la ceinture méridiem garde les heures nues 1-9, l'anti-doublon eva-g16 B01 tient). Tests: triplet router (commit 21h direct / marqueur reschedule → jamais complété / heure ambiguë → ceinture). Probe P8-4 T1 live: commit direct demain 21:00, jamais « moment exact ».
- **Tests requis**: (positif) « rappel à 21h, pareil qu'avant, pour X » → commit direct 21h ; (paraphrase) « à 19h comme d'hab » → commit 19h ; (anti-faux-positif) « rappel comme le précédent » **sans** heure → clarify légitime ; (invariant) heure absolue présente ⇒ jamais `missing_time`.

## R1-B02 — Question de vérification lue comme intention de track (effet parasité, bloqué par garde)

- **Tours**: T15
- **Famille**: `BF-INTAKE-02` (extraction trop large) — risque `BF-EFFECT-01` (effet non consenti) **évité** par backstop `already_tracked_today`
- **Domaine owner**: `sophia-brain/tools/always_on/track_progress_plan_item/router.ts` + intake (frontière assertion/question) ; gate d'effet sous owner status/verify
- **Source amont**: l'intake `track_progress` sur-extrait sur un énoncé **interrogatif de vérification** (« j'ai bien coché l'eau ? ») et émet une requête de track pour l'eau ; seul le garde déterministe `already_tracked_today` empêche le commit.
- **Symptome visible**: aucun côté user ce tour-ci (réponse groundée correcte) ; l'effet parasité est invisible car bloqué. Risque UX réel si l'item n'avait pas déjà été tracké aujourd'hui → double-track non consenti depuis un tour de verify.
- **Preuve systeme**: `tool_skill_run.selected_handler=track_progress_plan_item`, `status=blocked`, `reason=already_tracked_today` ; ledger requested 1 / blocked 1 / committed 0 ; payload cible `77e33907` completed, date aujourd'hui.
- **Correction attendue**: l'intake track distingue **assertion de complétion** vs **question de vérification** et n'émet **aucune** requête d'effet durable sur la seconde ; la barrière ne doit pas reposer uniquement sur l'idempotence `already_tracked_today`.
- **Statut**: `fix_applied`
- **Fix reference**: fix_applied (P8-D, 2026-07-14) — invariant intra-frame étendu (dispatcher.v2.ts, même famille que P2-1): un tour d'intention verify_* / status_check ne porte JAMAIS une requête track nue — l'effet est droppé AU FRAME (la barrière ne repose plus sur already_tracked_today); une correction explicite (correction=true) survit (P3-C). Doctrine 3e renforcée avec le verbatim observé (« j'ai bien coché l'eau ? » = question, jamais une assertion). Tests: triplet dispatcher (drop / correction survit / vrai report passe). Probe P8-4 T2 live: 0 requested au ledger.
- **Tests requis**: (positif) « j'ai fait mon eau aujourd'hui » → track commit ; (anti-faux-positif) « j'ai bien coché mon eau aujourd'hui ? » → **0 requête** track (pas seulement blocked), chemin status/verify ; (anti-faux-positif) verify multi-items « mes 3 coches sont bien là ? » → 0 requête ; (invariant) un tour de verify ne génère aucune entrée ledger `requested`.

## R1-B03 — Memorizer : reports de suivi persistés comme faits personnels + duplication (nit récurrent)

- **Tours**: batch nocturne de fin de run (source : T1 eau, T11 petit-déj, T10 sucré, T6 ajustement)
- **Famille**: `à classifier` (frontière domaine memorizer / `BF-MEMORY` adjacent)
- **Domaine owner**: `_shared/memory/memorizer/extract.ts` + `write_policy.ts` (filtre de domaine)
- **Source amont**: le memorizer accepte comme faits personnels actifs des **reports d'action du plan** (« boit son grand verre d'eau avant de grignoter », « petit-déjeuner réussi deux jours de suite ») qui relèvent de `track_progress` (déjà commité in-turn), et **duplique** un même fait (2 items actifs quasi-identiques pour « sucré fin de garde »). La demande d'ajustement plan T6 est aussi persistée comme fait.
- **Symptome visible**: aucun côté user (batch nocturne). Pollution mémoire : items redondants + faits qui devraient vivre dans le suivi, pas dans la mémoire perso.
- **Preuve systeme**: `memory_extraction_runs` 96c419ec : 9 persistés / 11 rejetés ; parmi les 7 actifs, 2 sont des reports de suivi + 1 doublon « sucré ». Positifs à préserver : détresse T7 **rejetée** (« contenu de détresse aiguë non persistable »), pref T10 **persistée**.
- **Correction attendue**: filtre excluant les faits de type « a réalisé l'action X du plan » (déjà couverts par `track_progress`) + déduplication des faits quasi-identiques d'un même batch. Même nit que nina-hard22 / nina-untested21 (récurrent → prioriser).
- **Statut**: `fix_applied`
- **Fix reference**: fix_applied (P8-C/G, 2026-07-14) — (1) exclusion plan-report durcie (extract.ts, prompt v7): la GÉNÉRALISATION d'un report (« boit son grand verre d'eau avant de grignoter ») reste un report — le critère est LA SOURCE, pas la tournure; une demande d'ajustement du plan = commande produit, 0 memory_item; (2) dédup INTRA-LOT déterministe (dedupe.ts): deux faits quasi identiques du même batch (contenu normalisé égal ou similarité ≥ 0.92, même kind) → un seul create, reason intra_batch_duplicate; les events de dates distinctes ne se dédupent jamais. Tests: triplets dedupe + ancres prompt. Doctrine prompt à re-juger au prochain batch réel (3e observation → le volet dédup est désormais structurel).
- **Tests requis**: (memorizer) « j'ai fait mon action X aujourd'hui » → 0 memory_item (candidate inclus) ; (dédup) même fait exprimé 2 fois dans le batch → 1 item.

---

### Notes de nettoyage

Tous les effets durables du run restaurés à la baseline exacte en fin de run : `memory_items`=0, `user_plan_item_entries`=0, `scheduled_checkins`=0, `user_*_cards`=0, `memory_extraction_runs`(Nina)=0, `memory_message_processing`=0, `temp_memory` web scope vidé, `current_reps` restauré (eau=1, petit-déj=1). Observability events Nina purgés. Aucune mutation de plan (target_reps inchangés).
