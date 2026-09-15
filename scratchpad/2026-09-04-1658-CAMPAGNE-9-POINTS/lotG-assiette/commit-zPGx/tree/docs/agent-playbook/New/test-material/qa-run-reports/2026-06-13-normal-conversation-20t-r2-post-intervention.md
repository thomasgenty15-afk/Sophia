# QA Run Report — normal-conversation-20t-20260613-r2-post-intervention

## 1. Contexte Du Test

- Date: 2026-06-13.
- Run: `normal-conversation-20t-20260613-r2-post-intervention`.
- Persona: utilisateur QA temporaire local `qa-normal-normal-conversation-20t-20260613-r2-post-intervention-1781346693389@example.com`, supprimé en fin de run.
- Objectif: relancer une conversation normale de 20 tours après l'implémentation `normal_reply_fit_score` / `intervention_policy`, avec attention particulière aux opportunités implicites, repairs légers et demandes explicites.
- Trajectoire: discussion simple autour fatigue/grignotage, refus de cartes, résistance légère, sortie de flow, question produit, demande explicite de carte, rappel explicite, retour conversation normale.
- Surfaces visees: global dispatcher, `normal_reply`, `flow_opportunity_verification`, `demotivation_repair`, `product_help`, direct effect `create_one_shot_reminder`, routing/intervention policy.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. Les 20 tours ont retourné HTTP 200. Nettoyage ciblé effectué: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users` OK; `user_memories` 404 comme lors du run précédent, table absente/non exposée.
- Note temps: le runner fixe `client_now_iso` à `2026-05-22T10:00:00.000+02:00`; le rappel T17 est donc programmé à `2026-05-22T08:40:00+00:00`. Ce décalage avec la date réelle du run, 2026-06-13, vient du runner et n'est pas compté comme bug Sophia dans ce run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'ai envie qu'on parle normalement deux minutes. Ce matin je me sens un peu lourd, rien de dramatique, juste pas très lancé.

**Sophia**
> Je te suis. Là, on ne force rien : juste 2 minutes pour te remettre en route doucement.  
> Pose ton attention sur une seule chose : en ce moment, c’est plutôt “corps lourd” ou “tête lourde” ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `none`
- normal_reply_fit_score: `1`
- flow_opportunity: null
- direct_effects / executed_tools: none

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 — Mauvais owner selectionne

**User**
> Plutôt corps lourd. J'ai pris un café mais j'ai surtout envie de grignoter par réflexe, pas parce que j'ai faim.

**Sophia**
> C'est un réflexe typique quand on se sent un peu lourd. On pourrait préparer une carte de défense pour t'aider à gérer ces envies de grignoter sans faim, ça te tente ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `1`
- flow_opportunity: `prepare_defense_card.reflex_snacking`, confidence `medium`, score `0.55`
- blocked_paths: none
- executed_tools: none

**Analyse si yellow/red**
- Symptome: proposition de carte alors que le user répondait à une discussion normale.
- Source amont probable: admission runtime de `flow_opportunity_verification` après un route decision `normal_reply_default`.
- Owner runtime: global routing / flow opportunity admission.
- Meilleure correction selon les guidelines: appliquer l'intervention policy aux `flow_opportunity` avant lancement du runtime de vérification, pas seulement aux `tool_skill_intents`.
- Pourquoi ce n'est pas un patch local: le dispatcher avait déjà produit `normal_reply_fit_score=1` et une opportunité seulement `0.55`; le problème est l'arbitrage structurel entre normal reply et opportunité implicite.

### Tour 3

**Verdict du tour:** green

**User**
> Pas de carte pour l'instant, vraiment. Je veux juste comprendre ce qui se passe dans le corps sans transformer ça en truc à configurer.

**Sophia**
> Je te suis. On met zéro “carte” et zéro configuration. Tu veux juste comprendre le mécanisme corporel derrière cette envie de grignoter. [...] l’envie vient souvent d’un besoin de régulation [...] Tu remarques quoi en premier dans ton corps quand l’envie de grignoter arrive ?

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.95`
- flow_opportunity: null
- blocked_paths: `flow_opportunity_verification.local_visible_reply` blocked by `local_exit_to_global_dispatcher_blocks_local_reply`
- executed_tools: none

### Tour 4

**Verdict du tour:** green

**User**
> C'est plutôt une agitation dans les mains et un creux bizarre, mais pas vraiment dans l'estomac. Comme si je cherchais un bouton pause.

**Sophia**
> Oui, je vois très bien le tableau : ce n’est pas “faim”, c’est plutôt ton corps qui veut passer en mode pause/ralentir [...] Test ultra-court (30 secondes) [...] tu veux juste essayer tout de suite ?

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `1`
- flow_opportunity: null
- executed_tools: none

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 — Mauvais owner selectionne

**User**
> J'ai essayé, ça baisse un peu. Mais dès que je pense au dossier à ouvrir, j'ai une espèce de 'pfff' intérieur. Pas une crise, juste une mini résistance.

**Sophia**
> Je vois bien ce "pfff" intérieur. On pourrait préparer une Carte d'Attaque pour lever cette petite résistance avant que tu n'ouvres ton dossier ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.9`
- flow_opportunity: `prepare_attack_card.resistance_to_dossier`, confidence `medium`, score `0.65`
- blocked_paths: none
- executed_tools: none

**Analyse si yellow/red**
- Symptome: une mini résistance explicitement non dramatique devient proposition de carte d'attaque.
- Source amont probable: `flow_opportunity_verification` ignore la dominance `normal_reply_fit_score`.
- Owner runtime: flow opportunity admission.
- Correction recommandee: gate unique `normal_reply_fit_score` vs `flow_opportunity.score`, avec pénalité de conversation simple/récence et blocage si opportunité implicite < seuil.
- Tests d'invariant attendus: grignotage/résistance légère restent normal reply; demande explicite "prépare une carte" passe.

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 — Mauvais owner selectionne

**User**
> Non, pas de carte d'attaque non plus. Là je veux juste qu'on le dise simplement : pourquoi ce 'pfff' arrive avant même de commencer ?

**Sophia**
> Ce « pfff », c'est souvent de la résistance anticipatoire. Ton cerveau projette l'effort ou l'ennui à venir [...] Est-ce que c'est l'ampleur de ce dossier qui te donne cette impression de montagne ?

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- normal_reply_fit_score: `0.15`
- skill_signals.entry: `demotivation_repair`, confidence `high`, no numeric score observed
- executed_tools: none

**Analyse si yellow/red**
- Symptome visible faible: la réponse est utile.
- Probleme systeme: le dispatcher baisse `normal_reply_fit_score` à `0.15` malgré "je veux juste qu'on le dise simplement" et absence de besoin de flow.
- Source amont probable: calibration dispatcher repair vs normal explanation.
- Correction recommandee: normal explanation of resistance should keep high/medium normal fit unless distress/repair ownership is strong; provide numeric `score` for repair signal.

### Tour 7

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention

**User**
> Oui, c'est l'ampleur et le flou. Mais j'ai pas besoin qu'on découpe maintenant, juste que tu restes avec moi dans le côté 'ça a l'air trop dense'.

**Sophia**
> C'est vrai que ce dossier a l'air immense et assez flou. [...] Je reste là avec toi, on ne touche à aucun outil et on ne découpe rien pour l'instant.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- blocked_paths: `global_dispatcher`, `global_router` blocked by `active_local_conversation_skill_owns_turn`
- executed_tools: none

**Analyse**
- Visible correct, mais le skill actif possède déjà le tour.
- Risque: la conversation normale est maintenue par le skill local au lieu d'un owner normal.

### Tour 8

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention

**User**
> Oui ça aide. Et là je change un peu de sujet : j'ai remarqué que le samedi matin je suis plus lent, même sans raison spéciale. Ça te paraît normal ?

**Sophia**
> C'est tout à fait normal. Après une semaine d'activité, ton corps et ton esprit ont besoin de ce ralentissement pour décompresser.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- blocked_paths: global dispatcher/router blocked by active local skill

**Analyse**
- Le user annonce un changement de sujet, mais le skill actif ne rend pas la main.

### Tour 9

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention

**User**
> Oui, et ma sœur passe peut-être cet après-midi. J'hésite entre ranger un peu ou juste assumer que l'appart est vivant.

**Sophia**
> Assumer le désordre est une option tout à fait valable pour protéger ton énergie aujourd'hui. Ta sœur préférera sans doute te trouver serein [...]

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`

**Analyse**
- Réponse acceptable, mais l'ancien owner continue à colorer la réponse sous l'angle "protéger ton énergie".

### Tour 10

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention

**User**
> Question concrète à part : dans Sophia, une carte de défense se retrouve où après création ? Je demande juste l'emplacement, pas d'en créer une.

**Sophia**
> Une fois qu'une carte de défense est créée, elle se trouve dans ton profil, au sein de ton espace personnel.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- expected owner: `product_help`
- blocked_paths: global dispatcher/router blocked by active local skill

**Analyse si yellow/red**
- Symptome: question produit explicite capturée par demotivation_repair; réponse vague/non fiable.
- Source amont probable: active local conversation skill ownership trop fort.
- Correction recommandee: l'arbitrage d'active flow doit laisser passer product_help/status/tool explicites ou faire un inline handoff fiable.

### Tour 11

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention

**User**
> Ok, là par contre je veux vraiment en créer une : prépare une carte de défense pour le moment où je rentre fatigué et je pars grignoter sans faim.

**Sophia**
> Dès que tu rentres, pose tes affaires et accorde-toi deux minutes assis [...] avant d'approcher de la cuisine.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- expected owner: `tool_skill.prepare_defense_card`
- tool_skill_intents: none
- executed_tools: none

**Analyse si yellow/red**
- Symptome: demande explicite de création de carte transformée en conseil.
- Source amont probable: global dispatcher/router bypassé par active local conversation skill.
- Correction recommandee: interruption policy: une commande tool explicite doit supersede/suspend active conversation skill, sauf safety.

### Tour 12

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention

**User**
> Je veux vraiment le flow carte, pas juste un conseil. Lance la préparation de la carte de défense avec ce contexte.

**Sophia**
> C'est entendu, on va s'appuyer sur la carte de défense [...] qu'est-ce qui te semble le plus difficile à surmonter ou le plus fatigant en ce moment ?

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- expected owner: `tool_skill.prepare_defense_card`

**Analyse**
- Le système reconnaît lexicalement l'idée de carte dans la réponse visible, mais ne lance pas le bon owner. C'est plus grave qu'une mauvaise phrase: c'est une perte de chaîne de responsabilité.

### Tour 13

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention

**User**
> Stop ce mode réparation/démotivation. Reviens au dispatcher normal : je veux soit parler normalement, soit lancer explicitement la carte quand je le demande.

**Sophia**
> C’est OK je coupe le mode réparation/démotivation. On revient en mode normal : on parle simplement, et je n’enclenche une carte que si tu me le demandes explicitement.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.95`
- flow_opportunity: `prepare_defense_card.explicit_retry`, confidence `high`, score `0.85`
- blocked_paths: `demotivation_repair.local_visible_reply`

**Analyse**
- Sortie enfin correcte, mais elle exige un message méta que l'utilisateur normal ne devrait pas avoir à formuler.
- Warning: `flow_opportunity` encore présent malgré la demande de revenir à normal/explicite seulement.

### Tour 14

**Verdict du tour:** green

**User**
> Merci. Donc simplement : je crois que je veux une matinée lente sans culpabiliser. Ça sonne presque banal, mais ça me ferait du bien.

**Sophia**
> Oui, ça sonne banal… parce que c’est juste essentiel [...] Tu as le droit d’avoir une matinée lente sans que ça devienne “une faute” à réparer.

**Trace courte**
- response_owner: `normal_reply`
- normal_reply_fit_score: `0.98`
- flow_opportunity: null
- executed_tools: none

### Tour 15

**Verdict du tour:** green

**User**
> Un truc tranquille chez moi. Pas besoin d'en faire une intention officielle, juste petit-déjeuner lentement et laisser la maison se réveiller.

**Sophia**
> Oui, ça suffit largement comme intention tranquille [...] Et si un truc intérieur te dit “il faut que je fasse plus”, tu réponds juste : “là, je me réveille aussi”.

**Trace courte**
- response_owner: `normal_reply`
- normal_reply_fit_score: `0.95`
- flow_opportunity: null
- executed_tools: none

### Tour 16

**Verdict du tour:** green

**User**
> Je me sens un peu bête de parler de ça comme si c'était important. Une matinée lente, des miettes, un dossier... c'est pas si grave.

**Sophia**
> Je te comprends. Quand on a l’habitude de minimiser, on a vite l’impression que “ce n’est pas important”. [...] “C’est petit, donc je n’en fais pas un drame. Mais c’est utile, donc je le respecte.”

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.95`
- skill_signals.entry: none
- executed_tools: none

**Observation sur l'implémentation**
- C'est le meilleur exemple positif du changement: émotion légère, réponse intelligente, pas de capture par `emotional_repair`.

### Tour 17

**Verdict du tour:** green

**User**
> D'accord. Et là demande explicite : rappelle-moi dans 40 minutes de revenir au dossier, juste avec le texte 'ouvrir le dossier 10 minutes'.

**Sophia**
> C'est entendu, je te rappellerai d'ouvrir le dossier 10 minutes à 10h40.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- normal_reply_fit_score: `0.1`
- direct_effects_to_run: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- durable_effect: `scheduled_checkins.status=pending`, `event_context=one_shot_reminder:ouvrir_le_dossier_10_minutes`

**Observation**
- Demande explicite correctement priorisée malgré le contexte conversationnel. Le score normal descend à `0.1`, conforme au contrat.

### Tour 18

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 — Mauvais owner selectionne

**User**
> Merci. Maintenant on revient juste à la conversation : c'est agréable que ce soit posé, je me sens déjà moins pressé.

**Sophia**
> C'est super si ce rythme te convient mieux. Est-ce que tu veux que j'ajuste tes préférences pour qu'on garde toujours ce style posé et moins pressé ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.98`
- flow_opportunity: `update_coach_preferences`, confidence `medium`, score `0.65`
- executed_tools: none

**Analyse si yellow/red**
- Symptome: satisfaction locale transformée en opportunité de préférence durable.
- Source amont probable: flow opportunity admission ignore `normal_reply_fit_score`; dispatcher crée aussi une opportunité trop proactive.
- Correction recommandee: signal "feedback conversationnel local" doit rester normal unless explicit durable preference intent; admission policy doit bloquer opportunity score `0.65` face à normal score `0.98`.

### Tour 19

**Verdict du tour:** green

**User**
> Non, ne change pas mes préférences. Je disais juste que là, dans cette conversation, je respire un peu.

**Sophia**
> Parfait, je garde tout pareil. Dans cette conversation, tu respires : on avance doucement, sans reprogrammer tes préférences.

**Trace courte**
- response_owner: `normal_reply`
- normal_reply_fit_score: `1`
- flow_opportunity: null
- blocked_paths: `flow_opportunity_verification.local_visible_reply`
- executed_tools: none

### Tour 20

**Verdict du tour:** green

**User**
> Oui. On peut finir là-dessus : matinée lente, pas une mission, juste un rythme plus humain.

**Sophia**
> Oui, parfait. Matinée lente, pas une mission — juste un rythme plus humain. Tu gardes ton cap simple : petit-déj lentement, maison au tempo, et zéro culpabilité.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `1`
- flow_opportunity: null
- executed_tools: none

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Quand `normal_reply` garde le tour, la conversation est souvent bonne: T1, T3, T4, T14-T16, T19-T20.
- Le ton est globalement chaleureux et compréhensible.
- Le rappel explicite T17 est traité clairement.
- Les refus explicites de préférence/carte sont respectés dans les tours de réparation T3/T19.

**Problemes**
- Tour 2: Sophia propose une carte de défense alors que le user veut parler normalement. Famille: BF-ROUTE-01. Impact: intrusion produit très tôt dans une conversation simple. Sévérité: red.
- Tour 5: même problème avec Carte d'Attaque pour une "mini résistance". Famille: BF-ROUTE-01. Impact: Sophia force l'outillage au lieu de rester avec le vécu. Sévérité: red.
- Tours 7-12: `demotivation_repair` garde la main trop longtemps. Famille: BF-ROUTE-02. Impact: le user doit parler en méta ("Stop ce mode") pour retrouver une conversation normale ou une commande explicite. Sévérité: red.
- Tour 10: question produit explicite capturée par demotivation; réponse vague. Famille: BF-ROUTE-02. Impact: perte de confiance produit. Sévérité: red.
- Tours 11-12: demande explicite de carte non honorée. Famille: BF-ROUTE-02. Impact: Sophia ne fait pas ce que le user demande clairement. Sévérité: red.
- Tour 18: satisfaction conversationnelle transformée en proposition de modifier les préférences. Famille: BF-ROUTE-01. Impact: Sophia paraît opportuniste/lourde. Sévérité: red.

**Fix propose**
- Source amont: admission des `flow_opportunity` et ownership des active local conversation skills.
- Correction recommandee:
  - Appliquer `normal_reply_fit_score` à `flow_opportunity_verification` avant de lancer le runtime, avec `opportunity.score`, `normal_reply_fit_score`, explicitness et récence.
  - Ajouter une sortie/interrupt policy pour active conversation skills: changement de sujet, question produit explicite, status explicite ou tool explicite doivent rendre la main ou supersede le flow.
  - Recalibrer le dispatcher pour ne pas mettre `normal_reply_fit_score=0.15` sur une simple demande d'explication "pourquoi ce pfff".
- Tests d'invariant attendus:
  - "je veux juste comprendre / pas de carte / pas configurer" bloque toute opportunity carte.
  - Feedback local "c'est agréable que ce soit posé" ne crée pas preference opportunity.
  - Active `demotivation_repair` laisse passer `product_help` et `prepare_defense_card` explicites.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- L'implémentation `normal_reply_fit_score` est bien produite par le dispatcher. Exemples: T1 `1`, T2 `1`, T5 `0.9`, T18 `0.98`, T20 `1`.
- Le score fonctionne sur certains cas: T16 reste normal malgré une gêne émotionnelle légère; T17 baisse à `0.1` sur une demande explicite de rappel.
- Mais la policy ajoutée ne couvre pas le chemin runtime `flow_opportunity_verification`: T2, T5 et T18 ont `route_reason=normal_reply_default`, normal score élevé, opportunité medium, et pourtant `response_owner=tool_skill`.
- Le champ `blocked_paths` n'indique pas `normal_reply_fit_dominates` sur ces tours, preuve que l'intervention policy n'est pas appliquée à cette admission.

**Skills / Operations / Tools**
- `create_one_shot_reminder` T17: green. Le direct effect est identifié et exécuté.
- `demotivation_repair` T6: visible utile mais activation discutable. Le dispatcher considère le repair dominant malgré une demande de simple explication.
- `demotivation_repair` T7-T12: red. L'active local skill bloque global dispatcher/router et avale changement de sujet, product_help, puis tool explicite.
- `flow_opportunity_verification` T2/T5/T18: red. L'admission est trop agressive et contourne le score normal.

**Memory / Effets durables**
- T17 a créé un scheduled checkin pending puis cleanup l'a supprimé.
- Aucun autre effet durable observé.
- T18 n'a pas modifié les préférences, seulement proposé. Donc pas de bug d'effet durable, mais bug de proposition.

**Problemes**
- Tour 2/5/18: `normal_reply_fit_score` élevé non respecté. Famille: BF-ROUTE-01. Impact systeme: le nouveau contrat de score est produit mais pas consommé par l'admission flow opportunity. Sévérité: red.
- Tour 6: normal score trop bas pour une simple explication. Famille: BF-ROUTE-01. Impact systeme: dispatcher confond "expliquer une résistance" avec ownership repair. Sévérité: yellow.
- Tours 7-12: active skill local bypass global policy. Famille: BF-ROUTE-02. Impact systeme: les nouveaux scores/guards globaux ne peuvent pas agir. Sévérité: red.

**Fix propose**
- Source amont:
  - `maybeRunFlowOpportunityVerificationRuntime` / admission du runtime opportunity.
  - active local conversation skill ownership / interruption policy.
  - dispatcher score calibration pour demotivation.
- Correction recommandee:
  1. Créer une fonction d'admission commune pour `flow_opportunity`, alimentée par `normal_reply_fit_score`, `flow_opportunity.score`, confidence, recent exit/decline et explicit user posture. Si bloqué, ajouter `blocked_paths.path=flow_opportunity.<target_flow>`, `reason_code=normal_reply_fit_dominates`.
  2. Appeler cette fonction avant `maybeRunFlowOpportunityVerificationRuntime`, pas seulement dans `runConversationRouters`.
  3. Ajouter une gate active-skill: si le message courant contient une intention structurée explicite product/status/tool, le local skill ne doit pas posséder silencieusement le tour.
  4. Exiger des `score` numériques sur `skill_signals.entry.demotivation_repair`; si absent, ne pas laisser un `confidence_band=high` battre un normal reply explicitement demandé.
- Tests d'invariant attendus:
  - T2/T5/T18 paraphrases.
  - Active demotivation + question product_help.
  - Active demotivation + demande explicite prepare_defense_card.
  - Active demotivation + changement de sujet simple.
  - Rappel explicite continue à passer.

## Verdict Global

**red**

Le run est techniquement valide et l'implémentation est partiellement visible: le dispatcher produit bien `normal_reply_fit_score`, et les cas `normal_reply`/rappel explicite fonctionnent. Mais le problème central n'est pas résolu end-to-end: les opportunités implicites `flow_opportunity_verification` ignorent encore ce score, et un active `demotivation_repair` peut capturer des tours neutres, produit explicite et tool explicite. La prochaine correction doit porter sur l'admission runtime des opportunités et l'interruption policy des skills actifs, pas sur des phrases ou regex.
