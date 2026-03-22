# Machine de momentum utilisateur - Policy Phase 2

## Objectif

Brancher les triggers de bilan sur l'etat de momentum pour que les bilans quotidiens et hebdomadaires ne partent plus par defaut.

## Portee

Cette phase 2 couvre uniquement :

- `trigger-daily-bilan`
- `trigger-weekly-bilan`

`memory_echo` reste hors scope. C'est un proactive relationnel, pas un bilan.

## Decision selector

Un selecteur central lit `temp_memory.__momentum_state_v1` et retourne une decision `allow` ou `skip` pour chaque type de bilan.

Types couverts :

- `daily_bilan`
- `weekly_bilan`

## Regles V1

- `daily_bilan`
  - autorise seulement en `momentum`
  - bloque en `friction_legere`
  - bloque en `evitement`
  - bloque en `pause_consentie`
  - bloque en `soutien_emotionnel`
  - bloque en `reactivation`

- `weekly_bilan`
  - autorise en `momentum`
  - autorise en `friction_legere`
  - bloque en `evitement`
  - bloque en `pause_consentie`
  - bloque en `soutien_emotionnel`
  - bloque en `reactivation`

## Fallback

Si aucun `momentum state` n'est encore present dans `temp_memory`, le systeme laisse passer le trigger legacy.

## Effet attendu

- plus de bilan quotidien quand le user ne progresse pas ou n'est plus dans le bon cadre relationnel
- le weekly bilan reste possible comme rituel macro pour `momentum` et `friction_legere`
- les etats `pause_consentie`, `soutien_emotionnel`, `evitement` et `reactivation` bloquent desormais les bilans tant qu'un comportement plus adapte n'est pas encore implemente
