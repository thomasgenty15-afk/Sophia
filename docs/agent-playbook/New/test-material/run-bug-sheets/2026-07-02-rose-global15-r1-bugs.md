# Bug Sheet — rose-global15-r1 (2026-07-02)

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-02-rose-global15-r1.md`
Persona: Rose (web, force_full_ai). Verdict global: red.

## Résumé

- 13/15 tours `green`. Rappels ponctuels (création, recap, tentative d'annulation) tous fiables et vérifiés en DB — aucune régression sur ce périmètre.
- 1 tour `red` (T1) : un flow `safety_crisis` actif a capturé un message de suivi hebdomadaire neutre, bloquant tous les autres routers.
- 1 tour `yellow` net (T7) : promesse de mémorisation sans preuve d'effet durable.
- 1 tour `yellow` mineur (T11) : engagement conversationnel du skill coaching non tenu au tour suivant.

---

## R1-B01 — Flow safety actif capture un message neutre de suivi hebdomadaire

- Tours: 1
- Famille: BF-ROUTE-02 — ancien flow capture une nouvelle intention
- Domaine owner: `router/safety_crisis_runtime.ts` (`isActiveSafetyCrisisSkillState`, `withActiveSafetyFlowCaution`, `runtimeSafetyPregateForTurn`) + `skills/safety_crisis/reducer.ts`
- Source amont: un working state `safety_crisis` restait actif (probablement hérité d'un run/session antérieur sur ce compte de test) alors que le pregate safety du tour évaluait lui-même `turn_frame.safety.risk_band="none"`. `route_decision.active_flow_arbitration` a forcé `continue_active`/`active_owner=safety_crisis`, ce qui a bloqué explicitement `product_help`, `coaching_recommendation`, `plan_realignment`, `feature_opportunity` et `normal_reply` (`blocked_paths` avec `reason_code=active_safety_priority`).
- Symptôme visible: message "bon bilan de la semaine, j'ai tenu que 2 jours sans fumer sur les 3 prévus" reçoit une réponse ouvrant par "L'immédiat est stabilisé" et mentionnant le 3114, sans lien avec le contenu du message.
- Preuve système: `conversation_turn_trace` du tour 1 — `route_decision.reason_code="active_safety_crisis"`, `route_decision.selected_handler="safety_crisis"`, `skill_run.diagnosis.phase="resolved"`, `skill_run.diagnosis.reducer_reason_code="safety_crisis.resolved_exit"`. Le tour 2, après clarification explicite de Rose, retombe proprement sur `response_owner=normal_reply` avec `active_flow_arbitration=null`, confirmant que le flow s'est refermé correctement une fois confronté à un signal de désescalade explicite — mais qu'il n'aurait jamais dû se rouvrir sur un message neutre en premier lieu.
- Correction attendue (révisée, décision utilisateur): borne de fraîcheur générique des flows locaux — un `__active_skill_state` dont le dernier tour date de plus de 4h ne possède plus la conversation, quel que soit le flow (safety compris : le pregate ré-évalue chaque tour et ré-engage un flow frais si un vrai signal est présent). Purement structurel (timestamps du state), zéro regex.
- Tests requis: (1) positif — un flow safety actif avec un vrai signal de risque récent (10 min) doit rester bloquant ; (2) paraphrase — un message neutre après un flow périmé (5h) ne doit pas forcer `response_owner=safety` ; (3) anti-faux-positif — state sans timestamp exploitable conservé tel quel (jamais cassé par la fraîcheur).
- Statut: fix_applied (rerun requis — noter aussi : reset des flow states entre les runs QA pour ne plus polluer les T1)
- Fix reference: `router/active_flow_state.ts` — `isStaleActiveLocalFlowState` (TTL 4h sur `updated_at`/`started_at`) appliqué dans `activeLocalConversationSkillId` (couvre `readActiveFlowState` + `shouldSkipGlobalDispatcherForActiveLocalFlow`) et dans `isActiveSafetyCrisisSkillState` (`router/safety_crisis_runtime.ts`, couvre `withActiveSafetyFlowCaution`). Tests : `active_flow_state_test.ts` (« releases local flows stale for more than 4 hours », « safety crisis latch obeys the same staleness bound »).

## R1-B02 — Promesse de mémorisation sans effet durable vérifiable

- Tours: 7
- Famille: BF-MEMORY-01 — promesse mémoire non persistée
- Domaine owner: memory planner / memory writer (pipeline mémoire global)
- Source amont: `memory_plan.memory_mode="light"` avec `targets: []` — aucun candidat mémoire converti en écriture vérifiable. Le message utilisateur ("retiens un truc pour la suite: c'est toujours vers 20h30-21h que ça monte chez moi") est un repère comportemental explicitement demandé à retenir.
- Symptôme visible: Sophia répond "C'est noté, je le garde en tête ✅" — formulation de confirmation ferme.
- Preuve système: `select count(*) from memory_items where user_id='02dc9ae2-4128-412b-b0be-56712bf775a8'` = 0 avant et après le tour ; `memory_extraction_runs` et `memory_message_processing` également vides pour cet utilisateur sur toute la durée du run.
- Correction attendue (révisée, décision utilisateur): l'écriture est portée par le memorizer nocturne (`trigger-memorizer-daily`) — l'accusé est le comportement voulu. L'invariant QA change : déclencher le memorizer en fin de run quand une intention mémoire explicite a été émise, et vérifier `memory_items ≥ 1` avec le bon contenu **après le batch** (guidelines mises à jour : section « Memoire (Memorizer Nocturne) » de `14-qa-test-guidelines.md`).
- Tests requis: (1) positif — "retiens que je préfère X" doit produire un `memory_item` (ou équivalent committable) visible en DB dans la fenêtre du test ; (2) paraphrase — "note un truc sur moi: ..." doit suivre le même chemin ; (3) anti-faux-positif — une mention accessoire d'une préférence sans demande explicite de mémorisation ne doit pas forcer un write ; (4) cohérence renderer — si le write échoue ou est différé, la réponse visible ne doit pas dire "c'est noté" de façon catégorique.
- Statut: resolved_by_design (invariant QA corrigé ; rerun avec déclenchement du memorizer pour la preuve de bout en bout)

## R1-B03 — Engagement conversationnel du coaching non tenu au tour suivant

- Tours: 10, 11
- Famille: BF-ROUTE-01 (mineur, continuité de contenu dans le skill)
- Domaine owner: `coaching_recommendation` (skill conversation)
- Source amont: au tour 10, Sophia propose elle-même "on peut aussi regarder en une phrase ce qui te ferait sentir que ça avance vraiment". Au tour 11, Rose accepte explicitement ("ouais ça serait bien de voir ça en une phrase"), mais la réponse ne produit pas cette phrase et répète le pitch de la "potion de clarté" du tour précédent presque à l'identique.
- Symptôme visible: sentiment de radotage, l'engagement pris par Sophia elle-même n'est pas honoré au tour suivant.
- Preuve système: comparaison textuelle T10 vs T11 — même structure de phrase sur la potion de clarté, aucun contenu nouveau produit malgré l'acceptation explicite de Rose.
- Correction attendue: quand le skill `coaching_recommendation` propose un sous-livrable conversationnel et que l'utilisateur accepte, le tour suivant doit produire ce livrable concret plutôt que répéter la proposition de technique.
- Cause structurelle identifiée: les visible agents des skills ne recevaient QUE les messages user (filtre `role === "user"`, 5 messages) — l'agent ne pouvait pas savoir qu'il avait proposé « en une phrase » ; « ouais ça serait bien » n'avait aucun référent.
- Tests requis: (1) positif — accepter une proposition conversationnelle explicite du skill doit produire un contenu nouveau et non une répétition ; (2) anti-faux-positif — une acceptation ambiguë ne doit pas forcer un contenu halluciné si le skill n'a pas assez d'info.
- Statut: fix_applied (rerun requis)
- Fix reference: `skills/_shared/visible_history.ts` — historique canonique des visible agents avec les deux rôles (limite `subskillHistory=8`), branché sur les 5 skills conversationnels (coaching, plan_realignment, feature_opportunity, product_help, daily_action_coaching) à la place du filtre user-only/5 ; doctrine « continuité d'engagement » ajoutée à `COACHING_VISIBLE_GLOBAL_RULES` (sous-livrable proposé + accepté ⇒ le produire, jamais re-pitcher). Tests `context/user_identity_test.ts` (visible history) + test coaching mis à jour (l'historique contient désormais le message assistant).
