# Bug Sheet — eva-global19-r1 (2026-07-13)

Rapport associé : `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-13-eva-global19-r1.md`

Run 15 tours, persona Eva, mode difficile, IA réelle locale. Verdict global : **red** (1 red, 4 yellow).

## R1-B01 — Multi-intent track + rappel : track perdu (RED)

- Bug id: R1-B01
- Tours: T13
- Famille: `BF-AGENDA-01` (multi-intention incomplète ; secondairement BF-LEDGER-02 pour le rendu trompeur)
- Domaine owner: dispatcher (émission des `direct_effects`) + frontière domaine track/reminder ; owner `coaching_recommendation` a absorbé le report en accusé verbal.
- Source amont: le dispatcher n'émet qu'un seul `direct_effect` par tour multi-domaine ; la seconde intention (`track_progress_plan_item`) est aplatie/non émise. `turn_frame.direct_effects` = [`create_one_shot_reminder`] seul.
- Symptome visible: « note-le ça compte pour mon plan » → réponse « va clairement dans le bon sens sur cette action » (accusé de coaching), mais aucun enregistrement. Le rappel, lui, est créé.
- Preuve systeme: `executed_tools=['create_one_shot_reminder']` seul ; **0** `user_plan_item_entries` pour `d70660a7`, `current_reps=0` (vérifié DB) ; rappel `a5e7f64c` pending `2026-07-14 17:00Z` bien créé.
- Correction attendue: contrat d'émission supportant N effets de types distincts dans un tour (`track_progress_plan_item` ET `create_one_shot_reminder`), soldés séparément par le renderer. **Reproduction inversée du RED global18 T9** (là rappel perdu / track gardé ; ici track perdu / rappel gardé) → même cause racine, non corrigée.
- Tests requis: (a) « note X comme fait ET rappelle-moi Y demain » → 1 track committed + 1 reminder committed ; (b) variante négative « marque X raté ET rappelle Y » ; (c) les deux ordres (track d'abord / rappel d'abord) ; (d) anti-régression global18 T9 + global19 T13.
- Statut: `fix_applied` — P4-B 13/07 : règle 3d-ter-bis étendue avec le verbatim de CE tour (« la règle vaut AUSSI quand un flow est actif ou en sortie et que l'owner est un skill — l'owner n'absorbe JAMAIS un effet explicite en accusé verbal ») ; la lane track du pipeline tourne déjà avant la boucle des owners, le trou était l'ÉMISSION. Doctrine — à re-observer en run réel.

## R1-B02 — Rappel « ce soir » rendu alors que l'effet est placé demain

- Bug id: R1-B02
- Tours: T5 (isolé au T6)
- Famille: `BF-LEDGER-02` (commit réel mal rendu) ; adjacent `BF-STATUS-03` (temps mal rendu)
- Domaine owner: final response pipeline (rendu de la confirmation de commit rappel).
- Source amont: le rendu réutilise le `local_label`/`when_hint` d'intention (« ce soir à 20h ») au lieu de la valeur committée relue après glissement (l'executor a correctement placé le rappel **demain** 20:00 car 20:00 était passé).
- Symptome visible: « celui de ce soir à 20:00 est bien en place » alors que l'effet réel est **demain 20:00**. L'user peut compter sur un rappel ce soir qui ne sonnera pas.
- Preuve systeme: DB `2c530cdb` pending `2026-07-14 18:00Z` (= 20:00 Paris le 14) ; au T6, projection statut correcte (« Demain à 20:00 ») + self-correction (« le 'ce soir' était devenu faux ») → seul le rendu du commit ment, pas la projection.
- Correction attendue: rendre la confirmation depuis `scheduled_for` effectif (label local recalculé), pas depuis le hint d'intention. Même invariant que le write-through P0.
- Tests requis: demande « à HH ce soir » avec HH passé → visible « demain à HH » jamais « ce soir » ; paraphrases ; anti-régression sur placement au passé.
- Statut: `fix_applied` — P4-B 13/07 : `localLabelDayConsistent` (executor) — le label d'intention ne survit au commit QUE si son jour implicite (« ce soir », « demain », date absolue) correspond au `scheduled_for` effectif, sinon label recalculé depuis la valeur committée ; + le décalage de jour du replace recalcule son label ; probe live P4-7 GREEN.

## R1-B03 — Heure ambiguë « huit heures » : commit sans clarification

- Bug id: R1-B03
- Tours: T3
- Famille: `BF-INTAKE-04` (ambiguïté non reconnue, création directe)
- Domaine owner: dispatcher (intake `create_one_shot_reminder` / confidence gate temporel).
- Source amont: référence horaire nue (« à huit heures », sans matin/soir) résolue silencieusement à 08:00 et committée. `ambiguity_kind: null` dans le ledger. Aucun gate clarify, alors que le contexte persona (habitude du soir, texte « range le téléphone ») pointe vers le soir.
- Symptome visible: « C'est fait : demain à 08:00 » ; l'user corrige au T4 (« 8h du matin ça sert à rien, je voulais dire 20h ») → ambiguïté réelle, mauvaise branche prise.
- Preuve systeme: DB `afb3685f` pending `2026-07-14 06:00Z` (08:00 Paris) ; `direct_effects[0].payload_hint.when_hint = "demain à 08:00"`, `ambiguity_kind: null`.
- Correction attendue: intake émet `intent: clarify` (créneau matin/soir) quand la référence est nue et ambiguë (a fortiori en tension avec le contexte de l'action), plutôt qu'un `create`. La dédup ne rattrape pas (heure choisie plausible).
- Tests requis: « rappel à huit heures » (sans matin/soir) → clarification, pas de commit ; paraphrases « à 8h », « vers huit heures » ; cas où le contexte lève l'ambiguïté (« à huit heures du matin » → create direct).
- Statut: `fix_applied` (2 couches) — P4-D 13/07 : (1) règle prompt HEURE NUE AMBIGUE (contrat planner rappels) : heure 1-11 sans marqueur, surtout en tension avec l'action → UTC_time/local_label VIDES, le runtime pose la question du créneau ; (2) CEINTURE déterministe `bareAmbiguousHour` : heures en TOUTES LETTRES (« à huit heures », le verbatim de ce run) ⇒ clarify `hour_meridiem_ambiguous` quoi que le dispatcher ait résolu — la forme chiffrée « à 8h/9h » reste au jugement contextuel du prompt (massivement matinale dans les flux légitimes : la bloquer en dur régressait 9 tests verts + le shape nina T10). Triplet unitaire vert ; ARBITRAGE consigné : déterminisme partiel (lettres), prompt pour les chiffres.

## R1-B04 — Adéquation technique réactive (mot de bascule accepté sur piège mécanique récurrent)

- Bug id: R1-B04
- Tours: T8 (corrigé T9 sous poussée)
- Famille: `BF-INTAKE-06` (mauvais domaine/adéquation technique)
- Domaine owner: `coaching_recommendation` (contrat de recommandation de technique).
- Source amont: sélection de technique alignée sur le mot-clé user (« carte d'attaque / mot de bascule ») plutôt que sur la nature récurrente/mécanique de l'action (piège à moment identifié → carte de défense plus complète). Doute exprimé seulement en réaction (T9).
- Symptome visible: « Je partirais sur une carte d'attaque, technique mot de bascule : Stop » sans réserve ni comparaison, pour un piège « tous les soirs, mécanique ». Bascule correcte vers la défense dès la confrontation (T9).
- Preuve systeme: owner `coaching_recommendation`, reason `plan_action_coaching_need` band high ; aucun direct effect (recommandation seule, conforme architecture).
- Correction attendue: garde d'adéquation dès le 1er tour — pour un piège récurrent à moment identifié, exprimer le doute et comparer défense vs mot de bascule avant d'entériner le mot-clé. Yellow (pas rouge) car le mot de bascule reste défendable sur une fenêtre de rupture.
- Tests requis: moment de craquage récurrent + user force « mot de bascule » → doute + comparaison défense au 1er tour ; contraste avec global18 T1 (mot de bascule sur action de lancement, autre mismatch).
- Statut: `fix_applied` — P4-D 13/07 : les 4 INVALIDES de la vague (dont CE tour, cas b) ancrés verbatim dans le contrat technique_coherence du flow coaching (« la règle n'a pas tenu, applique-la mot à mot ») — doctrine, à re-observer en run réel.

## R1-B05 — Memorizer : états d'outils persistés en candidates (hygiène d'objet)

- Bug id: R1-B05
- Tours: post-run (batch memorizer)
- Famille: à classifier — couche memory/extraction (hygiène d'objet). Adjacent aux warts memorizer de global17 (fuite état rappel) que global18 avait vus corrigés.
- Domaine owner: memorizer (`extract`) — prompt/contrat d'extraction, frontière « fait de vie » vs « état d'objet applicatif ».
- Source amont: l'exclusion stricte des états d'outils (tenue en global18) est **sensible au phrasé** : les formulations « un rappel a été demandé … puis corrigé … », « une carte d'attaque … a été demandée » passent en candidates au lieu d'être rejetées.
- Symptome visible: aucun (candidates, non actives) — mais pollution inter-runs et risque de contradiction future (l'item rappel porte les valeurs ambiguë/corrigée 8h→20h).
- Preuve systeme: `memory_items` candidates : « Un rappel a été demandé pour demain à huit heures … puis corrigé en rappel à vingt heures le soir » ; « Une carte d'attaque avec un mot de bascule … a été demandée ». Fait perso T14 (course→scroll) correctement persisté en active (invariant OK).
- Correction attendue: règle d'exclusion contractuelle des états d'outils (rappels/cartes/pendings) appliquée aussi aux **candidates**, robuste au phrasé ; test anti-régression sur transcript avec demande de rappel corrigée + demande de carte.
- Tests requis: transcript contenant « un rappel a été demandé … », « une carte a été demandée … » → 0 memory_item (ni active ni candidate) sur ces états ; le fait de vie voisin reste extrait.
- Statut: `fix_applied` — P4-D 13/07 : `isReminderObjectItem` élargi (heures en toutes lettres « huit/vingt heures », moments sans chiffre) + `isToolRequestObjectItem` (« une carte d'attaque … a été demandée » → reject `tool_request_object_state`) — le filtre de PERSISTANCE rejette (jamais une simple rétrogradation candidate) ; triplets unitaires verts sur les 2 items fuyés de ce run (anti-FP : fait d'usage d'outil conservé).

## Re-tests verts (pas de ligne bug — suivi positif)

- BF-PREF-01 comportement cible (T1-T2) : 3 volets tenus, 0 écriture `user_relation_preferences`, style tenu 15 tours. Jamais testé Eva.
- Ledger dédup/superseded (T3) : `requested=2/committed=1/superseded=1` soldé (fix P2-6 tient).
- Replace atomique (T5) : cancel+create, effet unique, placement au passé glisse au lendemain (fix time-of-day).
- Projection statut (T6) : exacte + self-correction.
- Flow Présence (T10-T12) : entrée/collant/offre unique/sortie conformes, pas de capture de flow au pivot tool (T13).
- Memorizer scopé Eva : aucune purge fleet malgré 4 runs concurrents.
