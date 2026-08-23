# LA TRAJECTOIRE — trois états, et ce que chacun a changé

Chaque dossier `<n>-<nom>/scenario-<s>/` porte les **prompts construits par le
harnais déterministe** (`../harness/build_scenarios.ts` : il appelle
`buildMealPrompt` avec des entrées figées et n'appelle AUCUN modèle — c'est
l'instrument qui répond à « qu'est-ce qui a changé » et surtout à « qu'est-ce
qui n'a PAS changé pour les populations non visées », par diff d'octets), plus
`run-<n>/` quand un run réel a abouti.

Le harnais est **fidèle**, prouvé : sur le scénario 3 en v15, son
`prompt-user.txt` est identique au prompt RÉEL capturé au runtime, tête et
queue comprises — la seule divergence est le bloc de doctrine (le harnais porte
celui du coach 1V, le run porte celui du coach 2A).

| itération | `MEAL_PROMPT_VERSION` | ce qui bouge | qui le voit |
|---|---|---|---|
| `00-baseline` | `meal.en.v13_what_they_can_actually_do` | — | — |
| `01-order-and-wording` | `meal.en.v14_what_outranks_what` | ① le bloc d'ordre `-- WHEN TWO OF THE LINES ABOVE WANT DIFFERENT THINGS --`, posé dans le cran de récence · ② l'envie porte son rang · ③ la sévérité est lue | ① tout le monde · ② les compositions avec une envie tapée · ③ les élèves ayant ≥ 1 contrainte |
| `02-silence-and-naming` | `meal.en.v15_the_plan_never_names_it` | ④ un plan ne nomme jamais une contrainte `medical` (+ l'exception dans l'ordre contraire de `-- WHAT THEY HAVE TOLD ME --`) · ⑤ le silence de la CAPACITÉ est nommé | ④ les élèves ayant ≥ 1 contrainte `medical` · ⑤ les comptes sans aucune capacité déclarée |

## Longueur du message utilisateur, par scénario (harnais, octets)

| scénario | v13 | v14 | v15 |
|---|---|---|---|
| 1 · tout rempli | 9 813 | 11 834 | 12 722 |
| 2 · minimum vital | 4 951 | 6 127 | 6 469 |
| 3 · contradictions | 8 876 | 10 897 | 11 785 |
| 4 · temps/argent au plancher | 7 833 | 9 283 | **9 283** (byte-identique à v14) |
| 5 · beaucoup d'exclusions | 9 063 | 11 084 | 11 842 |

Le prompt SYSTÈME ne bouge pas d'un octet (14 382 partout) : rien de ce lot n'y
touche. Le mot « json » est présent dans les deux moitiés à chaque itération —
vérifié par le harnais ET par SQL sur chaque run réel (`json_mode`,
`system_prompt ~* '\mjson\M'`, `user_message ~* '\mjson\M'` → `t/t/t`).

## Ce qui a été TENTÉ puis RENDU en `02` — et c'est la moitié utile

Deux « silences » ont été écrits, mesurés rouges contre des arbitrages
existants, et retirés plutôt que forcés :

- **le corps inconnu** — `meal_body_test.ts::"un corps entièrement inconnu SOUS
  plancher rend la même chose encore"`. Un en-tête d'absence rendrait le
  **plancher TCA** observable dans le prompt. Le silence EST la garde.
- **`null` ≠ `[]` sur les contraintes** — `meal_body_test.ts::"sans contrainte,
  aucun bloc de contraintes — et pas un en-tête vide"` exige l'égalité de
  chaînes. Le trou est réel et grave (§3 du rapport), l'arbitrage est écrit, et
  le renverser appartient à un humain.

Les deux tentatives, leur mesure et leur raison de retrait sont conservées **en
commentaire au point exact du code**, et le test `meal_precedence_test.ts::"v15
· le silence de la CAPACITÉ est nommé — et lui seul"` interdit désormais de les
réintroduire par distraction.
