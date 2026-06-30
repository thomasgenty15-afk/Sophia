# QA Run Report - normal-conversation-15t-20260613-r4-diverse-postfix

## 1. Contexte Du Test

- Date: 2026-06-13.
- Run: `normal-conversation-15t-20260613-r4-diverse-postfix`.
- Persona: utilisateur QA temporaire local `qa-normal-normal-conversation-15t-20260613-r4-diverse-postfix-1781351928444@example.com`, supprimé en fin de run.
- Objectif: tester un parcours diversifié après les fixes `normal_reply` product-thin, `status_recap` restitution ciblée et frontière `blocked_paths` audit-only.
- Trajectoire: conversation normale avec résistance légère, entrée en démotivation, sortie de `demotivation_repair`, question produit, carte d'attaque explicite, rappel explicite, récap status, préférence locale non durable.
- Surfaces visees: `normal_reply`, `flow_opportunity`, `demotivation_repair`, `product_help`, `prepare_attack_card`, `create_one_shot_reminder`, `status_recap`, `update_coach_preferences`.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, exécution hors sandbox, aucun renderer déterministe, aucun fallback direct.
- Validite QA: valide. Les 15 tours ont retourné HTTP 200. Les messages ont été choisis tour par tour après lecture de Sophia et des traces courtes. Aucun code applicatif n'a été modifié pendant le run.
- Nettoyage: `user_profile_facts` du user QA supprimé manuellement de façon ciblée; cleanup standard OK pour `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`; `user_memories` retourne encore 404.
- Artefacts bruts: `tmp/qa-normal-conversation/normal-conversation-15t-20260613-r4-diverse-postfix/state.json`.
- Note temps: le runner fixe `client_now_iso=2026-05-22T10:00:00.000+02:00`; le rappel T11 est donc affiché à 10h35 sur cette date simulée.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne, variante posture visible trop action

**User**
> J'aimerais qu'on parle simplement deux minutes. J'ai un dossier à ouvrir mais je sens déjà un petit 'pfff' intérieur, pas une crise, juste une résistance.

**Sophia**
> Je suis là. Ton “pfff” ressemble juste à une alerte de résistance normale... On fait simple et court, là maintenant : ouvre le dossier sur 30 secondes max... c'est quoi, exactement, la première chose que tu vois quand tu ouvres ce dossier ?

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.85`
- flow_opportunity: `prepare_attack_card`, score `0.55`
- blocked_paths: `flow_opportunity.prepare_attack_card / normal_reply_fit_dominates` présent 2 fois
- executed_tools: none

**Analyse si yellow/red**
- Symptome: plus de proposition de carte, donc le fix companion marche partiellement; mais Sophia propose quand même d'ouvrir le dossier immédiatement alors que le user demande "parler simplement".
- Source amont probable: prompt `normal_reply` encore trop orienté micro-action quand le user mentionne une action.
- Owner runtime: normal reply visible agent.
- Correction recommandee: renforcer "parler simplement" / "pas une crise" comme posture conversationnelle avant micro-action; garder action seulement si user accepte.

### Tour 2

**Verdict du tour:** green

**User**
> Attends, pas d'action maintenant. Je veux juste comprendre ce réflexe de négociation avant l'effort, sans ouvrir le dossier tout de suite.

**Sophia**
> Ok, pas d'action maintenant... Ce "pfff", c'est souvent une négociation automatique de ton cerveau... 1) peur de l'effort, 2) peur de l'enjeu, 3) fatigue/charge mentale...

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.95`
- flow_opportunity: null
- executed_tools: none

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne

**User**
> Plutôt 2. Et quand je sens ça, je me décourage vite, comme si j'allais encore prouver que je n'arrive pas à tenir mes propres décisions.

**Sophia**
> C'est pesant de ressentir ce décalage avec tes propres décisions. Si tu veux, on peut regarder ensemble comment désamorcer ce découragement pour que tu retrouves un peu d'élan ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `normal_reply_fit_dominates`
- normal_reply_fit_score: `0.9`
- skill_signals.entry.demotivation_repair: score `0.65`
- blocked_paths: `conversation_skill.demotivation_repair / normal_reply_fit_dominates`
- executed_tools: none

**Analyse si yellow/red**
- Symptome: contradiction système. La route dit que normal reply domine et bloque `demotivation_repair`, mais le owner final visible est `tool_skill/flow_opportunity_verification`, qui propose quand même d'ouvrir une réparation.
- Source amont probable: admission `flow_opportunity_verification` / conversation skill opportunity non couverte par la policy après `normal_reply_fit_dominates`.
- Owner runtime: flow opportunity verification / router admission.
- Meilleure correction: ne pas lancer `flow_opportunity_verification` quand la seule opportunité est un conversation skill bloqué par `normal_reply_fit_dominates`; ou distinguer explicitement opportunity tool vs conversation repair et appliquer la même économie d'intervention.
- Pourquoi ce n'est pas un patch local: le dispatcher produit les bons scores; la couche aval contredit sa propre route.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne

**User**
> Oui, mais doucement. Je ne veux pas de grand plan, juste comprendre pourquoi ça me coupe l'élan.

**Sophia**
> On avance à ton rythme. Ce que tu décris ressemble à un mécanisme d'évitement protecteur...

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `demotivation_repair`
- route_reason: `active_flow_opportunity_verification_local_dispatcher`
- blocked_paths: `global_dispatcher / active_flow_opportunity_verification_uses_local_dispatcher`
- executed_tools: none

**Analyse**
- Visible correct, mais ownership incohérent: `demotivation_repair` est lancé via l'ancien `flow_opportunity_verification` alors que T3 disait normal dominant.

### Tour 5

**Verdict du tour:** green

**User**
> Oui, c'est exactement ça. Si je n'avance pas, j'ai l'impression que ça dit quelque chose de nul sur moi, alors je préfère presque ne pas ouvrir.

**Sophia**
> C'est un poids énorme de lier ta valeur personnelle à chaque petit pas... qu'est-ce qui te donnait envie de réaliser ce projet au tout début ?

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- executed_tools: none

**Analyse**
- Continuation légitime de repair. Latence élevée observée, mais contenu et owner cohérents.

### Tour 6

**Verdict du tour:** green

**User**
> Ça me parle, merci. Je change de sujet : le samedi matin je suis souvent plus lent même quand je dors assez, ça te paraît normal ?

**Sophia**
> Oui, ça peut totalement être normal... le samedi matin, même avec assez de sommeil, tu peux te sentir plus lent...

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- blocked_paths: `demotivation_repair.local_visible_reply / local_exit_to_global_dispatcher_blocks_local_reply`
- executed_tools: none

**Analyse**
- Très bon: le cas de sortie `demotivation_repair` sur changement de sujet est vérifié.

### Tour 7

**Verdict du tour:** green

**User**
> Sur plusieurs heures. Et question Sophia au passage : si je crée une carte d'attaque, je la retrouve où dans l'app ?

**Sophia**
> Ta carte d'attaque se trouve dans l'onglet Ressources de ton dashboard, rangée par niveau. Tu peux aussi voir un aperçu directement sur l'action concernée dans ton Plan.

**Trace courte**
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- skill_signals.entry.product_help: score `0.9`
- executed_tools: none

### Tour 8

**Verdict du tour:** green

**User**
> Ok, maintenant je veux vraiment créer une carte d'attaque courte pour ce dossier : cible, ouvrir le fichier ; pensée qui bloque, 'je vais me perdre'.

**Sophia**
> Pour t'aider à ouvrir ce fichier sans craindre de te perdre, je te propose d'utiliser Le texte magique. Est-ce que cette technique te semble adaptée ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `product_help_exit_to_global_dispatcher`
- executed_tools: none

### Tour 9

**Verdict du tour:** green

**User**
> Oui, Le texte magique me va. Garde juste la carte courte et centrée sur 'ouvrir le fichier sans me perdre'.

**Sophia**
> Dans quel état d'esprit tu veux te remettre pour réussir à ouvrir ton fichier sans te perdre ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- executed_tools: none

**Analyse**
- Question de coaching acceptable selon la décision produit: la carte d'attaque garde une confirmation naturelle.

### Tour 10

**Verdict du tour:** green

**User**
> Dans un état calme et cadré : je veux juste ouvrir, lire le titre, et noter la première chose évidente.

**Sophia**
> Tu peux maintenant finaliser ta préparation dans la section Cartes d'attaque... technique Le texte magique... action : ouvrir le fichier... pensées : je vais me perdre... état : calme et cadré...

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- tool_execution: `platform_handoff`
- executed_tools: none

### Tour 11

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PREF-01 - Preference / style runtime non appliqué

**User**
> Parfait. Maintenant laisse la carte de côté et rappelle-moi dans 35 minutes : ouvrir le fichier sans résoudre tout le dossier.

**Sophia**
> C'est entendu, je vous rappellerai bien d'ouvrir le fichier sans résoudre tout le dossier à 10h35.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- direct_effects_to_run: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- tool_execution: `success`
- skill_signals.exit.prepare_attack_card: score `1`

**Analyse si yellow/red**
- Systeme: très bon, le rappel explicite supersède la carte active.
- Symptome: rupture de tutoiement ("je vous rappellerai") alors que Sophia tutoie partout ailleurs.
- Correction recommandee: final response / reminder renderer doit respecter la politique de tutoiement visible.

### Tour 12

**Verdict du tour:** green

**User**
> Merci. Sans outil maintenant : je veux juste garder l'idée que je peux ouvrir sans tout résoudre.

**Sophia**
> Avec plaisir. Et oui, tu as exactement la bonne posture : ouvrir = le petit geste, pas "tout résoudre"... phrase repère : "Je n'ai pas besoin de finir, je dois seulement ouvrir."

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.95`
- executed_tools: none

### Tour 13

**Verdict du tour:** green

**User**
> Fais-moi un récap honnête de ce qui a vraiment été créé ou pas dans cet échange.

**Sophia**
> Pour être tout à fait honnête : seul ton rappel de 10h35 pour « ouvrir le fichier sans résoudre tout le dossier » est bien enregistré. Côté cartes d'attaque, aucune n'a été créée pour le moment.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- skill_signals.entry.status_recap: score `0.95`
- executed_tools: none

**Analyse**
- Fix `status_recap` vérifié: libellé complet du rappel restitué; pas de préférences coach par défaut ajoutées.

### Tour 14

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue

**User**
> Parfait. Pour la suite de cette conversation seulement, pose moins de questions, mais ne change pas mes réglages.

**Sophia**
> C'est entendu, je vais limiter mes questions pour la suite de notre échange sans toucher à tes réglages habituels. De quoi veux-tu discuter ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- tool_skill_intents: `update_coach_preferences`, explicit update
- executed_tools: none
- durable check: `user_profile_facts` contient seulement les defaults système, aucune préférence explicite créée.

**Analyse si yellow/red**
- Visible correct et aucun effet durable incorrect.
- Probleme système: le dispatcher route quand même en `update_coach_preferences` malgré "pour cette conversation seulement" et "ne change pas mes réglages".
- Source amont: dispatcher / update coach preference intent classification.
- Correction recommandee: une préférence conversationnelle explicitement non durable doit rester normal reply ou contrainte temporaire, pas tool skill durable.

### Tour 15

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Juste pour vérifier : est-ce que tu as modifié mes préférences ou seulement adapté ce tour-ci ?

**Sophia**
> J'ai simplement adapté mon approche pour cet échange précis, sans toucher à tes réglages habituels. Est-ce que cela te convient pour la suite de notre discussion ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_update_coach_preferences_local_dispatcher`
- blocked_paths: `global_dispatcher / active_update_coach_preferences_uses_local_dispatcher`
- executed_tools: none
- durable check: seulement defaults système dans `user_profile_facts`, supprimés en cleanup ciblé.

**Analyse si yellow/red**
- Visible correct.
- Probleme système: le flow `update_coach_preferences` reste owner d'une question de vérification/status qui devrait être normal/status, parce que T14 a ouvert le mauvais flow.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le prompt `normal_reply` product-thin améliore clairement le visible: T1/T2 ne proposent plus de carte.
- Le changement de sujet hors `demotivation_repair` fonctionne à T6.
- Product help T7, carte explicite T8-T10, rappel explicite T11 et status recap T13 fonctionnent.
- Le récap T13 est nettement meilleur que R3: texte complet du rappel et pas de préférences coach non demandées.

**Problemes**
- T1: Sophia reste trop action-oriented pour "parler simplement".
- T3/T4: une opportunité `demotivation_repair` est lancée malgré `normal_reply_fit_dominates`, avec trace contradictoire.
- T5/T7/T8/T9: latence élevée sur les flows locaux.
- T11: vouvoiement dans le renderer reminder.
- T14/T15: demande explicitement non durable routée vers `update_coach_preferences`, puis active flow capture la vérification.

**Fix propose**
- Source amont: flow opportunity verification pour conversation skills; dispatcher update preference classification; reminder visible renderer style.
- Correction recommandee: appliquer la même économie d'intervention aux opportunities conversationnelles; traiter "pour cette conversation seulement / ne change pas mes réglages" comme contrainte temporaire; aligner le renderer reminder sur le tutoiement.
- Tests d'invariant attendus: demotivation faible score 0.65 vs normal 0.9 reste normal; préférence temporaire ne lance pas update flow; rappel renderer tutoie.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- `flow_opportunity.prepare_attack_card` est bloqué à T1 mais dupliqué dans `blocked_paths`.
- T3 est le point système le plus grave: route reason `normal_reply_fit_dominates`, blocked path `conversation_skill.demotivation_repair`, mais owner final `tool_skill/flow_opportunity_verification`.
- T6 valide la sortie `demotivation_repair` vers global/normal.
- T14/T15 montrent une mauvaise frontière entre préférence temporaire et `update_coach_preferences` durable.

**Skills / Operations / Tools**
- `product_help` répond correctement.
- `prepare_attack_card` va jusqu'au handoff plateforme sans création DB.
- `create_one_shot_reminder` exécute correctement le rappel.
- `status_recap` restitue exactement les objets demandés.

**Memory / Effets durables**
- Rappel créé puis supprimé au cleanup.
- `user_profile_facts` ne contient que les defaults système; aucune préférence explicite durable n'a été créée par T14/T15. Ces defaults du user QA ont été supprimés en cleanup ciblé.

**Problemes**
- T3/T4: `flow_opportunity_verification` contourne le blocage normal pour `demotivation_repair`. Famille: BF-ROUTE-01.
- T14/T15: préférence locale capturée par update coach preferences. Famille: BF-INTAKE-03 puis BF-ROUTE-02.
- T11: style renderer reminder passe au vouvoiement. Famille: BF-PREF-01.
- T1: micro-action proposée en normal reply malgré "parler simplement". Famille: BF-ROUTE-01 léger.

**Fix propose**
- Source amont: admission opportunity conversationnelle, dispatcher score/intake update preferences, renderer reminder.
- Correction recommandee: bloquer `flow_opportunity_verification` quand la conversation skill candidate perd face à normal reply; ajouter règle sémantique IA dans dispatcher pour préférence temporaire non durable; renderer reminder respecte style global.
- Tests d'invariant attendus: T3 paraphrasé reste normal ou démarre repair seulement si score vraiment fort; "pour cette conversation seulement, ne change pas mes réglages" n'ouvre pas update flow; rappel ponctuel rendu au tutoiement.

## Verdict Global

**Verdict: yellow.**

Les fixes récents améliorent réellement le système: normal reply ne propose plus de carte, `status_recap` rend le rappel complet sans préférences parasites, et `demotivation_repair` sait sortir sur changement de sujet. Le run n'est pas green à cause d'une incohérence d'admission `flow_opportunity_verification` sur demotivation, et d'un faux positif `update_coach_preferences` pour une préférence explicitement temporaire.
