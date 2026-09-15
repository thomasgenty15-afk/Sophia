# Bug Sheet — 2026-06-16 Human System 15t Post Compact Exit R1

Run: `qa-human-system-15t-post-compact-exit-20260616-r1`  
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-16-human-system-15t-post-compact-exit-r1.md`

## R1-B01 — Status recap restitue trop large et altere le libelle rappel

- Tours: T6
- Famille: `BF-STATUS-01` — projection DB mal lue
- Domaine owner: `status_recap`
- Source amont: projection/restitution status recap
- Symptome visible: Sophia inclut les actions actives seedées dans "ce qui a vraiment ete cree ou note depuis le debut" et affiche `rrouvrir le dossier`.
- Preuve systeme: `selected_handler=status_recap`; DB `scheduled_checkins.message_payload.reminder_instruction=rouvrir le dossier`; reponse visible `rrouvrir le dossier`.
- Correction attendue: status recap doit separer "objets actifs disponibles" et "effets crees/notes pendant cet echange"; le libelle rappel doit etre repris depuis `reminder_instruction` ou `event_grounding` sans mutation.
- Statut: `open`
- Fix reference: none
- Tests requis: recap "depuis le debut" avec rappel + plan seedé; verifier que seuls les effets conversationnels sont classes comme crees/notes, et que le libelle rappel reste exact.

## R1-B02 — Preference question low appliquee trop faiblement

- Tours: T7
- Famille: `BF-PREF-01` — preference non appliquee runtime
- Domaine owner: normal reply / companion
- Source amont: question rhythm policy et prompt visible normal reply
- Symptome visible: apres une preference explicite "moins de questions", Sophia ajoute une option finale non necessaire.
- Preuve systeme: T5 `update_coach_preferences`; `user_chat_states.temp_memory.companion_question_rhythm.preference=low`; T7 reponse finit par "Si tu veux...".
- Correction attendue: quand la demande est satisfaite et que `question_tendency=low`, eviter les questions/propositions optionnelles sauf besoin reel de clarification.
- Statut: `open`
- Fix reference: none
- Tests requis: preference low puis demande de formulation simple; la reponse doit s'arreter apres la formulation.

## R1-B03 — Defense compact intake redemande un slot au lieu de proposer

- Tours: T11-T12
- Famille: `BF-INTAKE-01` — slot fourni mais redemande; `BF-INTAKE-03` — contrainte explicite perdue
- Domaine owner: `prepare_defense_card`
- Source amont: local dispatcher/reducer et visible agent
- Symptome visible: user demande une carte de defense courte et fournit moment + action; Sophia demande "interrompre quoi". Au tour suivant, elle prepare les champs mais conserve une question template.
- Preuve systeme: T11 `selected_handler=prepare_defense_card`, visible `ask_defense_goal_or_response`; T12 `active_prepare_defense_card_local_dispatcher`, visible `handoff_ready`, mais reponse contient encore "Avec quelle situation... ?".
- Correction attendue: local dispatcher doit produire un mode structurel `compact_intake` avec slots verrouilles/inferes; visible agent doit rendre une validation compacte et ne pas reutiliser la question canonique.
- Statut: `open`
- Fix reference: none
- Tests requis: defense "carte courte + si envie revient apres diner + je prends un the/quitte cuisine/canape" -> proposition/validation sans question; paraphrases; anti-faux-positif pour demande vague.

## R1-B04 — Attack compact intake ignore les infos et repete la question

- Tours: T13-T14
- Famille: `BF-INTAKE-01` — slot fourni mais redemande
- Domaine owner: `prepare_attack_card`
- Source amont: local dispatcher/reducer et visible action selection
- Symptome visible: user demande une carte d'attaque courte avec technique et action cible; Sophia demande le blocker. Quand le user repond "juste avant d'ouvrir le fichier" et demande de ne plus poser de detail, Sophia repete la meme question.
- Preuve systeme: T13 `prepare_attack_card.visible.ask_blocker`; T14 `active_prepare_attack_card_local_dispatcher` puis `visible.ask_blocker` a nouveau.
- Correction attendue: compact attack doit reconnaitre technique + action cible + moment fourni/inferable, remplir le slot blocker depuis le dernier message, puis choisir `confirm_platform_field_proposal` ou `handoff_ready`.
- Statut: `open`
- Fix reference: none
- Tests requis: attaque compact premier tour; attaque active avec reponse au slot + refus de questions; verifier absence de repetition et absence de creation durable sans confirmation si la flow exige confirmation.

## R1-B05 — Semantique de `blocked_paths` ambigue quand un effet est admis

- Tours: T4, warning recurrent faible
- Famille: `BF-TEST-01` — trace/test incoherent ou suite malsaine
- Domaine owner: route decision / trace mapping
- Source amont: construction finale `RouteDecision.blocked_paths`
- Symptome visible: aucun symptome user.
- Preuve systeme: T4 `response_owner=tool_skill`, `direct_effects_to_run=create_one_shot_reminder`, mais `blocked_paths=[{path:"tool_skill_flow", reason_code:"central_arbitrator_one_shot_reminder_structured_effect"}]`.
- Correction attendue: `blocked_paths` doit seulement representer des chemins refuses; les admissions centrales doivent etre tracees ailleurs (`admitted_paths`, `route_notes`, ou `decision_reasons`).
- Statut: `open`
- Fix reference: none
- Tests requis: demande rappel explicite -> effet admis et `blocked_paths=[]`; opportunite bloquee par normal reply -> `blocked_paths` renseigne le chemin refuse.
