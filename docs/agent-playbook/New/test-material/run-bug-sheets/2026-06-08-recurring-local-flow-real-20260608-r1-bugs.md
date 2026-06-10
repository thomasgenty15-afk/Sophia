# Bug Sheet - recurring-local-flow-real-20260608-r1

## R1-B01

- Bug id: R1-B01
- Tours: 1
- Famille: BF-INTAKE-01 - Slot fourni mais redemande
- Domaine owner: `create_recurring_reminder`
- Source amont: local dispatcher destination / reducer safe default
- Symptome visible: Sophia demande plan courant vs base de vie pour une routine personnelle generaliste.
- Preuve systeme: T1 `selected_handler=create_recurring_reminder`, `tool_execution=platform_handoff`, `scheduled_checkins=[]`, state `collecting`.
- Correction attendue: appliquer le safe default `base_de_vie` quand le contenu est une routine personnelle non liee au plan.
- Statut: open
- Fix reference: none
- Tests requis: demande recurring complete generaliste -> handoff_ready sans question destination; contre-test plan/action explicite -> destination current_plan.

## R1-B02

- Bug id: R1-B02
- Tours: 3
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `create_recurring_reminder`
- Source amont: visible task `apply_attempt`
- Symptome visible: apres "programme-le", Sophia bloque correctement la mutation mais finit par "Est-ce que cela vous convient ?".
- Preuve systeme: T3 `route_reason=active_handoff_apply_attempt`, `executed_tools=[]`, `scheduled_checkins=[]`, state `repeat_handoff`.
- Correction attendue: rendre `apply_attempt` terminal et interdire toute question de confirmation/convenance.
- Statut: open
- Fix reference: none
- Tests requis: apply attempt active recurring -> no mutation, reponse non vide, pas de question finale.

## R1-B03

- Bug id: R1-B03
- Tours: 5-6
- Famille: BF-STATUS-01 - Projection DB mal lue
- Domaine owner: `status_recap` inline depuis `create_recurring_reminder`
- Source amont: inline `get_info_db` / projection DB / final response handling
- Symptome visible: question "combien de rappels recurrents actifs ?" produit HTTP 409 et reponse vide, puis retry idem.
- Preuve systeme: T5 local dispatcher `flow_action=get_info_db`, note_information `target_dispatcher=status_recap`; `executed_tools=[]`; `scheduled_checkins=[]`; T5-T6 `http_status=409`, assistant vide.
- Correction attendue: garantir une reponse status visible grounded pour zero rappel actif et conserver l'etat parent sans 409.
- Statut: open
- Fix reference: none
- Tests requis: active recurring + status count question -> inline `status_recap`, response non-empty, count zero correct, no durable effects, parent state preserved.
