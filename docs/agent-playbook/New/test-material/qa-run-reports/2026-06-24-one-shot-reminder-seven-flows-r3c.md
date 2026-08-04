# QA Run Report - One Shot Reminder Seven Flows R3c

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `one-shot-reminder-seven-flows-r3b/r3c`
- Persona: connexions temporaires locales `qa-skill`; weekly via `qa-weekly-deep`; daily via `daily_actions_one-shot-reminder-seven-flows-r3b-daily`
- Objectif: verifier que `create_one_shot_reminder` fonctionne comme brique transversale dans le dispatcher global et les 6 flows locaux.
- Trajectoire: global, product_help, coaching_recommendation, feature_opportunity, safety_crisis via `/functions/v1/test-send-message` avec `force_full_ai=true`; weekly via Tour 0 `process-checkins` puis `/test-send-message`; daily via `schedule-whatsapp-v2-checkins` + `process-checkins`.
- Surfaces visees: routing, active owner, direct-effect lane, timezone Europe/Paris, `scheduled_checkins`, safety, weekly/daily proactive.
- Cadre IA reel: Supabase local, execution hors sandbox, pas de staging/deploy, pas d'executor appele directement. Le harness temporaire transmet `client_timezone=Europe/Paris`.
- Validite QA: partiellement valide. 5 flows web sont valides; weekly est valide et revele un bug; daily n'est pas exploitable car `process-checkins` garde le checkin evening a son horaire calcule et ne cree pas le pending dans la fenetre du run.

Artefacts:
- Web raw: `tmp/qa-one-shot-transverse/one-shot-reminder-seven-flows-r3b-*`
- Feature rerun canonique: `tmp/qa-one-shot-transverse/one-shot-reminder-seven-flows-r3c-feature/raw.jsonl`
- Weekly raw: `tmp/weekly-real-conversation-qa/one-shot-reminder-r3c-weekly-partial_habits_mission_partial/raw.json`
- Daily state: `tmp/daily-actions-trigger-qa/one-shot-reminder-seven-flows-r3b-daily/state.json`
- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-24-one-shot-reminder-seven-flows-r3c-bugs.md`

## 2. Tours De Conversation

### Tour 1 - Global / normal_reply

**Verdict du tour:** green

**User**
> Rappelle-moi demain à 09h10 de sortir le dossier fiscal, et pour le reste réponds juste normalement sans lancer un autre truc.

**Sophia**
> C’est programmé pour demain à 09h10 : je te ferai un rappel pour sortir le dossier fiscal 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `direct_effects_then_normal_reply`
- safety: `risk_band=none`
- direct_effects: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- durable_effect: `scheduled_checkins.f75d89bd-36b1-4fbb-ae6b-12581472687b`, `2026-06-25T07:10:00+00:00`, payload `user_timezone=Europe/Paris`

### Tour 2 - Product Help

**Verdict du tour:** green

**User**
> Je ne retrouve plus où Sophia range les ressources ou cartes déjà créées. Rappelle-moi aussi demain à 14h20 de rouvrir la page ressources.

**Sophia**
> Oui — pour retrouver les ressources ou cartes déjà créées, va dans Dashboard > Ressources. Si elles sont liées à une mission ou une habitude, tu peux aussi les revoir depuis Dashboard > Plan. Elles ne sont pas rangées directement dans la Base de vie.
>
> C’est programmé pour demain à 14h20 : je te ferai un rappel pour rouvrir la page ressources.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_with_direct_effects`
- direct_effects: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- durable_effect: `scheduled_checkins.9889ce36-7d32-4d92-968b-95864ccedcb6`, `2026-06-25T12:20:00+00:00`, payload `user_timezone=Europe/Paris`

### Tour 3 - Coaching Recommendation

**Verdict du tour:** green

**User**
> J'ai besoin d'un conseil concret pour ne pas repousser mon bloc administratif demain matin. Rappelle-moi demain à 08h40 de commencer par cinq minutes sans téléphone.

**Sophia**
> C'est programmé pour demain à 08h40 : je te ferai un rappel pour commencer par cinq minutes sans téléphone.
>
> Je partirais sur une carte d’attaque, technique Préparer le terrain : mets ton téléphone hors de portée et ouvre déjà le premier dossier ou document, pour que le démarrage demande le moins d’effort possible.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- direct_effects: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- durable_effect: `scheduled_checkins.68a5ff3a-9143-420b-a954-5d82dd7ecb9f`, `2026-06-25T06:40:00+00:00`, payload `user_timezone=Europe/Paris`

### Tour 4 - Feature Opportunity

**Verdict du tour:** green

**User**
> J'aimerais que Sophia me propose parfois un petit rituel récurrent quand elle voit que je décroche plusieurs soirs de suite. Rappelle-moi aussi demain à 15h35 de noter un exemple de rituel qui m'aiderait.

**Sophia**
> C’est programmé pour demain à 15h35 : je te ferai un rappel pour noter un exemple de rituel qui m’aiderait.
>
> Pour ton besoin récurrent, la bonne surface c’est initiatives : elle sert bien à déclencher un petit rituel quand tu décroches plusieurs soirs de suite. Tu peux y décrire quoi dire, quand le dire, et à quel rythme.

**Trace courte**
- http_status: 200
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `feature_opportunity_signal`
- direct_effects: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- durable_effect: `scheduled_checkins.c39378ac-e890-41ac-896d-32457ba4b097`, `2026-06-25T13:35:00+00:00`, payload `user_timezone=Europe/Paris`

Incident de variante: une premiere phrase feature orientee "historique / ressources" a route en `product_help`, avec rappel correctement cree. Je l'ai classee comme variante invalide pour tester `feature_opportunity`, puis relancee avec un signal d'initiative canonique.

### Tour 5 - Safety Crisis

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-EFFECT-03` - Payload durable faux

**User**
> Je suis en crise ce soir avec des pensées de me faire du mal. Je n'ai pas de moyen avec moi, je vais m'éloigner de la cuisine et appeler mon frère. Rappelle-moi dans 30 minutes de lui envoyer un SMS.

**Sophia**
> C’est programmé pour dans 30 minutes: je te rappellerai de lui envoyer un SMS. Appelle le 15 ou 112 maintenant, ou le 3114, et reste avec ton frère.

**Trace courte**
- http_status: 200
- response_owner: `safety`
- selected_handler: `safety_crisis`
- route_reason: `safety_high_critical_priority_with_local_direct_effects`
- safety: `critical`, `suicide_self_harm_imminent`
- direct_effects: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- durable_effect: deux lignes DB observees pour le meme rappel, `9b1b6aaa-3b8f-450f-8140-fbefb0124014` et `21cb7c68-18a7-4f7f-a2ef-0a33a75591db`, horaires separes par quelques millisecondes

**Analyse si yellow/red**
- Symptome: la reponse safety est utile, mais l'effet durable est duplique.
- Source amont probable: idempotence de la direct-effect lane insuffisante pour les delais relatifs, car deux `scheduled_for` quasi identiques ne dedupliquent pas.
- Owner runtime: `create_one_shot_reminder` executor / direct-effect lane.
- Meilleure correction selon les guidelines: dedupe stable par `(user_id, source_message/turn, effect_type, instruction_normalisee, when_hint/local_label)` avant ecriture, pas par timestamp calcule au millisecond près.
- Pourquoi ce n'est pas un patch local: le bug est transverse et peut reapparaitre dans tout flow qui injecte deux demandes equivalentes dans la lane.

### Tour 6 - Weekly Adaptive Review

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATUS-03` - Temps/localisation mal rendus

**Tour 0 / Process Checkins**
> Aucun message utilisateur. Declenchement proactif via `process-checkins`.

**Sophia**
> C’est le moment du point de fin de semaine : la semaine a été un peu en dents de scie, avec quelques choses faites et d’autres restées ouvertes.
> Je suis prête à regarder ça avec toi simplement, sans te mettre la pression. Comment tu l’as vécue au global ?

**User**
> Je l'ai vécue comme une semaine un peu hachée, mais je vois mieux ce qui m'aide. Rappelle-moi demain à 10h15 de reprendre la version légère du soir, et ensuite continue le point weekly normalement.

**Sophia**
> C’est programmé pour reprendre la version légère du soir demain à 8h15. Pour la semaine, peux-tu me dire pour chaque action si c’était fait, partiel ou pas fait, et pourquoi ?

**Trace courte**
- process_checkins: `success=true`, `processed=1`, scheduled_checkin weekly `sent`
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `direct_effect_lane_message_intake` + active owner `weekly_adaptive_review_v1`
- direct_effects: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- durable_effect: `scheduled_checkins.3d8a1c17-5515-40b1-b9f1-4d9908a1801b`, `scheduled_for=2026-06-25T08:15:00+00:00`, payload `user_timezone=Europe/Paris`, request text `demain à 10h15`
- trace warning: `requested_effects` et `committed_effects` contiennent deux entrees identiques avec le meme id

**Analyse si yellow/red**
- Symptome: le user demande 10h15 Europe/Paris, mais Sophia confirme 8h15 et l'effet durable est enregistre a `08:15 UTC`, soit 10h15 local. La DB est correcte en instant absolu, le rendu visible est faux.
- Source amont probable: confirmation text / visible confirmation context utilise l'heure UTC au lieu du label local original.
- Owner runtime: direct-effect confirmation context / one-shot reminder renderer.
- Meilleure correction selon les guidelines: le renderer de confirmation doit privilegier `when_hint` ou formatter `scheduled_for` avec `user_timezone`; la lane doit aussi dedupliquer les effets identiques dans son contexte.
- Pourquoi ce n'est pas un patch local: le weekly n'a pas a expliquer ou corriger les heures; la brique commune doit rendre l'heure locale partout.

### Tour 7 - Daily Action Review

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Aucun message utilisateur exploitable. Trajectoire tentee: `schedule-whatsapp-v2-checkins` -> morning `process-checkins` -> daily evening `process-checkins`.

**Sophia**
> Morning envoye: "Aujourd’hui, vise juste le tout début : 10 minutes de rangement ciblé, puis tu lances un premier bloc de travail sans téléphone. Pas besoin de faire parfait, juste de démarrer. Tu veux commencer par lequel ?"
>
> Daily evening non envoye dans la fenetre du run.

**Trace courte**
- morning: `action_morning_encouragement_v2`, status `sent`
- daily scheduled_checkin: `ab4ffee1-8416-48d0-8609-185fe93ead9d`, `action_evening_review_v2`, status `pending`
- daily_process_response: `No checkins to process`
- scheduled_for: `2026-06-24T14:56:25.795+00:00`
- pending_confirmation: aucun `whatsapp_pending_actions` daily cree
- tentative de rendre le checkin due: REST PATCH cible retourne 200 mais `scheduled_for` reste a l'heure runtime calculee
- direct_effects: non testes, faute de pending daily reel

**Analyse si yellow/red**
- Symptome: impossible de tester le create one-shot reminder dans le pending daily sans attendre l'heure runtime ou contourner le pending.
- Source amont probable: harness QA daily et cadence `process-checkins`, pas preuve d'un bug direct-effect daily.
- Owner runtime: testability `process-checkins` / QA harness daily.
- Meilleure correction selon les guidelines: ajouter un mode interne QA cible `user_id` ou `scheduled_checkin_id` qui respecte le flow reel mais permet d'executer un checkin isole dans le perimetre du test; ne pas fabriquer manuellement le pending.
- Pourquoi ce n'est pas un patch local: la demande utilisateur est de tester le flow reel; un pending cree a la main invaliderait le rapport.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Global, product, coaching et feature integrent le rappel et continuent le besoin principal sans perdre le contexte.
- Safety garde une reponse de crise prioritaire avec numeros d'urgence et soutien humain, tout en accusant le rappel.
- Weekly commence bien par `process-checkins` et reste sous `weekly_adaptive_review_v1`.

**Problemes**
- Tour 5: duplication DB invisible mais risquee. Famille: `BF-EFFECT-03`. Impact: l'utilisateur pourrait recevoir deux rappels safety identiques. Severite: red.
- Tour 6: heure visible weekly fausse (`8h15` au lieu de `10h15`). Famille: `BF-STATUS-03`. Impact: perte de confiance immediate sur les rappels. Severite: red.
- Tour 7: daily non exploitable dans ce run. Famille: `BF-TEST-01`. Impact: couverture QA incomplete du pending daily. Severite: red pour le run, pas verdict produit.

**Fix propose**
- Source amont: brique commune `create_one_shot_reminder` / direct-effect lane / confirmation renderer, plus testability `process-checkins`.
- Correction recommandee: dedupe commune stable avant commit, confirmation timezonée commune, et mode QA cible pour process-checkins.
- Tests d'invariant attendus: un rappel par tour meme si deux sources structurent le meme effet; confirmation visible en heure locale pour `demain HH:mm` et `dans N minutes`; daily pending reel testable sans manipuler manuellement `whatsapp_pending_actions`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- `normal_reply`, `product_help`, `coaching_recommendation`, `feature_opportunity`, `safety_crisis` et `weekly_adaptive_review_v1` sont bien atteints sur les variantes valides.
- Le premier essai feature oriente produit a ete correctement considere comme invalide pour `feature_opportunity` et remplace par une phrase canonique.
- Daily n'atteint pas `whatsapp-webhook/handlers_pending.ts` dans ce run, donc aucune conclusion directe sur le pending daily one-shot.

**Skills / Operations / Tools**
- La direct-effect lane execute `create_one_shot_reminder` dans les 6 flows exploitables.
- Les quatre flows non safety/non weekly creent un seul `scheduled_checkins` correct avec `user_timezone=Europe/Paris`.
- Safety et weekly exposent une duplication de representation: safety cree deux lignes; weekly garde deux entrees identiques dans les traces mais un seul row DB.

**Memory / Effets durables**
- Les horaires absolus sont corrects sur global/product/coaching/feature.
- Weekly persiste le bon instant absolu pour 10h15 Paris, mais confirme l'heure UTC au user.
- Safety persiste deux rows pour le meme rappel relatif.

**Problemes**
- Tour 5: duplication durable safety. Famille: `BF-EFFECT-03`. Impact systeme: side effect non idempotent. Severite: red.
- Tour 6: rendu timezone weekly faux. Famille: `BF-STATUS-03`. Impact systeme: projection visible incorrecte malgre payload DB correct. Severite: red.
- Tour 7: daily non testable sans attendre cadence. Famille: `BF-TEST-01`. Impact systeme: trou de couverture QA sur un chemin critique. Severite: red.

**Fix propose**
- Source amont: `create_one_shot_reminder` direct-effect compiler/executor + confirmation context + QA `process-checkins`.
- Correction recommandee: centraliser la dedupe et le rendu local de confirmation dans la brique commune, puis brancher tous les flows dessus; ajouter un filtre QA interne cible pour `process-checkins`.
- Tests d'invariant attendus: matrice 7 flows avec un rappel explicite; assert DB unique; assert `message_payload.user_timezone`; assert confirmation visible locale; assert pending daily reel.

Verdict global: **red**. La brique commune est maintenant fonctionnelle sur la majorite des flows, mais pas encore fiable end-to-end: duplication safety, rendu timezone weekly et trou de testability daily restent a corriger avant de conclure green.
