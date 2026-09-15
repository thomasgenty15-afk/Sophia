# Bug Sheet — defense-ui-fields-r1c

## Contexte

- Date: 2026-06-02
- Run: `defense-ui-fields-r1c`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-defense-ui-fields-r1c.md`
- Scope DB: `qa-prepare-defense-card-alex-2026-06-02-defense-ui-fields-r1c`
- Statut global: red

## Bugs

### R1-B01

- Tours: 1, 2
- Famille: `BF-EFFECT-04` — Executor ou fallback technique fragile
- Domaine owner: `prepare_defense_card`
- Source amont: `prepare_defense_card/ai_intake`, validation/réparation de sortie structurée
- Symptome visible: Sophia répond deux fois qu'elle n'arrive pas à préparer la carte, au lieu de produire les champs UI.
- Preuve systeme: `tool_skill_run.status=technical_blocked`, `reason_code=invalid_ai_output`, `executed_tools=[]`, `committed_effects=[]`, `user_defense_cards=0`.
- Correction attendue: rendre la sortie IA robuste pour produire `platform_fields` ou une clarification ciblée; ne pas tomber en échec générique quand le message contient déjà moment/piège/geste/plan B.
- Statut: fixed
- Fix reference: `supabase/functions/sophia-brain/tools/operations/prepare_defense_card/router.ts`, `supabase/functions/sophia-brain/tools/operations/prepare_defense_card/ai_intake.ts`, tests `prepare_defense_card router seeds fresh intake from TurnFrame structured intent` et `prepare_defense_card AI flow asks a deterministic clarification when AI omits the question`, chantiers-log `J75`.
- Tests requis: demande libre no-create, reprise avec champs explicites, paraphrase, anti-faux-positif attaque/défense, apply_attempt sans mutation DB. À passer en `verified` après rerun QA réel.
