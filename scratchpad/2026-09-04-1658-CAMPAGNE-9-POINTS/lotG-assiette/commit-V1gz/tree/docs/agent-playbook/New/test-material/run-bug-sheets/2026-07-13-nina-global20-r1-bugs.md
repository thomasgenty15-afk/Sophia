# Run Bug Sheet - nina-global20-r1

## Metadata

- Date: 2026-07-13
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-13-nina-global20-r1.md`
- Run id: `nina-global20-r1` (scope `qa-nina-global20-2026-07-13-r1`)
- Persona / scenario: Nina — surfaces **jamais testées sur Nina** dans la fenêtre 12-13/07 (BF-PREF-01, needs_research, feature_opportunity, draft lifecycle, plan_realignment, flow Présence, track composite de dates), mode difficile, 15 tours
- Verdict run: **red**
- Validite QA: valide (15/15 HTTP 200, IA réelle, `force_full_ai`, Supabase local, effets vérifiés en DB par `user_id` par tour, baseline restaurée). Réserve E2 : memorizer batch non complété (gateway timeout sur stack saturé par 5 runs concurrents) — hors verdict produit.
- Agent owner: QA

## Synthese

- Familles dominantes: `BF-STATE-03` / `BF-INTAKE-03` / `BF-EFFECT-01` (draft lifecycle cassé, T4), `BF-EFFECT-03` / `BF-INTAKE-05` (composite de dates aplati, T6), `BF-STATUS-01` (projection/vérification de suivi non groundée DB, T12+T14), `a classifier` (needs_research sous-déclenché, T2).
- Bug le plus bloquant: **B01 (T4)** — un rappel est **créé en DB** malgré « le crée pas, montre-moi le brouillon d'abord, je valide avant » = effet durable **non consenti**, draft lifecycle cassé. Contraste direct avec rose-hard16-T1 (même demande → brouillon, green).
- Fil rouge produit: **B02 (T6) → B03 (T12) → B04 (T14)** = absence de **grounding DB** dans l'écriture (composite aplati) et surtout dans le **rendu/vérification** du suivi (récap et vérification confabulent 3 pour 1 réel). B04 est le plus grave côté confiance : le user demande explicitement de vérifier et reçoit une fausse réassurance.
- Fix architectural prioritaire: (1) reducer draft/confirm + veto d'effet non consenti sur marqueur brouillon ; (2) dépliage des dates composites dans l'intake track + garde d'honnêteté ledger↔réponse ; (3) grounding DB obligatoire des projections ET vérifications de suivi.
- Rerun requis: oui après fix. Rejouer : brouillon → 0 pending puis confirmation → 1 pending (B01) ; « fait X vendredi, samedi et dimanche » → 3 entries ou déclaration honnête (B02) ; « vérifie que les N sont enregistrés » → compte DB réel (B03/B04).
- À NE PAS re-flagger (validé green ce run) : BF-PREF-01 cible sur Nina (T1), presence flow complet (T8-T11), plan_realignment no-mutation (T7), recall sans fuite de slug (T13, red global18-T15 corrigé), tenue de style 15 tours.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NINA-G20-B01` | T4 | `BF-STATE-03` (racine `BF-INTAKE-03` + `BF-EFFECT-01`) | dispatcher (émission direct_effects) + reducer draft `create_one_shot_reminder` + effect admission gate | marqueurs brouillon explicites (« juste un brouillon », « le crée pas tout de suite », « je veux valider avant ») non consommés → `direct_effects_to_run=[create_one_shot_reminder]` émis et committé | Réponse « C'est déjà créé pour demain à 08:30 » ; ledger committed=1 ; DB : `scheduled_checkins` **pending** `85f718e1` (`2026-07-14T06:30Z`), `draft_message` vide | Marqueur brouillon → état `draft` (texte proposé rendu, `draft_message` posé, **0 pending**) ; création seulement après confirmation | **fix_applied (P5-F)** | brouillon → 0 pending + brouillon rendu ; « ok crée-le » → 1 pending ; anti-régression rose-hard16-T1 (même effet : aucune création tant que non confirmé) |
| `NINA-G20-B02` | T6 | `BF-EFFECT-03` (racine `BF-INTAKE-05`) + `BF-LEDGER-01` | `track_progress_plan_item` (intake + payload compiler) + garde de rendu ledger↔texte | plage de 3 dates explicite (« vendredi samedi et dimanche », « compte-moi les trois ») non dépliée → 1 seule occurrence retenue | Réponse « compté sur vendredi, samedi et dimanche » ; ledger committed=1 ; DB : **1** entry (`effective_at=2026-07-11` samedi), `current_reps` 0→1 ; ve(10)/di(12) absents | Liste/plage de N dates → N complétions (une par `effective_at`) ; si non supporté, committer + déclarer honnêtement le sous-ensemble ; jamais annoncer N pour M<N | **fix_applied (P5-C)** | « fait X ve/sa/di » → 3 entries aux 3 dates OU réponse = sous-ensemble committé exact |
| `NINA-G20-B03` | T12 | `BF-STATUS-01` | status projection (suivi) / composeur récap | récap de suivi dérivé du narratif de conversation au lieu de `user_plan_item_entries` | Réponse « Boire un grand verre d'eau : **fait 3 fois** … vendredi, samedi et dimanche » ; DB : 1 entry (`current_reps=1`) | Récap de suivi dérivé de `user_plan_item_entries`/`current_reps`, jamais du narratif | **fix_applied (P5-B/P5-C)** | après track annoncé N mais committé M<N, récap déclare **M** |
| `NINA-G20-B04` | T14 | `BF-STATUS-01` (+ `BF-LEDGER-01` aggravant) | status projection / composeur (chemin vérification d'effet durable) | question de vérification explicite (« t'es sûre que les 3 sont enregistrés ? vérifie ») → réaffirmation du narratif sans relire la DB | Réponse « Oui, les 3 jours sont bien enregistrés … Je ne te le mettrais pas si ce n'était pas déjà compté » ; ledger 0 (aucun re-track) ; DB : 1 entry | Question « c'est bien enregistré ? / vérifie » → relire la DB et répondre le compte réel (« 1 sur 3, correction »), jamais réaffirmer le narratif | **fix_applied (P5-B)** | après track partiel (M<N), « vérifie que les N sont enregistrés » → réponse = M avec correction explicite |
| `NINA-G20-B05` | T2 | `a classifier` (needs_research sous-déclenché) | intake `needs_research` / TurnFrame | marqueurs de vérifiabilité (« est-ce que c'est vrai que… ? », « je veux du concret ») sur affirmation santé/nutrition ne montent pas le flag | `needs_research.detected=false` ; llm_usage : dispatcher→feature_opportunity.local_dispatcher→companion, **aucun appel Gemini de grounding** ; réponse exacte mais paramétrique | Affirmation factuelle explicitement mise en doute en domaine santé → `needs_research.detected=true` (grounding léger) ou justification explicite du non-grounding | **fix_applied (P5-H, doctrine)** | « est-ce que c'est vrai que <claim santé> ? » → grounding déclenché ou non-grounding justifié |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-13 | Surfaces neuves validées green sur Nina : BF-PREF-01 cible (T1), flow Présence complet (T8-T11), plan_realignment no-mutation (T7), recall sans fuite de slug (T13) | Run réel Nina, première couverture de ces surfaces sur ce persona | QA | rapport §Verdict Global |
| 2026-07-13 | B02/B03/B04 tracés comme **une même racine** (grounding DB manquant du suivi), du plus amont (écriture composite) au plus grave côté confiance (fausse vérification) | Un même défaut se propage écriture→récap→vérification | QA | rapport T6/T12/T14 |
| 2026-07-13 | B01 draft lifecycle : **régression de couverture** (rose-hard16-T1 green, nina-global20-T4 red) — à re-tester cross-persona après fix | Même intention, effet opposé selon le persona/tour | QA | rapport T4 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-13 | B01 | DB `scheduled_checkins` post-T4 | 1 pending `85f718e1` créé (draft demandé) ; annulé au T5 (cancelled) | rapport T4/T5 |
| 2026-07-13 | B02 | DB `user_plan_item_entries` post-T6 | 1 entry (samedi 11/07) pour 3 jours demandés ; `current_reps=1` | rapport T6 |
| 2026-07-13 | B03 | réponse récap T12 vs DB | « 3 fois » annoncé, 1 en DB | rapport T12 |
| 2026-07-13 | B04 | réponse vérif T14 vs DB | « les 3 sont enregistrés » sur demande explicite de vérifier, 1 en DB, ledger 0 | rapport T14 |
| 2026-07-13 | B05 | `needs_research` + llm_usage T2 | detected=false, aucun appel grounding Gemini | rapport T2 |
| 2026-07-13 | — (BF-PREF-01 OK) | `user_relation_preferences` + `__session_style_commitments` post-T1 | 0 ligne durable ; style tenu en session + honnêteté + renvoi Préférences | rapport T1 |
| 2026-07-13 | — (Présence OK) | owners T8-T11 | entrée `presence_conversation_entry` → `active_presence_conversation` → sortie transactionnelle, 0 outil poussé | rapport T8-T11 |
| 2026-07-13 | — (recall OK) | réponse T13 | fait diététicienne restitué exact, zéro slug interne (red global18-T15 non reproduit) | rapport T13 |

## Vérification chantier P5 (2026-07-13 nuit)

- **B01 (draft lifecycle)** : garde d'admission déterministe `oneShotReminderDraftRequested` (« brouillon », « montre-le-moi d'abord », « je valide avant ») ⇒ brouillon rendu + slots persistés (pending create) + ZÉRO ligne pending ; « ok crée-le » committe tel quel. Probe P5-6 : 0 pending puis 1 pending 08:30 « vitamines », 2× GREEN.
- **B02 (composite de dates)** : `resolveExplicitTrackDayList` étendu aux jours de semaine NOMMÉS (résolution au plus récent passé, négations exclues, borné 3, ponctuation normalisée) + gate is_correction tombé (correction ADDITIVE de jours = cas multi-jours). Probe P5-3 : « vendredi, samedi et dimanche » → 3 entrées aux 3 bonnes dates.
- **B03/B04 (récap/vérif non groundés)** : question de vérification track ⇒ intent status_question (phrases « t'es sûre », « vérifie que », « sont bien enregistrés ») = zéro write ; directive snapshot durcie (« la vérification COMPTE les coches, corrige l'écart, ne réaffirme jamais le narratif ») ; et la racine amont (B02) écrivant désormais les 3 entrées, le récap est vrai par construction. Probe P5-3 T2 : zéro effet, 3 entrées inchangées, réponse groundée.
- **B05 (needs_research)** : règle 8 dispatcher — mise en doute explicite d'une affirmation factuelle santé/nutrition/science ⇒ value=true (ancre testée). Doctrine : à re-vérifier en run réel.
- Sweep 1082/17 = baseline ; probes 2× ALL GREEN consécutives sur le build final.
