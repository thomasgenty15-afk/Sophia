# Run Bug Sheet - global15-nina-20260706-r2

## Metadata

- Date: 2026-07-06
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-06-nina-global15-r2.md`
- Run id: `global15-nina-20260706-r2` (scope `qa-global15-nina-2026-07-06-r2`)
- Persona / scenario: Nina — run global 16 tours (défense, attaque, track daté, reminder « ce soir », status, product_help, wish, clarify, safety, adjust plan post-safety, mémoire, suppression, report vague, cohérence)
- Verdict run: **green** (0 red, 0 yellow conversationnel, 16 green). 1 warning infra hors conversation.
- Validite QA: **valide** (IA réelle locale, `force_full_ai=true`, 16× HTTP 200, 16 traces réelles inline, scope dédié, 0 incident conversationnel, cleanup vérifié par IDs exacts)
- Agent owner: QA agent (Claude)

## Synthese

- **Aucun bug conversationnel.** Les 3 frictions de routage du run R1 du même jour (R1-T3 `BF-ROUTE-01`, R1-T11/T12 `BF-ROUTE-02`) **ne se reproduisent pas** : voir §Notes régression corrigée.
- **1 warning infra** (`BF-EFFECT-04`, hors chemin conversationnel): le job nocturne `trigger-memorizer-daily` a renvoyé `502` (timeout gateway Kong) en laissant un état non auto-récupérable — extraction_run `running` + messages marqués `completed` mais 0 memory_item. Un simple retry serait `skipped` (no unprocessed messages) → 0 mémoire persistée.
- Fix architectural prioritaire: rendre la récupération du batch mémoire idempotente/atomique face à un timeout gateway (soit marquer `completed` seulement après persist réussi des items, soit un balayage de reprise des runs `running` orphelins).
- Rerun requis: non pour le conversationnel (green). Oui pour valider un fix de récupération du batch mémoire (job infra).

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R2-B01` | hors tours (job mémoire nocturne) | `BF-EFFECT-04` | job `trigger-memorizer-daily` / persist policy memorizer | ordre persist: `memory_message_processing` marqué `completed` **avant** l'écriture des `memory_items`; un timeout gateway (502 Kong) coupe entre les deux | 1er déclenchement du memorizer → `502`; extraction_run `4dc80956` bloqué `running`, 16 messages `completed`, **0 memory_item**. Un retry naïf → `skipped` no_unprocessed → 0 mémoire | run `4dc80956` status=`running` (jamais finalisé), `memory_message_processing`=16 `completed`, `memory_items`=0; logs edge sans event `user_completed` pour Nina | Marquage `completed` des messages **après** persist réussi des items (ou reprise atomique), et/ou balayage de reprise des runs `running` orphelins pour éviter le blocage définitif du batch | `fix_applied` — chantier Z1 (2026-07-06): marquage `completed` déplacé APRÈS le persist réussi + balayage `recoverOrphanExtractionRuns` des runs `running` orphelins (TTL 30 min) au début du job quotidien. Tests contrat + validation réelle (orphelin fabriqué → libéré et retraité, voir feuille paul-r4 B02). Le contournement manuel n'est plus nécessaire. | chantier Z (2026-07-06) | positif (timeout mid-batch → reprise réécrit les items) + anti-régression (run `running` orphelin repris, pas `skipped`) + idempotence (pas de double écriture si les 2 branches passent) |

## Notes Regression Corrigee (verifiees green ce run)

- **R1-T3 → R2-T1** (`BF-ROUTE-01`): piège récurrent SUBI (soir 22h télé) désormais routé `coaching_recommendation` / carte de défense d'entrée (reason `risk_moment_coaching_need`), plus par `feature_opportunity`. Le fix dispatcher (chantier Y2, 2026-07-06) tient.
- **R1-T11/T12 → R2-T11/T12** (`BF-ROUTE-02`): demande d'ajustement durable de plan, placée **juste après un tour de détresse safety (T10)**, route `plan_realignment` (reason `plan_change_request` puis `explicit_plan_adjust_request`), plus captée par le flow coaching/safety actif. Exit de flow sur bascule d'intention confirmé (exits observés T4, T9, T13). Le fix flow (chantier Y1) tient dans le cas dur safety→adjust.

## Notes Green Notables (non-bugs)

- T5: `message_payload.user_timezone="Europe/Paris"` **cohérent** cette fois (R1-T5 avait `UTC` — métadonnée cosmétique). `scheduled_for` correct (19:30Z = 21h30 Paris CEST).
- T4: gestion correcte du `date_hint` — complétion habitude attribuée à **hier** (`effective_at=2026-07-05`), pas à aujourd'hui.
- T10: safety band `medium` (`hopelessness`) préempte et **bloque explicitement** product_help / coaching_recommendation / plan_realignment / feature_opportunity (`distress_support_priority`). BF-SAFETY-01 respecté, 0 side effect.
- T9: friction UX **légère** (green) — sur demande vague, ré-orientation vers l'initiative plutôt que clarification ouverte. Non bloquant, aucun effet. Piste d'amélioration douce, pas un bug classé.

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-06 | Verdict global `green` malgré le warning `BF-EFFECT-04` | L'incident est un timeout d'un job infra nocturne **hors des 16 tours conversationnels**; les effets durables conversationnels (track, reminder) et la mémoire finale sont corrects après reprise. Guidelines: un warning explicitement non bloquant reste `green` | QA agent | Guidelines §Verdicts; §Memoire (memorizer nocturne) |
| 2026-07-06 | Classer R2-B01 `BF-EFFECT-04` (pas `BF-MEMORY-01`) | Ce n'est pas une promesse mémoire non persistée par le planner in-turn (T13 a bien été acquitté sans claim de commit, puis persisté au batch): c'est une **fragilité de récupération du job/executor** batch face à un timeout gateway | QA agent | familly-bugs.md §Taxonomie |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-06 | R2-B01 | Statut extraction_run + counts `memory_message_processing`/`memory_items` après 502; logs edge `trigger-memorizer-daily` | Confirmé: run `running` orphelin, 16 msgs `completed`, 0 item; reprise après reset → run `2ef9fcf8` completed, 9 items | run report §4 |
| 2026-07-06 | — (régressions) | Traces inline `conversation_turn_traces` (owner/reason_code/skill_signals) + EffectLedger + DB post-run | R1-T3/T11/T12 non reproduits (owners défense / plan_realignment corrects) | run report §2/§4 |
| 2026-07-06 | — | Cleanup baseline par IDs exacts (entry `359b25aa`, reps `9c539292` 1→0, checkin `9dd2b560`, 9 memory_items + run `2ef9fcf8`, 32 msgs run-scope, chat_state, scope_memories) | Baseline restaurée: entries 0, checkins 0, memory_items 0, msgs/chat_state run-scope 0, habits 0/3 & 0/2, items `1601146e`/`e205079e` active | run report §1 |
