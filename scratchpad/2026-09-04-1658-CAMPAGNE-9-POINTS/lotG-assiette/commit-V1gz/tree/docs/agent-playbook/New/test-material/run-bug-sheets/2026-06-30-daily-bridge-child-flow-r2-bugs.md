# Bug Sheet - daily-bridge-child-flow-20260630-r2

## R2-B01

- Tours: 5-6
- Famille: `BF-PROACTIVE-01`
- Domaine owner: visible daily `daily_action_review_v1`
- Source amont: prompts/stage contracts `clarify_outcome` et `explain_target`
- Symptome visible: Sophia demande “fait, pas fait, ou en partie ?”
- Preuve systeme: tours 5 et 6 du raw `daily-bridge-child-flow-20260630-r2.raw.json`
- Correction attendue: les visibles daily doivent demander uniquement `fait ou pas fait`; le reducer peut traiter “fait a moitie” comme fait si le user le dit, mais le visible ne doit plus proposer “en partie”.
- Statut: `open`
- Fix reference: n/a
- Tests requis: test visible daily anti-regression sur absence de `en partie` et demande outcome binaire.

## R2-B02

- Tours: 2
- Famille: `BF-PROACTIVE-01`
- Domaine owner: visible daily `explain_target`
- Source amont: formulation de relance outcome apres explication
- Symptome visible: Sophia demande “Faisable aujourd’hui ?” au lieu de demander clairement si c'est fait ou pas fait.
- Preuve systeme: tour 2 du raw `daily-bridge-child-flow-20260630-r2.raw.json`
- Correction attendue: apres une explication d'action, la question de collecte doit rester binaire et retrospective: `fait ou pas fait aujourd'hui ?`
- Statut: `open`
- Fix reference: n/a
- Tests requis: test visible `explain_target` avec output binaire retrospective.
