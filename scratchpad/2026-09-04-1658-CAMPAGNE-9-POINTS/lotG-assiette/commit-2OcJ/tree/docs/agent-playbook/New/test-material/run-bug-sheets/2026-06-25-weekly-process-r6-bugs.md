# Weekly Process R6 - Bug Sheet

## Run

- Date: 2026-06-25
- Run id: `weekly-qa-20260625-r6-partial_habits_mission_partial`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-25-weekly-process-r6.md`
- Verdict global: yellow

## Bugs

### R6-B01 - Cloture weekly repete une recommandation deja surfacee

- Bug id: R6-B01
- Tours: T5
- Famille: BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee
- Domaine owner: `weekly_adaptive_review_v1`
- Source amont: prompt/rendering du visible task `weekly_closure` et contrat state -> visible output
- Symptome visible: apres que Sophia a deja donne l'intention d'ajustement au Tour 4, la cloture du Tour 5 repete "l'ajustement utile a envisager..." au lieu de simplement fermer le bilan.
- Preuve systeme: T4 `visible_task=weekly_adjust_recommendation`; DB apres T4 `adjust_recommendation.status=surfaced`, `safe_to_surface=true`, `surfaced_in_weekly=true`, `confidence=0.97`; T5 `visible_task=weekly_closure`, final DB `closure_status=complete`, mais reponse visible repete la recommandation.
- Correction attendue: quand `weekly_closure` est rendu avec `adjust_recommendation.surfaced_in_weekly=true`, la reponse doit etre une cloture courte sans nouvelle reformulation de la recommandation ni recap hebdo.
- Statut: fixed
- Fix reference: `supabase/functions/sophia-brain/skills/weekly_review/visible_agent.ts`, `supabase/functions/sophia-brain/skills/weekly_review/visible_agents.ts`, test `weekly closure forbids repeating already surfaced adjust recommendation`
- Tests requis: test reducer/prompt qui injecte `synthesis_visible_status=rendered` + `adjust_recommendation.surfaced_in_weekly=true`; run IA reel paraphrase ou le user demande "cloture maintenant" apres une recommandation; invariant visible: pas de repetition de l'intention d'ajustement.
