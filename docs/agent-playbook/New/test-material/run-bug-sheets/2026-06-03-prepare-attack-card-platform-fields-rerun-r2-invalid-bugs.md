# Prepare Attack Card Platform Fields Rerun R2 Invalid - Bug Sheet

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, run `attack-card-fields-20260603-r2`. Aucun fallback deterministe. Aucun changement de code pendant la tentative.

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-prepare-attack-card-platform-fields-rerun-r2-invalid.md`

## Bugs

### PAC-FIELDS-RERUN-R2-B01

- Bug id: `PAC-FIELDS-RERUN-R2-B01`
- Tours: Tour 1, Tour 1 Retry
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: environnement QA local / Supabase Edge runtime
- Source amont: runtime Edge local absent ou arrete pendant le POST `/functions/v1/test-send-message`
- Symptome visible: `502 Bad Gateway` avec `An invalid response was received from the upstream server`; aucune reponse Sophia.
- Preuve systeme: `docker ps` ne liste pas `supabase_edge_runtime_Sophia_2`; DB montre uniquement deux messages user dans les scopes QA; `user_attack_cards=[]`.
- Correction attendue: restaurer le runtime Edge local, sans reset DB destructif, puis relancer le meme scenario reel.
- Statut: `open`
- Fix reference:
- Tests requis: check runtime Edge actif; POST local `/functions/v1/test-send-message` avec `force_full_ai=true`; rerun `prepare_attack_card` apres restauration.

## Verifications Vertes

| Scenario | Preuve | Statut |
| --- | --- | --- |
| Pas de fallback deterministe | Aucun renderer/test unitaire substitue au run reel | green |
| Pas de mutation carte | `user_attack_cards=[]` pour l'utilisateur QA temporaire | green |
| Cleanup cible | Utilisateur Auth temporaire `66d36dbb-8872-4075-a0e7-bb6a8f76f1dd` supprime | green |
