# Global Normal Conversation 15T - N3 Strict R6

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global15_20260528_n3_strict_r6`
- Persona: user QA temporaire local `86017804-5068-46b0-b3fa-941580d610a1`, créé via Auth local.
- Objectif: simuler une conversation normale de 15 tours pour tester la coexistence dispatcher, mémoire, skills conversationnels, tool skills, rappels, product help, préférences coach, soutien émotionnel et récap durable.
- Trajectoire: journée éparpillée -> refus potion + piège Slack -> carte de défense -> rappel ponctuel -> aide produit rappel -> repère conversationnel -> préférence coach -> carte d'attaque -> réparation émotionnelle -> récap final.
- Surfaces visées: `execution_breakdown`, `select_state_potion` en recommandation refusée, `prepare_defense_card`, `create_one_shot_reminder`, `product_help`, repère conversationnel non durable, `update_coach_preferences`, `prepare_attack_card`, `emotional_repair`, status-only recap.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `SOPHIA_CLIENT_NOW_ISO=2026-05-28T10:00:00.000+02:00`, aucun fallback déterministe utilisé comme verdict.
- Validité QA: invalide strict. Le runner `state.json` contient 15 tours, mais la table `chat_messages` contient deux messages supplémentaires pendant le run (`Je prends Preparer le terrain...` puis échec technique de carte) absents du transcript capturé. Le rapport est donc exploitable pour debug, pas pour verdict green strict.

## 2. Tours De Conversation

### Tour 1

**User**
> Salut Sophia, je suis un peu éparpillé ce matin. J'ai de l'admin, deux messages à envoyer, et mon bureau est en vrac. Je veux juste retrouver un point d'appui sans transformer ça en grand plan.

**Sophia**
> Ah je vois le genre : tu veux du concret tout de suite, pas un gros truc. 😄
>
> Micro-pivot pour te remettre d’aplomb (10 minutes max) :
> 1) Bureau : enlève juste tout ce qui traîne, et fais 1 pile “à traiter” (rien d’autre).
> 2) Admin : choisis 1 priorité (la plus urgente ou la plus courte) et lance-la en premier.
> 3) Messages : règle-toi une limite de temps (ex: 7 minutes) puis envoie les 2, même imparfaits.
>
> Tu préfères qu’on parte sur l’admin d’abord ou sur les 2 messages d’abord ? 🙂
>
> Concrètement, je parle d'une Potion d'etat, à préparer seulement si tu confirmes.

**Trace courte**
- http_status: 200
- response_owner: null
- selected_handler: null
- route_reason: null
- executed_tools: []
- durable_effect: none
- note: trace courte absente malgré `include_trace=true`.

### Tour 2

**User**
> Pas de potion pour le moment. Je vais faire la pile temporaire. Ensuite le piège c'est que j'ouvre Slack pour envoyer un message à Nora et je pars lire dix conversations.

**Sophia**
> Ok, je ne lance pas de potion.
>
> Pour le piège messagerie : ouvre la recherche, tape la personne, envoie le message, puis quitte l'app avant de lire les autres fils. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_flow_defers_tool_skill_opportunity`
- opportunity: `prepare_defense_card`
- executed_tools: []
- durable_effect: none

### Tour 3

**User**
> Ok, alors prépare-moi une carte de défense pour ce moment Slack: j'ouvre pour envoyer un message à Nora, et le piège c'est que je lis les autres conversations.

**Sophia**
> Voici ta carte de défense :
> Le moment : Ouverture de Slack pour Nora
> Le piège : Je vois les pastilles rouges ou les autres noms
> Mon geste : Je tape Nora dans la barre de recherche sans regarder le reste
> Plan B : Je ferme Slack et je reviens plus tard
> On valide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: null
- selected_handler: null
- executed_tools: []
- tool_execution: `blocked`
- durable_effect: draft pending

### Tour 4

**User**
> Change le geste: taper Nora dans la recherche, envoyer le message, puis quitter Slack. Plan B: si je vois un autre fil, je ferme l'app immédiatement.

**Sophia**
> Voici ta carte de défense :
> Le moment : Ouverture de Slack pour Nora
> Le piège : Lire les autres conversations
> Mon geste : Taper Nora dans la recherche, envoyer le message, puis quitter Slack
> Plan B : Si je vois un autre fil, je ferme l'app immédiatement
> On valide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- tool_skill_intents: [`adjust_plan_item`]
- tool_execution: `blocked`
- issue: réponse visible correcte, mais trace route `adjust_plan_item` au lieu de `prepare_defense_card`.

### Tour 5

**User**
> Oui, valide cette version.

**Sophia**
> C'est fait. J'ai créé la carte de défense "Moment Slack" : Taper Nora dans la recherche, envoyer le message, puis quitter Slack
>
> Tu peux la retrouver dans Ressources > Cartes de defense pour la relire, l'utiliser et l'ajuster depuis la plateforme quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, je peux aussi en preparer une nouvelle version apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: null
- selected_handler: null
- executed_tools: [`prepare_defense_card`]
- tool_execution: `success`
- durable_effect: `user_defense_cards` active, title `Moment Slack`.

### Tour 6

**User**
> Ok, message Nora envoyé. Demain matin à 9h10, rappelle-moi de vérifier si elle a répondu avant ma réunion.

**Sophia**
> C'est programmé pour vendredi 29 mai à 09:10 : vérifier si Nora a répondu avant ma réunion. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `active_skill_exit_requested`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: `scheduled_checkins.status=pending`, `scheduled_for=2026-05-29T07:10:00+00:00`.

### Tour 7

**User**
> Et si je veux modifier ce rappel demain matin, je peux te le demander ici ou je dois aller dans l'app ?

**Sophia**
> Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.
>
> Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement, par exemple : "change le rappel de demain à 09:00" ou "annule le rappel de demain". 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- skill_entry_ids: [`product_help`]
- executed_tools: []
- durable_effect: none

### Tour 8

**User**
> Je ne parle plus du rappel: garde juste comme repère dans cette conversation que quand je dis éparpillé, ça veut dire choisir une seule zone, pas tout refaire.

**Sophia**
> Ok, c’est noté comme repère dans cette conversation 🙂 Quand tu dis “éparpillé”, ça veut dire: une seule zone à la fois, pas tout refaire.
>
> Tu veux que je te propose un mot-clé simple à dire à chaque fois (genre “1 zone”) ou tu préfères rester sur “éparpillé” tout court ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `product_help_exit_to_conversation`
- executed_tools: []
- durable_effect: none

### Tour 9

**User**
> Pour une vraie préférence de coaching: quand je suis éparpillé, pose-moi une seule question de tri à la fois, pas trois options.

**Sophia**
> Bien reçu. Pour la suite, je te poserai une seule question de tri à la fois, et je te proposerai une seule action concrète à la fois, quand tu es éparpillé ou brouillé. Si c'est bien ça, je le garde comme préférence. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `coach_preference_request_overrides_active_flow`
- tool_execution: `blocked`
- durable_effect: pending confirmation

### Tour 10

**User**
> Oui, garde exactement cette préférence.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je te poserai une seule question de tri à la fois, et je te proposerai une seule action concrète à la fois, quand tu es éparpillé ou brouillé. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- executed_tools: [`update_coach_preferences`]
- tool_execution: `success`
- durable_effect: `user_profile_facts.coach.question_tendency=low`, source `explicit_user`.

### Tour 11

**User**
> Maintenant je veux une carte d'attaque pour lancer mon admin: ouvrir le dossier factures, choisir une facture, et envoyer juste le premier mail.

**Sophia**
> C'est noté pour le lancement de ton admin. Pour t'aider à passer à l'action sans trop de résistance, quelle approche préfères-tu ?
>
> 1. **Preparer le terrain** : pour mettre en place ton environnement et faciliter le premier geste.
> 2. **Ancre visuelle** : pour avoir un rappel physique qui te sert de signal de départ.
> 3. **Le texte magique** : pour avoir un court texte à relire si tu sens que tu commences à négocier avec toi-même. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_execution: `blocked`
- issue: la préférence "une question / pas trois options" n'est pas appliquée dans ce flow.

### Tour 12

**User**
> Le texte magique. Mais garde ça simple: une seule phrase d'élan, pas trois options.

**Sophia**
> Lancer mon admin
> Technique : Le texte magique
> « Je traite une seule facture maintenant pour libérer mon esprit, le reste suivra sans effort. »
> Lis ce texte dès que tu hésites à ouvrir tes factures.
> On valide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- tool_execution: `blocked`
- durable_effect: draft pending

### Tour 13

**User**
> Oui, valide cette carte d'attaque.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Lancer mon admin
> Technique : Le texte magique
> Je traite une seule facture maintenant pour libérer mon esprit, le reste suivra sans effort.
>
> Mode d'emploi : Lis ce texte dès que tu hésites à ouvrir tes factures.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- executed_tools: [`prepare_attack_card`]
- tool_execution: `success`
- durable_effect: `user_attack_cards` active, title `Lancer mon admin`.

### Tour 14

**User**
> Là je viens de me figer devant le dossier factures et je me sens nul. Réponds court, juste de quoi repartir, sans outil.

**Sophia**
> C'est une réaction normale de ton cerveau face à une montagne, ça ne définit pas qui tu es. Respire un grand coup, on enlève l'étiquette "nul" tout de suite. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- executed_tools: []
- durable_effect: none

### Tour 15

**User**
> Avant que je coupe, fais-moi le récap: qu'est-ce qui a vraiment été créé ou gardé, et qu'est-ce qui était juste pour la conversation ?

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Lancer mon admin).
> - Carte de défense : oui, elle est en place (carte de défense).
> - Rappel de demain : oui, il est programmé (vérifier si Nora a répondu avant ma réunion).
> - Préférence : oui, elle est gardée (une action concrète à la fois). 🙂

**Trace courte**
- http_status: 200
- route_reason: `status_recap_request_blocks_tool_start`
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 2: le refus de potion ne coupe plus le contenu utile; Sophia répond au piège Slack.
- Tours 3-5: la carte de défense est compréhensible, révisable, puis créée.
- Tours 6-7: rappel ponctuel créé, puis aide produit factuelle.
- Tours 8-10: bonne distinction entre repère conversationnel et préférence durable.
- Tour 14: réponse émotionnelle courte, sans outil ni relance produit.
- Tour 15: récap final inclut maintenant carte d'attaque, carte de défense, rappel et préférence.

**Problemes**
- Validité stricte: deux messages supplémentaires existent en DB mais pas dans le state du runner. Impact: transcript incomplet, impossible de certifier un run strict green. Sévérité: red pour la validité QA.
- Tour 1: la réponse propose une potion en appendice maladroit après une question de choix. Impact: friction produit et phrase artificielle. Sévérité: yellow.
- Tour 11: après une préférence "une seule question / pas trois options", le flow carte d'attaque redonne trois options. Impact: Sophia ne respecte pas immédiatement une préférence fraîchement créée. Sévérité: yellow.

**Fix propose**
- Verrouiller le runner: un seul processus par `run_id`, détection/abort si un message existe en DB mais pas dans `state.json`.
- Faire appliquer `coach.question_tendency=low` dans les tool skills qui affichent des choix (`prepare_attack_card` notamment).
- Nettoyer l'appendice visible de recommandation potion au tour 1.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Les routes visibles principales sont globalement bonnes: `execution_breakdown`, `prepare_defense_card`, `create_one_shot_reminder`, `product_help`, `update_coach_preferences`, `prepare_attack_card`, `emotional_repair`, status-only recap.
- Warning: plusieurs tours outil ont une trace courte partielle ou nulle dans le runner, malgré réponse HTTP 200.
- Tour 4: trace `adjust_plan_item` alors que le contenu et le pending exécuté ensuite relèvent de `prepare_defense_card`.

**Skills / Operations / Tools**
- `prepare_defense_card`: créé correctement en DB.
- `create_one_shot_reminder`: créé correctement en DB pour 2026-05-29 09:10 Europe/Paris.
- `update_coach_preferences`: corrigé et exécuté correctement; préférence `coach.question_tendency=low` persistée avec le bon reason.
- `prepare_attack_card`: créé correctement en DB, mais l'étape de choix ne respecte pas encore la préférence low-question.
- Status-only recap: fonctionne, sans mutation.

**Memory / Effets durables**
- `user_defense_cards`: 1 carte active `Moment Slack`.
- `scheduled_checkins`: 1 rappel pending `verifier_si_nora_a_repondu_avant_ma_reunion`.
- `user_profile_facts`: `coach.question_tendency=low`, source `explicit_user`.
- `user_attack_cards`: 1 carte active `Lancer mon admin`.
- `memory_items`: aucune écriture, correct pour le repère conversationnel.

**Problemes**
- Run invalidé: DB `chat_messages` contient un user/assistant additionnel absent du `state.json`. Impact système: l'artefact de run n'est pas une source de vérité complète. Sévérité: red.
- Trace observability: trace partielle/nulle sur des tours outil. Impact: audit QA moins fiable. Sévérité: yellow.
- Tour 11: préférence coach non injectée dans `prepare_attack_card`. Impact système: préférence durable pas consommée par un tool skill adjacent. Sévérité: yellow.

**Fix propose**
- Ajouter une garde runner post-tour: comparer `chat_messages` count et `state.turns`; si mismatch, marquer le run invalide immédiatement.
- Ajouter un test/guard d'observabilité pour exiger `conversation_turn_trace` sur tous les 200.
- Passer les préférences coach pertinentes dans le rendu des options de `prepare_attack_card`, ou réduire la liste à une recommandation prioritaire quand `question_tendency=low`.

## Verdict Global

- Verdict: red
- Raison principale: run strict invalide car transcript runner incomplet par rapport à la DB, malgré effets durables corrects.
- Follow-up prioritaire: corriger l'isolation du runner et la consommation de `coach.question_tendency=low` dans `prepare_attack_card`, puis relancer un run propre.
