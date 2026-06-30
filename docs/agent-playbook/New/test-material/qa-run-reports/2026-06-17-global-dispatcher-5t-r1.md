# QA Run Report - global-dispatcher-5t-20260617-r1

## 1. Contexte Du Test

- Date: 2026-06-17.
- Run: `global-dispatcher-5t-20260617-r1`.
- Persona: utilisateur QA temporaire local `qa-normal-global-dispatcher-5t-20260617-r1-1781718241939@example.com`, supprime en fin de run.
- Objectif: tester le dispatcher global en IA reelle locale sur un parcours court de 5 tours minimum.
- Trajectoire: demande conversationnelle sans outil -> correction utilisateur -> sortie vers product help -> creation de rappel ponctuel -> verification des effets durables.
- Surfaces visees: dispatcher global, `coaching_recommendation`, active flow policy, `product_help`, direct effect `create_one_shot_reminder`, projection/status des effets, cleanup QA.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, execution hors sandbox, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide techniquement. Les 5 tours ont retourne HTTP 200, les messages ont ete choisis tour par tour apres lecture des reponses et traces courtes. JWT non affiche.
- Artefact brut: `tmp/qa-normal-conversation/global-dispatcher-5t-20260617-r1/state.json`.
- Note temps: le runner fixe `client_now_iso=2026-05-22T10:00:00.000+02:00`; le rappel T4 est donc programme a `2026-05-22T08:25:00Z`.
- Nettoyage: cleanup cible execute. `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` et `auth.users` OK; `user_memories` retourne 404 dans ce schema local.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 - mauvais owner selectionne

**User**
> J'arrive un peu disperse. J'ai une tache administrative a ouvrir, mais la je veux juste poser ce qui bloque, pas lancer d'outil tout de suite.

**Sophia**
> Je te conseille de commencer par state_potion : c'est le plus utile quand tu te sens disperse et que tu veux juste deposer ce qui bloque avant d'agir. Ensuite, si tu en as besoin, ajuste le plan avec adjust_plan pour rendre la tache administrative plus simple dans l'espace Sophia.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: non expose dans trace courte
- executed_tools: `[]`
- durable_effect: aucun
- state: `__active_skill_state.skill_id=coaching_recommendation`

**Analyse si yellow/red**
- Symptome: le user demande explicitement de poser le blocage sans lancer d'outil, mais le dispatcher ouvre `coaching_recommendation` et la reponse expose des noms internes (`state_potion`, `adjust_plan`).
- Source amont probable: signal global `coaching_recommendation` trop large pour une demande de soutien conversationnel sans demande de recommandation de capacite.
- Owner runtime: dispatcher global / signal `coaching_recommendation`, puis renderer visible du skill.
- Meilleure correction selon les guidelines: resserrer l'intake structure `coaching_recommendation` pour ne l'activer que quand le user demande quoi utiliser ou quelle capacite Sophia choisir; une demande "je veux juste poser ce qui bloque" doit rester `normal_reply`.
- Pourquoi ce n'est pas un patch local: le probleme est une erreur d'ownership et de contrat de sortie structuree; une correction par phrase ou regex masquerait la frontiere normal reply vs recommandation.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 - ancien flow capture une nouvelle intention

**User**
> Non, ne me parle pas en noms de modules. Dis-le-moi comme a un humain : qu'est-ce que tu comprends de mon blocage ?

**Sophia**
> Je te recommande surtout **state_potion** : c'est le plus adapte si tu veux d'abord deposer la dispersion, clarifier ce qui te bloque, puis repartir plus pose avant d'ouvrir ta tache.
>
> En second choix, **coach_preferences** si tu veux que je t'accompagne dans un style plus calme, plus direct ou plus guide quand tu passes a l'action.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: non expose dans trace courte
- executed_tools: `[]`
- durable_effect: aucun
- state: `__active_skill_state.skill_id=coaching_recommendation`, `turn_count=2`

**Analyse si yellow/red**
- Symptome: la correction explicite du user ("ne me parle pas en noms de modules", "comme a un humain") est avalee par l'active flow, qui repete les IDs internes et ajoute `coach_preferences`.
- Source amont probable: local dispatcher / active flow policy de `coaching_recommendation` ne sait pas traiter une objection de forme comme demande de reformulation humaine ou sortie vers normal reply.
- Owner runtime: `coaching_recommendation.local_dispatcher` / active flow reducer.
- Meilleure correction selon les guidelines: ajouter une sortie structuree ou une branche de reformulation humaine dans le contrat local; si le user refuse les noms de modules, le flow doit rendre une synthese sans IDs internes ou produire `exit_to_global_dispatcher`.
- Pourquoi ce n'est pas un patch local: le bug concerne la priorite du message courant sur l'ancien flow et la representation structuree de l'objection, pas un wording exact.

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Stoppe cette recommandation. Question produit simple : ou est-ce que je retrouve mes rappels dans l'application ?

**Sophia**
> Tu les retrouves dans l'onglet Initiatives, depuis le Dashboard. Si ton initiative vit hors plan, c'est aussi dans Base de vie > Initiatives.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `product_help` read-only
- pending_confirmation: `null`
- memory_plan: non expose dans trace courte
- executed_tools: `[]`
- durable_effect: aucun
- state: `temp_memory={}`

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok, cree-moi un rappel dans 25 minutes : ouvrir le dossier administratif sans chercher a le finir.

**Sophia**
> C'est programme pour vendredi 22 mai a 10:25: je te ferai un rappel pour ouvrir le dossier administratif sans chercher a le finir.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `direct_effects_then_normal_reply`
- safety: `none`
- direct_effects: `["create_one_shot_reminder"]`
- operation: direct effect `create_one_shot_reminder`
- pending_confirmation: `null`
- memory_plan: non expose dans trace courte
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: `scheduled_checkins.id=f945a40e-18cd-4894-ba7c-df1505ca44d6`, `status=pending`, `scheduled_for=2026-05-22T08:25:00+00:00`

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-03 - product/status/tool mal priorises

**User**
> Juste pour verifier, qu'est-ce qui a vraiment ete cree ou modifie depuis le debut de cet echange ?

**Sophia**
> Depuis le debut de cet echange, il y a un seul effet durable visible : un rappel ponctuel a ete cree.
>
> - vendredi 22 mai a 10:25 : ouvrir le dossier administratif sans chercher a le finir
>
> Je ne vois rien d'autre de cree ou modifie dans ce chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: non expose dans trace courte
- executed_tools: `[]`
- durable_effect: le rappel T4 reste present en DB avant cleanup
- state: `companion_question_rhythm` seulement

**Analyse si yellow/red**
- Symptome: la reponse visible est correcte, mais une question de verification des effets durables est traitee comme `normal_reply` au lieu d'un owner status/effect-ledger explicite.
- Source amont probable: arbitration status/tool apres direct effect; la demande "vraiment cree ou modifie" devrait produire un chemin auditable de type `status_recap` ou une trace EffectLedger explicite.
- Owner runtime: dispatcher global / status arbitration.
- Meilleure correction selon les guidelines: representer les questions de verification durable comme status/read-only quand elles portent sur les effets executes, tout en gardant l'EffectLedger comme source de preuve.
- Pourquoi ce n'est pas un patch local: le contenu visible etait bon; le warning est systeme, sur l'owner et l'auditabilite de la reponse.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- T3 recupere correctement apres un stop explicite et repond a la question produit sans outil.
- T4 cree le rappel demande avec un message clair et un effet DB coherent.
- T5 donne un recap visible exact du seul effet durable.

**Problemes**
- Tour 1: Sophia ne respecte pas la posture "juste poser ce qui bloque" et donne une recommandation de modules. Famille: BF-ROUTE-01. Impact: experience non humaine, jargon interne expose. Severite: red.
- Tour 2: la correction explicite du user est ignoree et l'ancien flow repete le meme probleme. Famille: BF-ROUTE-02. Impact: le user doit se battre contre le systeme pour obtenir une reformulation humaine. Severite: red.
- Tour 5: visible correct, mais absence d'owner status explicite pour une question d'audit des effets. Famille: BF-ROUTE-03. Impact utilisateur faible ici, mais trace moins exploitable. Severite: yellow.

**Fix propose**
- Source amont: dispatcher global `coaching_recommendation` et local dispatcher du meme skill; arbitration status apres effet durable.
- Correction recommandee: resserrer l'activation `coaching_recommendation` aux demandes explicites de choix de capacite, interdire l'exposition d'IDs internes dans le visible, et donner au flow local une sortie/reformulation humaine quand le user refuse les noms de modules.
- Tests d'invariant attendus: demande "je veux juste poser ce qui bloque" reste normal reply; objection "pas de noms de modules" ne repete jamais les IDs internes; product question interrompt bien; rappel explicite committe; recap durable passe par owner status ou trace EffectLedger auditable.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: mauvais owner initial, `coaching_recommendation_signal`, alors que la demande ne sollicite pas une recommandation de fonctionnalite.
- T2: active flow `coaching_recommendation` capture une objection/correction qui aurait du reformuler ou sortir.
- T3: bonne interruption vers `product_help`; le temp memory du flow est vide apres ce tour.
- T4: bonne execution directe `create_one_shot_reminder`, avec commit DB.
- T5: reponse durable correcte mais owner `normal_reply`; warning d'audit status/effect-ledger.

**Skills / Operations / Tools**
- `coaching_recommendation` est le point rouge: activation trop large et visible non conforme.
- `product_help` fonctionne correctement sur une demande produit explicite.
- `create_one_shot_reminder` fonctionne correctement comme direct effect explicite avec delai exploitable.
- Aucun executor direct interdit ni fallback deterministe observe.

**Memory / Effets durables**
- T1/T2 ouvrent puis maintiennent `__active_skill_state=coaching_recommendation`.
- T3 nettoie l'active flow.
- T4 cree un `scheduled_checkins` pending pour le user QA temporaire.
- T5 restitue correctement le rappel cree.
- Cleanup cible execute apres le run: donnees du user QA temporaire et auth user supprimes, hors `user_memories` 404 local.

**Problemes**
- T1: mauvais owner selectionne. Famille: BF-ROUTE-01. Impact systeme: signal global trop permissif cree un active flow non demande.
- T2: ancien flow capture une correction utilisateur. Famille: BF-ROUTE-02. Impact systeme: message courant non prioritaire, sortie/reformulation locale absente.
- T5: status/effect audit non priorise. Famille: BF-ROUTE-03. Impact systeme: trace moins auditable malgre visible correct.

**Fix propose**
- Source amont: `dispatcher.prompts.ts` / sortie structuree `skill_signals.coaching_recommendation`; `skills/coaching_recommendation` local dispatcher/reducer; arbitration status/effect recap.
- Correction recommandee: corriger la definition du signal `coaching_recommendation` et son contrat local, pas le wording final; ajouter des invariants de non-exposition des IDs internes; router les questions d'effet durable vers une source auditable.
- Tests d'invariant attendus: tests dispatcher pour blocage personnel sans demande de module; test local active-flow "ne me parle pas en noms de modules"; mini-run reel avec normal -> product_help -> reminder -> recap durable.

## Verdict Global

**Verdict: red.**

Le chemin QA est valide et le systeme recupere sur `product_help` puis execute correctement un rappel. Le run echoue neanmoins sur le but "dispatcher global" car T1 ouvre `coaching_recommendation` a tort et T2 laisse l'ancien flow repeter des IDs internes malgre une correction explicite du user.
