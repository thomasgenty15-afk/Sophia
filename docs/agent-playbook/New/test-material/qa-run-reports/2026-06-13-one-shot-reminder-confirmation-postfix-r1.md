# QA Run Report — one-shot-reminder-confirmation-postfix-r1

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `one-shot-reminder-confirmation-postfix-20260613-r1`
- Persona: user QA temporaire local `qa-normal-one-shot-reminder-confirmation-postfix-20260613-r1-1781353652821@example.com`, `user_id=32316430-a469-4664-b35b-1f431a6e50af`
- Objectif: vérifier le comportement post-fix des confirmations visibles d'effets committés, surtout les rappels ponctuels, et l'absence du mini-agent transverse `direct_effect.confirmation_visible_agent`.
- Trajectoire: conversation normale, mention de dossier sans action, rappels ponctuels explicites, rappel + second sujet, contexte émotionnel léger, demande incomplète, clarification, récap des rappels réellement créés.
- Surfaces visees: dispatcher, direct effects one-shot reminder, intake instruction/temps, EffectLedger, renderer de confirmation, status recap, DB `scheduled_checkins`.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, client HTTP local hors sandbox, aucun renderer déterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Les messages ont été choisis tour par tour après lecture de la réponse Sophia et des traces. Nettoyage ciblé effectué sur le `user_id` QA après extraction des preuves; `user_memories` a répondu 404, les autres suppressions ciblées et `auth.users` ont réussi.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je veux juste parler tranquillement deux minutes, sans lancer de plan ni transformer ça en tâche.

**Sophia**
> Bien sûr 🤍 On reste tranquilles : pas de plan, pas de tâche.
>
> Là, tout de suite, tu veux déposer quoi en premier sur ces deux minutes : une pensée qui tourne, un truc qui te pèse, ou juste raconter ta journée ?

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
> J'ai juste le dossier de renouvellement qui traîne dans un coin de ma tête. Je ne veux rien décider maintenant, juste le dire.

**Sophia**
> Je vois. Le dossier “renouvellement” te suit en arrière-plan, comme un truc en pause qui demande quand même de l’espace mental. 😕
>
> Le fait que tu veuilles juste le dire, sans décider, c’est déjà une forme de mise à distance : tu le mets hors de ta tête pour qu’il reste dans un endroit “visible”.
>
> Tu veux juste que je te reflète la phrase exacte qui décrit le mieux ce que ça te fait, en une ligne ? ✨

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

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02 — Commit réel mal rendu

**User**
> OK, là j'aimerais juste un rappel : rappelle-moi dans 25 minutes d'ouvrir le fichier du renouvellement sans essayer de régler tout le dossier.

**Sophia**
> C'est programmé pour samedi 13 juin à 10:25.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `low`
- direct_effects_to_run: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- committed_effects: `create_one_shot_reminder`, id `0f5e03db-f42e-4afc-b9ef-65127706a931`, scheduled_for `2026-06-13T08:25:00+00:00`, local_label `samedi 13 juin à 10:25`, reminder_instruction `ouvrir le fichier du renouvellement sans essayer de régler tout le dossier`
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: ligne `scheduled_checkins` pending créée pour 10:25.

**Analyse si yellow/red**
- Symptome: l'effet est correct et committé, mais la confirmation visible ne reprend pas le libellé complet demandé. Elle est neutre, pas vouvoiement, mais pas vraiment au style conversationnel final.
- Source amont probable: renderer one-shot / final response pipeline après EffectLedger.
- Owner runtime: `tools/always_on/one_shot_reminder/renderer.ts`.
- Meilleure correction selon les guidelines: rendre la confirmation depuis `committed_effects` en incluant heure locale et instruction utile, sans réintroduire de mini-agent transverse.
- Pourquoi ce n'est pas un patch local: le contrat one-shot impose que le renderer parle depuis les commits; il faut corriger le rendu propriétaire, pas ajouter une phrase dans `run.ts`.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-02 — Extraction trop large ou polluée; BF-EFFECT-03 — Payload durable faux

**User**
> Ajoute un autre rappel dans 40 minutes pour relire mes notes sur ce dossier, et après ça j'aimerais comprendre pourquoi je me crispe dès que j'y pense.

**Sophia**
> C'est programmé pour samedi 13 juin à 10:40.
>
> Je garde aussi la suite : « et après ça j'aimerais comprendre pourquoi je me crispe dès que j'y pense. ». Tu veux qu'on la traite maintenant ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `low`
- direct_effects_to_run: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- committed_effects: `create_one_shot_reminder`, id `b6188368-207a-48ad-9e57-c8318d7963c8`, scheduled_for `2026-06-13T08:40:00+00:00`, local_label `samedi 13 juin à 10:40`, reminder_instruction `relire mes notes sur ce dossier, et après ça j'aimerais comprendre pourquoi je me crispe dès que j'y pense`
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: ligne `scheduled_checkins` pending créée pour 10:40 avec un libellé qui inclut le second sujet conversationnel.

**Analyse si yellow/red**
- Symptome: Sophia reprend naturellement le second sujet, mais le payload durable du rappel absorbe ce second sujet. Le rappel créé n'est pas seulement "relire mes notes sur ce dossier".
- Source amont probable: extraction instruction/intake multi-intention one-shot.
- Owner runtime: `tools/always_on/one_shot_reminder/instruction_parser.ts` et `intake.ts`.
- Meilleure correction selon les guidelines: découper l'instruction utile avant les connecteurs de second sujet, et laisser l'agenda/normal reply traiter la suite hors payload durable.
- Pourquoi ce n'est pas un patch local: le problème est dans la représentation structurée de l'effet, pas dans le wording final.

### Tour 5

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, juste rapidement : je crois que je me crispe parce que j'imagine tout de suite la montagne entière, pas le petit bout devant moi.

**Sophia**
> Oui… je vois très bien le mécanisme : tu “regardes” déjà le résultat final, donc ton corps se met en alerte, comme si tu devais tout gravir d’un coup 🏔️
>
> Le truc, c’est que ton cerveau confond “penser au dossier” avec “devoir attaquer la montagne entière”.
>
> Si tu veux, on peut juste le rendre concret en une reformulation : là, le problème n’est pas le dossier… c’est l’image globale automatique (“tout de suite tout”) qui te serre.
>
> Tu préfères que je t’aide à le formuler en 1 phrase ultra simple pour la prochaine fois que ça démarre, ou juste qu’on reste sur cette image un instant ? 🙂

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

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-03 — Payload durable faux; BF-INTAKE-02 — Extraction trop large ou polluée

**User**
> Je suis un peu tendu là. Rappelle-moi dans 20 minutes de respirer doucement et de boire un verre d'eau.

**Sophia**
> C'est programmé pour samedi 13 juin à 10:20.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `low`
- direct_effects_to_run: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- committed_effects: `create_one_shot_reminder`, id `0adc4691-8fd2-4139-9afc-1294de872c33`, scheduled_for `2026-06-13T08:20:00+00:00`, local_label `samedi 13 juin à 10:20`, reminder_instruction `eau`
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: ligne `scheduled_checkins` pending créée pour 10:20 avec `event_context=one_shot_reminder:eau`.

**Analyse si yellow/red**
- Symptome: le rappel est créé, mais le texte utile est tronqué à `eau`; "respirer doucement" et "boire un verre d'eau" ne sont pas conservés. Le ton émotionnel léger n'est pas repris dans la confirmation.
- Source amont probable: instruction parser / canonical payload compiler one-shot.
- Owner runtime: `tools/always_on/one_shot_reminder/instruction_parser.ts`, `intake.ts`, puis renderer.
- Meilleure correction selon les guidelines: préserver l'instruction complète non dégénérée dans le payload durable, et rendre une confirmation courte mais adaptée au contexte léger.
- Pourquoi ce n'est pas un patch local: la DB contient déjà le payload faux; corriger seulement le texte visible masquerait l'effet durable incorrect.

### Tour 7

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-04 — Ambiguïté non reconnue; BF-LEDGER-01 — Claim sans commit correct; BF-EFFECT-03 — Payload durable faux

**User**
> Rappelle-moi de vérifier le fichier.

**Sophia**
> C'est programmé pour samedi 13 juin à 10:20.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `low`
- direct_effects_to_run: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- committed_effects: trace expose à nouveau le commit id `0adc4691-8fd2-4139-9afc-1294de872c33`, local_label `samedi 13 juin à 10:20`, reminder_instruction `eau`
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: aucune nouvelle ligne `scheduled_checkins` pour "vérifier le fichier"; les lignes DB restent celles de 10:20 `eau`, 10:25 renouvellement, 10:40 notes.

**Analyse si yellow/red**
- Symptome: demande incomplète sans horaire; Sophia aurait dû demander une précision temporelle. Elle confirme au contraire un rappel à 10:20, en réutilisant le commit précédent `eau`.
- Source amont probable: reducer/intake one-shot qui ne bloque pas `missing_time` et ledger/router qui exposent un commit précédent comme preuve du tour courant.
- Owner runtime: `tools/always_on/one_shot_reminder/reducer.ts`, `router.ts`, EffectLedger adapter si réutilisation de commit inter-tour.
- Meilleure correction selon les guidelines: `missing/past time -> needs_clarify`; ne jamais produire `executed_tools` ni `committed_effects` pour une demande incomplète; isoler les commits au tour courant.
- Pourquoi ce n'est pas un patch local: c'est une faute d'état et de preuve durable, pas une phrase à remplacer.

### Tour 8

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATUS-02 — Historique incomplet; BF-LEDGER-02 — Commit réel mal rendu

**User**
> Attends, pour le dernier rappel je ne t'avais pas donné de moment. Tu as créé quoi exactement ?

**Sophia**
> Pour ton rappel sur le fichier, j'ai bien enregistré : « ouvrir le fichier du renouvellement sans essayer de régler tout le dossier » à 10:25.

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
- durable_effect: aucun nouveau write.

**Analyse si yellow/red**
- Symptome: Sophia ne répond pas à l'anomalie du "dernier rappel" sans horaire; elle répond avec le premier rappel fichier à 10:25.
- Source amont probable: status recap / effect history ne sait pas distinguer la dernière confirmation visible de la dernière ligne DB réellement créée.
- Owner runtime: `status_recap` + lecteur historique EffectLedger/DB.
- Meilleure correction selon les guidelines: status recap doit pouvoir dire qu'aucun rappel "vérifier le fichier" n'a été créé au tour précédent, ou signaler l'ambiguïté au lieu de pointer un autre rappel.
- Pourquoi ce n'est pas un patch local: le besoin est une projection état/historique fiable, pas une réponse spéciale à "dernier rappel".

### Tour 9

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-02 — Extraction trop large ou polluée; BF-EFFECT-03 — Payload durable faux

**User**
> D'accord. Pour vérifier le fichier, mets-le plutôt dans 30 minutes.

**Sophia**
> C'est programmé pour samedi 13 juin à 10:30.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `none`
- direct_effects_to_run: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- committed_effects: `create_one_shot_reminder`, id `4e69c02f-bffe-44e5-87c3-2e32136b934b`, scheduled_for `2026-06-13T08:30:00+00:00`, local_label `samedi 13 juin à 10:30`, reminder_instruction `vérifier le fichier, mets-le plutôt dans 30 minutes`
- blocked_effects: []
- `direct_effect.confirmation_visible_agent`: absent
- durable_effect: ligne `scheduled_checkins` pending créée pour 10:30 avec un libellé incluant la méta-commande temporelle.

**Analyse si yellow/red**
- Symptome: création correcte en temps, mais payload durable pollué par "mets-le plutôt dans 30 minutes".
- Source amont probable: instruction extraction ne retire pas la clause de correction/temps du contenu utile.
- Owner runtime: `tools/always_on/one_shot_reminder/instruction_parser.ts` et `time_parser.ts`.
- Meilleure correction selon les guidelines: extraire séparément `scheduled_for` et `reminder_instruction`, puis valider que l'instruction ne contient pas le marqueur temporel déjà consommé.
- Pourquoi ce n'est pas un patch local: les paraphrases de correction temporelle doivent être couvertes par l'intake structuré, pas par une regex de phrase exacte.

### Tour 10

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATUS-01 — Projection DB mal lue ou trop littérale; BF-EFFECT-03 — Payload durable faux

**User**
> Avant de continuer, fais-moi le récap uniquement des rappels que tu as vraiment créés dans cette conversation, avec leur libellé complet.

**Sophia**
> Voici les rappels que j'ai bien pris en compte pour toi :
>
> - 10:20 : eau
> - 10:25 : ouvrir le fichier du renouvellement sans essayer de régler tout le dossier
> - 10:30 : vérifier le fichier, mets-le plutôt dans 30 minutes
> - 10:40 : relire mes notes sur ce dossier, et après ça j'aimerais comprendre pourquoi je me crispe dès que j'y pense
>
> Côté rappels récurrents, je n'en vois aucun de mon côté.

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
- durable_effect: aucun nouveau write; recap basé sur 4 lignes `scheduled_checkins` pending du run.

**Analyse si yellow/red**
- Symptome: le récap est fidèle aux payloads DB, mais ces payloads exposent les erreurs d'extraction: `eau` tronqué, second sujet absorbé, méta-commande incluse. Le rappel récurrent est mentionné alors que l'utilisateur avait demandé uniquement les rappels créés dans cette conversation.
- Source amont probable: status recap lit des payloads déjà faux et ajoute une section hors scope.
- Owner runtime: `status_recap` pour le hors scope; one-shot intake pour les payloads faux.
- Meilleure correction selon les guidelines: status recap doit rester strictement dans le scope demandé et les rappels one-shot doivent avoir des libellés propres dès le commit.
- Pourquoi ce n'est pas un patch local: corriger le recap seul ne réparera pas les libellés durables stockés.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le mini-agent transverse `direct_effect.confirmation_visible_agent` n'apparaît dans aucune trace.
- Sophia ne vouvoie pas et ne produit pas les formulations interdites "je vous rappellerai", "souhaitez-vous", "votre rappel".
- Les tours sans demande d'action restent conversationnels et sans effet durable.
- Le second sujet du tour 4 est au moins reconnu dans le visible et repris au tour 5.

**Problemes**
- Tour 3: confirmation trop minimale, sans rappel du contenu complet. Famille: BF-LEDGER-02. Impact: l'utilisateur ne peut pas vérifier ce qui a été enregistré. Sévérité: yellow.
- Tour 4: Sophia semble bien gérer le second sujet, mais le rappel durable l'absorbe. Famille: BF-INTAKE-02/BF-EFFECT-03. Impact: le rappel envoyé plus tard contiendra une phrase conversationnelle hors cible. Sévérité: red.
- Tour 6: contexte émotionnel léger non repris et libellé durable réduit à `eau`. Famille: BF-EFFECT-03. Impact: rappel incomplet, perte de l'intention de régulation. Sévérité: red.
- Tour 7: demande incomplète faussement confirmée. Famille: BF-INTAKE-04/BF-LEDGER-01. Impact: l'utilisateur croit qu'un rappel "vérifier le fichier" existe alors qu'aucune ligne correspondante n'est créée. Sévérité: red.
- Tour 10: recap liste des libellés durables pollués et ajoute une mention de rappels récurrents hors demande. Famille: BF-STATUS-01. Impact: confiance faible dans le statut. Sévérité: red.

**Fix propose**
- Source amont: `one_shot_reminder` intake/reducer/renderer et status recap.
- Correction recommandee: bloquer strictement `missing_time`, isoler les commits au tour courant, extraire une instruction utile propre avant commit, puis rendre les confirmations depuis `committed_effects` avec heure + libellé.
- Tests d'invariant attendus: create success avec libellé complet; rappel + second sujet sans pollution; contexte émotionnel léger avec instruction complète; demande sans heure -> clarification et zéro commit; correction temporelle -> instruction sans clause de temps; status recap strictement scoped.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Les tours rappel routent vers `response_owner=tool_skill`, `selected_handler=create_one_shot_reminder`, ce qui est attendu pour les demandes explicites complètes.
- Le tour 7 aurait dû router/réduire vers clarification `missing_time`, mais il passe en direct effect `create_one_shot_reminder`.
- Les tours status routent vers `status_recap`, cohérent en surface, mais la projection ne répond pas correctement à la question sur le dernier rappel.

**Skills / Operations / Tools**
- `executed_tools` est vide sur les tours conversationnels et status.
- `executed_tools=["create_one_shot_reminder"]` sur les tours 3, 4, 6, 7, 9.
- Le tour 7 expose un `tool_execution=success` et un commit précédent, alors que le message courant n'a pas de slot temporel. C'est une violation de l'invariant one-shot `missing/past time -> needs_clarify`.

**Memory / Effets durables**
- DB `scheduled_checkins` après le tour 10 contient 4 rappels pending créés par le run:
  - 10:20: `eau`
  - 10:25: `ouvrir le fichier du renouvellement sans essayer de régler tout le dossier`
  - 10:30: `vérifier le fichier, mets-le plutôt dans 30 minutes`
  - 10:40: `relire mes notes sur ce dossier, et après ça j'aimerais comprendre pourquoi je me crispe dès que j'y pense`
- Aucun `direct_effect.confirmation_visible_agent` dans les traces.
- Les payloads 10:20, 10:30 et 10:40 sont faux ou pollués; le tour 7 a confirmé sans créer de ligne correspondant à la demande.

**Problemes**
- Tour 4: extraction multi-intention polluée. Famille: BF-INTAKE-02/BF-EFFECT-03. Impact systeme: payload durable faux. Sévérité: red.
- Tour 6: instruction parser tronque l'instruction à `eau`. Famille: BF-EFFECT-03. Impact systeme: effet durable incomplet. Sévérité: red.
- Tour 7: missing time non bloqué + commit précédent réexposé. Famille: BF-INTAKE-04/BF-LEDGER-01. Impact systeme: confirmation non prouvée pour la demande courante. Sévérité: red.
- Tour 9: correction temporelle incluse dans le payload. Famille: BF-INTAKE-02/BF-EFFECT-03. Impact systeme: libellé durable pollué. Sévérité: red.
- Tour 10: recap strictement demandé mais ajoute une section rappels récurrents. Famille: BF-STATUS-01. Impact systeme: status hors scope. Sévérité: yellow.

**Fix propose**
- Source amont: contrat propriétaire `one_shot_reminder` (`time_parser.ts`, `instruction_parser.ts`, `intake.ts`, `reducer.ts`, `router.ts`, `renderer.ts`) et `status_recap` pour les projections.
- Correction recommandee: respecter le contrat `one-shot-reminder.md`: `missing/past time -> needs_clarify`; `create success -> commit id/scheduled_for/instruction`; `exact text quoted/unquoted -> payload propre`; renderer uniquement depuis commits du tour courant.
- Tests d'invariant attendus: tests router/intake pour les 5 cas rouges du run, test EffectLedger empêchant la réutilisation d'un commit précédent, test recap "uniquement les rappels créés" sans section hors scope.

## Verdict Global

red — Le point ciblé "absence de `direct_effect.confirmation_visible_agent`" est validé, et aucun vouvoiement interdit n'a été observé. En revanche, le run révèle des régressions critiques sur les rappels ponctuels: payloads durables pollués ou tronqués, demande incomplète faussement confirmée, et récap basé sur des libellés faux.
