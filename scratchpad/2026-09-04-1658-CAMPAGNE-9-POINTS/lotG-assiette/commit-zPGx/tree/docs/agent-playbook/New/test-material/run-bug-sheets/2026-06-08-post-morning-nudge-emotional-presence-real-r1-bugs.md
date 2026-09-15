# Bug Sheet - post_morning_nudge.emotional_presence Real QA R1

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, connexion QA temporaire `qa-skill`, run `pmnep-real-r1`.

Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-post-morning-nudge-emotional-presence-real-r1.md`

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Statut | Fix recommande | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PMNEP-R1-B01` | T4 | `BF-TEST-01` | test endpoint / gateway local / second pass global | `/functions/v1/test-send-message` apres sortie locale `post_morning_nudge` | Demande de potion claire, mais reponse Sophia vide et HTTP 502 | Body: `{"message":"An invalid response was received from the upstream server"}`; aucune trace DB T4; message user T4 logge; etat local `post_morning_nudge` vide apres incident; T5 reprise route vers `select_state_potion.clarte` | open | Stabiliser la seconde passe globale apres `post_morning_nudge_local_exit_to_global_dispatcher`; emettre une trace d'erreur exploitable si upstream echoue; eviter le user message orphelin sans diagnostic | Integration locale `force_full_ai=true`: active `post_morning_nudge.emotional_presence` + demande directe de potion -> global second pass `select_state_potion.clarte` HTTP 200 avec trace; variante erreur upstream -> trace diagnostiquee |

## Historique

| Date | Bug | Verification | Resultat | Artefacts |
| --- | --- | --- | --- | --- |
| 2026-06-08 | `PMNEP-R1-B01` | Run IA reel local `pmnep-real-r1` | Open: T4 502, reprise T5 valide | `tests/real-personas/qa-skill/runs/post_morning_nudge/2026-06-08-pmnep-real-r1.summary.json` |
