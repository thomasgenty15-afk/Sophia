# Global Run A10 - Normal Conversation 15T - N3 Strict R2

## 1. Contexte Du Test

- Date: 2026-05-28
- Run exploitable: `global_run_A10_20260528_n3_strict_r2`
- Incident pre-run: `global_run_A10_20260528_n3_strict_r1` a renvoye `502` avec reponse vide au premier tour, avant conversation exploitable. Ce pre-run a ete nettoye et n'est pas utilise pour le verdict conversationnel.
- Persona: user QA temporaire local `373f0690-0898-4b4f-acd4-eeb09617998c`, cree via Auth local (`qa-normal-global_run_A10_20260528_n3_strict_r2-1779999426371@example.com`).
- Objectif: relancer le test global apres corrections pour verifier si les regressions A9 sont corrigees, surtout le faux positif `update_coach_preferences` sur un repere conversationnel.
- Trajectoire: surcharge legere -> micro-action Hugo -> carte d'attaque -> rappel ponctuel -> aide produit -> preference coach -> memoire conversationnelle -> honte / soutien doux -> verification durable -> repere conversationnel -> recap final.
- Surfaces visees: `execution_breakdown`, `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, memoire conversationnelle, `update_coach_preferences`, `emotional_repair`, no-tool guards, `select_state_potion` en proposition non executee.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, `SOPHIA_CLIENT_NOW_ISO=2026-05-28T10:00:00.000+02:00`, aucun fallback deterministe.
- Validite QA: valide pour `r2`. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse Sophia et de la trace courte precedente. Aucun message fixe pre-scripted n'a ete rejoue. Aucun code n'a ete modifie pendant le run. Nettoyage cible effectue et verifie apres le run.

## 2. Tours De Conversation

### Tour 1

**User**
> Salut Sophia. Je demarre avec trop d'onglets dans la tete: un SMS a Hugo, une quittance a verifier, et l'envie de classer mes captures avant de repondre. Je veux proteger les 15 prochaines minutes.

**Sophia**
> Elle propose un micro-demarrage en 3 etapes: verrouiller "SMS a Hugo" comme tache n°1, mettre quittance/captures dans un seul endroit sans traiter, puis lancer et envoyer le SMS. Elle propose ensuite une carte d'attaque dediee.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `low`
- opportunity: `attack_card` / `prepare_attack_card`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 2

**User**
> Oui. Prepare une carte d'attaque complete. Action: envoyer deux lignes a Hugo avant de classer mes captures. Piege: ranger les captures pour eviter le SMS. Signal visuel: le stylo rouge pose sur le clavier. Phrase: stylo rouge = deux lignes a Hugo, pas de classement.

**Sophia**
> Voici ton projet de carte :
> Ancre visuelle : Action Hugo vs Captures
> "Stylo rouge = deux lignes a Hugo, pas de classement."
> Place l'ancre dans ton environnement et utilise-la comme signal de depart.
> Est-ce que je cree cette carte ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `low`
- tool_skill_intents: [`prepare_attack_card`]
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun avant confirmation

### Tour 3

**User**
> Oui, cree cette carte maintenant.

**Sophia**
> C'est fait. J'ai cree cette carte d'attaque :
>
> Action Hugo vs Captures
> Technique : Ancre visuelle
> Stylo rouge = deux lignes a Hugo, pas de classement.
>
> Mode d'emploi : Place l'ancre dans ton environnement et utilise-la comme signal de depart.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `none`
- tool_execution: `success`
- executed_tools: [`prepare_attack_card`]
- durable_effect: carte creee, id `459f17c2-aa53-4a65-9851-bf6676d56d23`, titre `Action Hugo vs Captures`, technique `ancre_visuelle`, asset `Stylo rouge = deux lignes a Hugo, pas de classement.`

### Tour 4

**User**
> SMS a Hugo envoye. Programme-moi un rappel aujourd'hui a 18h20: verifier si Hugo a repondu, sans rouvrir le dossier captures.

**Sophia**
> C'est programme pour jeudi 28 mai a 18:20 : verifier si Hugo a repondu, sans rouvrir le dossier captures. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_one_shot_reminder_priority`
- safety: `low`
- skill_entry_ids: [`execution_breakdown`]
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: rappel cree, id `76978768-b883-488c-a04d-a36d6b92b728`, `scheduled_for=2026-05-28T16:20:00+00:00`, soit 18:20 Europe/Paris, status `pending`.

### Tour 5

**User**
> Cote produit, si je veux annuler ce rappel plus tard, je passe par ou ?

**Sophia**
> Le rappel ponctuel que je t'ai programme se gere cote Initiatives, dans les rappels cote chat pour ce type-la. Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 6

**User**
> Preference durable de coaching: quand je dis que je vais classer des fichiers pour eviter un SMS, pose d'abord une seule question de tri, puis donne une seule action de moins de deux minutes. Confirme avec moi avant de l'enregistrer.

**Sophia**
> Bien recu. Pour la suite, je te poserai moins de questions, plus courtes, surtout quand tu es bloque. Si c'est bien ca, je le garde comme preference. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- safety: `low`
- skill_entry_ids: [`product_help`]
- tool_skill_intents: [`update_coach_preferences`]
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun avant confirmation

### Tour 7

**User**
> Oui, enregistre cette preference.

**Sophia**
> C'est fait. J'ai applique cette preference : je te poserai moins de questions, plus courtes, surtout quand tu es bloque. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- tool_execution: `success`
- executed_tools: [`update_coach_preferences`]
- durable_effect: `coach.question_tendency=low`, source `explicit_user`; la DB conserve le texte original de la demande dans `reason`.

### Tour 8

**User**
> Je reviens au fil: qu'est-ce que tu as retenu sur le stylo rouge et mon envie de classer les captures ?

**Sophia**
> Elle restitue que l'envie de classer les captures servait a eviter Hugo, que le stylo rouge est le signal pour faire uniquement les 2 lignes, et que la regle est "pas de classement avant d'avoir envoye ces deux lignes".

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_recap_request_priority`
- safety: `low`
- skill_entry_ids: [`product_help`]
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 9

**User**
> Applique cette preference maintenant: je vois le stylo rouge, j'ai envie de classer mes captures, et j'ai honte que mon SMS a Hugo soit maladroit. Une seule question de tri puis une seule action courte.

**Sophia**
> Elle reconnait la honte et le piege. Puis: "Tri rapide: je garde juste le signal rouge = priorite SMS a Hugo, pas classement." Action courte: ecrire 2 lignes sans se justifier. Elle propose ensuite de fournir les 2 lignes exactes.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 10

**User**
> Non, pas de texte exact. La honte monte encore. Si tu vois un outil doux pour redescendre, propose-le, mais ne lance rien sans mon oui.

**Sophia**
> Elle propose un outil de "reparation emotionnelle" pour que la honte redescende, precise que rien ne s'active tout seul, et demande un oui avant utilisation.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_conversation_skill_continue`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun; proposition sans execution.

### Tour 11

**User**
> Non, ne lance rien. Avant de cloturer, verifie sans modifier: carte Action Hugo vs Captures, rappel a 18h20, preference coach, et repere stylo rouge / pas de classement.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Action Hugo vs Captures).
> - Carte de defense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programme a 18:20 (verifier si Hugo a repondu, sans rouvrir le dossier captures).
> - Preferences coach : oui, moins de questions, challenge equilibre.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `status_only_request_blocks_tool_start`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun; carte/rappel/preference retrouves, repere conversationnel oublie.

### Tour 12

**User**
> Tu as bien retrouve les effets durables. Ajoute juste le repere conversationnel: stylo rouge = deux lignes a Hugo avant tout classement.

**Sophia**
> Oui, c'est bon.
>
> Repere conversationnel ajoute dans l'ombre : stylo rouge = ecrire deux lignes a Hugo avant tout classement des captures.
>
> Rien a faire de ton cote pour l'instant, tu peux juste garder ca comme "regle du jeu" quand tu te lances.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_conversation_skill_continue`
- safety: `low`
- tool_skill_intents: `[]`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun; pas de faux pending `update_coach_preferences` observe.

### Tour 13

**User**
> Maintenant fais un recap conversationnel final: SMS a Hugo, rappel, carte, preference coach, et stylo rouge = pas de classement avant deux lignes.

**Sophia**
> Recap final: SMS a Hugo d'abord en 2 lignes; stylo rouge = pas de classement avant ces 2 lignes; rappel le 28 mai a 18:20; carte active "Action Hugo vs Captures"; preference coach = reponses plus courtes, moins de questions quand bloque.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_recap_request_priority`
- safety: `none`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 14

**User**
> Dernier check: ne lance aucun outil. Donne-moi juste la prochaine micro-action si je reviens classer mes captures pour eviter Hugo.

**Sophia**
> La micro-action est simple : des que tu touches une capture, tu reposes le doigt sur ton stylo rouge et tu eteins ton ecran 5 secondes. C'est le signal pour briser la boucle.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_status_exact_priority`
- safety: `low`
- skill_entry_ids: [`execution_breakdown`]
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 15

**User**
> On s'arrete la pour ce cycle. Resume en une phrase ce qui est le plus important a garder.

**Sophia**
> Garde ca en priorite : stylo rouge = tu ecris 2 lignes a Hugo, et seulement apres tu t'occupes de classer les captures.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le flow carte d'attaque est maintenant fluide humainement: brouillon clair, confirmation explicite, puis creation confirmee sans detour.
- La conversation garde un fil coherent entre SMS, stylo rouge, classement des captures, rappel et recap final.
- Le soutien emotionnel reste prudent: au tour 10, Sophia propose un outil doux mais ne lance rien sans oui.
- Le tour 12 corrige la regression A9 cote experience: Sophia ne part plus dans une question "plus direct ou plus court" quand l'utilisateur demande un repere conversationnel.
- Le recap final du tour 13 couvre tous les elements demandes.

**Problemes**
- Tour 6: la preference coach reste trop simplifiee. La demande precise "une question de tri puis une action de moins de deux minutes" devient "moins de questions, plus courtes". Impact: perte de fidelite pour l'utilisateur et pour l'application future. Severite: yellow.
- Tour 9: l'application de la preference s'ameliore, car Sophia donne une action courte, mais la "question de tri" devient un tri rapide affirmatif. Impact: la sequence demandee n'est pas strictement respectee. Severite: yellow.
- Tour 11: Sophia oublie encore le repere conversationnel explicitement demande dans la verification "sans modifier". Impact: l'utilisateur doit corriger au tour suivant. Severite: yellow.
- Tour 12: "repere conversationnel ajoute dans l'ombre" est ambigu; cela peut laisser croire a une sauvegarde durable invisible. Impact: confusion memoire/produit. Severite: yellow.
- Tour 14: la micro-action ne revient pas directement aux "deux lignes a Hugo"; elle propose plutot une interruption de boucle. Impact: utile, mais moins aligne avec la carte active. Severite: yellow leger.

**Fix propose**
- Garder les preferences coach complexes sous forme de regle canonique textuelle, en plus du flag `coach.question_tendency`.
- Pour les verifications status-only, inclure les reperes conversationnels nommes par l'utilisateur au meme niveau que les artefacts durables.
- Remplacer "ajoute dans l'ombre" par "je le garde pour ce fil" ou "je le note dans notre recap", sauf si un vrai write durable est execute.
- Quand une carte active existe, faire revenir les micro-actions no-tool vers l'action principale avant de proposer une regulation annexe.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- `prepare_attack_card` est corrige sur deux points importants: tour 2 confirmation visible avec `tool_execution=blocked`; tour 3 execution sous `response_owner=tool_skill` et `selected_handler=prepare_attack_card`.
- `create_one_shot_reminder` est priorise par `central_arbitrator_one_shot_reminder_priority`; l'effet durable est exact. L'owner reste `normal_reply`, mais la route est claire.
- `product_help` est bien limite au tour 5.
- La memoire conversationnelle du tour 8 sort en `normal_reply` / `central_arbitrator_recap_request_priority`, pas en owner `product_help`; il reste seulement un bruit `skill_entry_ids=[product_help]`.
- Le faux positif A9 du tour 12 est corrige: pas de `tool_skill_intents`, pas de `update_coach_preferences`, pas de `__active_tool_skill_intake` observe avant nettoyage.

**Skills / Operations / Tools**
- `prepare_attack_card`: success complet; carte durable correcte.
- `create_one_shot_reminder`: success complet; `scheduled_for=2026-05-28T16:20:00+00:00`, soit 18:20 Europe/Paris.
- `update_coach_preferences`: confirmation respectee; durable `coach.question_tendency=low`. Warning: la structuration durable ne porte pas toute la regle utilisateur.
- `emotional_repair`: pertinent tours 9-10, mais encore collant au tour 12 (`selected_handler=emotional_repair`) sur une demande neutre de repere.
- `select_state_potion`: aucune execution observee; la proposition d'outil doux reste non engageante.

**Memory / Effets durables**
- Avant nettoyage, effets attendus presents:
  - carte `Action Hugo vs Captures`, id `459f17c2-aa53-4a65-9851-bf6676d56d23`, technique `ancre_visuelle`;
  - rappel ponctuel pending, id `76978768-b883-488c-a04d-a36d6b92b728`, a 18:20 Europe/Paris;
  - preference `coach.question_tendency=low`, source `explicit_user`, reason contenant la demande originale;
  - aucun rappel recurrent.
- Etat interne avant nettoyage: pas de `__active_tool_skill_intake`, ce qui confirme la correction du faux pending observe en A9.
- Apres nettoyage cible, verification REST locale: `scheduled_checkins`, `user_attack_cards`, `user_profile_facts`, `user_recurring_reminders`, `chat_messages`, `user_chat_states`, `user_topic_memories`, `memory_items` retournent 0 ligne pour le persona A10 r2.

**Problemes**
- Tour 4: `response_owner=normal_reply` malgre un side effect `create_one_shot_reminder`. Impact systeme: trace owner encore imparfait. Severite: yellow leger.
- Tour 6: `skill_entry_ids=[product_help]` alors que l'intention est preference coach. Impact systeme: bruit de classification, sans mauvais handler final. Severite: yellow leger.
- Tour 7: execution `update_coach_preferences` sous `response_owner=normal_reply`. Impact systeme: effet correct, owner moins explicite. Severite: yellow leger.
- Tour 11: status-only retrouve les artefacts durables mais pas le repere conversationnel. Impact systeme: retrieval/status incomplet. Severite: yellow.
- Tour 12: plus de faux tool skill, mais continuation `emotional_repair` sur demande neutre. Impact systeme: skill conversationnel un peu collant. Severite: yellow leger.

**Fix propose**
- Aligner `response_owner` sur les executions directes ou confirmees, au moins dans la trace courte QA.
- Reduire le bruit `product_help` dans `skill_entry_ids` pour les demandes de memoire/preference.
- Ajouter une source "conversation_recap_marker" ou equivalent pour representer clairement les reperes non durables, sans les confondre avec preferences coach.
- Sortir plus vite de `emotional_repair` quand la demande suivante est explicitement recap/status neutre.

## Verdict Global

**yellow**

Les corrections ont fait leur travail sur le point le plus critique d'A9: le repere conversationnel du tour 12 ne declenche plus `update_coach_preferences` et ne laisse plus de pending tool skill. `prepare_attack_card` est aussi beaucoup plus propre, y compris sur l'owner de confirmation. Le run reste `yellow`, pas `green`, car la preference coach est encore trop simplifiee, le repere est oublie en verification status-only, et quelques traces/owners restent imparfaits.
