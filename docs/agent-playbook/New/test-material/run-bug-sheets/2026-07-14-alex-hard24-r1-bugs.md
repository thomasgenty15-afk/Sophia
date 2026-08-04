# Feuille de suivi bugs — alex-hard24-r1 (2026-07-14)

Run: `alex-hard24-r1` · Persona: Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`) · Rapport: `qa-run-reports/2026-07-14-alex-hard24-r1.md`
Verdict global: **red** (5 reds / 10 greens). Racine transverse dominante: **execution-truth** — la confirmation visible n'est pas dérivée de l'`EffectLedger` commité (T3, T4, T5, T8).

---

## R1-B01 — Reschedule d'un rappel vers un jour nommé confirmé mais non exécuté

- Bug id: `R1-B01`
- Tours: T3
- Famille: `BF-EFFECT-02` (effet attendu absent) + `BF-LEDGER-01` (claim sans commit)
- Domaine owner: reminder mutation router / intake reschedule + final response guard
- Source amont: l'intention *reschedule* (« décale-le à jeudi soir, même heure ») n'est pas reconnue comme **replace atomique** ; traitée en `create_one_shot_reminder` nu, matche l'existant → `blocked (duplicate_pending)`, lane `needs_clarify`. Aucune clarification surfacée ; la couche visible confabule « bien décalé à jeudi ».
- Symptôme visible: « Le rappel de 22h est bien décalé à jeudi soir » alors que le rappel reste pending le 15/07 (demain), inchangé.
- Preuve système: `effect_ledger` requested 1 / blocked 1 / committed 0 ; `tool_skill_run.status=needs_clarify`, `reason=duplicate_pending` ; DB `570896c5` toujours pending `2026-07-15 20:00Z`, aucun cancel, aucun create jeudi.
- Correction attendue: router reschedule/replace en `cancel(ancre)` + `create(nouveau jour)` atomiques (doctrine `p6-instruction-inheritance-reschedule-atomic`) ; interdire toute confirmation de succès quand le ledger est `blocked`/`needs_clarify` (invariant `p5-execution-truth`).
- Tests requis: (positif) « décale le rappel de 22h à jeudi » ⇒ ancien cancelled + nouveau jeudi, confirmation = ledger ; (paraphrase) « bouge-le à jeudi », « plutôt jeudi même heure » ; (anti-faux-positif) « ajoute un rappel jeudi 22h » sans réf existante ⇒ create simple, pas de cancel ; (garde) ledger blocked ⇒ jamais « c'est décalé ».
- Statut: `fix_applied` (P9-C, 15/07) — (1) clitique SANS trait d'union (« decale le a jeudi ») admis devant préposition/ancre temporelle → coercition reschedule → replace atomique P6-H ; (2) « même heure » + jour nommé = composition jour-nommé × heure-héritée-de-la-cible (prime sur la complétion, résolution civile du jour, exception explicite au verrou P6-V) ; (3) garde claim-sans-commit étendue au BLOCKED (participes décalé/déplacé/avancé… + mots intercalés, différé safety exempté, repli honnête déterministe). Probe live P9-2 : replace atomique J+3 22:00 exécuté + verify vrai — 2× ALL GREEN. Tests router + run_test (strip sur blocked, anti-FP « mets le rappel des pâtes » = article).
- Fix reference: chantier P9 (`15-chantiers-log.md`)

---

## R1-B02 — Anaphore de rappel stockée comme contenu + doublon (pas de replace)

- Bug id: `R1-B02`
- Tours: T4
- Famille: `BF-INTAKE-02` (extraction polluée) + `BF-EFFECT-02` (effet attendu absent)
- Domaine owner: intake extractor + anaphora resolver (reminder domain) + reminder mutation router
- Source amont: la référence anaphorique « celui du midi » n'est pas résolue vers l'entité rappel existante ; elle devient le **texte** du rappel. Le reschedule est de nouveau traité en create nu → **doublon** (12h junk + 12h30 original non annulé). Famille ouverte `reminder-instruction-inheritance-anaphora-clarify` (nina-untested21 T3/T6), reproduite sur Alex.
- Symptôme visible: « Le rappel du midi est bien calé à demain 12h pile : celui du midi » — nouveau rappel dont le contenu est le pronom, l'original 12h30 déjeuner intact.
- Preuve système: DB `93e76b50` pending `2026-07-15 10:00Z` instruction=`celui du midi` ; `59fb6b73` (12:30 « faire une vraie pause déjeuner ») toujours pending. `committed 1` (create), aucun cancel.
- Correction attendue: résoudre l'anaphore vers l'entité rappel ciblée, hériter de son `reminder_instruction`, router un replace atomique. Étendre P3-F (« même texte ») aux références « celui du X ».
- Tests requis: (positif) « celui du midi, mets-le à 12h » ⇒ 1 seul rappel midi, contenu hérité, ancien remplacé ; (paraphrase) « le rappel du déj », « le même mais à 12h » ; (anti-faux-positif) référence sans antécédent ⇒ clarify, pas de rappel « celui du … ».
- Statut: `fix_applied` (P10-E, 15/07) — `isReminderEntityReference` (« celui du midi » = référence, jamais un contenu) + résolution de cible par CRÉNEAU NOMINAL (midi→11-15h, unique pending de la fenêtre = cible, 0 ou ≥2 = jamais un choix au hasard) + replace atomique avec héritage d'instruction et ancre de cancel posée. Probe live P10-4 : 3 pendings → « celui du midi, avance le a 12h » → replace 12:00 au contenu « pause déjeuner », zéro doublon, 2× ALL GREEN. La variance zéro-émission est couverte par la garde P10-V (claim de mutation sans outcome strippé).
- Fix reference: chantier P10 (`15-chantiers-log.md`)

---

## R1-B03 — Mass-cancel non honoré : une seule (mauvaise) annulation + recap incomplet

- Bug id: `R1-B03`
- Tours: T5
- Famille: `BF-INTAKE-05` (composite aplati) + `BF-STATE-02` (mauvaise cible) + `BF-STATUS-02` (recap incomplet)
- Domaine owner: intake scope resolver (masse vs cible) + cancel target selection + status projection
- Source amont: « annule **tous** les rappels que je t'ai mis aujourd'hui » → scope de masse aplati à une cible unique ; le garde anti-annulation-large n'a pas d'exemption de masse (« je n'annule pas le reste sans leur cible exacte ») ; la cible tombe sur le déjeuner légitime en laissant le doublon junk ; recap post-cancel non re-dérivé de l'inventaire.
- Symptôme visible: « C'est annulé pour le rappel de midi, et je n'annule pas le reste… Tu as encore 8h vitamines et 22h téléphone » — 3 rappels restent pending (dont le junk 12h, omis du recap).
- Preuve système: `cancel` committed 1 (`59fb6b73` 12:30) ; DB restants pending `fa1de6ab` (8h), `93e76b50` (12h junk), `570896c5` (22h).
- Correction attendue: exemption des demandes de masse explicites du garde précision-cible ; annuler l'inventaire réel du scope (ou surfacer la liste + demander confirmation) ; recap dérivé de l'inventaire post-opération (`p0-write-through-reminders` « cancels de masse exemptés »).
- Tests requis: (positif) « annule tous mes rappels » ⇒ tous les pending du scope annulés/listés ; (anti-hasard) jamais annuler un seul rappel au hasard sur une demande de masse ; (recap) après cancel, recap = inventaire réel restant (junk inclus ou nettoyé).
- Statut: `fix_applied` (P9-B, 15/07) — `detectMassCancelScope` déterministe (adjacence stricte « tous mes/les rappels », « annule-les tous », « annule tout » + contexte rappel ; « que je t'ai mis aujourd'hui » = filtre created_at du jour, fail-open par ligne) → exemption du garde précision-cible, cible = inventaire réel, rendu énumère les N annulés + restant relu en DB. La racine « faire autrement ↔ faire une pause » (cible au hasard par token accidentel) est morte : la masse prime sur le scoring de contenu. Probe live P9-3 : 3 posés → 3 annulés + récap honnête (récurrent listé, zéro fantôme) — 2× ALL GREEN. Tests executor (triplets detectMassCancelScope + scope jour + anti-FP « tous » non adjacent).
- Fix reference: chantier P9 (`15-chantiers-log.md`)

---

## R1-B04 — Track additif « les deux » aplati : item neuf droppé + confirmation fantôme

- Bug id: `R1-B04`
- Tours: T8
- Famille: `BF-INTAKE-05` (composite aplati) + `BF-LEDGER-01` (claim sans commit)
- Domaine owner: intake composite/multi-target (track domain) + final response guard
- Source amont: « note les deux, le carnet ET les écrans » aplati à un seul effet ciblant le carnet (déjà loggé T7 → `already_tracked_today`) ; l'écran (seul item neuf) jamais requis ; final response non dérivé du ledger. Même racine que `composite-flatten-generalizes-to-multidate-track` / `p3-retarget-additive-regression` (open).
- Symptôme visible: « Les deux sont pris en compte : carnet ET couper les écrans ✅ » alors que l'écran n'est jamais loggé.
- Preuve système: `tool_skill_run.status=blocked`, `reason=already_tracked_today` ; requested 1 (carnet), blocked 1, committed 0 ; DB aucune nouvelle entrée, écran `7df6d84d` reps inchangés (3).
- Correction attendue: un log additif multi-items ⇒ N effets distincts (un par item non loggé) ; confirmation énumérant exactement le ledger commité ; jamais « les deux » quand committed=0/1.
- Tests requis: (positif) « note les deux A ET B » ⇒ N entries, confirmation = ledger ; (anti-faux-positif) « note A » quand A déjà loggé ⇒ « déjà noté », pas « les deux » ; (cible) l'item neuf (écran) doit être ciblé, pas l'ancien déjà loggé.
- Statut: `fix_applied` (P10-C, 15/07) — doctrine CO-DEMANDE DE N ITEMS track (une entrée PAR item, alex T8 en INVALIDE observé) + garde de rendu `stripTrackClaimWithoutCommit` : « les deux sont pris » sur un ledger track bloqué 0-commit est retiré, repli = guidance contractuelle du blocage. Anti-FP : un commit coexistant désarme.
- Fix reference: chantier P10 (`15-chantiers-log.md`)

---

## R1-B05 — Objectif rétracté ressurgit en recall in-session

- Bug id: `R1-B05`
- Tours: T9→T10→T14
- Famille: `BF-MEMORY-01` (variante rétractation non honorée en recall)
- Domaine owner: memory recall composer / working-memory reducer
- Source amont: le recall composer lit le contexte de session (T9 store « objectif semi-marathon ») sans appliquer la **rétractation** explicite (T10 « garde surtout pas ça comme un objectif »). Gap ouvert `p7-revalidation-paul` / `p8-cardinality-potion-retraction` (« rétractation objectif/intention non honorée sur Alex »), reproduit — au niveau **recall in-session** (le memorizer durable, lui, ne persiste pas l'objectif : rétractation honorée côté batch).
- Symptôme visible: T14 « ton nouvel objectif te motive en ce moment, jusqu'au semi-marathon au printemps prochain » — objectif explicitement oublié 4 tours plus tôt.
- Preuve système: T14 réponse ; memorizer batch `persisted_count=0`, 0 fait « semi-marathon/printemps » en DB (recherche = 0), count mémoire inchangé 49/3/2 (rétractation durable OK, recall in-session KO).
- Correction attendue: une rétractation explicite invalide X dans le working set de session immédiatement ⇒ 0 restitution de X en recall ultérieur du même fil. Propager le signal de rétractation au recall composer (doctrine rétractation toutes-catégories v7).
- Tests requis: (positif) store(objectif) puis retract ⇒ 0 recall de l'objectif ; (paraphrase) rétractation « laisse tomber », « oublie ça » ; (anti-faux-positif) un fait non rétracté reste restituable ; (couche) vérifier recall in-session ET memorizer.
- Statut: `fix_applied` (P10-D, 15/07) — injection loader « RÉTRACTÉ EN SESSION (INTERDIT DE RESTITUTION) » : les segments rétractés de l'historique (mêmes marqueurs déterministes que le verrou memorizer) sont nommés au composeur avec l'interdit, placés AVANT les blocs volumineux (survie au budget). Probe live P10-3 : store objectif → rétractation → 3 tours → recall « qu'est-ce qui me motive ? » sans AUCUNE mention du semi-marathon, 2× ALL GREEN.
- Fix reference: chantier P10 (`15-chantiers-log.md`)

---

## Re-checks verts notables (familles ouvertes non reproduites ce run)

- **Fan-out phantom-commit** (T1) : requested 3 / committed 3, DB 3, confirmation ×3 — **non reproduit** sur Alex (contraste rose-p7verify).
- **BF-STATUS-02 recap post-mutations** (T15) : recap complet, récurrent 09:00 inclus, heure locale — **non reproduit** (contraste hard23 T15).
- **Anti-confabulation memorizer** : `statement_as_fact_violation_count=0`, 0 fait fabriqué — **non reproduit** (contraste untested22 BF-MEMORY-01).
- **Safety medium gate V5-1** (T13) : préemption correcte, 0 side-effect.
- **Rétractation durable au memorizer** (T10) : objectif non persisté active — honorée côté batch (le manquement est au recall in-session, R1-B05).
