# QA Run Report — status-recap-real-r2

## 1. Contexte Du Test

- Date: 2026-06-12 Europe/Paris
- Run: `status-recap-real-r2`
- Persona: `qa-skill`, connexion temporaire `status_recap_status_recap_20260612_r2`, user `5aafed25-ae58-4413-bbe4-97da5b12d85d`
- Objectif: rerun IA reel apres fix prioritaire `status_recap` pour verifier que les follow-ups `rappels annules` et `sources` restent dans le dispatcher local.
- Trajectoire: demande de point factuel -> confirmation -> follow-up rappels annules -> demande de sources.
- Surfaces visees: dispatcher global, `flow_opportunity_verification`, `status_recap`, active flow state, DB projection, visible agent, no mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer/fallback deterministe. Services locaux non critiques arretes: imgproxy, analytics, vector, pooler; Auth/API/Functions disponibles.
- Validite QA: valide. Une premiere tentative de setup a echoue avant conversation sur doublon fixture `user_profile_facts`; runner temporaire rendu idempotent, puis run complet relance. Cleanup final verifie: `chat_messages`, `scheduled_checkins`, `user_recurring_reminders`, `user_profile_facts` a 0 pour le user temporaire; `user_chat_states.temp_memory={}`.

Artefacts:
- Raw: `tests/real-personas/qa-skill/runs/status_recap/2026-06-12-status-recap-real-r2.raw.json`
- Durable: `tests/real-personas/qa-skill/runs/status_recap/2026-06-12-status-recap-real-r2.durable.json`
- Cleanup: `tests/real-personas/qa-skill/runs/status_recap/2026-06-12-status-recap-real-r2.cleanup.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — Mauvais owner selectionne

**User**
> Peux-tu me faire un point factuel sur ce qui existe vraiment dans mon espace, sans rien modifier ?

**Sophia**
> Je peux te faire un point précis sur ce qui est actuellement enregistré dans ton espace, sans rien modifier. On regarde ça ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `status_recap_request_blocks_tool_start`
- safety: `low`
- direct_effects: []
- operation: `flow_opportunity_verification_offer_opportunity`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `offer_opportunity`
- visible_task: `offer_status_recap`

**Analyse si yellow/red**
- Symptome: le systeme demande encore une confirmation avant `status_recap`.
- Source amont probable: arbitration entree status explicite vs verification d'opportunite.
- Owner runtime: dispatcher / `flow_opportunity_verification`.
- Meilleure correction selon les guidelines: si une demande est explicitement read-only et factuelle, router directement `status_recap`; garder la verification pour une demande vague ou implicite.
- Pourquoi ce n'est pas un patch local: le visible agent n'est pas en faute; l'owner choisi avant le flow local ajoute la friction.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATUS-01` — Projection DB mal rendue

**User**
> Oui, fais-le maintenant, uniquement factuel et sans rien modifier.

**Sophia**
> Voici un point factuel sur tes rappels :
>
> Fait : Aucune action n'a été marquée comme terminée récemment.
> Prévu : Relire le dossier budget (13/06 à 09:30) et ton point hebdo (lundis à 08:45).
> Fragile : Aucun élément n'est actuellement identifié comme bloqué ou en retard.
>
> Est-ce que ce récapitulatif te convient ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_flow_opportunity_verification_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `answer_object_status`
- visible_task: `object_status`
- reason_code: `status_recap_local_answer_object_status`
- projection_summary: `one_shot_pending_count=1`, `one_shot_cancelled_recent_count=1`, `recurring_reminder_count=1`, `coach_preference_count=1`

**Analyse si yellow/red**
- Symptome: la projection contient `coach_preference_count=1` avec `coach.tone=warm_direct`, mais la reponse visible ne rend que les rappels.
- Source amont probable: stage visible `object_status` / instruction issue du handoff de verification qui oriente vers rappels au lieu de couvrir toutes les categories filtrees.
- Owner runtime: `status_recap` visible agent / conversation_context.
- Meilleure correction selon les guidelines: quand `requested_categories=["all"]` et que `coach_preferences` est present dans `filtered_facts`, le prompt visible doit rendre la preference ou expliciter qu'il limite volontairement le scope.
- Pourquoi ce n'est pas un patch local: il faut aligner le contrat du stage et le contexte visible, pas injecter une phrase fixe.

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Et côté rappels annulés, tu vois quelque chose ou rien du tout ?

**Sophia**
> Oui, je vois effectivement une trace d'un rappel qui n'est plus actif.
>
> Fait : Ton rappel pour le devis a été créé puis annulé.
> Prévu : Relire le dossier budget demain à 09:30.
> Fragile : Aucun autre rappel n'est marqué comme annulé ou incertain.
>
> Est-ce que tu veux que je vérifie un autre point ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_status_recap_local_dispatcher`
- blocked_paths: `global_dispatcher` blocked by `active_status_recap_uses_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `answer_cancelled_objects`
- visible_task: `cancelled_objects`
- reason_code: `status_recap_local_answer_cancelled_objects`
- projection_summary: `one_shot_cancelled_recent_count=1`, `one_shot_pending_count=1`, `recurring_reminder_count=1`

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Tu peux me dire sur quelles sources tu t’es basé pour ce point factuel ?

**Sophia**
> Je me base sur tes rappels enregistrés et sur l'historique de tes actions récentes, comme les annulations. C'est ce qui me permet de te donner un état des lieux factuel de ce qui est prévu ou non. Est-ce que tu veux que je vérifie un autre point ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_status_recap_local_dispatcher`
- blocked_paths: `global_dispatcher` blocked by `active_status_recap_uses_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `explain_sources`
- visible_task: `explain_sources`
- reason_code: `status_recap_local_explain_sources`
- projection_summary: `one_shot_pending_count=1`, `one_shot_cancelled_recent_count=1`, `recurring_reminder_count=1`, `coach_preference_count=1`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le bug critique R1 est corrige: les follow-ups "rappels annules" et "sources" restent dans le flow local au lieu de repartir vers `normal_reply` ou `flow_opportunity_verification`.
- Le ton est clair, read-only, sans promesse de modification.
- La reponse T3 est humainement utile: elle reconnait le rappel annule et garde le contexte du rappel actif.

**Problemes**
- Tour 1: confirmation supplementaire encore presente. Famille: `BF-ROUTE-01`. Impact: friction faible a moyenne. Severite: yellow.
- Tour 2: la preference coach presente en projection n'est pas rendue. Famille: `BF-STATUS-01`. Impact: confiance reduite dans un "point factuel sur tout l'espace". Severite: yellow.

**Fix propose**
- Source amont: arbitration d'entree status + stage visible `object_status`.
- Correction recommandee: entree explicitement factuelle/read-only -> `status_recap` direct quand confidence suffisante; stage visible compact/all doit couvrir `coach_preferences` si present.
- Tests d'invariant attendus: demande explicite status directe; `filtered_facts.coach_preferences.length>0` et `requested_categories=["all"]` -> preference rendue ou scope limite explicite; follow-up annules/sources restent locaux.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1 reste `flow_opportunity_verification`; acceptable si le dispatcher est incertain, mais ce message est suffisamment explicite pour viser un routage direct a terme.
- T2 passe bien en `status_recap`.
- T3 passe en `status_recap` avec `active_status_recap_local_dispatcher`; le global dispatcher est bloque.
- T4 passe en `status_recap` avec `active_status_recap_local_dispatcher`; le global dispatcher est bloque.

**Skills / Operations / Tools**
- `status_recap` produit `answer_object_status`, puis `answer_cancelled_objects`, puis `explain_sources`.
- Aucun tool durable execute: `executed_tools=[]`, `tool_execution=none`.
- Le contexte visible T3/T4 contient bien `one_shot_cancelled_recent_count=1`.

**Memory / Effets durables**
- Fixtures creees: 1 rappel ponctuel pending, 1 rappel ponctuel cancelled, 1 rappel recurrent actif, 1 preference coach.
- Etat avant cleanup apres T4: `__status_recap_flow_state_v1.status=active`, `turn_count=3`, `last_intent=durable_status`, projection summary conservee.
- Cleanup final: `chat_messages=[]`, `scheduled_checkins=[]`, `user_recurring_reminders=[]`, `user_profile_facts=[]`, `user_chat_states.temp_memory={}`.

**Problemes**
- T1: `BF-ROUTE-01`, non bloquant pour le fix prioritaire.
- T2: `BF-STATUS-01`, rendu incomplet de la preference coach.

**Fix propose**
- Source amont: dispatcher/arbitration initiale et prompt visible `status_recap.visible.object_status`.
- Correction recommandee: separer status explicite vs opportunite implicite; renforcer l'obligation de couverture des categories presentes dans `conversation_context.filtered_facts` pour les demandes globales.

## Verdict Global

- Verdict: yellow
- Raison principale: la regression prioritaire `BF-STATE-01` est corrigee en IA reelle locale; T3/T4 restent dans `status_recap` avec global dispatcher bloque. Deux irritants restent ouverts: confirmation initiale et preference coach non rendue au T2.
