# Bug Sheet - normal-conversation-15t-20260613-r5-context-policy

## Run

- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-13-normal-conversation-15t-r5-context-policy.md`
- Raw state: `tmp/qa-normal-conversation/normal-conversation-15t-20260613-r5-context-policy/state.json`
- Verdict: red

## Bugs

### R5-B01

- Tours: T8
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: `prepare_attack_card`
- Source amont: local dispatcher / inline status bridge pendant active flow
- Symptome visible: Sophia répond "Je n'arrive pas à répondre..." à une question simple "qu'est-ce qui a été créé ou pas".
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=prepare_attack_card`, `route_reason=active_prepare_attack_card_local_dispatcher`, `tool_execution=none`.
- Correction attendue: quand une carte active reçoit une demande de statut/création réelle, déléguer proprement à `status_recap` ou répondre depuis le state/ledger local.
- Statut: open
- Fix reference: none
- Tests requis: carte active + question "créé ou pas"; paraphrase "est-ce enregistré"; anti-faux-positif sur vraie continuation carte.

### R5-B02

- Tours: T9, T12
- Famille: `BF-STATUS-01` - Projection DB mal lue / scope trop large
- Domaine owner: `status_recap`
- Source amont: read_scope / visible recap prompt
- Symptome visible: Sophia ajoute les préférences coach alors que le user demande seulement carte/rappel ou confirmation de non-modification durable.
- Preuve systeme: T9/T12 `selected_handler=status_recap`; réponse mentionne `Bienveillant ferme`, `Discipline / action`.
- Correction attendue: limiter le visible recap aux catégories demandées; ne pas restituer les defaults coach sauf demande explicite de préférences.
- Statut: open
- Fix reference: none
- Tests requis: status ciblé carte; status ciblé rappel; demande "uniquement X" ne mentionne pas Y.

### R5-B03

- Tours: T10
- Famille: `BF-LEDGER-02` - Commit reel mal rendu
- Domaine owner: direct effect final response / committed effect confirmation
- Source amont: final visible agent task for `create_one_shot_reminder`
- Symptome visible: confirmation du rappel donne l'heure mais pas le libellé complet.
- Preuve systeme: `executed_tools=[create_one_shot_reminder]`, `tool_execution=success`, scheduled_checkin pending; assistant "C'est programmé pour vendredi 22 mai à 10:25."
- Correction attendue: passer au visible owner final une tâche de confirmation incluant heure + libellé complet, sans agent dédié de confirmation.
- Statut: open
- Fix reference: none
- Tests requis: création rappel ponctuel avec libellé; réponse visible doit contenir heure et texte complet.

### R5-B04

- Tours: T11
- Famille: `BF-EFFECT-03` - Payload durable faux
- Domaine owner: one-shot reminder parser / payload compiler
- Source amont: extraction quote-delimited
- Symptome visible: apostrophe finale parasite dans le libellé: `rapport'`.
- Preuve systeme: status recap exact affiche `relire seulement la première page du rapport'`; `event_context=one_shot_reminder:relire_seulement_la_premiere_page_du_rapport`.
- Correction attendue: retirer uniquement le délimiteur final quand le texte est quote-delimited, tout en conservant les apostrophes internes.
- Statut: open
- Fix reference: none
- Tests requis: texte entre apostrophes; texte avec apostrophe interne; texte sans quotes.

### R5-B05

- Tours: T12, T13
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: `status_recap`
- Source amont: active local dispatcher lifecycle / exit policy
- Symptome visible: après un status recap, Sophia continue en `status_recap` et répond hors sujet à une question conversationnelle.
- Preuve systeme: T12/T13 `response_owner=tool_skill`, `selected_handler=status_recap`, `route_reason=active_status_recap_local_dispatcher`.
- Correction attendue: `status_recap` doit produire `exit_to_global_dispatcher` dès que le message courant n'est plus une demande de statut/projection/effect history.
- Statut: open
- Fix reference: none
- Tests requis: après status recap, instruction de posture ponctuelle; question normale; demande explicite "stop récap" doit sortir sans nécessiter une formulation dure.

### R5-B06

- Tours: T4
- Famille: `BF-INTAKE-06` - Mauvais domaine semantique / réponse skill trop générique
- Domaine owner: `demotivation_repair`
- Source amont: visible task / local skill response contract
- Symptome visible: entrée en repair cohérente mais réponse sans aide concrète ni question utile.
- Preuve systeme: T4 `selected_handler=demotivation_repair`, `route_reason=orientation_clarification_resolved_conversation_skill`.
- Correction attendue: pour "retrouver un peu d'élan sans grand plan", produire un recadrage court ou une question de friction concrète, pas seulement une promesse d'aide.
- Statut: open
- Fix reference: none
- Tests requis: demande d'élan courte; anti-faux-positif sur simple discussion sans demande d'aide.
