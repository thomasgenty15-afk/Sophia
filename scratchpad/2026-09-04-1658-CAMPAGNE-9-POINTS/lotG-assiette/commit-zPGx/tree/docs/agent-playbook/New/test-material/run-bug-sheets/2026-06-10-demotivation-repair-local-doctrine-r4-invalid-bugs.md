# Bug Sheet — demotivation_repair local doctrine R4 invalid

## R4-B01

- Bug id: R4-B01
- Tours: pre-run
- Famille: BF-TEST-01 — Trace/test incoherent ou suite malsaine
- Domaine owner: infra QA locale / Supabase Auth local
- Source amont: Auth local ne peut pas joindre la DB Postgres locale
- Symptome visible: aucun tour Sophia ne peut etre lance; creation de connexion temporaire et login existant echouent avant `/functions/v1/test-send-message`.
- Preuve systeme: creation temporaire via script bloquee sur `supabase status`; creation ciblee echoue avec `Database error checking email`; login existant echoue avec `error finding refresh token` et `dial tcp ... connect: no route to host`.
- Correction attendue: retablir l'environnement Supabase local/Auth/DB avant de relancer le run; ne pas declarer le flow `demotivation_repair` vert ou rouge sur cette tentative invalide.
- Statut: open
- Tests requis:
  - preflight: `qa-create-run-connection` cree une connexion temporaire;
  - preflight: login refresh/password obtient un JWT verifie sans afficher le token;
  - real QA: relancer R4 avec `/functions/v1/test-send-message`, `force_full_ai=true`.
