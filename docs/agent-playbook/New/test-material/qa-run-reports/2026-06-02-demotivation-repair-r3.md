# QA Run — Demotivation Repair R3

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `20260602-r3`
- Persona: `qa-skill`, connexion temporaire locale `demotivation_repair_20260602-r1`
- Objectif: reverifier le routage reel apres correction orientation clarification, sans modifier le code pendant le run.
- Trajectoire: perte de sens/fatigue -> choix explicite motivation/no-tool/no-potion/no-plan-edit -> micro-geste deja donne -> demande de recovery.
- Surfaces visees: dispatcher, orientation clarification, `demotivation_repair`, final response pipeline, no-mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe. Le runner existant etait inutilisable car `supabase status` echouait; les tours ont ete envoyes par `curl` direct vers le meme endpoint reel.
- Validite QA: valide avec incident technique documente. Le tour 1 a timeout cote client a 20s mais a complete en DB apres 46s; la suite a ete pilotee depuis la reponse DB.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — Mauvais owner selectionne

**User**
> Ce soir je sens que je decroche. Le plan autour des placards me parait inutile, comme si j'allais juste refaire trois efforts puis abandonner encore. Je n'ai pas envie de changer le plan maintenant, j'ai surtout besoin de retrouver un peu de prise.

**Sophia**
> Je comprends ce sentiment que l'effort ne mènera nulle part ; c'est ce qui pèse le plus ce soir. Quand j'ai l'impression de tourner en rond, m'acharner sur le plan est souvent épuisant. Pour retrouver un peu de prise sans toucher aux placards, y a-t-il un micro-geste de deux minutes, même déconnecté de tout ça, qui te ferait du bien ? 🙂

**Trace courte**
- http_status: client timeout initial, puis assistant persiste en DB
- response_owner: `companion`
- selected_handler: `null`
- route_reason: `null`
- target_final: `companion`
- tool_execution: `none`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: plus de mauvaise clarification plan/tool, mais `demotivation_repair` n'est pas owner au premier tour.
- Source amont probable: dispatcher/route bridge ne promeut pas le signal demotivation au premier tour.
- Owner runtime: dispatcher + conversation skill admission.
- Meilleure correction selon les guidelines: faire apparaitre `demotivation_repair` comme owner quand perte de sens/fatigue domine sans demande tool.
- Pourquoi ce n'est pas un patch local: le contenu visible est acceptable; le probleme restant est l'ownership runtime et la continuite du skill.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-AGENDA-02` — Interruption explicite mal restauree

**User**
> Oui, reste sur motivation. Pas de potion, pas d'outil et ne change pas le plan. Le micro-geste possible, c'est juste poser mon téléphone deux minutes et aller remplir un verre d'eau. Aide-moi à lancer ça sans me faire un grand plan.

**Sophia**
> Je comprends ce sentiment que l'effort ne mènera nulle part ; c'est ce qui pèse le plus ce soir. Quand j'ai l'impression de tourner en rond, m'acharner sur le plan est souvent épuisant. Pour retrouver un peu de prise sans toucher aux placards, y a-t-il un micro-geste de deux minutes, même déconnecté de tout ça, qui te ferait du bien ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- target_final: `companion`
- tool_execution: `none`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le routage est maintenant bon (`demotivation_repair`), mais la reponse visible repete exactement le tour 1 et ignore le micro-geste fourni.
- Source amont probable: final response pipeline / active skill response reuse / context handoff entre route decision et generation.
- Owner runtime: `demotivation_repair` runtime + final response pipeline.
- Meilleure correction selon les guidelines: quand le skill conversationnel est resolu, la generation doit consommer le message courant et l'etat de clarification, pas rejouer la derniere reponse companion.
- Pourquoi ce n'est pas un patch local: ce n'est pas une phrase a changer; c'est une rupture de contrat entre owner selectionne et reponse generee.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-AGENDA-02` — Interruption explicite mal restauree

**User**
> Tu viens de me redemander le micro-geste alors que je l'ai donné. Je veux juste démarrer maintenant : téléphone posé, verre d'eau, puis je reviens. Donne-moi une phrase courte pour lancer, pas une autre question.

**Sophia**
> Je comprends ce sentiment que l'effort ne mènera nulle part ; c'est ce qui pèse le plus ce soir. Quand j'ai l'impression de tourner en rond, m'acharner sur le plan est souvent épuisant. Pour retrouver un peu de prise sans toucher aux placards, y a-t-il un micro-geste de deux minutes, même déconnecté de tout ça, qui te ferait du bien ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- target_final: `companion`
- tool_execution: `none`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le skill actif continue mais la reponse reste figee sur la question initiale, malgre correction explicite du user.
- Source amont probable: active conversation skill continuation n'alimente pas correctement le renderer/generator, ou le final response pipeline persiste une reponse precedente.
- Owner runtime: active skill continuation + final response pipeline.
- Meilleure correction selon les guidelines: garantir que `active_conversation_skill_continue` regenere depuis le tour courant et invalide toute reponse assistant precedente quand le user corrige une repetition.
- Pourquoi ce n'est pas un patch local: ajouter une regex "tu viens de" masquerait la famille; l'invariant a proteger est "le message courant prime sur l'ancien output".

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le run ne part plus vers potion ou carte.
- Aucune mutation durable n'est appliquee.
- Le premier message est humainement acceptable.

**Problemes**
- Tour 2: Sophia ignore le micro-geste donne et repete sa question. Famille: `BF-AGENDA-02`. Impact: l'utilisateur fait l'effort de clarifier, mais le systeme ne l'entend pas.
- Tour 3: Sophia repete encore apres correction explicite. Famille: `BF-AGENDA-02`. Impact: experience inutilisable; la conversation semble bloquee.

**Fix propose**
- Source amont: active skill continuation + final response pipeline.
- Correction recommandee: brancher la reponse visible sur l'owner `demotivation_repair` resolu et sur le message courant; interdire la reutilisation de l'ancien assistant text quand un nouveau tour user existe.
- Tests d'invariant attendus: micro-geste fourni -> phrase de lancement; correction "tu me redemandes" -> acknowledgement + reponse courte; anti-faux-positif "je ne sais pas quel geste" -> question de clarification autorisee.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Amelioration nette vs R2: tours 2 et 3 selectionnent `demotivation_repair`.
- Regression restante: tour 1 reste `companion` au lieu de `demotivation_repair`.
- Le mauvais routing outil observe en R2 (`select_state_potion`, `prepare_attack_card`) n'apparait pas.

**Skills / Operations / Tools**
- `selected_handler=demotivation_repair` aux tours 2 et 3.
- `tool_execution=none`, `executed_tools=[]`.
- Aucun handoff tool n'est lance.

**Memory / Effets durables**
- `chat_messages`: 6 lignes dans le scope.
- `turn_summary_logs`: 3 lignes.
- `memory_items_recent`: 0 pour ce user dans la projection du run.
- `scheduled_checkins_recent`: 0.
- Aucun effet durable observe.

**Problemes**
- Tours 2-3: owner systeme correct mais reponse visible incorrecte. Famille principale: `BF-AGENDA-02`; famille secondaire possible: `BF-TEST-01` si la trace `conversation_handler` et le pipeline `target_final=companion` representent deux owners divergents.

**Fix propose**
- Source amont: active conversation skill runtime / final response pipeline.
- Correction recommandee: clarifier le contrat entre `routeDecision.response_owner=conversation_handler`, `selected_handler=demotivation_repair` et `target_final=companion`; la reponse finale doit etre produite par le skill ou par un adapter qui consomme son state, pas par une reprise de la derniere reponse companion.
- Tests d'invariant attendus: positif `demotivation_repair` apres clarification; paraphrase no-tool/no-potion; anti-faux-positif demande explicite potion; integration recovery apres repetition.

## Verdict Global

Red. La correction de routing a ameliore la famille R2-B02/R2-B04: plus de potion/carte, et `demotivation_repair` est selectionne apres clarification. Le run revele maintenant une famille aval: la reponse visible reste figee/rejouee et n'utilise pas le message courant.
