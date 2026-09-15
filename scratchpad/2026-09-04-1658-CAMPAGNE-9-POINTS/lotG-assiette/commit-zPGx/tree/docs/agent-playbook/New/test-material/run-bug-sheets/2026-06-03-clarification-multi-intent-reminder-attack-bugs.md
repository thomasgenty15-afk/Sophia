# Bug Sheet — Multi-Intent Reminder + Attack Card

## R1-B01

- Tours: Tour 1 — `clarification-multi-intent-reminder-attack-20260603-r2`
- Famille: `BF-AGENDA-01` — Multi-intention incomplete
- Domaine owner: TurnAgenda / central arbitrator
- Source amont: agenda composite avant sélection finale handler
- Symptome visible: Sophia confirme seulement le rappel et ignore la demande de carte d'attaque.
- Preuve systeme initiale: `selected_handler=create_one_shot_reminder`, `executed_tools=["create_one_shot_reminder"]`, aucun `prepare_attack_card`, aucun `orientation_clarification`.
- Preuve systeme postfix R7: le transcript garde la suite via fallback post-opération, mais `tool_skill_intents=[]` et aucun `platform_handoff` agenda.
- Correction attendue: représenter et traiter les deux intentions structurées, ou clarifier/séquencer explicitement quand le runtime ne peut pas enchaîner.
- Statut: `partial_fix_yellow`
- Fix reference: `dispatcher_v2_prompt_2026_06_s24_composite_repair`, fallback post-opération segment non couvert
- Tests requis: run IA réel rappel + carte attaque, paraphrase avec fautes, anti-faux-positif rappel seul et carte seule, reprise agenda structurée quand `prepare_attack_card` est présent.

## R1-B02

- Tours: Tour 1 — `clarification-multi-intent-reminder-attack-20260603-r2`
- Famille: `BF-INTAKE-02` — Extraction trop large ou polluee
- Domaine owner: one-shot reminder intake / direct effect payload compiler
- Source amont: extraction du contenu rappel dans un message composite
- Symptome visible: Sophia programme un rappel sans préciser le contenu ; DB montre `event_context=one_shot_reminder:attaque`.
- Preuve systeme: scheduled checkin avant cleanup avec `scheduled_for=2026-06-03T13:28:00+00:00` et `event_context=one_shot_reminder:attaque`.
- Correction attendue: borner le payload rappel au segment “prendre mes médicaments” et ne jamais absorber le second intent tool.
- Statut: `fixed_verified_postfix_r7`
- Fix reference: one-shot reminder intake `stripSideIntentContinuation`
- Preuve de verification: run `clarification-multi-intent-reminder-attack-20260603-postfix-r7`, DB avant cleanup `event_context=one_shot_reminder:prendr_mes_medicaments`, `scheduled_for=2026-06-03T13:28:00+00:00`.
- Tests requis: extraction rappel “prendre mes médicaments” dans message composite ; anti-faux-positif où “attaque” appartient réellement au texte du rappel.
