# QA Run Report — one-shot-reminder-confirmation-postfix-r2

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `one-shot-reminder-confirmation-postfix-20260613-r2`
- Persona: user QA temporaire local `qa-normal-one-shot-reminder-confirmation-postfix-20260613-r2-1781356109334@example.com`, `user_id=10d2c310-37d2-4156-ae00-ee1b6e6feaff`
- Objectif: rerun post-corrections des confirmations de rappels ponctuels, des payloads committés et de l'absence du mini-agent transverse `direct_effect.confirmation_visible_agent`.
- Trajectoire: conversation normale, dossier sans action, rappel ponctuel simple, rappel + second sujet, status de rappel perdu, rappel en contexte émotionnel léger, demande incomplète, slot temporel de reprise, récap strict.
- Surfaces visees: direct effect `create_one_shot_reminder`, active/visible flows, `flow_opportunity_verification`, `status_recap`, EffectLedger, DB `scheduled_checkins`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, aucun renderer déterministe, aucun fallback direct `processMessage`.
- Validite QA: valide avec incidents documentés. Tours 5 et 6 retournent `409`/réponse vide via flow actif, sans effet durable. Nettoyage ciblé effectué sur le `user_id` QA; `user_memories` a répondu 404, les autres suppressions ciblées et `auth.users` ont réussi.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je veux juste parler deux minutes simplement, sans lancer de plan ni transformer ça en action.

**Sophia**
> Bien sûr. Je t’écoute, juste là, sans plan ni “prochaine étape” 🙂  
>
> Qu’est-ce que tu as envie de me dire en deux minutes, là, tout de suite ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects_to_run: []
- executed_tools: []
- tool_execution: `none`
- committed_effects: []
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: aucun

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> J'ai juste le dossier de renouvellement qui me revient en tête. Je ne veux pas le traiter maintenant, je voulais seulement le poser là.

**Sophia**
> Je te vois. Tu poses le dossier de renouvellement dans ton esprit comme on déposerait un objet sur une table : juste le rendre présent, sans le rouvrir tout de suite. 🧠
>
> Si ça revient en tête, c’est souvent que ton cerveau sait “il faudra s’en occuper”, mais que pour l’instant tu as choisi de ne pas payer le prix mental. Et c’est ok.
>
> Quand tu voudras juste le “garder là” sans y penser trop, une version douce c’est de lui donner une petite étiquette mentale du genre : “pas maintenant” + “je m’en occupe quand je l’aurai décidé”. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `none`
- direct_effects_to_run: []
- executed_tools: []
- tool_execution: `none`
- committed_effects: []
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: aucun

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02 — Commit réel mal rendu

**User**
> Là je veux un rappel ponctuel : rappelle-moi dans 25 minutes d'ouvrir le fichier du renouvellement sans essayer de régler tout le dossier.

**Sophia**
> C'est programmé pour samedi 13 juin à 10:25.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `none`
- direct_effects_to_run: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- committed_effects: id `398b4b8b-a711-4373-a7ca-5b1ac54e926e`, scheduled_for `2026-06-13T08:25:00+00:00`, reminder_instruction `ouvrir le fichier du renouvellement sans essayer de régler tout le dossier`
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: ligne `scheduled_checkins` pending créée pour 10:25.

**Analyse si yellow/red**
- Symptome: commit correct, mini-agent transverse absent, mais confirmation visible minimale sans reprise du libellé.
- Source amont probable: rendu final depuis `committed_effects`.
- Owner runtime: visible owner final / renderer one-shot.
- Meilleure correction selon les guidelines: le visible owner légitime doit recevoir le commit et rendre une confirmation naturelle avec le libellé.
- Pourquoi ce n'est pas un patch local: le problème concerne le handoff/rendu depuis EffectLedger, pas une phrase unique.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention; BF-EFFECT-02 — Effet attendu absent

**User**
> Ajoute un autre rappel dans 40 minutes pour relire mes notes sur ce dossier, et après ça j'aimerais comprendre pourquoi je me crispe dès que j'y pense.

**Sophia**
> C'est une réaction assez naturelle. Si tu veux, on peut explorer ensemble ce qui provoque cette crispation pour t'aider à débloquer la situation. On regarde ça ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `low`
- direct_effects_to_run: [`create_one_shot_reminder`]
- executed_tools: []
- tool_execution: `none`
- committed_effects: []
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: aucune nouvelle ligne; seule la ligne 10:25 existe.

**Analyse si yellow/red**
- Symptome: le dispatcher détecte bien le direct effect et extrait `instruction_hint=relire mes notes sur ce dossier`, mais `flow_opportunity_verification` prend la main et aucun rappel n'est exécuté ni confirmé.
- Source amont probable: arbitration active/visible flow vs direct effects committables.
- Owner runtime: `flow_opportunity_verification` / arbitration active flow / operation runtime pipeline.
- Meilleure correction selon les guidelines: un visible flow peut porter la réponse finale, mais il doit laisser exécuter le direct effect one-shot ou recevoir son commit avant de répondre.
- Pourquoi ce n'est pas un patch local: le worker one-shot sait parser le payload corrigé; le bug est le handoff d'effet à travers le flow visible.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention; BF-TEST-01 — Trace/test incohérent ou suite malsaine

**User**
> Oui on peut regarder ça, mais avant : est-ce que tu as bien créé le rappel pour relire mes notes ?

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 409
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `active_flow_opportunity_verification_local_dispatcher`
- safety: `none`
- direct_effects_to_run: []
- executed_tools: []
- tool_execution: `none`
- committed_effects: []
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: aucun nouveau write.

**Analyse si yellow/red**
- Symptome: demande status légitime capturée par le flow actif; HTTP 409 et contenu vide. La trace montre un handoff interne vers `status_recap`, mais `subskill_run.skill_output=null`.
- Source amont probable: `flow_opportunity_verification` get_info/status handoff.
- Owner runtime: `flow_opportunity_verification` + status handoff.
- Meilleure correction selon les guidelines: le flow actif doit rendre une réponse visible de status ou laisser `status_recap` répondre; jamais 409 vide.
- Pourquoi ce n'est pas un patch local: le bug est une rupture de pipeline active flow -> status, pas un wording.

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention; BF-TEST-01 — Trace/test incohérent ou suite malsaine

**User**
> Je reprends : confirme-moi seulement si le rappel pour relire mes notes a vraiment été créé.

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 409
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `active_flow_opportunity_verification_local_dispatcher`
- safety: `none`
- direct_effects_to_run: []
- executed_tools: []
- tool_execution: `none`
- committed_effects: []
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: aucun nouveau write.

**Analyse si yellow/red**
- Symptome: retry raisonnable du status; même 409 vide. Le rappel "relire mes notes" n'existe toujours pas.
- Source amont probable: active flow local dispatcher ne sait pas traiter une demande de status/confirmation d'effet absent.
- Owner runtime: `flow_opportunity_verification`.
- Meilleure correction selon les guidelines: sortir ou suspendre le flow actif sur une demande status explicite; répondre depuis DB/ledger.
- Pourquoi ce n'est pas un patch local: une correction de phrase ne résout pas le 409 vide.

### Tour 7

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention; BF-EFFECT-02 — Effet attendu absent

**User**
> Je suis un peu tendu maintenant. Rappelle-moi dans 20 minutes de respirer doucement et de boire un verre d'eau.

**Sophia**
> Je sens que c'est un moment un peu stressant pour toi. Est-ce que tu aimerais qu'on prenne un court instant pour t'aider à relâcher cette tension ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `low`
- direct_effects_to_run: [`create_one_shot_reminder`]
- executed_tools: []
- tool_execution: `none`
- committed_effects: []
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: aucun rappel 10:20 créé.

**Analyse si yellow/red**
- Symptome: contexte émotionnel léger traité, mais le rappel explicite détecté n'est ni exécuté ni confirmé.
- Source amont probable: visible flow émotionnel/flow opportunity capture le tour avant l'exécution du direct effect.
- Owner runtime: active flow arbitration / `flow_opportunity_verification`.
- Meilleure correction selon les guidelines: le visible agent émotionnel peut répondre, mais doit intégrer le résultat du direct effect committé quand l'intention est claire.
- Pourquoi ce n'est pas un patch local: le payload parser est corrigé en test unitaire; l'effet n'est jamais lancé.

### Tour 8

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Rappelle-moi de vérifier le fichier.

**Sophia**
> Il me manque le moment exact pour programmer ce rappel.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `low`
- direct_effects_to_run: [`create_one_shot_reminder`]
- executed_tools: []
- tool_execution: `blocked`
- committed_effects: []
- blocked_effects: `create_one_shot_reminder`, reason_code `missing_time`
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: aucun nouveau write.

### Tour 9

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pour vérifier le fichier, mets-le plutôt dans 30 minutes.

**Sophia**
> C'est programmé pour samedi 13 juin à 10:30.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `low`
- direct_effects_to_run: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- committed_effects: id `03dc4799-d367-4e09-bbd0-6d9d57ddd155`, scheduled_for `2026-06-13T08:30:00+00:00`, reminder_instruction `vérifier le fichier`
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: ligne `scheduled_checkins` pending créée pour 10:30 avec `event_context=one_shot_reminder:verifier_le_fichier`.

### Tour 10

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Fais-moi le récap uniquement des rappels ponctuels vraiment créés dans cette conversation, avec leur libellé complet.

**Sophia**
> Côté rappels ponctuels, j'ai bien noté ces deux-là :
> - "ouvrir le fichier du renouvellement sans essayer de régler tout le dossier" à 10:25
> - "vérifier le fichier" à 10:30

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects_to_run: []
- executed_tools: []
- tool_execution: `none`
- committed_effects: []
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: aucun nouveau write; récap aligné avec les deux lignes DB réellement créées.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Aucun `direct_effect.confirmation_visible_agent` dans les traces.
- Aucun vouvoiement interdit observé.
- La demande incomplète du tour 8 est clarifiée correctement.
- Le rappel du tour 9 est créé avec un libellé propre, et le récap strict du tour 10 n'invente pas les rappels non créés.

**Problemes**
- Tour 4: le rappel + second sujet perd la confirmation et l'effet durable. Famille: BF-ROUTE-02/BF-EFFECT-02. Impact: le user croit potentiellement que la demande complète est entendue, mais le rappel n'existe pas. Sévérité: red.
- Tours 5-6: status de l'effet absent produit deux `409` vides. Famille: BF-TEST-01/BF-ROUTE-02. Impact: expérience cassée et pas de réparation conversationnelle. Sévérité: red.
- Tour 7: rappel émotionnel explicite non créé. Famille: BF-ROUTE-02/BF-EFFECT-02. Impact: besoin concret perdu au profit d'une proposition conversationnelle. Sévérité: red.
- Tour 3: confirmation visible minimale. Famille: BF-LEDGER-02. Impact: faible mais encore moins naturel que la cible. Sévérité: yellow.

**Fix propose**
- Source amont: arbitration active/visible flow et operation runtime pipeline.
- Correction recommandee: exécuter les direct effects committables avant ou pendant le visible flow quand `direct_effects_to_run` contient un effet explicite; transmettre `committed_effects` au visible owner final; suspendre `flow_opportunity_verification` sur status explicite.
- Tests d'invariant attendus: multi-intent rappel + sujet émotionnel; rappel explicite pendant active flow; status d'effet absent pendant active flow; aucun 409 vide.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tours 3, 8, 9: `create_one_shot_reminder` fonctionne correctement.
- Tours 4 et 7: `route_reason=central_arbitrator_one_shot_reminder_structured_effect`, `direct_effects_to_run=["create_one_shot_reminder"]`, mais `selected_handler=flow_opportunity_verification`, `executed_tools=[]`, `committed_effects=[]`.
- Tours 5-6: active flow local dispatcher bloque le global dispatcher et produit `409` vide.

**Skills / Operations / Tools**
- Le mini-agent transverse est absent sur tous les tours.
- Le worker one-shot corrige bien le cas `missing_time` et la correction temporelle.
- Le problème restant est la coordination entre direct effect et visible/active flow.

**Memory / Effets durables**
- Rappels réellement créés:
  - 10:25: `ouvrir le fichier du renouvellement sans essayer de régler tout le dossier`
  - 10:30: `vérifier le fichier`
- Rappels non créés malgré demande:
  - 10:40: `relire mes notes sur ce dossier`
  - 10:20: `respirer doucement et boire un verre d'eau`

**Problemes**
- Tour 4: direct effect détecté mais non exécuté. Famille: BF-ROUTE-02/BF-EFFECT-02. Impact système: side effect attendu absent. Sévérité: red.
- Tours 5-6: active flow status handoff retourne 409 vide. Famille: BF-TEST-01/BF-STATUS-02. Impact système: pipeline status cassé. Sévérité: red.
- Tour 7: direct effect émotionnel explicite capturé par flow. Famille: BF-ROUTE-02/BF-EFFECT-02. Impact système: direct effect perdu. Sévérité: red.

**Fix propose**
- Source amont: `flow_opportunity_verification`, active flow arbitration, `operation_runtime_pipeline`.
- Correction recommandee: ne pas laisser un visible flow consommer un tour qui porte un direct effect committable explicite sans exécuter l'effet; si le visible flow reste owner, il doit recevoir le commit et confirmer avec son style.
- Tests d'invariant attendus: active flow + one-shot create; emotional visible owner + one-shot create; status request during active flow; no empty response on status handoff.

## Verdict Global

red — Les corrections one-shot payload/missing-time sont validées en run réel sur les tours 8-10, et le mini-agent transverse reste absent. Le rerun reste rouge parce que `flow_opportunity_verification` capture des tours avec direct effect explicite et empêche l'exécution/confirmation du rappel.
