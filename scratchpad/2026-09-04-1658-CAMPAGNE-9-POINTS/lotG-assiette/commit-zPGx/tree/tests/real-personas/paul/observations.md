# Paul Observations

Document autonome pour piloter le rodage de Paul. Ajouter ici les observations,
corrections, bugs, choses a retester et decisions de test.

## Cadre

But du lab Paul : a completer quand son objectif et son plan actif seront
documentes.

Paul doit rester un test realiste : l'agent QA peut varier les messages, mais
Sophia doit garder la coherence avec `persona.md`, `current-plan.md` et
`timeline.md`.

## Regles D'Annotation

Chaque observation doit etre ajoutee sous la date du jour avec :

- contexte : chat libre, action, operation, correction, check-in
- ce qui etait attendu
- ce qui s'est passe
- preuve : trace_id, message, response, effet DB, ou lien run
- statut : `a retester | bug probable | corrige | decision`

## 2026-05-12 - Initialisation Du Dossier

- contexte : creation du dossier real-persona Paul.
- attendu : disposer d'une structure standard avant les runs.
- observe : dossier cree avec `persona.md`, `current-plan.md`, `observations.md`,
  `timeline.md`, `connection.example.json`, `daily-log/` et `runs/`.
- preuve : `tests/real-personas/paul/`.
- statut : decision.

## Choses A Retester En Priorite

- A definir apres documentation du plan actif.

## Bugs Ou Risques Ouverts

- Aucun pour l'instant.

## Corrections Appliquees

- 2026-05-12 : creation du dossier Paul.

