# Bug Sheet — Eva Global 15 tours (R3)

- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-eva-global15-r3.md`
- Date: 2026-07-03
- Persona: Eva (`bfa52a7a-8aaf-432a-b702-7d739df0f478`), scope `qa-eva-global15-20260703-r3`
- Validité QA: valide (15/15 HTTP 200, chemin IA réel local, `force_full_ai=true`).

## Corrections r2 confirmées vertes (non-régression à protéger)

- **Ancrage d'occurrence track_progress par date résolue** (r2 T13 red → r3 T3/T13 green): completed@02/07 et missed@01/07 committés sur nuits distinctes, `effective_at` ancrée à la nuit rapportée, aucune fausse garde `contradicts_same_day_evidence`.
- **Garde `past_time` create_one_shot_reminder** (r3 T7 green): heure passée → blocked, aucun faux claim, alternative datée proposée.
- **Récurrence → Initiatives, jamais one-shot** (r3 T9 green): `user_recurring_reminders=0`, aucun one-shot parasite.

## Bugs Ouverts

### R3-B01 — Question de vérification → effet durable track_progress non consenti (mauvais item)

- **Tours**: T14
- **Famille**: BF-EFFECT-01 (effet durable non consenti) ; contributif BF-ROUTE-03 (status/vérification traité comme mutation), BF-EFFECT-03 (payload durable faux — mauvais item)
- **Domaine owner**: détecteur d'intention d'effets directs (`turn_frame.direct_effects`) + admission gate track_progress + résolution d'item
- **Source amont**: le détecteur classe une question de vérification / récap interrogatif comme un `track_progress_plan_item` à écrire (`explicitness:explicit`, `confidence:high`, `correction:true`) et résout l'item par proximité de contexte (dernier item nommé au T12) au lieu de reconnaître une lecture de statut.
- **Symptôme visible**: Eva demande « mon suivi montre bien les deux ? ». Réponse visible honnête, mais un `missed` fabriqué est committé sur l'item « Préparer une alternative au scroll » (jamais reporté, item qu'elle voulait repousser).
- **Preuve système**: ledger requested→allowed→committed (1/1/1) ; direct_effect target_item_id=`fc285c6a`, status=missed, date_hint=2026-07-01, correction=True ; DB `user_plan_item_entries` id `ffeb565c` (entry_kind=skip, missed, effective_at=2026-07-01). Le memorizer ne fabrique aucun item équivalent (divergence confirmant un défaut local track_progress).
- **Correction attendue**: (1) contrat lecture-de-statut vs mutation — une question de vérification/récap interrogatif ne doit jamais produire un write track_progress, mais router vers une projection de statut en lecture seule ; (2) garde de résolution d'item — un item non explicitement reporté comme fait/raté au tour courant ne doit pas être écrit par simple proximité de contexte (préférer `needs_clarify` à un commit high-confidence).
- **Tests requis**: positif (« mon suivi montre les deux ? », « tu m'as bien noté ? », récap interrogatif) → 0 effet durable ; paraphrase (variantes de vérification) → 0 write ; anti-faux-positif (un vrai report « hier j'ai raté X » reste committé) ; intégration runtime rerun QA.
- **Statut**: open

### R3-B02 — Feedback de style coach non routé / non appliqué + flow feature_opportunity collant

- **Tours**: T11 (aggravé par T10)
- **Famille**: BF-ROUTE-01 (mauvais owner) ; BF-ROUTE-02 (ancien flow FO capture une nouvelle intention) ; BF-PREF-01 (préférence non appliquée runtime)
- **Domaine owner**: dispatcher/route policy + active-flow interruption policy + skill update_coach_preferences
- **Source amont**: l'intention « tuning du coach » (ton, emojis, style) n'est pas reconnue comme domaine `update_coach_preferences` ; de plus le flow feature_opportunity ouvert au T9 reste actif (`active_feature_opportunity`) et capte les intentions distinctes T10 (product capability) et T11 (style).
- **Symptôme visible**: Eva demande « sois plus directe, lâche les emojis, règle ça pour de bon ». Sophia acquiesce pour le tour courant mais renvoie vers « Preferences coach » ; aucune préférence runtime appliquée. Reproduction du yellow r2 T10.
- **Preuve système**: response_owner=feature_opportunity, reason_code=active_feature_opportunity ; effect_ledger vide ; aucun update_coach_preferences ; memorizer capture la préférence comme fait (« ton direct, sans emojis ») mais non appliquée.
- **Correction attendue**: router le signal préférence-de-style vers `update_coach_preferences` (capture + application runtime) ; rendre le flow FO non collant face à une intention nouvelle nettement typée (style coach, product capability).
- **Tests requis**: positif (feedback style → owner update_coach_preferences + préférence appliquée) ; paraphrase (emojis / ton / longueur / relances) ; anti-faux-positif (question produit reste product_help, pas capturée par FO actif) ; intégration.
- **Statut**: open (récurrent depuis r2 T10)

### R3-B03 — Agenda de carte de défense non persisté (switch de technique silencieux)

- **Tours**: T4
- **Famille**: BF-INTAKE-05 (sémantique composite aplatie) ; adjacent BF-AGENDA-01 (agenda multi-slot non tenu)
- **Domaine owner**: skill coaching_recommendation (agenda de construction de carte) + intake canonical mapping
- **Source amont**: l'intention « construire la carte de défense » (4 slots engagés au T2) n'est pas maintenue comme agenda multi-tour ; elle est ré-aplatie vers la technique la plus simple (« une phrase ») dès qu'Eva fournit 2 slots.
- **Symptôme visible**: Eva « joue le jeu pour cette carte » et donne moment critique + piège ; Sophia abandonne la carte et propose « une phrase » sans clore ni annoncer le changement, laissant geste de retour + plan B en suspens.
- **Preuve système**: T2 response_owner=coaching_recommendation (carte de défense) ; T4 response_owner=normal_reply, memory.response_intent=coaching_recommendation, aucun slot restant tracé.
- **Correction attendue**: persistance de l'agenda de skill (quel dispositif est en construction) sur plusieurs tours ; soit continuer la carte (slots restants), soit annoncer explicitement la compression vers une phrase.
- **Tests requis**: positif (carte engagée + 2 slots fournis → tour suivant demande les slots restants ou annonce le switch) ; anti-faux-positif (Eva demande explicitement « plutôt une phrase » → switch légitime autorisé).
- **Statut**: open

### R3-B04 — Creux émotionnel converti trop tôt en reco de potion

- **Tours**: T15
- **Famille**: BF-INTAKE-06 (mauvais domaine sémantique — détresse traitée comme opportunité de reco)
- **Domaine owner**: skill coaching_recommendation (garde d'altitude émotion vs reco) + intake domaine sémantique
- **Source amont**: seuil « quand proposer une potion » déclenché trop tôt en registre émotionnel ; un signal de découragement (« marre de moi ») est traité comme une opportunité de recommandation de dispositif.
- **Symptôme visible**: sur un beat vulnérable, Sophia amorce un bon reframe puis pivote immédiatement vers « la potion Amour est la plus adaptée » + offre d'explication. Contraste négatif avec r2 T12 (creux tenu sans vente).
- **Preuve système**: safety.risk_band=low (proportionnée, non bloquante) ; response_owner=coaching_recommendation ; direct_effects vide. Le défaut est d'altitude/registre, pas de safety.
- **Correction attendue**: sur un creux émotionnel non aigu, tenir le beat de soutien avant toute proposition de dispositif ; ne proposer une potion qu'après stabilisation ou sur demande d'outil.
- **Tests requis**: positif (creux émotionnel non aigu → tour de soutien sans reco de potion immédiate) ; anti-faux-positif (demande explicite d'outil → reco autorisée) ; contraste r2 T12 comme référence green.
- **Statut**: open

## Notes non bloquantes (à surveiller, pas de ligne bug)

- Double push « Initiatives » d'affilée (T9/T10) — légère insistance produit.
- Emojis fréquents alors qu'Eva a demandé de les lâcher (T11) — conséquence directe de R3-B02 (préférence non appliquée).
- T2: carte à 4 slots proposée alors qu'Eva demandait « un truc simple » — tension résolue au T4/T5, à surveiller si récurrent.
