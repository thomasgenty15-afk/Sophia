# Bug Sheet - prepare_defense_card Local Doctrine R3 Invalid

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, persona `alex`, tentative `prepare-defense-local-doctrine-r3`. Aucun fallback utilise. Cleanup cible effectue.

## R3-B01

- Bug id: `R3-B01`
- Tours: T1
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: QA local runtime / Edge Function local
- Source amont: `/functions/v1/test-send-message` retourne 502 avant trace Sophia exploitable
- Symptome visible: reponse vide, body `{"message":"An invalid response was received from the upstream server"}`
- Preuve systeme: `status=502`, `response_owner=null`, `selected_handler=null`, `route_reason=null`; `supabase_edge_runtime_Sophia_2` observe `Up 4 seconds` juste apres l'appel; logs recents sans stack exploitable.
- Correction attendue: stabiliser le runtime local ou recuperer la stack de crash; ne pas conclure sur un fallback; relancer un nouveau run QA propre apres retour HTTP 200.
- Statut: `open`
- Fix reference: a definir
- Tests requis: health check IA reel local HTTP 200 avec trace, puis rerun complet `prepare_defense_card` couvrant premier tour proposed, confirmation, revision, apply_attempt et exit global vers attack.
