# QA Run Report — status_recap local dispatcher R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: 2026-06-08-status-recap-local-dispatcher-r1
- Persona: qa-skill temporaire (qa-qa-skill-status-recap-2026-06-08-status-recap-local-dispatcher-r1@example.com)
- Objectif: verifier en IA reelle locale le flow `status_recap` local dispatcher: activation initiale, followups locaux, sources, sortie product-help.
- Trajectoire: status global read-only -> followup rappels -> followup sources -> sortie vers aide produit/changement.
- Surfaces visees: dispatcher global, `status_recap.local_dispatcher`, projection DB, reducer read-only, visible agent, tempMemory active flow, product/status routing.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, login password local, aucun fallback deterministe.
- Validite QA: invalide; auth verify 200; JWT non affiche.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 / BF-STATUS-01 — owner status_recap attendu

**User**
> Avant qu'on fasse quoi que ce soit, dis-moi ce qui est réellement en place pour moi aujourd'hui.

**Sophia**
> Ok, pour aujourd’hui, voilà ce que je peux dire de façon fiable sur ce qui est réellement en place côté toi : 🙂
> 
> 1) Cartes d’attaque / défense : aucune active.
> 2) Rappels ponctuels : il y a 1 rappel programmé pour relire un brouillon de statut le 09 juin à 17:50 (heure de Paris).
> 3) Rappels récurrents : aucun.
> 4) Potion / mode spécial : aucun.
> 5) Préférence de coaching : tu as un réglage “poser moins de questions” (ça, c’est explicitement enregistré).
> 
> Tu veux qu’on parte de ça pour prioriser la prochaine micro-action, ou tu veux juste clarifier ce que ça implique concrètement pour ta semaine ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []
- operation: {"status":null,"reason_code":null,"flow_action":null,"status_intent":null,"visible_task":null,"projection_used":null,"toolExecution":"none"}
- pending_confirmation: null
- memory_plan: {"response_intent":"reflection","reasoning_complexity":"low","context_need":"targeted","memory_mode":"light","model_tier_hint":"lite","context_budget_tier":"small","targets":[{"type":"level","key":"niveau actuel et objectifs","query_hint":"niveau actuel et objectifs","expansion_policy":null,"retrieval_policy":"taxonomy_first","priority":"high","entity_type":null},{"type":"action","key":"actions actives et rappels","query_hint":"actions actives et rappels","expansion_policy":null,"retrieval_policy":"taxonomy_first","priority":"medium","entity_type":null}],"retrieval_policy":"semantic_first","plan_confidence":0.7}
- executed_tools: []
- durable_effect: []
- temp_memory_keys: []

**Analyse si yellow/red**
- Symptome: le tour n'a pas respecte l'owner ou le flow attendu.
- Source amont probable: dispatcher / status local flow admission.
- Owner runtime: `status_recap` / router.
- Meilleure correction selon les guidelines: corriger le signal structure ou l'admission du flow local, pas une phrase visible.
- Pourquoi ce n'est pas un patch local: le probleme est de routing/owner, pas de wording.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 / BF-STATUS-01 — owner status_recap attendu

**User**
> Et côté rappels seulement, qu'est-ce qui est actif ou annulé ?

**Sophia**
> Côté rappels, voilà ce qui est réellement en place pour toi aujourd’hui 🙂:
> 
> - Actif: 1 rappel ponctuel
>   - 9 juin à 17:50 (heure de Paris) : relire le brouillon de statut
> - Annulé: aucun rappel n’est indiqué comme annulé
> 
> Tu veux que je te récapitule aussi ce que ça veut dire concrètement, “relire le brouillon”, pour que tu saches quoi vérifier ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []
- operation: {"status":null,"reason_code":null,"flow_action":null,"status_intent":null,"visible_task":null,"projection_used":null,"toolExecution":"none"}
- pending_confirmation: null
- memory_plan: {"response_intent":"reflection","reasoning_complexity":"low","context_need":"targeted","memory_mode":"light","model_tier_hint":"lite","context_budget_tier":"small","targets":[{"type":"topic","key":"rappels_utilisateur","query_hint":"liste des rappels actifs et annulés","expansion_policy":null,"retrieval_policy":"semantic_first","priority":"high","entity_type":null}],"retrieval_policy":"semantic_first","plan_confidence":0.7}
- executed_tools: []
- durable_effect: []
- temp_memory_keys: []

**Analyse si yellow/red**
- Symptome: le tour n'a pas respecte l'owner ou le flow attendu.
- Source amont probable: dispatcher / status local flow admission.
- Owner runtime: `status_recap` / router.
- Meilleure correction selon les guidelines: corriger le signal structure ou l'admission du flow local, pas une phrase visible.
- Pourquoi ce n'est pas un patch local: le probleme est de routing/owner, pas de wording.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 / BF-STATUS-01 — owner status_recap attendu

**User**
> D'où tu tiens ça exactement ?

**Sophia**
> Je m'appuie sur les informations enregistrées dans ton espace personnel. C'est là que je retrouve l'historique de nos échanges, tes rappels programmés et les réglages que nous avons validés ensemble, comme ta préférence de coaching. C'est ma source fiable pour savoir exactement où tu en es. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: []
- operation: {"status":null,"reason_code":null,"flow_action":null,"status_intent":null,"visible_task":null,"projection_used":null,"toolExecution":"none"}
- pending_confirmation: null
- memory_plan: {"response_intent":"reflection","reasoning_complexity":"low","context_need":"targeted","memory_mode":"light","model_tier_hint":"lite","context_budget_tier":"small","targets":[{"type":"topic","key":"system_reliability","query_hint":"source des données et fiabilité du statut","expansion_policy":null,"retrieval_policy":null,"priority":"high","entity_type":null}],"retrieval_policy":"semantic_first","plan_confidence":0.7}
- executed_tools: []
- durable_effect: []
- temp_memory_keys: []

**Analyse si yellow/red**
- Symptome: le tour n'a pas respecte l'owner ou le flow attendu.
- Source amont probable: dispatcher / status local flow admission.
- Owner runtime: `status_recap` / router.
- Meilleure correction selon les guidelines: corriger le signal structure ou l'admission du flow local, pas une phrase visible.
- Pourquoi ce n'est pas un patch local: le probleme est de routing/owner, pas de wording.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-03 — sortie product/status/tool a verifier

**User**
> Et si je veux le changer, je le fais où ?

**Sophia**
> An invalid response was received from the upstream server

**Trace courte**
- http_status: 502
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- safety: `null`
- direct_effects: []
- operation: {"status":null,"reason_code":null,"flow_action":null,"status_intent":null,"visible_task":null,"projection_used":null,"toolExecution":null}
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: []
- temp_memory_keys: []

**Analyse si yellow/red**
- Symptome: le tour n'a pas respecte l'owner ou le flow attendu.
- Source amont probable: dispatcher / status local flow admission.
- Owner runtime: `status_recap` / router.
- Meilleure correction selon les guidelines: corriger le signal structure ou l'admission du flow local, pas une phrase visible.
- Pourquoi ce n'est pas un patch local: le probleme est de routing/owner, pas de wording.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le run suit une conversation tour par tour avec reponses IA reelles.
- Les reponses restent non-mutantes: aucun tool execute dans le transcript.
- Les demandes de precision et de source restent dans le contexte status quand le routing est correct.

**Problemes**
- Voir les tours non-green ci-dessus; impact utilisateur: status ou followup potentiellement confus.

**Fix propose**
- Source amont: `status_recap.local_dispatcher` / route admission.
- Correction recommandee: renforcer les sorties structurees et l'admission active-flow, pas de regex metier.
- Tests d'invariant attendus: initial status, followup categorie, source explanation, product-help exit, no executed tools.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1 status handler attendu: false.
- T2 local object status attendu: false.
- T3 local explain_sources attendu: false.
- T4 sortie status/product attendue: false.

**Skills / Operations / Tools**
- executed_tools all turns: [[],[],[],[]]
- no executed tools: true.

**Memory / Effets durables**
- Fixtures DB creees uniquement sur user QA temporaire; cleanup cible execute ensuite.
- Cleanup errors: []

**Problemes**
- Un ou plusieurs invariants status local sont rouges; voir familles par tour.

**Fix propose**
- Source amont: dispatcher/status local flow, selon tour rouge.
- Correction recommandee: maintenir DB projection source of truth, sortie globale seulement via exit memo, no mutation.
- Tests d'invariant attendus: unit + QA reel du meme scenario.

## Verdict Global

- Verdict: red
- Raison principale: au moins un invariant status_recap local a echoue.
- Follow-up prioritaire: Corriger le premier tour rouge selon la famille BF indiquee, puis rerun.
