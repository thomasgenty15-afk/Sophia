# QA Run Report - normal-conversation-15t-20260613-r5-context-policy

## 1. Contexte Du Test

- Date: 2026-06-13.
- Run: `normal-conversation-15t-20260613-r5-context-policy`.
- Persona: utilisateur QA temporaire local `qa-normal-normal-conversation-15t-20260613-r5-context-policy-1781356111343@example.com`, supprimé en fin de run.
- Objectif: vérifier le comportement après centralisation des fenêtres de contexte récentes: `normal_reply` 15, dispatcher 8, repairs 12, tools 10.
- Trajectoire: conversation simple, démotivation légère puis explicite, sortie vers product help, carte d'attaque explicite, status recap, rappel ponctuel, instruction de posture ponctuelle, retour normal reply.
- Surfaces visees: `normal_reply`, `demotivation_repair`, `product_help`, `prepare_attack_card`, `status_recap`, `create_one_shot_reminder`, contexte récent.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, exécution hors sandbox, aucun renderer déterministe, aucun fallback direct.
- Validite QA: valide. 15/15 tours HTTP 200. Messages choisis tour par tour après lecture de la réponse et trace courte. Aucun code applicatif modifié pendant le run.
- Nettoyage: cleanup ciblé OK pour `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`; `user_memories` retourne 404 comme précédemment.
- Artefacts bruts: `tmp/qa-normal-conversation/normal-conversation-15t-20260613-r5-context-policy/state.json`.
- Note temps: le runner fixe `client_now_iso=2026-05-22T10:00:00.000+02:00`; le rappel T10 est donc affiché à 10h25 sur cette date simulée.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'aimerais qu'on parle simplement, sans me lancer tout de suite dans un outil. J'ai un rapport à relire et je sens une petite résistance, un truc assez banal, pas dramatique.

**Sophia**
> Bien sûr. On peut rester simple. Cette petite résistance que tu sens, je la traduirais comme un mélange assez banal entre “je sais que c’est à faire” et “je n’ai pas envie d’entrer dedans maintenant”... Si tu veux, décris-moi juste ce qui te freine le plus là, maintenant...

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `low`
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> C'est surtout l'impression que dès que je lis, je vais découvrir trois problèmes en plus. Je ne veux pas encore agir, juste comprendre ce réflexe.

**Sophia**
> Je te comprends. Ce réflexe ressemble beaucoup à une alarme interne... Et le fait que tu ne veuilles pas agir là, c’est cohérent : à ce stade, tu ne cherches pas une solution, tu cherches à identifier le mécanisme...

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `low`
- executed_tools: []

### Tour 3

**Verdict du tour:** green

**User**
> Plutôt la peur d'être obligé d'en faire quelque chose. Et ça me décourage, parce que j'ai l'impression de retomber toujours dans le même évitement.

**Sophia**
> Je vois très bien le mécanisme... “lire” ne vaut pas “résoudre”... Tu me dis juste : quand tu imagines “en faire quelque chose”, ça veut dire quoi concrètement pour toi ?

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `none`
- skill_entry_ids: []
- executed_tools: []

**Analyse**
- Bon signal: une démotivation légère reste dans `normal_reply`, sans capture prématurée par `demotivation_repair`.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-06 - Mauvais domaine semantique / réponse skill trop générique

**User**
> Ça veut dire décider et répondre. Là j'aimerais bien que tu m'aides à retrouver un peu d'élan, mais sans me faire un grand plan.

**Sophia**
> C'est entendu. On laisse de côté les grands plans pour se concentrer uniquement sur l'élan nécessaire pour cette tâche précise. Je suis prête à t'aider à clarifier ce point pour que tu puisses décider et répondre sereinement.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- safety: `low`
- skill_entry_ids: [`demotivation_repair`]
- executed_tools: []

**Analyse si yellow/red**
- Symptome: routing cohérent, mais réponse visible creuse après latence élevée; elle reformule sans vraiment aider ni poser une bonne question.
- Source amont probable: visible/local contract `demotivation_repair` trop générique sur demande d'élan court.
- Owner runtime: `demotivation_repair`.
- Correction recommandee: améliorer le visible task pour produire une micro-clarification utile ou un recadrage direct, sans grand plan.

### Tour 5

**Verdict du tour:** green

**User**
> Ok, je change de sujet. Dans Sophia, c'est quoi la différence entre une carte d'attaque et une carte de défense ?

**Sophia**
> Bonne question. La différence, c’est surtout la “fonction” de la carte. Carte d’attaque : elle te met en mouvement... Carte de défense : elle te protège / régule avant l’action...

**Trace courte**
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- skill_entry_ids: [`product_help`]
- executed_tools: []

**Analyse**
- Bon signal: sortie de `demotivation_repair` vers product help réussie.

### Tour 6

**Verdict du tour:** green

**User**
> Alors crée-moi une carte d'attaque courte pour le rapport : cible, relire l'introduction ; blocage, peur de découvrir trop de corrections ; action, lire seulement la première page.

**Sophia**
> Pour relire l'introduction de ton rapport sans te laisser freiner par la peur des corrections, je te propose d'utiliser Le texte magique afin de recadrer tes pensées. Est-ce que cette technique te convient ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_skill_intents: [`prepare_attack_card`]
- tool_execution: `blocked`

**Analyse**
- Bon signal: demande explicite de flow admise. La policy `normal_reply` ne bloque pas l'explicite.

### Tour 7

**Verdict du tour:** green

**User**
> Oui, Le texte magique me va. Je veux que ça reste très compact : phrase clé, 'je lis pour voir, pas pour tout résoudre'.

**Sophia**
> Tout est prêt pour ta carte. Tu peux maintenant te rendre dans la section Cartes d’attaque et choisir la technique Le texte magique. Voici les éléments à utiliser : action, relire l'introduction du rapport ; pensées, peur de découvrir trop de corrections ; état, je lis pour voir, pas pour tout résoudre...

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- tool_execution: `platform_handoff`
- executed_tools: []

**Analyse**
- Le flow garde les informations fournies et livre un handoff compact. Quelques libellés sont mécaniques, mais acceptable produit.

### Tour 8

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Avant d'agir, redis-moi précisément ce qui a été créé ou pas dans Sophia après cette carte.

**Sophia**
> Je n'arrive pas a repondre a cette question maintenant, mais je garde la carte d'attaque en cours.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- safety: `none`
- executed_tools: []
- tool_execution: `none`

**Analyse si yellow/red**
- Symptome: question status légitime pendant flow actif, mais `prepare_attack_card` échoue à déléguer/répondre.
- Source amont probable: bridge inline status du flow attaque, ou policy d'interruption active flow.
- Owner runtime: `prepare_attack_card` local dispatcher / inline status bridge.
- Correction recommandee: quand un user demande "ce qui a été créé ou pas", le flow actif doit soit déléguer à `status_recap`, soit rendre une réponse locale fiable depuis son ledger/handoff state.

### Tour 9

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATUS-01 - Projection DB mal lue / scope trop large

**User**
> Je ne veux pas continuer la carte maintenant. Sors du flow et réponds juste à ma question : qu'est-ce qui existe vraiment côté Sophia, et qu'est-ce qui est seulement une préparation à recopier ?

**Sophia**
> C'est très simple : tant qu'on n'a pas validé ensemble la création finale, rien n'est enregistré. Pour l'instant, ton espace contient 0 carte (attaque ou défense) et 0 rappel. Seules tes préférences de coach, comme ton ton « Bienveillant ferme » et ton focus sur la discipline, sont actives.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- skill_entry_ids: [`status_recap`]
- executed_tools: []

**Analyse si yellow/red**
- Symptome: réponse principale correcte, mais Sophia ajoute des préférences coach non demandées.
- Source amont probable: `status_recap` visible/projection inclut des catégories hors scope demandé.
- Owner runtime: `status_recap`.
- Correction recommandee: respecter strictement le read_scope demandé; ne restituer que les objets demandés sauf si le user demande un état global.

### Tour 10

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02 - Commit reel mal rendu

**User**
> Crée-moi un rappel ponctuel dans 25 minutes : 'relire seulement la première page du rapport'.

**Sophia**
> C'est programmé pour vendredi 22 mai à 10:25.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- direct_effects_to_run: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- durable_effect: `scheduled_checkins` pending à `2026-05-22T08:25:00+00:00`

**Analyse si yellow/red**
- Symptome: effet durable correct, confirmation visible trop minimale; elle ne reprend pas le libellé du rappel.
- Source amont probable: final response pipeline / committed effect rendering.
- Owner runtime: direct effect final response.
- Correction recommandee: donner au visible agent final une instruction de confirmation avec heure + libellé complet, sans mini-agent dédié.

### Tour 11

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-EFFECT-03 - Payload durable faux / texte pollué

**User**
> Tu peux me récapituler uniquement le rappel que tu viens de créer, avec son libellé complet ?

**Sophia**
> Ton rappel est bien enregistré pour 10h25 avec l'instruction exacte : « relire seulement la première page du rapport' ».

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- scheduled_checkins: 1 pending, `event_context=one_shot_reminder:relire_seulement_la_premiere_page_du_rapport`

**Analyse si yellow/red**
- Symptome: libellé complet retrouvé, mais apostrophe finale parasite.
- Source amont probable: extraction/payload du rappel avec quote delimiter conservé.
- Owner runtime: one-shot reminder payload compiler/parser.
- Correction recommandee: corriger l'extraction quote-delimited avec garde-fou pour conserver les apostrophes internes.

### Tour 12

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Pour la suite de cet échange seulement, sois plus direct et moins enveloppant, mais ne change pas mes préférences durables.

**Sophia**
> C'est entendu, je serai plus directe pour la suite de cet échange. Tes préférences durables restent intactes... seuls les réglages par défaut du système s'appliquent...

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_status_recap_local_dispatcher`
- executed_tools: []
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: contenu globalement acceptable, mais `status_recap` actif capture une instruction de posture ponctuelle.
- Source amont probable: exit policy `status_recap` trop faible.
- Owner runtime: `status_recap` active local dispatcher / interruption policy.
- Correction recommandee: `status_recap` doit sortir dès que le user donne une instruction de conversation ou posture qui n'est plus une demande de statut.

### Tour 13

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Ok. Réponds direct : si je veux relire sans me faire happer, quelle distinction dois-je garder en tête ?

**Sophia**
> Pour faire simple : il y a ce que j'ai déjà ancré dans ma mémoire durable et ce qui n'est encore qu'une discussion en cours... rappel... préférences de coach...

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_status_recap_local_dispatcher`
- executed_tools: []

**Analyse si yellow/red**
- Symptome: réponse hors sujet. Le user demande une distinction cognitive sur le rapport; `status_recap` répond mémoire/statut Sophia.
- Source amont probable: active local conversation/skill ownership de `status_recap` ne détecte pas l'intention concurrente `normal_reply`.
- Owner runtime: `status_recap`.
- Correction recommandee: ajouter une exit policy structurée au dispatcher local `status_recap`; continuer seulement si le message courant reste une question de statut/projection.

### Tour 14

**Verdict du tour:** green

**User**
> Stop le récap statut. Je parle du rapport, pas de mémoire Sophia. Réponds en conversation normale : lecture ne veut pas dire résolution, c'est ça ?

**Sophia**
> Oui, c’est exactement ça. “Lecture” veut dire que tu prends connaissance... “Résolution”, c’est quand tu passes à l’étape où tu traites le contenu...

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- executed_tools: []

**Analyse**
- Sortie explicite de `status_recap` réussie quand le user force très clairement le stop.

### Tour 15

**Verdict du tour:** green

**User**
> Parfait. Termine en une phrase directe, sans outil : la seule idée à garder pour ce rapport.

**Sophia**
> La seule idée à garder : relire la première page du rapport en simple prise de contact, sans te forcer à “résoudre” tout ce que tu verras.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- executed_tools: []

**Analyse**
- Bon: réponse directe, pas de relance tool, contexte récent conservé.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1-T3 sont nettement meilleurs que les runs précédents: Sophia reste en conversation normale, ne pousse pas d'action ni de carte, et gère une démotivation légère intelligemment.
- T5 montre une sortie propre de `demotivation_repair` vers product help.
- T6-T7 montrent que l'explicite flow passe bien malgré l'économie d'intervention normal reply.
- T14-T15 retrouvent une conversation simple et contextuelle après une demande de stop explicite.

**Problemes**
- T4: réponse `demotivation_repair` trop creuse pour une demande d'élan. Famille: BF-INTAKE-06. Impact: friction faible à moyenne.
- T8: Sophia échoue à répondre à un status recap simple pendant un flow carte. Famille: BF-ROUTE-02. Impact: fort, car le user demande précisément "créé ou pas".
- T9/T12: `status_recap` ajoute les préférences coach alors que ce n'est pas demandé. Famille: BF-STATUS-01. Impact: moyen, ça brouille le récap.
- T13: `status_recap` capture une question normale et répond hors sujet. Famille: BF-ROUTE-02. Impact: fort.

**Fix propose**
- Source amont prioritaire: exit/interruption policy des active local skills, d'abord `status_recap`.
- Correction recommandee: `status_recap` doit continuer seulement sur une demande de statut/projection/effect history; sinon `exit_to_global_dispatcher`.
- Tests d'invariant attendus:
  - Après un status recap, "réponds direct sur mon rapport" => `normal_reply`.
  - Pendant une carte active, "qu'est-ce qui a été créé ou pas" => status fiable ou réponse locale fiable.
  - Récap ciblé rappel => libellé complet sans catégories non demandées.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- `normal_reply` fonctionne mieux: pas de false positive flow opportunity visible sur T1-T3.
- L'entrée explicite en `prepare_attack_card` fonctionne: T6 selected_handler `prepare_attack_card`.
- La sortie `demotivation_repair` vers `product_help` fonctionne: T5 selected_handler `product_help`.
- Le problème principal restant est `status_recap` actif: il capture T12-T13 alors que le user n'est plus dans une demande de statut.

**Skills / Operations / Tools**
- `prepare_attack_card`: bon handoff T7, mais mauvais bridge status T8.
- `create_one_shot_reminder`: effet durable créé correctement T10.
- `status_recap`: projection utile T9/T11, mais scope trop large et lifecycle trop collant.

**Effets durables**
- T10 crée bien un `scheduled_checkins` pending à `2026-05-22T08:25:00+00:00`.
- Aucun write durable observé pour l'instruction ponctuelle T12, ce qui va dans le bon sens.
- Cleanup ciblé post-run a supprimé le user QA et les objets exposés.

**Contexte récent**
- Aucun symptôme négatif direct lié à la nouvelle policy de contexte.
- T15 conserve bien le fil récent "première page / ne pas résoudre".
- Les failures observés ne viennent pas d'un manque évident de derniers messages; ils viennent plutôt de lifecycle/ownership de flows actifs.

## Verdict Global

**red**

Le changement de contexte récent ne crée pas de régression évidente et `normal_reply` est franchement meilleur. Mais le run n'est pas vert: `status_recap` a encore une ownership trop collante et capture des intentions normales après son activation. Le prochain fix intelligent est donc l'exit policy structurée de `status_recap`, puis le bridge status depuis `prepare_attack_card`.
