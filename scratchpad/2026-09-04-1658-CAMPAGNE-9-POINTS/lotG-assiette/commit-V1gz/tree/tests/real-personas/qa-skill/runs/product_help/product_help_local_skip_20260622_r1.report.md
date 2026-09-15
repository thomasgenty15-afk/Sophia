# QA Run Report - product_help_local_skip_20260622_r1

## 1. Contexte Du Test

- Date: 2026-06-22
- Run: `product_help_local_skip_20260622_r1`
- Persona: connexion temporaire locale `qa-skill-product-help-product_help_local_skip_20260622_r1@example.com`
- Objectif: verifier Product Help en conditions IA reelles, avec explication produit, direct effect reminder, sortie vers coaching recommendation, puis effet transverse pendant flow local actif.
- Trajectoire: product_help -> product_help + one-shot reminder -> product_help -> coaching_recommendation -> coaching actif + question produit -> coaching actif + reminder.
- Surfaces visees: routing, active local flow ownership, product_help, coaching_recommendation, create_one_shot_reminder, traces, DB scheduled_checkins.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback `processMessage`, messages choisis tour par tour.
- Validite QA: valide. Incidents pre-call: deux erreurs de script Node/quoting et une erreur CommonJS avant appel HTTP sur T6; aucun de ces incidents n'a envoye de message a Sophia.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Dans Sophia, c'est quoi la difference entre une carte d'attaque et ajuster mon plan ?

**Sophia**
> Une carte d'attaque t'aide a demarrer plus facilement une action : elle prepare le premier geste et reduit la friction.
>
> Ajuster ton plan, c'est autre chose : ca sert quand le plan lui-meme ne colle plus, et qu'il faut le corriger ou le rendre plus adapte.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: `compare product surfaces: attack card vs adjust plan`
- executed_tools: none
- durable_effect: none

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-LEDGER-02` - commit reel mal rendu

**User**
> Et une carte d'attaque, je la retrouve ou dans Sophia ? Rappelle-moi demain a 9h de verifier ca.

**Sophia**
> C'est programme pour mardi 23 juin a 09:00: je te ferai un rappel pour verifier ca.
>
> C'est programme pour mardi 23 juin a 09:00 : je te ferai un rappel pour verifier ca.
>
> Tu retrouves une carte d'attaque dans Dashboard > Ressources.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_with_direct_effects`
- safety: none
- direct_effects: `create_one_shot_reminder`, explicit/high
- operation: `direct_effect_lane.selected_handler=create_one_shot_reminder`
- pending_confirmation: none
- executed_tools: `create_one_shot_reminder`
- durable_effect: scheduled_checkin `64b3d653-3964-4c8f-b80e-e71eb3b4b8dc`, `2026-06-23T07:00:00+00:00`, label `mardi 23 juin a 09:00`, instruction `verifier ca`

**Analyse si yellow/red**
- Symptome: confirmation visible du reminder dupliquee.
- Source amont probable: final response/direct effect confirmation merge; le visible agent reformule une confirmation deja injectee.
- Owner runtime: direct effect confirmation pipeline + visible response contract.
- Meilleure correction selon les guidelines: un seul owner de confirmation visible quand un effect commit existe; transmettre le hint comme contrainte non repetable.
- Pourquoi ce n'est pas un patch local: le meme symptome revient sur Product Help et sur flow local actif, donc la source est transverse a la composition reponse + effect.

### Tour 3

**Verdict du tour:** green

**User**
> Et si la carte d'attaque ne me convient plus apres coup, je peux la modifier ou il faut en refaire une ?

**Sophia**
> Non, pas librement. Si le contexte ou le contenu ne te convient plus, il faut repartir sur une nouvelle version apres confirmation. Si c'est juste le mot d'une carte Mot de bascule, lui peut etre remplace depuis Ressources.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: none
- direct_effects: none
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Ok, si je veux juste me debloquer maintenant sans toucher au plan, tu m'orientes vers quoi ?

**Sophia**
> Je partirais sur une carte d'attaque libre, technique Preparer le terrain : tu aides le demarrage en rendant le contexte plus simple autour de toi, ce qui reduit la friction quand tu te lances. Si ton blocage vient plutot d'un risque de deraper au dernier moment, je peux te guider vers une carte de defense.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- active_flow_arbitration: `minimal_global_dispatcher`, active_owner `none`, selected_owner `coaching_recommendation`
- safety: none
- direct_effects: none
- durable_effect: none

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-03` - product/status/tool mal priorises

**User**
> Et cote produit, cette carte d'attaque libre, je la cree ou dans Sophia ?

**Sophia**
> Tu la crees dans Dashboard > Ressources, comme carte d'attaque libre. Si tu veux, je peux aussi te dire quelle technique choisir selon ton blocage.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- active_flow_arbitration: `continue_active`, active_owner `coaching_recommendation`, selected_owner `coaching_recommendation`
- safety: none
- direct_effects: none
- durable_effect: none

**Analyse si yellow/red**
- Symptome: la reponse produit est correcte, mais elle est portee par `coaching_recommendation`, sans trace de micro-detour Product Help.
- Source amont probable: active-flow local dispatcher policy ne materialise pas l'enrichissement Product Help.
- Owner runtime: coaching_recommendation local dispatcher / product-help inline bridge.
- Meilleure correction selon les guidelines: si un flow actif enrichit une question produit, tracer explicitement l'enrichissement ou le bridge inline sans perdre l'owner parent.
- Pourquoi ce n'est pas un patch local: le besoin est un invariant d'ownership et d'observabilite, pas une phrase de reponse.

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-02` - extraction trop large ou polluee; `BF-LEDGER-02` - commit reel mal rendu

**User**
> Rappelle-moi demain a 9h30 de choisir la carte, et sinon pour l'instant je garde cette piste.

**Sophia**
> C'est programme pour mardi 23 juin a 09:30: je te ferai un rappel pour choisir la carte, et sinon pour l'instant je garde cette piste.
>
> C'est programme pour mardi 23 juin a 09:30 : je te ferai un rappel pour choisir la carte, et sinon pour l'instant je garde cette piste. Pour ta carte d'attaque libre, tu la retrouves dans Ressources.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `direct_effect_lane_message_intake`
- active_flow_arbitration: `continue_active`, active_owner `coaching_recommendation`, selected_owner `coaching_recommendation`
- safety: none
- direct_effects: `create_one_shot_reminder`, explicit/high
- operation: `direct_effect_lane.selected_handler=create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- durable_effect: scheduled_checkin `4e9b9684-1618-480f-85bc-3cdd790a3fa4`, `2026-06-23T07:30:00+00:00`, label `mardi 23 juin a 09:30`, instruction `choisir la carte, et sinon pour l'instant je garde cette piste`
- effect_ledger: returned counts all `0` despite `tool_skill_run.committed_effects` containing the reminder

**Analyse si yellow/red**
- Symptome: reminder cree pendant flow actif, mais payload trop large et confirmation visible dupliquee.
- Source amont probable: direct effect message intake fallback + final response merge.
- Owner runtime: one-shot reminder intake/extractor, direct effect confirmation pipeline, effect ledger trace adapter.
- Meilleure correction selon les guidelines: separer l'objet strict du rappel du reste de l'intention utilisateur; ne rendre la confirmation qu'une fois; aligner `effect_ledger` avec `tool_skill_run.committed_effects`.
- Pourquoi ce n'est pas un patch local: le bug apparait sur l'effect transverse, pas dans une phrase Product Help.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les explications produit T1/T3 sont courtes, utiles et non rigides.
- T4 bascule correctement vers coaching recommendation quand la demande devient "me debloquer maintenant".
- T5/T6 conservent le flow actif au lieu de laisser le global dispatcher reprendre.

**Problemes**
- Tour 2: confirmation reminder dupliquee. Famille: `BF-LEDGER-02`. Impact: reponse mecanique et peu fiable visuellement. Severite: yellow.
- Tour 5: question explicitement produit repondue par coaching sans trace de bridge Product Help. Famille: `BF-ROUTE-03`. Impact: comportement visible OK, ownership/observabilite ambigu. Severite: yellow.
- Tour 6: payload reminder trop large + confirmation dupliquee. Familles: `BF-INTAKE-02`, `BF-LEDGER-02`. Impact: rappel cree avec texte pollue. Severite: yellow.

**Fix propose**
- Source amont: direct effect intake + response composition + active-flow product bridge.
- Correction recommandee: rendre la confirmation d'effect single-owner, durcir l'extraction du contenu utile du rappel, et tracer les enrichissements Product Help pendant un parent actif.
- Tests d'invariant attendus: reminder + question produit en meme tour sans duplication; reminder avec phrase secondaire non incluse; product question during active flow preserve parent and exposes bridge/enrichment trace.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Product Help initial fonctionne: T1/T2/T3 selectionnent `product_help`.
- Le passage vers `coaching_recommendation` fonctionne: T4 selectionne `coaching_recommendation`.
- Pendant flow actif, T5/T6 restent sur `continue_active` avec active_owner `coaching_recommendation`, donc le dispatcher global ne reprend pas visiblement le controle.
- Warning: T5 ne montre pas de bridge Product Help alors que la question est explicitement produit.

**Skills / Operations / Tools**
- `create_one_shot_reminder` s'execute bien en T2 et T6.
- DB avant cleanup: deux `scheduled_checkins` pending crees aux bonnes heures locales converties UTC.
- T6 prouve que le direct effect transverse peut s'executer pendant un flow local actif.

**Memory / Safety**
- safety: none sur tous les tours.
- memory_plan minimal/taxonomy_first sur les tours produit; aucun dump memoire.

**Observabilite**
- Les traces courtes sont presentes dans la reponse endpoint.
- Warning important: `conversation_turn_traces` DB ne contient aucune ligne du run, meme par `turn_id=like.product_help_local_skip_20260622_r1*`.
- Warning: `effect_ledger.counts` reste a 0 sur T2/T6 alors que `tool_skill_run.committed_effects` contient bien les reminders.

**Nettoyage**
- Cleanup cible effectue: `scheduled_checkins` supprimes: 2; `user_chat_states` supprimes: 1; `chat_messages` supprimes: 12; `conversation_turn_traces` supprimes: 0; Auth user temporaire supprime: status 200.

## Verdict Global

**YELLOW**

Le flow principal fonctionne: Product Help repond, le passage vers coaching est correct, l'owner actif est conserve, et les reminders sont vraiment crees. Il reste trois fragilites a corriger avant GREEN: confirmation visible dupliquee sur direct effect, extraction trop large du texte de reminder en phrase composite, et observabilite persistente absente/incomplete pour ce run.
