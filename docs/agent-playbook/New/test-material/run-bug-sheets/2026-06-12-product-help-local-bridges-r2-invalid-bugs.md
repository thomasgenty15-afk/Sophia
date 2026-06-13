# Bug Sheet - product-help-local-bridges-20260612-r2-invalid

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PH-LB-R2-B01` | R1-T1, R2-T1 | `BF-TEST-01` | Edge runtime local / `sophia-brain` testability | Boot de la fonction avant dispatcher | Sophia renvoie une reponse vide; aucun flow product_help observable | HTTP 503, raw `BOOT_ERROR`, `response_owner=null`, `selected_handler=null`, `executed_tools=[]`; auth user QA valide 200 sur R1 et R2 | Recuperer les logs du process local de functions serve, corriger l'erreur de boot, puis relancer un run IA reel local avec `force_full_ai=true`; ne pas utiliser fallback direct ou staging pour valider | `open` | Rapport `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-product-help-local-bridges-r2-invalid.md` | Positif: endpoint local repond 200 avec `response_owner` non nul; integration: T1 product_help explique sans effet; handoff: demande carte d'attaque atteint `prepare_attack_card` via contrat attendu; anti-FP: question produit `sans rien creer` ne declenche aucun tool |

## Notes De Run

- Deux users QA temporaires ont ete crees puis nettoyes.
- Aucun code n'a ete modifie pendant la demande de run.
- Aucun redemarrage Supabase n'a ete effectue.
- Ce bug ne classe pas le bridge product_help lui-meme: le runtime n'a jamais atteint le dispatcher local.
