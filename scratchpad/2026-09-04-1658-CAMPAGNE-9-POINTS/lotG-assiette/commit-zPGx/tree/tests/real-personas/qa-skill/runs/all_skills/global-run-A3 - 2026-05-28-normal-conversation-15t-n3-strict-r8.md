# Global Run A3 - Normal Conversation 15T N3 Strict R8

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A3_20260528_strict_r8`
- Persona: `qa-normal-global_run_A3_20260528_strict_r8-1779994452160@example.com`
- Objectif: vérifier si les corrections post-r7 ont résolu product help rappel, libellé de rappel, contrainte `une seule proposition`, défense card et émotion courte.
- Trajectoire: appui minimal, rappel ponctuel, product help rappel, carte de défense, préférence coach, carte d'attaque, émotion courte, récapitulatif.
- Surfaces visées: dispatcher, status-only, product help, `create_one_shot_reminder`, `prepare_defense_card`, `update_coach_preferences`, `prepare_attack_card`, emotional repair, effets durables.
- Cadre IA réel: Supabase local, endpoint local Sophia, `force_full_ai=true`, messages choisis tour par tour après lecture de la réponse précédente, aucun fallback déterministe.
- Validité QA: valide techniquement. 15 tours complets, 30 messages en DB, aucun HTTP error, aucune réponse vide.
- Cleanup: terminé après rapport. Vérification post-cleanup à 0 ligne restante sur les tables QA ciblées; user Auth temporaire supprimé.

## 2. Tours De Conversation

### Tour 1

**User**
> Je suis un peu saturé ce soir : un devis à relire, un message de Karim qui m'agace, et une note de frais à boucler. Pas de carte ni d'outil : donne-moi seulement un premier geste, sans question derrière.

**Sophia**
> Ok, fais un premier geste tout de suite, tout petit : ouvre le devis et mets juste un timer de 10 minutes en mode “je relis en survol, je corrige seulement les 3 points qui sautent”. Ensuite tu l’arrêtes même si ce n’est pas fini. Courage, t’es déjà en train de te remettre en mouvement 😅

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `attack_card_cancelled_to_conversation`
- safety: `low`
- opportunity: `none`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 2

**User**
> Ok, timer lancé. Mets-moi un rappel demain à 8h20 pour relire le devis client et vérifier les trois points qui sautent, avant de l'envoyer.

**Sophia**
> C'est programmé pour vendredi 29 mai à 08:20 : relire le devis client et vérifier les trois points qui sautent, avant de l'envoyer. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: `["create_one_shot_reminder"]`
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: rappel ponctuel créé pour `2026-05-29T06:20:00+00:00`

### Tour 3

**User**
> Si je veux modifier ou supprimer ce rappel ponctuel dans l'app, je vais où ? Ne change rien : je veux juste l'emplacement.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé à 08:20 (relire le devis client et vérifier les trois points qui sautent, avant de l'envoyer).
> - Préférences coach : oui, challenge équilibré, ton bienveillant ferme. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `status_recap_request_blocks_tool_start`
- safety: `low`
- skill_entry_ids: `["product_help"]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 4

**User**
> Le message de Karim me reste en tête : il me demande encore pourquoi la note de frais n'est pas bouclée, et je sens que je vais répondre sèchement.

**Sophia**
> C'est agaçant quand ça tourne en boucle comme ça, surtout quand on sent la tension monter.
>
> Je vois un risque récurrent pour "Gérer la réponse à Karim". Si tu veux, on peut préparer une Carte de defense pour ce moment précis, histoire de désamorcer le truc avant de répondre ? 🛡️

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `low`
- opportunity: `defense_card`
- opportunity_operation: `prepare_defense_card`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 5

**User**
> Oui, prépare une carte de défense pour ne pas répondre sèchement à Karim quand il relance sur la note de frais.

**Sophia**
> C'est noté. Qu'est-ce qui fait que tu as tendance à lui répondre sèchement à ce moment-là ? C'est l'agacement, le timing, ou autre chose ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_defense_card_intent_overrides_attack_card`
- safety: `low`
- tool_skill_intents: `["prepare_defense_card", "prepare_defense_card"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: attente slot

### Tour 6

**User**
> C'est l'agacement : j'ai l'impression qu'il me surveille. Mon geste : écrire d'abord 'je te confirme ça demain matin' dans un brouillon, puis relire avant d'envoyer.

**Sophia**
> Ok, l’agacement est clair: t’as l’impression d’être “surveillé”, donc ton cerveau part en mode défense, et tu réponds sec avant même d’avoir choisi tes mots. 😬
>
> Ton geste est béton et très action:
> 1) Tu écris en brouillon: “Je te confirme ça demain matin.”
> 2) Tu laisses décanter.
> 3) Tu relis avant envoi pour garder le ton posé.
>
> Pour que ça marche à fond: ajoute juste une micro-phrase “calmante” optionnelle à la fin du brouillon, du style “Je te reviens avec le détail après relecture.” (ça évite le côté “barrer la route”). ✅
>
> Tu veux que la version finale soit plutôt courte et neutre (1 phrase max) ou un peu plus “empathie” (2 phrases) ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_status_exact_priority`
- safety: `none`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 7

**User**
> Je veux rester sur la carte de défense, pas choisir une version de message. Fais-moi le brouillon de la carte avec ce geste.

**Sophia**
> Ça marche, on reste sur la défense. Peux-tu me préciser de quel geste tu parles ? Et pour que je puisse te proposer un brouillon, dis-moi : quel est le moment précis où tu sens que tu vas craquer, et qu'est-ce qui t'embarque d'habitude ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_defense_card_intent_overrides_attack_card`
- safety: `low`
- tool_skill_intents: `["prepare_defense_card", "prepare_defense_card"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 8

**User**
> Moment précis : quand Karim écrit 'tu l'as enfin bouclée ?' sur la note de frais. Piège : je me sens surveillé. Geste : écrire 'je te confirme ça demain matin' en brouillon et relire avant d'envoyer.

**Sophia**
> Ok, je garde la carte de défense sur ton geste (brouillon + relecture), au moment exact où il écrit “tu l’as enfin bouclée ?”. 😌
>
> Brouillon carte de défense (à copier-coller quand tu sens l’énervement monter) :
> “Je comprends ta relance. Je te confirme que je te la renvoie bien demain matin, après la dernière vérification. Merci.” ✅
>
> Option ultra-courte (si tu sens que tu vas répondre trop vite) :
> “Je te confirme ça demain matin, après vérification. ”

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `central_arbitrator_status_exact_priority`
- safety: `low`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 9

**User**
> Pour la suite, retiens une préférence : quand je dis une seule proposition, tu choisis toi-même et tu ne me donnes pas plusieurs options.

**Sophia**
> Bien reçu. Pour la suite, je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. Si c'est bien ça, je le garde comme préférence. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- safety: `low`
- tool_skill_intents: `["update_coach_preferences"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: attente confirmation

### Tour 10

**User**
> Oui, garde cette préférence exactement : une seule proposition, tu choisis.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te poserai moins de questions, plus courtes, surtout quand tu es bloqué. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- safety: `low`
- executed_tools: `["update_coach_preferences"]`
- tool_execution: `success`
- durable_effect: préférence enregistrée comme `coach.question_tendency = low`

### Tour 11

**User**
> Maintenant crée-moi une carte d'attaque pour boucler la note de frais sans me disperser. Une seule proposition : choisis la technique toi-même.

**Sophia**
> Je n'ai pas réussi à préparer cette carte techniquement. Je préfère m'arrêter plutôt que deviner à ta place. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- executed_tools: `["prepare_attack_card"]`
- tool_execution: `failed`
- durable_effect: aucun

### Tour 12

**User**
> Réessaie plus cadré : carte d'attaque pour boucler la note de frais. Action concrète : ouvrir l'outil, ajouter un seul reçu, puis fermer. Technique : ancre visuelle.

**Sophia**
> Titre : Note de frais : Le premier reçu
> Technique : Ancre visuelle
> "Un reçu posé = Un reçu traité. J'ouvre, je poste, je ferme."
> Pose ton reçu sur ton clavier, et dès que tu le touches, fais l'action sans réfléchir.
> Je t'ai préparé ce brouillon, ça te convient ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- tool_skill_intents: `["prepare_attack_card"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: brouillon seulement

### Tour 13

**User**
> Oui, valide cette carte d'attaque.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Note de frais : Le premier reçu
> Technique : Ancre visuelle
> Un reçu posé = Un reçu traité. J'ouvre, je poste, je ferme.
>
> Mode d'emploi : Pose ton reçu sur ton clavier, et dès que tu le touches, fais l'action sans réfléchir.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- executed_tools: `["prepare_attack_card"]`
- tool_execution: `success`
- durable_effect: 1 carte d'attaque créée

### Tour 14

**User**
> Là je sens la boule au ventre parce que j'ai peur que Karim pense que je traîne. Pas de nouvelle carte : une seule phrase pour me calmer, sans question.

**Sophia**
> Respire, son impatience lui appartient et ton sérieux ne dépend pas de sa montre. 🧘‍♂️

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `attack_card_cancelled_to_conversation`
- safety: `low`
- skill_entry_ids: `["emotional_repair"]`
- opportunity: `none`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 15

**User**
> Avant de fermer, résume uniquement ce qui a vraiment été créé ou retenu, et ce qui était juste de la conversation.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Note de frais : Le premier reçu).
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé à 08:20 (relire le devis client et vérifier les trois points qui sautent, avant de l'envoyer).
> - Préférences coach : oui, moins de questions, challenge équilibré. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `status_recap_request_blocks_tool_start`
- safety: `low`
- executed_tools: `[]`
- durable_effect: aucun nouveau side effect

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 1: la demande minimale est respectée: une seule action, pas de carte, pas de question.
- Tour 2: le rappel est clair côté réponse visible et conserve le libellé complet.
- Tour 14: l'émotion courte est bien traitée: une phrase, pas de carte, pas de question.
- Tour 15: le récap est honnête: Sophia reconnaît qu'aucune carte de défense n'est en place.

**Problemes**
- Tour 3: product help rappel échoue encore. L'utilisateur demande un emplacement, Sophia répond par un statut global. Impact: l'aide produit demandée n'est pas fournie. Sévérité: yellow.
- Tours 6-8: le flow de carte de défense se perd. Sophia transforme la carte en brouillon de message, demande plusieurs fois des infos déjà données, puis ne demande jamais validation. Impact: l'utilisateur doit recadrer Sophia, et la carte demandée n'est jamais créée. Sévérité: red.
- Tour 9-10: la préférence est mal reformulée. Le user demande `une seule proposition, tu choisis`; Sophia enregistre surtout `moins de questions`. Impact: la mémoire durable ne reflète pas précisément la préférence. Sévérité: yellow/red.
- Tour 11: carte d'attaque demandée clairement, mais Sophia dit qu'elle n'a pas réussi techniquement. Impact: échec visible du produit sur une demande explicite. Sévérité: red.
- Wording persistant: `Carte de defense`, `preparer`, `repere visuel`, accents manquants. Impact: finition produit. Sévérité: green/yellow.

**Fix propose**
- Corriger prioritairement `prepare_defense_card` actif: après collecte des slots, produire un vrai brouillon structuré et demander validation, jamais une simple réponse conversationnelle.
- Corriger la normalisation de préférence pour conserver `single_proposal_user_pref`, pas seulement `question_tendency=low`.
- Faire remonter les erreurs internes de `prepare_attack_card` en diagnostic exploitable et empêcher le message user-facing vague `je n'ai pas réussi techniquement`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1: bon routage `attack_card_cancelled_to_conversation`.
- Tour 3: mauvais arbitrage. `product_help` est détecté mais `status_recap_request_blocks_tool_start` prend le dessus.
- Tour 5: `prepare_defense_card` démarre correctement.
- Tour 6: le flow défense est perdu au profit de `normal_reply` avec `central_arbitrator_status_exact_priority`, alors que l'utilisateur vient de donner le slot demandé.
- Tour 8: Sophia parle de carte de défense mais reste en `normal_reply`; aucun pending confirmation ni tool execution.
- Tour 11: `prepare_attack_card` exécute puis échoue (`tool_execution=failed`) sur une demande claire.
- Tour 15: status-only fonctionne et confirme l'absence de carte défense.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: OK. Rappel créé pour `2026-05-29T06:20:00+00:00` avec instruction complète.
- `product_help`: KO sur modification/suppression de rappel.
- `prepare_defense_card`: KO. Démarre, collecte partiellement, puis ne produit ni brouillon structuré final ni effet durable.
- `update_coach_preferences`: partiellement OK techniquement, mais sémantique trop approximative. DB enregistre `coach.question_tendency = low`; la préférence exacte `une seule proposition, tu choisis` n'est pas représentée explicitement.
- `prepare_attack_card`: KO au premier essai avec `tool_execution=failed`, puis OK au retry plus cadré. 1 carte créée au final.

**Memory / Effets durables**
- DB vérifiée après run: 30 `chat_messages`, 1 `scheduled_checkins`, 1 carte d'attaque, 0 carte de défense, 9 `user_profile_facts`.
- Effet attendu manquant: 1 carte de défense demandée explicitement aux tours 5-8.
- Effet durable correct: rappel complet et carte d'attaque finale.
- `memory_items` et `user_topic_memories`: 0, non bloquant ici.

**Problemes**
- Tours 6-8: rupture de contrat du tool skill défense. Impact système: intention explicite non exécutée et trace/réponse incohérentes. Sévérité: red.
- Tour 11: échec tool visible en réponse 200. Impact système: un run strict ne peut pas être vert avec `tool_execution=failed` sur demande explicite. Sévérité: red.
- Tour 3: product help toujours masqué par status-only. Impact système: correction attendue non effective. Sévérité: yellow.
- Tour 10: préférence durable trop générique. Impact système: future exécution ne peut pas garantir `une seule proposition`. Sévérité: yellow.

**Fix propose**
- Ajouter un test de non-régression `prepare_defense_card`: slot fourni après question -> brouillon structuré -> validation -> DB row.
- Dans le central arbitrator, exclure les demandes product help `où modifier/supprimer` du chemin status-only.
- Étendre `update_coach_preferences` pour stocker une clé dédiée type `coach.proposal_count = one_auto_choose`.
- Corriger `prepare_attack_card` pour que les erreurs internes soient bloquantes côté test et documentées en trace, mais sans réponse vague au user.

## Verdict Global

- Verdict: red
- Raison principale: la carte de défense explicitement demandée n'est jamais créée, et `prepare_attack_card` échoue au premier essai sur une demande claire.
- Follow-up prioritaire: réparer `prepare_defense_card` actif après slot collection, puis corriger product help rappel vs status-only.
