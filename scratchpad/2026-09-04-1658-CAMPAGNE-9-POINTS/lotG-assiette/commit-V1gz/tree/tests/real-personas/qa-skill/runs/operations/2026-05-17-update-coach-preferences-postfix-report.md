## 1. Contexte Du Test

- Date: 2026-05-17
- Scope: update_coach_preferences, local Supabase, `test-send-message`, `force_full_ai=true`
- Objectif: verifier que Sophia comprend des formulations moins directes, ne bascule pas a tort vers product_help, applique la bonne preference durable, et ne parle pas d'elle a la 3e personne dans ce flux.
- Correctifs couverts:
  - `coach.question_tendency` distingue maintenant les demandes de precision/clarification du raisonnement du niveau de challenge.
  - Les demandes multi-preferences bloquent et demandent quelle preference traiter en premier.
  - Une correction pendant une confirmation pending relance maintenant l'intake du tool dans le meme tour et remplace le brouillon.
  - Une reponse de selection apres ambiguite multi-preferences ne repose plus la meme question.

## 2. Tours De Conversation

- `prefmatrix-tone-soft-r2`: demande indirecte de douceur -> confirmation -> execution `coach.tone=soft` -> restauration `warm_direct`.
- `prefmatrix-challenge-low-r3`: "evite de me mettre la pression direct" -> confirmation -> execution `coach.challenge_level=low` -> restauration `balanced`.
- `prefmatrix-questions-high-r3`: "fais-moi davantage preciser mon raisonnement" -> confirmation -> execution `coach.question_tendency=high` -> restauration `normal`.
- `prefmatrix-multi-pref-r4`: "plus directe" + "moins de questions" -> demande de priorisation -> selection "ton plus direct" -> confirmation -> execution `coach.tone=direct` -> restauration `warm_direct`.
- `prefmatrix-confirm-correction-r5`: brouillon initial `tone=direct`, correction "garde le ton... pose-moi moins de questions" -> nouveau brouillon `question_tendency=low` au tour suivant immediat -> confirmation -> execution -> restauration `normal`.
- `prefmatrix-producthelp-where-r2`: "je ne veux pas le changer maintenant, mais c'est ou dans l'app..." -> route `product_help`, aucune execution tool, aucune mutation durable.

Artefacts:
- `2026-05-17-update-coach-preferences-prefmatrix-tone-soft-r2.{raw,summary,durable}.json`
- `2026-05-17-update-coach-preferences-prefmatrix-challenge-low-r3.{raw,summary,durable}.json`
- `2026-05-17-update-coach-preferences-prefmatrix-questions-high-r3.{raw,summary,durable}.json`
- `2026-05-17-update-coach-preferences-prefmatrix-multi-pref-r4.{raw,summary,durable}.json`
- `2026-05-17-update-coach-preferences-prefmatrix-confirm-correction-r5.{raw,summary,durable}.json`
- `2026-05-17-update-coach-preferences-prefmatrix-producthelp-where-r2.{raw,summary,durable}.json`

## 3. Analyse De Fluidite Humaine

- Les confirmations sont courtes, comprehensibles, et a la premiere personne: "j'utiliserai...".
- Le cas multi-preferences est plus naturel apres correction: Sophia reformule les deux preferences et demande laquelle commencer, sans appliquer silencieusement une seule partie.
- La correction d'un brouillon pending est plus fluide apres patch: Sophia ne dit plus qu'elle prepare ou applique quelque chose sans confirmation; elle remplace directement le brouillon par une nouvelle confirmation.
- Residuel: la reponse product_help contient un emoji et une question de suivi; ce n'est pas bloquant pour le tool, mais a surveiller si on veut un style plus sobre partout.

## 4. Analyse Systeme

- Tous les runs ont utilise le chemin reel `test-send-message` avec `force_full_ai=true`.
- Les traces post-correction montrent le bon handler:
  - `update_coach_preferences` pour les demandes de modification.
  - `product_help` pour la demande de localisation dans l'app.
- Les mutations durables sont conformes aux cibles attendues:
  - `coach.tone`: `warm_direct -> soft/direct -> warm_direct`
  - `coach.challenge_level`: `balanced -> low -> balanced`
  - `coach.question_tendency`: `normal -> high/low -> normal`
- Cleanup/restauration: OK sur les runs retenus.
- Verification code:
  - `/usr/local/bin/deno check supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/slot_filler.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/intake.ts`
  - `/usr/local/bin/deno test supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`

## Verdict Global

GREEN.

Les regressions initiales sont corrigees sur les scenarios relances: bonne preference durable, bon routage product_help, pas de 3e personne dans les confirmations/executions de ce tool, et correction pending maintenant propre.
