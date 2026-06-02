# Run Bug Sheet - Update Coach Preferences Cross-Flow Rerun

## Metadata

- Date: 2026-06-02
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-update-coach-preferences-cross-flow-rerun.md`
- Run id: `qa-coach-pref-crossflow-rerun-1780351752682` + focus `qa-coach-pref-recurring-focus-1780352120862`
- Persona / scenario: users QA temporaires locaux, flows carte d'attaque / rappel recurrent / carte de defense interrompus par preference coach
- Verdict run: yellow
- Validite QA: valide, IA reelle via `/functions/v1/test-send-message`, `force_full_ai=true`; partie rappel recurrent completee par mini-rerun focalise
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-ROUTE-01`, `BF-ROUTE-02`, `BF-ROUTE-03`, `BF-STATE-01`
- Bug le plus bloquant: les intents tool explicites sont encore absorbes par clarification/status dans certains contextes
- Fix architectural prioritaire: prioriser les tool intents explicites avant clarification/status, puis restaurer les handoffs suspendus apres interruption
- Rerun requis: oui, apres correction des bugs ouverts ci-dessous

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `RERUN-B01` | T1 | `BF-ROUTE-01` | dispatcher / clarification arbitration | routing tool_skill vs orientation clarification | "Prepare une carte d'attaque..." demande encore une clarification au lieu de demarrer le skill | `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, `route_reason=clarification_required`, aucun `prepare_attack_card` | Une demande explicite de carte d'attaque doit router `prepare_attack_card`, sauf question produit/status claire | `open` |  | positif demande carte; paraphrases "prepare/lance une carte"; anti-FP question produit sur les cartes |
| `RERUN-B02` | T2 | `BF-ROUTE-02` | orientation clarification arbitration | clarification active classe la preference comme topic change sans reroutage tool | Preference coach explicite pendant clarification carte finit en normal reply "Je ne l'ai pas note" | `response_owner=normal_reply`, `route_reason=orientation_clarification_topic_change`, aucune operation | Une preference coach explicite durable doit quitter la clarification et router `update_coach_preferences` en handoff no-mutation | `open` |  | clarification active + preference coach; anti-FP vraie sortie de sujet; invariant no DB write |
| `RERUN-B03` | T4 | `BF-ROUTE-03` | central arbitration / status guard | status guard trop prioritaire devant creation recurrente | "Je veux mettre en place un rappel recurrent..." est traite comme statut non enregistre | `selected_handler=status_recap`, `route_reason=status_only_request_blocks_tool_start`, aucun `create_recurring_reminder` | Une creation explicite de rappel recurrent doit battre `status_recap`; une question "est-il enregistre ?" doit rester status | `open` |  | rappel hebdo explicite; rappel avec heure; anti-FP status check |
| `RERUN-B04` | T8 | `BF-ROUTE-02` | active handoff arbitration / clarification arbitration | handoff defense actif rend l'interruption preference trop conservatrice | Preference coach explicite pendant carte de defense demande "modifier tes preferences ou continuer" | `response_owner=orientation_clarification`, `route_reason=clarification_required`, `tool_skill_intents=update_coach_preferences explicit/high` | Une intention `update_coach_preferences` explicite/high doit interrompre un handoff plateforme non-preference sans clarification inutile | `open` |  | defense handoff + preference explicite; attack handoff + preference explicite; anti-FP "redis-moi quoi changer" |
| `RERUN-B05` | T10 | `BF-STATE-01` | active handoff state / suspended flow restoration | interruption preference clear le contexte precedent sans snapshot restaurable | "reprends la carte de defense d'avant" revient au bon skill mais perd le draft | `selected_handler=prepare_defense_card`, `route_reason=prepare_defense_card_interrupts_active_handoff`, `operation_status=ask_question` | Suspendre le handoff precedent quand une preference l'interrompt, puis restaurer son draft sur une reprise explicite | `open` |  | defense -> preference -> reprise; attack -> preference -> reprise; anti-FP nouveau sujet |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-02 | Ne pas corriger pendant ce rerun | Demande utilisateur explicite: "pas de corrections pendant les run" | Codex | conversation |
| 2026-06-02 | Conserver les bugs ouverts malgre certains correctifs unitaires precedents | Le rerun reel montre encore des regressions ou des cas non couverts | Codex | report rerun |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-02 | `CFX-B03` precedent | Preference handoff actif puis reprise rappel recurrent | verifie vert: `create_recurring_reminder_interrupts_active_handoff`, no mutation | T6 du rapport |
| 2026-06-02 | `CFX-B05` precedent | Clarification defense/preference puis "je choisis les preferences coach" | verifie vert: `update_coach_preferences_interrupts_active_handoff`, no mutation | T9 du rapport |
| 2026-06-02 | invariant no-mutation | Tous les tours observes | vert: `executed_tools=[]`, `committed_effects=[]`, `pending_confirmation=null` | rapport section systeme |
