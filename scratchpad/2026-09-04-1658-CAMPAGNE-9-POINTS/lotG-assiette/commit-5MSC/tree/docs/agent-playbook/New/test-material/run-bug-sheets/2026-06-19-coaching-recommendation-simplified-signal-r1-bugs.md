# Bug Sheet - Coaching Recommendation Simplified Signal R1

Run: `coachingrec-simplified-signal-20260619-r1`

## R1-B01

- Tours: 1
- Famille: BF-INTAKE-05 - Semantique composite aplatie
- Domaine owner: `coaching_recommendation`
- Source amont: local dispatcher/reducer feature decision
- Symptome visible: Sophia recommande `adjust_plan` alors que le user decrit surtout un blocage de demarrage et demande explicitement carte d'attaque vs modifier.
- Preuve systeme: global signal propre (`coaching_type=plan_action`, no `priority_features`, no `failure_mode`); local state `current_recommendation=adjust_plan`.
- Correction attendue: en `plan_action`, demarrage/evitement/repoussement doit favoriser `attack_card`; `adjust_plan` seulement sur preuve explicite d'action trop lourde, mal cadree, desalignee ou rythme impossible.
- Statut: open
- Fix reference: a faire
- Tests requis: plan action + "j'ouvre le support puis je repousse" -> `attack_card`; anti-test "action trop lourde/mal cadree" -> `adjust_plan`.

## R1-B02

- Tours: 3
- Famille: BF-INTAKE-01 - Slot fourni mais redemande
- Domaine owner: `coaching_recommendation`
- Source amont: active-flow type-change reducer
- Symptome visible: Sophia demande si c'est emotionnel alors que le global signal dit `coaching_type=emotional`, `needs_type_confirmation=false`, et le user demande une potion.
- Preuve systeme: T3 TurnFrame `coaching_type=emotional`, `confidence=0.92`, `emotional_state_context.state_hint=tendu et agacé`; visible `change_confirm_coaching_type`.
- Correction attendue: consommer le signal emotionnel high-confidence et router `emotion_coaching` directement.
- Statut: open
- Fix reference: a faire
- Tests requis: active plan_action + user "ce n'est plus l'action, je suis [etat], quelle potion" -> `emotion_coaching`.

## Verifications Positives

- Le dispatcher global n'emet plus `priority_features`.
- Le dispatcher global n'emet plus `failure_mode`.
- T1 conserve `response_owner=coaching_recommendation`.
- T2 conserve `active_coaching_recommendation` au lieu de partir vers `product_help`.
