# QA Run Report — status-recap-real-r5

## 1. Contexte Du Test

- Date: 2026-06-12 Europe/Paris
- Run: `status-recap-real-r5`
- Persona: `qa-skill`, connexion temporaire neuve `status_recap_status_recap_20260612_r5`, user `c11517ab-6682-46dd-a9b5-35ccbb902fea`
- Objectif: rerun IA reel apres assouplissement du prompt visible `status_recap`, pour verifier que la restitution n'utilise plus le format mecanique `Fait / Prévu / Fragile` hors stage explicite.
- Trajectoire: demande de point factuel read-only -> relance factuelle -> follow-up rappels annules -> demande de sources.
- Surfaces visees: dispatcher `status_recap`, active flow local, visible agent `status_compact`, stage `cancelled_objects`, stage `explain_sources`, projection DB, absence de mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer/fallback deterministe.
- Validite QA: valide. Le boot global a ete revalide par `deno check` avant run; les quatre tours ont repondu HTTP 200 via le chemin IA reel.

Artefacts:
- Raw: `tests/real-personas/qa-skill/runs/status_recap/2026-06-12-status-recap-real-r5.raw.json`
- Durable: `tests/real-personas/qa-skill/runs/status_recap/2026-06-12-status-recap-real-r5.durable.json`
- Cleanup: `tests/real-personas/qa-skill/runs/status_recap/2026-06-12-status-recap-real-r5.cleanup.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Tu peux me dire simplement ce qui est vraiment enregistré dans mon espace, sans rien changer ?

**Sophia**
> Voici l'état actuel de ton espace :
>
> Côté rappels, tu as un point hebdo chaque lundi à 08h45 et une relance pour le dossier budget le 13 juin à 09h30. Le rappel pour le devis est bien marqué comme annulé.
>
> Pour ton coaching, tes préférences sont réglées sur un ton chaleureux et direct, avec des messages courts et un focus sur la discipline.
>
> Enfin, je ne vois aucune carte d'attaque ou de défense enregistrée pour le moment.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `answer_status`
- visible_task: `status_compact`
- reason_code: `status_recap_local_answer_status`
- projection_summary: `one_shot_pending_count=1`, `one_shot_cancelled_recent_count=1`, `recurring_reminder_count=1`, `coach_preference_count=9`

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, fais-moi le point maintenant, en restant juste factuel.

**Sophia**
> Voici le point factuel sur ton espace. Côté rappels, tu as celui pour relire le dossier budget prévu le 13 juin à 09h30, et ton point hebdo actif chaque lundi à 08h45. Un rappel concernant un devis est annulé. Pour nos échanges, tes préférences sont configurées sur un ton chaleureux et direct, avec une priorité à la discipline et des messages courts.

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
- flow_action: `answer_status`
- visible_task: `status_compact`
- reason_code: `status_recap_local_answer_status`
- projection_summary: `one_shot_pending_count=1`, `one_shot_cancelled_recent_count=1`, `recurring_reminder_count=1`, `coach_preference_count=9`

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Et pour les rappels annulés, tu vois quelque chose ou pas ?

**Sophia**
> Oui, je vois effectivement un rappel annulé : il concernait l'ancien devis. C'est le seul qui apparaît comme supprimé dans ton historique récent.

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

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `a classifier` — visible style policy blocker

**User**
> Sur quoi tu t'appuies pour ce récap ?

**Sophia**
> Je n'arrive pas à formuler le status correctement, donc je préfère ne rien affirmer.

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
- flow_action: null
- visible_task: null
- reason_code: `status_recap_visible_agent_failed`
- projection_summary: null

**Analyse si yellow/red**
- Symptome: la demande de sources reste bien dans le flow local, le visible agent produit une bonne reponse, mais elle est rejetee par la policy visible transverse; Sophia renvoie ensuite un fallback technique visible et inutile.
- Source amont prouvee: `response_style_policy.visibleOutputStyleIssues` detecte faussement `vous` dans `rendez-vous`.
- Owner runtime: shared visible style policy / visible-agent rejection path.
- Meilleure correction selon les guidelines: supprimer le blocker regex transverse; garder le style en consigne de prompt, sans rejet aval par analyse de surface.
- Pourquoi ce n'est pas un patch local: le prompt `explain_sources` a correctement produit la reponse; le rejet vient d'un garde partage qui peut casser n'importe quel flow visible.

**Preuve DB ajoutee apres diagnostic**
- Table: `llm_raw_response_events`
- Ligne visible: `source=status_recap.visible.explain_sources`, `status=success`, `output_text` contient une reponse correcte.
- Cause exacte du rejet: la reponse contient `tes rendez-vous récurrents`; le garde regex anti-vouvoiement classe `rendez-vous` comme `forbidden_vouvoiement:vous`.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les Tours 1 et 2 ne sont plus robotiques: plus de grille `Fait / Prévu / Fragile`, pas de categorie imposee, restitution plus fluide.
- Le rappel annule est rendu comme annule, pas comme "fragile".
- Le flow reste local pendant les follow-ups; le user n'a pas besoin de reformuler comme un test.

**Problemes**
- Tour 4: la demande de sources reçoit un fallback technique visible apres rejet regex transverse. Famille: `a classifier`. Impact: rupture de confiance et de fluidite. Severite: red sur le tour.

**Fix propose**
- Source amont: `response_style_policy` et usage bloquant de `visibleOutputStyleIssues`.
- Correction recommandee: supprimer le blocker regex de style partage et ne plus rejeter une reponse visible sur cette base.
- Tests d'invariant attendus: un message visible contenant `rendez-vous` ne doit pas etre rejete; demande de sources apres `status_compact` -> `visible_task=explain_sources`, message visible cite les familles de sources filtrees sans nommer table/dispatcher.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1: `selected_handler=status_recap`, `route_reason=skill_entry_signal`.
- T2/T3/T4: `route_reason=active_status_recap_local_dispatcher`; `global_dispatcher` bloque.
- Aucun retour global silencieux observe.

**Skills / Operations / Tools**
- T1/T2: `answer_status`, `status_compact`, restitution naturelle.
- T3: `answer_cancelled_objects`, `cancelled_objects`, restitution correcte.
- T4: route locale correcte mais sortie `status_recap_visible_agent_failed`; le dispatcher local ne produit pas de `flow_action` visible dans la trace finale du failure.
- Aucun tool durable execute: `executed_tools=[]`, `durable_effect=null`.

**Memory / Effets durables**
- Seed r5: 1 rappel ponctuel pending, 1 rappel ponctuel cancelled, 1 rappel recurrent actif, 1 preference coach explicite, plus defaults coach systeme crees automatiquement.
- Cleanup final: artefacts du run supprimes (`chat_messages`, `scheduled_checkins`, rappel recurrent r5, `coach.tone`); `user_chat_states.temp_memory={}`. Les defaults coach systeme restent hors perimetre fixture.

**Problemes**
- `status_recap_visible_agent_failed` sur T4, cause prouvee par DB: faux positif du blocker regex de style sur `rendez-vous`.
- Les preferences coach defaults augmentent `coach_preference_count` a 9; cela n'a pas casse la conversation mais peut rendre les recaps plus bavards.

**Fix propose**
- Source amont: shared visible style policy.
- Correction recommandee: retirer le validateur regex bloquant; les contraintes de style doivent rester dans le prompt visible, pas dans un garde aval.

## Verdict Global

- Verdict: yellow
- Raison principale: la correction de style est validee sur T1-T3 en IA reelle locale, mais T4 expose un bug transverse de style policy: une reponse correcte `explain_sources` a ete rejetee par un faux positif regex sur `rendez-vous`.
