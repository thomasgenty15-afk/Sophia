# Bug Sheet - 2026-06-08-update-coach-preferences-local-write-r3

Rapport associe: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-update-coach-preferences-local-write-r3.md`

## R3-B01

- Tours: 2
- Famille: `BF-ROUTE-01` - mauvais owner selectionne
- Domaine owner: dispatcher global / status routing
- Source amont: arbitration entre `normal_reply` et `status_recap` pour demandes explicites de recap d'etat
- Symptome visible: Sophia repond au status des preferences coach, mais sans owner `status_recap`.
- Preuve systeme: `response_owner=normal_reply`, `selected_handler=null`, `route_reason=normal_reply_default`, `executed_tools=[]`, `durable_effect=[]`.
- Correction attendue: une demande explicite de preferences/actions/cartes/potions actives doit router vers `status_recap`, avec contexte DB complet; `normal_reply` ne doit pas gagner ce signal.
- Statut: `open`
- Fix reference: n/a
- Tests requis: status explicite preferences coach; status explicite cartes/potions/actions; paraphrase dubitative ("je ne sais plus ce que j'ai comme..."); anti-faux-positif pour simple conversation non-status.

## R3-B02

- Tours: 3
- Famille: `BF-ROUTE-01` - mauvais owner selectionne; secondaire `BF-LEDGER-01` - claim sans commit
- Domaine owner: dispatcher global + final response/effect claim guard
- Source amont: classification des demandes durables de style coach non supportees
- Symptome visible: Sophia promet "A partir de maintenant, je ne finirai pas mes messages par une question" alors que cette preference n'est pas supportee durablement et qu'aucun write n'a eu lieu.
- Preuve systeme: `response_owner=normal_reply`, `selected_handler=null`, `executed_tools=[]`, `durable_effect=[]`; DB inchangee.
- Correction attendue: router vers `update_coach_preferences`; le local dispatcher/reducer doit classer `unsupported_preference` ou `propose_supported_mapping`; aucune phrase visible ne doit claim un stockage durable sans commit.
- Statut: `open`
- Fix reference: n/a
- Tests requis: "ne termine jamais par une question", "pas d'emoji et trois lignes", demande conditionnelle cachee; verifier no-write, no executedTools, no durable claim; variante avec mapping propose vers `coach.question_tendency=low` et confirmation requise.

## R3-B03

- Tours: 5
- Famille: `BF-ROUTE-02` - ancien flow capture une nouvelle intention; secondaire `BF-LEDGER-01` - claim sans commit
- Domaine owner: `product_help` active-flow policy + global dispatcher reprise
- Source amont: sortie de `product_help` quand le user passe d'une explication produit a une mutation durable
- Symptome visible: apres une explication produit, Sophia dit "Je note" pour augmenter le challenge mais renvoie au Dashboard; la DB reste `coach.challenge_level=balanced`.
- Preuve systeme: `response_owner=product_help`, `selected_handler=product_help`, `route_reason=active_product_help_local_dispatcher_continue`, `executed_tools=[]`, `durable_effect=[]`.
- Correction attendue: `product_help` doit emettre un signal de sortie structure avec memo quand une intention mutante apparait; le dispatcher global doit reprendre et selectionner `update_coach_preferences`; le wording "Dashboard" ne doit pas etre le chemin nominal pour une preference supportee.
- Statut: `open`
- Fix reference: n/a
- Tests requis: explication product_help -> "ok applique/met/note X pour la suite"; verifier owner `update_coach_preferences`, commit DB, `executedTools=["update_coach_preferences"]`; anti-faux-positif pour questions produit de suivi sans mutation.

## R3-B04

- Tours: 4 / coverage gap
- Famille: `BF-TEST-01` - trace/test incomplet ou suite malsaine
- Domaine owner: QA coverage
- Source amont: le run n'a pas pu verifier `product_help` ou `status_recap` inline depuis un flow actif `update_coach_preferences`, car le Tour 3 n'a pas cree de flow actif.
- Symptome visible: n/a pour l'utilisateur; couverture incomplete du contrat inline subskill.
- Preuve systeme: Tour 4 route `product_help` direct avec `selected_handler=product_help`, `subskill_run=null`.
- Correction attendue: apres correction R3-B02, relancer une variante qui cree un flow actif `update_coach_preferences` puis pose une question d'explication/status dans ce flow; verifier que le global dispatcher est skippe et que `subskill_run.skill_id` vaut `product_help` ou `status_recap`.
- Statut: `open`
- Fix reference: n/a
- Tests requis: active `update_coach_preferences` proposed/clarification state -> product_help inline -> retour au meme flow -> status_recap inline -> confirmation/cancel correct.
