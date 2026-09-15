## 1. Contexte Du Test

- Date: 2026-05-18
- Run: `2026-05-18-select-state-potion-subskills-r1`
- Persona: `qa-skill`, connexion locale temporaire `state_potion_direct_20260518_subskills_r1`
- Objectif: tester le tool skill `select_state_potion` apres refactor en sous-skills, avec demande implicite, shortlist, collecte detail, confirmation et creation durable.
- Trajectoire: user demande une potion sans nommer le type -> Sophia propose deux potions -> user choisit `courage` -> collecte detail -> confirmation -> activation.
- Surfaces visees: dispatcher, active tool skill routing, operation `select_state_potion`, generation potion, side effects DB, reminders/checkins.
- Cadre IA reel: Supabase local, `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe, messages choisis tour par tour.
- Validite QA: valide avec incident documente au tour 3. Le premier user temporaire n'avait pas de cycle actif; une fixture non destructive a ete ajoutee avant reprise.

Artefacts:

- Raw: `tests/real-personas/qa-skill/runs/operations/2026-05-18-select-state-potion-subskills-r1.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/operations/2026-05-18-select-state-potion-subskills-r1.summary.json`
- Durable: `tests/real-personas/qa-skill/runs/operations/2026-05-18-select-state-potion-subskills-r1.durable.json`

## 2. Tours De Conversation

### Tour 1

**User**
> Sophia, je crois que j’ai besoin d’une potion, mais je ne sais pas laquelle. Je suis tendu, je repousse un appel important depuis ce matin et je sens que je vais encore l’éviter.

**Sophia**
> Je comprends. Entre la tension et cet appel que tu repousses, qu'est-ce qui pèse le plus ? On peut partir sur une potion de courage pour t'aider à y aller, ou une potion d'apaisement pour faire redescendre la pression. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: no risk, side effects allowed
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: aucune session potion, aucun reminder

### Tour 2

**User**
> Oui, plutôt courage. J’ai peur que la personne me juge et je voudrais juste réussir à lancer l’appel sans tourner autour pendant une heure.

**Sophia**
> C'est noté pour la potion de courage. On va se concentrer sur cet appel et cette peur du jugement. Est-ce qu'il y a un autre point qui te fait hésiter, ou on part là-dessus ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_tool_skill_continue`
- safety: no risk, side effects allowed
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: aucune session potion, aucun reminder

### Tour 3

**User**
> On part là-dessus. L’hésitation principale c’est vraiment le regard de l’autre, et la première marche ce serait juste d’appuyer sur appeler puis dire la première phrase.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 500
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: null
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: null
- durable_effect: non verifiable sur ce tour
- error: `Active cycle not found`
- qa_diagnostic: `router_or_app`, retryable false

Incident: le user QA avait ete cree directement car l'admin API local `list users` retournait `Database error finding users`. Il n'avait pas encore de `user_cycles` actif. Ajout ensuite d'une fixture minimale locale: cycle actif, transformation active, plan actif, action active "Lancer l'appel important".

### Tour 4

**User**
> On reprend là-dessus : l’hésitation principale c’est le regard de l’autre, et la première marche ce serait d’appuyer sur appeler puis dire la première phrase.

**Sophia**
> Je t'ai préparé une potion de courage pour t'aider à lancer cet appel malgré l'appréhension. On part là-dessus ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_tool_skill_continue`
- safety: no risk, side effects allowed
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: aucune session potion, aucun reminder

### Tour 5

**User**
> Oui, vas-y, active cette potion de courage.

**Sophia**
> C'est normal de sentir cette appréhension. Le but n'est pas de ne plus avoir peur, mais de faire ce premier pas avec elle. Tu n'as pas besoin d'être parfait, juste d'appuyer sur appeler et de dire cette première phrase. 🙂

**Message additionnel**
> Je vais t'accompagner avec cette potion de courage. Pendant 7 jours, je t'enverrai un petit mot chaque matin pour t'aider à ne pas rester dans l'évitement et à garder ton élan. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: no risk, side effects allowed
- direct_effects: `select_state_potion` success
- operation: none in trace summary
- pending_confirmation: none
- memory_plan: none
- executed_tools: `select_state_potion`
- durable_effect: 1 `user_potion_sessions`, 1 `user_recurring_reminders`, 7 `scheduled_checkins`

DB observe:

- `user_potion_sessions.id`: `7fe292b6-a69e-4d66-befb-90a19fc05629`
- `potion_type`: `courage`
- `status`: `completed`
- `source`: `system`
- `content.instant_support_message`: soutien immediat coherent avec peur du jugement et premiere marche.
- `content.potion_info_message`: annonce 7 jours de suivi.
- `follow_up_strategy.duration_days`: 7
- `follow_up_strategy.local_time_hhmm`: `09:30`
- `user_recurring_reminders.id`: `49aacb56-d485-4f99-8f15-9565a9371f5c`
- `initiative_kind`: `potion_follow_up`
- `source_kind`: `potion_generated`
- `source_potion_session_id`: session potion ci-dessus
- `message_instruction`: "Un petit mot pour t'aider à garder le cap sur ton appel et à agir malgré l'inconfort."
- `scheduled_checkins`: 7 rows pending, du 2026-05-19 au 2026-05-25, toutes a `09:30:00+00:00`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1: Sophia comprend l'etat emotionnel et propose deux potions pertinentes sans forcer un choix.
- Tour 5: les deux messages post-activation sont dans le bon ordre produit: soutien immediat puis info de potion/reminder.
- Le ton reste doux, direct, non culpabilisant.

**Problemes**
- Tour 2: Sophia ne pose pas clairement les deux champs attendus pour `courage`. Elle demande "un autre point" ou "on part la-dessus", ce qui collecte moins proprement que les sous-skills prevus. Impact: le user peut confirmer trop vite sans donner les deux informations utiles. Severite: yellow.
- Tour 4: Sophia demande confirmation avec une phrase tres courte, sans afficher le draft complet ni la description du reminder avant activation. Impact: confirmation moins informee, meme si le message final explique le suivi. Severite: yellow.
- Tour 3: reponse vide a cause d'un contexte QA incomplet. Impact: rupture conversationnelle visible dans ce run. Severite: yellow pour ce run, car corrige par fixture avant reprise.

**Fix propose**
- Renforcer le prompt/runtime du sous-skill `courage` pour obliger une question explicite en deux champs avant draft: peur dominante + premiere marche.
- Faire afficher avant confirmation une phrase de synthese du draft incluant potion choisie, pourquoi, et rappel 7 jours.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tours 1, 2, 4, 5: bon `response_owner=tool_skill` et bon `selected_handler=select_state_potion`.
- Tour 5: execution durable correcte, mais `route_reason=tool_skill_intent_start` alors que le user confirme une operation active. A surveiller: cela peut indiquer une trace imprecise ou une reprise de flow au lieu d'une continuation nette.

**Skills / Operations / Tools**
- La shortlist est correcte au tour 1: `courage` et `apaisement` correspondent a l'appel evite + tension.
- L'activation ne se produit pas avant confirmation explicite.
- Le tool execute bien `select_state_potion` une seule fois au tour 5.
- Les tests unitaires du skill couvrent les 6 potions et passent: 7/7.

**Memory / Effets durables**
- Auth local verifie via refresh token puis `/auth/v1/user`; user marque `is_test_persona=true`.
- DB apres activation:
  - 1 session potion `courage`
  - 1 recurring reminder actif
  - 7 scheduled checkins pending sur une semaine
- Warning: la session et le reminder sont en `scope_kind=out_of_plan` et `transformation_id=null`, alors qu'une transformation active avait ete ajoutee avant reprise. Cause probable: l'etat du flow avait commence avant l'ajout de la fixture et a conserve un scope out-of-plan. A re-tester avec un user qui a un cycle actif avant le tour 1.
- Warning mineur: `scheduled_checkins.origin` ressort `unknown`; ce n'est pas bloquant pour la potion si le lien `recurring_reminder_id` est correct, mais l'origine pourrait etre plus explicite.

**Problemes**
- Tour 3: `Active cycle not found` quand une potion arrive sur user sans cycle actif. Impact systeme: le tool devrait probablement degrader proprement en out-of-plan ou demander contexte, pas 500. Severite: yellow/red selon surface produit; yellow dans ce run car setup QA corrige.
- Tour 2/4: le chemin reel ne reflete pas totalement la contrainte "deux champs detail puis draft explicite" malgre les tests unitaires verts. Impact systeme: ecart entre contrat de sous-skill et comportement LLM reel. Severite: yellow.

**Fix propose**
- Ajouter un guard dans `loadPotionBaseContext` / `loadLabScopeContext` pour ne jamais faire tomber le run si aucun cycle actif n'existe.
- Ajouter une assertion e2e ou route replay sur conversation reelle: demande implicite -> choix courage -> question contenant les deux champs attendus -> draft avec reminder -> confirmation -> 7 checkins.

## Verdict Global

- Verdict: yellow
- Raison principale: les effets durables sont corrects, mais le run reel montre une collecte detail trop vague et un incident `Active cycle not found` avec user sans cycle actif.
- Follow-up prioritaire: durcir le flow conversationnel du sous-skill pour rendre obligatoire la question a deux champs et ajouter un fallback propre quand aucun cycle actif n'existe.

## Validations Techniques

- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/operations/select_state_potion/intake.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/potion_router.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/potion_detail_intake.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/draft_validation.ts supabase/functions/sophia-brain/router/run.ts`: OK
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/select_state_potion/tests.ts`: 7 passed, 0 failed
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/operations_s5_latency_test.ts supabase/functions/sophia-brain/tools/operations/operations_s6_cross_test.ts`: 13 passed, 0 failed

## Nettoyage

Non effectue automatiquement. `AGENTS.md` interdit les commandes destructives DB/Auth sans demande explicite de la commande exacte dans la conversation courante. La connexion locale temporaire et ses fixtures restent donc disponibles pour inspection.
