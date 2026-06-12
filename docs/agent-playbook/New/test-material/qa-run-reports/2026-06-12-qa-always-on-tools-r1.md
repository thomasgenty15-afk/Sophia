# QA Run Report - qa-always-on-tools-20260612-r1

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `qaalwayson20260612r1`
- Persona: connexion temporaire locale `alwayson_qaalwayson20260612r1`, user test local `aafd932f-452f-4d65-9972-52da8cc51b8a`
- Objectif: rechecker `create_one_shot_reminder` et `track_progress_plan_item`, en validant a la fois l'effet durable, la reponse naturelle et le passage de baton vers la reponse conversationnelle.
- Trajectoire: rappel ponctuel explicite -> confirmation naturelle -> log de progres sur une action active -> confirmation naturelle.
- Surfaces visees: dispatcher global, direct effects always-on, `create_one_shot_reminder`, `track_progress_plan_item`, active actions V2, EffectLedger, DB `scheduled_checkins`, DB `user_plan_item_entries`, message assistant final.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `Authorization: Bearer <ANON_KEY>`, `x-user-authorization: Bearer <access_token>`. Aucun renderer deterministe ni fallback direct.
- Validite QA: valide. Le run conversationnel final a ete mene tour par tour via le chemin IA reel local. Une tentative de setup runner a echoue avant conversation sur un champ `profiles.is_test_persona` inexistant; le runner temporaire a ete corrige, sans modification de code produit, puis le run valide a demarre.
- Nettoyage: effectue apres run. Supprimes: 1 `scheduled_checkins`, 1 `user_plan_item_entries`, 1 `system_runtime_snapshots`, 16 `conversation_runtime_events`, 4 `chat_messages`, 1 `user_chat_states`, la fixture plan/cycle/profil, le user Auth temporaire et le fichier de connexion temporaire. Verification finale: 0 artefact restant dans les tables de fixture et tables metier verifiees pour ce user.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Tu peux me mettre un rappel ponctuel demain à 8h40 pour relire mon brouillon client avant d'ouvrir Slack ?

**Sophia**
> C'est entendu, je t'ai bien programmé ton rappel pour demain à 8h40 afin que tu puisses relire ton brouillon client avant d'ouvrir Slack.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `risk_band=low`, side effects allowed
- direct_effects: `create_one_shot_reminder`, `explicitness=explicit`, `target_status=identified`, `confidence_band=high`
- handoff: `note_information.recommended_next_focus="Execute the one-shot reminder creation and confirm to the user."`
- executed_tools: [`create_one_shot_reminder`]
- EffectLedger: requested 1, allowed 1, committed 1, blocked 0, failed 0
- durable_effect: `scheduled_checkins.id=d410fdcb-2e00-4860-a106-3ca79cee68b6`, `scheduled_for=2026-06-13T06:40:00+00:00`, local `samedi 13 juin à 08:40`, `status=pending`, instruction `relire mon brouillon client avant d'ouvrir Slack`

### Tour 2

**Verdict du tour:** green

**User**
> Nickel. Et pour mon plan, je viens de faire le sas de décompression sans fumer : tapis sorti, respiration faite, pas de cigarette.

**Sophia**
> C'est noté, j'ai bien validé ton sas de décompression dans ton plan. Bravo pour ce réflexe !

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `track_progress_plan_item`
- route_reason: `normal_reply_default`
- safety: `risk_band=low`, side effects allowed
- direct_effects: `track_progress_plan_item`, `explicitness=explicit`, `target_status=identified`, `confidence_band=high`
- active action cible: `2ba3182a-2af1-4b52-b7c9-14efe51b8c4d`, `Faire le sas de decompression sans fumer`
- handoff: `note_information.recommended_next_focus="Confirm the tracking of the habit and provide positive reinforcement."`
- executed_tools: [`track_progress_plan_item`]
- EffectLedger: requested 1, allowed 1, committed 1, blocked 0, failed 0
- durable_effect: `user_plan_item_entries.id=e258b478-1f80-44f6-a4d7-9f7e7d7bc36d`, `entry_kind=checkin`, `outcome=completed`, `value_numeric=1`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le rappel ponctuel est confirme avec une phrase naturelle, complete et specifique: l'heure, l'objet et l'usage sont repris sans formulation mecanique.
- Le log de progres ne ressort plus en visible sous forme `Note pour ...: fait.`; Sophia confirme avec ses propres mots et ajoute une micro-reconnaissance adaptee.
- Le deuxieme tour reste conversationnel: l'utilisateur n'a pas besoin de formuler une commande technique pour que l'action active soit comprise.
- Le passage rappel -> plan est fluide: Sophia ne confond pas le rappel deja cree avec le suivi de progres.

**Problemes**
- Aucun probleme user-facing observe.
- Observation non bloquante: le runtime interne `__track_progress_plan_item_runtime.message` conserve encore une chaine legacy du type `Note pour ...: fait.` dans `temp_memory`, mais elle n'a pas ete utilisee comme reponse visible et a ete remplacee par une formulation conversationnelle dans `chat_messages`.

**Fix propose**
- Aucun fix requis pour ce scenario.
- Invariant a conserver: les `committed_effects` doivent etre transmis a la couche de reponse comme instruction de confirmation, et la reponse visible ne doit pas reutiliser le rendu technique du tool.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tour 1: le dispatcher detecte un direct effect `create_one_shot_reminder` explicite, cible identifiee, confiance haute. Le router selectionne `create_one_shot_reminder`.
- Tour 2: le dispatcher detecte `track_progress_plan_item` sur l'action active V2, cible identifiee, confiance haute. Le router selectionne `track_progress_plan_item`.
- Aucun active flow, pending confirmation ou signal safety ne bloque les side effects.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: succes. Le parser produit `scheduled_for=2026-06-13T06:40:00+00:00`, soit samedi 13 juin 2026 a 08:40 Europe/Paris pour le `client_now_iso=2026-06-12T10:00:00.000Z`.
- `track_progress_plan_item`: succes. La cible active creee pour le run est reconnue et logguee comme `completed` avec `value=1`.
- Le baton vers la reponse conversationnelle est visible dans `note_information.recommended_next_focus` et dans le message final sauvegarde avec `agent_used=companion`.

**Memory / Effets durables**
- Pendant le run: 1 rappel ponctuel cree dans `scheduled_checkins`; 1 entree de progres creee dans `user_plan_item_entries`; 1 snapshot `plan_item_entry_logged_v2`; 4 messages conversationnels.
- Apres cleanup cible: `scheduled_checkins=[]`, `user_plan_item_entries=[]`, `chat_messages=[]`, `profiles=[]`, `user_cycles=[]`, `user_transformations=[]`, `user_plans_v2=[]`, `user_plan_items=[]` pour le user du run.

**Problemes**
- Aucun probleme systeme bloquant observe.
- Note technique non bloquante: l'EffectLedger reference le progres via `db_ref.table=plan_item_progress_logs`, alors que la ligne durable verifiee est dans `user_plan_item_entries`. Ce decalage existait deja dans les traces precedentes et n'a pas affecte le commit ni le cleanup.

**Fix propose**
- Aucun fix requis avant validation green.
- Tests d'invariant recommandes: `create_one_shot_reminder` doit toujours confirmer l'heure et l'instruction depuis `committed_effects`; `track_progress_plan_item` doit confirmer naturellement depuis `committed_effects` et ne jamais exposer le rendu legacy `Note pour ...`.

## Verdict Global

- Verdict: green
- Raison principale: les deux outils direct effects fonctionnent via le chemin IA reel local, commitent les effets durables attendus, et la reponse visible confirme naturellement l'effet avec passage de baton conversationnel.
- Follow-up prioritaire: ajouter un invariant de regression sur l'absence de `Note pour ...` dans le message assistant visible de `track_progress_plan_item`.
