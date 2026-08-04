# Nudges proactifs par `time_of_day` — design verrouillé (2026-07-08)

## Principe

Deux familles de messages proactifs WhatsApp, aux règles opposées :

| Voie | Messages | Cadence |
|---|---|---|
| **A — Nudges d'action** | liés aux actions du plan, un par créneau horaire actif | 0..N/jour (dans la fenêtre 24h) |
| **B — Présence / état** | « bonne journée » OU message doux (soutien) | 0..1/jour, prioritaire sur la voie A |

## Mapping `time_of_day` → créneau de nudge

`time_of_day` dit QUAND l'action se fait ; le scheduler décide QUAND on en parle.

| `time_of_day` | l'action se fait | nudge | event_context |
|---|---|---|---|
| `wake_up` | au réveil (demain) | **la veille** 21h35–22h | `action_night_prep_v1` |
| `morning` | le matin | matin 8h–10h | `action_morning_encouragement_v2` |
| `afternoon` | l'après-midi | matin 8h–10h | `action_morning_encouragement_v2` |
| `evening` | le soir | 16h45–17h45 | `action_late_afternoon_encouragement_v1` |
| `night` | tard le soir | le soir même 21h35–22h | `action_night_prep_v1` |
| `anytime` / null | peu importe | matin 8h–10h | `action_morning_encouragement_v2` |

- La fenêtre 21h35–22h est volontairement APRÈS la fin de la review du soir
  (19h–21h30) pour exclure toute collision.
- `wake_up` et `night` partagent le créneau `action_night_prep_v1` mais le
  message distingue « ce soir » vs « demain au réveil » (pré-engagement).
- Sémantique génération : « se lever » → `wake_up` (pas `morning`) ;
  « se coucher » → `night` (pas `evening`). Source unique de l'enum :
  `supabase/functions/_shared/time_of_day.ts`.

## Règle A — fréquence des nudges d'action

- **Dans la fenêtre 24h WhatsApp** : pas de limite, tous les créneaux
  pertinents partent (les heures des créneaux garantissent ≤ 2 messages par
  fenêtre glissante de 10h, compatible avec le throttle proactif existant).
- **Hors fenêtre 24h** : la couche d'envoi (whatsapp-send) force le template
  Meta et applique déjà le cap **1 template proactif/jour**
  (`proactive_template_daily_cap_reached`). Rien à re-implémenter.

## Règle B — priorité au système d'état (gate momentum)

Évaluée à la LIVRAISON (état frais) dans `process-checkins`, pour chaque nudge
d'action, via `evaluateActionNudgeMomentumGate` (sophia-brain/momentum_morning_nudge.ts) :

- état `soutien_emotionnel` → le nudge d'action est **remplacé** par un message
  doux (« support_softly », libellé adapté au créneau) ;
- après un message doux envoyé, marqueur jour `__action_nudge_support_sent_local_date`
  dans la temp memory WhatsApp → **tous les autres nudges d'action du jour se
  taisent** (une seule présence/jour) ;
- `pause_consentie` ou policy momentum sans proactif → nudge annulé ;
- sinon → le nudge d'action part normalement.

Le light greeting (`morning_light_greeting_v2`) reste réservé aux jours sans
aucune action et garde sa propre garde anti-répétition.

## Finding important (traçage 2026-07-08)

Le « momentum morning nudge » historique (`morning_nudge_v2`,
`morning_active_actions_nudge`) était du **code mort** : toute la machinerie
(postures, cooldowns, repair mode) existe dans process-checkins mais aucun
scheduler ne crée ces event_contexts (vérifié code + données staging : 0 ligne).
La règle B ci-dessus rebranche la partie « quand la personne va mal, on ne
pousse pas les actions » sur le chemin réellement actif (nudges d'action).

## Fichiers clés

- `supabase/functions/_shared/time_of_day.ts` — enum canonique + prédicats de créneau (+ tests)
- `supabase/functions/_shared/action_occurrences.ts` — event contexts + instructions des créneaux
- `supabase/functions/_shared/proactive_checkin_timing.ts` — fenêtres horaires
- `supabase/functions/schedule-whatsapp-v2-checkins/index.ts` — planification des créneaux
- `supabase/functions/process-checkins/index.ts` — gate momentum + marqueur présence
- `supabase/functions/sophia-brain/momentum_morning_nudge.ts` — `evaluateActionNudgeMomentumGate`
- Prompts génération : `_shared/v2-prompts/plan-generation.ts`, `_shared/v2-prompts/next-level-generation.ts`
- Seuils matérialisation (dupliqués, à garder en phase) : `generate-plan-v2/index.ts`, `adjust-plan-v1/index.ts` (`wake_up: 10h`)

## Décisions actées

- D1 : pas de migration des actions existantes (`se lever` taguées `morning`
  migreront à la prochaine génération de niveau).
- Le « minimum faisable » est banni des nudges proactifs ; réservé au flow
  conversationnel réactif sur signal de résistance explicite.
