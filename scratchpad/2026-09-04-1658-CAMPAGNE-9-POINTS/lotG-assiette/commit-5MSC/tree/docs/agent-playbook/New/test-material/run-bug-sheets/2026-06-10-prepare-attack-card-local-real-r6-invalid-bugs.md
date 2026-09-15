# Bug Sheet - prepare_attack_card local dispatcher r6 invalid

## R6-B01

- Bug id: `R6-B01`
- Tours: Tour 0
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: environnement QA local Supabase/Auth
- Source amont: generation JWT locale et connectivite Auth -> DB
- Symptome visible: aucun test conversationnel Sophia ne peut demarrer.
- Preuve systeme: creation de connexion `prepare_attack_local_20260610_r6` bloquee sans fichier produit; `scripts/get-jwt.sh qa-skill all_skills` echoue avec `unexpected_failure` et `dial tcp 172.18.0.7:5432: connect: no route to host`; `GET /auth/v1/settings` repond `200`; `supabase status --output json` reste bloque.
- Correction attendue: restaurer l'environnement local Supabase/Auth sans reset DB destructif, puis relancer un run reel avec connexion temporaire.
- Statut: `open`
- Fix reference: a definir
- Tests requis:
  - positif: `scripts/qa-create-run-connection.sh qa-skill all_skills <run_id>` termine avec un fichier connexion;
  - positif: `scripts/get-jwt.sh qa-skill <connection>` retourne un token non affiche;
  - integration: premier `POST /functions/v1/test-send-message` avec `force_full_ai=true` retourne une reponse Sophia exploitable;
  - anti-faux-positif: ne pas conclure sur `prepare_attack_card` tant que le run n'atteint pas le dispatcher.
