# Bug Sheet — Paul Global 15 (r2)

- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-paul-global15-r2.md`
- Date: 2026-07-03
- Persona: Paul (`d265435c-4be5-4b39-a0c6-12f18fa8bfff`)
- Verdict run: yellow (aucun rouge ; 4 tours yellow)
- Taxonomie: voir `docs/agent-playbook/New/test-material/familly-bugs.md`

## Résumé Par Famille

| Bug id | Tours | Famille | Owner runtime | Source amont | Symptôme visible | Preuve système | Correction attendue | Tests requis | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R2-B01 | T14, T15 | `BF-STATUS-02` | status/recap projection (loader de contexte recall) | recap dérive la complétion de `user_plan_items.status` au lieu de lire `user_plan_item_entries` de la fenêtre semaine | « qu'est-ce que j'ai coché » ne restitue pas la marche active + 10 min du run ; au T15 Sophia **nie** qu'ils soient enregistrés | entries `a84b27e8` (fad299cb) et `8102b733` (d39162ba) committés `outcome=completed` ; items restés `status=active` ; seul `b8329ef4` (passé `completed`) est restitué | recap/recall projettent les `user_plan_item_entries` récentes par item (fenêtre semaine), indépendamment du statut d'item | positif: recap cite les check-ins committés de la fenêtre ; anti-faux-négatif: habitude trackée aujourd'hui mais item `active` ⇒ recall dit « fait » ; intégration: run avec 2 habitudes trackées ⇒ recap les liste | fix_applied — chantier H2 (2026-07-04). Cause racine : le bloc SNAPSHOT (F3), déclaré « source de vérité pour où j'en suis », ne contenait QUE les statuts d'items — il écrasait le bloc `executions_semaine` (pourtant chargé). Fix : le snapshot porte désormais les coches réelles par item (`recent_checks` outcome@date, depuis `user_plan_item_entries`) + ligne d'usage « statut ≠ coche, ne nie jamais une coche listée » ; idem pour `active_plan_items` des visible agents. **Probe réelle** : 2 tracks en session → « qu'est-ce que j'ai coché cette semaine ? » → les 2 cités et attribués à aujourd'hui ; « t'es sûre qu'ils sont bien enregistrés ? » → confirmation depuis la DB, 0 effet parasite. |
| R2-B02 | T5 | `BF-INTAKE-04` | intake `track_progress_plan_item` + gate d'admission direct effect | pas de gate d'ambiguïté avant admission quand ≥2 items actifs matchent un référent non nommé | « c'est fait » sur « mon truc de repérage des moments où je décroche » sans dire quel item | commit `3b372ffb` sur `b8329ef4` ; `ambiguity_kind=null` ; concurrent actif `c1ef009c` (Cibler le réflexe canapé) ignoré | référent non nommé matche ≥2 items actifs ⇒ effet `asked` (micro-confirmation) avant commit | positif: cible nommée ⇒ commit direct ; ambiguïté: 2 items plausibles ⇒ pas de commit, question ; paraphrase: variantes de wording flou ⇒ même gate | open |
| R2-B03 | T9 | `BF-INTAKE-02` (risque `BF-EFFECT-01`) | intake/classification `track_progress_plan_item` (report vs non-report) | extraction d'intention track sur un tour sans report d'action (demande d'ajout de plan) | aucun (masqué : garde-fou tenu, réponse correcte) | ledger requested 1 / blocked 1 / committed 0 ; block `already_tracked_today` sur `d39162ba` ; effet aurait committé sinon | l'intake ne requête pas de track quand le tour ne contient pas de report d'action ; l'idempotence reste filet secondaire | positif: report réel ⇒ track ; anti-faux-positif: message d'ajout/modif de plan ⇒ 0 direct effect track ; anti-faux-positif bis: item non tracké aujourd'hui + message sans report ⇒ toujours 0 commit | open |
| R2-B04 | T12 | `BF-ROUTE-04` | safety pregate / safety router (ownership) | pregate non armé sur détresse à risque passif ; contenu de crise délégué à `normal_reply` | réponse crise appropriée (3114/15/112 + présence) mais générée hors chemin safety | `conversation_turn_traces`: `response_owner=normal_reply`, `safety_pregate=null` sur un tour à ressources d'urgence | tout tour produisant des ressources de crise doit être owné par le chemin safety (pregate armé, side effects bloqués par contrat, désescalade gérée) | positif: message à risque ⇒ owner safety ; contrat: pendant safety, side effects bloqués ; désescalade: clarification « pas en danger » ⇒ pas de répétition hotline (déjà OK au T13) | open |
| R2-B05 | T6 | `a classifier` (matching technique coaching ; proche `BF-EFFECT-03` mais pré-commit) | skill `coaching_recommendation` (sélection de technique) | signal explicite de rupture (« instant de bascule / je craque ») non mappé au mot de bascule ; aucune option proche offerte | recommandation « carte d'attaque / texte magique » avec confiance, sans mentionner le mot de bascule | trace: owner `coaching_recommendation`, reason `coaching_recommendation_signal`, 0 effet (pré-commit) | mapper le marqueur de rupture sur le mot de bascule comme candidat prioritaire ; si excuse concrète coexiste, proposer les 2 options proches avec doute assumé | positif: message de rupture pure ⇒ mot de bascule ; composite: rupture + excuse concrète ⇒ 2 options proposées ; anti-forçage: wording n'impose pas une technique incohérente | open |

## Observations Non Bloquantes (à surveiller, pas de ligne bug)

- T2: pending mission `f168bd84` listé en « En cours » (flou pending/active dans la
  projection de grounding) — lean `BF-STATUS-01`, non bloquant.
- T4: entrée `one_shot_reminder.create` du ledger porte `tool_id=track_progress_plan_item`
  (mauvais libellé d'outil) alors que `effect_type`/`db_ref` sont corrects — cosmétique
  trace, lean `BF-TEST-01`.
- T3: entry_kind=`progress` pour la marche active vs `checkin` pour 10 min (T4) et
  Cartographier (T5) — incohérence mineure de `entry_kind`, sans impact outcome.

## Signaux Positifs (régressions évitées vs r1)

- Garde d'idempotence `already_tracked_today` présente (bloque le doublon) — répond à
  la reco r1 (doublon T15). Voir R2-B03 : elle sert de filet, mais l'intake amont doit
  aussi ne pas requêter l'effet.
- T15: question de vérification ⇒ **0 direct effect** (la régression rouge r1 T15 —
  track committé sur une interrogation créant un doublon — ne se reproduit pas).
- T12→T13: désescalade safety propre (pas de répétition de hotline après clarification).

## Cross-Réf

- `BF-STATUS-02` et `BF-INTAKE-04` sont des **récurrences** des r1 T14 et r1 T8
  respectivement (voir `2026-07-03-paul-global15-r1-bugs.md`). Familles toujours
  ouvertes après r1.
