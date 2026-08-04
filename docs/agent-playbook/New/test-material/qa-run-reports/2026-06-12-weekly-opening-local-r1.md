# QA Run Report - Weekly Opening Local R1

## 1. Contexte Du Test

- Date: 2026-06-12, Europe/Paris.
- Run: `weekly-opening-r2-partial_habits_mission_partial`.
- Persona: connexion temporaire `qa-weekly-deep-weekly-opening-r2-partial_habits_mission_partial@example.com`.
- Objectif: verifier le weekly depuis le message d'introduction, puis la conversation active: ouverture weekly -> reponse user avec ressenti/progression -> detour Plan -> retour weekly -> cloture.
- Trajectoire: opening IA weekly -> `weekly_adaptive_review_v1` actif -> `adjust_plan_item` child flow -> retour `weekly_adaptive_review_v1`.
- Surfaces visees: opening weekly, dispatcher local weekly, `felt_progress`, note_information, handoff local Plan, no-chat-mutation, validation unlock.
- Cadre IA reel: ouverture generee par `generateWeeklyAdaptiveReviewOpening` avec IA reelle; tours user via `/functions/v1/test-send-message`, `force_full_ai=true`, Supabase local.
- Validite QA: partielle/yellow. Le vrai endpoint `process-checkins` n'a pas ete appele, car la file locale contenait deja des checkins pending hors scope et `process-checkins` n'a pas de filtre QA cible. Appeler `force=true` aurait traite des donnees hors perimetre. L'ouverture utilise le meme generateur que `process-checkins`, mais elle a ete inseree par le setup QA.
- Incidents: un premier setup `weekly-opening-r1` a echoue car les cles IA n'etaient pas chargees dans le runtime Deno direct; cleanup cible effectue. Un premier essai du tour 2 a renvoye `502` upstream; le message user de ce retry a ete supprime par `request_id`, puis le tour a ete rejoue avec succes.
- Nettoyage: cleanup cible effectue sur le user temporaire `weekly-opening-r2`; 13 actions de suppression/restauration, incluant tables user, profile et auth user.

## 2. Tours De Conversation

### Tour 0 - Opening

**Verdict du tour:** green

**Sophia**
> C'est l'heure de notre point de fin de semaine pour faire le bilan sur ton rythme de soirée. On avait prévu plusieurs moments pour souffler et partager du positif, et même si la fatigue a rendu les derniers jours plus difficiles, tu as quand même réussi à en faire une partie. Comment est-ce que tu as vécu cette semaine dans l'ensemble ?

**Trace courte**
- source: `weekly_deep_qa_setup`, generateur `generateWeeklyAdaptiveReviewOpening`
- event_context: `weekly_progress_review_v2`
- opening IA: oui
- question_count: 1
- pas de proposition carte/potion/rappel/Plan en ouverture
- limite: pas emis directement par `process-checkins` endpoint

### Tour 1

**Verdict du tour:** green

**User**
> Je l'ai vecue en deux temps: debut de semaine encourageant, puis fatigue forte jeudi-vendredi. Par rapport a mon objectif global, j'ai quand meme l'impression d'avancer un peu, mais ca reste fragile. Je veux surtout comprendre ce qu'il faut alleger.

**Sophia**
> Tu as fait de beaux efforts cette semaine, même si la fatigue a pesé sur les derniers jours. Pour la suite, je te propose de passer sur un rythme plus léger en réduisant le nombre d'actions prévues. Cela te permettrait de garder ta dynamique sans t'épuiser. Est-ce que cette direction te semble plus adaptée à ton énergie actuelle ?

**Trace courte**
- http_status: 200, `ok=true`
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- global dispatcher: bloque par `active_weekly_review_uses_local_dispatcher`
- flow_action: `answer_weekly_question`
- visible_task: `weekly_reading`
- human_signals: `objective_delta=slight_progress`, `felt_state=tired_but_ok`
- felt_progress: `encouraged`
- direct_effects/executed_tools/committed_effects: aucun

### Tour 2a - Incident Retry

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-TEST-01` — trace/test incoherent ou suite malsaine

**User**
> Oui, cette direction colle. Pour la semaine prochaine, ajuste surtout Respiration de pause: je veux la garder seulement mardi, pas mardi et jeudi, et que ca reste tres leger. Ensuite on revient au bilan weekly.

**Sophia**
> (reponse vide, HTTP 502)

**Trace courte**
- http_status: 502
- response body: `{"message":"An invalid response was received from the upstream server"}`
- trace Sophia: absente
- effet durable observe avant retry: aucun changement Plan; le message user avait ete persiste

**Analyse si yellow/red**
- Symptome: upstream 502 sans trace exploitable.
- Source amont probable: environnement local Edge/runtime, pas le dispatcher weekly.
- Owner runtime: testability/local runtime.
- Meilleure correction selon les guidelines: rendre le runner de retry capable de ne pas persister les tours 502, ou exposer une trace d'erreur exploitable.
- Pourquoi ce n'est pas un patch local: le flow weekly a fonctionne au retry; le probleme est la robustesse du chemin QA.

### Tour 2b - Retry

**Verdict du tour:** green

**User**
> Oui, cette direction colle. Pour la semaine prochaine, ajuste surtout Respiration de pause: je veux la garder seulement mardi, pas mardi et jeudi, et que ca reste tres leger. Ensuite on revient au bilan weekly.

**Sophia**
> C'est tout à fait compréhensible de vouloir alléger ton programme avec cette fatigue de fin de semaine. Pour ton activité 'Respiration de pause', l'idée est donc de réduire sa fréquence et son intensité. Pour effectuer ce changement, rends-toi dans ton Plan : juste en dessous de ton niveau actif, tu trouveras l'option 'Ajuster mon plan'. Tu pourras y saisir cette proposition : Pour la semaine prochaine, réduire 'Respiration de pause' : la programmer uniquement le mardi (supprimer le jeudi) et passer sur un format très léger.

**Trace courte**
- http_status: 200, `ok=true`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `weekly_adaptive_review_v1_handoff_to_adjust_plan_item`
- global dispatcher: bloque par `weekly_adaptive_review_v1_handoff_to_adjust_plan_item_skips_global_dispatcher`
- note_information: presente dans `turn_frame`, `source_flow_id=weekly_adaptive_review_v1`, `target_dispatcher=adjust_plan_item`, `handoff_reason=bridge`, `return_to_weekly=true`
- operation: `adjust_plan_item_local_plan_handoff_ready`
- platform_handoff: `status=delivered`, `no_chat_mutation=true`, `executable_from_chat=false`
- direct_effects/executed_tools/committed_effects: aucun

### Tour 3

**Verdict du tour:** green

**User**
> Ok, on revient au weekly. Cette version plus legere me rassure, et je pense que ca suffit pour conclure le bilan: je garde l'objectif, mais je veux moins me cramer.

**Sophia**
> C'est noté pour cette approche plus douce. On a bien pris en compte le besoin d'alléger le rythme pour mieux gérer ta fatigue. Ton bilan est terminé. Pour mettre en place les ajustements discutés, je t'invite à te rendre directement dans ton onglet Plan, car rien n'est modifié depuis notre échange. Prêt à passer à la suite ?

**Trace courte**
- http_status: 200, `ok=true`
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- global dispatcher: bloque par `active_weekly_review_uses_local_dispatcher`
- flow_action: `complete_flow`
- visible_task: `complete_no_change`
- child_flow: `status=completed`, `flow_id=adjust_plan_item`, `result_summary=adjust_plan_item_local_plan_handoff_ready`
- validation_unlock_status: `available`
- direct_effects/executed_tools/committed_effects: aucun
- Plan item `Respiration de pause`: `scheduled_days=["tue","thu"]`, `target_reps=2`; donc pas de mutation chat.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- L'ouverture est courte, naturelle, orientee bilan, sans outil propose trop tot.
- La question d'ouverture laisse de l'espace au ressenti et a l'avancee globale.
- Le tour 1 reprend bien la progression subjective et la fatigue sans refaire tout le bilan action par action.
- Le detour Plan est clair: Sophia explique quoi saisir dans le Plan et ne pretend pas appliquer depuis le chat.
- Le retour weekly est naturel et cloture le bilan.

**Problemes**
- T2a: incident technique 502. Famille: `BF-TEST-01`. Impact utilisateur en run reel: reponse vide. Severite: yellow dans ce run car le retry a fonctionne et aucun effet durable n'a ete observe.
- Contrainte de validite: opening non emis par `process-checkins` endpoint a cause de la file pending locale hors scope. Famille: `BF-TEST-01`. Impact QA: validation proactive partielle, meme si le message utilise le bon generateur IA.

**Fix propose**
- Source amont: testability/proactive runner.
- Correction recommandee: ajouter un mode QA cible a `process-checkins` (`scheduled_checkin_id` ou `user_id`) pour traiter uniquement le checkin du run.
- Tests d'invariant attendus: process-checkins cible un seul checkin, ne touche pas les pending hors scope, persiste opening + active_skill_state weekly, cleanup cible.

## 4. Analyse Systeme

**Verdict: green pour le flow weekly, yellow pour la testabilité proactive**

**Routage**
- Pendant le weekly actif, le global dispatcher est bloque aux tours 1 et 3.
- Le handoff Plan du tour 2 passe par `note_information`, puis `adjust_plan_item`.
- Le parent weekly reprend apres le child flow et cloture.

**Skills / Operations / Tools**
- `weekly_adaptive_review_v1` stabilise `objective_delta`, `felt_state`, `felt_progress`.
- `adjust_plan_item` recoit la demande comme child flow, produit un handoff plateforme, et ne mute pas le Plan.
- `validation_unlock_status` devient `available` seulement apres la cloture.

**Memory / Effets durables**
- Aucun effet durable chat: `direct_effects=[]`, `executedTools=[]`, `committed_effects=[]`.
- Les items DB ne changent pas: `Respiration de pause` reste `tue/thu`, `target_reps=2`.
- Cleanup cible du user temporaire effectue.

## Verdict Global

- Verdict: yellow.
- Raison principale: le flow weekly depuis ouverture fonctionne bien, mais la validation proactive stricte reste partielle car `process-checkins` ne peut pas etre appele de facon isolee dans cette DB locale.
- Follow-up prioritaire: ajouter/ utiliser un filtre QA cible sur `process-checkins`, puis relancer le meme run avec opening emis directement par l'endpoint.
