# Run Bug Sheet - product-help-adjust-observability-20260613-r1

## R1-B01

- Bug id: R1-B01
- Tours: T1
- Famille: BF-ROUTE-03 - Product/status/tool mal priorises
- Domaine owner: `product_help`
- Source amont: surface/product bridge selection for Plan action adjustment
- Symptome visible: Sophia explique une action de Plan trop floue via Carte d'attaque alors que l'utilisateur demande le principe pour transformer une action existante sans modifier le reste.
- Preuve systeme: T1 visible answer conseille "comme une Carte d'attaque"; T2 montre que la trajectoire operationnelle correcte est `adjust_plan_item`.
- Correction attendue: Product Help doit prioriser Ajuster mon plan / `adjust_plan_item` pour les demandes de modification ou concretion d'une action existante, et reserver Carte d'attaque aux demandes de demarrage/passage a l'action.
- Statut: open
- Fix reference: none
- Tests requis: Product Help informatif Plan vague -> Adjust Plan surface; Product Help operationnel -> `adjust_plan_item.local_dispatcher`; anti-faux-positif explicite Carte d'attaque -> `prepare_attack_card`.

## R1-B02

- Bug id: R1-B02
- Tours: T1
- Famille: BF-TEST-01 - Trace/test incoherent ou suite malsaine
- Domaine owner: LLM observability / `test-send-message` trace propagation
- Source amont: request id / turn id consistency for first Product Help turn
- Symptome visible: le fichier `t01.json` contient `request_id=f294274b-7837-4e25-ad59-d9d1ae96fc80`, pas `product-help-adjust-observability-20260613-r1-t01`; les traces existent donc sous le turn id genere, pas sous le request id QA attendu.
- Preuve systeme: sous `f294274b-7837-4e25-ad59-d9d1ae96fc80`, DB => 2 raw events, 1 usage event, 12 runtime events; sous `product-help-adjust-observability-20260613-r1-t01`, DB => 0.
- Correction attendue: stabiliser la convention d'identifiant exposee par `test-send-message`: soit propager le request id QA fourni jusqu'aux traces, soit retourner explicitement `trace_request_id` / `turn_id` pour que les runs sachent quel id interroger.
- Statut: open
- Fix reference: none
- Tests requis: run Product Help premier tour avec request id unique; assert que le response id permet de retrouver runtime/raw/usage; assert raw LLM events presents pour les appels IA; assert erreur provider stockee si provider echoue.
