# Bug Sheet — Multi-Intent Reminder Smoke Runs

## R2-B01

- Tours: Tour 2 — `clarification-multi-intent-smoke-20260603-r2-paraphrase`
- Famille: `BF-INTAKE-02` — Extraction trop large ou polluee
- Domaine owner: one-shot reminder intake / direct effect payload compiler
- Source amont: extraction du contenu rappel dans un message composite avec connecteur `puis juste après`
- Symptome visible: Sophia confirme le rappel et garde la suite dans le transcript, mais le rappel durable porte la carte d'attaque.
- Preuve systeme: `scheduled_checkins[0].event_context=one_shot_reminder:attaque_pour_mon_action` au lieu de `boire_mon_traitement`.
- Correction attendue: borner le payload rappel avant le segment de suite `puis juste après je veux préparer...`, sans utiliser cette regex pour router la deuxième intention.
- Statut: `fixed_verified`
- Fix reference: bornage discursif générique dans `one_shot_reminder/instruction_parser.ts`
- Preuve de verification: run `clarification-corrections-20260603-r1-reminder-paraphrase`, `event_context=one_shot_reminder:boire_mon_traitement`.
- Tests requis: run réel R2 ; test unitaire instruction parser sur `puis juste après`; anti-faux-positif R3 où “attaquer” appartient réellement au rappel.

## R1R2-B02

- Tours: Tour 1 et Tour 2 — `clarification-multi-intent-smoke-20260603-r1-exact`, `clarification-multi-intent-smoke-20260603-r2-paraphrase`
- Famille: `BF-AGENDA-01` — Multi-intention incomplete
- Domaine owner: dispatcher composite coverage / TurnAgenda
- Source amont: second intent non représenté dans `tool_skill_intents` ou `platform_handoff`
- Symptome visible: Sophia garde la suite via fallback générique, mais ne pose pas encore la question métier dédiée de carte d'attaque.
- Preuve systeme: `tool_skill_intents=[]`, `turnAgenda` sans `prepare_attack_card`, malgré message contenant une deuxième demande explicite.
- Correction attendue: produire une tâche agenda non-mutante quand le dispatcher LLM identifie un second intent explicite ; garder le fallback générique uniquement si aucun signal structuré n'existe.
- Statut: `partial_fix_yellow`
- Fix reference: fallback post-opération segment non couvert
- Tests requis: run réel exact, paraphrase, anti-faux-positif rappel seul, et cas avec second intent structuré.

## R2-B03

- Tours: `clarification-corrections-20260603-r2-attack-defense`
- Famille: `BF-AGENDA-01` — Multi-intention incomplete
- Domaine owner: dispatcher clarification / TurnAgenda
- Source amont: deux tool_skill_intents platform compatibles `prepare_defense_card` + `prepare_attack_card`
- Symptome visible: aucun; le run réel pose une clarification de priorité.
- Preuve systeme: `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, `executed_tools=[]`, `__clarification_state_v1.candidates=[prepare_defense_card, prepare_attack_card]`, `no_chat_mutation=true`.
- Correction attendue: conserver ce comportement.
- Statut: `fixed_verified`
- Fix reference: conservation du pair attack/defense dans `selectDominantToolSkillIntent` + few-shot dispatcher s25
- Tests requis: dispatcher sanitizer, candidate builder, arbitrator, run réel attack+defense.
