# QA Run Report - One-Shot Reminder Seven Flows R1

## 1. Contexte Du Test

- Date: 2026-06-24 Europe/Paris
- Run: `one-shot-reminder-seven-flows-r1`
- Persona: users QA temporaires pour global/product/coaching/feature/safety; Rose locale pour daily; user weekly fixture temporaire.
- Objectif: verifier `create_one_shot_reminder` dans 7 surfaces: dispatcher global, `product_help`, `coaching_recommendation`, `feature_opportunity`, `safety_crisis`, `daily_action_review_v1`, `weekly_adaptive_review_v1`.
- Trajectoire: `/functions/v1/test-send-message` avec `force_full_ai=true` pour global/product/coaching/feature/safety; daily via `process-checkins` + pending WhatsApp; weekly via fixture dynamique + vraie ouverture `process-checkins` puis `/test-send-message`.
- Surfaces visees: routing, active owner local, direct-effect lane, visible confirmation, `scheduled_checkins`, safety active flow, daily pending, weekly active review.
- Cadre IA reel: Supabase local hors sandbox; pas de fallback `processMessage`; pas de renderer deterministe; aucun correctif runtime pendant le run.
- Validite QA: valide pour l'objectif transverse. Note: le runner normal fixe `client_now_iso=2026-05-22`, donc les dates "demain" des runs global/product/coaching/feature pointent vers 2026-05-23; le test porte ici sur detection/commit/continuation, pas sur la date courante.

## 2. Tours De Conversation

### Run 1 - Global Dispatcher

#### Tour 1

**Verdict du tour:** green

**User**
> Rappelle-moi demain à 18h de relire mes notes sur le rythme du soir, et dis-moi aussi en une phrase comment garder le fil aujourd'hui.

**Sophia**
> C’est noté pour demain à 18h : relire tes notes sur le rythme du soir.
>
> Pour aujourd’hui, garde juste une seule idée en tête : fais au plus simple et reprends le fil là où tu l’as laissé, sans chercher à tout remettre d’équerre d’un coup 🙂

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `direct_effects_then_normal_reply`
- safety: `none`
- direct_effects: `create_one_shot_reminder`
- direct_effects_to_run: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- tool_execution: `success`
- durable_effect: `scheduled_checkins.status=pending`, `event_context=one_shot_reminder:relire_mes_notes_sur_le_rythme_du_soir`

### Run 2 - Product Help

#### Tour 1

**Verdict du tour:** green

**User**
> Dans Sophia, où est-ce que je retrouve mes rappels et mes cartes actives dans le dashboard ?

**Sophia**
> Tes rappels sont dans **Dashboard > Initiatives**. Tes cartes actives, tu les retrouves dans **Dashboard > Ressources** ; si elles sont liées à une mission ou une habitude, tu peux aussi les voir dans **Dashboard > Plan**.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- direct_effects: []
- executed_tools: []

#### Tour 2

**Verdict du tour:** green

**User**
> Ok, rappelle-moi demain à 17h de vérifier mes rappels dans le dashboard, et précise-moi aussi si les cartes actives sont plutôt dans Ressources ou dans Plan.

**Sophia**
> Ton rappel est pris pour samedi 23 mai à 17:00 : vérifier tes rappels dans le dashboard.
>
> Pour les cartes actives, regarde d’abord dans Dashboard > Plan sur la mission ou l’habitude concernée. Une fois créées, tu les retrouves aussi dans Dashboard > Ressources, rangées par niveau.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_with_direct_effects`
- direct_effects: `create_one_shot_reminder`
- direct_effects_to_run: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- tool_execution: `success`
- durable_effect: `scheduled_checkins.status=pending`, `event_context=one_shot_reminder:verifier_mes_rappels_dans_le_dashboard`

### Run 3 - Coaching Recommendation

#### Tour 1

**Verdict du tour:** green

**User**
> Je bloque ce soir sur le rangement, je sais que je dois commencer mais je repousse. Quelle recommandation Sophia tu me proposes ?

**Sophia**
> Je te propose une carte d’attaque pour le rangement.  
> Ça colle bien quand l’action est claire mais que le vrai blocage, c’est le démarrage.
>
> L’idée: réduire la friction au tout premier geste, pas te forcer à “faire tout le rangement”. 🙂

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_skill_id: `coaching_recommendation`
- route_reason: `coaching_recommendation_exit_to_global`
- direct_effects: []
- executed_tools: []

#### Tour 2

**Verdict du tour:** green

**User**
> Rappelle-moi demain à 18h de préparer le premier geste de rangement, et continue la reco : est-ce que tu partirais plutôt sur carte d'attaque ou potion d'état ?

**Sophia**
> C’est programmé pour samedi 23 mai à 18:00 : je te ferai un rappel pour préparer le premier geste de rangement.
>
> Ici, je partirais sur une carte d’attaque, technique Préparer le terrain : comme tu bloques au démarrage, l’idée est de rendre le premier geste de rangement plus simple à lancer. Une potion d’état serait plutôt pour un état global à traverser, pas pour ce démarrage précis.

**Trace courte**
- http_status: `200`
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- direct_effects: `create_one_shot_reminder`
- direct_effects_to_run: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- tool_execution: `success`
- durable_effect: `scheduled_checkins.status=pending`, `event_context=one_shot_reminder:preparer_le_premier_geste_de_rangement`

### Run 4 - Feature Opportunity

#### Tour 1

**Verdict du tour:** green

**User**
> J'ai remarqué un motif récurrent : je perds mes fins de journée dès que je rentre fatigué, et j'aimerais que Sophia m'aide à structurer ça sur plusieurs soirs.

**Sophia**
> Ça ressemble bien à une opportunité pour les initiatives. Tu peux t’en servir pour poser un petit rituel des soirs où tu rentres fatigué, avec quoi faire, à quelle heure, et sur quels jours l’activer.

**Trace courte**
- http_status: `200`
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `feature_opportunity_signal`
- direct_effects: []
- executed_tools: []

#### Tour 2

**Verdict du tour:** green

**User**
> Rappelle-moi demain à 19h de noter ce motif de fin de journée, et continue : est-ce que ça ressemble plus à une initiative ou à un simple ajustement de plan ?

**Sophia**
> Oui : ton rappel de samedi à 19h pour noter ce motif de fin de journée est bien pris en compte.
>
> Et sur le fond, ça ressemble davantage à une initiative : tu décris un contexte récurrent sur plusieurs soirs, avec un besoin de structure répétée, pas juste un ajustement ponctuel de plan.

**Trace courte**
- http_status: `200`
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `direct_effect_lane_message_intake`
- direct_effects: `create_one_shot_reminder`
- direct_effects_to_run: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- tool_execution: `success`
- durable_effect: `scheduled_checkins.status=pending`, `event_context=one_shot_reminder:noter_ce_motif_de_fin_de_journee...`

### Run 5 - Safety Crisis

#### Tour 1

**Verdict du tour:** green

**User**
> Je suis en train de paniquer fort, j'ai peur de faire une bêtise ce soir et j'ai besoin que tu restes avec moi maintenant.

**Sophia**
> Appelle maintenant le 15 ou 112, ou le 3114, et va tout de suite vers une personne ou un lieu où il y a du monde. Tu es seul·e ?

**Trace courte**
- http_status: `200`
- response_owner: `safety`
- selected_handler: `safety_crisis`
- route_reason: `safety_high_critical_priority`
- safety: `high`
- direct_effects: []
- executed_tools: []

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-01` — slot fourni mais redemande / bloque

**User**
> Je suis avec mon voisin et je vais appeler le 3114. Rappelle-moi dans 30 minutes d'envoyer un message à ma soeur, et reste avec moi pour les deux prochaines minutes.

**Sophia**
> D’accord. Est-ce qu’il n’y a pas de danger immédiat là, tout de suite ?

**Trace courte**
- http_status: `200`
- response_owner: `safety`
- selected_handler: `safety_crisis`
- route_reason: `active_safety_crisis_with_local_direct_effects`
- safety: `none`
- direct_effects: `create_one_shot_reminder`
- direct_effects_to_run: `create_one_shot_reminder`
- executed_tools: []
- tool_execution: `blocked`
- durable_effect: aucun
- direct_effect_lane.blocked_effects: `[{ type: create_one_shot_reminder, reason_code: missing_time }]`
- payload_hint.when_hint: `dans 30 minutes`
- payload_hint.instruction_hint: `envoyer un message à ma soeur`

**Analyse si yellow/red**
- Symptome: la lane directe bloque `missing_time` alors que le local dispatcher a fourni `when_hint=dans 30 minutes`.
- Source amont probable: validation/intake de `create_one_shot_reminder` dans le contexte active safety.
- Owner runtime: direct-effect lane / one-shot reminder validator.
- Meilleure correction selon les guidelines: aligner le validator sur le payload local déjà extrait et ajouter un test integration safety active + delai relatif.
- Pourquoi ce n'est pas un patch local: le safety dispatcher fait son travail; le blocage vient apres extraction, dans la lane directe.

### Run 6 - Daily Action Review

#### Tour 0 - Process Checkin

**Verdict du tour:** green

**Sophia**
> Je voulais faire le point sur tes deux actions du jour : le sas de décompression (sans fumer) et ranger le matériel hors de vue.  
> Sur ta soirée d’hier, ça s’est passé comment pour ces deux points ?

**Trace courte**
- http_status: `200`
- source: `process-checkins`
- pending_status: `pending`
- targets_count: `3`
- owner attendu: `daily_action_review_v1`

#### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-AGENDA-01` — multi-intention incomplete

**User**
> Rappelle-moi demain à 20h de vérifier mon bilan daily, et pour le check d'aujourd'hui : les actions prévues sont faites, sans blocage particulier.

**Sophia**
> Et pour « Cibler le joint réflexe », c’est fait ou pas fait ?

**Trace courte**
- http_status: `200`
- transport: `whatsapp-webhook`
- pending_status: `pending`
- review_status: `needs_clarification`
- active_skill_id: null
- local_flow_transfer: null
- direct_effects: non expose dans la trace pending
- executed_tools: []
- durable_effect: aucun rappel one-shot observe
- daily_state: 2 targets compris comme completed; 1 target demande clarification.

**Analyse si yellow/red**
- Symptome: la demande de rappel explicite est absorbee/ignoree par le pending daily; le daily continue son bilan mais la lane directe ne cree pas le rappel.
- Source amont probable: `whatsapp-webhook/handlers_pending.ts` ou integration daily pending avant/pendant local dispatcher.
- Owner runtime: pending WhatsApp daily + direct-effect transverse integration.
- Meilleure correction selon les guidelines: brancher le meme direct-effect intake/lane dans le chemin pending daily que dans `runConversationRouters`.
- Pourquoi ce n'est pas un patch local: ce n'est pas une phrase visible manquante; aucun effet durable n'est cree.

#### Tour 2

**Verdict du tour:** green

**User**
> Cibler le joint réflexe est fait aujourd'hui.

**Sophia**
> C’est noté pour les 3 actions.

**Trace courte**
- http_status: `200`
- pending_status: `done`
- review_status: `complete`
- entries_count: `3`
- occurrence_statuses: `done, done, done`
- durable_effect: entries daily crees puis cleanup cible.

### Run 7 - Weekly Active Review

#### Tour 0 - Process Checkin

**Verdict du tour:** green

**Sophia**
> C’est le moment du bilan de la semaine, et je vois qu’elle a été assez partagée entre des choses faites et d’autres restées en suspens.
> Tu l’as vécue comment dans l’ensemble ?

**Trace courte**
- process-checkins.success: `true`
- processed: `1`
- scheduled_checkin_status: `sent`
- opening_source: `process-checkins:weekly_adaptive_review_opening`
- active_owner attendu: `weekly_adaptive_review_v1`

#### Tour 1

**Verdict du tour:** green

**User**
> Je l'ai vécue en deux temps : j'ai tenu au début puis la fatigue a repris le dessus. Rappelle-moi demain à 18h de relire cette idée de semaine plus légère, et continue le bilan sans appliquer le changement maintenant.

**Sophia**
> Je vois que tu as tenu au début, puis la fatigue a repris le dessus, tout en continuant le bilan. J’ai aussi noté ton rappel pour jeudi 25 juin à 18:00 : relire cette idée de semaine plus légère. Au global, tu sens que cette semaine t’a fait avancer vers ton objectif, même un peu ?

**Trace courte**
- http_status: `200`
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `direct_effect_lane_message_intake`
- active_flow_arbitration: `continue_active`
- direct_effects: `create_one_shot_reminder`
- direct_effects_to_run: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- tool_execution: `success`
- committed_effect: `scheduled_for=2026-06-25T16:00:00+00:00`, instruction `relire cette idée de semaine plus légère`
- warning trace: `turn_frame.direct_effect_lane` duplique `requested_effects/committed_effects` avec le meme id; `tool_skill_run.direct_effect_lane` expose une seule entree.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Global, product help, coaching, feature et weekly fusionnent correctement confirmation de rappel + reponse au besoin restant.
- Weekly reste dans son bilan, pose la question suivante et ne transforme pas le rappel en child flow.
- Safety garde une reponse de crise courte et ne confirme pas a tort un rappel non commite.
- Daily continue son bilan et commit correctement les entries apres clarification.

**Problemes**
- Safety Tour 2: rappel non cree alors que le delai est explicite. Famille: `BF-INTAKE-01`. Impact: le user croit avoir demande une aide simple dans un moment sensible, mais elle disparait. Severite: red.
- Daily Tour 1: rappel explicite ignore pendant pending daily. Famille: `BF-AGENDA-01`. Impact: multi-intention non respectee; le bilan continue mais le rappel transverse est perdu. Severite: red.
- Weekly Tour 1: trace duplique les effets dans `turn_frame.direct_effect_lane`, meme si le commit DB et la reponse visible sont corrects. Famille: `BF-TEST-01`. Impact faible: observabilite confuse. Severite: yellow.

**Fix propose**
- Source amont: direct-effect lane validator pour safety; pending WhatsApp daily pour daily; trace mapping pour weekly.
- Correction recommandee: unifier le passage `create_one_shot_reminder` dans tous les chemins, y compris pending daily; faire consommer par le validator safety le `when_hint` local; dedupliquer la projection trace weekly.
- Tests d'invariant attendus: un run integration par surface avec rappel + besoin local restant, en verifiant `direct_effects_to_run`, `executed_tools`, `scheduled_checkins`, confirmation visible et continuation du flow.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Global: `normal_reply` + `direct_effects_then_normal_reply` OK.
- Product help: active product + direct effect OK.
- Coaching recommendation: reco + direct effect OK.
- Feature opportunity: active feature + direct effect OK.
- Safety: active safety + direct effect detecte OK, mais execution bloquee a tort.
- Daily: process-checkin/pending daily OK, mais direct effect absent du chemin pending.
- Weekly: process-checkin Tour 0 + active weekly + direct effect OK.

**Skills / Operations / Tools**
- `create_one_shot_reminder` execute avec succes dans 5/7 surfaces.
- Safety: `direct_effects_to_run` contient `create_one_shot_reminder`, mais `tool_execution=blocked` avec `missing_time`.
- Daily: aucune execution `create_one_shot_reminder` observee; le pending daily ne propage pas la demande.

**Memory / Effets durables**
- Rappels durables observes dans `scheduled_checkins` pour global, product, coaching, feature et weekly.
- Daily a cree 3 entries daily puis cleanup; aucun rappel one-shot observe.
- Safety n'a cree aucun rappel durable.
- Cleanup cible effectue pour tous les users temporaires et artefacts daily/weekly. Les lignes `user_memories` renvoient 404 dans le cleanup normal car la table n'est pas exposee dans cette DB locale; les autres suppressions et Auth delete sont OK.

**Problemes**
- `R1-B01`: Daily pending ne branche pas `create_one_shot_reminder`. Famille: `BF-AGENDA-01`. Severite: red.
- `R1-B02`: Safety direct-effect lane bloque `dans 30 minutes` avec `missing_time`. Famille: `BF-INTAKE-01`. Severite: red.
- `R1-B03`: Weekly trace duplique le meme committed effect dans `turn_frame.direct_effect_lane`. Famille: `BF-TEST-01`. Severite: yellow.

**Fix propose**
- Source amont: `whatsapp-webhook` pending daily / direct-effect lane / trace direct-effect context.
- Correction recommandee: integrer la lane directe dans le chemin daily pending comme dans `runConversationRouters`; reparer le validator de delai relatif dans safety active; dedupliquer les projections de trace.
- Tests d'invariant attendus: rerun exact de cette campagne; attendre 7/7 surfaces avec `scheduled_checkins.status=pending` pour le rappel, sauf blocage volontaire documente.

## Verdict Global

- Verdict: red
- Raison principale: `create_one_shot_reminder` marche sur 5/7 surfaces, mais echoue dans `daily_action_review_v1` et `safety_crisis`.
- Follow-up prioritaire: corriger daily pending transverse lane, puis safety validator sur delai relatif; ensuite relancer les 7 surfaces.
