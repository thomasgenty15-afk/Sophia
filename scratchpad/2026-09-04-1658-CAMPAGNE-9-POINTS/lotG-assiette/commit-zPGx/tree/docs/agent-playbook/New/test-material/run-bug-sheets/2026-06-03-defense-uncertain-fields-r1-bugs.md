# Bug Sheet — defense-uncertain-fields-r1

## Contexte

- Date: 2026-06-03
- Run: `defense-uncertain-fields-r1`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-defense-uncertain-fields-r1.md`
- Statut global: `red`

## Bugs

### R1-B01 — Clarification attaque/défense mal ciblée

- Tours: 1
- Famille: `BF-ROUTE-03` — product/status/tool mal priorisés
- Domaine owner: orientation clarification / dispatcher
- Source amont: contrat de clarification avant tool skill
- Symptôme visible: Sophia demande "explication produit ou démarrage mails" au lieu de clarifier attaque vs défense autour du risque YouTube.
- Preuve système: `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, `route_reason=clarification_required`, `executed_tools=[]`.
- Correction attendue: pour une demande "attaque ou défense" avec risque de dérapage, poser une clarification métier attaque/défense ou transférer au skill si défense assez claire.
- Statut: `open`
- Fix reference: à faire
- Tests requis: positif ambigu attaque/défense, paraphrase avec "je ne sais pas quelle carte", anti-faux-positif vraie demande product-help reste product-help.

### R1-B02 — Clarification résolue ne route pas vers prepare_defense_card

- Tours: 2
- Famille: `BF-ROUTE-01` — mauvais owner sélectionné
- Domaine owner: routing / orientation clarification lifecycle
- Source amont: sortie d'état `orientation_clarification`
- Symptôme visible: après "je veux plutôt une défense", Sophia répète une clarification générique au lieu de lancer l'intake défense.
- Preuve système: `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, aucun `operation_flow_run`.
- Correction attendue: lorsqu'une clarification active est résolue vers défense, sélectionner `prepare_defense_card` et transmettre les éléments déjà donnés comme contexte structuré.
- Statut: `open`
- Fix reference: à faire
- Tests requis: positif "plutôt défense", paraphrase "non une défense", anti-faux-positif "je veux juste comprendre les champs" reste product help.

### R1-B03 — Normal reply prend le parcours métier défense

- Tours: 3-4
- Famille: `BF-ROUTE-01` — mauvais owner sélectionné
- Domaine owner: routing / arbitration tool skill
- Source amont: route `orientation_clarification_topic_change` vers `normal_reply`
- Symptôme visible: Sophia accepte verbalement la défense, mais ne sélectionne pas `prepare_defense_card`; elle invente le champ "promesse" et ne produit pas de destination plateforme.
- Preuve système: `response_owner=normal_reply`, `selected_handler=null`, `route_reason=orientation_clarification_topic_change`, `executed_tools=[]`, `user_defense_cards=[]`.
- Correction attendue: une demande explicite "prépare une carte de défense" ou des champs défense dans un contexte de clarification active doivent être capturés par `prepare_defense_card`.
- Statut: `open`
- Fix reference: à faire
- Tests requis: positif explicite défense après clarification, multi-champs dans un tour, anti-faux-positif changement de sujet clair sort du flow.

### R1-B04 — Champs UI défense non canoniques exposés hors skill

- Tours: 3-4
- Famille: `BF-ROUTE-01` — mauvais owner sélectionné
- Domaine owner: routing vers skill propriétaire
- Source amont: `normal_reply` répond à un domaine qui doit appartenir à `prepare_defense_card`
- Symptôme visible: champ "promesse" demandé alors qu'il n'existe pas dans le catalogue field-aware défense.
- Preuve système: aucune sélection `prepare_defense_card`; réponse visible mentionne "promesse" aux tours 3 et 4.
- Correction attendue: seuls les champs issus de `platform_fields.ts` doivent être utilisés pour préparer une carte de défense; le normal reply ne doit pas fabriquer un formulaire produit.
- Statut: `open`
- Fix reference: à faire
- Tests requis: scan wording "promesse" absent en parcours défense, handoff contient destination + `entry_need/risk_moment/first_signal/defense_response`, pas de renderer déterministe.
