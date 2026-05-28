# Global Run A3 - Normal Conversation 15T N3 Strict R7

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A3_20260528_strict_r7`
- Persona: `qa-normal-global_run_A3_20260528_strict_r7-1779992310545@example.com`
- Objectif: vérifier si les corrections post-r6 ont résolu les problèmes restants sur product help, concision et carte d'attaque.
- Trajectoire: demande minimale sans carte, rappel ponctuel, product help rappel, tension Teams, carte de défense, préférence de concision, carte d'attaque, soutien émotionnel court, récapitulatif.
- Surfaces visées: dispatcher, status-only, product help, `create_one_shot_reminder`, `prepare_defense_card`, `update_coach_preferences`, `prepare_attack_card`, support émotionnel, effets durables.
- Cadre IA réel: Supabase local, endpoint local Sophia, `force_full_ai=true`, messages choisis tour par tour après lecture de la réponse précédente, aucun fallback déterministe.
- Validité QA: valide. 15 tours complets, 30 messages en DB, aucun HTTP error, aucune réponse vide.
- Cleanup: terminé après rapport. Vérification post-cleanup à 0 ligne restante sur les tables QA ciblées; user Auth temporaire supprimé.

## 2. Tours De Conversation

### Tour 1

**User**
> Je termine ma journée un peu dispersé : un mail client à finir, un message Teams de Sarah qui me tend, et une facture à vérifier. Pas de carte, pas d'outil : donne-moi juste un seul geste maintenant.

**Sophia**
> Ok. Là maintenant : ouvre le mail client, fais juste “objet + 2 lignes” (réponse d’intention), puis stop. Un mini-démarrage suffit pour te remettre droit. 🎯
>
> Tu le fais sur quel outil : mail ou Teams ? 😊

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
> J'ai ouvert le mail et écrit deux lignes. Mets-moi un rappel demain à 9h05 pour relire ce mail client avant de l'envoyer.

**Sophia**
> C'est programmé pour vendredi 29 mai à 09:05 : l'envoyer. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `none`
- direct_effects: `["create_one_shot_reminder"]`
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: 1 rappel ponctuel créé pour `2026-05-29T07:05:00+00:00`

### Tour 3

**User**
> Si je veux modifier ou supprimer ce rappel dans l'app, je vais où ? Ne change rien, je veux juste l'emplacement.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé à 09:05 (l'envoyer).
> - Préférences coach : oui, challenge équilibré, ton bienveillant ferme. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `status_only_request_blocks_tool_start`
- safety: `none`
- skill_entry_ids: `["product_help"]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 4

**User**
> Ok. Le message Teams de Sarah me pique plus que prévu : elle me demande pourquoi la facture n'est pas encore vérifiée, et j'ai envie de répondre trop sec.

**Sophia**
> Je sens que la tension monte d'un coup. C'est normal d'avoir envie de mordre quand on se sent piqué ou mis sous pression, mais ce n'est pas toi, c'est juste l'agacement qui parle là.
>
> Prends une grande inspiration, on ne va pas la laisser gagner sur ton humeur. Si tu veux, on peut préparer une Carte de défense pour ce moment précis, histoire de désamorcer ta réponse avant que tu ne l'envoies. 😌

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- opportunity: `defense_card`
- opportunity_operation: `prepare_defense_card`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 5

**User**
> Oui, prépare une carte de défense pour ce moment : ne pas répondre sèchement à Sarah sur Teams.

**Sophia**
> C'est noté. Qu'est-ce qui se passe exactement au moment où tu sens que tu vas répondre sèchement ? C'est le contenu de ses messages qui t'agace ou c'est plutôt quand tu es sous pression ? 🙂

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

### Tour 6

**User**
> C'est surtout quand je lis son 'pourquoi ce n'est pas fait ?'. Je me sens accusé, alors que j'avais déjà prévu de le faire après le mail client.

**Sophia**
> Je comprends, se sentir accusé à tort c'est le déclencheur parfait pour s'énerver. Pour ta carte, qu'est-ce que tu aimerais te dire ou faire à ce moment précis pour ne pas répondre sèchement ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_inline_resume_active_tool_skill`
- safety: `none`
- skill_entry_ids: `["product_help"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 7

**User**
> Je veux me dire : 'je réponds au fait, pas au ton'. Et mon geste serait de fermer Teams deux minutes avant de rédiger.

**Sophia**
> Voici ta carte de défense :
> Le moment : Sur Teams, quand Sarah relance sur un retard.
> Le piège : Je lis « pourquoi ce n’est pas fait ? » et je me sens accusé.
> Mon geste : Je réponds au fait, pas au ton. Je ferme Teams 2 minutes avant de rédiger.
> Plan B : Je note 2 idées en brouillon puis je réponds après la pause.
> On valide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_tool_skill_continue`
- safety: `low`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: brouillon seulement

### Tour 8

**User**
> Oui, valide cette carte de défense.

**Sophia**
> C'est fait. J'ai créé la carte de défense "Répondre au message de Sarah" : Je réponds au fait, pas au ton. Je ferme Teams 2 minutes avant de rédiger.
>
> Tu peux la retrouver dans Ressources > Cartes de defense pour la relire, l'utiliser et l'ajuster depuis la plateforme quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, je peux aussi en preparer une nouvelle version apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_defense_card_intent_overrides_attack_card`
- safety: `none`
- executed_tools: `["prepare_defense_card"]`
- tool_execution: `success`
- durable_effect: 1 carte de défense créée

### Tour 9

**User**
> Pour la suite, retiens une préférence : quand je demande juste un emplacement ou une phrase, réponds seulement à ça, sans question de suivi.

**Sophia**
> Bien reçu. Pour la suite, quand tu demandes court, je ne finirai pas par une question inutile. Si c'est bien ça, je le garde comme préférence. 🙂

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
> Oui, garde cette préférence.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : quand tu demandes court, je ne finirai pas par une question inutile. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- safety: `low`
- executed_tools: `["update_coach_preferences"]`
- tool_execution: `success`
- durable_effect: préférence `coach.final_question_policy = avoid_unnecessary` enregistrée

### Tour 11

**User**
> Crée-moi une carte d'attaque pour vérifier la facture sans me disperser. Je veux une seule proposition, pas trois options.

**Sophia**
> Pour ce blocage de demarrage, je te propose deux options: 'Le texte magique' pour recadrer le perfectionnisme, ou 'Ancre visuelle' pour avoir un signal concret de depart. Laquelle te semble la plus utile ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `low`
- tool_skill_intents: `["prepare_attack_card"]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

### Tour 12

**User**
> Choisis Ancre visuelle, et fais-la concrète : ouvrir la facture, cocher uniquement 'montant vérifié', puis fermer le fichier.

**Sophia**
> Voici ton ancre pour "Vérifier la facture" :
> Technique : Ancre visuelle
> "Ouvrir la facture, cocher 'montant vérifié', fermer le fichier."
> Place cette phrase sur un post-it comme signal de départ.
> Est-ce que je valide ce brouillon ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `low`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: brouillon seulement

### Tour 13

**User**
> Oui, valide cette carte d'attaque.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Ancre : Vérifier la facture
> Technique : Ancre visuelle
> Ouvrir la facture, cocher 'montant vérifié', fermer le fichier.
>
> Mode d'emploi : Place l'ancre dans ton environnement et utilise-la comme signal de départ.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `low`
- executed_tools: `["prepare_attack_card"]`
- tool_execution: `success`
- durable_effect: 1 carte d'attaque créée

### Tour 14

**User**
> Là je sens une petite boule au ventre parce que j'ai peur que Sarah pense que je traîne. Pas de nouvelle carte : une seule phrase pour me calmer, sans question après.

**Sophia**
> Respire un grand coup : tu n'es pas responsable de ce qu'elle imagine, seulement de la qualité de ton travail. 🧘‍

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `attack_card_cancelled_to_conversation`
- safety: `low`
- opportunity: `none`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 15

**User**
> Avant de fermer, résume uniquement ce qui a été créé ou retenu, et ce qui était juste de la conversation.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Ancre : Vérifier la facture).
> - Carte de défense : oui, elle est en place (carte de défense).
> - Rappels ponctuels : oui, il est programmé à 09:05 (l'envoyer).
> - Préférences coach : oui, pas de question finale inutile, challenge équilibré. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `status_only_request_blocks_tool_start`
- safety: `low`
- executed_tools: `[]`
- durable_effect: aucun nouveau side effect

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1: pas d'upsell carte et pas d'outil malgré une situation d'action confuse.
- Tours 5-8: la carte de défense est bien collectée, validée et formulée autour du risque réel.
- Tours 9-10: la préférence de concision est comprise et enregistrée après confirmation.
- Tour 14: la contrainte émotionnelle critique est respectée: une seule phrase, pas de carte, pas de question.
- Tour 15: le récapitulatif est clair et ne déclenche aucun nouvel outil.

**Problemes**
- Tour 1: Sophia donne le geste demandé mais ajoute une question de suivi malgré `juste un seul geste`. Impact: la correction de concision n'est pas complète. Sévérité: yellow.
- Tour 2: le rappel est créé à la bonne heure, mais le libellé visible et durable devient seulement `l'envoyer`, alors que la demande était `relire ce mail client avant de l'envoyer`. Impact: rappel moins clair pour l'utilisateur. Sévérité: yellow.
- Tour 3: la demande `où modifier/supprimer ce rappel` reçoit un statut global, pas une aide produit. Impact: correction product help rappel non effective. Sévérité: yellow.
- Tour 11: l'utilisateur demande `une seule proposition`, Sophia propose deux options. Impact: correction `prepare_attack_card` non effective sur cette variante. Sévérité: yellow.
- Wording persistant: `Carte de defense`, `preparer`, `demarrage`, `depart` sans accents. Impact: finition produit. Sévérité: green/yellow.

**Fix propose**
- Faire primer les contraintes de forme (`juste`, `une seule proposition`, `sans question`) sur les templates de relance.
- Corriger le parse du rappel pour conserver l'objet complet de la demande, pas seulement le dernier verbe.
- Router les demandes `où modifier/supprimer ce rappel` vers product help même avec `ne change rien`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tour 1: `attack_card_cancelled_to_conversation` et `opportunity=none` sont corrects.
- Tour 3: product help est détecté dans `skill_entry_ids`, mais `status_only_request_blocks_tool_start` prend le dessus. C'est le principal échec système restant.
- Tours 5-8: `prepare_defense_card` fonctionne, même si le tour 6 porte une trace incohérente `response_owner=product_help` pendant un flow de défense.
- Tours 9-10: `update_coach_preferences` est prioritaire et exécute correctement.
- Tours 11-13: `prepare_attack_card` crée correctement la carte après confirmation, mais ne respecte pas la contrainte `une seule proposition`.
- Tour 15: status-only bloque bien les side effects.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: effet durable créé à la bonne date (`2026-05-29T07:05:00+00:00`), mais `event_context` et `reminder_instruction` sont trop réduits (`l_envoyer` / `l'envoyer`).
- `prepare_defense_card`: OK côté effet durable. 1 carte active, `Répondre au message de Sarah`.
- `update_coach_preferences`: OK. 1 préférence explicite `coach.final_question_policy = avoid_unnecessary`.
- `prepare_attack_card`: OK côté création finale. KO côté respect de contrainte de choix unique.
- `product_help`: KO sur rappel. Le signal existe mais la réponse finale n'est pas product help.

**Memory / Effets durables**
- DB vérifiée après run: 30 `chat_messages`, 1 `scheduled_checkins`, 1 carte de défense, 1 carte d'attaque, 10 `user_profile_facts`.
- Aucun effet durable inattendu sur les tours de product help, émotion ou récapitulatif.
- `memory_items` et `user_topic_memories`: 0. Non bloquant pour ce run; la mémoire testée est la préférence coach.

**Problemes**
- Tour 3: mauvais arbitrage entre product help et status-only. Impact système: l'intention informationnelle est perdue. Sévérité: yellow.
- Tour 6: trace incohérente `product_help_inline_resume_active_tool_skill` alors que la réponse collecte un slot de défense. Impact système: observabilité/routage confus. Sévérité: yellow.
- Tour 11: le tool skill ignore une contrainte explicite de cardinalité. Impact système: non-respect d'une préférence et d'une consigne locale. Sévérité: yellow.
- Tour 2: extraction du contenu rappel trop agressive. Impact système: effet durable correct dans le temps, mais contenu durable incomplet. Sévérité: yellow.

**Fix propose**
- Dans l'arbitrage, classifier `où modifier/supprimer` comme product help prioritaire, pas status-only.
- Dans `prepare_attack_card`, imposer un invariant: si le user dit `une seule proposition`, ne jamais produire plus d'une technique en surface.
- Dans le parser de rappel, conserver un objet complet de rappel quand la phrase contient `pour relire X avant de Y`.
- Nettoyer la trace active tool skill pour éviter `response_owner=product_help` pendant une collecte de slot non produit.

## Verdict Global

- Verdict: yellow
- Raison principale: les corrections ont bien tenu sur l'émotion courte et les effets durables principaux, mais product help rappel, contrainte `une seule proposition`, et libellé du rappel ne sont pas encore corrigés.
- Follow-up prioritaire: corriger l'arbitrage product help vs status-only au tour 3, puis verrouiller `prepare_attack_card` sur une seule proposition quand la consigne locale ou la préférence le demande.
