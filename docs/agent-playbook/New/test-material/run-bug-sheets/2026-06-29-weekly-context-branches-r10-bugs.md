# Weekly Context Branches R10 - Bug Sheet

## Run

- Date: 2026-06-29
- Run ids:
  - `weekly-qa-20260629-r10a-level-partial_habits_mission_partial`
  - `weekly-qa-20260629-r10b-nextweek-partial_habits_mission_partial`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-29-weekly-context-branches-r10.md`
- Verdict global: yellow

## Bugs

### R10-B01 - Slot experience globale deja fourni mais redemande

- Bug id: R10-B01
- Tours: Run A T1
- Famille: BF-INTAKE-01 - Slot fourni mais redemande
- Domaine owner: `weekly_adaptive_review_v1`
- Source amont: weekly dispatcher/gates de capture `week_experience_status`
- Symptome visible: Sophia redemande "qu’est-ce qui t’a le plus marqué" alors que le user a donne ressenti, causes et actions.
- Preuve systeme: Run A T1 `response_owner=weekly_adaptive_review_v1`; pas d'effet durable; reponse de clarification redondante.
- Correction attendue: capturer les signaux hebdomadaires explicites dans les gates weekly sans regex metier.
- Statut: open
- Fix reference: deja observe comme R9-B01, non corrige dans ce run.
- Tests requis: premiere reponse avec ressenti + cause + actions; paraphrase courte; anti-faux-positif reponse vague.

### R10-B02 - Recommandation visible alors que safe_to_surface=false

- Bug id: R10-B02
- Tours: Run B T3
- Famille: BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee
- Domaine owner: `weekly_adaptive_review_v1`
- Source amont: contrat `adjust_recommendation` entre dispatcher, reducer et visible guard
- Symptome visible: Sophia donne une "intention utile" a porter dans `Ajuster mon plan` alors que le champ structure est stocke en `candidate` avec `safe_to_surface=false`.
- Preuve systeme: DB Run B T3 `weekly_planning_context.mode=next_week_configured`, `adjust_recommendation.status=candidate`, `confidence=0.98`, `why=[]`, `safe_to_surface=false`, `surfaced_in_weekly=false`; reponse visible "l’intention utile est...".
- Correction attendue: si `safe_to_surface=false`, ne pas exposer le payload de recommandation au visible et ne pas router vers `weekly_adjust_recommendation`; soit remplir correctement `why` pour passer safe, soit rendre un constat factuel / demander precision.
- Statut: fixed_pending_real_run_verification
- Fix reference: `visible_agent.ts` filtre `adjust_recommendation` non-safe avant prompt visible; `local_flow.ts` refuse de promouvoir `weekly_adjust_recommendation` sans recommandation safe.
- Tests requis: `next_week_configured` candidate incomplet -> pas de reco visible; `next_week_configured` safe complet -> destination `Ajuster mon plan`; `next_level_required` safe complet -> destination `Validation du niveau`.

## Verifications Positives

### R9-B02 - Demande validation niveau avant cloture

- Statut: verified
- Preuve: Run A T3 rend la destination `Validation du niveau`; DB `safe_to_surface=true`, `target_scope=next_level_inputs`, puis Run A T4 cloture durable avec `validation_unlock=available`.

### R9-B03 - Flow completed encore routable

- Statut: verified
- Preuve: Run B T5 post-completion retourne `response_owner=normal_reply`, pas `weekly_adaptive_review_v1`.
