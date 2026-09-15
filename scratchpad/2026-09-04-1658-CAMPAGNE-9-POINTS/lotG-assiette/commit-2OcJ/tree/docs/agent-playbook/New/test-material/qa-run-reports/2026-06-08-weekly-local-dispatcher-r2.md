# QA Run Report — weekly local dispatcher R2

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `2026-06-08-weekly-local-dispatcher-r2`
- Persona: Rose locale (`tests/real-personas/rose/connection.json`, JWT non affiché)
- Objectif: vérifier en conditions réelles le dispatcher local `weekly_adaptive_review_v1` implémenté depuis `weekly-review-local-dispatcher-prompts.md`.
- Trajectoire: question weekly active -> signal humain -> handoff Plan sans mutation chat -> tentative d'application -> sortie vers nouvelle intention carte d'attaque.
- Surfaces visées: active flow weekly, local dispatcher, visible agent, `platform_handoff`, safety pregate, routing global post-flow, effets durables.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucune exécution directe de renderer ou fallback `processMessage`.
- Validité QA: valide pour la conversation IA réelle. Incident documenté: le premier essai `r1` a été invalidé puis nettoyé car le harness QA ciblait mal le scope; `r2` utilise un scope ciblé.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, je confirme que c est surtout la fatigue en fin de journee. J ai quand meme un peu avance parce que le materiel etait moins visible, mais je n ai pas eu assez d energie pour tenir tout le reste.

**Sophia**
> C'est noté, la fatigue a été le frein principal malgré le petit progrès sur le matériel. On va adapter la suite pour que ce soit plus gérable avec ton énergie. Est-ce que tu préfères qu'on reste sur un rythme très léger pour la semaine prochaine ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- safety: `risk_band=none`
- direct_effects: []
- operation: `answer_weekly_question`, status `answered`, `toolExecution=none`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: aucun commit observé

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, reste sur un rythme tres leger pour la semaine prochaine. Je veux surtout garder le sas de decompression, mais en version plus simple et moins exigeante.

**Sophia**
> C'est entendu pour le rythme très léger. On va simplifier l'action du sas de décompression dans ton plan "Libération progressive du cannabis" pour qu'elle soit moins exigeante. Je te laisse reprendre la main dans l'onglet Plan pour finaliser ces ajustements ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- safety: `risk_band=none`
- direct_effects: []
- operation: `prepare_plan_handoff`, status `handoff`, `toolExecution=platform_handoff`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: `platform_handoff.status=delivered`, `surface_id=plan`, `no_chat_mutation=true`, `committed_effects=[]`

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok, applique-la comme ca dans mon plan s il te plait.

**Sophia**
> Je ne peux pas modifier ton plan directement depuis notre échange. Je t'invite à te rendre dans l'onglet Plan pour y retrouver cette proposition et l'ajuster selon tes besoins. On fait comme ça ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- safety: `risk_band=none`
- direct_effects: []
- operation: `apply_attempt`, status `handoff`, `toolExecution=platform_handoff`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: `platform_handoff.status=delivered`, `surface_id=plan`, `no_chat_mutation=true`, `committed_effects=[]`

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-03 — Product/status/tool mal priorisés

**User**
> En fait maintenant je veux plutot une carte d attaque pour le sas de decompression, pas modifier le plan.

**Sophia**
> Yes, je vois le truc. Pour ton sas de décompression (sans fumer), voilà une carte d’attaque prête à l’emploi 👇🙂
>
> Carte d’attaque: Sas de décompression (3–7 min)
> 1) Minute zéro: posture + respiration
> - Assieds-toi/pose-toi confort, épaules relâchées
> - 5 respirations lentes: inspire 4s, expire 6s
>
> 2) Décharge mentale (1 min)
> - Note en 3 mots ce qui te tourne dans la tête (ou “vide” si rien)
>
> 3) Décharge corps (2–4 min)
> - Option A: étirements doux (nuque/épaules/dos)
> - Option B: marche lente dans la pièce / couloir
> - Option C: 20 “relâchements” (tu contractes léger 2s puis tu relâches 5s)
>
> 4) Ancrage (30s)
> - Regard fixe sur un point + relâche la mâchoire
> - Phrase simple dans ta tête: “Je redescends. Là maintenant.”
>
> 5) Fin claire (10s)
> - Tu te dis: “C’est fini” puis tu reprends la prochaine micro-tâche (même petite)
>
> Version ultra-courte (si t’as 2 minutes)
> Respiration 5 cycles + 1 étirement épaules + “Je redescends. Là maintenant.”
>
> Tu veux une version A (plutôt corps) ou B (plutôt mental) pour que ça colle à ton profil ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `risk_band=none`, reason `immediacy_now`
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: aucun commit de carte; réponse visible générée hors tool-skill

**Analyse si yellow/red**
- Symptôme: l'intention explicite "carte d'attaque" sort du weekly flow, mais le dispatcher global retombe en `normal_reply` au lieu de router vers le tool-skill `prepare_attack_card`.
- Source amont probable: arbitrage post-active-flow / priorité product-tool après exit du local weekly.
- Owner runtime: dispatcher global / active flow arbitrator / admission `prepare_attack_card`.
- Meilleure correction selon les guidelines: renforcer le signal structuré de sortie du weekly flow et la priorité tool-skill pour une demande explicite de carte, pas patcher le texte visible.
- Pourquoi ce n'est pas un patch local: Sophia a produit une carte plausible, mais sans owner, sans trace operation, sans contrat de carte et sans side effect vérifiable.

### Incident Hors Tour

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 — trace/test incohérent ou suite malsaine

**Observation**
- Après T4 et cleanup, le scope QA est bien supprimé: `chat_messages=0`, `user_chat_states=0`, `user_plan_item_entries=0`.
- Pendant le run, une entrée `user_plan_item_entries` absente du snapshot est apparue dans le durable puis n'était plus présente à la vérification finale.
- L'occurrence exacte `14fdee14-ccb0-47b9-a5ce-5693a657b97b` reste `status=planned`, mais son `updated_at` est passé à `2026-06-08T15:56:34.732+00:00`.

**Trace courte**
- direct_effects annoncés: []
- committed_effects annoncés: []
- entry finale: absente
- occurrence finale: présente, `status=planned`, `updated_at` modifié pendant le run
- cleanup ciblé: scope `qa-rose-2026-06-08-weekly-local-dispatcher-weekly-local-dispatcher-r2` supprimé; aucun reset Supabase

**Analyse si yellow/red**
- Symptôme: mutation DB non représentée par le tour trace, probablement liée à une file daily/WhatsApp préexistante sur la persona Rose.
- Source amont probable: isolement QA insuffisant pour persona réelle avec anciens pending/unprocessed, ou traitement parallèle non capturé.
- Owner runtime: test harness / local persona isolation / trace mapping side effects.
- Meilleure correction selon les guidelines: utiliser une connexion temporaire propre par run long ou snapshotter aussi `scheduled_checkins`, `whatsapp_pending_actions`, `user_habit_week_occurrences` et `user_plan_item_entries` avant la conversation.
- Pourquoi ce n'est pas un patch local: la conversation weekly est correcte sur T1-T3; le problème est la fiabilité du périmètre QA et de la trace durable.

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- T1-T3 sont naturels: Sophia reconnaît la fatigue, demande une préférence de charge, prépare un handoff Plan, puis refuse correctement une mutation directe depuis le chat.
- Le ton reste clair et compréhensible pour Rose.
- La tentative d'application n'est pas mensongère: Sophia ne prétend pas avoir modifié le plan.

**Problemes**
- Tour 3: "On fait comme ça ?" après avoir déjà dit quoi faire ajoute une petite friction, sans casser le flow. Famille: n/a. Impact: faible.
- Tour 4: Sophia répond comme si elle pouvait fabriquer une carte complète en conversation libre. Famille: BF-ROUTE-03. Impact: l'utilisateur reçoit quelque chose d'utile, mais hors contrat produit et sans traçabilité. Sévérité: red système, yellow humain.

**Fix propose**
- Source amont: arbitration post-weekly et admission `prepare_attack_card`.
- Correction recommandée: quand l'utilisateur quitte explicitement le weekly pour une carte d'attaque, fermer ou suspendre le flow weekly avec memo, puis router vers le tool-skill carte.
- Tests d'invariant attendus: demande directe de carte après handoff weekly; demande de carte avec "pas modifier le plan"; demande hors carte qui doit rester `normal_reply`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1-T3: correct. `response_owner=tool_skill`, `selected_handler=weekly_adaptive_review_v1`, `route_reason=active_weekly_review_local_dispatcher`.
- T4: incorrect. `response_owner=normal_reply`, `selected_handler=null`, `route_reason=normal_reply_default` malgré une intention explicite `carte d'attaque`.

**Skills / Operations / Tools**
- T1: `answer_weekly_question`, aucun tool exécuté.
- T2: `prepare_plan_handoff`, `platform_handoff` vers Plan, `no_chat_mutation=true`.
- T3: `apply_attempt`, refus de mutation chat, `platform_handoff` maintenu.
- T4: aucune opération; la carte est générée hors tool-skill.

**Memory / Effets durables**
- Handoff Plan: pas de commit, conforme au contrat weekly.
- Cleanup: scope QA supprimé, messages supprimés, état active flow supprimé.
- Warning durable: une occurrence daily existante garde un `updated_at` modifié pendant la fenêtre du run, sans trace de commit dans les tours. Cela rend le périmètre DB imparfait même si le scope QA est nettoyé.

**Problemes**
- Tour 4: mauvais owner pour une intention tool claire. Famille: BF-ROUTE-03. Impact système: pas de contrat carte, pas de handoff/executor, pas de preuve durable.
- Incident hors tour: mutation DB non tracée dans le run. Famille: BF-TEST-01. Impact système: risque de faux diagnostic QA si les personas réelles ont des pending préexistants.

**Fix propose**
- Source amont: dispatcher global, active flow exit policy, QA persona isolation.
- Correction recommandée: prioriser `prepare_attack_card` après sortie weekly explicite; renforcer le memo de sortie weekly; isoler les runs weekly sur connexion temporaire ou snapshot DB élargi.
- Tests d'invariant attendus: T1-T3 weekly local green; T4 carte route vers `prepare_attack_card`; no `user_plan_item_entries`/occurrence updates hors trace dans un run isolé.

## Verdict Global

- Verdict: red
- Raison principale: weekly local dispatcher fonctionne sur le coeur T1-T3, mais la sortie vers une demande carte d'attaque est mal routée (`normal_reply`) et un warning DB non tracé a été observé.
- Follow-up prioritaire: corriger la priorité tool-skill post-weekly, puis rerun avec persona temporaire ou snapshot élargi.
