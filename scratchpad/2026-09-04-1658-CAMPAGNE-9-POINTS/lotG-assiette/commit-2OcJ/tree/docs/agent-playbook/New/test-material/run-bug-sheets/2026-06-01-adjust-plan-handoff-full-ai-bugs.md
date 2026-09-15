# 2026-06-01 Adjust Plan Handoff Full AI Bugs

## Contexte

- Run: `qa-adjust-plan-handoff-real-20260601-{action,level,whole}`
- Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`
- Persona: connexions temporaires `qa-skill`
- Verdict run: red

## Bugs

### APH-20260601-B01

- Tours: action T2-T6, whole T1/T3
- Famille: `BF-LEDGER-02`
- Domaine owner: final response pipeline / renderer `adjust_plan_item`
- Source amont: le `skill_result.reply` contient la recommandation/handoff, mais la reponse visible est reduite a `Je ne l'ai pas modifié.`
- Symptome visible: l'utilisateur ne recoit pas la recommandation, les etapes Plan, ni la version a reprendre.
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=adjust_plan_item`, `status=handoff_delivered` pour action T2-T6, `executed_tools=[]`, `durable_effect=blocked`.
- Correction attendue: le renderer doit rendre le handoff draft complet en mode no-mutation, pas seulement le disclaimer ledger.
- Statut: open
- Fix reference: none
- Tests requis: integration full-AI action scope, confirmation courte, revision de draft, invariant "visible response includes recommendation + platform destination + no chat mutation".

### APH-20260601-B02

- Tours: action T5-T6
- Famille: `BF-STATE-03`
- Domaine owner: `adjust_plan_item` handoff state / reducer
- Source amont: un handoff deja livre reste fige et ne prend pas en compte la correction utilisateur "2 minutes, sans creneau fixe".
- Symptome visible: Sophia repete le handoff precedent au lieu de reviser la recommandation.
- Preuve systeme: `status=handoff_delivered`, recommendation conservee `version courte, seulement quand la tension monte` apres demande explicite `une seule respiration de 2 minutes`.
- Correction attendue: l'etat temporaire handoff doit accepter une revision utilisateur et regenerer le draft no-mutation, sans basculer vers execution.
- Statut: open
- Fix reference: none
- Tests requis: action handoff delivered -> user revise -> handoff draft updated; confirmation "vas-y" still no executor.

### APH-20260601-B03

- Tours: level T3, level T5
- Famille: `BF-ROUTE-03`
- Domaine owner: central arbitrator / status recap priority
- Source amont: des messages de continuation du flow adjust plan sont captures comme `status_recap`.
- Symptome visible: "Je ne l'ai pas enregistré." au lieu de continuer l'ajustement du niveau.
- Preuve systeme: `route_reason=recap_only_request_supersedes_tool_flow`, `operation=status_recap`, `durable_effect=none`.
- Correction attendue: pendant un flow actif `adjust_plan_item`, les precisions de slots et reformulations de scope doivent rester proprietes du skill sauf vraie demande de recap explicite.
- Statut: open
- Fix reference: none
- Tests requis: active adjust plan level + "je garde seulement..." ne doit pas declencher status recap.

### APH-20260601-B04

- Tours: level T6
- Famille: `BF-ROUTE-01`
- Domaine owner: dispatcher / tool arbitration
- Source amont: "où le faire dans Plan" est interprete comme intention rappel via `create_one_shot_reminder`.
- Symptome visible: Sophia demande "le moment exact pour programmer ce rappel" alors que le user demande un handoff Plan.
- Preuve systeme: `operation=create_one_shot_reminder`, `status=needs_clarify`, `blocked_effects=[missing_time]`.
- Correction attendue: les mentions de "rappelle-moi / redis-moi" ou "où le faire" dans un flow platform handoff ne doivent pas etre mappees vers reminder sans intention temporelle claire.
- Statut: open
- Fix reference: none
- Tests requis: adjust plan active + "où le faire dans Plan" => platform handoff, pas reminder.

### APH-20260601-B05

- Tours: whole T1-T6
- Famille: `BF-INTAKE-01`
- Domaine owner: `adjust_plan_item` structured intake / clarification policy
- Source amont: le skill redemande des slots deja fournis, notamment transition, role de consolidation et validation par deux situations faciles.
- Symptome visible: sur-clarification repetitive, aucun handoff global apres 6 tours.
- Preuve systeme: `scope=whole_plan`, `readiness=draft_ready` dans coaching guidance, mais `status=ask_question` et `missing_slots=draft_generation_retry_needed` repetes.
- Correction attendue: la clarification doit respecter les decisions deja fournies et passer a une recommandation prudente whole-plan quand la cible, le but et les preservations sont clairs.
- Statut: open
- Fix reference: none
- Tests requis: whole-plan bridge/consolidation scenario en 4-6 tours produit handoff, no mutation, no micro patch.
