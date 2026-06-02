# Bug Sheet - update_coach_preferences natural handoff invalid

## Bugs

### R1-B01

- Tours: setup / pre-run
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: testability / environnement local QA
- Source amont: Supabase local ou Docker daemon indisponible
- Symptome visible: impossible de demarrer un run IA reel ; endpoint local `/functions/v1/test-send-message` timeout sans reponse.
- Preuve systeme: `curl --max-time 8 -sS -i http://127.0.0.1:54321/functions/v1/test-send-message` -> timeout apres 8 secondes, `0 bytes received`; `supabase status`, `docker ps` et `supabase start` sont restes bloques.
- Correction attendue: retablir l'infrastructure locale avant tout nouveau run ; ne pas remplacer par renderer deterministe, fallback direct ou staging.
- Statut: `open`
- Fix reference: n/a
- Tests requis: ping local HTTP avant `init`; run via `/functions/v1/test-send-message` avec `force_full_ai=true`; capture des traces courtes a chaque tour.
