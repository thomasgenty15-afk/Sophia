# QA Run — One-Shot Reminder Confirmation Postfix R3

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `one-shot-reminder-confirmation-postfix-20260613-r3`
- Persona: user QA temporaire `qa-normal-one-shot-reminder-confirmation-postfix-20260613-r3-1781365010149@example.com`, `user_id=d3956b70-c7e2-4d69-a3e5-8c0fc7fafa24`
- Objectif: verifier le comportement post-fix des confirmations d'effets committes pour les rappels ponctuels, surtout quand un visible owner local comme `flow_opportunity_verification` reprend la reponse.
- Trajectoire: conversation simple, mention de dossier sans action, rappel explicite, rappel + second sujet, rappel en contexte emotionnel leger, demande incomplete, precision temporelle, recap DB, retour conversationnel.
- Surfaces visees: dispatcher, direct effect lane, `create_one_shot_reminder`, `flow_opportunity_verification`, `status_recap`, DB `scheduled_checkins`, EffectLedger/trace.
- Cadre IA reel: local only, vrai endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide. 10 tours reels executes tour par tour. Cleanup cible effectue sur le user QA; `user_memories` retourne 404 comme table absente/non exposee, les autres suppressions et `auth.users` sont OK.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je veux juste discuter deux minutes tranquillement, sans lancer de plan ni chercher une solution tout de suite.

**Sophia**
> Bien sûr, je suis là, on peut juste discuter tranquille deux minutes 😊
>
> Là maintenant, tu as plutôt envie de déposer quelque chose (un stress, une idée qui tourne), ou tu préfères qu’on parle de quelque chose de léger ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- direct_effects_to_run: `[]`
- executed_tools: `[]`
- tool_execution: `none`
- committed_effects: `[]`
- blocked_effects: `[]`
- `direct_effect.confirmation_visible_agent`: absent

### Tour 2

**Verdict du tour:** green

**User**
> J'ai un petit dossier ouvert sur mon bureau, mais là je veux juste le laisser exister sans m'en occuper.

**Sophia**
> Je comprends totalement — parfois le plus sain, c’est de laisser un truc “là” sans le transformer en pression. 🙂  
>
> Ton dossier peut être un repère visuel (“ok, je m’en occuperai plus tard”) plutôt qu’un problème en suspens. Tant que tu ne le nourris pas avec de la rumination, il n’a pas besoin d’être réglé maintenant.  
>
> Si tu veux, tu peux juste te donner une règle simple pour te sentir en paix : “je le laisse tranquille jusqu’à quand, exactement ?” 😊

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- direct_effects_to_run: `[]`
- executed_tools: `[]`
- tool_execution: `none`
- committed_effects: `[]`
- blocked_effects: `[]`
- `direct_effect.confirmation_visible_agent`: absent

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-03 — Payload durable faux

**User**
> Alors rappelle-moi dans 25 minutes : ouvrir le fichier, sans essayer de régler tout le dossier.

**Sophia**
> C'est programmé pour samedi 13 juin à 10:25: je te rappellerai de régler tout le dossier.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- direct_effects_to_run: `["create_one_shot_reminder"]`
- direct_effect payload_hint: `ouvrir le fichier, sans essayer de régler tout le dossier`
- executed_tools: `["create_one_shot_reminder"]`
- tool_execution: `success`
- committed_effects: `[{ type: "create_one_shot_reminder", scheduled_for: "2026-06-13T08:25:00+00:00", reminder_instruction: "régler tout le dossier" }]`
- blocked_effects: `[]`
- DB: `event_context=one_shot_reminder:regler_tout_le_dossier`
- `direct_effect.confirmation_visible_agent`: absent

**Analyse si yellow/red**
- Symptome: l'effet durable est cree, mais avec le mauvais texte. La contrainte negative devient l'objet du rappel.
- Source amont probable: `one_shot_reminder` instruction intake/parser, extraction d'une clause apres `sans essayer de`.
- Owner runtime: `tools/always_on/one_shot_reminder/instruction_parser.ts` et tests parser/intake.
- Meilleure correction selon les guidelines: traiter la contrainte negative comme partie du payload utile ou comme limite de scope, pas comme cible principale. Ajouter test positif et paraphrases avec `sans`, `sans essayer de`, `sans résoudre`, `juste X`.
- Pourquoi ce n'est pas un patch local: le probleme est le payload durable commite, pas la phrase visible; il faut corriger la compilation du payload avant executor.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02 — Commit reel mal rendu

**User**
> Rappelle-moi dans 40 minutes de relire mes notes sur ce dossier, et ensuite j'aimerais qu'on parle de pourquoi je bloque autant.

**Sophia**
> C'est programmé pour samedi 13 juin à 10:40: je te rappellerai de relire mes notes sur ce dossier.
>
> C'est noté, je te rappellerai de relire tes notes à 10h40. On pourra ensuite discuter de ce qui te bloque sur ce dossier, ça te va ?
>
> Je garde aussi la suite : « et ensuite j'aimerais qu'on parle de pourquoi je bloque autant. ». Tu veux qu'on la traite maintenant ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- direct_effects_to_run: `["create_one_shot_reminder"]`
- direct_effect payload_hint: `relire mes notes sur ce dossier`
- executed_tools: `["create_one_shot_reminder"]`
- tool_execution: `success`
- committed_effects: `[{ type: "create_one_shot_reminder", scheduled_for: "2026-06-13T08:40:00+00:00", reminder_instruction: "relire mes notes sur ce dossier" }]`
- blocked_effects: `[]`
- `direct_effect_lane`: present in `tool_skill_run`
- `direct_effect.confirmation_visible_agent`: absent

**Analyse si yellow/red**
- Symptome: le rappel est bien cree sous visible owner `flow_opportunity_verification`, mais la confirmation est doublee et le second sujet est repris avec une question redondante.
- Source amont probable: fusion `directEffectRuntime.content + visibleRuntime.content` plus visible agent qui confirme lui aussi, puis follow-up de suffixe multi-intention.
- Owner runtime: direct effect lane merge / final response pipeline / `flow_opportunity_verification.visible_agent`.
- Meilleure correction selon les guidelines: passer les faits committes au visible owner comme contexte, mais ne pas concatener une confirmation pre-rendue si le visible owner produit deja une confirmation. Le visible owner doit rendre une seule confirmation plus reprise naturelle du second sujet.
- Pourquoi ce n'est pas un patch local: il faut un contrat de composition visible owner + effect lane, pas supprimer une phrase exacte.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02 — Commit reel mal rendu

**User**
> Je sens que je suis un peu tendu là, rappelle-moi dans 20 minutes de respirer lentement et de boire un verre d'eau.

**Sophia**
> C'est programmé pour samedi 13 juin à 10:20: je te rappellerai de respirer lentement et boire un verre d'eau.
>
> C'est programmé pour 10:20 : je te rappellerai de respirer lentement et de boire un verre d'eau. Est-ce que tu veux me dire ce qui te tend ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- direct_effects_to_run: `["create_one_shot_reminder"]`
- direct_effect payload_hint: `respirer lentement et boire un verre d'eau`
- executed_tools: `["create_one_shot_reminder"]`
- tool_execution: `success`
- committed_effects: `[{ type: "create_one_shot_reminder", scheduled_for: "2026-06-13T08:20:00+00:00", reminder_instruction: "respirer lentement et boire un verre d'eau" }]`
- blocked_effects: `[]`
- `direct_effect_lane`: present in `tool_skill_run`
- `direct_effect.confirmation_visible_agent`: absent

**Analyse si yellow/red**
- Symptome: l'effet durable est correct, le tutoiement est correct, mais la confirmation est doublee.
- Source amont probable: meme composition que T4.
- Owner runtime: direct effect lane merge / final response pipeline / visible owner.
- Meilleure correction selon les guidelines: un seul renderer visible doit parler; la lane doit fournir des facts, pas un message final a concatener quand un owner visible existe.
- Pourquoi ce n'est pas un patch local: concerne tous les visible owners qui recoivent un direct effect committe.

### Tour 6

**Verdict du tour:** green

**User**
> Rappelle-moi de vérifier le fichier.

**Sophia**
> Il me manque le moment exact pour programmer ce rappel.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- direct_effects_to_run: `["create_one_shot_reminder"]`
- direct_effect payload_hint: `instruction_hint=vérifier le fichier`, `when_hint=missing`
- executed_tools: `[]`
- tool_execution: `blocked`
- committed_effects: `[]`
- blocked_effects: `[{ type: "create_one_shot_reminder", reason_code: "missing_time" }]`
- DB: aucun nouveau rappel
- `direct_effect.confirmation_visible_agent`: absent

### Tour 7

**Verdict du tour:** green

**User**
> Dans 30 minutes, juste vérifier le fichier.

**Sophia**
> C'est programmé pour samedi 13 juin à 10:30: je te rappellerai de vérifier le fichier.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- direct_effects_to_run: `["create_one_shot_reminder"]`
- direct_effect payload_hint: `vérifier le fichier`
- executed_tools: `["create_one_shot_reminder"]`
- tool_execution: `success`
- committed_effects: `[{ type: "create_one_shot_reminder", scheduled_for: "2026-06-13T08:30:00+00:00", reminder_instruction: "vérifier le fichier" }]`
- blocked_effects: `[]`
- DB: `event_context=one_shot_reminder:verifier_le_fichier`
- `direct_effect.confirmation_visible_agent`: absent

### Tour 8

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-03 — Payload durable faux

**User**
> Fais-moi un récap uniquement des rappels ponctuels que tu as vraiment créés dans cette conversation.

**Sophia**
> Voici les rappels ponctuels que j'ai programmés pour toi :
>
> - À 10:20 : respirer lentement et boire un verre d'eau
> - À 10:25 : régler tout le dossier
> - À 10:30 : vérifier le fichier
> - À 10:40 : relire mes notes sur ce dossier

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- direct_effects_to_run: `[]`
- executed_tools: `[]`
- tool_execution: `none`
- committed_effects: `[]`
- blocked_effects: `[]`
- DB projection: 4 pending reminders, including bad payload `one_shot_reminder:regler_tout_le_dossier`
- `direct_effect.confirmation_visible_agent`: absent

**Analyse si yellow/red**
- Symptome: le recap n'invente rien et exclut le rappel bloque, mais il expose le mauvais payload durable du tour 3.
- Source amont probable: payload committe par `one_shot_reminder`, pas `status_recap`.
- Owner runtime: `one_shot_reminder` intake/payload compiler.
- Meilleure correction selon les guidelines: corriger le payload source; `status_recap` doit rester DB-grounded.
- Pourquoi ce n'est pas un patch local: changer le wording du recap masquerait une DB durable fausse.

### Tour 9

**Verdict du tour:** green

**User**
> Quand j'ai demandé sans horaire de vérifier le fichier, tu n'avais rien créé à ce moment-là, on est d'accord ?

**Sophia**
> C'est exact, tant que l'horaire n'était pas précisé, rien n'avait été enregistré. Actuellement, je vois bien ton rappel « vérifier le fichier » programmé pour 10h30, ainsi que trois autres rappels prévus pour ta matinée.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_status_recap_local_dispatcher`
- direct_effects_to_run: `[]`
- executed_tools: `[]`
- tool_execution: `none`
- committed_effects: `[]`
- blocked_effects: `[]`
- `direct_effect.confirmation_visible_agent`: absent

### Tour 10

**Verdict du tour:** green

**User**
> Ok, et maintenant sans créer quoi que ce soit, parlons juste une seconde de ce blocage autour du dossier.

**Sophia**
> Oui, je suis là 🙂. Et ce “blocage autour du dossier”, je le traduirais comme un mélange très classique : ton cerveau voit le dossier comme quelque chose à gérer (donc ça monte), mais tu ne sais pas exactement par où commencer (donc tu restes coincé).
>
> Souvent, il y a une des 3 couches derrière :
> - la peur de mal faire / que ça prenne trop de place,
> - la sensation que “régler” = “tout porter” (donc impossible),
> - ou juste la fatigue / la tension qui rendent la première étape trop coûteuse.
>
> Sans rien ajouter côté pratique : quand tu dis “je bloque”, c’est plutôt quel ressenti dominant là, maintenant ? (angoisse, lourdeur, agitation, ou paralysie) 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- direct_effects_to_run: `[]`
- executed_tools: `[]`
- tool_execution: `none`
- committed_effects: `[]`
- blocked_effects: `[]`
- `direct_effect.confirmation_visible_agent`: absent

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le tutoiement est conserve sur les confirmations.
- La demande incomplete est traitee naturellement sans fausse confirmation.
- Le second sujet du tour 4 n'est plus perdu totalement.
- Le retour conversationnel final est naturel et ne force pas d'outil.

**Problemes**
- Tour 3: confirmation fluide mais semantiquement fausse; Sophia promet l'inverse de la contrainte user. Famille: BF-EFFECT-03. Impact: confiance utilisateur fortement degradee. Severite: red.
- Tours 4 et 5: confirmation doublee. Famille: BF-LEDGER-02. Impact: experience mecanique et peu naturelle; le user voit la composition technique. Severite: yellow.
- Tour 4: reprise du second sujet avec le connecteur brut `et ensuite...` et question redondante. Famille: BF-AGENDA-01 / BF-LEDGER-02. Impact: maladresse conversationnelle. Severite: yellow.

**Fix propose**
- Source amont: extraction `one_shot_reminder` pour les contraintes negatives; composition direct effect lane + visible owner pour le doublon.
- Correction recommandee: traiter `ouvrir le fichier, sans essayer de régler tout le dossier` comme payload utile complet ou comme action `ouvrir le fichier` avec contrainte de scope conservee; puis donner au visible owner les facts committes sans concatener la reponse pre-rendue si le visible owner confirme.
- Tests d'invariant attendus: paraphrases `sans résoudre`, `sans traiter tout`, `juste ouvrir`; flow visible owner + rappel + second sujet; emotional reminder + visible owner; anti-faux-positif status recap.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le fix d'orchestration est partiellement valide: tours 4 et 5 montrent `selected_handler=flow_opportunity_verification` avec `executed_tools=["create_one_shot_reminder"]` et `committed_effects` presents.
- Le mini-agent transverse `direct_effect.confirmation_visible_agent` n'apparait dans aucun tour.
- La demande incomplete T6 produit `tool_execution=blocked`, `blocked_effects=[missing_time]`, et aucun nouveau row DB.

**Skills / Operations / Tools**
- `create_one_shot_reminder` committe bien les rappels complets.
- `status_recap` lit la DB correctement et n'invente pas le rappel bloque.
- Le rappel T7 apres precision temporelle committe le bon payload `vérifier le fichier`.

**Side Effects**
- DB finale avant cleanup: 4 rows `scheduled_checkins` pour le user QA:
  - 10:20 `respirer_lentement_et_boire_un_verre_d_eau`
  - 10:25 `regler_tout_le_dossier` (incorrect)
  - 10:30 `verifier_le_fichier`
  - 10:40 `relire_mes_notes_sur_ce_dossier`
- Cleanup cible: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` OK; `auth.users` OK; `user_memories` 404.

**Comparaison intention / effet durable**
- T3 attendu: rappel de `ouvrir le fichier, sans essayer de régler tout le dossier`.
- T3 observe: rappel durable `régler tout le dossier`.
- T4/T5 attendu: rappel cree + visible owner confirme une fois et reprend le sujet.
- T4/T5 observe: rappel cree, mais confirmation visible doublee.

**Fix propose**
- Source amont 1: `one_shot_reminder/instruction_parser.ts` ou intake payload compiler, pour ne pas transformer une contrainte negative en cible durable.
- Source amont 2: composition `mergeDirectEffectRuntimeIntoVisibleRuntime` / final response pipeline, pour choisir soit confirmation pre-rendue, soit visible owner, mais pas les deux.
- Tests requis: unitaires parser, integration direct effect lane + `flow_opportunity_verification`, run QA reel de regression.

## Verdict Global

`red`

Le bug initial majeur d'orchestration est fortement améliore: un rappel peut maintenant etre execute meme quand `flow_opportunity_verification` est le visible owner, et le mini-agent transverse n'apparait pas. Le run reste `red` car un rappel est durablement cree avec un payload faux au tour 3, puis relu tel quel en recap. Deux warnings de rendu restent aussi ouverts sur la confirmation doublee.
