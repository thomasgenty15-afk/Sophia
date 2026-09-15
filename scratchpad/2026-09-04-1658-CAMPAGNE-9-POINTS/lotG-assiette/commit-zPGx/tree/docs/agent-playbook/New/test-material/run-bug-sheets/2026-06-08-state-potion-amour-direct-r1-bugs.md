# Bug Sheet - Potion Amour Direct R1

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, user QA temporaire, aucun fallback deterministe, aucun changement de code pendant le run. Demarrage direct via `temp_memory.__active_tool_skill_intake.active_subskill_id=select_state_potion.amour`, sans passer par la selection globale `select_state_potion`.

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-state-potion-amour-direct-r1.md`

## Bugs

### SSP-AMOUR-DIRECT-R1-B01

- Bug id: `SSP-AMOUR-DIRECT-R1-B01`
- Tours: Tour 3
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `select_state_potion` sous-skills locaux / reducer commun
- Source amont: transition `platform_destination_followup` apres handoff deja livre
- Symptome visible: faible. Sophia redit bien les champs plateforme.
- Preuve systeme: Tour 3 `selected_handler=select_state_potion.amour`, `status=handoff_delivered`, `reason_code=amour_handoff_delivered_from_destination_followup`, alors que le message user est `Redis-moi juste quoi mettre dans la plateforme.`
- Correction attendue: quand `last_handoff_delivered=true` et que le user demande seulement de repeter ou de localiser les champs, le flow doit rester sur `repeat_handoff` ou `destination_short`, sans relivrer un nouveau `handoff_delivered`.
- Statut: `verified`
- Fix reference: `select_state_potion/subskills/state_potion_subskill_flow.ts`; le reducer retourne `repeat_handoff` sur `platform_destination_followup` apres handoff deja livre.
- Verification QA: run reel direct R2, Tour 3 `Redis-moi juste quoi mettre dans la plateforme.` -> `status=repeat_handoff`, `reason_code=amour_repeat_handoff`, no mutation.
- Tests requis: positif `redis-moi` apres handoff -> `repeat_handoff`; paraphrase `rappelle-moi les champs`; anti-faux-positif `je change la reponse` doit rester revision/handoff; integration directe sous-skill Amour et un autre sous-skill local.
- Tests ajoutes: `state potion subskill already delivered destination followup repeats instead of redelivering`.

### SSP-AMOUR-DIRECT-R1-B02

- Bug id: `SSP-AMOUR-DIRECT-R1-B02`
- Tours: Tour 1
- Famille: `BF-INTAKE-01` - Slot fourni mais redemande / qualite de slot insuffisamment qualifiee
- Domaine owner: `select_state_potion` sous-skills locaux / dispatcher commun
- Source amont: absence de metadonnée de suffisance sur les champs libres
- Symptome visible: Sophia accepte `mon echec de vendredi` comme valeur finale sans creuser ce qui rend l'episode exploitable pour une potion efficace.
- Preuve systeme: Tour 1 `status=handoff_delivered`, draft present, sans tour de clarification malgre une valeur libre courte.
- Correction attendue: les champs libres peuvent etre lockes mais marques `detail_sufficiency.status=needs_more_detail`; dans ce cas le reducer pose une seule question de creusement avant le handoff final.
- Statut: `verified`
- Fix reference: `StatePotionSubskillFieldDetailSufficiency`, reducer commun `maybeDetailQuestionResult`, prompt dispatcher local et visible agent `ask_deeper`.
- Verification QA: run reel direct R2, Tour 1 avec contexte pauvre -> `status=clarifying`, question de creusement; Tour 2 avec precision -> `status=handoff_delivered`, draft present, no mutation.
- Tests requis: positif champ libre pauvre -> une question de creusement; suite de creusement -> handoff; anti-boucle un seul creusement max; integration sur Amour et un autre sous-skill local.
- Tests ajoutes: `state potion subskill asks one detail question for sparse free text before handoff`; `state potion subskill detail followup answer finalizes without a second detail loop`.

## Verifications Vertes

| Scenario | Preuve | Statut |
| --- | --- | --- |
| Demarrage sans selection globale | Etat actif pre-injecte `select_state_potion.amour`; Tour 1 `selected_handler=select_state_potion.amour` | green |
| Multi-slot naturel | Tour 1 verrouille contexte + `love_state=Dur avec moi`; `status=handoff_delivered`, draft present | green |
| No mutation nominale | Tous les tours `executed_tools=[]`, `committed_effects=[]` | green |
| Apply attempt non-mutant | Tour 2 `status=apply_attempt`, `reason_code=amour_apply_attempt_no_chat_execution` | green |
| Annulation | Tour 4 `status=cancelled`, `reason_code=amour_flow_cancelled` | green |
| DB sans effets interdits | `user_potion_sessions=[]`, `user_recurring_reminders=[]`, `scheduled_checkins=[]` | green |
| Cleanup cible | `chat_messages`, `user_chat_states`, tables effets ciblees et user Auth temporaire supprimes | green |
