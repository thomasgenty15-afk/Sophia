# QA Run Report - product-help-local-bridges-20260612-r4-rawtrace

## 1. Contexte Du Test

- Date: 2026-06-12.
- Run: `product-help-local-bridges-20260612-r4-rawtrace`.
- Persona: user QA temporaire dedie, auth locale verifiee `200`.
- Objectif: verifier en conditions reelles que `product_help` explique sans creer, puis handoff correctement vers le dispatcher local `prepare_attack_card`; verifier aussi que les reponses IA brutes sont persistrees en DB.
- Trajectoire: explication attaque/defense sans creation -> demande de carte d'attaque -> confirmation cible -> choix technique avec contrainte.
- Surfaces visees: `/functions/v1/test-send-message`, dispatcher global, flow local `product_help`, handoff local vers `prepare_attack_card`, active flow target, EffectLedger, table `llm_raw_response_events`.
- Cadre IA reel: Supabase local, endpoint local, `force_full_ai=true`, pas de staging, pas de renderer deterministe, pas de fallback `processMessage`.
- Validite QA: valide. Les 4 tours retournent HTTP 200 via le chemin IA reel.
- Nettoyage: non effectue a la demande explicite du user. Les artefacts QA restent accessibles.
- Artefacts: scope `qa-normal-conversation-product-help-local-bridges-20260612-r4-rawtrace`, user `d1e2cd50-c441-440b-bd8f-7702eb91da0d`, email `qa-normal-product-help-local-bridges-20260612-r4-rawtrace-1781284227600@example.com`.
- Raw IA DB: valide. 7 lignes trouvees dans `public.llm_raw_response_events` avec `request_id like product-help-local-bridges-20260612-r4-rawtrace*`, toutes `raw_response_truncated=false`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis un peu perdu dans Sophia : une carte d'attaque et une carte de defense, ce n'est pas la meme chose ? Explique-moi juste la difference, sans rien creer.

**Sophia**
> C'est assez simple : l'attaque sert a demarrer, la defense sert a tenir.
>
> Une carte d'attaque reduit la friction pour t'aider a lancer une action difficile. Elle repond a la question : "Comment je m'y mets ?".
>
> Une carte de defense te protege d'un risque de derapage (impulsion, fatigue, stress) en prevoyant une reponse immediate ou un plan B. Elle repond a : "Qu'est-ce qui peut me faire devier et quoi faire a ce moment-la ?".
>
> En resume, l'attaque prepare ton elan et la defense pare les coups durs.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: aucun
- raw_ia_db: `dispatcher-v2-llm`, status `success`

### Tour 2

**Verdict du tour:** green

**User**
> D'accord. Maintenant prepare-moi une carte d'attaque pour ranger mes papiers demain matin.

**Sophia**
> On part bien sur l'action de ranger tes papiers demain matin ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `product_help_exit_to_global_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun
- raw_ia_db: `prepare_attack_card.local_dispatcher` + `prepare_attack_card.visible.confirm_target_candidate`, status `success`

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-05` - Semantique composite aplatie

**User**
> Oui, c'est bien ranger mes papiers demain matin. Je bloque surtout parce que je ne sais pas par quelle pile commencer, et je repousse des que je vois trop de papiers.

**Sophia**
> Pour affronter cette montagne de papiers sans bloquer sur le point de depart, quelle technique preferes-tu : Le texte magique, Mantra de force, Ancre visuelle, Meditation de 5 minutes, Preparer le terrain ou Mot de bascule ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun
- raw_ia_db: `prepare_attack_card.local_dispatcher` + `prepare_attack_card.visible.ask_or_confirm_technique`, status `success`
- raw_dispatcher_json: `flow_action=choose_technique`, target locked, blocker locked, `candidate_options=["preparer_terrain","texte_recadrage","visualisation_matinale"]`
- raw_visible_json: visible message liste les six techniques, au-dela des candidates du dispatcher

**Analyse si yellow/red**
- Symptome: le flow cible est le bon, mais il transforme une situation assez claire en choix large de toutes les techniques. Cela augmente la charge utilisateur au lieu de recommander ou limiter aux candidates du dispatcher.
- Source amont probable: `prepare_attack_card` local dispatcher + visible agent de stage `ask_or_confirm_technique`.
- Owner runtime: `prepare_attack_card` local flow.
- Meilleure correction selon les guidelines: quand target et blocker sont verrouilles, proposer une technique recommandee ou limiter strictement les options visibles aux candidates produites par le dispatcher; ne pas rendre une liste produit complete.
- Pourquoi ce n'est pas un patch local product_help: le handoff est deja effectif et la reprise active se fait bien dans `prepare_attack_card`.

### Tour 4

**Verdict du tour:** green avec warning mineur

**User**
> Oui, prends Preparer le terrain, version simple, pas plus de cinq minutes.

**Sophia**
> C'est parti pour Preparer le terrain. Pour te faciliter la tache demain matin avec tes papiers, qu'est-ce que tu pourrais preparer des maintenant pour reduire cette sensation d'etre submerge ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun
- raw_ia_db: `prepare_attack_card.local_dispatcher` + `prepare_attack_card.visible.ask_platform_field`, status `success`
- raw_dispatcher_json: `flow_action=choose_technique`, `stage=platform_field_intake`, technique `preparer_terrain` locked, `tone_constraints=["simple version","under five minutes"]`

**Analyse si yellow/red**
- Warning: la contrainte `pas plus de cinq minutes` est bien capturee dans le JSON dispatcher, mais elle n'apparait pas explicitement dans la question visible. Ce n'est pas bloquant sur ce tour, mais un test strict devrait verifier que cette contrainte reste conservee jusqu'a la sortie finale.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1 repond exactement a la demande produit et respecte `sans rien creer`.
- T2 prouve le fix attendu: product_help ne fabrique pas une carte, il handoff vers `prepare_attack_card`.
- T4 ne reproduit plus le fallback "contrat local" observe en R3; le flow continue proprement.
- Aucun effet durable n'est applique sans consentement.

**Problemes**
- Tour 3: Sophia demande au user de choisir parmi toutes les techniques, alors que la situation donnee permettait au minimum une recommandation ou un choix restreint. Famille: `BF-INTAKE-05`. Impact: friction UX moyenne, surtout pour un user deja bloque par surcharge.
- Tour 4: warning mineur de conservation visible de contrainte; `under five minutes` est capture dans le raw JSON, mais pas verbalise.

**Fix propose**
- Source amont: `prepare_attack_card` local dispatcher / visible task mapping.
- Correction recommandee: pour `choose_technique`, le visible agent doit suivre les candidates du dispatcher et ne jamais etendre a toute la liste produit; si une technique est fortement indiquee, demander confirmation courte plutot qu'un choix large.
- Tests d'invariant attendus: target+blocker fournis -> proposition restreinte; candidate_options ne sont pas elargies par le visible; contrainte de duree reste dans le contexte visible et dans le draft final; aucun effet durable avant apply/confirmation.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1: entree correcte dans `product_help` via `skill_entry_signal`.
- T2: bridge product_help conforme: `route_reason=product_help_exit_to_global_dispatcher`, `selected_handler=prepare_attack_card`.
- T3/T4: reprise active correcte par `active_prepare_attack_card_local_dispatcher`.
- Aucun signal de retour au legacy product_help ni de creation deterministe par product_help.

**Skills / Operations / Tools**
- `product_help`: conforme sur le perimetre teste. Il explique sans creer puis transfere au dispatcher local cible.
- `prepare_attack_card`: bon owner apres handoff, mais stage technique trop large au T3.
- Tools: aucun tool appele; `tool_execution=blocked` sur les tours de preparation, donc aucun effet durable incorrect.

**Raw IA / Trace DB**
- Table: `public.llm_raw_response_events`.
- Request filter: `request_id like 'product-help-local-bridges-20260612-r4-rawtrace%'`.
- Lignes observees: 7.
- Sources observees: `dispatcher-v2-llm`, `prepare_attack_card.local_dispatcher`, `prepare_attack_card.visible.confirm_target_candidate`, `prepare_attack_card.visible.ask_or_confirm_technique`, `prepare_attack_card.visible.ask_platform_field`.
- Troncature: `raw_response_truncated=false` sur les lignes observees.
- Valeur QA: le JSON recu par `prepare_attack_card.local_dispatcher` est maintenant recuperable en DB pour T2, T3 et T4.

**Effets Durables**
- `direct_effects=[]` sur tous les tours.
- `executed_tools=[]` sur tous les tours.
- Aucun write produit attendu ni observe pendant cette portion du flow.
- Cleanup non execute pour garder les artefacts accessibles.

**Fix propose**
- Source amont: `prepare_attack_card` local dispatcher / visible agent, pas product_help.
- Correction recommandee: renforcer la regle de rendu de `candidate_options` et la politique de recommandation de technique. Garder le bridge product_help tel quel.
- Tests d'invariant attendus: product_help -> attack reste `product_help_exit_to_global_dispatcher`; T3 variantes de blocker papier/surcharge proposent une option restreinte; le visible ne liste pas des techniques absentes de `conversation_context`; raw IA trace presente en DB quand le flag est actif.

## 5. Verdict Global

**Verdict: yellow.**

Le fix demande pour `product_help` est vert: la demande operationnelle sort bien de product_help et arrive dans le dispatcher local `prepare_attack_card`, sans passer par le legacy ni produire de carte directement. Le run reste yellow parce que `prepare_attack_card` elargit au T3 le choix de technique au lieu de respecter strictement les candidates/recommandations du dispatcher. Le stockage DB des sorties IA est valide et exploitable sur ce run.
