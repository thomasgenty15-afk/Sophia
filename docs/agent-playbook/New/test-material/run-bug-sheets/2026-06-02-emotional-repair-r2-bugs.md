# Bug Sheet - emotional_repair r2 - 2026-06-02

## Run

- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-emotional-repair-r2.md`
- Run id: `emotional-repair-20260602-r2`
- Persona: `qa-skill`, connexion temporaire `emotional_repair_emorepair_20260602_r2`
- Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`
- Statut global: `yellow`

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptôme visible | Preuve système | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ER-R2-B01` | T1, T2, T5 | `BF-INTAKE-03` | `emotional_repair` | intake/reducer/renderer constraints | Sophia ajoute encore question, micro-protocole ou technique malgré `pas de plan`, `pas de protocole`, `ne me propose pas de technique`. | `selected_handler=emotional_repair`, `tool_execution=none`, `direct_effects=[]`; problème visible pur skill. | Les contraintes explicites `no_plan`, `no_protocol`, `no_question`, `no_technique`, `soft_support_only` doivent devenir des invariants de rendu du skill. | `open` | Aucun, observation run réel. | Positif: soutien doux sans plan. Paraphrase: "reste avec moi sans technique". Anti-FP: "donne-moi une micro-action" autorise une action unique. Integration: mini-run émotion -> contrainte -> micro-action, sans tool. |

## Vérifications Positives Du Run

- Le bug aval précédent est corrigé: T2 contient "Ramene-moi doucement" et "ne transforme pas ca en rappel", mais reste `selected_handler=emotional_repair`.
- Aucun `create_one_shot_reminder`, aucun pending reminder, aucun scheduled checkin.
- Aucun outil durable: `executed_tools=[]` sur tous les tours.
- DB post-run: `memory_items=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`, `user_attack_cards=0`, `user_defense_cards=0`, `user_potion_sessions=0`.

## Décision Anti-Patching

- Ne pas corriger par regex locale.
- Ne pas patcher `run.ts`.
- Owner attendu: contrat et reducer/renderer `emotional_repair`.
- La correction doit couvrir la famille de contraintes explicites, pas les phrases exactes du run.
