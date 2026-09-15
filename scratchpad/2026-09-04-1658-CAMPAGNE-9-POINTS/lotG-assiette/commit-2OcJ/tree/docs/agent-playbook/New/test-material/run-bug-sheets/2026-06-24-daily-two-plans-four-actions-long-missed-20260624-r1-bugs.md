# Run Bug Sheet - daily-two-plans-four-actions-long-missed-20260624-r1

## Metadata

- Date: 2026-06-24
- Run report: `tests/real-personas/rose/runs/daily-weekly/daily-two-plans-four-actions-long-missed-20260624-r1.md`
- Run id: `daily-two-plans-four-actions-long-missed-20260624-r1`
- Persona / scenario: Rose, daily long, 2 plans, 4 actions, all missed, user answers progressively
- Verdict run: red
- Validite QA: valide pour `whatsapp-webhook -> daily_action_review_v1 -> reducer/effects`; ouverture via fixture pending dynamique
- Agent owner: daily action review local flow

## Synthese

- Familles dominantes: `BF-PROACTIVE-01`
- Bug le plus bloquant: le `reason_text` de la premiere action est ecrase par la reponse de pertinence.
- Fix architectural prioritaire: separer strictement merge des slots `reason_text` et `still_relevant` dans le reducer daily.
- Rerun requis: oui, rerun daily 4 targets / 2 plans / all missed / reponses progressives.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R1-B01` | T2 | `BF-PROACTIVE-01` | visible daily / stage context | Projection du prochain focus apres remplissage `still_relevant` | Sophia demande "Sur celle-ci..." sans nommer l'action suivante. | Le user doit repondre "Si tu parles de la soirée zéro vide..." pour desambiguïser. | Quand le visible change de target, le contexte doit contenir la target du stage et la question doit nommer l'action. | `open` |  | positif: target suivante nommee; paraphrase: reponse de pertinence courte; anti-FP: si meme target reste active, pronoms acceptables seulement si contexte evident |
| `R1-B02` | T5 | `BF-PROACTIVE-01` | reducer/state merge daily | Merge multi-tours des slots `reason_text` et `still_relevant` | Invisible au user pendant le tour, mais donnees daily fausses. | Entry `Journée 100% sans cannabis`: `reason_text="ça reste pertinent pour demain"` au lieu de `j'ai craqué dans l'après-midi`; `reason_category=null`. | Une reponse de pertinence doit setter `still_relevant` sans jamais ecraser une raison deja collectee, sauf correction explicite. | `open` |  | positif: missed+reason puis pertinence preserve reason; paraphrase: "oui demain", "à garder"; anti-FP: correction explicite peut reviser reason; integration: commit 4 targets 2 plans |
| `R1-B03` | T5 | `BF-PROACTIVE-01` | visible daily commit context | Contexte `commit_success` centre sur la derniere target | Sophia confirme seulement "l'alternative du soir" alors que 4 actions sont validees. | Pending passe `done`, 4 entries creees, visible final ne signale pas la cloture globale. | Au commit final multi-target, le visible doit confirmer la cloture du daily ou le nombre d'actions traitees, pas seulement la derniere target. | `open` |  | positif: commit 4 targets confirme cloture globale; paraphrase: dernier message cible une seule action; anti-FP: commit mono-target peut confirmer seulement cette action |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-24 | Ne pas classer l'ouverture limitee a 2 actions comme bug dans ce run. | Le comportement est configure ainsi; le critere QA est que la file continue ensuite vers les autres actions. | daily_action_review | Demande utilisateur du 2026-06-24 |
| 2026-06-24 | Classer le run global en red malgre une conversation globalement continue. | Le resultat durable de la premiere action est faux, ce qui rend l'historique daily non fiable. | daily reducer | Rapport `daily-two-plans-four-actions-long-missed-20260624-r1` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-24 | `R1-B01` | Observation run QA reel local | `open` | Tour 2 |
| 2026-06-24 | `R1-B02` | Verification DB post-run avant cleanup | `open` | Tour 5 |
| 2026-06-24 | `R1-B03` | Observation transcript + pending `done` | `open` | Tour 5 |
