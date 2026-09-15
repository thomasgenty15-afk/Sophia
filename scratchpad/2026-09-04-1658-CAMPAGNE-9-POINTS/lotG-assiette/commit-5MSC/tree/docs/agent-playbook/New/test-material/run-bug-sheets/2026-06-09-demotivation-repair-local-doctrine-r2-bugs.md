# Bug Sheet — demotivation_repair local doctrine R2

## R2-B01

- Bug id: R2-B01
- Tours: Tour 1, Tour 3
- Famille: BF-INTAKE-03 — Contrainte explicite perdue
- Domaine owner: `demotivation_repair`
- Source amont: `visible_task.conversation_context.max_questions` / visible prompt stage `restore_meaning`
- Symptome visible: Sophia pose une question alors que le contexte visible structure indique `max_questions=0`.
- Preuve systeme: T1 et T3 ont `visible_task=restore_meaning`, `conversation_context.max_questions=0`, `selected_candidate.potion=null`, `target_dispatcher=null`; les reponses visibles contiennent chacune une question.
- Correction attendue: si `max_questions=0`, le prompt visible ne doit pas poser de question. Si une question est necessaire, le dispatcher/reducer doit produire `max_questions=1`.
- Statut: verified
- Fix reference: `supabase/functions/sophia-brain/skills/demotivation_repair/local_flow.ts` aligne `max_questions=1` pour une clarification `restore_meaning` utile, sauf contrainte `no_questions`; `visible_agent.ts` interdit strictement les questions quand `conversation_context.max_questions=0`.
- Verification reference: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-10-demotivation-repair-local-doctrine-r3.md` confirme en run IA reel que les questions visibles de `restore_meaning` sortent avec `conversation_context.max_questions=1`, et que `max_questions=0` ne pose pas de question.
- Tests requis:
  - unit/contract: visible restore_meaning avec `max_questions=0` ne produit pas de question; ajoute dans `demotivation_repair visible prompt strictly obeys max_questions`;
  - unit/contract: dispatcher restore_meaning avec question voulue produit `max_questions=1`; ajoute dans `demotivation_repair restore meaning clarification allows one question`;
  - real QA: demotivation repair continue sans potion prematuree et sans question quand `max_questions=0`.
