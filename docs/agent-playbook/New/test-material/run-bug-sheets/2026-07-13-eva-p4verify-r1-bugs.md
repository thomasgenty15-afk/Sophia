# Bug Sheet — eva-p4verify-r1 (2026-07-13)

Rapport associé : `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-13-eva-p4verify-r1.md`

Run 15 tours, persona Eva, mode difficile, IA réelle locale. Objectif : **valider le chantier P4 (landé ce soir, working tree) en conversation réelle** — jamais passé par un run IA bout-en-bout. Verdict global : **red** (2 red, 2 yellow). Le cœur de P4 est validé (multi-intent 2 effets, retarget visible, plage de dates, replace jour-hérité, `localLabelDayConsistent`, hygiène memorizer), mais deux racines **P4-adjacentes non couvertes par les probes** échouent.

## R1-B01 — Ceinture heure-ambiguë P4-D re-bloque le tour de réponse au clarify (RED)

- Bug id: R1-B01
- Tours: T2 (armorce T1, conséquence durable T3)
- Famille: `BF-INTAKE-01` (slot fourni mais redemande) ; secondairement `BF-LEDGER-01` (claim sans commit : « je te le mets à 20h » sans effet)
- Domaine owner: intake temporel — ceinture déterministe P4-D `hour_meridiem_ambiguous` (portée de la garde + carry-over d'instruction à travers un clarify multi-tours)
- Source amont: la ceinture P4-D lit un `raw_text` reconstruit qui **agrège/recopie l'heure en lettres du tour initial** (`raw_text` au T2 = « rappelle-moi demain à huit heures … »). Sur le tour de **réponse au clarify** (Eva donne « le soir, 20h »), la ceinture re-détecte l'ambiguïté et **re-bloque le create** (ledger requested=1, **blocked=1**), alors que le turn_frame a correctement résolu demain 20:00 (UTC `2026-07-14T18:00Z`).
- Symptome visible: message **auto-contradictoire** — « Parfait, je te le mets à 20h … » PUIS « Juste pour être sûre du créneau : 8h du matin, ou 20h ? ». Rien n'est créé ; Eva a pourtant déjà répondu.
- Preuve systeme: T2 ledger `blocked=1`, DB `scheduled_checkins` = **0 pending** après T2. Le create ne passe qu'au T3 (message sans heure en lettres → ceinture inactive).
- Correction attendue: la ceinture ne s'arme que si le **message user courant** porte lui-même une heure nue ambiguë ; sur un tour de réponse à un clarify de créneau (slot fourni), elle se **désactive** et laisse committer. Ne pas relire un `raw_text` agrégé/hérité. Les probes P4 ont testé « huit heures → clarify » en un tour mais **jamais le tour de réponse** — trou de couverture à combler.
- Tests requis: (a) « rappel demain à huit heures 'range le téléphone' » → clarify ; puis « le soir, 20h » → **commit demain 20:00, instruction 'range le téléphone'**, sans re-question, sans double message ; (b) paraphrases (« vers huit heures » → « plutôt le soir ») ; (c) anti-régression sur le tour initial (T1 doit rester un clarify).
- Statut: **fix_applied (P5-D, 13/07 nuit)** — la ceinture ne relit plus le raw_text agrégé quand le message user courant existe ; le clarify PERSISTE les slots fournis (pending create, mécanique P2-3d) ; backstop run.ts : sur le tour-réponse exposé, une émission absente OU mal mappée en replace/reschedule est substituée par le create synthétisé (jour hérité du pending, heure du message). Probe P5-4 : commit 20:00, zéro re-question, 2× GREEN.

## R1-B02 — Instruction du rappel corrompue à travers le clarify (yellow)

- Bug id: R1-B02
- Tours: T3 (conséquence de R1-B01)
- Famille: `BF-EFFECT-03` (payload durable faux — bonne opération, mauvais texte)
- Domaine owner: intake `create_one_shot_reminder` (carry-over des slots déjà remplis à travers un tour de clarification)
- Source amont: la boucle de blocage T1-T2 fait perdre l'`instruction_hint` du tour initial (« range le téléphone ») ; au commit T3, l'intake reprend l'instruction du **dernier message** (la phrase de désambiguïsation d'Eva).
- Symptome visible: « C'est déjà posé pour demain à 20h : "le soir. pas le matin." » — le rappel sonnera avec un texte vide de sens au lieu de « range le téléphone ».
- Preuve systeme: DB `b4fa7c8e` pending `2026-07-14 18:00Z`, `event_context = one_shot_reminder:le_soir_pas_le_matin`, `reminder_instruction = "le soir. pas le matin"`. (Corrigé plus tard par le replace T6.)
- Correction attendue: quand un create est complété via un clarify, les slots déjà fournis au tour initial (ici l'instruction) sont **conservés** ; seul le slot demandé (créneau) est mis à jour.
- Tests requis: instruction fournie au tour initial + créneau fourni au tour-réponse → instruction du tour initial préservée en DB.
- Statut: **fix_applied (P5-D)** — carry-over déterministe : l'instruction du pending prime tant que le message courant ne porte pas sa propre clause d'instruction (« le soir. pas le matin » n'est jamais un texte de rappel). Probe P5-4 : instruction « range le téléphone » committée.

## R1-B03 — Additif : second item perdu par résolution de cible + confirmation trompeuse (RED)

- Bug id: R1-B03
- Tours: T10
- Famille: `BF-EFFECT-02` (effet attendu absent) ; secondairement `BF-LEDGER-01` (« tu gardes les deux » sans le 2e commit)
- Domaine owner: intake `track_progress_plan_item` — résolution de cible (`resolvePlanItemByNaming` / sélection dispatcher) + contrat de solde de l'additif
- Source amont: la cible se résout sur **l'item du tour précédent** (54d97e5c, crédité au T9 retarget) alors que l'`target_evidence` cite « posé le téléphone en rentrant » = **d70660a7**. L'effet retombe sur l'item déjà completed → **blocked (doublon)** ; d70660a7 n'est jamais crédité. Biais de récence dans la résolution de cible.
- Symptome visible: « tu gardes les deux, "faire une soirée sans réseaux" et "poser le téléphone en rentrant". Rien n'est retiré » — mais un seul item est en DB.
- Preuve systeme: T10 ledger `blocked=1` ; DB : **aucune** entrée `d70660a7` pour le 13/07, `current_reps` d70660a7 reste **0**. (La moitié « ne pas invalider » P4-A tient : pas de superseded sur 54d97e5c.)
- Correction attendue: sur un tour additif, résoudre la cible depuis l'**évidence nommée du message courant** (« poser le téléphone en rentrant » → d70660a7), indépendamment de l'item du tour précédent ; n'émettre « les deux » que si deux commits réels sont soldés.
- Tests requis: après un retarget vers Y, « en plus j'ai AUSSI fait X, garde les deux » → 1 entrée X (fraîche) + 1 entrée Y (préservée) ; confirmation « les deux » seulement si les deux existent ; anti-régression nina T4 (additif ne doit pas invalider — tient).
- Statut: **fix_applied (P5-E, 13/07 nuit)** — l'évidence nommée du message PRIME sur l'id LLM valide quand elle résout uniquement un item différent (jamais sur correction/retarget : mécanique P4-A dédiée). Probe P5-5 : « garde les deux » → 2 entrées, 2 cibles distinctes.

## R1-B04 — Multi-intent : track crédité sur la mauvaise cible (yellow)

- Bug id: R1-B04
- Tours: T12
- Famille: `BF-EFFECT-03` (payload durable faux — mauvaise cible track). **Le fond `BF-AGENDA-01` (double-RED multi-intent) est RÉSOLU** sur ce tour.
- Domaine owner: intake `track_progress_plan_item` — résolution de cible (même racine que R1-B03)
- Source amont: sur le tour multi-intent, les **deux** effets sont bien émis (`direct_effects_to_run: ['track_progress_plan_item', 'create_one_shot_reminder']`, ledger committed=2) — **le double-RED de eva-global18 T9 / global19 T13 est corrigé**. Mais le track se résout sur `d70660a7` (Poser le téléphone, item tracké au T11) alors que l'évidence « choisi une activité au lieu de scroller » = `f539e68c` (Choisir une activité de soirée). Biais de récence, symétrique de R1-B03.
- Symptome visible: « Ce soir, j'ai bien pris en compte que tu as choisi une vraie activité au lieu de scroller » — mais c'est « poser le téléphone » qui est crédité.
- Preuve systeme: DB — track → entrée `d70660a7` 13/07 (reps → 3) ; `f539e68c` reste à **0** ; rappel `464f62ed` pending `2026-07-14 17:30Z` correct.
- Correction attendue: résoudre la cible track depuis l'évidence nommée du message (mapping sémantique « choisir une activité » ↔ « Choisir une activité de soirée »), jamais depuis le dernier item tracké.
- Tests requis: tour multi-intent `track "choisi une activité" + rappel` → cible `f539e68c` + rappel committé ; ne jamais retomber sur le dernier item tracké ; anti-régression émission des 2 effets (double-RED).
- Statut: **fix_applied (P5-E)** — même override que R1-B03 (test unitaire eva T12 : track crédité sur « choisir une activité », jamais le dernier item tracké). Émission multi-intent : déjà re-validée verte (P4-B).

## Re-tests verts P4 (aucune ligne bug — validation en conversation réelle)

- Heure-lettres → clarify sur le tour initial (T1, P4-D) ✓
- Refus honnête d'un « ce soir » passé, sans faux label (T4, `localLabelDayConsistent` P4-B) ✓
- Replace atomique cancel+create avec **héritage de jour** (T6, P4-B) ✓
- Retarget substitution avec **retrait énoncé au visible** + superseded (T9, P4-A) ✓
- Plage de dates « hier et avant-hier » → **2 entrées** (T11, P4-B `resolveExplicitTrackDayList`) ✓
- **Multi-intent track+rappel → 2 effets committés** (T12, double-RED corrigé) ✓
- Hygiène memorizer : objets-rappel en lettres **rejetés (0 candidate)** (post-run, P4-D `isReminderObjectItem`) ✓
- Memorizer scopé `user_id` Eva → aucune purge fleet malgré 4 runs concurrents ✓
- Projection statut exacte (T7, BF-STATUS ne se reproduit pas) ✓

## Vérification chantier P5 (2026-07-13 nuit)

- Probes live : P5-4 (clarify heure-lettres → tour-réponse commit 20h instruction initiale) et P5-5 (cible = évidence nommée) — **2 passes ALL GREEN consécutives** sur le build final.
- La convergence des probes a attrapé 2 modes d'échec supplémentaires du tour-réponse (émission ABSENTE → claim sans commit ; émission mal mappée en replace → blocked replace_payload_incomplete) → backstop déterministe de substitution dans run.ts, borné au tour où le clarify vient d'être exposé (un « j'ai rdv à 15h » ultérieur ne synthétise jamais).
- Sweep 1082/17 = baseline ; harness rappels 5/5 ×2.
