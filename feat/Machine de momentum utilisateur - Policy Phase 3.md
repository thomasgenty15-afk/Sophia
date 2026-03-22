# Machine de momentum utilisateur - Policy Phase 3

## Objectif

Remplacer le simple `skip` des etats non-`momentum` par de vrais gestes relationnels.

## Portee

Cette phase 3 s'appuie sur `trigger-daily-bilan` comme selecteur principal de gestes quotidiens.

- `momentum` continue vers le daily bilan existant
- `friction_legere` programme un outreach de diagnostic de blocage
- `evitement` programme un outreach de baisse de pression / meta-intervention
- `soutien_emotionnel` programme un outreach de soutien uniquement
- `reactivation` programme un outreach porte ouverte
- `pause_consentie` reste en silence

Le `weekly_bilan` reste un rituel macro pour `momentum` et `friction_legere`.

## Implementation

Un module `momentum_outreach.ts` :

- derive un `MomentumOutreachPlan` a partir de `temp_memory.__momentum_state_v1`
- fournit :
  - `event_context`
  - `fallback_text`
  - `instruction`
  - `event_grounding`
- applique les cooldowns issus de `momentum_policy.ts`
  - `max_proactive_per_7d`
  - `min_gap_hours`

Quand un outreach est autorise, le daily trigger cree un `scheduled_checkins` dynamique avec :

- `origin = rendez_vous`
- `message_mode = dynamic`
- `message_payload.source = trigger_daily_bilan:momentum_outreach`

## Pourquoi scheduled_checkins

On reutilise l'infra existante pour beneficier deja de :

- generation dynamique courte
- quiet window
- fallback template hors 24h
- reprise via pending yes / template acceptance
- delivery states et retries

## Effet attendu

- le daily trigger n'est plus "bilan ou skip"
- les users en non-progression ou hors cadre ne recoivent plus un check-up inadapté
- les gestes sont enfin differencies par etat sans introduire un nouveau canal d'envoi
