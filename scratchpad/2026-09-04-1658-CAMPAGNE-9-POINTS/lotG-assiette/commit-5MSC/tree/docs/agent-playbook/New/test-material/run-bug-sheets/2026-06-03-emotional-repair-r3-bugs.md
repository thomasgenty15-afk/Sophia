# Bug Sheet - emotional_repair r3 - 2026-06-03

## Contexte

- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-emotional-repair-r3.md`
- Run: `emotional-repair-20260603-r3`
- Persona: `qa-skill`, connexion temporaire `emotional_repair_emotional-repair-20260603-r3`
- Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, IA reelle, pas de fallback deterministe.

## Bugs

| ID | Tours | Famille | Owner | Source amont | Statut | Fix recommande | Tests attendus |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ER-R3-01 | T1-T3 | `BF-INTAKE-03` contrainte explicite perdue | `emotional_repair` | Structured intake invalide en IA reelle; `skill_run.output.diagnosis.intake_status=technical_fallback` avec erreurs de contrat | open | Corriger la production/normalisation du JSON `emotional_repair`; garantir que `no_plan`, `no_protocol`, `no_technique`, `soft_support_only`, `no_questions` deviennent des contraintes de decision reelles. Le fallback de validation doit rester conservateur et non technique quand le contrat manque. | Run reel: "pas de plan, juste doux" -> pas de respiration, pas de plan, pas de question. Paraphrase: "pas de technique, ramene-moi doucement" -> pas de technique. Format: "une phrase, sans consigne, sans question" -> une phrase. |
| ER-R3-02 | T4-T5 | `BF-INTAKE-04` clarification excessive | clarification / conversation-skill arbitration | Demande claire de micro-action non mutante apres baisse emotionnelle devient `orientation_clarification` | open | L'arbitrage doit autoriser un handoff conversationnel non mutant vers `execution_breakdown` quand l'intention est explicite et que `no_tool`/absence d'effet durable est respecte. | Run reel: "donne-moi une seule micro-action, sans outil" apres emotional repair -> soit une micro-action directe, soit handoff `execution_breakdown` sans tool et sans clarification superflue. |

## Notes Anti-Patching

- Ne pas corriger par regex locale sur "pas de plan", "pas de technique" ou "micro-action".
- La source prioritaire est le contrat de sortie structuree du skill et l'arbitrage conversationnel.
- Les garde-fous deterministes acceptables ici sont des validations de contrat et des fallbacks conservateurs non mutants; ils ne doivent pas inventer une intention metier.

## Verification Systeme

- Aucun tool execute sur le run.
- Aucun `memory_items`, `scheduled_checkins` ou `user_recurring_reminders`.
- Connexion temporaire nettoyee apres run.
