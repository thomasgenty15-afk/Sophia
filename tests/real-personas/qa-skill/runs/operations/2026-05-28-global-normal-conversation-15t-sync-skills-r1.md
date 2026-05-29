# Global Normal Conversation 15T - Sync Skills R1

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global15_20260528_sync_skills_r1`
- Persona: user QA temporaire local `4686d4af-5917-4df5-8bf4-9f98e5ca9a1a`, email `qa-normal-global15_20260528_sync_skills_r1-1779999436216@example.com`, créé via Auth local et supprimé après nettoyage ciblé.
- Objectif: tester la synchronicité entre skills conversationnels et tool skills dans une conversation normale de 15 tours.
- Trajectoire: journée brouillée -> micro-action mails -> carte d'attaque -> rappel ponctuel -> aide produit rappel -> mémoire conversationnelle courte -> préférence coach -> réparation émotionnelle -> retour action -> récap.
- Surfaces visées: `execution_breakdown`, `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, mémoire conversationnelle courte, `update_coach_preferences`, `emotional_repair`, opportunité tool non exécutée.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, `SOPHIA_CLIENT_NOW_ISO=2026-05-28T10:00:00.000+02:00`, aucun fallback déterministe.
- Validité QA: valide. Les 15 messages ont été choisis tour par tour après lecture de la réponse et de la trace courte précédente. Incident pré-run: premier `init` bloqué par sandbox réseau local (`EPERM 127.0.0.1:54321`), relancé avec autorisation; aucun tour conversationnel n'avait commencé.

Nettoyage: ciblé par `user_id` temporaire après vérification DB. Toutes les tables vérifiées retournent `*/0`; `auth.users` retourne `404` après suppression. `user_memories` a retourné `404` au nettoyage car la table n'existe pas dans ce schéma local.

## 2. Tours De Conversation

### Tour 1

**User**
> J'arrive au bureau et j'ai la tête en vrac. J'ai trois débuts de choses ouverts, je scrolle mes mails, et je n'arrive même pas à choisir le premier geste.

**Sophia**
> On fait compact : choisis une seule zone visible et ouvre-la.
> Premier geste : écris juste le titre du mini-pas suivant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none visible
- executed_tools: none
- durable_effect: none
- note: opportunité `prepare_attack_card` signalée, non exécutée.

### Tour 2

**User**
> Ok, je prends les mails. Le mini-pas ce serait peut-être juste isoler les messages qui demandent une réponse aujourd'hui, mais j'ai déjà envie de tout ranger d'un coup.

**Sophia**
> Yes, ça se tient. 😄
>
> Mini-pas concret: créer 1 seul dossier/titre “À répondre aujourd’hui” et ne toucher qu’aux mails qui demandent une action avant la fin de journée.
> Tout le reste, tu le laisses de côté pour l’instant (même si ça gratte l’envie de tout ranger).
>
> Tu veux qu’on vise plutôt un tri “réponse requise” (mots/indices dans le mail) ou un tri “deadline” (si la date est mentionnée) ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_flow_defers_tool_skill_opportunity`
- safety: `low`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: none
- note: opportunité `prepare_attack_card` toujours différée.

### Tour 3

**User**
> Deadline, oui. Et fais-moi une carte d'attaque pour ne traiter que les mails qui ont une vraie échéance aujourd'hui, sinon je vais repartir en rangement total.

**Sophia**
> C'est entendu, on se focalise sur les mails avec une échéance aujourd'hui. Pour éviter que tu ne bascules dans le rangement, quelle approche te tente le plus ?
>
> 1. **Le texte magique** : un texte court à relire si tu sens que tu commences à négocier.
> 2. **Préparer le terrain** : pour isoler ces mails avant de commencer.
> 3. **Ancre visuelle** : un signal physique pour rester concentré. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `low`
- direct_effects: none
- operation: `prepare_attack_card`
- pending_confirmation: choix de technique
- executed_tools: none
- durable_effect: none

### Tour 4

**User**
> Prends préparer le terrain. Je veux surtout empêcher le dérapage 'je range toute la boîte' avant de répondre aux deux vrais urgents.

**Sophia**
> Voici ta carte Focus Urgences (Préparer le terrain) :
> Ouvre uniquement les deux onglets des mails urgents, puis ferme le reste.
> Prépare ce setup avant de commencer pour ne pas te laisser happer par le reste.
> Est-ce que je valide ce brouillon pour toi ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `none`
- direct_effects: none
- operation: `prepare_attack_card`
- pending_confirmation: validation du brouillon
- executed_tools: none
- durable_effect: none

### Tour 5

**User**
> Oui, valide-la comme ça.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Focus Urgences
> Technique : Préparer le terrain
> Ouvre uniquement les deux onglets des mails urgents, puis ferme le reste.
>
> Mode d'emploi : Prépare ce setup minimaliste avant de commencer pour ne pas te laisser happer par le reste.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_conversation_skill_continue`
- safety: `none`
- direct_effects: none
- operation: `prepare_attack_card`
- pending_confirmation: none
- executed_tools: `prepare_attack_card`
- durable_effect: 1 ligne `user_attack_cards` active.

**Effet DB observé**
- `user_attack_cards.id=2d7736fc-8bb6-445b-bfe4-6ba9a6b8be57`
- `status=active`, `scope_kind=out_of_plan`
- titre: `Focus Urgences`
- technique: `preparer_terrain`
- request_id: `global15_20260528_sync_skills_r1-t05`

### Tour 6

**User**
> Mets-moi un rappel à 10h45 aujourd'hui : revenir aux deux mails urgents si je suis repartie dans autre chose.

**Sophia**
> C'est programmé pour jeudi 28 mai à 10:45 : Revenir aux deux mails urgents. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: none
- route_reason: `central_arbitrator_one_shot_reminder_priority`
- safety: `low`
- direct_effects: `create_one_shot_reminder`
- operation: `create_one_shot_reminder`
- pending_confirmation: none
- executed_tools: `create_one_shot_reminder`
- durable_effect: 1 ligne `scheduled_checkins` pending.
- note: `skill_entry_ids` contient `product_help`, bruit de trace probable, sans mauvais side effect.

**Effet DB observé**
- `scheduled_checkins.id=c529cb0f-e6ac-4ffa-a96c-3bfecf1b0c0f`
- `status=pending`
- `scheduled_for=2026-05-28T08:45:00+00:00`
- timezone payload: `Europe/Paris`
- instruction: `Revenir aux deux mails urgents`

### Tour 7

**User**
> Et je le retrouve où ce rappel dans l'app ? Je veux juste comprendre, pas en créer un autre.

**Sophia**
> Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.
>
> Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement, par exemple: "change le rappel de demain à 9h" ou "annule le rappel de demain". 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- safety: `low`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: none

### Tour 8

**User**
> Avant que j'oublie : dans notre échange, c'était quoi le garde-fou principal pour mes mails ?

**Sophia**
> Le garde-fou principal, c’était : ne traiter que les mails avec une vraie échéance aujourd’hui, et empêcher le “rangement total” en ne gardant ouverts que les deux mails urgents (le reste est fermé). 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: none
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: none
- note: mémoire conversationnelle courte correcte.

### Tour 9

**User**
> Pour la suite, garde une préférence coach : quand je suis dispersée, réponds plus sec et sans petite blague, avec une seule consigne à la fois.

**Sophia**
> Tu préfères que je change mon ton pour être plus directe ou que je me limite à une seule consigne à la fois ? Dis-moi par quoi tu veux commencer. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- safety: `low`
- direct_effects: none
- operation: `update_coach_preferences`
- pending_confirmation: choix de préférence à traiter
- executed_tools: none
- durable_effect: none
- note: `skill_entry_ids` contient `product_help`, bruit de trace probable.

### Tour 10

**User**
> Commence par le ton plus direct. Le côté une seule consigne, on verra après.

**Sophia**
> Bien reçu. Pour la suite, je serai plus directe, sans perdre le côté soutenant. Si c'est bien ça, je le garde comme préférence. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_tool_skill_continue`
- safety: `low`
- direct_effects: none
- operation: `update_coach_preferences`
- pending_confirmation: validation de la préférence
- executed_tools: none
- durable_effect: none

### Tour 11

**User**
> Oui, garde cette préférence.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : je serai plus directe, sans perdre le côté soutenant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- safety: `low`
- direct_effects: none
- operation: `update_coach_preferences`
- pending_confirmation: none
- executed_tools: `update_coach_preferences`
- durable_effect: `coach.tone=direct`

**Effet DB observé**
- `user_profile_facts.key=coach.tone`
- value: `{ "value": "direct", "label": "Très direct" }`
- `source_type=explicit_user`
- `last_confirmed_at=2026-05-28T20:20:52.762+00:00`

### Tour 12

**User**
> Je viens de voir que j'ai quand même perdu vingt minutes. Ça me met une honte absurde, comme si j'étais incapable de tenir un truc simple.

**Sophia**
> Ah merde… vingt minutes c’est pas agréable du tout, mais la honte que tu t’ifies là, elle est clairement trop grosse pour la situation. 😕  
> Ce que tu as “perdu”, c’est juste du temps. Ça ne dit rien sur ta capacité à être une personne fiable.
>
> Là, pour couper net l’auto-attaque : respire une fois, et dis-toi une phrase courte et factuelle, genre “J’ai perdu 20 minutes, ok. Je reprends maintenant.”  
> Tu veux que tu reprennes tout de suite sur le même point, ou que tu fasses un mini-choix “le plus urgent d’abord” (oui/non) ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: none

### Tour 13

**User**
> Ok, je respire. J'aimerais retrouver un état plus clair, mais ne lance rien de spécial : ramène-moi juste au premier mail urgent.

**Sophia**
> Ok, tu respires, c’est déjà beaucoup. 😮‍💨
> Ramène-toi au premier mail urgent maintenant : ouvre-le, lis juste la ligne d’objet + la demande, puis tu fais uniquement la prochaine micro-action dessus (répondre / copier la question / écrire 2 phrases).

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: none
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- safety: `low`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: none

### Tour 14

**User**
> J'ai ouvert le premier mail. Il faut juste proposer une date, mais je sens encore le flou remonter ; un peu de clarté m'aiderait à ne pas refaire dix détours.

**Sophia**
> Yes, t’as déjà fait la partie la plus difficile. 😄🧠
>
> Pour “proposer une date” sans flou, on vise une seule phrase prête à coller :
> “Seriez-vous disponible le [jour] à [heure] (ou, à défaut, le [autre jour] à [autre heure]) ?”
>
> Maintenant, choisis l’option la plus simple pour toi : tu veux proposer une date pour aujourd’hui demain, ou plutôt dans la semaine ?
>
> Concrètement, je parle d'une Carte d'attaque pour "Proposer une date pour le premier mail", à préparer seulement si tu confirmes.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: none
- note: opportunité `prepare_attack_card` proposée, pas `select_state_potion`.

### Tour 15

**User**
> Pas de carte en plus. Termine-moi avec un récap très court : ce qu'on a décidé, ce qui a été créé, et le prochain geste maintenant.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Focus Urgences).
> - Carte de défense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programmé à 10:45 (Revenir aux deux mails urgents).
> - Préférences coach : oui, ton très direct. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: none
- route_reason: `status_only_request_blocks_tool_start`
- safety: `none`
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: none
- note: aucun nouvel outil lancé, mais le "prochain geste maintenant" demandé n'est pas inclus.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tours 1-2: l'entrée dans `execution_breakdown` est naturelle et utile; Sophia réduit la charge et clarifie la cible.
- Tours 3-5: le passage vers la carte d'attaque est compréhensible, avec choix de technique puis confirmation avant création.
- Tours 7-8: Sophia répond à l'aide produit puis retrouve correctement le garde-fou conversationnel.
- Tour 12: `emotional_repair` répond au vrai moment humain, nomme l'auto-attaque et propose une phrase de reprise.

**Problemes**
- Tour 7: l'aide produit est vague ("côté Initiatives, dans les rappels côté chat") et ne donne pas un chemin UI vraiment vérifiable. Impact: le user peut ne pas savoir où cliquer. Sévérité: yellow.
- Tours 11-15: après `coach.tone=direct`, les réponses gardent beaucoup d'emojis et de chaleur. Ce n'est pas bloquant car seule la préférence "ton direct" a été confirmée, mais la demande initiale contenait aussi "sans petite blague". Impact: impression que la préférence est partiellement comprise. Sévérité: yellow.
- Tour 14: la phrase "tu veux proposer une date pour aujourd’hui demain" est grammaticalement confuse. Impact: petite friction au moment d'exécution. Sévérité: yellow.
- Tour 15: le récap omet le "prochain geste maintenant" explicitement demandé. Impact: sortie moins actionnable. Sévérité: yellow.

**Fix propose**
- Rendre `product_help` plus précis pour les rappels ponctuels: chemin UI stable, limite si l'UI ne permet pas encore tout, et action possible via chat.
- Dans `update_coach_preferences`, mieux séparer les sous-intentions de style: ton direct, absence de blague/emoji, longueur, une seule consigne. Si une partie est différée, la rappeler explicitement.
- Ajouter un contrôle de qualité sur les formulations temporelles générées dans `execution_breakdown`.
- Pour les demandes de récap avec "prochain geste", forcer un dernier item actionnel distinct.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- `execution_breakdown` fonctionne aux tours 1, 2 et 14.
- `prepare_attack_card` supplante correctement le skill conversationnel au tour 3 (`explicit_tool_intent_supersedes_active_conversation_skill`) et continue au tour 4.
- `create_one_shot_reminder` est priorisé au tour 6 et produit le bon side effect.
- `product_help` prend la main au tour 7 sans side effect.
- `update_coach_preferences` prend la main aux tours 9-11 avec collecte, confirmation, puis exécution.
- `emotional_repair` prend la main au tour 12, sans effet durable.
- Les demandes de non-exécution sont respectées aux tours 13 et 15.

**Skills / Operations / Tools**
- `prepare_attack_card`: pass. Une seule carte créée après confirmation. DB alignée avec la cible et la technique.
- `create_one_shot_reminder`: pass. Un seul rappel `pending`, heure locale correctement convertie en `2026-05-28T08:45:00+00:00`.
- `product_help`: pass côté routage, yellow côté contenu.
- `update_coach_preferences`: pass côté side effect, yellow côté compréhension partielle de la préférence initiale.
- `emotional_repair`: pass. Aucun tool lancé pendant le moment émotionnel.
- `select_state_potion`: non couvert comme opportunité. Tour 13 bloque explicitement tout outil; tour 14 aurait pu signaler une opportunité `select_state_potion` sur "clarté", mais le système a préféré `execution_breakdown` + opportunité `prepare_attack_card`.

**Memory / Effets durables**
- Mémoire conversationnelle courte: pass au tour 8.
- Mémoire durable: aucune ligne `memory_items` ou `user_topic_memories`, ce qui est acceptable pour ce run court sans demande de mémorisation durable.
- Effets durables vérifiés avant nettoyage:
  - `user_attack_cards`: 1 ligne active.
  - `scheduled_checkins`: 1 ligne pending.
  - `user_profile_facts`: `coach.tone=direct`.
  - `user_defense_cards`, `user_potion_sessions`, `user_recurring_reminders`: 0 ligne.

**Problemes**
- Tour 5: la trace affiche `response_owner=conversation_handler` / `selected_handler=execution_breakdown` alors que `executed_tools=["prepare_attack_card"]`. Impact systeme: lecture QA moins nette sur le propriétaire du tour d'exécution. Sévérité: yellow.
- Tours 6 et 9: `skill_entry_ids=["product_help"]` apparaît sur des tours de rappel / préférence coach. Impact systeme: bruit de trace; pas de mauvais side effect observé. Sévérité: yellow.
- Tour 14: absence d'opportunité `select_state_potion` malgré le signal "clarté". Impact systeme: couverture de la surface visée non obtenue dans ce run. Sévérité: yellow.

**Fix propose**
- Clarifier la trace des tours où un tool skill exécute puis rend la main: exposer un `execution_owner` ou garder `response_owner=tool_skill` sur le tour de commit.
- Nettoyer les `skill_entry_ids` pour ne pas exposer des signaux non retenus comme si le skill avait été candidat utile.
- Ajuster le détecteur d'opportunité `select_state_potion` pour les formulations "retrouver de la clarté" quand le user n'a pas explicitement bloqué les outils.

## Verdict Global

- Verdict: yellow
- Raison principale: les side effects majeurs sont corrects et confirmés, mais plusieurs traces sont bruitées, `product_help` est vague, la préférence coach est partiellement reflétée, et `select_state_potion` n'a pas été observé comme opportunité.
- Follow-up prioritaire: corriger la trace owner/execution et améliorer le détecteur d'opportunité `select_state_potion` sur les demandes d'état mental clair non explicites.
