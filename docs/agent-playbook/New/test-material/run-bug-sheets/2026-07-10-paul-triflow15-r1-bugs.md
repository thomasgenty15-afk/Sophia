# Run Bug Sheet - paul-triflow15-r1

## Metadata

- Date: 2026-07-10
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-10-paul-triflow15-r1.md`
- Run id: `paul-triflow15-r1`
- Persona / scenario: Paul / triflow 15 tours (coaching_recommendation + presence + normal_reply + one-shot reminder)
- Verdict run: red
- Validite QA: valide (IA reelle, Supabase local, `force_full_ai=true`, 15/15 HTTP 200)
- Agent owner: QA (Claude)

## Synthese

- Familles dominantes: `BF-STATUS-01` (bloquant), `BF-ROUTE-02` (secondaire), `BF-ROUTE-03` (contributeur), renderer coaching (a classifier).
- Bug le plus bloquant: `R1-B01` — la lane de verification de rappel nie un one-shot reminder committe et pending (T11-T12), confirme sous confrontation et prouve par le `duplicate_pending` du create-path (T13).
- Fix architectural prioritaire: source de verite unifiee des rappels pending + projection status injectee a la lane verify + garde composeur "ne jamais nier un rappel sans projection".
- Rerun requis: oui apres fix `R1-B01` (rejouer T6 -> T11/T12/T14; paraphrases de "il est bien enregistre ?").

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R1-B01` | T11, T12, T14 | `BF-STATUS-01` | status/recap `one_shot_reminder` (+ routage verify, `BF-ROUTE-03`) | Aucune projection des rappels pending injectee a la lane de verification; intention "mon rappel est-il enregistre ?" routee `normal_reply` sans grounding status | Sophia dit "Non, je n'ai pas de rappel enregistre ici" alors que le rappel de 7h30 est `pending` en DB; maintenu sous confrontation (T12); jamais reconcilie (T14) | T6 ledger committed=1 + `scheduled_checkins 2909a7b6` pending 2026-07-11 05:30Z; T13 create-path `blocked/duplicate_pending` sur le meme rappel => donnee lisible cote tool mais invisible cote verify; T11/T12 owner=`normal_reply`, ledger=0 | Source de verite unifiee des rappels pending pour create/cancel/verify; projeter les `scheduled_checkins` (event_context `one_shot_reminder:*`, status pending) dans le contexte du composeur pour toute intention verify/list; interdiction de nier l'existence sans projection; router l'intention de verification vers ce lecteur status | `fix_applied` (2026-07-11, chantier R) | Lane STATUS (`intent='status'` → lecture DB des pending, outcome `one_shot_reminder_status`, guidance « ne jamais nier ») dans `one_shot_reminder/router.ts` + règle 38 réécrite (`one_shot_reminder_prompt_contract.ts`) + CAUSE RACINE: bloc « RENDEZ-VOUS (SOURCE DE VÉRITÉ) » injecté sur tout mot « rappel » et ordonnant d'ignorer les ponctuels — rebordé (`context/loader.ts`) + `duplicate_pending` existence-positive. Validé harness S1 (rejeu T6→T11 exact), rounds verts consécutifs | positif (cree->verify liste le pending) + paraphrase (formulations variees de la verif) + anti-FP (aucun rappel reel => "rien de programme") + coherence create/verify |
| `R1-B02` | T10 | `BF-ROUTE-02` | active_flow_state / dispatcher global (exit policy presence) | Flow presence collant ne relache pas sur topic-change transactionnel (`should_exit_flows=false`, conversation_risk=0); path plan/status non branche | Sur "completement autre chose... c'est quoi mes actions en cours ?", owner reste `presence_conversation` et Sophia dit "je n'ai pas ton plan sous les yeux" alors que 4 items actifs existent | route_reason=`active_presence_conversation`, skill_signals={} ce tour, memory_plan.response_intent=`provide_current_plan_actions_summary`; DB: 4 `user_plan_items` actifs (plan `d296c072`) | Autoriser une intention transactionnelle (status/plan/tool) a preempter un flow presence actif meme a risk=0; brancher la lecture des `user_plan_items` actifs vers un owner plan/status | `fix_applied` (2026-07-12, chantier V6-2) | Le kind `topic_change` du bloc presence du dispatcher global couvre explicitement la demande d'INFORMATION/LECTURE transactionnelle (« c'est quoi mes actions en cours ? », statut, recap) — jamais un `maintain`, meme a risk=0 (`dispatcher.prompts.ts`) ; le chemin d'exit runtime existait deja (`stepPresenceFlow` topic_change → re-dispatch global). Anti-FP : demande de METHODE / retour emotionnel au sujet = maintain. Ancres `dispatcher_prompt_contract_test.ts`. Probe live qa-v6-p5 (rejeu T8→T10) : entree presence, maintien, puis exit + liste exacte des 4 actions actives, zero deni | positif (topic-change plan sort de presence) + preservation presence sur vrai maintien + grounding plan actif correct — joue en probe qa-v6-p5 |
| `R1-B03` | T5 | `a classifier` (renderer/altitude coaching) | `coaching_recommendation` visible agent / renderer | Pas de transition d'etat "user_wants_materialization": le skill re-explique au lieu de faire un handoff produit net | Sur deux "cree-la", Sophia re-donne une 3e fois la definition de la carte de defense puis renvoie vers Ressources sans acter clairement "je ne cree pas depuis le chat" | T3, T4, T5 owner=`coaching_recommendation`; repetition de la meme definition; aucun effet durable | Etat de skill qui coupe la re-explication quand l'utilisateur bascule vers la creation, et emet un handoff produit unique et clair | `fix_applied` (2026-07-12, chantier V6-3) | Etat structurel `materialization_handoff_done` (cliquet dans `CoachingRecommendationLocalState`, pose par le dispatcher local au tour du handoff, persiste par le reducer pour toute la vie du flow) + regles prompt « bascule vers la CREATION = handoff, jamais une re-explication » et « re-ordre apres handoff = 1-2 phrases nettes, zero question de slot » (exemple INVALIDE verbatim) + miroir visible agents (`shared.ts`). Tests : normalisation + cliquet (`local_flow_test.ts`), ancres prompt. Probe live qa-v6-p6 (rejeu T3→T5) : 2e « cree-la » → handoff net Ressources sans re-definition | positif (2e "cree-la" => handoff net sans re-definition) + anti-repetition — joue en probe qa-v6-p6 |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-10 | Classer `R1-B01` en `BF-STATUS-01` plutot que renderer/hallucination | La contradiction T13 (`duplicate_pending`) prouve que la donnee est lisible cote tool; le faux negatif vient d'une projection status absente cote verify, pas d'un renderer isole | QA | Regle de classification familly-bugs (source amont = projection DB) |
| 2026-07-10 | Ne pas ouvrir de ligne BF-PREF-01 ni memory | Aucune preference durable ni intention memoire explicite dans le run; `memory_items=0` attendu | QA | 14-qa-test-guidelines (flags a ne pas chercher) |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-10 | R1-B01 | Lecture DB `scheduled_checkins` pendant le run (T11-T14) | Rappel `pending` confirme pendant tout le deni visible | rapport section T11-T14 |
| 2026-07-10 | — | Nettoyage fin de run | 0 rappel / 0 chat_state / 0 message; memory_items=0 | rapport annexe |
