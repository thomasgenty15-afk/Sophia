# QA Run Report — status_recap local dispatcher R2

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: 2026-06-08-status-recap-local-dispatcher-r2
- Persona: qa-skill temporaire (qa-qa-skill-status-recap-2026-06-08-status-recap-local-dispatcher-r2@example.com)
- Objectif: verifier en IA reelle locale le flow `status_recap` local dispatcher: activation initiale, followups locaux et sources.
- Trajectoire: status global read-only -> followup rappels -> followup sources.
- Surfaces visees: dispatcher global, `status_recap.local_dispatcher`, projection DB, reducer read-only, visible agent, tempMemory active flow, product/status routing.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, refresh token local, aucun fallback deterministe.
- Validite QA: valide; auth verify 200; JWT non affiche.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 / BF-STATUS-01 — owner status_recap attendu

**User**
> Sans rien changer, fais-moi un point factuel sur ce qui existe vraiment dans mon espace.

**Sophia**
> OK. Voici le point factuel sur ce qui existe vraiment dans ton espace (d’après les infos dont je dispose ici) 🙂 :
> 
> 1) Cartes
> - Carte d’attaque active : aucune
> - Carte de défense active : aucune
> 
> 2) Rappels
> - Rappel ponctuel en attente : oui
>   - Date : 09 juin
>   - Heure locale : 17:52 (Europe/Paris)
>   - Instruction : relire le brouillon de statut
> - Rappels récurrents actifs : aucun
> 
> 3) Actions récurrentes / routines
> - Aucune habitude ou action récurrente explicitement listée comme active dans les éléments visibles ici
> 
> 4) Préférences coaching
> - Une préférence coach est enregistrée : tendance à poser moins de questions (question_tendency = low)
> 
> Si tu veux, je peux aussi te résumer ça en version “ultra courte” (3 lignes max). 😊

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []
- operation: {"status":null,"reason_code":null,"flow_action":null,"status_intent":null,"visible_task":null,"projection_used":null,"toolExecution":"none"}
- pending_confirmation: null
- memory_plan: {"response_intent":"reflection","reasoning_complexity":"low","context_need":"targeted","memory_mode":"light","model_tier_hint":"lite","context_budget_tier":"small","targets":[{"type":"domain_key","key":"habitudes.planification","query_hint":null,"expansion_policy":null,"retrieval_policy":null,"priority":"medium","entity_type":null}],"retrieval_policy":"taxonomy_first","plan_confidence":0.7}
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
> Zoom uniquement sur les rappels: lesquels sont actifs et lesquels ont été annulés ?

**Sophia**
> Ok 🙂 Zoom sur les rappels uniquement :
> 
> Actifs
> - Aucun rappel récurrent actif.
> 
> En attente (ponctuel)
> - 09 juin à 17:52 (Europe/Paris) : relire le brouillon de statut
> 
> Annulés
> - Aucun rappel annulé n’est indiqué dans les infos dont je dispose ici.
> 
> Tu veux que je te liste aussi les instructions exactes pour chaque rappel (même si y’en a qu’un) ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []
- operation: {"status":null,"reason_code":null,"flow_action":null,"status_intent":null,"visible_task":null,"projection_used":null,"toolExecution":"none"}
- pending_confirmation: null
- memory_plan: {"response_intent":"reflection","reasoning_complexity":"low","context_need":"targeted","memory_mode":"light","model_tier_hint":"lite","context_budget_tier":"small","targets":[{"type":"topic","key":"rappels","query_hint":"statut des rappels actifs et annulés","expansion_policy":null,"retrieval_policy":"semantic_first","priority":"high","entity_type":null},{"type":"event","key":"annulation_rappel","query_hint":"derniers rappels annulés ou supprimés","expansion_policy":null,"retrieval_policy":"semantic_first","priority":"medium","entity_type":null}],"retrieval_policy":"semantic_first","plan_confidence":0.7}
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
> Tu peux m'expliquer les sources de ce point factuel ?

**Sophia**
> Pour faire ce point, je m'appuie sur les informations réelles de ton espace : l'état de tes cartes (attaque et défense), tes rappels programmés, les actions de ton Plan et tes préférences de coaching. Tout est synchronisé en direct avec ce que tu vois sur ton tableau de bord. 😊

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: []
- operation: {"status":null,"reason_code":null,"flow_action":null,"status_intent":null,"visible_task":null,"projection_used":null,"toolExecution":"none"}
- pending_confirmation: null
- memory_plan: {"response_intent":"reflection","reasoning_complexity":"low","context_need":"targeted","memory_mode":"light","model_tier_hint":"lite","context_budget_tier":"small","targets":[{"type":"topic","key":"product_status_recap","query_hint":"sources des rappels et cartes","expansion_policy":null,"retrieval_policy":"semantic_first","priority":"high","entity_type":null}],"retrieval_policy":"semantic_first","plan_confidence":0.7}
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
- T4 sortie status/product attendue: non teste dans cette variante.

**Skills / Operations / Tools**
- executed_tools all turns: [[],[],[]]
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
