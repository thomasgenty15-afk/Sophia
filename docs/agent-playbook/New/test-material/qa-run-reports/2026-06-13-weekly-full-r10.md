# QA Run Report - Weekly Full R10

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `weekly-full-20260613-r10-rose`
- Persona: Rose, connexion locale `tests/real-personas/rose/connection.json`
- Objectif: verifier en run IA reel les fixes R9: conservation de la parade concrete dans `prepare_defense_card` et absence de repetition `return_from_child_flow` avant synthese.
- Trajectoire: weekly opening -> experience de semaine -> action review/blocker -> progression objectif global -> qualification defense -> child flow `prepare_defense_card` -> handoff plateforme -> retour weekly -> synthese -> cloture.
- Surfaces visees: `weekly_adaptive_review_v1`, `prepare_defense_card`, retour parent apres child flow, durable weekly, cleanup QA.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, hors sandbox, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. 9 tours reels, http `200` a chaque tour, cleanup cible effectue, `remaining_scope_messages=0`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> On peut faire mon weekly maintenant. Je veux qu'on regarde la semaine posément.

**Sophia**
> On va regarder tout ça posément. Comment as-tu vécu cette semaine dans l'ensemble ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- visible_task: `ask_week_experience`
- safety: `none`
- committed_effects: `[]`

### Tour 2

**Verdict du tour:** green

**User**
> Globalement, c'était irrégulier. Le matériel hors de vue, je l'ai bien rangé en début de semaine mais jeudi soir tout est ressorti. Pour cibler le joint réflexe, j'ai mieux repéré le moment où ça part : quand je rentre tard et que je pose mon sac. Le sas sans fumer, j'ai tenu deux soirs, pas plus.

**Sophia**
> C'est un point clé d'avoir identifié ce lien avec tes retours tardifs. Quand tu rentres après une longue journée, qu'est-ce qui te semble le plus difficile pour lancer ton sas de décompression ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `explore_action_blocker`
- durable_effect: corrections `Ranger le matériel hors de vue=partial`, `Faire un sas de décompression=partial`
- committed_effects: `[]`

### Tour 3

**Verdict du tour:** green

**User**
> Le plus dur, c'est la minute où je rentre. Je suis fatiguée, je vois mes affaires, et je veux juste couper. Si je vais directement dans la salle de bain ça passe mieux, mais si je m'assois sur le canapé c'est fini.

**Sophia**
> Entre les défis du rangement et l'identification du piège du canapé, quel est ton sentiment sur ton avancée globale vers ton objectif cette semaine ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `ask_global_progress_feeling`
- committed_effects: `[]`

### Tour 4

**Verdict du tour:** green

**User**
> J'ai l'impression d'avoir avancé un peu parce que je comprends mieux le piège, mais émotionnellement je suis partagée. Je suis fière d'avoir tenu deux soirs, et en même temps j'ai peur que ça reste trop fragile.

**Sophia**
> C'est compréhensible de ressentir cette fragilité face à la fatigue. Pour protéger ton arrivée et éviter le piège du canapé, on pourrait explorer une piste consistant à utiliser la salle de bain comme zone tampon. Est-ce que cette approche te semble utile pour stabiliser ton sas de décompression ? Ce détour servira le bilan et nous reprendrons la suite juste après.

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `qualify_attack_or_defense_fit`
- flow_action: `confirm_weekly_diagnostic`
- committed_effects: `[]`

### Tour 5

**Verdict du tour:** green

**User**
> Oui, ça me semble utile. Je veux une défense très concrète : en rentrant, poser le sac à l'entrée, mettre les clés dans la salle de bain, lancer une douche de cinq minutes, et me dire 'je vais d'abord sous l'eau, après je verrai'.

**Sophia**
> Ton rituel est très précis pour éviter de t'installer sur le canapé. Quel est le signal de départ exact, le tout premier geste ou la première chose que tu vois, qui doit déclencher cet enchaînement dès ton arrivée ?

**Trace courte**
- selected_handler: `prepare_defense_card`
- route_reason: `weekly_adaptive_review_v1_handoff_to_prepare_defense_card`
- status: `collecting`
- committed_effects: `[]`

### Tour 6

**Verdict du tour:** green

**User**
> Le signal, c'est vraiment quand je ferme la porte derrière moi et que je pose mon sac. C'est là que je dois partir directement vers la salle de bain, sans m'asseoir.

**Sophia**
> C'est une excellente stratégie pour rompre cet automatisme. Voici les éléments que nous avons préparés ensemble pour ta carte de défense :
>
> Dans le champ **Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?**, tu peux copier : « Le moment où je rentre tard, fatiguée, et que je risque de m'asseoir sur le canapé par automatisme. »
>
> Pour le contexte du risque, tu as défini : « Le moment critique où la fatigue pousse à s'asseoir et à consommer par automatisme. »
>
> Et ton action de défense sera de : « poser le sac à l'entrée, mettre les clés dans la salle de bain, lancer une douche de cinq minutes, et me dire 'je vais d'abord sous l'eau, après je verrai' ».
>
> Pour finaliser, rends-toi dans l'action concernée du Plan, section Cartes de défense pour y saisir ces informations. La carte n'est pas créée automatiquement d'ici, c'est à toi de l'ajouter dans ton espace.

**Trace courte**
- selected_handler: `prepare_defense_card`
- status: `handoff_delivered`
- tool_execution: `platform_handoff`
- route_kind: `plan_item_card`
- no_chat_mutation: `true`
- prepared_fields.risk_context: `Le moment critique où la fatigue pousse à s'asseoir et à consommer par automatisme.`
- prepared_fields.defense_action: `poser le sac à l'entrée, mettre les clés dans la salle de bain, lancer une douche de cinq minutes, et me dire 'je vais d'abord sous l'eau, après je verrai'`
- committed_effects: `[]`

### Tour 7

**Verdict du tour:** green

**User**
> Parfait, je l'ajouterai moi-même dans le Plan. On peut revenir au weekly et faire la synthèse.

**Sophia**
> C'est entendu pour ton rituel de retour (sac, clés et douche). Les éléments sont prêts pour que tu puisses les saisir dans la section Cartes de défense de ton Plan. On passe maintenant à la synthèse de ta semaine ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `return_from_child_flow`
- reason_code: `weekly_review_gate_order_requires_return_from_child_flow`
- child_flow.result_details.return_acknowledged: `true`
- committed_effects: `[]`

### Tour 8

**Verdict du tour:** green

**User**
> Oui, synthétise : semaine irrégulière, rangement partiel, joint réflexe mieux identifié, sas partiel, et petite avancée mais encore fragile.

**Sophia**
> Cette semaine a été marquée par une certaine irrégularité et une fatigue bien présente. Tes actions, comme le rangement du matériel ou le sas de décompression, sont restées partielles et le progrès vers ton objectif semble encore fragile. Pour renforcer ton retour à la maison, les détails du rituel de défense (sac, clés, douche) sont prêts à être saisis par tes soins dans la section dédiée de ton Plan sur la plateforme. Est-ce que cette synthèse te convient pour clore la semaine ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `weekly_synthesis`
- reason_code: `weekly_review_local_recap_weekly`
- blocked_effects: `[]`
- committed_effects: `[]`

### Tour 9

**Verdict du tour:** green

**User**
> Oui, elle me convient. On peut clôturer le weekly.

**Sophia**
> C'est entendu. Notre point hebdomadaire est maintenant terminé. Les détails de ton rituel de retour ont été préparés pour que tu puisses les saisir dans ton Plan, au niveau des cartes de défense. Repose-toi bien et à bientôt pour la suite.

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- status: `closed`
- reason_code: `weekly_review_local_confirm_weekly_diagnostic`
- visible_task: `weekly_closure`
- durable: `status=completed`, `validation_unlock.status=available`, `closure_status=complete`
- committed_effects: `[]`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le weekly garde une progression lisible: ouverture, actions/gaps, blocage, ressenti global, détour défense, retour, synthèse, clôture.
- La proposition de défense arrive après exploration et consentement, pas comme raccourci automatique.
- Le child flow prépare une carte concrète sans prétendre la créer.
- Le retour weekly ne boucle plus: T7 fait le retour, T8 passe directement à la synthèse.
- Les statuts partiels restent partiels dans le visible et dans le durable.

**Problemes**
- Aucun bug bloquant ou yellow/red observe sur ce run.

**Fix propose**
- Aucun fix requis depuis R10.
- Invariants à conserver: handoff defense garde `defense_action`; un seul `return_from_child_flow`; `weekly_synthesis` au tour suivant; aucun commit chat.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Le flow actif est toujours servi par `response_owner=tool_skill`.
- Le dispatcher global normal ne reprend jamais pendant le weekly actif.
- Le handoff vers `prepare_defense_card` se fait via `weekly_adaptive_review_v1_handoff_to_prepare_defense_card`.
- Le retour parent est repris par `weekly_adaptive_review_v1`.

**Skills / Operations / Tools**
- `prepare_defense_card` livre un `platform_handoff` avec `no_chat_mutation=true`.
- Le draft contient `prepared_fields.risk_context` et `prepared_fields.defense_action`.
- Aucun executor engageant n'est appele; `committed_effects=[]` sur tous les tours.

**Memory / Effets durables**
- Durable final: `status=completed`, `validation_unlock.status=available`.
- `weekly_gates`: tous `complete` en fin de run.
- `user_corrected_action_statuses`: rangement et sas conserves en `partial`.
- `child_flow.result_details`: `created=false`, `available=false`, `no_chat_mutation=true`, `user_must_create=true`, `return_acknowledged=true`, `committed_effect_count=0`.
- `weekly_adaptive_review` final ne contient pas de `plan_patch` legacy.
- Cleanup: scope QA supprime, `remaining_scope_messages=0`.

**Problemes**
- Aucun probleme systeme observe.

**Fix propose**
- Aucun fix requis. R10 verifie les deux bugs R9.

## Verdict Global

`green` — Le weekly fonctionne de bout en bout, les deux corrections R9 sont verifiees en IA reelle locale, et les effets durables sont alignes avec le contrat no-chat-mutation.
