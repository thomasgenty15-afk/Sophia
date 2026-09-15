# Bug Sheet - coaching_ui_grounding_20260623_r1

## R1-B01

- Tours: T4
- Famille: `BF-INTAKE-01`
- Domaine owner: `coaching_recommendation`
- Source amont: intake/local reducer de destination produit action du Plan
- Symptome visible: le user demande "ou je prepare", Sophia redemande "preparer ou retrouver".
- Preuve systeme: T4 `response_owner=coaching_recommendation`, `route_reason=active_coaching_recommendation`; message user contient explicitement "Ou je prepare sa carte d'attaque ?".
- Correction attendue: stabiliser `prepare` comme destination demandee quand le dernier message le fournit; ne clarifier que si le dernier message ne distingue pas preparer/retrouver.
- Statut: `open`
- Fix reference: none
- Tests requis: actif no-plan -> question "ou je prepare" pour action du Plan -> reponse destination Plan sans clarification; paraphrase "ou je la lance"; anti-faux-positif "je ne sais pas si je veux preparer ou retrouver".

## R1-B02

- Tours: T5
- Famille: `BF-STATE-01`
- Domaine owner: `coaching_recommendation`
- Source amont: reducer/state merge de correction explicite no-plan -> plan action
- Symptome visible: apres correction vers "action de mon plan envoyer le dossier mutuelle", Sophia revient a "action hors plan" et "mail".
- Preuve systeme: T5 visible dit "pour une action hors plan" et "ton mail"; T4 avait etabli "action de mon plan envoyer le dossier mutuelle".
- Correction attendue: une correction explicite de cible doit remplacer `difficulty`, `coaching_type`, `recommendation_decision`, `step_context` et purger les references visibles a l'ancien no-plan target.
- Statut: `open`
- Fix reference: none
- Tests requis: no-plan active -> correction claire vers plan action -> prochain tour ne mentionne pas l'ancien target; correction vers new no-plan target; correction vers emotional target.

## R1-B03

- Tours: T6 / DB snapshot
- Famille: `BF-STATE-01`
- Domaine owner: `coaching_recommendation`
- Source amont: evidence/state merge apres changement vers emotional coaching
- Symptome visible: pas d'impact visible au T6, mais state DB garde `coaching_type_evidence` du vieux mail hors plan.
- Preuve systeme: `db-snapshot.json` montre `coaching_type=emotional` avec `coaching_type_evidence=["User asks to get unstuck on a concrete non-plan action..."]`.
- Correction attendue: evidence scoped par coaching_type ou remplacee lors d'un changement explicite de type.
- Statut: `open`
- Fix reference: none
- Tests requis: switch no-plan -> emotional purge/scoping evidence; switch plan -> emotional; switch emotional -> action.

## R1-B04

- Tours: T1-T6
- Famille: `BF-TEST-01`
- Domaine owner: trace persistence / test endpoint observability
- Source amont: `/test-send-message` renvoie des traces courtes dans les raw endpoint, mais ne persiste aucune ligne `conversation_turn_traces`.
- Symptome visible: aucun impact user direct; diagnostic DB incomplet.
- Preuve systeme: DB snapshot `traces_by_user=0`, `traces_by_turn=0`, alors que les summaries contiennent `response_owner`, `route_reason`, `active_flow_arbitration`.
- Correction attendue: persister les traces pour les runs locaux force_full_ai ou documenter une source canonique persistente alternative exploitable.
- Statut: `open`
- Fix reference: none
- Tests requis: run force_full_ai local -> `conversation_turn_traces` contient tous les turn_ids; active local flow turn trace persistente; direct-effect turn trace persistente.
