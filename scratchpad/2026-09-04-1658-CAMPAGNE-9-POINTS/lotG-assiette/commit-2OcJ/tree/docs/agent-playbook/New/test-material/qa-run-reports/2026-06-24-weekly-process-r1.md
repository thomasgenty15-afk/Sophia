# QA Run Report - Weekly Process R1

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `weekly-qa-20260624-r1-partial_habits_mission_partial`
- Persona: connexion temporaire locale `qa-weekly-deep-weekly-qa-20260624-r1-partial_habits_mission_partial@example.com`
- Objectif: tester le flow weekly en demarrant par le vrai chemin local `process-checkins`, avec un tour 0 proactif, puis continuation IA reelle.
- Trajectoire: fixture weekly dynamique semaine 2026-06-15 -> 2026-06-21 -> Tour 0 via `/functions/v1/process-checkins` -> 6 tours utilisateur via `/functions/v1/test-send-message`.
- Surfaces visees: `process-checkins`, `scheduled_checkins`, active state `weekly_adaptive_review_v1`, reducer weekly, confirmation/apply attempt, EffectLedger, DB.
- Cadre IA reel: Supabase local, execution hors sandbox, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Le run part bien de `process-checkins`; les 6 tours utilisateur sont HTTP 200 non vides avec `response_owner=weekly_adaptive_review_v1`.

Artefacts:
- Setup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r1-partial_habits_mission_partial/setup.json`
- Transcript brut/state: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r1-partial_habits_mission_partial/state.json`
- DB avant cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r1-partial_habits_mission_partial/db-after-run.json`
- Cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r1-partial_habits_mission_partial/cleanup.json`
- Verification cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260624-r1-partial_habits_mission_partial/cleanup-verify.json`
- Feuille bugs: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-24-weekly-process-r1-bugs.md`

Preuves Tour 0:
- `process_checkins.success=true`, `processed=2`; notre checkin cible `6c0bf3dd-c65e-45ea-a948-6c493719319b` est passe `sent`.
- `processed=2` inclut un traitement local non lie au run; le checkin cible a `delivery_last_error=null`.
- `opening_source=process-checkins:weekly_adaptive_review_opening`.
- `plan_patch.requires_confirmation=true`, `operations=[insert_bridge_week]`.

Cleanup:
- Cleanup cible execute sur le user temporaire; `errors=[]`, Auth delete `200`.
- Verification finale separee: `user_chat_states=0`, `chat_messages=0`, `scheduled_checkins=0`, `profiles=0`.

## 2. Tours De Conversation

### Tour 0 - Process Checkins / Ouverture Weekly

**Verdict du tour:** green

**User**
> Aucun message utilisateur. Declenchement proactif via `process-checkins`.

**Sophia**
> C’est le moment du bilan de ta semaine : j’ai une vue simple de ce qui a avancé et de ce qui est resté un peu ouvert.
> Entre la fatigue de milieu de semaine et les points plus lourds en fin de semaine, comment tu l’as vécue dans l’ensemble ?

**Trace courte**
- http_status: 200 sur `process-checkins`
- process_checkins: `success=true`, `processed=2`
- scheduled_checkin_status: `sent`
- active_skill_state: `weekly_adaptive_review_v1`
- weekly_payload: `daily_evidence_summary.source=daily_action_review_v1`, `week_strategy.decision=bridge_week`
- plan_patch: `requires_confirmation=true`
- durable_effect: ouverture weekly persistee; aucun patch de plan applique

### Tour 1

**Verdict du tour:** green

**User**
> Je l'ai vécue comme une semaine un peu hachée : lundi et mardi ça m'a aidé, puis la fatigue a repris le dessus. Je veux garder les repères qui fonctionnent, mais alléger la suite au lieu de me remettre la même pression.

**Sophia**
> La semaine a été un peu hachée, avec quelques repères qui ont aidé au début puis la fatigue qui a repris le dessus. Au global, tu sens que tu avances vers ton objectif, même un peu, ou plutôt pas vraiment ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- safety: `risk_band=none`
- operation: `confirm_weekly_diagnostic`
- visible_task: `ask_global_progress_feeling`
- durable_effect: `EffectLedger.committed=0`

### Tour 2

**Verdict du tour:** green

**User**
> Oui, il y a quand même un petit pas en avant : j'ai vu que les repères simples m'aident, mais que le soir tard il faut une version minimale déjà décidée.

**Sophia**
> Je vois un levier clair : garder tes repères simples, mais viser une version plus légère le soir pour éviter de remettre la même pression. Qu’est-ce qui doit être allégé en premier : la fréquence, le contenu, ou le moment ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- operation: `confirm_weekly_diagnostic`
- visible_task: `qualify_solution_fit`
- weekly_gates: `global_progress_status=captured`, `solution_fit_status=needs_deeper`
- durable_effect: `EffectLedger.committed=0`

### Tour 3

**Verdict du tour:** green

**User**
> Allège surtout le contenu : garder le point positif et la respiration, mais en version très courte les soirs tardifs. Le signal de pause, je veux juste le finir sans pression. Propose-moi la synthèse weekly, sans appliquer de changement de plan pour l'instant.

**Sophia**
> Ta semaine a été un peu hachée : les premiers jours t’ont aidé, puis la fatigue a repris le dessus en fin de semaine. Côté actions, tu as tenu plusieurs repères simples, mais certaines occurrences sont restées partielles ou manquées, surtout quand tu es rentrée tard ou que ça devenait trop lourd. Tu avances quand même vers ton objectif global : tu vois mieux ce qui te soutient, et tu as déjà repéré qu’une version minimale décidée à l’avance le soir peut t’éviter de te remettre la même pression. Le levier que j’ai identifié, c’est bien de garder ces repères simples et de réduire encore la charge pour les moments les plus tardifs. On a bien la synthèse de cette semaine.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- operation: `recap_weekly`
- visible_task: `weekly_synthesis`
- direct_effects: []
- durable_effect: `EffectLedger.committed=0`

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Avant que je valide quoi que ce soit, dis-moi concrètement ce qui changerait pour la semaine suivante et ce qui resterait pareil. Je veux vérifier le détail, pas encore confirmer.

**Sophia**
> Ta semaine a été un peu hachée : les repères simples t’ont aidé au début, puis la fatigue a repris le dessus, surtout le soir tard. Côté actions, le point positif et la respiration ont été faits sur certains temps, mais sont restés seulement partiels ou manqués quand la soirée était trop chargée. Le signal de pause est lui aussi resté en attente, avec un brouillon commencé mais pas envoyé. Tu avances quand même un peu vers ton objectif global : tu vois plus clairement ce qui t’aide, et tu repères mieux le moment où il faut passer en version minimale. Le levier recommandé, c’est bien celui que tu as déjà nommé : garder le point positif et la respiration, mais en format très court le soir tardif, avec un signal de pause sans pression. La synthèse de cette semaine est donc claire : ce qui tient, tu le gardes ; ce qui pèse, tu l’allèges.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- operation: `explain_weekly_reasoning`
- visible_task: `weekly_synthesis`
- proposal_status: `none`
- durable_effect: `EffectLedger.proposed=0`, `committed=0`

**Analyse si yellow/red**
- Symptome: Sophia ne repond pas clairement au slot demande "ce qui changerait / ce qui resterait pareil"; elle refait surtout la synthese.
- Source amont probable: weekly visible task `explain_weekly_reasoning` / reducer state de proposition.
- Owner runtime: `weekly_adaptive_review_v1` reducer + visible prompt stage-specific.
- Meilleure correction selon les guidelines: faire produire une preview non-mutante structuree quand le user demande le detail avant confirmation, avec `platform_handoff.adjust_plan_item` ou au moins un `proposal_status=discussed_not_applied`.
- Pourquoi ce n'est pas un patch local: le contrat weekly interdit le patch de plan depuis le chat; il faut donc modeliser la preview/handoff au niveau du flow, pas ajouter une phrase.

### Tour 5

**Verdict du tour:** green

**User**
> D'accord pour le principe d'une semaine plus légère. Mais je ne valide pas encore un patch précis : confirme-moi seulement si tu as appliqué quelque chose dans le plan ou si on est encore au stade proposition.

**Sophia**
> Pour l’instant, c’est encore une proposition, pas un changement déjà fait. Ce qui bougerait : une version très courte les soirs tardifs, avec le contenu allégé et le signal de pause sans pression. Ce qui resterait : le point positif et la respiration.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- operation: `confirm_weekly_diagnostic`
- visible_task: `qualify_solution_fit`
- durable_effect: aucun patch applique; `EffectLedger.committed=0`

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow; `BF-LEDGER-01` - Claim sans trace runtime non-mutante

**User**
> Ok, je confirme explicitement cette version : semaine plus légère, point positif et respiration gardés en format très court les soirs tardifs, signal de pause à finir sans pression. Tu peux appliquer ce patch weekly si c'est bien ce que tu as en attente.

**Sophia**
> Ta semaine a été un peu hachée, avec un mieux au début puis la fatigue qui a repris le dessus. Tu as bien tenu certains repères simples, surtout le point positif et la respiration, mais le soir tard ça a souvent coincé, et le signal de pause est resté partiel. Le progrès global reste léger mais réel : tu vois mieux ce qui t’aide. Le levier recommandé, c’est de garder une version minimale déjà décidée pour les soirs tardifs. Je clôture ici la synthèse weekly : on est encore au stade proposition pour l’ajustement.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- operation: `confirm_weekly_diagnostic`
- visible_task: `weekly_closure`
- flow_state: `stage=closure`, `turn_count=6`, `max_turns=6`
- weekly_gates: `closure_status=missing`, `synthesis_status=needs_deeper`, `solution_fit_status=needs_deeper`
- proposal_status: `none`
- validation_unlock_status: `locked_until_weekly_complete`
- EffectLedger: `requested=0`, `proposed=0`, `committed=0`
- DB avant cleanup: `weekly_bilan_suggestion_events=0`, `whatsapp_pending_actions=0`, `user_plan_items=4` inchanges

**Analyse si yellow/red**
- Symptome: le message user est un `apply_attempt` explicite. Le weekly ne doit pas appliquer un plan depuis le chat, mais il devrait rendre un handoff non-mutant clair ou expliquer la destination produit. Ici, il dit cloturer tout en laissant `closure_status=missing`, `proposal_status=none`, `validation_unlock_status=locked_until_weekly_complete` et aucun event ledger `proposed`.
- Source amont probable: reducer weekly / confirmation handling / platform handoff policy.
- Owner runtime: `weekly_adaptive_review_v1` reducer + Confirmation Contract integration + EffectLedger adapter pour handoff non-mutant.
- Meilleure correction selon les guidelines: convertir `ok applique` en `apply_attempt` non-mutant, produire un `platform_handoff.adjust_plan_item` ou une reponse explicite "a faire dans Plan", tracer `proposed/delivered`, puis synchroniser `closure_status` et `validation_unlock_status`.
- Pourquoi ce n'est pas un patch local: le contrat dit que weekly n'est pas executor de plan; le fix doit vivre dans la state machine et le handoff platform, pas dans une regex ou une phrase de refus.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- L'ouverture Tour 0 est naturelle et vient du vrai `process-checkins`.
- Les tours 1-3 reprennent le bilan sans refaire tout le daily action par action.
- Tour 5 est clair et sain: Sophia dit que rien n'a ete applique.

**Problemes**
- Tour 4: la demande de preview precise est seulement partiellement satisfaite. Famille: `BF-STATE-01`. Impact: l'utilisateur doit redemander pour distinguer proposition et changement concret. Severite: yellow.
- Tour 6: la confirmation explicite ne produit pas de suite utile; Sophia dit cloturer mais reste au stade proposition. Famille: `BF-STATE-01` / `BF-LEDGER-01`. Impact: experience bloquee au moment ou le user veut passer a la suite. Severite: red systeme, yellow humain.

**Fix propose**
- Source amont: weekly reducer / visible task selection / handoff platform.
- Correction recommandee: apres demande de preview, rendre une proposition structuree non-mutante; apres `apply_attempt`, expliquer que le weekly ne modifie pas le plan depuis le chat et livrer le handoff Plan attendu.
- Tests d'invariant attendus: preview sans confirmation, confirmation prudente sans commit, `ok applique` -> `apply_attempt` non-mutant, validation unlock seulement quand `closure_status=complete`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le bug historique de routing est corrige sur ce run: T1-T6 ont `response_owner=weekly_adaptive_review_v1`, `selected_handler=weekly_adaptive_review_v1`, `reason_code=active_weekly_adaptive_review`.
- L'active state weekly est bien repris apres le Tour 0.

**Skills / Operations / Tools**
- Operations observees: `confirm_weekly_diagnostic`, `recap_weekly`, `explain_weekly_reasoning`.
- Aucun executor de plan n'est appele, ce qui est correct: le contrat weekly interdit les mutations de plan depuis le chat.
- Probleme: aucun `platform_handoff.adjust_plan_item`, aucun `proposal_status=discussed_not_applied`, aucun event EffectLedger `proposed/delivered` n'est emis au moment ou le user demande puis confirme le detail.

**Memory / Effets durables**
- `plan_patch.requires_confirmation=true` est present dans le payload Tour 0.
- Aucun patch de plan n'a ete applique sans confirmation; `user_plan_items` restent au nombre de 4 et `weekly_bilan_suggestion_events=0`.
- Etat final pre-cleanup: `stage=closure`, mais `closure_status=missing`, `synthesis_status=needs_deeper`, `validation_unlock_status=locked_until_weekly_complete`, `proposal_status=none`.
- Cleanup cible OK apres verification separee: 0 `user_chat_states`, 0 `chat_messages`, 0 `scheduled_checkins`, 0 `profiles`.

**Problemes**
- Tour 4: preview non-mutante non modelisee. Famille: `BF-STATE-01`. Impact systeme: la demande de detail ne fait pas avancer `proposal_status`.
- Tour 6: confirmation/apply attempt non converti en handoff non-mutant et etat de cloture contradictoire. Familles: `BF-STATE-01`, `BF-LEDGER-01`. Impact systeme: visible claim de cloture sans state complete, pas de trace `proposed/delivered`, validation encore verrouillee.

**Fix propose**
- Source amont: `weekly_adaptive_review_v1` local dispatcher/reducer + Confirmation Contract + EffectLedger platform handoff.
- Correction recommandee: implementer la transition `apply_attempt` weekly comme non-mutante, avec `platform_handoff.adjust_plan_item`, `proposal_status` explicite, EffectLedger `proposed/delivered`, et cloture coherente quand la synthese est terminee.
- Tests d'invariant attendus:
  - `process-checkins` weekly -> T1 route `weekly_adaptive_review_v1`.
  - Demande "detail avant validation" -> preview structuree, no commit.
  - "je ne valide pas encore" -> no commit + statut proposition clair.
  - "ok applique" -> `apply_attempt`, no plan mutation, handoff/destination explicite.
  - `weekly_closure` visible -> `closure_status=complete` ou pas de claim de cloture.

## Verdict Global

- Verdict: red
- Raison principale: le run est valide et le routing weekly fonctionne, mais la phase proposition/confirmation reste incoherente: preview non structuree, `apply_attempt` non traite, cloture visible sans cloture state, aucun handoff/ledger non-mutant.
- Follow-up prioritaire: corriger la state machine weekly pour preview + apply attempt non-mutant, puis relancer ce scenario depuis `process-checkins`.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-24-weekly-process-r1-bugs.md`
