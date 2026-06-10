# Bug Sheet - emotional-repair-local-doctrine-r6-invalid

## Run

- Date: 2026-06-10
- Run id: `emotional-repair-local-doctrine-r6-invalid`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-10-emotional-repair-local-doctrine-r6-invalid.md`
- Verdict global: `red` technique, run invalide.

## Bugs

### R6-B01

- Tours: pre-run
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: environnement QA local / Supabase Auth local
- Source amont: Auth local ne peut plus joindre `supabase_db_Sophia_2`.
- Symptôme visible: aucun tour `/functions/v1/test-send-message` exploitable.
- Preuve système: login password `500 Database error querying schema`; refresh token `500 failed to connect to host=supabase_db_Sophia_2 ... no route to host`; creation Auth Admin `500 Database error checking email`.
- Correction attendue: remettre Supabase local/Auth DB en etat stable sans reset DB destructif; verifier `auth/v1/settings`, token password ou refresh, puis `/functions/v1/test-send-message`.
- Statut: `open`
- Fix reference: aucune correction applicative; blocage environnemental.
- Tests requis: relancer `emotional-repair-local-doctrine-r6` quand Auth local est stable.
