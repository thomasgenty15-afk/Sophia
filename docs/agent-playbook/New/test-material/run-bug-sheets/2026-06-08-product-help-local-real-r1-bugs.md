# Bug Sheet - 2026-06-08-product-help-local-real-r1

Run report:
`docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-product-help-local-real-r1.md`

## R1-B01

- Bug id: `R1-B01`
- Tours: Tour 1
- Famille: `BF-ROUTE-03` - Product/status/tool mal priorises
- Domaine owner: dispatcher / orientation clarification / product-help route arbitration
- Source amont: priorisation entre question produit explicative et intention potentielle de tool flow
- Symptome visible: Sophia demande "comprendre ou préparer ?" alors que le user demande "ça sert à quoi ?"
- Preuve systeme: `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, `route_reason=clarification_required`, aucun effet durable
- Correction attendue: router directement vers `product_help` quand le message courant exprime une question produit explicative claire, meme si la feature a un bridge operationnel
- Statut: `open`
- Fix reference: n/a
- Tests requis: question produit directe avec paraphrases "ça sert à quoi", "je veux comprendre", "explique-moi"; anti-FP demande explicite "prépare-moi une carte"

## R1-B02

- Bug id: `R1-B02`
- Tours: Tour 3
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: `/functions/v1/test-send-message`, sophia-brain runtime, active product_help follow-up observability
- Source amont: erreur upstream sans `conversation_turn_trace` pendant follow-up d'un `product_help` standalone actif
- Symptome visible: reponse HTTP 502 avec texte `An invalid response was received from the upstream server`
- Preuve systeme: retry du meme message produit le meme HTTP 502; trace courte vide; aucun `response_owner`, `selected_handler`, `trace_error`
- Correction attendue: produire un envelope d'erreur QA exploitable avec `trace_error` ou log runtime corrélé au `x-request-id`, puis corriger la cause de crash/invalid response sur follow-up actif
- Statut: `open`
- Fix reference: n/a
- Tests requis: run reel follow-up `answer_destination` apres `product_help` standalone actif; invariant `response_owner=product_help`, `product_flow_action=answer_destination`, aucun global dispatcher, aucun effet durable

