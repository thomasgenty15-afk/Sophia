# Run Bug Sheet - clarte-stabilization-r1

## Metadata

- Date: 2026-06-05
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-05-clarte-stabilization-r1.md`
- Run id: `2026-06-05-clarte-stabilization-1780664806311`
- Persona / scenario: temporary local QA auth user / clarté stabilization
- Verdict run: red
- Validite QA: valid real IA local run, `force_full_ai=true`
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-INTAKE-01`, `BF-INTAKE-04`
- Bug le plus bloquant: demande explicite clarté avec valeur claire redemande le champ au lieu de livrer le handoff.
- Fix architectural prioritaire: ne pas court-circuiter le sous-flow clarté en `missing` quand le message courant contient deja une reponse utile.
- Rerun requis: yes, meme run clarté stabilization apres fix.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R1-B01` | T1 | `BF-INTAKE-01` | `select_state_potion` clarté subflow | Bridge intake/reducer/local dispatcher for initial `missing` state | Sophia redemande "qu'est-ce qui rejoint ton pourquoi" alors que le user a deja donne "je fais les actions du plan, mais je ne sens plus pourquoi elles comptent". | `tool_skill_intents[0].operation_input.reason.status=identified`, `potion_type=clarte`, but `tool_status=clarifying`, `tool_reason_code=clarte_field_missing`, `draft=null`. | Let the clarté local dispatcher analyze the current message when the field is `missing`, or hydrate `locked_value` from a sufficient structured intent; only deterministic-short-circuit states that are already `locked/proposed` or active followups. | `open` |  | Positive: explicit clarté + clear answer locks in T1. Paraphrase: "je fais les trucs mais j'ai perdu le pourquoi" proposes confirmation. Anti-FP: "je suis en vrac" stays missing. Integration: real IA run stabilizes explicit clear in T1. |
| `R1-B02` | T4 | `BF-INTAKE-04` | `select_state_potion` general potion router | Potion selection confidence / ambiguity handling before clarté subflow | Sophia asks "Entre la Potion de clarté et la Potion anti-décrochage" although the user says actions no longer have a why. | `tool_skill_intents[0].target_hint=potion de clarté ou sens`, input includes `potion_type=clarte`, but `tool_status=clarifying`, `tool_reason_code=state_potion_handoff_clarifying`. | Select `clarte` when the unknown-potion request includes explicit meaning/why-deep-plan signals; keep clarification for unknown-potion requests without a strong semantic signal, preferably as a need-based question. | `open` |  | Positive: "je veux une potion mais je ne sais pas laquelle + pourquoi mes actions comptent" selects clarté. Anti-FP: "je veux une potion mais je ne sais pas si me calmer ou retrouver de l'elan" clarifies. Regression: no wrong potion names in visible prompt. |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-05 | Classer le run global en red. | Un invariant central du sous-flow clarté echoue: une reponse claire explicite ne lock pas en T1. | QA | `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-05-clarte-stabilization-r1.md` |
| 2026-06-05 | Ne pas classer les emojis comme bug. | Ils n'affectent pas l'objectif du run et l'utilisateur avait deja demande de les conserver dans d'autres QA. | Product / QA | Current QA context |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-05 | all | Real IA local QA via `test-send-message`, temporary local Auth user, `force_full_ai=true`. | Red: clarté explicit clear not stabilized; vague then clear stabilizes in 2 turns; generic potion with meaning stabilizes in 2 turns after router clarification. | `tests/real-personas/qa-skill/runs/state_potion/2026-06-05-clarte-stabilization-1780664806311.raw.json` |

