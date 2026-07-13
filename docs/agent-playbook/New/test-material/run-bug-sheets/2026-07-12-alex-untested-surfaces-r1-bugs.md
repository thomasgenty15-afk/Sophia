# Bug Sheet — alex-untested-surfaces-r1 (2026-07-12)

Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-12-alex-untested-surfaces-r1.md`

Run 15 tours en mode difficile sur les angles morts des rapports du 10-12/07 (track positif, correction de cible, multi-intent, dédup, replace, statut, frontières plan/récurrent, anti-instruction, mémoire bout-en-bout). Verdict global **red** (T2, T6).

## R1-B01 — Correction de cible sans retarget (fausse complétion durable)

- Bug id: R1-B01
- Tours: T2 (posé par T1)
- Famille: `BF-EFFECT-03` (payload durable faux — flags de correction absents)
- Domaine owner: dispatcher (payload_hint track) + tool skill `track_progress_plan_item` (admission/écriture)
- Source amont: règle 3h-bis de `dispatcher.prompts.ts` non suivie sur une correction naturelle (« cetait pas le carnet en fait, cest les écrans ») → effet émis avec `correction=false`, `retarget_from_item_id=null` ; aucun garde structurel aval ne détecte le conflit avec l'entrée committée du T1 (même conversation, même date).
- Symptome visible: Sophia dit « le carnet, lui, reste à faire » alors que l'entrée carnet `completed` du T1 survit en DB (reps carnet reste 1) ; la nouvelle entrée écrans est bien créée.
- Preuve système: trace T2 `tool_skill_run.requested_effects[0]` sans flags de correction ; DB post-tour : `user_plan_item_entries` 9afa4386 (carnet, completed) ET 6c9d81b0 (écrans, completed) coexistent ; `current_reps` carnet=1, écrans=2.
- Correction attendue: garde déterministe côté tool skill — un report `completed` sur item Y avec marqueur de correction, alors qu'une entrée committée existe sur item X dans la même conversation pour la même date, doit emprunter le chemin retarget (invalidation X + écriture Y) ou sortir en needs_clarify ; jamais un append silencieux. Le prompt seul est prouvé insuffisant.
- Statut: `fix_applied` (2026-07-13, chantier P2-4a)
- Fix reference: triple garde : (1) correction=true sans retarget_from ET aucune entrée du jour sur la cible → clarify `correction_retarget_missing` (fin de l'append silencieux) ; (2) fait structuré `flow_state_context.last_track_commit` (dernier commit track) rend 3h-bis exécutable (retarget_from clé en main) ; (3) garde runtime de BASCULE DE CIBLE : report same-status sur une autre cible que le commit du tour précédent (fraîcheur 1 tour), même jour, sans flags → clarify « en plus ou à la place ? » avec `retarget_from_candidate` dans les known_slots (3g arbitre). Probe live alex T2 GREEN (jamais deux completed actifs).
- Tests requis: positif (correction franche « non c'était X pas Y ») ; paraphrase (« jme suis embrouillé, en fait c'était Y ») ; anti-faux-positif (report d'une 2e action réellement distincte le même jour ne doit PAS invalider la 1re) ; intégration runtime (entrée X invalidée + entrée Y lisible le tour même).

## R1-B02 — Replace non atomique : cancel committé, create bloqué past_time

- Bug id: R1-B02
- Tours: T6 (contexte T3-T5, réparé par le user au T7)
- Famille: `BF-EFFECT-02` (effet attendu absent) + contributeur `BF-INTAKE-04` (résolution de date fausse non traitée comme ambiguïté)
- Domaine owner: lane direct-effect `create_one_shot_reminder` (séquencement replace + résolution temporelle)
- Source amont: sur « annule celui de 21h50 et remets en un a 21h15 », l'heure nue « 21h15 » est résolue sur le jour courant (23h17 → `past_time`) au lieu d'hériter de l'ancre « demain » du rappel remplacé et des 3 tours précédents ; le cancel n'est pas conditionné au succès du create → état net : plus aucun rappel pending.
- Symptome visible: « le rappel de 21h50 est annulé ici. Pour le mettre à 21h15, passe par Dashboard > Initiatives » — le user qui a suivi la consigne donnée par Sophia au T5 se retrouve sans rappel.
- Preuve système: trace T6 `blocked_effects=[past_time]`, committed=[] ; DB : 7d950e78 passé `cancelled`, aucune ligne 21h15 ; T7 (avec « demain » explicite) committe 0aa9ebf7 → le différenciateur est bien la résolution de date.
- Correction attendue: (1) transaction tout-ou-rien sur le replace — le cancel ne se committe que si le create passe l'admission, sinon needs_clarify global sans mutation ; (2) héritage d'ancre temporelle — heure nue dans un replace = date du rappel remplacé. Étendre le harness chantier R d'un scénario « replace avec heure nue en soirée ».
- Statut: `fix_applied` (2026-07-13, chantier P2-3a)
- Fix reference: — (invariant « replace atomique tout-ou-rien » du chantier R, 15-chantiers-log 11/07)
- Tests requis: positif (replace heure nue soir → une seule ligne pending à la nouvelle heure du bon jour) ; anti-faux-positif (cancel sec sans re-création reste permis) ; intégration (jamais `cancelled` sans `pending` de remplacement sur un tour replace) ; horloge (tour joué après l'heure cible du jour courant).

## R1-B03 — « existe déjà » sur création fraîche + émissions de lane parasites

- Bug id: R1-B03
- Tours: T3
- Famille: `BF-LEDGER-02` (commit réel mal rendu) ; watch dispatcher associé (payload create dupliqué dans requested_effects, lane track émise sur une question de lecture — règle 3e)
- Domaine owner: final response pipeline (rendu create) + dispatcher (émission des lanes)
- Source amont: rendu de création non asservi au `reason_code` du committed (payload = création fraîche) ; dispatcher émet 2× le même payload create et une lane track non consentie (rattrapée en aval, 0 write).
- Symptome visible: « le rappel pour sortir le carnet existe déjà » sur une première création ; phrase de stats fusionnant carnet et écrans.
- Preuve système: trace T3 requested_effects = 2 payloads identiques, committed = 1 (7d950e78) ; 0 entrée track écrite ; récidive inter-runs (alex-multiflow r1 T8 « c'est déjà prévu »).
- Correction attendue: rendu create piloté par reason_code (payload → « c'est noté », jamais « existe déjà ») ; dédup des payloads identiques à l'émission ; contractualiser par test le non-write de la lane track sur question de lecture.
- Statut: `fix_applied` (2026-07-13, chantiers P2-2/P2-6)
- Fix reference: guidance committed durcie du verbatim (« existe déjà »/« déjà prévu » sur un commit frais = mensonge, direct_effect_local_context) ; le double payload est soldé par `superseded_by_dedup` (P2-6). La dédup d'émission par effect_type existait déjà au sanitizer.
- Tests requis: positif (création fraîche → formulation de création) ; anti-faux-positif (duplicate_pending → « déjà là » reste correct) ; unitaire dispatcher (question de lecture → aucune lane track).

## R1-B04 — Jour de semaine faux dans le statut (« dimanche 13 juillet » pour un lundi)

- Bug id: R1-B04
- Tours: T8
- Famille: `BF-STATUS-03` (temps/localisation mal rendus)
- Domaine owner: status renderer / final response pipeline
- Source amont: jour de semaine reformulé par le LLM au lieu d'un formatage calendaire déterministe ancré sur `client_timezone`.
- Symptome visible: « dimanche 13 juillet à 21h15 » alors que le 13/07/2026 est un lundi (le user venait de dire « demain lundi »).
- Preuve système: transcript T7/T8 + calendrier ; la projection de fond (heures, pending, annulé) était exacte.
- Correction attendue: dates rendues formatées déterministiquement (label pré-calculé dans la projection) et non régénérées en texte libre.
- Statut: `fix_applied` (2026-07-13, chantier P2-8)
- Fix reference: les labels de la projection status portent déjà le jour de semaine calculé déterministiquement (Intl) — la guidance status interdit désormais au composeur de RECALCULER le jour (« recopie exactement tel que fourni », verbatim T8).
- Tests requis: positif (statut → jour de semaine exact pour plusieurs dates/timezones) ; anti-régression sur le label local du committed.

## R1-B05 — Anti-instruction « re-coche rien » non honorée en émission

- Bug id: R1-B05
- Tours: T14
- Famille: `BF-INTAKE-03` (contrainte explicite perdue) — latent, 0 write grâce au garde `already_tracked_today`
- Domaine owner: dispatcher + admission tool skill track
- Source amont: règle 3e (« anti-instruction absolue : zéro track_progress_plan_item sur ce tour ») non suivie en émission ; aucun garde d'admission ne porte la contrainte — le blocage effectif est venu du dédup du jour, filet incident qui ne couvre pas le cas « vérifie que tu n'as PAS coché ».
- Symptome visible: aucun (réponse et DB correctes sur ce run) — bug latent.
- Preuve système: trace T14 requested_effects=[écrans completed] malgré « re-coche rien hein », blocked=`already_tracked_today`.
- Correction attendue: contrainte anti-instruction portée dans le TurnFrame et opposable par un garde d'admission déterministe de la lane track (même philosophie que le blocage side-effects sous safety).
- Statut: `fix_applied` (2026-07-13, chantier P2-4, volet prompt)
- Fix reference: règle 3e renforcée du verbatim T14 (l'anti-instruction s'applique à l'ÉMISSION, direct_effects=[] même si l'action n'est pas encore trackée). Limite honnête : garde d'admission structurelle non implémentée (l'anti-instruction n'est pas un fait structuré du frame) — le filet `already_tracked_today` reste le second rideau ; à surveiller au prochain run.
- Tests requis: positif (anti-instruction + action NON encore trackée aujourd'hui → zéro write) ; paraphrase (« touche à rien », « juste pour checker ») ; anti-faux-positif (report réel sans anti-instruction → write normal).

## R1-B06 — CTA plan_realignment resservi deux tours de suite

- Bug id: R1-B06
- Tours: T9-T10
- Famille: `a classifier` (anti-répétition compose ; pas de famille dédiée à la répétition de gabarit — même mécanisme que le watch anti-répétition d'eva-global16 T3)
- Domaine owner: composeur `plan_realignment`
- Source amont: le composeur ne tient pas compte de son propre CTA émis au tour précédent ; sur une intention mémoire reliée au plan, il redéroule le gabarit complet « Dashboard > Plan > Ajuster mon plan + consignes ».
- Symptome visible: deux messages consécutifs quasi identiques dans leur seconde moitié ; effet mécanique.
- Preuve système: transcript T9/T10 (même destination produit, même liste).
- Correction attendue: anti-répétition de CTA dans la fenêtre courte (si le renvoi identique vient d'être fait, le compresser en une demi-ligne).
- Statut: `fix_applied` (2026-07-13, chantier P2-7)
- Fix reference: règle ANTI-REPETITION DE CTA dans le visible agent plan_realignment : renvoi complet déjà fait au message précédent → compression en une demi-ligne, la réponse se consacre au nouveau contenu.
- Tests requis: contractuel composeur (2 tours consécutifs plan_realignment → pas de re-déroulé intégral du même CTA).

## R1-B07 — Origine potion absente de la réponse « ça vient d'où »

- Bug id: R1-B07
- Tours: T11
- Famille: `BF-STATUS-01` (projection incomplète), sévérité basse
- Domaine owner: product_help retrieval / projection initiatives
- Source amont: `source_kind`/`source_potion_session_id` de `user_recurring_reminders` non exposés à product_help ; la réponse décrit où vit la série (« initiative récurrente », exact) mais pas sa généalogie (série de suivi de la potion d'apaisement).
- Symptome visible: réponse actionnable mais incomplète à une question d'origine explicite.
- Preuve système: DB `user_recurring_reminders` 1f05be22 avec source potion ; registre produit `recurring_reminder` → « Initiatives » (le chemin donné était juste).
- Correction attendue: exposer l'origine (source_kind + thème potion) dans la projection des initiatives lisible par product_help.
- Statut: `fix_applied` (2026-07-13, chantier P2-8)
- Fix reference: généalogie exposée : la projection des récurrents (loader `loadRendezVousSummary`) lit `initiative_kind`/`source_kind` et annote « origine: série de suivi d'une potion » — lisible par product_help et le composeur.
- Tests requis: positif (« ça vient d'où » sur une série potion → mentionne la potion source) ; anti-faux-positif (initiative créée manuellement → pas d'origine potion inventée).

## Watch-points (non classés comme bugs)

- **Memorizer — sur-généralisation temporelle**: « ma copine arrive vers 22h demain » (événement ponctuel du lundi 13/07) mémorisé comme « Sa compagne arrive vers 22h le lundi soir » (fait récurrent). Champs `time_precision`/`event_start_at` disponibles mais non utilisés pour borner. À surveiller sur les prochains runs mémoire ; ouvrir une ligne BF-MEMORY si récidive.
- **Extraction « le rappel carnet » comme instruction** (T7): méta-texte au lieu du contenu utile (« sortir le carnet ») — mineur, famille BF-INTAKE-02 si récidive.
- **Environnement**: l'historique web d'Alex contient des messages type-cannabis (probe trans-persona antérieur, 10/07 et 12/07 19h15) → le batch memorizer a extrait un item « craquage consommation » fidèle à l'input mais hors persona. Incident d'environnement (hygiène des comptes de test), pas un bug produit. Recommandation : ne pas rejouer de contenus hors-persona sur les comptes nommés.
